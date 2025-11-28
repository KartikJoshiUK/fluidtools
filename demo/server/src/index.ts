import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { loadProviderConfigFromEnv } from "../../../src/langgraph/config.js";
import FluidToolsClient from "../../../src/index.js";
import { postmanToLangChainCode } from "../../../src/converters/utils.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(cookieParser());

const PROVIDER_CONFIG = loadProviderConfigFromEnv();
const MAX_TOOL_CALLS = 5;
const EXPIRE_IDLE_CHAT_AFTER_SECONDS = 60 * 5;

// Enable CORS for everything
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        origin === undefined ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:5173"
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    credentials: true,
  })
);

app.use((req: Request, res: Response, next: Function) => {
  const sid = req.cookies.sessionid;
  if (req.path === "/session" || req.method === "OPTIONS") return next();
  if (!sid || !session.has(sid) || session.get(sid)!.expiry < Date.now()) {
    return res.status(401).send("Invalid session");
  }
  next();
});

const DEFAULT_EXPIRY = 24 * 60 * 60 * 1000; // 1 day

type SESSION_DATA = {
  agent?: FluidToolsClient;
  expiry: number;
};

const session: Map<string, SESSION_DATA> = new Map<string, SESSION_DATA>();

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const sid = req.cookies.sessionid;
      const dir = path.join(uploadsDir, sid);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, "api.json");
    },
  }),
});

app.get("/session", (req: Request, res: Response) => {
  const uuid = randomUUID();
  session.set(uuid, { expiry: Date.now() + DEFAULT_EXPIRY });
  console.log("SESSION", uuid);

  res.cookie("sessionid", uuid, { httpOnly: true, secure: false });
  res.status(200).json({ sessionId: uuid });
});

app.post("/tools", upload.single("api"), (req: Request, res: Response) => {
  console.log("TOOLS GENERATION...");
  // cleanup expired sessions
  for (const [id, data] of session.entries()) {
    if (data.expiry < Date.now()) {
      session.delete(id);
      const dir = path.join(uploadsDir, id);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    }
  }

  const filePath = (req as any).file.path;
  const jsonContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  try {
    const toolsCode = postmanToLangChainCode(jsonContent);
    const toolsTsFile = path.join(path.dirname(filePath), "tools.ts");
    fs.writeFileSync(toolsTsFile, toolsCode);
  } catch {
    const toolsFile = path.join(path.dirname(filePath), "tools.json");
    fs.copyFileSync(filePath, toolsFile);
    fs.unlinkSync(filePath);
    res.status(400).send({ message: "Invalid APIs" });
    return;
  }

  const toolsFile = path.join(path.dirname(filePath), "tools.json");
  fs.copyFileSync(filePath, toolsFile);
  fs.unlinkSync(filePath);

  res.status(200).json({ message: "tools have been generated" });
});

app.post("/initialize", async (req: Request, res: Response) => {
  const sid = req.cookies.sessionid;
  const { systemIntructions = "", envVariables = {} } = req.body;

  let parsedEnvVariables = envVariables;
  if (typeof envVariables === "string")
    parsedEnvVariables = JSON.parse(envVariables);

  console.log("INITIALIZING", { sid, systemIntructions, envVariables });

  if (new Date(session.get(sid)?.expiry ?? 0) < new Date()) {
    res.status(401).send({ message: "Session has been expired" });
    return;
  }
  try {
    const tools: {
      generateTools: (
        tool: any,
        schemaBuilder: any,
        axios: any
      ) => Record<string, any>;
    } = await import(`../uploads/${sid}/tools.ts`);
    const agent = new FluidToolsClient(
      PROVIDER_CONFIG,
      tools.generateTools,
      systemIntructions,
      MAX_TOOL_CALLS,
      true,
      EXPIRE_IDLE_CHAT_AFTER_SECONDS,
      {
        requireConfirmation: ["user_details"],
      },
      parsedEnvVariables
    );
    session.set(sid, { ...session.get(sid)!, agent });
  } catch (error) {
    res.status(400).send({ message: "Tools are not avaiable.", error });
    return;
  }

  res.status(200).send({ message: "Agent has been initialized" });
});

app.get("/", async (req: Request, res: Response) => {
  const sid = req.cookies.sessionid;
  const { query = "" } = req.query;
  const { authorization } = req.headers;

  console.log("QUERY", { sid, query, authorization });

  const accessToken = authorization?.startsWith("Bearer")
    ? authorization?.split(" ")[1]
    : authorization;

  if (!query) {
    res.status(400).send({ message: "Query is not provided" });
    return;
  }
  const agent = session.get(sid)?.agent;
  if (!agent) {
    res.status(400).send({ message: "Agent is corrupted" });
    return;
  }
  const message = await agent?.query(query.toString(), accessToken);

  const state = await agent?.getPendingConfirmations(accessToken);
  if (state.length > 0) {
    res.status(200).send({
      message: `Are you sure you want to call ${state
        .map((s) => s.toolName)
        .join(", ")}?`,
      data: state.map((s) => ({ name: s.toolName, id: s.toolCallId })),
    });
    return;
  }

  res.status(200).send({ message: message?.toString() });
});

app.post("/approval", async (req, res) => {
  const sid = req.cookies.sessionid;
  const { authorization } = req.headers;
  const accessToken = authorization?.startsWith("Bearer")
    ? authorization?.split(" ")[1]
    : authorization;
  const toolsApproval = req.body;

  console.log(
    "📥 Approval request body:",
    JSON.stringify(toolsApproval, null, 2)
  );

  const agent = session.get(sid)?.agent;
  if (!agent) {
    res.status(400).send({ message: "Agent is corrupted" });
    return;
  }

  const currentPending = await agent.getPendingConfirmations(accessToken);
  console.log(
    "🔍 Current pending confirmations:",
    JSON.stringify(currentPending, null, 2)
  );

  if (!Array.isArray(toolsApproval)) {
    res.status(400).send({ error: "Invalid request body" });
    return;
  }
  let response;
  for (const tool of toolsApproval) {
    console.log("🔧 Processing tool:", tool);
    if (tool.approved)
      response = await agent.approveToolCall(tool.toolCallId, accessToken);
    else response = await agent.rejectToolCall(tool.toolCallId, accessToken);
  }

  res.status(200).send({
    message: typeof response === "string" ? response : response?.toString(),
  });
});

app.delete("/", async (req, res) => {
  const sid = req.cookies.sessionid;
  const { authorization } = req.headers;
  const accessToken = authorization?.startsWith("Bearer")
    ? authorization?.split(" ")[1]
    : authorization;

  const agent = session.get(sid)?.agent;
  if (!agent) {
    res.status(400).send({ message: "Agent is corrupted" });
    return;
  }

  if (accessToken) {
    await agent.clearThread(accessToken);
  }

  res.status(204).send({
    message: "Thread cleared",
  });
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

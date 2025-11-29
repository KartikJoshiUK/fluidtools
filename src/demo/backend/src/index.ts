import express, { Request, Response } from "express";
import cors from "cors";
import { generateTools } from "./tools.js";
import { loadProviderConfigFromEnv } from "../../../langgraph/config.js";
import FluidToolsClient from "../../../client/index.js";
import { ContentBlock } from "langchain";

const app = express();

app.use(express.json());

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

const providerConfig = loadProviderConfigFromEnv();

const fluidtools = new FluidToolsClient(
  providerConfig,
  generateTools,
  `HIGHEST PRORITY INSTRUCTIONS:
    - Always respond in markdown format only
    - Bold the titles
    - Try to keep everything in pointers
    - Always keep a very humourous tone
  `,
  7,
  true,
  undefined,
  undefined,
  {
    BASE_URL: "https://customer.acecloud.ai",
  }
);

app.get("/", async (req: Request, res: Response) => {
  const { query } = req.query;
  const { authorization } = req.headers;

  const accessToken = authorization?.split(" ")[1];

  if (typeof query !== "string" || typeof authorization !== "string") {
    res.status(400).send({ error: "Invalid query parameter" });
    return;
  }

  const response = await fluidtools.query(query, accessToken);
  const state = await fluidtools.getPendingConfirmations(accessToken);
  if (state.length > 0) {
    res.status(200).send({
      message: `Are you sure you want to call ${state
        .map((s) => s.toolName)
        .join(", ")}?`,
      data: state.map((s) => ({ name: s.toolName, id: s.toolCallId })),
    });
    return;
  }
  res.send({
    message: typeof response === "string" ? response : JSON.stringify(response),
  });
});

app.post("/approval", async (req: Request, res: Response) => {
  const { authorization } = req.headers;
  const accessToken = authorization?.split(" ")[1];
  const toolsApproval = req.body as {
    toolsApproval: {
      toolCallId: string;
      approved: boolean;
    }[];
  };

  if (!Array.isArray(toolsApproval)) {
    res.status(400).send({ error: "Invalid request body" });
    return;
  }
  let response: string | (ContentBlock | ContentBlock.Text)[] | undefined;
  for (const tool of toolsApproval) {
    if (tool.approved)
      response = await fluidtools.approveToolCall(tool.toolCallId, accessToken);
    else
      response = await fluidtools.rejectToolCall(tool.toolCallId, accessToken);
  }

  const state = await fluidtools.getPendingConfirmations(accessToken);
  if (state.length > 0) {
    res.status(200).send({
      message: `Are you sure you want to call ${state
        .map((s) => s.toolName)
        .join(", ")}?`,
      data: state.map((s) => ({ name: s.toolName, id: s.toolCallId })),
    });
    return;
  }

  res.send({
    message: typeof response === "string" ? response : JSON.stringify(response),
  });
});

app.delete("/", async (req: Request, res: Response) => {
  const { authorization } = req.headers;

  const accessToken = authorization?.split(" ")[1];
  if (accessToken) {
    await fluidtools.clearThread(accessToken);
  }

  res.status(204).send({
    message: "Thread cleared",
  });
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

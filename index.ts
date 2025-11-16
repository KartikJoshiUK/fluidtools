import fs from "fs";
import axios, { AxiosError } from "axios";
import { z } from "zod";

import { tool } from "langchain";
import { ChatOllama } from "@langchain/ollama";
import { createAgent } from "langchain";

import { ACCESS_TOKEN } from "./config.js";

// -----------------------------------------------------
// 1. Fully flatten Postman JSON (works for ANY depth)
// -----------------------------------------------------
function flattenPostman(postmanCollection : any) {
  const result : any[] = [];

  function recurse(items : any) {
    for (const item of items) {
      if (item.item && Array.isArray(item.item)) {
        // It is a folder → go deeper
        recurse(item.item);
      } else if (item.request) {
        // It is a request → store it
        result.push(item);
      }
    }
  }

  recurse(postmanCollection.item);
  return result;
}

// -----------------------------------------------------
// 2. Postman JSON → Flattened array
// -----------------------------------------------------
const rawPostman = JSON.parse(fs.readFileSync("./api.json", "utf-8"));
const flatRequests = flattenPostman(rawPostman);

console.log(`\n📌 Total ${flatRequests.length} APIs found.\n`);

// -----------------------------------------------------
// 3. Utility: Extract URL from postman item
// -----------------------------------------------------
function getUrl(item : any) : string {
  return item?.request?.url?.raw ?? "";
}

// -----------------------------------------------------
// 4. Generate LangChain tools from flattened list
// -----------------------------------------------------
function generateTools(requests : any) {
  const toolsArray = [];

  for (const item of requests) {
    const name = item.name.replace(/\s+/g, "_").toLowerCase();
    const method = item.request.method || "GET";
    const url = getUrl(item);

    const schema = z.object({
      body: z.any().optional(),
      query: z.string().optional()
    });

    const fn = async (args : any) => {
      const payload = args.body ?? {};

      console.log("\n🛠️ TOOL START");
      console.log({ name, method, url, payload });

      try {
        let res;

        if (method === "GET") {
          res = await axios.get(url, {
            headers: {
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
            }
          });
        } else if (method === "POST") {
          res = await axios.post(url, payload, {
            headers: {
              "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
          });
        } else {
          return `❌ Method ${method} not implemented`;
        }

        return JSON.stringify(res.data, null, 2);

      } catch (err ) {
        console.log("🔴 TOOL ERROR:", (err as AxiosError).response?.data);
        return `Error calling ${url}: ${err}`;
      }
    };

    const theTool = tool(fn, {
      name,
      description: `${method} request to ${url}`,
      schema
    });

    toolsArray.push(theTool);
  }

  return toolsArray;
}

// Create tools
const tools = generateTools(flatRequests);

// -----------------------------------------------------
// 5. Model + Agent
// -----------------------------------------------------
const model = new ChatOllama({
  model: "llama3.2:3b",
  baseUrl: "http://localhost:11434",
});

const agent = createAgent({
  model,
  tools,
});

// -----------------------------------------------------
// 6. Run a test query
// -----------------------------------------------------
async function run() {
  const query = `Check my wallet balanc and other details and user status`;

  console.log(`\n=== Query: ${query} ===`);

  const res = await agent.invoke({ messages: query });

  console.log("\n🤖 Final LLM Response:");
  console.dir(res.messages.at(-1)?.content, { depth: null });
}

run();

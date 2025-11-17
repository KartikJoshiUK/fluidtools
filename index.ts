import "dotenv/config";
import { loadProviderConfigFromEnv } from "./src/langgraph/config.js";
import { generateTools } from "./fluidTools.js";
import FluidToolsClient from "./src/client/index.js";

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";

const providerConfig = loadProviderConfigFromEnv();

console.log(providerConfig);

const fluidToolsClient = new FluidToolsClient(
  "CLIENT_ID",
  "CLIENT_SECRET",
  providerConfig,
  generateTools,
  "Keep a very humourous tone when responding."
);

async function run() {
  const query = `Tell me my wallet balance`;

  console.log(`\n=== Query: ${query} ===`);

  const response = await fluidToolsClient.query(query, ACCESS_TOKEN);

  console.log(response);
}

run();

// Step 1: Define tools and model

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createProvider } from "./factory.js";
import getAgent from "./nodes.js";
import { ProviderConfig } from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";

class FluidTools {
  private model;
  private agent;

  constructor(
    config: ProviderConfig,
    tools: Record<string, any>,
    systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS
  ) {
    this.model = createProvider(config);
    this.agent = getAgent(this.model, tools, systemInstructions);
  }

  public async query(query: string) {
    const result = await this.agent.invoke({
      messages: [new HumanMessage(query)],
    });

    return result;
  }
}

export default FluidTools;

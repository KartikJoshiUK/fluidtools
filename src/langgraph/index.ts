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
  private maxToolCalls: number;

  constructor(
    config: ProviderConfig,
    tools: Record<string, any>,
    systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS,
    maxToolCalls: number = 10
  ) {
    this.model = createProvider(config);
    this.agent = getAgent(this.model, tools, systemInstructions);
    this.maxToolCalls = maxToolCalls;
  }

  public async query(query: string) {
    const result = await this.agent.invoke({
      messages: [new HumanMessage(query)],
      maxToolCalls: this.maxToolCalls,
    });

    return result;
  }
}

export default FluidTools;

import FluidTools from "../langgraph/index.js";
import { ProviderConfig } from "../langgraph/types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "../langgraph/constants.js";
import { z } from "zod";
import { tool } from "langchain";
import axios from "axios";

class FluidToolsClient {
  private clientSecret: string;
  private clientId: string;
  private toolsGenerator: (
    tool: any,
    schemaBuilder: any,
    axios: any,
    token?: string
  ) => Record<string, any>;
  private config: ProviderConfig;
  private systemInstructions: string;
  private maxToolCalls: number;
  private fluidTool: FluidTools; // Reuse the same instance to preserve memory

  constructor(
    clientId: string,
    clientSecret: string,
    config: ProviderConfig,
    toolsGenerator: (
      tool: any,
      schemaBuilder: any,
      axios: any,
      token?: string
    ) => Record<string, any>,
    systemInstructions: string = "",
    maxToolCalls: number = 10
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.toolsGenerator = toolsGenerator;
    this.config = config;
    this.systemInstructions = systemInstructions;
    this.maxToolCalls = maxToolCalls;

    // Initialize FluidTools once to preserve conversation history
    const toolsByName = this.toolsGenerator(tool, z, undefined);
    const fullSystemInstructions = this.getSystemInstructions();
    this.fluidTool = new FluidTools(
      this.config,
      toolsByName,
      fullSystemInstructions,
      this.maxToolCalls
    );
  }

  private getSystemInstructions = () => {
    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build context variables for template replacement
    const contextVars: Record<string, string> = {
      "{date}": currentDate,
      "{max_tool_calls}": this.maxToolCalls.toString(),
    };

    // Replace all context variables in the base prompt
    let prompt = DEFAULT_SYSTEM_INSTRUCTIONS;
    Object.entries(contextVars).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(key, "g"), value);
    });

    // Add custom instructions if provided
    if (this.systemInstructions) {
      prompt += `\n\n<Additional Instructions>\n${this.systemInstructions}\n</Additional Instructions>`;
    }

    // Add recursion limit reminder
    prompt += `\n\n<Important Constraints>\n- You can make a maximum of ${this.maxToolCalls} tool calls per query\n- Plan your tool usage efficiently to stay within this limit\n- If you're approaching the limit, prioritize the most important information\n</Important Constraints>`;

    return prompt;
  };

  public async query(
    query: string,
    accessToken?: string
  ) {
    console.log('\n🎯 [FluidToolsClient.query] Query received:', query);
    // Reuse the same FluidTools instance to preserve conversation history
    const response = await this.fluidTool.query(query);

    console.log('📦 [FluidToolsClient.query] Response messages:', response.messages.length);
    console.log('📄 [FluidToolsClient.query] Last message content:', response.messages.at(-1)?.content);

    return response.messages.at(-1)?.content;
  }

  /**
   * Get the current conversation state
   */
  public async getConversationState() {
    return await this.fluidTool.getConversationState();
  }

  /**
   * Print the full conversation history to console
   */
  public async printConversationHistory() {
    await this.fluidTool.printConversationHistory();
  }
}

export default FluidToolsClient;

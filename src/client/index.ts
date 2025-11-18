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
  }

  private getToolDescriptions = (toolsByName: Record<string, any>): string => {
    const toolNames = Object.keys(toolsByName);
    if (toolNames.length === 0) return "";

    const descriptions = toolNames
      .map((name, index) => {
        const tool = toolsByName[name];
        const description = tool.description || "No description available";

        // Extract schema information if available
        let schemaInfo = "";
        if (tool.schema && tool.schema.shape) {
          const params = Object.keys(tool.schema.shape);
          if (params.length > 0) {
            schemaInfo = `\n   Parameters: ${params.join(", ")}`;
          }
        }

        return `${
          index + 1
        }. **${name}**\n   Description: ${description}${schemaInfo}`;
      })
      .join("\n\n");

    return `\n\n<Your Available Tools>\nYou have access to ${toolNames.length} tool(s). Use them to gather information or perform actions.\n\n${descriptions}\n</Your Available Tools>`;
  };

  private getSystemInstructions = (toolsByName?: Record<string, any>) => {
    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build context variables for template replacement
    const toolCount = toolsByName ? Object.keys(toolsByName).length : 0;
    const contextVars: Record<string, string> = {
      "{date}": currentDate,
      "{tool_count}": toolCount.toString(),
      "{max_tool_calls}": this.maxToolCalls.toString(),
    };

    // Replace all context variables in the base prompt
    let prompt = DEFAULT_SYSTEM_INSTRUCTIONS;
    Object.entries(contextVars).forEach(([key, value]) => {
      prompt = prompt.replace(new RegExp(key, "g"), value);
    });

    // Add tool descriptions if tools are provided
    if (toolsByName && toolCount > 0) {
      prompt += this.getToolDescriptions(toolsByName);
    }

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
    const toolsByName = this.toolsGenerator(tool, z, accessToken);
    const systemInstructions = this.getSystemInstructions(toolsByName);
    const fluidTool = new FluidTools(
      this.config,
      toolsByName,
      systemInstructions,
      this.maxToolCalls
    );
    const response = await fluidTool.query(query);

    return response.messages.at(-1)?.content;
  }
}

export default FluidToolsClient;

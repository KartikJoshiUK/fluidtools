// Step 1: Define tools and model

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createProvider } from "./factory.js";
import getAgent from "./nodes.js";
import { ProviderConfig } from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";
import { logger } from "../utils/index.js";
import { Tools } from "./tool.js";

class FluidTools {
  private model;
  private agent;
  private maxToolCalls: number;
  private config: ProviderConfig;
  private debug: boolean;
  private systemInstructions: string;
  private tools: Tools;

  constructor(
    config: ProviderConfig,
    tools: Tools,
    systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS,
    maxToolCalls: number = 10,
    debug: boolean = false
  ) {
    this.config = config;
    this.model = createProvider(this.config);
    this.agent = getAgent(this.model, tools, systemInstructions);
    this.maxToolCalls = maxToolCalls;
    this.debug = debug;
    this.systemInstructions = systemInstructions;
    this.tools = tools;
  }

  public async query(query: string) {
    const config = { configurable: { thread_id: "1" } };
    this.agent = getAgent(this.model, this.tools, this.systemInstructions);

    // Invoke with the new message - LangGraph will automatically merge with existing state
    const result = await this.agent.invoke(
      {
        messages: [new HumanMessage(query)],
        maxToolCalls: this.maxToolCalls,
      },
      config
    );

    return result;
  }

  /**
   * Get the current conversation state from the checkpointer
   * @returns The current state including all messages
   */
  public async getConversationState() {
    const config = { configurable: { thread_id: "1" } };
    const state = await this.agent.getState(config);
    return state;
  }

  /**
   * Print the conversation history to console in a readable format
   */
  public async printConversationHistory() {
    const state = await this.getConversationState();
    const messages = state.values.messages || [];

    logger(this.debug, "\n" + "=".repeat(80));
    logger(this.debug, "📚 CONVERSATION HISTORY");
    logger(this.debug, "=".repeat(80));
    logger(this.debug, `Thread ID: 1`);
    logger(this.debug, `Total Messages: ${messages.length}`);
    logger(this.debug, `Max Tool Calls: ${state.values.maxToolCalls || "N/A"}`);
    logger(this.debug, "=".repeat(80));

    messages.forEach((msg: any, index: number) => {
      const msgType = msg._getType();

      logger(this.debug, `\n[${index + 1}] ${msgType.toUpperCase()}`);
      logger(this.debug, "-".repeat(80));

      if (msgType === "human") {
        logger(this.debug, `👤 User: ${msg.content}`);
      } else if (msgType === "ai") {
        // Handle AI message content - it can be string, array, or empty
        let contentDisplay = "";
        if (typeof msg.content === "string") {
          contentDisplay = msg.content;
        } else if (Array.isArray(msg.content)) {
          contentDisplay = msg.content
            .map((c: any) => (typeof c === "string" ? c : JSON.stringify(c)))
            .join(" ");
        } else if (msg.content) {
          contentDisplay = JSON.stringify(msg.content);
        } else {
          contentDisplay = "(no text content)";
        }

        logger(this.debug, `🤖 Assistant: ${contentDisplay}`);

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          logger(this.debug, `🔧 Tool Calls: ${msg.tool_calls.length}`);
          msg.tool_calls.forEach((tc: any, i: number) => {
            logger(
              this.debug,
              `   ${i + 1}. ${tc.name}(${JSON.stringify(tc.args)})`
            );
          });
        }
      } else if (msgType === "tool") {
        logger(this.debug, `🛠️  Tool: ${msg.name}`);
        const contentStr =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        const preview =
          contentStr.length > 200
            ? contentStr.substring(0, 200) + "..."
            : contentStr;
        logger(this.debug, `📤 Result: ${preview}`);
      } else if (msgType === "system") {
        const preview =
          msg.content.length > 200
            ? msg.content.substring(0, 200) + "..."
            : msg.content;
        logger(this.debug, `⚙️  System: ${preview}`);
      }
    });

    logger(this.debug, "\n" + "=".repeat(80));
    logger(this.debug, "✅ End of conversation history\n");
  }
}

export default FluidTools;

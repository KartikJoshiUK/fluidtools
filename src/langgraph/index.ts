// Step 1: Define tools and model

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createProvider } from "./factory.js";
import getAgent from "./nodes.js";
import {
  ProviderConfig,
  ToolConfirmationConfig,
  PendingToolCall,
} from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";
import { logger } from "../utils/index.js";
import { Tools } from "./tool.js";
import { MemorySaver } from "@langchain/langgraph";

class FluidTools {
  private model;
  private agent;
  private maxToolCalls: number;
  private config: ProviderConfig;
  private debug: boolean;
  private tools: Tools;
  private memory: MemorySaver;

  constructor(
    config: ProviderConfig,
    tools: Tools,
    systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS,
    maxToolCalls: number = 10,
    debug: boolean = false,
    confirmationConfig?: ToolConfirmationConfig
  ) {
    this.config = config;
    this.model = createProvider(this.config);
    this.memory = new MemorySaver();
    this.agent = getAgent(
      this.model,
      tools,
      this.memory,
      systemInstructions,
      debug,
      confirmationConfig
    );
    this.maxToolCalls = maxToolCalls;
    this.debug = debug;
    this.tools = tools;
  }

  public async query(query: string, threadId: string = "1") {
    const config = { configurable: { thread_id: threadId } };

    // Invoke with the new message - LangGraph will automatically merge with existing state
    const result = await this.agent.invoke(
      {
        messages: [new HumanMessage(query)],
        maxToolCalls: this.maxToolCalls,
        authToken: this.tools.AccessToken,
      },
      config
    );

    return result;
  }

  /**
   * Get the current conversation state from the checkpointer
   * @returns The current state including all messages
   */
  public async getConversationState(threadId: string = "1") {
    const config = { configurable: { thread_id: threadId } };
    const state = await this.agent.getState(config);
    return state;
  }

  /**
   * Get any pending tool calls that need confirmation
   * @returns Array of pending tool calls awaiting approval (only status='pending')
   */
  public async getPendingConfirmations(
    threadId: string = "1"
  ): Promise<PendingToolCall[]> {
    const state = await this.getConversationState(threadId);
    const allPending = state.values.pendingConfirmations || [];
    // Only return those that are still pending (not approved/rejected)
    return allPending.filter((p: PendingToolCall) => p.status === "pending");
  }

  /**
   * Approve a pending tool call and continue execution
   * @param toolCallId The ID of the tool call to approve
   * @param threadId The thread ID (default: "1")
   */
  public async approveToolCall(toolCallId: string, threadId: string = "1") {
    const config = { configurable: { thread_id: threadId } };
    const state = await this.getConversationState(threadId);

    const pendingConfirmations: PendingToolCall[] =
      state.values.pendingConfirmations || [];
    const approvedIndex = pendingConfirmations.findIndex(
      (p) => p.toolCallId === toolCallId
    );

    if (approvedIndex === -1) {
      throw new Error(
        `No pending confirmation found for tool call ID: ${toolCallId}`
      );
    }

    // Mark as approved
    pendingConfirmations[approvedIndex].status = "approved";

    // Update state and continue
    const result = await this.agent.invoke(
      {
        pendingConfirmations,
        awaitingConfirmation: pendingConfirmations.some(
          (p) => p.status === "pending"
        ),
        authToken: this.tools.AccessToken,
      },
      config
    );

    return result;
  }

  /**
   * Reject a pending tool call and continue execution
   * @param toolCallId The ID of the tool call to reject
   * @param threadId The thread ID (default: "1")
   */
  public async rejectToolCall(toolCallId: string, threadId: string = "1") {
    const config = { configurable: { thread_id: threadId } };
    const state = await this.getConversationState(threadId);

    const pendingConfirmations: PendingToolCall[] =
      state.values.pendingConfirmations || [];
    const rejectedIndex = pendingConfirmations.findIndex(
      (p) => p.toolCallId === toolCallId
    );

    if (rejectedIndex === -1) {
      throw new Error(
        `No pending confirmation found for tool call ID: ${toolCallId}`
      );
    }
    pendingConfirmations[rejectedIndex].status = "rejected";
    const result = await this.agent.invoke(
      {
        pendingConfirmations,
        awaitingConfirmation: pendingConfirmations.some(
          (p) => p.status === "pending"
        ),
        authToken: this.tools.AccessToken,
      },
      config
    );

    return result;
  }

  /**
   * Print the conversation history to console in a readable format
   */
  public async printConversationHistory(threadId: string = "1") {
    const state = await this.getConversationState(threadId);
    const messages = state.values.messages || [];

    logger(this.debug, "\n" + "=".repeat(80));
    logger(this.debug, "📚 CONVERSATION HISTORY");
    logger(this.debug, "=".repeat(80));
    logger(this.debug, `Thread ID: ${threadId}`);
    logger(this.debug, `Total Messages: ${messages.length}`);
    logger(this.debug, `Max Tool Calls: ${state.values.maxToolCalls || "N/A"}`);

    // Show pending confirmations if any
    const pending = state.values.pendingConfirmations || [];
    if (pending.length > 0) {
      logger(this.debug, `⏸️  Pending Confirmations: ${pending.length}`);
      pending.forEach((p: PendingToolCall, i: number) => {
        logger(
          this.debug,
          `   ${i + 1}. ${p.toolName} [${p.status}] - ${JSON.stringify(p.args)}`
        );
      });
    }

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

  public async clearThreadMemory(threadId: string) {
    await this.memory.deleteThread(threadId);
  }
}

export default FluidTools;

import FluidTools from "../langgraph/index.js";
import { ProviderConfig, ToolConfirmationConfig } from "../langgraph/types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "../langgraph/constants.js";
import { logger } from "../utils/index.js";
import { Tools } from "../langgraph/tool.js";
import { v4 as uuidv4 } from "uuid";

class FluidToolsClient {
  private config: ProviderConfig;
  private systemInstructions: string;
  private maxToolCalls: number;
  private fluidTool: FluidTools; // Reuse the same instance to preserve memory
  private debug: boolean;
  private tools: Tools;
  private confirmationConfig?: ToolConfirmationConfig;
  private sessionMap: Map<string, { threadId: string; expiry: number }>;
  private expireAfterSeconds: number;

  constructor(
    config: ProviderConfig,
    toolsGenerator: (
      tool: any,
      schemaBuilder: any,
      axios: any
    ) => Record<string, any>,
    systemInstructions: string = "",
    maxToolCalls: number = 10,
    debug: boolean = false,
    expireAfterSeconds: number = 24 * 60 * 60,
    confirmationConfig?: ToolConfirmationConfig,
    toolsConfig?: Record<string, any>
  ) {
    this.tools = new Tools(toolsGenerator, toolsConfig);
    this.config = config;
    this.expireAfterSeconds = expireAfterSeconds;
    this.systemInstructions = systemInstructions;
    this.maxToolCalls = maxToolCalls;
    this.debug = debug;
    this.confirmationConfig = confirmationConfig;
    this.fluidTool = new FluidTools(
      this.config,
      this.tools,
      this.getSystemInstructions(),
      this.maxToolCalls,
      this.debug,
      this.confirmationConfig
    );
    this.sessionMap = new Map();

    console.log("NEW SESSION MAP INITIALIZED", 1111111111111111111111111111111);
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

  public async clearThread(accessToken: string) {
    const threadId = this.getThreadId(accessToken);
    this.sessionMap.delete(accessToken);
    if (threadId) await this.fluidTool.clearThreadMemory(threadId);
  }

  private getThreadId(accessToken?: string) {
    if (accessToken) {
      const now = Date.now();
      const existingSession = this.sessionMap.get(accessToken);
      if (existingSession) {
        if (existingSession.expiry < now) {
          this.fluidTool.clearThreadMemory(existingSession.threadId);
          this.sessionMap.delete(accessToken);
        } else {
          this.sessionMap.set(accessToken, {
            threadId: existingSession.threadId,
            expiry: now + this.expireAfterSeconds * 1000,
          });
        }
      } else {
        this.sessionMap.set(accessToken, {
          threadId: uuidv4(),
          expiry: now + this.expireAfterSeconds * 1000,
        });
      }
    }

    const threadId = accessToken
      ? this.sessionMap.get(accessToken)?.threadId ?? uuidv4()
      : "";

    return threadId;
  }

  public async query(query: string, accessToken?: string) {
    logger(this.debug, "\n🎯 [FluidToolsClient.query] Query received:", query);

    if (accessToken) this.tools.AccessToken = accessToken;
    console.log(this.sessionMap);

    const threadId = this.getThreadId(accessToken);

    console.log(accessToken, threadId);

    const response = await this.fluidTool.query(query, threadId);

    logger(
      this.debug,
      "📦 [FluidToolsClient.query] Response messages:",
      response.messages.length
    );
    logger(
      this.debug,
      "📄 [FluidToolsClient.query] Last message content:",
      response.messages.at(-1)?.content
    );

    return response.messages.at(-1)?.content;
  }

  /**
   * Get the current conversation state
   */
  public async getConversationState(accessToken?: string) {
    const threadId = this.getThreadId(accessToken);
    return await this.fluidTool.getConversationState(threadId);
  }

  /**
   * Get any pending tool calls that need confirmation
   */
  public async getPendingConfirmations(accessToken?: string) {
    const threadId = this.getThreadId(accessToken);
    return await this.fluidTool.getPendingConfirmations(threadId);
  }

  /**
   * Approve a pending tool call and continue execution
   * @param toolCallId The ID of the tool call to approve
   */
  public async approveToolCall(toolCallId: string, accessToken?: string) {
    const threadId = this.getThreadId(accessToken);
    const result = await this.fluidTool.approveToolCall(toolCallId, threadId);
    return result.messages.at(-1)?.content;
  }

  /**
   * Reject a pending tool call and continue execution
   * @param toolCallId The ID of the tool call to reject
   */
  public async rejectToolCall(toolCallId: string, accessToken?: string) {
    const threadId = this.getThreadId(accessToken);
    const result = await this.fluidTool.rejectToolCall(toolCallId, threadId);
    return result.messages.at(-1)?.content;
  }

  /**
   * Print the full conversation history to console
   */
  public async printConversationHistory() {
    await this.fluidTool.printConversationHistory();
  }
}

export default FluidToolsClient;

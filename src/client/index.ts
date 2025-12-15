import FluidTools from "../langgraph/index.js";
import { ProviderConfig, ToolConfirmationConfig } from "../langgraph/types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "../langgraph/constants.js";
import { logger } from "../utils/index.js";
import { Tools } from "../langgraph/tool.js";
import { v4 as uuidv4 } from "uuid";
import { EmbeddingClient, Tool } from "../embeddings/client.js";

/**
 * Configuration for embedding-based tool selection
 */
export interface EmbeddingConfig {
  enabled: boolean;
  modalUrl: string;
  sessionId?: string;  // Session ID for embedding collection lookup
}

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
  private embeddingClient?: EmbeddingClient;
  private enableEmbeddings: boolean;
  private embeddingSessionId?: string;

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
    toolsConfig?: Record<string, any>,
    embeddingConfig?: EmbeddingConfig
  ) {
    this.tools = new Tools(toolsGenerator, toolsConfig);
    this.config = config;
    this.expireAfterSeconds = expireAfterSeconds;
    this.systemInstructions = systemInstructions;
    this.maxToolCalls = maxToolCalls;
    this.debug = debug;
    this.confirmationConfig = confirmationConfig;

    // Initialize embedding client if enabled (Requirement 7.1, 7.5)
    this.enableEmbeddings = embeddingConfig?.enabled ?? false;
    this.embeddingSessionId = embeddingConfig?.sessionId;
    if (this.enableEmbeddings && embeddingConfig?.modalUrl) {
      this.embeddingClient = new EmbeddingClient(embeddingConfig.modalUrl, debug);
      logger(
        this.debug,
        "🔧 [FluidToolsClient] Embeddings enabled with Modal URL:",
        embeddingConfig.modalUrl
      );
      if (this.embeddingSessionId) {
        logger(
          this.debug,
          "🔧 [FluidToolsClient] Embedding session ID:",
          this.embeddingSessionId
        );
      }
    } else {
      logger(
        this.debug,
        "ℹ️ [FluidToolsClient] Embeddings disabled"
      );
    }

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

  /**
   * Index tools for a session to enable embedding-based tool selection
   * Implements Requirement 1.1: Store all tool definitions with their schemas and metadata
   * Implements Requirement 8.1: Log tool indexing operations
   * 
   * @param sessionId - Unique session identifier
   * @param tools - Array of tools to index
   */
  public async indexToolsForSession(sessionId: string, tools: Tool[]): Promise<void> {
    if (!this.embeddingClient) {
      logger(
        this.debug,
        "ℹ️ [FluidToolsClient.indexToolsForSession] Embedding client not initialized, skipping indexing"
      );
      return;
    }

    try {
      logger(
        this.debug,
        `📊 [FluidToolsClient.indexToolsForSession] Indexing ${tools.length} tools for session ${sessionId}`
      );

      await this.embeddingClient.indexTools(sessionId, tools);

      logger(
        this.debug,
        `✅ [FluidToolsClient.indexToolsForSession] Successfully indexed tools for session ${sessionId}`
      );
    } catch (error) {
      // Handle indexing errors gracefully - don't throw (Requirement 8.1)
      logger(
        true, // Always log errors
        `❌ [FluidToolsClient.indexToolsForSession] Failed to index tools for session ${sessionId}:`,
        error
      );
      logger(
        true,
        "⚠️ [FluidToolsClient.indexToolsForSession] Continuing without embeddings - will use all tools as fallback"
      );
    }
  }

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

    // Select tools using embeddings before LangGraph invocation
    // Implements Requirement 1.2, 1.3: Select top-k most relevant tools based on semantic similarity
    // Implements Requirement 7.3: Pass only selected tools to LangGraph agent
    // Implements Requirement 8.3: Log selection timing and tool count
    let selectedToolNames: string[] = [];
    if (this.enableEmbeddings && this.embeddingClient) {
      const selectionStartTime = Date.now();

      try {
        // Use embeddingSessionId if available, otherwise fall back to threadId
        const lookupId = this.embeddingSessionId || threadId;
        logger(
          this.debug,
          `🔍 [FluidToolsClient.query] Using lookup ID for embeddings: ${lookupId} (sessionId: ${!!this.embeddingSessionId})`
        );

        selectedToolNames = await this.embeddingClient.selectTools(
          lookupId,
          query,
          15 // Default top-k value (Requirement 1.3)
        );

        const selectionTime = Date.now() - selectionStartTime;

        if (selectedToolNames.length > 0) {
          logger(
            this.debug,
            `✅ [FluidToolsClient.query] Selected ${selectedToolNames.length} tools in ${selectionTime}ms:`,
            selectedToolNames
          );

          // Filter tools to only include selected names
          this.tools.filterToNames(selectedToolNames);
        } else {
          // Empty array means fallback to all tools (Requirement 5.1)
          logger(
            this.debug,
            `⚠️ [FluidToolsClient.query] No tools selected (fallback triggered), using all tools. Selection time: ${selectionTime}ms`
          );
          this.tools.clearFilter();
        }
      } catch (error) {
        // Fall back to all tools if selection fails (Requirement 5.1)
        logger(
          true, // Always log errors
          `❌ [FluidToolsClient.query] Tool selection failed, falling back to all tools:`,
          error
        );
        this.tools.clearFilter();
      }
    } else {
      // Embeddings disabled, use all tools
      logger(
        this.debug,
        "ℹ️ [FluidToolsClient.query] Embeddings disabled, using all tools"
      );
      this.tools.clearFilter();
    }

    const response = await this.fluidTool.query(query, threadId);

    logger(
      this.debug,
      "📦 [FluidToolsClient.query] Response messages:",
      response.messages.length
    );
    logger(
      this.debug,
      "📄 [FluidToolsClient.query] Last message content:",
      response.messages[response.messages.length - 1]?.content
    );

    return response.messages[response.messages.length - 1]?.content;
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
    return result.messages[result.messages.length - 1]?.content;
  }

  /**
   * Reject a pending tool call and continue execution
   * @param toolCallId The ID of the tool call to reject
   */
  public async rejectToolCall(toolCallId: string, accessToken?: string) {
    const threadId = this.getThreadId(accessToken);
    const result = await this.fluidTool.rejectToolCall(toolCallId, threadId);
    return result.messages[result.messages.length - 1]?.content;
  }

  /**
   * Print the full conversation history to console
   */
  public async printConversationHistory() {
    await this.fluidTool.printConversationHistory();
  }
}

export default FluidToolsClient;

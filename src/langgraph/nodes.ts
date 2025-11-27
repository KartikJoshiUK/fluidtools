import {
  AIMessage,
  BaseMessage,
  SystemMessage,
  Tool,
  ToolMessage,
} from "langchain";
import MessagesState from "./state.js";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { Model, ToolConfirmationConfig, PendingToolCall } from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";
import { logger } from "../utils/index.js";
import { Tools } from "./tool.js";

const getAgent = (
  model: Model,
  toolObj: Tools,
  memory: MemorySaver,
  systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS,
  debug: boolean = false,
  confirmationConfig?: ToolConfirmationConfig
) => {
  const toolsByName = toolObj.getToolByName(false);
  const tools = Object.values(toolsByName);
  const modelWithTools = model.bindTools(tools);
  const systemMessage = new SystemMessage(systemInstructions);

  // Tools that require human confirmation
  const requiresConfirmation = new Set(
    confirmationConfig?.requireConfirmation || []
  );

  async function llmCall(state: typeof MessagesState.State) {
    logger(debug, "\n🔍 [llmCall] Current state:", {
      messageCount: state.messages.length,
      maxToolCalls: state.maxToolCalls,
    });

    const messages = [systemMessage, ...state.messages];

    logger(debug, "📤 [llmCall] Sending messages to LLM:", messages.length);
    const aiMessage = await modelWithTools.invoke(messages);
    logger(debug, "📥 [llmCall] Received AI message:", {
      hasToolCalls: !!aiMessage.tool_calls?.length,
      toolCallCount: aiMessage.tool_calls?.length || 0,
    });

    return {
      messages: [aiMessage], // ✅ Only return new message - LangGraph handles merging
    };
  }

  async function toolNode(state: typeof MessagesState.State) {
    logger(debug, "\n🔧 [toolNode] Executing tools...");
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      logger(debug, "⚠️  [toolNode] No valid AI message found");
      return {
        messages: [],
        pendingConfirmations: [],
        awaitingConfirmation: false,
      };
    }

    const result: ToolMessage[] = [];
    const newPendingConfirmations: PendingToolCall[] = [];
    
    // Get existing pending confirmations from state (for resume scenario)
    const existingPending = state.pendingConfirmations || [];
    const pendingByToolCallId = new Map(
      existingPending.map(p => [p.toolCallId, p])
    );

    for (const toolCall of lastMessage.tool_calls ?? []) {
      logger(debug, `🛠️  [toolNode] Checking tool: ${toolCall.name}`);
      
      const existingConfirmation = pendingByToolCallId.get(toolCall.id!);
      
      if (existingConfirmation) {
        logger(debug, `🔄 [toolNode] Found existing confirmation for ${toolCall.name}: ${existingConfirmation.status}`);
        
        if (existingConfirmation.status === 'approved') {
          // Tool was approved - execute it now
          logger(debug, `✅ [toolNode] Tool ${toolCall.name} was approved, executing...`);
          const tool = toolsByName[toolCall.name];
          const observation = await tool.invoke(toolCall);
          result.push(observation);
          logger(debug, `✅ [toolNode] Tool ${toolCall.name} completed`);
          continue;
        } else if (existingConfirmation.status === 'rejected') {
          // Tool was rejected - add rejection message
          logger(debug, `❌ [toolNode] Tool ${toolCall.name} was rejected by user`);
          result.push(
            new ToolMessage({
              tool_call_id: toolCall.id!,
              name: toolCall.name,
              content: `Action "${toolCall.name}" was cancelled by user.`,
            })
          );
          continue;
        }
        // If still 'pending', fall through to normal processing
      }
      
      // Check if this tool requires confirmation
      if (requiresConfirmation.has(toolCall.name)) {
        logger(debug, `⚠️  [toolNode] Tool ${toolCall.name} requires confirmation!`);
        
        // Add to pending and pause for human confirmation
        newPendingConfirmations.push({
          toolName: toolCall.name,
          toolCallId: toolCall.id!,
          args: toolCall.args,
          status: 'pending',
        });
        continue;
      }

      // Execute the tool
      const tool: Tool = toolsByName[toolCall.name];
      const observation = await tool.invoke({
        ...toolCall.args,
        authToken: state.authToken,
      });
      result.push(observation);
      logger(debug, `✅ [toolNode] Tool ${toolCall.name} completed`);
    }

    // If we have NEW pending confirmations, pause the graph
    if (newPendingConfirmations.length > 0) {
      logger(debug, `⏸️  [toolNode] Pausing for ${newPendingConfirmations.length} confirmations`);
      return {
        messages: result,
        pendingConfirmations: newPendingConfirmations,
        awaitingConfirmation: true,
      };
    }

    logger(debug, `📦 [toolNode] Returning ${result.length} tool messages`);
    return {
      messages: result,
      pendingConfirmations: [],
      awaitingConfirmation: false,
    };
  }
  async function shouldContinue(state: typeof MessagesState.State) {
    logger(debug, "\n🤔 [shouldContinue] Deciding next step...");
    
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      logger(debug, "🛑 [shouldContinue] No AI message, ending");
      return END;
    }

    // Count how many tool calls we've made so far
    const toolCallCount = state.messages.filter((m: BaseMessage) =>
      ToolMessage.isInstance(m)
    ).length;

    const maxToolCalls = state.maxToolCalls || 10;
    logger(
      debug,
      `📊 [shouldContinue] Tool calls: ${toolCallCount}/${maxToolCalls}`
    );

    // Stop if we've hit the recursion limit
    if (toolCallCount >= maxToolCalls) {
      console.warn(
        `Reached maximum tool call limit (${maxToolCalls}). Stopping to prevent infinite loops.`
      );
      return END;
    }

    // If the LLM makes a tool call, then perform an action
    if (lastMessage.tool_calls?.length) {
      logger(
        debug,
        `➡️  [shouldContinue] Continuing to toolNode (${lastMessage.tool_calls.length} tools)`
      );
      return "toolNode";
    }

    // Otherwise, we stop (reply to the user)
    logger(debug, "🏁 [shouldContinue] No more tool calls, ending");
    return END;
  }

  // Node that pauses for human confirmation
  async function awaitConfirmationNode(state: typeof MessagesState.State) {
    logger(
      debug,
      "\n⏸️  [awaitConfirmation] Graph paused for human confirmation"
    );
    logger(debug, "Pending confirmations:", state.pendingConfirmations);

    return {};
  }

  if (confirmationConfig?.requireConfirmation?.length) {
    // Graph with human-in-the-loop confirmation
    const agent = new StateGraph(MessagesState)
      .addNode("llmCall", llmCall)
      .addNode("toolNode", toolNode)
      .addNode("awaitConfirmation", awaitConfirmationNode)
      .addEdge(START, "llmCall")
      .addConditionalEdges("llmCall", shouldContinue, [
        "toolNode",
        "awaitConfirmation",
        END,
      ])
      .addConditionalEdges(
        "toolNode",
        (state) => {
          if (state.awaitingConfirmation) {
            return "awaitConfirmation";
          }
          return "llmCall";
        },
        ["awaitConfirmation", "llmCall"]
      )
      .addEdge("awaitConfirmation", "toolNode")
      .compile({
        checkpointer: memory,
        interruptBefore: ["awaitConfirmation"],
      });

    return agent;
  } else {
    // Standard flow without confirmation
    const agent = new StateGraph(MessagesState)
      .addNode("llmCall", llmCall)
      .addNode("toolNode", toolNode)
      .addEdge(START, "llmCall")
      .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
      .addEdge("toolNode", "llmCall")
      .compile({ checkpointer: memory });

    return agent;
  }
};

export default getAgent;

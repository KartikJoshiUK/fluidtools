import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from "langchain";
import MessagesState from "./state.js";
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { Model } from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";

const getAgent = (
  model: Model,
  toolsByName: Record<string, any>,
  systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS
) => {
  const tools = Object.values(toolsByName);
  const modelWithTools = model.bindTools(tools);
  const systemMessage = new SystemMessage(systemInstructions);

  async function llmCall(state: typeof MessagesState.State) {
    console.log('\n🔍 [llmCall] Current state:', {
      messageCount: state.messages.length,
      maxToolCalls: state.maxToolCalls
    });

    // Only include system message if this is the first call
    const messages = state.messages.length === 0
      ? [systemMessage, ...state.messages]
      : state.messages;

    console.log('📤 [llmCall] Sending messages to LLM:', messages.length);
    const aiMessage = await modelWithTools.invoke(messages);
    console.log('📥 [llmCall] Received AI message:', {
      hasToolCalls: !!aiMessage.tool_calls?.length,
      toolCallCount: aiMessage.tool_calls?.length || 0
    });

    return {
      messages: [aiMessage]  // ✅ Only return new message - LangGraph handles merging
    };
  }

  async function toolNode(state: typeof MessagesState.State) {
    console.log('\n🔧 [toolNode] Executing tools...');
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      console.log('⚠️  [toolNode] No valid AI message found');
      return { messages: [] };  // ✅ Return empty array - no new messages
    }

    const result: ToolMessage[] = [];
    for (const toolCall of lastMessage.tool_calls ?? []) {
      console.log(`🛠️  [toolNode] Calling tool: ${toolCall.name}`);
      const tool = toolsByName[toolCall.name];
      const observation = await tool.invoke(toolCall);
      result.push(observation);
      console.log(`✅ [toolNode] Tool ${toolCall.name} completed`);
    }

    console.log(`📦 [toolNode] Returning ${result.length} tool messages`);
    return { messages: result };
  }
  async function shouldContinue(state: typeof MessagesState.State) {
    console.log('\n🤔 [shouldContinue] Deciding next step...');
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      console.log('🛑 [shouldContinue] No AI message, ending');
      return END;
    }

    // Count how many tool calls we've made so far
    const toolCallCount = state.messages.filter(
      (m: BaseMessage) => ToolMessage.isInstance(m)
    ).length;

    const maxToolCalls = state.maxToolCalls || 10;
    console.log(`📊 [shouldContinue] Tool calls: ${toolCallCount}/${maxToolCalls}`);

    // Stop if we've hit the recursion limit
    if (toolCallCount >= maxToolCalls) {
      console.warn(
        `Reached maximum tool call limit (${maxToolCalls}). Stopping to prevent infinite loops.`
      );
      return END;
    }

    // If the LLM makes a tool call, then perform an action
    if (lastMessage.tool_calls?.length) {
      console.log(`➡️  [shouldContinue] Continuing to toolNode (${lastMessage.tool_calls.length} tools)`);
      return "toolNode";
    }

    // Otherwise, we stop (reply to the user)
    console.log('🏁 [shouldContinue] No more tool calls, ending');
    return END;
  }

  const checkpointer = new MemorySaver();


  const agent = new StateGraph(MessagesState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile({ checkpointer });
  return agent;
};

export default getAgent;

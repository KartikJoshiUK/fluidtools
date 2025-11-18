import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from "langchain";
import MessagesState from "./state.js";
import { END, START, StateGraph } from "@langchain/langgraph";
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
    // Only include system message if this is the first call
    const messages = state.messages.length === 0
      ? [systemMessage, ...state.messages]
      : state.messages;

    const aiMessage = await modelWithTools.invoke(messages);


    return {
      messages: [aiMessage]  // ✅ Only return new message - LangGraph handles merging
    };
  }

  async function toolNode(state: typeof MessagesState.State) {
    const lastMessage = state.messages.at(-1);
console.log("bsdk phle log kar");
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      return { messages: [] };  // ✅ Return empty array - no new messages
    }

    const result: ToolMessage[] = [];
   console.log(lastMessage.tool_calls,"bsdk log kar");
    for (const toolCall of lastMessage.tool_calls ?? []) {
      const tool = toolsByName[toolCall.name];
      const observation = await tool.invoke(toolCall);
      result.push(observation);
    }

    return { messages: result };
  }
  async function shouldContinue(state: typeof MessagesState.State) {
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) return END;

    // Count how many tool calls we've made so far
    const toolCallCount = state.messages.filter(
      (m: BaseMessage) => ToolMessage.isInstance(m)
    ).length;

    const maxToolCalls = state.maxToolCalls || 10;

    // Stop if we've hit the recursion limit
    if (toolCallCount >= maxToolCalls) {
      console.warn(
        `Reached maximum tool call limit (${maxToolCalls}). Stopping to prevent infinite loops.`
      );
      return END;
    }

    // If the LLM makes a tool call, then perform an action
    if (lastMessage.tool_calls?.length) {
      return "toolNode";
    }

    // Otherwise, we stop (reply to the user)
    return END;
  }
  const agent = new StateGraph(MessagesState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile();
  return agent;
};

export default getAgent;

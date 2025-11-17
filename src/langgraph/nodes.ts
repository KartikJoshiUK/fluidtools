import { AIMessage, SystemMessage, ToolMessage } from "langchain";
import MessagesState from "./state.js";
import * as z from "zod";
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
  async function llmCall(state: z.infer<typeof MessagesState>) {
    const aiMessage = await modelWithTools.invoke([
      new SystemMessage(systemInstructions),
      ...state.messages,
    ]);

    return {
      messages: [...state.messages, aiMessage],
      llmCalls: (state.llmCalls ?? 0) + 1,
    };
  }

  async function toolNode(state: z.infer<typeof MessagesState>) {
    const lastMessage = state.messages.at(-1);

    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
      return { messages: state.messages };
    }

    const result: ToolMessage[] = [];

    for (const toolCall of lastMessage.tool_calls ?? []) {
      const tool = toolsByName[toolCall.name];
      const observation = await tool.invoke(toolCall);
      result.push(observation);
    }

    return { messages: [...state.messages, ...result] };
  }
  async function shouldContinue(state: z.infer<typeof MessagesState>) {
    const lastMessage = state.messages.at(-1);
    if (lastMessage == null || !AIMessage.isInstance(lastMessage)) return END;

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

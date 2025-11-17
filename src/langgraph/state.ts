import { MessagesAnnotation } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";

/**
 * State for the FluidTools agent
 * 
 * Uses LangGraph v1.0's MessagesAnnotation for proper message handling.
 * This is the recommended approach in LangGraph v1.0+
 * 
 * MessagesAnnotation provides:
 * - Built-in message array with smart_message
 * - Proper TypeScript types
 * - Same behavior as Python's add_messages
 * 
 * We extend it with maxToolCalls for recursion control.
 */
const MessagesState = Annotation.Root({
  ...MessagesAnnotation.spec,
  maxToolCalls: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 10,
  }),
});

export default MessagesState;

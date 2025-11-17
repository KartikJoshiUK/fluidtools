import { BaseMessage } from "langchain";
import * as z from "zod";

const MessagesState = z.object({
  messages: z
    .array(z.custom<BaseMessage>()),
  llmCalls: z.number().optional(),
});

export default MessagesState;
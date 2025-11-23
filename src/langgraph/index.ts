// Step 1: Define tools and model

import "dotenv/config";
import { HumanMessage } from "@langchain/core/messages";
import { createProvider } from "./factory.js";
import getAgent from "./nodes.js";
import { ProviderConfig } from "./types.js";
import { DEFAULT_SYSTEM_INSTRUCTIONS } from "./constants.js";

class FluidTools {
  private model;
  private agent;
  private maxToolCalls: number;
  private config: ProviderConfig;

  constructor(
    config: ProviderConfig,
    tools: Record<string, any>,
    systemInstructions: string = DEFAULT_SYSTEM_INSTRUCTIONS,
    maxToolCalls: number = 10
  ) {
    this.config = config;
    this.model = createProvider(config);
    this.agent = getAgent(this.model, tools, systemInstructions);
    this.maxToolCalls = maxToolCalls;
  }

  public async query(query: string) {
    const config = { configurable: { thread_id: "1" } };

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

    console.log('\n' + '='.repeat(80));
    console.log('📚 CONVERSATION HISTORY');
    console.log('='.repeat(80));
    console.log(`Thread ID: 1`);
    console.log(`Total Messages: ${messages.length}`);
    console.log(`Max Tool Calls: ${state.values.maxToolCalls || 'N/A'}`);
    console.log('='.repeat(80));

    messages.forEach((msg: any, index: number) => {
      const msgType = msg._getType();

      console.log(`\n[${index + 1}] ${msgType.toUpperCase()}`);
      console.log('-'.repeat(80));

      if (msgType === 'human') {
        console.log(`👤 User: ${msg.content}`);
      } else if (msgType === 'ai') {
        // Handle AI message content - it can be string, array, or empty
        let contentDisplay = '';
        if (typeof msg.content === 'string') {
          contentDisplay = msg.content;
        } else if (Array.isArray(msg.content)) {
          contentDisplay = msg.content.map((c: any) =>
            typeof c === 'string' ? c : JSON.stringify(c)
          ).join(' ');
        } else if (msg.content) {
          contentDisplay = JSON.stringify(msg.content);
        } else {
          contentDisplay = '(no text content)';
        }

        console.log(`🤖 Assistant: ${contentDisplay}`);

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          console.log(`🔧 Tool Calls: ${msg.tool_calls.length}`);
          msg.tool_calls.forEach((tc: any, i: number) => {
            console.log(`   ${i + 1}. ${tc.name}(${JSON.stringify(tc.args)})`);
          });
        }
      } else if (msgType === 'tool') {
        console.log(`🛠️  Tool: ${msg.name}`);
        const contentStr = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
        const preview = contentStr.length > 200
          ? contentStr.substring(0, 200) + '...'
          : contentStr;
        console.log(`📤 Result: ${preview}`);
      } else if (msgType === 'system') {
        const preview = msg.content.length > 200
          ? msg.content.substring(0, 200) + '...'
          : msg.content;
        console.log(`⚙️  System: ${preview}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ End of conversation history\n');
  }
}

export default FluidTools;

// Main factory function

import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ProviderConfig } from "./types.js";
import { validateProviderConfig } from "./config.js";

export function createProvider(config: ProviderConfig) {
    validateProviderConfig(config);


    switch (config.type) {
        case 'ollama':
            return new ChatOllama({
                model: config.model,
                baseUrl: config.baseUrl || 'http://localhost:11434',
                temperature: config.temperature,
                numCtx: config.numCtx,
            });

        case 'openai':
            return new ChatOpenAI({
                modelName: config.model,
                openAIApiKey: config.apiKey,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                topP: config.topP,
            });

        case 'anthropic':
            return new ChatAnthropic({
                modelName: config.model,
                anthropicApiKey: config.apiKey,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                topP: config.topP,
            });

        default:
            // This should never happen due to TypeScript's exhaustiveness checking
            throw new Error(`Unsupported provider type: ${(config as any).type}`);
    }
}

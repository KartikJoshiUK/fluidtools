// Provider type definitions

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI, ChatOpenAICallOptions } from "@langchain/openai";

export type ProviderType = "ollama" | "openai" | "anthropic" | "gemini";

export interface BaseProviderConfig {
  type: ProviderType;
  model: string;
}

export interface OllamaConfig extends BaseProviderConfig {
  type: "ollama";
  baseUrl?: string;
  temperature?: number;
  numCtx?: number;
}

export interface OpenAIConfig extends BaseProviderConfig {
  type: "openai";
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface AnthropicConfig extends BaseProviderConfig {
  type: "anthropic";
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface GeminiConfig extends BaseProviderConfig {
  type: "gemini";
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export type ProviderConfig =
  | OllamaConfig
  | OpenAIConfig
  | AnthropicConfig
  | GeminiConfig;
export type Model =
  | ChatOllama
  | ChatOpenAI<ChatOpenAICallOptions>
  | ChatAnthropic
  | ChatGoogleGenerativeAI;

// Configuration types and validation

import { ProviderConfig, ProviderType } from "./types.js";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

export function validateProviderConfig(config: ProviderConfig): void {
  // Validate common fields
  if (!config.type) {
    throw new ProviderConfigError("Provider type is required");
  }

  if (!config.model) {
    throw new ProviderConfigError("Model name is required");
  }

  // Validate provider-specific requirements
  switch (config.type) {
    case "ollama":
      // Ollama only requires type and model, baseUrl is optional
      if (config.baseUrl && typeof config.baseUrl !== "string") {
        throw new ProviderConfigError("Ollama baseUrl must be a string");
      }
      break;

    case "openai":
      if (!config.apiKey) {
        throw new ProviderConfigError("OpenAI API key is required");
      }
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
        throw new ProviderConfigError(
          "OpenAI API key must be a non-empty string"
        );
      }
      if (
        config.temperature !== undefined &&
        (typeof config.temperature !== "number" ||
          config.temperature < 0 ||
          config.temperature > 2)
      ) {
        throw new ProviderConfigError(
          "OpenAI temperature must be a number between 0 and 2"
        );
      }
      break;

    case "anthropic":
      if (!config.apiKey) {
        throw new ProviderConfigError("Anthropic API key is required");
      }
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
        throw new ProviderConfigError(
          "Anthropic API key must be a non-empty string"
        );
      }
      if (
        config.temperature !== undefined &&
        (typeof config.temperature !== "number" ||
          config.temperature < 0 ||
          config.temperature > 1)
      ) {
        throw new ProviderConfigError(
          "Anthropic temperature must be a number between 0 and 1"
        );
      }
      break;

    case "gemini":
      if (!config.apiKey) {
        throw new ProviderConfigError("Gemini API key is required");
      }
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
        throw new ProviderConfigError(
          "Gemini API key must be a non-empty string"
        );
      }
      break;

    case "nebius":
      if (!config.apiKey) {
        throw new ProviderConfigError("Nebius API key is required");
      }
      if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
        throw new ProviderConfigError(
          "Nebius API key must be a non-empty string"
        );
      }
      if (config.baseUrl && typeof config.baseUrl !== "string") {
        throw new ProviderConfigError("Nebius baseUrl must be a string");
      }
      break;

    default:
      throw new ProviderConfigError(
        `Unsupported provider type: ${(config as any).type}`
      );
  }
}

export function loadProviderConfigFromEnv(): ProviderConfig {
  // Parse provider type with default to 'ollama'
  const type = (process.env.PROVIDER_TYPE || "ollama") as ProviderType;

  // Parse model with provider-specific defaults
  const getDefaultModel = (): string => {
    switch (type) {
      case "ollama":
        return "llama3.2:3b";
      case "openai":
        return "gpt-4";
      case "anthropic":
        return "claude-3-opus-20240229";

      case "gemini":
        return "gemini-2.5-flash-lite";
      case "nebius":
        return "meta-llama/Meta-Llama-3.1-8B-Instruct";
      default:
        return "llama3.2:3b";
    }
  };

  const model = process.env.PROVIDER_MODEL || getDefaultModel();

  // Helper function to parse numeric values with defaults
  const parseNumeric = (
    value: string | undefined,
    defaultValue: number | undefined
  ): number | undefined => {
    if (value === undefined) {
      return;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  // Build provider-specific configuration
  switch (type) {
    case "ollama":
      return {
        type: "ollama",
        model,
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        temperature: parseNumeric(process.env.PROVIDER_TEMPERATURE, 0.7),
        numCtx: parseNumeric(process.env.OLLAMA_NUM_CTX, 2048),
      };

    case "openai":
      return {
        type: "openai",
        model,
        apiKey: process.env.OPENAI_API_KEY || "",
        temperature: parseNumeric(process.env.PROVIDER_TEMPERATURE, 0.7),
        maxTokens: parseNumeric(process.env.PROVIDER_MAX_TOKENS, undefined),
        topP: parseNumeric(process.env.PROVIDER_TOP_P, undefined),
      };

    case "anthropic":
      return {
        type: "anthropic",
        model,
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        temperature: parseNumeric(process.env.PROVIDER_TEMPERATURE, 0.7),
        maxTokens: parseNumeric(process.env.PROVIDER_MAX_TOKENS, undefined),
        topP: parseNumeric(process.env.PROVIDER_TOP_P, undefined),
      };

    case "gemini":
      return {
        type: "gemini",
        model,
        apiKey: process.env.GEMINI_API_KEY || "",
        temperature: parseNumeric(process.env.PROVIDER_TEMPERATURE, 0.7),
        maxTokens: parseNumeric(process.env.PROVIDER_MAX_TOKENS, undefined),
        topP: parseNumeric(process.env.PROVIDER_TOP_P, undefined),
      };

    case "nebius":
      return {
        type: "nebius",
        model,
        apiKey: process.env.NEBIUS_API_KEY || "",
        baseUrl: process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.ai/v1/",
        temperature: parseNumeric(process.env.PROVIDER_TEMPERATURE, 0.7),
        maxTokens: parseNumeric(process.env.PROVIDER_MAX_TOKENS, undefined),
        topP: parseNumeric(process.env.PROVIDER_TOP_P, undefined),
      };

    default:
      throw new ProviderConfigError(`Unsupported provider type: ${type}`);
  }
}

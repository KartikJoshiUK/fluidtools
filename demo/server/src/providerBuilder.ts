import { ProviderConfig } from "fluidtools";

export type ProviderSelection =
  | "nebius-free"
  | "openai"
  | "anthropic"
  | "gemini";

export interface ProviderRequest {
  provider: ProviderSelection;
  apiKey?: string; // Required for paid providers, optional for free
  model?: string; // Optional custom model name
}

export function buildProviderConfig(request: ProviderRequest): ProviderConfig {
  const { provider, apiKey, model } = request;

  switch (provider) {
    case "nebius-free":
      // Use server's Nebius API key from environment
      // Model is always from server env for free tier
      return {
        type: "nebius",
        model:
          process.env.PROVIDER_MODEL || "meta-llama/Meta-Llama-3.1-8B-Instruct",
        apiKey: process.env.NEBIUS_API_KEY || "",
        baseUrl:
          process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.ai/v1/",
        temperature: 0.7,
      };

    case "openai":
      if (!apiKey) throw new Error("OpenAI API key is required");
      return {
        type: "openai",
        model: model || "gpt-4o-mini",
        apiKey,
        temperature: 0.7,
      };

    case "anthropic":
      if (!apiKey) throw new Error("Anthropic API key is required");
      return {
        type: "anthropic",
        model: model || "claude-3-5-sonnet",
        apiKey,
        temperature: 0.7,
      };

    case "gemini":
      if (!apiKey) throw new Error("Gemini API key is required");
      return {
        type: "gemini",
        model: model || "gemini-2.5-flash",
        apiKey,
        temperature: 0.7,
      };

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function getProviderHelpLink(provider: string): string {
  const links: Record<string, string> = {
    openai: "https://platform.openai.com/api-keys",
    anthropic: "https://console.anthropic.com/settings/keys",
    gemini: "https://aistudio.google.com/app/apikey",
  };
  return links[provider] || "";
}

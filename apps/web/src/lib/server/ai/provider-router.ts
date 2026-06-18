export type HassaliProviderCapability =
  | "ASK"
  | "CODE"
  | "EMBEDDINGS"
  | "REASONING"
  | "REPAIR"
  | "SEARCH"
  | "VALIDATION"
  | "VISION"
  | "WEBSITE";

export type HassaliProviderRecord = {
  capabilities: HassaliProviderCapability[];
  envKeys: string[];
  id: string;
  name: string;
};

export type ConfiguredProviderInfo = {
  capabilities: HassaliProviderCapability[];
  fallbackProviders: string[];
  modelName: string | null;
  providerName: string | null;
  source: "environment" | "request" | "unavailable";
};

export const providerRecords: HassaliProviderRecord[] = [
  { capabilities: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR", "VISION"], envKeys: ["OPENAI_API_KEY"], id: "openai", name: "OpenAI" },
  { capabilities: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR"], envKeys: ["ANTHROPIC_API_KEY"], id: "anthropic", name: "Anthropic" },
  { capabilities: ["ASK", "CODE", "WEBSITE", "REASONING", "VISION"], envKeys: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"], id: "google", name: "Google Gemini" },
  { capabilities: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR", "VISION"], envKeys: ["OPENROUTER_API_KEY"], id: "openrouter", name: "OpenRouter" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["GROQ_API_KEY"], id: "groq", name: "Groq" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["TOGETHER_API_KEY"], id: "together", name: "Together AI" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["FIREWORKS_API_KEY"], id: "fireworks", name: "Fireworks" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["DEEPSEEK_API_KEY"], id: "deepseek", name: "DeepSeek" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["QWEN_API_KEY"], id: "qwen", name: "Qwen" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["MISTRAL_API_KEY"], id: "mistral", name: "Mistral" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["OLLAMA_BASE_URL"], id: "ollama", name: "Ollama" },
  { capabilities: ["ASK", "CODE", "REASONING"], envKeys: ["LM_STUDIO_BASE_URL"], id: "lmstudio", name: "LM Studio" },
  { capabilities: ["ASK", "CODE", "WEBSITE", "REASONING"], envKeys: ["OPENAI_COMPATIBLE_BASE_URL", "CUSTOM_OPENAI_BASE_URL"], id: "custom-openai-compatible", name: "Custom OpenAI-compatible endpoint" }
];

function providerFromModel(modelName: string | null) {
  const model = modelName?.toLowerCase() ?? "";

  if (model.startsWith("openai/") || model.includes("gpt-")) return providerRecords.find((provider) => provider.id === "openai") ?? null;
  if (model.startsWith("anthropic/") || model.includes("claude")) return providerRecords.find((provider) => provider.id === "anthropic") ?? null;
  if (model.startsWith("google/") || model.includes("gemini")) return providerRecords.find((provider) => provider.id === "google") ?? null;
  if (model.startsWith("deepseek/")) return providerRecords.find((provider) => provider.id === "deepseek") ?? null;
  if (model.startsWith("qwen/")) return providerRecords.find((provider) => provider.id === "qwen") ?? null;
  if (model.startsWith("mistral/")) return providerRecords.find((provider) => provider.id === "mistral") ?? null;

  return null;
}

export function getConfiguredProviderInfo(input?: {
  requestedModel?: string | null;
}): ConfiguredProviderInfo {
  const requestedModel = input?.requestedModel?.trim() || process.env.HASSALI_DEFAULT_MODEL || null;
  const modelProvider = providerFromModel(requestedModel);

  if (modelProvider) {
    return {
      capabilities: modelProvider.capabilities,
      fallbackProviders: providerRecords.filter((provider) => provider.id !== modelProvider.id).map((provider) => provider.name),
      modelName: requestedModel,
      providerName: modelProvider.name,
      source: "request"
    };
  }

  const configuredProvider = providerRecords.find((provider) =>
    provider.envKeys.some((key) => Boolean(process.env[key]))
  );

  return {
    capabilities: configuredProvider?.capabilities ?? [],
    fallbackProviders: providerRecords
      .filter((provider) => provider.id !== configuredProvider?.id)
      .map((provider) => provider.name),
    modelName: requestedModel,
    providerName: configuredProvider?.name ?? null,
    source: configuredProvider ? "environment" : "unavailable"
  };
}

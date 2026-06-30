import { getConfiguredProviderInfo } from "@/lib/server/ai/provider-router";

function isIdentityQuestion(prompt: string) {
  return /\b(?:who are you|what are you|who designed you|who built you|what is your version|how are you running|how can i improve your intelligence)\b/i.test(prompt);
}

function isProviderQuestion(prompt: string) {
  return /\b(?:what model|which model|current model|model are you using|provider|advanced models|what ai model)\b/i.test(prompt);
}

export function createHassaliIdentityAnswer(input: {
  model?: string | null;
  prompt: string;
}) {
  const provider = getConfiguredProviderInfo({
    requestedModel: input.model
  });

  if (isProviderQuestion(input.prompt)) {
    const providerLine = provider.providerName && provider.modelName
      ? [
          `Selected provider: ${provider.providerName}`,
          `Selected model: ${provider.modelName}`,
          `Execution status: ${provider.isConfigured ? "configured" : "registered, config required"}`
        ].join("\n")
      : "The provider/model is not exposed in this environment yet, but Hassali is designed to support multiple providers through configuration.";
    const requiredEnvLine = provider.requiredEnv.length
      ? `Required env: ${provider.requiredEnv.join(", ")}`
      : "Required env: none detected from registry.";
    const activationLine = provider.providerName && provider.modelName && !provider.isConfigured
      ? "Selected model is registered but not confirmed active because required environment variables are missing."
      : provider.providerName && provider.modelName
        ? "Selected model has required configuration metadata present. Actual active execution still depends on the current chat route/provider path."
        : "Selected model is not available from the registry.";
    const localLine = provider.localModelsConfigured
      ? "Local models: configured through Ollama or LM Studio metadata."
      : "Local models: registered, but no local endpoint env is configured.";
    const liveSearchLine = provider.liveSearchConnected
      ? "Live search: provider key detected."
      : "Live search: not connected in this environment.";

    return [
      "I am Hassali.ai, an AI engineering workspace built to help plan, generate, preview, review, and safely apply software and website changes.",
      "",
      providerLine,
      requiredEnvLine,
      activationLine,
      localLine,
      liveSearchLine,
      "",
      "Available model families in registry:",
      "OpenAI, Claude, Gemini, GLM, DeepSeek, Qwen, Mistral, Llama, Groq, OpenRouter, Ollama, LM Studio, and custom OpenAI-compatible endpoints.",
      "",
      "Important:",
      "Only configured models can actually execute. A model shown in the selector may still need its API key or base URL before it can run."
    ].join("\n");
  }

  if (!isIdentityQuestion(input.prompt)) {
    return null;
  }

  if (/\bhow can i improve your intelligence\b/i.test(input.prompt)) {
    return [
      "You can improve Hassali's practical intelligence by giving it clearer project context, exact mode intent, current files, desired pages/features, constraints, and examples of what to avoid.",
      "",
      "Hassali itself improves through its orchestration stack: intent translation, project contracts, validators, repair checks, preview/runtime awareness, and configurable provider routing. The safest way to get better output is to state the target domain, exact files/pages, quality bar, and approval constraints."
    ].join("\n");
  }

  return [
    "I am Hassali.ai, an AI engineering workspace built to help plan, generate, preview, review, and safely apply software and website changes.",
    "",
    "I can route tasks through configured AI providers, project context, validators, repair checks, preview systems, and approval-first runtime tools. I am not just a raw model chat surface; Hassali is the workspace and orchestration layer around the intelligence."
  ].join("\n");
}

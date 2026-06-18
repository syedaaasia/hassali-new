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
      ? `Current provider: ${provider.providerName}\nCurrent model: ${provider.modelName}`
      : "The provider/model is not exposed in this environment yet, but Hassali is designed to support multiple providers through configuration.";

    return [
      "I am Hassali.ai, an AI engineering workspace built to help plan, generate, preview, review, and safely apply software and website changes.",
      "",
      providerLine,
      "",
      "Hassali can route work through configured providers, validators, repair checks, preview/runtime metadata, and approval-first execution. Provider routing metadata is visible as configuration, not as a raw model refusal."
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

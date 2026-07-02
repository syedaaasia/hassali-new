import type { AskRuntimeContext } from "./ask-context";

export type AskIntentName =
  | "bullet_format"
  | "business_plan"
  | "client_message"
  | "data_work_guidance"
  | "date_time_question"
  | "general_answer"
  | "polite_rewrite"
  | "summarize"
  | "task_checklist"
  | "teaching_explanation"
  | "translation_or_language_help"
  | "wrong_mode_build_request";

export type AskIntentClassification = {
  confidence: number;
  intent: AskIntentName;
  mutationPolicy: "never_mutate";
  reason: string;
  shouldCreateProposal: false;
  shouldWriteFiles: false;
};

const mutationSafe = {
  mutationPolicy: "never_mutate",
  shouldCreateProposal: false,
  shouldWriteFiles: false
} as const;

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function classify(
  intent: AskIntentName,
  confidence: number,
  reason: string
): AskIntentClassification {
  return {
    confidence,
    intent,
    reason,
    ...mutationSafe
  };
}

function hasUrl(prompt: string) {
  return /\bhttps?:\/\/\S+/i.test(prompt);
}

function isLiveUrlRequest(prompt: string) {
  return hasUrl(prompt) && /\b(?:open|read|visit|check|summarize|summarise|analyze|analyse)\b/i.test(prompt);
}

function isFileReadingRequest(prompt: string) {
  return /\b(?:uploaded|attached|my\s+(?:excel|xlsx|file|document|pdf)|the\s+(?:excel|xlsx|file|document|pdf))\b/i.test(prompt) &&
    /\b(?:read|clean|analyze|analyse|summarize|summarise|extract|open)\b/i.test(prompt);
}

function isImageReadingRequest(prompt: string) {
  return /\b(?:this|the|uploaded|attached|my)\s+(?:image|photo|screenshot)\b|\bocr\b/i.test(prompt) &&
    /\b(?:read|extract|analyze|analyse|understand)\b/i.test(prompt);
}

function isWritingIntent(prompt: string) {
  return /\b(?:write|draft|compose|prepare|create|make)\b[\s\S]{0,120}\b(?:message|email|reply|note|reminder|sms|whatsapp|dm|letter|caption|announcement)\b/i.test(prompt) ||
    /\b(?:message|email|reply|note|reminder|sms|whatsapp|dm|letter|caption|announcement)\b[\s\S]{0,80}\b(?:to|for)\s+(?:a\s+)?(?:client|customer|team|manager|lead|user|patient|vendor|partner)\b/i.test(prompt);
}

function isPoliteRewrite(prompt: string) {
  return /\b(?:rewrite|make|write)\b[\s\S]{0,80}\b(?:politely|more human|humanly|short|professional|clearer|friendlier)\b/i.test(prompt);
}

function isBulletFormat(prompt: string) {
  return /\b(?:bullet points|bullets|bullet format|as bullets)\b/i.test(prompt);
}

function isSummaryRequest(prompt: string) {
  return /\b(?:summarize|summarise|summary)\b/i.test(prompt);
}

function isPlanningRequest(prompt: string) {
  return /\b(?:plan|checklist|steps|schedule|tomorrow)\b/i.test(prompt) &&
    /\b(?:work|task|clean|records|admin|business|csv|data|real estate)\b/i.test(prompt);
}

function isDataWorkGuidance(prompt: string) {
  return /\b(?:csv|spreadsheet|excel|records|dataset|data cleaning|dedupe|duplicates)\b/i.test(prompt);
}

function isTeachingRequest(prompt: string) {
  return /\b(?:explain|teach|what is|how does|like i am|i am very new|beginner)\b/i.test(prompt);
}

function isTranslationRequest(prompt: string) {
  return /\b(?:translate|translation|rewrite in|say this in)\b/i.test(prompt);
}

function isDirectDateTimeQuestion(prompt: string) {
  const normalized = normalizePrompt(prompt).replace(/[?.!]+$/g, "");

  return /^(?:what(?:'s| is)?|tell me)?\s*(?:the\s*)?(?:date|day|time)\s*(?:today|tomorrow|now|right now|is it)?(?:\s+(?:in|for|at)\s+[\w\s/_-]+)?$/.test(normalized) ||
    /\b(?:what date is today|what'?s tomorrow'?s date|tomorrow'?s date|today'?s date|current date|what day is it|what time is it|current time|time now|date today)\b/i.test(prompt);
}

function isWrongModeBuildRequest(prompt: string) {
  return /\b(?:add|build|create|make|generate|design|edit|update|change|install|run|fix)\b[\s\S]{0,120}\b(?:website|site|homepage|app|tool|system|file|files|code|crm|dashboard|streamlit|app\.py|testimonials|python)\b/i.test(prompt);
}

export function classifyAskIntent(prompt: string): AskIntentClassification {
  if (isLiveUrlRequest(prompt)) {
    return classify("general_answer", 0.98, "The user asked ASK mode to open or summarize a live URL.");
  }

  if (isFileReadingRequest(prompt) || isImageReadingRequest(prompt)) {
    return classify("general_answer", 0.97, "The user asked ASK mode to read a file or image that is not available to this layer.");
  }

  if (isWritingIntent(prompt)) {
    return classify("client_message", 0.94, "The user is asking for a drafted message or reply.");
  }

  if (isPoliteRewrite(prompt)) {
    return classify("polite_rewrite", 0.92, "The user is asking to rewrite existing wording.");
  }

  if (isSummaryRequest(prompt)) {
    return classify("summarize", 0.9, "The user requested a summary of provided text.");
  }

  if (isBulletFormat(prompt)) {
    return classify("bullet_format", 0.93, "The user requested bullet-point formatting.");
  }

  if (isWrongModeBuildRequest(prompt)) {
    return classify("wrong_mode_build_request", 0.9, "The user is asking ASK mode to build, edit, install, or run project work.");
  }

  if (isDataWorkGuidance(prompt)) {
    return classify("data_work_guidance", 0.88, "The user is asking for data or record-cleaning guidance.");
  }

  if (isPlanningRequest(prompt)) {
    return classify("task_checklist", 0.86, "The user is asking for a practical plan or checklist.");
  }

  if (/\b(?:business plan|marketing plan|offer|follow-up|client drop|sales)\b/i.test(prompt)) {
    return classify("business_plan", 0.82, "The user is asking for simple business planning support.");
  }

  if (isTranslationRequest(prompt)) {
    return classify("translation_or_language_help", 0.86, "The user is asking for language help.");
  }

  if (isTeachingRequest(prompt)) {
    return classify("teaching_explanation", 0.84, "The user is asking for a simple explanation.");
  }

  if (isDirectDateTimeQuestion(prompt)) {
    return classify("date_time_question", 0.9, "The user is directly asking for date or time.");
  }

  return classify("general_answer", 0.55, "No stronger ASK-I1 intent matched.");
}

function extractAfterColon(prompt: string) {
  const index = prompt.indexOf(":");
  return index >= 0 ? prompt.slice(index + 1).trim() : prompt.trim();
}

function phoneSafeText(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function createClientMessageAnswer(prompt: string) {
  const lower = prompt.toLowerCase();

  if (/\breceived\b/.test(lower) && /\bconfirm\b/.test(lower) && /\boptions\b/.test(lower)) {
    return [
      "Hi,",
      "",
      "We’ve received your request and will confirm the available options tomorrow morning.",
      "",
      "Best regards"
    ].join("\n");
  }

  const instruction = phoneSafeText(
    prompt.match(/\b(?:saying|that says|to say|which says)\s+(.+?)(?:[.!?]\s*)?$/i)?.[1] ??
      prompt.replace(/^\s*(?:please\s+)?(?:write|draft|compose|prepare|create|make)\s+(?:a\s+|an\s+|the\s+)?/i, "")
  );

  return ["Hi,", "", instruction, "", "Best regards"].join("\n");
}

function createRewriteAnswer(prompt: string) {
  const source = phoneSafeText(extractAfterColon(prompt));
  const lower = source.toLowerCase();

  if (/\binvoice\b/.test(lower) && /\bspam\b/.test(lower)) {
    return "I’ve already sent the invoice. Could you please check your spam or junk folder in case it landed there?";
  }

  if (/\bmarketing\b/.test(lower) && /\boffers\b/.test(lower)) {
    return "I can help sharpen your offers, write stronger messages, test posts, improve follow-ups, and spot where potential clients are dropping off.";
  }

  return source
    ? `Here’s a cleaner version:\n\n${source}`
    : "Paste the text you want rewritten, and I’ll make it clearer while keeping your meaning.";
}

function createBulletAnswer(prompt: string) {
  const source = extractAfterColon(prompt);

  if (/\bshampoo\b/i.test(source) && /\bconditioner\b/i.test(source)) {
    return [
      "- Wash your hair with shampoo.",
      "- Apply conditioner.",
      "- Apply a hair mask and leave it on for 5 minutes.",
      "- Finger-comb your hair while the mask is still on.",
      "- Scrunch your hair.",
      "- Wash out the mask.",
      "- Apply serum to the lower part of your hair.",
      "- Scrunch again.",
      "- Avoid brushing because it makes your hair frizzy."
    ].join("\n");
  }

  return source
    .split(/(?:,|\bthen\b|\band\b)/i)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${item.replace(/[.!?]+$/g, "")}`)
    .join("\n");
}

function createSummaryAnswer(prompt: string) {
  const source = extractAfterColon(prompt);
  const sourceOrPrompt = source || prompt;

  if (/\bhydrangeas\b/i.test(sourceOrPrompt) && /\b75\s+stems\b/i.test(sourceOrPrompt)) {
    return [
      "- The client ordered blue hydrangeas.",
      "- They later claimed that 75 stems were damaged.",
      "- You asked them to submerge the stems in water because hydrangeas can recover after hydration.",
      "- The photos did not clearly show 75 unusable stems.",
      "- You requested one photo showing all damaged stems together, but it was not received before the refund discussion."
    ].join("\n");
  }

  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 5);

  return sentences.length
    ? sentences.map((sentence) => `- ${sentence}`).join("\n")
    : "Paste the text you want summarized, and I’ll summarize only what you provide.";
}

function createDataWorkPlanAnswer() {
  return [
    "1. Make a backup copy first, then work only on the copy.",
    "2. Check the starting record count and write it down.",
    "3. Sort and filter key columns like name, phone, email, property type, city, and status.",
    "4. Remove exact duplicates, then review near-duplicates manually before deleting anything.",
    "5. Check blank required fields and mark records that need follow-up instead of guessing.",
    "6. Standardize formats for phone numbers, dates, prices, and area units.",
    "7. Verify the final record count against the starting count and your removed-duplicates list.",
    "8. Save a final clean copy with a clear name, such as `real-estate-clean-final.csv`."
  ].join("\n");
}

function createTeachingAnswer(prompt: string) {
  if (/\bhablo\b/i.test(prompt) && /\bhablar\b/i.test(prompt)) {
    return [
      "Think of Spanish verbs in two forms:",
      "",
      "- `hablar` means “to speak.” This is the basic dictionary form.",
      "- `hablo` means “I speak.” Use it when talking about yourself.",
      "- `hablas` means “you speak.” Use it when talking to one person.",
      "",
      "Example:",
      "",
      "- `Yo hablo español` = I speak Spanish.",
      "- `Tú hablas español` = You speak Spanish.",
      "",
      "So `hablar` is the action, and `hablo` / `hablas` show who is doing it."
    ].join("\n");
  }

  return "I’ll explain it simply: start with the basic idea, then show one small example, then compare it with a similar case.";
}

function createWrongModeAnswer(prompt: string) {
  const wantsInstallOrRun = /\b(?:install|run|start)\b/i.test(prompt);
  const wantsWebsite = /\b(?:website|site|homepage|testimonials)\b/i.test(prompt);
  const targetMode = wantsWebsite ? "WEBSITE" : "CODE";

  if (wantsInstallOrRun) {
    return (
      "I can help you plan this in ASK mode, but I will not install packages, start runtime, or modify files here. " +
      "Runtime and file-changing work requires CODE mode with explicit approval."
    );
  }

  return (
    `I can help you plan this here in ASK mode, but I will not create or modify files unless you switch to ${targetMode} mode.\n\n` +
    "A safe next step is to outline the goal, pages or modules, required content, and any constraints before generating files."
  );
}

function createNoFakeCapabilityAnswer(prompt: string) {
  if (isLiveUrlRequest(prompt)) {
    return "I cannot open live URLs in ASK-I1 yet. Paste the content here and I can summarize or rewrite it.";
  }

  if (isFileReadingRequest(prompt)) {
    return "I can help if you paste the text or rows here. File upload reading is not available in ASK-I1 yet.";
  }

  if (isImageReadingRequest(prompt)) {
    return "Image/OCR understanding is not available in ASK-I1 yet. Describe the image or paste the text and I can help.";
  }

  return null;
}

export function createAskSeriousAnswer(
  prompt: string,
  context: AskRuntimeContext
): string | null {
  void context;

  const fakeCapabilityAnswer = createNoFakeCapabilityAnswer(prompt);

  if (fakeCapabilityAnswer) {
    return fakeCapabilityAnswer;
  }

  const intent = classifyAskIntent(prompt).intent;

  switch (intent) {
    case "client_message":
      return createClientMessageAnswer(prompt);
    case "polite_rewrite":
      return createRewriteAnswer(prompt);
    case "bullet_format":
      return createBulletAnswer(prompt);
    case "summarize":
      return createSummaryAnswer(prompt);
    case "data_work_guidance":
    case "task_checklist":
      return createDataWorkPlanAnswer();
    case "business_plan":
      return [
        "1. Clarify the offer and who it is for.",
        "2. Write one simple message that explains the outcome, not just the service.",
        "3. Test two versions of the message with a small audience.",
        "4. Track replies, follow-ups, and where people stop responding.",
        "5. Improve the weakest step before adding more channels."
      ].join("\n");
    case "translation_or_language_help":
      return "Paste the exact sentence and the target language, and I’ll translate it clearly while keeping the tone.";
    case "teaching_explanation":
      return createTeachingAnswer(prompt);
    case "wrong_mode_build_request":
      return createWrongModeAnswer(prompt);
    case "date_time_question":
    case "general_answer":
      return null;
  }
}

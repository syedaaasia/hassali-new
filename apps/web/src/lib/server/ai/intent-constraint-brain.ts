import {
  buildWorkspaceContext,
  type WorkspaceContextInput,
  type WorkspaceProductMode
} from "@/lib/server/ai/workspace-context-engine";

export type IntentTaskType =
  | "ambiguous"
  | "existing_item_edit"
  | "mode_mismatch_signal"
  | "new_creation"
  | "question_or_explanation";

export type IntentCountConstraint = {
  count: number;
  source: string;
  unit: string;
};

export type IntentConstraintInput = {
  message: string;
  priorMessages?: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }>;
  selectedMode: WorkspaceProductMode;
  workspace?: WorkspaceContextInput;
};

export type IntentConstraintResult = {
  ambiguity: string[];
  businessOrDomain: string | null;
  confidence: number;
  contentConstraints: string[];
  countConstraints: IntentCountConstraint[];
  finalModeGuidance: string;
  mutationIntent: boolean;
  replacementIntent: boolean;
  requestedFeaturesOrPages: string[];
  risks: string[];
  selectedMode: WorkspaceProductMode;
  semanticMode: WorkspaceProductMode;
  stackOrFramework: string | null;
  styleConstraints: string[];
  targetIdentity: string | null;
  taskType: IntentTaskType;
};

const NUMBER_WORDS: Record<string, number> = {
  eight: 8,
  five: 5,
  four: 4,
  nine: 9,
  one: 1,
  seven: 7,
  six: 6,
  ten: 10,
  three: 3,
  two: 2
};

const FEATURE_TERMS: Array<[string, RegExp]> = [
  ["home", /\b(?:home|homepage)\b/i],
  ["about", /\babout(?: us)?\b/i],
  ["services", /\bservices?\b/i],
  ["products", /\bproducts?\b/i],
  ["cart", /\bcart\b/i],
  ["contact", /\bcontact\b/i],
  ["dashboard", /\bdashboard\b/i],
  ["billing", /\bbilling\b/i],
  ["graphs", /\b(?:graphs?|charts?)\b/i],
  ["cash in", /\bcash[ -]?in\b/i],
  ["cash out", /\bcash[ -]?out\b/i],
  ["reports", /\breports?\b/i],
  ["payments", /\bpayments?\b/i],
  ["clients", /\bclients?\b/i],
  ["customers", /\bcustomers?\b/i],
  ["bookings", /\bbookings?\b/i],
  ["cleaners", /\bcleaners?\b/i],
  ["job status", /\bjob status\b/i],
  ["filters", /\bfilters?\b/i],
  ["invoices", /\binvoices?\b/i],
  ["income", /\bincome\b/i],
  ["expenses", /\b(?:expenses?|deductions?)\b/i],
  ["remittance", /\bremittance\b/i],
  ["receipts", /\breceipts?\b/i],
  ["inventory", /\binventory\b/i],
  ["stock", /\bstock(?: levels?)?\b/i],
  ["low stock alerts", /\blow stock alerts?\b/i],
  ["sales", /\bsales\b/i],
  ["purchases", /\bpurchases?\b/i],
  ["suppliers", /\bsuppliers?\b/i]
];

const STYLE_TERMS = [
  "accessible",
  "beautiful",
  "calm",
  "clean",
  "colorful",
  "concise",
  "dark",
  "friendly",
  "kid friendly",
  "light",
  "minimal",
  "modern",
  "premium",
  "professional",
  "responsive",
  "simple",
  "warm"
];

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function cleanIdentity(value: string | null | undefined) {
  const cleaned = value
    ?.replace(/\b(?:a|an|the)\b/gi, " ")
    .replace(/\b(?:app|application|website|site|project)\b\s*$/i, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function normalizedIdentity(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b(?:app|application|dashboard|system|software|website|site|project)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identitiesDiffer(left: string | null, right: string | null) {
  const a = normalizedIdentity(left);
  const b = normalizedIdentity(right);
  if (!a || !b || a === b) return false;
  return !a.includes(b) && !b.includes(a);
}

function extractPromptIdentity(message: string) {
  const patterns = [
    /\b(?:[Rr]eplace|[Oo]verwrite|[Ss]tart over with)\s+(?:the\s+)?(?:current\s+|this\s+)?(?:app|application|project)?\s*(?:with\s+)?([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s*(?:,|\.|$))/,
    /\b[Nn]ow\s+(?:build|create|design|make)\s+([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s+(?:here|app|application|website|site|for|with)\b|\s*[,.$])/,
    /\b(?:[Cc]alled|[Nn]amed)\s+([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s+(?:for|with|that|which|as)\b|\s*[,.$])/,
    /\b(?:[Aa]pp|[Aa]pplication|[Ww]ebsite|[Ss]ite)\s+for\s+([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s+(?:for|with|that|which|as)\b|\s*[,.$])/
  ];

  for (const pattern of patterns) {
    const value = cleanIdentity(message.match(pattern)?.[1]);
    if (value) return value;
  }

  return null;
}

function extractCountConstraints(message: string) {
  const constraints: IntentCountConstraint[] = [];
  const explicitCountPattern = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(pages?|products?|screens?|steps?|sections?)\b/gi;
  const pattern = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z][a-z -]{0,24}?)(?=\s*(?:,|\.|and\b|with\b|that\b|which\b|$))/gi;

  for (const match of message.matchAll(explicitCountPattern)) {
    const rawCount = match[1].toLowerCase();
    const count = /^\d+$/.test(rawCount) ? Number(rawCount) : NUMBER_WORDS[rawCount];
    const unit = match[2].toLowerCase();
    if (count) constraints.push({ count, source: match[0].trim(), unit });
  }

  for (const match of message.matchAll(pattern)) {
    const rawCount = match[1].toLowerCase();
    const count = /^\d+$/.test(rawCount) ? Number(rawCount) : NUMBER_WORDS[rawCount];
    const unit = match[2].trim().replace(/\s+/g, " ");
    if (!count || !unit || /^(?:am|pm|minutes?|hours?|days?|weeks?|months?|years?)$/i.test(unit)) continue;
    if (!constraints.some((constraint) => constraint.count === count && constraint.unit === unit)) {
      constraints.push({ count, source: match[0].trim(), unit });
    }
  }

  return constraints;
}

function extractFeatures(message: string, domain: string | null, countConstraints: IntentCountConstraint[]) {
  const features = FEATURE_TERMS.filter(([, pattern]) => pattern.test(message)).map(([feature]) => feature);
  const pageCount = countConstraints.find((constraint) => /pages?/i.test(constraint.unit));
  const commerce = /\b(?:ecommerce|e-commerce|online store|shop|storefront)\b/i.test(message) || /ecommerce/i.test(domain ?? "");

  if (commerce && pageCount && !features.some((feature) => ["home", "products", "cart", "contact"].includes(feature))) {
    features.push("home", "products", "cart", "contact");
  }

  return unique(features);
}

function extractStyleConstraints(message: string) {
  const styles = STYLE_TERMS.filter((term) => new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i").test(message));
  const colorChange = message.match(/\b(?:change|make|update|switch)\b[\s\S]{0,50}\b(?:color|colour|palette|theme)\b(?:\s+to\s+([a-z -]{2,24}))?/i);
  if (colorChange) styles.push(colorChange[0].trim());
  return unique(styles);
}

function extractContentConstraints(message: string) {
  const constraints: string[] = [];
  const exclusionPattern = /\b(?:do not|don't|dont|without|no)\s+([^,.!?]{2,80})/gi;
  const inclusionPattern = /\b(?:must include|include|should include|needs? to include)\s+([^.!?]{2,160})/gi;

  for (const match of message.matchAll(exclusionPattern)) constraints.push(`exclude: ${match[1].trim()}`);
  for (const match of message.matchAll(inclusionPattern)) constraints.push(`include: ${match[1].trim()}`);
  return unique(constraints);
}

function inferBusinessOrDomain(message: string) {
  const lower = message.toLowerCase();
  const commerce = /\b(?:ecommerce|e-commerce|online store|storefront)\b/.test(lower);
  const domainPhrase = message.match(/\b(?:for|about)\s+(?:a|an|the)?\s*([a-z][a-z0-9&' -]{2,70}?)(?=\s+(?:with|that|which|including|having)\b|\s*[,.$])/i)?.[1]
    ?? message.match(/\b((?:inventory|stock|cleaning|tax|finance|accounting|toy|flower|real estate|restaurant|travel|education|healthcare)[a-z0-9&' -]{0,45}?)(?=\s+(?:app|application|dashboard|website|site|system|business|store)\b|\s*[,.$])/i)?.[1];
  const cleaned = cleanIdentity(domainPhrase);

  if (/\btoy shop\b|\btoy store\b/.test(lower)) return commerce ? "toy shop / ecommerce" : "toy shop";
  if (/\binventory management(?: system)?\b/.test(lower)) return "inventory management";
  if (cleaned) return commerce ? `${cleaned} / ecommerce` : cleaned.toLowerCase();
  if (commerce) return "ecommerce";
  return null;
}

function withoutKnownIdentities(message: string, identities: Array<string | null>) {
  return identities.reduce<string>((value, identity) => {
    if (!identity) return value;
    const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return value.replace(new RegExp(escaped, "gi"), " ");
  }, message).replace(/\s+/g, " ").trim();
}

function inferStack(message: string) {
  if (/\b(?:react|vite|tsx)\b/i.test(message)) return /\bvite\b/i.test(message) ? "react_vite" : "react";
  if (/\b(?:next\.js|nextjs|next app)\b/i.test(message)) return "nextjs";
  if (/\b(?:streamlit)\b/i.test(message)) return "streamlit";
  if (/\b(?:python|flask|fastapi|django)\b/i.test(message)) return message.match(/\b(?:flask|fastapi|django)\b/i)?.[0].toLowerCase() ?? "python";
  if (/\b(?:static html|html css js|html\/css\/js)\b/i.test(message)) return "static_html";
  if (/\b(?:node|express|fastify)\b/i.test(message)) return message.match(/\b(?:express|fastify)\b/i)?.[0].toLowerCase() ?? "node";
  return null;
}

function inferSemanticMode(message: string, selectedMode: WorkspaceProductMode, workspaceKind: string) {
  if (/\b(?:explain|what|why|how|summarize|review|advise|should we|what should)\b/i.test(message) && !/\b(?:build|create|design|generate|apply|change|add|update|replace)\b/i.test(message)) {
    return "ASK" as const;
  }
  if (/\b(?:react|vite|python|streamlit|next\.js|nextjs|api|backend|code app|web app|dashboard app|application)\b/i.test(message)) return "CODE" as const;
  if (/\b(?:website|landing page|homepage|ecommerce store|online store|\d+ pages?)\b/i.test(message)) return "WEBSITE" as const;
  if (/\b(?:this app|current app|tab|billing|dashboard)\b/i.test(message) && workspaceKind === "CODE") return "CODE" as const;
  if (/\b(?:hero|page|navigation|header|footer)\b/i.test(message) && workspaceKind === "WEBSITE") return "WEBSITE" as const;
  if (workspaceKind === "CODE" || workspaceKind === "WEBSITE") return workspaceKind;
  return selectedMode;
}

function inferTaskType(message: string, hasUsefulContext: boolean): IntentTaskType {
  const trimmed = message.trim();
  const question = /^(?:what|why|how|when|where|who|can you explain|explain|summarize|review|should|is|are|do|does)\b/i.test(trimmed);
  const create = /\b(?:build|create|design|generate|make me|start over|replace (?:this|the|current) (?:app|site|project))\b/i.test(trimmed);
  const edit = /\b(?:add|change|update|improve|edit|remove|rename|tweak|refine|polish|fix)\b/i.test(trimmed);
  const vague = /^(?:make it better|improve it|fix it|change it|do it|continue)$/i.test(trimmed);

  if (vague && !hasUsefulContext) return "ambiguous";
  if (create) return "new_creation";
  if (edit) return "existing_item_edit";
  if (question) return "question_or_explanation";
  return hasUsefulContext ? "existing_item_edit" : "ambiguous";
}

export function extractIntentConstraints(input: IntentConstraintInput): IntentConstraintResult {
  const message = input.message.trim();
  const workspace = input.workspace ?? {};
  const context = buildWorkspaceContext({ mode: input.selectedMode, workspace });
  const priorUserMessage = [...(input.priorMessages ?? [])].reverse().find((item) => item.role === "user")?.content ?? "";
  const hasUsefulContext = context.fileCount > 0 || Boolean(context.codeAppIdentity || context.websiteIdentity) || priorUserMessage.trim().length > 0;
  const replacementIntent = /\b(?:replace|overwrite|start over|rebuild from scratch)\b/i.test(message);
  const taskType = inferTaskType(message, hasUsefulContext);
  const semanticMode = inferSemanticMode(message, input.selectedMode, context.likelyProjectKind);
  const countConstraints = extractCountConstraints(message);
  const promptIdentity = extractPromptIdentity(message);
  const existingIdentity = context.codeAppIdentity?.appName ?? context.websiteIdentity?.brandName ?? context.websiteIdentity?.appName ?? null;
  const constraintMessage = withoutKnownIdentities(message, [promptIdentity, existingIdentity]);
  const businessOrDomain = inferBusinessOrDomain(constraintMessage);
  const requestedFeaturesOrPages = extractFeatures(constraintMessage, businessOrDomain, countConstraints);
  const targetIdentity = taskType === "new_creation" || replacementIntent
    ? promptIdentity ?? null
    : promptIdentity ?? existingIdentity;
  const mutationIntent = taskType === "new_creation" || taskType === "existing_item_edit" || replacementIntent || /\b(?:apply|write|save|modify|update)\b/i.test(message);
  const ambiguity: string[] = [];
  const risks: string[] = [];

  if (taskType === "ambiguous") ambiguity.push("No specific target or requested change is described, and no usable prior or workspace context is available.");
  if (taskType === "new_creation" && !targetIdentity && !businessOrDomain) ambiguity.push("The requested product or business identity is not clear.");
  if (/\binventory\b/i.test(message) && !/\b(?:phone|mobile|smartphone|retail|warehouse|restaurant|medical|auto|vehicle)\b/i.test(message)) {
    risks.push("Generic inventory language may be conflated with the existing mobile_phone_shop domain elsewhere; this advisory layer does not resolve domainId.");
  }
  if (existingIdentity && targetIdentity && identitiesDiffer(existingIdentity, targetIdentity)) {
    risks.push(replacementIntent
      ? `Explicit replacement requested: existing workspace identity "${existingIdentity}" would be replaced by "${targetIdentity}".`
      : `Identity conflict: existing workspace identity "${existingIdentity}" differs from requested identity "${targetIdentity}".`);
  }
  if (semanticMode !== input.selectedMode) {
    risks.push(`Mode mismatch signal: selected ${input.selectedMode}, while the prompt semantically suggests ${semanticMode}.`);
  }
  if (context.mixedWorkspace) risks.push("The workspace contains both WEBSITE and CODE artifacts; future consumers must use the mode-specific contract.");

  const confidence = taskType === "ambiguous"
    ? 0.35
    : ambiguity.length
      ? 0.62
      : risks.some((risk) => risk.startsWith("Mode mismatch"))
        ? 0.72
        : 0.9;
  const finalModeGuidance = semanticMode === input.selectedMode
    ? `Selected mode ${input.selectedMode} agrees with the prompt's semantic signal. This is advisory only.`
    : `Selected mode ${input.selectedMode} differs from semantic signal ${semanticMode}. A future consumer should confirm the intended mode; this module does not switch or block modes.`;

  return {
    ambiguity,
    businessOrDomain,
    confidence,
    contentConstraints: extractContentConstraints(message),
    countConstraints,
    finalModeGuidance,
    mutationIntent,
    replacementIntent,
    requestedFeaturesOrPages,
    risks,
    selectedMode: input.selectedMode,
    semanticMode,
    stackOrFramework: inferStack(message),
    styleConstraints: extractStyleConstraints(constraintMessage),
    targetIdentity,
    taskType
  };
}

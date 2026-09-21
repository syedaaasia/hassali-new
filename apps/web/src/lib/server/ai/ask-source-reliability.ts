import type { AskRuntimeContext } from "./ask-context";
import { classifyAskIntent } from "./ask-serious-assistant";
import { isSourceExistenceRequest, isTimelessReasoningRequest } from "./ask-epistemic-foundation";

export type AskFreshnessClass =
  | "current_state"
  | "high_stakes_current"
  | "live_event"
  | "private_file_source"
  | "recently_changeable"
  | "slow_changing"
  | "timeless"
  | "unknown"
  | "user_provided_source";

export type AskSourceRequirement =
  | "live_source_required"
  | "multi_source_verification_required"
  | "none_required"
  | "official_source_required"
  | "optional_support"
  | "private_file_required"
  | "user_source_required";

export type AskResearchOutcomeStatus =
  | "INSUFFICIENT_FRESHNESS"
  | "PARTIALLY_VERIFIED"
  | "RETRIEVAL_FAILED"
  | "SOURCE_CONFLICT"
  | "SOURCE_UNAVAILABLE"
  | "USER_SOURCE_UNREADABLE"
  | "VERIFIED";

export type AskFreshnessDecision = {
  confidence: number;
  currentDateRequired: boolean;
  directAnswerAllowed: boolean;
  freshnessClass: AskFreshnessClass;
  highStakesDomain: boolean;
  jurisdiction: string | null;
  preferredSourceTypes: string[];
  reasons: string[];
  recencyRequirement?: string;
  referencedUrl: string | null;
  researchPreferred: boolean;
  researchProhibited: boolean;
  researchQuery: string | null;
  researchRequired: boolean;
  sourceRequirement: AskSourceRequirement;
  timezoneRequired: boolean;
};

export type AskNormalizedTimeContext = {
  currentDateUsed: boolean;
  relativeExpression: string | null;
  resolvedEndDate: string | null;
  resolvedStartDate: string | null;
  runtimeDate: string;
  timezone: string;
  timezoneConfidence: "runtime" | "user_supplied";
};

export type AskResearchSource = {
  author?: string | null;
  canonicalUrl?: string | null;
  claimScope?: string | null;
  claimValue?: string | null;
  content: string;
  effectiveDate?: string | null;
  eventDate?: string | null;
  id: string;
  isOfficial: boolean;
  publishedAt?: string | null;
  publisher?: string | null;
  retrievedAt: string;
  sourceType: "government" | "official" | "primary" | "private_file" | "secondary" | "user_source";
  title: string;
  trustBoundary?: "private_user_content" | "untrusted_public_web";
  updatedAt?: string | null;
  url: string | null;
  version?: string | null;
};

export type GroundedClaim = {
  claim: string;
  evidenceRelationship?: "SUPPORTED" | "CONTRADICTED" | "UNKNOWN";
  contradictingSourceIds?: string[];
  freshnessSatisfied: boolean;
  isInference: boolean;
  supportingSourceIds: string[];
  supportStrength: "direct" | "inference" | "partial";
  verificationStatus: AskResearchOutcomeStatus;
};

export type AskSourceReliabilityReport = {
  answer: string;
  citationCount: number;
  directQuoteIntegrity: boolean;
  groundedClaims: GroundedClaim[];
  officialSourceCount: number;
  outcome: AskResearchOutcomeStatus;
  recencySatisfied: boolean;
  researchAttempted: boolean;
  researchCompleted: boolean;
  sourceConflict: boolean;
  sourceCount: number;
  sources: AskResearchSource[];
  unknownCitations: string[];
  unsupportedClaimCount: number;
};

const conceptCurrentPattern = /\b(?:electric current|alternating current|direct current|current directory|current branch|current user|current record|current row)\b/i;
const conceptualLatestPattern = /\b(?:select|query|get|fetch|find|order by)\b[\s\S]{0,80}\b(?:latest|newest|most recent)\s+(?:database\s+)?row\b/i;
const historicalPattern = /\b(?:in|during|as of|around)\s+(?:the\s+)?(?:1[0-9]{3}|20(?:0[0-9]|1[0-9]|2[0-5]))\b|\b(?:historical|history of|was considered)\b/i;
const relativeDatePattern = /\b(?:today|yesterday|tomorrow|this morning|this weekend|this week|last week|recently|now|right now|currently)\b/i;
const noBrowsePattern = /\b(?:do not|don't|without|no)\s+(?:browse|browsing|search|searching|look(?:ing)? online|web search)\b/i;
const privateFilePattern = /\b(?:uploaded|attached|private)\s+(?:contract|document|file|pdf|spreadsheet|report)|\b(?:the|my)\s+uploaded\b/i;
const linkedSourcePattern = /\b(?:this|the)\s+(?:linked|web)\s+(?:report|page|paper|source|article)|\baccording to this\s+(?:paper|report|page|source)\b/i;
const currentRolePattern = /\b(?:current|currently|right now)\b[\s\S]{0,45}\b(?:ceo|chief executive|president|prime minister|minister|governor|chair(?:person|man|woman)?|officeholder|holds? (?:the )?role)\b|\bwho\s+(?:currently\s+)?(?:is|holds)\b[\s\S]{0,45}\b(?:ceo|chief executive|president|prime minister|minister|governor|chair(?:person|man|woman)?|role|office)\b/i;
const currentValuePattern = /\b(?:current|latest|today'?s|right now|real[- ]time)\s+(?:price|value|rate|exchange rate|stock price|crypto price|schedule|availability)\b/i;
const currentRankingPattern = /\b(?:current(?:ly)?|latest|today|right now)\b[\s\S]{0,60}\b(?:richest|largest|highest|most valuable|top-ranked|leading)\b/i;
const versionPattern = /\b(?:latest|newest|current|stable|recommended)\b[\s\S]{0,70}\b(?:version|release|sdk|api|framework|library|next\.?js|react|node(?:\.js)?|typescript)\b|\bwhat changed\b[\s\S]{0,60}\b(?:latest|newest|current)\b/i;
const liveEventPattern = /\b(?:what happened|latest situation|latest news|headlines?|who won|match result|score|live event|weather|forecast)\b/i;
const weatherPattern = /\b(?:weather|temperature|forecast|rain|humidity|wind speed)\b/i;
const highStakesPattern = /\b(?:law(?!\s+firms?\b)|laws|legal|compliance|regulation|regulatory|statute|medical|medicine|drug|treatment|financial|finance|investment|tax|safety|recall)\b/i;
const currentStatusPattern = /\b(?:still (?:active|valid|in force|recommended|safe)|currently|current status|as of today|right now|latest)\b/i;
const highStakesDecisionPattern = /\b(?:is it safe|is this safe|should i|can i|dosage|dose|side effects?|contraindications?|legal requirement|compliant|invest|buy|sell|tax rate|recall status)\b/i;
const slowChangingPattern = /\b(?:oauth|postgres(?:ql)?|indexing strateg(?:y|ies)|dependency injection)\b/i;

function extractJurisdiction(prompt: string) {
  const explicit = prompt.match(/\b(?:in|under|for)\s+(Pakistan|India|United States|USA|US|United Kingdom|UK|European Union|EU|Canada|Australia|UAE|Saudi Arabia)\b/i)?.[1];
  if (!explicit) return null;
  const aliases: Record<string, string> = {
    eu: "European Union",
    uk: "United Kingdom",
    us: "United States",
    usa: "United States"
  };
  return aliases[explicit.toLowerCase()] ?? explicit;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractUrl(prompt: string) {
  return prompt.match(/https?:\/\/[^\s)>\]}]+/i)?.[0]?.replace(/[.,;!?]+$/, "") ?? null;
}

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric"
  }).formatToParts(date);
  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    year: Number(parts.find((part) => part.type === "year")?.value ?? 1970)
  };
}

function calendarDate(date: Date, timezone: string, offsetDays = 0) {
  const parts = dateParts(date, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays, 12, 0, 0))
    .toISOString()
    .slice(0, 10);
}

function explicitTimezone(prompt: string, fallback: string) {
  const match = prompt.match(/\b(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/i);
  const alias = [
    ["new york", "America/New_York"],
    ["amsterdam", "Europe/Amsterdam"],
    ["bangkok", "Asia/Bangkok"],
    ["dubai", "Asia/Dubai"],
    ["karachi", "Asia/Karachi"],
    ["pakistan", "Asia/Karachi"],
    ["london", "Europe/London"]
  ].find(([label]) => new RegExp(`\\b${label}\\b`, "i").test(prompt));
  const requestedTimezone = match?.[0] ?? alias?.[1];
  if (!requestedTimezone) return { confidence: "runtime" as const, timezone: fallback };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: requestedTimezone }).format(new Date());
    return { confidence: "user_supplied" as const, timezone: requestedTimezone };
  } catch {
    return { confidence: "runtime" as const, timezone: fallback };
  }
}

export function normalizeAskTimeContext(
  prompt: string,
  runtime: Pick<AskRuntimeContext, "currentIsoDatetime" | "serverTimezone">
): AskNormalizedTimeContext {
  const now = new Date(runtime.currentIsoDatetime);
  const timezoneResult = explicitTimezone(prompt, runtime.serverTimezone);
  const normalized = normalize(prompt);
  const relativeExpression = normalized.match(relativeDatePattern)?.[0] ?? null;
  let startOffset = 0;
  let endOffset = 0;
  const currentParts = dateParts(now, timezoneResult.timezone);
  const currentWeekday = new Date(Date.UTC(currentParts.year, currentParts.month - 1, currentParts.day, 12, 0, 0)).getUTCDay();
  const thisWeekStartOffset = currentWeekday === 0 ? -6 : 1 - currentWeekday;

  if (relativeExpression === "yesterday") startOffset = endOffset = -1;
  else if (relativeExpression === "tomorrow") startOffset = endOffset = 1;
  else if (relativeExpression === "this weekend") {
    if (currentWeekday === 0) {
      startOffset = -1;
      endOffset = 0;
    } else {
      startOffset = (6 - currentWeekday + 7) % 7;
      endOffset = startOffset + 1;
    }
  } else if (relativeExpression === "last week") {
    startOffset = thisWeekStartOffset - 7;
    endOffset = thisWeekStartOffset - 1;
  } else if (relativeExpression === "this week") {
    startOffset = thisWeekStartOffset;
  } else if (relativeExpression === "recently") {
    startOffset = -7;
  }

  return {
    currentDateUsed: Boolean(relativeExpression),
    relativeExpression,
    resolvedEndDate: relativeExpression ? calendarDate(now, timezoneResult.timezone, endOffset) : null,
    resolvedStartDate: relativeExpression ? calendarDate(now, timezoneResult.timezone, startOffset) : null,
    runtimeDate: calendarDate(now, timezoneResult.timezone),
    timezone: timezoneResult.timezone,
    timezoneConfidence: timezoneResult.confidence
  };
}

function searchQuery(prompt: string, freshnessClass: AskFreshnessClass, time: AskNormalizedTimeContext) {
  const clean = prompt
    .replace(noBrowsePattern, "")
    .replace(/\b(?:please|can you|could you|tell me)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?!.]+$/, "");
  const date = time.relativeExpression ? ` ${time.resolvedStartDate ?? time.runtimeDate}` : "";
  const official = freshnessClass === "recently_changeable" || freshnessClass === "high_stakes_current" || freshnessClass === "current_state"
    ? " official"
    : "";
  return `${clean}${date}${official}`.trim();
}

export function decideAskFreshness(input: {
  hasPrivateFileContent?: boolean;
  prompt: string;
  runtime: Pick<AskRuntimeContext, "currentIsoDatetime" | "serverTimezone">;
}): AskFreshnessDecision {
  const prompt = input.prompt.trim();
  const intent = classifyAskIntent(prompt);
  const time = normalizeAskTimeContext(prompt, input.runtime);
  const referencedUrl = extractUrl(prompt);
  const jurisdiction = extractJurisdiction(prompt);
  const researchProhibited = noBrowsePattern.test(prompt);
  const privateFileRequested = privateFilePattern.test(prompt);
  const userSourceRequested = Boolean(referencedUrl) || linkedSourcePattern.test(prompt);
  const conceptException = conceptCurrentPattern.test(prompt) || conceptualLatestPattern.test(prompt) || historicalPattern.test(prompt) || isTimelessReasoningRequest(prompt);
  const sourceExistenceRequest = isSourceExistenceRequest(prompt);
  const currentDateUtility = intent.intent === "date_time_question";
  const safetyRefusal = intent.intent === "auth_or_security_guidance" &&
    /\b(?:steal|exfiltrate|dump|harvest)\b[\s\S]{0,80}\b(?:passwords?|credentials?|cookies?|tokens?|sessions?)\b/i.test(prompt);
  const highStakesCurrent = highStakesPattern.test(prompt) &&
    (currentStatusPattern.test(prompt) || highStakesDecisionPattern.test(prompt)) &&
    !historicalPattern.test(prompt);
  let freshnessClass: AskFreshnessClass = "timeless";
  let sourceRequirement: AskSourceRequirement = "none_required";
  let researchRequired = false;
  let researchPreferred = false;
  let directAnswerAllowed = true;
  const confidence = 0.86;
  const reasons: string[] = [];
  let preferredSourceTypes: string[] = [];
  let recencyRequirement: string | undefined;

  if (privateFileRequested) {
    freshnessClass = "private_file_source";
    sourceRequirement = "private_file_required";
    researchRequired = !input.hasPrivateFileContent;
    directAnswerAllowed = Boolean(input.hasPrivateFileContent);
    preferredSourceTypes = ["selected private file"];
    reasons.push(input.hasPrivateFileContent ? "The requested private file text is present in bounded context." : "The request depends on private file text that is not available.");
  } else if (sourceExistenceRequest && !userSourceRequested) {
    freshnessClass = "unknown";
    sourceRequirement = "multi_source_verification_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["publisher or academic index", "independent scholarly source"];
    reasons.push("The request asserts a named publication whose existence must be verified before its findings can be summarized.");
  } else if (userSourceRequested) {
    freshnessClass = "user_provided_source";
    sourceRequirement = "user_source_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["the user-referenced source"];
    reasons.push("The answer must come from the referenced source rather than model memory.");
  } else if (safetyRefusal) {
    freshnessClass = "timeless";
    sourceRequirement = "none_required";
    directAnswerAllowed = true;
    reasons.push("The existing safety refusal is authoritative and must not trigger external research.");
  } else if (currentDateUtility) {
    freshnessClass = "current_state";
    sourceRequirement = "none_required";
    directAnswerAllowed = true;
    preferredSourceTypes = ["server runtime clock"];
    reasons.push("The request is a date/time utility resolved from the injected runtime clock.");
  } else if (conceptException) {
    freshnessClass = "timeless";
    sourceRequirement = "none_required";
    directAnswerAllowed = true;
    reasons.push("Freshness wording describes a concept or historical frame, not the present state.");
  } else if (!conceptException && highStakesCurrent) {
    freshnessClass = "high_stakes_current";
    sourceRequirement = "official_source_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["official government or regulator source", "primary authoritative source"];
    recencyRequirement = "current effective status or an authoritative update within 180 days";
    reasons.push("The answer requests current high-stakes legal, medical, financial, regulatory, or safety status.");
  } else if (!conceptException && weatherPattern.test(prompt)) {
    freshnessClass = "current_state";
    sourceRequirement = "live_source_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["live weather data provider"];
    recencyRequirement = "observation or forecast for the resolved date";
    reasons.push("Weather depends on current observations or a dated forecast.");
  } else if (!conceptException && liveEventPattern.test(prompt) && relativeDatePattern.test(prompt)) {
    freshnessClass = "live_event";
    sourceRequirement = "multi_source_verification_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["current primary statement", "reputable independent report"];
    recencyRequirement = "event-date evidence within 3 days";
    reasons.push("The requested event depends on a resolved current or relative date.");
  } else if (!conceptException && (currentRolePattern.test(prompt) || currentValuePattern.test(prompt) || currentRankingPattern.test(prompt))) {
    freshnessClass = "current_state";
    sourceRequirement = "official_source_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["official organization source", "current filing or announcement"];
    recencyRequirement = "explicit current-status evidence within 180 days";
    reasons.push("The requested role or value is volatile and must be discovered without assuming a remembered answer.");
  } else if (!conceptException && versionPattern.test(prompt)) {
    freshnessClass = "recently_changeable";
    sourceRequirement = "official_source_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["official documentation", "official release notes", "official repository"];
    recencyRequirement = "official version or release evidence within 365 days";
    reasons.push("The requested software version or recent change can become stale.");
  } else if (!conceptException && liveEventPattern.test(prompt)) {
    freshnessClass = "live_event";
    sourceRequirement = "multi_source_verification_required";
    researchRequired = true;
    directAnswerAllowed = false;
    preferredSourceTypes = ["current primary statement", "reputable independent report"];
    recencyRequirement = "current event evidence within 3 days";
    reasons.push("The answer depends on a live or developing event.");
  } else if (slowChangingPattern.test(prompt) || intent.intent === "explanation_or_teaching") {
    freshnessClass = slowChangingPattern.test(prompt) ? "slow_changing" : "timeless";
    sourceRequirement = "none_required";
    researchPreferred = /\b(?:exact|documentation|specification|standard)\b/i.test(prompt);
    preferredSourceTypes = researchPreferred ? ["official documentation or standard"] : [];
    reasons.push(conceptException ? "Freshness words describe a concept or historical frame, not the present state." : "The request is a stable explanatory question.");
  } else {
    freshnessClass = "timeless";
    sourceRequirement = "none_required";
    reasons.push("No current-state, source-bound, or volatile target was detected.");
  }

  if (researchProhibited && researchRequired) {
    directAnswerAllowed = false;
    reasons.push("The user prohibited browsing, so current verification must fail closed.");
  }
  const currentDateRequired = currentDateUtility || Boolean(time.relativeExpression) || [
    "current_state",
    "high_stakes_current",
    "live_event",
    "recently_changeable"
  ].includes(freshnessClass);

  return {
    confidence,
    currentDateRequired,
    directAnswerAllowed,
    freshnessClass,
    highStakesDomain: highStakesCurrent,
    jurisdiction,
    preferredSourceTypes,
    reasons,
    recencyRequirement,
    referencedUrl,
    researchPreferred,
    researchProhibited,
    researchQuery: researchRequired && !(sourceRequirement === "user_source_required" && !referencedUrl)
      ? searchQuery(prompt, freshnessClass, time)
      : null,
    researchRequired,
    sourceRequirement,
    timezoneRequired: Boolean(time.relativeExpression)
  };
}

function sourceDate(source: AskResearchSource) {
  return source.effectiveDate ?? source.eventDate ?? source.updatedAt ?? source.publishedAt ?? null;
}

function ageInDays(source: AskResearchSource, time: AskNormalizedTimeContext) {
  const value = sourceDate(source);
  if (!value) return null;
  const timestamp = Date.parse(value);
  const runtime = Date.parse(`${time.runtimeDate}T12:00:00.000Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(runtime)) return null;
  const delta = runtime - timestamp;
  if (delta < -86_400_000) return null;
  return Math.max(0, Math.floor(delta / 86_400_000));
}

function sourceRecencySatisfied(source: AskResearchSource, decision: AskFreshnessDecision, time: AskNormalizedTimeContext) {
  if (decision.sourceRequirement === "none_required" || decision.freshnessClass === "private_file_source" || decision.freshnessClass === "user_provided_source") return true;
  const age = ageInDays(source, time);
  if (decision.freshnessClass === "live_event") return age !== null && age <= 3;
  if (decision.freshnessClass === "high_stakes_current" || decision.freshnessClass === "current_state") return age !== null && age <= 180;
  if (decision.freshnessClass === "recently_changeable") return age !== null && age <= 365;
  return age !== null;
}

function sourceScore(source: AskResearchSource, decision: AskFreshnessDecision, time: AskNormalizedTimeContext) {
  let score = source.isOfficial ? 45 : source.sourceType === "primary" ? 32 : 15;
  if (sourceRecencySatisfied(source, decision, time)) score += 30;
  if (source.content.trim()) score += 15;
  if (source.url && decision.referencedUrl && source.url === decision.referencedUrl) score += 50;
  if (source.version) score += 5;
  return score;
}

export function rankAskResearchSources(
  sources: AskResearchSource[],
  decision: AskFreshnessDecision,
  time: AskNormalizedTimeContext
) {
  const unique = new Map<string, AskResearchSource>();
  sources.forEach((source) => {
    const key = normalizedUrl(source.url) ?? `${source.sourceType}:${source.id}`;
    const existing = unique.get(key);
    if (!existing || sourceScore(source, decision, time) > sourceScore(existing, decision, time)) {
      unique.set(key, source);
    }
  });
  return [...unique.values()].sort((left, right) => sourceScore(right, decision, time) - sourceScore(left, decision, time));
}

function words(value: string) {
  return new Set(normalize(value).replace(/[^a-z0-9.]+/g, " ").split(" ").filter((word) => word.length > 3));
}

function overlapStrength(claim: string, source: AskResearchSource) {
  const claimWords = words(claim);
  const sourceWords = words(`${source.title} ${source.content}`);
  if (!claimWords.size) return 0;
  const overlap = [...claimWords].filter((word) => sourceWords.has(word)).length;
  return overlap / claimWords.size;
}

function proposition(value: string) {
  const text = value.toLowerCase().replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\b(?:doesn't|don't|didn't|isn't|aren't|wasn't|weren't|cannot|can't|won't)\b/g, "not")
    .replace(/^(?:the\s+)?(?:report|source|document)\s+(?:says|states|reports)\s+(?:that\s+)?/, "")
    .replace(/\s+according to\s+(?:the\s+)?(?:current\s+)?(?:release\s+)?(?:report|source|document)\.?$/, "");
  const negative = /\b(?:not|never|no|without|neither)\b/.test(text);
  const uncertain = /\b(?:may|might|could|possibly|perhaps|reportedly|allegedly|if|unless)\b/.test(text);
  const tokens = (text.match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) ?? [])
    .filter((token) => !/^(?:a|an|the|is|are|was|were|be|been|does|do|did|not|never|no|without|neither|that|it|on|of)$/.test(token))
    .map((token) => token.replace(/^(supports|supported)$/, "support").replace(/^(requires|required)$/, "require"));
  return { negative, tokens, uncertain };
}

export function classifyAskClaimEvidence(claim: string, content: string): "SUPPORTED" | "CONTRADICTED" | "UNKNOWN" {
  const clauses = claim.split(/,\s+(?=(?:published|released|updated|effective)\b)/i);
  if (clauses.length > 1) {
    const relations = clauses.map((clause) => classifyAskClaimEvidence(clause, content));
    return relations.includes("CONTRADICTED") ? "CONTRADICTED" : relations.every((relation) => relation === "SUPPORTED") ? "SUPPORTED" : "UNKNOWN";
  }
  const target = proposition(claim);
  if (!target.tokens.length) return "UNKNOWN";
  // Retrieval relevance is not entailment. Only aligned propositions establish
  // support here; unfamiliar paraphrases remain unknown rather than verified.
  const passages = content.slice(0, 40_000).split(/(?<=[!?])\s+|(?<=[.])\s+(?=[A-Z])|\n+/).filter(Boolean);
  let supported = false;
  for (const passage of passages) {
    const evidence = proposition(passage);
    const targetText = target.tokens.join(" ");
    const evidenceText = evidence.tokens.join(" ");
    const aligned = ` ${evidenceText} `.includes(` ${targetText} `);
    if (!aligned) continue;
    if (target.negative !== evidence.negative) return "CONTRADICTED";
    if (!evidence.uncertain || target.uncertain) supported = true;
  }
  return supported ? "SUPPORTED" : "UNKNOWN";
}

function currentClaims(answer: string, decision: AskFreshnessDecision) {
  if (decision.sourceRequirement === "none_required") return [];
  const evidenceAnswer = decision.freshnessClass === "private_file_source" && answer.includes("Key points:")
    ? answer.slice(answer.indexOf("Key points:") + "Key points:".length)
    : answer;
  return evidenceAnswer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 5 && !/^(?:sources?|key points):?$/i.test(claim))
    .slice(0, 12);
}

function markdownCitations(answer: string) {
  return Array.from(answer.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => ({
    full: match[0],
    title: match[1],
    url: match[2]
  }));
}

function unsupportedCitationMarkers(answer: string) {
  return Array.from(answer.matchAll(/\[(?:source[-_ ]?)?(\d+)\]/gi)).map((match) => match[0]);
}

function directQuotes(answer: string) {
  return Array.from(answer.matchAll(/["\u201c]([^"\u201d]{18,})["\u201d]/g)).map((match) => match[1].trim());
}

function quoteText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/$/, "");
  }
}

function removeUnknownCitations(answer: string, unknown: string[]) {
  let next = answer;
  unknown.forEach((citation) => {
    next = next.replace(citation, citation.startsWith("[") && citation.includes("](")
      ? citation.match(/^\[([^\]]+)\]/)?.[1] ?? ""
      : "");
  });
  return next.replace(/\s+([,.;:!?])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

function sourceList(answer: string, sources: AskResearchSource[]) {
  const linkable = sources.filter((source) => source.url).slice(0, 4);
  if (!linkable.length) return answer;
  const existing = new Set(markdownCitations(answer).map((citation) => normalizedUrl(citation.url)));
  const missing = linkable.filter((source) => !existing.has(normalizedUrl(source.url)));
  if (!missing.length) return answer;
  return `${answer.trim()}\n\nSources:\n${missing.map((source) => `- [${source.title}](${source.url})`).join("\n")}`;
}

function conflictingClaimGroups(sources: AskResearchSource[]) {
  const scoped = new Map<string, Set<string>>();
  const unscoped = new Set<string>();

  for (const source of sources) {
    const value = source.claimValue?.trim();
    if (!value) continue;
    const scope = source.claimScope?.trim();
    if (!scope) {
      unscoped.add(value);
      continue;
    }
    const values = scoped.get(scope) ?? new Set<string>();
    values.add(value);
    scoped.set(scope, values);
  }

  const comparableValues = (scope: string, values: Set<string>) => {
    if (!scope.startsWith("version:")) return values;
    const fullVersions = [...values].filter((value) => /^v?\d+\.\d+\.\d+(?:\b|[-+])/i.test(value));
    return fullVersions.length > 0 ? new Set(fullVersions) : values;
  };
  const conflictingScopes = new Set([...scoped.entries()]
    .filter(([scope, values]) => comparableValues(scope, values).size > 1)
    .map(([scope]) => scope));

  return {
    hasConflict: unscoped.size > 1 || conflictingScopes.size > 0,
    scopes: conflictingScopes,
    unscopedConflict: unscoped.size > 1
  };
}

function evidenceLimitation(
  decision: AskFreshnessDecision,
  outcome: AskResearchOutcomeStatus,
  time: AskNormalizedTimeContext,
  sourceCount: number
) {
  if (outcome === "SOURCE_CONFLICT") {
    return `Sources conflict on a material current claim as of ${time.runtimeDate}; the different values are shown instead of being silently merged.`;
  }
  if (outcome === "INSUFFICIENT_FRESHNESS") {
    return `The available evidence is older than the requested freshness window, so it is background rather than a verified current answer as of ${time.runtimeDate}.`;
  }
  if (outcome === "PARTIALLY_VERIFIED") {
    if (decision.sourceRequirement === "official_source_required") {
      return `The answer is supported by ${sourceCount} accessible source${sourceCount === 1 ? "" : "s"}, but some details were only partially corroborated as of ${time.runtimeDate}.`;
    }
    if (decision.sourceRequirement === "multi_source_verification_required") {
      return `The answer has useful current evidence, but fewer than two independent fresh sources were available as of ${time.runtimeDate}.`;
    }
    return `Some claims are supported by accessible evidence as of ${time.runtimeDate}; unsupported details were omitted.`;
  }
  return `Live evidence was not available to complete this current request as of ${time.runtimeDate}.`;
}

function conflictingEvidenceAnswer(
  sources: AskResearchSource[],
  decision: AskFreshnessDecision,
  time: AskNormalizedTimeContext,
  safeAnswer = ""
) {
  const conflictGroups = conflictingClaimGroups(sources);
  const conflicts = sources
    .filter((source) => source.claimValue?.trim() && (
      (conflictGroups.unscopedConflict && !source.claimScope?.trim()) ||
      Boolean(source.claimScope && conflictGroups.scopes.has(source.claimScope))
    ))
    .slice(0, 4)
    .map((source) => `- ${source.title}: ${source.claimValue}`);
  const body = conflicts.length
    ? conflicts.join("\n")
    : "The retained sources disagree, but they do not expose comparable machine-readable values.";
  const versionOnly = sources
    .filter((source) => source.claimValue?.trim())
    .every((source) => source.claimScope?.startsWith("version:"));
  if (versionOnly && safeAnswer.trim()) {
    return sourceList([
      "Current release sources expose different version values. They may represent separate release channels or publication lag, so both the qualified synthesis and compared values are shown.",
      "",
      safeAnswer.trim(),
      "",
      "Compared source values:",
      body
    ].join("\n"), sources);
  }
  return sourceList([
    evidenceLimitation(decision, "SOURCE_CONFLICT", time, sources.length),
    "",
    body
  ].join("\n"), sources);
}

function qualifiedEvidenceAnswer(input: {
  decision: AskFreshnessDecision;
  groundedClaims: GroundedClaim[];
  outcome: AskResearchOutcomeStatus;
  safeAnswer: string;
  sources: AskResearchSource[];
  time: AskNormalizedTimeContext;
}) {
  if (input.outcome === "SOURCE_CONFLICT") {
    const contradictionIds = new Set(input.groundedClaims.flatMap((claim) => claim.contradictingSourceIds ?? []));
    if (contradictionIds.size) {
      const relevant = input.sources.filter((source) => contradictionIds.has(source.id));
      return sourceList([
        "The retrieved evidence contradicts the proposed answer, so I cannot present that answer as verified. Retained source excerpts:",
        ...relevant.slice(0, 3).map((source) => `- ${source.title}: ${source.content.slice(0, 700)}`)
      ].join("\n\n"), relevant);
    }
    return conflictingEvidenceAnswer(input.sources, input.decision, input.time, input.safeAnswer);
  }

  const supportedClaims = input.groundedClaims
    .filter((claim) =>
      claim.supportingSourceIds.length > 0 &&
      claim.freshnessSatisfied &&
      directQuotes(claim.claim).every((quote) =>
        input.sources.some((source) => quoteText(source.content).includes(quoteText(quote)))
      )
    )
    .map((claim) => removeUnknownCitations(claim.claim, unsupportedCitationMarkers(claim.claim)))
    .filter((claim, index, claims) => claims.indexOf(claim) === index)
    .slice(0, 8);
  const supportIds = new Set(input.groundedClaims
    .filter((claim) => claim.supportingSourceIds.length > 0 && claim.freshnessSatisfied)
    .flatMap((claim) => claim.supportingSourceIds));
  const supportingSources = input.sources.filter((source) =>
    supportIds.has(source.id) && sourceRecencySatisfied(source, input.decision, input.time)
  );

  if (supportedClaims.length > 0) {
    return sourceList([
      evidenceLimitation(input.decision, input.outcome, input.time, supportingSources.length),
      "",
      ...supportedClaims.map((claim) => `- ${claim}`)
    ].join("\n"), supportingSources);
  }

  if (input.outcome === "INSUFFICIENT_FRESHNESS" && input.safeAnswer.trim()) {
    const olderEvidence = input.sources.slice(0, 4).map((source) => {
      const date = source.effectiveDate ?? source.eventDate ?? source.updatedAt ?? source.publishedAt;
      const details = [date ? `dated ${date}` : null, source.version ? `version ${source.version}` : null]
        .filter(Boolean)
        .join(", ");
      return `- ${source.title}${details ? ` (${details})` : ""}`;
    });
    return sourceList([
      evidenceLimitation(input.decision, input.outcome, input.time, input.sources.length),
      "",
      ...olderEvidence
    ].join("\n"), input.sources);
  }

  if (input.sources.length && input.outcome === "PARTIALLY_VERIFIED") {
    return sourceList([
      "I retrieved source material, but it does not establish the proposed answer. These are source excerpts, not a verified conclusion:",
      ...input.sources.slice(0, 3).map((source) => `- ${source.title}: ${source.content.slice(0, 700)}`)
    ].join("\n\n"), input.sources);
  }
  return createAskResearchFailureAnswer({
    decision: input.decision,
    outcome: input.outcome,
    time: input.time
  });
}

export function createAskResearchFailureAnswer(input: {
  decision: AskFreshnessDecision;
  outcome: AskResearchOutcomeStatus;
  time: AskNormalizedTimeContext;
}) {
  if (input.decision.researchProhibited) {
    return `You asked me not to search, so I cannot verify the current answer as of ${input.time.runtimeDate}. I can explain stable background, but it may be outdated.`;
  }
  if (input.decision.freshnessClass === "private_file_source") {
    return "I cannot verify that from the uploaded file because its extracted text is not available in the current ASK context. Paste the relevant text or provide an extracted text version.";
  }
  if (input.decision.freshnessClass === "user_provided_source") {
    return "I could not retrieve and read the referenced source, so I cannot summarize it from memory. Paste the source text or retry when source retrieval is available.";
  }
  if (input.outcome === "SOURCE_CONFLICT") {
    return `Current sources conflict, so I cannot present one answer as verified as of ${input.time.runtimeDate}. The disagreement needs to be resolved against a newer authoritative source.`;
  }
  if (input.outcome === "INSUFFICIENT_FRESHNESS") {
    return `I found source material, but it is not fresh enough to verify the current answer as of ${input.time.runtimeDate}. I will not label a remembered or stale result as latest.`;
  }
  return `Live evidence was unavailable for this request as of ${input.time.runtimeDate}, so I will not guess at current facts. I can still explain stable background, or you can retry the live check.`;
}

export function verifyAskSourceReliability(input: {
  answer: string;
  decision: AskFreshnessDecision;
  researchAttempted: boolean;
  sources: AskResearchSource[];
  time: AskNormalizedTimeContext;
}): AskSourceReliabilityReport {
  const sources = rankAskResearchSources(input.sources, input.decision, input.time);
  const officialSourceCount = sources.filter((source) => source.isOfficial).length;
  const freshSources = sources.filter((source) => sourceRecencySatisfied(source, input.decision, input.time));
  const freshOfficialSourceCount = freshSources.filter((source) => source.isOfficial).length;
  let sourceConflict = conflictingClaimGroups(sources).hasConflict;
  const knownUrls = new Set(sources.map((source) => normalizedUrl(source.url)).filter(Boolean));
  const unknownMarkdown = markdownCitations(input.answer)
    .filter((citation) => !knownUrls.has(normalizedUrl(citation.url)))
    .map((citation) => citation.full);
  const evidenceRequired = input.decision.researchRequired || !["none_required", "optional_support"].includes(input.decision.sourceRequirement);
  const unknownMarkers = evidenceRequired ? unsupportedCitationMarkers(input.answer) : [];
  const unknownCitations = [...unknownMarkdown, ...unknownMarkers];
  const quotes = directQuotes(input.answer);
  const directQuoteIntegrity = quotes.every((quote) =>
    sources.some((source) => quoteText(source.content).includes(quoteText(quote)))
  );
  const officialRequired = input.decision.sourceRequirement === "official_source_required";
  const multipleRequired = input.decision.sourceRequirement === "multi_source_verification_required";
  const requestedSourceRetrieved = input.decision.sourceRequirement !== "user_source_required" || Boolean(
    input.decision.referencedUrl && sources.some((source) => normalizedUrl(source.url) === normalizedUrl(input.decision.referencedUrl))
  );
  const privateSourceRetrieved = input.decision.sourceRequirement !== "private_file_required" || sources.some((source) => source.sourceType === "private_file");
  const recencySatisfied = !evidenceRequired || freshSources.length > 0;
  let outcome: AskResearchOutcomeStatus = "VERIFIED";

  if (sourceConflict) outcome = "SOURCE_CONFLICT";
  else if (evidenceRequired && !privateSourceRetrieved) outcome = "USER_SOURCE_UNREADABLE";
  else if (evidenceRequired && !requestedSourceRetrieved) outcome = input.researchAttempted ? "RETRIEVAL_FAILED" : "SOURCE_UNAVAILABLE";
  else if (input.decision.researchRequired && !input.researchAttempted) outcome = "SOURCE_UNAVAILABLE";
  else if (evidenceRequired && sources.length === 0) outcome = input.researchAttempted ? "RETRIEVAL_FAILED" : "SOURCE_UNAVAILABLE";
  else if (!recencySatisfied) outcome = "INSUFFICIENT_FRESHNESS";
  else if (officialRequired && freshOfficialSourceCount === 0) outcome = "PARTIALLY_VERIFIED";
  else if (multipleRequired && freshSources.length < 2) outcome = "PARTIALLY_VERIFIED";
  else if (evidenceRequired && !directQuoteIntegrity) outcome = "PARTIALLY_VERIFIED";

  const groundedClaims = currentClaims(input.answer, input.decision).map((claim): GroundedClaim => {
    const relationships = sources.map((source) => ({ source, relationship: classifyAskClaimEvidence(claim, source.content) }));
    const contradictions = relationships.filter((candidate) => candidate.relationship === "CONTRADICTED");
    const supports = sources
      .filter((source) => relationships.some((candidate) => candidate.source === source && candidate.relationship === "SUPPORTED"))
      .map((source) => ({ source, strength: overlapStrength(claim, source) }))
      .sort((left, right) => right.strength - left.strength);
    const labelledInference = /\b(?:I infer|inference|likely|suggests|appears)\b/i.test(claim);
    return {
      claim,
      evidenceRelationship: contradictions.length ? "CONTRADICTED" : supports.length ? "SUPPORTED" : "UNKNOWN",
      contradictingSourceIds: contradictions.map((candidate) => candidate.source.id),
      freshnessSatisfied: supports.some((candidate) => freshSources.includes(candidate.source)),
      isInference: labelledInference,
      supportingSourceIds: contradictions.length ? [] : supports.slice(0, 3).map((candidate) => candidate.source.id),
      supportStrength: !contradictions.length && supports.length ? "direct" : "inference",
      verificationStatus: outcome
    };
  });
  if (groundedClaims.some((claim) => claim.evidenceRelationship === "CONTRADICTED")) {
    sourceConflict = true;
    outcome = "SOURCE_CONFLICT";
  }
  const unsupportedClaimCount = groundedClaims.filter((claim) => claim.supportingSourceIds.length === 0).length +
    unknownCitations.length +
    (evidenceRequired && !directQuoteIntegrity ? quotes.length : 0);
  const partiallySupportedClaims = groundedClaims.filter((claim) => claim.supportStrength !== "direct").length;
  const strictCurrentClaimSupport = !["private_file_source", "user_provided_source"].includes(input.decision.freshnessClass);
  if (
    evidenceRequired &&
    (
      groundedClaims.length === 0 ||
      unsupportedClaimCount > 0 ||
      (strictCurrentClaimSupport && partiallySupportedClaims > 0)
    ) &&
    outcome === "VERIFIED"
  ) {
    outcome = "PARTIALLY_VERIFIED";
  }
  const researchCompleted = input.researchAttempted && sources.length > 0;
  const safeAnswer = removeUnknownCitations(input.answer, unknownCitations);
  const supportedSourceIds = new Set(groundedClaims.flatMap((claim) => claim.supportingSourceIds));
  const citationSources = evidenceRequired
    ? freshSources.filter((source) => supportedSourceIds.has(source.id))
    : sources;
  const verifiedAnswer = outcome === "VERIFIED"
    ? sourceList(safeAnswer, citationSources)
    : qualifiedEvidenceAnswer({
        decision: input.decision,
        groundedClaims,
        outcome,
        safeAnswer,
        sources,
        time: input.time
      });
  const finalGroundedClaims = groundedClaims.map((claim) => ({
    ...claim,
    verificationStatus: outcome
  }));

  return {
    answer: verifiedAnswer,
    citationCount: outcome === "VERIFIED" ? markdownCitations(verifiedAnswer).length : 0,
    directQuoteIntegrity,
    groundedClaims: finalGroundedClaims,
    officialSourceCount,
    outcome,
    recencySatisfied,
    researchAttempted: input.researchAttempted,
    researchCompleted,
    sourceConflict,
    sourceCount: sources.length,
    sources,
    unknownCitations,
    unsupportedClaimCount
  };
}

export function compactAskFreshnessDecision(decision: AskFreshnessDecision) {
  return {
    confidence: decision.confidence,
    currentDateRequired: decision.currentDateRequired,
    directAnswerAllowed: decision.directAnswerAllowed,
    freshnessClass: decision.freshnessClass,
    highStakesDomain: decision.highStakesDomain,
    jurisdiction: decision.jurisdiction,
    preferredSourceTypes: decision.preferredSourceTypes,
    recencyRequirement: decision.recencyRequirement ?? null,
    researchPreferred: decision.researchPreferred,
    researchProhibited: decision.researchProhibited,
    researchRequired: decision.researchRequired,
    sourceRequirement: decision.sourceRequirement,
    timezoneRequired: decision.timezoneRequired
  };
}

export function compactAskSourceReliability(report: AskSourceReliabilityReport) {
  return {
    citationCount: report.citationCount,
    directQuoteIntegrity: report.directQuoteIntegrity,
    officialSourceCount: report.officialSourceCount,
    outcome: report.outcome,
    recencySatisfied: report.recencySatisfied,
    researchAttempted: report.researchAttempted,
    researchCompleted: report.researchCompleted,
    sourceConflict: report.sourceConflict,
    sourceCount: report.sourceCount,
    unknownCitationCount: report.unknownCitations.length,
    unsupportedClaimCount: report.unsupportedClaimCount
  };
}

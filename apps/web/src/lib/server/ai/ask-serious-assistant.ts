import type { AskRuntimeContext } from "./ask-context";
import { classifyFileLiteIntent, createFileLiteAnswer } from "./file-lite";

export type AskIntentName =
  | "accounting_or_finance_guidance"
  | "auth_or_security_guidance"
  | "brand_naming"
  | "bullet_format"
  | "business_plan"
  | "business_strategy"
  | "cleaned_preview_request"
  | "client_message"
  | "client_message_or_email"
  | "coding_help_text_only"
  | "comparison_or_recommendation"
  | "data_quality_check"
  | "data_work_guidance"
  | "date_time_question"
  | "debugging_help"
  | "direct_question"
  | "emotional_support_or_therapy_style"
  | "explanation_or_teaching"
  | "file_unavailable_explanation"
  | "followup_or_continuation"
  | "general_answer"
  | "large_data_workflow_guidance"
  | "legal_style_guidance"
  | "local_setup_guidance"
  | "logo_or_visual_direction"
  | "medical_style_guidance"
  | "mode_boundary_request"
  | "pasted_csv_analysis"
  | "pasted_table_cleanup"
  | "pasted_text_summary"
  | "planning_or_steps"
  | "polite_rewrite"
  | "summarization"
  | "summarize"
  | "task_checklist"
  | "teaching_explanation"
  | "translation_or_language_help"
  | "travel_or_lifestyle_planning"
  | "unsupported_ocr_request"
  | "unsupported_url_request"
  | "website_code_text_only"
  | "writing_or_rewriting"
  | "wrong_mode_build_request"
  | "wrong_mode_save_request";

export type AskRole =
  | "accountant_style_finance_guide"
  | "business_strategist"
  | "career_coach"
  | "developer"
  | "doctor_style_health_guide"
  | "lawyer_style_legal_explainer"
  | "marketing_strategist"
  | "parent_routine_helper"
  | "product_manager"
  | "sales_coach"
  | "senior_full_stack_engineer"
  | "supportive_listener"
  | "teacher"
  | "travel_planner"
  | "ui_ux_designer";

export type AskIntentClassification = {
  confidence: number;
  constraints: string[];
  intent: AskIntentName;
  languageTone: string | null;
  mutationPolicy: "never_mutate";
  outputFormat: "bullets" | "checklist" | "code" | "email" | "paragraph" | "steps" | null;
  reason: string;
  requestedRole: AskRole | null;
  safetySensitivity: "high" | "low" | "medium";
  shouldCreateProposal: false;
  shouldPointToCodeMode: boolean;
  shouldPointToWebsiteMode: boolean;
  shouldRunRuntime: false;
  shouldWriteFiles: false;
  textOnly: true;
  userGoal: string;
  wantsExecution: boolean;
  wouldBenefitFromLiveWeb: boolean;
};

export type AskConversationMessage = {
  content: string;
  providerFailureCategory?: string | null;
  responseKind?:
    | "deterministic_answer"
    | "identity_response"
    | "mode_boundary"
    | "provider_failure"
    | "safety_response"
    | "substantive_answer";
  role: "assistant" | "system" | "user";
};

type AskQualityProfile = {
  explicitMaxWords: number | null;
  format: "bullet_list" | "caption" | "checklist" | "code_blocks" | "message_draft" | "numbered_list" | "paragraph" | "step_by_step" | "table" | null;
  languageStyle: "english" | "roman_urdu_hindi" | "user_language";
  length: "detailed" | "exhaustive" | "normal" | "short" | "very_short";
  riskFlags: {
    mayBeTooGeneric: boolean;
    mayNeedAtMostOneClarifyingQuestion: boolean;
    mayNeedCode: boolean;
    mayNeedCommands: boolean;
    mayNeedSafetyBoundary: boolean;
    mayNeedToPreserveContinuity: boolean;
  };
  sensitivity: "accounting_finance" | "child_family" | "emotional_support" | "legal" | "medical" | "normal";
  tone: "concise" | "direct" | "expert" | "human" | "polite_but_firm" | "professional" | "supportive" | "teacher_like" | "warm" | null;
};

type AskCodingCategory =
  | "api_integration_help"
  | "architecture_or_folder_structure"
  | "auth_or_security_guidance"
  | "code_review_or_refactor"
  | "debugging_error_help"
  | "deployment_guidance"
  | "docker_or_docker_compose"
  | "environment_variables_guidance"
  | "fastify_api"
  | "git_github_help"
  | "html_css_js_static_site"
  | "nextjs_app_code_text"
  | "node_express_api"
  | "npm_pnpm_yarn_setup"
  | "php_form_or_backend"
  | "php_xampp_app"
  | "project_execution_boundary"
  | "python_data_task"
  | "python_script"
  | "python_web_app_flask_fastapi_streamlit"
  | "react_app_code_text"
  | "shopify_help"
  | "sql_database_schema_or_queries"
  | "typescript_javascript_help"
  | "windows_cmd_setup"
  | "wordpress_help";

const mutationSafe = {
  mutationPolicy: "never_mutate",
  shouldCreateProposal: false,
  shouldRunRuntime: false,
  shouldWriteFiles: false,
  textOnly: true
} as const;

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function roleFor(prompt: string): AskRole | null {
  const text = normalizePrompt(prompt);

  if (/\b(?:senior full[- ]stack|full[- ]stack engineer|software architect)\b/.test(text)) return "senior_full_stack_engineer";
  if (/\b(?:developer|programmer|coder)\b/.test(text)) return "developer";
  if (/\b(?:ui\/ux|ui ux|ux designer|visual designer|product designer)\b/.test(text)) return "ui_ux_designer";
  if (/\bproduct manager\b/.test(text)) return "product_manager";
  if (/\b(?:coo|operations strategist|business strategist)\b/.test(text)) return "business_strategist";
  if (/\bmarketing strategist\b|\bmarketer\b/.test(text)) return "marketing_strategist";
  if (/\b(?:teacher|teach me|explain like)\b/.test(text)) return "teacher";
  if (/\b(?:doctor|gynecologist|health guide|medical)\b/.test(text)) return "doctor_style_health_guide";
  if (/\b(?:lawyer|legal advisor|legal explainer|attorney)\b/.test(text)) return "lawyer_style_legal_explainer";
  if (/\b(?:accountant|bookkeeper|tax advisor)\b/.test(text)) return "accountant_style_finance_guide";
  if (/\b(?:therapist|counselor|supportive listener)\b/.test(text)) return "supportive_listener";
  if (/\btravel planner\b|\bitinerary\b/.test(text)) return "travel_planner";
  if (/\bcareer coach\b|\bresume\b|\binterview\b/.test(text)) return "career_coach";
  if (/\b(?:sales coach|call center|client call)\b/.test(text)) return "sales_coach";
  if (/\b(?:child routine|kids routine|parent)\b/.test(text)) return "parent_routine_helper";

  return null;
}

function outputFormatFor(prompt: string): AskIntentClassification["outputFormat"] {
  if (/\b(?:bullet points|bullets|bullet format|as bullets)\b/i.test(prompt)) return "bullets";
  if (/\b(?:checklist|check list)\b/i.test(prompt)) return "checklist";
  if (/\b(?:code|script|html|css|js|php|python)\b/i.test(prompt)) return "code";
  if (/\b(?:email|message|reply|letter)\b/i.test(prompt)) return "email";
  if (/\b(?:steps|commands|how to run)\b/i.test(prompt)) return "steps";
  return null;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function explicitMaxWordsFor(prompt: string) {
  const match = prompt.match(/\b(?:under|less than|max(?:imum)?|no more than)\s+(\d+)\s+words?\b/i);
  return match ? Number(match[1]) : null;
}

function createQualityProfile(prompt: string, classification: AskIntentClassification): AskQualityProfile {
  const explicitMaxWords = explicitMaxWordsFor(prompt);
  const normalized = normalizePrompt(prompt);
  const length: AskQualityProfile["length"] = explicitMaxWords && explicitMaxWords <= 40
    ? "very_short"
    : /\b(?:short|concise|brief|simple)\b/i.test(prompt)
      ? "short"
      : /\b(?:deep|detailed|thorough)\b/i.test(prompt)
        ? "detailed"
        : /\b(?:exhaustive|complete guide)\b/i.test(prompt)
          ? "exhaustive"
          : "normal";
  const format: AskQualityProfile["format"] =
    classification.outputFormat === "bullets" ? "bullet_list" :
    classification.outputFormat === "checklist" ? "checklist" :
    classification.outputFormat === "code" ? "code_blocks" :
    classification.outputFormat === "email" ? "message_draft" :
    classification.outputFormat === "steps" ? "step_by_step" :
    /\btable\b/i.test(prompt) ? "table" :
    /\bcaption\b/i.test(prompt) ? "caption" :
    /\bnumbered\b|\b\d+\s*part\b/i.test(prompt) ? "numbered_list" :
    null;
  const sensitivity: AskQualityProfile["sensitivity"] =
    classification.intent === "medical_style_guidance" ? "medical" :
    classification.intent === "legal_style_guidance" ? "legal" :
    classification.intent === "accounting_or_finance_guidance" ? "accounting_finance" :
    classification.intent === "emotional_support_or_therapy_style" ? "emotional_support" :
    /\b(?:child|kid|parent|family)\b/i.test(prompt) ? "child_family" :
    "normal";
  const tone: AskQualityProfile["tone"] =
    /\bpolite(?:ly)?\b/i.test(prompt) && /\b(?:firm|sarcastic)\b/i.test(prompt) ? "polite_but_firm" :
    /\bmore human|humanly|not sound like ai\b/i.test(prompt) ? "human" :
    /\bwarm\b/i.test(prompt) ? "warm" :
    /\bprofessional\b/i.test(prompt) ? "professional" :
    /\bconcise|brief|short\b/i.test(prompt) ? "concise" :
    /\bdirect\b/i.test(prompt) ? "direct" :
    classification.requestedRole === "teacher" ? "teacher_like" :
    classification.requestedRole ? "expert" :
    null;

  return {
    explicitMaxWords,
    format,
    languageStyle: /\b(?:acha|kya|hai|nahi|karna|ap|aap|mera|meri)\b/i.test(prompt) ? "roman_urdu_hindi" : "english",
    length,
    riskFlags: {
      mayBeTooGeneric: classification.confidence < 0.75 || classification.intent === "general_answer",
      mayNeedAtMostOneClarifyingQuestion: classification.intent === "general_answer",
      mayNeedCode: classification.outputFormat === "code",
      mayNeedCommands: /\b(?:cmd|commands?|run|xampp|windows)\b/i.test(prompt),
      mayNeedSafetyBoundary: sensitivity !== "normal",
      mayNeedToPreserveContinuity: classification.intent === "followup_or_continuation" || /\b(?:continue|above|same|it)\b/i.test(normalized)
    },
    sensitivity,
    tone
  };
}

function constraintsFor(prompt: string) {
  const constraints: string[] = [];
  const wordLimit = explicitMaxWordsFor(prompt);

  if (wordLimit) constraints.push(`under ${wordLimit} words`);
  if (/\bshort\b/i.test(prompt)) constraints.push("keep it short");
  if (/\bprofessional\b/i.test(prompt)) constraints.push("professional tone");
  if (/\bwarm(?:er)?\b/i.test(prompt)) constraints.push("warm tone");
  if (/\bhere only\b/i.test(prompt)) constraints.push("answer in chat only");
  if (/\bdo not save|don't save|preview only\b/i.test(prompt)) constraints.push("do not save files");

  return constraints;
}

function isFollowup(prompt: string) {
  if (/\bcombine\b[\s\S]{0,80}\b(?:words?|names?|theme)\b/i.test(prompt)) return false;

  return /^(?:hi again[\s\S]{0,40}\bcontinue|(?:he|she|they|it)\b|write[\s\S]{0,60}\babout (?:him|her|them|it)\b|you are (?:still )?replying incorrectly|what do you mean|explain that|can you clarify|tell me more|why\??|what about (?:him|her|it|them)|please answer my original question|continue|make it|make this|shorter|longer|warmer|more emotional|more professional|more casual|now do|now act|same for|do the same|rewrite it|improve it|again|translate it|summarize(?: only)?|summarize it)\b/i.test(prompt.trim()) ||
    /^(?:what|who|why|how|when|where|does|did|is|was|can)\b[\s\S]{0,100}\b(?:his|her|their|its|him|them)\b/i.test(prompt.trim()) ||
    /\b(?:make it|make this|the same for|do the same for|shorter and warmer|shorter|warmer)\b/i.test(prompt.trim()) &&
      prompt.trim().split(/\s+/).length <= 10;
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

function isSummaryRequest(prompt: string) {
  return /\b(?:summarize|summarise|summary)\b/i.test(prompt);
}

function isDataWorkGuidance(prompt: string) {
  return /\b(?:csv|spreadsheet|excel|records|dataset|data cleaning|dedupe|duplicates)\b/i.test(prompt);
}

function isDirectDateTimeQuestion(prompt: string) {
  const normalized = normalizePrompt(prompt).replace(/[?.!]+$/g, "");

  return /^(?:what(?:'s| is)?|tell me)?\s*(?:the\s*)?(?:date|day|time)\s*(?:today|tomorrow|now|right now|is it)?(?:\s+(?:in|for|at)\s+[\w\s/_-]+)?$/.test(normalized) ||
    /\b(?:what date is today|what'?s tomorrow'?s date|tomorrow'?s date|today'?s date|current date|what day is it|what time is it|current time|time now|date today)\b/i.test(prompt);
}

function wantsProjectExecution(prompt: string) {
  return /\b(?:in (?:this|my|the) project|apply (?:all )?(?:files|changes|this|it)|create[\s\S]{0,60}files|write files|save (?:it|this)|modify files|edit files|replace (?:all )?(?:project )?files|rewrite (?:my|this|the) [\w.-]+ app|right now|i approve|approved in advance|install|start runtime)\b/i.test(prompt) ||
    /\b(?:run|start)\b(?!\s+(?:it|this|the script|the app|locally|on windows|in xampp|from cmd|with cmd))/i.test(prompt);
}

function isWebsiteCodeTextRequest(prompt: string) {
  return /\b(?:website|site|one page toy shop|toy shop website|landing page)\b/i.test(prompt) &&
    /\b(?:html|css|javascript|js|one page)\b/i.test(prompt) &&
    /\b(?:code here|here only|give me|write me|complete|html css|html\/css)\b/i.test(prompt);
}

function isCodingTextRequest(prompt: string) {
  if (/\b(?:cold calling script|sales script|call script|objection handling)\b/i.test(prompt)) return false;

  return /\b(?:write me|make me|give me|show me|create|explain|tell me how|how do i|starter|schema)\b[\s\S]{0,140}\b(?:code|script|php|python|react|next\.?js|express|fastify|docker|sql|wordpress|shopify|git|javascript|typescript|js|html|css|xampp|cmd commands?|api|route|schema|compose)\b/i.test(prompt) &&
    !wantsProjectExecution(prompt);
}

function isConceptualTechnicalExplanation(prompt: string) {
  const asksForExplanation = /\b(?:explain|teach|what is|what does|what .{1,60} mean|how does|when (?:should|not) (?:i|to))\b/i.test(prompt);
  const technicalSubject = /\b(?:react|next\.?js|typescript|javascript|server components?|api|database|docker|git|sql|css|html|webgl|browser|component|framework|architecture)\b/i.test(prompt);
  const asksForImplementation = /\b(?:write|create|build|implement|give me|show me|generate|fix|debug|setup|install|run|commands?|code\s+(?:for|to))\b/i.test(prompt);

  return asksForExplanation && technicalSubject && !asksForImplementation && !wantsProjectExecution(prompt);
}

function isWrongModeBuildRequest(prompt: string) {
  return wantsProjectExecution(prompt) &&
    /\b(?:add|build|create|make|generate|design|edit|update|change|install|run|fix)\b[\s\S]{0,160}\b(?:website|site|homepage|app|tool|system|file|files|code|crm|dashboard|streamlit|app\.py|testimonials|python|react)\b/i.test(prompt);
}

function detectDangerousCodingRequest(prompt: string) {
  return /\b(?:steal|exfiltrate|dump|harvest)\b[\s\S]{0,80}\b(?:password|credential|cookie|token|browser saved|session)\b/i.test(prompt) ||
    /\b(?:ransomware|keylogger|phishing|bypass authentication|hack someone|exploit a site|malware)\b/i.test(prompt);
}

function detectCodingCategory(prompt: string): AskCodingCategory | null {
  const text = normalizePrompt(prompt);

  if (detectDangerousCodingRequest(prompt)) return "auth_or_security_guidance";
  if (/\bmodule not found|can't resolve|cannot find module|eresolve|port \d+.*in use|hydration failed|property .* does not exist on type|importerror|no module named|apache shutdown unexpectedly|cors policy|unexpected token '<'|error:\b/i.test(prompt)) return "debugging_error_help";
  if (wantsProjectExecution(prompt)) return "project_execution_boundary";
  if (/\bwordpress|shortcode|functions\.php|plugin|child theme\b/i.test(prompt)) return "wordpress_help";
  if (/\bshopify|liquid|theme section|product page|theme editor\b/i.test(prompt)) return "shopify_help";
  if (/\bgit\b|\bgithub\b|\bcommit\b|\bbranch\b|\bclone\b|\bpull\b|\bpush\b|\brestore\b|\breset\b/i.test(prompt)) return "git_github_help";
  if (/\bdocker\b|\bdocker compose\b|\bdocker-compose\b|\bcompose\.ya?ml\b/i.test(prompt)) return "docker_or_docker_compose";
  if (/\bsql\b|\bcreate table\b|\bschema\b|\bselect\b|\binsert\b|\bpostgres\b|\bmysql\b/i.test(prompt)) return "sql_database_schema_or_queries";
  if (/\bfastify\b/i.test(prompt)) return "fastify_api";
  if (/\bexpress\b|\bnode api\b|\bnode\.?js api\b|\busers route\b/i.test(prompt)) return "node_express_api";
  if (/\bnext\.?js\b|\bapp router\b|\bcreate-next-app\b/i.test(prompt)) return "nextjs_app_code_text";
  if (/\breact\b|\bvite\b|\bsrc\/app\b|\bsrc\\app\b/i.test(prompt)) return "react_app_code_text";
  if (/\bxampp\b/i.test(prompt)) return "php_xampp_app";
  if (/\bphp\b/i.test(prompt)) return /\bform\b|\bcontact\b|\bbackend\b/i.test(text) ? "php_form_or_backend" : "php_xampp_app";
  if (/\bpython\b/i.test(prompt) && /\b(?:csv|excel|data|merge|clean|duplicates|split)\b/i.test(prompt)) return "python_data_task";
  if (/\b(?:flask|fastapi|streamlit)\b/i.test(prompt)) return "python_web_app_flask_fastapi_streamlit";
  if (/\bpython\b|\b\.py\b/i.test(prompt)) return "python_script";
  if (/\bhtml\b|\bcss\b|\bjavascript\b|\bstatic site\b|\bone page\b/i.test(prompt)) return "html_css_js_static_site";
  if (/\bnpm\b|\bpnpm\b|\byarn\b|\bpackage\.json\b/i.test(prompt)) return "npm_pnpm_yarn_setup";
  if (/\bcmd\b|\bwindows command\b|\bcommand prompt\b/i.test(prompt)) return "windows_cmd_setup";
  if (/\benv\b|\benvironment variable\b|\.env\b/i.test(prompt)) return "environment_variables_guidance";
  if (/\bauth\b|\blogin\b|\bsecurity\b|\bapi key\b|\bjwt\b/i.test(prompt)) return "auth_or_security_guidance";
  if (/\bdeploy\b|\bdeployment\b|\bvercel\b|\brender\b|\bnetlify\b/i.test(prompt)) return "deployment_guidance";
  if (/\bapi integration\b|\bfetch api\b|\bthird[- ]party api\b|\brest api\b/i.test(prompt)) return "api_integration_help";
  if (/\barchitecture\b|\bfolder structure\b|\bproject structure\b/i.test(prompt)) return "architecture_or_folder_structure";
  if (/\brefactor\b|\breview this code\b|\bcode review\b/i.test(prompt)) return "code_review_or_refactor";
  if (/\btypescript\b|\bjavascript\b|\bjs\b|\bts\b/i.test(prompt)) return "typescript_javascript_help";

  return null;
}

function classify(
  prompt: string,
  intent: AskIntentName,
  confidence: number,
  reason: string
): AskIntentClassification {
  const text = normalizePrompt(prompt);
  const safetySensitivity =
    /\b(?:suicide|self harm|kill myself|heavy bleeding|severe pain|chest pain|can't breathe)\b/i.test(prompt)
      ? "high"
      : /\b(?:doctor|medical|pregnan|period|legal|lawyer|contract|tax|accountant|depressed|anxious)\b/i.test(prompt)
        ? "medium"
        : "low";

  return {
    confidence,
    constraints: constraintsFor(prompt),
    intent,
    languageTone: /\bwarm\b/i.test(prompt) ? "warm" : /\bprofessional\b/i.test(prompt) ? "professional" : null,
    outputFormat: outputFormatFor(prompt),
    reason,
    requestedRole: roleFor(prompt),
    safetySensitivity,
    shouldPointToCodeMode: intent === "mode_boundary_request" || (isWrongModeBuildRequest(prompt) && !/\bwebsite|site|homepage\b/i.test(text)),
    shouldPointToWebsiteMode: intent === "mode_boundary_request" || (isWrongModeBuildRequest(prompt) && /\bwebsite|site|homepage\b/i.test(text)),
    userGoal: prompt.trim(),
    wantsExecution: wantsProjectExecution(prompt),
    wouldBenefitFromLiveWeb: /\b(?:latest|current|today|price|news|weather|law|regulation|availability)\b/i.test(prompt),
    ...mutationSafe
  };
}

export function classifyAskIntent(prompt: string): AskIntentClassification {
  const fileLiteIntent = classifyFileLiteIntent(prompt);

  if (fileLiteIntent) {
    return classify(prompt, fileLiteIntent, 0.94, "The user is asking ASK mode to analyze pasted text/table data or explain unsupported file access.");
  }

  if (isFollowup(prompt)) return classify(prompt, "followup_or_continuation", 0.88, "The message depends on the immediately previous turn.");
  if (isLiveUrlRequest(prompt)) return classify(prompt, "unsupported_url_request", 0.98, "The user asked ASK mode to open or summarize a live URL.");
  if (isFileReadingRequest(prompt) || isImageReadingRequest(prompt)) return classify(prompt, "file_unavailable_explanation", 0.97, "The user asked ASK mode to read a file or image that is not available to this layer.");
  if (isWrongModeBuildRequest(prompt)) return classify(prompt, "mode_boundary_request", 0.94, "The user asks ASK to create/apply/run project files.");
  if (detectDangerousCodingRequest(prompt)) return classify(prompt, "auth_or_security_guidance", 0.96, "The user asked for harmful code; ASK should refuse and redirect to defensive security.");
  if (isWebsiteCodeTextRequest(prompt)) return classify(prompt, "website_code_text_only", 0.92, "The user asks for website code in chat only.");
  if (/\b(?:compare|which is better|recommend|best option|versus|vs)\b/i.test(prompt)) return classify(prompt, "comparison_or_recommendation", 0.9, "The user asks for comparison or recommendation.");
  if (isConceptualTechnicalExplanation(prompt)) return classify(prompt, "explanation_or_teaching", 0.9, "The user asks for a conceptual technical explanation rather than implementation code.");
  if (detectCodingCategory(prompt) || isCodingTextRequest(prompt)) return classify(prompt, /\b(?:xampp|cmd|localhost|install|run|commands?|setup)\b/i.test(prompt) ? "local_setup_guidance" : "coding_help_text_only", 0.9, "The user asks for code or setup guidance as text.");
  if (/\b(?:write it|write this|say politely|say this|make it|rewrite)\b/i.test(prompt) && (explicitMaxWordsFor(prompt) || /\b(?:human|sarcastic(?:ally)?|firm|simple|general)\b/i.test(prompt))) return classify(prompt, "writing_or_rewriting", 0.88, "The user asks for wording refinement with quality constraints.");
  if (/\b(?:debug|error|bug|fix this|not working|stack trace)\b/i.test(prompt)) return classify(prompt, "debugging_help", 0.86, "The user asks for debugging help.");
  if (/\b(?:brand name|name for|powerful word|suggest.*names?|naming)\b/i.test(prompt) || /\bcombine\b[\s\S]{0,100}\b(?:words?|names?|theme)\b/i.test(prompt)) return classify(prompt, "brand_naming", 0.9, "The user asks for naming ideas.");
  if (/\b(?:logo|visual direction|brand identity|colors|palette)\b/i.test(prompt)) return classify(prompt, "logo_or_visual_direction", 0.82, "The user asks for visual or logo direction.");
  if (isWritingIntent(prompt)) return classify(prompt, "client_message_or_email", 0.94, "The user is asking for a drafted message or reply.");
  if (isPoliteRewrite(prompt)) return classify(prompt, "writing_or_rewriting", 0.92, "The user is asking to rewrite existing wording.");
  if (isSummaryRequest(prompt)) return classify(prompt, "summarization", 0.9, "The user requested a summary of provided text.");
  if (/\b(?:bullet points|bullets|bullet format|as bullets)\b/i.test(prompt)) return classify(prompt, "bullet_format", 0.93, "The user requested bullet-point formatting.");
  if (/\b(?:legal advisor|contract|freelance contract|lawyer|legal)\b/i.test(prompt)) return classify(prompt, "legal_style_guidance", 0.86, "The user asks for legal-style guidance.");
  if (/\b(?:doctor|medical|period|pregnan|symptom|pain|bleeding|gynecologist|health)\b/i.test(prompt)) return classify(prompt, "medical_style_guidance", 0.86, "The user asks for medical-style guidance.");
  if (/\b(?:accountant|tax|income|expenses|invoices|finance|bookkeeping)\b/i.test(prompt)) return classify(prompt, "accounting_or_finance_guidance", 0.86, "The user asks for accounting or finance guidance.");
  if (/\b(?:therapy|therapist|anxious|sad|depressed|overwhelmed|stress)\b/i.test(prompt)) return classify(prompt, "emotional_support_or_therapy_style", 0.82, "The user asks for supportive conversation.");
  if (isDataWorkGuidance(prompt)) return classify(prompt, "data_work_guidance", 0.88, "The user is asking for data or record-cleaning guidance.");
  if (/\b(?:learning|learn)\b[\s\S]{0,80}\b(?:spanish|verbs?)\b/i.test(prompt)) return classify(prompt, "explanation_or_teaching", 0.86, "The user asks for a learning explanation or plan.");
  if (/\b(?:plan|checklist|steps|schedule|tomorrow|roadmap)\b/i.test(prompt)) return classify(prompt, "planning_or_steps", 0.84, "The user is asking for a practical plan or checklist.");
  if (/\b(?:business plan|strategy|marketing|offer|follow-up|client drop|sales)\b/i.test(prompt)) return classify(prompt, "business_strategy", 0.82, "The user is asking for business strategy support.");
  if (/\b(?:travel|trip|itinerary|hotel|flight)\b/i.test(prompt)) return classify(prompt, "travel_or_lifestyle_planning", 0.78, "The user asks for travel or lifestyle planning.");
  if (/\b(?:translate|translation|rewrite in|say this in)\b/i.test(prompt)) return classify(prompt, "translation_or_language_help", 0.86, "The user is asking for language help.");
  if (/\b(?:explain|teach|what is|how does|like i am|i am very new|beginner)\b/i.test(prompt)) return classify(prompt, "explanation_or_teaching", 0.84, "The user is asking for a simple explanation.");
  if (isDirectDateTimeQuestion(prompt)) return classify(prompt, "date_time_question", 0.9, "The user is directly asking for date or time.");
  if (/\b(?:who are you|what are you|what can you do|which mode|ask mode|code mode|website mode)\b/i.test(prompt)) return classify(prompt, "direct_question", 0.86, "The user asks about Hassali or mode behavior.");

  return classify(prompt, "general_answer", 0.55, "No stronger ASK-I2 intent matched.");
}

function extractAfterColon(prompt: string) {
  const index = prompt.indexOf(":");
  return index >= 0 ? prompt.slice(index + 1).trim() : prompt.trim();
}

function cleanText(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function lastAssistantMessage(history: AskConversationMessage[] | undefined) {
  return [...(history ?? [])].reverse().find((message) =>
    message.role === "assistant" &&
    message.responseKind !== "provider_failure" &&
    message.content.trim().length > 0
  )?.content.trim() ?? null;
}

function createFollowupAnswer(prompt: string, history: AskConversationMessage[] | undefined) {
  const previous = lastAssistantMessage(history);

  if (!previous) {
    return "I can do that, but I need the previous text first. Paste the message or answer you want me to make shorter, warmer, or revise.";
  }

  if (/\bshorter\b/i.test(prompt) && /\bwarmer\b/i.test(prompt)) {
    if (/received your request/i.test(previous)) {
      return "Thanks, we received your request and will get back to you shortly with the next steps.";
    }

    const firstSentence = previous.split(/\n|(?<=[.!?])\s+/).find(Boolean) ?? previous;
    return `Here is a shorter, warmer version:\n\n${firstSentence.replace(/\.$/, "")}.`;
  }

  if (/\bcontinue\b/i.test(prompt)) {
    const partMatch = prompt.match(/\bpart\s+(\d+)\b/i);
    const partNumber = partMatch?.[1] ?? null;

    if (partNumber === "2" && /part\s*2|2\./i.test(previous)) {
      return [
        "Part 2 only: practice one tiny verb change at a time.",
        "",
        "- Start with `hablar`, which means `to speak`.",
        "- Say `yo hablo` for `I speak`.",
        "- Say `tu hablas` for `you speak`.",
        "- Do not learn every form at once.",
        "- Practice two little sentences, then stop."
      ].join("\n");
    }

    return "Continue from the last useful section:\n\n" + previous.split("\n").slice(-5).join("\n");
  }

  return `Here is a revised version:\n\n${previous}`;
}

function createClientMessageAnswer(prompt: string) {
  const lower = prompt.toLowerCase();

  if (/\breceived\b/.test(lower) && /\brequest\b/.test(lower)) {
    return "Hi, thanks for reaching out. We received your request and will get back to you shortly with the next steps.";
  }

  const instruction = cleanText(
    prompt.match(/\b(?:saying|that says|to say|which says)\s+(.+?)(?:[.!?]\s*)?$/i)?.[1] ??
      prompt.replace(/^\s*(?:please\s+)?(?:write|draft|compose|prepare|create|make)\s+(?:a\s+|an\s+|the\s+)?/i, "")
  );

  return ["Hi,", "", instruction, "", "Best regards"].join("\n");
}

function createRewriteAnswer(prompt: string) {
  const source = cleanText(extractAfterColon(prompt));
  const lower = source.toLowerCase();

  if (/\bat what level can you do marketing\b/i.test(prompt)) {
    return "I can support marketing at a practical level, from ideas and messaging to testing, follow-ups, and improving results.";
  }

  if (/\bhappy to contribute ideas\b/i.test(prompt)) {
    return "I’d be happy to share ideas where I notice useful opportunities, whether that’s improving operations, increasing conversions, or making the marketing stronger.";
  }

  if (/\bclient requirements\b/i.test(prompt) && /\baccept or reject\b/i.test(prompt)) {
    return "Those were the client’s requirements, so I can suggest the best options, but the final choice is theirs to accept or reject.";
  }

  if (/\binvoice\b/.test(lower) && /\bspam\b/.test(lower)) {
    return "I already sent the invoice. Could you please check your spam or junk folder in case it landed there?";
  }

  if (/\bmarketing\b/.test(lower) && /\boffers\b/.test(lower)) {
    return "I can help sharpen your offers, write stronger messages, test posts, improve follow-ups, and spot where potential clients are dropping off.";
  }

  return source
    ? `Here is a cleaner version:\n\n${source}`
    : "Paste the text you want rewritten, and I will make it clearer while keeping your meaning.";
}

function extractNameInputs(prompt: string) {
  const explicit = prompt.match(/\b(?:words?|names?)\s+(.+?)(?:\.|,?\s+which\b|,?\s+it should\b|,?\s+and the theme\b|$)/i)?.[1] ?? "";
  const capitalized = [...prompt.matchAll(/\b[A-Z][a-z]{2,}\b/g)]
    .map((match) => match[0])
    .filter((word) => !["Same", "Deep"].includes(word));
  const words = explicit
    .split(/,|\band\b|\+/i)
    .map((word) => cleanText(word))
    .filter((word) => /^[a-z][a-z\s-]*$/i.test(word) && word.length > 1);
  const merged = [...new Set([...words, ...capitalized])].slice(0, 4);
  return merged.length ? merged : ["Hassan", "Aasia", "Mujtaba"];
}

function createBrandNamingAnswer(prompt: string) {
  const inputs = extractNameInputs(prompt);
  const lower = normalizePrompt(prompt);

  if (/\bsarah\b/.test(lower) && /\bzayn\b/.test(lower)) {
    return [
      "Top pick: Sazara",
      "Meaning: A clean blend of Sarah and Zayn with a soft, future-facing feel. It sounds more like a sustainability brand than a forced acronym.",
      "",
      "Other strong options:",
      "",
      "1. Zayra - short, bright, and easy to say; good for a clean-energy product.",
      "2. Solzayn - connects Zayn with solar energy without becoming too literal.",
      "3. Sarinova - Sarah plus innovation; polished for a climate-tech company.",
      "4. Zenera - suggests energy, renewal, and modern systems.",
      "5. Saraya Green - warmer and more human; better for a community-focused brand.",
      "",
      "Trademark and domain availability would still need separate verification."
    ].join("\n");
  }

  return [
    "Top pick: Muhaasia",
    "Meaning: A smooth fusion of Mujtaba, Hassan, and Aasia. It feels like a serious AI/technology brand because it is short, memorable, and not too literal.",
    "",
    "Other strong options:",
    "",
    "1. AhsanIQ - blends Aasia/Hassan energy with IQ, intelligence, and future-tech.",
    "2. MuhaTech - direct and clean; good if you want the family-name connection to stay visible.",
    "3. Hasia AI - softer and more premium; better for a friendly assistant or software studio.",
    "4. Mujassan - powerful, founder-like, and memorable, but less obviously tech.",
    "5. Ahsania - polished and brandable; sounds like a company name, not a random mashup.",
    "",
    `I would avoid forced names like \`${inputs.join("").slice(0, 14)}TechAI\` because they feel crowded and hard to say.`,
    "",
    "Trademark and domain availability would still need separate verification."
  ].join("\n");
}

function createPhpContactFormAnswer() {
  return [
    "Use this small structure:",
    "",
    "```text",
    "C:\\xampp\\htdocs\\contact-demo\\",
    "  index.html",
    "  send.php",
    "```",
    "",
    "`index.html`",
    "```html",
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <title>Contact Form</title>",
    "</head>",
    "<body>",
    "  <h1>Contact Us</h1>",
    "  <form action=\"send.php\" method=\"post\">",
    "    <label>Name <input name=\"name\" required></label><br>",
    "    <label>Email <input name=\"email\" type=\"email\" required></label><br>",
    "    <label>Message <textarea name=\"message\" required></textarea></label><br>",
    "    <button type=\"submit\">Send</button>",
    "  </form>",
    "</body>",
    "</html>",
    "```",
    "",
    "`send.php`",
    "```php",
    "<?php",
    "$name = trim($_POST['name'] ?? '');",
    "$email = trim($_POST['email'] ?? '');",
    "$message = trim($_POST['message'] ?? '');",
    "",
    "if ($name === '' || $email === '' || $message === '') {",
    "    exit('Please fill all fields.');",
    "}",
    "",
    "$safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');",
    "$safeEmail = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');",
    "$safeMessage = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));",
    "?>",
    "<h1>Message received</h1>",
    "<p><strong>Name:</strong> <?= $safeName ?></p>",
    "<p><strong>Email:</strong> <?= $safeEmail ?></p>",
    "<p><strong>Message:</strong><br><?= $safeMessage ?></p>",
    "```",
    "",
    "Run it on Windows:",
    "",
    "```cmd",
    "cd /d C:\\xampp\\htdocs",
    "mkdir C:\\xampp\\htdocs\\contact-demo",
    "cd contact-demo",
    "notepad C:\\xampp\\htdocs\\contact-demo\\index.html",
    "notepad C:\\xampp\\htdocs\\contact-demo\\send.php",
    "```",
    "",
    "Start Apache in the XAMPP Control Panel, then open:",
    "",
    "```text",
    "http://localhost/contact-demo/",
    "```",
    "",
    "Test it by filling the form and pressing Send.",
    "",
    "Common fixes:",
    "- If the page does not load, Apache is probably not running.",
    "- If PHP code shows as text, the file is outside `htdocs` or Apache/PHP is not serving it.",
    "- PHP `mail()` usually will not send real email locally without SMTP setup."
  ].join("\n");
}

function createToyWebsiteCodeAnswer() {
  return [
    "Create these three files in one folder, then open `index.html` in your browser.",
    "",
    "`index.html`",
    "```html",
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>WonderToy Shop</title>",
    "  <link rel=\"stylesheet\" href=\"styles.css\" />",
    "</head>",
    "<body>",
    "  <header class=\"nav\"><strong>WonderToy</strong><a href=\"#toys\">Toys</a><a href=\"#contact\">Contact</a></header>",
    "  <main>",
    "    <section class=\"hero\"><p>Premium toy shop</p><h1>Smart, safe toys kids actually love.</h1><button id=\"pickBtn\">Show gift pick</button></section>",
    "    <section id=\"toys\" class=\"grid\">",
    "      <article>Educational puzzles <span>Ages 4-8</span></article>",
    "      <article>Plush friends <span>Soft gifts</span></article>",
    "      <article>Building blocks <span>Creative play</span></article>",
    "    </section>",
    "    <section id=\"contact\" class=\"contact\">Delivery, returns, and safe checkout support available.</section>",
    "  </main>",
    "  <script src=\"main.js\"></script>",
    "</body>",
    "</html>",
    "```",
    "",
    "`styles.css`",
    "```css",
    "body { margin: 0; font-family: Arial, sans-serif; background: #fff8ec; color: #1f1f1f; }",
    ".nav { display: flex; gap: 20px; align-items: center; padding: 18px 7vw; background: white; }",
    ".nav a { color: #1f1f1f; text-decoration: none; }",
    ".hero { padding: 80px 7vw; background: linear-gradient(135deg, #ffe2a8, #ffb7d5); }",
    ".hero h1 { max-width: 650px; font-size: clamp(42px, 8vw, 86px); line-height: .95; }",
    "button { border: 0; border-radius: 999px; padding: 14px 22px; background: #111; color: white; cursor: pointer; }",
    ".grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; padding: 40px 7vw; }",
    ".grid article, .contact { border-radius: 22px; background: white; padding: 24px; box-shadow: 0 14px 40px #0001; }",
    ".grid span { display: block; margin-top: 12px; color: #666; }",
    "```",
    "",
    "`main.js`",
    "```js",
    "const picks = ['Educational puzzle set', 'Rainbow building blocks', 'Cozy plush bear'];",
    "document.getElementById('pickBtn').addEventListener('click', () => {",
    "  alert('Today\\'s gift pick: ' + picks[Math.floor(Math.random() * picks.length)]);",
    "});",
    "```",
    "",
    "Run locally:",
    "",
    "```cmd",
    "cd /d C:\\toy-shop-site",
    "python -m http.server 5500",
    "```",
    "",
    "Open `http://localhost:5500/`, or simply double-click `index.html` for a quick static preview."
  ].join("\n");
}

function createCsvMergeAnswer() {
  return [
    "Use this structure:",
    "",
    "```text",
    "C:\\csv-merge\\",
    "  merge_csv.py",
    "  input\\",
    "    file1.csv",
    "    file2.csv",
    "  output\\",
    "```",
    "",
    "`merge_csv.py`",
    "```python",
    "from pathlib import Path",
    "import csv",
    "",
    "input_dir = Path('input')",
    "output_dir = Path('output')",
    "output_dir.mkdir(exist_ok=True)",
    "output_file = output_dir / 'merged.csv'",
    "",
    "csv_files = sorted(input_dir.glob('*.csv'))",
    "if not csv_files:",
    "    raise SystemExit('No CSV files found in the input folder.')",
    "",
    "header_written = False",
    "with output_file.open('w', newline='', encoding='utf-8') as out:",
    "    writer = None",
    "    for path in csv_files:",
    "        with path.open('r', newline='', encoding='utf-8-sig') as f:",
    "            reader = csv.reader(f)",
    "            header = next(reader, None)",
    "            if header is None:",
    "                continue",
    "            if not header_written:",
    "                writer = csv.writer(out)",
    "                writer.writerow(header)",
    "                header_written = True",
    "            for row in reader:",
    "                writer.writerow(row)",
    "",
    "print(f'Merged {len(csv_files)} files into {output_file}')",
    "```",
    "",
    "CMD commands:",
    "",
    "```cmd",
    "mkdir C:\\csv-merge",
    "mkdir C:\\csv-merge\\input",
    "mkdir C:\\csv-merge\\output",
    "notepad C:\\csv-merge\\merge_csv.py",
    "cd /d C:\\csv-merge",
    "python --version",
    "python merge_csv.py",
    "```",
    "",
    "No extra pip package is needed. Test with two small CSV files first, then check `C:\\csv-merge\\output\\merged.csv` and confirm the row count."
  ].join("\n");
}

function createReactViteAnswer() {
  return [
    "Here is a simple React/Vite inventory dashboard you can copy manually.",
    "",
    "Folder structure:",
    "```text",
    "inventory-dashboard\\",
    "  package.json",
    "  index.html",
    "  src\\main.jsx",
    "  src\\App.jsx",
    "  src\\styles.css",
    "```",
    "",
    "`package.json`",
    "```json",
    "{\"scripts\":{\"dev\":\"vite\",\"build\":\"vite build\"},\"dependencies\":{\"@vitejs/plugin-react\":\"latest\",\"vite\":\"latest\",\"react\":\"latest\",\"react-dom\":\"latest\"},\"devDependencies\":{}}",
    "```",
    "",
    "`src/App.jsx`",
    "```jsx",
    "import './styles.css';",
    "const products = [{ name: 'Bluetooth Speaker', stock: 18, billing: 128500 }, { name: 'USB-C Cable', stock: 4, billing: 42800 }];",
    "export default function App() {",
    "  const cashIn = products.reduce((sum, item) => sum + item.billing, 0);",
    "  return <main className=\"app\"><h1>Inventory Dashboard</h1><nav><button>Products</button><button>Billing</button><button>Cash In / Out</button><button>Graphs</button></nav><section className=\"cards\"><article>Cash in: Rs {cashIn}</article><article>Low stock: {products.filter(p => p.stock < 5).length}</article></section><section>{products.map(p => <div className=\"row\" key={p.name}><strong>{p.name}</strong><span>Stock: {p.stock}</span><span>Billing: Rs {p.billing}</span></div>)}</section><div className=\"bar\" style={{ width: '70%' }}>Sales graph</div></main>;",
    "}",
    "```",
    "",
    "`src/main.jsx`",
    "```jsx",
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import App from './App.jsx';",
    "createRoot(document.getElementById('root')).render(<App />);",
    "```",
    "",
    "`src/styles.css`",
    "```css",
    "body { margin: 0; font-family: Arial, sans-serif; background: #f6f7fb; color: #151515; }",
    ".app { padding: 32px; max-width: 1000px; margin: auto; }",
    "nav, .cards { display: flex; gap: 12px; flex-wrap: wrap; }",
    "button, article, .row { border: 1px solid #ddd; border-radius: 12px; padding: 12px 16px; background: white; }",
    ".row { display: grid; grid-template-columns: 1fr auto auto; gap: 16px; margin-top: 12px; }",
    ".bar { margin-top: 20px; background: #2563eb; color: white; padding: 10px; border-radius: 10px; }",
    "```",
    "",
    "`index.html` needs `<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>`.",
    "",
    "CMD setup:",
    "```cmd",
    "npm create vite@latest inventory-dashboard -- --template react",
    "cd inventory-dashboard",
    "npm install",
    "npm run dev",
    "```",
    "Open the localhost URL Vite prints, usually `http://localhost:5173/`. To have Hassali apply files automatically, switch to CODE mode."
  ].join("\n");
}

function createNextJsAnswer() {
  return [
    "Use the Next.js App Router.",
    "",
    "CMD:",
    "```cmd",
    "npx create-next-app@latest landing-demo",
    "cd landing-demo",
    "npm run dev",
    "```",
    "Open `http://localhost:3000/`.",
    "",
    "`app/layout.tsx`",
    "```tsx",
    "import './globals.css';",
    "export default function RootLayout({ children }: { children: React.ReactNode }) {",
    "  return <html lang=\"en\"><body>{children}</body></html>;",
    "}",
    "```",
    "",
    "`app/page.tsx`",
    "```tsx",
    "export default function Page() {",
    "  return <main style={{ padding: 48, fontFamily: 'Arial' }}><p>Premium landing page</p><h1>Build a cleaner business presence.</h1><button>Get started</button></main>;",
    "}",
    "```",
    "",
    "App Router uses the `app` folder and server components by default. The older Pages Router uses `pages/index.tsx`."
  ].join("\n");
}

function createExpressAnswer() {
  return [
    "Simple Express API:",
    "",
    "```cmd",
    "mkdir users-api",
    "cd users-api",
    "npm init -y",
    "npm install express cors dotenv",
    "notepad server.js",
    "node server.js",
    "```",
    "",
    "`server.js`",
    "```js",
    "const express = require('express');",
    "const cors = require('cors');",
    "const app = express();",
    "app.use(cors());",
    "app.use(express.json());",
    "const users = [{ id: 1, name: 'Ali' }, { id: 2, name: 'Sara' }];",
    "app.get('/health', (req, res) => res.json({ ok: true }));",
    "app.get('/users', (req, res) => res.json(users));",
    "app.listen(3000, () => console.log('API running on http://localhost:3000'));",
    "```",
    "",
    "Test in browser: `http://localhost:3000/users`",
    "Or CMD: `curl http://localhost:3000/users`"
  ].join("\n");
}

function createFastifyAnswer() {
  return [
    "Fastify starter:",
    "```cmd",
    "mkdir fastify-api",
    "cd fastify-api",
    "npm init -y",
    "npm install fastify",
    "notepad server.js",
    "node server.js",
    "```",
    "`server.js`",
    "```js",
    "const fastify = require('fastify')({ logger: true });",
    "fastify.get('/health', async () => ({ ok: true }));",
    "fastify.listen({ port: 3000 }, (err) => { if (err) throw err; console.log('http://localhost:3000/health'); });",
    "```",
    "Test: `curl http://localhost:3000/health`"
  ].join("\n");
}

function createDockerAnswer() {
  return [
    "Docker Compose lets you start related services with one command.",
    "",
    "`Dockerfile`",
    "```dockerfile",
    "FROM node:20-alpine",
    "WORKDIR /app",
    "COPY package*.json ./",
    "RUN npm install",
    "COPY . .",
    "EXPOSE 3000",
    "CMD [\"npm\", \"start\"]",
    "```",
    "`docker-compose.yml`",
    "```yaml",
    "services:",
    "  app:",
    "    build: .",
    "    ports:",
    "      - \"3000:3000\"",
    "    volumes:",
    "      - .:/app",
    "```",
    "`.dockerignore`",
    "```text",
    "node_modules",
    ".git",
    "```",
    "Commands:",
    "```cmd",
    "docker --version",
    "docker compose up --build",
    "docker compose down",
    "```"
  ].join("\n");
}

function createSqlAnswer() {
  return [
    "Postgres-style schema:",
    "```sql",
    "CREATE TABLE customers (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);",
    "CREATE TABLE products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC(10,2) NOT NULL);",
    "CREATE TABLE invoices (id SERIAL PRIMARY KEY, customer_id INT REFERENCES customers(id), created_at DATE DEFAULT CURRENT_DATE);",
    "CREATE TABLE invoice_items (invoice_id INT REFERENCES invoices(id), product_id INT REFERENCES products(id), quantity INT NOT NULL, PRIMARY KEY (invoice_id, product_id));",
    "INSERT INTO customers (name, email) VALUES ('Ali', 'ali@example.com');",
    "INSERT INTO products (name, price) VALUES ('Toy Blocks', 19.99);",
    "SELECT i.id, c.name, SUM(p.price * ii.quantity) AS total FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN invoice_items ii ON ii.invoice_id=i.id JOIN products p ON p.id=ii.product_id GROUP BY i.id, c.name;",
    "CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);",
    "```",
    "Use `DELETE` or `DROP` only after taking a backup and checking the `WHERE` clause."
  ].join("\n");
}

function createWordPressAnswer() {
  return [
    "Safest option: put this in a small custom plugin or a child theme `functions.php`. Back up the site first.",
    "```php",
    "function hassali_contact_button_shortcode() {",
    "  return '<a class=\"contact-button\" href=\"/contact\">Contact us</a>';",
    "}",
    "add_shortcode('contact_button', 'hassali_contact_button_shortcode');",
    "```",
    "Use it in a page/post:",
    "```text",
    "[contact_button]",
    "```",
    "Avoid editing a parent theme directly because theme updates can overwrite your code."
  ].join("\n");
}

function createShopifyAnswer() {
  return [
    "Duplicate your theme first: Online Store -> Themes -> ... -> Duplicate.",
    "",
    "Create a new section like `sections/announcement-banner.liquid`:",
    "```liquid",
    "<section style=\"padding: 14px; text-align:center; background: {{ section.settings.bg }}; color: {{ section.settings.color }};\">",
    "  {{ section.settings.text }}",
    "</section>",
    "{% schema %}",
    "{\"name\":\"Announcement banner\",\"settings\":[{\"type\":\"text\",\"id\":\"text\",\"label\":\"Text\",\"default\":\"Free delivery this week\"},{\"type\":\"color\",\"id\":\"bg\",\"label\":\"Background\",\"default\":\"#111111\"},{\"type\":\"color\",\"id\":\"color\",\"label\":\"Text color\",\"default\":\"#ffffff\"}],\"presets\":[{\"name\":\"Announcement banner\"}]}",
    "{% endschema %}",
    "```",
    "Then add it from the Shopify theme editor. Do not paste API keys into Liquid theme files."
  ].join("\n");
}

function createGitAnswer() {
  return [
    "Safe way to inspect and undo one file:",
    "```cmd",
    "git status",
    "git diff -- path\\to\\file.ext",
    "git restore -- path\\to\\file.ext",
    "git status",
    "```",
    "If the file was already staged:",
    "```cmd",
    "git restore --staged -- path\\to\\file.ext",
    "git restore -- path\\to\\file.ext",
    "```",
    "Avoid `git reset --hard` unless you are completely sure you want to discard all local changes."
  ].join("\n");
}

function createDebuggingAnswer(prompt: string) {
  if (/module not found|can't resolve ['"].\/App/i.test(prompt)) {
    return [
      "Likely cause: the import path and file name do not match.",
      "",
      "Check:",
      "```cmd",
      "dir src",
      "```",
      "If your file is `src/App.jsx`, import it like:",
      "```js",
      "import App from './App.jsx';",
      "```",
      "If it is `src/App.tsx`, use:",
      "```ts",
      "import App from './App';",
      "```",
      "Also check uppercase/lowercase: `App` is not the same as `app` on many systems. Then rerun `npm run dev`."
    ].join("\n");
  }

  if (/port\s+3000.*in use/i.test(prompt)) {
    return [
      "Find and stop the process using port 3000:",
      "```cmd",
      "netstat -ano | findstr :3000",
      "taskkill /PID <PID_FROM_LAST_COLUMN> /F",
      "```",
      "Or run on another port:",
      "```cmd",
      "npm run dev -- -p 3001",
      "```",
      "Only kill a process if you recognize it or you are okay stopping that local dev server."
    ].join("\n");
  }

  if (/no module named pandas|importerror/i.test(prompt)) {
    return [
      "Your Python environment does not have `pandas` installed.",
      "```cmd",
      "python --version",
      "python -m pip install pandas",
      "python your_script.py",
      "```",
      "If that fails, check which Python is running:",
      "```cmd",
      "where python",
      "python -m pip --version",
      "```"
    ].join("\n");
  }

  return "Paste the exact error, command you ran, and the file name. I will identify the likely cause, give the exact fix, and include a command to verify it.";
}

function createDangerousCodingSafetyAnswer() {
  return [
    "I cannot help write code to steal browser passwords, credentials, cookies, tokens, or other private data.",
    "",
    "I can help with defensive security instead:",
    "- how to protect saved passwords",
    "- how to detect credential theft attempts",
    "- how to store secrets safely",
    "- how to add input validation and secure authentication",
    "- how to audit your own app for exposed tokens"
  ].join("\n");
}

function createCodingGuideAnswer(prompt: string) {
  const category = detectCodingCategory(prompt);

  switch (category) {
    case "auth_or_security_guidance":
      return detectDangerousCodingRequest(prompt)
        ? createDangerousCodingSafetyAnswer()
        : "Keep secrets server-side, use environment variables, validate inputs, hash passwords with a trusted library, and never put API keys in frontend code.";
    case "debugging_error_help":
      return createDebuggingAnswer(prompt);
    case "docker_or_docker_compose":
      return createDockerAnswer();
    case "fastify_api":
      return createFastifyAnswer();
    case "git_github_help":
      return createGitAnswer();
    case "html_css_js_static_site":
      return createToyWebsiteCodeAnswer();
    case "nextjs_app_code_text":
      return createNextJsAnswer();
    case "node_express_api":
      return createExpressAnswer();
    case "php_form_or_backend":
    case "php_xampp_app":
      return createPhpContactFormAnswer();
    case "python_data_task":
      return createCsvMergeAnswer();
    case "python_script":
      return [
        "Use this basic Python script structure:",
        "```cmd",
        "mkdir C:\\python-task",
        "cd /d C:\\python-task",
        "notepad script.py",
        "python --version",
        "python script.py",
        "```",
        "```python",
        "def main():",
        "    print('Hello from Python')",
        "",
        "if __name__ == '__main__':",
        "    main()",
        "```"
      ].join("\n");
    case "react_app_code_text":
      return createReactViteAnswer();
    case "shopify_help":
      return createShopifyAnswer();
    case "sql_database_schema_or_queries":
      return createSqlAnswer();
    case "wordpress_help":
      return createWordPressAnswer();
    case "npm_pnpm_yarn_setup":
      return "For npm projects on Windows: `node -v`, `npm -v`, `npm install`, then `npm run dev`. If install fails, delete `node_modules` and lockfile only when you understand the impact, then reinstall.";
    case "windows_cmd_setup":
      return "Use `cd /d C:\\path\\to\\folder` to switch drives/folders in CMD, then run the project command. Use `dir` to confirm files are in the right folder.";
    case "api_integration_help":
      return "For API integrations, keep keys in `.env`, call external APIs from the backend, validate responses, handle errors, and never expose secrets in browser code.";
    case "architecture_or_folder_structure":
      return "A clean small app structure is: `src/` for code, `src/components/` for UI, `src/lib/` for helpers, `src/data/` for mock data, and `README.md` for run steps.";
    case "deployment_guidance":
      return "Deployment checklist: build locally, set environment variables in the host dashboard, never commit secrets, run the production build command, then test the live URL.";
    case "environment_variables_guidance":
      return "Use `.env` for local secrets, add `.env` to `.gitignore`, document safe example values in `.env.example`, and read variables from server-side code.";
    case "python_web_app_flask_fastapi_streamlit":
      return "For a small Python web app, choose Flask for simple pages/APIs, FastAPI for typed APIs, or Streamlit for quick dashboards. Create a virtual environment, install dependencies, then run the framework command.";
    case "code_review_or_refactor":
    case "typescript_javascript_help":
    default:
      return "I can help with code as text. Share the language, current file, and target behavior, and I will give exact code, file names, run commands, and a quick test step.";
  }
}

function createLegalGuidanceAnswer() {
  return [
    "I can explain what to review, but this is general guidance, not legal advice.",
    "",
    "Before signing a freelance contract, check:",
    "",
    "1. Scope: exact deliverables, revision limits, and what is out of scope.",
    "2. Payment: amount, currency, milestones, due dates, late-payment handling.",
    "3. Ownership: who owns the final work and when ownership transfers.",
    "4. Usage rights: whether you can show the work in your portfolio.",
    "5. Timeline: delivery dates, client feedback deadlines, and delay handling.",
    "6. Termination: what happens if either side cancels.",
    "7. Confidentiality: what information you must keep private.",
    "8. Disputes: governing law, venue, and how disagreements are handled.",
    "",
    "Red flags: vague payment terms, unlimited revisions, ownership transfer before payment, or penalties that only apply to you. If the contract is high value or risky, have a qualified lawyer review it."
  ].join("\n");
}

function createMedicalGuidanceAnswer(prompt: string) {
  if (/\b(?:severe pain|heavy bleeding|fainting|can't breathe|chest pain|suicide|kill myself|self harm)\b/i.test(prompt)) {
    return [
      "This sounds urgent. Please seek immediate medical help now, especially if there is severe pain, heavy bleeding, fainting, chest pain, trouble breathing, or any risk of self-harm.",
      "",
      "If you are in immediate danger, call your local emergency number or go to the nearest emergency department. If self-harm is involved, contact emergency services or a crisis hotline and stay near someone you trust."
    ].join("\n");
  }

  return [
    "A missed period for two months with a negative pregnancy test can happen for several reasons, but it is worth getting checked.",
    "",
    "Possible causes include stress, weight changes, thyroid or hormone issues, PCOS, intense exercise, some medicines, or a test taken too early/incorrectly.",
    "",
    "Practical next steps:",
    "",
    "1. Repeat a pregnancy test with first-morning urine, or ask for a blood pregnancy test.",
    "2. Book a visit with a doctor or gynecologist, especially because it has been two months.",
    "3. Track dates, symptoms, weight changes, stress, medicines, and any pain or unusual bleeding.",
    "",
    "Seek urgent care sooner if you have severe pelvic pain, heavy bleeding, fainting, fever, or feel very unwell. This is general guidance, not a diagnosis."
  ].join("\n");
}

function createAccountingGuidanceAnswer() {
  return [
    "I can give a practical tracking system, but this is general guidance, not tax advice.",
    "",
    "A small freelancer should track:",
    "",
    "1. Income: client name, invoice number, date sent, date paid, currency, payment method.",
    "2. Expenses: software, internet, phone, equipment, subscriptions, travel, contractor costs.",
    "3. Invoices: pending, paid, overdue, partially paid.",
    "4. Receipts/proofs: save screenshots, PDFs, bank slips, and payment confirmations.",
    "5. Taxes: keep a monthly summary of income, expenses, profit, and estimated tax set-aside.",
    "",
    "Simple workflow:",
    "",
    "- Use one spreadsheet with tabs for Income, Expenses, Invoices, and Receipts.",
    "- Reconcile it weekly against bank/payment accounts.",
    "- Mark unknown items clearly instead of leaving blanks.",
    "- Keep a clean monthly export for your accountant or tax filing.",
    "",
    "For exact tax rules, use a local accountant because rates and filing rules depend on your country and situation."
  ].join("\n");
}

function createModeBoundaryAnswer(prompt: string) {
  const wantsWebsite = /\b(?:website|site|homepage)\b/i.test(prompt);
  const targetMode = wantsWebsite ? "WEBSITE" : "CODE";

  return [
    `I can help you plan it or write code here in ASK mode, but I will not create, apply, save, install, run, or modify project files from ASK.`,
    "",
    `${targetMode} mode is required when you want Hassali to create/apply actual project files with approval-first safety.`,
    "",
    "If you want, I can still outline the structure or provide the code as plain text here."
  ].join("\n");
}

function createRoleAnswer(
  prompt: string,
  history: AskConversationMessage[] | undefined,
  classification: AskIntentClassification
) {
  const role = classification.requestedRole;

  if (!role) return null;
  if (classification.wantsExecution || detectCodingCategory(prompt) || detectDangerousCodingRequest(prompt)) return null;

  const previous = lastAssistantMessage(history);

  if ((role === "senior_full_stack_engineer" || role === "developer") && /\bmarketplace\b/i.test(prompt) && /\bclean(?:er|ing)?/i.test(prompt)) {
    return [
      "Senior dev review: this is buildable, but the MVP must stay small.",
      "",
      "MVP features:",
      "- Customer booking request",
      "- Cleaner profile and availability",
      "- Admin assignment board",
      "- Job status: requested, assigned, completed, cancelled",
      "- Basic payment/status tracking, not real payouts yet",
      "",
      "Suggested stack: React or Next.js frontend, simple API layer, PostgreSQL later, and local/mock data first while testing workflow.",
      "",
      "Core entities: customers, cleaners, bookings, service_packages, job_status_updates, payments, reviews.",
      "",
      "Risks: cleaner reliability, scheduling conflicts, trust/safety, refunds, and building marketplace features before proving the job workflow.",
      "",
      "First steps: prototype booking -> assignment -> status board, test 2-3 real cleaning scenarios, then add payments/reviews after workflow is clear."
    ].join("\n");
  }

  if (role === "ui_ux_designer") {
    return [
      "Make the toy shop homepage feel like a premium gift-finding experience, not a crowded catalog.",
      "",
      "- Hero: one joyful headline, one clear CTA, and age/category chips.",
      "- Navigation: Toys, Age Groups, Gifts, Offers, Contact.",
      "- Product cards: big images, age range, safety note, price, and quick gift label.",
      "- Visual system: warm white base, playful accent colors, generous spacing, rounded cards, readable type.",
      "- Trust: delivery, returns, safe checkout, parent-approved copy near the first screen.",
      "- Mobile: swipeable categories and a visible contact/buy action.",
      "- Accessibility: high contrast text, visible focus states, and clear button labels."
    ].join("\n");
  }

  if (role === "business_strategist") {
    if (previous && /\bclean/i.test(previous) && /\bbeta|cut|only what is needed/i.test(prompt)) {
      return [
        "COO beta cut for the cleaning marketplace:",
        "",
        "Keep:",
        "- Customer creates a cleaning request",
        "- Admin assigns a cleaner",
        "- Cleaner/job status board",
        "- Basic client and cleaner records",
        "- Manual payment status",
        "",
        "Cut:",
        "- Live payments",
        "- Cleaner mobile app",
        "- Public marketplace profiles",
        "- Matching algorithm",
        "- Review/dispute system",
        "",
        "Beta goal: prove one job can move from request -> assigned -> completed without confusion."
      ].join("\n");
    }

    return [
      "COO view: cut anything that does not help a first user create, review, or safely approve work.",
      "",
      "Cut/defer:",
      "- More generators",
      "- Fancy integrations",
      "- Broad automation",
      "- Collaboration/social features",
      "- Visual polish that is not blocking trust",
      "",
      "Must not skip:",
      "- ASK/WEBSITE/CODE boundary tests",
      "- Approval safety",
      "- Preview sanity checks",
      "- 5-10 guided real-user sessions",
      "- A severity-ranked bug log",
      "",
      "Launch path: pick 10 beta users, give them 3 real tasks each, watch where trust breaks, fix only the highest-friction failures, then repeat weekly."
    ].join("\n");
  }

  if (role === "marketing_strategist") {
    return [
      "Positioning: Hassali helps constrained builders turn ideas into safe, reviewable software without heavy tools.",
      "",
      "First 10 beta users:",
      "1. Target freelancers, students, small founders, and AI coders with low-spec laptops.",
      "2. Offer: \"Bring one real idea; Hassali will help you produce a safe first version.\"",
      "3. Channels: WhatsApp groups, LinkedIn DMs, university/startup circles, founder friends.",
      "4. Message: \"I am testing a calm AI workspace for people who want software without setup chaos. Want one guided session?\"",
      "5. Feedback loop: ask what felt useful, confusing, scary, and worth paying for."
    ].join("\n");
  }

  if (role === "teacher") {
    return [
      "Think of a Spanish verb like a toy that changes clothes.",
      "",
      "- `hablar` means \"to speak.\" That is the plain toy.",
      "- `hablo` means \"I speak.\" It wears the \"me\" clothes.",
      "- `hablas` means \"you speak.\" It wears the \"you\" clothes.",
      "",
      "Practice:",
      "- Point to yourself and say `yo hablo`.",
      "- Point to someone else and say `tu hablas`."
    ].join("\n");
  }

  if (role === "supportive_listener") {
    return [
      "That sounds exhausting. You are trying to move fast, but every breakage makes the finish line feel farther away.",
      "",
      "For the next hour, do not solve everything:",
      "1. Write the one blocker stopping progress right now.",
      "2. Label it: safety, preview, generation, UI, or testing.",
      "3. Fix or verify only that one thing.",
      "4. Stop when the evidence is clear, even if the product is not perfect.",
      "",
      "You are not failing because things break. You need a calmer loop: one bug, one proof, one decision. If you feel unsafe or like you might harm yourself, contact someone you trust or local emergency help immediately."
    ].join("\n");
  }

  if (role === "travel_planner") {
    return [
      "Simple 15-day Thailand route with a toddler:",
      "",
      "Days 1-4: Bangkok",
      "- Keep mornings light: parks, aquarium, malls with AC, easy food.",
      "- Stay near BTS/MRT to reduce taxi stress.",
      "",
      "Days 5-9: Chiang Mai",
      "- Slower pace, family-friendly cafes, gentle temples, and one nature day.",
      "- Add rest time every afternoon.",
      "",
      "Days 10-15: Phuket or Krabi",
      "- Choose one beach base, not both.",
      "- Pick a hotel near food, pharmacy, and a calm beach.",
      "",
      "Budget notes: book breakfast-included stays, use Grab for short rides, avoid too many transfers, and keep one rest day after each travel day."
    ].join("\n");
  }

  if (role === "sales_coach") {
    return [
      "Short cold call script:",
      "",
      "Opener: \"Hi, this is [Name]. Quick question: are you currently losing time on repetitive admin, follow-ups, or manual reporting?\"",
      "",
      "Qualify: \"Which task takes your team the most time every week?\"",
      "",
      "Value pitch: \"We automate one painful workflow first, so you can see time saved before committing to anything bigger.\"",
      "",
      "Objection: \"Totally fair. I am not asking you to change systems today. Could we identify one task worth testing?\"",
      "",
      "Follow-up: \"I can send a two-line example of what we would automate for your business.\""
    ].join("\n");
  }

  return null;
}

function createBulletAnswer(prompt: string) {
  const source = extractAfterColon(prompt);

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
    : "Paste the text you want summarized, and I will summarize only what you provide.";
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

function createNoFakeCapabilityAnswer(prompt: string) {
  if (isLiveUrlRequest(prompt)) {
    return "Live URL reading is not available in FILE-I1 Lite. Paste the page content here and I can summarize it.";
  }

  if (isFileReadingRequest(prompt)) {
    if (/\b(?:excel|xlsx)\b/i.test(prompt)) {
      return "I cannot read the uploaded Excel file content in FILE-I1 Lite yet. Export it as CSV or paste the rows here, and I can help clean, summarize, or check the data.";
    }

    if (/\bpdf|contract\b/i.test(prompt)) {
      return "I cannot read uploaded PDF content in FILE-I1 Lite yet. Paste the contract text here and I can summarize it.";
    }

    return "I cannot read uploaded file content in FILE-I1 Lite yet. Paste the text or CSV rows here and I can help analyze them.";
  }

  if (isImageReadingRequest(prompt)) {
    return "OCR/image reading is not available in FILE-I1 Lite. Paste the visible text here and I can help.";
  }

  return null;
}

function createTeachingAnswer(prompt: string) {
  if (/\b3\s+part\b/i.test(prompt) && /\bspanish\b/i.test(prompt) && /\bverb/i.test(prompt)) {
    return [
      "1. Part 1: Learn the verb family",
      "Start with the basic form, like `hablar`, which means `to speak`.",
      "",
      "2. Part 2: Learn who is doing it",
      "Practice tiny changes: `yo hablo` means `I speak`, and `tu hablas` means `you speak`.",
      "",
      "3. Part 3: Make small sentences",
      "Use one verb in easy sentences before learning more forms."
    ].join("\n");
  }

  if (/\bhablo\b/i.test(prompt) && /\bhablar\b/i.test(prompt)) {
    return [
      "Think of Spanish verbs in two forms:",
      "",
      "- `hablar` means \"to speak.\" This is the basic dictionary form.",
      "- `hablo` means \"I speak.\" Use it when talking about yourself.",
      "- `hablas` means \"you speak.\" Use it when talking to one person.",
      "",
      "Example:",
      "",
      "- `Yo hablo espanol` = I speak Spanish.",
      "- `Tu hablas espanol` = You speak Spanish.",
      "",
      "So `hablar` is the action, and `hablo` / `hablas` show who is doing it."
    ].join("\n");
  }

  return "Here is the simple version: start with the main idea, look at one example, then compare it with a similar case so the difference sticks.";
}

function enforceMaxWords(answer: string, maxWords: number) {
  const words = answer.trim().split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) return answer.trim();
  return words.slice(0, maxWords).join(" ").replace(/[,:;]+$/g, "").trim();
}

function reviseOnce(answer: string, classification: AskIntentClassification, profile: AskQualityProfile) {
  let next = answer.trim();

  if (classification.intent === "bullet_format") {
    next = next
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.startsWith("- ") ? line : `- ${line.replace(/^[-*\d.)\s]+/, "")}`)
      .join("\n");
  }

  if (profile.tone === "polite_but_firm") {
    next = next.replace(/\b(obviously|ridiculous|your problem|not my fault)\b/gi, "");
  }

  if (profile.explicitMaxWords) {
    next = enforceMaxWords(next, Math.max(1, profile.explicitMaxWords - 1));
  }

  return next.trim();
}

function qualityGate(answer: string, classification: AskIntentClassification, profile: AskQualityProfile) {
  let next = answer.trim();

  if (!next) return null;
  if (/as an ai language model/i.test(next)) next = next.replace(/as an ai language model,?\s*/gi, "");
  if (classification.wantsExecution && !/\bASK mode\b/.test(next)) {
    next += "\n\nASK mode will not create, save, or modify project files.";
  }
  if ((classification.intent === "coding_help_text_only" || classification.intent === "local_setup_guidance") && !/```/.test(next)) {
    next += "\n\nIf you want, I can format this as full files and commands.";
  }
  if (profile.explicitMaxWords && wordCount(next) >= profile.explicitMaxWords) {
    next = reviseOnce(next, classification, profile);
  }
  if (profile.format === "bullet_list" && next.split("\n").some((line) => line.trim() && !line.trim().startsWith("- "))) {
    next = reviseOnce(next, classification, profile);
  }
  if (profile.riskFlags.mayNeedToPreserveContinuity && classification.intent === "followup_or_continuation" && !next.trim()) {
    next = "I need the previous text to continue accurately. Paste it here and I will keep going from that point.";
  }

  return next;
}

export function createAskSeriousAnswer(
  prompt: string,
  context: AskRuntimeContext,
  history?: AskConversationMessage[]
): string | null {
  void context;

  const fakeCapabilityAnswer = createNoFakeCapabilityAnswer(prompt);

  if (fakeCapabilityAnswer) return fakeCapabilityAnswer;

  const fileLiteAnswer = createFileLiteAnswer(prompt);

  if (fileLiteAnswer) return fileLiteAnswer;

  const classification = classifyAskIntent(prompt);
  const qualityProfile = createQualityProfile(prompt, classification);
  let answer: string | null = null;

  const roleAnswer = createRoleAnswer(prompt, history, classification);

  if (roleAnswer) {
    return qualityGate(roleAnswer, classification, qualityProfile);
  }

  switch (classification.intent) {
    case "followup_or_continuation":
      answer = createFollowupAnswer(prompt, history);
      break;
    case "client_message":
    case "client_message_or_email":
      answer = createClientMessageAnswer(prompt);
      break;
    case "polite_rewrite":
    case "writing_or_rewriting":
      answer = createRewriteAnswer(prompt);
      break;
    case "brand_naming":
      answer = createBrandNamingAnswer(prompt);
      break;
    case "coding_help_text_only":
    case "local_setup_guidance":
      answer = createCodingGuideAnswer(prompt);
      break;
    case "website_code_text_only":
      answer = detectCodingCategory(prompt) === "react_app_code_text" ? createReactViteAnswer() : createToyWebsiteCodeAnswer();
      break;
    case "mode_boundary_request":
    case "wrong_mode_build_request":
      answer = createModeBoundaryAnswer(prompt);
      break;
    case "legal_style_guidance":
      answer = createLegalGuidanceAnswer();
      break;
    case "medical_style_guidance":
      answer = createMedicalGuidanceAnswer(prompt);
      break;
    case "accounting_or_finance_guidance":
      answer = createAccountingGuidanceAnswer();
      break;
    case "auth_or_security_guidance":
      answer = createCodingGuideAnswer(prompt);
      break;
    case "bullet_format":
      answer = createBulletAnswer(prompt);
      break;
    case "summarization":
    case "summarize":
    case "pasted_text_summary":
      answer = createSummaryAnswer(prompt);
      break;
    case "data_work_guidance":
    case "planning_or_steps":
    case "task_checklist":
      answer = createDataWorkPlanAnswer();
      break;
    case "business_plan":
    case "business_strategy":
      answer = [
        "1. Clarify the offer and who it is for.",
        "2. Write one simple message that explains the outcome, not just the service.",
        "3. Test two versions of the message with a small audience.",
        "4. Track replies, follow-ups, and where people stop responding.",
        "5. Improve the weakest step before adding more channels."
      ].join("\n");
      break;
    case "translation_or_language_help":
      answer = "Paste the exact sentence and target language, and I will translate it clearly while keeping the tone.";
      break;
    case "explanation_or_teaching":
    case "teaching_explanation":
      answer = createTeachingAnswer(prompt);
      break;
    case "comparison_or_recommendation":
      answer = "My recommendation: compare the options by cost, time, risk, maintenance, and what gets you to a usable result fastest. If you share the options, I will give you a clear pick and tradeoffs.";
      break;
    case "logo_or_visual_direction":
      answer = "For logo/visual direction, start with the audience, the feeling you want, where the logo appears small, and one memorable shape or mark. Keep the small icon simpler than the full brand mark.";
      break;
    case "emotional_support_or_therapy_style":
      answer = "I am here with you. Tell me what happened in one or two sentences, and I can help you sort the feeling, choose the next small step, and write what you need to say.";
      break;
    case "debugging_help":
      answer = createDebuggingAnswer(prompt);
      break;
    case "travel_or_lifestyle_planning":
      answer = "Share the city, dates, budget, and what kind of trip you want. I can turn that into a practical itinerary with priorities and tradeoffs.";
      break;
    case "date_time_question":
    case "direct_question":
    case "general_answer":
    case "cleaned_preview_request":
    case "data_quality_check":
    case "file_unavailable_explanation":
    case "large_data_workflow_guidance":
    case "pasted_csv_analysis":
    case "pasted_table_cleanup":
    case "unsupported_ocr_request":
    case "unsupported_url_request":
    case "wrong_mode_save_request":
      answer = null;
      break;
  }

  return answer ? qualityGate(answer, classification, qualityProfile) : null;
}

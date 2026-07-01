import type {
  SelfReviewIssue,
  SelfReviewMode,
  SelfReviewRuleId
} from "@/lib/self-review-types";
import type {
  SelfReviewFile,
  SelfReviewReviewer
} from "@/lib/server/ai/self-review/engine";
import {
  createIssue,
  createReport
} from "@/lib/server/ai/self-review/review-helpers";

type HtmlPage = SelfReviewFile & {
  links: Array<{ href: string; label: string }>;
};

const placeholderPatterns = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\btodo\b/i,
  /\bcoming soon\b/i,
  /\bproduct-led storefront\b/i,
  /\bproduct showcase\b/i,
  /\bcategory tiles\b/i,
  /\bproduct cards\b/i,
  /\bbusiness visuals\b/i,
  /\bservice proof\b/i,
  /\bclean business\b/i,
  /\bservices\/offers\b/i,
  /\bcatalog_commerce\b/i,
  /\bCurrent Prompt Website\b/i,
  /\bcontact\s*\/\s*unknown\b/i,
  /\bdomain-specific hero\b/i,
  /\bproduct proof\s*\/\s*contact path\b/i,
  /\bunknown with clear guidance\b/i,
  /\bSupport, warranty, shipping, and contact details for Current Prompt Website\b/i,
  /\bdocument dataset domain\s*=\s*Current Prompt Website\b/i
];

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

function isUnsafePath(path: string) {
  return !path || path.includes("..") || path.startsWith("/") || /^[a-z]:\//i.test(path);
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const map: Record<string, string> = {
    home: "index.html",
    index: "index.html",
    about: "about.html",
    contact: "contact.html"
  };

  return map[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function isExternalHref(href: string) {
  return /^(?:https?:|mailto:|tel:|#)/i.test(href.trim());
}

function normalizeHref(href: string) {
  const withoutHash = href.split("#")[0] ?? href;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;

  return normalizePath(withoutQuery || "index.html") || "index.html";
}

function stripTags(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function visibleText(value: string) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function extractLinks(content: string) {
  const links: Array<{ href: string; label: string }> = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(content)) !== null) {
    links.push({
      href: match[1] ?? "",
      label: visibleText(match[2] ?? "")
    });
  }

  return links;
}

function extractRefs(content: string, pattern: RegExp) {
  const refs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    refs.push(match[1] ?? "");
  }

  return refs.filter(Boolean);
}

function hasEmailOrForm(content: string) {
  return /mailto:|<form\b|type=["']email["']|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(content);
}

function requestedCarRental(prompt: string, domain?: string | null) {
  const text = `${prompt} ${domain ?? ""}`;

  return /\b(?:car rental|rent a car|vehicle rental|car showroom|auto rental|fleet rental)\b/i.test(text);
}

function containsCyclingDomain(text: string) {
  return /\b(?:cycling house|bicycle|bicycles|bike|bikes|rider|cycling|showroom tune-up|gear fitting)\b/i.test(text);
}

function containsSaasCopy(text: string) {
  return /\b(?:saas|subscription|conversion funnel|conversion copy|software dashboard|product-led|pipeline automation|tenant|workspace analytics)\b/i.test(text);
}

function ruleForCategory(category: string): SelfReviewRuleId {
  if (category.includes("navigation")) return "NAV001";
  if (category.includes("reference")) return "LINK001";
  if (category.includes("copy")) return "COPY001";
  if (category.includes("contact") || category.includes("section")) return "UX001";
  if (category.includes("manifest") || category.includes("path")) return "SECURITY001";
  return "STRUCT001";
}

function titleForCategory(category: string) {
  return category
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function addIssue(
  list: SelfReviewIssue[],
  input: {
    category: string;
    confidence?: number;
    description: string;
    domain?: string | null;
    evidence?: SelfReviewIssue["evidence"];
    generator: string;
    id: string;
    location?: SelfReviewIssue["location"];
    mode: SelfReviewMode;
    projectId?: string | null;
    recommendedFix: string;
    repairable?: boolean;
    repairStrategy?: string;
    ruleId?: SelfReviewRuleId;
    severity: SelfReviewIssue["severity"];
    timestamp: number;
    title?: string;
  }
) {
  list.push(createIssue({
    ...input,
    evidence: input.evidence ?? [
      {
        found: input.location?.path ?? input.description,
        source: input.location?.path ?? "website_proposal"
      }
    ],
    repairStrategy: input.repairStrategy ?? "regenerate_or_patch_specific_website_file",
    ruleId: input.ruleId ?? ruleForCategory(input.category),
    title: input.title ?? titleForCategory(input.category),
    reviewer: "WebsiteReviewer"
  }));
}

export const websiteReviewer: SelfReviewReviewer = {
  id: "WebsiteReviewer",
  supports: (input) => input.mode === "WEBSITE",
  review: (input) => {
    const timestamp = Date.now();
    const failures: SelfReviewIssue[] = [];
    const warnings: SelfReviewIssue[] = [];
    const normalizedFiles = input.files.map((file) => ({
      ...file,
      path: normalizePath(file.path)
    }));
    const fileMap = new Map(normalizedFiles.map((file) => [file.path, file]));
    const htmlPages: HtmlPage[] = normalizedFiles
      .filter((file) => file.path.endsWith(".html"))
      .map((file) => ({
        ...file,
        links: extractLinks(file.content)
      }));
    const expectedPages = Array.from(new Set([
      ...(input.requestedPages ?? []).map(pageToPath),
      ...(input.requiredFiles ?? []).filter((path) => path.endsWith(".html")).map(normalizePath)
    ]));
    const generatedPublicText = visibleText(normalizedFiles.map((file) => file.content).join("\n"));
    const websiteContract = input.intentContract?.mode === "WEBSITE" ? input.intentContract : null;

    if (websiteContract) {
      if (websiteContract.confidence < 0.58 || websiteContract.generatorStrategy === "clarify_domain_before_generation") {
        addIssue(failures, {
          category: "taxonomy",
          confidence: Math.max(0.55, websiteContract.confidence),
          description: websiteContract.assumptionNotes.join(" ") || "Domain classification confidence is too low for safe generation.",
          domain: input.domain,
          evidence: [
            {
              expected: "high-confidence taxonomy domain",
              found: websiteContract.domainId ?? "ambiguous/unknown",
              source: "intent_contract"
            }
          ],
          generator: input.generator,
          id: "website_taxonomy_low_confidence",
          mode: input.mode,
          recommendedFix: "Ask a clarifying question or regenerate after the user confirms the intended industry.",
          repairStrategy: "clarify_domain_before_generation",
          ruleId: websiteContract.generatorStrategy === "clarify_domain_before_generation" ? "TAXONOMY002" : "TAXONOMY001",
          severity: "high",
          timestamp,
          title: websiteContract.generatorStrategy === "clarify_domain_before_generation" ? "Ambiguous Domain" : "Low-Confidence Domain Classification"
        });
      }

      if (websiteContract.domainId && input.domain && input.domain !== websiteContract.domainId) {
        addIssue(failures, {
          category: "intent_lock",
          confidence: 0.94,
          description: `Intent contract domain ${websiteContract.domainId} differs from proposal domain ${input.domain}.`,
          domain: input.domain,
          evidence: [
            {
              expected: websiteContract.domainId,
              found: input.domain,
              source: "intent_contract"
            }
          ],
          generator: input.generator,
          id: "website_intent_domain_mismatch",
          mode: input.mode,
          recommendedFix: "Use the current prompt taxonomy contract as the authoritative domain before generation.",
          repairStrategy: "regenerate_from_current_prompt_intent_contract",
          ruleId: "INTENT_LOCK001",
          severity: "high",
          timestamp,
          title: "Current Prompt Intent Was Overridden"
        });
      }

      const expectedVocabularyFound = websiteContract.expectedVocabulary.filter((term) =>
        generatedPublicText.toLowerCase().includes(term.toLowerCase())
      );
      const requiredVocabularyCount = Math.min(3, websiteContract.expectedVocabulary.length);

      if (requiredVocabularyCount > 0 && expectedVocabularyFound.length < requiredVocabularyCount) {
        addIssue(failures, {
          category: "domain_consistency",
          confidence: 0.9,
          description: `Generated copy includes ${expectedVocabularyFound.length} taxonomy vocabulary term(s), expected at least ${requiredVocabularyCount}.`,
          domain: input.domain,
          evidence: [
            {
              expected: websiteContract.expectedVocabulary.slice(0, 8).join(", "),
              found: expectedVocabularyFound.join(", ") || "none",
              source: "website_public_copy"
            }
          ],
          generator: input.generator,
          id: "website_taxonomy_vocabulary_missing",
          mode: input.mode,
          recommendedFix: "Regenerate public copy using the taxonomy contract expectedVocabulary terms.",
          repairStrategy: "regenerate_domain_specific_public_copy",
          ruleId: "WEBSITE_DOMAIN001",
          severity: "high",
          timestamp,
          title: "Taxonomy Vocabulary Missing"
        });
      }

      const forbiddenFound = websiteContract.forbiddenVocabulary.filter((term) =>
        term.length > 2 && generatedPublicText.toLowerCase().includes(term.toLowerCase())
      );

      if (forbiddenFound.length > 0) {
        addIssue(failures, {
          category: "domain_consistency",
          confidence: 0.94,
          description: `Generated output contains conflicting domain vocabulary: ${forbiddenFound.slice(0, 5).join(", ")}.`,
          domain: input.domain,
          evidence: [
            {
              expected: "zero conflicting taxonomy terms",
              found: forbiddenFound.slice(0, 8).join(", "),
              source: "website_public_copy"
            }
          ],
          generator: input.generator,
          id: "website_taxonomy_forbidden_vocabulary",
          mode: input.mode,
          recommendedFix: "Remove conflicting-domain language and regenerate from the current domain contract.",
          repairStrategy: "remove_conflicting_domain_vocabulary",
          ruleId: "DOMAIN_CONFLICT001",
          severity: "high",
          timestamp,
          title: "Conflicting Domain Vocabulary"
        });
      }

      const trustFound = websiteContract.trustSignals.filter((term) =>
        generatedPublicText.toLowerCase().includes(term.toLowerCase())
      );

      if (websiteContract.trustSignals.length > 0 && trustFound.length === 0) {
        addIssue(warnings, {
          category: "completeness",
          confidence: 0.82,
          description: "Generated website does not clearly represent any taxonomy trust signal.",
          domain: input.domain,
          evidence: [
            {
              expected: websiteContract.trustSignals.join(", "),
              found: "none",
              source: "website_public_copy"
            }
          ],
          generator: input.generator,
          id: "website_taxonomy_trust_missing",
          mode: input.mode,
          recommendedFix: "Add one or more trust signals from the taxonomy contract.",
          repairStrategy: "add_domain_trust_signal_copy",
          ruleId: "STRUCT001",
          severity: "medium",
          timestamp,
          title: "Trust Signal Missing"
        });
      }

      const ctasFound = websiteContract.ctas.filter((term) =>
        generatedPublicText.toLowerCase().includes(term.toLowerCase())
      );

      if (websiteContract.ctas.length > 0 && ctasFound.length === 0) {
        addIssue(warnings, {
          category: "conversion",
          confidence: 0.82,
          description: "Generated website does not clearly represent any CTA from the intent contract.",
          domain: input.domain,
          evidence: [
            {
              expected: websiteContract.ctas.join(", "),
              found: "none",
              source: "website_public_copy"
            }
          ],
          generator: input.generator,
          id: "website_contract_cta_missing",
          mode: input.mode,
          recommendedFix: "Add one or more CTA phrases from the generation brief.",
          repairStrategy: "add_contract_cta_copy",
          ruleId: "UX001",
          severity: "medium",
          timestamp,
          title: "Contract CTA Missing"
        });
      }
    }

    if (requestedCarRental(input.prompt, input.domain) && containsCyclingDomain(generatedPublicText)) {
      addIssue(failures, {
        category: "domain_consistency",
        confidence: 0.95,
        description: "The current prompt asks for a car rental or car showroom website, but generated public copy uses bicycle/cycling content.",
        domain: input.domain,
        evidence: [
          {
            expected: "car rental / car showroom",
            found: "bicycle / cycling content",
            source: "website_public_copy"
          }
        ],
        generator: input.generator,
        id: "website_car_rental_generated_cycling",
        mode: input.mode,
        recommendedFix: "Regenerate public copy, navigation, metadata, and page sections for car rental fleets, bookings, vehicle categories, and showroom inquiries.",
        repairStrategy: "regenerate_website_copy_for_requested_car_rental_domain",
        ruleId: "WEBSITE_DOMAIN001",
        severity: "high",
        timestamp,
        title: "Requested Domain Not Honored"
      });
    }

    if (requestedCarRental(input.prompt, input.domain) && containsSaasCopy(generatedPublicText)) {
      addIssue(failures, {
        category: "public_copy_quality",
        confidence: 0.9,
        description: "Generated public copy uses SaaS or software-conversion language in a car rental website request.",
        domain: input.domain,
        evidence: [
          {
            expected: "car rental customer-facing copy",
            found: "SaaS/conversion copy",
            source: "website_public_copy"
          }
        ],
        generator: input.generator,
        id: "website_car_rental_generated_saas_copy",
        mode: input.mode,
        recommendedFix: "Replace SaaS placeholder language with car rental inventory, booking, fleet, insurance, pickup, and contact copy.",
        repairStrategy: "replace_generic_saas_copy_with_requested_domain_copy",
        ruleId: "WEBSITE_COPY001",
        severity: "high",
        timestamp,
        title: "Generic SaaS Copy In Website"
      });
    }

    for (const file of normalizedFiles) {
      if (isUnsafePath(file.path)) {
        addIssue(failures, {
          category: "path_safety",
          description: `Unsupported generated path: ${file.path || "(empty)"}.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_unsafe_path_${failures.length + 1}`,
          location: { path: file.path },
          mode: input.mode,
          recommendedFix: "Use normalized project-relative file paths only.",
          severity: "critical",
          timestamp
        });
      }

      if (file.content.trim().length === 0) {
        addIssue(failures, {
          category: "empty_file",
          description: `${file.path} is empty.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_empty_file_${failures.length + 1}`,
          location: { path: file.path },
          mode: input.mode,
          recommendedFix: "Generate non-empty content for every proposed file.",
          severity: "high",
          timestamp
        });
      }
    }

    if (!fileMap.has("index.html")) {
      addIssue(failures, {
        category: "missing_file",
        description: "WEBSITE proposal is missing index.html.",
        domain: input.domain,
        generator: input.generator,
        id: "website_missing_index",
        location: { path: "index.html" },
        mode: input.mode,
        recommendedFix: "Add index.html as the home page.",
        severity: "critical",
        timestamp
      });
    }

    for (const requiredFile of input.requiredFiles ?? []) {
      const normalizedRequiredFile = normalizePath(requiredFile);

      if (normalizedRequiredFile && !fileMap.has(normalizedRequiredFile)) {
        addIssue(failures, {
          category: "missing_file",
          confidence: 0.94,
          description: `Required file is missing: ${normalizedRequiredFile}.`,
          domain: input.domain,
          evidence: [
            {
              expected: normalizedRequiredFile,
              found: "missing",
              source: "generation_brief_required_files"
            }
          ],
          generator: input.generator,
          id: `website_missing_required_file_${normalizedRequiredFile}`,
          location: { path: normalizedRequiredFile },
          mode: input.mode,
          recommendedFix: "Generate every required file from the website generation brief.",
          repairStrategy: "regenerate_exact_required_file_set",
          ruleId: normalizedRequiredFile.endsWith(".html") ? "PAGE001" : "STRUCT001",
          severity: "high",
          timestamp,
          title: "Required File Missing"
        });
      }
    }

    if (websiteContract && fileMap.has("HASSALI.md")) {
      const contractText = fileMap.get("HASSALI.md")?.content ?? "";
      const metadataChecks = [
        ["domainId", websiteContract.domainId ?? ""],
        ["requestedPages", websiteContract.requestedPages.join(", ")],
        ["exactPageCount", String(websiteContract.exactPageCount ?? websiteContract.requestedPages.length)],
        ["expectedVocabulary", websiteContract.expectedVocabulary[0] ?? ""],
        ["trustSignals", websiteContract.trustSignals[0] ?? ""]
      ].filter(([, value]) => value);
      const missingMetadata = metadataChecks.filter(([label, value]) =>
        !contractText.toLowerCase().includes(label.toLowerCase()) ||
        !contractText.toLowerCase().includes(value.toLowerCase())
      );

      if (missingMetadata.length > 0) {
        addIssue(warnings, {
          category: "metadata",
          confidence: 0.84,
          description: `HASSALI.md is missing contract evidence: ${missingMetadata.map(([label]) => label).join(", ")}.`,
          domain: input.domain,
          evidence: [
            {
              expected: metadataChecks.map(([label]) => label).join(", "),
              found: missingMetadata.map(([label]) => label).join(", "),
              source: "HASSALI.md"
            }
          ],
          generator: input.generator,
          id: "website_hassali_contract_metadata_missing",
          location: { path: "HASSALI.md" },
          mode: input.mode,
          recommendedFix: "Write HASSALI.md directly from the WebsiteGenerationBrief metadata.",
          repairStrategy: "rewrite_hassali_contract_metadata_from_brief",
          ruleId: "META001",
          severity: "medium",
          timestamp,
          title: "HASSALI Contract Metadata Missing"
        });
      }
    }

    for (const expectedPage of expectedPages) {
      if (!fileMap.has(expectedPage)) {
        addIssue(failures, {
          category: "missing_file",
          description: `Requested page is missing: ${expectedPage}.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_missing_page_${expectedPage}`,
          location: { path: expectedPage },
          mode: input.mode,
          recommendedFix: "Generate every requested page before asking for approval.",
          severity: "high",
          timestamp
        });
      }
    }

    if (expectedPages.length > 0 && htmlPages.length !== expectedPages.length) {
      addIssue(failures, {
        category: "page_count",
        confidence: 0.96,
        description: `Expected ${expectedPages.length} HTML page(s), found ${htmlPages.length}.`,
        domain: input.domain,
        evidence: [
          {
            expected: `${expectedPages.length} page(s): ${expectedPages.join(", ")}`,
            found: `${htmlPages.length} page(s): ${htmlPages.map((page) => page.path).join(", ")}`,
            source: "website_file_set"
          }
        ],
        generator: input.generator,
        id: "website_page_count_mismatch",
        mode: input.mode,
        recommendedFix: "Align generated HTML pages with the requested page list.",
        repairStrategy: "regenerate_exact_requested_page_set",
        ruleId: "PAGE001",
        severity: "high",
        timestamp,
        title: "Exact Page Count Mismatch"
      });
    }

    if (expectedPages.length > 0) {
      const extraPages = htmlPages.map((page) => page.path).filter((path) => !expectedPages.includes(path));

      for (const extraPage of extraPages) {
        addIssue(failures, {
          category: "page_count",
          confidence: 0.96,
          description: `Generated extra page not requested: ${extraPage}.`,
          domain: input.domain,
          evidence: [
            {
              expected: expectedPages.join(", "),
              found: extraPage,
              source: "website_file_set"
            }
          ],
          generator: input.generator,
          id: `website_extra_page_${extraPage}`,
          location: { path: extraPage },
          mode: input.mode,
          recommendedFix: "Remove unrequested pages and regenerate exactly the requested page set.",
          repairStrategy: "remove_unrequested_pages_and_regenerate_navigation",
          ruleId: "PAGE002",
          severity: "high",
          timestamp,
          title: "Generated Extra Page"
        });
      }
    }

    for (const page of htmlPages) {
      const text = visibleText(page.content);

      if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(page.content)) {
        addIssue(warnings, {
          category: "document_structure",
          description: `${page.path} is missing a title element.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_missing_title_${page.path}`,
          location: { path: page.path, selector: "title" },
          mode: input.mode,
          recommendedFix: "Add a meaningful page title.",
          severity: "medium",
          timestamp
        });
      }

      if (!/<h1\b/i.test(page.content)) {
        addIssue(failures, {
          category: "document_structure",
          description: `${page.path} is missing an h1 heading.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_missing_h1_${page.path}`,
          location: { path: page.path, selector: "h1" },
          mode: input.mode,
          recommendedFix: "Add one clear h1 that matches the page purpose.",
          severity: "medium",
          timestamp
        });
      }

      if (!/<footer\b/i.test(page.content)) {
        addIssue(warnings, {
          category: "document_structure",
          description: `${page.path} is missing a footer.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_missing_footer_${page.path}`,
          location: { path: page.path, selector: "footer" },
          mode: input.mode,
          recommendedFix: "Add a footer with brand-specific contact or context.",
          severity: "medium",
          timestamp
        });
      }

      if (/<section\b[^>]*>\s*<\/section>/i.test(page.content) || text.length < 80) {
        addIssue(warnings, {
          category: "content_quality",
          description: `${page.path} appears to contain an empty or very thin section.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_empty_section_${page.path}`,
          location: { path: page.path, selector: "section" },
          mode: input.mode,
          recommendedFix: "Fill sections with specific public-facing copy.",
          severity: "medium",
          timestamp
        });
      }

      for (const pattern of placeholderPatterns) {
        if (pattern.test(text)) {
          addIssue(failures, {
            category: "public_copy_quality",
            description: `${page.path} contains placeholder, internal, or generic public copy.`,
            domain: input.domain,
            generator: input.generator,
            id: `website_generic_copy_${page.path}_${failures.length + 1}`,
            location: { path: page.path },
            mode: input.mode,
            recommendedFix: "Replace internal layout labels and placeholders with domain-specific public copy.",
            ruleId: "PLACEHOLDER001",
            severity: "high",
            timestamp
          });
          break;
        }
      }

      for (const href of extractRefs(page.content, /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)) {
        const ref = normalizeHref(href);
        if (!isExternalHref(href) && !fileMap.has(ref)) {
          addIssue(failures, {
            category: "broken_reference",
            description: `${page.path} references missing stylesheet ${ref}.`,
            domain: input.domain,
            generator: input.generator,
            id: `website_missing_css_${page.path}_${ref}`,
            location: { path: page.path },
            mode: input.mode,
            recommendedFix: `Add ${ref} or update the stylesheet link.`,
            severity: "high",
            timestamp
          });
        }
      }

      for (const src of extractRefs(page.content, /<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
        const ref = normalizeHref(src);
        if (!isExternalHref(src) && !fileMap.has(ref)) {
          addIssue(failures, {
            category: "broken_reference",
            description: `${page.path} references missing script ${ref}.`,
            domain: input.domain,
            generator: input.generator,
            id: `website_missing_js_${page.path}_${ref}`,
            location: { path: page.path },
            mode: input.mode,
            recommendedFix: `Add ${ref} or update the script reference.`,
            severity: "high",
            timestamp
          });
        }
      }

      for (const link of page.links) {
        if (isExternalHref(link.href)) continue;
        const target = normalizeHref(link.href);
        if (target.endsWith(".html") && !fileMap.has(target)) {
          addIssue(failures, {
            category: "navigation",
            description: `${page.path} links to missing page ${target}.`,
            domain: input.domain,
            generator: input.generator,
            id: `website_missing_link_${page.path}_${target}`,
            location: { path: page.path, label: link.label || link.href },
            mode: input.mode,
            recommendedFix: `Create ${target} or correct the navigation href.`,
            severity: "high",
            timestamp
          });
        }
      }

      const labelCounts = page.links.reduce<Record<string, number>>((counts, link) => {
        const label = link.label.toLowerCase();
        if (!label) return counts;
        counts[label] = (counts[label] ?? 0) + 1;
        return counts;
      }, {});
      const duplicateLabels = Object.entries(labelCounts).filter(([, count]) => count > 1);
      if (duplicateLabels.length > 0) {
        addIssue(warnings, {
          category: "navigation",
          description: `${page.path} has duplicate navigation labels: ${duplicateLabels.map(([label]) => label).join(", ")}.`,
          domain: input.domain,
          generator: input.generator,
          id: `website_duplicate_nav_${page.path}`,
          location: { path: page.path, selector: "nav a" },
          mode: input.mode,
          recommendedFix: "Use distinct labels or remove duplicate links.",
          severity: "low",
          timestamp
        });
      }

      if (expectedPages.length > 1) {
        const linkedPages = new Set(page.links.filter((link) => !isExternalHref(link.href)).map((link) => normalizeHref(link.href)));
        const missingNavTargets = expectedPages.filter((expectedPage) => !linkedPages.has(expectedPage));
        if (missingNavTargets.length > 0) {
          addIssue(warnings, {
            category: "navigation",
            description: `${page.path} navigation does not link to: ${missingNavTargets.join(", ")}.`,
            domain: input.domain,
            generator: input.generator,
            id: `website_incomplete_nav_${page.path}`,
            location: { path: page.path, selector: "nav" },
            mode: input.mode,
            recommendedFix: "Add navigation links to every requested page.",
            severity: "medium",
            timestamp
          });
        }
      }
    }

    if (expectedPages.includes("contact.html")) {
      const contact = fileMap.get("contact.html");
      if (contact && !hasEmailOrForm(contact.content)) {
        addIssue(warnings, {
          category: "contact_information",
          description: "contact.html does not include a contact form or email path.",
          domain: input.domain,
          generator: input.generator,
          id: "website_missing_contact_info",
          location: { path: "contact.html" },
          mode: input.mode,
          recommendedFix: "Add a form, email link, phone link, or clear contact method.",
          severity: "medium",
          timestamp
        });
      }
    }

    if (input.manifest?.type && input.manifest.type !== "static_website") {
      addIssue(warnings, {
        category: "manifest_mismatch",
        description: `WEBSITE proposal has manifest type ${input.manifest.type}.`,
        domain: input.domain,
        generator: input.generator,
        id: "website_manifest_mismatch",
        mode: input.mode,
        recommendedFix: "Set preview manifest to static_website when committed files are static HTML pages.",
        severity: "medium",
        timestamp
      });
    }

    return createReport({
      failures,
      metrics: {
        expectedPageCount: expectedPages.length,
        fileCount: normalizedFiles.length,
        htmlPageCount: htmlPages.length,
        hasContactPage: fileMap.has("contact.html"),
        hasHomePage: fileMap.has("index.html")
      },
      mode: input.mode,
      recommendations: failures.length || warnings.length
        ? [{ id: "website_fix_before_approval", priority: failures.length ? "high" : "medium", description: "Use this review report as input for future repair before approval." }]
        : [],
      reviewer: "WebsiteReviewer",
      timestamp,
      warnings
    });
  }
};

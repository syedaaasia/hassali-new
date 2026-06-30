import type { SelfReviewIssue } from "@/lib/self-review-types";
import type { SelfReviewReviewer } from "@/lib/server/ai/self-review/engine";
import {
  createIssue,
  createReport
} from "@/lib/server/ai/self-review/review-helpers";

function normalizePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

function isUnsafePath(path: string) {
  return !path || path.includes("..") || path.startsWith("/") || /^[a-z]:\//i.test(path);
}

function codeIssue(input: {
  category: string;
  confidence?: number;
  description: string;
  domain?: string | null;
  evidence?: SelfReviewIssue["evidence"];
  generator: string;
  id: string;
  location?: SelfReviewIssue["location"];
  mode: "CODE";
  recommendedFix: string;
  repairStrategy?: string;
  ruleId?: SelfReviewIssue["ruleId"];
  severity: SelfReviewIssue["severity"];
  timestamp: number;
  title: string;
}) {
  return createIssue({
    ...input,
    evidence: input.evidence ?? [
      {
        found: input.location?.path ?? input.description,
        source: input.location?.path ?? "code_proposal"
      }
    ],
    repairStrategy: input.repairStrategy ?? "regenerate_or_patch_specific_code_file",
    reviewer: "CodeReviewer",
    ruleId: input.ruleId ?? (input.category.includes("path") ? "SECURITY001" : "CODE001")
  });
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
}

function extractAnchors(content: string, path: string) {
  const anchors: Array<{ href: string; label: string; path: string }> = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(content)) !== null) {
    anchors.push({
      href: match[1] ?? "",
      label: stripTags(match[2] ?? ""),
      path
    });
  }

  return anchors.filter((anchor) => anchor.label.length > 0);
}

function idExists(content: string, id: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idPattern = new RegExp(`\\bid\\s*=\\s*(?:"${escaped}"|'${escaped}'|\\{["']${escaped}["']\\})`, "i");

  return idPattern.test(content);
}

function extractButtons(content: string, path: string) {
  const buttons: Array<{ label: string; markup: string; path: string }> = [];
  const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;

  while ((match = buttonPattern.exec(content)) !== null) {
    buttons.push({
      label: stripTags(match[2] ?? ""),
      markup: match[0] ?? "",
      path
    });
  }

  return buttons;
}

function isClearlyPlannedOrDisabled(markup: string) {
  return /\b(?:disabled|aria-disabled)\b/i.test(markup) || /\b(?:planned|preview-only|mock|coming soon|non-interactive)\b/i.test(markup);
}

function promptRequestsPython(prompt: string) {
  return /\b(?:python|py|streamlit|flask|fastapi|django|tkinter|pyside|pyqt)\b/i.test(prompt);
}

function promptRequestsReactFrontend(prompt: string) {
  return /\b(?:react|vite|tsx|typescript frontend|frontend)\b/i.test(prompt);
}

function promptRequestsNode(prompt: string) {
  return /\b(?:node|express|nestjs)\b/i.test(prompt);
}

function promptRequestsNext(prompt: string) {
  return /\b(?:next\.js|nextjs)\b/i.test(prompt);
}

function generatedReactVite(paths: Set<string>) {
  return (
    paths.has("package.json") ||
    paths.has("vite.config.ts") ||
    paths.has("vite.config.js") ||
    paths.has("src/main.tsx") ||
    paths.has("src/main.jsx") ||
    paths.has("src/App.tsx") ||
    paths.has("src/App.jsx")
  );
}

function generatedPython(paths: Set<string>) {
  return [...paths].some((path) =>
    path.endsWith(".py") ||
    path === "requirements.txt" ||
    path === "pyproject.toml" ||
    path === "Pipfile"
  );
}

export const codeReviewer: SelfReviewReviewer = {
  id: "CodeReviewer",
  supports: (input) => input.mode === "CODE",
  review: (input) => {
    const timestamp = Date.now();
    const failures: SelfReviewIssue[] = [];
    const warnings: SelfReviewIssue[] = [];
    const normalizedFiles = input.files.map((file) => ({
      ...file,
      path: normalizePath(file.path)
    }));
    const paths = new Set(normalizedFiles.map((file) => file.path));
    const hasReactViteSignals =
      paths.has("vite.config.ts") ||
      paths.has("vite.config.js") ||
      paths.has("src/main.tsx") ||
      paths.has("src/main.jsx");
    const sourceText = normalizedFiles.map((file) => file.content).join("\n");
    const anchors = normalizedFiles.flatMap((file) => extractAnchors(file.content, file.path));
    const buttons = normalizedFiles.flatMap((file) => extractButtons(file.content, file.path));
    const pythonRequested = promptRequestsPython(input.prompt);
    const reactFrontendRequested = promptRequestsReactFrontend(input.prompt);
    const nodeRequested = promptRequestsNode(input.prompt);
    const nextRequested = promptRequestsNext(input.prompt);
    const hasReactViteGenerated = generatedReactVite(paths);
    const hasPythonGenerated = generatedPython(paths);
    const isCrmDashboardPrompt = /\b(?:crm|dashboard|billing|pipeline|customers)\b/i.test(input.prompt);

    for (const file of normalizedFiles) {
      if (isUnsafePath(file.path)) {
        failures.push(codeIssue({
          category: "path_safety",
          description: `Unsupported generated path: ${file.path || "(empty)"}.`,
          domain: input.domain,
          generator: input.generator,
          id: `code_unsafe_path_${failures.length + 1}`,
          location: { path: file.path },
          mode: "CODE",
          recommendedFix: "Use normalized project-relative paths only.",
          severity: "critical",
          timestamp,
          title: "Unsafe Code Path"
        }));
      }

      if (file.content.trim().length === 0) {
        failures.push(codeIssue({
          category: "empty_file",
          description: `${file.path} is empty.`,
          domain: input.domain,
          generator: input.generator,
          id: `code_empty_file_${failures.length + 1}`,
          location: { path: file.path },
          mode: "CODE",
          recommendedFix: "Generate meaningful source or documentation content before asking for approval.",
          severity: "high",
          timestamp,
          title: "Empty Code File"
        }));
      }

      if (/\b(?:todo|placeholder|lorem ipsum)\b/i.test(file.content)) {
        warnings.push(codeIssue({
          category: "placeholder_marker",
          description: `${file.path} contains placeholder markers.`,
          domain: input.domain,
          generator: input.generator,
          id: `code_placeholder_${warnings.length + 1}`,
          location: { path: file.path },
          mode: "CODE",
          recommendedFix: "Replace placeholder markers with project-specific implementation details.",
          severity: "medium",
          timestamp,
          title: "Placeholder Code Marker"
        }));
      }
    }

    if (hasReactViteSignals && !paths.has("package.json")) {
      warnings.push(codeIssue({
        category: "missing_manifest",
        description: "React/Vite source was generated without package.json.",
        domain: input.domain,
        generator: input.generator,
        id: "code_missing_package_json",
        mode: "CODE",
        recommendedFix: "Include package.json metadata when generating a runnable React/Vite project.",
        severity: "medium",
        timestamp,
        title: "Missing Package Metadata"
      }));
    }

    if (paths.has("vite.config.ts") && !paths.has("src/main.tsx") && !paths.has("src/main.jsx")) {
      warnings.push(codeIssue({
        category: "entry_point_mismatch",
        description: "Vite config exists without a React entry point.",
        domain: input.domain,
        generator: input.generator,
        id: "code_missing_vite_entry",
        mode: "CODE",
        recommendedFix: "Add src/main.tsx or src/main.jsx for Vite app startup.",
        severity: "medium",
        timestamp,
        title: "Missing Vite Entry Point"
      }));
    }

    if (pythonRequested && hasReactViteGenerated && !hasPythonGenerated && !reactFrontendRequested) {
      failures.push(codeIssue({
        category: "stack_consistency",
        confidence: 0.95,
        description: "The user explicitly requested Python, but the proposal generated a Vite React TypeScript app.",
        domain: input.domain,
        evidence: [
          {
            found: `Prompt contains Python stack terms; generated files include ${[
              paths.has("package.json") ? "package.json" : null,
              paths.has("vite.config.ts") ? "vite.config.ts" : paths.has("vite.config.js") ? "vite.config.js" : null,
              paths.has("src/main.tsx") ? "src/main.tsx" : paths.has("src/main.jsx") ? "src/main.jsx" : null,
              paths.has("src/App.tsx") ? "src/App.tsx" : paths.has("src/App.jsx") ? "src/App.jsx" : null
            ].filter(Boolean).join(", ")}.`,
            source: "code_stack"
          }
        ],
        generator: input.generator,
        id: "code_requested_python_generated_react_vite",
        mode: "CODE",
        recommendedFix: "Generate a Python-based CRM scaffold such as Streamlit, Flask/FastAPI with templates, PySide/Tkinter desktop UI, or ask which Python UI style the user wants.",
        repairStrategy: "regenerate_using_requested_python_stack_or_ask_clarifying_question",
        ruleId: "CODE_STACK001",
        severity: "high",
        timestamp,
        title: "Requested Stack Not Honored"
      }));
    }

    if ((nodeRequested || nextRequested) && hasPythonGenerated && !hasReactViteGenerated) {
      warnings.push(codeIssue({
        category: "stack_consistency",
        confidence: 0.84,
        description: "Generated files appear to use Python while the prompt requested a JavaScript/Next/Node stack.",
        domain: input.domain,
        evidence: [
          {
            found: "Prompt asks for JavaScript framework terms, generated files include Python project files.",
            source: "code_stack"
          }
        ],
        generator: input.generator,
        id: "code_requested_js_generated_python",
        mode: "CODE",
        recommendedFix: "Use the requested Node/Next stack or ask a clarifying stack question.",
        repairStrategy: "regenerate_using_requested_javascript_stack_or_ask_clarifying_question",
        ruleId: "CODE_STACK002",
        severity: "medium",
        timestamp,
        title: "Generated Framework Conflicts With Prompt"
      }));
    }

    const docsClaimPython = normalizedFiles
      .filter((file) => /\.(?:md|txt)$/i.test(file.path))
      .some((file) => /\b(?:python|streamlit|flask|fastapi|django)\b/i.test(file.content));

    if (docsClaimPython && hasReactViteGenerated && !hasPythonGenerated) {
      warnings.push(codeIssue({
        category: "stack_consistency",
        confidence: 0.82,
        description: "Documentation references a Python stack while generated source files are React/Vite TypeScript.",
        domain: input.domain,
        evidence: [
          {
            found: "Docs mention Python stack, source files indicate React/Vite TypeScript.",
            source: "code_stack"
          }
        ],
        generator: input.generator,
        id: "code_docs_stack_mismatch",
        mode: "CODE",
        recommendedFix: "Align documentation with generated source files or regenerate the source in the documented stack.",
        repairStrategy: "align_docs_and_source_stack",
        ruleId: "CODE_STACK003",
        severity: "medium",
        timestamp,
        title: "Documentation Stack Mismatch"
      }));
    }

    const internalAnchors = anchors.filter((anchor) => anchor.href.startsWith("#") && anchor.href.length > 1);
    const labelsByHref = internalAnchors.reduce<Record<string, string[]>>((groups, anchor) => {
      groups[anchor.href] = [...(groups[anchor.href] ?? []), anchor.label];
      return groups;
    }, {});
    const repeatedHref = Object.entries(labelsByHref)
      .find(([, labels]) => new Set(labels.map((label) => label.toLowerCase())).size >= 3);

    if (repeatedHref) {
      const [href, labels] = repeatedHref;
      const repeatedSeverity = isCrmDashboardPrompt || labels.length >= 4 ? "high" : "medium";
      const issue = codeIssue({
        category: "interaction_integrity",
        confidence: 0.92,
        description: "Multiple sidebar navigation items point to the same href target, so the UI appears interactive but does not switch views.",
        domain: input.domain,
        evidence: [
          {
            found: `${Array.from(new Set(labels)).join(", ")} all use href="${href}".`,
            source: "code_navigation"
          }
        ],
        generator: input.generator,
        id: "code_repeated_navigation_target",
        mode: "CODE",
        recommendedFix: "Implement tab state, distinct anchors, or route targets for each app module, or label inactive items as planned.",
        repairStrategy: "add_tab_state_or_distinct_routes_for_each_navigation_item",
        ruleId: "CODE_NAV001",
        severity: repeatedSeverity,
        timestamp,
        title: "Repeated Navigation Target"
      });

      if (repeatedSeverity === "high") {
        failures.push(issue);
      } else {
        warnings.push(issue);
      }
    }

    const missingAnchorTargets = internalAnchors
      .map((anchor) => ({ ...anchor, targetId: anchor.href.slice(1) }))
      .filter((anchor) => !sourceText.includes(`id="${anchor.targetId}"`) && !sourceText.includes(`id='${anchor.targetId}'`) && !idExists(sourceText, anchor.targetId));

    if (missingAnchorTargets.length > 0) {
      const sample = missingAnchorTargets.slice(0, 5);
      const missingTargetSeverity = isCrmDashboardPrompt && missingAnchorTargets.length >= 3 ? "high" : "medium";
      const issue = codeIssue({
        category: "interaction_integrity",
        confidence: 0.88,
        description: "Navigation links point to anchor targets that are not represented by reachable sections in the generated source.",
        domain: input.domain,
        evidence: [
          {
            found: sample.map((anchor) => `${anchor.label} -> ${anchor.href}`).join(", "),
            source: "code_navigation"
          }
        ],
        generator: input.generator,
        id: "code_missing_navigation_targets",
        mode: "CODE",
        recommendedFix: "Add matching sections, tab state, route targets, or clear planned-state labels for inactive navigation items.",
        repairStrategy: "map_navigation_items_to_reachable_sections_or_planned_labels",
        ruleId: "CODE_NAV002",
        severity: missingTargetSeverity,
        timestamp,
        title: "Missing Navigation Targets"
      });

      if (missingTargetSeverity === "high") {
        failures.push(issue);
      } else {
        warnings.push(issue);
      }
    }

    const staticButtons = buttons.filter((button) =>
      button.label &&
      !/\bonClick\s*=|\btype\s*=\s*["']submit["']/i.test(button.markup) &&
      !isClearlyPlannedOrDisabled(button.markup)
    );

    if (staticButtons.length > 0) {
      warnings.push(codeIssue({
        category: "interaction_integrity",
        confidence: 0.78,
        description: "Generated UI includes buttons that appear actionable but have no handler, submit behavior, disabled state, or planned/mock label.",
        domain: input.domain,
        evidence: [
          {
            found: staticButtons.slice(0, 5).map((button) => button.label).join(", "),
            source: "code_buttons"
          }
        ],
        generator: input.generator,
        id: "code_static_action_buttons",
        mode: "CODE",
        recommendedFix: "Add handlers, submit behavior, disabled/planned labels, or remove fake actionable controls.",
        repairStrategy: "add_handlers_or_honest_disabled_planned_state_for_buttons",
        ruleId: "CODE_BUTTON001",
        severity: "low",
        timestamp,
        title: "Static Action Buttons"
      }));
    }

    return createReport({
      failures,
      metrics: {
        anchorCount: anchors.length,
        buttonCount: buttons.length,
        fileCount: normalizedFiles.length,
        hasPackageJson: paths.has("package.json"),
        hasReactViteSignals,
        sourceFileCount: normalizedFiles.filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file.path)).length
      },
      mode: input.mode,
      recommendations: warnings.length || failures.length
        ? [{ id: "code_review_before_runtime", priority: "medium", description: "Review committed source structure before runtime enablement." }]
        : [],
      reviewer: "CodeReviewer",
      timestamp,
      warnings
    });
  }
};

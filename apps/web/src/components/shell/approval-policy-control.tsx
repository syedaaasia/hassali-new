"use client";

import { useEffect, useState } from "react";
import { projectApprovalPolicyOptions } from "@/lib/approval-policy";
import { useApprovalPolicyStore } from "@/lib/approval-policy-store";

export function ApprovalPolicyControl({ projectId }: { projectId: string | null }) {
  const activeProjectId = useApprovalPolicyStore((state) => state.activeProjectId);
  const hydrateProject = useApprovalPolicyStore((state) => state.hydrateProject);
  const policy = useApprovalPolicyStore((state) => state.policy);
  const setPolicy = useApprovalPolicyStore((state) => state.setPolicy);
  const [isOpen, setIsOpen] = useState(false);
  const selected = projectApprovalPolicyOptions.find((option) => option.value === policy) ?? projectApprovalPolicyOptions[0];

  useEffect(() => {
    hydrateProject(projectId);
    setIsOpen(false);
  }, [hydrateProject, projectId]);

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex h-8 max-w-[11rem] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-medium text-muted-foreground hover:border-[hsl(var(--premium-accent)/0.35)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!projectId || activeProjectId !== projectId}
        onClick={() => setIsOpen((current) => !current)}
        title="Project approval policy"
        type="button"
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#DE7356]" />
        <span className="truncate">{selected.label}</span>
        <span aria-hidden="true" className="text-[9px]">v</span>
      </button>

      {isOpen ? (
        <div
          className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg border border-[hsl(var(--premium-border))] bg-[#151515] p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.5)] [.light_&]:bg-white"
          role="menu"
        >
          {projectApprovalPolicyOptions.map((option) => {
            const isSelected = option.value === policy;

            return (
              <button
                aria-checked={isSelected}
                className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                  isSelected
                    ? "bg-[hsl(var(--premium-accent)/0.16)] text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                }`}
                key={option.value}
                onClick={() => {
                  setPolicy(option.value);
                  setIsOpen(false);
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="block text-[11px] font-medium">{option.label}</span>
                <span className="mt-0.5 block text-[10px] leading-4">{option.description}</span>
              </button>
            );
          })}
          <p className="px-2.5 pb-1 pt-1.5 text-[9px] leading-4 text-muted-foreground/75">
            Applies only to this project and browser session. Server validation, ownership, and revision checks always remain active.
          </p>
        </div>
      ) : null}
    </div>
  );
}

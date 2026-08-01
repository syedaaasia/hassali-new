"use client";

import { create } from "zustand";
import {
  approvalPolicyStorageKey,
  defaultProjectApprovalPolicy,
  isProjectApprovalPolicy,
  type ProjectApprovalPolicy
} from "@/lib/approval-policy";

type SessionStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type ApprovalPolicyState = {
  activeProjectId: string | null;
  policy: ProjectApprovalPolicy;
  hydrateProject: (projectId: string | null) => void;
  setPolicy: (policy: ProjectApprovalPolicy) => void;
};

function sessionStorage() {
  return (globalThis as { sessionStorage?: SessionStorageLike }).sessionStorage;
}

export const useApprovalPolicyStore = create<ApprovalPolicyState>((set, get) => ({
  activeProjectId: null,
  policy: defaultProjectApprovalPolicy,
  hydrateProject: (projectId) => {
    const saved = projectId ? sessionStorage()?.getItem(approvalPolicyStorageKey(projectId)) : null;

    set({
      activeProjectId: projectId,
      policy: isProjectApprovalPolicy(saved) ? saved : defaultProjectApprovalPolicy
    });
  },
  setPolicy: (policy) => {
    const projectId = get().activeProjectId;

    if (projectId) {
      sessionStorage()?.setItem(approvalPolicyStorageKey(projectId), policy);
    }

    set({ policy });
  }
}));

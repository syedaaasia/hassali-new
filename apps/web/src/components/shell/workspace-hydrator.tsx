"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/lib/chat-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function WorkspaceHydrator() {
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const hasStartedHydration = useRef(false);

  useEffect(() => {
    if (hasStartedHydration.current) {
      return;
    }

    hasStartedHydration.current = true;

    void loadWorkspace().then((payload) => {
      if (payload) {
        console.info("workspace chat payload", {
          messages: payload.chat.messages.length,
          sessionId: payload.chat.sessionId
        });

        useChatStore.getState().hydrateChat(payload.chat.messages, payload.chat.sessionId);

        console.info("chat store after hydration", {
          messages: useChatStore.getState().messages.length,
          sessionId: useChatStore.getState().chatSessionId
        });
      }
    });
  }, [loadWorkspace]);

  return null;
}

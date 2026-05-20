"use client";

import { useEffect } from "react";
import { useChatStore } from "@/lib/chat-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function WorkspaceHydrator() {
  const hasLoaded = useWorkspaceStore((state) => state.hasLoaded);
  const loadWorkspace = useWorkspaceStore((state) => state.loadWorkspace);
  const hydrateChat = useChatStore((state) => state.hydrateChat);

  useEffect(() => {
    if (hasLoaded) {
      return;
    }

    void loadWorkspace().then((payload) => {
      if (payload) {
        hydrateChat(payload.chat.messages, payload.chat.sessionId);
      }
    });
  }, [hasLoaded, hydrateChat, loadWorkspace]);

  return null;
}

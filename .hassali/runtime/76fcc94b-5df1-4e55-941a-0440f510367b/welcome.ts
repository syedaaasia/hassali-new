type WorkspaceMood = "calm" | "focused" | "ready";

export function createSession(mood: WorkspaceMood) {
  return {
    mood,
    promise: "small steps, visible changes, no surprise edits"
  };
}

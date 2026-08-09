export type AppShellPanelState = {
  projectPanelCollapsed: boolean;
};

export function createInitialAppShellPanelState(): AppShellPanelState {
  return { projectPanelCollapsed: true };
}

export function toggleProjectPanelState(state: AppShellPanelState): AppShellPanelState {
  return { ...state, projectPanelCollapsed: !state.projectPanelCollapsed };
}

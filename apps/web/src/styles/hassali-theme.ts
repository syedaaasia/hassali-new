export const hassaliTheme = {
  color: {
    royalBlack: "#060606",
    deepInk: "#0a090a",
    warmCharcoal: "#111111",
    panel: "#151515",
    panelRaised: "#1e1e1e",
    neonRed: "#ff3655",
    neonRedSoft: "#ff6a7f",
    emerald: "#48d597",
    magenta: "#d94dff",
    cream: "#e9dfd0",
    mutedCream: "#a8a09a",
    border: "rgba(255, 54, 85, 0.22)",
    borderSoft: "rgba(255, 255, 255, 0.08)",
    danger: "#ff5870",
    success: "#48d597",
    warning: "#ffb84d"
  },
  typography: {
    display:
      "Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    heading:
      "Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    body:
      "Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    caption:
      "Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    mono:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
    landingSerif: "Georgia, Cambria, Times New Roman, serif"
  },
  spacing: {
    topbarHeight: "56px",
    sidebarWidth: "256px",
    aiPanelWidth: "352px",
    bottomPanelHeight: "144px",
    panelPadding: "14px",
    editorPadding: "18px"
  },
  component: {
    buttons:
      "rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel-raised))] text-foreground shadow-[0_14px_42px_hsl(0_80%_3%/0.28)]",
    inputs:
      "rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-black)/0.52)] text-foreground",
    dropdowns:
      "rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel))] shadow-[0_24px_70px_hsl(0_80%_3%/0.5)]",
    tabs: "h-12 border-r border-[hsl(var(--royal-border-soft))] px-4 text-xs",
    sidebars: "bg-[hsl(var(--royal-surface)/0.92)] border-[hsl(var(--royal-border-soft))]",
    cards: "rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.68)]",
    chatBubbles:
      "rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.68)]",
    badges: "rounded-full border border-[hsl(var(--royal-border))] bg-[hsl(var(--gold)/0.1)]",
    editorChrome: "bg-[hsl(var(--royal-black))] border-[hsl(var(--royal-border-soft))]"
  },
  motion: {
    duration: {
      micro: 0.12,
      calm: 0.18
    },
    easing: "easeOut",
    rule: "Subtle opacity and position shifts only. Avoid looping heavy effects and large repaints."
  }
} as const;

export type HassaliTheme = typeof hassaliTheme;

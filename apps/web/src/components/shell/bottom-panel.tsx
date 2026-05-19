export function BottomPanel() {
  return (
    <footer className="hidden h-36 shrink-0 grid-cols-2 border-t border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.88)] text-xs lg:grid">
      <section className="border-r border-[hsl(var(--royal-border-soft))] p-3.5">
        <div className="flex items-center gap-2 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/80" />
          Terminal
        </div>
        <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-3 font-mono text-muted-foreground shadow-sm">
          Docker sandbox terminal placeholder
        </div>
      </section>
      <section className="p-3.5">
        <div className="flex items-center gap-2 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          Logs
        </div>
        <div className="mt-3 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-3 font-mono text-muted-foreground shadow-sm">
          Build and orchestration logs placeholder
        </div>
      </section>
    </footer>
  );
}

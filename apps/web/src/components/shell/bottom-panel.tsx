export function BottomPanel() {
  return (
    <footer className="grid h-40 shrink-0 grid-cols-2 border-t bg-surface text-xs">
      <section className="border-r p-3">
        <div className="font-medium">Terminal</div>
        <div className="mt-3 rounded-md border bg-background p-3 font-mono text-muted-foreground">
          Docker sandbox terminal placeholder
        </div>
      </section>
      <section className="p-3">
        <div className="font-medium">Logs</div>
        <div className="mt-3 rounded-md border bg-background p-3 font-mono text-muted-foreground">
          Build and orchestration logs placeholder
        </div>
      </section>
    </footer>
  );
}

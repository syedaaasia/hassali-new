const topBarItems = ["Model: Auto", "Performance: Balanced", "Usage: 0%"];

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-surface px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border bg-background font-mono text-xs font-semibold">
          H
        </div>
        <span className="text-sm font-medium">Hassali.ai</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {topBarItems.map((item) => (
          <div key={item} className="rounded-md border bg-background px-2.5 py-1">
            {item}
          </div>
        ))}
      </div>
    </header>
  );
}

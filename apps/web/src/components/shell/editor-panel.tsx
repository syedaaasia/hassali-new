const tabs = ["welcome.ts", "workspace.json"];

export function EditorPanel() {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b bg-surface">
        {tabs.map((tab, index) => (
          <div
            key={tab}
            className={`flex h-full items-center border-r px-4 text-xs ${
              index === 0 ? "bg-background text-foreground" : "text-muted-foreground"
            }`}
          >
            {tab}
          </div>
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-3xl rounded-md border bg-surface p-5 font-mono text-sm text-muted-foreground">
          <div className="text-xs uppercase text-muted-foreground">Monaco editor placeholder</div>
          <div className="mt-4 space-y-2">
            <div>1&nbsp;&nbsp;export function buildCalmSoftware() {"{"}</div>
            <div className="pl-8">return "small steps, reviewed diffs";</div>
            <div>{"}"}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

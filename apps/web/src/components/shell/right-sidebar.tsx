import { Panel } from "@/components/ui/panel";

export function RightSidebar() {
  return (
    <Panel className="flex w-72 shrink-0 flex-col border-l">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Assistant</div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-medium">AI assistant</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Placeholder for ask and edit workflows.
          </p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-medium">Execution state</div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Idle. Future actions will require diff approval.
          </p>
        </div>
      </div>
    </Panel>
  );
}

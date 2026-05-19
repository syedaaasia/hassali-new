import { Panel } from "@/components/ui/panel";

const sections = [
  { title: "Workspace", value: "Files placeholder" },
  { title: "Git", value: "Status placeholder" },
  { title: "Search", value: "Project search placeholder" }
];

export function LeftSidebar() {
  return (
    <Panel className="flex w-60 shrink-0 flex-col border-r">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Project</div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {sections.map((section) => (
          <div key={section.title} className="rounded-md border bg-background p-3">
            <div className="text-xs font-medium">{section.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{section.value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

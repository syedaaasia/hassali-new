import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PanelProps = HTMLAttributes<HTMLDivElement>;

export function Panel({ className, ...props }: PanelProps) {
  return (
    <section
      className={cn(
        "border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel))] text-[hsl(var(--premium-paper))]",
        className
      )}
      {...props}
    />
  );
}

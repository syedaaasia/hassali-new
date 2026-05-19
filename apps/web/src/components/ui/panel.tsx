import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PanelProps = HTMLAttributes<HTMLDivElement>;

export function Panel({ className, ...props }: PanelProps) {
  return (
    <section
      className={cn("border-border bg-surface text-surface-foreground", className)}
      {...props}
    />
  );
}

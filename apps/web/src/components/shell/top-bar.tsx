"use client";

import Image from "next/image";
import { useChatStore } from "@/lib/chat-store";

export function TopBar() {
  const productMode = useChatStore((state) => state.productMode);
  return <header className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-void)/0.88)] px-4 backdrop-blur-xl">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-1.5 shadow-[0_10px_30px_hsl(var(--premium-accent)/0.12)]">
        <Image alt="Hassali.ai" className="h-7 w-7 object-contain" height={28} src="/apple-icon.png" width={28} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">Hassali.ai</div>
        <div className="hidden text-[11px] text-muted-foreground sm:block">AI creation workspace</div>
      </div>
    </div>
    <div className="flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
      <div className="hidden items-center gap-2 font-medium text-[hsl(var(--premium-paper))] md:flex"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--premium-accent))] shadow-[0_0_12px_hsl(var(--premium-accent)/0.45)]" />{productMode}</div>
      <div className="hidden items-center gap-2 lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70" />Usage 0%</div>
    </div>
  </header>;
}

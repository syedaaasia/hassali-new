"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type SelectOption = {
  label: string;
  value: string;
};

type PremiumSelectProps = {
  label: string;
  options: SelectOption[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  compact?: boolean;
};

export function PremiumSelect({
  label,
  options,
  value,
  onChange,
  className,
  compact = false
}: PremiumSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={cn("relative", className)}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        className={cn(
          "group flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-border/80 bg-background/70 px-2.5 text-xs text-muted-foreground shadow-sm outline-none",
          "hover:border-muted-foreground/30 hover:bg-muted/45 focus-visible:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/10",
          compact ? "w-full" : "w-36"
        )}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span className="truncate">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate">{selectedOption.label}</span>
          <span className="text-[10px] text-muted-foreground">v</span>
        </span>
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 4, scale: 1 }}
            className="absolute right-0 z-30 min-w-full overflow-hidden rounded-md border border-border/80 bg-surface p-1 shadow-[0_18px_50px_hsl(224_20%_4%/0.32)]"
            exit={{ opacity: 0, y: 0, scale: 0.98 }}
            id={listboxId}
            initial={{ opacity: 0, y: 0, scale: 0.98 }}
            role="listbox"
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {options.map((option) => {
              const isSelected = option.value === selectedOption.value;

              return (
                <button
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-xs outline-none",
                    isSelected
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/65 hover:text-foreground"
                  )}
                  key={option.value}
                  onClick={() => {
                    onChange?.(option.value);
                    setIsOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {isSelected ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { hassaliTheme } from "@/styles/hassali-theme";

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

type TriggerRect = {
  bottom: number;
  left: number;
  width: number;
};

type TriggerElement = {
  getBoundingClientRect: () => TriggerRect;
};

type BrowserGlobals = typeof globalThis & {
  addEventListener?: (type: string, listener: () => void, options?: boolean) => void;
  document?: {
    body?: unknown;
  };
  removeEventListener?: (type: string, listener: () => void, options?: boolean) => void;
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
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 0 });
  const listboxId = useId();
  const triggerRef = useRef<TriggerElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? {
    label,
    value
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const browserGlobals = globalThis as BrowserGlobals;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width
      });
    };

    updatePosition();
    browserGlobals.addEventListener?.("resize", updatePosition);
    browserGlobals.addEventListener?.("scroll", updatePosition, true);

    return () => {
      browserGlobals.removeEventListener?.("resize", updatePosition);
      browserGlobals.removeEventListener?.("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const portalRoot = (globalThis as BrowserGlobals).document?.body;

  return (
    <div className={cn("relative", className)}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
        className={cn(
          "group flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel)/0.78)] px-3 text-xs text-muted-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_10px_32px_hsl(0_70%_4%/0.2)] outline-none",
          "hover:border-accent/45 hover:bg-[hsl(var(--royal-panel-raised)/0.86)] hover:shadow-[0_0_22px_hsl(var(--accent)/0.12)] focus-visible:border-accent/75 focus-visible:ring-2 focus-visible:ring-accent/15",
          compact ? "w-full" : "w-40"
        )}
        onClick={() => setIsOpen((open) => !open)}
        ref={(node) => {
          triggerRef.current = node as unknown as TriggerElement | null;
        }}
        type="button"
      >
        <span className="truncate font-medium">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate">{selectedOption.label}</span>
          <span className="text-[10px] text-accent">v</span>
        </span>
      </button>

      {portalRoot
        ? createPortal(
            <AnimatePresence>
              {isOpen ? (
                <>
                  <button
                    aria-label="Close menu"
                    className="fixed inset-0 z-[9998] cursor-default bg-transparent"
                    onClick={() => setIsOpen(false)}
                    tabIndex={-1}
                    type="button"
                  />
                  <motion.div
                    animate={{ opacity: 1, y: 4, scale: 1 }}
                    className="fixed z-[9999] overflow-hidden rounded-xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--royal-panel))] p-1.5 shadow-[0_24px_80px_hsl(0_80%_3%/0.58),0_0_34px_hsl(var(--accent)/0.14)]"
                    exit={{ opacity: 0, y: 0, scale: 0.98 }}
                    id={listboxId}
                    initial={{ opacity: 0, y: 0, scale: 0.98 }}
                    role="listbox"
                    style={{
                      left: menuPosition.left,
                      top: menuPosition.top,
                      width: menuPosition.width
                    }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                  >
                    {options.map((option) => {
                      const isSelected = option.value === selectedOption.value;

                      return (
                        <button
                          aria-selected={isSelected}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs outline-none",
                            isSelected
                              ? "bg-[hsl(var(--accent)/0.14)] text-foreground shadow-[inset_2px_0_0_hsl(var(--accent))]"
                              : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised))] hover:text-foreground"
                          )}
                          key={option.value}
                          onClick={() => {
                            onChange?.(option.value);
                            setIsOpen(false);
                          }}
                          role="option"
                          type="button"
                        >
                          <span className="truncate">{option.label}</span>
                          {isSelected ? (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-accent"
                              style={{ boxShadow: `0 0 14px ${hassaliTheme.color.neonRed}` }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>,
            portalRoot as Parameters<typeof createPortal>[1]
          )
        : null}
    </div>
  );
}

"use client";

export function SettingsSwitch(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props.label}
      className={`hassali-focus-ring group relative h-9 w-11 shrink-0 rounded-md disabled:cursor-not-allowed disabled:opacity-45 ${props.disabled ? "" : "cursor-pointer"}`}
      disabled={props.disabled}
      onClick={props.onChange}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`absolute left-1/2 top-1/2 h-[18px] w-8 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-150 motion-reduce:transition-none ${props.checked ? "bg-[hsl(var(--premium-accent))]" : "bg-white/15 ring-1 ring-inset ring-white/10 [.light_&]:bg-slate-300 [.light_&]:ring-slate-400/40"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.28)] transition-transform duration-150 motion-reduce:transition-none ${props.checked ? "translate-x-3.5" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

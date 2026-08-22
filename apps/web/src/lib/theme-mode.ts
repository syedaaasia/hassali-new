export type ThemeMode = "dark" | "darker";

export function resolveThemeMode(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "darker";
}

export const defaultThemeMode: ThemeMode = "darker";
export const legacyThemeStorageKey = "hassali:theme";
export const themeStorageKey = "hassali:theme:v2";

import type { DesignTokenMap, DesignTokenThemeId } from "@/lib/server/design/tokens/design-token-types";

export type DesignTokenThemeDefinition = {
  description: string;
  id: DesignTokenThemeId;
  name: string;
  tokens: DesignTokenMap;
};

const baseTypography = {
  bodyLineHeight: token("typography", "1.65"),
  display: token("typography", "clamp(3rem, 9vw, 7rem)"),
  fontDisplay: token("typography", "Inter, ui-sans-serif, system-ui, sans-serif"),
  fontSans: token("typography", "Inter, ui-sans-serif, system-ui, sans-serif"),
  heading: token("typography", "clamp(2rem, 5vw, 4.25rem)"),
  textBase: token("typography", "1rem"),
  textLg: token("typography", "1.125rem"),
  textSm: token("typography", "0.875rem"),
  textXl: token("typography", "1.35rem"),
  textXs: token("typography", "0.75rem")
};

const baseSpacing = {
  "2xl": token("spacing", "4rem"),
  lg: token("spacing", "2rem"),
  md: token("spacing", "1rem"),
  page: token("spacing", "clamp(1.25rem, 4vw, 4.5rem)"),
  section: token("spacing", "clamp(4rem, 9vw, 8rem)"),
  sm: token("spacing", "0.75rem"),
  xl: token("spacing", "3rem"),
  xs: token("spacing", "0.5rem")
};

const baseStructure = {
  border: {
    focus: token("border", "#8ee7ff"),
    strong: token("border", "#c9d6e8"),
    subtle: token("border", "#26313d")
  },
  component: {
    buttonPadding: token("component", "0.85rem 1.25rem"),
    cardPadding: token("component", "clamp(1.1rem, 2.4vw, 2rem)"),
    headerHeight: token("component", "72px"),
    sectionPadding: token("component", "clamp(4rem, 8vw, 7rem) 0")
  },
  layout: {
    contentWidth: token("layout", "1040px"),
    gridGap: token("layout", "1rem"),
    maxWidth: token("layout", "1180px")
  },
  motion: {
    base: token("motion", "220ms"),
    ease: token("motion", "cubic-bezier(0.22, 1, 0.36, 1)"),
    fast: token("motion", "140ms"),
    slow: token("motion", "420ms")
  },
  radius: {
    card: token("radius", "24px"),
    lg: token("radius", "18px"),
    md: token("radius", "14px"),
    pill: token("radius", "999px"),
    sm: token("radius", "10px"),
    xl: token("radius", "28px")
  },
  shadow: {
    elevated: token("shadow", "0 28px 80px rgba(0, 0, 0, 0.18)"),
    glow: token("shadow", "0 0 42px rgba(96, 239, 255, 0.18)"),
    soft: token("shadow", "0 18px 60px rgba(0, 0, 0, 0.12)")
  }
} satisfies Pick<DesignTokenMap, "border" | "component" | "layout" | "motion" | "radius" | "shadow">;

export const designTokenThemes: Record<DesignTokenThemeId, DesignTokenThemeDefinition> = {
  ai_product: createTheme("ai_product", "AI Product", "Dark interface-forward product systems.", {
    accent: "#60efff",
    background: "#05070a",
    foreground: "#f7fbff",
    muted: "#9aa8b5",
    primary: "#00ff87",
    primaryForeground: "#03110a",
    secondary: "#6c5cff",
    surface: "#0d1218",
    surfaceElevated: "#111923"
  }),
  default_dark: createTheme("default_dark", "Default Dark", "Hassali dark baseline for unknown premium sites.", {
    accent: "#60efff",
    background: "#090a0f",
    foreground: "#ffffff",
    muted: "#a1a1aa",
    primary: "#00ff87",
    primaryForeground: "#03110a",
    secondary: "#8b5cf6",
    surface: "#111217",
    surfaceElevated: "#171922"
  }),
  healthcare: createTheme("healthcare", "Healthcare", "Calm clinical trust and appointment surfaces.", {
    accent: "#66d9e8",
    background: "#f5fbfa",
    foreground: "#102321",
    muted: "#58716d",
    primary: "#0f8f7e",
    primaryForeground: "#ffffff",
    secondary: "#86efac",
    surface: "#ffffff",
    surfaceElevated: "#e9f8f5"
  }),
  luxury_ecommerce: createTheme("luxury_ecommerce", "Luxury Ecommerce", "Premium commerce with product-led editorial contrast.", {
    accent: "#d8b56d",
    background: "#0b0907",
    foreground: "#fff8ed",
    muted: "#b7aa97",
    primary: "#f5c86a",
    primaryForeground: "#201405",
    secondary: "#7dd3fc",
    surface: "#17130f",
    surfaceElevated: "#221b14"
  }),
  marketplace: createTheme("marketplace", "Marketplace", "Discovery, trust, and two-sided commerce paths.", {
    accent: "#f59e0b",
    background: "#081018",
    foreground: "#f7fbff",
    muted: "#9fb0bd",
    primary: "#22c55e",
    primaryForeground: "#03110a",
    secondary: "#38bdf8",
    surface: "#101923",
    surfaceElevated: "#172331"
  }),
  portfolio: createTheme("portfolio", "Portfolio", "Editorial identity, selected work, and refined inquiry flows.", {
    accent: "#f0abfc",
    background: "#0a090b",
    foreground: "#faf7fb",
    muted: "#b8adb9",
    primary: "#e879f9",
    primaryForeground: "#19051c",
    secondary: "#fef3c7",
    surface: "#141116",
    surfaceElevated: "#1d1820"
  }),
  real_estate: createTheme("real_estate", "Real Estate", "Property cards, map-like surfaces, and agent trust.", {
    accent: "#94a3b8",
    background: "#f6f3ee",
    foreground: "#18140f",
    muted: "#6d6257",
    primary: "#335c43",
    primaryForeground: "#ffffff",
    secondary: "#b45309",
    surface: "#ffffff",
    surfaceElevated: "#eee7dc"
  }),
  restaurant: createTheme("restaurant", "Restaurant", "Menu, order, and hospitality-focused presentation.", {
    accent: "#fb923c",
    background: "#100c08",
    foreground: "#fff7ed",
    muted: "#c7b7a5",
    primary: "#f97316",
    primaryForeground: "#1f0a00",
    secondary: "#facc15",
    surface: "#1b130d",
    surfaceElevated: "#261a11"
  }),
  saas: createTheme("saas", "SaaS", "Conversion-focused product surfaces and proof systems.", {
    accent: "#8b5cf6",
    background: "#07080c",
    foreground: "#f8fafc",
    muted: "#a1a8b3",
    primary: "#60efff",
    primaryForeground: "#021114",
    secondary: "#00ff87",
    surface: "#10131a",
    surfaceElevated: "#171b25"
  })
};

export function getDesignTokenTheme(theme: DesignTokenThemeId) {
  return designTokenThemes[theme];
}

export function isDesignTokenTheme(theme: string): theme is DesignTokenThemeId {
  return Object.prototype.hasOwnProperty.call(designTokenThemes, theme);
}

function createTheme(
  id: DesignTokenThemeId,
  name: string,
  description: string,
  colors: {
    accent: string;
    background: string;
    foreground: string;
    muted: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    surface: string;
    surfaceElevated: string;
  }
): DesignTokenThemeDefinition {
  return {
    description,
    id,
    name,
    tokens: {
      border: baseStructure.border,
      color: {
        accent: token("color", colors.accent),
        background: token("color", colors.background),
        border: token("color", blendBorder(colors.foreground)),
        foreground: token("color", colors.foreground),
        muted: token("color", colors.muted),
        primary: token("color", colors.primary),
        primaryForeground: token("color", colors.primaryForeground),
        ring: token("color", colors.accent),
        secondary: token("color", colors.secondary),
        surface: token("color", colors.surface),
        surfaceElevated: token("color", colors.surfaceElevated),
        warning: token("color", "#f59e0b")
      },
      component: baseStructure.component,
      layout: baseStructure.layout,
      motion: baseStructure.motion,
      radius: baseStructure.radius,
      shadow: baseStructure.shadow,
      spacing: baseSpacing,
      typography: baseTypography
    }
  };
}

function blendBorder(foreground: string) {
  return foreground.toLowerCase() === "#ffffff" || foreground.toLowerCase() === "#f8fafc" ? "#273241" : "#d8d0c4";
}

function token(type: DesignTokenMap[keyof DesignTokenMap][string]["type"], value: string) {
  return { type, value };
}

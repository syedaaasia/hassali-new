export type DesignTokenCategory =
  | "border"
  | "color"
  | "component"
  | "layout"
  | "motion"
  | "radius"
  | "shadow"
  | "spacing"
  | "typography";

export type DesignTokenThemeId =
  | "ai_product"
  | "default_dark"
  | "healthcare"
  | "luxury_ecommerce"
  | "marketplace"
  | "portfolio"
  | "real_estate"
  | "restaurant"
  | "saas";

export type DesignTokenValue = {
  description?: string;
  type: DesignTokenCategory;
  value: string;
};

export type DesignTokenGroup = Record<string, DesignTokenValue>;

export type DesignTokenMap = {
  border: DesignTokenGroup;
  color: DesignTokenGroup;
  component: DesignTokenGroup;
  layout: DesignTokenGroup;
  motion: DesignTokenGroup;
  radius: DesignTokenGroup;
  shadow: DesignTokenGroup;
  spacing: DesignTokenGroup;
  typography: DesignTokenGroup;
};

export type TokensStudioToken = {
  description?: string;
  type?: string;
  value: string;
};

export type TokensStudioTokenMap = Record<string, Record<string, TokensStudioToken>>;

export type DesignTokenValidationIssue = {
  code:
    | "duplicate_token_name"
    | "empty_spacing_scale"
    | "empty_typography_scale"
    | "invalid_hex_color"
    | "missing_required_token"
    | "unsupported_theme";
  message: string;
  severity: "blocker" | "warning";
  tokenPath?: string;
};

export type DesignTokenValidationResult = {
  issueCount: number;
  issues: DesignTokenValidationIssue[];
  passed: boolean;
  requiredTokensPresent: boolean;
  theme: DesignTokenThemeId;
  tokenCount: number;
};

export type GeneratedDesignTokens = {
  cssVariables: Record<string, string>;
  theme: DesignTokenThemeId;
  themeName: string;
  tokenCount: number;
  tokens: DesignTokenMap;
  tokensStudioExport: TokensStudioTokenMap;
  validation: DesignTokenValidationResult;
};

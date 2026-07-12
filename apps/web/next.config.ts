import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnvLocalPath = resolve(import.meta.dirname, "../../.env.local");
const inheritedOpenRouterCredential = Boolean(process.env.OPENROUTER_API_KEY);
const skipRootEnvForDevelopmentTest = process.env.NODE_ENV !== "production" && process.env.HASSALI_SKIP_ROOT_ENV === "1";

if (!skipRootEnvForDevelopmentTest && existsSync(rootEnvLocalPath)) {
  process.loadEnvFile(rootEnvLocalPath);
}

process.env.HASSALI_OPENROUTER_ENV_SOURCE = process.env.OPENROUTER_API_KEY
  ? !skipRootEnvForDevelopmentTest && existsSync(rootEnvLocalPath)
    ? "credential_loaded_from_application_environment"
    : inheritedOpenRouterCredential
      ? "credential_inherited_from_parent_process"
      : "credential_loaded_from_application_environment"
  : "credential_missing";

const nextConfig: NextConfig = {
  poweredByHeader: false
};

export default nextConfig;

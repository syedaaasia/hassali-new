import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootEnvLocalPath = resolve(import.meta.dirname, "../../.env.local");

if (existsSync(rootEnvLocalPath)) {
  const envLines = readFileSync(rootEnvLocalPath, "utf8").split(/\r?\n/);

  for (const line of envLines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex);
    const value = trimmedLine.slice(separatorIndex + 1);

    process.env[key] ??= value;
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false
};

export default nextConfig;

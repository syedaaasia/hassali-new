import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const sourceRoot = path.resolve(process.cwd(), "apps/web/src");

export async function resolve(specifier, context, nextResolve) {
  const candidates = [];

  if (specifier.startsWith("@/")) {
    candidates.push(path.resolve(sourceRoot, specifier.slice(2)));
  } else if (specifier.startsWith(".") && context.parentURL) {
    candidates.push(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }

  for (const candidate of candidates) {
    for (const extension of ["", ".ts", ".tsx"]) {
      const fullPath = `${candidate}${extension}`;
      if (existsSync(fullPath)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(fullPath).href
        };
      }
    }
  }

  return nextResolve(specifier, context);
}

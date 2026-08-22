import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDesignKnowledgeDocument } from "../src/lib/server/design/knowledge/design-knowledge-parser";
import type { DesignKnowledgeIndex } from "../src/lib/server/design/knowledge/design-knowledge-profile";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDirectory, "..");
const corpusRoot = join(webRoot, "resources", "design-knowledge", "awesome-design-md");
const outputPath = join(webRoot, "src", "lib", "server", "design", "knowledge", "compiled-design-knowledge.json");

const directories = (await readdir(corpusRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));
const profiles = [];
for (const directory of directories) {
  const path = join(corpusRoot, directory.name, "DESIGN.md");
  const content = await readFile(path, "utf8");
  profiles.push(parseDesignKnowledgeDocument({
    content,
    sourcePath: relative(webRoot, path).replace(/\\/g, "/")
  }));
}
const legacyCount = profiles.filter((profile) => profile.sourceFormat === "legacy").length;
const structuredCount = profiles.filter((profile) => profile.sourceFormat === "structured-frontmatter").length;
if (profiles.length !== 74 || structuredCount !== 64 || legacyCount !== 10) {
  throw new Error(`Unexpected design corpus: total=${profiles.length}, structured=${structuredCount}, legacy=${legacyCount}`);
}
const fingerprint = createHash("sha256")
  .update(profiles.map((profile) => `${profile.id}:${profile.fingerprint}`).join("\n"))
  .digest("hex")
  .slice(0, 24);
const index: DesignKnowledgeIndex = {
  fingerprint,
  generatedAt: new Date().toISOString(),
  legacyCount,
  profiles,
  sourceLicense: "MIT",
  structuredCount,
  version: 1
};
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
process.stdout.write(`Compiled ${profiles.length} design profiles (${structuredCount} structured, ${legacyCount} legacy), fingerprint ${fingerprint}.\n`);

import { readFileSync } from "node:fs";
import process from "node:process";

const required = ["claim", "evidence", "source"];
const argumentInput = process.argv.slice(2).join(" ").trim();
const input = argumentInput || (process.stdin.isTTY ? "" : readFileSync(0, "utf8").trim());

if (!input) {
  process.stdout.write(JSON.stringify({ valid: false, missing: required }));
  process.exit(0);
}

let value;
try {
  value = JSON.parse(input);
} catch {
  process.stdout.write(JSON.stringify({ valid: false, reason: "invalid_json" }));
  process.exit(0);
}

const missing = required.filter((key) => typeof value?.[key] !== "string" || !value[key].trim());
process.stdout.write(JSON.stringify({ valid: missing.length === 0, missing }));

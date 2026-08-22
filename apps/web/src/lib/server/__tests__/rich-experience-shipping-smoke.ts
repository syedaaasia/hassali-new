import assert from "node:assert/strict";
import test from "node:test";
import {
  createHassaliCuratedAssetProvider,
  rankCuratedAssets,
  resolveExperienceMedia,
  type CuratedAssetRecord
} from "@/lib/server/curated-asset-provider";
import { createAskCsvArtifact, preserveCoreResultWhenOptionalArtifactFails } from "@/lib/server/rich-experience";
import { createStoredZip, prepareProjectExportFiles } from "@/lib/server/project-export";
import {
  createVerifiedProjectPackage,
  SHIPPING_MANIFEST_PATH,
  verifyProjectPackage
} from "@/lib/server/verified-shipping";

const fixtures: CuratedAssetRecord[] = [
  {
    active: true, aspectRatio: 1.5, domain: "architecture", id: "architecture-form", license: "allowed", orientation: "landscape",
    people: false, productionEvidence: true, publicPath: "website/architecture/completed-form.webp", quality: 92,
    roles: ["hero", "exterior"], style: ["minimal", "material"], subjects: ["facade", "completed building", "architecture"]
  },
  {
    active: true, aspectRatio: 1.5, domain: "construction", id: "construction-site", license: "allowed", orientation: "landscape",
    people: true, productionEvidence: true, publicPath: "website/construction/active-site.webp", quality: 91,
    roles: ["hero", "process"], style: ["documentary", "industrial"], subjects: ["workers", "machinery", "active build"]
  },
  {
    active: true, aspectRatio: 1, domain: "beauty", id: "beauty-product", license: "attribution_required", orientation: "square",
    people: false, productionEvidence: true, publicPath: "website/beauty/product.webp", quality: 90,
    roles: ["product", "hero"], style: ["clean", "editorial"], subjects: ["cosmetics", "skincare", "product"]
  },
  {
    active: true, aspectRatio: 1.7, domain: "automotive", id: "automotive-road", license: "allowed", orientation: "landscape",
    people: false, productionEvidence: true, publicPath: "website/automotive/road.webp", quality: 93,
    roles: ["hero", "gallery"], style: ["cinematic", "premium"], subjects: ["vehicle", "sports car", "road"]
  },
  {
    active: true, aspectRatio: 1, domain: "beauty", id: "beauty-unknown-license", license: "unknown", orientation: "square",
    people: false, productionEvidence: true, publicPath: "website/beauty/unknown.webp", quality: 100,
    roles: ["product"], style: ["clean"], subjects: ["cosmetics", "product"]
  }
];

const provider = createHassaliCuratedAssetProvider({ origin: "https://assets.hassali.site", records: fixtures });

test("architecture and construction stay semantically distinct", () => {
  const architecture = provider.select({ domain: "architecture", people: false, role: "hero", subjects: ["facade"] });
  const construction = provider.select({ domain: "construction", people: true, role: "hero", subjects: ["workers"] });
  assert.equal(architecture?.id, "architecture-form");
  assert.equal(construction?.id, "construction-site");
});

test("beauty product and automotive hero select in-domain evidence", () => {
  assert.equal(provider.select({ domain: "beauty", productionEvidence: true, role: "product" })?.id, "beauty-product");
  assert.equal(provider.select({ domain: "automotive", role: "hero", style: ["premium"] })?.id, "automotive-road");
});

test("ranking is deterministic and uses stable ID tie-breaking", () => {
  const duplicate = { ...fixtures[0]!, id: "architecture-a" };
  const ranked = rankCuratedAssets([fixtures[0]!, duplicate], { domain: "architecture", role: "hero" });
  assert.deepEqual(ranked.map((entry) => entry.record.id), ["architecture-a", "architecture-form"]);
});

test("explicit user asset wins while unrelated upload has no authority", async () => {
  const userAssets = [{ id: "uploaded-beauty", license: "user_supplied" as const, provenance: "user_upload" as const, role: "hero", score: 0, url: "./assets/beauty.jpg" }];
  const selected = await resolveExperienceMedia({ curatedProvider: provider, optional: false, request: { domain: "beauty", role: "hero" }, requestedUserAssetIds: ["uploaded-beauty"], userAssets });
  assert.equal(selected?.id, "uploaded-beauty");
  const unrelated = await resolveExperienceMedia({ curatedProvider: provider, optional: false, request: { domain: "beauty", role: "hero" }, userAssets });
  assert.equal(unrelated?.id, "beauty-product");
});

test("no suitable asset returns image-light instead of wrong-domain media", async () => {
  const selected = await resolveExperienceMedia({ curatedProvider: provider, optional: true, request: { domain: "marine-biology", role: "hero" } });
  assert.equal(selected, null);
});

test("unknown or disallowed licenses fail closed", () => {
  const selected = provider.select({ domain: "beauty", role: "product" });
  assert.equal(selected?.id, "beauty-product");
  assert.equal(selected?.license, "attribution_required");
});

test("generated fallback gets a semantic brief and unavailable optional media degrades", async () => {
  let brief: unknown = null;
  const generated = await resolveExperienceMedia({
    generatedProvider: { async generate(input) { brief = input; return { id: "generated-one", url: "./assets/generated.webp" }; } },
    optional: true,
    request: { aspectRatio: 1.8, domain: "marine-biology", role: "hero", style: ["documentary"], subjects: ["coral"] }
  });
  assert.equal(generated?.provenance, "generated");
  assert.deepEqual(brief, { aspectRatio: 1.8, domain: "marine-biology", purpose: "Website hero", role: "hero", style: ["documentary"], subjects: ["coral"] });
  const unavailable = await resolveExperienceMedia({ generatedProvider: { async generate() { return null; } }, optional: true, request: { domain: "marine-biology", role: "hero" } });
  assert.equal(unavailable, null);
});

test("curated origin and paths reject credentials and traversal", () => {
  assert.throws(() => createHassaliCuratedAssetProvider({ origin: "http://assets.hassali.site", records: [] }), /HTTPS/);
  const unsafe = createHassaliCuratedAssetProvider({ records: [{ ...fixtures[0]!, publicPath: "../private/image.webp" }] });
  assert.throws(() => unsafe.select({ domain: "architecture", role: "hero" }), /Unsafe curated asset path/);
});

test("WEBSITE preview and package use the same canonical replacement media", () => {
  const current = [
    { content: '<img src="./assets/hero-b.webp" alt="Beauty product arrangement">', path: "index.html" },
    { content: new Uint8Array([1, 2, 3]), path: "assets/hero-b.webp" },
    { content: "mode: WEBSITE", path: "HASSALI.md" }
  ];
  const packaged = createVerifiedProjectPackage({ canonicalRevision: "revision-n-plus-1", files: current, mode: "WEBSITE", projectName: "Beauty", projectVerification: "verified" });
  assert.equal(packaged.manifest.canonicalRevision, "revision-n-plus-1");
  assert(packaged.manifest.files.some((file) => file.path === "assets/hero-b.webp"));
  assert(!packaged.manifest.files.some((file) => file.path === "assets/hero-a.webp"));
  assert.match(current[0]!.content as string, /hero-b\.webp/);
});

test("CODE shipping contains the verified repaired state, not a stale source file", () => {
  const packaged = createVerifiedProjectPackage({
    canonicalRevision: "verified-repair-2",
    files: [{ content: "export const fixed = true;", path: "src/index.ts" }, { content: '{"scripts":{"test":"node test.js"}}', path: "package.json" }],
    mode: "CODE", projectName: "Fixed CLI", projectVerification: "verified"
  });
  assert.equal(packaged.manifest.verification.project, "verified");
  assert(packaged.manifest.files.some((file) => file.path === "src/index.ts"));
  assert.doesNotMatch(packaged.zip.toString("utf8"), /fixed = false/);
});

test("shipping excludes caches and environment files but keeps env examples", () => {
  const packaged = createVerifiedProjectPackage({
    files: [
      { content: "<main>Safe</main>", path: "index.html" }, { content: "TOKEN=fake-test-value", path: ".env" },
      { content: "TOKEN=", path: ".env.example" }, { content: "cache", path: "node_modules/pkg/a.js" }
    ],
    mode: "WEBSITE", projectName: "Safe Site"
  });
  const paths = packaged.manifest.files.map((file) => file.path);
  assert(paths.includes(".env.example"));
  assert(!paths.includes(".env"));
  assert(!paths.some((path) => path.startsWith("node_modules/")));
  assert.doesNotMatch(packaged.zip.toString("utf8"), /fake-test-value/);
});

test("private-key content blocks package readiness without echoing its value", () => {
  const secret = "-----BEGIN PRIVATE KEY-----\nfake-test-key\n-----END PRIVATE KEY-----";
  assert.throws(() => createVerifiedProjectPackage({ files: [{ content: "<main />", path: "index.html" }, { content: secret, path: "notes.txt" }], mode: "WEBSITE", projectName: "Blocked" }), (error) => {
    assert(error instanceof Error);
    assert.match(error.message, /private key/i);
    assert.doesNotMatch(error.message, /fake-test-key/);
    return true;
  });
});

test("ZIP traversal is rejected before package creation", () => {
  assert.throws(() => createVerifiedProjectPackage({ files: [{ content: "<main />", path: "index.html" }, { content: "evil", path: "../../evil.txt" }], mode: "WEBSITE", projectName: "Unsafe" }), /unsafe path/i);
});

test("manifest hashes match all packaged files and logical identity is deterministic", () => {
  const input = { files: [{ content: "<main>One</main>", path: "index.html" }, { content: new Uint8Array([0x50, 0x4b, 0x01, 0x02, 1, 2, 3]), path: "assets/signature.bin" }], mode: "WEBSITE" as const, projectName: "One", canonicalRevision: "revision-one" };
  const first = createVerifiedProjectPackage({ ...input, createdAt: new Date("2026-01-01T00:00:00Z") });
  const second = createVerifiedProjectPackage({ ...input, createdAt: new Date("2026-02-01T00:00:00Z") });
  assert.equal(first.manifest.packageId, second.manifest.packageId);
  assert.equal(first.manifest.files.length, 3);
  assert.equal(verifyProjectPackage(first.zip).packageId, first.manifest.packageId);
  assert.match(first.zip.toString("utf8"), new RegExp(SHIPPING_MANIFEST_PATH));
});

test("derived canonical revision fingerprints project bytes, not the synthetic export note", () => {
  const files = [{ content: "<main>Same</main>", path: "index.html" }];
  const first = createVerifiedProjectPackage({ files, mode: "WEBSITE", projectName: "First Name" });
  const renamed = createVerifiedProjectPackage({ files, mode: "WEBSITE", projectName: "Renamed Project" });
  assert.equal(first.manifest.canonicalRevision, renamed.manifest.canonicalRevision);
  assert.notEqual(first.manifest.packageId, renamed.manifest.packageId);
});

test("corrupted package cannot report package ready", () => {
  const valid = createVerifiedProjectPackage({ files: [{ content: "<main>Good</main>", path: "index.html" }], mode: "WEBSITE", projectName: "Good" });
  const manifestText = `${JSON.stringify(valid.manifest, null, 2)}\n`;
  const corrupted = createStoredZip(prepareProjectExportFiles({ files: [{ content: "<main>Changed</main>", path: "index.html" }], mode: "WEBSITE", projectName: "Good" }).concat({ content: manifestText, path: SHIPPING_MANIFEST_PATH }));
  assert.throws(() => verifyProjectPackage(corrupted), /does not match the current project/);
});

test("ASK CSV is a validated ASK-owned artifact without a CODE workspace", () => {
  const artifact = createAskCsvArtifact({ content: "name,email\nAli,ali@example.com\nSara,sara@example.com" });
  assert.equal(artifact.rows, 2);
  assert.equal(artifact.result.mode, "ASK");
  assert.equal(artifact.result.status, "valid");
  assert.equal(artifact.result.download.available, true);
  assert.equal(artifact.result.primaryArtifact?.kind, "csv");
});

test("artifact ownership remains isolated across modes", () => {
  const ask = createAskCsvArtifact({ content: "name,email\nAli,ali@example.com" }).result;
  const website = createVerifiedProjectPackage({ files: [{ content: "<main />", path: "index.html" }], mode: "WEBSITE", projectName: "Site" });
  const code = createVerifiedProjectPackage({ files: [{ content: "{}", path: "package.json" }, { content: "export default 1", path: "src/index.ts" }], mode: "CODE", projectName: "Code" });
  assert.equal(ask.mode, "ASK");
  assert.equal(website.manifest.mode, "WEBSITE");
  assert.equal(code.manifest.mode, "CODE");
});

test("optional rich-output failure preserves a valid core answer", () => {
  const result = preserveCoreResultWhenOptionalArtifactFails({ coreSatisfied: true, mode: "ASK", reason: "image provider unavailable" });
  assert.equal(result.status, "valid");
  assert.equal(result.preview.available, true);
  assert.equal(result.download.available, false);
  assert.match(result.warnings[0] ?? "", /image provider unavailable/);
});

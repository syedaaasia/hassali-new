import assert from "node:assert/strict";
import test from "node:test";
import {
  compactDesignKnowledgeProfile,
  designKnowledgeIndex,
  designKnowledgeLimits,
  resolveDesignKnowledgeReference,
  retrieveDesignKnowledge
} from "../design-knowledge-library";

test("DESIGN KNOWLEDGE compiles the complete licensed corpus", () => {
  const index = designKnowledgeIndex();
  assert.equal(index.profiles.length, 74);
  assert.equal(index.structuredCount, 64);
  assert.equal(index.legacyCount, 10);
  assert.equal(index.sourceLicense, "MIT");
  assert.equal(index.fingerprint, "261c5b598d3e0dd01345700f");
  assert(index.profiles.every((profile) => profile.fingerprint.length === 20));
});

test("DESIGN KNOWLEDGE resolves aliases and structured token references", () => {
  const shopify = resolveDesignKnowledgeReference("shopify");
  assert(shopify);
  assert.equal(shopify.sourceFormat, "structured-frontmatter");
  assert.equal(shopify.colors["canvas-night"], "#000000");
  assert.match(shopify.typography["display-xxl"]?.family ?? "", /NeueHaasGrotesk/i);
  assert.equal(shopify.components["button-primary-pill"]?.resolvedProperties.backgroundColor, "#000000");
  assert.match(shopify.components["button-primary-pill"]?.resolvedProperties.typography ?? "", /fontFamily:.*Inter/i);
  assert.equal(shopify.components["button-primary-pill"]?.resolvedProperties.rounded, "9999px");
});

test("DESIGN KNOWLEDGE preserves usable legacy profiles and bounded retrieval", () => {
  const index = designKnowledgeIndex();
  const legacy = index.profiles.find((profile) => profile.sourceFormat === "legacy");
  assert(legacy);
  assert(legacy.atmosphere.length + legacy.layout.length + legacy.imagery.length > 0);
  const results = retrieveDesignKnowledge({ maximum: 99, prompt: "cinematic editorial commerce experience" });
  assert(results.length <= designKnowledgeLimits.maxProfiles);
  assert(results.every((result) => result.score > 0));
  const compact = compactDesignKnowledgeProfile(resolveDesignKnowledgeReference("shopify")!);
  assert(JSON.stringify(compact).length <= designKnowledgeLimits.maxContextCharacters);
});

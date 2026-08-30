import type { AskResearchSource } from "./ask-source-reliability";

type NodeRelease = {
  date?: unknown;
  lts?: unknown;
  version?: unknown;
};

export type OfficialReleaseResolution = {
  answer: string;
  sources: AskResearchSource[];
};

const nodeReleaseQuery = /\bnode(?:\.js|js)?\b/i;
const currentReleaseQuery = /\b(?:latest|current|stable)\b[\s\S]{0,60}\b(?:version|release)\b|\b(?:version|release)\b[\s\S]{0,60}\b(?:latest|current|stable)\b/i;

function cleanVersion(value: unknown) {
  return typeof value === "string" && /^v\d+\.\d+\.\d+$/.test(value) ? value.slice(1) : null;
}

function cleanDate(value: unknown) {
  return typeof value === "string" && /^20\d{2}-[01]\d-[0-3]\d$/.test(value) ? value : null;
}

async function fetchNodeReleases(signal?: AbortSignal) {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://nodejs.org/dist/index.json", {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const declaredBytes = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > 2 * 1024 * 1024) return null;
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) return null;
    const releases = JSON.parse(text) as NodeRelease[];
    if (!Array.isArray(releases)) return null;
    const current = releases.find((release) => cleanVersion(release.version));
    const lts = releases.find((release) => cleanVersion(release.version) && Boolean(release.lts));
    if (!current || !lts) return null;
    const currentVersion = cleanVersion(current.version);
    const ltsVersion = cleanVersion(lts.version);
    if (!currentVersion || !ltsVersion) return null;
    return {
      currentDate: cleanDate(current.date),
      currentVersion,
      ltsDate: cleanDate(lts.date),
      ltsVersion
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

export async function resolveOfficialReleaseQuery(input: {
  prompt: string;
  retrievedAt: string;
  signal?: AbortSignal;
}): Promise<OfficialReleaseResolution | null> {
  if (!nodeReleaseQuery.test(input.prompt) || !currentReleaseQuery.test(input.prompt)) return null;
  const release = await fetchNodeReleases(input.signal);
  if (!release) return null;
  const answer = `Node.js ${release.currentVersion} is the latest Current release, while ${release.ltsVersion} is the latest LTS release for production use. These are separate official release channels, so “latest stable” can refer to either; LTS is the conservative production choice.`;
  return {
    answer,
    sources: [
      {
        claimScope: "version:current",
        claimValue: release.currentVersion,
        content: `The official Node.js release index lists ${release.currentVersion} as the latest Current release${release.currentDate ? ` dated ${release.currentDate}` : ""}.`,
        id: "nodejs-official-current-release",
        isOfficial: true,
        retrievedAt: input.retrievedAt,
        sourceType: "official",
        title: "Official Node.js Current releases",
        updatedAt: release.currentDate,
        url: "https://nodejs.org/download/release/latest/",
        version: release.currentVersion
      },
      {
        claimScope: "version:lts",
        claimValue: release.ltsVersion,
        content: `The official Node.js release index lists ${release.ltsVersion} as the latest LTS release${release.ltsDate ? ` dated ${release.ltsDate}` : ""}.`,
        id: "nodejs-official-lts-release",
        isOfficial: true,
        retrievedAt: input.retrievedAt,
        sourceType: "official",
        title: "Official Node.js LTS download",
        updatedAt: release.ltsDate,
        url: "https://nodejs.org/en/download",
        version: release.ltsVersion
      }
    ]
  };
}

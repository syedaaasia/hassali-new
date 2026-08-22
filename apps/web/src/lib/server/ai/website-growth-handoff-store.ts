import { listUserProjectFiles, loadOwnedProjectRevision } from "@hassali/database";
import {
  buildWebsiteGrowthHandoff,
  WebsiteGrowthHandoffError,
  type WebsiteGrowthHandoff
} from "@/lib/server/ai/website-growth-handoff";

type OwnedWebsiteGrowthDependencies = {
  listFiles: (input: { externalUserId: string; projectId: string }) => Promise<Array<{ content: string; path: string }> | null>;
  loadRevision: (input: { externalUserId: string; projectId: string }) => Promise<string | null>;
};

const databaseDependencies: OwnedWebsiteGrowthDependencies = {
  listFiles: listUserProjectFiles,
  loadRevision: loadOwnedProjectRevision
};

export async function getOwnedWebsiteGrowthHandoff(
  input: { externalUserId: string; projectId: string },
  dependencies: OwnedWebsiteGrowthDependencies = databaseDependencies
): Promise<WebsiteGrowthHandoff> {
  const [files, revision] = await Promise.all([
    dependencies.listFiles(input),
    dependencies.loadRevision(input)
  ]);
  if (!files || !revision) {
    throw new WebsiteGrowthHandoffError("The requested project is unavailable to this owner.", "OWNERSHIP_REQUIRED");
  }
  return buildWebsiteGrowthHandoff({
    authoritativeState: "applied",
    files: Object.fromEntries(files.map((file) => [file.path, file.content])),
    projectId: input.projectId,
    revision
  });
}

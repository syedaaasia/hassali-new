import { auth, currentUser } from "@clerk/nextjs/server";
import { createProjectWithStarterFile, loadWorkspaceForExternalUser } from "@hassali/database";

export async function POST(request: Request) {
  console.info("create project started");
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const projectName =
    typeof body?.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, 140)
      : "Untitled Project";

  try {
    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ??
      clerkUser?.emailAddresses[0]?.emailAddress ??
      `${userId}@clerk.local`;

    console.info("clerk user resolved");

    const result = await createProjectWithStarterFile({
      displayName: clerkUser?.fullName ?? clerkUser?.username ?? null,
      email: primaryEmail,
      externalId: userId,
      imageUrl: clerkUser?.imageUrl ?? null,
      projectName
    });

    const workspace = await loadWorkspaceForExternalUser(userId, result.project.id);

    return Response.json({
      chat: workspace.chat,
      files: workspace.files,
      project: workspace.project,
      projects: workspace.projects,
      workspace: workspace.workspace ?? {
        id: "",
        name: "My Workspace"
      }
    });
  } catch (error) {
    console.error(
      "create project failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return Response.json({ error: "Project creation failed." }, { status: 500 });
  }
}

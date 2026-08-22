import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { githubConfiguration, saveGitHubAccessToken } from "@/lib/server/github/github-integration";

export async function GET(request: Request) {
  const { userId } = await auth();
  const incoming = new URL(request.url);
  const dashboard = new URL("/dashboard", incoming.origin);
  if (!userId) return NextResponse.redirect(new URL("/sign-in", incoming.origin));
  const state = incoming.searchParams.get("state") ?? "";
  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader.match(/(?:^|;\s*)hassali_github_oauth_state=([^;]+)/)?.[1] ?? "";
  const code = incoming.searchParams.get("code") ?? "";
  const config = githubConfiguration();
  if (!config.configured || !code || !state || decodeURIComponent(expectedState) !== state) {
    dashboard.searchParams.set("github", "failed");
    return NextResponse.redirect(dashboard);
  }
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.callbackUrl }),
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Hassali.ai" },
      method: "POST",
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await response.json() as { access_token?: unknown };
    if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token) throw new Error("GITHUB_OAUTH_FAILED");
    await saveGitHubAccessToken(userId, payload.access_token);
    dashboard.searchParams.set("github", "connected");
  } catch {
    dashboard.searchParams.set("github", "failed");
  }
  const redirect = NextResponse.redirect(dashboard);
  redirect.cookies.set("hassali_github_oauth_state", "", { maxAge: 0, path: "/api/github/callback" });
  return redirect;
}

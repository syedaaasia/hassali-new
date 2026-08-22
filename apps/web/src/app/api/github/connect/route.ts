import { randomBytes } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { githubConfiguration } from "@/lib/server/github/github-integration";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const config = githubConfiguration();
  if (!config.configured) return Response.json({ error: config.reason }, { status: 503 });
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", config.callbackUrl);
  authorize.searchParams.set("scope", "repo read:user");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set("hassali_github_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/api/github/callback",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}

import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell/app-shell";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in?redirect_url=/dashboard");
  }

  return <AppShell />;
}

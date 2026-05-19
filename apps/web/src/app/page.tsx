import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-col justify-between px-6 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-surface font-mono text-xs font-semibold">
              H
            </div>
            <span className="text-sm font-medium">Hassali.ai</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              className="rounded-md border bg-surface px-3 py-1.5 text-muted-foreground"
              href="/sign-in"
            >
              Sign in
            </Link>
            <Link
              className="rounded-md bg-accent px-3 py-1.5 text-accent-foreground"
              href="/sign-up"
            >
              Sign up
            </Link>
          </div>
        </header>

        <div className="max-w-2xl py-24">
          <p className="text-sm text-muted-foreground">AI-native software workspace</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            Calm coding tools for turning ideas into working software.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Hassali.ai keeps the surface simple: workspace-aware assistance, reviewed changes, and a
            lightweight editor experience for everyday machines.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              className="rounded-md bg-accent px-4 py-2 text-sm text-accent-foreground"
              href="/dashboard"
            >
              Open workspace
            </Link>
            <Link
              className="rounded-md border bg-surface px-4 py-2 text-sm text-muted-foreground"
              href="/sign-in"
            >
              Continue
            </Link>
          </div>
        </div>

        <footer className="border-t pt-4 text-xs text-muted-foreground">
          Public preview route. The workspace shell is protected.
        </footer>
      </section>
    </main>
  );
}

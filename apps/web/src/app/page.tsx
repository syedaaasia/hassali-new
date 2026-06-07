import Link from "next/link";

const strands = [
  "left-[12%] top-[18%] h-24 rotate-[-18deg]",
  "left-[38%] top-[10%] h-32 rotate-[14deg]",
  "right-[18%] top-[22%] h-28 rotate-[28deg]",
  "bottom-[18%] left-[28%] h-28 rotate-[34deg]",
  "bottom-[14%] right-[22%] h-36 rotate-[-24deg]"
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8">
        <div className="pointer-events-none absolute inset-x-6 top-20 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
        <header className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl">
              <img
                alt="Hassali.ai"
                className="h-full w-full object-contain"
                src="/brand/hassali-logo.png"
              />
            </div>
            <div>
              <div className="text-sm font-medium">Hassali.ai</div>
              <div className="hidden text-[11px] text-muted-foreground sm:block">
                AI-native coding workspace
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.7)] px-3.5 py-2 text-xs text-muted-foreground shadow-sm hover:text-foreground"
              href="/sign-in"
            >
              Sign in
            </Link>
            <Link
              className="rounded-xl border border-accent/35 bg-accent px-3.5 py-2 text-xs font-medium text-accent-foreground shadow-[0_16px_42px_hsl(var(--accent)/0.18)] hover:opacity-90"
              href="/sign-up"
            >
              Sign up
            </Link>
          </div>
        </header>

        <div className="relative z-10 grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1fr_0.88fr]">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-[hsl(var(--royal-border))] bg-[hsl(var(--gold)/0.08)] px-3 py-1 text-xs font-medium text-accent">
              Futuristic calm for working software
            </div>
            <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-7xl">
              Build software with a workspace that lowers the noise.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
              Hassali.ai blends a lightweight editor, workspace-aware assistance, and review-first
              safety into a calm surface designed for real machines and focused minds.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                className="rounded-xl border border-accent/35 bg-accent px-5 py-3 text-sm font-medium text-accent-foreground shadow-[0_18px_52px_hsl(var(--accent)/0.2)] hover:opacity-90"
                href="/dashboard"
              >
                Open workspace
              </Link>
              <Link
                className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.72)] px-5 py-3 text-sm text-muted-foreground shadow-sm hover:text-foreground"
                href="/dashboard"
              >
                Continue
              </Link>
            </div>
          </div>

          <div className="hassali-hero-field relative min-h-[390px] overflow-hidden rounded-[2rem] border border-[hsl(var(--royal-border))] shadow-[0_38px_120px_hsl(0_80%_3%/0.58),0_0_80px_hsl(var(--accent)/0.16)]">
            {strands.map((strand, index) => (
              <div
                className={`hassali-hero-thread absolute w-px rounded-full bg-gradient-to-b from-transparent via-accent/45 to-transparent ${strand}`}
                key={strand}
                style={{ animationDelay: `${index * 0.7}s` }}
              />
            ))}
            <div className="absolute inset-6 rounded-[1.5rem] border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.22)]" />
            <div className="absolute bottom-8 left-8 right-8 rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.72)] p-4 backdrop-blur">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Intent</span>
                <span className="text-accent">approved changes only</span>
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs text-muted-foreground">
                <div className="h-2 w-4/5 rounded-full bg-foreground/18" />
                <div className="h-2 w-2/3 rounded-full bg-accent/35" />
                <div className="h-2 w-5/6 rounded-full bg-foreground/12" />
              </div>
            </div>
          </div>
        </div>

        <footer className="relative z-10 border-t border-[hsl(var(--royal-border-soft))] pt-4 text-xs text-muted-foreground">
          Public preview route. The workspace shell is protected.
        </footer>
      </section>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { InteractiveSpotlightFooter } from "@/components/marketing/interactive-spotlight-footer";
import { CommandCapsule, PremiumPanel, SystemBadge } from "@/components/ui/premium";
import styles from "./home.module.css";

const modes = [
  {
    label: "ASK",
    summary: "Think, explain, guide",
    body: "Universal assistance for planning, learning, debugging, writing, and questions. No file mutation by default."
  },
  {
    label: "WEBSITE",
    summary: "Premium sites and edits",
    body: "Business websites, ecommerce, landing pages, visuals, product copy, image direction, animation, and theme edits."
  },
  {
    label: "CODE",
    summary: "Apps, tools, systems",
    body: "CRMs, dashboards, APIs, automations, Python tools, desktop apps, mobile ideas, and serious engineering proposals."
  }
];

const workflow = [
  "Describe the idea",
  "Intent is classified",
  "Risks are checked",
  "A proposal appears",
  "You review changes",
  "Hassali applies safely"
];

const trustCards = [
  "Intent-aware routing",
  "Review before changes",
  "Website quality guardrails",
  "Serious CODE mode",
  "Low-spec friendly workflow",
  "Provider-ready architecture"
];

const previewMetadata = [
  { label: "Domain", value: "florist" },
  { label: "Pages", value: "home/services/contact" },
  { label: "Style", value: "soft glass" },
  { label: "Mutation", value: "proposal required" }
];

const globalMarkers = [
  ["Karachi", "left-[58%] top-[44%]"],
  ["Dubai", "left-[54%] top-[42%]"],
  ["London", "left-[45%] top-[32%]"],
  ["Toronto", "left-[26%] top-[34%]"],
  ["New York", "left-[30%] top-[40%]"],
  ["Berlin", "left-[49%] top-[31%]"],
  ["Singapore", "left-[64%] top-[58%]"],
  ["Sydney", "left-[76%] top-[72%]"],
  ["Nairobi", "left-[52%] top-[56%]"],
  ["Riyadh", "left-[55%] top-[48%]"],
  ["Istanbul", "left-[51%] top-[37%]"],
  ["Jakarta", "left-[66%] top-[65%]"]
];

function ProductPreview() {
  return (
    <PremiumPanel className={`${styles.surface} hassali-noise min-w-0 p-4 sm:p-5`} glow="accent">
      <div className={`${styles.previewFrame} relative z-10 min-w-0 overflow-hidden rounded-[22px] border`}>
        <div className={`${styles.previewBar} flex items-center justify-between border-b px-4 py-3`}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--premium-accent))]" />
            <span className="text-xs font-medium text-[hsl(var(--premium-paper))]">Hassali Kernel</span>
          </div>
          <span className="rounded-full border border-[hsl(var(--premium-border))] px-2.5 py-1 text-[10px] uppercase tracking-normal text-[hsl(var(--premium-muted))]">
            Review first
          </span>
        </div>
        <div className={`${styles.previewGrid} grid gap-3 p-3`}>
          <div className={`${styles.previewSection} rounded-2xl border p-3`}>
            <div className="text-[10px] font-medium uppercase tracking-normal text-[hsl(var(--premium-muted))]">
              Modes
            </div>
            <div className="mt-3 space-y-2">
              {modes.map((mode, index) => (
                <div
                  className={`rounded-full border px-3 py-2 text-xs ${
                    index === 1
                      ? "border-[hsl(var(--premium-accent)/0.45)] bg-[hsl(var(--premium-accent)/0.14)] text-[hsl(var(--premium-paper))]"
                      : "border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong)/0.45)] text-[hsl(var(--premium-muted))]"
                  }`}
                  key={mode.label}
                >
                  {mode.label}
                </div>
              ))}
            </div>
          </div>
          <div className={`${styles.previewSection} rounded-2xl border p-4`}>
            <div className="text-[10px] font-medium uppercase tracking-normal text-[hsl(var(--premium-muted))]">
              Prompt
            </div>
            <div className={`${styles.previewPrompt} mt-4 rounded-2xl border p-4 text-sm leading-6 text-[hsl(var(--premium-paper))]`}>
              Build a premium flower shop website for Canada with seasonal bouquets, delivery, and soft glass styling.
            </div>
            <div className={`${styles.metadataGrid} mt-4 grid min-w-0 gap-2 sm:grid-cols-2`}>
              {previewMetadata.map((item) => (
                <div className={styles.metadataItem} data-home-metadata={item.label.toLowerCase()} key={item.label}>
                  <span className={styles.metadataLabel}>{item.label}</span>
                  <span aria-label={`${item.label}: ${item.value}`} className={styles.metadataValue}>
                    {item.value.split("/").map((segment, index) => (
                      <span className={styles.pathSegment} key={`${item.label}-${segment}`}>
                        {index > 0 ? "/" : ""}{segment}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className={`${styles.previewSection} ${styles.previewEvidence} rounded-2xl border p-4`}>
            <div className="text-[10px] font-medium uppercase tracking-normal text-[hsl(var(--premium-muted))]">
              Review evidence
            </div>
            <div className="mt-4 space-y-2 text-xs text-[hsl(var(--premium-muted))]">
              {["Website mode", "Task: multi-page generation", "Risk: review required", "Checks: pages, palette, images"].map((item) => (
                <div className={`${styles.evidenceItem} flex items-center gap-2`} key={item}>
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--premium-teal))]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PremiumPanel>
  );
}

function GlobeSection() {
  return (
    <section className="mx-auto grid w-full max-w-7xl items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
      <div>
        <SystemBadge tone="accent">Global builder layer</SystemBadge>
        <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-normal text-[hsl(var(--premium-paper))] sm:text-5xl">
          Build from anywhere. Review every step.
        </h2>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[hsl(var(--premium-muted))] sm:text-base">
          Hassali is designed for builders working from low-spec laptops, small teams, and ambitious ideas,
          turning prompts into websites, apps, and tools with review-first control.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <CommandCapsule href="/dashboard" tone="primary">Start building</CommandCapsule>
          <CommandCapsule href="#workflow">See how Hassali works</CommandCapsule>
        </div>
      </div>
      <PremiumPanel className={`${styles.surface} relative min-h-[360px] p-5`} glow="teal">
        <div className="hassali-globe relative mx-auto aspect-square max-w-[28rem] overflow-hidden rounded-full" aria-label="Global builder locations">
          {globalMarkers.map(([city, position]) => (
            <div
              className={`${styles.globeMarker} absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] text-[hsl(var(--premium-paper))] backdrop-blur ${position}`}
              key={city}
            >
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--premium-teal))]" />
              {city}
            </div>
          ))}
        </div>
      </PremiumPanel>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className={`${styles.homepage} min-h-screen overflow-hidden bg-[hsl(var(--premium-void))] text-[hsl(var(--premium-paper))]`}>
      <section className="hassali-noise relative">
        <div className={`${styles.heroAtmosphere} pointer-events-none absolute inset-0`} />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8">
          <header className="flex items-center justify-between">
            <Link className="flex items-center gap-3" href="/">
              <span className={`${styles.brandMark} flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border p-1`}>
                <Image
                  alt="Hassali.ai"
                  className="h-8 w-8 object-contain"
                  height={32}
                  src="/apple-icon.png"
                  width={32}
                />
              </span>
              <span>
                <span className="block text-sm font-semibold">Hassali.ai</span>
                <span className="hidden text-[11px] text-[hsl(var(--premium-muted))] sm:block">
                  Autonomous engineering workspace
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link className={`${styles.navLink} px-4 py-2 text-xs text-[hsl(var(--premium-muted))] hover:text-[hsl(var(--premium-paper))]`} href="/sign-in">
                Sign in
              </Link>
              <CommandCapsule href="/dashboard" tone="primary">Open workspace</CommandCapsule>
            </nav>
          </header>

          <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SystemBadge tone="accent">Ask. Build websites. Ship code.</SystemBadge>
              <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal sm:text-7xl lg:text-8xl">
                Build apps, websites, and tools from one clear idea.
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-[hsl(var(--premium-muted))] sm:text-lg">
                Hassali turns rough ideas into structured plans, premium websites, and serious code proposals,
                with review-first control before anything changes.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <CommandCapsule href="/dashboard" tone="primary">Start building</CommandCapsule>
                <CommandCapsule href="#workflow">See review-first flow</CommandCapsule>
              </div>
            </div>
            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-14 sm:px-8 lg:grid-cols-3">
        {modes.map((mode) => (
          <PremiumPanel className={`${styles.surface} p-6`} key={mode.label}>
            <SystemBadge tone={mode.label === "CODE" ? "code" : mode.label === "WEBSITE" ? "website" : "ask"}>
              {mode.label}
            </SystemBadge>
            <h2 className="mt-5 text-2xl font-semibold tracking-normal">{mode.summary}</h2>
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--premium-muted))]">{mode.body}</p>
          </PremiumPanel>
        ))}
      </section>

      <section id="workflow" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8">
        <PremiumPanel className={`${styles.surface} p-6 sm:p-8`} glow="accent">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <SystemBadge tone="success">Review-first workflow</SystemBadge>
              <h2 className="mt-5 text-3xl font-semibold tracking-normal sm:text-5xl">
                From idea to reviewed changes, without losing control.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[hsl(var(--premium-muted))]">
                Hassali listens, classifies intent, extracts constraints, checks risk, and proposes a route before
                any file mutation happens.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflow.map((item, index) => (
                <div className={`${styles.workflowStep} rounded-2xl border p-4`} key={item}>
                  <div className="text-[11px] font-medium uppercase tracking-normal text-[hsl(var(--premium-muted))]">
                    0{index + 1}
                  </div>
                  <div className="mt-3 text-sm font-medium">{item}</div>
                </div>
              ))}
            </div>
          </div>
        </PremiumPanel>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_0.9fr]">
        <PremiumPanel className={`${styles.surface} p-6 sm:p-8`} glow="teal">
          <SystemBadge tone="accent">Kernel intelligence</SystemBadge>
          <h2 className="mt-5 text-3xl font-semibold tracking-normal sm:text-5xl">
            Hassali does not blindly run prompts.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[hsl(var(--premium-muted))]">
            The kernel classifies the request, chooses ASK / WEBSITE / CODE, extracts constraints, detects risk,
            and decides whether Hassali should answer, propose, or block unsafe mutation.
          </p>
        </PremiumPanel>
        <PremiumPanel className={`${styles.surface} p-6 sm:p-8`}>
          <SystemBadge>Low-spec first</SystemBadge>
          <p className="mt-5 text-2xl font-semibold tracking-normal">
            Built for builders with constrained laptops, unstable internet, and limited budgets.
          </p>
          <p className="mt-4 text-sm leading-7 text-[hsl(var(--premium-muted))]">
            Browser-first, approval-first, token-aware, and designed to avoid wasteful blind rewrites.
          </p>
        </PremiumPanel>
      </section>

      <GlobeSection />

      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trustCards.map((item) => (
            <div className={`${styles.trustItem} rounded-3xl border p-5 text-sm text-[hsl(var(--premium-muted))]`} key={item}>
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--premium-accent))]" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-12 text-center sm:px-8">
        <SystemBadge tone="accent">Ready when you are</SystemBadge>
        <h2 className="mt-5 text-4xl font-semibold tracking-normal sm:text-6xl">
          Start with one idea. Keep control of every change.
        </h2>
        <div className="mt-8 flex justify-center">
          <CommandCapsule href="/dashboard" tone="primary">Open Hassali workspace</CommandCapsule>
        </div>
      </section>

      <InteractiveSpotlightFooter />
    </main>
  );
}

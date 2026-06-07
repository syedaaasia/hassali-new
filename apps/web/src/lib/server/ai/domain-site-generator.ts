import {
  buildDomainBlueprint,
  domainTitle,
  isTechnicalBlueprint
} from "@/lib/server/ai/capability-domain-blueprint";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type SiteDomain =
  | "car rental"
  | "car showroom"
  | "code/tooling project"
  | "florist"
  | "generic website"
  | "jewellery"
  | "media brand"
  | "podcast"
  | "portfolio"
  | "restaurant"
  | "SaaS"
  | "youtube podcast";

type DomainProfile = {
  accent: string;
  cta: string;
  imageAlt: string;
  images: [string, string, string];
  mood: string;
  sections: Array<{
    eyebrow: string;
    title: string;
    body: string;
  }>;
  testimonial: string;
  title: string;
};

type DomainSiteFiles = {
  indexHtml: string;
  mainJs: string;
  stylesCss: string;
};

const profiles: Record<SiteDomain, DomainProfile> = {
  "car rental": {
    accent: "Luxury mobility",
    cta: "Reserve a vehicle",
    imageAlt: "Luxury car in a cinematic showroom setting",
    images: [
      "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Cinematic fleet design with metallic dark glass, confident typography, and showroom depth.",
    sections: [
      {
        eyebrow: "Featured fleet",
        title: "Performance, executive comfort, and weekend escape cars.",
        body: "A curated fleet with sharp lines, premium interiors, and flexible reservation windows."
      },
      {
        eyebrow: "Showroom experience",
        title: "A calmer way to choose your next drive.",
        body: "Compare models, inspect details, and reserve without noisy upsells or hidden pressure."
      },
      {
        eyebrow: "Concierge support",
        title: "Pickup, delivery, and handover handled cleanly.",
        body: "Designed for airport transfers, city drives, business days, and special events."
      }
    ],
    testimonial: "The reservation felt premium from first click to handover.",
    title: "Apex Reserve"
  },
  "car showroom": {
    accent: "Luxury showroom",
    cta: "Book a test drive",
    imageAlt: "Premium car showroom with polished luxury vehicles",
    images: [
      "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "A cinematic showroom experience with confident type, metallic glass, and decisive vehicle discovery.",
    sections: [
      {
        eyebrow: "Signature models",
        title: "A curated floor of luxury, sport, and executive vehicles.",
        body: "Spotlight hero models, compare trims, and move visitors toward a confident test drive."
      },
      {
        eyebrow: "Showroom service",
        title: "Guided selection without pressure or visual clutter.",
        body: "Clean model cards and refined imagery make the showroom feel premium before arrival."
      },
      {
        eyebrow: "Ownership path",
        title: "Finance, inspection, and handover arranged with clarity.",
        body: "Make next steps visible for buyers who want a serious but calm showroom experience."
      }
    ],
    testimonial: "The showroom felt premium, direct, and easy to trust.",
    title: "Apex Motors"
  },
  florist: {
    accent: "Seasonal florals",
    cta: "Reserve bouquet",
    imageAlt: "Editorial bouquet arrangement with soft premium flowers",
    images: [
      "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Soft editorial floral design with warm spacing, gentle imagery, and calm glass cards.",
    sections: [
      {
        eyebrow: "Bouquets",
        title: "Soft arrangements for daily rituals and remembered moments.",
        body: "Hand-tied seasonal stems with color stories that feel personal, fresh, and quietly premium."
      },
      {
        eyebrow: "Events",
        title: "Florals for dinners, weddings, studios, and intimate spaces.",
        body: "Balanced compositions, delicate textures, and delivery windows planned around your day."
      },
      {
        eyebrow: "Studio care",
        title: "Fresh sourcing, thoughtful wrapping, and graceful presentation.",
        body: "Each arrangement is designed to arrive composed, hydrated, and ready to gift."
      }
    ],
    testimonial: "The bouquet looked effortless, elegant, and deeply considered.",
    title: "Petal House"
  },
  "generic website": {
    accent: "Modern web presence",
    cta: "Start exploring",
    imageAlt: "Modern premium workspace with clean interface design",
    images: [
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Clear modern landing page with glass depth, restrained color, and responsive structure.",
    sections: [
      {
        eyebrow: "Clarity",
        title: "A focused web presence that explains the offer quickly.",
        body: "Readable sections, polished cards, and direct calls to action keep the experience calm."
      },
      {
        eyebrow: "Responsive",
        title: "Designed to feel balanced on phones, laptops, and wide screens.",
        body: "The layout adapts without crowded spacing, broken cards, or tiny buttons."
      },
      {
        eyebrow: "Trust",
        title: "A premium first impression without visual noise.",
        body: "Soft contrast, useful hierarchy, and simple interaction create confidence."
      }
    ],
    testimonial: "It feels clean, serious, and ready to share.",
    title: "Hassali Studio"
  },
  jewellery: {
    accent: "Fine jewellery",
    cta: "Explore collection",
    imageAlt: "Editorial fine jewellery displayed on a premium surface",
    images: [
      "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Editorial luxury with generous spacing, warm metals, slow motion, and collection-first hierarchy.",
    sections: [
      {
        eyebrow: "Collections",
        title: "Rings, necklaces, and keepsakes designed with quiet presence.",
        body: "A curated edit of polished metals, gemstones, and silhouettes for everyday ceremony."
      },
      {
        eyebrow: "Craftsmanship",
        title: "Small details, balanced proportions, and a softer form of luxury.",
        body: "Every piece is presented with calm typography, close detail, and enough space to breathe."
      },
      {
        eyebrow: "Consultation",
        title: "Personal selection guidance for gifts, milestones, and signatures.",
        body: "Explore the collection, compare details, and request a private appointment."
      }
    ],
    testimonial: "The collection felt luxurious without feeling loud.",
    title: "Aurum Atelier"
  },
  "media brand": {
    accent: "Media studio",
    cta: "Explore stories",
    imageAlt: "Modern media studio with cameras, microphones, and warm production lighting",
    images: [
      "https://images.unsplash.com/photo-1495567720989-cebdbdd97913?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "A confident media-brand site with editorial pacing, episode cards, and sponsor-ready sections.",
    sections: [
      {
        eyebrow: "Latest stories",
        title: "Episodes, interviews, and sharp ideas presented with rhythm.",
        body: "Make the content library easy to scan while keeping the brand cinematic and clear."
      },
      {
        eyebrow: "Audience",
        title: "Built for listeners, viewers, sponsors, and collaborators.",
        body: "Use direct CTAs for watching, listening, subscribing, and contacting the studio."
      },
      {
        eyebrow: "Partnerships",
        title: "A clean home for sponsorships, services, and booking inquiries.",
        body: "Explain reach, format, and collaboration options without burying the main show."
      }
    ],
    testimonial: "The brand finally felt like a show people could subscribe to.",
    title: "Signal Studio"
  },
  podcast: {
    accent: "Podcast studio",
    cta: "Listen now",
    imageAlt: "Podcast microphone in a warm recording studio",
    images: [
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "A warm podcast home with bold show identity, episode discovery, and clear listen/watch actions.",
    sections: [
      {
        eyebrow: "Episodes",
        title: "Fresh conversations, sharp topics, and easy episode discovery.",
        body: "Feature the latest show, episode themes, and a direct path to listen or watch."
      },
      {
        eyebrow: "Hosts",
        title: "Introduce the voices behind the show with human warmth.",
        body: "A podcast needs personality, trust, and a clear reason to keep coming back."
      },
      {
        eyebrow: "Services",
        title: "Sponsorships, guest booking, and production inquiries in one place.",
        body: "Help brands and guests understand how to collaborate without distracting listeners."
      }
    ],
    testimonial: "The show felt memorable, professional, and ready for sponsors.",
    title: "Podcast Live"
  },
  portfolio: {
    accent: "Selected work",
    cta: "View work",
    imageAlt: "Editorial creative workspace with portfolio materials",
    images: [
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Editorial showcase-first layout with refined case-study cards and crisp personal positioning.",
    sections: [
      {
        eyebrow: "Projects",
        title: "Case studies with clear outcomes and strong visual rhythm.",
        body: "Show the work, explain the decision, and let the portfolio feel confident rather than crowded."
      },
      {
        eyebrow: "Experience",
        title: "A concise story of craft, direction, and measurable impact.",
        body: "Balanced sections help recruiters, clients, and collaborators understand the signal quickly."
      },
      {
        eyebrow: "Contact",
        title: "A simple path for thoughtful opportunities.",
        body: "Make the next step obvious with a direct CTA and a calm contact area."
      }
    ],
    testimonial: "The work finally had space to speak.",
    title: "Studio Selected"
  },
  restaurant: {
    accent: "Reserve table",
    cta: "Reserve table",
    imageAlt: "Premium restaurant dish with warm lighting",
    images: [
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Warm appetite-led design with rich photography, elegant menu cards, and reservation focus.",
    sections: [
      {
        eyebrow: "Menu highlights",
        title: "Seasonal plates, generous textures, and a table worth slowing down for.",
        body: "Show signature dishes with warm photography and descriptions that make ordering easy."
      },
      {
        eyebrow: "Chef story",
        title: "A kitchen built around craft, sourcing, and simple hospitality.",
        body: "A concise story gives guests confidence before they reserve."
      },
      {
        eyebrow: "Reservations",
        title: "Dinner, private events, and weekend tables handled clearly.",
        body: "Make booking visible, direct, and calm across every screen size."
      }
    ],
    testimonial: "The site made the restaurant feel warm before we arrived.",
    title: "Ember Table"
  },
  SaaS: {
    accent: "Productivity platform",
    cta: "Get started",
    imageAlt: "Minimal software dashboard displayed in a modern workspace",
    images: [
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Minimal modern product design with clean grids, legible benefits, and restrained gradients.",
    sections: [
      {
        eyebrow: "Features",
        title: "Workflows, dashboards, and decisions in one calm place.",
        body: "Explain the core product benefits with crisp cards and a direct path to activation."
      },
      {
        eyebrow: "Integrations",
        title: "Connect the tools your team already trusts.",
        body: "Use structured sections to show compatibility without overwhelming new users."
      },
      {
        eyebrow: "Pricing",
        title: "Simple plans with clear value and no surprise complexity.",
        body: "A focused CTA and transparent layout help people decide faster."
      }
    ],
    testimonial: "The product felt organized before we even signed up.",
    title: "Flowbase"
  },
  "youtube podcast": {
    accent: "YouTube podcast",
    cta: "Watch latest episode",
    imageAlt: "YouTube podcast studio with microphones and video production lights",
    images: [
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "A YouTube-first podcast brand with strong show identity, episode cards, host trust, and sponsor clarity.",
    sections: [
      {
        eyebrow: "Watch",
        title: "Featured episodes built for viewers, listeners, and subscribers.",
        body: "Lead with the show promise, then make YouTube, clips, and podcast platforms easy to reach."
      },
      {
        eyebrow: "Hosts",
        title: "A human show page with credibility, warmth, and repeatable segments.",
        body: "Introduce the hosts, topics, and why the audience should return every week."
      },
      {
        eyebrow: "Services",
        title: "Sponsorships, interviews, and content partnerships made clear.",
        body: "Give brands and guests a polished path to collaborate with the show."
      }
    ],
    testimonial: "Podcast Live now feels like a real media brand, not a generic landing page.",
    title: "Podcast Live"
  },
  "code/tooling project": {
    accent: "Developer tool",
    cta: "Start building",
    imageAlt: "Modern code editor and development workspace",
    images: [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1000&q=80"
    ],
    mood: "Focused developer-product layout with code-like precision, calm contrast, and clear utility.",
    sections: [
      {
        eyebrow: "Workflow",
        title: "A precise tool surface for building, checking, and shipping.",
        body: "Keep the interface direct, fast, and legible for repeated technical use."
      },
      {
        eyebrow: "Control",
        title: "Powerful actions revealed only when useful.",
        body: "Developer tools should reduce noise while preserving trust."
      },
      {
        eyebrow: "Reliability",
        title: "Small changes, visible state, and predictable outcomes.",
        body: "Make the system feel dependable before it feels magical."
      }
    ],
    testimonial: "It felt like a tool I could trust on a slow laptop.",
    title: "Buildkit"
  }
};

function profileForDomain(domain: SiteDomain) {
  return profiles[domain] ?? profiles["generic website"];
}

function navForPages(pagePaths: string[]) {
  const labels: Record<string, string> = {
    "about.html": "About",
    "contact.html": "Contact",
    "episodes.html": "Episodes",
    "index.html": "Home",
    "services.html": "Services"
  };

  return pagePaths
    .map((path) => `<a href="${path === "index.html" ? "./index.html" : `./${path}`}">${labels[path] ?? path.replace(".html", "")}</a>`)
    .join("\n        ");
}

function pageTitle(path: string) {
  if (path === "services.html") {
    return "Services";
  }

  if (path === "about.html") {
    return "About";
  }

  if (path === "contact.html") {
    return "Contact";
  }

  if (path === "episodes.html") {
    return "Episodes";
  }

  return "Home";
}

export function generateDomainSite(domain: SiteDomain, options?: { pagePaths?: string[] }): DomainSiteFiles {
  const profile = profileForDomain(domain);
  const pagePaths = options?.pagePaths?.length ? options.pagePaths : ["index.html"];
  const navigation = navForPages(pagePaths);
  const sectionCards = profile.sections
    .map(
      (section, index) => `        <article>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <p class="eyebrow">${section.eyebrow}</p>
          <h2>${section.title}</h2>
          <p>${section.body}</p>
        </article>`
    )
    .join("\n");

  return {
    indexHtml: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${profile.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="#">${profile.title}</a>
      <nav aria-label="Primary navigation">
        ${navigation}
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${profile.accent}</p>
          <h1>${profile.mood}</h1>
          <p class="lede">${profile.sections[0]?.body ?? "A premium responsive website with clear sections and calm motion."}</p>
          <a class="button" href="#contact">${profile.cta}</a>
        </div>
        <figure class="hero-visual">
          <img src="${profile.images[0]}" alt="${profile.imageAlt}" />
        </figure>
      </section>
      <section class="feature-grid" id="showcase">
${sectionCards}
      </section>
      <section class="story" id="experience">
        <div>
          <p class="eyebrow">Experience</p>
          <h2>${profile.testimonial}</h2>
        </div>
        <p>Built with generous whitespace, responsive hierarchy, soft glass depth, and restrained animation so the result feels premium without becoming visually loud.</p>
      </section>
      <section class="gallery" aria-label="Visual highlights">
        <img src="${profile.images[1]}" alt="${profile.accent} detail image" />
        <img src="${profile.images[2]}" alt="${profile.accent} lifestyle image" />
      </section>
    </main>
    <footer id="contact">
      <span>${profile.title}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`,
    mainJs: `const cards = document.querySelectorAll(".feature-grid article, .story, .hero-visual");

cards.forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--x", String(event.clientX - rect.left));
    card.style.setProperty("--y", String(event.clientY - rect.top));
  });
});

if ("IntersectionObserver" in window) {
  const revealTargets = document.querySelectorAll(".hero, .feature-grid article, .story, .gallery img");
  revealTargets.forEach((element) => element.classList.add("is-waiting"));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  revealTargets.forEach((element) => observer.observe(element));
}
`,
    stylesCss: `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #080808;
  color: #f4efe6;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 18% 10%, rgba(230, 0, 76, 0.22), transparent 28rem),
    radial-gradient(circle at 88% 18%, rgba(0, 163, 175, 0.14), transparent 26rem),
    linear-gradient(135deg, #070707, #101012);
}

a {
  color: inherit;
  text-decoration: none;
}

.site-header,
footer,
main {
  margin: 0 auto;
  max-width: 1180px;
}

.site-header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem clamp(1rem, 4vw, 2rem);
}

.brand {
  font-weight: 850;
  letter-spacing: 0.01em;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(0.75rem, 2vw, 1.35rem);
  color: #b8b0a4;
  font-size: 0.92rem;
}

main {
  padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 2rem);
  width: min(100%, 1180px);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.72fr);
  align-items: center;
  gap: clamp(1.4rem, 5vw, 4rem);
  padding: clamp(2rem, 8vw, 6rem) 0;
}

.hero-copy {
  max-width: 840px;
}

.eyebrow {
  color: #d6b16d;
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 13ch;
  font-size: clamp(2.6rem, 7vw, 6.4rem);
  line-height: 0.9;
  letter-spacing: -0.045em;
}

h2 {
  margin: 0.5rem 0 0;
  font-size: clamp(1.2rem, 3vw, 2.1rem);
  line-height: 1.05;
}

.lede,
.story p,
article p {
  color: #bdb5aa;
  line-height: 1.72;
}

.lede {
  max-width: 680px;
  font-size: clamp(1rem, 1.7vw, 1.18rem);
}

.button,
.carousel-button {
  display: inline-flex;
  border: 1px solid rgba(214, 177, 109, 0.46);
  border-radius: 999px;
  background: rgba(214, 177, 109, 0.95);
  color: #111;
  cursor: pointer;
  margin-top: 1rem;
  padding: 0.82rem 1.1rem;
  font-weight: 850;
}

.hero-visual,
.gallery img,
article,
.story {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at calc(var(--x, 80) * 1px) calc(var(--y, 40) * 1px), rgba(255, 255, 255, 0.08), transparent 12rem),
    rgba(255, 255, 255, 0.055);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px) saturate(120%);
}

.hero-visual {
  aspect-ratio: 4 / 5;
  margin: 0;
}

.hero-visual img,
.gallery img {
  display: block;
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

article,
.story {
  padding: 1.2rem;
}

article span {
  color: #ff5a70;
  font-size: 0.76rem;
  font-weight: 850;
}

.story {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1rem;
  margin-top: 1rem;
}

.gallery {
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  gap: 1rem;
  margin-top: 1rem;
}

.gallery img {
  aspect-ratio: 16 / 11;
}

.is-waiting {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 560ms ease, transform 560ms ease;
}

.is-waiting.is-visible {
  opacity: 1;
  transform: translateY(0);
}

footer {
  color: #91897f;
}

@media (max-width: 760px) {
  .site-header,
  footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero,
  .story,
  .gallery {
    grid-template-columns: 1fr;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }
}
`
  };
}

function generateSupplementalPage(domain: SiteDomain, path: string, pagePaths: string[]) {
  const profile = profileForDomain(domain);
  const title = pageTitle(path);
  const navigation = navForPages(pagePaths);
  const section = profile.sections[path === "services.html" ? 2 : path === "about.html" ? 1 : 0] ?? profile.sections[0];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - ${profile.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="./index.html">${profile.title}</a>
      <nav aria-label="Primary navigation">
        ${navigation}
      </nav>
    </header>
    <main>
      <section class="hero hero-compact">
        <div class="hero-copy">
          <p class="eyebrow">${profile.accent}</p>
          <h1>${title === "Contact" ? `Start a conversation with ${profile.title}.` : section.title}</h1>
          <p class="lede">${title === "Contact" ? "Use this page for inquiries, reservations, partnerships, or next steps." : section.body}</p>
          <a class="button" href="${title === "Contact" ? "mailto:hello@example.com" : "./contact.html"}">${title === "Contact" ? "Email us" : profile.cta}</a>
        </div>
        <figure class="hero-visual">
          <img src="${profile.images[path === "services.html" ? 1 : 2]}" alt="${profile.imageAlt}" />
        </figure>
      </section>
      <section class="feature-grid">
        <article>
          <span>01</span>
          <p class="eyebrow">${title}</p>
          <h2>${section.eyebrow}</h2>
          <p>${section.body}</p>
        </article>
        <article>
          <span>02</span>
          <p class="eyebrow">Experience</p>
          <h2>${profile.testimonial}</h2>
          <p>Designed with responsive spacing, clear hierarchy, and calm motion for a polished first impression.</p>
        </article>
        <article>
          <span>03</span>
          <p class="eyebrow">Next step</p>
          <h2>${profile.cta}</h2>
          <p>Keep the path forward obvious, useful, and easy to act on across every screen size.</p>
        </article>
      </section>
    </main>
    <footer>
      <span>${profile.title}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`;
}

export function generateDomainSiteFiles(domain: SiteDomain, options?: { pagePaths?: string[] }) {
  const pagePaths = Array.from(new Set(options?.pagePaths?.length ? options.pagePaths : ["index.html"]));
  const base = generateDomainSite(domain, { pagePaths });
  const files: Record<string, string> = {
    "index.html": base.indexHtml,
    "main.js": base.mainJs,
    "styles.css": base.stylesCss
  };

  pagePaths
    .filter((path) => path !== "index.html")
    .forEach((path) => {
      files[path] = generateSupplementalPage(domain, path, pagePaths);
    });

  return files;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string) {
  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const pageMap: Record<string, string> = {
    blog: "blog.html",
    blogs: "blog.html",
    bikes: "bikes.html",
    contact: "contact.html",
    distributors: "distributors.html",
    episodes: "episodes.html",
    gallery: "gallery.html",
    home: "index.html",
    index: "index.html",
    menu: "menu.html",
    products: "products.html",
    services: "services.html",
    shop: "products.html"
  };

  return pageMap[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function isTechnicalComposition(intent: IntentIntelligence, composition: CompositionStrategy) {
  const text = [
    intent.domain,
    intent.siteType ?? "",
    composition.businessType,
    ...composition.brandPositioning
  ]
    .join(" ")
    .toLowerCase();

  return [
    "ai tooling",
    "coding",
    "dev platform",
    "developer",
    "engineering product",
    "programming",
    "software product",
    "technical buyers"
  ].some((term) => text.includes(term));
}

function brandNameForIntent(intent: IntentIntelligence, composition: CompositionStrategy) {
  if (intent.brandName) {
    return intent.brandName;
  }

  const blueprint = buildDomainBlueprint({
    prompt: `${intent.domain} ${composition.businessType} ${composition.reasoningSummary}`
  });

  if (blueprint.brandFallback && !/^(local service|business|generic)/i.test(blueprint.domainLabel)) {
    return blueprint.brandFallback;
  }

  const businessWords = composition.businessType
    .replace(/\s*\/\s*/g, " ")
    .split(/\s+/)
    .filter((word, index, words) => {
      const normalized = word.toLowerCase();

      return (
        !["and", "brand", "business", "commerce", "website"].includes(normalized) &&
        normalized !== words[index - 1]?.toLowerCase()
      );
    });
  const inferredName = titleCase(businessWords.slice(0, 2).join(" "));

  if (!inferredName || /^(business|generic|local service)$/i.test(inferredName)) {
    return blueprint.brandFallback || `${domainTitle(blueprint)} Studio`;
  }

  return inferredName.includes(domainTitle(blueprint))
    ? inferredName
    : `${domainTitle(blueprint)} Studio`;
}

function colorTokens(intent: IntentIntelligence, composition: CompositionStrategy) {
  const palette = [...intent.palette, ...composition.visualLanguage.palette].map((color) => color.toLowerCase());
  const business = composition.businessType.toLowerCase();
  const has = (term: string) => palette.some((color) => color.includes(term));

  if (has("pink") || business.includes("beauty") || business.includes("skincare")) {
    return {
      accent: "#db2777",
      accentSoft: "rgba(249, 168, 212, 0.34)",
      canvas: has("white") ? "#fff7fb" : "#160911",
      ink: has("white") ? "#21121a" : "#fff2f8",
      secondary: "#f472b6",
      surface: "rgba(255, 255, 255, 0.72)"
    };
  }

  if (has("black")) {
    return {
      accent: has("white") ? "#111827" : "#e5e7eb",
      accentSoft: has("white") ? "rgba(17, 24, 39, 0.16)" : "rgba(255, 255, 255, 0.14)",
      canvas: has("white") ? "#f8fafc" : "#050505",
      ink: has("white") ? "#0b1120" : "#f8fafc",
      secondary: "#6b7280",
      surface: has("white") ? "rgba(255, 255, 255, 0.78)" : "rgba(18, 18, 18, 0.76)"
    };
  }

  if (has("blue") || business.includes("seafood") || business.includes("fish")) {
    return {
      accent: "#0ea5e9",
      accentSoft: "rgba(125, 211, 252, 0.32)",
      canvas: has("white") ? "#f5fbff" : "#071827",
      ink: has("white") ? "#0f2637" : "#eef9ff",
      secondary: "#00a3af",
      surface: "rgba(255, 255, 255, 0.74)"
    };
  }

  if (has("yellow") || has("gold") || business.includes("perfume") || business.includes("fragrance")) {
    return {
      accent: has("gold") ? "#d97706" : "#eab308",
      accentSoft: has("gold") ? "rgba(245, 158, 11, 0.28)" : "rgba(234, 179, 8, 0.28)",
      canvas: has("white") ? "#fffbea" : "#171104",
      ink: has("white") ? "#261b05" : "#fff7d6",
      secondary: "#f59e0b",
      surface: "rgba(255, 255, 255, 0.8)"
    };
  }

  if (has("maroon") || business.includes("television") || business.includes("motorbike")) {
    return {
      accent: "#8a1538",
      accentSoft: "rgba(138, 21, 56, 0.28)",
      canvas: has("white") ? "#fbf7f8" : "#12070b",
      ink: has("white") ? "#251018" : "#fff5f7",
      secondary: "#b91c1c",
      surface: has("white") ? "rgba(255, 255, 255, 0.78)" : "rgba(28, 9, 14, 0.76)"
    };
  }

  if (has("cream") || has("brown") || business.includes("bakery")) {
    return {
      accent: "#8b5e34",
      accentSoft: "rgba(196, 142, 86, 0.28)",
      canvas: "#fff8ed",
      ink: "#2a1b12",
      secondary: "#c48e56",
      surface: "rgba(255, 255, 255, 0.76)"
    };
  }

  if (has("green")) {
    return {
      accent: "#16a34a",
      accentSoft: "rgba(34, 197, 94, 0.28)",
      canvas: has("white") ? "#f4fff7" : "#061b12",
      ink: has("white") ? "#102318" : "#effff4",
      secondary: "#22c55e",
      surface: "rgba(255, 255, 255, 0.74)"
    };
  }

  if (has("teal")) {
    return {
      accent: "#00a3af",
      accentSoft: "rgba(0, 163, 175, 0.28)",
      canvas: has("white") ? "#f4fffd" : "#061b1a",
      ink: has("white") ? "#102322" : "#effffd",
      secondary: "#10b981",
      surface: "rgba(255, 255, 255, 0.72)"
    };
  }

  return {
    accent: "#e6004c",
    accentSoft: "rgba(230, 0, 76, 0.22)",
    canvas: "#f6f5f1",
    ink: "#16130f",
    secondary: "#00a3af",
    surface: "rgba(255, 255, 255, 0.72)"
  };
}

function imageSetForComposition(intent: IntentIntelligence, composition: CompositionStrategy) {
  const text = [intent.domain, composition.businessType, ...composition.brandPositioning].join(" ").toLowerCase();
  const blueprint = buildDomainBlueprint({ prompt: text });

  if (isTechnicalComposition(intent, composition) || isTechnicalBlueprint(blueprint)) {
    return [
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("seafood") || text.includes("fish")) {
    return [
      "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("beauty") || text.includes("skincare") || text.includes("cream")) {
    return [
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("ice cream") || text.includes("frozen dessert") || text.includes("gelato") || text.includes("scoop")) {
    return [
      "https://images.unsplash.com/photo-1488900128323-21503983a07e?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("perfume") || text.includes("fragrance") || text.includes("scent")) {
    return [];
  }

  if (blueprint.ambiguity.isAmbiguous) {
    return [];
  }

  if (text.includes("bicycle") || text.includes("cycling") || text.includes("bike") || text.includes("rider")) {
    return [
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1529422643029-d4585747aaf2?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("television") || text.includes("smart tv") || text.includes("home cinema") || text.includes("oled") || text.includes("qled")) {
    return [];
  }

  if (text.includes("motorbike") || text.includes("motorcycle") || text.includes("engine service")) {
    return [];
  }

  if (text.includes("cola") || text.includes("beverage") || text.includes("soft drink")) {
    return [
      "https://images.unsplash.com/photo-1587668178277-295251f900ce?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("footwear") || text.includes("shoe") || text.includes("sneaker")) {
    return [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("podcast") || text.includes("media") || text.includes("creator")) {
    return [
      "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("bakery") || text.includes("restaurant")) {
    return [
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  if (text.includes("candle") || text.includes("lifestyle")) {
    return [
      "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=1000&q=80",
      "https://images.unsplash.com/photo-1602874801006-e26f3073e2ee?auto=format&fit=crop&w=1000&q=80"
    ];
  }

  return [];
}

function navForComposition(pages: string[]) {
  return pages
    .map((page) => {
      const path = pageToPath(page);
      return `<a href="./${path}">${escapeHtml(titleCase(page))}</a>`;
    })
    .join("\n        ");
}

function sectionCopy(section: string, composition: CompositionStrategy) {
  const blueprint = buildDomainBlueprint({ prompt: composition.businessType });
  const goal = composition.businessGoals[0] ?? "trust";
  const audience = composition.audience[0] ?? "customers";
  const sectionText = section.toLowerCase();
  const terms = blueprint.contentTerms.slice(0, 5);
  const termText = terms.join(", ");
  const category = blueprint.productCategory;

  if (blueprint.ambiguity.isAmbiguous) {
    if (sectionText.includes("service") || sectionText.includes("parts")) {
      return {
        body: "Frame service around parts, safety checks, booking, and practical rider support while leaving room for the customer's exact bike type.",
        title: "Service and parts guidance for the right kind of bike"
      };
    }

    if (sectionText.includes("gear") || sectionText.includes("safety")) {
      return {
        body: "Present helmets, locks, lights, gloves, bags, and safety essentials as a neutral rider gear wall for different bike customers.",
        title: "Rider safety gear without overcommitting the bike type"
      };
    }

    if (sectionText.includes("test") || sectionText.includes("fit")) {
      return {
        body: "Offer fit checks, showroom advice, and guided try-outs so customers can clarify what kind of bike suits them.",
        title: "Fit checks and guided try-outs before the sale"
      };
    }

    return {
      body: "Keep the wording balanced for bike shoppers: showroom guidance, service booking, parts, safety gear, and fit help without narrowing the shop to one ride category.",
      title: "Balanced bike-shop guidance for different riders"
    };
  }

  if (sectionText.includes("bike") || sectionText.includes("cycling") || sectionText.includes("repair") || sectionText.includes("tune")) {
    return {
      body:
        sectionText.includes("repair") || sectionText.includes("tune")
          ? "Make service booking obvious with tune-ups, brake checks, chain care, fitting notes, and clear turnaround expectations."
          : "Present bikes, accessories, rentals, and rider guidance for commuters, weekend riders, and families choosing their next ride.",
      title:
        sectionText.includes("repair") || sectionText.includes("tune")
          ? "Tune-ups, repairs, and fittings riders can trust"
          : "Bikes and cycling gear matched to real riders"
    };
  }

  if (sectionText.includes("smart tv") || sectionText.includes("oled") || sectionText.includes("qled") || sectionText.includes("cinema") || sectionText.includes("mounting") || sectionText.includes("warranty")) {
    return {
      body:
        sectionText.includes("mounting")
          ? "Make wall mounting, cable routing, delivery, calibration, and installation booking clear before customers leave the showroom."
          : sectionText.includes("warranty")
            ? "Explain warranty support, after-sales help, soundbar bundles, and replacement guidance in plain language."
            : "Help shoppers compare smart TVs, OLED/QLED/LED panels, screen sizes, viewing distance, and home cinema bundles without confusion.",
      title:
        sectionText.includes("mounting")
          ? "Installation and wall mounting handled cleanly"
          : sectionText.includes("warranty")
            ? "Warranty and after-sales support customers can understand"
            : "Smart TV comparison for real living rooms"
    };
  }

  if (sectionText.includes("motorcycle") || sectionText.includes("engine") || sectionText.includes("helmet") || sectionText.includes("gear") || sectionText.includes("spare") || sectionText.includes("test ride")) {
    return {
      body:
        sectionText.includes("engine")
          ? "Surface oil changes, diagnostics, tuning, brake checks, and maintenance slots with a direct booking path."
          : sectionText.includes("helmet") || sectionText.includes("gear")
            ? "Pair motorcycles with helmets, jackets, gloves, safety gear, and road-ready accessories."
            : "Present motorcycles, test rides, spare parts, and service confidence without drifting into bicycle language.",
      title:
        sectionText.includes("engine")
          ? "Engine service and maintenance with clear booking"
          : sectionText.includes("helmet") || sectionText.includes("gear")
            ? "Helmets, rider gear, and safety essentials"
            : "Motorcycles, test rides, and road-ready support"
    };
  }

  if (sectionText.includes("cola") || sectionText.includes("product") || sectionText.includes("distributor") || sectionText.includes("retailer")) {
    return {
      body:
        sectionText.includes("distributor") || sectionText.includes("retailer")
          ? "Show retailers and distributors the product range, chilled delivery promise, crate flow, and contact path for sales."
          : "Spotlight drink flavors, pack sizes, campaign moments, and shelf-ready product stories for local buyers.",
      title:
        sectionText.includes("distributor") || sectionText.includes("retailer")
          ? "Distributor and retailer paths made clear"
          : "A chilled product lineup with campaign energy"
    };
  }

  if (sectionText.includes("flavor")) {
    return {
      body: `Showcase ${escapeHtml(category)} with clear choices, seasonal notes, and a reason to visit today.`,
      title: "Flavors, scoops, and specials that feel worth the trip"
    };
  }

  if (sectionText.includes("scent") || sectionText.includes("fragrance") || sectionText.includes("note")) {
    return {
      body: "Present oud, floral, citrus, musk, and soft amber notes as a clear fragrance journey for shoppers choosing a signature scent.",
      title: "Fragrance notes arranged for discovery"
    };
  }

  if (sectionText.includes("bottle") || sectionText.includes("tester")) {
    return {
      body: "Show perfume bottles, testers, premium packaging, and sampling guidance so customers can compare before gifting or buying.",
      title: "Bottles, testers, and gift-ready presentation"
    };
  }

  if (sectionText.includes("gift")) {
    return {
      body: "Guide visitors toward gift sets, wrapping, occasion picks, and scent consultation for birthdays, weddings, and everyday luxury.",
      title: "Gift sets and scent rituals with a premium finish"
    };
  }

  if (sectionText.includes("catering")) {
    return {
      body: `Make events easy with ${escapeHtml(termText || category)}, simple booking, and clear service expectations.`,
      title: "Catering and celebration treats without confusion"
    };
  }

  if (sectionText.includes("store") || sectionText.includes("visit")) {
    return {
      body: `Guide ${escapeHtml(audience)} toward the shop, opening hours, contact, and the next friendly step.`,
      title: "A simple path from craving to shop visit"
    };
  }

  return {
    body: `Connect ${escapeHtml(audience)} with ${escapeHtml(termText || category)} through a practical next step focused on ${escapeHtml(goal)}.`,
    title: `${titleCase(section)} for ${escapeHtml(domainTitle(blueprint))} customers`
  };
}

function visualAssetMarkup(input: {
  alt: string;
  className?: string;
  image?: string;
  label: string;
}) {
  if (input.image) {
    return `<img src="${input.image}" alt="${escapeHtml(input.alt)}" />`;
  }

  return `<div class="domain-visual-placeholder ${escapeHtml(input.className ?? "")}" role="img" aria-label="${escapeHtml(input.alt)}">
            <span>${escapeHtml(input.label)}</span>
          </div>`;
}

function layoutClassForComposition(composition: CompositionStrategy) {
  const text = composition.businessType.toLowerCase();

  if (text.includes("television") || text.includes("home cinema") || text.includes("electronics")) {
    return "layout-showroom";
  }

  if (text.includes("motorbike") || text.includes("motorcycle")) {
    return "layout-moto";
  }

  if (text.includes("ambiguous rider") || text.includes("bike shop")) {
    return "layout-bike-balanced";
  }

  if (text.includes("bicycle") || text.includes("cycling")) {
    return "layout-cycle";
  }

  if (text.includes("ice cream") || text.includes("frozen dessert")) {
    return "layout-dessert";
  }

  if (text.includes("perfume") || text.includes("fragrance") || text.includes("scent")) {
    return "layout-fragrance";
  }

  if (text.includes("cola") || text.includes("beverage")) {
    return "layout-beverage";
  }

  return "layout-standard";
}

function visualPlaceholder(input: {
  blueprintLabel: string;
  index: number;
  section?: string;
}) {
  const label = input.blueprintLabel.toLowerCase();

  if (label.includes("television")) {
    const labels = ["OLED showroom", "Home cinema", "Wall mount"];
    return {
      className: "visual-tv",
      label: labels[input.index % labels.length]
    };
  }

  if (label === "bike shop") {
    const labels = ["Bike showroom", "Rider gear", "Service desk"];
    return {
      className: "visual-bike",
      label: labels[input.index % labels.length]
    };
  }

  if (label.includes("motorbike")) {
    const labels = ["Moto showroom", "Engine service", "Rider gear"];
    return {
      className: "visual-moto",
      label: labels[input.index % labels.length]
    };
  }

  if (label.includes("perfume")) {
    const labels = ["Fragrance notes", "Perfume bottles", "Gift sets"];
    return {
      className: "visual-fragrance",
      label: labels[input.index % labels.length]
    };
  }

  if (label.includes("bicycle")) {
    const labels = ["Cycling wall", "Tune-up lane", "Ride fitting"];
    return {
      className: "visual-cycle",
      label: labels[input.index % labels.length]
    };
  }

  return {
    className: "visual-generic",
    label: input.section ?? input.blueprintLabel
  };
}

function renderSections(page: string, composition: CompositionStrategy, images: string[]) {
  const plan = composition.sectionPlan.find((item) => item.page === page) ?? composition.sectionPlan[0];
  const sections = plan?.sections?.length ? plan.sections : ["offerings", "trust", "CTA"];
  const blueprint = buildDomainBlueprint({ prompt: composition.businessType });

  return sections
    .map((section, index) => {
      const copy = sectionCopy(section, composition);

      if (section.toLowerCase().includes("gallery") || section.toLowerCase().includes("featured")) {
        return `      <section class="image-band glass-card reveal">
        <div>
          <p class="eyebrow">${escapeHtml(section)}</p>
          <h2>${copy.title}</h2>
          <p>${copy.body}</p>
        </div>
        ${visualAssetMarkup({
          alt: `${blueprint.domainLabel} visual for ${section}`,
          className: visualPlaceholder({
            blueprintLabel: blueprint.domainLabel,
            index
          }).className,
          image: images[index % images.length],
          label: visualPlaceholder({
            blueprintLabel: blueprint.domainLabel,
            index,
            section
          }).label
        })}
      </section>`;
      }

      return `      <article class="glass-card reveal">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <p class="eyebrow">${escapeHtml(section)}</p>
        <h2>${copy.title}</h2>
        <p>${copy.body}</p>
      </article>`;
    })
    .join("\n");
}

function renderComposedPage(input: {
  brandName: string;
  composition: CompositionStrategy;
  images: string[];
  intent: IntentIntelligence;
  navigation: string;
  page: string;
}) {
  const pageTitleText = titleCase(input.page);
  const isHome = input.page === "home";
  const blueprint = buildDomainBlueprint({
    prompt: `${input.intent.domain} ${input.composition.businessType} ${input.composition.reasoningSummary}`
  });
  const heroTerms = blueprint.contentTerms.slice(0, 4).join(", ");
  const heroTitle = isHome
    ? `${input.brandName} brings ${heroTerms || input.composition.businessType} to life.`
    : `${pageTitleText} for ${input.brandName}`;
  const heroBody = isHome
    ? `${input.composition.contentStrategy.heroGoal} The page emphasizes ${blueprint.productCategory}, ${blueprint.industry}, and clear next steps.`
    : `This page supports ${input.composition.businessGoals.join(", ")} with focused sections for ${input.composition.audience.join(", ")}.`;
  const primaryCta = input.composition.contentStrategy.ctaStrategy[0] ?? "Contact us";
  const layoutClass = layoutClassForComposition(input.composition);
  const heroVisual = visualPlaceholder({
    blueprintLabel: blueprint.domainLabel,
    index: 0,
    section: "hero"
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(isHome ? input.brandName : `${pageTitleText} - ${input.brandName}`)}</title>
    <meta name="description" content="${escapeHtml(input.composition.reasoningSummary)}" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="./index.html">${escapeHtml(input.brandName)}</a>
      <nav aria-label="Primary navigation">
        ${input.navigation}
      </nav>
    </header>
    <main>
      <section class="hero ${layoutClass}-hero">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(blueprint.domainLabel)} / ${escapeHtml(blueprint.productCategory)}</p>
          <h1>${escapeHtml(heroTitle)}</h1>
          <p class="lede">${escapeHtml(heroBody)}</p>
          <a class="button" href="./${pageToPath(input.composition.siteArchitecture.pages.includes("contact") ? "contact" : input.composition.siteArchitecture.pages[input.composition.siteArchitecture.pages.length - 1] ?? "contact")}">${escapeHtml(primaryCta)}</a>
        </div>
        <figure class="hero-visual glass-card">
          ${visualAssetMarkup({
            alt: `${blueprint.domainLabel} hero visual`,
            className: heroVisual.className,
            image: input.images[0],
            label: heroVisual.label
          })}
        </figure>
      </section>
      <section class="section-grid ${layoutClass}">
${renderSections(input.page, input.composition, input.images)}
      </section>
    </main>
    <footer>
      <span>${escapeHtml(input.brandName)}</span>
      <span>${escapeHtml(input.composition.contentStrategy.trustSignals.slice(0, 2).join(" / "))}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`;
}

function renderComposedCss(intent: IntentIntelligence, composition: CompositionStrategy) {
  const tokens = colorTokens(intent, composition);
  const layoutClass = layoutClassForComposition(composition);
  const usesGlass = [...intent.visualStyle, ...composition.visualLanguage.style].some((style) =>
    style.toLowerCase().includes("glass")
  );
  const usesTactical = [...intent.visualStyle, ...composition.visualLanguage.style, ...composition.brandPositioning]
    .join(" ")
    .toLowerCase()
    .includes("tactical");
  const rounded = [...intent.shapeLanguage, ...composition.visualLanguage.shapeLanguage].some((shape) =>
    shape.toLowerCase().includes("round")
  );

  return `:root {
  color-scheme: light;
  --canvas: ${tokens.canvas};
  --surface: ${tokens.surface};
  --ink: ${tokens.ink};
  --muted: rgba(22, 24, 29, 0.66);
  --accent: ${tokens.accent};
  --accent-2: ${tokens.secondary};
  --accent-soft: ${tokens.accentSoft};
  --radius: ${rounded ? "28px" : "18px"};
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* Composition-driven generation. Palette: ${intent.palette.join(", ") || composition.visualLanguage.palette.join(", ")}. Style: ${intent.visualStyle.join(", ") || composition.visualLanguage.style.join(", ")}. Business: ${composition.businessType}. */
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 15% 12%, var(--accent-soft), transparent 30rem),
    radial-gradient(circle at 84% 10%, color-mix(in srgb, var(--accent-2), transparent 84%), transparent 28rem),
    var(--canvas);
  color: var(--ink);
}

${usesTactical ? `body::before {
  pointer-events: none;
  position: fixed;
  inset: 0;
  content: "";
  background:
    linear-gradient(rgba(127, 29, 45, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(127, 29, 45, 0.08) 1px, transparent 1px),
    linear-gradient(180deg, transparent, rgba(138, 21, 56, 0.1), transparent);
  background-size: 34px 34px, 34px 34px, 100% 13px;
  mix-blend-mode: multiply;
}
` : ""}

a {
  color: inherit;
  text-decoration: none;
}

.site-header,
footer,
main {
  margin: 0 auto;
  max-width: 1180px;
}

.site-header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem clamp(1rem, 4vw, 2rem);
}

.brand {
  font-weight: 850;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  color: var(--muted);
  font-size: 0.92rem;
}

main {
  padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 2rem);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.72fr);
  align-items: center;
  gap: clamp(1.5rem, 5vw, 4rem);
  padding: clamp(2rem, 8vw, 6rem) 0;
}

.hero-copy {
  max-width: 820px;
  min-width: 0;
}

.eyebrow {
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  max-width: 13ch;
  font-size: clamp(2.55rem, 7vw, 6rem);
  line-height: 0.92;
  letter-spacing: -0.045em;
  overflow-wrap: anywhere;
}

h2 {
  margin-top: 0.45rem;
  font-size: clamp(1.25rem, 3vw, 2rem);
  line-height: 1.06;
  overflow-wrap: anywhere;
}

.lede,
.glass-card p,
footer {
  color: var(--muted);
  line-height: 1.72;
}

.lede {
  margin-top: 1rem;
  max-width: 680px;
  font-size: clamp(1rem, 1.7vw, 1.18rem);
}

.button {
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--accent), white 25%);
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  margin-top: 1.25rem;
  padding: 0.82rem 1.15rem;
  font-weight: 850;
  box-shadow: 0 14px 40px color-mix(in srgb, var(--accent), transparent 72%);
}

.glass-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid ${usesTactical ? "color-mix(in srgb, var(--accent), white 42%)" : "rgba(255, 255, 255, 0.58)"};
  border-radius: ${usesTactical ? "18px" : "var(--radius)"};
  background: var(--surface);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.12);
  ${usesGlass ? "backdrop-filter: blur(18px) saturate(128%);" : ""}
}

${usesTactical ? `.glass-card::after {
  pointer-events: none;
  position: absolute;
  inset: 0;
  content: "";
  border: 1px solid rgba(185, 28, 28, 0.18);
  background: linear-gradient(135deg, rgba(127, 29, 45, 0.08), transparent 42%);
}

.eyebrow {
  color: var(--accent-2);
}
` : ""}

.hero-visual {
  aspect-ratio: 4 / 5;
  margin: 0;
}

.hero-visual img,
.image-band img,
.domain-visual-placeholder {
  display: block;
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.domain-visual-placeholder {
  display: grid;
  min-height: 18rem;
  min-width: 0;
  place-items: center;
  background:
    radial-gradient(circle at 20% 18%, var(--accent-soft), transparent 16rem),
    linear-gradient(135deg, color-mix(in srgb, var(--accent), white 78%), color-mix(in srgb, var(--accent-2), white 82%));
  color: var(--ink);
  font-size: clamp(1.4rem, 4vw, 3rem);
  font-weight: 900;
  text-align: center;
}

.visual-tv {
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.16), transparent 18%, transparent 82%, rgba(255, 255, 255, 0.12)),
    radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.44), transparent 11rem),
    linear-gradient(145deg, #18070d, #3a0c19 48%, #8a1538);
  color: #fff5f7;
  outline: 10px solid rgba(20, 8, 12, 0.62);
  outline-offset: -2.4rem;
}

.visual-bike {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.28), transparent 32%),
    radial-gradient(circle at 28% 42%, var(--accent-soft), transparent 9rem),
    linear-gradient(145deg, color-mix(in srgb, var(--accent), white 62%), color-mix(in srgb, var(--accent-2), white 72%));
}

.visual-moto {
  background:
    radial-gradient(circle at 22% 24%, rgba(255, 255, 255, 0.22), transparent 10rem),
    linear-gradient(120deg, #16060a, #47111d 52%, #8a1538);
  color: #fff5f7;
}

.visual-cycle {
  background:
    radial-gradient(circle at 72% 20%, rgba(34, 197, 94, 0.34), transparent 10rem),
    linear-gradient(135deg, #ecfdf5, #bbf7d0 46%, #16a34a);
}

.visual-fragrance {
  background:
    radial-gradient(circle at 36% 28%, rgba(255, 255, 255, 0.62), transparent 7rem),
    radial-gradient(circle at 70% 74%, rgba(245, 158, 11, 0.3), transparent 10rem),
    linear-gradient(145deg, #fffbea, #fef3c7 44%, #eab308);
  color: #261b05;
}

.domain-visual-placeholder span {
  max-width: 10ch;
  overflow-wrap: anywhere;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.glass-card {
  padding: 1.2rem;
}

.glass-card span {
  color: var(--accent-2);
  font-size: 0.76rem;
  font-weight: 850;
}

.image-band {
  display: grid;
  grid-column: span 1;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.75fr);
  gap: 1rem;
  align-items: center;
}

.image-band img {
  min-height: 14rem;
}

${layoutCssForClass(layoutClass)}

.reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 520ms ease, transform 520ms ease, box-shadow 220ms ease;
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.glass-card:hover {
  box-shadow: 0 32px 100px rgba(15, 23, 42, 0.16);
}

@media (max-width: 980px) {
  .section-grid {
    grid-template-columns: 1fr;
  }

  .section-grid > *,
  .image-band {
    grid-column: span 1 !important;
  }

  .layout-showroom .glass-card:first-child,
  .image-band {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 820px) {
  .site-header,
  footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero,
  .image-band {
    grid-template-columns: 1fr;
  }

  .section-grid {
    grid-template-columns: 1fr;
  }

  .image-band {
    grid-column: span 1;
  }
}
`;
}

function renderComposedJs() {
  return `const revealTargets = document.querySelectorAll(".reveal, .hero-visual");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => observer.observe(element));
} else {
  revealTargets.forEach((element) => element.classList.add("is-visible"));
}
`;
}

function layoutCssForClass(layoutClass: string) {
  if (layoutClass === "layout-showroom") {
    return `.layout-showroom {
  grid-template-columns: 1.15fr 0.85fr;
}

.layout-showroom .glass-card:first-child,
.layout-showroom .glass-card:nth-child(4) {
  grid-column: span 2;
}

.layout-showroom .glass-card:first-child {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.58fr);
}
`;
  }

  if (layoutClass === "layout-bike-balanced" || layoutClass === "layout-moto") {
    return `.${layoutClass} {
  grid-template-columns: 0.9fr 1.1fr;
}

.${layoutClass} .glass-card:nth-child(2) {
  grid-column: span 2;
}
`;
  }

  if (layoutClass === "layout-cycle") {
    return `.layout-cycle {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
`;
  }

  if (layoutClass === "layout-dessert" || layoutClass === "layout-beverage") {
    return `.${layoutClass} {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.${layoutClass} .glass-card:first-child {
  grid-column: span 2;
}
`;
  }

  if (layoutClass === "layout-fragrance") {
    return `.layout-fragrance {
  grid-template-columns: 1fr 0.78fr 1fr;
}

.layout-fragrance .glass-card:first-child {
  grid-column: span 2;
}

.layout-fragrance .glass-card:nth-child(3) {
  transform: translateY(1.2rem);
}
`;
  }

  return "";
}

export function generateComposedSiteFiles(input: {
  composition: CompositionStrategy;
  intent: IntentIntelligence;
}): Record<string, string> {
  const brandName = brandNameForIntent(input.intent, input.composition);
  const pages = input.composition.siteArchitecture.pages.length
    ? input.composition.siteArchitecture.pages
    : ["home"];
  const navigation = navForComposition(pages);
  const images = imageSetForComposition(input.intent, input.composition);
  const files: Record<string, string> = {
    "main.js": renderComposedJs(),
    "styles.css": renderComposedCss(input.intent, input.composition)
  };

  pages.forEach((page) => {
    files[pageToPath(page)] = renderComposedPage({
      brandName,
      composition: input.composition,
      images,
      intent: input.intent,
      navigation,
      page
    });
  });

  if (!files["index.html"]) {
    files["index.html"] = renderComposedPage({
      brandName,
      composition: input.composition,
      images,
      intent: input.intent,
      navigation,
      page: "home"
    });
  }

  return files;
}

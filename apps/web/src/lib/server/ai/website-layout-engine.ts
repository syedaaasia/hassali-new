import type { WebsitePlan } from "@/lib/server/ai/website-planner";

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
  return page === "home" ? "index.html" : `${page}.html`;
}

function nav(plan: WebsitePlan) {
  return plan.pages
    .map((page) => `<a href="./${pageToPath(page)}">${escapeHtml(titleCase(page))}</a>`)
    .join("\n        ");
}

function sectionsForPage(plan: WebsitePlan, page: string) {
  if (page === "home") return plan.requiredSections;
  const offset = Math.max(0, plan.pages.indexOf(page) - 1);
  const section = plan.requiredSections[offset % plan.requiredSections.length];
  const support = plan.optionalSections[offset % Math.max(plan.optionalSections.length, 1)];

  return support ? [section, support] : [section];
}

function industryLabel(plan: WebsitePlan) {
  return plan.industry.replace(/_/g, " ");
}

function isSeafoodPlan(plan: WebsitePlan) {
  return plan.sourceOfTruthDomain === "seafood_restaurant" ||
    plan.sourceOfTruthDomain === "seafood" ||
    plan.sourceOfTruthPages.includes("menu") && plan.sourceOfTruthPages.includes("gallery") && plan.industry === "restaurant";
}

function isBeveragePlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return text.includes("cola") ||
    text.includes("soft drink") ||
    text.includes("beverage") ||
    text.includes("soda") ||
    plan.layoutType === "beverage_brand";
}

function isCarRentalPlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return plan.industry === "car_rental" ||
    text.includes("car rental") ||
    text.includes("vehicle rental") ||
    text.includes("car_rental") ||
    text.includes("rental cars");
}

function isMobilePhonePlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return plan.industry === "mobile_phone_shop" ||
    text.includes("mobile phone shop") ||
    text.includes("phone shop") ||
    text.includes("smartphone") ||
    text.includes("phone retail") ||
    text.includes("mobile_phone_shop");
}

function publicLayoutLabel(plan: WebsitePlan) {
  if (plan.industry === "car_rental") return "vehicle rental";
  if (plan.industry === "mobile_phone_shop") return "smartphone retail";
  if (plan.layoutType === "catalog_commerce") return "featured range";
  if (plan.layoutType === "beverage_brand") return "beverage brand";

  return plan.layoutType.replace(/_/g, " ");
}

function seafoodPageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Meet the kitchen",
      eyebrow: "Seafood story / sourcing",
      hero: "Coastal cooking with a responsible catch philosophy.",
      lede: "Our kitchen works with trusted fishmongers, seasonal catches, and careful prep so every plate feels fresh, warm, and unmistakably ocean-led.",
      sections: [
        {
          body: "From grilled local fish to chilled oysters, the menu changes with what is freshest and most sustainable.",
          title: "Sourced with care",
          visual: "chef selecting fresh seafood"
        },
        {
          body: "Pearl-toned tables, soft lighting, and a calm dining room make the restaurant suited for date nights, family meals, and business dinners.",
          title: "A relaxed dining atmosphere",
          visual: "coastal restaurant ambience"
        }
      ]
    },
    contact: {
      cta: "Reserve a table",
      eyebrow: "Hours / reservations",
      hero: "Plan your visit for fresh seafood, warm service, and easy reservations.",
      lede: "Send a reservation request, check dinner hours, or contact the team for private dining and seasonal menu questions.",
      sections: [
        {
          body: "Open Tuesday to Sunday for lunch and dinner, with extended evening seating on Fridays and Saturdays.",
          title: "Hours and location",
          visual: "Visit us by the waterfront"
        },
        {
          body: "Use the contact form for table requests, group bookings, allergy notes, and chef's tasting menu inquiries.",
          title: "Reservation request form",
          visual: "reservation contact form"
        }
      ]
    },
    gallery: {
      cta: "View the menu",
      eyebrow: "Gallery / dining room",
      hero: "A visual taste of fresh plates, ocean textures, and coastal hospitality.",
      lede: "Browse composed seafood plates, raw bar details, chef finishes, and dining-room moments without fake uploads or broken remote images.",
      sections: [
        {
          body: "A grid of fresh oysters, grilled fish, lobster pasta, citrus salads, and chilled seafood platters.",
          title: "Food gallery",
          visual: "seafood dish gallery"
        },
        {
          body: "Warm tables, deep navy accents, pearl surfaces, and subtle aqua highlights create the restaurant's ocean mood.",
          title: "Ambience gallery",
          visual: "ocean-inspired dining room"
        }
      ]
    },
    home: {
      cta: "Reserve your table",
      eyebrow: "Premium seafood dining",
      hero: "Fresh seafood, ocean calm, and a table worth reserving.",
      lede: "A refined seafood restaurant built around seasonal catch, chef-led specials, fresh oysters, grilled fish, and warm hospitality.",
      sections: [
        {
          body: "Daily catch, oysters, lobster pasta, grilled prawns, citrus salads, and chef specials anchor the first screen.",
          title: "Featured seafood specialties",
          visual: "Chef's coastal signature platter"
        },
        {
          body: "Guide guests from appetite to action with a warm table request, menu path, hours, and contact details.",
          title: "Reservation-first dining path",
          visual: "Reserve tonight's fresh catch"
        }
      ]
    },
    menu: {
      cta: "Reserve for dinner",
      eyebrow: "Menu / seasonal catch",
      hero: "Seafood categories, dish cards, pricing, and seasonal catch.",
      lede: "Explore raw bar favorites, grilled fish, shellfish plates, seafood pasta, sides, desserts, and chef-selected seasonal catch.",
      sections: [
        {
          body: "Raw bar, grilled catch, lobster and shellfish, seafood pasta, sides, desserts, and non-alcoholic pairings.",
          title: "Seafood menu categories",
          visual: "seafood menu category cards"
        },
        {
          body: "Dish cards include short descriptions, clear pricing, sourcing notes, and seasonal availability.",
          title: "Dish cards and pricing",
          visual: "seasonal catch dish cards"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function beveragePageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Explore the flavor story",
      eyebrow: "Brand story / flavor profile",
      hero: "A cola brand built around bold flavor, campaigns, and retail momentum.",
      lede: "The brand story starts with a crisp cola profile, chilled shelf presence, and campaign launches built for stores, events, and regional distribution.",
      sections: [
        {
          body: "Flagship cans and sparkling bottles carry a bold cola flavor made for everyday shelves, campaign coolers, and shared moments.",
          title: "Flavor profile with shelf energy",
          visual: "flagship cans and sparkling bottles"
        },
        {
          body: "Campaign launches and regional distribution help retailers bring the cola lineup to new neighborhoods with consistent supply and clear merchandising.",
          title: "Campaigns and distribution story",
          visual: "regional campaign launch"
        }
      ]
    },
    contact: {
      cta: "Become a distribution partner",
      eyebrow: "Retailer / distributor contact",
      hero: "Retailer inquiries, distributor partnerships, and campaign partnerships start here.",
      lede: "Use the contact form for retailer inquiries, distributor partnerships, campaign partnerships, regional availability, and shelf-launch planning.",
      sections: [
        {
          body: "Retail teams can ask about flagship cans, sparkling bottles, chilled displays, wholesale availability, and launch timing.",
          title: "Retailer inquiries",
          visual: "retailer inquiry form"
        },
        {
          body: "Distribution partners can discuss region coverage, campaign launches, delivery rhythm, and shelf-ready cola supply.",
          title: "Distributor partnerships",
          visual: "distribution partner path"
        }
      ]
    },
    home: {
      cta: "Become a distribution partner",
      eyebrow: "Premium cola / soft drinks",
      hero: "Bold cola flavor, chilled and ready.",
      lede: "Flagship cans and sparkling bottles bring crisp cola refreshment, campaign energy, and flavors for every shelf.",
      sections: [
        {
          body: "Featured cola lineup with classic cola, zero sugar, citrus sparkle, and seasonal campaign flavors for retail coolers.",
          title: "Flavors for every shelf",
          visual: "featured cola lineup"
        },
        {
          body: "Trusted by retailers across 12 regions, with campaign launches and regional distribution support for growing stores.",
          title: "Retailer and distributor inquiries",
          visual: "regional cola distribution"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function carRentalPageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Explore the fleet",
      eyebrow: "Car rental story / fleet care",
      hero: "A rental team built around clean vehicles, clear pricing, and confident handovers.",
      lede: "Our car rental service keeps economy cars, SUVs, and luxury vehicles ready for airport pickups, business travel, family trips, and weekly rental plans.",
      sections: [
        {
          body: "Every vehicle is inspected, cleaned, and prepared with mileage, insurance, and pickup details explained before handover.",
          title: "Clean vehicles, ready on time",
          visual: "vehicle inspection and clean fleet"
        },
        {
          body: "Drivers can compare rental categories, daily and weekly plans, airport timing, and roadside support without hidden pressure.",
          title: "Transparent rental guidance",
          visual: "transparent rental plan cards"
        }
      ]
    },
    blog: {
      cta: "Reserve a vehicle",
      eyebrow: "Rental guides / travel tips",
      hero: "Helpful rental guides for airport trips, city drives, and weekly plans.",
      lede: "Read practical notes on choosing economy cars, SUVs, luxury vehicles, insurance options, mileage expectations, pickup timing, and travel-ready reservations.",
      sections: [
        {
          body: "Compare vehicle categories by luggage, passenger count, route length, comfort, and daily or weekly rental budget.",
          title: "How to choose the right rental car",
          visual: "rental car comparison guide"
        },
        {
          body: "Plan pickup and dropoff windows, driver requirements, insurance notes, and roadside support before your reservation.",
          title: "Before pickup checklist",
          visual: "pickup checklist for drivers"
        }
      ]
    },
    contact: {
      cta: "Send rental inquiry",
      eyebrow: "Reservations / pickup details",
      hero: "Reserve a rental car with clear dates, pickup location, and vehicle category.",
      lede: "Use the form for reservations, airport rentals, pickup and dropoff timing, driver questions, insurance options, and fleet availability.",
      sections: [
        {
          body: "Share your pickup date, dropoff date, airport or city location, driver count, and preferred vehicle class.",
          title: "Rental inquiry form",
          visual: "reservation form for rental cars"
        },
        {
          body: "Ask about mileage, deposits, insurance, roadside support, luxury vehicles, SUVs, and weekly rental plans.",
          title: "Support before handover",
          visual: "roadside support and insurance details"
        }
      ]
    },
    home: {
      cta: "Reserve a vehicle",
      eyebrow: "Premium car rental / vehicle fleet",
      hero: "Rental cars ready for airport pickups, business days, and weekend drives.",
      lede: "Choose from clean economy cars, SUVs, and luxury vehicles with transparent pricing, insurance guidance, mileage clarity, and easy pickup and dropoff.",
      sections: [
        {
          body: "Browse economy cars, SUVs, and luxury vehicles prepared for daily rentals, weekly plans, airport arrivals, and driver comfort.",
          title: "Vehicle fleet for every trip",
          visual: "economy cars SUVs and luxury vehicles"
        },
        {
          body: "Reserve with clear availability, pickup location, insurance options, mileage details, and roadside support before handover.",
          title: "Booking, insurance, and pickup clarity",
          visual: "booking and pickup details"
        }
      ]
    },
    services: {
      cta: "Check availability",
      eyebrow: "Rental services / plans",
      hero: "Daily rentals, weekly plans, airport pickup, and flexible vehicle categories.",
      lede: "Services include economy rentals, SUV rentals, luxury vehicles, airport rentals, corporate bookings, driver support, insurance guidance, and transparent mileage terms.",
      sections: [
        {
          body: "Daily and weekly rental plans make it simple to book a clean vehicle for errands, travel, business, or family needs.",
          title: "Daily and weekly rental plans",
          visual: "rental plan cards"
        },
        {
          body: "Airport pickup, dropoff scheduling, driver requirements, and roadside support are explained before confirmation.",
          title: "Pickup, dropoff, and support",
          visual: "airport pickup and dropoff"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function mobilePhonePageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Visit the service counter",
      eyebrow: "Phone shop story / trusted support",
      hero: "A mobile phone shop built around honest comparison, setup help, and after-sale care.",
      lede: "Our team helps customers compare iPhone, Samsung, and Android phones, choose accessories, understand warranty options, and set up devices with confidence.",
      sections: [
        {
          body: "We explain storage, camera, battery, display, warranty, and installment plan differences in plain language before customers buy.",
          title: "Clear smartphone guidance",
          visual: "smartphone comparison counter"
        },
        {
          body: "The service counter supports screen protectors, device setup, data transfer, trade-ins, repairs, and customer support after purchase.",
          title: "Setup, warranty, and repairs",
          visual: "phone repair and setup desk"
        }
      ]
    },
    contact: {
      cta: "Ask about availability",
      eyebrow: "Store support / phone inquiries",
      hero: "Contact us for smartphones, accessories, repairs, trade-ins, and device setup.",
      lede: "Use the form to ask about iPhone availability, Samsung models, Android phones, cases, chargers, screen protectors, unlocked phones, installment plans, warranty, repairs, and service counter timing.",
      sections: [
        {
          body: "Share the phone model, storage size, preferred color, accessory needs, warranty question, or repair issue so the team can prepare options.",
          title: "Phone and repair inquiry form",
          visual: "customer support contact form"
        },
        {
          body: "Ask about store hours, pickup, trade-ins, installment plans, screen protector fitting, and device setup before visiting.",
          title: "Support before your visit",
          visual: "mobile store customer support"
        }
      ]
    },
    home: {
      cta: "Compare phones",
      eyebrow: "Premium mobile phone shop / smartphone retail",
      hero: "Smartphones, accessories, repairs, and setup help in one trusted phone shop.",
      lede: "Browse iPhone, Samsung, Android phones, unlocked phones, cases, chargers, screen protectors, trade-ins, installment plans, warranty help, repairs, and device setup support.",
      sections: [
        {
          body: "Compare new arrivals, flagship phones, budget Android phones, and unlocked devices with clear guidance on camera, battery, storage, and warranty.",
          title: "Featured smartphones and new arrivals",
          visual: "iPhone Samsung and Android phone display"
        },
        {
          body: "Find cases, chargers, screen protectors, device setup, data transfer, repair support, and customer service from the same counter.",
          title: "Accessories, setup, and service counter",
          visual: "phone accessories and repair counter"
        }
      ]
    },
    services: {
      cta: "Request service help",
      eyebrow: "Services / support counter",
      hero: "Phone repairs, device setup, accessories, warranty support, and upgrade guidance.",
      lede: "Services include screen protector fitting, phone accessories, device setup, data transfer, trade-ins, installment plan guidance, warranty questions, repairs, and product comparison.",
      sections: [
        {
          body: "Customers can compare iPhone, Samsung, Android phones, unlocked phones, storage choices, camera needs, and upgrade options.",
          title: "Product comparison and upgrades",
          visual: "smartphone product comparison"
        },
        {
          body: "The service counter helps with screen protectors, cases, chargers, repairs, warranty questions, device setup, and customer support.",
          title: "Repair, warranty, and setup support",
          visual: "phone service counter"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function renderVisual(label: string, index: number) {
  return `<div class="visual visual-${(index % 4) + 1}" aria-label="${escapeHtml(label)}">
            <span>${escapeHtml(label)}</span>
          </div>`;
}

function renderPage(input: {
  brandName: string;
  page: string;
  plan: WebsitePlan;
}) {
  const isHome = input.page === "home";
  const pageTitle = titleCase(input.page);
  const pageSections = sectionsForPage(input.plan, input.page);
  const leadSection = pageSections[0] ?? input.plan.requiredSections[0];
  const seafoodCopy = isSeafoodPlan(input.plan) ? seafoodPageCopy(input.page) : null;
  const beverageCopy = isBeveragePlan(input.plan) ? beveragePageCopy(input.page) : null;
  const carRentalCopy = isCarRentalPlan(input.plan) ? carRentalPageCopy(input.page) : null;
  const mobilePhoneCopy = isMobilePhonePlan(input.plan) ? mobilePhonePageCopy(input.page) : null;
  const domainCopy = mobilePhoneCopy ?? carRentalCopy ?? beverageCopy ?? seafoodCopy;
  const heroTitle = domainCopy?.hero ?? (isHome ? leadSection.title : `${pageTitle} built around ${leadSection.title.toLowerCase()}`);
  const lede = domainCopy?.lede ?? (isHome ? leadSection.intent : leadSection.contentAngle);
  const cta = domainCopy?.cta ?? input.plan.goal;
  const eyebrow = domainCopy?.eyebrow ?? `${industryLabel(input.plan)} / ${publicLayoutLabel(input.plan)}`;
  const sectionCards = domainCopy?.sections.map((section, index) => ({
    contentAngle: section.body,
    id: `${input.page}-${index + 1}`,
    title: section.title,
    visualIntent: section.visual
  })) ?? pageSections;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(isHome ? input.brandName : `${pageTitle} - ${input.brandName}`)}</title>
    <meta name="description" content="${escapeHtml(input.plan.goal)}" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body data-industry="${input.plan.industry}" data-layout="${input.plan.layoutType}">
    <header class="site-header">
      <a class="brand" href="./index.html">${escapeHtml(input.brandName)}</a>
      <nav aria-label="Primary navigation">
        ${nav(input.plan)}
      </nav>
    </header>
    <main>
      <section class="hero" data-section-id="${escapeHtml(leadSection.id)}">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(heroTitle)}</h1>
          <p class="lede">${escapeHtml(lede)}</p>
          <a class="button" href="./${input.plan.pages.includes("contact") ? "contact.html" : pageToPath(input.plan.pages[input.plan.pages.length - 1] ?? "contact")}">${escapeHtml(cta)}</a>
        </div>
        ${renderVisual(domainCopy?.sections[0]?.visual ?? leadSection.visualIntent, 0)}
      </section>
      <section class="section-grid" aria-label="${escapeHtml(pageTitle)} sections">
${sectionCards
  .map((section, index) => `        <article class="section-card" data-section-id="${escapeHtml(section.id)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <p class="eyebrow">${escapeHtml(section.visualIntent)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.contentAngle)}</p>
          ${renderVisual(section.visualIntent, index + 1)}
        </article>`)
  .join("\n")}
      </section>
      ${domainCopy && input.page === "contact" ? `<section class="contact-form" aria-label="${beverageCopy ? "Partner inquiry" : carRentalCopy ? "Rental inquiry" : mobilePhoneCopy ? "Phone shop inquiry" : "Reservation request"}">
        <div>
          <p class="eyebrow">${beverageCopy ? "Partner inquiry" : carRentalCopy ? "Rental inquiry" : mobilePhoneCopy ? "Phone shop inquiry" : "Reservation request"}</p>
          <h2>${beverageCopy ? "Tell us about your retail, distributor, or campaign partnership needs." : carRentalCopy ? "Tell us your pickup date, dropoff location, and preferred vehicle category." : mobilePhoneCopy ? "Tell us which phone, accessory, repair, warranty, or setup support you need." : "Tell us your preferred date, party size, and seafood notes."}</h2>
          <p>${beverageCopy ? "Share region, store count, campaign timing, and preferred cola lineup details." : carRentalCopy ? "Share driver details, airport timing, mileage questions, insurance needs, and rental plan preferences." : mobilePhoneCopy ? "Share model, storage, color, accessory needs, repair issue, trade-in question, installment plan, or warranty detail before visiting." : "Share allergies, raw bar preferences, private dining requests, or seasonal catch questions before your visit."}</p>
        </div>
        <form>
          <label>Name <input type="text" name="name" autocomplete="name" /></label>
          <label>Email <input type="email" name="email" autocomplete="email" /></label>
          <label>${beverageCopy ? "Partnership notes" : carRentalCopy ? "Rental notes" : mobilePhoneCopy ? "Phone shop notes" : "Reservation notes"} <textarea name="notes" rows="4"></textarea></label>
          <button class="button" type="button">${beverageCopy ? "Send partnership inquiry" : carRentalCopy ? "Send rental inquiry" : mobilePhoneCopy ? "Send phone inquiry" : "Send reservation request"}</button>
        </form>
      </section>` : ""}
    </main>
    <footer>
      <span>${escapeHtml(input.brandName)}</span>
      <span>${escapeHtml(beverageCopy ? "Bold cola flavor, sparkling bottles, campaign launches, and regional distribution partnerships." : carRentalCopy ? "Rental cars, vehicle fleet, booking, pickup and dropoff, insurance, mileage, and roadside support." : mobilePhoneCopy ? "Smartphones, iPhone, Samsung, Android phones, accessories, warranty, repairs, trade-ins, and device setup support." : seafoodCopy ? "Ocean-inspired seafood dining, seasonal catch, reservations, and warm hospitality." : input.plan.visualStrategy)}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`;
}

export function renderWebsitePlanFiles(input: {
  brandName: string;
  plan: WebsitePlan;
}) {
  const files: Record<string, string> = {
    "main.js": `document.querySelectorAll(".section-card, .visual").forEach((element, index) => {
  element.style.setProperty("--stagger", String(index));
});
`,
    "styles.css": renderWebsitePlanCss(input.plan)
  };

  input.plan.pages.forEach((page) => {
    files[pageToPath(page)] = renderPage({
      brandName: input.brandName,
      page,
      plan: input.plan
    });
  });

  if (!files["index.html"]) {
    files["index.html"] = renderPage({
      brandName: input.brandName,
      page: "home",
      plan: input.plan
    });
  }

  return files;
}

function renderWebsitePlanCss(plan: WebsitePlan) {
  const cssVariables = Object.entries(plan.designTokens.cssVariables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  const colorScheme = plan.designTokens.tokens.color.background.value.toLowerCase().startsWith("#0") ? "dark" : "light";

  return `:root {
  color-scheme: ${colorScheme};
${cssVariables}
  font-family: var(--font-sans);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 28rem),
    radial-gradient(circle at 82% 16%, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 26rem),
    var(--canvas);
  color: var(--ink);
}
a { color: inherit; text-decoration: none; }
.site-header, main, footer { margin: 0 auto; max-width: var(--token-layout-max-width); }
.site-header, footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem clamp(1rem, 4vw, 2rem);
}
.brand { font-weight: 900; letter-spacing: -0.03em; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--muted); font-size: 0.92rem; }
main { padding: var(--token-spacing-xl) var(--token-spacing-page); }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(17rem, 0.72fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
  padding: var(--section-padding);
}
.hero-copy { min-width: 0; }
.eyebrow {
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
h1, h2, p { margin: 0; }
h1 {
  max-width: 13ch;
  font-size: clamp(2.6rem, 7vw, 6rem);
  line-height: 0.92;
  letter-spacing: -0.045em;
}
h2 { margin-top: 0.5rem; font-size: clamp(1.35rem, 3vw, 2rem); line-height: 1.05; }
.lede, .section-card p, footer { color: var(--muted); line-height: 1.72; }
.lede { margin-top: 1rem; max-width: 650px; font-size: clamp(1rem, 1.8vw, 1.2rem); }
.button {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin-top: 1.25rem;
  border-radius: var(--token-radius-pill);
  background: var(--accent);
  color: var(--token-color-primary-foreground);
  padding: var(--button-padding);
  font-weight: 850;
}
.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 1rem;
}
.section-card, .visual {
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  backdrop-filter: blur(16px) saturate(120%);
  box-shadow: var(--shadow-soft);
}
.section-card { display: grid; gap: 0.9rem; padding: var(--card-padding); }
.section-card span { color: var(--accent-2); font-size: 0.76rem; font-weight: 900; }
.contact-form {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(18rem, 1fr);
  gap: var(--token-spacing-lg);
  margin-top: var(--token-spacing-xl);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  padding: var(--card-padding);
}
form { display: grid; gap: 0.85rem; }
label { display: grid; gap: 0.35rem; color: var(--muted); font-size: 0.9rem; }
input, textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--token-radius-md);
  background: color-mix(in srgb, var(--surface-elevated) 70%, transparent);
  color: var(--ink);
  padding: 0.85rem 0.9rem;
  font: inherit;
}
.visual {
  display: grid;
  min-height: 18rem;
  place-items: center;
  overflow: hidden;
  padding: 1.5rem;
  text-align: center;
  font-size: clamp(1.3rem, 4vw, 3rem);
  font-weight: 950;
}
.visual span { max-width: 10ch; }
.visual-1 { background: radial-gradient(circle at 22% 18%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 8rem), linear-gradient(135deg, color-mix(in srgb, var(--surface-elevated) 84%, var(--accent)), color-mix(in srgb, var(--surface) 72%, var(--accent-2))); }
.visual-2 { background: radial-gradient(circle at 70% 20%, color-mix(in srgb, var(--accent) 32%, transparent), transparent 9rem), linear-gradient(145deg, var(--surface-elevated), color-mix(in srgb, var(--surface) 78%, var(--accent-2))); }
.visual-3 { background: radial-gradient(circle at 32% 70%, color-mix(in srgb, var(--accent-2) 30%, transparent), transparent 10rem), linear-gradient(145deg, var(--surface-elevated), color-mix(in srgb, var(--surface) 78%, var(--accent))); }
.visual-4 { background: linear-gradient(135deg, color-mix(in srgb, var(--ink) 8%, transparent), color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent-2) 22%, transparent)); }
body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 2; }
@media (max-width: 860px) {
  .site-header, footer { align-items: flex-start; flex-direction: column; }
  .hero { grid-template-columns: 1fr; }
  .contact-form { grid-template-columns: 1fr; }
  body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 1; }
}
`;
}

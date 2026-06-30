export type CodeAppSourceFile = {
  content: string;
  path: string;
  summary: string;
};

export function generateCrmViteSource(input: {
  appName: string;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Hassali CRM";

  return [
    {
      path: "package.json",
      summary: "Adds Vite React package metadata for the CRM app. No install is executed.",
      content: `{
  "name": "${slug(appName)}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {}
}
`
    },
    {
      path: "vite.config.ts",
      summary: "Adds a Vite React configuration for future approved runtime preview.",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
`
    },
    {
      path: "index.html",
      summary: "Adds the Vite app HTML entry point.",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(appName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    },
    {
      path: "src/main.tsx",
      summary: "Adds the React entry point.",
      content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
    },
    {
      path: "src/App.tsx",
      summary: "Adds the CRM application composition.",
      content: `import { ActivityFeed } from "./components/ActivityFeed";
import { BillingPanel } from "./components/BillingPanel";
import { CustomerTable } from "./components/CustomerTable";
import { DashboardShell } from "./components/DashboardShell";
import { MetricCards } from "./components/MetricCards";
import { PipelineBoard } from "./components/PipelineBoard";
import { activities, customers, deals, invoices, metrics } from "./lib/mock-data";

export default function App() {
  return (
    <DashboardShell appName="${escapeTsx(appName)}">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">CRM dashboard</p>
          <h1>Customers, pipeline, and billing in one calm workspace.</h1>
          <p>
            Mock CRM data is shown for preview only. Auth, database, and billing providers remain placeholders until approved implementation.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button">Add customer</button>
          <button type="button" className="secondary">Review billing</button>
        </div>
      </section>
      <MetricCards metrics={metrics} />
      <div className="dashboard-grid">
        <PipelineBoard deals={deals} />
        <BillingPanel invoices={invoices} />
      </div>
      <div className="dashboard-grid wide">
        <CustomerTable customers={customers} />
        <ActivityFeed activities={activities} />
      </div>
    </DashboardShell>
  );
}
`
    },
    {
      path: "src/styles.css",
      summary: "Adds premium dark CRM dashboard styles.",
      content: `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #05070a;
  color: #f7fbff;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 15% 12%, rgba(0, 255, 135, 0.13), transparent 26rem),
    radial-gradient(circle at 88% 8%, rgba(96, 239, 255, 0.13), transparent 24rem),
    #05070a;
}
button {
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  background: #00ff87;
  color: #03110a;
  cursor: pointer;
  font-weight: 850;
  padding: 0.78rem 1rem;
}
button.secondary {
  background: rgba(255,255,255,0.06);
  color: #f7fbff;
}
.app-shell {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 1.25rem;
  background: rgba(255,255,255,0.035);
}
.brand { font-size: 1.05rem; font-weight: 950; letter-spacing: -0.03em; }
.nav {
  display: grid;
  gap: 0.55rem;
  margin-top: 2rem;
}
.nav a {
  border-radius: 14px;
  color: #a7b4c2;
  padding: 0.78rem 0.85rem;
  text-decoration: none;
}
.nav a.active, .nav a:hover {
  background: rgba(96,239,255,0.1);
  color: #f7fbff;
}
.content {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
}
.hero-panel, .panel, .metric-card {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 22px;
  background: rgba(13,18,24,0.78);
  box-shadow: 0 24px 80px rgba(0,0,0,0.24);
}
.hero-panel {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: clamp(1.25rem, 3vw, 2rem);
}
.hero-panel h1 {
  margin: 0;
  max-width: 13ch;
  font-size: clamp(2rem, 5vw, 4.4rem);
  line-height: 0.94;
  letter-spacing: -0.045em;
}
.hero-panel p, .muted { color: #a7b4c2; line-height: 1.65; }
.eyebrow {
  color: #60efff;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.hero-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-content: start; }
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}
.metric-card { padding: 1rem; }
.metric-card strong { display: block; font-size: 1.8rem; letter-spacing: -0.04em; }
.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
  gap: 1rem;
}
.dashboard-grid.wide { grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr); }
.panel { padding: 1rem; overflow: hidden; }
.panel-header { display: flex; justify-content: space-between; gap: 1rem; align-items: start; margin-bottom: 1rem; }
.pipeline { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
.stage { border-radius: 16px; background: rgba(255,255,255,0.045); padding: 0.8rem; }
.deal, .invoice, .activity {
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  margin-top: 0.65rem;
  padding: 0.75rem;
}
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid rgba(255,255,255,0.07); padding: 0.75rem; text-align: left; }
th { color: #60efff; font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; }
.status { color: #00ff87; font-weight: 800; }
@media (max-width: 980px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { position: static; }
  .metrics, .dashboard-grid, .dashboard-grid.wide, .pipeline { grid-template-columns: 1fr; }
  .hero-panel { display: grid; }
}
`
    },
    {
      path: "src/lib/mock-data.ts",
      summary: "Adds mock CRM data for dashboard preview.",
      content: `export const metrics = [
  { label: "Monthly revenue", value: "$42.8k", change: "+18%" },
  { label: "Active customers", value: "1,284", change: "+96" },
  { label: "Open pipeline", value: "$218k", change: "34 deals" },
  { label: "Billing risk", value: "7", change: "needs review" }
];

export const customers = [
  { company: "Northline Foods", owner: "Aisha", status: "Active", value: "$18,400" },
  { company: "BluePeak Studio", owner: "Daniel", status: "Trial", value: "$4,200" },
  { company: "CareBridge Clinic", owner: "Mina", status: "Active", value: "$27,900" },
  { company: "UrbanFleet", owner: "Omar", status: "At risk", value: "$9,100" }
];

export const deals = [
  { stage: "Qualified", title: "Clinic CRM rollout", value: "$32k" },
  { stage: "Proposal", title: "Marketplace billing", value: "$58k" },
  { stage: "Closing", title: "Retail pipeline migration", value: "$84k" }
];

export const invoices = [
  { account: "Northline Foods", amount: "$2,400", status: "Paid" },
  { account: "CareBridge Clinic", amount: "$5,700", status: "Open" },
  { account: "UrbanFleet", amount: "$1,300", status: "Retry" }
];

export const activities = [
  "Aisha added a follow-up task for Northline Foods.",
  "Billing retry scheduled for UrbanFleet subscription.",
  "CareBridge Clinic requested dashboard role review.",
  "BluePeak Studio trial moved to proposal stage."
];
`
    },
    component("src/components/DashboardShell.tsx", `type DashboardShellProps = {
  appName: string;
  children: React.ReactNode;
};

const navItems = ["Dashboard", "Customers", "Pipeline", "Billing", "Reports", "Settings"];

export function DashboardShell({ appName, children }: DashboardShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">{appName}</div>
        <nav className="nav" aria-label="CRM navigation">
          {navItems.map((item, index) => (
            <a key={item} className={index === 0 ? "active" : ""} href="#dashboard">
              {item}
            </a>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
`, "Adds the CRM dashboard shell and sidebar navigation."),
    component("src/components/MetricCards.tsx", `type Metric = {
  change: string;
  label: string;
  value: string;
};

export function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metrics" aria-label="CRM metrics">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <p className="muted">{metric.label}</p>
          <strong>{metric.value}</strong>
          <span className="status">{metric.change}</span>
        </article>
      ))}
    </section>
  );
}
`, "Adds dashboard metric cards."),
    component("src/components/CustomerTable.tsx", `type Customer = {
  company: string;
  owner: string;
  status: string;
  value: string;
};

export function CustomerTable({ customers }: { customers: Customer[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Customers</p>
          <h2>Account health and ownership</h2>
        </div>
        <span className="muted">Mock data</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.company}>
              <td>{customer.company}</td>
              <td>{customer.owner}</td>
              <td>{customer.status}</td>
              <td>{customer.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
`, "Adds the customers table component."),
    component("src/components/PipelineBoard.tsx", `type Deal = {
  stage: string;
  title: string;
  value: string;
};

export function PipelineBoard({ deals }: { deals: Deal[] }) {
  const stages = ["Qualified", "Proposal", "Closing"];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2>Deal movement</h2>
        </div>
      </div>
      <div className="pipeline">
        {stages.map((stage) => (
          <div className="stage" key={stage}>
            <strong>{stage}</strong>
            {deals.filter((deal) => deal.stage === stage).map((deal) => (
              <article className="deal" key={deal.title}>
                <span>{deal.title}</span>
                <p className="status">{deal.value}</p>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
`, "Adds the sales pipeline board."),
    component("src/components/BillingPanel.tsx", `type Invoice = {
  account: string;
  amount: string;
  status: string;
};

export function BillingPanel({ invoices }: { invoices: Invoice[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h2>Invoices and subscription state</h2>
        </div>
      </div>
      {invoices.map((invoice) => (
        <article className="invoice" key={invoice.account}>
          <strong>{invoice.account}</strong>
          <p className="muted">{invoice.amount}</p>
          <span className="status">{invoice.status}</span>
        </article>
      ))}
    </section>
  );
}
`, "Adds the billing panel."),
    component("src/components/ActivityFeed.tsx", `export function ActivityFeed({ activities }: { activities: string[] }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>Recent team movement</h2>
        </div>
      </div>
      {activities.map((activity) => (
        <article className="activity" key={activity}>{activity}</article>
      ))}
    </section>
  );
}
`, "Adds the recent activity feed."),
    {
      path: "ARCHITECTURE.md",
      summary: "Creates architecture guidance for the runnable CRM app.",
      content: `# ${appName} Architecture

Source request:
${input.prompt}

This proposal creates a runnable Vite React CRM dashboard source scaffold plus planning docs. It does not install packages, run shell commands, call external APIs, or bypass approval-first runtime safety.

## App Modules
- Dashboard shell and sidebar navigation
- Metric cards
- Customer table
- Pipeline board
- Billing panel
- Activity feed
- Mock data layer

## Runtime
Vite can be detected from package.json, vite.config.ts, index.html, and src/main.tsx. Runtime start remains controlled by Hassali's approved runtime flow.
`
    },
    {
      path: "DATA_MODEL.md",
      summary: "Documents CRM entities and future persistence boundaries.",
      content: `# ${appName} Data Model

## Entities
- User
- Organization
- Customer
- Deal
- Activity
- Invoice
- Subscription

## Current Phase
The app uses mock data in src/lib/mock-data.ts for preview. Database persistence should be proposed separately with ownership checks.
`
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: "Adds security and testing notes for auth, database, and billing.",
      content: `# ${appName} Security And Testing

- Auth, database, and billing are placeholders until explicit approved implementation.
- Do not expose secrets client-side.
- Billing state must be verified by server/provider state in a future phase.
- Run typecheck/build after approved source execution.
- Runtime preview must use Hassali's project workspace and approved runtime controls.
`
    }
  ];
}

export function generateCrmPythonStreamlitSource(input: {
  appName: string;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Hassali CRM";

  return [
    {
      path: "app.py",
      summary: "Adds a Streamlit CRM dashboard scaffold with metrics, tables, and billing charts. No runtime command is executed.",
      content: `import pandas as pd
import streamlit as st

from data.mock_crm_data import activities, customers, invoices, metrics, pipeline


st.set_page_config(page_title="${escapePython(appName)}", page_icon="CRM", layout="wide")

st.sidebar.title("${escapePython(appName)}")
section = st.sidebar.radio(
    "Navigate",
    ["Dashboard", "Customers", "Pipeline", "Billing", "Activity"],
    index=0,
)
st.sidebar.caption("Python / Streamlit scaffold. Runtime requires approved Python flow.")

st.title("${escapePython(appName)}")
st.caption("Mock CRM data only. Auth, database, and payment providers are planned boundaries.")

if section == "Dashboard":
    cols = st.columns(4)
    for col, metric in zip(cols, metrics):
        col.metric(metric["label"], metric["value"], metric["delta"])

    st.subheader("Billing graphical representation")
    invoice_frame = pd.DataFrame(invoices)
    st.bar_chart(invoice_frame.set_index("month")["revenue"])

    st.subheader("Pipeline summary")
    st.dataframe(pd.DataFrame(pipeline), use_container_width=True, hide_index=True)

elif section == "Customers":
    st.subheader("Customer table")
    st.dataframe(pd.DataFrame(customers), use_container_width=True, hide_index=True)

elif section == "Pipeline":
    st.subheader("Pipeline by stage")
    pipeline_frame = pd.DataFrame(pipeline)
    st.bar_chart(pipeline_frame.set_index("stage")["value"])
    st.dataframe(pipeline_frame, use_container_width=True, hide_index=True)

elif section == "Billing":
    st.subheader("Billing and cost table")
    invoice_frame = pd.DataFrame(invoices)
    st.line_chart(invoice_frame.set_index("month")["revenue"])
    st.dataframe(invoice_frame, use_container_width=True, hide_index=True)
    st.info("Payment provider integration is planned. Do not add secrets client-side.")

else:
    st.subheader("Recent activity")
    for item in activities:
        st.write(f"- {item}")
`
    },
    {
      path: "requirements.txt",
      summary: "Declares lightweight Python dashboard dependencies for future approved runtime use.",
      content: `streamlit
pandas
`
    },
    {
      path: "data/mock_crm_data.py",
      summary: "Adds mock CRM data for Streamlit dashboard metrics, customers, pipeline, billing, and activity.",
      content: `metrics = [
    {"label": "Active customers", "value": "1,248", "delta": "+8.4%"},
    {"label": "Pipeline value", "value": "$284K", "delta": "+12.1%"},
    {"label": "Monthly recurring billing", "value": "$42.8K", "delta": "+5.6%"},
    {"label": "Open invoices", "value": "37", "delta": "-3"},
]

customers = [
    {"name": "Apex Foods", "owner": "Sara", "plan": "Growth", "status": "Active", "value": 18400},
    {"name": "Northline Motors", "owner": "Bilal", "plan": "Enterprise", "status": "Negotiation", "value": 42600},
    {"name": "Pearl Clinics", "owner": "Mina", "plan": "Starter", "status": "Onboarding", "value": 7200},
    {"name": "Metro Retail", "owner": "Hamza", "plan": "Growth", "status": "Active", "value": 23100},
]

pipeline = [
    {"stage": "Leads", "deals": 42, "value": 76000},
    {"stage": "Qualified", "deals": 21, "value": 94000},
    {"stage": "Proposal", "deals": 13, "value": 68000},
    {"stage": "Won", "deals": 8, "value": 46000},
]

invoices = [
    {"month": "Jan", "revenue": 28600, "cost": 7400, "open_invoices": 19},
    {"month": "Feb", "revenue": 31800, "cost": 8100, "open_invoices": 22},
    {"month": "Mar", "revenue": 35400, "cost": 8600, "open_invoices": 17},
    {"month": "Apr", "revenue": 42800, "cost": 9300, "open_invoices": 13},
]

activities = [
    "Sara logged a renewal call with Apex Foods.",
    "Billing follow-up scheduled for Northline Motors.",
    "Pearl Clinics completed onboarding checklist.",
    "Metro Retail requested pipeline export review.",
]
`
    },
    {
      path: "README.md",
      summary: "Explains the Python CRM scaffold and approved-runtime boundary.",
      content: `# ${appName}

Python / Streamlit CRM dashboard scaffold generated from:

${input.prompt}

## What is included

- Dashboard metrics
- Customer table
- Pipeline summary
- Billing and cost table
- Graphical revenue and pipeline charts
- Mock data in data/mock_crm_data.py

## Runtime boundary

Hassali does not install packages or start Python automatically. Running Streamlit requires a future approved Python runtime flow.
`
    },
    {
      path: "ARCHITECTURE.md",
      summary: "Creates architecture guidance for the Python CRM app.",
      content: `# ${appName} Architecture

Project Type: CODE
Stack: Python / Streamlit
Domain: CRM System
Preview Type: python_app_preview

The current prompt outranks stale project contracts or previous frontend scaffolds.

## Modules

- Streamlit dashboard shell
- Metrics overview
- Customer table
- Pipeline summary
- Billing and revenue charts
- Mock CRM data module

## Planned boundaries

- Auth is not implemented in this phase.
- Database persistence is not implemented in this phase.
- Payment provider integration is not implemented in this phase.
- Runtime execution requires explicit approval and Python runtime support.
`
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: "Adds safety and verification notes for the Python CRM scaffold.",
      content: `# ${appName} Security And Testing

- Keep credentials and payment provider secrets out of client-visible files.
- Treat mock CRM data as preview-only.
- Add ownership checks before future database writes.
- Do not auto-install packages.
- Do not auto-start Streamlit.
- Verify future Python runtime support through an approved runtime flow.
`
    },
    {
      path: "HASSALI.md",
      summary: "Adds the human-readable project contract for the Python CRM scaffold.",
      content: `# HASSALI.md

Project Type: CODE
Stack: Python / Streamlit
Domain: CRM System
Preview Type: python_app_preview

Current prompt outranks stale contract memory.

Files:
- app.py
- requirements.txt
- data/mock_crm_data.py
- README.md
- ARCHITECTURE.md
- SECURITY_AND_TESTING.md

Runtime:
- Python runtime is not auto-started.
- Package installation requires future explicit approval.
- Preview should be honest if Python runtime support is unavailable.
`
    }
  ];
}

function component(path: string, content: string, summary: string): CodeAppSourceFile {
  return { content, path, summary };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hassali-crm";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeTsx(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function escapePython(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

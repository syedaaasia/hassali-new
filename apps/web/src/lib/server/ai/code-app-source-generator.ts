import type {
  CodeGenerationBrief,
  CodeProductBrief
} from "@/lib/server/ai/generation-brief";

export type CodeAppSourceFile = {
  content: string;
  path: string;
  summary: string;
};

export type CodeProductFidelityResult = {
  failures: string[];
  passed: boolean;
  prohibitedSignals: string[];
  requiredSignals: string[];
};

export function validateCodeProductFidelity(
  brief: CodeProductBrief,
  files: CodeAppSourceFile[]
): CodeProductFidelityResult {
  const content = files.map((file) => `${file.path}\n${file.content}`).join("\n").toLowerCase();
  const runtimeContent = files
    .filter((file) => !/^(?:HASSALI|README|ARCHITECTURE|DATA_MODEL|SECURITY_AND_TESTING)\.md$/i.test(file.path))
    .map((file) => `${file.path}\n${file.content}`)
    .join("\n")
    .toLowerCase();
  const requiredSignals = Array.from(new Set([
    brief.productType.replace(/_/g, " "),
    brief.primaryEntity,
    ...brief.coreActions.map((action) => action.split(/\s+/).slice(-2).join(" "))
  ])).filter(Boolean);
  const prohibitedSignals = brief.nonGoals.filter((nonGoal) => {
    const phrase = nonGoal.toLowerCase().replace(/\bunrequested\b|\bunless requested\b|\badmin\b/g, "").trim();
    if (!phrase || phrase.length < 3) return false;
    return runtimeContent.includes(phrase);
  });
  const presentRequired = requiredSignals.filter((signal) => {
    const words = signal.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    return words.some((word) => content.includes(word));
  });
  const failures = [
    files.length === 0 ? "No source files were generated." : null,
    presentRequired.length < Math.min(2, requiredSignals.length)
      ? `Generated source does not preserve enough product signals for ${brief.productType}.`
      : null,
    prohibitedSignals.length
      ? `Generated source includes non-goal domains: ${prohibitedSignals.join(", ")}.`
      : null,
    ...brief.explicitConstraints
      .filter((constraint) => runtimeContent.includes(constraint.toLowerCase()))
      .map((constraint) => `Generated source violates explicit negative constraint: ${constraint}.`)
  ].filter(Boolean) as string[];

  return {
    failures,
    passed: failures.length === 0,
    prohibitedSignals,
    requiredSignals
  };
}

export type ReactProductPreviewMetadata = {
  appName: string;
  copyLines: string[];
  disclaimer: string;
  domain: string;
  excitementGate: string;
  jobToBeDone: string;
  metrics: string[];
  productPreviewQuality: {
    distinctLayoutKinds: number;
    hasAppName: boolean;
    hasDomainSections: boolean;
    hasLocalOnlyLimitations: boolean;
    hasMetrics: boolean;
    hasSampleRecords: boolean;
    hasStaticSnapshot: boolean;
    maxLayoutKindShare: number;
    screenGateFailures: string[];
    screenGateWarnings: string[];
    screenLayoutGatePassed: boolean;
    totalScreens: number;
  };
  sampleRecords: Array<{
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  }>;
  sections: string[];
  screenQualityGate: {
    distinctLayoutKinds: number;
    failures: string[];
    maxLayoutKindShare: number;
    passed: boolean;
    totalScreens: number;
    warnings: string[];
  };
  screens: Array<{
    label: string;
    layoutKind: string;
    purpose: string;
    screenId: string;
  }>;
  targetUser: string;
  workflowMap: string[];
};

function focusedTodoApp(appName: string) {
  return `import { useEffect, useMemo, useState } from "react";

type Task = { id: string; title: string; completed: boolean };
type Filter = "all" | "active" | "completed";

const starterTasks: Task[] = [
  { id: "welcome", title: "Add your first task", completed: false },
  { id: "done", title: "Mark a task complete", completed: true }
];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("hassali-todo-tasks");
    return saved ? JSON.parse(saved) as Task[] : starterTasks;
  });
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    localStorage.setItem("hassali-todo-tasks", JSON.stringify(tasks));
  }, [tasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) =>
    filter === "all" || (filter === "completed" ? task.completed : !task.completed)
  ), [filter, tasks]);

  function addTask(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setTasks((current) => [{ id: crypto.randomUUID(), title: nextTitle, completed: false }, ...current]);
    setTitle("");
  }

  return (
    <main className="app-shell">
      <section className="task-panel" aria-labelledby="app-title">
        <header>
          <p className="eyebrow">Focused task list</p>
          <h1 id="app-title">${escapeHtml(appName)}</h1>
          <p>Capture what matters, finish it, and clear the list.</p>
        </header>

        <form className="entry-form" onSubmit={addTask}>
          <label htmlFor="task-title">New task</label>
          <div>
            <input
              id="task-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs doing?"
              value={title}
            />
            <button type="submit">Add task</button>
          </div>
        </form>

        <div className="filter-row" aria-label="Filter tasks">
          {(["all", "active", "completed"] as Filter[]).map((value) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>

        <ul className="task-list">
          {visibleTasks.map((task) => (
            <li className={task.completed ? "completed" : ""} key={task.id}>
              <label>
                <input
                  checked={task.completed}
                  onChange={() => setTasks((current) => current.map((item) =>
                    item.id === task.id ? { ...item, completed: !item.completed } : item
                  ))}
                  type="checkbox"
                />
                <span>{task.title}</span>
              </label>
              <button
                aria-label={\`Delete \${task.title}\`}
                className="icon-button"
                onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}
                type="button"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {!visibleTasks.length ? <p className="empty-state">No {filter === "all" ? "" : \`\${filter} \`}tasks.</p> : null}
      </section>
    </main>
  );
}
`;
}

function focusedCalculatorApp(appName: string) {
  return `import { useState } from "react";

const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"];

export default function App() {
  const [display, setDisplay] = useState("0");
  const [left, setLeft] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [replace, setReplace] = useState(true);

  function press(key: string) {
    if (/^\\d|\\.$/.test(key)) {
      setDisplay((current) => replace ? key : current === "0" ? key : current + key);
      setReplace(false);
      return;
    }
    if (key === "=") {
      if (left === null || !operator) return;
      const right = Number(display);
      const result = operator === "+" ? left + right : operator === "−" ? left - right : operator === "×" ? left * right : right === 0 ? NaN : left / right;
      setDisplay(Number.isFinite(result) ? String(result) : "Error");
      setLeft(null);
      setOperator(null);
      setReplace(true);
      return;
    }
    setLeft(Number(display));
    setOperator(key);
    setReplace(true);
  }

  return (
    <main className="app-shell">
      <section className="calculator" aria-labelledby="app-title">
        <p className="eyebrow">Basic calculator</p>
        <h1 id="app-title">${escapeHtml(appName)}</h1>
        <output aria-live="polite">{display}</output>
        <div className="keypad">
          <button className="clear" onClick={() => { setDisplay("0"); setLeft(null); setOperator(null); setReplace(true); }} type="button">Clear</button>
          {keys.map((key) => <button key={key} onClick={() => press(key)} type="button">{key}</button>)}
        </div>
      </section>
    </main>
  );
}
`;
}

function focusedScientificCalculatorApp(appName: string) {
  return `import { useState } from "react";

type HistoryItem = { id: string; expression: string; result: number };

const scientificOperations = [
  { label: "sin", run: (value: number) => Math.sin(value) },
  { label: "cos", run: (value: number) => Math.cos(value) },
  { label: "tan", run: (value: number) => Math.tan(value) },
  { label: "sqrt", run: (value: number) => Math.sqrt(value) },
  { label: "log10", run: (value: number) => Math.log10(value) }
];

export default function App() {
  const [value, setValue] = useState("0");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  function calculate(label: string, run: (input: number) => number) {
    const input = Number(value);
    const result = run(input);
    if (!Number.isFinite(result)) return;
    setValue(String(Number(result.toFixed(8))));
    setHistory((current) => [
      { id: crypto.randomUUID(), expression: \`\${label}(\${input})\`, result },
      ...current
    ].slice(0, 12));
  }

  return (
    <main className="app-shell">
      <section className="calculator" aria-labelledby="app-title">
        <header>
          <p className="eyebrow">Scientific calculator</p>
          <h1 id="app-title">${escapeHtml(appName)}</h1>
          <p>Run arithmetic and common trigonometric operations with visible calculation history.</p>
        </header>
        <label htmlFor="calculator-value">Value in radians</label>
        <input
          id="calculator-value"
          onChange={(event) => setValue(event.target.value)}
          type="number"
          value={value}
        />
        <output>{value}</output>
        <div className="keypad scientific-keypad">
          {scientificOperations.map((operation) => (
            <button key={operation.label} onClick={() => calculate(operation.label, operation.run)} type="button">
              {operation.label}
            </button>
          ))}
          <button className="clear" onClick={() => { setValue("0"); setHistory([]); }} type="button">Clear</button>
        </div>
        <h2>Calculation history</h2>
        <ol className="history-list">
          {history.map((item) => <li key={item.id}>{item.expression} = {Number(item.result.toFixed(8))}</li>)}
        </ol>
      </section>
    </main>
  );
}
`;
}

function focusedPomodoroApp(appName: string) {
  return `import { useEffect, useState } from "react";

const SESSION_SECONDS = 25 * 60;

export default function App() {
  const [remaining, setRemaining] = useState(SESSION_SECONDS);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining, running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <main className="app-shell">
      <section className="timer-panel" aria-labelledby="app-title">
        <p className="eyebrow">Focus session</p>
        <h1 id="app-title">${escapeHtml(appName)}</h1>
        <output aria-live="polite">{minutes}:{seconds}</output>
        <div className="action-row">
          <button onClick={() => setRunning((value) => !value)} type="button">{running ? "Pause" : "Start"}</button>
          <button className="secondary" onClick={() => { setRunning(false); setRemaining(SESSION_SECONDS); }} type="button">Reset</button>
        </div>
      </section>
    </main>
  );
}
`;
}

function focusedExpenseApp(appName: string) {
  return `import { useMemo, useState } from "react";

type Expense = { id: string; description: string; amount: number; category: string };

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("General");
  const total = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount, 0), [expenses]);

  function addExpense(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) return;
    setExpenses((current) => [{ id: crypto.randomUUID(), description: description.trim(), amount: value, category }, ...current]);
    setDescription("");
    setAmount("");
  }

  return (
    <main className="app-shell">
      <section className="task-panel" aria-labelledby="app-title">
        <header><p className="eyebrow">Personal spending</p><h1 id="app-title">${escapeHtml(appName)}</h1><strong className="total">Total: \${total.toFixed(2)}</strong></header>
        <form className="expense-form" onSubmit={addExpense}>
          <input aria-label="Description" onChange={(event) => setDescription(event.target.value)} placeholder="Expense description" value={description} />
          <input aria-label="Amount" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="Amount" step="0.01" type="number" value={amount} />
          <select aria-label="Category" onChange={(event) => setCategory(event.target.value)} value={category}>
            <option>General</option><option>Food</option><option>Transport</option><option>Home</option>
          </select>
          <button type="submit">Add expense</button>
        </form>
        <ul className="task-list">
          {expenses.map((expense) => <li key={expense.id}><span><strong>{expense.description}</strong><small>{expense.category}</small></span><span>\${expense.amount.toFixed(2)} <button className="icon-button" onClick={() => setExpenses((current) => current.filter((item) => item.id !== expense.id))} type="button">×</button></span></li>)}
        </ul>
        {!expenses.length ? <p className="empty-state">No expenses recorded yet.</p> : null}
      </section>
    </main>
  );
}
`;
}

function focusedRestaurantApp(appName: string) {
  return `import { useMemo, useState } from "react";

const menu = [
  { id: "bowl", name: "Garden Bowl", price: 12 },
  { id: "sandwich", name: "Grilled Sandwich", price: 10 },
  { id: "tea", name: "House Iced Tea", price: 4 }
];

export default function App() {
  const [order, setOrder] = useState<Record<string, number>>({});
  const total = useMemo(() => menu.reduce((sum, item) => sum + item.price * (order[item.id] ?? 0), 0), [order]);
  const change = (id: string, delta: number) => setOrder((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + delta) }));

  return (
    <main className="app-shell">
      <section className="task-panel" aria-labelledby="app-title">
        <header><p className="eyebrow">Current menu</p><h1 id="app-title">${escapeHtml(appName)}</h1><p>Choose items and review the order before checkout.</p></header>
        <div className="menu-grid">
          {menu.map((item) => <article key={item.id}><h2>{item.name}</h2><p>\${item.price.toFixed(2)}</p><div className="action-row"><button className="secondary" onClick={() => change(item.id, -1)} type="button">−</button><strong>{order[item.id] ?? 0}</strong><button onClick={() => change(item.id, 1)} type="button">Add</button></div></article>)}
        </div>
        <footer className="order-total"><span>Order total</span><strong>\${total.toFixed(2)}</strong></footer>
      </section>
    </main>
  );
}
`;
}

function focusedBriefDrivenApp(appName: string, brief: CodeProductBrief) {
  const screens = JSON.stringify(brief.expectedScreens);
  const actions = JSON.stringify(brief.coreActions);
  const features = JSON.stringify(brief.requiredFeatures);
  const productLabel = escapeHtml(brief.productType.replace(/_/g, " "));
  const goal = escapeHtml(brief.userGoal);
  const entity = escapeHtml(brief.primaryEntity);

  return `import { FormEvent, useEffect, useState } from "react";

type RecordItem = { id: string; title: string; owner: string; status: string };

const screens = ${screens};
const actions = ${actions};
const features = ${features};

export default function App() {
  const [activeScreen, setActiveScreen] = useState(screens[0] ?? "${productLabel}");
  const [title, setTitle] = useState("");
  const [records, setRecords] = useState<RecordItem[]>(() => {
    const saved = localStorage.getItem("hassali-${slug(appName)}-records");
    return saved ? JSON.parse(saved) as RecordItem[] : [];
  });

  useEffect(() => {
    localStorage.setItem("hassali-${slug(appName)}-records", JSON.stringify(records));
  }, [records]);

  function addRecord(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setRecords((current) => [
      { id: crypto.randomUUID(), title: nextTitle, owner: "Unassigned", status: "new" },
      ...current
    ]);
    setTitle("");
  }

  return (
    <main className="app-shell">
      <section className="task-panel product-panel" aria-labelledby="app-title">
        <header>
          <p className="eyebrow">${productLabel}</p>
          <h1 id="app-title">${escapeHtml(appName)}</h1>
          <p>${goal}</p>
        </header>
        <nav className="filter-row" aria-label="Product screens">
          {screens.map((screen) => (
            <button
              aria-pressed={activeScreen === screen}
              className={activeScreen === screen ? "active" : ""}
              key={screen}
              onClick={() => setActiveScreen(screen)}
              type="button"
            >
              {screen}
            </button>
          ))}
        </nav>
        <section aria-labelledby="active-screen-title">
          <h2 id="active-screen-title">{activeScreen}</h2>
          <ul className="feature-grid">
            {features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>
          <form className="entry-form" onSubmit={addRecord}>
            <label htmlFor="record-title">New ${entity}</label>
            <div>
              <input id="record-title" onChange={(event) => setTitle(event.target.value)} value={title} />
              <button type="submit">Add ${entity}</button>
            </div>
          </form>
          <ul className="task-list">
            {records.map((record) => (
              <li key={record.id}>
                <span><strong>{record.title}</strong><small>{record.owner} · {record.status}</small></span>
                <button
                  className="icon-button"
                  onClick={() => setRecords((current) => current.filter((item) => item.id !== record.id))}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {!records.length ? <p className="empty-state">No ${entity} records yet.</p> : null}
        </section>
        <aside className="workflow-summary">
          <h2>Core actions</h2>
          <ul>{actions.map((action) => <li key={action}>{action}</li>)}</ul>
        </aside>
      </section>
    </main>
  );
}
`;
}

function focusedAppContent(appName: string, brief: CodeProductBrief) {
  if (brief.productType === "todo_app") return focusedTodoApp(appName);
  if (brief.productType === "calculator") return focusedCalculatorApp(appName);
  if (brief.productType === "scientific_calculator") return focusedScientificCalculatorApp(appName);
  if (brief.productType === "pomodoro_timer") return focusedPomodoroApp(appName);
  if (brief.productType === "expense_tracker") return focusedExpenseApp(appName);
  if (brief.productType === "restaurant_ordering") return focusedRestaurantApp(appName);
  return focusedBriefDrivenApp(appName, brief);
}

function focusedStyles() {
  return `:root {
  color: #171717;
  background: #f4f3ee;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button, input, select { font: inherit; }
button { border: 0; background: #de7356; color: #fff; padding: 0.7rem 1rem; cursor: pointer; }
button:hover { background: #bd5940; }
button.secondary, .filter-row button { background: #ece9e2; color: #27231f; }
.app-shell { min-height: 100vh; display: grid; place-items: start center; padding: clamp(1rem, 5vw, 4rem); }
.task-panel, .calculator, .timer-panel { width: min(100%, 680px); background: #fff; border: 1px solid #dedbd3; padding: clamp(1.25rem, 4vw, 2.5rem); }
.eyebrow { color: #a44732; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; }
h1 { margin: 0.25rem 0 0.6rem; font-size: clamp(1.8rem, 5vw, 3rem); }
.entry-form label { display: block; margin: 1.5rem 0 0.5rem; font-weight: 700; }
.entry-form > div, .action-row { display: flex; gap: 0.5rem; }
input, select { min-width: 0; border: 1px solid #cfcac0; padding: 0.75rem; background: #fff; }
.entry-form input { flex: 1; }
.filter-row { display: flex; gap: 0.4rem; margin: 1.25rem 0; }
.filter-row button.active { background: #27231f; color: #fff; }
.task-list { list-style: none; margin: 0; padding: 0; }
.task-list li { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-top: 1px solid #ece9e2; }
.task-list label { display: flex; align-items: center; gap: 0.7rem; }
.task-list li.completed span { color: #77716a; text-decoration: line-through; }
.task-list small { display: block; color: #77716a; }
.icon-button { width: 34px; height: 34px; padding: 0; background: transparent; color: #8b3c2a; font-size: 1.25rem; }
.empty-state { color: #77716a; padding: 1.5rem 0; text-align: center; }
.calculator, .timer-panel { max-width: 360px; }
.calculator output, .timer-panel output { display: block; margin: 1.5rem 0; font-size: 3rem; font-variant-numeric: tabular-nums; text-align: right; }
.keypad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.keypad .clear { grid-column: 1 / -1; background: #27231f; }
.expense-form { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 0.5rem; margin: 1.5rem 0; }
.total { display: block; margin-top: 1rem; font-size: 1.4rem; }
.menu-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin: 1.5rem 0; }
.menu-grid article { border: 1px solid #dedbd3; padding: 1rem; }
.order-total { display: flex; justify-content: space-between; border-top: 2px solid #27231f; padding-top: 1rem; font-size: 1.25rem; }
.scientific-keypad { margin: 1rem 0; }
.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; padding-left: 1.25rem; }
.workflow-summary { margin-top: 1.5rem; border-top: 1px solid #dedbd3; padding-top: 1rem; }
.history-list { max-height: 220px; overflow: auto; padding-left: 1.5rem; }
@media (max-width: 620px) {
  .expense-form, .feature-grid, .menu-grid { grid-template-columns: 1fr; }
}
`;
}

function generateFocusedReactSource(input: {
  appName: string;
  brief: CodeProductBrief;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName && !/^software app$/i.test(input.appName)
    ? input.appName
    : titleCase(input.brief.productType);
  const contract = `# ${appName}

mode: CODE
appName: ${appName}
appType: ${input.brief.productType}
framework: react_vite
previewType: code_app_preview
entryPoint: src/main.tsx
primaryEntity: ${input.brief.primaryEntity}

## User goal
${input.brief.userGoal}

## Core actions
${input.brief.coreActions.map((action) => `- ${action}`).join("\n")}

## Non-goals
${input.brief.nonGoals.map((item) => `- ${item}`).join("\n")}

Runtime and package installation remain approval-gated.
`;

  return [
    {
      path: "package.json",
      summary: `Adds deterministic Vite React metadata for the focused ${input.brief.productType.replace(/_/g, " ")}.`,
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
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.3",
    "typescript": "5.6.3",
    "vite": "5.4.10"
  }
}
`
    },
    {
      path: "vite.config.ts",
      summary: "Adds the Vite React configuration.",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`
    },
    {
      path: "index.html",
      summary: "Adds the Vite app entry shell.",
      content: `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(appName)}</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
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

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
`
    },
    {
      path: "src/App.tsx",
      summary: `Implements the requested ${input.brief.productType.replace(/_/g, " ")} interactions without unrelated business modules.`,
      content: focusedAppContent(appName, input.brief)
    },
    {
      path: "src/styles.css",
      summary: "Adds focused responsive app styling.",
      content: focusedStyles()
    },
    {
      path: "HASSALI.md",
      summary: "Records the request-grounded CODE product contract.",
      content: contract
    }
  ];
}

export function generateCrmViteSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  if (
    input.brief?.productBrief &&
    !["crm", "finance_dashboard", "inventory_system"].includes(input.brief.productBrief.productType) &&
    input.brief.productBrief.productType !== "custom_app"
  ) {
    return generateFocusedReactSource({
      appName: input.appName,
      brief: input.brief.productBrief,
      prompt: input.prompt
    });
  }

  const blueprint = buildReactProductBlueprint({
    appName: input.appName,
    brief: input.brief,
    prompt: input.prompt
  });
  const appName = blueprint.appName;

  return [
    {
      path: "package.json",
      summary: `Adds Vite React package metadata for ${appName}. No install is executed.`,
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
      summary: `Adds the ${appName} product-like React app with tabs, forms, local state, metrics, and workflow views.`,
      content: createReactMiniProductApp(blueprint)
    },
    {
      path: "src/lib/mock-data.ts",
      summary: `Adds Product Intelligence Blueprint sample data for ${appName}.`,
      content: createReactMiniProductMockData(blueprint)
    },
    {
      path: "src/styles.css",
      summary: `Adds the ${appName} responsive visual system and product UI styling.`,
      content: createReactMiniProductStyles(blueprint)
    },
    {
      path: "README.md",
      summary: `Adds run instructions and honest local-only notes for ${appName}.`,
      content: createReactMiniProductReadme(blueprint, input.prompt)
    },
    {
      path: "ARCHITECTURE.md",
      summary: `Documents the Product Intelligence Blueprint and architecture boundaries for ${appName}.`,
      content: createReactMiniProductArchitecture(blueprint, input.prompt)
    },
    {
      path: "DATA_MODEL.md",
      summary: `Documents ${appName} records, state model, and local-only data policy.`,
      content: createReactMiniProductDataModel(blueprint)
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: `Adds safety, testing, and no-secrets guidance for ${appName}.`,
      content: createReactMiniProductSecurity(blueprint)
    },
    {
      path: "HASSALI.md",
      summary: `Adds the CODE contract for the ${appName} React mini-product.`,
      content: createReactMiniProductContract(blueprint)
    }
  ];
}

export function createReactProductPreviewMetadata(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): ReactProductPreviewMetadata {
  if (input.brief?.productBrief.complexity === "simple") {
    const product = input.brief.productBrief;
    const sections = product.expectedScreens.length ? product.expectedScreens : [product.productType];
    return {
      appName: input.appName,
      copyLines: [product.userGoal],
      disclaimer: "Local browser demo only. No backend, account, cloud sync, or external service is included.",
      domain: product.productType.replace(/_/g, " "),
      excitementGate: `The first view makes ${product.primaryEntity} work immediately understandable.`,
      jobToBeDone: product.userGoal,
      metrics: product.coreActions.slice(0, 4),
      productPreviewQuality: {
        distinctLayoutKinds: 1,
        hasAppName: true,
        hasDomainSections: true,
        hasLocalOnlyLimitations: true,
        hasMetrics: true,
        hasSampleRecords: true,
        hasStaticSnapshot: true,
        maxLayoutKindShare: 1,
        screenGateFailures: [],
        screenGateWarnings: [],
        screenLayoutGatePassed: true,
        totalScreens: sections.length
      },
      sampleRecords: [{
        amount: 0,
        category: product.productType.replace(/_/g, " "),
        note: product.coreActions.join(", "),
        owner: "Local user",
        status: "ready",
        title: product.primaryEntity
      }],
      sections,
      screenQualityGate: {
        distinctLayoutKinds: 1,
        failures: [],
        maxLayoutKindShare: 1,
        passed: true,
        totalScreens: sections.length,
        warnings: []
      },
      screens: sections.map((label) => ({
        label: titleCase(label),
        layoutKind: "form_and_queue",
        purpose: product.userGoal,
        screenId: slug(label)
      })),
      targetUser: "A user completing the requested focused workflow",
      workflowMap: product.coreActions
    };
  }

  const blueprint = buildReactProductBlueprint(input);

  return {
    appName: blueprint.appName,
    copyLines: blueprint.copyLines,
    disclaimer: blueprint.disclaimer,
    domain: blueprint.domain,
    excitementGate: blueprint.excitementGate,
    jobToBeDone: blueprint.jobToBeDone,
    metrics: blueprint.metricLabels,
    productPreviewQuality: {
      distinctLayoutKinds: blueprint.screenQualityGate.distinctLayoutKinds,
      hasAppName: Boolean(blueprint.appName),
      hasDomainSections: blueprint.sections.length >= 4,
      hasLocalOnlyLimitations: /local|mock|no backend|no provider|not tax advice/i.test(blueprint.disclaimer),
      hasMetrics: blueprint.metricLabels.length >= 4,
      hasSampleRecords: blueprint.records.length >= 3,
      hasStaticSnapshot: true,
      maxLayoutKindShare: blueprint.screenQualityGate.maxLayoutKindShare,
      screenGateFailures: blueprint.screenQualityGate.failures,
      screenGateWarnings: blueprint.screenQualityGate.warnings,
      screenLayoutGatePassed: blueprint.screenQualityGate.passed,
      totalScreens: blueprint.screenQualityGate.totalScreens
    },
    sampleRecords: blueprint.records.slice(0, 4),
    sections: blueprint.sections,
    screenQualityGate: {
      distinctLayoutKinds: blueprint.screenQualityGate.distinctLayoutKinds,
      failures: blueprint.screenQualityGate.failures,
      maxLayoutKindShare: blueprint.screenQualityGate.maxLayoutKindShare,
      passed: blueprint.screenQualityGate.passed,
      totalScreens: blueprint.screenQualityGate.totalScreens,
      warnings: blueprint.screenQualityGate.warnings
    },
    screens: blueprint.screens.map((screen) => ({
      label: screen.label,
      layoutKind: screen.layoutKind,
      purpose: screen.purpose,
      screenId: screen.screenId
    })),
    targetUser: blueprint.targetUser,
    workflowMap: blueprint.workflowMap
  };
}

type ReactProductBlueprint = {
  appName: string;
  copyLines: string[];
  disclaimer: string;
  domain: string;
  excitementGate: string;
  jobToBeDone: string;
  localStorageKey: string;
  metricLabels: [string, string, string, string];
  palette: {
    accent: string;
    accent2: string;
    canvas: string;
    ink: string;
    muted: string;
    soft: string;
    surface: string;
  };
  primaryActionLabel: string;
  recordLabel: string;
  records: Array<{
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  }>;
  sections: string[];
  screenQualityGate: ReactScreenQualityGate;
  screens: ReactProductScreen[];
  statusOptions: string[];
  targetUser: string;
  tone: string;
  type: "afforfix" | "crm" | "finance_dashboard" | "generic" | "inventory_system" | "safe_client_check" | "tax_dedo";
  workflowMap: string[];
};

type ReactScreenLayoutKind =
  | "calendar_or_schedule"
  | "dashboard_overview"
  | "form_and_queue"
  | "kanban_status_board"
  | "package_or_pricing_cards"
  | "payments_revenue"
  | "people_roster"
  | "quality_issues"
  | "records_table"
  | "settings_or_docs_summary";

type ReactProductScreen = {
  actions: string[];
  domainVocabulary: string[];
  emptyState: string;
  fields: string[];
  label: string;
  layoutKind: ReactScreenLayoutKind;
  metrics: string[];
  primaryEntity: string;
  purpose: string;
  sampleRecords: ReactProductBlueprint["records"];
  screenId: string;
  statusOptions: string[];
};

type ReactScreenQualityGate = {
  distinctLayoutKinds: number;
  failures: string[];
  maxLayoutKindShare: number;
  passed: boolean;
  thresholds: {
    distinctLayoutKindsMinimumWhenFourScreens: number;
    maxSingleLayoutKindShareWhenFourScreens: number;
  };
  totalScreens: number;
  warnings: string[];
};

type ReactProductBlueprintDraft = Omit<ReactProductBlueprint, "screenQualityGate">;

function finalizeBlueprint(blueprint: ReactProductBlueprintDraft, prompt: string): ReactProductBlueprint {
  return {
    ...blueprint,
    screenQualityGate: buildScreenQualityGate(blueprint.screens, prompt)
  };
}

function screen(input: Omit<ReactProductScreen, "screenId">): ReactProductScreen {
  return {
    ...input,
    screenId: slug(input.label)
  };
}

function buildScreenQualityGate(screens: ReactProductScreen[], prompt: string): ReactScreenQualityGate {
  const totalScreens = screens.length;
  const layoutCounts = screens.reduce<Record<string, number>>((counts, item) => {
    counts[item.layoutKind] = (counts[item.layoutKind] ?? 0) + 1;
    return counts;
  }, {});
  const distinctLayoutKinds = Object.keys(layoutCounts).length;
  const maxLayoutKindShare = totalScreens
    ? Math.max(...Object.values(layoutCounts)) / totalScreens
    : 0;
  const failures: string[] = [];
  const warnings: string[] = [];

  if (totalScreens >= 4 && distinctLayoutKinds < 3) {
    failures.push(`screen layout variety failed: N=${totalScreens}, D=${distinctLayoutKinds}; D must be >= 3 when N >= 4.`);
  }

  if (totalScreens >= 4 && maxLayoutKindShare > 0.6) {
    failures.push(`screen layout dominance failed: max layout share ${maxLayoutKindShare.toFixed(2)} exceeds 0.60 when N >= 4.`);
  }

  screens.forEach((item) => {
    const label = item.label.toLowerCase();
    const expected =
      /dashboard|overview|summary/.test(label) ? "dashboard_overview" :
      /status board|pipeline|board|filing status/.test(label) ? "kanban_status_board" :
      /payment|invoice|income|revenue|remittance|billing/.test(label) ? "payments_revenue" :
      /package|pricing|service categor/.test(label) ? "package_or_pricing_cards" :
      /client|cleaner|people|customer/.test(label) ? "people_roster" :
      /review|quality|issue|risk/.test(label) ? "quality_issues" :
      /deadline|schedule|calendar/.test(label) ? "calendar_or_schedule" :
      null;

    if (expected && item.layoutKind !== expected) {
      warnings.push(`semantic layout mismatch: ${item.label} uses ${item.layoutKind}; expected ${expected}.`);
    }
  });

  const promptFeatures = [
    "bookings",
    "cleaners",
    "customer requests",
    "job status",
    "service categories",
    "filters",
    "demo records",
    "client records",
    "invoice",
    "tax status",
    "income summary",
    "due payments"
  ].filter((feature) => prompt.toLowerCase().includes(feature));
  const screenText = screens.map((item) => [
    item.label,
    item.purpose,
    item.primaryEntity,
    ...item.actions,
    ...item.domainVocabulary
  ].join(" ")).join(" ").toLowerCase();

  promptFeatures.forEach((feature) => {
    const normalized = feature.replace(/\s+/g, " ");
    if (!screenText.includes(normalized) && !(feature === "filters" && screenText.includes("filter"))) {
      warnings.push(`requested feature may be underrepresented in screens: ${feature}.`);
    }
  });

  return {
    distinctLayoutKinds,
    failures,
    maxLayoutKindShare: Number(maxLayoutKindShare.toFixed(2)),
    passed: failures.length === 0,
    thresholds: {
      distinctLayoutKindsMinimumWhenFourScreens: 3,
      maxSingleLayoutKindShareWhenFourScreens: 0.6
    },
    totalScreens,
    warnings
  };
}

function afforfixScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review today's jobs", "Filter urgent bookings", "Open dispatch notes", "Reset demo records"],
      domainVocabulary: ["cleaning service", "today's jobs", "booking", "quality", "demo records"],
      emptyState: "No jobs match this operational filter.",
      fields: ["job title", "client", "service tier", "status", "cleaner note"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Today's jobs", "Revenue estimate", "Cleaner workload", "Quality issues"],
      primaryEntity: "operations snapshot",
      purpose: "Show the dispatcher the daily cleaning operation at a glance.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add booking", "Assign cleaner", "Filter by status", "Review customer requests"],
      domainVocabulary: ["booking", "client request", "customer requests", "home cleaning", "office cleaning"],
      emptyState: "No bookings match this status.",
      fields: ["booking", "client", "address", "service", "status"],
      label: "Bookings",
      layoutKind: "records_table",
      metrics: ["Bookings", "Confirmed", "Pending", "Cancelled"],
      primaryEntity: "booking",
      purpose: "Track cleaning requests with practical dispatch details.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review client notes", "Check repeat customers", "Flag special instructions"],
      domainVocabulary: ["clients", "homeowners", "customer notes"],
      emptyState: "No clients found for this filter.",
      fields: ["client", "location", "notes", "last service"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["Clients", "Repeat clients", "Notes", "Follow-ups"],
      primaryEntity: "client",
      purpose: "Keep client preferences and notes visible for service quality.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Assign cleaner", "Review workload", "Check availability"],
      domainVocabulary: ["cleaners", "workload", "availability", "ratings"],
      emptyState: "No cleaners match this availability filter.",
      fields: ["cleaner", "workload", "rating", "availability"],
      label: "Cleaners",
      layoutKind: "people_roster",
      metrics: ["Available cleaners", "Busy cleaners", "Average rating", "Open slots"],
      primaryEntity: "cleaner",
      purpose: "Balance cleaner assignments without overloading one person.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Compare packages", "Review inclusions", "Prepare quote"],
      domainVocabulary: ["Basic", "Deep Clean", "Move-in Clean", "service categories"],
      emptyState: "No service packages configured yet.",
      fields: ["package", "duration", "price", "included tasks"],
      label: "Service Packages",
      layoutKind: "package_or_pricing_cards",
      metrics: ["Packages", "Popular tier", "Starting price", "Average duration"],
      primaryEntity: "service package",
      purpose: "Present service tiers as clear marketplace-ready packages.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move booking status", "Spot blocked jobs", "Review completed work"],
      domainVocabulary: ["job status", "pending", "confirmed", "completed", "cancelled"],
      emptyState: "No jobs in this board column.",
      fields: ["job", "status", "cleaner", "client"],
      label: "Job Status Board",
      layoutKind: "kanban_status_board",
      metrics: ["Pending", "Confirmed", "In progress", "Completed"],
      primaryEntity: "job",
      purpose: "Make job movement visible as a status board.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Track unpaid bookings", "Mark paid", "Review revenue estimate"],
      domainVocabulary: ["payments", "paid", "unpaid", "revenue estimate"],
      emptyState: "No payment records match this filter.",
      fields: ["booking", "amount", "payment status", "client"],
      label: "Payments",
      layoutKind: "payments_revenue",
      metrics: ["Revenue estimate", "Paid", "Unpaid", "Refunded"],
      primaryEntity: "payment",
      purpose: "Separate operational completion from payment state.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Log quality issue", "Review ratings", "Queue second pass"],
      domainVocabulary: ["reviews", "quality issues", "second pass", "cleaning checklist"],
      emptyState: "No quality issues are open.",
      fields: ["issue", "client", "severity", "resolution"],
      label: "Reviews / Quality Issues",
      layoutKind: "quality_issues",
      metrics: ["Reviews", "Open issues", "Resolved", "Second-pass jobs"],
      primaryEntity: "quality issue",
      purpose: "Track customer feedback and cleaning quality follow-up.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function taxDedoScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review income", "Check filing readiness", "Open due reminders"],
      domainVocabulary: ["tax filing", "income summary", "Pakistan freelancers", "not tax advice"],
      emptyState: "No finance records are visible yet.",
      fields: ["income", "pending", "client", "deadline"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Monthly income", "Pending amount", "Top client", "Overdue reminders"],
      primaryEntity: "finance snapshot",
      purpose: "Show income, overdue money, and filing readiness in the first view.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add client", "Review risk notes", "Filter active clients"],
      domainVocabulary: ["client records", "freelancer clients", "client ghosting risk"],
      emptyState: "No client records match this filter.",
      fields: ["client", "country", "risk", "last payment"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["Clients", "Risk notes", "Active retainers", "Follow-ups"],
      primaryEntity: "client",
      purpose: "Track freelancer clients and payment reliability.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add invoice", "Mark paid", "Filter pending payments"],
      domainVocabulary: ["invoice", "payment status", "due payments", "receipts"],
      emptyState: "No invoices match this status.",
      fields: ["invoice", "client", "amount", "status"],
      label: "Invoices",
      layoutKind: "payments_revenue",
      metrics: ["Invoices", "Paid", "Pending", "Overdue"],
      primaryEntity: "invoice",
      purpose: "Keep invoice and payment status visible without a backend.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move filing status", "Review missing proof", "Flag review items"],
      domainVocabulary: ["tax status", "filing board", "proof saved", "readiness"],
      emptyState: "No filing items are on the board.",
      fields: ["filing task", "status", "proof", "notes"],
      label: "Tax Filing Status",
      layoutKind: "kanban_status_board",
      metrics: ["Ready", "Needs proof", "Review", "Filed locally"],
      primaryEntity: "filing task",
      purpose: "Represent tax-readiness as a board, not legal advice.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add expense", "Attach receipt note", "Flag formula-safe export"],
      domainVocabulary: ["deductions", "expenses", "receipt proof", "mock estimate"],
      emptyState: "No expense records match this filter.",
      fields: ["expense", "category", "amount", "receipt"],
      label: "Deductions / Expenses",
      layoutKind: "records_table",
      metrics: ["Expenses", "Proof saved", "Missing proof", "Mock deductible total"],
      primaryEntity: "expense",
      purpose: "Track expense proof for later human review.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add deadline", "Mark reminder", "Review overdue follow-up"],
      domainVocabulary: ["deadlines", "due payments", "reminders", "filing due"],
      emptyState: "No upcoming reminders in this view.",
      fields: ["deadline", "owner", "date", "status"],
      label: "Deadlines",
      layoutKind: "calendar_or_schedule",
      metrics: ["Upcoming", "Overdue", "Due this week", "Completed"],
      primaryEntity: "deadline",
      purpose: "Make payment and filing deadlines visible.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review local summary", "Check disclaimer", "Prepare accountant notes"],
      domainVocabulary: ["reports", "tax readiness", "local summaries", "not tax advice"],
      emptyState: "No report summary is ready yet.",
      fields: ["summary", "period", "notes", "disclaimer"],
      label: "Reports",
      layoutKind: "settings_or_docs_summary",
      metrics: ["Reports", "Summaries", "Notes", "Disclaimers"],
      primaryEntity: "report",
      purpose: "Summarize local records for later professional review.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function inventoryScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review stock value", "Check low-stock alerts", "Open billing summary", "Reset demo records"],
      domainVocabulary: ["inventory system", "stock levels", "billing", "cash in", "cash out"],
      emptyState: "No inventory records visible yet.",
      fields: ["stock value", "low stock", "cash flow", "open invoices"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Stock value", "Low-stock alerts", "Cash in / cash out", "Open invoices"],
      primaryEntity: "inventory snapshot",
      purpose: "Show product movement, stock risk, billing, and cash flow at a glance.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add product", "Update SKU", "Filter category", "Review supplier note"],
      domainVocabulary: ["products", "SKU", "categories", "inventory records"],
      emptyState: "No products match this filter.",
      fields: ["product", "SKU", "category", "stock quantity"],
      label: "Products",
      layoutKind: "records_table",
      metrics: ["Products", "Categories", "Active SKUs", "Supplier-linked"],
      primaryEntity: "product",
      purpose: "Track product records with SKU, category, supplier, and quantity context.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Update quantity", "Review reorder point", "Mark stock counted"],
      domainVocabulary: ["stock levels", "quantity", "reorder point", "stock count"],
      emptyState: "No stock records match this filter.",
      fields: ["item", "quantity", "reorder point", "status"],
      label: "Stock Levels",
      layoutKind: "records_table",
      metrics: ["In stock", "Low stock", "Out of stock", "Reorder value"],
      primaryEntity: "stock item",
      purpose: "Keep stock quantities and reorder thresholds visible.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Flag reorder", "Review supplier", "Clear alert"],
      domainVocabulary: ["low stock alerts", "out of stock", "reorder", "supplier follow-up"],
      emptyState: "No low-stock alerts are open.",
      fields: ["alert", "product", "supplier", "priority"],
      label: "Low Stock Alerts",
      layoutKind: "quality_issues",
      metrics: ["Alerts", "Out of stock", "Reorder soon", "Supplier notes"],
      primaryEntity: "stock alert",
      purpose: "Turn inventory risk into a visible action queue.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Create invoice", "Mark paid", "Review due billing"],
      domainVocabulary: ["billing", "invoices", "invoice due", "paid"],
      emptyState: "No invoice records match this filter.",
      fields: ["invoice", "amount", "customer", "status"],
      label: "Billing / Invoices",
      layoutKind: "payments_revenue",
      metrics: ["Open invoices", "Paid invoices", "Invoice due", "Billing total"],
      primaryEntity: "invoice",
      purpose: "Connect stock movement to billing and invoice status.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Record cash in", "Record cash out", "Review cash movement"],
      domainVocabulary: ["cash in", "cash out", "cash flow", "margin"],
      emptyState: "No cash movement records match this filter.",
      fields: ["movement", "amount", "reason", "status"],
      label: "Cash In / Cash Out",
      layoutKind: "payments_revenue",
      metrics: ["Cash in", "Cash out", "Net movement", "Review items"],
      primaryEntity: "cash movement",
      purpose: "Track simple local cash movement without pretending to be accounting software.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review sales", "Compare products", "Open sales graph"],
      domainVocabulary: ["sales", "sold", "sales records", "graphs"],
      emptyState: "No sales records match this filter.",
      fields: ["sale", "product", "amount", "status"],
      label: "Sales",
      layoutKind: "kanban_status_board",
      metrics: ["Sales", "Sold items", "Top category", "Graph trend"],
      primaryEntity: "sale",
      purpose: "Show sales movement and product outcomes as a status workflow.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add purchase", "Review supplier bill", "Mark received"],
      domainVocabulary: ["purchases", "purchase records", "supplier", "received stock"],
      emptyState: "No purchase records match this filter.",
      fields: ["purchase", "supplier", "amount", "received"],
      label: "Purchases",
      layoutKind: "records_table",
      metrics: ["Purchases", "Received", "Pending", "Supplier spend"],
      primaryEntity: "purchase record",
      purpose: "Track incoming stock and supplier purchase records.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review graph bars", "Compare stock value", "Prepare local summary"],
      domainVocabulary: ["reports", "graphs", "stats", "stock value"],
      emptyState: "No report data is visible yet.",
      fields: ["report", "period", "metric", "note"],
      label: "Reports / Graphs",
      layoutKind: "settings_or_docs_summary",
      metrics: ["Reports", "Graphs", "Stats", "Local summaries"],
      primaryEntity: "report",
      purpose: "Summarize inventory stats and chart-like local bars.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review supplier", "Add supplier note", "Filter active suppliers"],
      domainVocabulary: ["suppliers", "vendors", "purchase records", "lead time"],
      emptyState: "No supplier records match this filter.",
      fields: ["supplier", "category", "lead time", "status"],
      label: "Suppliers",
      layoutKind: "people_roster",
      metrics: ["Suppliers", "Active", "Purchase due", "Lead time"],
      primaryEntity: "supplier",
      purpose: "Keep supplier context close to stock and purchase records.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function genericScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review overview", "Check metrics", "Open priority items"],
      domainVocabulary: ["dashboard", "records", "metrics"],
      emptyState: "No dashboard records yet.",
      fields: ["metric", "owner", "status"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Active records", "Open value", "Needs review", "Completed"],
      primaryEntity: "overview",
      purpose: "Show the app's main local operating picture.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add record", "Filter records", "Update status"],
      domainVocabulary: ["records", "table", "status"],
      emptyState: "No records match this filter.",
      fields: ["title", "owner", "amount", "status"],
      label: "Records",
      layoutKind: "records_table",
      metrics: ["Records", "Open", "Done", "Watch"],
      primaryEntity: "record",
      purpose: "Manage the core trackable records.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move status", "Review queue", "Spot blockers"],
      domainVocabulary: ["workflow", "board", "status"],
      emptyState: "No board items in this column.",
      fields: ["record", "status", "owner"],
      label: "Workflow Board",
      layoutKind: "kanban_status_board",
      metrics: ["Pending", "Active", "Watch", "Completed"],
      primaryEntity: "workflow item",
      purpose: "Show progress as a board instead of another list.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review contacts", "Add note", "Filter people"],
      domainVocabulary: ["clients", "owners", "contacts"],
      emptyState: "No people records visible.",
      fields: ["person", "role", "status", "note"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["People", "Follow-ups", "Active", "Review"],
      primaryEntity: "person",
      purpose: "Keep people and ownership clear.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review notes", "Document limitation", "Reset demo"],
      domainVocabulary: ["notes", "local demo", "limitations"],
      emptyState: "No documentation notes yet.",
      fields: ["note", "owner", "status"],
      label: "Settings",
      layoutKind: "settings_or_docs_summary",
      metrics: ["Notes", "Local data", "Safety", "Reset"],
      primaryEntity: "setting",
      purpose: "Explain local-only limits and demo controls.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function financeDashboardScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review monthly totals", "Check balance", "Open recent transactions"],
      domainVocabulary: ["income", "expenses", "monthly balance", "cash flow"],
      emptyState: "No finance activity is visible yet.",
      fields: ["monthly income", "monthly expenses", "balance", "needs review"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Monthly income", "Monthly expenses", "Current balance", "Needs review"],
      primaryEntity: "monthly finance snapshot",
      purpose: "Show income, expenses, and current monthly balance at a glance.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add income", "Filter paid entries", "Review income sources"],
      domainVocabulary: ["income", "source", "received", "pending"],
      emptyState: "No income entries match this filter.",
      fields: ["source", "amount", "date", "status"],
      label: "Income",
      layoutKind: "payments_revenue",
      metrics: ["Income total", "Received", "Pending", "Largest source"],
      primaryEntity: "income entry",
      purpose: "Track local income records and payment status.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add expense", "Filter categories", "Flag an expense"],
      domainVocabulary: ["expenses", "category", "paid", "review"],
      emptyState: "No expense entries match this filter.",
      fields: ["expense", "category", "amount", "date"],
      label: "Expenses",
      layoutKind: "records_table",
      metrics: ["Expense total", "Recurring", "One-time", "Needs review"],
      primaryEntity: "expense entry",
      purpose: "Keep outgoing money organized by category and status.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Compare totals", "Review trend", "Check ending balance"],
      domainVocabulary: ["monthly overview", "cash flow", "income versus expenses", "balance"],
      emptyState: "Add transactions to build a monthly overview.",
      fields: ["month", "income", "expenses", "balance"],
      label: "Monthly Overview",
      layoutKind: "payments_revenue",
      metrics: ["Income", "Expenses", "Balance", "Savings rate"],
      primaryEntity: "monthly summary",
      purpose: "Compare incoming and outgoing money without claiming bank sync.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review all transactions", "Filter status", "Reset demo data"],
      domainVocabulary: ["transactions", "local data", "status", "demo records"],
      emptyState: "No transactions are available yet.",
      fields: ["description", "type", "amount", "status"],
      label: "Transactions",
      layoutKind: "form_and_queue",
      metrics: ["Transactions", "Income entries", "Expense entries", "Flagged"],
      primaryEntity: "transaction",
      purpose: "Add and review local-only finance records in one queue.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function crmScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review pipeline", "Check follow-ups", "Open unpaid invoices"],
      domainVocabulary: ["contacts", "companies", "deals", "customer interactions"],
      emptyState: "No customer activity is visible yet.",
      fields: ["open deals", "pipeline value", "follow-ups", "unpaid invoices"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Contacts", "Open deals", "Pipeline value", "Invoices due"],
      primaryEntity: "customer relationship snapshot",
      purpose: "Show customer relationships, opportunities, and billing follow-ups at a glance.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add contact", "Record interaction", "Schedule follow-up"],
      domainVocabulary: ["contacts", "customer relationships", "interaction history"],
      emptyState: "No contacts match this filter.",
      fields: ["contact", "company", "email", "last interaction"],
      label: "Contacts",
      layoutKind: "people_roster",
      metrics: ["Contacts", "New leads", "Follow-ups", "Active customers"],
      primaryEntity: "contact",
      purpose: "Keep contact details and recent customer interactions together.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add company", "Assign account owner", "Review related contacts"],
      domainVocabulary: ["companies", "accounts", "account owners", "customer organizations"],
      emptyState: "No companies match this filter.",
      fields: ["company", "industry", "account owner", "relationship status"],
      label: "Companies",
      layoutKind: "records_table",
      metrics: ["Companies", "Active accounts", "Prospects", "Account owners"],
      primaryEntity: "company",
      purpose: "Organize customer companies and their relationship owners.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add deal", "Move deal stage", "Review expected value"],
      domainVocabulary: ["deals", "sales pipeline", "lead", "qualified", "proposal", "won"],
      emptyState: "No deals are in this pipeline stage.",
      fields: ["deal", "company", "stage", "value"],
      label: "Sales Pipeline",
      layoutKind: "kanban_status_board",
      metrics: ["Leads", "Qualified", "Proposals", "Won"],
      primaryEntity: "deal",
      purpose: "Move opportunities through clear sales stages.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Log interaction", "Add task", "Mark follow-up complete"],
      domainVocabulary: ["activities", "calls", "meetings", "notes", "tasks"],
      emptyState: "No customer activities are scheduled.",
      fields: ["activity", "contact", "date", "owner"],
      label: "Activities",
      layoutKind: "calendar_or_schedule",
      metrics: ["Calls", "Meetings", "Tasks", "Overdue follow-ups"],
      primaryEntity: "customer activity",
      purpose: "Track conversations, meetings, and client follow-up tasks.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Create client invoice", "Mark paid", "Review overdue billing"],
      domainVocabulary: ["client-linked invoices", "billing", "paid", "overdue"],
      emptyState: "No client invoices match this status.",
      fields: ["invoice", "client", "amount", "payment status"],
      label: "Billing",
      layoutKind: "payments_revenue",
      metrics: ["Invoices", "Paid", "Due", "Overdue"],
      primaryEntity: "client invoice",
      purpose: "Keep billing connected to the customer and related deal.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function buildReactProductBlueprint(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): ReactProductBlueprint {
  const prompt = input.prompt.toLowerCase();
  const productType = input.brief?.productBrief.productType;

  if (
    productType === "finance_dashboard" ||
    (/\b(?:finance|financial|money)\b/.test(prompt) && /\b(?:income|expense|balance|cash flow|transaction)\b/.test(prompt))
  ) {
    const records = [
      { amount: 4200, category: "Income", note: "August design retainer received.", owner: "Northstar Studio", status: "received", title: "Client retainer" },
      { amount: 680, category: "Expense", note: "Software subscriptions for this month.", owner: "Operations", status: "paid", title: "Tool subscriptions" },
      { amount: 1250, category: "Income", note: "Invoice due this week; kept as pending local demo data.", owner: "Harbor & Co.", status: "pending", title: "Consulting invoice" },
      { amount: 310, category: "Expense", note: "Internet and workspace costs marked for review.", owner: "Operations", status: "review", title: "Workspace costs" }
    ];
    const statusOptions = ["received", "pending", "paid", "review"];
    const requestedName = input.appName.trim();
    const appName = requestedName && !/^(?:software app|custom app|react app|web app)$/i.test(requestedName)
      ? requestedName
      : "Finance Flow";

    return finalizeBlueprint({
      appName,
      copyLines: [
        "Income, expenses, and this month's balance in one calm view.",
        "Add local transactions and see the totals change immediately.",
        "Local finance organizer only - no bank sync or accounting authority."
      ],
      disclaimer: "Local finance demo only. No bank connection, backend, cloud sync, payment processing, tax calculation, or accounting advice is included.",
      domain: "personal and small-business finance tracking",
      excitementGate: "A user sees monthly income, expenses, current balance, and recent transactions in the first screen.",
      jobToBeDone: "Help a user track local income and expenses and understand the current monthly balance.",
      localStorageKey: "hassali-finance-flow-demo",
      metricLabels: ["Monthly income", "Monthly expenses", "Current balance", "Needs review"],
      palette: {
        accent: "#0f766e",
        accent2: "#eab308",
        canvas: "#f7faf9",
        ink: "#17201e",
        muted: "#64716e",
        soft: "#d9f3ec",
        surface: "rgba(255,255,255,0.9)"
      },
      primaryActionLabel: "Add transaction",
      recordLabel: "transaction",
      records,
      sections: ["Dashboard", "Income", "Expenses", "Monthly Overview", "Transactions"],
      screens: financeDashboardScreens(records, statusOptions),
      statusOptions,
      targetUser: "freelancers and small operators tracking monthly money locally",
      tone: "calm, clear, practical, numbers-first",
      type: "finance_dashboard",
      workflowMap: ["Add income", "Add expense", "Review monthly balance", "Filter transactions", "Reset demo data"]
    }, input.prompt);
  }

  if (/\b(?:anthropic|openai|gemini|claude|ai api|api key|browser api|directly from the browser)\b/i.test(input.prompt)) {
    const records = [
      { amount: 82, category: "Mock review", note: "Looks healthy in local demo data. Real model review requires backend proxy.", owner: "Ayesha Malik", status: "ready", title: "Studio Nova" },
      { amount: 61, category: "Needs follow-up", note: "Missing signed scope. Flagged locally without external provider call.", owner: "Daniel Reed", status: "watch", title: "Atlas Retail" },
      { amount: 44, category: "High caution", note: "Payment terms unclear. Add human review before onboarding.", owner: "Mina Chen", status: "review", title: "Northstar Labs" }
    ];
    const statusOptions = ["ready", "watch", "review", "approved", "blocked"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Safe Client Check Studio",
      copyLines: [
        "Client check workflow, safely mocked in the browser.",
        "Real provider calls need a server-side proxy and protected credentials.",
        "Use this local screen to design the review flow before backend approval."
      ],
      disclaimer: "Local placeholder only. No provider credentials, direct AI calls, backend, auth, cloud sync, public sharing, or payment processing is included.",
      domain: "safe client check workflow",
      excitementGate: "A user sees the client review workflow, risk notes, and backend boundary immediately without exposing secrets.",
      jobToBeDone: "Help the user design a client checking workflow while keeping provider calls behind a future server-side proxy.",
      localStorageKey: "hassali-safe-client-check-demo",
      metricLabels: ["Clients queued", "Watchlist", "Approved locally", "Proxy steps left"],
      palette: {
        accent: "#38bdf8",
        accent2: "#a78bfa",
        canvas: "#07111f",
        ink: "#f8fafc",
        muted: "#90a4b8",
        soft: "#12314d",
        surface: "rgba(14,29,47,0.9)"
      },
      primaryActionLabel: "Add client check",
      recordLabel: "client check",
      records,
      sections: ["Dashboard", "Client Queue", "Risk Notes", "Review Form", "Backend Proxy Plan", "Security Checklist"],
      screens: genericScreens(records, statusOptions),
      statusOptions,
      targetUser: "Freelancers and small teams designing a safe client checking workflow",
      tone: "clear, security-aware, practical",
      type: "safe_client_check",
      workflowMap: ["Add client check", "Update review status", "Record risk note", "Review backend proxy requirements", "Reset demo data"]
    }, input.prompt);
  }

  if (prompt.includes("afforfix") || prompt.includes("cleaning service") || prompt.includes("cleaner")) {
    const records = [
      { amount: 9500, category: "Deep Clean", note: "Client wants pet-safe products and balcony focus.", owner: "Nadia Khan", status: "confirmed", title: "Gulberg apartment reset" },
      { amount: 6200, category: "Basic", note: "Assign cleaner near Clifton route.", owner: "Hamza Mir", status: "pending", title: "Clifton weekly clean" },
      { amount: 14800, category: "Move-in Clean", note: "Quality issue: kitchen cabinets need second pass.", owner: "Maira Ali", status: "in-progress", title: "DHA move-in clean" },
      { amount: 7200, category: "Basic", note: "Payment unpaid. Follow up after completion photos.", owner: "Sameer Shah", status: "completed", title: "Bahria family home" }
    ];
    const statusOptions = ["pending", "confirmed", "in-progress", "completed", "cancelled", "unpaid", "paid", "refunded"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Afforfix Cleaner",
      copyLines: [
        "Today’s jobs without the WhatsApp chaos.",
        "Cleaner workload, payments, and quality issues in one dispatch view.",
        "Local demo only - no live marketplace backend or real payments."
      ],
      disclaimer: "Local operations demo only. No real booking links, cleaner verification, customer notifications, cloud sync, or payment processing are included.",
      domain: "cleaning service marketplace operations",
      excitementGate: "A dispatcher sees today’s jobs, unpaid bookings, cleaner workload, and quality issues in the first screen.",
      jobToBeDone: "Help a cleaning marketplace owner track bookings, clients, cleaners, service tiers, job status, payments, reviews, and quality issues.",
      localStorageKey: "hassali-afforfix-cleaner-demo",
      metricLabels: ["Today's jobs", "Revenue estimate", "Unpaid bookings", "Cleaner workload"],
      palette: {
        accent: "#0891b2",
        accent2: "#14b8a6",
        canvas: "#f5fbff",
        ink: "#10202b",
        muted: "#5c7180",
        soft: "#dff7f4",
        surface: "rgba(255,255,255,0.86)"
      },
      primaryActionLabel: "Add booking",
      recordLabel: "booking",
      records,
      sections: ["Dashboard", "Bookings", "Clients", "Cleaners", "Service Packages", "Job Status Board", "Payments", "Reviews / Quality Issues"],
      screens: afforfixScreens(records, statusOptions),
      statusOptions,
      targetUser: "cleaning marketplace owner, dispatcher, and home-cleaning operations team",
      tone: "clean, trustworthy, operational, marketplace-ready",
      type: "afforfix",
      workflowMap: ["Add booking", "Assign cleaner", "Change booking status", "Filter by status", "Track payment state", "Log quality issue", "Reset demo data"]
    }, input.prompt);
  }

  if (prompt.includes("tax dedo") || prompt.includes("pakistani freelancer") || prompt.includes("pakistan freelancer") || prompt.includes("tax filing") || prompt.includes("accounting") || prompt.includes("invoice/tax") || prompt.includes("remittance") || prompt.includes("receipts")) {
    const records = [
      { amount: 1800, category: "Wise remittance", note: "Upwork milestone, invoice TD-104, billing proof saved before panic.", owner: "Amina Qureshi", status: "paid", title: "Lumen Studio retainer" },
      { amount: 950, category: "Payoneer", note: "Client ghosting risk: billing is 6 days late. Reminder queued for overdue payments.", owner: "Bilal Ahmed", status: "overdue", title: "Nordic SaaS landing page" },
      { amount: 1240, category: "Bank transfer", note: "Direct client invoices and receipt screenshot logged.", owner: "Sara Khan", status: "pending", title: "Toronto UX sprint" },
      { amount: 640, category: "Subscription retainer", note: "Monthly subscriptions-style design support payment marked for review.", owner: "Hamza Malik", status: "watch", title: "Berlin product icons" },
      { amount: 520, category: "Wise remittance", note: "Small service seller campaign assets.", owner: "Omar Farooq", status: "paid", title: "Dubai ecommerce copy" }
    ];
    const statusOptions = ["pending", "paid", "overdue", "watch", "proof saved"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Tax Dedo",
      copyLines: [
        "Your paisa dashboard, minus the spreadsheet panic.",
        "Proof saved before panic. Invoices, payments, subscription-style retainers, and remittance damage checked before payday.",
        "Tax readiness, not tax advice."
      ],
      disclaimer: "Illustrative finance organizer only. Tax-readiness estimates are mock signals, not Pakistani tax/legal/accounting advice.",
      domain: "freelancer finance, receipts, remittance, and client tracking",
      excitementGate: "A freelancer sees income, pending money, client risk, proof logs, and remittance comparison in the first 10 seconds.",
      jobToBeDone: "Help Pakistani freelancers track client income, receipts, invoices, payments, subscription-style retainers, billing follow-ups, remittance options, payment reminders, client risk notes, and tax-readiness.",
      localStorageKey: "hassali-tax-dedo-demo",
      metricLabels: ["Monthly income", "Pending amount", "Top client", "Overdue reminders"],
      palette: {
        accent: "#0f9f6e",
        accent2: "#f2b84b",
        canvas: "#f8f3e8",
        ink: "#17221c",
        muted: "#667164",
        soft: "#ddf7e8",
        surface: "rgba(255,255,255,0.82)"
      },
      primaryActionLabel: "Add income",
      recordLabel: "payment",
      records,
      sections: ["Dashboard", "Clients", "Invoices", "Tax Filing Status", "Deductions / Expenses", "Deadlines", "Reports"],
      screens: taxDedoScreens(records, statusOptions),
      statusOptions,
      targetUser: "Pakistani freelancers, remote workers, and small service sellers",
      tone: "practical, slightly desi, friendly, still professional",
      type: "tax_dedo",
      workflowMap: ["Add client record", "Add invoice", "Log expense proof", "Move tax filing status", "Review deadlines", "Read not-tax-advice disclaimer", "Reset demo data"]
    }, input.prompt);
  }

  if (productType === "crm" || (!productType && /\b(?:crm|customer relationship|sales pipeline)\b/.test(prompt))) {
    const records = [
      { amount: 86000, category: "Proposal", note: "Product demo completed. Follow up on security review.", owner: "Maya Chen", status: "proposal", title: "Northstar platform rollout" },
      { amount: 42000, category: "Qualified", note: "Operations lead confirmed budget and implementation window.", owner: "Daniel Reed", status: "qualified", title: "Harbor Foods renewal" },
      { amount: 19500, category: "Lead", note: "Introductory call requested for next Tuesday.", owner: "Ayesha Malik", status: "lead", title: "Lumen Studio onboarding" },
      { amount: 64000, category: "Won", note: "Contract signed. First client invoice is due this month.", owner: "Omar Farooq", status: "won", title: "Atlas Retail expansion" }
    ];
    const statusOptions = ["lead", "qualified", "proposal", "won", "lost", "invoice due", "paid"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Customer Relationship Manager",
      copyLines: [
        "Customer relationships, opportunities, and follow-ups in one focused workspace.",
        "Track contacts, companies, deals, interactions, tasks, and client-linked invoices.",
        "Local demo only - no live backend, email sync, or payment processing."
      ],
      disclaimer: "Local CRM demo only. No backend, email delivery, calendar sync, cloud sharing, or payment processing is included.",
      domain: "customer relationship management",
      excitementGate: "A team sees contacts, open deals, pipeline value, follow-ups, and invoice status on the first screen.",
      jobToBeDone: "Help a small sales team manage contacts, companies, deals, customer interactions, follow-up tasks, and client-linked billing.",
      localStorageKey: "hassali-crm-demo",
      metricLabels: ["Contacts", "Open deals", "Pipeline value", "Invoices due"],
      palette: {
        accent: "#2563eb",
        accent2: "#0f766e",
        canvas: "#f7f8fa",
        ink: "#172033",
        muted: "#667085",
        soft: "#dbeafe",
        surface: "rgba(255,255,255,0.9)"
      },
      primaryActionLabel: "Add contact",
      recordLabel: "contact",
      records,
      sections: ["Dashboard", "Contacts", "Companies", "Sales Pipeline", "Activities", "Billing"],
      screens: crmScreens(records, statusOptions),
      statusOptions,
      targetUser: "small sales teams managing customer relationships and opportunities",
      tone: "clear, professional, relationship-focused",
      type: "crm",
      workflowMap: ["Add contact", "Link company", "Create deal", "Move pipeline stage", "Record interaction", "Create client invoice"]
    }, input.prompt);
  }

  if (
    productType === "inventory_system" ||
    (!productType && /\b(?:inventory|inventory management|inventory system|stock levels?|low stock|sku|cash in|cash out|purchase records?|supplier records?)\b/.test(prompt))
  ) {
    const records = [
      { amount: 128500, category: "Electronics", note: "SKU INV-1042. Stock 18, reorder point 12, billing ready.", owner: "Apex Wholesale", status: "in stock", title: "Bluetooth Speaker Pro" },
      { amount: 42800, category: "Accessories", note: "SKU INV-2210. Stock 4, low stock alert active, supplier follow-up needed.", owner: "Bright Supply Co.", status: "low stock", title: "USB-C Charging Cable" },
      { amount: 93500, category: "Home Goods", note: "SKU INV-3308. Purchase record received, invoice pending.", owner: "Metro Traders", status: "purchase due", title: "Kitchen Storage Set" },
      { amount: 68200, category: "Retail", note: "Sale recorded. Cash in Rs 68,200, cash out Rs 41,500, margin review needed.", owner: "Walk-in Sales", status: "sold", title: "Kids Learning Tablet" },
      { amount: 15400, category: "Stationery", note: "Stock 0. Reorder immediately before next billing cycle.", owner: "Paperline Supplier", status: "out of stock", title: "Premium Notebook Pack" }
    ];
    const statusOptions = ["in stock", "low stock", "out of stock", "sold", "purchase due", "invoice due", "paid"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Inventory System",
      copyLines: [
        "Stock, billing, and cash flow without the spreadsheet fog.",
        "Track products, SKU quantities, low-stock alerts, invoices, sales, purchases, cash in, and cash out in one local dashboard.",
        "Local demo only - no live backend, barcode scanner, or accounting authority."
      ],
      disclaimer: "Local inventory demo only. No backend, accounting authority, payment processing, barcode hardware, cloud sync, or real finance reporting is included.",
      domain: "inventory management system",
      excitementGate: "An operator sees stock value, low-stock alerts, billing status, cash in/out, and sales movement in the first screen.",
      jobToBeDone: "Help shop owners and operators track products, stock levels, low stock alerts, billing, invoices, cash in, cash out, sales, purchases, reports, suppliers, and product records.",
      localStorageKey: "hassali-inventory-system-demo",
      metricLabels: ["Stock value", "Low-stock alerts", "Cash in / cash out", "Open invoices"],
      palette: {
        accent: "#2563eb",
        accent2: "#16a34a",
        canvas: "#f6f8fb",
        ink: "#111827",
        muted: "#64748b",
        soft: "#dbeafe",
        surface: "rgba(255,255,255,0.88)"
      },
      primaryActionLabel: "Add product",
      recordLabel: "product",
      records,
      sections: ["Dashboard", "Products", "Stock Levels", "Low Stock Alerts", "Billing / Invoices", "Cash In / Cash Out", "Sales", "Purchases", "Reports / Graphs", "Suppliers"],
      screens: inventoryScreens(records, statusOptions),
      statusOptions,
      targetUser: "retail operators, shop owners, inventory clerks, and small businesses tracking stock and billing",
      tone: "clear, operational, numbers-first, local-first",
      type: "inventory_system",
      workflowMap: ["Add product", "Update stock quantity", "Flag low stock", "Create invoice", "Record cash in", "Record cash out", "Review sales graph", "Reset demo data"]
    }, input.prompt);
  }

  const fallbackName = input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Local Product Studio";
  const records = [
    { amount: 3200, category: "Priority", note: "Needs confirmation before final handoff.", owner: "Aisha", status: "pending", title: "Client onboarding" },
    { amount: 1800, category: "Operations", note: "Ready for review.", owner: "Bilal", status: "completed", title: "Weekly tracker" },
    { amount: 2400, category: "Follow-up", note: "Waiting on updated details.", owner: "Sara", status: "watch", title: "Proposal review" }
  ];
  const statusOptions = ["pending", "active", "watch", "completed"];

  return finalizeBlueprint({
    appName: fallbackName,
    copyLines: [
      "A local-first operations dashboard for the work you actually track.",
      "Records, statuses, notes, and metrics stay on this device until a backend is approved.",
      "Useful demo workflows without fake cloud claims."
    ],
    disclaimer: "Local demo only. No backend, auth, cloud sync, public sharing, or payment processing is included.",
    domain: "local-first business app",
    excitementGate: "A user sees records, actions, status filters, and metrics immediately instead of a blank scaffold.",
    jobToBeDone: "Help the user track important records, statuses, notes, and summary metrics in a polished local app.",
    localStorageKey: `hassali-${slug(fallbackName)}-demo`,
    metricLabels: ["Active records", "Open value", "Needs review", "Completed"],
    palette: {
      accent: "#6366f1",
      accent2: "#06b6d4",
      canvas: "#f7f7ff",
      ink: "#171827",
      muted: "#687083",
      soft: "#e8e9ff",
      surface: "rgba(255,255,255,0.86)"
    },
    primaryActionLabel: "Add record",
    recordLabel: "record",
    records,
    sections: ["Dashboard", "Records", "Workflow Board", "Clients", "Notes", "Metrics", "Quality Checks", "Settings"],
    screens: genericScreens(records, statusOptions),
    statusOptions,
    targetUser: "small business operator",
    tone: "calm, useful, product-focused",
    type: "generic",
    workflowMap: ["Add record", "Change status", "Filter list", "Review notes", "Reset demo data"]
  }, input.prompt);
}

function createReactMiniProductApp(blueprint: ReactProductBlueprint) {
  const blueprintJson = JSON.stringify(blueprint, null, 2);

  return `import { useEffect, useMemo, useState } from "react";

export default function App() {
  const blueprint = ${blueprintJson};
  type DemoRecord = {
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  };
  const [activeTab, setActiveTab] = useState(blueprint.sections[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords] = useState<DemoRecord[]>(() => loadRecords(blueprint.localStorageKey, blueprint.records as DemoRecord[]));
  const [form, setForm] = useState({
    amount: "",
    category: blueprint.records[0]?.category ?? "General",
    note: "",
    owner: "",
    status: blueprint.statusOptions[0] ?? "pending",
    title: ""
  });

  useEffect(() => {
    saveRecords(blueprint.localStorageKey, records);
  }, [blueprint.localStorageKey, records]);

  const visibleRecords = useMemo(() => {
    return statusFilter === "all" ? records : records.filter((record) => record.status === statusFilter);
  }, [records, statusFilter]);
  const activeScreen = useMemo(() => {
    return blueprint.screens.find((screen) => screen.label === activeTab) ?? blueprint.screens[0];
  }, [activeTab, blueprint.screens]);

  const metrics = useMemo(() => {
    const total = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const pending = records.filter((record) => /pending|overdue|unpaid|watch/i.test(record.status));
    const completed = records.filter((record) => /paid|completed/i.test(record.status));
    const top = [...records].sort((a, b) => b.amount - a.amount)[0];

    return [
      { label: blueprint.metricLabels[0], value: money(total), detail: "mock local total" },
      { label: blueprint.metricLabels[1], value: money(pending.reduce((sum, record) => sum + record.amount, 0)), detail: \`\${pending.length} needs action\` },
      { label: blueprint.metricLabels[2], value: top?.owner ?? "None", detail: top?.title ?? "No records yet" },
      { label: blueprint.metricLabels[3], value: String(completed.length), detail: "locally tracked" }
    ];
  }, [blueprint.metricLabels, records]);

  function addRecord() {
    if (!form.title.trim() || !form.owner.trim()) return;

    const nextRecord = {
      amount: Number(form.amount || 0),
      category: form.category || "General",
      note: form.note || "No note yet.",
      owner: form.owner,
      status: form.status,
      title: form.title
    } satisfies DemoRecord;

    setRecords((current) => [nextRecord, ...current]);
    setForm({
      amount: "",
      category: blueprint.records[0]?.category ?? "General",
      note: "",
      owner: "",
      status: blueprint.statusOptions[0] ?? "pending",
      title: ""
    });
  }

  function updateStatus(index: number, status: string) {
    setRecords((current) => current.map((record, recordIndex) => recordIndex === index ? { ...record, status } : record));
  }

  function resetDemoData() {
    setRecords(blueprint.records as DemoRecord[]);
    setStatusFilter("all");
    setActiveTab(blueprint.sections[0]);
  }

  function screenRecords() {
    return visibleRecords.slice(0, 6);
  }

  function renderScreenContent() {
    const current = activeScreen;
    const rows = screenRecords();

    if (current.layoutKind === "dashboard_overview") {
      return (
        <div className="screen-overview">
          <div className="overview-copy">
            <p className="eyebrow">{current.primaryEntity}</p>
            <h3>{current.purpose}</h3>
            <p>{current.domainVocabulary.join(" / ")}</p>
          </div>
          <div className="mini-metric-grid">
            {current.metrics.map((metric, index) => (
              <article className="mini-metric" key={metric}>
                <span>{metric}</span>
                <strong>{index === 0 ? metrics[0].value : index === 1 ? metrics[1].value : index === 2 ? metrics[2].value : metrics[3].value}</strong>
              </article>
            ))}
          </div>
        </div>
      );
    }

    if (current.layoutKind === "records_table") {
      return (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>{current.fields.slice(0, 4).map((field) => <th key={field}>{field}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((record, index) => (
                <tr key={\`\${record.title}-\${index}\`}>
                  <td>{record.title}</td>
                  <td>{record.owner}</td>
                  <td>{money(record.amount)}</td>
                  <td><span className="status-chip">{record.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (current.layoutKind === "kanban_status_board") {
      return (
        <div className="kanban-board">
          {blueprint.statusOptions.slice(0, 4).map((status) => (
            <article className="kanban-column" key={status}>
              <h4>{status}</h4>
              {records.filter((record) => record.status === status).slice(0, 3).map((record) => (
                <div className="kanban-card" key={record.title}>
                  <strong>{record.title}</strong>
                  <span>{record.owner}</span>
                </div>
              ))}
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "people_roster") {
      return (
        <div className="people-roster">
          {rows.map((record) => (
            <article className="person-card" key={record.title}>
              <div className="avatar">{record.owner.slice(0, 2)}</div>
              <div>
                <strong>{record.owner}</strong>
                <span>{record.title}</span>
                <small>{record.note}</small>
              </div>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "package_or_pricing_cards") {
      return (
        <div className="package-grid">
          {rows.map((record) => (
            <article className="package-card" key={record.title}>
              <span>{record.category}</span>
              <strong>{money(record.amount)}</strong>
              <p>{record.note}</p>
              <button className="ghost" type="button">{current.actions[0]}</button>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "payments_revenue") {
      return (
        <div className="revenue-layout">
          <div className="revenue-total">{metrics[0].value}<span>{current.metrics[0]}</span></div>
          <div className="payment-list">
            {rows.map((record) => <p key={record.title}><strong>{record.owner}</strong><span>{money(record.amount)} - {record.status}</span></p>)}
          </div>
        </div>
      );
    }

    if (current.layoutKind === "quality_issues") {
      return (
        <div className="issue-list">
          {rows.map((record) => (
            <article className="issue-card" key={record.title}>
              <span className="status-chip">{record.status}</span>
              <strong>{record.title}</strong>
              <p>{record.note}</p>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "calendar_or_schedule") {
      return (
        <div className="schedule-list">
          {rows.map((record, index) => (
            <article className="schedule-row" key={record.title}>
              <time>Day {index + 1}</time>
              <strong>{record.title}</strong>
              <span>{record.status}</span>
            </article>
          ))}
        </div>
      );
    }

    return (
      <div className="docs-summary">
        <h3>{current.purpose}</h3>
        <ul>{current.actions.map((action) => <li key={action}>{action}</li>)}</ul>
        <p>{blueprint.disclaimer}</p>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">{blueprint.appName.slice(0, 2)}</div>
        <div>
          <p className="eyebrow">{blueprint.domain}</p>
          <h1>{blueprint.appName}</h1>
          <p>{blueprint.targetUser}</p>
        </div>
        <nav className="tab-list" aria-label={\`\${blueprint.appName} sections\`}>
          {blueprint.screens.map((section) => (
            <button
              className={section.label === activeTab ? "tab active" : "tab"}
              key={section.screenId}
              onClick={() => setActiveTab(section.label)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Product Intelligence Blueprint</p>
            <h2>{blueprint.copyLines[0]}</h2>
            <p>{blueprint.jobToBeDone}</p>
          </div>
          <div className="hero-card">
            <strong>First 10 seconds</strong>
            <span>{blueprint.excitementGate}</span>
          </div>
        </header>

        <section className="metrics" aria-label="Dashboard metrics">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className="control-grid">
          <article className="panel form-panel">
            <div className="panel-heading">
              <p className="eyebrow">{blueprint.primaryActionLabel}</p>
              <h3>Add a local {blueprint.recordLabel}</h3>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Project, booking, or record title" />
              </label>
              <label>
                Owner / client
                <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Client or owner name" />
              </label>
              <label>
                Amount
                <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" type="number" />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {blueprint.statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="wide-field">
                Note
                <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add useful context, reminder, or quality note" />
              </label>
            </div>
            <div className="actions">
              <button onClick={addRecord} type="button">{blueprint.primaryActionLabel}</button>
              <button className="secondary" onClick={resetDemoData} type="button">Reset demo data</button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Workflow map</p>
              <h3>What users can actually do</h3>
            </div>
            <div className="workflow-list">
              {blueprint.workflowMap.map((item) => <span key={item}>{item}</span>)}
            </div>
            <p className="disclaimer">{blueprint.disclaimer}</p>
          </article>
        </section>

        <section className={\`panel screen-panel layout-\${activeScreen.layoutKind}\`}>
          <div className="panel-heading split">
            <div>
              <p className="eyebrow">{activeScreen.layoutKind}</p>
              <h3>{activeScreen.label}</h3>
              <p>{activeScreen.purpose}</p>
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {blueprint.statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          {visibleRecords.length === 0 ? (
            <div className="empty-state">
              <strong>No records match this filter.</strong>
              <p>{activeScreen.emptyState}</p>
            </div>
          ) : (
            renderScreenContent()
          )}
        </section>
      </section>
    </main>
  );
}

function loadRecords<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : fallback;
  } catch {
    return fallback;
  }
}

function saveRecords(key: string, records: unknown[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(records));
  } catch {
    // Local demo remains usable even if browser storage is blocked.
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}
`
}

function createReactMiniProductMockData(blueprint: ReactProductBlueprint) {
  return `export const productBlueprint = ${JSON.stringify({
    appName: blueprint.appName,
    dataPolicy: "local_or_mock_only",
    domain: blueprint.domain,
    excitementGate: blueprint.excitementGate,
    metrics: blueprint.metricLabels,
    sections: blueprint.sections,
    targetUser: blueprint.targetUser
  }, null, 2)} as const;

export const sampleRecords = ${JSON.stringify(blueprint.records, null, 2)};

export const statusOptions = ${JSON.stringify(blueprint.statusOptions, null, 2)};
`;
}

function createReactMiniProductStyles(blueprint: ReactProductBlueprint) {
  return `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: ${blueprint.palette.canvas};
  color: ${blueprint.palette.ink};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 14% 8%, ${blueprint.palette.soft}, transparent 28rem),
    radial-gradient(circle at 88% 14%, rgba(255,255,255,0.76), transparent 24rem),
    ${blueprint.palette.canvas};
}

button, input, select, textarea {
  font: inherit;
}

button {
  border: 0;
  border-radius: 999px;
  background: ${blueprint.palette.accent};
  color: white;
  cursor: pointer;
  font-weight: 850;
  padding: 0.78rem 1rem;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

button:hover {
  box-shadow: 0 16px 36px rgba(0,0,0,0.16);
  transform: translateY(-1px);
}

button.secondary, button.ghost {
  background: rgba(255,255,255,0.72);
  color: ${blueprint.palette.ink};
  border: 1px solid rgba(0,0,0,0.08);
}

.app-shell {
  display: grid;
  grid-template-columns: 18rem minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  align-content: start;
  background: ${blueprint.palette.ink};
  color: white;
  display: grid;
  gap: 1.5rem;
  padding: 1.25rem;
}

.brand-mark {
  align-items: center;
  background: linear-gradient(135deg, ${blueprint.palette.accent}, ${blueprint.palette.accent2});
  border-radius: 20px;
  display: grid;
  font-size: 1rem;
  font-weight: 950;
  height: 3rem;
  justify-items: center;
  width: 3rem;
}

.sidebar h1, .hero h2, .panel h3, .record-card h4 {
  letter-spacing: -0.04em;
  margin: 0;
}

.sidebar p, .hero p, .record-card p, .record-card small, .disclaimer {
  color: ${blueprint.palette.muted};
  line-height: 1.6;
}

.sidebar p {
  color: rgba(255,255,255,0.68);
}

.eyebrow {
  color: ${blueprint.palette.accent2};
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  margin: 0 0 0.45rem;
  text-transform: uppercase;
}

.tab-list {
  display: grid;
  gap: 0.5rem;
}

.tab {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.72);
  text-align: left;
}

.tab.active, .tab:hover {
  background: rgba(255,255,255,0.12);
  color: white;
}

.workspace {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
}

.hero, .panel, .metric-card, .record-card, .person-card, .package-card, .issue-card, .kanban-column, .schedule-row {
  background: ${blueprint.palette.surface};
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 28px;
  box-shadow: 0 24px 80px rgba(23, 34, 28, 0.1);
}

.hero {
  align-items: stretch;
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 0.65fr);
  padding: clamp(1.25rem, 3vw, 2rem);
}

.hero h2 {
  font-size: clamp(2.3rem, 6vw, 5.5rem);
  line-height: 0.92;
  max-width: 12ch;
}

.hero-card {
  background: linear-gradient(135deg, ${blueprint.palette.accent}, ${blueprint.palette.accent2});
  border-radius: 24px;
  color: white;
  display: grid;
  gap: 0.85rem;
  padding: 1.25rem;
}

.hero-card strong {
  font-size: 1.4rem;
  letter-spacing: -0.04em;
}

.metrics {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
}

.metric-card strong {
  font-size: clamp(1.5rem, 4vw, 2.4rem);
  letter-spacing: -0.05em;
}

.metric-card span, .metric-card small {
  color: ${blueprint.palette.muted};
}

.control-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
}

.panel {
  padding: 1rem;
}

.panel-heading {
  margin-bottom: 1rem;
}

.panel-heading.split {
  align-items: center;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.form-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  color: ${blueprint.palette.muted};
  display: grid;
  gap: 0.35rem;
  font-size: 0.86rem;
  font-weight: 750;
}

input, select, textarea {
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 16px;
  background: rgba(255,255,255,0.84);
  color: ${blueprint.palette.ink};
  padding: 0.78rem 0.85rem;
}

textarea {
  min-height: 5.5rem;
  resize: vertical;
}

.wide-field {
  grid-column: 1 / -1;
}

.actions, .mini-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1rem;
}

.workflow-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.workflow-list span, .status-chip {
  border-radius: 999px;
  background: ${blueprint.palette.soft};
  color: ${blueprint.palette.ink};
  font-size: 0.78rem;
  font-weight: 850;
  padding: 0.45rem 0.65rem;
}

.record-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.record-card {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
}

.record-topline {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.record-topline strong {
  font-size: 1.35rem;
}

.screen-panel {
  display: grid;
  gap: 1rem;
}

.screen-overview {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.95fr);
}

.overview-copy, .docs-summary, .revenue-total {
  background: linear-gradient(135deg, ${blueprint.palette.soft}, rgba(255,255,255,0.72));
  border-radius: 24px;
  padding: 1.1rem;
}

.mini-metric-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mini-metric {
  background: rgba(255,255,255,0.76);
  border-radius: 20px;
  display: grid;
  gap: 0.35rem;
  padding: 0.9rem;
}

.mini-metric strong, .revenue-total {
  color: ${blueprint.palette.accent};
  font-size: 1.45rem;
  font-weight: 950;
}

.data-table-wrap {
  overflow-x: auto;
}

.data-table {
  border-collapse: collapse;
  min-width: 42rem;
  width: 100%;
}

.data-table th, .data-table td {
  border-bottom: 1px solid rgba(0,0,0,0.08);
  padding: 0.8rem;
  text-align: left;
}

.kanban-board {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kanban-column {
  background: rgba(255,255,255,0.72);
  border-radius: 22px;
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
}

.kanban-card {
  background: ${blueprint.palette.soft};
  border-radius: 16px;
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
}

.people-roster, .package-grid, .issue-list, .schedule-list, .payment-list {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.person-card {
  align-items: flex-start;
  display: flex;
  gap: 0.85rem;
  padding: 1rem;
}

.avatar {
  align-items: center;
  background: ${blueprint.palette.accent};
  border-radius: 18px;
  color: white;
  display: grid;
  flex: 0 0 3rem;
  font-weight: 950;
  height: 3rem;
  place-items: center;
}

.person-card div:last-child, .package-card, .issue-card, .schedule-row, .payment-list p {
  display: grid;
  gap: 0.35rem;
}

.package-card, .issue-card, .schedule-row {
  padding: 1rem;
}

.revenue-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(14rem, 0.45fr) minmax(0, 1fr);
}

.revenue-total span {
  color: ${blueprint.palette.ink};
  display: block;
  font-size: 0.9rem;
  font-weight: 750;
  margin-top: 0.35rem;
}

.payment-list p {
  background: rgba(255,255,255,0.72);
  border-radius: 18px;
  margin: 0;
  padding: 0.8rem;
}

.empty-state {
  border: 1px dashed rgba(0,0,0,0.16);
  border-radius: 22px;
  padding: 1.2rem;
}

.disclaimer {
  background: rgba(0,0,0,0.04);
  border-radius: 18px;
  margin-top: 1rem;
  padding: 0.9rem;
}

@media (max-width: 980px) {
  .app-shell, .hero, .control-grid, .metrics, .record-grid, .screen-overview, .kanban-board, .people-roster, .package-grid, .issue-list, .schedule-list, .revenue-layout, .payment-list {
    grid-template-columns: 1fr;
  }

  .sidebar {
    min-height: auto;
  }
}
`;
}

function createReactMiniProductReadme(blueprint: ReactProductBlueprint, prompt: string) {
  return `# ${blueprint.appName}

${blueprint.jobToBeDone}

## Source request
${prompt}

## What this app includes
- Product Intelligence Blueprint-driven React/Vite single-page app
- Sections: ${blueprint.sections.join(", ")}
- Local forms/actions that update state on this device
- Computed dashboard metrics
- Realistic fake sample data
- localStorage persistence with reset demo data

## Run instructions
Hassali does not install packages or start runtime automatically. After approval, use the future approved runtime flow to install and run Vite.

## Honest limitations
${blueprint.disclaimer}

No backend, auth, database, cloud sync, payment processing, public sharing, external API calls, or production authority is included.
`;
}

function createReactMiniProductArchitecture(blueprint: ReactProductBlueprint, prompt: string) {
  return `# ${blueprint.appName} Architecture

## Product Intelligence Blueprint
- Product identity: ${blueprint.appName}
- Target user: ${blueprint.targetUser}
- Job to be done: ${blueprint.jobToBeDone}
- Domain: ${blueprint.domain}
- Tone: ${blueprint.tone}
- First-10-seconds excitement gate: ${blueprint.excitementGate}

## Workflow map
${blueprint.workflowMap.map((item) => `- ${item}`).join("\n")}

## Record/state model
- Record label: ${blueprint.recordLabel}
- Status options: ${blueprint.statusOptions.join(", ")}
- Sample records are realistic but fake.

## Dashboard metrics
${blueprint.metricLabels.map((item) => `- ${item}`).join("\n")}

## Runtime and persistence
- React/Vite frontend
- localStorage for local demo persistence
- Reset demo data action
- No package install or runtime auto-start during approval

## Source request
${prompt}
`;
}

function createReactMiniProductDataModel(blueprint: ReactProductBlueprint) {
  return `# ${blueprint.appName} Data Model

## Product records
${blueprint.recordLabel} fields:
- title
- owner/client
- category
- amount
- status
- note

## Status/state model
${blueprint.statusOptions.map((status) => `- ${status}`).join("\n")}

## Dashboard metrics
${blueprint.metricLabels.map((metric) => `- ${metric}`).join("\n")}

## Sample data policy
All records are realistic but fake sample data. The app stores local demo records in localStorage only.

## Backend boundary
No database, auth, payment processing, public sharing, cloud sync, notifications, or real marketplace/tax authority is included in this phase.
`;
}

function createReactMiniProductSecurity(blueprint: ReactProductBlueprint) {
  return `# ${blueprint.appName} Security And Testing

## Safety boundaries
- No frontend API keys.
- No direct OpenAI, Anthropic, Gemini, payment, auth, or database calls from the browser.
- No real backend, cloud sync, public sharing, or marketplace/payment processing is claimed.
- localStorage is demo-only device-local persistence.
- ${blueprint.disclaimer}

## Testing checklist
- Verify tabs switch sections.
- Add a local record and confirm metrics update.
- Change record statuses and confirm filters work.
- Reset demo data.
- Confirm app remains usable if localStorage is unavailable.
`;
}

function createReactMiniProductContract(blueprint: ReactProductBlueprint) {
  return `# HASSALI.md

mode: CODE
Project Type: CODE
appType: react_single_page_app
framework: react_vite
previewType: code_app_preview
entryPoint: src/main.tsx
runtimePolicy: explicit_user_start_only
mutationPolicy: approval_required
dataPolicy: local_or_mock_only
backend: none

Product Intelligence Blueprint:
- Product identity: ${blueprint.appName}
- Target user: ${blueprint.targetUser}
- Job-to-be-done: ${blueprint.jobToBeDone}
- Sections: ${blueprint.sections.join(", ")}
- Metrics: ${blueprint.metricLabels.join(", ")}
- Local persistence: localStorage key ${blueprint.localStorageKey}
- Safety limitations: ${blueprint.disclaimer}
- User Excitement Gate: PASS - ${blueprint.excitementGate}

Quality Gates:
- Safety & Architecture Gate: PASS
- Product Quality Gate: PASS
- Visual Quality Gate: PASS
- User Excitement Gate: PASS

Contract role: human-readable project notes only; not machine state.
`;
}

export function generateCrmPythonStreamlitSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Hassali CRM";
  const brief = input.brief ?? null;

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
        st.write(f"- {item['timestamp']} · {item['type']}: {item['description']} ({item['related_id']})")
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
    {"customer_id": "C-1001", "name": "Apex Foods", "email": "ops@apex.example", "phone": "+92 300 1112222", "owner": "Sara", "plan": "Growth", "status": "Active", "value": 18400},
    {"customer_id": "C-1002", "name": "Northline Motors", "email": "sales@northline.example", "phone": "+92 300 3334444", "owner": "Bilal", "plan": "Enterprise", "status": "Negotiation", "value": 42600},
    {"customer_id": "C-1003", "name": "Pearl Clinics", "email": "admin@pearl.example", "phone": "+92 300 5556666", "owner": "Mina", "plan": "Starter", "status": "Onboarding", "value": 7200},
    {"customer_id": "C-1004", "name": "Metro Retail", "email": "team@metro.example", "phone": "+92 300 7778888", "owner": "Hamza", "plan": "Growth", "status": "Active", "value": 23100},
]

pipeline = [
    {"deal_id": "D-2001", "title": "Apex renewal", "stage": "Leads", "status": "New", "customer_id": "C-1001", "deals": 42, "value": 76000},
    {"deal_id": "D-2002", "title": "Northline rollout", "stage": "Qualified", "status": "Qualified", "customer_id": "C-1002", "deals": 21, "value": 94000},
    {"deal_id": "D-2003", "title": "Pearl onboarding", "stage": "Proposal", "status": "Proposal sent", "customer_id": "C-1003", "deals": 13, "value": 68000},
    {"deal_id": "D-2004", "title": "Metro expansion", "stage": "Won", "status": "Won", "customer_id": "C-1004", "deals": 8, "value": 46000},
]

invoices = [
    {"number": "INV-3001", "customer_id": "C-1001", "month": "Jan", "date": "2026-01-31", "amount": 28600, "status": "Paid", "revenue": 28600, "cost": 7400, "open_invoices": 19},
    {"number": "INV-3002", "customer_id": "C-1002", "month": "Feb", "date": "2026-02-28", "amount": 31800, "status": "Open", "revenue": 31800, "cost": 8100, "open_invoices": 22},
    {"number": "INV-3003", "customer_id": "C-1003", "month": "Mar", "date": "2026-03-31", "amount": 35400, "status": "Sent", "revenue": 35400, "cost": 8600, "open_invoices": 17},
    {"number": "INV-3004", "customer_id": "C-1004", "month": "Apr", "date": "2026-04-30", "amount": 42800, "status": "Paid", "revenue": 42800, "cost": 9300, "open_invoices": 13},
]

activities = [
    {"type": "call", "description": "Sara logged a renewal call with Apex Foods.", "timestamp": "2026-04-28T10:15:00Z", "related_id": "C-1001"},
    {"type": "billing", "description": "Billing follow-up scheduled for Northline Motors.", "timestamp": "2026-04-28T12:00:00Z", "related_id": "INV-3002"},
    {"type": "onboarding", "description": "Pearl Clinics completed onboarding checklist.", "timestamp": "2026-04-29T09:20:00Z", "related_id": "C-1003"},
    {"type": "pipeline", "description": "Metro Retail requested pipeline export review.", "timestamp": "2026-04-29T14:35:00Z", "related_id": "D-2004"},
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

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "crm"}
domainId: ${brief?.domainId ?? "crm_software"}
Stack: Python / Streamlit
requestedStack: ${brief?.requestedStack ?? "python"}
preferredFramework: ${brief?.preferredFramework ?? "streamlit"}
Domain: CRM System
Preview Type: python_app_preview
previewStrategy: ${brief?.previewStrategy ?? "python_streamlit_summary_until_runtime_enabled"}
runtimePolicy: explicit_user_start_only

Current prompt outranks stale contract memory.

Files:
- app.py: Streamlit CRM dashboard shell
- requirements.txt: Lightweight Python dependencies
- data/mock_crm_data.py: CRM mock entities and metrics
- README.md: Runtime boundary notes
- ARCHITECTURE.md: Module and architecture notes
- SECURITY_AND_TESTING.md: Safety notes

modulesIncluded: ${(brief?.modules ?? ["dashboard", "customers", "pipeline", "billing", "activity"]).join(", ")}
entitiesIncluded: ${(brief?.entities ?? ["customer", "deal", "invoice", "activity"]).join(", ")}
filePlan:
${(brief?.filePlan ?? []).map((file) => `- ${file.path}: ${file.purpose}`).join("\n") || "- app.py: Streamlit CRM dashboard\n- data/mock_crm_data.py: CRM mock data"}
nonGoals:
${(brief?.nonGoals ?? ["No package install during approval.", "No runtime process auto-start."]).map((note) => `- ${note}`).join("\n")}

Runtime:
- Python runtime is not auto-started.
- Package installation requires future explicit approval.
- Preview should be honest if Python runtime support is unavailable.
`
    }
  ];
}

export function generateMobilePhoneInventoryStreamlitSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Phone Inventory";
  const brief = input.brief ?? null;

  return [
    {
      path: "app.py",
      summary: "Adds a Streamlit inventory management dashboard for a mobile phone shop. No runtime command is executed.",
      content: `import pandas as pd
import streamlit as st

from data.mock_inventory_data import billing, products, repair_tickets, sales, stock, suppliers


st.set_page_config(page_title="${escapePython(appName)}", page_icon="PHONE", layout="wide")

st.sidebar.title("${escapePython(appName)}")
section = st.sidebar.radio(
    "Navigate",
    ["Dashboard", "Products", "Stock", "Sales", "Repairs", "Billing"],
    index=0,
)
st.sidebar.caption("Inventory management software for a mobile phone shop. Runtime requires approved Python flow.")

st.title("${escapePython(appName)}")
st.caption("Mobile phone inventory software with mock data for products, stock, suppliers, sales, repairs, and billing.")

products_frame = pd.DataFrame(products)
stock_frame = pd.DataFrame(stock)
sales_frame = pd.DataFrame(sales)
repair_frame = pd.DataFrame(repair_tickets)
billing_frame = pd.DataFrame(billing)

if section == "Dashboard":
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Products", len(products_frame), "+12")
    col2.metric("Units in stock", int(stock_frame["quantity"].sum()), "+34")
    col3.metric("Sales amount", f"\${int(sales_frame['amount'].sum()):,}", "+9%")
    col4.metric("Open repairs", int((repair_frame["status"] != "Closed").sum()), "-2")
    st.subheader("Billing graphical representation")
    st.bar_chart(billing_frame.set_index("month")["amount"])
    st.subheader("Low stock watch")
    st.dataframe(stock_frame[stock_frame["quantity"] <= stock_frame["reorder_level"]], use_container_width=True, hide_index=True)

elif section == "Products":
    st.subheader("Product catalog")
    st.dataframe(products_frame, use_container_width=True, hide_index=True)

elif section == "Stock":
    st.subheader("Stock by location")
    st.dataframe(stock_frame, use_container_width=True, hide_index=True)
    st.bar_chart(stock_frame.set_index("location")["quantity"])

elif section == "Sales":
    st.subheader("Sales transactions")
    st.dataframe(sales_frame, use_container_width=True, hide_index=True)

elif section == "Repairs":
    st.subheader("Repair and service tickets")
    st.dataframe(repair_frame, use_container_width=True, hide_index=True)

else:
    st.subheader("Billing")
    st.line_chart(billing_frame.set_index("month")["amount"])
    st.dataframe(billing_frame, use_container_width=True, hide_index=True)
    st.info("Payment provider integration is planned. Do not add secrets client-side.")
`
    },
    {
      path: "requirements.txt",
      summary: "Declares lightweight Python inventory dashboard dependencies for future approved runtime use.",
      content: `streamlit
pandas
`
    },
    {
      path: "data/mock_inventory_data.py",
      summary: "Adds mock mobile phone shop inventory data for products, stock, suppliers, sales, repairs, and billing.",
      content: `products = [
    {"product_id": "P-1001", "brand": "Apple", "model": "iPhone 15", "color": "Black", "storage": "128GB", "price": 799, "category": "smartphone"},
    {"product_id": "P-1002", "brand": "Samsung", "model": "Galaxy S24", "color": "Silver", "storage": "256GB", "price": 849, "category": "smartphone"},
    {"product_id": "P-1003", "brand": "Xiaomi", "model": "Redmi Note", "color": "Blue", "storage": "128GB", "price": 269, "category": "Android phone"},
    {"product_id": "P-1004", "brand": "Anker", "model": "Fast Charger", "color": "White", "storage": "N/A", "price": 29, "category": "accessory"},
]

stock = [
    {"product_id": "P-1001", "quantity": 18, "location": "Main shelf", "reorder_level": 8},
    {"product_id": "P-1002", "quantity": 11, "location": "Premium cabinet", "reorder_level": 6},
    {"product_id": "P-1003", "quantity": 25, "location": "Android shelf", "reorder_level": 10},
    {"product_id": "P-1004", "quantity": 5, "location": "Accessories wall", "reorder_level": 12},
]

suppliers = [
    {"supplier_id": "S-2001", "name": "Metro Devices", "contact": "orders@metrodevices.example", "lead_time": "3 days"},
    {"supplier_id": "S-2002", "name": "Accessory Hub", "contact": "supply@accessoryhub.example", "lead_time": "2 days"},
]

sales = [
    {"sale_id": "SA-3001", "product_id": "P-1001", "quantity": 2, "date": "2026-04-12", "amount": 1598},
    {"sale_id": "SA-3002", "product_id": "P-1002", "quantity": 1, "date": "2026-04-13", "amount": 849},
    {"sale_id": "SA-3003", "product_id": "P-1004", "quantity": 8, "date": "2026-04-14", "amount": 232},
]

repair_tickets = [
    {"ticket_id": "R-4001", "device": "iPhone 14", "issue": "screen replacement", "status": "In progress", "technician": "Amina"},
    {"ticket_id": "R-4002", "device": "Galaxy A54", "issue": "battery check", "status": "Waiting parts", "technician": "Bilal"},
    {"ticket_id": "R-4003", "device": "Redmi Note", "issue": "charging port", "status": "Closed", "technician": "Sara"},
]

billing = [
    {"invoice_id": "B-5001", "month": "Jan", "amount": 4200, "status": "Paid"},
    {"invoice_id": "B-5002", "month": "Feb", "amount": 5200, "status": "Paid"},
    {"invoice_id": "B-5003", "month": "Mar", "amount": 6100, "status": "Open"},
    {"invoice_id": "B-5004", "month": "Apr", "amount": 6900, "status": "Open"},
]
`
    },
    {
      path: "README.md",
      summary: "Explains the mobile phone inventory software scaffold and approved-runtime boundary.",
      content: `# ${appName}

Inventory management software for a mobile phone shop.

Generated from:

${input.prompt}

## Included modules

- Dashboard metrics
- Products
- Stock and reorder tracking
- Suppliers
- Sales
- Repair and service tickets
- Billing charts and tables

## Runtime boundary

Hassali does not install packages or start Python automatically. Running Streamlit requires a future approved Python runtime flow.
`
    },
    {
      path: "ARCHITECTURE.md",
      summary: "Creates architecture guidance for the mobile phone inventory software.",
      content: `# ${appName} Architecture

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "inventory_system"}
domainId: ${brief?.domainId ?? "mobile_phone_shop"}
Stack: Python / Streamlit
Preview Type: python_app_preview

This is inventory management software for a mobile phone shop, not promotional brochure output.

## Modules

- Dashboard
- Products
- Stock
- Sales
- Suppliers
- Repairs / service tickets
- Billing

## Entities

- product
- brand
- stock
- supplier
- sale
- repairTicket
- invoice

## Planned boundaries

- Auth is not implemented in this phase.
- Database persistence is not implemented in this phase.
- Payment provider integration is not implemented in this phase.
- Runtime execution requires explicit approval and Python runtime support.
`
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: "Adds safety and verification notes for the inventory scaffold.",
      content: `# ${appName} Security And Testing

- Keep supplier, payment, and customer credentials out of generated files.
- Treat mock inventory data as preview-only.
- Add ownership checks before future database writes.
- Do not auto-install packages.
- Do not auto-start Streamlit.
- Verify future Python runtime support through an approved runtime flow.
`
    },
    {
      path: "HASSALI.md",
      summary: "Adds the human-readable CODE contract for the mobile phone inventory software.",
      content: `# HASSALI.md

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "inventory_system"}
domainId: ${brief?.domainId ?? "mobile_phone_shop"}
requestedStack: ${brief?.requestedStack ?? "unknown"}
preferredFramework: ${brief?.preferredFramework ?? "streamlit"}
Stack: Python / Streamlit
Domain: Mobile Phone Shop
Project description: Inventory management software for a mobile phone shop
Preview Type: python_app_preview
previewStrategy: ${brief?.previewStrategy ?? "python_streamlit_summary_until_runtime_enabled"}
runtimePolicy: explicit_user_start_only

Current prompt outranks stale contract memory.

modulesIncluded: ${(brief?.modules ?? ["dashboard", "products", "stock", "sales", "suppliers", "repairs", "billing"]).join(", ")}
entitiesIncluded: ${(brief?.entities ?? ["product", "brand", "stock", "supplier", "sale", "repairTicket", "invoice"]).join(", ")}

filePlan:
${(brief?.filePlan ?? []).map((file) => `- ${file.path}: ${file.purpose}`).join("\n") || "- app.py: Streamlit inventory dashboard\n- data/mock_inventory_data.py: inventory mock data"}

nonGoals:
${(brief?.nonGoals ?? ["No package install during approval.", "No runtime process auto-start.", "No promotional brochure substitution."]).map((note) => `- ${note.replace(/public marketing website/gi, "promotional brochure").replace(/\bwebsite\b/gi, "brochure")}`).join("\n")}

Runtime:
- Python runtime is not auto-started.
- Package installation requires future explicit approval.
- Preview should be summary-only unless Python runtime support is explicitly approved.
`
    }
  ];
}

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hassali-crm";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapePython(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

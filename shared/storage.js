// Shared data model + storage helpers.
// Used by background service worker, popup, and options page (all ES module contexts).

export const STORAGE_KEY = "workflows";
export const LOGS_KEY = "workflow_logs";

export const STEP_TYPES = {
  click: { label: "Click element", needs: ["selector"], group: "Interaction" },
  focus: { label: "Focus element", needs: ["selector"], group: "Interaction" },
  check: { label: "Check / uncheck", needs: ["selector", "value"], group: "Interaction" },
  setText: { label: "Type text", needs: ["selector", "value"], group: "Interaction" },
  clearField: { label: "Clear field", needs: ["selector"], group: "Interaction" },
  selectOption: { label: "Select option", needs: ["selector", "value"], group: "Interaction" },
  pressKey: { label: "Press Key", needs: ["selector", "value"], group: "Interaction" },

  waitFor: { label: "Wait for element", needs: ["selector", "delayMs"], group: "Wait & Flow" },
  waitVisible: { label: "Wait for element to be visible", needs: ["selector", "delayMs"], group: "Wait & Flow" },
  waitInvisible: { label: "Wait for element to be invisible", needs: ["selector", "delayMs"], group: "Wait & Flow" },
  wait: { label: "Wait (delay)", needs: ["delayMs"], group: "Wait & Flow" },
  waitNetworkIdle: { label: "Wait for Network Idle", needs: ["value", "delayMs"], group: "Wait & Flow" },
  comment: { label: "Comment", needs: ["value"], group: "Wait & Flow" },
  runWorkflow: { label: "Run Workflow (Nested)", needs: ["value"], proFeature: "advanced", group: "Wait & Flow" },
  sendWebhook: { label: "Send Webhook", needs: ["value", "selector"], proFeature: "advanced", group: "Wait & Flow" },

  extractText: { label: "Extract Text", needs: ["selector", "value"], proFeature: "variables", group: "Data & Variables" },
  calculateMath: { label: "Calculate Math", needs: ["value", "selector"], proFeature: "variables", group: "Data & Variables" },
  exportData: { label: "Export Variables", needs: ["value"], proFeature: "variables", group: "Data & Variables" },
  append_row: { label: "Save Variables to Table Row", needs: ["selector", "value"], proFeature: "advanced", group: "Data & Variables" },
  export_table: { label: "Export Table as CSV", needs: ["value"], proFeature: "advanced", group: "Data & Variables" },
  load_csv: { label: "Load CSV Data", needs: ["value"], proFeature: "advanced", group: "Data & Variables" },
  mark_row_processed: { label: "Mark Row as Processed", needs: [], proFeature: "advanced", group: "Data & Variables" },

  navigate: { label: "Navigate to URL", needs: ["value"], group: "Browser" },
  screenshot: { label: "Take Screenshot", needs: ["value"], group: "Browser" },

  if_exists: { label: "If Element Exists", needs: ["selector"], proFeature: "conditions", group: "Logic & Loops" },
  if_not_exists: { label: "If Element Does Not Exist", needs: ["selector"], proFeature: "conditions", group: "Logic & Loops" },
  if_variable: { label: "If Variable", needs: ["selector", "selectorType", "value"], proFeature: "conditions", group: "Logic & Loops" },
  else: { label: "Else", needs: [], proFeature: "conditions", group: "Logic & Loops" },
  end_if: { label: "End If", needs: [], proFeature: "conditions", group: "Logic & Loops" },
  loop: { label: "Loop Container", needs: [], proFeature: "loops", group: "Logic & Loops" }
};

export const STEP_GROUPS = [
  {
    label: "Page Interaction",
    types: ["navigate", "click", "focus", "setText", "clearField", "check", "selectOption", "pressKey"]
  },
  {
    label: "Waiting",
    types: ["wait", "waitFor", "waitVisible", "waitInvisible", "waitNetworkIdle", "comment"]
  },
  {
    label: "Data Extraction",
    types: ["extractText", "calculateMath"]
  },
  {
    label: "Data Table (CSV)",
    types: ["load_csv", "append_row", "mark_row_processed", "export_table"]
  },
  {
    label: "Export & Output",
    types: ["exportData", "screenshot", "sendWebhook"]
  },
  {
    label: "Conditions",
    types: ["if_exists", "if_not_exists", "if_variable", "else", "end_if"]
  },
  {
    label: "Loops",
    types: ["loop"]
  },
  {
    label: "Advanced",
    types: ["runWorkflow"]
  }
];

export const COMPARISON_OPERATORS = {
  "==": { label: "Equals (==)" },
  "!=": { label: "Not Equals (!=)" },
  ">": { label: "Greater Than (>)" },
  "<": { label: "Less Than (<)" },
  ">=": { label: "Greater or Equal (>=)" },
  "<=": { label: "Less or Equal (<=)" },
  "includes": { label: "Contains text" },
  "not_includes": { label: "Does not contain text" }
};

// How the `selector` string should be interpreted to find the target element.
export const SELECTOR_TYPES = {
  css: { label: "CSS selector", placeholder: "#id, .class, [name=...]" },
  id: { label: "Element ID", placeholder: "exact id (no #)" },
  name: { label: "Name attribute", placeholder: "value of name=\"...\"" },
  xpath: { label: "XPath", placeholder: "//button[@type='submit']" },
  text: { label: "Visible text", placeholder: "exact text of the element" }
};

export const DEFAULT_SELECTOR_TYPE = "css";

export function newId() {
  return "wf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function newWorkflow(name = "Untitled workflow") {
  return {
    id: newId(),
    name,
    folder: "",
    sites: [],
    autoRun: false,
    maxRetries: 3,
    scheduleInterval: 0,
    scheduleUrl: "",
    shortcut: "",
    variables: [],
    steps: []
  };
}

export function newStep(type = "click") {
  const step = {
    type,
    selectorType: DEFAULT_SELECTOR_TYPE,
    selector: "",
    value: "",
    parseNumeric: false,
    optional: false,
    delayMs: type === "wait" ? 1000 : 0
  };
  
  if (type === "loop") {
    step.mode = "repeat"; // 'repeat', 'whileExists'
    step.count = 5;
    step.steps = [];
  }
  
  return step;
}

export async function getWorkflows() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = data[STORAGE_KEY];
  return Array.isArray(list) ? list : [];
}

export async function saveWorkflows(workflows) {
  await chrome.storage.local.set({ [STORAGE_KEY]: workflows });
}

export async function getWorkflow(id) {
  const list = await getWorkflows();
  return list.find((w) => w.id === id) || null;
}

export async function upsertWorkflow(workflow) {
  const list = await getWorkflows();
  const idx = list.findIndex((w) => w.id === workflow.id);
  if (idx === -1) {
    list.push(workflow);
  } else {
    list[idx] = workflow;
  }
  await saveWorkflows(list);
  return workflow;
}

export async function deleteWorkflow(id) {
  const list = await getWorkflows();
  await saveWorkflows(list.filter((w) => w.id !== id));
}

// ---- Logs -----------------------------------------------------------------

export async function getLogs() {
  const data = await chrome.storage.local.get(LOGS_KEY);
  const list = data[LOGS_KEY];
  return Array.isArray(list) ? list : [];
}

export async function addLog(entry) {
  const list = await getLogs();
  list.unshift({ ...entry, id: newId(), timestamp: Date.now() });
  if (list.length > 500) {
    list.length = 500;
  }
  await chrome.storage.local.set({ [LOGS_KEY]: list });
}

export async function clearLogs() {
  await chrome.storage.local.remove(LOGS_KEY);
}

// ---- Site pattern helpers -------------------------------------------------
// Accepts forms like "https://example.com/*", "example.com", "*://*.example.com/*".
export function siteToMatchPattern(site) {
  let s = (site || "").trim();
  if (!s) return null;
  if (!/^[a-z*]+:\/\//i.test(s)) {
    // No scheme provided: assume any scheme.
    s = "*://" + s;
  }
  if (!/\/.*/.test(s.replace(/^[a-z*]+:\/\//i, ""))) {
    // No path provided: match all paths.
    s = s.replace(/\/+$/, "") + "/*";
  }
  return s;
}

// Derive the origin form chrome.permissions expects, e.g. "https://example.com/*".
export function siteToOrigin(site) {
  const pattern = siteToMatchPattern(site);
  if (!pattern) return null;
  return pattern;
}

// Test whether a URL matches a stored site pattern.
export function urlMatchesSite(url, site) {
  const pattern = siteToMatchPattern(site);
  if (!pattern) return false;
  const m = pattern.match(/^([a-z*]+):\/\/([^/]+)(\/.*)?$/i);
  if (!m) return false;
  const [, scheme, host, path = "/*"] = m;
  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (scheme !== "*" && scheme !== target.protocol.replace(":", "")) return false;
  if (!hostMatches(host, target.hostname)) return false;
  if (!globMatches(path, target.pathname + target.search)) return false;
  return true;
}

function hostMatches(pattern, host) {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host === base || host.endsWith("." + base);
  }
  return pattern === host;
}

function globMatches(pattern, value) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$").test(value);
}

// ---- Keyboard shortcut helpers -------------------------------------------

// Modifier-only keys that should NOT count as the main key.
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/**
 * Convert a KeyboardEvent into a canonical shortcut string
 * like "Ctrl+Shift+K" or "F2".  Returns "" for modifier-only presses.
 */
export function formatShortcut(e) {
  if (MODIFIER_KEYS.has(e.key)) return "";
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  let key = e.key;
  // Normalise common display names.
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/**
 * Parse a canonical shortcut string back into an object for matching.
 * Returns { ctrl, alt, shift, meta, key } where key is the normalised key name.
 */
export function parseShortcut(str) {
  if (!str) return null;
  const parts = str.split("+");
  const key = parts.pop(); // last token is always the main key
  return {
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
    key
  };
}

// ---- Settings -------------------------------------------------------------

export const SETTINGS_KEY = "settings";

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return data[SETTINGS_KEY] || {
    revealPasswords: "off", // "off", "all", "site"
    revealSites: [],
    marketplaceUrl: "http://localhost:4000"
  };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

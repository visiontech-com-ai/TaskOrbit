# 🚀 TaskOrbit (Chrome Extension)

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue.svg)](#)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful Manifest V3 Chrome extension that runs configurable automation **workflows** on the sites you choose.

Each workflow is an ordered list of steps such as clicking an element, typing text into a field, selecting a dropdown option, extracting data, or firing a webhook. Workflows can be **recorded** by interacting with a page and/or **hand-edited**. You can run them **manually** from the popup, **automatically on page load**, or on a **recurring schedule**.

## ✨ Features

- **Rich Step Library:** `click`, `type text`, `select option`, `press key`, `wait for element`, `wait (delay)`, `wait for network idle`, `navigate`, `take screenshot`, `extract text`, `export variables`, `run nested workflow`, `send webhook`, `if element exists / end if`.
- **Live Recording:** Build workflows by interacting directly with a webpage (clicks, typing, key presses all captured), then refine them in the editor.
- **Auto-run & Manual Execution:** Run manually from the popup, auto-run on page load, or trigger via keyboard shortcut.
- **Scheduler:** Set a workflow to run every N minutes in the background — it opens a background tab, executes, and closes automatically.
- **Conditional Logic:** Branch your workflow with `If Element Exists` / `If Not Exists` / `End If` markers.
- **Workflow Variables:** Define named variables with defaults; override them at run time from a prompt.
- **Nested Workflows:** Call any other saved workflow as a step, sharing the same runtime variable scope.
- **Data Extraction & Math:** Scrape text from the page into variables (with an option to parse strictly as numbers), run math calculations (`Calculate Math` step), and export variables to CSV/JSON.
- **Password Reveal Tool:** A standalone utility built into the extension. Right-click any password to reveal it, or configure TaskOrbit to automatically unmask passwords on all or specific sites.
- **Retry & Error Handling:** Set per-workflow max retries; mark individual steps as Optional to skip failures gracefully.
- **Smart Feedback:** A sleek floating Progress Overlay shows per-step status in real time, and a Smart Activation Toast elegantly notifies you when background automation engages.
- **Inline Validation:** The editor highlights misconfigured steps before saving.
- **Workflow Duplication:** Clone any workflow with one click from the sidebar.
- **Selective Import / Export:** Export any subset of workflows to JSON; re-import them with collision-safe ID generation.
- **Privacy-First Permission Model:** Least-privilege host permissions, granted per workflow. All data stored locally in `chrome.storage.local`. Nothing sent to external servers.
- **Zero Dependencies:** Plain HTML/CSS/JS (ES modules). No build step required!

---

## 🚀 Installation (Load Unpacked)

Since this is a developer version without a build step, you can load it directly into Chrome:

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Enable **Developer mode** (the toggle in the top-right corner).
3. Click **Load unpacked** and select this project folder (the directory containing `manifest.json`).
4. The **TaskOrbit** icon will appear in your toolbar. Pin it for easy access.

---

## 🛠️ Usage Guide

### 1. Create a Workflow
1. Click the toolbar icon to open the popup, then click **+ New** (opens the Options page editor).
2. Give it a name. Optionally, set a **Folder**, add **site patterns** (e.g. `https://example.com/*`), and toggle **Auto-run**.
3. Click **Grant access to listed sites** to enable auto-run or background execution.

### 2. Add Steps (Two Ways)
- **Record:** In the popup, click **Record** on a workflow, interact with the current page (clicks, typing, key presses are captured), then reopen the popup and click **Stop & Save**.
- **Manual:** In the editor, choose a step type and click **Add step**, then configure the selector, value, and options. Drag the **⠿** handle to reorder steps.

### 3. Element Finding Strategies

| Strategy | Selector field holds | Resolves with |
| :--- | :--- | :--- |
| `CSS selector` | `#id`, `.class`, `[name=...]` | `document.querySelector` |
| `Element ID` | The exact ID (no `#`) | `document.getElementById` |
| `Name attribute` | Value of `name="..."` | `document.getElementsByName` |
| `XPath` | e.g. `//button[@type='submit']` | `document.evaluate` |
| `Visible text` | The element's exact visible text | Text match (deepest element wins) |

### 4. Run a Workflow
- **Manually:** Open the popup on the target tab and click **Run**.
- **Automatically:** Enable **Auto-run**, add matching site patterns, and grant access.
- **Scheduled:** Set a **Run every X minutes** interval and a **Start URL** in the workflow editor. TaskOrbit will handle the rest in the background.

---

## 📖 Step Reference

| Step Type | Key Fields | Behavior |
| :--- | :--- | :--- |
| `click` | `selector` | Waits for element, scrolls into view, clicks it. |
| `type text` | `selector`, `value` | Sets field value, fires `input`/`change` events. |
| `set text` | `selector`, `value` | Directly sets `.value` on a field. |
| `select option` | `selector`, `value` | Sets a `<select>` by option value or text. |
| `check` | `selector`, `value` | Checks/unchecks a checkbox. |
| `press key` | `selector` (opt.), `key`, modifiers | Dispatches `keydown`/`keypress`/`keyup`. |
| `wait for` | `selector`, `timeout` | Polls until element exists or timeout elapses. |
| `wait visible` | `selector`, `timeout` | Polls until element is visible/interactable. |
| `wait` | `delay` | Pauses for the given milliseconds. |
| `wait for network idle` | `idle duration`, `timeout` | Waits until all fetch/XHR activity stops for the idle duration. |
| `navigate` | `value (URL)` | Navigates current tab to the URL. |
| `take screenshot` | `value (prefix)` | Saves a PNG to `taskorbit_screenshots/`. |
| `extract text` | `selector`, `variable name` | Reads element text/value into a runtime variable. Can optionally strip non-numeric characters. |
| `calculate math` | `expression`, `variable name` | Evaluates a math expression (e.g. `{{price}} * 2`) and saves the result to a variable. |
| `export variables` | `format (csv/json)` | Downloads all variables to `taskorbit_exports/`. |
| `send webhook` | `URL`, `Authorization` | POSTs `{ timestamp, variables }` to an external endpoint. |
| `run workflow` | workflow dropdown | Executes another workflow, sharing the same variables. |
| `if element exists` | `selector` | Skips to `end if` if element is not found. |
| `if not exists` | `selector` | Skips to `end if` if element is found. |
| `end if` | — | Marks the end of a conditional block. |

---

## 🔒 Permission Model

- **`activeTab`**: Covers manual runs and recording; no extra grant needed for one-off use.
- **`optional_host_permissions` (`*://*/*`)**: Requested per workflow via **Grant access**. Required for auto-run, shortcuts, and scheduled execution.
- **`alarms`**: Used for the scheduler feature to wake up the background worker.
- **`downloads`**: Used to save screenshots and exported variable files.
- **Local Storage**: All workflows are stored locally in `chrome.storage.local`.

---

## ⚠️ Limitations

- **Brittle Selectors:** Auto-generated selectors are best-effort. If a page changes structure, edit the selector manually.
- **SPAs:** You may need a `wait for element` or `wait for network idle` step before interacting with dynamically rendered content.
- **Iframes:** Cross-origin iframes are not currently supported.
- **Restricted Pages:** Cannot run on `chrome://` URLs or the Chrome Web Store.

---

## 📂 Project Structure

```text
├── manifest.json         # MV3 manifest
├── background.js         # Service worker: routing, injection, auto-run, scheduler
├── shared/
│   └── storage.js        # Data model, step types, storage helpers
├── content/
│   ├── executor.js       # Injected step runner + live progress overlay
│   ├── recorder.js       # Injected interaction recorder (clicks, typing, key presses)
│   ├── interceptor.js    # Injected script to monitor network idle states
│   ├── toast.js          # Smart activation notification toast
│   └── autoReveal.js     # Background password reveal observer
├── popup/                # Toolbar popup UI (list, run, record)
└── options/              # Full workflow editor UI (steps, variables, sites, import/export)
```

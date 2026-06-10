# TaskOrbit Lite vs Pro Strategy and Architecture Plan

## 1. Product Strategy

The core strategy for TaskOrbit is a "Freemium with Visible Upsell" model. TaskOrbit Lite is designed to be fully functional for basic browser automation—providing enough value to be genuinely useful for small, linear tasks, establishing trust, and demonstrating the platform's reliability. 

TaskOrbit Pro unlocks the "Turing-complete" automation capabilities (loops, variables, conditions) and scaling features (unlimited workflows, CSV processing, smart deduplication) required by power users, QA engineers, data entry specialists, and organizations.

**Key Principles:**
- **No Crippleware**: The Lite features must work flawlessly. The user should never feel tricked into a broken experience.
- **Ambient Awareness**: Pro features are always visible but locked (e.g., in dropdowns with a 🔒 icon). This drives natural discovery without intrusive popups.
- **In-Context Upselling**: Upgrade prompts only appear contextually when a user attempts to exceed a limit or use a Pro feature.
- **Single Codebase**: Both editions run from the exact same codebase to drastically reduce maintenance overhead.

---

## 2. Chrome Web Store Strategy

**Approach: Single Extension with In-App Upgrade via License Activation**

* **Pros**: 
  - Centralized user base and review aggregation (boosts Web Store ranking).
  - No need to maintain two separate listings, update cycles, and support channels.
  - Frictionless upgrade path for users—no need to uninstall Lite and install Pro; they simply enter a license key.
  - Easier migration of existing user data (since they remain in the same extension storage context).
* **Cons**:
  - Code bundle size is slightly larger for free users (negligible).
  - Requires a secure local license validation architecture.

---

## 3. Architecture Design (Implemented)

The architecture relies on a central **Capability Manager** (`shared/capabilities.js`) that sits between the UI/Executor and the Core Logic.

1. **License Service** (`shared/license.js`): Validates the license key against an external API and caches a cryptographically signed JWT payload locally. Supports offline grace periods.
2. **Capability Engine** (`shared/capabilities.js`): Reads the current license tier (Lite, Pro) and exposes a boolean map of allowed features.
3. **UI Adapters** (`options/options.js`): The Options page reads the Capability Engine to determine whether to lock UI elements with 🔒 icons and show upgrade modals.
4. **Execution Guards** (`background.js`): The Background script double-checks the Capability Engine before running workflows to prevent users from manually editing JSON to bypass UI locks.

---

## 4. Project Structure

```text
TaskOrbit/
├── manifest.json               # Extension manifest (Manifest V3)
├── background.js               # Service worker: routing, scheduling, alarms, license checks
├── sandbox.html / sandbox.js   # Sandboxed math expression evaluator
├── shared/
│   ├── storage.js              # Data model, STEP_TYPES (with groups), CRUD helpers
│   ├── capabilities.js         # Feature flag definitions and tier logic
│   └── license.js              # License validation, JWT verification, offline caching
├── content/
│   ├── executor.js             # Core workflow execution engine (loops, conditions, CSV, Memory Bank)
│   ├── recorder.js             # Live action recording
│   ├── toast.js                # Execution progress overlay
│   ├── interceptor.js          # Network request monitoring
│   └── autoReveal.js           # Password reveal injection
├── popup/
│   ├── popup.html / popup.js   # Browser toolbar popup UI
│   └── popup.css
├── options/
│   ├── options.html            # Full workflow editor page
│   ├── options.js              # Visual builder, JSON editor, settings, logs
│   └── options.css
├── backend/                    # Licensing API server (Express + SQLite3 + JWT)
└── docs/
    └── LITE_VS_PRO_PLAN.md     # This document
```

---

## 5. Feature Flag Implementation (Implemented)

**`shared/capabilities.js`**

```javascript
const TIER_CAPABILITIES = {
  LITE: {
    maxWorkflows: 3,
    maxSteps: 10,
    allowAutoRun: false,
    allowLoops: false,
    allowVariables: false,
    allowConditions: false,
    allowDataProcessing: false  // CSV, Export, Webhooks, Nested Workflows
  },
  PRO: {
    maxWorkflows: Infinity,
    maxSteps: Infinity,
    allowAutoRun: true,
    allowLoops: true,
    allowVariables: true,
    allowConditions: true,
    allowDataProcessing: true
  }
};
```

---

## 6. Complete Feature Matrix

| Feature | Lite (Free) | Pro |
| :--- | :---: | :---: |
| **Workflows** | Up to 3 | Unlimited |
| **Steps per workflow** | Up to 10 | Unlimited |
| **Live Recording** | ✅ | ✅ |
| **Visual Drag-and-Drop Editor** | ✅ | ✅ |
| **Inline JSON Editor** | ✅ | ✅ |
| **Grouped Step Categories** | ✅ | ✅ |
| **Import/Export (JSON)** | ✅ | ✅ |
| **Workflow Folders** | ✅ | ✅ |
| **Keyboard Shortcuts** | ✅ | ✅ |
| **Execution Logs** | ✅ | ✅ |
| **Password Reveal** | ✅ | ✅ |
| **Navigate to URL** | ✅ | ✅ |
| **Take Screenshot** | ✅ | ✅ |
| **Click / Type / Select / Check** | ✅ | ✅ |
| **Press Key** | ✅ | ✅ |
| **Wait / Wait for Element / Network Idle** | ✅ | ✅ |
| **Auto-Run on Page Load** | ❌ | ✅ |
| **Background Scheduling** | ❌ | ✅ |
| **Variables & Extraction** | ❌ | ✅ |
| **Calculate Math** | ❌ | ✅ |
| **Export Variables (CSV/JSON)** | ❌ | ✅ |
| **If/Else Conditions** | ❌ | ✅ |
| **If Variable (with operators)** | ❌ | ✅ |
| **Loop Container** | ❌ | ✅ |
| **For Each Element** | ❌ | ✅ |
| **For Each Data Row** | ❌ | ✅ |
| **Load CSV Data** | ❌ | ✅ |
| **Save to Table Row** | ❌ | ✅ |
| **Export Table as CSV** | ❌ | ✅ |
| **Mark Row as Processed** | ❌ | ✅ |
| **Smart Deduplication (Memory Bank)** | ❌ | ✅ |
| **Run Workflow (Nested)** | ❌ | ✅ |
| **Send Webhook** | ❌ | ✅ |

---

## 7. Licensing Architecture (Implemented)

The licensing system is fully operational:

1. **Activation**: User enters an email and License Key (format: `TO-XXXX-XXXX-XXXX`) in the Settings panel.
2. **Validation**: Extension sends a request to the activation API.
3. **Signed Payload**: The API responds with a JWT (JSON Web Token) containing the tier, expiry, and a cryptographic signature.
4. **Local Verification**: `license.js` verifies the JWT signature locally using a hardcoded public key.
5. **Periodic Checks**: A Chrome Alarm triggers the background worker every 60 minutes to silently validate the license hasn't been revoked.
6. **Offline Tolerance**: If the user is offline, the extension relies on the cached JWT until its expiration date, with a 7-day grace period.
7. **License Binding**: Each key is bound 1:1 to an email/device ID to prevent sharing.

### UI Implementation
- **Settings Panel**: Contains tier badge (LITE/PRO), email and key inputs, Activate button, and Remove License button.
- **Activate Button**: Auto-disables and greys out when a Pro license is already active.
- **Upgrade Modal**: Appears contextually when a Lite user attempts to use a locked feature, with inline license activation.

---

## 8. Step Type Grouping (Implemented)

Steps in the dropdown are organized into logical `<optgroup>` categories:

| Group | Steps |
| :--- | :--- |
| **Interaction** | Click, Focus, Type text, Clear field, Select option, Check/uncheck, Press Key |
| **Wait & Flow** | Wait (delay), Wait for element, Wait visible, Wait invisible, Wait Network Idle, Run Workflow, Send Webhook |
| **Data & Variables** | Extract Text, Calculate Math, Export Variables, Load CSV Data, Save to Table Row, Export Table as CSV, Mark Row as Processed |
| **Browser** | Navigate to URL, Take Screenshot |
| **Logic & Loops** | If Element Exists, If Element Does Not Exist, If Variable, Else, End If, Loop Container |

Pro-only steps display a 🔒 icon and "(Pro)" suffix in the dropdown.

---

## 9. Smart Deduplication System (Implemented)

### Memory Bank Architecture

Each workflow has an isolated memory bank stored at key `memory_bank_{workflowId}` in `chrome.storage.local`. It contains an array of string identifiers (hashes or unique keys).

**Scraping Deduplication (`append_row`)**:
- User specifies a **Unique Key** field (e.g., `{{url}}`), mapped to `step.selector`.
- Before appending a row, the engine checks if the key exists in the Memory Bank.
- If found → skip silently. If new → append row and add key to bank.

**Data Injection Deduplication (`forEachRow`)**:
- Before processing each CSV row, the engine computes a SHA-256 hash of the row's JSON representation.
- If the hash exists in the Memory Bank → skip the row automatically.
- This enables crash-recovery: re-running a workflow skips already-processed rows.

**Manual Marking (`mark_row_processed`)**:
- Placed at the end of a loop body as an explicit checkpoint.
- Hashes the current row and saves it to the Memory Bank.

**Reset**: The red **Clear Memory Bank** button in the workflow editor footer clears `memory_bank_{workflowId}` from local storage.

---

## 10. Implementation Status

### ✅ Phase 1: Core Capabilities Foundation — COMPLETE
- [x] Created `shared/capabilities.js` with `TIER_CAPABILITIES`.
- [x] Created `shared/license.js` with JWT validation and offline caching.
- [x] Updated `options.html` and `options.js` to render 🔒 icons dynamically.

### ✅ Phase 2: Feature Locking — COMPLETE
- [x] **Limits Guard**: `onNew` and `onImport` check `maxWorkflows`.
- [x] **Step Count Guard**: Prevents adding steps beyond the limit.
- [x] **Advanced Features Guard**: Auto-run checkbox, locked step types, upgrade modal triggers.
- [x] **Execution Guard**: `background.js` aborts execution if Lite user runs a workflow with Pro steps.

### ✅ Phase 3: Upgrade UI & UX — COMPLETE
- [x] Built the Upgrade Modal component with inline license activation.
- [x] Integrated upgrade triggers on all locked interaction points.
- [x] Built the License & Tier UI inside Global Settings view.
- [x] Activate button auto-disables when Pro is already active.

### ✅ Phase 4: Backend & Licensing Integration — COMPLETE
- [x] Express API server with rate limiting and JWT issuance.
- [x] SQLite3 database for license key storage.
- [x] Admin dashboard at `/admin` with key management.
- [x] Docker orchestration with volume persistence.
- [x] Periodic license validation via Chrome Alarms (60-minute interval).

### ✅ Phase 5: Advanced Features — COMPLETE
- [x] Advanced branching logic (If Variable with full operator set).
- [x] CSV data processing (Load, iterate, scrape, export).
- [x] Smart deduplication via Memory Bank.
- [x] Inline JSON editor with validation.
- [x] Grouped step type categories.

### ✅ Phase 6: Interactive Debugger & Templates Gallery — COMPLETE
- [x] Step-by-Step Debugger (interactive execution, element highlighting, and variable inspector).
- [x] Workflow Templates Gallery (12 pre-built templates across 5 categories).

### 🔜 Phase 7: Planned
- [ ] Cron expression scheduling (replace basic interval logic).
- [ ] Marketplace (community hub to share and discover workflows).
- [ ] AI-assisted selector recovery.

# TaskOrbit Lite vs Pro Strategy and Architecture Plan

## 1. Product Strategy

The core strategy for TaskOrbit is a "Freemium with Visible Upsell" model. TaskOrbit Lite is designed to be fully functional for basic browser automation—providing enough value to be genuinely useful for small, linear tasks, establishing trust, and demonstrating the platform's reliability. 

TaskOrbit Pro unlocks the "Turing-complete" automation capabilities (loops, variables, conditions) and scaling features (unlimited workflows, CSV processing) required by power users, QA engineers, data entry specialists, and organizations.

**Key Principles:**
- **No Crippleware**: The Lite features must work flawlessly. The user should never feel tricked into a broken experience.
- **Ambient Awareness**: Pro features are always visible but locked (e.g., in dropdowns with a 🔒 icon). This drives natural discovery without intrusive popups.
- **In-Context Upselling**: Upgrade prompts only appear contextually when a user attempts to exceed a limit or use a Pro feature.
- **Single Codebase**: Both editions run from the exact same codebase to drastically reduce maintenance overhead.

---

## 2. Chrome Web Store Strategy

**Recommendation: Single Extension with In-App Upgrade via License Activation**

* **Pros**: 
  - Centralized user base and review aggregation (boosts Web Store ranking).
  - No need to maintain two separate listings, update cycles, and support channels.
  - Frictionless upgrade path for users—no need to uninstall Lite and install Pro; they simply enter a license key.
  - Easier migration of existing user data (since they remain in the same extension storage context).
* **Cons**:
  - Code bundle size is slightly larger for free users (negligible).
  - Requires a secure local license validation architecture.

*Alternative*: Separate Lite and Pro extensions. This is discouraged because migrating local `chrome.storage` data between two different extensions is notoriously difficult and error-prone, requiring complex export/import flows that frustrate users.

---

## 3. Architecture Design

The architecture relies on a central **Capability Manager** (`shared/capabilities.js`) that sits between the UI/Executor and the Core Logic.

1. **License Service**: Validates the license key against an external API and caches a cryptographically signed payload locally.
2. **Capability Engine**: Reads the current license tier (Lite, Pro, Developer) and exposes a boolean map of allowed features.
3. **UI Adapters**: The Options page and Popup read the Capability Engine to determine whether to lock UI elements.
4. **Execution Guards**: The Background script and Executor double-check the Capability Engine before running workflows to prevent users from manually editing JSON to bypass UI locks.

---

## 4. Folder Structure Changes

```text
D:\github\TaskOrbit\
├── docs/
│   └── LITE_VS_PRO_PLAN.md      <-- This document
├── shared/
│   ├── storage.js               <-- Unchanged (data access)
│   ├── capabilities.js          <-- NEW: Feature flag definitions and tier logic
│   └── license.js               <-- NEW: License validation and offline caching
├── options/
│   ├── upgrade/                 <-- NEW: UI components for upgrade flow
│   │   ├── upgrade.html
│   │   ├── upgrade.js
│   │   └── upgrade.css
│   ├── options.html
│   └── options.js               <-- Modified to handle UI locks
├── background/
│   ├── background.js            <-- Modified to add execution guards
│   └── licenseWorker.js         <-- NEW: Periodic background license validation
```

---

## 5. Feature Flag Implementation

**`shared/capabilities.js`**

```javascript
// Base feature flags
const TIER_CAPABILITIES = {
  LITE: {
    maxWorkflows: 3,
    maxSteps: 10,
    allowAutoRun: false,
    allowLoops: false,
    allowVariables: false,
    allowConditions: false,
    allowDataProcessing: false // CSV, Export
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

export async function getCapabilities() {
  const license = await getActiveLicense(); // from license.js
  return license && license.isValid ? TIER_CAPABILITIES.PRO : TIER_CAPABILITIES.LITE;
}

export async function canAddWorkflow(currentCount) {
  const caps = await getCapabilities();
  return currentCount < caps.maxWorkflows;
}
```

---

## 6. Licensing Architecture

To prevent simple bypassing, the licensing system must be robust but operate fully within the extension.

1. **Activation**: User enters a License Key (e.g., from LemonSqueezy or Gumroad).
2. **Validation**: Extension pings your activation API (`https://api.taskorbit.com/activate`).
3. **Signed Payload**: The API responds with a JWT (JSON Web Token) containing the tier, expiry, and a cryptographic signature.
4. **Local Verification**: `license.js` verifies the JWT signature locally using a hardcoded public key to prevent local spoofing.
5. **Periodic Checks**: A Chrome Alarm triggers `licenseWorker.js` once every 48 hours to silently ping the server to ensure the license hasn't been revoked/refunded.
6. **Offline Tolerance**: If the user is offline, the extension relies on the cached JWT until its `exp` (expiration) date is reached, ensuring no interruption during travel.

---

## 7. Storage Schema Examples

**Current Schema (Lite/Unlicensed):**
```json
{
  "settings": {
    "revealPasswords": "off",
    "licenseKey": null,
    "licenseData": null
  },
  "workflows": [
    { "id": "wf_1", "name": "Basic Login", "steps": [...] }
  ]
}
```

**Pro Schema (Activated):**
```json
{
  "settings": {
    "revealPasswords": "off",
    "licenseKey": "XXXX-YYYY-ZZZZ-AAAA",
    "licenseData": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5c...",
      "tier": "PRO",
      "status": "active",
      "lastChecked": 1717589234000,
      "offlineGraceEnds": 1718194034000
    }
  },
  "workflows": [
    // Unlimited workflows
  ]
}
```

---

## 8. Upgrade Workflow & UI Wireframes

### UI Concept: Step Type Dropdown

```text
[ Select Step Type ▼ ]
-----------------------
  Click Element
  Type Text
  Wait for Element
-----------------------
🔒 Loop Container (Pro)
🔒 If Element Exists (Pro)
🔒 Extract Variable (Pro)
```
*Action*: Clicking a `🔒 (Pro)` item does not close the dropdown, but triggers the Upgrade Modal.

### UI Concept: Upgrade Modal

```text
+-------------------------------------------------+
|               🚀 Unlock TaskOrbit Pro            |
|                                                 |
| Loops, variables, and auto-run are advanced     |
| features reserved for Pro users.                |
|                                                 |
| [✓] Unlimited Workflows                         |
| [✓] Logic & Variables                           |
| [✓] Auto-run Automation                         |
|                                                 |
|          [ Upgrade to Pro - $X/mo ]             |
|                                                 |
| Already purchased? [ Enter License Key ]        |
+-------------------------------------------------+
```

### UI Concept: Limit Reached Banner

When a Lite user clicks `+ New Workflow` and they already have 3:
```text
[ ! ] You've reached the limit of 3 workflows on the Lite plan. 
      [ Upgrade to Pro ] to create unlimited workflows.
```

---

## 9. Migration Plan from Current Version

Because the current version has no limits, existing users might already have more than 3 workflows or use loops.

**Strategy: Grandfathering vs. Hard Limit**
* **Recommended approach**: Enforce the limit gracefully.
  * If a user has 10 workflows upon the update, they *keep* all 10, but cannot create an 11th.
  * If a user has a workflow with a Loop, that workflow is flagged as `(Pro Required)`. It remains in their list but cannot be executed until they upgrade.
* **Onboarding Popup**: On the first run after the update, display a changelog explaining the new Lite/Pro split, thanking early adopters, and offering them a steep discount code (e.g., `EARLYADOPTER50`) for the first year.

---

## 10. Step-by-Step Implementation Roadmap

### Phase 1: Core Capabilities Foundation
- [ ] Create `shared/capabilities.js` and define `TIER_CAPABILITIES`.
- [ ] Create `shared/license.js` with mock validation logic (returning LITE by default).
- [ ] Update `options.html` and `options.js` to render the 🔒 icons dynamically based on capabilities.

### Phase 2: Feature Locking
- [ ] **Limits Guard**: Update `onNew` and `onImport` in `options.js` to check `maxWorkflows`.
- [ ] **Step Count Guard**: Prevent adding the 11th step.
- [ ] **Advanced Features Guard**: Disable the "Auto-run" checkbox in the UI. Prevent dropping locked step types into the workflow.
- [ ] **Execution Guard**: Update `background.js -> runWorkflow()` to abort execution if a Lite user attempts to run a workflow containing Pro steps.

### Phase 3: Upgrade UI & UX
- [ ] Build the Upgrade Modal component.
- [ ] Integrate upgrade triggers on all locked interaction points.
- [ ] Build the License Entry UI inside the Global Settings view.

### Phase 4: Backend & Licensing Integration
- [ ] Set up Merchant of Record (e.g., LemonSqueezy) for payment processing and license key generation.
- [ ] Implement actual JWT validation logic in `license.js`.
- [ ] Implement `licenseWorker.js` chrome alarm for periodic checks.

### Phase 5: Testing & Rollout
- [ ] Write integration tests for license downgrade (grace period expiry).
- [ ] Test migration of existing local storage.
- [ ] Publish to Web Store as an update.

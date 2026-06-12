// Injected on demand to execute a workflow's steps on the current page.
// Guarded so repeated injection does not register duplicate listeners.
(() => {
  if (window.__wfExecutorInstalled) return;
  window.__wfExecutorInstalled = true;
  window.__vf_emergency_stop = false;
  window.__debugMode = false;
  let __debugResolve = null; // Resolve function for the debug pause promise
  let __debugReject = null; // Reject function for the debug pause promise
  let activeSleepReject = null; // Reject function for the active sleep promise

  // ---- Network Interceptor Injection ----------------------------------------
  (function injectNetworkInterceptor() {
    if (document.getElementById('__vf_interceptor_script')) return;
    const script = document.createElement("script");
    script.id = "__vf_interceptor_script";
    script.src = chrome.runtime.getURL("content/interceptor.js");
    (document.head || document.documentElement).appendChild(script);
  })();

  const sleep = (ms) => new Promise((resolve, reject) => {
    if (window.__vf_emergency_stop) {
      reject(new Error("Emergency Stop"));
      return;
    }
    let timeout;
    const rejectFn = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
    activeSleepReject = rejectFn;
    timeout = setTimeout(() => {
      if (activeSleepReject === rejectFn) {
        activeSleepReject = null;
      }
      resolve();
    }, ms);
  });

  // ---- Live Progress Overlay -----------------------------------------------

  let progressOverlay = null;
  let progressItems = [];

  function createProgressOverlay(steps) {
    removeProgressOverlay();
    const overlay = document.createElement("div");
    overlay.id = "__vf_progress";
    overlay.style.cssText = [
      "position:fixed","top:16px","right:16px","z-index:2147483647",
      "background:rgba(15,18,30,.92)","color:#f0f0f0",
      "border-radius:12px","padding:14px 16px","min-width:240px","max-width:360px",
      "font:13px/1.5 system-ui,sans-serif","box-shadow:0 6px 32px rgba(0,0,0,.5)",
      "backdrop-filter:blur(6px)","border:1px solid rgba(255,255,255,.1)"
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;";

    const headerTitle = document.createElement("span");
    headerTitle.style.cssText = "font-weight:600;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#aab;";
    headerTitle.textContent = "TaskOrbit Running";
    header.appendChild(headerTitle);

    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.textContent = "■ Stop";
    stopBtn.style.cssText = [
      "all:unset","cursor:pointer","flex-shrink:0",
      "font:600 11px/1 system-ui,sans-serif","color:#fff",
      "background:linear-gradient(135deg,#f87171,#ef4444)",
      "padding:5px 10px","border-radius:6px",
      "box-shadow:0 1px 4px rgba(239,68,68,.5)"
    ].join(";");
    stopBtn.addEventListener("mouseenter", () => { stopBtn.style.filter = "brightness(1.1)"; });
    stopBtn.addEventListener("mouseleave", () => { stopBtn.style.filter = "none"; });
    stopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerEmergencyStop();
    });
    header.appendChild(stopBtn);

    overlay.appendChild(header);

    const TYPE_LABELS = {
      "click": "Click element",
      "typeText": "Type text",
      "setText": "Set text",
      "select": "Select Option",
      "check": "Check",
      "pressKey": "Press Key",
      "wait": "Wait (delay)",
      "waitFor": "Wait for Element",
      "waitVisible": "Wait Visible",
      "waitInvisible": "Wait Invisible",
      "waitNetwork": "Wait for Network Idle",
      "navigate": "Navigate to URL",
      "screenshot": "Take Screenshot",
      "extractText": "Extract Text",
      "calculateMath": "Calculate Math",
      "exportData": "Export Variables",
      "sendWebhook": "Send Webhook",
      "runWorkflow": "Run Workflow (Nested)",
      "if_exists": "If Element Exists",
      "if_not_exists": "If Not Exists",
      "end_if": "End If"
    };

    progressItems = steps.map((step, i) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:3px 0;";
      const icon = document.createElement("span");
      icon.style.cssText = "width:16px;text-align:center;flex-shrink:0;font-size:14px;";
      icon.textContent = "⏳";
      const label = document.createElement("span");
      label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#ccd;";
      const stepLabel = step.name || TYPE_LABELS[step.type] || step.type;
      const originalLabel = `${i + 1}. ${stepLabel}`;
      label.textContent = originalLabel;
      row.appendChild(icon);
      row.appendChild(label);
      overlay.appendChild(row);
      return { icon, label, originalLabel };
    });

    document.body.appendChild(overlay);
    progressOverlay = overlay;
  }

  function updateProgressStep(i, status, subtext = null) {
    if (!progressItems[i]) return;
    const { icon, label, originalLabel } = progressItems[i];
    if (status === "running") {
      icon.textContent = "🔄";
      label.style.color = "#fff";
      if (subtext) label.textContent = `${originalLabel} ${subtext}`;
    } else {
      label.textContent = originalLabel;
      if (status === "ok") {
        icon.textContent = "✅";
        label.style.color = "#7eff9a";
      } else if (status === "skipped") {
        icon.textContent = "⏭️";
        label.style.color = "#ffd86e";
      } else if (status === "fail") {
        icon.textContent = "❌";
        label.style.color = "#ff7070";
      }
    }
  }

  function removeProgressOverlay() {
    if (progressOverlay) {
      progressOverlay.remove();
      progressOverlay = null;
    }
    progressItems = [];
    
    // Also remove the smart toast when execution finishes
    const toast = document.getElementById("__to_smart_toast");
    if (toast) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(30px)";
      setTimeout(() => toast.remove(), 500);
    }
  }

  // ---- Smart Activation Toast -----------------------------------------------

  function showSmartActivationToast() {
    if (document.getElementById('__to_smart_toast')) return;

    const messages = [
      "🚀 TaskOrbit is working behind the scenes.",
      "⚡ Automation engaged. Sit back and relax.",
      "🎯 TaskOrbit has taken over the repetitive work.",
      "🤖 Workflow running smoothly.",
      "✨ Say thanks to Subho for reducing your work!",
      "💼 Less clicking, more productivity.",
      "🌍 Orbiting through tasks so you don't have to.",
      "🔄 TaskOrbit is automating your workflow.",
      "🧠 Smart automation is now active.",
      "🚀 Powered by TaskOrbit."
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];

    const toast = document.createElement("div");
    toast.id = "__to_smart_toast";
    toast.style.cssText = [
      "all: initial",
      "position: fixed", "bottom: 24px", "right: 24px", "z-index: 999999",
      "width: 350px", "height: auto", "padding: 16px 20px",
      "border-radius: 16px", "box-sizing: border-box",
      "background: linear-gradient(135deg, #0066ff, #00a2ff, #ff7b00, #ff9900)",
      "backdrop-filter: blur(10px)", "-webkit-backdrop-filter: blur(10px)",
      "border: 1px solid rgba(255, 255, 255, 0.2)",
      "box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 0 25px rgba(0,102,255,0.45), 0 0 35px rgba(255,123,0,0.35)",
      "color: #ffffff",
      "font-family: system-ui, -apple-system, sans-serif",
      "display: flex", "align-items: center", "gap: 12px",
      "opacity: 0", "transform: translateY(30px)",
      "transition: opacity 500ms ease, transform 500ms ease",
      "cursor: pointer"
    ].join(";");
    toast.innerHTML = `
      <div style="font-size: 24px; line-height: 1; filter: drop-shadow(0 0 4px rgba(255,255,255,0.6));">✨</div>
      <div style="flex: 1; display: flex; flex-direction: column; line-height: 1.4;">
        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9; margin-bottom: 2px; text-shadow: none; color: #ffffff;">Automation Active</span>
        <span id="__to_smart_toast_text" style="font-size: 14px; font-weight: 600; text-shadow: 0 0 8px rgba(255,255,255,0.5); color: #ffffff;">${text}</span>
      </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    // We no longer auto-dismiss the toast. 
    // It stays visible to show loop progress and is removed by removeProgressOverlay() when the workflow finishes.
    
    // Click to dismiss immediately
    toast.addEventListener('click', () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(30px)";
      setTimeout(() => toast.remove(), 500);
    });
  }

  function updateSmartToastText(text) {
    const el = document.getElementById("__to_smart_toast_text");
    if (el) el.textContent = text;
  }

  // ---- Debug Highlight Helpers -----------------------------------------------

  function highlightElement(el) {
    if (!el || !el.style) return;
    el.setAttribute("data-to-debug-highlight", "true");
    el.style.setProperty("outline", "3px solid #2563eb", "important");
    el.style.setProperty("outline-offset", "2px", "important");
    el.style.setProperty("box-shadow", "0 0 0 6px rgba(37,99,235,0.18)", "important");
  }

  function removeHighlight() {
    const el = document.querySelector('[data-to-debug-highlight]');
    if (!el) return;
    el.removeAttribute("data-to-debug-highlight");
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
    el.style.removeProperty("box-shadow");
  }

  function waitForDebugResume() {
    return new Promise((resolve, reject) => {
      __debugResolve = resolve;
      __debugReject = reject;
    });
  }
  // Step type labels for debug mode messages
  const STEP_TYPES_MAP = {
    click: "Click element", focus: "Focus element", check: "Check / uncheck",
    setText: "Type text", clearField: "Clear field", selectOption: "Select option",
    pressKey: "Press Key", waitFor: "Wait for element", waitVisible: "Wait visible",
    waitInvisible: "Wait invisible", wait: "Wait (delay)", waitNetworkIdle: "Wait Network Idle",
    navigate: "Navigate to URL", screenshot: "Take Screenshot", extractText: "Extract Text",
    calculateMath: "Calculate Math", exportData: "Export Variables", runWorkflow: "Run Workflow",
    sendWebhook: "Send Webhook", append_row: "Save to Table Row", export_table: "Export Table as CSV",
    load_csv: "Load CSV Data", mark_row_processed: "Mark Row Processed",
    if_exists: "If Element Exists", if_not_exists: "If Element Not Exists",
    if_variable: "If Variable", else: "Else", end_if: "End If", loop: "Loop Container",
    comment: "Comment"
  };

  function queryEl(step) {
    const selector = step.selector;
    if (!selector) return null;
    const type = step.selectorType || "css";
    try {
      switch (type) {
        case "id":
          return document.getElementById(selector);
        case "name": {
          const els = document.getElementsByName(selector);
          return els && els.length ? els[0] : null;
        }
        case "xpath": {
          const res = document.evaluate(
            selector,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          return res.singleNodeValue || null;
        }
        case "text": {
          const els = Array.from(document.body.querySelectorAll("*")).filter(
            (e) => e.children.length === 0 && e.textContent.trim() === selector
          );
          return els.length > 0 ? els[0] : null;
        }
        default:
          return document.querySelector(selector);
      }
    } catch (e) {
      console.warn("TaskOrbit queryEl failed:", e);
      return null;
    }
  }

  function queryEls(step) {
    const selector = step.selector;
    if (!selector) return [];
    const type = step.selectorType || "css";
    try {
      switch (type) {
        case "id": {
          const el = document.getElementById(selector);
          return el ? [el] : [];
        }
        case "name":
          return Array.from(document.getElementsByName(selector));
        case "xpath": {
          const res = document.evaluate(
            selector,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          const nodes = [];
          for (let i = 0; i < res.snapshotLength; i++) {
            nodes.push(res.snapshotItem(i));
          }
          return nodes;
        }
        case "text": {
          return Array.from(document.body.querySelectorAll("*")).filter(
            (e) => e.children.length === 0 && e.textContent.trim() === selector
          );
        }
        default:
          return Array.from(document.querySelectorAll(selector));
      }
    } catch (e) {
      console.warn("TaskOrbit queryEls failed:", e);
      return [];
    }
  }

  // Find the innermost element whose trimmed visible text equals `text`.
  function findByText(text) {
    const wanted = String(text).trim();
    const candidates = document.querySelectorAll(
      "a,button,[role='button'],input[type='submit'],input[type='button'],label,span,div,li,td,th,h1,h2,h3,h4,h5,h6,p,summary,option"
    );
    let match = null;
    for (const el of candidates) {
      const own = el.tagName === "INPUT" ? el.value : el.textContent;
      if ((own || "").trim() === wanted) {
        // Prefer the deepest match (fewest descendants) to avoid wrapper containers.
        if (!match || el.querySelectorAll("*").length < match.querySelectorAll("*").length) {
          match = el;
        }
      }
    }
    return match;
  }

  // Set a value in a way frameworks (React/Vue) detect by using the native setter.
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  // ---- Interactability helpers ---------------------------------------------

  /** True when the element is visible, has dimensions, and is not disabled. */
  function isInteractable(el) {
    if (!el) return false;
    if (el.disabled) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /**
   * Check whether `el` (or a descendant of it) is the topmost element at its
   * visual centre. Returns false when an overlay or modal is covering it.
   */
  function isTopmost(el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const top = document.elementFromPoint(cx, cy);
    if (!top) return false;
    return el === top || el.contains(top) || top.contains(el);
  }

  /** Wait until the element exists in the DOM. */
  async function waitForEl(step, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 5000);
    let el = queryEl(step);
    while (!el && Date.now() < deadline) {
      await sleep(100);
      el = queryEl(step);
    }
    return el;
  }

  /**
   * Wait until the element exists AND is interactable (visible, enabled,
   * has dimensions). Falls back to returning the element even if it never
   * becomes interactable so the caller can report a clear error.
   */
  async function waitForInteractable(step, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 5000);
    let el = null;
    while (Date.now() < deadline) {
      el = queryEl(step);
      if (el && isInteractable(el)) return el;
      await sleep(100);
    }
    return el; // may be null or non-interactable
  }

  // ---- Realistic event dispatch -------------------------------------------

  /** Dispatch a full mousedown → mouseup → click sequence at the element centre. */
  function dispatchClick(el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const shared = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
      button: 0
    };
    el.dispatchEvent(new MouseEvent("mousedown", shared));
    el.dispatchEvent(new MouseEvent("mouseup", shared));
    el.dispatchEvent(new MouseEvent("click", shared));
  }

  // ---- Retry helper -------------------------------------------------------

  let MAX_RETRIES = 3;
  const RETRY_WAIT_MS = 120;

  /**
   * Attempt an action up to MAX_RETRIES times.  `actionFn` receives the
   * element and should return true on success.  Between retries the element
   * is re-queried so DOM mutations are picked up.
   *
   * Fast path: if the element is already interactable and topmost on the
   * first attempt, no extra sleeps are added.
   */
  async function retryAction(step, timeoutMs, actionFn, label) {
    let el = await waitForInteractable(step, timeoutMs);
    if (!el) throw new Error("Element not found: " + step.selector);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (!isInteractable(el)) {
        await sleep(RETRY_WAIT_MS);
        el = queryEl(step);
        if (!el || !isInteractable(el)) continue;
      }
      el.scrollIntoView({ block: "center", behavior: "instant" });

      // Only pause for overlay on retries — skip on first attempt for speed.
      if (!isTopmost(el)) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_WAIT_MS);
          if (!isTopmost(el)) continue;
        }
        // Last attempt: proceed anyway.
      }

      const ok = actionFn(el);
      if (ok !== false) return; // success
      await sleep(RETRY_WAIT_MS);
      el = queryEl(step) || el;
    }

    // Final fallback.
    el.scrollIntoView({ block: "center", behavior: "instant" });
    actionFn(el);
  }

  // ---- Step execution -----------------------------------------------------

  function replaceVars(val, vars) {
    if (typeof val !== "string" || !vars) return val;
    return val.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
      return vars.hasOwnProperty(key) ? vars[key] : match;
    });
  }

  async function runStep(step, variables) {
    const type = step.type;
    switch (type) {
      case "wait": {
        await sleep(Number(step.delayMs) || 0);
        return;
      }
      case "navigate": {
        if (!step.value) throw new Error("navigate step has no URL");
        window.location.href = step.value;
        return;
      }
      case "waitFor": {
        const el = await waitForEl(step, Number(step.delayMs) || 5000);
        if (!el) throw new Error("Timed out waiting for " + step.selector);
        return;
      }
      case "waitVisible": {
        const el = await waitForInteractable(step, Number(step.delayMs) || 5000);
        if (!el || !isInteractable(el)) {
          throw new Error("Timed out waiting for element to be visible: " + step.selector);
        }
        return;
      }
      case "waitInvisible": {
        const timeoutMs = Number(step.delayMs) || 5000;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const el = queryEl(step);
          if (!el || !isInteractable(el)) return; // Success: it's invisible or gone
          await sleep(100);
        }
        throw new Error("Timed out waiting for element to be invisible: " + step.selector);
      }

      case "waitNetworkIdle": {
        const timeoutMs = Number(step.delayMs) || 10000;
        const stableMs = Number(step.value) || 500;
        const deadline = Date.now() + timeoutMs;
        let zeroStart = null;

        while (Date.now() < deadline) {
          const val = document.documentElement.getAttribute("data-vf-active-requests");
          if (val === "0" || val === null) {
            if (zeroStart === null) zeroStart = Date.now();
            else if (Date.now() - zeroStart >= stableMs) return; // stable!
          } else {
            zeroStart = null;
          }
          await sleep(50);
        }
        throw new Error(`Network did not reach idle state for ${stableMs}ms within ${timeoutMs}ms timeout.`);
      }

      case "click": {
        await retryAction(step, 5000, (el) => {
          dispatchClick(el);
          return true;
        }, "click");
        return;
      }
      case "focus": {
        await retryAction(step, 5000, (el) => {
          el.focus();
          return document.activeElement === el;
        }, "focus");
        return;
      }

      case "setText": {
        await retryAction(step, 5000, (el) => {
          el.focus();
          if (el.isContentEditable) {
            el.textContent = step.value || "";
          } else {
            setNativeValue(el, step.value || "");
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, "setText");
        return;
      }

      case "clearField": {
        await retryAction(step, 5000, (el) => {
          el.focus();
          if (el.isContentEditable) {
            el.textContent = "";
          } else {
            setNativeValue(el, "");
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, "clearField");
        return;
      }

      case "selectOption": {
        const el = await waitForInteractable(step, 5000);
        if (!el) throw new Error("Element not found: " + step.selector);
        if (el.tagName !== "SELECT") throw new Error("selectOption target is not a <select>");

        const wanted = String(step.value);
        let targetValue = null;

        // Find the matching option.
        for (const opt of Array.from(el.options)) {
          if (opt.value === wanted || opt.textContent.trim() === wanted) {
            targetValue = opt.value;
            break;
          }
        }
        if (targetValue === null) throw new Error("No option matched: " + step.value);

        // Set + verify with retries.
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          el.focus();
          el.value = targetValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));

          if (el.value === targetValue) return; // fast verify

          // Some frameworks reset the value; try setting via selectedIndex.
          for (let i = 0; i < el.options.length; i++) {
            if (el.options[i].value === targetValue) {
              el.selectedIndex = i;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
          if (el.value === targetValue) return;
          if (attempt < MAX_RETRIES) await sleep(RETRY_WAIT_MS);
        }
        return;
      }

      case "check": {
        const el = await waitForEl(step, 5000); // Do NOT wait for interactability, checkboxes are often visually hidden
        if (!el) throw new Error("Element not found: " + step.selector);
        const want = step.value === "" || String(step.value).toLowerCase() === "true";
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          if (el.checked === want) return;
          el.click(); // native click often toggles and fires events correctly even if hidden
          if (el.checked === want) return;
          
          // Fallback directly setting value and firing events
          el.checked = want;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          if (el.checked === want) return;
          
          await sleep(RETRY_WAIT_MS);
        }
        return;
      }

      case "screenshot":
        const res = await chrome.runtime.sendMessage({ 
          type: "takeScreenshot", 
          filename: step.value || "screenshot" 
        });
        if (res && !res.ok) throw new Error("Screenshot failed: " + res.error);
        break;

      case "append_row": {
        const row = {};
        const keysToSave = step.value ? step.value.split(',').map(k => k.trim()).filter(Boolean) : Object.keys(variables);
        keysToSave.forEach(k => {
          row[k] = variables[k] || "";
        });

        if (step.selector) {
          const uniqueKey = step.selector.trim();
          const memKey = `memory_bank_${window.__wfId}`;
          const data = await chrome.storage.local.get(memKey);
          const bank = data[memKey] || [];
          if (bank.includes(uniqueKey)) {
            console.log(`[TaskOrbit] append_row: Skipping duplicate key ${uniqueKey}`);
            return;
          }
          bank.push(uniqueKey);
          await chrome.storage.local.set({ [memKey]: bank });
        }

        window.__to_dataTable = window.__to_dataTable || [];
        window.__to_dataTable.push(row);
        return;
      }

      case "export_table": {
        const filename = step.value || `table_export_${Date.now()}.csv`;
        window.__to_dataTable = window.__to_dataTable || [];
        if (window.__to_dataTable.length === 0) throw new Error("Data table is empty. Nothing to export.");
        
        const keys = new Set();
        window.__to_dataTable.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
        const headers = Array.from(keys);
        
        let content = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
        for (const row of window.__to_dataTable) {
          content += headers.map(h => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",") + "\n";
        }
        
        const blob = new Blob([content], { type: "text/csv" });
        const reader = new FileReader();
        const dataUrl = await new Promise(resolve => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        
        const dlRes = await chrome.runtime.sendMessage({ 
          type: "downloadFile", 
          url: dataUrl,
          filename: filename.endsWith('.csv') ? filename : filename + '.csv'
        });
        if (dlRes && !dlRes.ok) throw new Error("Export table failed: " + dlRes.error);
        return;
      }

      case "load_csv": {
        let text = step.value || "";
        if (text.startsWith("http://") || text.startsWith("https://")) {
          try {
            const res = await fetch(text);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            text = await res.text();
          } catch (e) {
            throw new Error("Failed to fetch CSV URL: " + e.message);
          }
        }
        
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error("CSV data is empty");
        
        const parseLine = (line) => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
        const headers = parseLine(lines[0]);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = parseLine(lines[i]);
          const obj = {};
          headers.forEach((h, j) => obj[h] = vals[j] || "");
          rows.push(obj);
        }
        window.__to_dataRows = rows;
        return;
      }

      case "mark_row_processed": {
        const rowIdx = variables.loop_index;
        if (rowIdx === undefined || !window.__to_dataRows) throw new Error("Not inside a Data Row loop");
        const rowData = window.__to_dataRows[rowIdx];
        if (!rowData) return;
        
        const hashStr = await hashRow(rowData);

        const memKey = `memory_bank_${window.__wfId}`;
        const data = await chrome.storage.local.get(memKey);
        const bank = data[memKey] || [];
        if (!bank.includes(hashStr)) {
          bank.push(hashStr);
          await chrome.storage.local.set({ [memKey]: bank });
        }
        return;
      }

      case "exportData": {
        const format = (step.value || "csv").toLowerCase().trim();
        let content = "";
        let mime = "";
        let ext = "";
        if (format === "json") {
          content = JSON.stringify(variables, null, 2);
          mime = "application/json";
          ext = "json";
        } else {
          const keys = Object.keys(variables);
          content = "Key,Value\n" + keys.map(k => `"${k}","${String(variables[k]).replace(/"/g, '""')}"`).join("\n");
          mime = "text/csv";
          ext = "csv";
        }
        
        const blob = new Blob([content], { type: mime });
        const reader = new FileReader();
        const dataUrl = await new Promise(resolve => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        
        const dlRes = await chrome.runtime.sendMessage({ 
          type: "downloadFile", 
          url: dataUrl,
          filename: `export_${Date.now()}.${ext}`
        });
        if (dlRes && !dlRes.ok) throw new Error("Export failed: " + dlRes.error);
        return;
      }

      case "extractText": {
        const el = await waitForInteractable(step, 5000);
        if (!el) throw new Error("Element not found: " + step.selector);
        
        let text = "";
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          text = el.value;
        } else {
          text = el.textContent || "";
        }
        
        if (step.parseNumeric) {
          text = text.replace(/[^0-9.-]+/g, "");
          if (text === "") text = "0";
        }
        
        const varName = step.value;
        if (!varName) throw new Error("No variable name provided for extraction");
        
        variables[varName] = text.trim();
        return;
      }

      case "calculateMath": {
        const expr = step.value;
        const targetVar = step.selector;
        if (!expr) throw new Error("No math expression provided");
        if (!targetVar) throw new Error("No target variable provided for calculation");
        
        try {
          const result = await evaluateMathSafe(expr);
          if (typeof result !== "number" || isNaN(result)) {
            throw new Error("Expression did not evaluate to a valid number");
          }
          variables[targetVar] = String(result);
        } catch (e) {
          throw new Error("Failed to calculate math: " + e.message);
        }
        return;
      }

      case "runWorkflow": {
        const wfId = step.value;
        if (!wfId) throw new Error("No workflow ID provided for nested execution.");
        
        const data = await chrome.storage.local.get("workflows");
        const wfs = data.workflows || [];
        const subWf = wfs.find(w => w.id === wfId);
        if (!subWf) throw new Error("Workflow not found: " + wfId);
        
        const subResult = await executeSteps(subWf.steps, variables, MAX_RETRIES);
        if (!subResult.ok) {
           const failInfo = subResult.results[subResult.failedAt];
           const msg = failInfo ? (failInfo.error || failInfo.note) : "Unknown error";
           throw new Error("Nested workflow failed: " + msg);
        }
        return;
      }

      case "pressKey": {
        let cfg = { key: "Enter", ctrl: false, alt: false, shift: false, meta: false };
        try { if (step.value) cfg = { ...cfg, ...JSON.parse(step.value) }; } catch {}

        let target = null;
        if (step.selector) {
          target = await waitForInteractable(step, 5000);
          if (!target) throw new Error("Element not found for key press: " + step.selector);
        } else {
          target = document.activeElement || document.body;
        }

        if (target && typeof target.focus === "function") {
          target.focus();
        }

        const KEY_CODES = {
          "Enter": 13,
          "Tab": 9,
          "Escape": 27,
          "Backspace": 8,
          "Delete": 46,
          "Space": 32,
          " ": 32,
          "ArrowUp": 38,
          "ArrowDown": 40,
          "ArrowLeft": 37,
          "ArrowRight": 39,
          "Home": 36,
          "End": 35,
          "PageUp": 33,
          "PageDown": 34
        };
        
        const KEY_CODES_CODE = {
          "Enter": "Enter",
          "Tab": "Tab",
          "Escape": "Escape",
          "Backspace": "Backspace",
          "Delete": "Delete",
          "Space": "Space",
          " ": "Space",
          "ArrowUp": "ArrowUp",
          "ArrowDown": "ArrowDown",
          "ArrowLeft": "ArrowLeft",
          "ArrowRight": "ArrowRight",
          "Home": "Home",
          "End": "End",
          "PageUp": "PageUp",
          "PageDown": "PageDown"
        };

        const getKeyCode = (key) => {
          if (!key) return 0;
          if (KEY_CODES[key] !== undefined) return KEY_CODES[key];
          if (key.length === 1) {
            return key.toUpperCase().charCodeAt(0);
          }
          return 0;
        };

        const getCode = (key) => {
          if (!key) return "";
          if (KEY_CODES_CODE[key] !== undefined) return KEY_CODES_CODE[key];
          if (key.length === 1) {
            const char = key.toUpperCase();
            if (char >= "A" && char <= "Z") return "Key" + char;
            if (char >= "0" && char <= "9") return "Digit" + char;
          }
          return key;
        };

        const keyCodeVal = getKeyCode(cfg.key);
        const codeVal = getCode(cfg.key);

        const init = {
          key: cfg.key,
          code: codeVal,
          keyCode: keyCodeVal,
          which: keyCodeVal,
          ctrlKey: !!cfg.ctrl,
          altKey: !!cfg.alt,
          shiftKey: !!cfg.shift,
          metaKey: !!cfg.meta,
          bubbles: true,
          cancelable: true
        };

        const targetEl = target || document.body;

        let preventDefaultCalled = false;
        
        const keydownEvt = new KeyboardEvent("keydown", init);
        if (!targetEl.dispatchEvent(keydownEvt)) {
          preventDefaultCalled = true;
        }

        const keypressInit = { ...init };
        if (cfg.key === "Enter") {
          keypressInit.charCode = 13;
          keypressInit.keyCode = 13;
          keypressInit.which = 13;
        } else if (cfg.key.length === 1) {
          keypressInit.charCode = cfg.key.charCodeAt(0);
          keypressInit.keyCode = cfg.key.charCodeAt(0);
          keypressInit.which = cfg.key.charCodeAt(0);
        }
        
        const keypressEvt = new KeyboardEvent("keypress", keypressInit);
        if (!targetEl.dispatchEvent(keypressEvt)) {
          preventDefaultCalled = true;
        }

        const keyupEvt = new KeyboardEvent("keyup", init);
        targetEl.dispatchEvent(keyupEvt);

        if (cfg.key === "Enter" && !preventDefaultCalled && target) {
          const isButtonOrLink = target.tagName === "BUTTON" || 
                                 target.tagName === "A" || 
                                 (target.tagName === "INPUT" && ["button", "submit", "reset", "image"].includes(target.type));
          
          if (isButtonOrLink) {
            target.click();
          } else if (target.form) {
            const submitBtn = target.form.querySelector('input[type="submit"], button:not([type="button"]):not([type="reset"])');
            if (submitBtn) {
              submitBtn.click();
            } else {
              try {
                target.form.requestSubmit();
              } catch (err) {
                target.form.submit();
              }
            }
          }
        }
        return;
      }

      case "sendWebhook": {
        const url = step.value;
        if (!url) throw new Error("No webhook URL provided.");

        const headers = { "Content-Type": "application/json" };
        if (step.selector) headers["Authorization"] = step.selector;

        const body = JSON.stringify({
          workflow: { id: "", name: "" },  // placeholder; executor has no workflow name here
          timestamp: new Date().toISOString(),
          variables
        });

        const resp = await fetch(url, { method: "POST", headers, body });
        if (!resp.ok) throw new Error(`Webhook returned HTTP ${resp.status}: ${resp.statusText}`);
        return;
      }

      case "comment": {
        return;
      }
      default:
        throw new Error("Unknown step type: " + type);
    }
  }

  let executionStack = [];

  async function saveExecutionState() {
    if (!window.__tabId) {
      console.warn("[TaskOrbit] saveExecutionState: tabId not set — workflow will not resume after navigation.");
      return;
    }
    const state = {
      workflowId: window.__wfId,
      workflowName: window.__wfName,
      maxRetries: MAX_RETRIES,
      variables: window.__variables,
      dataTable: window.__to_dataTable,
      dataRows: window.__to_dataRows,
      startTime: window.__wfStartTime,
      stack: executionStack.map(frame => ({
        steps: frame.steps,
        index: frame.index,
        variables: frame.variables,
        skipDepth: frame.skipDepth,
        loopInfo: frame.loopInfo ? {
          parentIndex: frame.loopInfo.parentIndex,
          mode: frame.loopInfo.mode,
          iterations: frame.loopInfo.iterations,
          count: frame.loopInfo.count,
          selector: frame.loopInfo.selector,
          selectorType: frame.loopInfo.selectorType
        } : null
      })),
      timestamp: Date.now()
    };
    const key = "taskorbit_state_" + window.__tabId;
    await chrome.storage.local.set({ [key]: state });
  }

  async function clearExecutionState() {
    if (!window.__tabId) return;
    const key = "taskorbit_state_" + window.__tabId;
    await chrome.storage.local.remove(key);
  }

  async function initLoopFrame(step, parentFrame) {
    const mergedVars = { ...window.__variables, ...parentFrame.variables };

    let loopFrame = {
      steps: step.steps || [],
      index: 0,
      variables: {},
      skipDepth: 0,
      loopInfo: {
        parentIndex: parentFrame.index,
        mode: step.mode,
        iterations: 0,
        count: 0,
        selector: step.selector,
        selectorType: step.selectorType
      }
    };

    if (step.mode === "repeat") {
      const countStr = typeof step.count === "string" ? replaceVars(step.count, mergedVars) : step.count;
      const count = parseInt(countStr, 10) || 1;
      if (count <= 0) return null;
      loopFrame.loopInfo.count = count;
      prepareLoopIterationVariables(loopFrame);
      return loopFrame;
    } 
    
    if (step.mode === "whileExists") {
      const el = queryEl(step);
      if (!el) return null;
      prepareLoopIterationVariables(loopFrame);
      return loopFrame;
    } 
    
    if (step.mode === "forEach") {
      const els = queryEls(step);
      const count = els.length;
      if (count === 0) return null;
      els.forEach((el, idx) => el.setAttribute("data-to-loop-idx", idx + 1));
      loopFrame.loopInfo.count = count;
      prepareLoopIterationVariables(loopFrame);
      return loopFrame;
    } 
    
    if (step.mode === "forEachRow") {
      const rows = window.__to_dataRows || [];
      const count = rows.length;
      if (count === 0) return null;
      
      const memKey = `memory_bank_${window.__wfId}`;
      const memData = await chrome.storage.local.get(memKey);
      const bank = memData[memKey] || [];
      
      let firstUnprocessed = 0;
      while (firstUnprocessed < count) {
        const rowData = rows[firstUnprocessed] || {};
        const hashStr = await hashRow(rowData);
        if (!bank.includes(hashStr)) {
          break;
        }
        firstUnprocessed++;
      }
      
      if (firstUnprocessed >= count) return null;
      
      loopFrame.loopInfo.iterations = firstUnprocessed;
      loopFrame.loopInfo.count = count;
      prepareLoopIterationVariables(loopFrame);
      return loopFrame;
    }

    return null;
  }

  async function isLoopFinished(loopFrame) {
    const maxIterations = 100;
    const loopInfo = loopFrame.loopInfo;

    if (loopInfo.iterations >= maxIterations) return true;

    if (loopInfo.mode === "repeat") {
      return loopInfo.iterations >= loopInfo.count;
    }

    if (loopInfo.mode === "whileExists") {
      const el = queryEl({ selector: loopInfo.selector, selectorType: loopInfo.selectorType });
      return !el;
    }

    if (loopInfo.mode === "forEach") {
      const els = queryEls({ selector: loopInfo.selector, selectorType: loopInfo.selectorType });
      els.forEach((el, idx) => el.setAttribute("data-to-loop-idx", idx + 1));
      return loopInfo.iterations >= els.length;
    }

    if (loopInfo.mode === "forEachRow") {
      return loopInfo.iterations >= (window.__to_dataRows || []).length;
    }

    return true;
  }

  function prepareLoopIterationVariables(loopFrame) {
    const loopInfo = loopFrame.loopInfo;
    const it = loopInfo.iterations;

    if (loopInfo.mode === "forEachRow") {
      const rows = window.__to_dataRows || [];
      const rowData = rows[it] || {};
      loopFrame.variables = {
        ...rowData,
        loop_index: it,
        loop_index_1: it + 1
      };
    } else {
      loopFrame.variables = {
        loop_index: it,
        loop_index_1: it + 1
      };
    }
  }

  async function hashRow(rowData) {
    const rowStr = JSON.stringify(rowData);
    const msgUint8 = new TextEncoder().encode(rowStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function executeStack(topLevel = false) {
    if (topLevel) {
      window.__vf_emergency_stop = false;
      if (executionStack.length > 0) {
        createProgressOverlay(executionStack[0].steps);
        showSmartActivationToast();
        const topFrame = executionStack[0];
        for (let idx = 0; idx < topFrame.index; idx++) {
          updateProgressStep(idx, "ok");
        }
      }
    }

    try {
      while (executionStack.length > 0 && !window.__vf_emergency_stop) {
        const frame = executionStack[executionStack.length - 1];
        const steps = frame.steps;
        const i = frame.index;

        if (i >= steps.length) {
          if (frame.loopInfo) {
            const it = frame.loopInfo.iterations;
            const mode = frame.loopInfo.mode;
            console.log(`[TaskOrbit] Loop '${mode}' iteration ${it + 1} completed.`);
            chrome.runtime.sendMessage({
              type: "addLog",
              entry: {
                workflowId: window.__wfId,
                workflowName: window.__wfName,
                durationMs: 0,
                status: "success",
                errorMessage: `Loop '${mode}' item ${it + 1} completed.`
              }
            }).catch(() => {});

            frame.loopInfo.iterations++;

            // For forEachRow: advance past any rows already in the memory bank
            if (frame.loopInfo.mode === "forEachRow") {
              const rows = window.__to_dataRows || [];
              const memKey = `memory_bank_${window.__wfId}`;
              const memData = await chrome.storage.local.get(memKey);
              const bank = memData[memKey] || [];
              while (frame.loopInfo.iterations < rows.length) {
                const nextHash = await hashRow(rows[frame.loopInfo.iterations] || {});
                if (!bank.includes(nextHash)) break;
                frame.loopInfo.iterations++;
              }
            }

            const finished = await isLoopFinished(frame);
            if (!finished) {
              frame.index = 0;
              prepareLoopIterationVariables(frame);
              await saveExecutionState();
              continue;
            }
          }

          executionStack.pop();
          if (executionStack.length > 0) {
            const parentFrame = executionStack[executionStack.length - 1];
            parentFrame.index++;
            await saveExecutionState();
          }
          continue;
        }

        const rawStep = steps[i];
        const step = { ...rawStep };
        
        const mergedVars = { ...window.__variables, ...frame.variables };
        step.selector = replaceVars(step.selector, mergedVars);
        if (step.type !== "extractText") {
          step.value = replaceVars(step.value, mergedVars);
        }
        if (typeof step.delayMs === "string") {
          step.delayMs = replaceVars(step.delayMs, mergedVars);
        }
        if (typeof step.count === "string") {
          step.count = replaceVars(step.count, mergedVars);
        }

        if (frame.skipDepth > 0) {
          if (step.type.startsWith("if_")) {
            frame.skipDepth++;
          } else if (step.type === "end_if") {
            frame.skipDepth--;
          } else if (step.type === "else" && frame.skipDepth === 1) {
            frame.skipDepth = 0;
          }
          
          if (executionStack.length === 1) {
            updateProgressStep(i, "skipped");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }

        if (step.type === "if_exists") {
          const el = queryEl(step);
          if (!el) frame.skipDepth = 1;
          if (executionStack.length === 1) {
            updateProgressStep(i, el ? "ok" : "skipped");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }
        
        if (step.type === "if_not_exists") {
          const el = queryEl(step);
          if (el) frame.skipDepth = 1;
          if (executionStack.length === 1) {
            updateProgressStep(i, !el ? "ok" : "skipped");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }

        if (step.type === "if_variable") {
          const left = step.selector;
          const op = step.selectorType || "==";
          const right = step.value;
          
          let numLeft = Number(left);
          let numRight = Number(right);
          const isNumeric = !isNaN(numLeft) && !isNaN(numRight) && String(left).trim() !== "" && String(right).trim() !== "";
          
          let truthy = false;
          if (op === "==") truthy = left == right;
          else if (op === "!=") truthy = left != right;
          else if (op === ">") truthy = isNumeric ? numLeft > numRight : left > right;
          else if (op === "<") truthy = isNumeric ? numLeft < numRight : left < right;
          else if (op === ">=") truthy = isNumeric ? numLeft >= numRight : left >= right;
          else if (op === "<=") truthy = isNumeric ? numLeft <= numRight : left <= right;
          else if (op === "includes") truthy = String(left).includes(String(right));
          else if (op === "not_includes") truthy = !String(left).includes(String(right));
          
          if (!truthy) frame.skipDepth = 1;
          if (executionStack.length === 1) {
            updateProgressStep(i, truthy ? "ok" : "skipped");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }

        if (step.type === "else") {
          frame.skipDepth = 1;
          if (executionStack.length === 1) {
            updateProgressStep(i, "skipped");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }

        if (step.type === "end_if") {
          if (executionStack.length === 1) {
            updateProgressStep(i, "ok");
          }
          frame.index++;
          await saveExecutionState();
          continue;
        }

        if (step.type === "loop") {
          if (executionStack.length === 1) {
            updateProgressStep(i, "running");
          }

          const loopFrame = await initLoopFrame(step, frame);
          if (loopFrame) {
            executionStack.push(loopFrame);
            await saveExecutionState();
          } else {
            frame.index++;
            if (executionStack.length === 1) {
              updateProgressStep(i, "ok");
            }
            await saveExecutionState();
          }
          continue;
        }

        if (step.type === "runWorkflow") {
          if (executionStack.length === 1) {
            updateProgressStep(i, "running");
          }
          const wfId = step.value;
          if (!wfId) throw new Error("No workflow ID provided for nested execution.");
          
          const data = await chrome.storage.local.get("workflows");
          const wfs = data.workflows || [];
          const subWf = wfs.find(w => w.id === wfId);
          if (!subWf) throw new Error("Workflow not found: " + wfId);
          
          const subFrame = {
            steps: subWf.steps || [],
            index: 0,
            variables: {},
            skipDepth: 0,
            loopInfo: null
          };
          
          executionStack.push(subFrame);
          await saveExecutionState();
          continue;
        }

        if (executionStack.length === 1) {
          updateProgressStep(i, "running");
        } else {
          const isTopLevelLoop = executionStack.length === 2 && executionStack[0].loopInfo === null && executionStack[1].loopInfo !== null;
          if (isTopLevelLoop) {
            const parentIndex = executionStack[1].loopInfo.parentIndex;
            const it_1 = executionStack[1].loopInfo.iterations + 1;
            const countStr = executionStack[1].loopInfo.count ? `/${executionStack[1].loopInfo.count}` : "";
            updateProgressStep(parentIndex, "running", `[${it_1}${countStr}]`);
            updateSmartToastText(`Processing item ${it_1}${countStr}...`);
          }
        }

        let isNavigating = ["navigate", "click"].includes(step.type);
        if (step.type === "pressKey") {
          let pcfg = { key: "Enter" };
          try { if (step.value) pcfg = { ...pcfg, ...JSON.parse(step.value) }; } catch {}
          if (pcfg.key === "Enter") {
            isNavigating = true;
          }
        }

        if (isNavigating) {
          frame.index = i + 1;
          await saveExecutionState();
          frame.index = i;
        }

        const isSubWorkflowFrame = executionStack.length > 1 && frame.loopInfo === null;
        const varsBefore = isSubWorkflowFrame ? { ...window.__variables } : null;

        try {
          await runStep(step, window.__variables);
        } catch (e) {
          if (step.optional) {
            if (executionStack.length === 1) {
              updateProgressStep(i, "skipped");
            }
            frame.index = i + 1;
            await saveExecutionState();
            continue;
          }
          throw e;
        }
        removeHighlight();

        if (isSubWorkflowFrame && varsBefore) {
          for (const k of Object.keys(window.__variables)) {
            if (!(k in varsBefore) || window.__variables[k] !== varsBefore[k]) {
              frame.variables[k] = window.__variables[k];
            }
          }
          for (const k of Object.keys(window.__variables)) {
            if (!(k in varsBefore)) {
              delete window.__variables[k];
            } else {
              window.__variables[k] = varsBefore[k];
            }
          }
        }

        if (executionStack.length === 1) {
          updateProgressStep(i, "ok");
        }

        frame.index = i + 1;
        await saveExecutionState();

        // ---- Debug pause point ----
        if (window.__debugMode && !window.__vf_emergency_stop) {
          const nextStep = frame.steps[frame.index] || null;
          // Highlight the NEXT element before pausing
          if (nextStep && nextStep.selector) {
            try {
              const nextEl = queryEl(nextStep);
              if (nextEl) {
                highlightElement(nextEl);
                nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            } catch (_) {}
          }
          // Send pause info to popup via background
          chrome.runtime.sendMessage({
            type: "debugPause",
            stepIndex: i,
            totalSteps: frame.steps.length,
            completedStep: { type: step.type, name: step.name || STEP_TYPES_MAP[step.type] || step.type, index: i },
            nextStep: nextStep ? { type: nextStep.type, name: nextStep.name || STEP_TYPES_MAP[nextStep.type] || nextStep.type, index: frame.index } : null,
            variables: { ...window.__variables },
            workflowName: window.__wfName
          }).catch(() => {});
          // Wait for resume signal
          await waitForDebugResume();
        }
      }
    } catch (e) {
      if (window.__vf_emergency_stop || e.message === "Emergency Stop" || e.message === "Emergency Stop triggered by user.") {
        window.__vf_emergency_stop = true;
        if (topLevel) removeProgressOverlay();
        await clearExecutionState();
        return { ok: false, error: "Emergency Stop triggered by user." };
      }
      if (executionStack.length > 0) {
        const topIndex = executionStack[0].index;
        updateProgressStep(topIndex, "fail");
      }
      setTimeout(removeProgressOverlay, 2500);
      await clearExecutionState();
      
      if (topLevel) {
        await chrome.runtime.sendMessage({
          type: "addLog",
          entry: {
            workflowId: window.__wfId,
            workflowName: window.__wfName,
            durationMs: Date.now() - window.__wfStartTime,
            status: "error",
            errorMessage: e.message
          }
        }).catch(() => {});
      }
      return { ok: false, error: e.message };
    }

    if (window.__vf_emergency_stop) {
      if (topLevel) removeProgressOverlay();
      await clearExecutionState();
      return { ok: false, error: "Emergency Stop triggered by user." };
    }

    if (topLevel) {
      setTimeout(removeProgressOverlay, 1200);
      await clearExecutionState();
      await chrome.runtime.sendMessage({
        type: "addLog",
        entry: {
          workflowId: window.__wfId,
          workflowName: window.__wfName,
          durationMs: Date.now() - window.__wfStartTime,
          status: "success",
          errorMessage: ""
        }
      }).catch(() => {});
    }

    return { ok: true };
  }

  async function executeSteps(steps, variables, maxRetries = 3, topLevel = false) {
    if (topLevel) {
      window.__vf_emergency_stop = false;
      window.__to_dataTable = [];
      window.__to_dataRows = [];
      window.__wfStartTime = Date.now();
      
      executionStack = [{
        steps: steps,
        index: 0,
        variables: {},
        skipDepth: 0,
        loopInfo: null
      }];
      window.__variables = variables || {};
    }

    MAX_RETRIES = maxRetries;
    return await executeStack(topLevel);
  }

  // ---- Safe Math Evaluator using Sandboxed iframe ----------------------------

  let mathSandboxIframe = null;
  let mathSandboxReady = false;
  let mathSandboxQueue = [];
  const mathResolvers = {};

  function initMathSandbox() {
    if (mathSandboxIframe) return;
    mathSandboxIframe = document.createElement("iframe");
    mathSandboxIframe.id = "taskorbit-math-sandbox";
    mathSandboxIframe.src = chrome.runtime.getURL("sandbox.html");
    mathSandboxIframe.style.display = "none";
    
    mathSandboxIframe.onload = () => {
      mathSandboxReady = true;
      for (const msg of mathSandboxQueue) {
        mathSandboxIframe.contentWindow.postMessage(msg, "*");
      }
      mathSandboxQueue = [];
    };
    
    document.body.appendChild(mathSandboxIframe);
  }

  window.addEventListener("message", (event) => {
    if (event.data && event.data.taskorbit_math_id) {
      const res = mathResolvers[event.data.taskorbit_math_id];
      if (res) {
        res(event.data);
        delete mathResolvers[event.data.taskorbit_math_id];
      }
    }
  });

  async function evaluateMathSafe(expr) {
    return new Promise((resolve, reject) => {
      initMathSandbox();
      const id = Date.now() + "_" + Math.random();
      mathResolvers[id] = (data) => {
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      };
      
      const payload = { type: "EVAL_MATH", taskorbit_math_id: id, expr };
      if (mathSandboxReady) {
        mathSandboxIframe.contentWindow.postMessage(payload, "*");
      } else {
        mathSandboxQueue.push(payload);
      }
    });
  }

  // ---- Message Listener ----------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "executeSteps") {
      if (window.__wfRunning) {
        sendResponse({ ok: false, error: "A workflow is already running. Use Emergency Stop first." });
        return false;
      }
      window.__wfRunning = true;
      window.__wfId = msg.workflowId || "unknown";
      window.__wfName = msg.workflowName || "Unknown Workflow";
      window.__tabId = msg.tabId;
      executeSteps(msg.steps || [], msg.variables || {}, msg.maxRetries, true)
        .then(result => { window.__wfRunning = false; sendResponse(result); })
        .catch(err => { window.__wfRunning = false; sendResponse({ ok: false, error: err.message }); });
      return true; // async
    }
    if (msg && msg.type === "resumeWorkflow") {
      window.__wfId = msg.state.workflowId || "unknown";
      window.__wfName = msg.state.workflowName || "Unknown Workflow";
      window.__tabId = msg.tabId;
      MAX_RETRIES = msg.state.maxRetries || 3;
      
      window.__variables = msg.state.variables || {};
      window.__to_dataTable = msg.state.dataTable || [];
      window.__to_dataRows = msg.state.dataRows || [];
      window.__wfStartTime = msg.state.startTime || Date.now();
      
      executionStack = msg.state.stack || [];

      executeStack(true).then(sendResponse);
      return true; // async
    }
    if (msg && msg.type === "debugSteps") {
      window.__wfId = msg.workflowId || "unknown";
      window.__wfName = msg.workflowName || "Unknown Workflow";
      window.__tabId = msg.tabId;
      window.__debugMode = true;
      // Send initial pause with first step info before execution starts
      const firstStep = (msg.steps || [])[0];
      if (firstStep) {
        try {
          const el = queryEl(firstStep);
          if (el) { highlightElement(el); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        } catch (_) {}
      }
      chrome.runtime.sendMessage({
        type: "debugPause",
        stepIndex: -1,
        totalSteps: (msg.steps || []).length,
        completedStep: null,
        nextStep: firstStep ? { type: firstStep.type, name: firstStep.name || STEP_TYPES_MAP[firstStep.type] || firstStep.type, index: 0 } : null,
        variables: msg.variables || {},
        workflowName: window.__wfName
      }).catch(() => {});
      // Wait for the first resume before starting
      waitForDebugResume().then(() => {
        executeSteps(msg.steps || [], msg.variables || {}, msg.maxRetries, true).then((result) => {
          removeHighlight();
          window.__debugMode = false;
          chrome.runtime.sendMessage({ type: "debugFinished", ok: result.ok, error: result.error }).catch(() => {});
          sendResponse(result);
        });
      }).catch((err) => {
        removeHighlight();
        window.__debugMode = false;
        chrome.runtime.sendMessage({ type: "debugFinished", ok: false, error: err.message }).catch(() => {});
        sendResponse({ ok: false, error: err.message });
      });
      return true; // async
    }
    if (msg && msg.type === "debugResume") {
      if (msg.runAll) {
        window.__debugMode = false;
        removeHighlight();
      }
      if (__debugResolve) {
        __debugResolve();
        __debugResolve = null;
        __debugReject = null;
      }
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.type === "emergencyStop") {
      triggerEmergencyStop();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // Centralised stop logic — used by the popup message and the in-page Stop button.
  function triggerEmergencyStop() {
    window.__vf_emergency_stop = true;
    window.__debugMode = false;
    window.__wfRunning = false;
    removeHighlight();
    removeProgressOverlay();

    if (activeSleepReject) {
      activeSleepReject(new Error("Emergency Stop"));
      activeSleepReject = null;
    }
    if (__debugReject) {
      __debugReject(new Error("Emergency Stop"));
      __debugResolve = null;
      __debugReject = null;
    }
  }
})();

// Injected on demand to execute a workflow's steps on the current page.
// Guarded so repeated injection does not register duplicate listeners.
(() => {
  if (window.__wfExecutorInstalled) return;
  window.__wfExecutorInstalled = true;

  // ---- Network Interceptor Injection ----------------------------------------
  (function injectNetworkInterceptor() {
    if (document.getElementById('__vf_interceptor_script')) return;
    const script = document.createElement("script");
    script.id = "__vf_interceptor_script";
    script.src = chrome.runtime.getURL("content/interceptor.js");
    (document.head || document.documentElement).appendChild(script);
  })();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    header.style.cssText = "font-weight:600;margin-bottom:10px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#aab;";
    header.textContent = "TaskOrbit Running";
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
      "waitNetwork": "Wait for Network Idle",
      "navigate": "Navigate to URL",
      "screenshot": "Take Screenshot",
      "extractText": "Extract Text",
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
      label.textContent = `${i + 1}. ${stepLabel}`;
      row.appendChild(icon);
      row.appendChild(label);
      overlay.appendChild(row);
      return { icon, label };
    });

    document.body.appendChild(overlay);
    progressOverlay = overlay;
  }

  function updateProgressStep(i, status) {
    if (!progressItems[i]) return;
    const { icon, label } = progressItems[i];
    if (status === "running") {
      icon.textContent = "🔄";
      label.style.color = "#fff";
    } else if (status === "ok") {
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

  function removeProgressOverlay() {
    if (progressOverlay) {
      progressOverlay.remove();
      progressOverlay = null;
    }
    progressItems = [];
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
        <span style="font-size: 14px; font-weight: 600; text-shadow: 0 0 8px rgba(255,255,255,0.5); color: #ffffff;">${text}</span>
      </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    let dismissTimeout = setTimeout(dismiss, 8000);

    // Hover to pause auto-dismiss
    toast.addEventListener('mouseenter', () => clearTimeout(dismissTimeout));
    toast.addEventListener('mouseleave', () => dismissTimeout = setTimeout(dismiss, 8000));
    
    // Click to dismiss immediately
    toast.addEventListener('click', dismiss);

    function dismiss() {
      clearTimeout(dismissTimeout);
      toast.style.opacity = "0";
      toast.style.transform = "translateY(30px)";
      setTimeout(() => toast.remove(), 500);
    }
  }

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
        case "text":
          return findByText(selector);
        case "css":
        default:
          return document.querySelector(selector);
      }
    } catch {
      return null;
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
        
        const varName = step.value;
        if (!varName) throw new Error("No variable name provided for extraction");
        
        variables[varName] = text.trim();
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

        const target = step.selector ? queryEl(step) : document.activeElement || document.body;
        const init = {
          key: cfg.key,
          code: cfg.key,
          ctrlKey: !!cfg.ctrl,
          altKey: !!cfg.alt,
          shiftKey: !!cfg.shift,
          metaKey: !!cfg.meta,
          bubbles: true,
          cancelable: true
        };
        for (const evtType of ["keydown", "keypress", "keyup"]) {
          (target || document.body).dispatchEvent(new KeyboardEvent(evtType, init));
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

      default:
        throw new Error("Unknown step type: " + type);
    }
  }

  async function executeSteps(steps, variables, maxRetries = 3, topLevel = false) {
    MAX_RETRIES = maxRetries;
    const results = [];
    let skipDepth = 0;

    if (topLevel) {
      createProgressOverlay(steps);
      showSmartActivationToast();
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      step.selector = replaceVars(step.selector, variables);
      if (step.type !== "extractText") {
        step.value = replaceVars(step.value, variables);
      }
      if (typeof step.delayMs === "string") {
        step.delayMs = replaceVars(step.delayMs, variables);
      }
      
      if (skipDepth > 0) {
        if (step.type === "if_exists" || step.type === "if_not_exists") {
          skipDepth++;
        } else if (step.type === "end_if") {
          skipDepth--;
        }
        if (topLevel) updateProgressStep(i, "skipped");
        results.push({ index: i, type: step.type, ok: true, skipped: true });
        continue;
      }
      
      try {
        if (step.type === "if_exists") {
          const el = queryEl(step);
          if (!el) skipDepth = 1;
          if (topLevel) updateProgressStep(i, el ? "ok" : "skipped");
          results.push({ index: i, type: step.type, ok: true });
          continue;
        }
        
        if (step.type === "if_not_exists") {
          const el = queryEl(step);
          if (el) skipDepth = 1;
          if (topLevel) updateProgressStep(i, !el ? "ok" : "skipped");
          results.push({ index: i, type: step.type, ok: true });
          continue;
        }

        if (step.type === "end_if") {
          if (topLevel) updateProgressStep(i, "ok");
          results.push({ index: i, type: step.type, ok: true });
          continue;
        }

        if (topLevel) updateProgressStep(i, "running");
        await runStep(step, variables);
        if (topLevel) updateProgressStep(i, "ok");
        results.push({ index: i, type: step.type, ok: true });
      } catch (e) {
        if (step.optional) {
          if (topLevel) updateProgressStep(i, "skipped");
          results.push({ index: i, type: step.type, ok: true, skipped: true, note: e.message });
          continue;
        } else {
          if (topLevel) updateProgressStep(i, "fail");
          results.push({ index: i, type: step.type, ok: false, error: e.message });
          setTimeout(removeProgressOverlay, 2500);
          return { ok: false, failedAt: i, results };
        }
      }
    }
    if (topLevel) setTimeout(removeProgressOverlay, 1200);
    return { ok: true, results };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "executeSteps") {
      executeSteps(msg.steps || [], msg.variables || {}, msg.maxRetries, true).then(sendResponse);
      return true; // async
    }
    return false;
  });
})();

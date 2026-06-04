// Injected during recording to capture user interactions and stream them as
// workflow steps to the background service worker. Guarded against double-injection.
(() => {
  if (window.__wfRecorderInstalled) {
    // Already installed; just allow start/stop messages below to control it.
  } else {
    window.__wfRecorderInstalled = true;
    window.__wfRecorderActive = false;

    const TEXT_INPUT_TYPES = new Set([
      "text", "email", "search", "tel", "url", "password", "number", "date", "datetime-local", "month", "time", "week"
    ]);

    function isTextField(el) {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === "TEXTAREA") return true;
      if (tag === "INPUT") {
        const t = (el.type || "text").toLowerCase();
        return TEXT_INPUT_TYPES.has(t);
      }
      return false;
    }

    function cssEscape(s) {
      if (window.CSS && CSS.escape) return CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    }

    // Build a reasonably stable selector for an element.
    function buildSelector(el) {
      if (!(el instanceof Element)) return null;

      if (el.id) return "#" + cssEscape(el.id);

      const name = el.getAttribute("name");
      if (name) {
        const sel = `${el.tagName.toLowerCase()}[name="${cssAttr(name)}"]`;
        if (isUnique(sel)) return sel;
      }

      for (const attr of ["data-testid", "data-test", "data-qa", "aria-label"]) {
        const v = el.getAttribute(attr);
        if (v) {
          const sel = `${el.tagName.toLowerCase()}[${attr}="${cssAttr(v)}"]`;
          if (isUnique(sel)) return sel;
        }
      }

      return buildPath(el);
    }

    function cssAttr(v) {
      return String(v).replace(/"/g, '\\"');
    }

    function isUnique(sel) {
      try {
        return document.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    }

    function buildPath(el) {
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          part = "#" + cssEscape(node.id);
          parts.unshift(part);
          break;
        }
        const parent = node.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
          if (sameTag.length > 1) {
            const idx = sameTag.indexOf(node) + 1;
            part += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(" > ");
    }

    function send(step) {
      if (!window.__wfRecorderActive) return;
      if (!step.selectorType) step.selectorType = "css";
      try {
        chrome.runtime.sendMessage({ type: "recordedStep", step });
      } catch {
        // Extension context may be gone; stop recording locally.
        window.__wfRecorderActive = false;
      }
    }

    function onClick(e) {
      const el = e.target;
      if (!(el instanceof Element)) return;
      // Text fields / selects are captured via change events instead.
      if (isTextField(el) || el.tagName === "SELECT" || el.tagName === "OPTION") return;
      const selector = buildSelector(el.closest("a,button,[role='button'],input,label,summary") || el);
      if (!selector) return;
      send({ type: "click", selector, value: "", delayMs: 0 });
    }

    function onChange(e) {
      const el = e.target;
      if (!(el instanceof Element)) return;
      const selector = buildSelector(el);
      if (!selector) return;

      if (el.tagName === "SELECT") {
        const opt = el.options[el.selectedIndex];
        send({ type: "selectOption", selector, value: el.value, delayMs: 0, label: opt ? opt.textContent.trim() : "" });
        return;
      }
      if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
        send({ type: "check", selector, value: el.checked ? "true" : "false", delayMs: 0 });
        return;
      }
      if (isTextField(el)) {
        const value = el.isContentEditable ? el.textContent : el.value;
        send({ type: "setText", selector, value: value || "", delayMs: 0 });
      }
    }

    // Keys we care to record (functional / modifier keys)
    const RECORD_KEYS = new Set([
      "Enter", "Tab", "Escape", "Backspace", "Delete", "Space",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Home", "End", "PageUp", "PageDown",
      "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"
    ]);

    function onKeyDown(e) {
      // Only record if a modifier key is held OR it's a known functional key.
      const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
      if (!hasMod && !RECORD_KEYS.has(e.key)) return;
      // Skip if the key itself IS a lone modifier
      if (["Control","Alt","Shift","Meta"].includes(e.key)) return;

      const el = document.activeElement;
      const selector = (el && el !== document.body) ? buildSelector(el) : "";

      const keyConfig = {
        key: e.key,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      };
      send({ type: "pressKey", selector: selector || "", value: JSON.stringify(keyConfig), delayMs: 0 });
    }

    window.__wfRecorderHandlers = { onClick, onChange, onKeyDown };
  }

  function start() {
    if (window.__wfRecorderActive) return;
    window.__wfRecorderActive = true;
    const { onClick, onChange, onKeyDown } = window.__wfRecorderHandlers;
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function stop() {
    window.__wfRecorderActive = false;
    const { onClick, onChange, onKeyDown } = window.__wfRecorderHandlers || {};
    if (onClick) document.removeEventListener("click", onClick, true);
    if (onChange) document.removeEventListener("change", onChange, true);
    if (onKeyDown) document.removeEventListener("keydown", onKeyDown, true);
  }

  if (!window.__wfRecorderMsgInstalled) {
    window.__wfRecorderMsgInstalled = true;
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "startRecorder") start();
      else if (msg && msg.type === "stopRecorder") stop();
      return false;
    });
  }
})();

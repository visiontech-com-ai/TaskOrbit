// Injected into pages that have workflows with keyboard shortcuts assigned.
// Listens for keydown events and triggers matching workflows via the background.
// Guarded against double-injection.
(() => {
  if (window.__wfShortcutInstalled) return;
  window.__wfShortcutInstalled = true;

  const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

  let shortcuts = []; // [{ workflowId, shortcut, parsed }]

  function parseShortcut(str) {
    if (!str) return null;
    const parts = str.split("+");
    const key = parts.pop();
    return {
      ctrl: parts.includes("Ctrl"),
      alt: parts.includes("Alt"),
      shift: parts.includes("Shift"),
      meta: parts.includes("Meta"),
      key
    };
  }

  function normaliseKey(key) {
    if (key === " ") return "Space";
    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function matches(e, parsed) {
    if (!parsed) return false;
    if (!!e.ctrlKey !== parsed.ctrl) return false;
    if (!!e.altKey !== parsed.alt) return false;
    if (!!e.shiftKey !== parsed.shift) return false;
    if (!!e.metaKey !== parsed.meta) return false;
    return normaliseKey(e.key) === parsed.key;
  }

  function onKeyDown(e) {
    if (MODIFIER_KEYS.has(e.key)) return;
    for (const entry of shortcuts) {
      if (matches(e, entry.parsed)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({
            type: "triggerShortcut",
            workflowId: entry.workflowId
          });
        } catch {
          // Extension context may have been invalidated.
        }
        return;
      }
    }
  }

  // Fetch shortcuts from the background and start listening.
  try {
    chrome.runtime.sendMessage({ type: "getShortcuts" }, (response) => {
      if (!response || !Array.isArray(response.shortcuts)) return;
      shortcuts = response.shortcuts
        .filter((s) => s.shortcut)
        .map((s) => ({ ...s, parsed: parseShortcut(s.shortcut) }));
      if (shortcuts.length > 0) {
        document.addEventListener("keydown", onKeyDown, true);
      }
    });
  } catch {
    // Extension context may be gone.
  }
})();

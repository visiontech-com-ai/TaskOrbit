(function() {
  if (window.__to_auto_reveal_loaded) return;
  window.__to_auto_reveal_loaded = true;

  // Track right-clicked elements for the context menu "Reveal this password"
  let lastRightClickedElement = null;
  document.addEventListener("contextmenu", (e) => {
    lastRightClickedElement = e.target;
  }, true);

  // Helper functions for URL matching (copied from storage.js for standalone use)
  function siteToMatchPattern(site) {
    let s = (site || "").trim();
    if (!s) return null;
    if (!/^[a-z*]+:\/\//i.test(s)) {
      s = "*://" + s;
    }
    if (!/\/.*/.test(s.replace(/^[a-z*]+:\/\//i, ""))) {
      s = s.replace(/\/+$/, "") + "/*";
    }
    return s;
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

  function urlMatchesSite(url, site) {
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

  function revealAll() {
    const inputs = document.querySelectorAll('input[type="password"]');
    inputs.forEach(input => {
      input.type = "text";
      input.dataset.toRevealed = "true";
    });
  }

  function setupAutoReveal() {
    revealAll();
    const observer = new MutationObserver((mutations) => {
      let shouldReveal = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0 || m.attributeName === "type") {
          shouldReveal = true;
          break;
        }
      }
      if (shouldReveal) revealAll();
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["type"]
    });
  }

  chrome.storage.local.get("settings", (data) => {
    const settings = data.settings || { revealPasswords: "off", revealSites: [] };
    const mode = settings.revealPasswords;
    const url = window.location.href;

    let shouldAutoReveal = false;
    if (mode === "all") {
      shouldAutoReveal = true;
    } else if (mode === "site") {
      shouldAutoReveal = (settings.revealSites || []).some(site => urlMatchesSite(url, site));
    }

    if (shouldAutoReveal) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupAutoReveal);
      } else {
        setupAutoReveal();
      }
    }
  });

  // Listen for manual triggers from background script (Context Menu)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "REVEAL_ALL_PASSWORDS") {
      revealAll();
      sendResponse({ok: true});
    } else if (msg.type === "REVEAL_SPECIFIC_PASSWORD") {
      if (lastRightClickedElement && lastRightClickedElement.tagName === "INPUT" && lastRightClickedElement.type === "password") {
        lastRightClickedElement.type = "text";
        lastRightClickedElement.dataset.toRevealed = "true";
      } else {
        // Fallback: just reveal the active element if it's a password
        const active = document.activeElement;
        if (active && active.tagName === "INPUT" && active.type === "password") {
          active.type = "text";
          active.dataset.toRevealed = "true";
        }
      }
      sendResponse({ok: true});
    }
  });

})();

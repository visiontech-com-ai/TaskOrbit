(function() {
  if (window.__to_smart_toast_loaded) return;
  window.__to_smart_toast_loaded = true;

  if (document.getElementById('__to_smart_toast')) return;

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

  chrome.storage.local.get("workflows", (data) => {
    const workflows = data.workflows || [];
    const url = window.location.href;
    const isApproved = workflows.some(w => (w.sites || []).some(site => urlMatchesSite(url, site)));

    if (!isApproved) return;

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
  });
})();

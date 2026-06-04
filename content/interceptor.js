(function() {
  if (window.__vfNetworkInterceptorLoaded) return;
  window.__vfNetworkInterceptorLoaded = true;
  
  let active = 0;
  const update = () => document.documentElement.setAttribute('data-vf-active-requests', active);
  update();
  
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    active++; update();
    try { return await originalFetch.apply(this, args); }
    finally { active--; update(); }
  };
  
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(...args) {
    this.addEventListener("loadend", () => { active--; update(); });
    originalOpen.apply(this, args);
  };
  
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(...args) {
    active++; update();
    originalSend.apply(this, args);
  };
})();

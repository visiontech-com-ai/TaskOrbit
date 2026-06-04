window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "EVAL_MATH") {
    try {
      // Safely evaluate math expression inside the sandbox.
      // Since this runs in a sandbox, it won't violate the extension's or page's CSP.
      const result = new Function("return (" + event.data.expr + ")")();
      event.source.postMessage({
        taskorbit_math_id: event.data.taskorbit_math_id,
        result: result
      }, event.origin);
    } catch (e) {
      event.source.postMessage({
        taskorbit_math_id: event.data.taskorbit_math_id,
        error: e.message
      }, event.origin);
    }
  }
});

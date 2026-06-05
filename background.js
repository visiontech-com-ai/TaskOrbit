import {
  getWorkflows,
  getWorkflow,
  urlMatchesSite,
  siteToOrigin,
  addLog,
  STEP_TYPES
} from "./shared/storage.js";
import { getCapabilities } from "./shared/capabilities.js";
import { verifyStoredLicenseSilent } from "./shared/license.js";

// ---- Message router -------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg && msg.type) {
    case "runWorkflow":
      runWorkflow(msg.workflowId, msg.tabId, msg.variables).then(sendResponse);
      return true; // async response
    case "startRecording":
      startRecording(msg.tabId).then(sendResponse);
      return true;
    case "stopRecording":
      stopRecording(msg.tabId).then(sendResponse);
      return true;
    case "takeScreenshot":
      takeScreenshot(msg.filename, sender.tab?.windowId).then(sendResponse);
      return true; // async
    case "downloadFile":
      downloadFile(msg.url, msg.filename).then(sendResponse);
      return true;
    case "recordedStep":
      // Streamed from the recorder content script.
      bufferRecordedStep(sender.tab && sender.tab.id, msg.step).then(sendResponse);
      return true;
    case "checkSitePermission":
      checkSitePermission(msg.sites).then(sendResponse);
      return true;
    case "getShortcuts":
      getShortcutsForTab(sender.tab).then(sendResponse);
      return true;
    case "triggerShortcut":
      onTriggerShortcut(msg.workflowId, sender.tab).then(sendResponse);
      return true;
    case "syncAlarms":
      syncAlarms().then(sendResponse);
      return true;
    case "addLog":
      addLog(msg.entry).then(sendResponse);
      return true;
    default:
      return false;
  }
});

// ---- Workflow execution ---------------------------------------------------

async function runWorkflow(workflowId, tabId, variables = null) {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found" };
  const startTime = Date.now();

  const execute = async () => {
    const capabilities = await getCapabilities();

    // Limit check
    if (workflow.steps.length > capabilities.maxSteps) {
      return { ok: false, error: `TaskOrbit Lite limits workflows to ${capabilities.maxSteps} steps. Upgrade to Pro.` };
    }

    // Step type checks (recursively check for pro features)
    let usesLockedFeature = false;
    let lockedFeatureName = "";
    
    const checkSteps = (steps) => {
      for (const step of steps) {
        const def = STEP_TYPES[step.type];
        if (def && def.proFeature) {
          if (def.proFeature === "loops" && !capabilities.allowLoops) { usesLockedFeature = true; lockedFeatureName = "Loops"; }
          if (def.proFeature === "conditions" && !capabilities.allowConditions) { usesLockedFeature = true; lockedFeatureName = "Conditions"; }
          if (def.proFeature === "variables" && !capabilities.allowVariables) { usesLockedFeature = true; lockedFeatureName = "Variables"; }
          if (def.proFeature === "advanced" && !capabilities.allowDataProcessing) { usesLockedFeature = true; lockedFeatureName = "Advanced Tasks"; }
        }
        if (step.steps) checkSteps(step.steps);
      }
    };
    checkSteps(workflow.steps);

    if (usesLockedFeature) {
      return { ok: false, error: `Workflow contains locked features (${lockedFeatureName}). Upgrade to Pro to run.` };
    }

    // If no variables provided (e.g. auto-run or shortcut), fallback to defaults
    if (!variables && workflow.variables) {
      variables = {};
      workflow.variables.forEach(v => {
        variables[v.name] = v.defaultValue || "";
      });
    }

    let tab;
    try {
      tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    } catch (e) {
      return { ok: false, error: "No active tab" };
    }
    if (!tab) return { ok: false, error: "No active tab" };

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/executor.js"]
      });
    } catch (e) {
      return { ok: false, error: "Could not inject into page: " + e.message };
    }

    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "executeSteps",
        workflowId: workflow.id,
        workflowName: workflow.name,
        steps: workflow.steps,
        variables: variables || {},
        maxRetries: workflow.maxRetries !== undefined ? workflow.maxRetries : 3
      });
      return result || { ok: true, results: [] };
    } catch (e) {
      return { ok: false, error: "Page did not respond: " + e.message };
    }
  };

  const result = await execute();

  const durationMs = Date.now() - startTime;
  let errorMsg = result.error || "";
  if (!result.ok && !errorMsg && result.results) {
    const fail = result.results.find((r) => !r.ok);
    if (fail) errorMsg = fail.error;
  }

  await addLog({
    workflowId: workflow.id,
    workflowName: workflow.name,
    durationMs,
    status: result.ok ? "success" : "error",
    errorMessage: errorMsg || ""
  }).catch(() => {}); // fire and forget

  return result;
}

async function hasHostAccess(url) {
  if (!url) return false;
  try {
    return await chrome.permissions.contains({ origins: [originFromUrl(url)] });
  } catch {
    return false;
  }
}

function originFromUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return url;
  }
}

async function checkSitePermission(sites) {
  const origins = (sites || []).map(siteToOrigin).filter(Boolean);
  if (origins.length === 0) return { granted: true, origins };
  try {
    const granted = await chrome.permissions.contains({ origins });
    return { granted, origins };
  } catch (e) {
    return { granted: false, origins, error: e.message };
  }
}

// ---- Recording ------------------------------------------------------------

async function startRecording(tabId) {
  let tab;
  try {
    tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  } catch {
    return { ok: false, error: "No active tab" };
  }
  if (!tab) return { ok: false, error: "No active tab" };

  await chrome.storage.session.set({ [recBufferKey(tab.id)]: [] });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/recorder.js"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "startRecorder" });
    return { ok: true, tabId: tab.id };
  } catch (e) {
    return { ok: false, error: "Could not start recorder: " + e.message };
  }
}

async function stopRecording(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "stopRecorder" });
  } catch {
    // Page may have navigated away; ignore.
  }
  const key = recBufferKey(tabId);
  const data = await chrome.storage.session.get(key);
  const steps = data[key] || [];
  await chrome.storage.session.remove(key);
  return { ok: true, steps };
}

async function bufferRecordedStep(tabId, step) {
  if (!tabId || !step) return { ok: false };
  const key = recBufferKey(tabId);
  const data = await chrome.storage.session.get(key);
  const steps = data[key] || [];
  steps.push(step);
  await chrome.storage.session.set({ [key]: steps });
  return { ok: true };
}

function recBufferKey(tabId) {
  return "recording_" + tabId;
}

// ---- Shortcut helpers -----------------------------------------------------

async function getShortcutsForTab(tab) {
  if (!tab || !tab.url) return { shortcuts: [] };
  const workflows = await getWorkflows();
  const result = workflows
    .filter((w) => w.shortcut && (w.sites || []).some((s) => urlMatchesSite(tab.url, s)))
    .map((w) => ({ workflowId: w.id, shortcut: w.shortcut }));
  return { shortcuts: result };
}

async function onTriggerShortcut(workflowId, tab) {
  if (!workflowId || !tab) return { ok: false, error: "Invalid request" };
  return runWorkflow(workflowId, tab.id);
}

// ---- Auto-run & shortcut injection on page load ---------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  if (!/^https?:/i.test(tab.url)) return;

  const hasAccess = await hasHostAccess(tab.url);
  if (!hasAccess) return;

  const workflows = await getWorkflows();
  const capabilities = await getCapabilities();

  // Auto-run matching workflows.
  if (capabilities.allowAutoRun) {
    const autoRuns = workflows.filter(
      (w) => w.autoRun && (w.sites || []).some((s) => urlMatchesSite(tab.url, s))
    );
    for (const wf of autoRuns) {
      runWorkflow(wf.id, tabId).catch(() => {});
    }
  }

  // Inject shortcut listener if any workflow has a shortcut for this site.
  const hasShortcuts = workflows.some(
    (w) => w.shortcut && (w.sites || []).some((s) => urlMatchesSite(tab.url, s))
  );
  if (hasShortcuts) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/shortcutListener.js"]
      });
    } catch {
      // Injection may fail on restricted pages; ignore.
    }
  }
});

// ---- Screenshots & Downloads ----------------------------------------------

async function takeScreenshot(filename, windowId = null) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const name = filename || "screenshot";
    await chrome.downloads.download({
      url: dataUrl,
      filename: `taskorbit_screenshots/${name}.png`,
      conflictAction: "uniquify"
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function downloadFile(url, filename) {
  try {
    await chrome.downloads.download({
      url,
      filename: `taskorbit_exports/${filename}`,
      conflictAction: "uniquify"
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---- Scheduler ------------------------------------------------------------

async function syncAlarms() {
  const workflows = await getWorkflows();
  const capabilities = await getCapabilities();
  await chrome.alarms.clearAll();
  
  // Always ensure the periodic license check is scheduled
  chrome.alarms.create("licenseCheck", { periodInMinutes: 1440 }); // 24 hours

  if (!capabilities.allowAutoRun) return; // Scheduled background execution counts as AutoRun

  for (const wf of workflows) {
    if (wf.scheduleInterval > 0) {
      chrome.alarms.create(wf.id, { periodInMinutes: wf.scheduleInterval });
    }
  }
}

chrome.runtime.onStartup.addListener(() => syncAlarms());
chrome.runtime.onInstalled.addListener(() => {
  syncAlarms();
  chrome.contextMenus.create({
    id: "reveal-password",
    title: "TaskOrbit: Reveal this password",
    contexts: ["editable"]
  });
  chrome.contextMenus.create({
    id: "reveal-all-passwords",
    title: "TaskOrbit: Reveal all passwords on page",
    contexts: ["page", "editable"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === "reveal-password") {
    chrome.tabs.sendMessage(tab.id, { type: "REVEAL_SPECIFIC_PASSWORD" }).catch(() => {});
  } else if (info.menuItemId === "reveal-all-passwords") {
    chrome.tabs.sendMessage(tab.id, { type: "REVEAL_ALL_PASSWORDS" }).catch(() => {});
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "licenseCheck") {
    await verifyStoredLicenseSilent();
    return;
  }

  const capabilities = await getCapabilities();
  if (!capabilities.allowAutoRun) return;

  const workflowId = alarm.name;
  const workflow = await getWorkflow(workflowId);
  if (!workflow || !workflow.scheduleUrl) {
    if (workflow) {
      await addLog({
        workflowId: workflow.id,
        workflowName: workflow.name,
        durationMs: 0,
        status: "error",
        errorMessage: `Scheduled run failed: No Start URL provided.`
      }).catch(() => {});
    }
    return;
  }

  const hasAccess = await hasHostAccess(workflow.scheduleUrl);
  if (!hasAccess) {
    await addLog({
      workflowId: workflow.id,
      workflowName: workflow.name,
      durationMs: 0,
      status: "error",
      errorMessage: `Scheduled run failed: No host permission for ${workflow.scheduleUrl}`
    }).catch(() => {});
    return;
  }

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: workflow.scheduleUrl, active: false });
    tabId = tab.id;

    await new Promise((resolve) => {
      const listener = (tid, changeInfo) => {
        if (tid === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      // Safety timeout 10 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });

    await runWorkflow(workflowId, tabId);
  } finally {
    if (tabId) {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  }
});

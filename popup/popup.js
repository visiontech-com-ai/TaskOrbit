import { getWorkflows, getWorkflow, newWorkflow, upsertWorkflow } from "../shared/storage.js";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const bannerEl = document.getElementById("recordingBanner");
const recTextEl = document.getElementById("recordingText");
const varPromptEl = document.getElementById("varPrompt");
const varInputsEl = document.getElementById("varInputs");
const varRunBtn = document.getElementById("varRunBtn");
const varCancelBtn = document.getElementById("varCancelBtn");
const emergencyStopContainer = document.getElementById("emergencyStopContainer");

const REC_STATE_KEY = "recordingState";
const collapsedFolders = new Set();

let pendingRunId = null;
let pendingAction = "run"; // "run" or "debug"

document.getElementById("newBtn").addEventListener("click", onNew);
document.getElementById("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("stopRecBtn").addEventListener("click", onStopRecording);
document.getElementById("emergencyStopBtn").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    chrome.tabs.sendMessage(t.id, { type: "emergencyStop" }).catch(() => {});
  }
  setStatus("Emergency Stop signal sent.", "ok");
  emergencyStopContainer.classList.add("hidden");
});

varCancelBtn.addEventListener("click", () => {
  varPromptEl.classList.add("hidden");
  pendingRunId = null;
});
varRunBtn.addEventListener("click", async () => {
  if (!pendingRunId) return;
  const wfId = pendingRunId;
  pendingRunId = null;
  varPromptEl.classList.add("hidden");
  
  const vars = {};
  const inputs = varInputsEl.querySelectorAll("input");
  for (const input of inputs) {
    vars[input.dataset.name] = input.value;
  }
  
  if (pendingAction === "debug") {
    await doDebugRun(wfId, vars);
  } else {
    await doRun(wfId, vars);
  }
});

// Debug panel button event listeners
document.getElementById("debugNextBtn").addEventListener("click", () => {
  const tabId = parseInt(document.getElementById("debugNextBtn").dataset.tabId);
  if (!tabId) return;
  chrome.runtime.sendMessage({ type: "debugResume", tabId, runAll: false });
  document.getElementById("debugStepInfo").textContent = "Running step...";
});

document.getElementById("debugRunAllBtn").addEventListener("click", () => {
  const tabId = parseInt(document.getElementById("debugRunAllBtn").dataset.tabId);
  if (!tabId) return;
  chrome.runtime.sendMessage({ type: "debugResume", tabId, runAll: true });
  document.getElementById("debugPanel").classList.add("hidden");
  setStatus("Running normally...");
});

document.getElementById("debugStopBtn").addEventListener("click", async () => {
  const tabId = parseInt(document.getElementById("debugNextBtn").dataset.tabId);
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "emergencyStop" }).catch(() => {});
  document.getElementById("debugPanel").classList.add("hidden");
  setStatus("Stopped", "err");
});

// Debug message receiver
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "debugPauseRelay") {
    const debugPanel = document.getElementById("debugPanel");
    debugPanel.classList.remove("hidden");
    
    document.getElementById("debugWorkflowName").textContent = msg.workflowName || "";
    
    // Format the step label beautifully
    let stepLabel = "End of workflow";
    if (msg.nextStep) {
      stepLabel = `${msg.nextStep.name || msg.nextStep.type}`;
    }
    document.getElementById("debugStepInfo").textContent = `Step ${msg.stepIndex + 2}: ${stepLabel}`;
    
    // Store tabId on the buttons
    document.getElementById("debugNextBtn").dataset.tabId = msg.tabId;
    document.getElementById("debugRunAllBtn").dataset.tabId = msg.tabId;
    
    // Populate variables inspector
    const tbody = document.getElementById("debugVarBody");
    tbody.innerHTML = "";
    const vars = msg.variables || {};
    const keys = Object.keys(vars);
    if (keys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="padding: 6px; text-align: center; color: #92400e;">No variables defined</td></tr>`;
    } else {
      keys.forEach(k => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #fde68a";
        const tdName = document.createElement("td");
        tdName.style.padding = "4px 6px";
        tdName.style.fontWeight = "bold";
        tdName.textContent = k;
        const tdVal = document.createElement("td");
        tdVal.style.padding = "4px 6px";
        tdVal.textContent = typeof vars[k] === "object" ? JSON.stringify(vars[k]) : vars[k];
        tr.appendChild(tdName);
        tr.appendChild(tdVal);
        tbody.appendChild(tr);
      });
    }
  } else if (msg && msg.type === "debugFinishedRelay") {
    // Hide debug panel and show completion status
    document.getElementById("debugPanel").classList.add("hidden");
    if (msg.ok) {
      setStatus("Debug Run completed successfully.", "ok");
    } else {
      setStatus(`Debug Run failed: ${msg.error || "Unknown error"}`, "err");
    }
  }
});

init();

async function init() {
  await renderRecordingBanner();
  await render();
  
  // Check if active tab is currently running a workflow
  const tab = await getActiveTab();
  if (tab) {
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!document.getElementById('__vf_progress')
      });
      if (res && res[0] && res[0].result) {
        emergencyStopContainer.classList.remove("hidden");
      }
    } catch (e) {
      // Ignore errors (e.g. cannot access chrome:// URLs)
    }
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function getRecordingState() {
  const data = await chrome.storage.session.get(REC_STATE_KEY);
  return data[REC_STATE_KEY] || null;
}

async function renderRecordingBanner() {
  const state = await getRecordingState();
  if (state) {
    const wf = await getWorkflow(state.workflowId);
    recTextEl.textContent = `Recording into "${wf ? wf.name : "?"}"...`;
    bannerEl.classList.remove("hidden");
  } else {
    bannerEl.classList.add("hidden");
  }
}

async function render() {
  const workflows = await getWorkflows();
  const recording = await getRecordingState();
  listEl.innerHTML = "";

  if (workflows.length === 0) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  const grouped = {};
  workflows.forEach(wf => {
    const f = (wf.folder || "").trim() || "Uncategorized";
    if (!grouped[f]) grouped[f] = [];
    grouped[f].push(wf);
  });

  const folders = Object.keys(grouped).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    return a.localeCompare(b);
  });

  for (const folder of folders) {
    const isCollapsed = collapsedFolders.has(folder);
    const count = grouped[folder].length;

    // ---- Collapsible folder header ----
    const header = document.createElement("li");
    header.className = "folder-header" + (isCollapsed ? " collapsed" : "");

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.textContent = isCollapsed ? "📁" : "📂";

    const label = document.createElement("span");
    label.className = "folder-label";
    label.textContent = folder;

    const badge = document.createElement("span");
    badge.className = "folder-count";
    badge.textContent = count;

    const chevron = document.createElement("span");
    chevron.className = "folder-chevron";
    chevron.textContent = isCollapsed ? "›" : "‹";

    header.append(icon, label, badge, chevron);
    header.addEventListener("click", async () => {
      if (collapsedFolders.has(folder)) {
        collapsedFolders.delete(folder);
      } else {
        collapsedFolders.add(folder);
      }
      await render();
    });
    listEl.appendChild(header);

    if (isCollapsed) continue;

    for (const wf of grouped[folder]) {
      listEl.appendChild(renderItem(wf, recording));
    }
  }
}

function renderItem(wf, recording) {
  const li = document.createElement("li");
  li.className = "item";

  const head = document.createElement("div");
  head.className = "item-head";

  const nameWrap = document.createElement("div");
  const name = document.createElement("div");
  name.className = "item-name";
  name.textContent = wf.name;
  if (wf.autoRun) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "auto";
    name.appendChild(badge);
  }
  if (wf.shortcut) {
    const sBadge = document.createElement("span");
    sBadge.className = "badge badge-shortcut";
    sBadge.textContent = wf.shortcut;
    name.appendChild(sBadge);
  }
  const meta = document.createElement("div");
  meta.className = "item-meta";
  const siteText = wf.sites && wf.sites.length ? wf.sites.join(", ") : "any site (activeTab)";
  meta.textContent = `${wf.steps.length} step(s) - ${siteText}`;
  nameWrap.appendChild(name);
  nameWrap.appendChild(meta);
  head.appendChild(nameWrap);
  li.appendChild(head);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const runBtn = button("Run", "btn btn-primary btn-sm", () => onRun(wf.id));
  const debugBtn = button("🐛", "btn btn-sm btn-debug", () => onDebug(wf.id));
  const isRecordingThis = recording && recording.workflowId === wf.id;
  const recBtn = button(
    isRecordingThis ? "Recording..." : "Record",
    "btn btn-sm",
    () => onStartRecording(wf.id)
  );
  recBtn.disabled = !!recording;
  const editBtn = button("Edit", "btn btn-sm", () => openEditor(wf.id));

  actions.appendChild(runBtn);
  actions.appendChild(debugBtn);
  actions.appendChild(recBtn);
  actions.appendChild(editBtn);
  li.appendChild(actions);

  return li;
}

function button(text, className, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function openEditor(id) {
  chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") + "?id=" + encodeURIComponent(id) });
}

async function onNew() {
  const wf = newWorkflow();
  await upsertWorkflow(wf);
  openEditor(wf.id);
}

async function onRun(workflowId) {
  pendingAction = "run";
  const wf = await getWorkflow(workflowId);
  if (!wf) return;
  
  if (wf.variables && wf.variables.length > 0) {
    pendingRunId = workflowId;
    varInputsEl.innerHTML = "";
    wf.variables.forEach(v => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      const lbl = document.createElement("label");
      lbl.textContent = v.name;
      lbl.style.fontSize = "12px";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = v.defaultValue || "";
      inp.dataset.name = v.name;
      inp.style.padding = "4px";
      row.appendChild(lbl);
      row.appendChild(inp);
      varInputsEl.appendChild(row);
    });
    varPromptEl.classList.remove("hidden");
  } else {
    await doRun(workflowId, {});
  }
}

async function onDebug(workflowId) {
  pendingAction = "debug";
  const wf = await getWorkflow(workflowId);
  if (!wf) return;
  
  if (wf.variables && wf.variables.length > 0) {
    pendingRunId = workflowId;
    varInputsEl.innerHTML = "";
    wf.variables.forEach(v => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      const lbl = document.createElement("label");
      lbl.textContent = v.name;
      lbl.style.fontSize = "12px";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = v.defaultValue || "";
      inp.dataset.name = v.name;
      inp.style.padding = "4px";
      row.appendChild(lbl);
      row.appendChild(inp);
      varInputsEl.appendChild(row);
    });
    varPromptEl.classList.remove("hidden");
  } else {
    await doDebugRun(workflowId, {});
  }
}

async function doDebugRun(workflowId, variables) {
  setStatus("Debugging...");
  const tab = await getActiveTab();
  if (!tab) {
    setStatus("No active tab found", "err");
    return;
  }
  
  const debugPanel = document.getElementById("debugPanel");
  debugPanel.classList.remove("hidden");
  document.getElementById("debugStepInfo").textContent = "Initializing...";
  document.getElementById("debugWorkflowName").textContent = "";
  document.getElementById("debugVarBody").innerHTML = `<tr><td colspan="2" style="padding: 6px; text-align: center; color: #92400e;">Initializing debugger...</td></tr>`;
  
  const res = await chrome.runtime.sendMessage({ 
    type: "debugWorkflow", 
    workflowId, 
    tabId: tab.id,
    variables 
  });
  if (!res || !res.ok) {
    debugPanel.classList.add("hidden");
    setStatus("Debug start failed: " + (res ? res.error : "no response"), "err");
  }
}

async function doRun(workflowId, variables) {
  setStatus("Running...");
  emergencyStopContainer.classList.remove("hidden");
  const tab = await getActiveTab();
  const res = await chrome.runtime.sendMessage({ 
    type: "runWorkflow", 
    workflowId, 
    tabId: tab.id,
    variables 
  });
  emergencyStopContainer.classList.add("hidden");
  if (!res) {
    setStatus("No response", "err");
  } else if (res.ok) {
    setStatus("Done.", "ok");
  } else {
    setStatus(`Failed: ${res.error || "Unknown error"}`, "err");
  }
}

function lastError(res) {
  if (res.results && res.results.length) {
    const fail = res.results.find((r) => !r.ok);
    if (fail) return fail.error;
  }
  return "Unknown error";
}

async function onStartRecording(workflowId) {
  const tab = await getActiveTab();
  const res = await chrome.runtime.sendMessage({ type: "startRecording", tabId: tab.id });
  if (res && res.ok) {
    await chrome.storage.session.set({ [REC_STATE_KEY]: { workflowId, tabId: res.tabId } });
    setStatus("Recording started. Interact with the page, then reopen and Stop & Save.", "ok");
    await renderRecordingBanner();
    await render();
  } else {
    setStatus("Could not start recording: " + (res ? res.error : "no response"), "err");
  }
}

async function onStopRecording() {
  const state = await getRecordingState();
  if (!state) return;
  const res = await chrome.runtime.sendMessage({ type: "stopRecording", tabId: state.tabId });
  await chrome.storage.session.remove(REC_STATE_KEY);

  if (res && res.ok) {
    const wf = await getWorkflow(state.workflowId);
    if (wf) {
      wf.steps = wf.steps.concat(res.steps || []);
      await upsertWorkflow(wf);
      setStatus(`Saved ${res.steps.length} recorded step(s) to "${wf.name}".`, "ok");
    }
  } else {
    setStatus("Stop failed: " + (res ? res.error : "no response"), "err");
  }
  await renderRecordingBanner();
  await render();
}

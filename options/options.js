import {
  getWorkflows,
  saveWorkflows,
  upsertWorkflow,
  deleteWorkflow,
  newWorkflow,
  newStep,
  siteToOrigin,
  formatShortcut,
  STEP_TYPES,
  SELECTOR_TYPES,
  DEFAULT_SELECTOR_TYPE,
  getLogs,
  clearLogs,
  getSettings,
  saveSettings,
  COMPARISON_OPERATORS
} from "../shared/storage.js";
import { getCapabilities } from "../shared/capabilities.js";
import { getActiveLicense, activateLicense, removeLicense } from "../shared/license.js";

const els = {
  wfList: document.getElementById("wfList"),
  newBtn: document.getElementById("newBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  emptyEditor: document.getElementById("emptyEditor"),
  form: document.getElementById("editorForm"),
  wfName: document.getElementById("wfName"),
  wfFolder: document.getElementById("wfFolder"),
  wfAutoRun: document.getElementById("wfAutoRun"),
  wfMaxRetries: document.getElementById("wfMaxRetries"),
  wfScheduleInterval: document.getElementById("wfScheduleInterval"),
  wfScheduleUrl: document.getElementById("wfScheduleUrl"),
  wfShortcut: document.getElementById("wfShortcut"),
  recordShortcutBtn: document.getElementById("recordShortcutBtn"),
  clearShortcutBtn: document.getElementById("clearShortcutBtn"),
  siteList: document.getElementById("siteList"),
  newSite: document.getElementById("newSite"),
  addSiteBtn: document.getElementById("addSiteBtn"),
  permStatus: document.getElementById("permStatus"),
  grantBtn: document.getElementById("grantBtn"),
  stepList: document.getElementById("stepList"),
  newStepType: document.getElementById("newStepType"),
  addStepBtn: document.getElementById("addStepBtn"),
  exportOneBtn: document.getElementById("exportOneBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  saveStatus: document.getElementById("saveStatus"),
  variableList: document.getElementById("variableList"),
  newVarName: document.getElementById("newVarName"),
  newVarDefault: document.getElementById("newVarDefault"),
  addVarBtn: document.getElementById("addVarBtn"),
  viewLogsBtn: document.getElementById("viewLogsBtn"),
  logsView: document.getElementById("logsView"),
  logsTableBody: document.getElementById("logsTableBody"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsView: document.getElementById("settingsView"),
  revealSitesContainer: document.getElementById("revealSitesContainer"),
  revealSiteList: document.getElementById("revealSiteList"),
  newRevealSite: document.getElementById("newRevealSite"),
  addRevealSiteBtn: document.getElementById("addRevealSiteBtn")
};

let workflows = [];
let current = null; // working copy of the selected workflow
const collapsedFolders = new Set(); // persists collapse state for the session
let extensionSettings = null;
let capabilities = null;

init();

async function init() {
  capabilities = await getCapabilities();
  populateStepTypeSelect();
  workflows = await getWorkflows();
  extensionSettings = await getSettings();
  bindEvents();
  renderList();
  renderSettings();

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  if (id) selectWorkflow(id);
}

function populateStepTypeSelect() {
  els.newStepType.innerHTML = "";
  const sorted = Object.entries(STEP_TYPES).sort(([, a], [, b]) => a.label.localeCompare(b.label));
  for (const [type, def] of sorted) {
    const isLocked = def.proFeature && !capabilities.allowDataProcessing && !capabilities.allowConditions && !capabilities.allowLoops && !capabilities.allowVariables;
    // Actually we can be more granular. For now, if def.proFeature exists and ANY of the advanced features are disabled (Lite), lock it.
    let locked = false;
    if (def.proFeature === "loops" && !capabilities.allowLoops) locked = true;
    if (def.proFeature === "conditions" && !capabilities.allowConditions) locked = true;
    if (def.proFeature === "variables" && !capabilities.allowVariables) locked = true;
    if (def.proFeature === "advanced" && !capabilities.allowDataProcessing) locked = true;

    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = (locked ? "🔒 " : "") + def.label + (locked ? " (Pro)" : "");
    if (locked) opt.dataset.locked = "true";
    els.newStepType.appendChild(opt);
  }
}

function bindEvents() {
  els.newBtn.addEventListener("click", onNew);
  els.exportBtn.addEventListener("click", onExport);
  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", onImport);
  els.addSiteBtn.addEventListener("click", onAddSite);
  els.newSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddSite();
    }
  });
  els.grantBtn.addEventListener("click", onGrant);
  els.addStepBtn.addEventListener("click", onAddStep);
  els.exportOneBtn.addEventListener("click", onExportOne);
  els.deleteBtn.addEventListener("click", onDelete);
  els.form.addEventListener("submit", onSave);
  els.wfName.addEventListener("input", () => {
    if (current) current.name = els.wfName.value;
  });
  els.wfFolder.addEventListener("input", () => {
    if (current) current.folder = els.wfFolder.value;
  });
  els.wfAutoRun.addEventListener("change", (e) => {
    if (!capabilities.allowAutoRun) {
      e.preventDefault();
      els.wfAutoRun.checked = false;
      showUpgradeModal();
      return;
    }
    if (current) current.autoRun = els.wfAutoRun.checked;
  });
  els.wfMaxRetries.addEventListener("input", () => {
    if (current) current.maxRetries = parseInt(els.wfMaxRetries.value, 10) || 0;
  });
  els.wfScheduleInterval.addEventListener("input", () => {
    if (current) current.scheduleInterval = parseInt(els.wfScheduleInterval.value, 10) || 0;
  });
  els.wfScheduleUrl.addEventListener("input", () => {
    if (current) current.scheduleUrl = els.wfScheduleUrl.value.trim();
  });
  els.wfShortcut.addEventListener("focus", () => els.wfShortcut.blur());
  els.recordShortcutBtn.addEventListener("click", onRecordShortcut);
  els.clearShortcutBtn.addEventListener("click", onClearShortcut);
  els.addVarBtn.addEventListener("click", onAddVar);
  els.viewLogsBtn.addEventListener("click", onViewLogs);
  els.clearLogsBtn.addEventListener("click", onClearLogs);
  els.settingsBtn.addEventListener("click", onViewSettings);

  els.addRevealSiteBtn.addEventListener("click", onAddRevealSite);
  els.newRevealSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddRevealSite();
    }
  });

  document.querySelectorAll('input[name="revealMode"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      extensionSettings.revealPasswords = e.target.value;
      saveSettings(extensionSettings);
      renderSettings();
    });
  });

  const closeUpgradeModalBtn = document.getElementById("closeUpgradeModalBtn");
  if (closeUpgradeModalBtn) {
    closeUpgradeModalBtn.addEventListener("click", hideUpgradeModal);
  }

  const modalActivateBtn = document.getElementById("modalActivateLicenseBtn");
  if (modalActivateBtn) {
    modalActivateBtn.addEventListener("click", () => onActivateLicense("modal"));
  }

  const activateLicenseBtn = document.getElementById("activateLicenseBtn");
  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener("click", () => onActivateLicense("settings"));
  }

  const removeLicenseBtn = document.getElementById("removeLicenseBtn");
  if (removeLicenseBtn) {
    removeLicenseBtn.addEventListener("click", onRemoveLicense);
  }

  els.newStepType.addEventListener("change", () => {
    const selectedOption = els.newStepType.options[els.newStepType.selectedIndex];
    if (selectedOption && selectedOption.dataset.locked === "true") {
      revertNewStepTypeSelect();
      showUpgradeModal();
    }
  });
}

async function onActivateLicense(source = "settings") {
  const isModal = source === "modal";
  const input = document.getElementById(isModal ? "modalLicenseKeyInput" : "licenseKeyInput");
  const emailInput = document.getElementById(isModal ? "modalLicenseEmailInput" : "licenseEmailInput");
  const msg = document.getElementById(isModal ? "modalLicenseMessage" : "licenseMessage");
  
  if (!input || !msg) return;
  
  const key = input.value.trim();
  const email = emailInput ? emailInput.value.trim() : "";
  
  if (!email) {
    msg.textContent = "Please enter your email address.";
    msg.style.color = "var(--error)";
    return;
  }
  
  if (!key) {
    msg.textContent = "Please enter a key.";
    msg.style.color = "var(--error)";
    return;
  }
  
  msg.textContent = "Validating...";
  msg.style.color = "var(--text-muted)";
  
  const result = await activateLicense(key, email);
  if (result.success) {
    msg.textContent = "License activated successfully!";
    msg.style.color = "var(--success)";
    setTimeout(async () => {
      if (isModal) hideUpgradeModal();
      
      // Update capabilities dynamically
      capabilities = await getCapabilities();
      
      // Re-populate and re-render UI elements
      populateStepTypeSelect();
      renderSettings();
      if (current) {
        renderEditor();
      }
      renderList();
      
      // Reset inputs & messages
      const mInput = document.getElementById("modalLicenseKeyInput");
      const mEmail = document.getElementById("modalLicenseEmailInput");
      const mMsg = document.getElementById("modalLicenseMessage");
      const sInput = document.getElementById("licenseKeyInput");
      const sEmail = document.getElementById("licenseEmailInput");
      const sMsg = document.getElementById("licenseMessage");
      
      if (mInput) mInput.value = "";
      if (mEmail) mEmail.value = "";
      if (mMsg) mMsg.textContent = "";
      if (sInput) sInput.value = "";
      if (sEmail) sEmail.value = "";
      if (sMsg) sMsg.textContent = "";
    }, 600);
  } else {
    msg.textContent = result.error || "Invalid license.";
    msg.style.color = "var(--error)";
  }
}

async function onRemoveLicense() {
  if (confirm("Are you sure you want to remove your Pro license?")) {
    await removeLicense();
    capabilities = await getCapabilities();
    populateStepTypeSelect();
    renderSettings();
    if (current) {
      renderEditor();
    }
    renderList();
  }
}

function showUpgradeModal() {
  const modal = document.getElementById("upgradeModal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.remove("hidden");
  }
}

function hideUpgradeModal() {
  const modal = document.getElementById("upgradeModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.add("hidden");
  }
}

// ---- Sidebar list ---------------------------------------------------------

function getAllFolderNames() {
  const names = new Set();
  workflows.forEach(wf => {
    const f = (wf.folder || "").trim();
    if (f) names.add(f);
  });
  return [...names].sort();
}

function renderList() {
  els.wfList.innerHTML = "";

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

    // ---- Folder header row ----
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
    header.addEventListener("click", () => {
      if (collapsedFolders.has(folder)) {
        collapsedFolders.delete(folder);
      } else {
        collapsedFolders.add(folder);
      }
      renderList();
    });
    els.wfList.appendChild(header);

    if (isCollapsed) continue;

    // ---- Workflow items ----
    for (const wf of grouped[folder]) {
      const li = document.createElement("li");
      if (current && wf.id === current.id) li.classList.add("active");

      const nameDiv = document.createElement("div");
      nameDiv.textContent = wf.name || "(untitled)";
      const sub = document.createElement("div");
      sub.className = "wf-sub";
      const parts = [`${countTotalSteps(wf.steps)} step(s)`];
      if (wf.autoRun) parts.push("auto");
      if (wf.shortcut) parts.push(wf.shortcut);
      sub.textContent = parts.join(" \u00B7 ");

      const dupBtn = document.createElement("button");
      dupBtn.className = "btn btn-icon wf-dup-btn";
      dupBtn.title = "Duplicate workflow";
      dupBtn.textContent = "⧉";
      dupBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const clone = structuredClone(wf);
        clone.id = "wf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
        clone.name = "Copy of " + (wf.name || "Untitled");
        await upsertWorkflow(clone);
        workflows = await getWorkflows();
        selectWorkflow(clone.id);
      });

      li.appendChild(nameDiv);
      li.appendChild(sub);
      li.appendChild(dupBtn);
      li.addEventListener("click", () => selectWorkflow(wf.id));
      els.wfList.appendChild(li);
    }
  }
}

function selectWorkflow(id) {
  const wf = workflows.find((w) => w.id === id);
  if (!wf) return;
  current = structuredClone(wf);
  els.logsView.classList.add("hidden");
  els.settingsView.classList.add("hidden");
  document.querySelector(".editor").classList.remove("hidden");
  els.emptyEditor.classList.add("hidden");
  els.form.classList.remove("hidden");
  renderEditor();
  renderList();
  setSaveStatus("");
}

// ---- Editor ---------------------------------------------------------------

function renderEditor() {
  els.wfName.value = current.name || "";
  els.wfFolder.value = current.folder || "";
  els.wfAutoRun.checked = !!current.autoRun;
  
  if (!capabilities.allowAutoRun) {
    els.wfAutoRun.parentElement.innerHTML = `<input id="wfAutoRun" type="checkbox" /> 🔒 Auto-run (Pro)`;
    // Re-bind els.wfAutoRun because we replaced HTML
    els.wfAutoRun = document.getElementById("wfAutoRun");
    els.wfAutoRun.addEventListener("change", (e) => {
      e.preventDefault();
      els.wfAutoRun.checked = false;
      showUpgradeModal();
    });
  } else {
    els.wfAutoRun.parentElement.innerHTML = `<input id="wfAutoRun" type="checkbox" /> Auto-run`;
    // Re-bind els.wfAutoRun because we replaced HTML
    els.wfAutoRun = document.getElementById("wfAutoRun");
    els.wfAutoRun.checked = !!current.autoRun;
    els.wfAutoRun.addEventListener("change", () => {
      if (current) current.autoRun = els.wfAutoRun.checked;
    });
  }

  els.wfMaxRetries.value = current.maxRetries !== undefined ? current.maxRetries : 3;
  els.wfScheduleInterval.value = current.scheduleInterval || 0;
  els.wfScheduleUrl.value = current.scheduleUrl || "";
  els.wfShortcut.value = current.shortcut || "";
  stopShortcutCapture();

  // Populate folder datalist with all existing folder names
  const datalist = document.getElementById("folderSuggestions");
  if (datalist) {
    datalist.innerHTML = "";
    getAllFolderNames().forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      datalist.appendChild(opt);
    });
  }

  renderSites();
  renderVariables();
  renderSteps();
  refreshPermStatus();
}

function renderSites() {
  els.siteList.innerHTML = "";
  (current.sites || []).forEach((site, i) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = site;
    input.addEventListener("input", () => {
      current.sites[i] = input.value;
    });
    input.addEventListener("blur", refreshPermStatus);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      current.sites.splice(i, 1);
      renderSites();
      refreshPermStatus();
    });
    row.appendChild(input);
    row.appendChild(del);
    els.siteList.appendChild(row);
  });
}

function onAddSite() {
  const val = els.newSite.value.trim();
  if (!val) return;
  if (!current.sites) current.sites = [];
  current.sites.push(val);
  els.newSite.value = "";
  renderSites();
  refreshPermStatus();
}

function renderVariables() {
  els.variableList.innerHTML = "";
  (current.variables || []).forEach((v, i) => {
    const row = document.createElement("div");
    row.className = "site-row"; // Reuse site-row style
    
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = v.name;
    nameInput.placeholder = "Variable name";
    nameInput.addEventListener("input", () => {
      current.variables[i].name = nameInput.value;
    });

    const defInput = document.createElement("input");
    defInput.type = "text";
    defInput.value = v.defaultValue;
    defInput.placeholder = "Default value";
    defInput.addEventListener("input", () => {
      current.variables[i].defaultValue = defInput.value;
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      current.variables.splice(i, 1);
      renderVariables();
    });

    row.appendChild(nameInput);
    row.appendChild(defInput);
    row.appendChild(del);
    els.variableList.appendChild(row);
  });
}

function onAddVar() {
  const name = els.newVarName.value.trim();
  const def = els.newVarDefault.value;
  if (!name) return;
  if (!current.variables) current.variables = [];
  current.variables.push({ name, defaultValue: def });
  els.newVarName.value = "";
  els.newVarDefault.value = "";
  renderVariables();
}

async function refreshPermStatus() {
  const origins = (current.sites || []).map(siteToOrigin).filter(Boolean);
  if (origins.length === 0) {
    els.permStatus.textContent = "No sites listed (manual runs use activeTab).";
    els.permStatus.className = "perm-status";
    return;
  }
  try {
    const granted = await chrome.permissions.contains({ origins });
    els.permStatus.textContent = granted ? "Access granted." : "Access not granted yet.";
    els.permStatus.className = "perm-status " + (granted ? "ok" : "err");
  } catch (e) {
    els.permStatus.textContent = "Could not check: " + e.message;
    els.permStatus.className = "perm-status err";
  }
}

async function onGrant() {
  const origins = (current.sites || []).map(siteToOrigin).filter(Boolean);
  if (origins.length === 0) {
    setSaveStatus("Add at least one site first.", "err");
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins });
    if (granted) {
      setSaveStatus("Access granted.", "ok");
    } else {
      setSaveStatus("Permission request was dismissed.", "err");
    }
  } catch (e) {
    setSaveStatus("Permission error: " + e.message, "err");
  }
  refreshPermStatus();
}

let dragSrcArray = null;
let dragSrcIdx = null;

function renderSteps(stepArray = current.steps, containerEl = els.stepList) {
  if (containerEl === els.stepList) {
    containerEl.innerHTML = "";
  }
  (stepArray || []).forEach((step, i) => {
    containerEl.appendChild(renderStep(step, i, stepArray));
  });
}

function renderStep(step, i, parentArray) {
  const wrap = document.createElement("div");
  wrap.className = "step";
  wrap.dataset.idx = i;

  // Drag-and-drop: only the handle starts the drag.
  wrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragSrcArray && !(dragSrcArray === parentArray && dragSrcIdx === i)) {
      wrap.classList.add("drag-over");
    }
  });
  wrap.addEventListener("dragleave", () => {
    wrap.classList.remove("drag-over");
  });
  wrap.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    wrap.classList.remove("drag-over");
    if (!dragSrcArray) return;
    if (dragSrcArray === parentArray && dragSrcIdx === i) return;
    
    // Prevent dropping a parent into its own child
    let isChild = false;
    let curr = parentArray;
    // We cannot easily check parent chain here without parent refs, but for MVP depth is small.
    // If dropping is buggy, they can use JSON. For now simple splice:
    
    const [moved] = dragSrcArray.splice(dragSrcIdx, 1);
    parentArray.splice(i, 0, moved);
    dragSrcArray = null;
    dragSrcIdx = null;
    renderSteps(); // Re-render the whole tree
  });

  // ---- Header row ----
  const top = document.createElement("div");
  top.className = "step-top";

  const handle = document.createElement("span");
  handle.className = "step-drag-handle";
  handle.textContent = "\u2847";
  handle.title = "Drag to reorder";
  handle.draggable = true;
  handle.addEventListener("dragstart", (e) => {
    dragSrcArray = parentArray;
    dragSrcIdx = i;
    wrap.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  });
  handle.addEventListener("dragend", () => {
    dragSrcArray = null;
    dragSrcIdx = null;
    wrap.classList.remove("dragging");
    document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });

  const idx = document.createElement("span");
  idx.className = "step-index";
  idx.textContent = "#" + (i + 1);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "step-name";
  nameInput.placeholder = "Step name (optional)";
  nameInput.value = step.name || "";
  nameInput.addEventListener("input", () => {
    step.name = nameInput.value;
  });

  const typeSel = document.createElement("select");
  const sortedTypes = Object.entries(STEP_TYPES).sort(([, a], [, b]) => a.label.localeCompare(b.label));
  let previousTypeValue = step.type;

  for (const [type, def] of sortedTypes) {
    let locked = false;
    if (def.proFeature === "loops" && !capabilities.allowLoops) locked = true;
    if (def.proFeature === "conditions" && !capabilities.allowConditions) locked = true;
    if (def.proFeature === "variables" && !capabilities.allowVariables) locked = true;
    if (def.proFeature === "advanced" && !capabilities.allowDataProcessing) locked = true;

    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = (locked ? "🔒 " : "") + def.label + (locked ? " (Pro)" : "");
    if (locked) opt.dataset.locked = "true";
    if (type === step.type) opt.selected = true;
    typeSel.appendChild(opt);
  }
  
  typeSel.addEventListener("change", () => {
    const selectedOption = typeSel.options[typeSel.selectedIndex];
    if (selectedOption.dataset.locked === "true") {
      typeSel.value = previousTypeValue;
      showUpgradeModal();
      return;
    }
    previousTypeValue = typeSel.value;
    step.type = typeSel.value;
    step.selectorType = DEFAULT_SELECTOR_TYPE;
    step.selector = "";
    step.value = "";
    step.delayMs = step.type === "wait" ? 1000 : 0;
    renderSteps();
  });

  const optLabel = document.createElement("label");
  optLabel.className = "inline";
  optLabel.style.marginLeft = "auto";
  optLabel.style.marginRight = "10px";
  optLabel.style.fontSize = "11px";
  optLabel.style.cursor = "pointer";
  const optCb = document.createElement("input");
  optCb.type = "checkbox";
  optCb.checked = !!step.optional;
  optCb.addEventListener("change", () => {
    step.optional = optCb.checked;
  });
  optLabel.appendChild(optCb);
  optLabel.appendChild(document.createTextNode(" Optional (ignore error)"));

  const actions = document.createElement("div");
  actions.className = "step-actions";
  actions.appendChild(iconBtn("\u29C9", "Duplicate step", () => {
    const clone = structuredClone(step);
    parentArray.splice(i + 1, 0, clone);
    renderSteps();
  }));
  actions.appendChild(iconBtn("\u2715", "Delete step", () => {
    parentArray.splice(i, 1);
    renderSteps();
  }));

  top.appendChild(handle);
  top.appendChild(idx);
  top.appendChild(nameInput);
  top.appendChild(typeSel);
  top.appendChild(optLabel);
  top.appendChild(actions);
  wrap.appendChild(top);

  const fields = document.createElement("div");
  fields.className = "step-fields";
  const needs = STEP_TYPES[step.type] ? STEP_TYPES[step.type].needs : ["selector", "value"];

  if (needs.includes("selector") && step.type !== "calculateMath" && step.type !== "if_variable") {
    fields.appendChild(selectorTypeField(step));
    fields.appendChild(selectorField(step));
  }
  if (needs.includes("value")) {
    if (step.type === "runWorkflow") {
      const wrapper = document.createElement("div");
      wrapper.className = "step-field";
      wrapper.innerHTML = `<label>Workflow</label><select></select>`;
      const sel = wrapper.querySelector("select");
      let optionsHtml = `<option value="">-- Select Workflow --</option>`;
      workflows.forEach(w => {
        optionsHtml += `<option value="${w.id}">${w.name}</option>`;
      });
      sel.innerHTML = optionsHtml;
      sel.value = step.value || "";
      sel.addEventListener("change", () => (step.value = sel.value));
      fields.appendChild(wrapper);
    } else if (step.type === "pressKey") {
      // Parse existing config or use defaults
      let cfg = { key: "Enter", ctrl: false, alt: false, shift: false, meta: false };
      try { if (step.value) cfg = { ...cfg, ...JSON.parse(step.value) }; } catch {}

      const COMMON_KEYS = ["Enter","Tab","Escape","Backspace","Delete","Space",
        "ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End","PageUp","PageDown",
        "F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"];

      const wrapper = document.createElement("div");
      wrapper.className = "step-field";

      // Key picker
      const keyWrap = document.createElement("div");
      keyWrap.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;";
      const keyLabel = document.createElement("label");
      keyLabel.textContent = "Key";
      keyLabel.style.minWidth = "60px";
      const keyInput = document.createElement("input");
      keyInput.type = "text";
      keyInput.list = "vf-key-list";
      keyInput.value = cfg.key;
      keyInput.placeholder = "e.g. Enter, a, F5";
      keyInput.style.flex = "1";
      const datalist = document.createElement("datalist");
      datalist.id = "vf-key-list";
      COMMON_KEYS.forEach(k => { const o = document.createElement("option"); o.value = k; datalist.appendChild(o); });
      keyWrap.append(keyLabel, keyInput, datalist);

      // Modifier checkboxes
      const modWrap = document.createElement("div");
      modWrap.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;";
      const updateValue = () => {
        cfg.key = keyInput.value.trim() || "Enter";
        step.value = JSON.stringify(cfg);
      };
      keyInput.addEventListener("input", updateValue);
      for (const mod of ["ctrl","alt","shift","meta"]) {
        const lbl = document.createElement("label");
        lbl.style.cssText = "display:flex;align-items:center;gap:4px;cursor:pointer;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!cfg[mod];
        cb.addEventListener("change", () => { cfg[mod] = cb.checked; updateValue(); });
        lbl.append(cb, document.createTextNode(mod.charAt(0).toUpperCase() + mod.slice(1)));
        modWrap.appendChild(lbl);
      }

      wrapper.append(keyWrap, modWrap);
      fields.appendChild(wrapper);
      // Set initial serialized value
      updateValue();
    } else if (step.type === "sendWebhook") {
      const wrapper = document.createElement("div");
      wrapper.className = "step-field";
      // URL field
      const urlWrap = document.createElement("div");
      urlWrap.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px;";
      const urlLabel = document.createElement("label");
      urlLabel.textContent = "Webhook URL";
      urlLabel.style.minWidth = "110px";
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "https://...";
      urlInput.value = step.value || "";
      urlInput.style.flex = "1";
      urlInput.addEventListener("input", () => (step.value = urlInput.value.trim()));
      urlWrap.append(urlLabel, urlInput);
      // Auth header field (repurposed selector field)
      const authWrap = document.createElement("div");
      authWrap.style.cssText = "display:flex;gap:6px;align-items:center;";
      const authLabel = document.createElement("label");
      authLabel.textContent = "Authorization";
      authLabel.style.minWidth = "110px";
      const authInput = document.createElement("input");
      authInput.type = "text";
      authInput.placeholder = "Bearer <token>  (optional)";
      authInput.value = step.selector || "";
      authInput.style.flex = "1";
      authInput.addEventListener("input", () => (step.selector = authInput.value.trim()));
      authWrap.append(authLabel, authInput);
      wrapper.append(urlWrap, authWrap);
      fields.appendChild(wrapper);
    } else if (step.type === "calculateMath") {
      fields.appendChild(textareaField("Math Expression", step.value || "", (v) => (step.value = v), "{{price}} * {{quantity}}"));
      fields.appendChild(field("Result Variable Name", step.selector || "", (v) => (step.selector = v), "e.g. total"));
    } else if (step.type === "if_variable") {
      fields.appendChild(field("Variable", step.selector || "", (v) => (step.selector = v), "{{price}}"));
      
      const opWrap = document.createElement("div");
      opWrap.className = "step-field";
      opWrap.innerHTML = `<label>Operator</label><select></select>`;
      const opSel = opWrap.querySelector("select");
      for (const [op, def] of Object.entries(COMPARISON_OPERATORS)) {
        const opt = document.createElement("option");
        opt.value = op;
        opt.textContent = def.label;
        if ((step.selectorType || "==") === op) opt.selected = true;
        opSel.appendChild(opt);
      }
      opSel.addEventListener("change", () => (step.selectorType = opSel.value));
      fields.appendChild(opWrap);

      fields.appendChild(field("Value", step.value || "", (v) => (step.value = v), "100"));
    } else {
      const placeholder = step.type === "navigate" ? "https://..." : step.type === "check" ? "true / false" : step.type === "selectOption" ? "option value or text" : step.type === "waitNetworkIdle" ? "Idle duration (ms)" : step.type === "extractText" ? "Variable name to save to" : step.type === "exportData" ? "Format: 'csv' or 'json'" : "text to type";
      fields.appendChild(field("Value", step.value || "", (v) => (step.value = v), placeholder));
    }

    if (step.type === "extractText") {
      const optWrap = document.createElement("div");
      optWrap.className = "step-field";
      optWrap.style.marginTop = "4px";
      const lbl = document.createElement("label");
      lbl.className = "inline";
      lbl.style.cursor = "pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!step.parseNumeric;
      cb.addEventListener("change", () => (step.parseNumeric = cb.checked));
      lbl.append(cb, document.createTextNode(" Parse as number (strip symbols)"));
      optWrap.appendChild(lbl);
      fields.appendChild(optWrap);
    }
  }

  if (needs.includes("delayMs")) {
    const labelTxt = (step.type === "waitFor" || step.type === "waitVisible" || step.type === "waitNetworkIdle") ? "Timeout (ms)" : "Delay (ms)";
    fields.appendChild(field(labelTxt, step.delayMs !== undefined ? step.delayMs : 0, (v) => (step.delayMs = v), "e.g. 1000 or {{myVar}}"));
  }

  wrap.appendChild(fields);
  
  if (step.type === "loop") {
    // Loop specific fields
    const loopFields = document.createElement("div");
    loopFields.className = "step-fields";
    loopFields.style.marginTop = "8px";
    
    // Mode selector
    const modeWrapper = document.createElement("div");
    modeWrapper.className = "step-field";
    modeWrapper.innerHTML = `<label>Loop Mode</label><select>
      <option value="repeat">Repeat N Times</option>
      <option value="whileExists">While Element Exists</option>
      <option value="forEach">For Each Element</option>
    </select>`;
    const modeSel = modeWrapper.querySelector("select");
    modeSel.value = step.mode || "repeat";
    modeSel.addEventListener("change", () => {
      step.mode = modeSel.value;
      renderSteps(); // re-render to toggle inputs
    });
    loopFields.appendChild(modeWrapper);
    
    if (step.mode === "repeat") {
      loopFields.appendChild(field("Count", step.count !== undefined ? step.count : 5, (v) => (step.count = v), "e.g. 5 or {{myVar}}"));
    } else if (step.mode === "whileExists" || step.mode === "forEach") {
      loopFields.appendChild(selectorTypeField(step));
      loopFields.appendChild(selectorField(step));
    }
    
    wrap.appendChild(loopFields);
    
    // Nested steps container
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "step-children";
    
    // Drag-and-drop into the empty space of the children container
    childrenContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dragSrcArray && dragSrcArray !== step.steps) {
        childrenContainer.classList.add("drag-over");
      }
    });
    childrenContainer.addEventListener("dragleave", () => {
      childrenContainer.classList.remove("drag-over");
    });
    childrenContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      childrenContainer.classList.remove("drag-over");
      if (!dragSrcArray) return;
      if (dragSrcArray === step.steps) return; // already handled by item drop or sorting
      
      const [moved] = dragSrcArray.splice(dragSrcIdx, 1);
      if (!step.steps) step.steps = [];
      step.steps.push(moved);
      dragSrcArray = null;
      dragSrcIdx = null;
      renderSteps();
    });

    if (!step.steps) step.steps = [];
    
    // Recursively render children into this container
    // We pass true for a flag or just reuse renderSteps
    renderSteps(step.steps, childrenContainer);
    
    // Add child button
    const addChildBtn = document.createElement("button");
    addChildBtn.className = "btn btn-sm";
    addChildBtn.textContent = "+ Add Step Inside Loop";
    addChildBtn.style.alignSelf = "flex-start";
    addChildBtn.style.marginTop = "6px";
    addChildBtn.addEventListener("click", () => {
      if (countTotalSteps(current.steps) >= capabilities.maxSteps) {
        showUpgradeModal();
        return;
      }
      step.steps.push(newStep("click"));
      renderSteps();
    });
    childrenContainer.appendChild(addChildBtn);
    
    wrap.appendChild(childrenContainer);
  }

  return wrap;
}

function selectorTypeField(step) {
  const f = document.createElement("div");
  f.className = "step-field";
  const l = document.createElement("label");
  l.textContent = "Find element by";
  const sel = document.createElement("select");
  for (const [type, def] of Object.entries(SELECTOR_TYPES)) {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = def.label;
    if ((step.selectorType || DEFAULT_SELECTOR_TYPE) === type) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    step.selectorType = sel.value;
    renderSteps();
  });
  f.appendChild(l);
  f.appendChild(sel);
  return f;
}

function selectorField(step) {
  const type = step.selectorType || DEFAULT_SELECTOR_TYPE;
  const def = SELECTOR_TYPES[type] || SELECTOR_TYPES.css;
  return field(def.label, step.selector || "", (v) => (step.selector = v), def.placeholder);
}

function field(labelText, value, onInput, placeholder = "") {
  const f = document.createElement("div");
  f.className = "step-field";
  const l = document.createElement("label");
  l.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener("input", () => onInput(input.value));
  f.appendChild(l);
  f.appendChild(input);
  return f;
}

function textareaField(labelText, value, onInput, placeholder = "") {
  const f = document.createElement("div");
  f.className = "step-field";
  // Make textarea take up more space proportionally
  f.style.flex = "2";
  const l = document.createElement("label");
  l.textContent = labelText;
  const input = document.createElement("textarea");
  input.value = value;
  input.placeholder = placeholder;
  input.rows = 2;
  input.addEventListener("input", () => onInput(input.value));
  f.appendChild(l);
  f.appendChild(input);
  return f;
}



function iconBtn(symbol, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-icon";
  b.textContent = symbol;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function countTotalSteps(steps = []) {
  let count = 0;
  for (const step of steps) {
    count++;
    if (step.steps && step.steps.length > 0) {
      count += countTotalSteps(step.steps);
    }
  }
  return count;
}

function revertNewStepTypeSelect() {
  for (const opt of els.newStepType.options) {
    if (opt.dataset.locked !== "true") {
      els.newStepType.value = opt.value;
      break;
    }
  }
}

function onAddStep() {
  if (!current.steps) current.steps = [];
  if (countTotalSteps(current.steps) >= capabilities.maxSteps) {
    showUpgradeModal();
    return;
  }
  
  const type = els.newStepType.value;
  const def = STEP_TYPES[type];
  if (def && def.proFeature) {
    let locked = false;
    if (def.proFeature === "loops" && !capabilities.allowLoops) locked = true;
    if (def.proFeature === "conditions" && !capabilities.allowConditions) locked = true;
    if (def.proFeature === "variables" && !capabilities.allowVariables) locked = true;
    if (def.proFeature === "advanced" && !capabilities.allowDataProcessing) locked = true;
    
    if (locked) {
      revertNewStepTypeSelect();
      showUpgradeModal();
      return;
    }
  }

  current.steps.push(newStep(type));
  renderSteps();
}

// ---- Shortcut recording ---------------------------------------------------

let shortcutCapturing = false;
let shortcutKeyHandler = null;

function onRecordShortcut() {
  if (shortcutCapturing) {
    stopShortcutCapture();
    return;
  }
  shortcutCapturing = true;
  els.wfShortcut.classList.add("recording");
  els.wfShortcut.value = "Press a key…";
  els.recordShortcutBtn.textContent = "Cancel";

  shortcutKeyHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const str = formatShortcut(e);
    if (!str) return; // modifier-only press, keep waiting
    if (current) current.shortcut = str;
    els.wfShortcut.value = str;
    stopShortcutCapture();
  };
  document.addEventListener("keydown", shortcutKeyHandler, true);
}

function stopShortcutCapture() {
  if (shortcutKeyHandler) {
    document.removeEventListener("keydown", shortcutKeyHandler, true);
    shortcutKeyHandler = null;
  }
  shortcutCapturing = false;
  els.wfShortcut.classList.remove("recording");
  els.recordShortcutBtn.textContent = "Record";
}

function onClearShortcut() {
  stopShortcutCapture();
  if (current) current.shortcut = "";
  els.wfShortcut.value = "";
}

// ---- Save / delete / new --------------------------------------------------

async function onSave(e) {
  e.preventDefault();
  current.name = els.wfName.value.trim() || "Untitled workflow";
  current.folder = els.wfFolder.value.trim();
  current.autoRun = els.wfAutoRun.checked;
  current.maxRetries = parseInt(els.wfMaxRetries.value, 10) || 0;
  current.scheduleInterval = parseInt(els.wfScheduleInterval.value, 10) || 0;
  current.scheduleUrl = els.wfScheduleUrl.value.trim();
  
  // Catch any pending site the user typed but forgot to click 'Add site' for
  const pendingSite = els.newSite.value.trim();
  if (pendingSite) {
    if (!current.sites) current.sites = [];
    current.sites.push(pendingSite);
    els.newSite.value = "";
  }
  current.sites = (current.sites || []).map((s) => s.trim()).filter(Boolean);
  
  // Catch any pending variable the user typed but forgot to click 'Add' for
  const pendingVarName = els.newVarName.value.trim();
  if (pendingVarName) {
    if (!current.variables) current.variables = [];
    current.variables.push({ name: pendingVarName, defaultValue: els.newVarDefault.value });
    els.newVarName.value = "";
    els.newVarDefault.value = "";
  }

  // -- Inline step validation --
  const stepEls = els.stepList.querySelectorAll(".step");
  let hasError = false;
  (current.steps || []).forEach((step, i) => {
    const needs = (STEP_TYPES[step.type] || {}).needs || [];
    const card = stepEls[i];
    if (!card) return;
    card.classList.remove("step-error");
    card.removeAttribute("title");

    const missing = [];
    if (needs.includes("selector") && !step.selector && step.type !== "pressKey") missing.push("selector");
    if (needs.includes("value") && !step.value &&
        !["screenshot", "exportData", "pressKey"].includes(step.type)) missing.push("value");
    if (step.type === "sendWebhook" && !step.value) missing.push("Webhook URL");
    if (step.type === "runWorkflow" && !step.value) missing.push("target workflow");

    if (missing.length > 0) {
      card.classList.add("step-error");
      card.title = `Missing required: ${missing.join(", ")}`;
      hasError = true;
    }
  });

  if (hasError) {
    setSaveStatus("Fix highlighted steps before saving.", "err");
    return;
  }

  // Detect shortcut conflicts with other workflows.
  if (current.shortcut) {
    const conflict = workflows.find(
      (w) => w.id !== current.id && w.shortcut === current.shortcut
    );
    if (conflict) {
      const ok = confirm(
        `Shortcut "${current.shortcut}" is already used by "${conflict.name}".\nSave anyway?`
      );
      if (!ok) return;
    }
  }

  await upsertWorkflow(current);
  workflows = await getWorkflows();
  renderList();
  setSaveStatus("Saved.", "ok");
  chrome.runtime.sendMessage({ type: "syncAlarms" }).catch(() => {});
}

async function onNew() {
  if (workflows.length >= capabilities.maxWorkflows) {
    showUpgradeModal();
    return;
  }
  const wf = newWorkflow();
  await upsertWorkflow(wf);
  workflows = await getWorkflows();
  selectWorkflow(wf.id);
}

async function onDelete() {
  if (!current) return;
  if (!confirm(`Delete workflow "${current.name}"?`)) return;
  await deleteWorkflow(current.id);
  current = null;
  workflows = await getWorkflows();
  renderList();
  els.form.classList.add("hidden");
  els.emptyEditor.classList.remove("hidden");
}

// ---- Import / export ------------------------------------------------------

function downloadJson(filename, value) {
  const data = JSON.stringify(value, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return (name || "workflow").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "workflow";
}

async function onExport() {
  if (workflows.length === 0) {
    setSaveStatus("No workflows to export.", "err");
    return;
  }

  // Build a quick modal
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;";

  const box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:10px;padding:22px 24px;min-width:300px;max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,.25);";

  const title = document.createElement("h3");
  title.textContent = "Export Workflows";
  title.style.margin = "0 0 14px";

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:16px;";

  const checks = [];
  workflows.forEach(wf => {
    const lbl = document.createElement("label");
    lbl.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !current || wf.id === current?.id;
    const span = document.createElement("span");
    span.textContent = wf.name || "(untitled)";
    lbl.append(cb, span);
    list.appendChild(lbl);
    checks.push({ cb, wf });
  });

  const foot = document.createElement("div");
  foot.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-sm";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());
  const exportBtn2 = document.createElement("button");
  exportBtn2.className = "btn btn-primary btn-sm";
  exportBtn2.textContent = "Export selected";
  exportBtn2.addEventListener("click", () => {
    const selected = checks.filter(c => c.cb.checked).map(c => c.wf);
    if (selected.length === 0) { alert("Select at least one workflow."); return; }
    
    let filename;
    if (selected.length === 1) {
      filename = `${safeFileName(selected[0].name)}_${Date.now()}.json`;
    } else {
      filename = `taskorbit_workflows_export_${Date.now()}.json`;
    }
    
    downloadJson(filename, selected);
    overlay.remove();
  });
  foot.append(cancelBtn, exportBtn2);
  box.append(title, list, foot);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function onExportOne() {
  if (!current) return;
  downloadJson(`${safeFileName(current.name)}_${Date.now()}.json`, [current]);
}

async function onImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : [parsed];
    const valid = incoming.filter((w) => w && typeof w === "object" && Array.isArray(w.steps));
    if (valid.length === 0) throw new Error("No valid workflows found.");
    // Assign fresh ids to avoid collisions.
    const existingIds = new Set(workflows.map((w) => w.id));
    for (const w of valid) {
      if (!w.id || existingIds.has(w.id)) {
        w.id = "wf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      }
      existingIds.add(w.id);
      w.sites = Array.isArray(w.sites) ? w.sites : [];
      w.autoRun = !!w.autoRun;
      w.name = w.name || "Imported workflow";
    }
    workflows = workflows.concat(valid);
    if (workflows.length > capabilities.maxWorkflows) {
      workflows = workflows.slice(0, capabilities.maxWorkflows);
      setSaveStatus(`Imported partial. Limit reached (${capabilities.maxWorkflows}).`, "err");
      showUpgradeModal();
    } else {
      setSaveStatus(`Imported ${valid.length} workflow(s).`, "ok");
    }
    await saveWorkflows(workflows);
    renderList();
  } catch (err) {
    setSaveStatus("Import failed: " + err.message, "err");
  } finally {
    els.importFile.value = "";
  }
}

function setSaveStatus(text, kind = "") {
  els.saveStatus.textContent = text;
  els.saveStatus.className = "save-status" + (kind ? " " + kind : "");
}

// ---- Logs Viewer ----------------------------------------------------------

async function onViewLogs() {
  current = null;
  renderList();
  document.querySelector(".editor").classList.add("hidden");
  els.settingsView.classList.add("hidden");
  els.logsView.classList.remove("hidden");
  await renderLogs();
}

async function onClearLogs() {
  if (!confirm("Are you sure you want to clear all logs?")) return;
  await clearLogs();
  await renderLogs();
}

async function renderLogs() {
  const logs = await getLogs();
  els.logsTableBody.innerHTML = "";
  if (logs.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No logs found.";
    td.style.padding = "10px";
    td.style.textAlign = "center";
    td.style.color = "var(--text-muted)";
    tr.appendChild(td);
    els.logsTableBody.appendChild(tr);
    return;
  }

  for (const log of logs) {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border-color)";

    const tdDate = document.createElement("td");
    tdDate.style.padding = "8px";
    tdDate.textContent = new Date(log.timestamp).toLocaleString();

    const tdWf = document.createElement("td");
    tdWf.style.padding = "8px";
    tdWf.textContent = log.workflowName || log.workflowId;

    const tdDur = document.createElement("td");
    tdDur.style.padding = "8px";
    tdDur.textContent = `${log.durationMs} ms`;

    const tdStatus = document.createElement("td");
    tdStatus.style.padding = "8px";
    const statusSpan = document.createElement("span");
    statusSpan.textContent = log.status.toUpperCase();
    statusSpan.style.fontWeight = "bold";
    statusSpan.style.color = log.status === "success" ? "var(--accent-ok)" : "var(--accent-err)";
    tdStatus.appendChild(statusSpan);

    const tdMsg = document.createElement("td");
    tdMsg.style.padding = "8px";
    tdMsg.textContent = log.errorMessage || "-";
    tdMsg.style.maxWidth = "250px";
    tdMsg.style.overflow = "hidden";
    tdMsg.style.textOverflow = "ellipsis";
    tdMsg.style.whiteSpace = "nowrap";
    if (log.errorMessage) tdMsg.title = log.errorMessage;

    tr.appendChild(tdDate);
    tr.appendChild(tdWf);
    tr.appendChild(tdDur);
    tr.appendChild(tdStatus);
    tr.appendChild(tdMsg);

    els.logsTableBody.appendChild(tr);
  }
}

// ---- Settings View --------------------------------------------------------

function onViewSettings() {
  current = null;
  renderList();
  document.querySelector(".editor").classList.add("hidden");
  els.emptyEditor.classList.add("hidden");
  els.logsView.classList.add("hidden");
  els.settingsView.classList.remove("hidden");
}

function renderSettings() {
  if (!extensionSettings) return;
  const mode = extensionSettings.revealPasswords || "off";
  const radio = document.querySelector(`input[name="revealMode"][value="${mode}"]`);
  if (radio) radio.checked = true;

  if (mode === "site") {
    els.revealSitesContainer.classList.remove("hidden");
  } else {
    els.revealSitesContainer.classList.add("hidden");
  }

  els.revealSiteList.innerHTML = "";
  (extensionSettings.revealSites || []).forEach((site, i) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = site;
    input.addEventListener("input", () => {
      extensionSettings.revealSites[i] = input.value;
      saveSettings(extensionSettings);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-danger";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      extensionSettings.revealSites.splice(i, 1);
      saveSettings(extensionSettings);
      renderSettings();
    });
    row.appendChild(input);
    row.appendChild(del);
    els.revealSiteList.appendChild(row);
  });
  
  renderLicenseStatus();
}

async function renderLicenseStatus() {
  const license = await getActiveLicense();
  const badge = document.getElementById("currentTierBadge");
  const text = document.getElementById("licenseStatusText");
  const input = document.getElementById("licenseKeyInput");
  const emailInput = document.getElementById("licenseEmailInput");
  const activateBtn = document.getElementById("activateLicenseBtn");
  const removeBtn = document.getElementById("removeLicenseBtn");
  const msg = document.getElementById("licenseMessage");

  if (!badge || !text) return;

  if (license.tier === "PRO") {
    badge.textContent = "PRO";
    badge.style.background = "#dbeafe";
    badge.style.color = "#1e40af";
    text.textContent = "TaskOrbit Pro is active. All advanced features unlocked!";
    input.value = license.key ? "•".repeat(license.key.length) : "••••••••••••";
    input.disabled = true;
    if (emailInput) {
      emailInput.value = license.email || "";
      emailInput.disabled = true;
    }
    activateBtn.disabled = true;
    removeBtn.classList.remove("hidden");
    if (msg) msg.textContent = "";
  } else {
    badge.textContent = "LITE";
    badge.style.background = "#e2e8f0";
    badge.style.color = "#475569";
    text.textContent = "TaskOrbit Lite (Free) is active. Upgrade to unlock loops, conditions, and auto-run.";
    input.value = "";
    input.disabled = false;
    if (emailInput) {
      emailInput.value = "";
      emailInput.disabled = false;
    }
    activateBtn.disabled = false;
    removeBtn.classList.add("hidden");
    if (msg) msg.textContent = "";
  }
}

function onAddRevealSite() {
  const val = els.newRevealSite.value.trim();
  if (!val) return;
  if (!extensionSettings.revealSites) extensionSettings.revealSites = [];
  extensionSettings.revealSites.push(val);
  els.newRevealSite.value = "";
  saveSettings(extensionSettings);
  renderSettings();
}

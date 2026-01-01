import {
  defaultState,
  loadState,
  saveState,
  resetState,
  uid,
} from "./state.js";
import { computeLayout } from "./layout.js";
import { render, resizeCanvas, drawEdges } from "./view.js";
import { createViewportController } from "./interaction.js";

let state = loadState() ?? defaultState();

const viewport = document.getElementById("viewport");
const nodesEl = document.getElementById("nodes");
const canvas = document.getElementById("edges");
const ctx = canvas.getContext("2d");

const btnAddChild = document.getElementById("btnAddChild");
const btnDelete = document.getElementById("btnDelete");
const btnReset = document.getElementById("btnReset");
const btnFit = document.getElementById("btnFit");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const importFile = document.getElementById("importFile");

let dpr = resizeCanvas(canvas, ctx);

// =============================
// Undo / Redo
// =============================
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 100;

function cloneState(s) {
  return typeof structuredClone === "function"
    ? structuredClone(s)
    : JSON.parse(JSON.stringify(s));
}

function pushHistory() {
  undoStack.push(cloneState(state));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(cloneState(state));
  state = undoStack.pop();
  saveState(state);
  rerender();
  requestEdgeRedraw();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(cloneState(state));
  state = redoStack.pop();
  saveState(state);
  rerender();
  requestEdgeRedraw();
}

// =============================
// 描画管理
// =============================
let latestLayout = null;
let drawPending = false;

function requestEdgeRedraw() {
  if (drawPending) return;
  drawPending = true;

  requestAnimationFrame(() => {
    drawPending = false;
    if (!latestLayout) return;
    const view = controller.getView();
    drawEdges({ state, layout: latestLayout, ctx, view, dpr });
  });
}

function rerender() {
  latestLayout = computeLayout(state, ctx);
  const view = controller.getView();

  render({
    state,
    layout: latestLayout,
    nodesEl,
    canvas,
    ctx,
    view,
    dpr,
    isEditingId: (id) => state.editingId === id,
    onSelect: (id) => {
      state.selectedId = id;
      saveState(state);
      rerender();
    },
    onStartEdit: (id, opts) => startEdit(id, opts),
  });

  wireEditingHandlers();

  if (pendingSelectAllId) {
    const id = pendingSelectAllId;
    pendingSelectAllId = null;

    queueMicrotask(() => {
      const label = nodesEl.querySelector(
        `.node[data-id="${CSS.escape(id)}"] .label`
      );
      if (!label) return;
      label.focus();
      const range = document.createRange();
      range.selectNodeContents(label);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }
}

// =============================
// 編集制御
// =============================
let pendingSelectAllId = null;

function startEdit(id, { selectAll = false } = {}) {
  if (!state.nodes[id]) return;

  state.editingId = id;
  state.snapshot = state.nodes[id].label ?? "";
  state.selectedId = id;

  pendingSelectAllId = selectAll ? id : null;

  saveState(state);
  rerender();
}

function commitEditFromDOM(id) {
  const node = state.nodes[id];
  if (!node) return;

  const label = nodesEl.querySelector(
    `.node[data-id="${CSS.escape(id)}"] .label`
  );
  const text = (label?.innerText ?? "").trim();

  if (node.label !== text) {
    pushHistory();
    node.label = text || "（無題）";
  }

  state.editingId = null;
  state.snapshot = null;
  saveState(state);
  rerender();
}

function cancelEdit() {
  if (!state.editingId) return;
  const id = state.editingId;
  const n = state.nodes[id];
  if (n) n.label = state.snapshot ?? n.label;
  state.editingId = null;
  state.snapshot = null;
  saveState(state);
  rerender();
}

function wireEditingHandlers() {
  const labels = nodesEl.querySelectorAll(".label[contenteditable='true']");
  labels.forEach((label) => {
    const id = label.closest(".node")?.dataset?.id;
    if (!id || label.dataset.bound) return;
    label.dataset.bound = "1";

    label.addEventListener("keydown", (e) => {
      if (state.editingId !== id) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitEditFromDOM(id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    });

    label.addEventListener("blur", () => {
      if (state.editingId === id) commitEditFromDOM(id);
    });
  });
}

// =============================
// ノード操作
// =============================
function addChild() {
  if (state.editingId) return;
  pushHistory();

  const parentId = state.selectedId || state.rootId;
  const parent = state.nodes[parentId];
  if (!parent) return;

  const id = uid();
  state.nodes[id] = { id, label: "新しいノード", parentId, children: [] };
  parent.children.push(id);

  state.selectedId = id;
  saveState(state);
  startEdit(id, { selectAll: true });
}

function removeSubtree(id) {
  const n = state.nodes[id];
  if (!n) return;

  const p = state.nodes[n.parentId];
  if (p) p.children = p.children.filter((c) => c !== id);

  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const node = state.nodes[cur];
    if (!node) continue;
    for (const c of node.children) stack.push(c);
    delete state.nodes[cur];
  }
}

function deleteSelected() {
  if (state.editingId) return;
  const id = state.selectedId;
  if (!id || id === state.rootId) return;

  pushHistory();
  removeSubtree(id);
  state.selectedId = state.rootId;
  saveState(state);
  rerender();
}

// =============================
// Import / Export
// =============================
function exportJSON() {
  if (state.editingId) {
    document.activeElement?.blur();
  }

  const blob = new Blob([JSON.stringify({ version: 1, state }, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mindmap_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJSONFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const next = data.state ?? data;

  state = next;
  saveState(state);
  rerender();
  controller.fitToScreen();
}

// =============================
// UI bindings
// =============================
btnAddChild.onclick = addChild;
btnDelete.onclick = deleteSelected;
btnReset.onclick = () => {
  if (!confirm("マインドマップを初期化しますか？")) return;
  pushHistory();
  state = defaultState();
  saveState(state);
  rerender();
  controller.fitToScreen();
};

btnExport.onclick = exportJSON;
btnImport.onclick = () => importFile.click();
importFile.onchange = () => importJSONFile(importFile.files[0]);

// Undo / Redo
window.addEventListener("keydown", (e) => {
  const mod = navigator.platform.includes("Mac") ? e.metaKey : e.ctrlKey;

  if (mod && e.key === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (mod && e.key === "y") {
    e.preventDefault();
    redo();
  }
});

// =============================
// Viewport controller
// =============================
const controller = createViewportController({
  viewport,
  nodesEl,
  canvas,
  ctx,
  getState: () => state,
  rerender,
  onViewChange: requestEdgeRedraw,
});

btnFit.onclick = controller.fitToScreen;

window.addEventListener("resize", () => {
  dpr = resizeCanvas(canvas, ctx);
  rerender();
  controller.fitToScreen();
});

// 初期化
rerender();
controller.applyView();
controller.fitToScreen();

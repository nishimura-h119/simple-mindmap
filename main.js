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

let dpr = resizeCanvas(canvas, ctx);

// layout キャッシュ（パン中はこれを使って線だけ描き直す）
let latestLayout = null;
let drawPending = false;

// 「編集開始時に全選択」用
let pendingSelectAllId = null;

function getState() {
  return state;
}

// ★ 線だけ軽量再描画（DOMは触らない）
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

  // ダブルクリック編集 or 追加直後編集のときだけ、フォーカス&全選択
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

function wireEditingHandlers() {
  // 編集中の label だけ拾う
  const editable = nodesEl.querySelectorAll(".label[contenteditable='true']");
  editable.forEach((label) => {
    const nodeEl = label.closest(".node");
    const id = nodeEl?.dataset?.id;
    if (!id) return;

    // 二重バインド防止
    if (label.dataset.bound === "1") return;
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

    // クリック外で確定したい場合の保険
    label.addEventListener("blur", () => {
      if (state.editingId === id) commitEditFromDOM(id);
    });
  });
}

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
  const n = state.nodes[id];
  if (!n) return;

  const labelEl = nodesEl.querySelector(
    `.node[data-id="${CSS.escape(id)}"] .label`
  );
  const text = (labelEl?.innerText ?? "").trim();

  n.label = text || "（無題）";
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

function addChild() {
  if (state.editingId) return;

  const parentId = state.selectedId || state.rootId;
  const parent = state.nodes[parentId];
  if (!parent) return;

  const id = uid();
  state.nodes[id] = { id, label: "新しいノード", parentId, children: [] };
  parent.children = parent.children || [];
  parent.children.push(id);

  state.selectedId = id;
  saveState(state);

  // 追加直後は即編集したい
  startEdit(id, { selectAll: true });
}

function removeSubtree(id) {
  const n = state.nodes[id];
  if (!n) return;

  const p = state.nodes[n.parentId];
  if (p && Array.isArray(p.children)) {
    p.children = p.children.filter((x) => x !== id);
  }

  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const node = state.nodes[cur];
    if (!node) continue;
    for (const k of node.children ?? []) stack.push(k);
    delete state.nodes[cur];
  }
}

function deleteSelected() {
  if (state.editingId) return;

  const id = state.selectedId;
  if (!id) return;

  if (id === state.rootId) {
    alert("ルートは削除できません。");
    return;
  }

  removeSubtree(id);
  state.selectedId = state.rootId;

  saveState(state);
  rerender();
}

function reset() {
  const ok = window.confirm("マインドマップを初期化します。リセットしますか？");
  if (!ok) return;

  resetState();
  state = defaultState();
  saveState(state);

  rerender();
  controller.fitToScreen();
}

// クリック外でroot選択（編集中はblurで確定）
viewport.addEventListener("click", (e) => {
  if (state.editingId) {
    const active = document.activeElement;
    if (active && active.classList?.contains("label")) active.blur();
    return;
  }

  // ノード上クリックは各ノードのclickで処理するので、ここでは無視してもOK
  // (残すならコメントアウト解除)
  // if (e.target.closest && e.target.closest(".node")) return;

  state.selectedId = state.rootId;
  saveState(state);
  rerender();
});

// ボタン
btnAddChild.addEventListener("click", addChild);
btnDelete.addEventListener("click", deleteSelected);
btnReset.addEventListener("click", reset);

// キーボード
window.addEventListener("keydown", (e) => {
  if (state.editingId) {
    if (e.key === "Escape") cancelEdit();
    return;
  }

  if (e.key.toLowerCase() === "a") addChild();
  if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
});

// controller（パン&ズーム中は線だけ更新）
const controller = createViewportController({
  viewport,
  nodesEl,
  canvas,
  ctx,
  getState,
  rerender,
  onViewChange: requestEdgeRedraw, // ★ここが肝
});

btnFit.addEventListener("click", controller.fitToScreen);

window.addEventListener("resize", () => {
  dpr = resizeCanvas(canvas, ctx);
  rerender();
  controller.fitToScreen();
});

// 起動
rerender();
controller.applyView();
controller.fitToScreen();

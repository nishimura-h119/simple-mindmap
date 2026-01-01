import { computeLayout, getBounds } from "./layout.js";

export function createViewportController({
  viewport,
  nodesEl,
  canvas,
  ctx,
  getState,
  rerender,
  onViewChange, // ★ viewが動いたときの軽量更新（線だけrAFで描く）
}) {
  const view = { x: 0, y: 0, scale: 1 };
  let panning = null;

  function applyView() {
    // ノードだけ transform（canvasは動かさない。線はctx変換で描く）
    const t = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    nodesEl.style.transform = t;
  }

  function getView() {
    return { ...view };
  }

  function fitToScreen() {
    const state = getState();
    const layout = computeLayout(state, ctx);
    const b = getBounds(state, layout);
    if (!b) return;

    const padding = 40;
    const topbarSpace = 100;

    const availW = innerWidth - padding * 2;
    const availH = innerHeight - padding * 2 - topbarSpace;

    const s = clamp(Math.min(availW / b.w, availH / b.h), 0.25, 2.2);
    view.scale = s;

    const offsetX = padding;
    const offsetY = padding + topbarSpace;

    view.x = offsetX + (availW - b.w * s) / 2 - b.minX * s;
    view.y = offsetY + (availH - b.h * s) / 2 - b.minY * s;

    applyView();
    onViewChange?.();
  }

  // 背景ドラッグでパン（ノード上や編集中は無効）
  viewport.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const state = getState();
    if (state.editingId) return;

    // ノード上はパンしない（将来ノードドラッグを入れても競合しない）
    if (e.target.closest && e.target.closest(".node")) return;

    panning = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    viewport.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;

    view.x = panning.vx + (e.clientX - panning.sx);
    view.y = panning.vy + (e.clientY - panning.sy);

    applyView();
    onViewChange?.(); // ★ここで線だけ追従
  });

  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = null;
    viewport.style.cursor = "grab";
  });

  // ホイールズーム（カーソル位置中心）
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // ズーム前のワールド座標
      const wxBefore = (sx - view.x) / view.scale;
      const wyBefore = (sy - view.y) / view.scale;

      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      view.scale = clamp(view.scale * factor, 0.25, 2.2);

      // 同じワールド点がカーソル下に残るよう補正
      view.x = sx - wxBefore * view.scale;
      view.y = sy - wyBefore * view.scale;

      applyView();
      onViewChange?.();
    },
    { passive: false }
  );

  return {
    applyView,
    fitToScreen,
    getView,
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

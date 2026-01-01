export function resizeCanvas(canvas, ctx) {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

export function render({
  state,
  layout,
  nodesEl,
  canvas,
  ctx,
  onSelect,
  onStartEdit,
  isEditingId,
  view,
  dpr,
}) {
  nodesEl.innerHTML = "";

  for (const n of Object.values(state.nodes)) {
    const p = layout[n.id];
    if (!p) continue;

    const el = document.createElement("div");
    el.className = "node" + (state.selectedId === n.id ? " selected" : "");
    el.dataset.id = n.id;

    el.style.left = p.left + "px";
    el.style.top = p.top + "px";
    el.style.width = p.w + "px";

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = n.label ?? "";
    label.spellcheck = false;

    const editing = isEditingId(n.id);
    label.contentEditable = editing ? "true" : "false";

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.editingId) return;
      onSelect(n.id);
    });

    label.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onStartEdit(n.id, { selectAll: true });
    });

    el.appendChild(label);
    nodesEl.appendChild(el);
  }

  drawEdges({ state, layout, ctx, view, dpr });
}

export function drawEdges({ state, layout, ctx, view, dpr }) {
  // まず画面座標系でクリア
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  // ここからワールド→スクリーン変換を適用
  ctx.setTransform(
    dpr * view.scale,
    0,
    0,
    dpr * view.scale,
    dpr * view.x,
    dpr * view.y
  );

  ctx.lineWidth = 2 / view.scale; // ズームしても線の太さが見た目一定寄りになる
  ctx.strokeStyle =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--stroke")
      .trim() || "rgba(148,163,184,.35)";

  for (const n of Object.values(state.nodes)) {
    const from = n.id;
    for (const to of n.children ?? []) {
      const a = layout[from];
      const b = layout[to];
      if (!a || !b) continue;

      // ワールド座標で描く（ctxが変換してくれる）
      const ax = a.left + a.w;
      const ay = a.top + a.h / 2;
      const bx = b.left;
      const by = b.top + b.h / 2;

      const dx = bx - ax;
      const c1x = ax + Math.max(40, dx * 0.45);
      const c2x = bx - Math.max(40, dx * 0.45);

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(c1x, ay, c2x, by, bx, by);
      ctx.stroke();
    }
  }
}

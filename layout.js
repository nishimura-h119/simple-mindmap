export function computeLayout(state, ctx) {
  const rootId = state.rootId;

  // 見積もり用パラメータ（CSSと合わせる）
  const PAD_X = 24; // node padding 左右合計のつもり
  const PAD_Y = 20; // node padding 上下合計のつもり
  const LINE_H = 19; // label line-height 目安
  const MIN_W = 120;
  const MAX_W = 320;

  const V_GAP = 18;
  const COL_GAP = 90;

  // フォントは label に合わせる
  ctx.font =
    "650 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Noto Sans JP', Meiryo, sans-serif";

  const depths = {};
  const widths = {};
  const heights = {};
  const maxWByDepth = {};

  // BFS: depth計算 & 幅/高さ見積
  const q = [rootId];
  depths[rootId] = 0;

  while (q.length) {
    const id = q.shift();
    const n = state.nodes[id];
    if (!n) continue;

    const d = depths[id] ?? 0;
    const text = (n.label ?? "").trim() || "（無題）";

    // 1行の幅
    const rawW = Math.ceil(ctx.measureText(text).width + PAD_X);
    const w = clamp(rawW, MIN_W, MAX_W);
    widths[id] = w;

    // 折り返し行数を雑に見積もる（単純に行幅で割る）
    // 日本語は単語区切りがないので「文字幅総量/行幅」で近似
    const lineW = Math.max(40, w - PAD_X);
    const approxLines = Math.max(
      1,
      Math.ceil(ctx.measureText(text).width / lineW)
    );
    const h = PAD_Y + approxLines * LINE_H;
    heights[id] = h;

    maxWByDepth[d] = Math.max(maxWByDepth[d] ?? 0, w);

    for (const c of n.children ?? []) {
      if (!state.nodes[c]) continue;
      depths[c] = d + 1;
      q.push(c);
    }
  }

  // 同じ depth は left を揃える
  const cx = innerWidth / 2;
  const cy = innerHeight / 2;

  const xLeftByDepth = {};
  xLeftByDepth[0] = cx - (widths[rootId] ?? 160) / 2;

  let curX = xLeftByDepth[0] + (maxWByDepth[0] ?? 160) + COL_GAP;
  const maxDepth = Math.max(...Object.values(depths));
  for (let d = 1; d <= maxDepth; d++) {
    xLeftByDepth[d] = curX;
    curX += (maxWByDepth[d] ?? 160) + COL_GAP;
  }

  // サブツリー縦スパン（重なり回避）
  const spanMemo = {};
  function subtreeSpan(id) {
    if (spanMemo[id] != null) return spanMemo[id];
    const n = state.nodes[id];
    if (!n) return heights[id] ?? 50;

    const kids = (n.children ?? []).filter((k) => state.nodes[k]);
    const selfH = heights[id] ?? 50;

    if (kids.length === 0) {
      spanMemo[id] = selfH;
      return selfH;
    }
    let sum = 0;
    for (let i = 0; i < kids.length; i++) {
      sum += subtreeSpan(kids[i]);
      if (i !== kids.length - 1) sum += V_GAP;
    }
    spanMemo[id] = Math.max(selfH, sum);
    return spanMemo[id];
  }

  const pos = {}; // id -> {left, top, w, h}
  function assign(id, topStart) {
    const n = state.nodes[id];
    if (!n) return;

    const d = depths[id] ?? 0;
    const w = widths[id] ?? 160;
    const h = heights[id] ?? 50;
    const span = subtreeSpan(id);

    const left = xLeftByDepth[d];
    const top = topStart + (span - h) / 2;

    pos[id] = { left, top, w, h };

    const kids = (n.children ?? []).filter((k) => state.nodes[k]);
    if (kids.length === 0) return;

    let cursor = topStart;
    for (const k of kids) {
      const s = subtreeSpan(k);
      assign(k, cursor);
      cursor += s + V_GAP;
    }
  }

  const rootSpan = subtreeSpan(rootId);
  const rootTopStart = cy - rootSpan / 2;
  assign(rootId, rootTopStart);

  return pos;
}

export function getBounds(state, layout) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const id of Object.keys(state.nodes)) {
    const p = layout[id];
    if (!p) continue;
    minX = Math.min(minX, p.left);
    minY = Math.min(minY, p.top);
    maxX = Math.max(maxX, p.left + p.w);
    maxY = Math.max(maxY, p.top + p.h);
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

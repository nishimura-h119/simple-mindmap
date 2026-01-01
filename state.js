export const STORAGE_KEY = "simple_mindmap_v2";

export function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function defaultState() {
  const rootId = "root";
  const a = uid(),
    b = uid(),
    c = uid();
  const nodes = {};
  nodes[rootId] = {
    id: rootId,
    label: "中心テーマ",
    parentId: null,
    children: [a, b, c],
  };
  nodes[a] = { id: a, label: "テキスト", parentId: rootId, children: [] };
  nodes[b] = { id: b, label: "テキスト", parentId: rootId, children: [] };
  nodes[c] = { id: c, label: "テキスト", parentId: rootId, children: [] };
  return { nodes, rootId, selectedId: rootId, editingId: null, snapshot: null };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

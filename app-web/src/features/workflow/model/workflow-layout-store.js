// 系统预设的排布存哪里：core 里系统预设只有「启停」一个保存路径（update_preset_workflow_settings
// 会把预设项重写成 {enabled}），所以拖出来的排布只能存在前端本机；这一份就是两页共用的那一份。
//
// 只有「定义里放不下排布」的工作流才写这里（系统预设）。可编辑（custom）工作流的排布就在
// 定义自己的 nodes[].position 里（保存后随定义走），配置页不会往这里写第二遍。
const WORKFLOW_LAYOUTS_STORAGE_KEY = 'haish.workflow-layouts.v1';

export { WORKFLOW_LAYOUTS_STORAGE_KEY };

function layoutStorage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    // 隐私模式等场景下 localStorage 会抛错：排布存不下时按「没存过」处理，不影响看图。
    return null;
  }
}

function readLayouts() {
  const storage = layoutStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(WORKFLOW_LAYOUTS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLayouts(layouts) {
  const storage = layoutStorage();
  if (!storage) return false;
  try {
    storage.setItem(WORKFLOW_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
    return true;
  } catch {
    return false;
  }
}

function normalizePositions(positions) {
  const source = positions instanceof Map ? [...positions.entries()] : Object.entries(positions || {});
  const normalized = {};
  for (const [nodeId, position] of source) {
    const id = String(nodeId || '').trim();
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    normalized[id] = { x: Math.round(x), y: Math.round(y) };
  }
  return normalized;
}

/** 某个工作流存下来的排布（没有就是空 Map）。两页读排布都走 workflowArrangementPositions。 */
export function savedWorkflowLayout(workflowId) {
  const positions = new Map();
  const id = String(workflowId || '').trim();
  if (!id) return positions;
  const stored = readLayouts()[id];
  if (!stored || typeof stored !== 'object') return positions;
  for (const [nodeId, position] of Object.entries(normalizePositions(stored))) {
    positions.set(nodeId, position);
  }
  return positions;
}

/** 整张排布存成一个快照（不是逐节点打补丁）：画布上看到什么，运行页就读到什么。 */
export function saveWorkflowLayout(workflowId, positions) {
  const id = String(workflowId || '').trim();
  if (!id) return false;
  const normalized = normalizePositions(positions);
  const layouts = readLayouts();
  if (!Object.keys(normalized).length) delete layouts[id];
  else layouts[id] = normalized;
  return writeLayouts(layouts);
}

export function clearWorkflowLayout(workflowId) {
  const id = String(workflowId || '').trim();
  if (!id) return false;
  const layouts = readLayouts();
  if (!(id in layouts)) return true;
  delete layouts[id];
  return writeLayouts(layouts);
}

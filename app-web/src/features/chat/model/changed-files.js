// 本轮「改了哪些文件」的唯一来源：工具结果的结构化字段
// （subject.path + data.added_lines / data.removed_lines），绝不解析 final answer 正文。
// 依据：最近三条改过文件的 trace 里 61% 的回答一个改动文件名都不提，面向正文渲染会大面积空树。
// 事件来自 task.eventLog（实时与历史回放同一份投影），toolCalls 只作为 eventLog 缺失时的兜底。
import { normalizeToolName } from '../../../core/tool-names.js';
import { getToolSubject, toolPlainObject } from './tool-view/shared.js';

// 真正写文件的工具。create_dir / delete_dir / rollback_workspace 不产出文件行：前两者是目录，
// 后者是把文件改回旧内容，行数增减会变成负数，不属于「本轮改了什么」。
const FILE_MUTATION_TOOLS = new Set([
  'write_file',
  'create_file',
  'save_file',
  'edit_file',
  'replace_lines',
  'multi_edit',
  'apply_patch',
  'delete_file',
  'copy_file',
]);
// 子 Agent 的写文件同样落在这个工作区里，必须一起折叠，否则树会少文件。
const COMPLETED_TOOL_EVENT_TYPES = new Set(['tool_call_completed', 'sub_agent_tool_call_completed']);
// 这些终态表示这次调用没有改变文件内容（同一路径通常还有一次 resolved 的成功调用）。
// 白名单的反面：只有 resolved / partial 这类状态才计入增删。
const NO_FILE_CHANGE_STATES = new Set(['no_change', 'failed', 'blocked', 'not_found', 'ambiguous', 'empty']);

function toolResponseOf(item) {
  const raw = item?.toolResponse ?? item?.tool_response;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const parsed = toolPlainObject(raw);
  if (Object.keys(parsed).length) return parsed;
  // 旧事件只带 tool_output 文本时仍能读回结构化结果。
  const output = typeof item?.toolOutput === 'string' ? toolPlainObject(item.toolOutput) : {};
  return Object.keys(output).length ? output : {};
}

function normalizeFilePath(value) {
  const text = String(value || '').trim().replace(/\\/g, '/');
  if (!text) return '';
  return text.startsWith('./') ? text.slice(2) : text;
}

// 一行一行数 diff 只作为兜底：后端把行数算在 data.added_lines / data.removed_lines 里。
function lineDeltaOf(response) {
  const data = toolPlainObject(response.data);
  const added = Number(data.added_lines);
  const removed = Number(data.removed_lines);
  if (Number.isFinite(added) || Number.isFinite(removed)) {
    return {
      additions: Number.isFinite(added) ? Math.max(added, 0) : 0,
      deletions: Number.isFinite(removed) ? Math.max(removed, 0) : 0,
    };
  }
  const artifacts = toolPlainObject(response.artifacts);
  const diff = String(artifacts.diff || data.diff || '');
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

// copy_file 的 subject 同时带源和目的地，真正被写到的是 destination_path。
function targetPathOf(item, toolName, response) {
  const subject = getToolSubject(item);
  if (toolName === 'copy_file' && subject.destination_path) return normalizeFilePath(subject.destination_path);
  return normalizeFilePath(subject.path || response.subject?.path || subject.destination_path);
}

function entriesOf(task) {
  const entries = [];
  for (const entry of Array.isArray(task?.eventLog) ? task.eventLog : []) {
    if (COMPLETED_TOOL_EVENT_TYPES.has(String(entry?.type || ''))) entries.push(entry);
  }
  // eventLog 还没投影出来（老行 / 极早期渲染）时退回 toolCalls：两者按 callId 去重，不会重复计数。
  for (const call of Array.isArray(task?.toolCalls) ? task.toolCalls : []) entries.push(call);
  return entries;
}

/**
 * 折叠一轮任务里的写文件调用：按 path 去重、跳过没有改动的终态、累加 resolved 调用的增删。
 * 纯函数（不碰 React、不读缓存），行数一律来自工具结果。
 */
export function collectChangedFiles(task) {
  const files = new Map();
  const seenCalls = new Set();
  for (const entry of entriesOf(task)) {
    const toolName = normalizeToolName(entry?.toolName || entry?.tool_name);
    if (!FILE_MUTATION_TOOLS.has(toolName)) continue;
    const callId = String(entry?.callId || entry?.call_id || '').trim();
    if (callId) {
      if (seenCalls.has(callId)) continue;
      seenCalls.add(callId);
    }
    const response = toolResponseOf(entry);
    if (!Object.keys(response).length) continue;
    const resultState = String(response.result_state || '').toLowerCase();
    if (String(response.status || '').toLowerCase() === 'error') continue;
    if (NO_FILE_CHANGE_STATES.has(resultState)) continue;
    const path = targetPathOf(entry, toolName, response);
    if (!path) continue;
    const delta = lineDeltaOf(response);
    const existing = files.get(path);
    if (existing) {
      existing.additions += delta.additions;
      existing.deletions += delta.deletions;
      continue;
    }
    files.set(path, { path, additions: delta.additions, deletions: delta.deletions });
  }
  return [...files.values()];
}

// 全都在同一个绝对目录下时（工作区外的路径就是这种形状：/Users/…/app-web/src/…），
// 目录名会被撑成一整串再被省略号吞掉，只剩千篇一律的前缀。这里把显示用的路径缩到
// 这些文件的公共父目录之下（保留一段，单个文件也不至于只剩一个文件名）；
// 相对路径本身已经是人读形态，原样显示。
function displayRootOf(paths) {
  if (!paths.length || paths.some((path) => !path.startsWith('/'))) return '';
  let prefix = null;
  for (const path of paths) {
    const dir = path.split('/').slice(0, -1);
    if (!prefix) {
      prefix = dir;
      continue;
    }
    let shared = 0;
    while (shared < prefix.length && shared < dir.length && prefix[shared] === dir[shared]) shared += 1;
    prefix = prefix.slice(0, shared);
  }
  // ['', 'tmp'] 这种已经够短；再往下缩会连上下文一起丢掉。
  if (!prefix || prefix.length <= 2) return '';
  return prefix.slice(0, -1).join('/');
}

function displayPathOf(path, root) {
  if (!root) return path;
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/**
 * 扁平文件列表 → FileTree 的行：每个目录一条 folder 行（depth 0），目录下的文件缩进一层（depth 1）；
 * 没有目录的文件留在顶层（depth 0，放在所有目录后面）。
 *
 * 先按目录分组再输出：只按「这个目录是不是第一次出现」插入目录行的写法，会把后出现的同目录文件
 * 挂到上一个目录下面（真实例子：file-tree.css 被挂在 features/chat/model 下）。
 * 行顺序 = 目录首次出现顺序，一个目录的文件一定跟着自己的目录行。
 * 路径就是 React key（官方约定），depth / kind 显式赋值；目录行的 name 是缩过的显示名，
 * path 仍是完整路径（折叠和路径卡都用它）。
 */
export function fileTreeNodes(files) {
  const entries = (Array.isArray(files) ? files : [])
    .map((file) => {
      const path = normalizeFilePath(file?.path);
      if (!path) return null;
      return {
        path,
        additions: Math.max(Number(file.additions) || 0, 0),
        deletions: Math.max(Number(file.deletions) || 0, 0),
      };
    })
    .filter(Boolean);
  const root = displayRootOf(entries.map((entry) => entry.path));
  const folders = new Map();
  const loose = [];
  for (const entry of entries) {
    const display = displayPathOf(entry.path, root);
    const slash = display.lastIndexOf('/');
    if (slash === -1) {
      loose.push({ ...entry, name: display });
      continue;
    }
    const dir = display.slice(0, slash);
    if (!folders.has(dir)) {
      folders.set(dir, { path: entry.path.slice(0, entry.path.lastIndexOf('/')), files: [] });
    }
    folders.get(dir).files.push({ ...entry, name: display.slice(slash + 1) });
  }
  const nodes = [];
  for (const [dir, folder] of folders) {
    nodes.push({ path: folder.path, name: dir, depth: 0, kind: 'folder' });
    for (const file of folder.files) {
      nodes.push({
        path: file.path,
        name: file.name,
        depth: 1,
        kind: 'file',
        additions: file.additions,
        deletions: file.deletions,
      });
    }
  }
  for (const file of loose) {
    nodes.push({
      path: file.path,
      name: file.name,
      depth: 0,
      kind: 'file',
      additions: file.additions,
      deletions: file.deletions,
    });
  }
  return nodes;
}

// 任务对象是不可变的（每次更新换成新对象），所以按对象缓存折叠结果；
// 同时比对两个来源的数组引用，防止某些路径原地改数组后拿到旧结果。
const CHANGED_FILES_CACHE = new WeakMap();

/** 一轮任务喂给 FileTree 的全部数据；没有改动文件时 count 为 0，调用方据此不渲染。 */
export function changedFilesForTask(task) {
  if (!task || typeof task !== 'object') return emptyChangedFiles();
  const cached = CHANGED_FILES_CACHE.get(task);
  if (cached && cached.eventLog === task.eventLog && cached.toolCalls === task.toolCalls) {
    return cached.result;
  }
  const files = collectChangedFiles(task);
  const nodes = fileTreeNodes(files);
  const result = {
    files,
    nodes,
    count: files.length,
    totalAdditions: files.reduce((total, file) => total + file.additions, 0),
    totalDeletions: files.reduce((total, file) => total + file.deletions, 0),
  };
  CHANGED_FILES_CACHE.set(task, { eventLog: task.eventLog, toolCalls: task.toolCalls, result });
  return result;
}

function emptyChangedFiles() {
  return { files: [], nodes: [], count: 0, totalAdditions: 0, totalDeletions: 0 };
}

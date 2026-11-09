// checkpoint 历史（list_checkpoints）：后端已经按任务分好组，官方 CheckpointHistory 的一行就是一组。
//
// 只读：桌面端没有 checkpoint 的 IPC，回滚只能由 agent 调 rollback_workspace（Write 权限、走审批），
// 所以这里不产出 onRestore——官方元素在不给回调时本来就不渲染 Restore 按钮。
// 工作区整体的当前历史位置无法可靠推断，因此不使用旧响应里的 current 标记。
import { TOOL_BLOCK_LIMIT, compactToolValue, isToolFailure, toolPlainObject } from '../../../../core/tool-view-shared.js';
import { isToolInFlight } from '../../../../core/tool-status.js';

const pad2 = (value) => String(value).padStart(2, '0');

// 官方只要求 at 是字符串：同一天给 HH:MM，跨天再补月日，避免每行都变长。
export function formatCheckpointTime(value, now = new Date()) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) return clock;
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${clock}`;
}

// files 用去重后的路径数：checkpoint_count 是快照记录数，同一个文件改两次会被算成两个。
function filesForGroup(group) {
  const paths = Array.isArray(group.paths) ? group.paths : [];
  const records = Array.isArray(group.checkpoints) ? group.checkpoints : [];
  const all = [...paths, ...records.map((record) => (record && typeof record === 'object' ? record.path : ''))];
  return new Set(all.filter((path) => typeof path === 'string' && path)).size;
}

// 旧工具事件可能保存了 Python 多模态 repr；只读取 TextPart 的字符串，不展示图片路径。
function displayText(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!/^\[\s*(?:TextPart|ImagePart)\(/.test(text)) return text.replace(/\s+/g, ' ');
  const parts = [];
  const pattern = /(?:^\[|,\s*)TextPart\(text=(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*kind=['"]text['"]\)/g;
  for (const match of text.matchAll(pattern)) {
    const decoded = match[2].replace(/\\(\\|['"nrt])/g, (_, char) => ({ n: '\n', r: '\r', t: '\t' }[char] || char));
    parts.push(decoded);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function groupLabel(group) {
  return displayText(group.task_title) || displayText(group.user_request)
    || String(group.task_id || '').trim() || 'Checkpoint';
}

function groupId(group, index) {
  const ids = Array.isArray(group.checkpoint_ids) ? group.checkpoint_ids : [];
  return String(group.task_id || ids[0] || `checkpoint-${index}`);
}

export function buildCheckpointToolView(item) {
  const response = toolPlainObject(item.toolResponse);
  const data = toolPlainObject(response.data);
  const groups = Array.isArray(data.groups)
    ? data.groups.filter((group) => group && typeof group === 'object')
    : [];
  const running = isToolInFlight(item.status);
  const failed = isToolFailure(item);
  const view = {
    mode: 'checkpoints',
    label: running ? 'Listing checkpoints' : 'Listed checkpoints',
    failed,
    checkpoints: [],
    currentId: '',
    truncated: false,
  };
  if (failed) {
    const error = toolPlainObject(response.error);
    view.failureText = compactToolValue(
      error.message || response.summary || item.outputSummary || item.message,
      TOOL_BLOCK_LIMIT,
    ) || 'Checkpoints could not be listed.';
    // 失败时不铺列表，改为一行错误文本（工具卡的可展开性看的是 body）。
    view.body = view.failureText;
    return view;
  }
  // 后端按新到旧返回；展示顺序与官方示例一致，旧到新。
  view.checkpoints = groups.slice().reverse().map((group, index) => ({
    id: groupId(group, index),
    label: groupLabel(group),
    at: formatCheckpointTime(group.updated_at || group.created_at),
    files: filesForGroup(group),
  }));
  view.truncated = Boolean(toolPlainObject(response.limits).truncated)
    || (Number(data.total_groups) || 0) > groups.length;
  if (!view.checkpoints.length) view.body = 'No checkpoints yet.';
  return view;
}

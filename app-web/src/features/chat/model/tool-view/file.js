// 文件类工具：读 / 写 / 改 / 删除 / 复制 / 建目录。diff 卡与 JSON 卡都从这里出。
import {
  TOOL_BLOCK_LIMIT,
  compactToolJsonPayload,
  compactToolText,
  compactToolValue,
  isToolFailure,
  outputJsonText,
  stableJson,
  toolActionLabel,
  toolDisplayOutput,
  toolFailureActionLabel,
  toolJsonText,
  toolPlainObject,
} from './shared.js';

const TOOL_READ_NAMES = new Set(['read_file', 'search_text', 'glob_files', 'list_dir']);
const TOOL_DIFF_NAMES = new Set(['write_file', 'edit_file', 'replace_lines', 'multi_edit', 'apply_patch']);
const TOOL_CHANGE_NAMES = new Set([
  'write_file',
  'edit_file',
  'replace_lines',
  'multi_edit',
  'apply_patch',
  'create_file',
  'delete_file',
  'copy_file',
  'create_dir',
]);

function toolLineDelta(item, diffText) {
  const data = item.toolResponse && typeof item.toolResponse === 'object' && item.toolResponse.data
    ? item.toolResponse.data
    : {};
  const explicitAdded = Number(data.added_lines);
  const explicitRemoved = Number(data.removed_lines);
  if (Number.isFinite(explicitAdded) || Number.isFinite(explicitRemoved)) {
    return {
      added: Number.isFinite(explicitAdded) ? explicitAdded : 0,
      removed: Number.isFinite(explicitRemoved) ? explicitRemoved : 0,
    };
  }
  let added = 0;
  let removed = 0;
  String(diffText || '').split('\n').forEach((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  });
  return { added, removed };
}

function getToolDiff(item) {
  const response = item.toolResponse && typeof item.toolResponse === 'object' ? item.toolResponse : {};
  const artifacts = response.artifacts && typeof response.artifacts === 'object' ? response.artifacts : {};
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  return artifacts.diff || data.diff || artifacts.unified_diff || '';
}

export function buildDiffToolView(item, name, path) {
  const diff = getToolDiff(item);
  const { added, removed } = toolLineDelta(item, diff);
  const failed = isToolFailure(item);
  const target = path || item.label || name;
  if (failed) {
    const response = toolPlainObject(item.toolResponse);
    const error = toolPlainObject(response.error);
    const failureText = compactToolValue(error.message || response.summary || item.outputSummary || item.message, TOOL_BLOCK_LIMIT);
    const failureTarget = path ? ` ${path}` : '';
    return {
      mode: 'diff',
      failed: true,
      label: `${toolFailureActionLabel(item)}${failureTarget}`,
      body: failureText || outputJsonText(item.toolResponse) || compactToolValue(item.toolOutput, TOOL_BLOCK_LIMIT),
    };
  }
  return {
    mode: 'diff',
    path,
    added,
    removed,
    label: ['pending', 'running'].includes(item.status)
      ? `${name === 'write_file' ? 'Writing' : 'Editing'} ${target}`
      : `${toolActionLabel(item)} ${target}${added || removed ? ` (+${added} -${removed})` : ' (no changes)'}`,
    body: diff ? compactToolText(diff) : '',
  };
}

export function buildChangeToolView(item, path) {
  const output = toolDisplayOutput(item);
  const jsonPayload = compactToolJsonPayload(
    item.toolInput || undefined,
    output,
  );
  return {
    mode: 'json',
    label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
    requestJson: toolJsonText(item.toolInput),
    responseJson: outputJsonText(output),
    body: (jsonPayload.input || jsonPayload.output) ? stableJson(jsonPayload) : '',
  };
}

export function buildReadToolView(item, path) {
  return {
    mode: 'read',
    label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
    body: '',
  };
}

export { TOOL_CHANGE_NAMES, TOOL_DIFF_NAMES, TOOL_READ_NAMES };

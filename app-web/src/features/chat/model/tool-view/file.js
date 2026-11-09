// 文件类工具：读 / 写 / 改 / 删除 / 复制 / 建目录。diff 卡与 JSON 卡都从这里出。
// 哪些工具归哪张卡由 core/tool-names.js 的登记表决定，这里只负责各自的卡片形状。
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
} from '../../../../core/tool-view-shared.js';
import { isToolInFlight } from '../../../../core/tool-status.js';
import { TOOL_ACTIVE_LABELS } from '../../../../core/tool-names.js';

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
    label: isToolInFlight(item.status)
      ? `${TOOL_ACTIVE_LABELS.get(name) || 'Editing'} ${target}`
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

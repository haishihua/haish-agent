import { normalizeToolName } from './tool-names.js';

export function isToolScript(item) {
  return ['code_mode', 'tool_script'].includes(normalizeToolName(item?.toolName || item?.tool_name));
}

function object(value) {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ledgerStatus(call) {
  if (call.status === 'unknown') return 'failed';
  if (call.status === 'cancelled') return 'cancelled';
  if (['error', 'failed'].includes(call.status)) return 'failed';
  if (['running', 'pending'].includes(call.status)) return call.status;
  return 'done';
}

// Match real parent ids, never parse JavaScript or infer results from its output.
// Saved v1 responses carry a compact ledger; it can restore call cards even
// when child events were not recorded, without inventing inputs or outputs.
export function nestToolScriptCalls(items) {
  const all = [];
  function visit(nodes) {
    for (const item of nodes || []) {
      if (item.kind === 'tool') all.push(item);
      visit(item.children);
    }
  }
  visit(items);
  const byId = new Map(all.map(item => [item.callId || item.id, item]));
  const nested = new Set();
  for (const child of all) {
    const parent = byId.get(child.parentCallId);
    if (!parent || parent === child || !isToolScript(parent)) continue;
    parent.children ||= [];
    if (!parent.children.some(item => item.id === child.id)) parent.children.push(child);
    nested.add(child);
  }
  for (const parent of all.filter(isToolScript)) {
    // Runtime event ids may be remapped by the API, while legacy ledgers
    // retain core ids. Never duplicate authoritative event-backed cards.
    if (parent.children?.length) continue;
    const response = object(parent.toolResponse || parent.toolOutput);
    const calls = object(response.data).calls;
    if (!Array.isArray(calls)) continue;
    parent.children ||= [];
    for (const call of calls) {
      const id = call?.tool_call_id || call?.callId;
      const toolName = call?.tool_name || call?.toolName;
      if (!id || !toolName || id === parent.callId || byId.has(id)) continue;
      const child = {
        kind: 'tool', id, callId: id, parentCallId: parent.callId,
        toolName, status: ledgerStatus(call), category: 'tool', children: [],
        // Old ledgers do not contain display details. Preserve them as the
        // fallback, rather than presenting a fabricated terminal/diff result.
        toolResponse: call, outputSummary: call.error || call.result_state || call.status,
        scriptLedgerOnly: true,
      };
      parent.children.push(child);
      byId.set(id, child);
    }
  }
  function filter(nodes) {
    return nodes.filter(item => !nested.has(item)).map(item => {
      if (item.children?.length && !isToolScript(item)) item.children = filter(item.children);
      return item;
    });
  }
  return filter(items);
}

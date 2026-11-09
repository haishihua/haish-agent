// Match only one live call in the same task; ambiguous approvals stay in the fallback slot.
export function placeToolApprovals(items, requests, taskId, conversationId) {
  const tools = [];
  function visit(nodes) {
    for (const item of nodes || []) {
      if (item.kind === 'tool') tools.push(item);
      visit(item.tools);
      visit(item.children);
    }
  }
  visit(items);
  const placements = new Map();
  if (!taskId) return placements;
  for (const request of requests) {
    if (request.task_id !== taskId || (request.conversation_id && request.conversation_id !== conversationId)) continue;
    const candidates = tools.filter((item) => {
      if (!['pending', 'running'].includes(item.status)) return false;
      if (item.toolName !== request.tool_name) return false;
      if (request.tool_call_id) return item.callId === request.tool_call_id;
      const input = item.toolInput || {};
      const target = input.command || input.path || input.file_path || input.filePath || input.target_path;
      if (!target) return false;
      const raw = String(request.raw_command || '');
      return raw === target || raw === `${request.tool_name}: ${target}`;
    });
    if (candidates.length === 1 && !placements.has(candidates[0].id)) placements.set(candidates[0].id, request);
  }
  return placements;
}

function questionKey(value) {
  const questions = Array.isArray(value?.questions) ? value.questions : [];
  if (!questions.length) return '';
  return [
    String(value?.context || ''),
    ...questions.map((question) => `${question?.id || ''}\u0000${question?.question || ''}`),
  ].join('\u0001');
}

export function selectPendingUserInput(pending, scope) {
  if (!scope?.active || !scope.taskId) return null;
  const scoped = (Array.isArray(pending) ? pending : []).filter((request) => (
    String(request?.task_id || '') === String(scope.taskId)
  ));
  const exact = scope.toolCallId
    ? scoped.find((request) => String(request?.tool_call_id || '') === String(scope.toolCallId))
    : null;
  if (exact) return exact;
  const expectedQuestions = questionKey(scope.toolInput);
  const matching = expectedQuestions
    ? scoped.filter((request) => questionKey(request) === expectedQuestions)
    : [];
  if (matching.length === 1) return matching[0];
  return scoped.length === 1 ? scoped[0] : null;
}

export function selectActiveAskUserItemId(items, live = false) {
  const latest = [...(Array.isArray(items) ? items : [])].reverse().find((item) => (
    item?.kind === 'tool' && String(item.toolName || '').toLowerCase() === 'ask_user'
  ));
  if (!latest) return '';
  const status = String(latest.status || 'pending').toLowerCase();
  return live || status === 'pending' || status === 'running' ? latest.id : '';
}

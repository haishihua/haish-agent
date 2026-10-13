// Callers supply the canonical enclosing task status (running/done/failed/cancelled).
export function getToolTraceStatus(state, fallbackStatus = 'running') {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'returned' || normalized === 'completed' || normalized === 'done') return 'done';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  // A missing completion event must not leave a finished task's tools spinning.
  if (normalized === 'running' || normalized === 'dispatched' || normalized === 'received' || normalized === 'requested') {
    if (fallbackStatus === 'done' || fallbackStatus === 'failed' || fallbackStatus === 'cancelled') return fallbackStatus;
    return 'running';
  }
  if (fallbackStatus === 'done' || fallbackStatus === 'failed') return fallbackStatus;
  return 'pending';
}

export function getToolResponseTraceStatus(response, fallback = '') {
  if (!response || typeof response !== 'object') return fallback || '';
  const status = String(response.status || '').toLowerCase();
  const resultState = String(response.result_state || response.resultState || response.state || '').toLowerCase();
  const error = response.error || null;
  if (error || status === 'error' || status === 'failed' || resultState === 'blocked' || resultState === 'failed' || resultState === 'error') {
    return 'failed';
  }
  if (status === 'ok' || status === 'success' || resultState === 'resolved' || resultState === 'done' || resultState === 'success') {
    return 'done';
  }
  if (resultState === 'not_found' || resultState === 'no_change' || resultState === 'partial') {
    return 'done';
  }
  return fallback || '';
}

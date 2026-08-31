import { authFetch } from '../../../shared/api/auth.js';
import { API_BASE } from '../../../shared/api/base.js';

export async function fetchInitialApprovalState() {
  try {
    const response = await authFetch(`${API_BASE}/api/approvals/state`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return [
      ...(Array.isArray(data?.pending) ? data.pending : []),
      ...(Array.isArray(data?.pending_workflow_approvals)
        ? data.pending_workflow_approvals.map((item) => ({
          ...item,
          type: 'approval_requested',
          approval_kind: 'workflow_human_approval',
        }))
        : []),
      ...(Array.isArray(data?.pending_browser_runtime_installs)
        ? data.pending_browser_runtime_installs
        : []),
    ];
  } catch (error) {
    console.warn('[approval] failed to load initial state', error);
    return [];
  }
}

export async function postApprovalDecision(requestId, decision) {
  const response = await authFetch(`${API_BASE}/api/approvals/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`resolve failed: HTTP ${response.status} ${detail}`);
  }
}

export async function postWorkflowApprovalDecision(requestId, decision, feedback = '') {
  const response = await authFetch(`${API_BASE}/api/workflow-approvals/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, feedback }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`workflow approval failed: HTTP ${response.status} ${detail}`);
  }
}

function endpointUrl(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_BASE}${value}`;
  return `${API_BASE}/${value.replace(/^\/+/, '')}`;
}

export async function postBrowserRuntimeDecision(request, decision) {
  const endpoint = decision === 'deny' ? request.deny_endpoint : request.install_endpoint;
  const url = endpointUrl(endpoint);
  if (!url) {
    throw new Error(`browser runtime ${decision === 'deny' ? 'deny' : 'install'} endpoint missing`);
  }
  const options = { method: 'POST' };
  if (decision !== 'deny') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify({ timeout_seconds: 900 });
  }
  const response = await authFetch(url, options);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `browser runtime ${decision === 'deny' ? 'deny' : 'install'} failed: HTTP ${response.status} ${detail}`,
    );
  }
}

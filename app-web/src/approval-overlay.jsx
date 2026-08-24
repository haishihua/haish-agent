// @haish-esm
import React from 'react';
import { Markdown } from './Effects.jsx';
import { normalizeWorkflowApprovalMarkdown } from './lib/workflow-approval-markdown.js';
import { PortalTooltip } from './panels/PortalTooltip.jsx';
import { copyTextToClipboard, formatMessageClock } from './panels/path-utils.jsx';

/** Command approval and browser-runtime confirmation rendered in the chat tree. */

const { useState, useEffect, useCallback } = React;

function resolveApiBase() {
  const explicit = String(window.AGENT_WORLD_API_BASE || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return '';
}
const API_BASE = resolveApiBase();

async function fetchInitialState() {
  try {
    const resp = await fetch(`${API_BASE}/api/approvals/state`, { cache: 'no-store' });
    if (!resp.ok) return [];
    const data = await resp.json();
    return [
      ...(Array.isArray(data?.pending) ? data.pending : []),
      ...(Array.isArray(data?.pending_workflow_approvals)
        ? data.pending_workflow_approvals.map((item) => ({
          ...item,
          type: 'approval_requested',
          approval_kind: 'workflow_human_approval',
        }))
        : []),
      ...(Array.isArray(data?.pending_browser_runtime_installs) ? data.pending_browser_runtime_installs : []),
    ];
  } catch (err) {
    console.warn('[approval] failed to load initial state', err);
    return [];
  }
}

async function postResolve(requestId, decision) {
  const resp = await fetch(`${API_BASE}/api/approvals/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`resolve failed: HTTP ${resp.status} ${detail}`);
  }
}

async function postWorkflowApprovalResolve(requestId, decision, feedback = '') {
  const resp = await fetch(`${API_BASE}/api/workflow-approvals/${encodeURIComponent(requestId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, feedback }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`workflow approval failed: HTTP ${resp.status} ${detail}`);
  }
}

function endpointUrl(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_BASE}${value}`;
  return `${API_BASE}/${value.replace(/^\/+/, '')}`;
}

async function postBrowserRuntimeResolve(request, decision) {
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
  const fetcher = typeof window.authFetch === 'function' ? window.authFetch : fetch;
  const resp = await fetcher(url, options);
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(
      `browser runtime ${decision === 'deny' ? 'deny' : 'install'} failed: HTTP ${resp.status} ${detail}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Module-level EventSource singleton + pending-store with pub/sub.
//
// One module-level stream survives chat rerenders and conversation switches.
const approvalStore = (() => {
  let pending = [];
  const listeners = new Set();
  const eventListeners = new Set();
  let es = null;
  let initialFetchInflight = null;
  // Browser-runtime cards embedded in the chat timeline claim their request
  // while mounted, so ApprovalInline does not also render a duplicate
  // standalone row for the same request. Exclusive: only the FIRST mounted
  // card wins the claim; later mounts of the same request render nothing.
  const claimedBrowserRuntimeIds = new Set();

  function notify() {
    const snapshot = pending.slice();
    for (const fn of listeners) {
      try {
        fn(snapshot);
      } catch (_) {}
    }
  }

  function ensureStream() {
    if (es) return;
    const url = `${API_BASE}/api/approvals/stream`;
    try {
      es = new EventSource(url);
    } catch (err) {
      console.warn('[approval] EventSource construction failed', err);
      es = null;
      return;
    }
    es.onmessage = (ev) => {
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      for (const listener of eventListeners) {
        try {
          listener(payload);
        } catch (_) {}
      }
      if (payload.type === 'approval_requested') {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (payload.type === 'browser_runtime_install_required') {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (payload.type === 'approval_resolved') {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      } else if (payload.type === 'browser_runtime_install_resolved') {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      }
    };
    // Keep es open across reconnects; EventSource auto-reconnects on
    // transient drops. We only close on full teardown (which never happens
    // in the current Electron lifecycle).
  }

  function ensureInitial() {
    if (initialFetchInflight) return initialFetchInflight;
    initialFetchInflight = fetchInitialState()
      .then((items) => {
        // Merge in case stream events arrived first; dedupe by request_id.
        const seen = new Set(pending.map((p) => p.request_id));
        const next = pending.slice();
        for (const item of items) {
          if (!seen.has(item.request_id)) {
            seen.add(item.request_id);
            next.push(item);
          }
        }
        pending = next;
        notify();
      })
      .catch((err) => {
        console.warn('[approval] initial state load failed', err);
      });
    return initialFetchInflight;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      ensureStream();
      ensureInitial();
      // Push current snapshot immediately so new subscriber renders.
      try {
        fn(pending.slice());
      } catch (_) {}
      return () => {
        listeners.delete(fn);
      };
    },
    subscribeEvents(fn) {
      eventListeners.add(fn);
      ensureStream();
      return () => {
        eventListeners.delete(fn);
      };
    },
    remove(requestId) {
      const before = pending.length;
      pending = pending.filter((p) => p.request_id !== requestId);
      if (pending.length !== before) notify();
    },
    claimBrowserRuntime(requestId) {
      if (claimedBrowserRuntimeIds.has(requestId)) return false;
      claimedBrowserRuntimeIds.add(requestId);
      notify();
      return true;
    },
    unclaimBrowserRuntime(requestId) {
      if (!claimedBrowserRuntimeIds.delete(requestId)) return false;
      notify();
      return true;
    },
    isBrowserRuntimeClaimed(requestId) {
      return claimedBrowserRuntimeIds.has(requestId);
    },
  };
})();

export function subscribeApprovalEvents(listener) {
  return approvalStore.subscribeEvents(listener);
}

function isBrowserRuntimeRequest(request) {
  return request?.type === 'browser_runtime_install_required' || request?.action === 'install_browser_runtime';
}

export function isWorkflowApprovalRequest(request) {
  return request?.approval_kind === 'workflow_human_approval';
}

function browserRuntimeSummary(request) {
  const dependency = request?.diagnostic?.dependency || request?.error?.diagnostic?.dependency || 'browser runtime';
  if (String(dependency).includes('chromium')) return 'Browser runtime is missing. Install it to continue.';
  return 'Browser runtime dependency is missing. Install it to continue.';
}

function requestPreview(request) {
  if (isBrowserRuntimeRequest(request)) return browserRuntimeSummary(request);
  if (isWorkflowApprovalRequest(request)) return String(request.summaryText || request.title || '');
  return request.raw_command || '';
}

const RISK_TEXT = {
  destructive_file_delete: 'Recursive file or directory deletion',
  destructive_git_reset_hard: 'Hard git reset that may discard commits',
  destructive_git_checkout: 'Git branch switch or worktree restore',
  destructive_git_clean: 'Git cleanup of untracked files',
  privilege_escalation: 'Run with root privileges',
  network_egress_terminal: 'Terminal command initiates outbound network access',
  remote_data_transfer: 'Remote data transfer',
  permission_mutation: 'File permission or owner change',
  external_process_kill: 'Force-kill external process',
  system_storage_mutation: 'System-level storage mutation',
  container_runtime: 'Container runtime operation',
  shell_string_execution: 'Inline shell script execution',
  python_inline_execution: 'Inline Python script execution',
  node_inline_execution: 'Inline Node.js script execution',
  remote_write: 'Push to remote repository',
  force_push_protected: 'Force-push to protected branch',
  destroy_root: 'Recursive deletion of root directory',
  destroy_home: 'Recursive deletion of HOME directory',
  destroy_dot_git: 'Delete .git directory',
  pipe_to_shell: 'Pipe remote script directly to shell',
  dd_to_device: 'Write to raw device',
  write_system_root: 'Write to system path',
  write_outside_workspace: 'Write outside workspace',
  sensitive_path_write: 'Write to sensitive file',
  mcp_server_activation: 'Activate MCP server',
  strict_mode_default: 'Strict mode requires approval by default',
};

function ApprovalCard({ request, busy, onDecide, collapsed, onToggleCollapsed, embedded = false }) {
  const browserRuntime = isBrowserRuntimeRequest(request);
  const busyDecision = busy === true ? 'working' : String(busy || '');
  const isBusy = Boolean(busyDecision);
  const showAlways = request.allow_always !== false;
  const riskText = RISK_TEXT[request.risk_code] || request.risk_code || 'Unclassified risk';
  const title = browserRuntime ? 'Browser Runtime Required' : 'Approval Required';
  const preview = requestPreview(request);
  const installs = Array.isArray(request.remediation?.installs) ? request.remediation.installs.join(', ') : '';
  const busyText = browserRuntime
    ? busyDecision === 'deny'
      ? 'Declining browser runtime installation...'
      : 'Installing browser runtime...'
    : busyDecision === 'deny'
      ? 'Denying request...'
      : busyDecision === 'allow_always'
        ? 'Approving and saving rule...'
        : busyDecision === 'allow_once'
          ? 'Approving this request...'
          : 'Resolving approval...';

  return (
    <div
      className={`haish-approval-card${embedded ? ' is-embedded' : ''}`}
      data-collapsed={collapsed ? '1' : '0'}
      data-busy={isBusy ? '1' : '0'}
    >
      {!embedded ? (
        <button type="button" className="haish-approval-header" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
          <span className={`haish-approval-status ${isBusy ? 'is-busy' : ''}`} aria-hidden="true" />
          <span className="haish-approval-icon" aria-hidden="true" />
          <span className="haish-approval-title">{title}</span>
          {collapsed ? (
            <PortalTooltip text={preview} position="above" multiline>
              <span className="haish-approval-collapsed-preview">{preview.slice(0, 80)}</span>
            </PortalTooltip>
          ) : null}
          <span className="haish-approval-tool-badge">{request.tool_name}</span>
          <svg
            className={`haish-approval-chevron ${collapsed ? '' : 'is-open'}`}
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            {collapsed ? (
              <path
                d="M4.25 2.5L7.75 6L4.25 9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M2.5 4.25L6 7.75L9.5 4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
      ) : null}

      {!collapsed || embedded ? (
        <div className="haish-approval-body">
          {browserRuntime ? (
            <div className="haish-approval-intent">{browserRuntimeSummary(request)}</div>
          ) : request.intent_summary ? (
            <div className="haish-approval-intent">{request.intent_summary}</div>
          ) : null}

          {!browserRuntime ? (
            <>
              <div className="haish-approval-cmd-label">
                <span>Command (runs in terminal)</span>
              </div>
              <pre className="haish-approval-cmd-pre">{request.raw_command || '(empty)'}</pre>
            </>
          ) : null}

          <div className="haish-approval-meta">
            {request.workspace_path ? (
              <div className="haish-approval-meta-row">
                <span className="haish-approval-meta-key">Scope</span>
                <span className="haish-approval-meta-val">{request.workspace_path}</span>
              </div>
            ) : null}
            {browserRuntime ? (
              <>
                <div className="haish-approval-meta-row">
                  <span className="haish-approval-meta-key">Missing</span>
                  <span className="haish-approval-meta-val haish-approval-risk-val">
                    {request?.diagnostic?.dependency || request?.error?.diagnostic?.dependency || 'browser runtime'}
                  </span>
                </div>
                {installs ? (
                  <div className="haish-approval-meta-row">
                    <span className="haish-approval-meta-key">Installs</span>
                    <span className="haish-approval-meta-val">{installs}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="haish-approval-meta-row">
                <span className="haish-approval-meta-key">Risk</span>
                <span className="haish-approval-meta-val haish-approval-risk-val">{riskText}</span>
              </div>
            )}
            {!browserRuntime && !showAlways ? (
              <div className="haish-approval-killswitch">
                This is a failsafe-level operation. It can only be allowed once and cannot be permanently approved.
              </div>
            ) : null}
          </div>

          <div className="haish-approval-actions">
            {isBusy ? (
              <div className="haish-approval-progress" role="status" aria-live="polite">
                <span className="haish-approval-spinner" aria-hidden="true" />
                <span>{busyText}</span>
              </div>
            ) : (
              <>
                {browserRuntime ? (
                  <button
                    type="button"
                    className="haish-approval-btn haish-approval-btn-once"
                    onClick={() => onDecide('install')}
                  >
                    Install Browser Runtime
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="haish-approval-btn haish-approval-btn-once"
                      onClick={() => onDecide('allow_once')}
                    >
                      Allow Once
                    </button>
                    {showAlways ? (
                      <PortalTooltip
                        text={`Approve and add ${request.suggested_pattern} to this project's permanent allowlist`}
                        position="above"
                        multiline
                      >
                        <button
                          type="button"
                          className="haish-approval-btn haish-approval-btn-always"
                          onClick={() => onDecide('allow_always')}
                        >
                          Approve and Remember
                        </button>
                      </PortalTooltip>
                    ) : null}
                  </>
                )}
                <button
                  type="button"
                  className="haish-approval-btn haish-approval-btn-deny"
                  onClick={() => onDecide('deny')}
                >
                  Deny
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowApprovalCard({ request, busy, onDecide, collapsed, onToggleCollapsed, resolved = false }) {
  const [feedback, setFeedback] = useState('');
  const isBusy = Boolean(busy);
  const preview = requestPreview(request);
  const summaryText = normalizeWorkflowApprovalMarkdown(
    request.summaryText || 'Review the submitted workflow result.',
  );
  return (
    <div className="haish-approval-card haish-workflow-approval-card" data-collapsed={collapsed ? '1' : '0'} data-busy={isBusy ? '1' : '0'}>
      <button type="button" className="haish-approval-header" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
        <span className={`haish-approval-status ${isBusy ? 'is-busy' : ''}`} aria-hidden="true" />
        <span className="haish-approval-title">{request.title || 'Approval required'}</span>
        {collapsed ? (
          <PortalTooltip text={preview} position="above" multiline>
            <span className="haish-approval-collapsed-preview">{preview.slice(0, 80)}</span>
          </PortalTooltip>
        ) : null}
        <svg className={`haish-approval-chevron ${collapsed ? '' : 'is-open'}`} viewBox="0 0 12 12" aria-hidden="true">
          <path
            d={collapsed ? 'M4.25 2.5L7.75 6L4.25 9.5' : 'M2.5 4.25L6 7.75L9.5 4.25'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {!collapsed ? (
        <div className="haish-approval-body">
          <div className="haish-approval-intent"><Markdown source={summaryText} /></div>
          {resolved ? (
            <div className={`haish-workflow-resolution is-${request.decision || 'cancelled'}`}>
              <strong>{request.decision === 'approved' ? 'Approved' : request.decision === 'rejected' ? 'Rejected' : 'Cancelled'}</strong>
              {request.feedback ? <p>{request.feedback}</p> : null}
            </div>
          ) : (
            <>
              {request.previous_feedback ? (
                <div className="haish-workflow-previous-feedback">
                  <strong>Previous feedback</strong>
                  <span>{request.previous_feedback}</span>
                </div>
              ) : null}
              <label className="haish-workflow-feedback-label" htmlFor={`workflow-feedback-${request.request_id}`}>
                Feedback <span>required when going back</span>
              </label>
              <textarea
                id={`workflow-feedback-${request.request_id}`}
                className="haish-workflow-feedback"
                value={feedback}
                disabled={isBusy}
                rows={3}
                placeholder="Describe what needs to change"
                onChange={(event) => setFeedback(event.target.value)}
              />
              <div className="haish-approval-actions">
                {isBusy ? (
                  <div className="haish-approval-progress" role="status" aria-live="polite">
                    <span className="haish-approval-spinner" aria-hidden="true" />
                    <span>{busy === 'reject' ? 'Going back...' : 'Continuing...'}</span>
                  </div>
                ) : (
                  <>
                    <button type="button" className="haish-approval-btn haish-approval-btn-once" onClick={() => onDecide('approve', feedback)}>
                      Next
                    </button>
                    <button
                      type="button"
                      className="haish-approval-btn haish-approval-btn-always"
                      disabled={!feedback.trim()}
                      onClick={() => onDecide('reject', feedback)}
                    >
                      Back
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser-runtime requests render inline inside the triggering browser_use
// tool node (see ChatTimelineToolNode) instead of opening a separate chat
// row / dialog. While a BrowserRuntimeCard is mounted it "claims" its
// request in the store so ApprovalInline skips it; requests that could not
// attach to a visible tool node stay in the standalone slot as fallback.
// ---------------------------------------------------------------------------

export function useBrowserRuntimeRequests(active = true) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!active) return undefined;
    ensureStyles();
    return approvalStore.subscribe((next) => {
      setRequests(next.filter(isBrowserRuntimeRequest));
    });
  }, [active]);
  return requests;
}

// Pick the browser-runtime request that belongs to a given browser_use tool
// node, if any. The backend task stream remaps call ids into opaque "world"
// ids (world_call_id in the runtime), so the request's raw tool_call_id only
// matches the timeline call id when no remapping happened. Matching order:
//  1. exact tool_call_id === callId (primary anchor, non-remapped streams)
//  2. scope fallback: the node is an ACTIVE browser_use call (pending/running
//     — i.e. the blocked call awaiting the install confirmation) and exactly
//     one browser-runtime request is pending in this conversation/task.
// Requests that cannot be attributed stay unclaimed and render in the
// standalone ApprovalInline slot.
export function selectBrowserRuntimeRequest(
  requests,
  { toolName = '', callId = '', status = '', conversationId = '', taskId = '' } = {},
) {
  if (String(toolName || '').toLowerCase() !== 'browser_use') return null;
  const scoped = (Array.isArray(requests) ? requests : []).filter(
    (request) =>
      (!request.conversation_id || !conversationId || request.conversation_id === conversationId) &&
      (!request.task_id || !taskId || request.task_id === taskId),
  );
  if (!scoped.length) return null;
  if (callId) {
    const exact = scoped.find((request) => request.tool_call_id && request.tool_call_id === callId);
    if (exact) return exact;
  }
  const isActive = status === 'pending' || status === 'running';
  if (!isActive || scoped.length !== 1) return null;
  return scoped[0];
}

export function BrowserRuntimeCard({ request, embedded = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(false);

  // Claim as soon as this card mounts so the standalone ApprovalInline row
  // disappears. The claim is exclusive — only the first mounted card for a
  // request wins (duplicate mounts render nothing); on unmount the claim is
  // released so the request falls back to the standalone slot if its tool
  // node is no longer on screen.
  React.useLayoutEffect(() => {
    const won = approvalStore.claimBrowserRuntime(request.request_id);
    setActive(won);
    return () => {
      if (won) approvalStore.unclaimBrowserRuntime(request.request_id);
    };
  }, [request.request_id]);

  const handleDecide = useCallback(
    async (decision) => {
      setError('');
      setBusy(decision);
      try {
        await postBrowserRuntimeResolve(request, decision);
        // Optimistic removal: store will also drop it once the stream confirms.
        approvalStore.remove(request.request_id);
      } catch (err) {
        setError(String(err && err.message ? err.message : err));
        setBusy('');
      }
    },
    [request],
  );

  if (!active) return null;

  return (
    <div className={`haish-approval-slot${embedded ? ' is-embedded' : ''}`}>
      {error ? <div className="haish-approval-error">{error}</div> : null}
      <ApprovalCard
        request={request}
        busy={busy}
        collapsed={embedded ? false : collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onDecide={handleDecide}
        embedded={embedded}
      />
    </div>
  );
}

export function ApprovalInline() {
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');
  const [collapsedRids, setCollapsedRids] = useState({});

  // Subscribe to the singleton approval store. The store owns the
  // EventSource; this component just renders whatever it emits. No new
  // network connections are created when this component re-mounts during
  // conversation switches.
  useEffect(() => {
    ensureStyles();
    const unsubscribe = approvalStore.subscribe((next) => {
      setPending(next);
      // Also drop transient per-rid state for resolved entries.
      setBusy((prev) => {
        const alive = new Set(next.map((p) => p.request_id));
        let changed = false;
        const out = {};
        for (const k of Object.keys(prev)) {
          if (alive.has(k)) out[k] = prev[k];
          else changed = true;
        }
        return changed ? out : prev;
      });
      setCollapsedRids((prev) => {
        const alive = new Set(next.map((p) => p.request_id));
        let changed = false;
        const out = {};
        for (const k of Object.keys(prev)) {
          if (alive.has(k)) out[k] = prev[k];
          else changed = true;
        }
        return changed ? out : prev;
      });
    });
    return unsubscribe;
  }, []);

  const handleDecide = useCallback(async (request, decision) => {
    setError('');
    setBusy((prev) => ({ ...prev, [request.request_id]: decision }));
    try {
      if (isBrowserRuntimeRequest(request)) {
        await postBrowserRuntimeResolve(request, decision);
      } else {
        await postResolve(request.request_id, decision);
      }
      // Optimistic removal: store will also drop it once the stream confirms.
      approvalStore.remove(request.request_id);
    } catch (err) {
      setError(String(err && err.message ? err.message : err));
      setBusy((prev) => {
        const next = { ...prev };
        delete next[request.request_id];
        return next;
      });
    }
  }, []);

  const toggleCollapsed = useCallback((requestId) => {
    setCollapsedRids((prev) => ({ ...prev, [requestId]: !prev[requestId] }));
  }, []);

  // Browser-runtime requests are rendered inside their browser_use tool node
  // (BrowserRuntimeCard claims them while the node is on screen). Only keep
  // Workflow approvals belong to WorkflowApprovalInline. This shared chat
  // slot only renders regular approvals and unclaimed browser-runtime requests.
  const renderable = pending.filter(
    (request) => !isWorkflowApprovalRequest(request)
      && (!isBrowserRuntimeRequest(request) || !approvalStore.isBrowserRuntimeClaimed(request.request_id)),
  );
  if (!renderable.length) return null;

  const current = renderable[0];
  const rest = renderable.length - 1;

  return (
    <div className="chat-message-row agent haish-approval-row">
      <div className="chat-bubble">
        <div className="haish-approval-slot">
          {error ? <div className="haish-approval-error">{error}</div> : null}
          <ApprovalCard
            request={current}
            busy={!!busy[current.request_id]}
            collapsed={!!collapsedRids[current.request_id]}
            onToggleCollapsed={() => toggleCollapsed(current.request_id)}
            onDecide={(decision) => handleDecide(current, decision)}
          />
          {rest > 0 ? (
            <div className="haish-approval-queue">
              {rest} pending request{rest === 1 ? '' : 's'} queued
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WorkflowApprovalInline({
  nodeId = '',
  taskId = '',
  conversationId = '',
  allowLiveRequest = true,
  resolvedRequest = null,
  onRetry = null,
  createdAt = null,
  completedAt = null,
}) {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = React.useRef(null);

  useEffect(() => {
    ensureStyles();
    if (!allowLiveRequest) return undefined;
    return approvalStore.subscribe((next) => {
      const scoped = next.filter((item) => {
        if (!isWorkflowApprovalRequest(item)) return false;
        const requestNodeId = String(item.workflow_node_id || item.node_id || item.nodeId || '');
        const requestTaskId = String(item.task_id || item.taskId || '');
        const requestConversationId = String(item.conversation_id || item.conversationId || '');
        if (requestNodeId && nodeId && requestNodeId !== nodeId) return false;
        if (requestTaskId && taskId && requestTaskId !== taskId) return false;
        if (!requestTaskId && requestConversationId && conversationId && requestConversationId !== conversationId) return false;
        return true;
      });
      setRequest(scoped[0] || null);
      if (!scoped.length) setBusy('');
    });
  }, [allowLiveRequest, conversationId, nodeId, taskId]);

  useEffect(() => {
    setBusy('');
    setError('');
  }, [request?.request_id]);

  const handleDecide = useCallback(async (decision, feedback = '') => {
    if (!request) return;
    const requestId = request.request_id;
    setError('');
    setBusy(decision);
    try {
      await postWorkflowApprovalResolve(requestId, decision, feedback);
      setBusy('');
      approvalStore.remove(requestId);
    } catch (err) {
      setError(String(err && err.message ? err.message : err));
      setBusy('');
    }
  }, [request]);

  const activeRequest = allowLiveRequest ? request : null;
  const displayRequest = activeRequest || resolvedRequest;
  const copyText = normalizeWorkflowApprovalMarkdown(displayRequest?.summaryText || '');
  const messageClock = formatMessageClock(completedAt || createdAt);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!await copyTextToClipboard(copyText)) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [copyText]);

  if (!displayRequest) return null;
  return (
    <div className="chat-message-row agent workflow-detail-approval" aria-live="polite">
      <div className="chat-bubble">
        <div className="chat-bubble-meta">
          <span className="chat-bubble-meta-main">
            <span className="chat-bubble-avatar ico-assistant-avatar" aria-hidden="true" />
            <span>Assistant</span>
          </span>
        </div>
        <div className="haish-approval-slot">
          {error ? <div className="haish-approval-error">{error}</div> : null}
          <WorkflowApprovalCard
            key={displayRequest.request_id}
            request={displayRequest}
            busy={activeRequest ? busy : ''}
            collapsed={false}
            onToggleCollapsed={() => undefined}
            onDecide={handleDecide}
            resolved={!activeRequest}
          />
        </div>
      </div>
      {(messageClock || copyText || onRetry) ? (
        <div className="chat-message-actions">
          {messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
          {copyText ? (
            <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="above">
              <button
                type="button"
                className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                <span className="ico-copy-message" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : null}
          {onRetry ? (
            <PortalTooltip text="ReRun" position="above">
              <button type="button" className="chat-bubble-copy" onClick={onRetry} aria-label="ReRun this node">
                <svg className="chat-bubble-rerun-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ensureStyles() {
  if (document.getElementById('haish-approval-styles')) return;
  const style = document.createElement('style');
  style.id = 'haish-approval-styles';
  style.textContent = `
/* 卡片所在的「插槽」：优先嵌在 .chat-timeline 内，紧跟 Shell 工具调用 */
.haish-approval-slot {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
}

/* Workflow node details are conversation content, so their prose should use
   the same bundled reading font as chat instead of the tool-card monospace. */
.workflow-detail-body .haish-approval-slot {
  font-family: var(--conversation-font, 'PingFang SC', 'Microsoft YaHei', sans-serif);
}

/* 嵌入 browser_use 工具节点内部时，与工具头保持一点间距 */
.chat-timeline-tool > .haish-approval-slot {
  margin-top: 10px;
  padding: 0 2px 0 4px;
}
/* 嵌入模式：去掉卡片自身的头部和左侧缩进线，内容直接作为工具卡片的一部分 */
.chat-timeline-tool > .haish-approval-slot.is-embedded {
  margin-top: 0;
  padding: 0;
}
.haish-approval-card.is-embedded {
  animation: none;
}
.haish-approval-card.is-embedded .haish-approval-body {
  margin-left: 18px;
  padding: 4px 10px 8px;
  border-left: 1px solid rgba(138, 166, 209, 0.22);
}
.haish-approval-card.is-embedded .haish-approval-intent {
  color: rgba(236, 241, 252, 0.92);
  font-weight: 600;
  margin-bottom: 10px;
}

.haish-approval-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(100%, 1040px);
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  animation: haishApprovalSlideIn 220ms ease-out;
  color: #dce3f4;
}
@keyframes haishApprovalSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 头部按审批设计稿呈现：金色描边胶囊，而不是普通工具调用头 */
.haish-approval-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 4px 8px;
  background: rgba(19, 28, 44, 0.72);
  border: 1px solid rgba(239, 191, 100, 0.58);
  border-radius: 6px;
  color: var(--gold);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
}
.haish-approval-header:hover {
  border-color: rgba(239, 191, 100, 0.72);
  background: rgba(25, 36, 56, 0.78);
}

.haish-approval-status {
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 8px rgba(239,191,100,0.28);
}
.haish-approval-status.is-busy {
  flex: 0 0 12px;
  width: 12px;
  min-width: 12px;
  max-width: 12px;
  height: 12px;
  min-height: 12px;
  max-height: 12px;
  box-sizing: border-box;
  display: inline-block;
  border: 2px solid rgba(239, 191, 100, 0.28);
  border-top-color: var(--gold);
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  animation: haishApprovalSpin 760ms linear infinite;
}
@keyframes haishApprovalSpin {
  to { transform: rotate(360deg); }
}

.haish-approval-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  background-color: transparent;
  background-image: url("assets/ui/icons/warning.png");
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  image-rendering: auto;
}
.haish-approval-title {
  min-width: 0;
  flex: 0 0 auto;
  color: rgba(236,241,252,0.95);
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
}

.haish-approval-collapsed-preview {
  min-width: 48px;
  flex: 1 1 auto;
  font-weight: 400;
  color: rgba(174,185,211,0.78);
  font-size: 11px;
  font-family: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.haish-approval-tool-badge {
  margin-left: auto;
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  color: var(--gold);
  background: rgba(239, 191, 100, 0.14);
  border: 0;
  padding: 2px 7px;
  border-radius: 5px;
  letter-spacing: 0;
}

.haish-approval-chevron {
  flex: 0 0 auto;
  display: inline-block;
  width: 14px;
  height: 14px;
  color: var(--gold);
  opacity: 0.95;
  shape-rendering: geometricPrecision;
}

.haish-approval-body {
  margin-left: 36px;
  padding: 12px 0 2px 18px;
  border-left: 1px solid rgba(138,166,209,0.32);
  font-size: 13px;
  line-height: 1.6;
  font-family: inherit;
  color: rgba(200,209,228,0.78);
}

.haish-approval-intent {
  color: rgba(174,185,211,0.78);
  margin-bottom: 12px;
  padding-bottom: 0;
  border-bottom: 0;
  white-space: pre-wrap;
}

.haish-workflow-approval-card .haish-approval-header {
  border-color: rgba(244, 114, 182, 0.52);
}
.haish-workflow-approval-card .haish-approval-status {
  background: #f472b6;
  box-shadow: 0 0 8px rgba(244, 114, 182, 0.3);
}
.haish-workflow-approval-card .haish-approval-chevron {
  color: #f9a8d4;
}
.haish-workflow-feedback-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0 7px;
  color: rgba(236, 241, 252, 0.92);
  font-size: 11px;
  font-weight: 600;
}
.haish-workflow-feedback-label span {
  color: rgba(174, 185, 211, 0.68);
  font-weight: 400;
}
.haish-workflow-previous-feedback {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  padding: 9px 10px;
  border-left: 2px solid rgba(244, 114, 182, 0.6);
  background: rgba(244, 114, 182, 0.07);
  color: rgba(214, 223, 241, 0.86);
}
.haish-workflow-previous-feedback strong {
  color: #f9a8d4;
  font-size: 11px;
}
.haish-workflow-previous-feedback span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.haish-workflow-feedback {
  box-sizing: border-box;
  width: 100%;
  min-height: 68px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid rgba(138, 166, 209, 0.24);
  border-radius: 6px;
  outline: none;
  background: rgba(10, 14, 24, 0.62);
  color: rgba(236, 241, 252, 0.94);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}
.haish-workflow-feedback:focus-visible {
  border-color: rgba(244, 114, 182, 0.72);
  box-shadow: 0 0 0 2px rgba(244, 114, 182, 0.09);
}
.haish-workflow-feedback::placeholder {
  color: rgba(142, 154, 184, 0.62);
}
.haish-workflow-feedback:disabled {
  opacity: 0.68;
  cursor: wait;
}
.haish-workflow-resolution {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 13px;
  border: 1px solid rgba(74, 222, 128, 0.16);
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.06), rgba(16, 24, 38, 0.42));
}
.haish-workflow-resolution strong {
  padding: 2px 7px;
  border: 1px solid rgba(74, 222, 128, 0.28);
  border-radius: 999px;
  background: rgba(74, 222, 128, 0.08);
  color: var(--green-2);
  font-size: 10px;
  line-height: 1.5;
}
.haish-workflow-resolution.is-rejected,
.haish-workflow-resolution.is-cancelled {
  border-color: rgba(255, 154, 170, 0.18);
  background: linear-gradient(135deg, rgba(255, 106, 130, 0.07), rgba(16, 24, 38, 0.42));
}
.haish-workflow-resolution.is-rejected strong,
.haish-workflow-resolution.is-cancelled strong {
  border-color: rgba(255, 154, 170, 0.3);
  background: rgba(255, 106, 130, 0.08);
  color: #ff9aaa;
}
.haish-workflow-resolution p {
  width: 100%;
  margin: 0;
  color: rgba(225, 232, 246, 0.88);
  font-family: var(--content-font, 'PingFang SC'), 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.haish-approval-cmd-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(142,154,184,0.82);
  margin-bottom: 8px;
  font-family: inherit;
}
.haish-approval-cmd-pre {
  margin: 0;
  padding: 10px 12px;
  background: rgba(10,14,24,0.72);
  border: 1px solid rgba(138,166,209,0.18);
  border-radius: 7px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(222,229,245,0.9);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: normal;
  max-height: 220px;
  overflow: auto;
}

.haish-approval-meta {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: inherit;
}
.haish-approval-meta-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.6;
}
.haish-approval-meta-key {
  color: rgba(142,154,184,0.82);
  white-space: nowrap;
}
.haish-approval-meta-val {
  color: rgba(222,229,245,0.9);
  font-family: inherit;
  font-size: 12px;
  overflow-wrap: anywhere;
  word-break: normal;
}
.haish-approval-risk-val {
  font-family: inherit;
  font-weight: 400;
  letter-spacing: 0;
}

.haish-user-input-card .haish-approval-body {
  box-sizing: border-box;
  width: calc(100% - 36px);
  max-width: calc(100% - 36px);
  min-width: 0;
  padding-top: 8px;
  overflow: hidden;
}

.workflow-detail-body .haish-user-input-card .haish-approval-intent,
.workflow-detail-body .haish-user-input-card .haish-user-input-question legend,
.workflow-detail-body .haish-user-input-card .haish-user-input-option-copy,
.workflow-detail-body .haish-user-input-card .haish-user-input-textarea {
  font-family: var(--conversation-font, 'PingFang SC', 'Microsoft YaHei', sans-serif);
}

.haish-user-input-questions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.haish-user-input-question {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.haish-user-input-question legend {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin-bottom: 9px;
  padding: 0;
  color: rgba(236,241,252,0.95);
  font-size: 13px;
  font-weight: 600;
}
.haish-user-input-header {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(239, 191, 100, 0.12);
  color: var(--gold);
  font-size: 10px;
  font-weight: 700;
}
.haish-user-input-prompt {
  display: block;
  width: 100%;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.55;
}
.haish-user-input-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 8px;
}
.haish-user-input-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(138,166,209,0.22);
  border-radius: 6px;
  background: rgba(10,14,24,0.48);
  cursor: pointer;
}
.haish-user-input-option:hover,
.haish-user-input-option.is-selected {
  border-color: rgba(239, 191, 100, 0.64);
  background: rgba(239, 191, 100, 0.08);
}
.haish-user-input-native-control {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}
.haish-user-input-check {
  position: relative;
  box-sizing: border-box;
  display: block;
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1px solid rgba(174,185,211,0.78);
  border-radius: 2px;
  background: rgba(10,14,24,0.72);
}
.haish-user-input-native-control:focus-visible + .haish-user-input-check {
  outline: 2px solid rgba(239, 191, 100, 0.45);
  outline-offset: 2px;
}
.haish-user-input-native-control:checked + .haish-user-input-check {
  border-color: #efbf64;
  background: #efbf64;
}
.haish-user-input-native-control:checked + .haish-user-input-check::after {
  position: absolute;
  top: 1px;
  left: 4px;
  width: 3px;
  height: 7px;
  border: solid #111827;
  border-width: 0 2px 2px 0;
  content: '';
  transform: rotate(45deg);
}
.haish-user-input-option-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.haish-user-input-option strong {
  color: rgba(236,241,252,0.92);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.haish-user-input-option small {
  color: rgba(174,185,211,0.72);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.haish-user-input-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid rgba(138,166,209,0.24);
  border-radius: 6px;
  outline: none;
  background: rgba(10,14,24,0.62);
  color: rgba(236,241,252,0.94);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}
.haish-user-input-textarea:focus {
  border-color: rgba(239, 191, 100, 0.72);
  box-shadow: 0 0 0 2px rgba(239, 191, 100, 0.08);
}
.haish-user-input-textarea::placeholder {
  color: rgba(142,154,184,0.62);
}

.haish-approval-killswitch {
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(224, 71, 106, 0.08);
  border: 1px solid rgba(224, 71, 106, 0.32);
  border-radius: 4px;
  font-size: 12px;
  color: #fb7185;
  line-height: 1.5;
  font-family: inherit;
}

.haish-approval-progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 8px 11px;
  border: 1px solid rgba(239, 191, 100, 0.28);
  border-radius: 6px;
  background: rgba(239, 191, 100, 0.08);
  color: rgba(236, 241, 252, 0.92);
  font-size: 12px;
  line-height: 1.45;
  font-family: inherit;
}
.haish-approval-spinner {
  flex: 0 0 14px;
  width: 14px;
  min-width: 14px;
  max-width: 14px;
  height: 14px;
  min-height: 14px;
  max-height: 14px;
  box-sizing: border-box;
  display: inline-block;
  border: 2px solid rgba(239, 191, 100, 0.28);
  border-top-color: var(--gold);
  border-radius: 999px;
  animation: haishApprovalSpin 760ms linear infinite;
}

.haish-approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.haish-approval-btn {
  padding: 8px 16px;
  font-family: inherit;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(239, 191, 100, 0.48);
  background: rgba(26, 30, 44, 0.82);
  color: #daddef;
  transition: all 120ms ease;
}
.haish-approval-btn:hover:not(:disabled) {
  background: rgba(35, 40, 56, 0.95);
}
.haish-approval-btn:disabled {
  opacity: 0.72;
  cursor: wait;
  filter: saturate(0.75);
}
.haish-approval-btn-deny {
  border-color: rgba(224, 71, 106, 0.72);
  color: #fb7185;
}
.haish-approval-btn-deny:hover:not(:disabled) {
  background: rgba(224, 71, 106, 0.10);
}
.haish-approval-btn-once {
  border-color: rgba(239, 191, 100, 0.82);
  background: var(--gold);
  color: #0b101a;
  font-weight: 600;
}
.haish-approval-btn-once:hover:not(:disabled) {
  background: #ffd36f;
}
.haish-approval-btn-always {
  border-color: rgba(239, 191, 100, 0.62);
  background: rgba(239, 191, 100, 0.14);
  color: var(--gold);
  font-weight: 600;
}
.haish-approval-btn-always:hover:not(:disabled) {
  background: rgba(239, 191, 100, 0.22);
}

.haish-approval-queue {
  font-size: 12px;
  color: #8e9ab8;
  padding: 2px 4px;
  font-family: inherit;
}
.haish-approval-error {
  font-size: 12px;
  color: #fb7185;
  padding: 8px 12px;
  background: rgba(224, 71, 106, 0.08);
  border: 1px solid rgba(224, 71, 106, 0.32);
  border-radius: 4px;
  font-family: inherit;
}
`;
  document.head.appendChild(style);
}

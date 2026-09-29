import { ApprovalSurface } from '../../../shared/ui/agent-elements/ApprovalSurface.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { Markdown } from '../../../shared/ui/Markdown.jsx';
import { normalizeWorkflowApprovalMarkdown } from '../../workflow/model/workflow-approval-markdown.js';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { copyTextToClipboard } from '../../../shared/lib/clipboard.js';
import { formatMessageClock } from '../../../shared/lib/message-format.js';
import {
  postApprovalDecision,
  postBrowserRuntimeDecision,
  postComputerRuntimeDecision,
  postWorkflowApprovalDecision,
} from '../api/approvals.js';
import {
  approvalStore,
  isBrowserRuntimeRequest,
  isComputerRuntimeRequest,
  isRuntimeRequest,
  isWorkflowApprovalRequest,
  requestBelongsToConversation,
  selectConversationApprovalRequests,
} from '../model/approval-store.js';

const { useState, useEffect, useCallback } = React;

function runtimeDependency(request, fallback) {
  return request?.diagnostic?.dependency || request?.error?.diagnostic?.dependency || fallback;
}

function runtimeOperation(request) {
  return request?.remediation?.operation === 'replace' ? 'replace' : 'install';
}

function runtimeSummary(request) {
  const replacing = runtimeOperation(request) === 'replace';
  if (isComputerRuntimeRequest(request)) {
    return replacing
      ? 'The shared Computer Runtime is incompatible. Replace it with the required version to continue.'
      : 'Computer runtime is missing. Install it to continue.';
  }
  if (replacing) return 'The Browser Runtime is incompatible. Replace it with the required version to continue.';
  const dependency = runtimeDependency(request, 'browser runtime');
  if (String(dependency).includes('chromium')) return 'Browser runtime is missing. Install it to continue.';
  return 'Browser runtime dependency is missing. Install it to continue.';
}

function requestPreview(request) {
  if (isRuntimeRequest(request)) return runtimeSummary(request);
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
  command_outside_workspace: 'Run command outside workspace',
  sensitive_path_write: 'Write to sensitive file',
  mcp_server_activation: 'Activate MCP server',
  strict_mode_default: 'Strict mode requires approval by default',
};

function ApprovalCard({ request, busy, onDecide, collapsed, onToggleCollapsed, embedded = false }) {
  const browserRuntime = isBrowserRuntimeRequest(request);
  const computerRuntime = isComputerRuntimeRequest(request);
  const runtimeRequest = browserRuntime || computerRuntime;
  const busyDecision = busy === true ? 'working' : String(busy || '');
  const isBusy = Boolean(busyDecision);
  const showAlways = request.allow_always !== false;
  const riskText = RISK_TEXT[request.risk_code] || request.risk_code || 'Unclassified risk';
  const replacingRuntime = runtimeRequest && runtimeOperation(request) === 'replace';
  const title = computerRuntime
    ? (replacingRuntime ? 'Computer Runtime Replacement Required' : 'Computer Runtime Required')
    : browserRuntime
      ? (replacingRuntime ? 'Browser Runtime Replacement Required' : 'Browser Runtime Required')
      : 'Approval Required';
  const preview = requestPreview(request);
  const installs = Array.isArray(request.remediation?.installs) ? request.remediation.installs.join(', ') : '';
  const runtimeLabel = computerRuntime ? 'computer' : 'browser';
  const busyText = runtimeRequest
    ? busyDecision === 'deny'
      ? `Keeping the current ${runtimeLabel} runtime...`
      : replacingRuntime
        ? `Replacing ${runtimeLabel} runtime...`
        : `Installing ${runtimeLabel} runtime...`
    : busyDecision === 'deny'
      ? 'Denying request...'
      : busyDecision === 'allow_always'
        ? 'Approving and saving rule...'
        : busyDecision === 'allow_once'
          ? 'Approving this request...'
          : 'Resolving approval...';

  return (
    <ApprovalSurface
      className={`haish-approval-card${embedded ? ' is-embedded' : ''}`}
      data-collapsed={collapsed ? '1' : '0'}
      data-busy={isBusy ? '1' : '0'}
    >
      {!embedded ? (
        <button type="button" className="haish-approval-header" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
          <span className={`haish-approval-status ${isBusy ? 'is-busy' : ''}`} aria-hidden="true" />
          {runtimeRequest ? (
            <span
              className={`ico ${computerRuntime ? 'ico-computer-use' : 'ico-browser'}`}
              aria-hidden="true"
            />
          ) : <ShieldCheck size={16} aria-hidden="true" />}
          <span className="haish-approval-title">{title}</span>
          {collapsed ? (
            <PortalTooltip text={preview} position="above" multiline>
              <span className="haish-approval-collapsed-preview">{preview.slice(0, 80)}</span>
            </PortalTooltip>
          ) : null}
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
          {runtimeRequest ? (
            <div className="haish-approval-intent">{runtimeSummary(request)}</div>
          ) : request.intent_summary ? (
            <div className="haish-approval-intent">{request.intent_summary}</div>
          ) : null}

          {!runtimeRequest ? (
            <>
              <div className="haish-approval-cmd-label">
                <span>{request.tool_name === 'exec_command' ? 'Command (runs in terminal)' : 'Requested operation'}</span>
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
            {runtimeRequest ? (
              <>
                <div className="haish-approval-meta-row">
                  <span className="haish-approval-meta-key">{replacingRuntime ? 'Runtime' : 'Missing'}</span>
                  <span className="haish-approval-meta-val haish-approval-risk-val">
                    {runtimeDependency(request, computerRuntime ? 'cua-driver' : 'browser runtime')}
                  </span>
                </div>
                {replacingRuntime ? (
                  <>
                    <div className="haish-approval-meta-row">
                      <span className="haish-approval-meta-key">Installed</span>
                      <span className="haish-approval-meta-val">{request.remediation?.installed_version || request.diagnostic?.installed_version || 'Unknown'}</span>
                    </div>
                    <div className="haish-approval-meta-row">
                      <span className="haish-approval-meta-key">Required</span>
                      <span className="haish-approval-meta-val">{request.remediation?.required_version || request.diagnostic?.required_version || 'Unknown'}</span>
                    </div>
                    {computerRuntime ? (
                      <div className="haish-approval-killswitch">
                        This replaces the shared Cua Driver app used by other sessions on this Mac.
                      </div>
                    ) : null}
                  </>
                ) : null}
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
            {!runtimeRequest && !showAlways ? (
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
                {runtimeRequest ? (
                  <button
                    type="button"
                    className="haish-approval-btn haish-approval-btn-once"
                    onClick={() => onDecide('install')}
                  >
                    {replacingRuntime
                      ? 'Replace and Continue'
                      : computerRuntime ? 'Install Computer Runtime' : 'Install Browser Runtime'}
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
                  {replacingRuntime ? 'Keep Current Version' : 'Deny'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </ApprovalSurface>
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
    <ApprovalSurface className="haish-approval-card haish-workflow-approval-card" data-collapsed={collapsed ? '1' : '0'} data-busy={isBusy ? '1' : '0'}>
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
    </ApprovalSurface>
  );
}

// ---------------------------------------------------------------------------
// Browser and Computer Runtime requests share one placement and card path.
// They render inside the triggering tool node whenever that node is present;
// ApprovalInline remains only as a fallback for missing/ambiguous timeline
// nodes. A mounted RuntimeApprovalCard claims its request to prevent duplicate
// standalone rendering.
// ---------------------------------------------------------------------------

export function useRuntimeRequests(conversationId, active = true) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!active || !conversationId) return undefined;
    return approvalStore.subscribe((next) => {
      setRequests(selectConversationApprovalRequests(next, conversationId).filter(isRuntimeRequest));
    });
  }, [active, conversationId]);
  return active && conversationId ? requests : [];
}

function runtimeRequestMatchesTool(request, toolName) {
  const normalized = String(toolName || '').toLowerCase();
  if (normalized === 'browser_use') return isBrowserRuntimeRequest(request);
  if (normalized === 'computer_use') return isComputerRuntimeRequest(request);
  return false;
}

// The backend may remap tool call ids in workflow streams. Prefer an exact id;
// otherwise attach only one request from the same conversation/task to an
// active tool of the matching Runtime kind.
export function selectRuntimeRequest(
  requests,
  { toolName = '', callId = '', status = '', conversationId = '', taskId = '' } = {},
) {
  const scoped = (Array.isArray(requests) ? requests : []).filter(
    (request) =>
      runtimeRequestMatchesTool(request, toolName) &&
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

export function RuntimeApprovalCard({ request, embedded = false }) {
  return <ToolApprovalCard request={request} embedded={embedded} />;
}

export function useToolApprovalRequests(conversationId) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!conversationId) return undefined;
    return approvalStore.subscribe((next) => {
      setRequests(selectConversationApprovalRequests(next, conversationId).filter(
        (request) => !isRuntimeRequest(request) && !isWorkflowApprovalRequest(request),
      ));
    });
  }, [conversationId]);
  return conversationId ? requests : [];
}

export function ToolApprovalCard({ request, embedded = false }) {
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
    const won = approvalStore.claimRuntime(request.request_id);
    setActive(won);
    return () => {
      if (won) approvalStore.unclaimRuntime(request.request_id);
    };
  }, [request.request_id]);

  const handleDecide = useCallback(
    async (decision) => {
      setError('');
      setBusy(decision);
      try {
        if (isBrowserRuntimeRequest(request)) await postBrowserRuntimeDecision(request, decision);
        else if (isComputerRuntimeRequest(request)) await postComputerRuntimeDecision(request, decision);
        else await postApprovalDecision(request.request_id, decision);
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
      {error ? <ErrorState variant="inline" detail={error} /> : null}
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

export function ApprovalInline({ conversationId }) {
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');
  const [collapsedRids, setCollapsedRids] = useState({});

  useEffect(() => setError(''), [conversationId]);

  // Subscribe to the singleton approval store. The store owns the
  // The application-level realtime bridge owns the socket; this component only renders its events. No new
  // network connections are created when this component re-mounts during
  // conversation switches.
  useEffect(() => {
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
        await postBrowserRuntimeDecision(request, decision);
      } else if (isComputerRuntimeRequest(request)) {
        await postComputerRuntimeDecision(request, decision);
      } else {
        await postApprovalDecision(request.request_id, decision);
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

  // Runtime requests are rendered inside their triggering tool nodes when
  // possible. Workflow approvals belong to WorkflowApprovalInline. This
  // shared slot renders regular approvals and unclaimed runtime requests.
  const renderable = pending.filter(
    (request) => requestBelongsToConversation(request, conversationId)
      && !isWorkflowApprovalRequest(request)
      && !approvalStore.isRuntimeClaimed(request.request_id),
  );
  if (!renderable.length) return null;

  const current = renderable[0];
  const rest = renderable.length - 1;

  return (
    <div className="chat-message-row agent haish-approval-row">
      <div className="chat-bubble">
        <div className="haish-approval-slot">
          {error ? <ErrorState variant="inline" detail={error} /> : null}
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
      await postWorkflowApprovalDecision(requestId, decision, feedback);
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
      <div className="chat-bubble message-shell agent-response">
        <div className="chat-bubble-meta">
          <span className="chat-bubble-meta-main">
            <span className="chat-speaker-avatar" aria-hidden="true"><span className="ico-assistant-avatar" /></span>
            <span>Assistant</span>
          </span>
        </div>
        <div className="haish-approval-slot">
          {error ? <ErrorState variant="inline" detail={error} /> : null}
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
                <AppIcon name="retry" size={15} />
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

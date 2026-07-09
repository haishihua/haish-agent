// @haish-esm
import React from 'react';
import ReactDOM from 'react-dom/client';

/**
 * Approval inline card：内嵌到最新一条 assistant 消息气泡（.chat-message-row.agent .chat-bubble）
 * 内部底部，作为 assistant 消息的一部分呈现。
 *
 * v1.7 设计要点：
 *   - 优先挂载在最新 assistant timeline 内最后一个 Shell 工具调用之后、活动提示之前。
 *     这样审批与触发它的命令保持相邻，而不是落到闪烁提示词下方。
 *   - 展开区保留设计稿的左侧竖线；命令和影响范围统一使用 JetBrains Mono。
 *   - 头部图标使用 warning.png，并覆盖全局 pixelated 缩放。
 *   - 折叠：保留审批专属金色头部，点头部展开/收起。
 *
 * 设计文档：docs/tool-approval-and-risk-design.md
 */

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
      throw new Error(`browser runtime ${decision === 'deny' ? 'deny' : 'install'} failed: HTTP ${resp.status} ${detail}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Module-level EventSource singleton + pending-store with pub/sub.
  //
  // Why this exists:
  //   The ApprovalInline component was previously creating an EventSource in a
  //   useEffect inside the component. Whenever the user switched conversations,
  //   the MutationObserver below re-mounted the React root (because the bubble
  //   target changes), which unmounted + remounted ApprovalInline and spawned
  //   a fresh EventSource every time. Chromium's per-host connection limit
  //   (6 for haish://app) then filled up after a handful of switches and
  //   every subsequent fetch — including the conversation-detail GET — sat
  //   in the connection queue forever. End result: ~5 switches and the app
  //   appeared "stuck".
  //
  //   By owning the EventSource at module scope and exposing a tiny pub/sub
  //   surface, React mounts/unmounts of the visual component no longer touch
  //   the SSE connection.
  const approvalStore = (() => {
    let pending = [];
    const listeners = new Set();
    let es = null;
    let initialFetchInflight = null;

    function notify() {
      const snapshot = pending.slice();
      for (const fn of listeners) {
        try { fn(snapshot); } catch (_) {}
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
        let payload; try { payload = JSON.parse(ev.data); } catch (_) { return; }
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
      initialFetchInflight = fetchInitialState().then((items) => {
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
      }).catch((err) => {
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
        try { fn(pending.slice()); } catch (_) {}
        return () => { listeners.delete(fn); };
      },
      remove(requestId) {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== requestId);
        if (pending.length !== before) notify();
      },
    };
  })();

  function isBrowserRuntimeRequest(request) {
    return request?.type === 'browser_runtime_install_required' || request?.action === 'install_browser_runtime';
  }

  function browserRuntimeSummary(request) {
    const dependency = request?.diagnostic?.dependency || request?.error?.diagnostic?.dependency || 'browser runtime';
    if (String(dependency).includes('chromium')) return 'Browser runtime is missing. Install it to continue.';
    return 'Browser runtime dependency is missing. Install it to continue.';
  }

  function requestPreview(request) {
    if (isBrowserRuntimeRequest(request)) return browserRuntimeSummary(request);
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

  function ApprovalCard({ request, busy, onDecide, collapsed, onToggleCollapsed }) {
    const browserRuntime = isBrowserRuntimeRequest(request);
    const busyDecision = busy === true ? 'working' : String(busy || '');
    const isBusy = Boolean(busyDecision);
    const showAlways = request.allow_always !== false;
    const riskText = RISK_TEXT[request.risk_code] || request.risk_code || 'Unclassified risk';
    const title = browserRuntime ? 'Browser Runtime Required' : 'Approval Required';
    const preview = requestPreview(request);
    const installs = Array.isArray(request.remediation?.installs) ? request.remediation.installs.join(', ') : '';
    const busyText = browserRuntime
      ? (busyDecision === 'deny'
        ? 'Declining browser runtime installation...'
        : 'Installing browser runtime...')
      : (busyDecision === 'deny'
        ? 'Denying request...'
        : busyDecision === 'allow_always'
          ? 'Approving and saving rule...'
          : busyDecision === 'allow_once'
            ? 'Approving this request...'
            : 'Resolving approval...');

    return (
      <div className="haish-approval-card" data-collapsed={collapsed ? '1' : '0'} data-busy={isBusy ? '1' : '0'}>
        <button
          type="button"
          className="haish-approval-header"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          <span className={`haish-approval-status ${isBusy ? 'is-busy' : ''}`} aria-hidden="true" />
          <span className="haish-approval-icon" aria-hidden="true" />
          <span className="haish-approval-title">{title}</span>
          {collapsed ? (
            <span className="haish-approval-collapsed-preview" title={preview}>
              {preview.slice(0, 80)}
            </span>
          ) : null}
          <span className="haish-approval-tool-badge">{request.tool_name}</span>
          <svg className={`haish-approval-chevron ${collapsed ? '' : 'is-open'}`} viewBox="0 0 12 12" aria-hidden="true">
            {collapsed ? (
              <path d="M4.25 2.5L7.75 6L4.25 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M2.5 4.25L6 7.75L9.5 4.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        {!collapsed ? (
          <div className="haish-approval-body">
            {browserRuntime ? (
              <div className="haish-approval-intent">
                {browserRuntimeSummary(request)}
              </div>
            ) : request.intent_summary ? (
              <div className="haish-approval-intent">{request.intent_summary}</div>
            ) : null}

            <div className="haish-approval-cmd-label">
              <span>{browserRuntime ? 'Runtime action' : 'Command (runs in terminal)'}</span>
            </div>
            <pre className="haish-approval-cmd-pre">
              {browserRuntime ? 'install_browser_runtime' : (request.raw_command || '(empty)')}
            </pre>

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
                  <button
                    type="button"
                    className="haish-approval-btn haish-approval-btn-deny"
                    onClick={() => onDecide('deny')}
                    autoFocus
                  >
                    Deny
                  </button>
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
                        <button
                          type="button"
                          className="haish-approval-btn haish-approval-btn-always"
                          onClick={() => onDecide('allow_always')}
                          title={`Approve and add ${request.suggested_pattern} to this project's permanent allowlist`}
                        >
                          Approve and Remember
                        </button>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function ApprovalInline() {
    const [pending, setPending] = useState([]);
    const [busy, setBusy] = useState({});
    const [error, setError] = useState('');
    const [collapsedRids, setCollapsedRids] = useState({});

    // Subscribe to the singleton approval store. The store owns the
    // EventSource; this component just renders whatever it emits. No new
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

    if (!pending.length) return null;

    const current = pending[0];
    const rest = pending.length - 1;

    return (
      <div className="haish-approval-slot">
        {error ? (
          <div className="haish-approval-error">{error}</div>
        ) : null}
        <ApprovalCard
          request={current}
          busy={!!busy[current.request_id]}
          collapsed={!!collapsedRids[current.request_id]}
          onToggleCollapsed={() => toggleCollapsed(current.request_id)}
          onDecide={(decision) => handleDecide(current, decision)}
        />
        {rest > 0 ? (
          <div className="haish-approval-queue">{rest} approval request{rest === 1 ? '' : 's'} queued</div>
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

  // ------------------- 挂载策略 -------------------
  // 优先插到最新 assistant timeline 的最后一个 Shell 工具调用之后、活动提示之前。
  // - 这样审批请求和触发它的命令相邻。
  // - MutationObserver 会在 React 更新后重新校正 host 位置。
  function findMountTarget() {
    const rows = document.querySelectorAll('.chat-message-row.agent');
    if (!rows.length) return null;
    const lastAgent = rows[rows.length - 1];
    const bubble = lastAgent.querySelector('.chat-bubble');
    if (!bubble) return null;

    const timeline = bubble.querySelector('.chat-timeline.streaming') || bubble.querySelector('.chat-timeline');
    if (timeline) {
      const shellTools = timeline.querySelectorAll(':scope > .chat-timeline-tool.mode-terminal');
      const lastShellTool = shellTools[shellTools.length - 1] || null;
      if (lastShellTool) {
        const afterShell = lastShellTool.nextSibling;
        return {
          parent: timeline,
          before: afterShell && afterShell.id === 'approval-overlay-root' ? afterShell.nextSibling : afterShell,
        };
      }
      const activity = timeline.querySelector(':scope > .chat-timeline-activity');
      return { parent: timeline, before: activity || null };
    }

    return {
      parent: bubble,
      before: bubble.querySelector('.chat-bubble-text') || null,
    };
  }

  function placeHost(parent, host, before) {
    if (!parent || !host) return;
    const reference = before && before.parentElement === parent && before !== host ? before : null;
    if (host.parentElement !== parent || host.nextSibling !== reference) {
      parent.insertBefore(host, reference);
    }
  }

  function mount() {
    ensureStyles();
    const mountTarget = findMountTarget();
    if (!mountTarget) {
      // 还没有 agent 气泡 — 把已挂载的 host（如有）从老位置摘掉
      const stale = document.getElementById('approval-overlay-root');
      if (stale) {
        try { stale._haishRoot?.unmount(); } catch (_) {}
        stale.remove();
      }
      return;
    }
    const { parent, before } = mountTarget;
    let host = document.getElementById('approval-overlay-root');
    if (host && host.parentElement !== parent) {
      try { host._haishRoot?.unmount(); } catch (_) {}
      host.remove();
      host = null;
    }
    if (!host) {
      host = document.createElement('div');
      host.id = 'approval-overlay-root';
      host.style.width = '100%';
    }
    placeHost(parent, host, before);
    if (!host._haishRoot) {
      host._haishRoot = ReactDOM.createRoot(host);
      host._haishRoot.render(<ApprovalInline />);
    }
  }

  function observeAndMount() {
    mount();
    const observer = new MutationObserver(() => {
      const target = findMountTarget();
      const host = document.getElementById('approval-overlay-root');
      if (!target) {
        // 没有 agent 气泡：交给 mount() 决定是否摘除 host
        if (host) mount();
        return;
      }
      const reference = target.before && target.before.parentElement === target.parent && target.before !== host
        ? target.before
        : null;
      if (!host || host.parentElement !== target.parent || host.nextSibling !== reference) {
        mount();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeAndMount, { once: true });
  } else {
    observeAndMount();
  }

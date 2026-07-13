// @haish-esm
import React from 'react';
import { CHAR_DEFS } from '../Sprites.jsx';
import { PortalTooltip } from './PortalTooltip.jsx';
import { fmtAgo } from './Format.jsx';

import {
  normalizeTaskStatus,
} from '../lib/task-runtime.js';
import {
  getTaskPillMeta,
  usePanelWidth,
} from './TaskRecords.jsx';
export function PanelIcon({ name }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'folder') return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
  if (name === 'chevron') return <svg {...common}><polyline points="9 18 15 12 9 6"/></svg>;
  if (name === 'plus') return <svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  if (name === 'edit') return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
  if (name === 'trash') return <svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
  if (name === 'remove') return <svg {...common}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  return null;
}

export function ConversationAction({ label, icon, onClick, disabled = false, tooltipPosition = 'above' }) {
  return (
    <PortalTooltip text={label} position={tooltipPosition}>
      <button
        type="button"
        className="conversation-icon-btn"
        aria-label={label}
        onClick={(event) => { event.stopPropagation(); onClick?.(); }}
        disabled={disabled}
      >
        <span className={`ico ico-${icon}`} aria-hidden="true" />
      </button>
    </PortalTooltip>
  );
}

export function StopCancelIcon() {
  return (
    <svg className="stop-cancel-svg" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="#ffa20a" />
      <rect x="6" y="6" width="6" height="6" rx="1.5" fill="#fffdf8" />
    </svg>
  );
}

export function TaskStatusIcon({ statusClass }) {
  if (statusClass === 'done') {
    return <span className="conversation-task-status-icon done"><span className="ico ico-check-success" aria-hidden="true" /></span>;
  }
  if (statusClass === 'failed') {
    return <span className="conversation-task-status-icon failed"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  if (statusClass === 'cancelled') {
    return <span className="conversation-task-status-icon cancelled"><StopCancelIcon /></span>;
  }
  return <span className="conversation-task-status-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}

export function TaskRecordCompact({ task, now, onOpenReport, onRetry }) {
  const stage = task.stage || 'assigned';
  const status = normalizeTaskStatus(task.status);
  const pill = getTaskPillMeta(status, stage);
  const hasReport = (status === 'done' && !!String(task.answerText || '').trim())
    || (task.executionMode === 'bot' && !!task.workflowRun)
    || ((status === 'failed' || status === 'cancelled') && !!String(task.error || '').trim());
  const canRetry = status === 'failed' || status === 'cancelled';
  return (
    <div className={`conversation-task-card ${pill.className}`}>
      <div className="conversation-task-main">
        <TaskStatusIcon statusClass={pill.className} />
        <div className="conversation-task-copy">
          <PortalTooltip text={task.title || ''} position="above" multiline>
            <div className="conversation-task-title">{task.title || 'Untitled task'}</div>
          </PortalTooltip>
        </div>
        {hasReport && (
          <PortalTooltip text="View report" position="above">
            <button
              type="button"
              className="conversation-report-btn"
              aria-label="View report"
              onClick={(event) => { event.stopPropagation(); onOpenReport?.(task); }}
            >
              <span className="ico ico-report" aria-hidden="true" />
            </button>
          </PortalTooltip>
        )}
        {canRetry && (
          <PortalTooltip text="Run again" position="above">
            <button
              type="button"
              className="conversation-report-btn"
              aria-label="Run task again"
              onClick={(event) => { event.stopPropagation(); onRetry?.(task); }}
            >
              <span aria-hidden="true">↻</span>
            </button>
          </PortalTooltip>
        )}
      </div>
    </div>
  );
}

export function ConversationDialog({ dialog, onCancel }) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    setValue(dialog?.value || '');
  }, [dialog]);
  if (!dialog) return null;
  const isRename = dialog.kind === 'rename';
  const trimmed = value.trim();
  const confirmDisabled = isRename && !trimmed;

  function confirm() {
    if (confirmDisabled) return;
    dialog.onConfirm?.(isRename ? trimmed : undefined);
    onCancel?.();
  }

  return (
    <div className="conversation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className={`conversation-dialog ${dialog.danger ? 'danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="conversation-dialog-title" id="conversation-dialog-title">{dialog.title}</div>
        {dialog.message ? <div className="conversation-dialog-message">{dialog.message}</div> : null}
        {isRename ? (
          <input
            className="conversation-dialog-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
              if (event.key === 'Escape') onCancel?.();
            }}
            autoFocus
          />
        ) : null}
        <div className="conversation-dialog-actions">
          <button type="button" className="conversation-dialog-btn secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="conversation-dialog-btn primary" onClick={confirm} disabled={confirmDisabled}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function conversationHasRunningTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => {
    const status = String(task?.status || '').toLowerCase();
    if (status !== 'running' && status !== 'queued') return false;
    if (task?.completedAt || task?.completed_at) return false;
    const answer = task?.answerText ?? task?.answer_text;
    return !(typeof answer === 'string' && answer.trim());
  });
}

export function conversationLatestTerminalStatus(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const status = String(tasks[index]?.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'success') return 'done';
    if (status === 'failed' || status === 'error') return 'failed';
    if (status === 'cancelled' || status === 'canceled' || status === 'aborted') return 'cancelled';
  }
  return '';
}

export function collectConversationRunningStates(workspaceState) {
  const states = new Map();
  (workspaceState?.projects || []).forEach((project) => {
    (project?.conversations || []).forEach((conversation) => {
      if (!conversation?.id) return;
      states.set(conversation.id, conversationHasRunningTask(conversation));
    });
  });
  return states;
}

export function ConversationNode({
  project,
  conversation,
  active,
  nodeRef,
  terminalStatus = '',
  now,
  taskPreviewLimit = 5,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onOpenTaskReport,
  onRetryTask,
}) {
  const tasks = conversation.tasks || [];
  const visibleLimit = Math.max(1, Number(taskPreviewLimit) || 5);
  const visibleTasks = conversation.tasksExpanded ? tasks.slice().reverse() : tasks.slice(-visibleLimit).reverse();
  const hiddenCount = Math.max(0, tasks.length - visibleLimit);
  const runningTask = conversationHasRunningTask(conversation);
  const showTaskList = conversation.expanded && tasks.length > 0;

  return (
    <div className={`conversation-node ${active ? 'active' : ''}`} ref={nodeRef}>
      <div
        role="button"
        tabIndex={0}
        className="conversation-row"
        onClick={() => onSelectConversation(project.id, conversation.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectConversation(project.id, conversation.id); }}
      >
        <button
          type="button"
          className="conversation-session-toggle"
          aria-label={conversation.expanded ? 'Collapse conversation' : 'Expand conversation'}
          aria-expanded={conversation.expanded}
          onClick={(event) => { event.stopPropagation(); onToggleConversation(project.id, conversation.id); }}
        >
          <span
            className={`ico ${runningTask ? 'ico-loading' : (conversation.expanded ? 'ico-comment-alt-dots' : 'ico-mobile-message')}`}
            aria-hidden="true"
          />
        </button>
        <PortalTooltip text={conversation.name || ''} position="above">
          <span className="conversation-name">{conversation.name}</span>
        </PortalTooltip>
        {terminalStatus && !active ? (
          <span className={`conversation-terminal-notice chat-timeline-status status-${terminalStatus}`} aria-hidden="true" />
        ) : null}
        <span className="conversation-actions">
          <ConversationAction label="Rename conversation" icon="pen-field" onClick={() => onRequestRenameConversation(project, conversation)} />
          <ConversationAction label="Delete conversation" icon="trash" onClick={() => onRequestDeleteConversation(project, conversation)} />
        </span>
      </div>

      {showTaskList && (
        <div className="conversation-task-list">
          {visibleTasks.map((task) => <TaskRecordCompact key={task.taskId || task.id} task={task} now={now} onOpenReport={onOpenTaskReport} onRetry={onRetryTask} />)}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="conversation-show-more"
              onClick={() => onToggleConversationTasks(project.id, conversation.id)}
            >
              {conversation.tasksExpanded ? 'Show less' : `Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function useConversationOrderAnimation(conversations) {
  const nodesRef = React.useRef(new Map());
  const previousRectsRef = React.useRef(new Map());
  const orderKey = (Array.isArray(conversations) ? conversations : [])
    .map((conversation) => conversation.id)
    .join('|');

  const registerNode = React.useCallback((id, node) => {
    if (!id) return;
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  React.useLayoutEffect(() => {
    const nextRects = new Map();
    nodesRef.current.forEach((node, id) => {
      nextRects.set(id, node.getBoundingClientRect());
    });

    nextRects.forEach((nextRect, id) => {
      const node = nodesRef.current.get(id);
      const previousRect = previousRectsRef.current.get(id);
      if (!node || !previousRect) return;
      const dx = previousRect.left - nextRect.left;
      const dy = previousRect.top - nextRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.willChange = 'transform';

      requestAnimationFrame(() => {
        node.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        node.style.transform = 'translate(0, 0)';
      });

      const cleanup = (event) => {
        if (event && (event.target !== node || event.propertyName !== 'transform')) return;
        node.style.transition = '';
        node.style.transform = '';
        node.style.willChange = '';
        node.removeEventListener('transitionend', cleanup);
      };
      node.addEventListener('transitionend', cleanup);
      window.setTimeout(cleanup, 360);
    });

    previousRectsRef.current = nextRects;
  }, [orderKey]);

  return registerNode;
}

export function ProjectNode({
  project,
  workspaceState,
  now,
  terminalNotices,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onAddConversation,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onOpenTaskReport,
  onRetryTask,
  taskPreviewLimit = 5,
}) {
  const isActiveProject = workspaceState.activeProjectId === project.id;
  const registerConversationNode = useConversationOrderAnimation(project.conversations);

  return (
    <div className={`project-node ${isActiveProject ? 'active' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        className="project-row"
        onClick={() => onSelectProject(project.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectProject(project.id); }}
      >
        <button
          type="button"
          className="project-icon-toggle"
          aria-label={project.expanded ? 'Collapse project' : 'Expand project'}
          aria-expanded={project.expanded}
          onClick={(event) => { event.stopPropagation(); onToggleProject(project.id); }}
        >
          <span className={`ico ${project.expanded ? 'ico-folder-open' : 'ico-folder'}`} aria-hidden="true" />
        </button>
        <PortalTooltip text={project.workspacePath || project.name || ''} position="below" multiline>
          <span className="project-name">{project.name}</span>
        </PortalTooltip>
        <span className="conversation-actions">
          <ConversationAction
            label="New Conversation"
            icon="multiple"
            tooltipPosition="below"
            onClick={() => {
              if (!project.expanded) onToggleProject(project.id);
              onAddConversation(project.id);
            }}
          />
          {project.removable && <ConversationAction label="Remove project" icon="trash" tooltipPosition="below" onClick={() => onRemoveProject(project)} />}
        </span>
      </div>

      {project.expanded && (
        <div className="project-conversations">
          {project.conversations.map((conversation) => (
            <ConversationNode
              key={conversation.id}
              project={project}
              conversation={conversation}
              active={isActiveProject && workspaceState.activeConversationId === conversation.id}
              nodeRef={(node) => registerConversationNode(conversation.id, node)}
              terminalStatus={terminalNotices?.[conversation.id] || ''}
              now={now}
              taskPreviewLimit={taskPreviewLimit}
              onSelectConversation={onSelectConversation}
              onToggleConversation={onToggleConversation}
              onToggleConversationTasks={onToggleConversationTasks}
              onRequestDeleteConversation={onRequestDeleteConversation}
              onRequestRenameConversation={onRequestRenameConversation}
              onOpenTaskReport={onOpenTaskReport}
              onRetryTask={onRetryTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getDesktopUpdateApi() {
  return typeof window !== 'undefined' ? window.haish : null;
}

function updateMenuLabel(state) {
  if (!state) return 'Check for updates';
  switch (state.status) {
    case 'checking':
      return 'Checking…';
    case 'available':
      return state.availableVersion
        ? `Update to v${state.availableVersion}`
        : 'Update available';
    case 'downloading': {
      const pct = Number.isFinite(state.progressPercent)
        ? Math.floor(state.progressPercent)
        : 0;
      return `Updating… ${pct}%`;
    }
    case 'downloaded':
      return state.availableVersion
        ? `Installing v${state.availableVersion}…`
        : 'Installing…';
    case 'not-available':
      return state.currentVersion ? `Up to date · v${state.currentVersion}` : 'Up to date';
    case 'unsupported':
      return 'Updates unavailable';
    case 'error':
      return 'Update failed';
    default:
      return 'Check for updates';
  }
}

function updateTooltipText(state) {
  if (!state) return 'Check for updates';
  switch (state.status) {
    case 'unsupported':
      return 'Only in installed builds';
    case 'not-available':
      return state.currentVersion ? `You're on v${state.currentVersion}` : "You're up to date";
    case 'available':
      return state.availableVersion
        ? `Click to download and install v${state.availableVersion}`
        : 'Click to download and install update';
    case 'downloaded':
      return state.availableVersion
        ? `Installing v${state.availableVersion} and restarting…`
        : 'Installing update and restarting…';
    case 'error':
      return state.message || 'Update failed';
    case 'checking':
      return 'Checking for updates';
    case 'downloading':
      return 'Downloading and installing update';
    default:
      return state.message || 'Check for updates';
  }
}

function notifyUpdateState(onToast, state) {
  if (!onToast || !state) return;
  switch (state.status) {
    case 'not-available':
      onToast('success', state.currentVersion ? `Up to date · v${state.currentVersion}` : 'Up to date');
      break;
    case 'available':
      // One-shot apply path continues into download; avoid noisy intermediate toasts.
      break;
    case 'downloaded':
      onToast(
        'info',
        state.availableVersion
          ? `Installing v${state.availableVersion}…`
          : 'Installing update…',
      );
      break;
    case 'unsupported':
      onToast('info', 'Only in installed builds');
      break;
    case 'error':
      onToast('error', state.message || 'Update failed');
      break;
    default:
      break;
  }
}

export function UserSessionFooter({ authUser, onLogout, onToast }) {
  const [open, setOpen] = React.useState(false);
  const [updateState, setUpdateState] = React.useState(null);
  const [updateBusy, setUpdateBusy] = React.useState(false);
  const wrapRef = React.useRef(null);
  const displayName = authUser?.display_name || authUser?.username || 'User';
  const email = authUser?.email || '';
  const desktop = getDesktopUpdateApi();

  React.useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (!desktop?.getAppUpdateState) return undefined;
    let cancelled = false;
    desktop.getAppUpdateState().then((state) => {
      if (!cancelled) setUpdateState(state);
    }).catch(() => undefined);
    const unsubscribe = desktop.onAppUpdateStateChange
      ? desktop.onAppUpdateStateChange((state) => {
        if (!cancelled) setUpdateState(state);
      })
      : null;
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [desktop]);

  const handleUpdateAction = async () => {
    if (!desktop || updateBusy) return;
    setUpdateBusy(true);
    try {
      // Preferred path: one click checks, downloads, and restarts into the new build.
      if (desktop.applyLatestAppUpdate) {
        const next = await desktop.applyLatestAppUpdate();
        setUpdateState(next);
        notifyUpdateState(onToast, next);
        return;
      }

      // Fallback for older preload bridges that only expose stepwise APIs.
      const status = updateState?.status;
      if (status === 'downloaded' && desktop.installAppUpdate) {
        await desktop.installAppUpdate();
        return;
      }
      if (status === 'available' && desktop.downloadAppUpdate) {
        const downloaded = await desktop.downloadAppUpdate();
        setUpdateState(downloaded);
        if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) {
          notifyUpdateState(onToast, downloaded);
          await desktop.installAppUpdate();
          return;
        }
        notifyUpdateState(onToast, downloaded);
        return;
      }
      if (desktop.checkForAppUpdates) {
        const checked = await desktop.checkForAppUpdates();
        setUpdateState(checked);
        if (checked?.status === 'available' && desktop.downloadAppUpdate) {
          const downloaded = await desktop.downloadAppUpdate();
          setUpdateState(downloaded);
          if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) {
            notifyUpdateState(onToast, downloaded);
            await desktop.installAppUpdate();
            return;
          }
          notifyUpdateState(onToast, downloaded);
          return;
        }
        notifyUpdateState(onToast, checked);
      }
    } catch (error) {
      const message = error?.message || String(error);
      const next = {
        status: 'error',
        currentVersion: updateState?.currentVersion || '',
        canInstall: false,
        isPackaged: updateState?.isPackaged ?? false,
        message,
      };
      setUpdateState(next);
      notifyUpdateState(onToast, next);
    } finally {
      setUpdateBusy(false);
    }
  };

  const updateDisabled = updateBusy
    || updateState?.status === 'checking'
    || updateState?.status === 'downloading'
    || updateState?.status === 'unsupported'
    || updateState?.status === 'not-available'
    || !(desktop?.applyLatestAppUpdate || desktop?.checkForAppUpdates);
  const updateIconLoading = updateBusy
    || updateState?.status === 'checking'
    || updateState?.status === 'downloading'
    || updateState?.status === 'downloaded';

  return (
    <div className={`user-session-footer${open ? ' open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="user-session-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="user-avatar" aria-hidden="true">
          <img src="assets/ui/avatar_default.png" alt="" draggable={false} />
        </span>
        <span className="user-meta">
          <span className="user-name">{displayName}</span>
          {email ? <span className="user-email">{email}</span> : null}
        </span>
        <svg className={`user-chevron${open ? ' rot' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="user-session-menu" role="menu">
          {/*
            Wrap the button so hover still works when it is disabled.
            Disabled buttons do not receive pointer events, so PortalTooltip
            must attach to a non-disabled wrapper.
          */}
          <PortalTooltip text={updateTooltipText(updateState)} position="above">
            <div className="user-session-menu-tooltip-target">
              <button
                type="button"
                className={`user-session-menu-item${updateState?.status === 'error' ? ' is-error' : ''}${updateState?.status === 'downloaded' ? ' is-ready' : ''}${updateState?.status === 'unsupported' || updateState?.status === 'not-available' ? ' is-muted' : ''}${updateIconLoading ? ' is-loading' : ''}`}
                role="menuitem"
                disabled={updateDisabled}
                aria-label={updateTooltipText(updateState)}
                onClick={() => { handleUpdateAction(); }}
              >
                <svg
                  className={`update-icon${updateIconLoading ? ' is-loading' : ''}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                <span className="user-session-menu-label">
                  <span>{updateMenuLabel(updateState)}</span>
                </span>
              </button>
            </div>
          </PortalTooltip>
          <button
            type="button"
            className="user-session-signout"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout && onLogout(); }}
          >
            <span className="logout-icon" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ConversationsPanel({
  workspaceState,
  now,
  extensionStyle,
  onAddProject,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onAddConversation,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onDeleteConversation,
  onRenameConversation,
  onOpenTaskReport,
  onRetryTask,
  taskPreviewLimit = 5,
  authUser,
  onLogout,
  onToast,
}) {
  const [panelRef, panelWidth] = usePanelWidth();
  const [dialog, setDialog] = React.useState(null);
  const [terminalNotices, setTerminalNotices] = React.useState({});
  const previousRunningRef = React.useRef(new Map());
  // Conversations the user was actively viewing while a task was running.
  // Their completion was already seen, so they must never produce a
  // lingering notice — even after the user switches to another conversation.
  const seenWhileRunningRef = React.useRef(new Set());
  const activeProjectId = workspaceState?.activeProjectId;
  const activeConversationId = workspaceState?.activeConversationId;

  React.useEffect(() => {
    const nextRunning = collectConversationRunningStates(workspaceState);
    // Remember any conversation the user is actively viewing while its
    // task is still running.
    (workspaceState?.projects || []).forEach((project) => {
      (project?.conversations || []).forEach((conversation) => {
        if (!conversation?.id) return;
        if (
          project.id === activeProjectId &&
          conversation.id === activeConversationId &&
          nextRunning.get(conversation.id)
        ) {
          seenWhileRunningRef.current.add(conversation.id);
        }
      });
    });
    setTerminalNotices((current) => {
      let changed = false;
      const next = { ...current };
      (workspaceState?.projects || []).forEach((project) => {
        (project?.conversations || []).forEach((conversation) => {
          if (!conversation?.id) return;
          const wasRunning = previousRunningRef.current.get(conversation.id) === true;
          const isRunning = nextRunning.get(conversation.id) === true;
          if (!wasRunning || isRunning) return;
          // The user was viewing this conversation while its task was
          // running, so the completion was already seen — skip the
          // notice and forget the "seen" marker.
          if (seenWhileRunningRef.current.has(conversation.id)) {
            seenWhileRunningRef.current.delete(conversation.id);
            return;
          }
          const status = conversationLatestTerminalStatus(conversation);
          if (!status || next[conversation.id] === status) return;
          next[conversation.id] = status;
          changed = true;
        });
      });
      return changed ? next : current;
    });
    // Prune "seen" markers for conversations that are gone or no longer
    // running, so the set cannot grow without bound.
    const liveRunningIds = new Set();
    (workspaceState?.projects || []).forEach((project) => {
      (project?.conversations || []).forEach((conversation) => {
        if (conversation?.id && nextRunning.get(conversation.id)) {
          liveRunningIds.add(conversation.id);
        }
      });
    });
    seenWhileRunningRef.current = new Set(
      [...seenWhileRunningRef.current].filter((id) => liveRunningIds.has(id))
    );
    previousRunningRef.current = nextRunning;
  }, [workspaceState, activeProjectId, activeConversationId]);

  // The terminal notice is one-shot: the moment the user opens the
  // conversation (or is already viewing it when the task finishes), the
  // completion indicator should disappear immediately.
  React.useEffect(() => {
    if (!activeConversationId) return;
    setTerminalNotices((current) => {
      if (!current[activeConversationId]) return current;
      const next = { ...current };
      delete next[activeConversationId];
      return next;
    });
  }, [activeConversationId, activeProjectId]);

  const selectConversationAndClearNotice = React.useCallback((projectId, conversationId) => {
    if (conversationId) {
      setTerminalNotices((current) => {
        if (!current[conversationId]) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    }
    onSelectConversation(projectId, conversationId);  }, [onSelectConversation]);

  function requestRenameConversation(project, conversation) {
    setDialog({
      kind: 'rename',
      title: 'Rename conversation',
      value: conversation.name || 'Default Session',
      confirmLabel: 'Rename',
      onConfirm: (nextName) => onRenameConversation(project.id, conversation.id, nextName),
    });
  }

  function requestDeleteConversation(project, conversation) {
    setDialog({
      kind: 'delete',
      title: 'Delete conversation',
      message: `Delete "${conversation.name || 'this conversation'}" and all task records under it?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => onDeleteConversation(project.id, conversation.id),
    });
  }

  function requestRemoveProject(project) {
    setDialog({
      kind: 'delete-project',
      title: 'Remove project',
      message: `Remove "${project.name || 'this project'}" from the workspace list? Local files will not be deleted.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => onRemoveProject(project.id),
    });
  }

  return (
    <div className="side-panel left conversations-panel" ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="title">Conversation</div>
        <PortalTooltip text="Add Project" position="below">
          <button
            type="button"
            className="conversation-head-action"
            onClick={onAddProject}
            aria-label="Add project"
          >
            <span className="ico ico-folder-plus-circle" aria-hidden="true" />
          </button>
        </PortalTooltip>
      </div>
      <div className="side-panel-body conversations-body">
        {workspaceState.projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            workspaceState={workspaceState}
            now={now}
            terminalNotices={terminalNotices}
            taskPreviewLimit={taskPreviewLimit}
            onSelectProject={onSelectProject}
            onToggleProject={onToggleProject}
            onRemoveProject={requestRemoveProject}
            onAddConversation={onAddConversation}
            onSelectConversation={selectConversationAndClearNotice}
            onToggleConversation={onToggleConversation}
            onToggleConversationTasks={onToggleConversationTasks}
            onRequestDeleteConversation={requestDeleteConversation}
            onRequestRenameConversation={requestRenameConversation}
            onOpenTaskReport={onOpenTaskReport}
            onRetryTask={onRetryTask}
          />
        ))}
      </div>
      {authUser ? <UserSessionFooter authUser={authUser} onLogout={onLogout} onToast={onToast} /> : null}
      <ConversationDialog dialog={dialog} onCancel={() => setDialog(null)} />
    </div>
  );
}

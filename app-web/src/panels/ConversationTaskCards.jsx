// @haish-esm
import React from 'react';
import { PortalTooltip, closeAllPortalTooltips } from './PortalTooltip.jsx';
import { normalizeTaskStatus } from '../lib/task-runtime.js';
import { getTaskPillMeta } from './TaskRecords.jsx';
import { TaskStatusIcon } from './ConversationIcons.jsx';
import { workflowTaskDisplayStatus } from './conversation-status.js';

export function TaskRecordCompact({
  task,
  active = false,
  terminalNotice = '',
  onSelect,
  onOpenReport,
  onRetry,
  showStatusIcon = true,
  actions = null,
}) {
  const stage = task.stage || 'assigned';
  const status = normalizeTaskStatus(workflowTaskDisplayStatus(task));
  const pill = getTaskPillMeta(status, stage);
  const hasReport = (status === 'done' && !!String(task.answerText || '').trim())
    || (task.executionMode === 'bot' && !!task.workflowRun)
    || ((status === 'failed' || status === 'cancelled') && !!String(task.error || '').trim());
  const canRetry = status === 'failed' || status === 'cancelled';
  return (
    <div
      className={`conversation-task-card ${pill.className}${active ? ' active' : ''}${terminalNotice ? ' has-terminal-notice' : ''}${onSelect ? ' selectable' : ''}${actions ? ' has-actions' : ''}`}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(task)}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) onSelect(task);
      }}
    >
      <div className="conversation-task-main">
        {showStatusIcon ? <TaskStatusIcon statusClass={pill.className} /> : null}
        <div className="conversation-task-copy">
          <PortalTooltip text={task.title || ''} position="above" multiline>
            <div className="conversation-task-title">{task.title || 'Untitled task'}</div>
          </PortalTooltip>
        </div>
        {actions || (hasReport && (
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
        ))}
        {terminalNotice ? (
          <span className={`conversation-task-terminal-notice chat-timeline-status status-${terminalNotice}`} aria-hidden="true" />
        ) : null}
        {!showStatusIcon && ['running', 'queued', 'approval', 'waiting_input'].includes(status)
          ? <TaskStatusIcon statusClass={pill.className} />
          : null}
        {!actions && canRetry && (
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

export function ConversationDialog({ dialog, onCancel, className = '', backdropClassName = '' }) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    setValue(dialog?.value || '');
  }, [dialog]);
  React.useEffect(() => {
    if (dialog) closeAllPortalTooltips();
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
    <div className={`conversation-dialog-backdrop ${backdropClassName}`.trim()} role="presentation" onMouseDown={onCancel}>
      <div
        className={`conversation-dialog ${dialog.danger ? 'danger' : ''} ${className}`.trim()}
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

// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';
import { normalizeTaskStatus } from '../lib/task-runtime.js';
import { getTaskPillMeta } from './TaskRecords.jsx';
import { TaskStatusIcon } from './ConversationIcons.jsx';

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

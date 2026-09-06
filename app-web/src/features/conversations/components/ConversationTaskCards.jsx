import React from 'react';
import { AnimateDialog } from '../../../shared/ui/AnimateDialog.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { PortalTooltip, closeAllPortalTooltips } from '../../../shared/ui/PortalTooltip.jsx';
import { normalizeTaskStatus } from '../../tasks/model/task-runtime.js';
import { getTaskPillMeta } from '../../tasks/model/task-pill.js';
import { TaskStatusIcon } from './ConversationIcons.jsx';
import { workflowTaskDisplayStatus } from '../model/conversation-status.js';

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
              <AppIcon name="retry" size={15} />
            </button>
          </PortalTooltip>
        )}
      </div>
    </div>
  );
}

export function ConversationDialog({ dialog, onCancel }) {
  const [value, setValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const pending = React.useRef(false);
  const inputRef = React.useRef(null);
  const cancelRef = React.useRef(null);
  const openerRef = React.useRef(null);
  const [retained, setRetained] = React.useState(dialog);
  React.useEffect(() => {
    if (!dialog) return;
    setRetained(dialog);
    setValue(dialog?.value || '');
    setError('');
    setBusy(false);
    pending.current = false;
    const frame = requestAnimationFrame(() => {
      if (dialog.kind === 'rename') inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [dialog]);
  React.useEffect(() => {
    if (dialog) closeAllPortalTooltips();
  }, [dialog]);
  const current = dialog || retained;
  if (!current) return null;
  const isRename = current.kind === 'rename';
  const trimmed = value.trim();
  const confirmDisabled = busy || (isRename && !trimmed);

  async function confirm(event) {
    event.preventDefault();
    if (confirmDisabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await current.onConfirm?.(isRename ? trimmed : undefined);
      if (result === false) throw new Error('The operation could not be completed. Please try again.');
      onCancel?.();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <AnimateDialog open={Boolean(dialog)} danger={!isRename} title={current.title} description={current.message}
      busy={busy} onClose={onCancel}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        openerRef.current = document.activeElement;
        if (isRename) { inputRef.current?.focus(); inputRef.current?.select(); }
        else cancelRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (openerRef.current?.isConnected) openerRef.current.focus();
      }}>
      <form onSubmit={confirm}>
        {isRename ? (
          <input
            ref={inputRef}
            className="haish-dialog-input"
            aria-label="Name"
            disabled={busy}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
        ) : null}
        {error ? <p className="haish-dialog-error" role="alert">{error}</p> : null}
        <div className="haish-dialog-actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={confirmDisabled}>
            {busy ? 'Working…' : current.confirmLabel}
          </button>
        </div>
      </form>
    </AnimateDialog>
  );
}

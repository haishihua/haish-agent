// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/error-state.tsx
// Official layout, with scoped CSS and optional/disabled retry.
//
// One failure surface for the whole client: a failed chat turn, a settings error, a
// dialog error and the crash screen all render this component. `variant` only picks the
// density (`inline` sits inside sheets, dialogs and rows); the red card, the alert role
// and the pill retry button stay identical everywhere.
import React from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import './error-state.css';

export function ErrorState({
  title,
  detail,
  retrying,
  onRetry,
  disabled = false,
  variant = 'block',
  retryLabel = 'Retry',
  retryHint,
  className = '',
}) {
  const inline = variant === 'inline';
  const classes = ['aui-error-state', inline ? 'is-inline' : '', className].filter(Boolean).join(' ');
  if (retrying) {
    return (
      <div data-slot="error-state" role="status" className={`${classes} aui-error-retrying`}>
        <RefreshCwIcon size={inline ? 13 : 14} aria-hidden="true" />
        <span>Retrying</span>
      </div>
    );
  }
  // Inline cards are plain status text unless the caller hands in a retry handler; the
  // chat card always keeps the button so the reason a retry is unavailable stays
  // discoverable on hover.
  const showRetry = !inline || Boolean(onRetry);
  const retryTitle = retryHint
    || (!onRetry ? 'Only the latest failed turn can be retried' : disabled ? 'Wait for the current task to finish' : 'Retry');
  return (
    <div data-slot="error-state" role="alert" className={classes}>
      <CircleAlertIcon className="aui-error-icon" size={inline ? 14 : 16} aria-hidden="true" />
      <div className="aui-error-content">
        {title ? <p className="aui-error-title">{title}</p> : null}
        {detail ? <p className="aui-error-detail">{detail}</p> : null}
      </div>
      {showRetry ? (
        <button type="button" onClick={onRetry} disabled={disabled || !onRetry} title={retryTitle}>
          <RefreshCwIcon size={12} aria-hidden="true" />{retryLabel}
        </button>
      ) : null}
    </div>
  );
}

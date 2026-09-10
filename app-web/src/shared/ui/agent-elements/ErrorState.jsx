// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/error-state.tsx
// Official layout, with scoped CSS and optional/disabled retry.
import React from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import './error-state.css';

export function ErrorState({ title, detail, retrying, onRetry, disabled = false }) {
  if (retrying) {
    return <div data-slot="error-state" key="retrying" role="status" className="aui-error-state aui-error-retrying">
      <RefreshCwIcon size={14} aria-hidden="true" />
      <span>Retrying</span>
    </div>;
  }
  return <div data-slot="error-state" key="error" role="alert" className="aui-error-state">
    <CircleAlertIcon className="aui-error-icon" size={16} aria-hidden="true" />
    <div className="aui-error-content">
      <p className="aui-error-title">{title}</p>
      <p className="aui-error-detail">{detail}</p>
    </div>
    <button type="button" onClick={onRetry} disabled={disabled || !onRetry}
      title={!onRetry ? 'Only the latest failed turn can be retried' : disabled ? 'Wait for the current task to finish' : 'Retry'}>
      <RefreshCwIcon size={12} aria-hidden="true" />Retry
    </button>
  </div>;
}

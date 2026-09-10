// Adapted from assistant-ui Elements tool-timeline (MIT); local step renderer.
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ToolPanel, ToolStatus } from './ToolCall.jsx';

export function ToolTimeline({ summary, steps, renderStep, status, open, onOpenChange }) {
  const panelId = React.useId();
  return <div className="aui-tool-timeline">
    <button type="button" className="aui-tool-trigger aui-timeline-trigger" aria-expanded={open}
      aria-controls={open ? panelId : undefined} onClick={() => onOpenChange(!open)}>
      <ChevronRight size={13} className={`aui-tool-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      <span className={`aui-tool-label ${status === 'running' ? 'is-running' : ''}`}>{summary}</span>
      <ToolStatus status={status} />
    </button>
    <ToolPanel open={open} id={panelId}>
      <div className="aui-timeline-steps">{steps.map((step) => <div key={step.id} className="aui-timeline-step">{renderStep(step)}</div>)}</div>
    </ToolPanel>
  </div>;
}

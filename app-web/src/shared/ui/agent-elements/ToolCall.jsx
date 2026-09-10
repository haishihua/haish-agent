// Adapted from assistant-ui Elements tool-call / tool-timeline (MIT).
// https://github.com/assistant-ui/assistant-ui/tree/main/packages/ui/src/components/react/assistant-ui/elements
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, Circle, CircleAlert, LoaderCircle, LockKeyhole, Minus } from 'lucide-react';
import '../../../../styles/tool-elements.css';

const STATUS = {
  done: [Check, 'Completed'], completed: [Check, 'Completed'],
  running: [LoaderCircle, 'Running'], pending: [Circle, 'Pending'],
  failed: [CircleAlert, 'Failed'], error: [CircleAlert, 'Failed'],
  cancelled: [Minus, 'Cancelled'], approval: [LockKeyhole, 'Awaiting approval'],
};

export function ToolStatus({ status = 'pending', label }) {
  const [Icon, description] = STATUS[status] || STATUS.pending;
  return <span className={`aui-tool-status status-${status}`} role="img" aria-label={label || description}>
    <Icon size={13} aria-hidden="true" />
  </span>;
}

export function ToolPanel({ open, id, children, className = '' }) {
  const reducedMotion = useReducedMotion();
  return <AnimatePresence initial={false}>
    {open && <motion.div id={id} className={`aui-tool-panel ${className}`}
      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
      {children}
    </motion.div>}
  </AnimatePresence>;
}

export function ToolCall({ label, query, icon, status, statusLabel, open, onOpenChange, expandable = true, children }) {
  const panelId = React.useId();
  const content = <>
    {expandable ? <ChevronRight size={13} className={`aui-tool-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" /> : <span className="aui-tool-chevron-space" />}
    {icon && <span className="aui-tool-icon" aria-hidden="true">{icon}</span>}
    <span className={`aui-tool-label ${status === 'running' ? 'is-running' : ''}`}>{label}</span>
    {query && <span className="aui-tool-query">{query}</span>}
    <ToolStatus status={status} label={statusLabel} />
  </>;
  return <div className="aui-tool-call">
    {expandable ? <button type="button" className="aui-tool-trigger" aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => onOpenChange(!open)}>{content}</button> : <div className="aui-tool-trigger is-static">{content}</div>}
    <ToolPanel open={open && expandable} id={panelId}>
      <div className="aui-tool-detail">{children}</div>
    </ToolPanel>
  </div>;
}

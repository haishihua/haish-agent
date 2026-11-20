import React from 'react';
import { normalizeTaskStatus } from '../../../core/run-status.js';

export function WorkflowStatusIcon({ status, inline = false }) {
  const state = normalizeTaskStatus(status) || 'unknown';
  return <span className={`workflow-node-state is-${state}${inline ? ' is-inline' : ''}`} aria-label={state}>
    {['done', 'succeeded', 'approved'].includes(state)
      ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : state === 'running' ? <i /> : ['failed', 'rejected'].includes(state) ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg> : <span />}
  </span>;
}

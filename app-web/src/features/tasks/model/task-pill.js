import { normalizeTaskStatus } from './task-runtime.js';

const STAGE_PILL_TEXT = {
  assigned: 'PENDING',
  in_progress: 'IN PROGRESS',
  check: 'REVIEW',
  done: 'COMPLETED',
};

export function getTaskPillMeta(status, stage) {
  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus === 'failed') return { className: 'failed', text: 'FAILED' };
  if (normalizedStatus === 'cancelled') return { className: 'cancelled', text: 'CANCELLED' };
  if (normalizedStatus === 'done') return { className: 'done', text: 'COMPLETED' };
  if (normalizedStatus === 'approval') return { className: 'approval', text: 'AWAITING APPROVAL' };
  if (normalizedStatus === 'waiting_input') return { className: 'waiting_input', text: 'WAITING FOR INPUT' };
  if (normalizedStatus === 'running') {
    return {
      className: stage === 'check' ? 'check' : 'in_progress',
      text: stage === 'check' ? 'REVIEW' : 'IN PROGRESS',
    };
  }
  return {
    className: stage === 'assigned' ? 'pending' : (stage || 'pending'),
    text: STAGE_PILL_TEXT[stage] || 'PENDING',
  };
}

import { isTerminalTaskStatus } from '../../../core/run-status.js';

export const isRuntimeDetailLive = (status) => ['running', 'waiting_input', 'approval'].includes(status);

// Choose only a node with an existing detail surface; never open Pending.
export function runtimeDetailTarget({ status, nodes = [], statuses, currentNodeId, canOpen }) {
  if (isTerminalTaskStatus(status)) {
    return String(nodes.find((node) => node.type === 'output')?.id || '');
  }
  if (!isRuntimeDetailLive(status)) return '';
  const live = (node) => canOpen(node) && isRuntimeDetailLive(statuses.get(String(node.id)));
  const current = nodes.find((node) => String(node.id) === String(currentNodeId));
  return String((current && live(current) ? current : nodes.find(live))?.id || '');
}

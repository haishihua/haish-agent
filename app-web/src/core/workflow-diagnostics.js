// Opt-in, local-only diagnostics. Never log event payloads or error bodies.
const KEY = 'haish.workflowDiagnostics';
const TYPES = new Set(['final_answer', 'workflow_node_finished', 'workflow_node_started', 'resync_required']);

export function traceWorkflow(stage, event, fields = {}) {
  if (!TYPES.has(event?.type)) return;
  try {
    if (globalThis.localStorage?.getItem(KEY) !== '1') return;
    console.info('[workflow-diagnostics]', JSON.stringify({
      stage, at: new Date().toISOString(), type: event.type,
      eventId: event.event_id || event.eventId || null,
      taskId: event.task_id || null,
      nodeId: event.workflow_node_id || event.workflowNodeId || null,
      backendAt: event.created_at || event.timestamp || null,
      ...fields,
    }));
  } catch { /* Diagnostics must not affect execution. */ }
}

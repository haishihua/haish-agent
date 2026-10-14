import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// Every task/event/request below is in-memory; writes and model requests are forbidden.
window.fetch = async (url) => { throw new Error(`Unexpected request: ${url}`); };
let approvalEvent;
window.haish = { onApprovalEvent: (callback) => { approvalEvent = callback; return () => {}; } };
approvalStore.start();
const timestamp = '2026-10-01T00:00:00Z';
const workflow = { workflow_id: 'fixture.terminal', display_name: 'Receipt regression', nodes: [
  { id: 'completed', type: 'llm', label: 'Completed result' },
  { id: 'active', type: 'llm', label: 'Active model' },
  { id: 'approval', type: 'human_approval', label: 'Review' },
  { id: 'unstarted', type: 'tool', label: 'Unstarted', tool_name: 'read_file' },
], edges: [{ from: 'completed', to: 'active' }, { from: 'active', to: 'approval' }, { from: 'approval', to: 'unstarted' }] };
const completed = { status: 'done', success: true, summary: 'KEEP_COMPLETED_RESULT', started_at: timestamp, finished_at: timestamp };
const initial = { taskId: 'task', conversationId: 'owner', status: 'running', workflowSnapshot: workflow,
  workflowRun: { status: 'running', current_node_id: 'active', nodes: { completed, active: { status: 'running' } } },
  eventLog: [
    { type: 'workflow_node_started', workflowNodeId: 'active', nodeInput: 'Check receipt', timestamp },
    { type: 'text_delta', workflowNodeId: 'active', delta: 'partial thought', timestamp },
  ],
};
let setTask;
function Fixture() {
  const [task, update] = React.useState(initial); setTask = update;
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100%', gridColumn: 'auto' }}><WorkflowRuntimePage workflow={workflow} task={task} /></div></AppTooltipProvider>;
}
const root = createRoot(document.getElementById('root')); root.render(<Fixture />);
const errors = [], results = [];
window.addEventListener('error', (event) => errors.push(event.message));
const check = (ok, label) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) throw new Error(label); };
const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
async function waitFor(test) { for (let i = 0; i < 150 && !test(); i++) await tick(); check(test(), 'state reached'); }
const card = (id) => document.querySelector(`.react-flow__node[data-id="${id}"] .workflow-flow-node`);
const panel = () => document.querySelector('.workflow-detail-panel');
async function select(id) { document.querySelector(`.react-flow__node[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); await waitFor(() => panel()?.dataset.nodeId === id); }
function terminalChecks(status) {
  check(document.querySelector(`.workflow-run-status.is-${status}`) && !document.querySelector('.workflow-run-title strong.is-running'), `${status}: title no longer running`);
  check(card('active').classList.contains(`status-${status}`) && !card('active').querySelector('.workflow-node-live-badge'), `${status}: active unfinished node terminated`);
  check(panel().classList.contains(`is-${status}`) && !panel().querySelector('.is-streaming'), `${status}: selected detail stops streaming without node finish receipt`);
  check(card('completed').classList.contains('status-done') && card('unstarted').classList.contains('status-pending'), `${status}: completed and unstarted outcomes unchanged`);
}
(async () => {
  await waitFor(() => card('active')?.classList.contains('status-running'));
  await select('active'); await waitFor(() => panel()?.querySelector('.is-streaming'));
  setTask((task) => ({ ...task, status: 'failed', serverFinished: true, completedAt: Date.now() }));
  await waitFor(() => panel()?.classList.contains('is-failed')); terminalChecks('failed');
  await select('completed'); check(panel().textContent.includes('KEEP_COMPLETED_RESULT'), 'failure preserves final answer');
  await select('active');
  setTask({ ...initial, status: 'cancelled', serverFinished: true });
  await waitFor(() => panel()?.classList.contains('is-cancelled')); terminalChecks('cancelled');
  setTask({ ...initial, serverFinished: true });
  await waitFor(() => panel()?.classList.contains('is-done')); terminalChecks('done');
  const pending = { ...initial, workflowRun: { ...initial.workflowRun, status: 'waiting_approval', current_node_id: 'approval' }, eventLog: [{ type: 'workflow_node_started', workflowNodeId: 'approval', nodeInput: 'Review completed work', timestamp }] };
  setTask(pending);
  approvalEvent({ type: 'approval_snapshot', state: { pending: [], pending_user_inputs: [], pending_workflow_approvals: [{ request_id: 'request', task_id: 'task', conversation_id: 'owner', workflow_node_id: 'approval', approval_kind: 'workflow_human_approval', title: 'Review', summaryText: 'Review completed work' }] } });
  await waitFor(() => panel()?.dataset.nodeId === 'approval' && panel().querySelector('.haish-approval-actions'));
  check(document.querySelector('.workflow-run-status.is-approval') && card('approval').classList.contains('status-approval'), 'live approval stays waiting and actionable');
  setTask({ ...pending, status: 'failed', serverFinished: true });
  await waitFor(() => panel()?.classList.contains('is-failed'));
  check(!panel().querySelector('.haish-approval-actions') && !panel().querySelector('.is-streaming') && card('approval').classList.contains('status-failed'), 'failed approval ignores stale pending request and is not actionable');
  setTask({ ...pending, status: 'cancelled', serverFinished: true });
  await waitFor(() => panel()?.classList.contains('is-cancelled'));
  check(!panel().querySelector('.haish-approval-actions'), 'cancelled approval ignores stale pending request');
  setTask({ ...pending, status: 'failed', serverFinished: true, workflowRun: { ...pending.workflowRun, nodes: { completed, approval: { ...completed, decision: 'approved' } } } });
  await waitFor(() => panel()?.classList.contains('is-approved'));
  check(card('approval').classList.contains('status-approved') && !panel().querySelector('.haish-approval-actions'), 'completed approval decision preserved on task failure');
  check(errors.length === 0, 'no runtime errors');
})().catch((error) => results.push(`FAIL ${error.stack}`)).finally(() => {
  root.unmount(); approvalStore.dispose();
  const report = document.getElementById('checks'); report.textContent = results.join('\n');
  report.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});

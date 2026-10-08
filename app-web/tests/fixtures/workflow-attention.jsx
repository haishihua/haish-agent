import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import '../../styles.css';

const errors = [], decisions = [], listeners = new Set();
window.addEventListener('error', (event) => errors.push(event.message));
window.haish = {
  onApprovalEvent: (handler) => { listeners.add(handler); return () => listeners.delete(handler); },
  resolveApproval: async (...args) => { decisions.push(args); },
};
const emit = (payload) => flushSync(() => { for (const fn of listeners) fn(payload); });
approvalStore.start();
const workflow = { workflow_id: 'fixture.attention', display_name: 'Goal Loop', nodes: [
  { id: 'start', type: 'start', label: 'Start' },
  { id: 'clarify', type: 'agent', label: 'Clarify' },
  { id: 'approve', type: 'human_approval', label: 'Approve Requirements' },
  { id: 'worker', type: 'agent', label: 'Worker' },
  { id: 'output', type: 'output', label: 'End' },
], edges: [{ from: 'start', to: 'clarify' }, { from: 'clarify', to: 'approve' }, { from: 'approve', to: 'worker' }, { from: 'worker', to: 'output' }] };
const task = { taskId: 'task', conversationId: 'conv', status: 'running', workflowSnapshot: workflow,
  workflowRun: { status: 'running', current_node_id: 'clarify', nodes: {} }, eventLog: [] };
const input = { type: 'input_requested', request_id: 'input-1', task_id: 'task', conversation_id: 'conv', node_id: 'clarify', tool_call_id: 'ask-1', questions: [{ id: 'confirm', question: 'Confirm the requirements?', options: [{ label: 'Yes' }, { label: 'No' }] }] };
const approval = { type: 'approval_requested', approval_kind: 'workflow_human_approval', request_id: 'approval-1', task_id: 'task', conversation_id: 'conv', workflow_node_id: 'approve', title: 'Approve requirements', summaryText: 'Review and approve the requirements.' };
// Existing pending snapshot before mounting: opening a Workflow must recover it.
emit(input);
let api;
function Fixture() {
  const [visible, setVisible] = React.useState(true);
  const [current, setCurrent] = React.useState(task);
  api = { setVisible: (value) => flushSync(() => setVisible(value)), setTask: (value) => flushSync(() => setCurrent(value)) };
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100%', gridColumn: 'auto' }}>{visible ? <WorkflowRuntimePage workflow={workflow} task={current} /> : null}</div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const panel = () => document.querySelector('.workflow-detail-panel');
const tab = () => panel()?.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
const select = async (id) => { document.querySelector(`.react-flow__node[data-id="${id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick(); };
const report = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
(async () => {
  await tick(900);
  check(panel()?.dataset.nodeId === 'clarify' && tab() === 'Run Result', 'Opening Workflow automatically selects pending ask_user node and Run Result');
  check(document.querySelectorAll('.haish-user-input-card').length === 1 && panel()?.textContent.includes('Confirm the requirements?'), 'Snapshot without loaded tool events renders one actionable question form');
  const card = panel().querySelector('.haish-user-input-card').getBoundingClientRect();
  const body = panel().querySelector('.workflow-detail-body').getBoundingClientRect();
  check(card.bottom <= body.bottom + 1 && card.top >= body.top - 1, 'Question is visible in the detail scroll region');
  api.setTask({ ...task, eventLog: [
    { type: 'workflow_node_started', workflowNodeId: 'clarify', timestamp: '2026-10-06T15:00:00Z' },
    { type: 'tool_call_started', workflowNodeId: 'clarify', callId: 'ask-1', toolName: 'ask_user', toolInput: { questions: input.questions }, timestamp: '2026-10-06T15:00:01Z' },
  ] }); await tick();
  check(document.querySelectorAll('.haish-user-input-card').length === 1, 'Hydrating the ask_user timeline replaces the snapshot fallback without duplicate forms');
  document.querySelector('.haish-user-input-option input').click(); await tick();
  [...document.querySelectorAll('.haish-user-input-card button')].find((item) => item.textContent.trim() === 'Submit answers').click(); await tick();
  check(decisions.length === 1 && decisions[0][0] === 'user_input' && decisions[0][1] === 'input-1', 'Auto-opened question submits through the normal confirmation bridge only after a user click');
  emit(input); await tick();
  await select('worker');
  emit({ ...input }); await tick();
  check(panel()?.dataset.nodeId === 'worker', 'Repeated snapshot does not steal manual node selection');
  emit({ type: 'input_resolved', request_id: 'input-1' });
  emit({ ...input, request_id: 'input-2', tool_call_id: 'ask-2' }); await tick();
  check(panel()?.dataset.nodeId === 'clarify' && tab() === 'Run Result', 'New request auto-opens the waiting node even while browsing another node');
  [...panel().querySelectorAll('[role="tab"]')].find((item) => item.textContent === 'Runtime Config').click(); await tick();
  emit({ type: 'input_resolved', request_id: 'input-1' });
  emit({ ...input, request_id: 'input-3', tool_call_id: 'ask-3' });
  emit({ type: 'input_resolved', request_id: 'input-2' }); await tick();
  check(tab() === 'Run Result', 'New question on the same running Agent switches Config to Run Result');
  emit({ type: 'input_resolved', request_id: 'input-3' }); await tick();
  check(!panel().querySelector('.haish-user-input-card'), 'Resolved question is removed rather than reopened from stale waiting state');
  panel().querySelector('.workflow-detail-close').click(); await tick();
  emit(approval); await tick();
  check(panel()?.dataset.nodeId === 'approve' && panel()?.textContent.includes('Review and approve'), 'Approval snapshot opens its node even before node events are hydrated');
  check(panel()?.querySelector('.haish-approval-card button'), 'Approval decision buttons are directly available');
  api.setVisible(false); await tick(); api.setVisible(true); await tick(700);
  check(panel()?.dataset.nodeId === 'approve', 'Returning to Workflow reopens the still pending approval');
  [...panel().querySelectorAll('.haish-approval-card button')].find((item) => item.textContent.trim() === 'Next').click(); await tick();
  check(decisions.length === 2 && decisions[1][0] === 'workflow' && decisions[1][1] === 'approval-1', 'Auto-opened approval submits the existing workflow decision only after user confirmation');
  emit({ type: 'approval_resolved', request_id: 'approval-1' }); await tick();
  panel()?.querySelector('.workflow-detail-close')?.click(); await tick();
  emit({ ...input, conversation_id: 'another-conv' }); await tick();
  check(!panel(), 'Another conversation cannot auto-open this Workflow');
  api.setTask({ ...task, status: 'done' }); emit(input); await tick();
  check(!panel(), 'Finished task ignores old pending snapshots');
  api.setTask(task); await tick();
  check(panel()?.dataset.nodeId === 'clarify', 'Switching back to the live task restores its pending question');
  check(decisions.length === 2 && errors.length === 0, 'Auto-opening never auto-confirms and produces no page errors');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

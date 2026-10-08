import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ProjectNode } from '../../src/features/conversations/components/ProjectNode.jsx';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { createWorkflowTaskSelectionHandler } from '../../src/features/conversations/hooks/createWorkflowTaskSelectionHandler.js';
import { pendingTaskToQuest } from '../../src/features/chat/model/chat-timeline.js';
import { buildTaskRuntimeRecord, runtimeTaskToQuest } from '../../src/features/tasks/model/task-runtime.js';
import { mergeConversationTasks } from '../../src/features/conversations/model/workspace-state.js';
import '../../styles.css';

const errors = [], restored = [], selected = [], notices = [], saved = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.haish = { onApprovalEvent: () => () => {} };
const workflow = { id: 'fixture.replay', display_name: 'Goal Loop', nodes: [
  { id: 'start', type: 'start', label: 'Start' },
  { id: 'clarify', type: 'agent', label: 'Clarify' },
  { id: 'approve_requirements', type: 'human_approval', label: 'Approve Requirements' },
  { id: 'goal_worker', type: 'agent', label: 'Worker' },
  { id: 'output', type: 'output', label: 'End' },
], edges: [
  { from: 'start', to: 'clarify' }, { from: 'clarify', to: 'approve_requirements' },
  { from: 'approve_requirements', to: 'goal_worker' }, { from: 'goal_worker', to: 'output' },
] };
const source = { taskId: 'source', conversationId: 'conv', title: 'Remote desktop', status: 'done', createdAt: 1 };
const pending = { id: 'local-replay', taskId: 'local-replay', conversationId: 'conv', title: source.title,
  sourceTaskId: 'source', rerunFromNodeId: 'approve_requirements', status: 'running', createdAt: 2,
  executionMode: 'bot', workflowSnapshot: workflow,
  workflowRun: { status: 'running', current_node_id: 'approve_requirements', nodes: { clarify: { status: 'done' } } },
};
let pendingRuntime = pending, api;
const ctx = {
  getRuntime: () => ({ taskRuntimeState: { pendingTask: pendingRuntime } }),
  ownerIdRef: { current: 'fixture' }, conversationIdRef: { current: 'conv' },
  setViewedWorkflowTask: (value) => saved.push(value), setTaskCompletionNotices: () => {},
  handleSelectConversation: async (...args) => selected.push(args),
  restoreLatestTaskRuntime: async (id) => restored.push(id),
  removeMissingTask: () => notices.push('removed'), showToast: (...args) => notices.push(args),
};
const select = createWorkflowTaskSelectionHandler(ctx);
function Fixture() {
  const [task, setTask] = React.useState(pending);
  const [rows, setRows] = React.useState(mergeConversationTasks([source, pending], [runtimeTaskToQuest(source), pendingTaskToQuest(pending)]));
  api = { confirm: () => {
    const confirmed = buildTaskRuntimeRecord({ task_id: 'server-replay', conversation_id: 'conv' }, pending);
    confirmed.status = 'running';
    confirmed.workflowRun = { ...pending.workflowRun, current_node_id: 'goal_worker', nodes: { clarify: { status: 'done' }, approve_requirements: { status: 'done', decision: 'approved' }, goal_worker: { status: 'running' } } };
    pendingRuntime = null;
    flushSync(() => { setRows((current) => mergeConversationTasks(current, [runtimeTaskToQuest(source), runtimeTaskToQuest(confirmed)])); setTask(confirmed); });
  } };
  const project = { id: 'project', name: 'Replay fixture', expanded: true, conversations: [{ id: 'conv', tasks: rows }] };
  return <AppTooltipProvider><div style={{ display: 'flex', height: '100%' }}>
    <aside style={{ width: 280, padding: 16 }}><ProjectNode project={project} workspaceState={{ activeProjectId: 'project', activeConversationId: 'conv' }} workflowTaskMode activeTaskId={task.taskId} onSelectProject={() => {}} onToggleProject={() => {}} onSelectTask={select} /></aside>
    <div className="app-workflow-stage" style={{ flex: 1, height: '100%', gridColumn: 'auto' }}><WorkflowRuntimePage workflow={workflow} task={task} /></div>
  </div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
const rows = () => [...document.querySelectorAll('.conversation-task-card')];
(async () => {
  await tick(900);
  check(rows().length === 2, 'Original task and one replay placeholder: no duplicate pending row');
  check(document.querySelector('.react-flow__node[data-id="clarify"]'), 'Replay retains the workflow and upstream context instead of Ready to run');
  rows().find((row) => row.classList.contains('active'))?.click(); await tick();
  check(selected.length === 1 && restored.length === 0 && saved[0] === null, 'Clicking replay before confirmation navigates without querying or persisting the local id');
  api.confirm(); await tick(700);
  check(rows().length === 2, 'Server confirmation replaces the replay placeholder without duplicating the original task');
  rows().find((row) => row.classList.contains('active'))?.click(); await tick();
  check(restored.length === 1 && restored[0] === 'server-replay', 'Confirmed replay row restores only the real server task id');
  document.querySelector('.react-flow__node[data-id="goal_worker"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  check(document.querySelector('.workflow-detail-panel')?.textContent.includes('Run Result'), 'Running Worker details remain available after confirmation');
  check(notices.length === 0 && errors.length === 0, 'No missing-task toast, removal or browser errors');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

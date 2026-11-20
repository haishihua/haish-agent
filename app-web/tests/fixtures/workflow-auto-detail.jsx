import { createQuestExecutor } from '../../src/features/tasks/hooks/task-stream/quest-execution.js';
import { createDeployHandlers } from '../../src/features/tasks/hooks/createDeployHandlers.js';
import { workspaceStateWithTouchedConversation, findConversationById, isDefaultConversationName } from '../../src/features/conversations/model/workspace-state.js';
import { runtimeCurrentTaskFor } from '../../src/features/app/model/shell-derived-state.js';
import { AppToastStack } from '../../src/features/app/components/AppToast.jsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/workflow-runtime.css';
const workflow = { workflow_id: 'fixture.auto-detail', nodes: [
  { id: 'start', type: 'start', label: 'Start' }, { id: 'agent', type: 'agent', label: 'Agent' },
  { id: 'judge', type: 'llm', label: 'Judge' }, { id: 'end', type: 'output', label: 'End' },
], edges: [{ from: 'start', to: 'agent' }, { from: 'agent', to: 'judge' }, { from: 'judge', to: 'end' }] };
function Fixture() {
  const [toasts, setToasts] = React.useState([]);
  React.useEffect(() => {
    if (!new URLSearchParams(location.search).has('submissionCheck')) return;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    void (async () => {
      await sleep(150);
      const previous = { taskId: 'previous', executionMode: 'bot' };
      const state = { activeTaskId: null, taskOrder: ['previous'], tasksById: { previous }, submission: null };
      let runtimeState = state;
      const runtime = { taskRuntimeState: state, activeRunId: null, cancelledRunIds: new Set() };
      const realExecutor = createQuestExecutor({
        ctx: { providerOptions: [{ id: 'fixture-provider', provider: 'custom' }] },
        getRuntime: () => runtime,
        mutateRuntime: (_, fn) => fn(runtime),
        updateTaskRuntimeState: fn => { runtimeState = fn(runtimeState); runtime.taskRuntimeState = runtimeState; },
        chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
        setRuntimeFetchController: value => { runtime.fetchController = value; },
        setRuntimeActiveTaskId: value => { runtime.activeTaskId = value; },
        setRuntimeBusy: value => { runtime.busy = value; },
        streamTargetConvIdRef: { current: null },
        runTaskStream: () => new Promise((resolve, reject) => { finish = () => reject(Object.assign(new Error('Offline creation rejected'), { status: 400 })); }),
      });
      let useRealExecutor = true;
      let finish;
      const handlers = createDeployHandlers({
        getRuntime: () => runtime,
        conversationIdRef: { current: 'fixture-conversation' },
        viewModeRef: { current: 'workflow' },
        workspaceState: { projects: [{ id: 'p', conversations: [{ id: 'fixture-conversation', name: 'Fixture', tasks: [previous] }] }] },
        workflowSettingsDraft: { presets: [workflow], custom: [] },
        normalizeWorkflowSettings: value => value,
        providerOptions: [{ id: 'fixture-provider', provider: 'custom' }],
        defaultWorkflowId: workflow.workflow_id,
        findConversationById, isDefaultConversationName, workspaceStateWithTouchedConversation,
        titleFromTaskText: value => value,
        setWorkspaceState: () => {}, setComposerAttachment: () => {},
        updateTaskRuntimeState: update => { runtimeState = update(runtimeState); runtime.taskRuntimeState = runtimeState; },
        showToast: (kind, message) => setToasts([{ id: 'failure', kind, message }]),
        flushRuntimeTasksToWorkspace: () => {},
        chatFinalizedTaskIdsRef: { current: new Set() },
        setRuntimeBusy: value => { runtime.busy = value; }, setRuntimeActiveTaskId: value => { runtime.activeTaskId = value; }, setRuntimeActiveRunId: value => { runtime.activeRunId = value; }, setRuntimeFetchController: value => { runtime.fetchController = value; },
        executeQuest: (payload, _id, options) => { if (useRealExecutor) return realExecutor(payload, _id, options); runtime.activeRunId = payload.id; return new Promise((resolve, reject) => { finish = accepted => {
          if (!accepted) { runtime.activeRunId = null; runtimeState = { ...runtimeState, submission: null }; runtime.taskRuntimeState = runtimeState; reject(new Error('Fixture creation rejected')); return; }
          runtimeState = { ...runtimeState, submission: null, tasksById: { ...runtimeState.tasksById, confirmed: { taskId: 'confirmed', executionMode: 'bot' } }, taskOrder: [...runtimeState.taskOrder, 'confirmed'] };
          runtime.taskRuntimeState = runtimeState;
          options.onAccepted(); resolve();
        }; }); },
      });
      const request = () => ({ text: 'Keep input', displayText: 'Keep input', executionMode: 'bot', workflowId: workflow.workflow_id, imageAttachments: [], nodeRuntimeConfigs: { agent: { llm_config_id: 'fixture-provider', model_id: 'fixture-model' }, judge: { llm_config_id: 'fixture-provider', model_id: 'fixture-model' } } });
      const rejected = handlers.startDeploy(request(), 'fixture-conversation');
      const submitting = !!runtimeState.submission;
      setSelection({ id: runtimeCurrentTaskFor(runtimeState).taskId, status: 'done', node: 'end' });
      await sleep(150);
      const before = document.querySelectorAll('.react-flow__node').length;
      finish(false);
      const rejectionResult = await rejected;
      await sleep(150);
      const retained = runtimeCurrentTaskFor(runtimeState) === previous && document.querySelectorAll('.react-flow__node').length === before && before > 0;
      const toast = document.querySelector('.app-toast-error')?.textContent.includes('Failed to create task.');
      useRealExecutor = false;
      const accepted = handlers.startDeploy(request(), 'fixture-conversation');
      finish(true);
      const acceptanceResult = await accepted;
      setSelection({ id: runtimeCurrentTaskFor(runtimeState).taskId, status: 'running', node: 'agent' });
      await sleep(150);
      const report = document.createElement('pre');
      report.id = 'submission-result';
      report.textContent = JSON.stringify({ submitting, rejectionResult, acceptanceResult, cleared: !runtimeState.submission, retained, toast, switched: runtimeCurrentTaskFor(runtimeState).taskId === 'confirmed', nodes: document.querySelectorAll('.react-flow__node').length });
      document.body.append(report);
    })();
  }, []);
  const [selection, setSelection] = React.useState({ id: 'one', status: 'running', node: 'agent' });
  window.selectWorkflowTask = (id, status, node = 'agent', hydrated = true) => setSelection({ id, status, node, hydrated });
  const [statusFixture, setStatusFixture] = React.useState(null);
  window.setWorkflowStatusFixture = setStatusFixture;
  const [historyCount, setHistoryCount] = React.useState(0);
  window.setWorkflowHistoryCount = setHistoryCount;
  const historicalEvents = React.useMemo(() => Array.from({ length: historyCount }, (_, index) => [
    { type: 'workflow_node_started', nodeId: 'agent', timestamp: index * 1000 },
    { type: 'workflow_node_finished', nodeId: 'agent', timestamp: index * 1000 + 500, summary: `Historical ${index}` },
  ]).flat(), [historyCount]);
  const task = { taskId: selection.id, status: selection.status, workflowSnapshot: workflow,
    workflowRun: selection.hydrated === false ? null : { status: selection.status, current_node_id: selection.node, nodes: { [selection.node]: { status: selection.status, summary: '执行输出' } } }, eventLog: [...(statusFixture ? statusFixture.flatMap((status, index) => [
      { type: 'workflow_node_started', nodeId: selection.node, timestamp: 10000 + index * 2000 },
      ...(status === 'running' ? [] : [{ type: 'workflow_node_finished', nodeId: selection.node, timestamp: 11000 + index * 2000, status: status || undefined, summary: `**Final answer ${index + 1}**\n\nCompleted with [details](https://example.com) and \`code\`.` }]),
    ]) : historicalEvents), { type: 'workflow_edge_selected', fromNodeId: 'start', toNodeId: 'agent', timestamp: 100000 }] };
  return <AppTooltipProvider><div style={{ height: '100vh' }}><WorkflowRuntimePage workflow={workflow} task={task} /><AppToastStack toasts={toasts} onDismiss={() => setToasts([])} /></div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

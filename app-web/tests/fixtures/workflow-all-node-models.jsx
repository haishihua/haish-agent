import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { workflowNodeConfiguredState } from '../../src/features/tasks/hooks/createTaskStreamHandlers.js';
import '../../styles.css';
const config = { provider: 'source', model_id: 'gpt-5.5', reasoning_effort: 'high' };
const ids = ['clarify', 'goal_worker', 'goal_verifier'];
const workflow = { workflow_id: 'fixture.all-models', display_name: 'Goal Loop', nodes: [{ id: 'start', type: 'start' }, ...ids.map((id) => ({ id, type: 'agent', label: id, agent_id: 'preset.general' })), { id: 'output', type: 'output' }], edges: ['start', ...ids].map((id, i) => ({ from: id, to: [...ids, 'output'][i] })) };
const providers = [{ id: 'source', requestProvider: 'source', provider: 'openai', label: 'Source Provider', defaultModelId: 'gpt-5.5' }];
window.fetch = async () => new Response(JSON.stringify({ models: ['gpt-5.5'] }), { status: 200 });
function Fixture() {
  const [task, setTask] = React.useState({ taskId: 'fixture', status: 'running', nodeRuntimeConfigs: Object.fromEntries(ids.map((id) => [id, config])), workflowRun: { status: 'running', current_node_id: 'goal_worker', nodes: { clarify: { status: 'done', runtime_config: config }, goal_worker: { status: 'running' } } } });
  window.__setAllModelsTask = setTask;
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100%', gridColumn: 'auto' }}><WorkflowRuntimePage workflow={workflow} task={task} providerOptions={providers} nodeRuntimeConfigs={task.nodeRuntimeConfigs} configReadOnly /></div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
const select = async (id) => {
  document.querySelector(`.react-flow__node[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick(500);
  [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Runtime Config').click(); await tick();
};
const shown = (model, effort = 'high') => document.querySelector('[aria-label="Node provider"]')?.textContent.includes('Source Provider') && document.querySelector('[aria-label="Node model"]')?.textContent.includes(model) && document.querySelector('[aria-label="Node thinking level"]')?.textContent.includes(effort);
(async () => {
  for (let i = 0; i < 60 && !document.querySelector('.react-flow__node[data-id="goal_worker"]'); i++) await tick();
  for (const id of ids) {
    await select(id);
    check(shown('gpt-5.5'), `${id}: complete model config shown whether finished, running or pending`);
    check(document.querySelector(`[data-id="${id}"] .workflow-node-model`)?.textContent.includes('gpt-5.5'), `${id}: canvas model matches detail`);
  }
  window.__setAllModelsTask((task) => ({ ...task, workflowRun: { ...task.workflowRun, nodes: { ...task.workflowRun.nodes, goal_worker: workflowNodeConfiguredState({ runtime_config: { ...config, model_id: 'actual-model', reasoning_effort: 'low' } }, task.workflowRun.nodes.goal_worker) } } })); await tick();
  await select('goal_worker'); check(shown('actual-model', 'low'), 'Running Worker immediately displays actual runtime config without finishing');
  await select('goal_verifier'); check(shown('gpt-5.5'), 'Worker runtime update does not overwrite pending Verifier');
  window.__setAllModelsTask((task) => ({ ...task, nodeRuntimeConfigs: {}, requestedProvider: 'source', requestedModelId: 'gpt-5.5', requestedReasoningEffort: 'high' })); await tick();
  check(shown('gpt-5.5'), 'Older task with empty node map displays its recorded default route');
  check([...document.querySelectorAll('.workflow-runtime-config [role="combobox"]')].every((field) => field.disabled), 'Running task configuration remains read-only');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

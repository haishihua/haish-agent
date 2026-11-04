import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const workflow = { workflow_id: 'fixture.node-agent', nodes: [
  { id: 'start', type: 'start' }, { id: 'agent', type: 'agent', label: 'Agent' }, { id: 'end', type: 'output' },
], edges: [{ from: 'start', to: 'agent' }, { from: 'agent', to: 'end' }] };
const agents = [{ id: 'preset.general', label: 'Task Assistant' }, { id: 'custom.selected', label: 'Selected Agent', custom: true }];
const providers = [{ id: 'a', provider: 'custom', label: 'Provider A', defaultModelId: 'model-a', modelOptions: [{ id: 'model-a' }] },
  { id: 'b', provider: 'custom', label: 'Provider B', defaultModelId: 'model-b', modelOptions: [{ id: 'model-b' }] }];
window.fetch = async () => new Response(JSON.stringify({ models: [{ id: 'model-a' }, { id: 'model-b' }] }), { headers: { 'Content-Type': 'application/json' } });
function Fixture() {
  const [configs, setConfigs] = React.useState({ agent: { llm_config_id: 'a', model_id: 'model-a' } });
  const [task, setTask] = React.useState(null);
  window.__agentConfig = configs;
  window.__setAgentTask = setTask;
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100vh' }}><WorkflowRuntimePage workflow={workflow} task={task}
    agentOptions={agents} providerOptions={providers} nodeRuntimeConfigs={configs} configReadOnly={Boolean(task)}
    onNodeRuntimeConfigChange={(id, value) => setConfigs((previous) => ({ ...previous, [id]: value }))} /></div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = () => new Promise((resolve) => setTimeout(resolve, 150));
const report = document.getElementById('checks');
let failed = false;
function check(ok, label) { failed ||= !ok; report.textContent += `${ok ? 'PASS' : 'FAIL'} ${label}\n`; }
async function choose(label, value) {
  const trigger = document.querySelector(`[aria-label="${label}"]`);
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick();
  const option = document.querySelector(`[role="option"][data-value="value:${value}"]`);
  if (!option) throw new Error(`Missing option ${label}: ${value}`);
  option.click(); await tick();
}
(async () => {
  for (let i = 0; i < 80 && !document.querySelector('.react-flow__node[data-id="agent"]'); i++) await tick();
  document.querySelector('.react-flow__node[data-id="agent"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await tick();
  const agent = () => document.querySelector('[aria-label="Node agent"]');
  const cardTitle = () => document.querySelector('.react-flow__node[data-id="agent"] .workflow-flow-node-copy strong')?.textContent;
  const cardSubtitle = () => document.querySelector('.react-flow__node[data-id="agent"] .workflow-flow-node-copy small')?.textContent;
  check(agent()?.textContent.includes('Task Assistant'), 'Unselected node defaults to Task Assistant');
  check(cardTitle() === 'Task Assistant' && cardSubtitle() === 'model-a', 'Node title shows its selected Agent and model has no Agent prefix');
  await choose('Node agent', 'custom.selected');
  check(window.__agentConfig.agent.agent_id === 'custom.selected' && agent()?.textContent.includes('Selected Agent'), 'Agent selector updates actual node runtime configuration');
  check(cardTitle() === 'Selected Agent' && document.querySelector('.workflow-detail-name strong')?.textContent === 'Selected Agent', 'Selected Agent names the canvas node and detail heading');
  await choose('Node provider', 'b');
  check(window.__agentConfig.agent.agent_id === 'custom.selected' && window.__agentConfig.agent.llm_config_id === 'b', 'Changing provider preserves selected Agent');
  document.querySelector('[aria-label="Clear node configuration"]').click(); await tick();
  check(window.__agentConfig.agent.agent_id === 'custom.selected' && !window.__agentConfig.agent.llm_config_id, 'Clearing model configuration preserves Agent');
  window.__setAgentTask({ taskId: 'executed', status: 'running', workflowSnapshot: workflow, nodeRuntimeConfigs: window.__agentConfig,
    workflowRun: { status: 'running', current_node_id: 'agent', nodes: { agent: { status: 'running', runtime_config: { agent_id: 'preset.general', llm_config_id: 'a', model_id: 'model-a' } } } } });
  await tick();
  document.querySelector('.react-flow__node[data-id="agent"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Runtime Config').click(); await tick();
  check(agent()?.disabled && agent()?.textContent.includes('Task Assistant'), 'Running node displays and locks actual executed Agent, not pending selection');
  check(cardTitle() === 'Task Assistant' && cardSubtitle() === 'model-a' && document.querySelector('.workflow-detail-name strong')?.textContent === 'Task Assistant', 'Executed Agent and model take precedence over pending selection');
  check(!failed, 'Node Agent request/config/display checks complete');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

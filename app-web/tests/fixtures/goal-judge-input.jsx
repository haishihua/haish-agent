import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const workflow = { workflow_id: 'workflow.goal-loop', nodes: [
  { id: 'start', type: 'start', label: 'Start' }, { id: 'agent', type: 'agent', label: 'Agent' },
  { id: 'judge', type: 'llm', label: 'Judge' }, { id: 'end', type: 'output', label: 'End' },
], edges: [{ from: 'start', to: 'agent' }, { from: 'agent', to: 'judge' }, { from: 'judge', to: 'end' }] };
const input = { instructions: 'internal instructions', system: 'internal system', runtime_config_from: 'agent', prompt: JSON.stringify({ goal: 'Find the defect' }) };
const task = { taskId: 'judge-fixture', status: 'cancelled', workflowSnapshot: workflow,
  eventLog: [{ type: 'workflow_node_started', workflowNodeId: 'judge', nodeInput: input }],
  workflowRun: { status: 'cancelled', nodes: { judge: { status: 'cancelled', input } } } };
createRoot(document.getElementById('root')).render(<AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100vh' }}>
  <WorkflowRuntimePage workflow={workflow} task={task} configReadOnly />
</div></AppTooltipProvider>);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
function check(ok, label) { failed ||= !ok; report.textContent += `${ok ? 'PASS' : 'FAIL'} ${label}\n`; }
(async () => {
  for (let i = 0; i < 80 && !document.querySelector('.react-flow__node[data-id="judge"]'); i++) await sleep(100);
  document.querySelector('.react-flow__node[data-id="judge"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(400);
  const panel = document.querySelector('.workflow-detail-panel');
  check(panel?.textContent.includes('Goal: Find the defect'), 'Judge shows the original goal');
  check(panel?.textContent.includes('conversation snapshot') && panel.textContent.includes('not shown here'), 'Judge labels the reused context without pretending to show its contents');
  check(!panel?.textContent.includes('runtime_config_from') && !panel?.textContent.includes('internal system'), 'Node parameters are not displayed as a user message');
  check(!panel?.querySelector('.chat-message-row.user'), 'Judge does not invent a user chat bubble');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

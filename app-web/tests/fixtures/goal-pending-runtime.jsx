import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// 复现用户进入 /goal 的瞬间：工作流已选好，任务还没创建，运行时页面是只读的。
// 这个组合会让任何“Task 一定存在”的假设直接炸掉整个页面。
const workflow = { workflow_id: 'workflow.goal-loop', nodes: [
  { id: 'start', type: 'start', label: 'Start' },
  { id: 'agent', type: 'agent', label: 'Agent' },
  { id: 'judge', type: 'llm', label: 'Judge' },
  { id: 'end', type: 'output', label: 'End' },
], edges: [{ from: 'start', to: 'agent' }, { from: 'agent', to: 'judge' }, { from: 'judge', to: 'end' }] };
const agents = [{ id: 'preset.general', label: 'Task Assistant' }, { id: 'custom.selected', label: 'Selected Agent', custom: true }];

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <pre id="crash">{String(this.state.error?.stack || this.state.error)}</pre> : this.props.children; }
}

createRoot(document.getElementById('root')).render(<Boundary><AppTooltipProvider>
  <div className="app-workflow-stage" style={{ height: '100vh' }}>
    <WorkflowRuntimePage workflow={workflow} task={null} agentOptions={agents} configReadOnly />
  </div>
</AppTooltipProvider></Boundary>);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
function check(ok, label) { failed ||= !ok; report.textContent += `${ok ? 'PASS' : 'FAIL'} ${label}\n`; }
(async () => {
  for (let i = 0; i < 80 && !document.querySelector('.react-flow__node[data-id="judge"]'); i++) await sleep(100);
  check(!document.getElementById('crash'), 'Entering /goal before a task exists does not crash the page');
  check(document.querySelectorAll('.react-flow__node').length === 4, 'Every workflow node renders without a task');
  const agent = document.querySelector('.react-flow__node[data-id="agent"]');
  check(agent?.querySelector('.workflow-flow-node-copy strong')?.textContent === 'Task Assistant', 'Pending agent node names the default Agent');
  agent?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(300);
  check(document.querySelector('.workflow-detail-name strong')?.textContent === 'Task Assistant', 'Pending node detail opens with the default Agent name');
  check(document.querySelector('[aria-label="Node agent"]')?.disabled, 'Pending runtime keeps its configuration read-only');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

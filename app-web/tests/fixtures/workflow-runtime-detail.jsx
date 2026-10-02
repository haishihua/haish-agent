import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '../../styles.css';

const workflow = {
  workflow_id: 'fixture.runtime-detail', display_name: 'Goal Loop',
  nodes: [
    { id: 'start', type: 'start', label: 'Start' },
    { id: 'worker', type: 'agent', label: 'Worker', agent_id: 'goal.worker' },
    { id: 'model', type: 'llm', label: 'Verifier' },
    { id: 'tool', type: 'tool', label: 'Inspect', tool_name: 'read_file' },
    { id: 'end', type: 'output', label: 'End' },
  ],
  edges: [{ from: 'start', to: 'worker' }, { from: 'worker', to: 'model' }, { from: 'model', to: 'tool' }, { from: 'tool', to: 'end' }],
};
const timestamp = '2026-09-29T06:00:00Z';
const result = (summary) => ({ status: 'done', success: true, summary, input: 'Review the workflow execution and report the result.', started_at: timestamp, finished_at: '2026-09-29T06:01:00Z' });
const initialTask = {
  taskId: 'fixture-runtime-task', conversationId: 'fixture-runtime-conversation', status: 'running',
  workflowSnapshot: workflow,
  workflowRun: { status: 'running', current_node_id: 'model', nodes: { worker: result('## Result\n\n节点详情应与画布节点保持配色一致。\n\n- Retain real execution content\n- Keep input, response and trace together'), model: { status: 'running' } } },
  eventLog: [{ type: 'workflow_node_started', workflowNodeId: 'model', nodeInput: 'Verify the worker result.', timestamp }],
};
function Fixture() {
  const [task, setTask] = React.useState(initialTask);
  window.__runtimeTask = task;
  window.__setRuntimeTask = setTask;
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100%', gridColumn: 'auto' }}><WorkflowRuntimePage workflow={workflow} task={task} agentOptions={[{ id: 'goal.worker', label: 'Goal Worker' }]} composer={<div style={{ padding: 18, border: '1px solid #35425a', borderRadius: 14, color: '#92a1bd' }}>Describe the task you want to delegate…</div>} /></div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
function check(ok, label) { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; }
const panel = () => document.querySelector('.workflow-detail-panel');
const card = (id) => document.querySelector(`.react-flow__node[data-id="${id}"] .workflow-flow-node`);
const select = async (id) => { document.querySelector(`.react-flow__node[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick(500); const resultTab = [...document.querySelectorAll('.workflow-detail-tabs [role="tab"]')].find((tab) => tab.textContent === 'Run Result'); if (resultTab) { resultTab.click(); await tick(); } };
(async () => {
  for (let i = 0; i < 80 && !card('worker'); i++) await tick();
  await document.fonts.ready;
  const running = getComputedStyle(card('model'));
  check(running.getPropertyValue('--node-accent').trim() === running.getPropertyValue('--node-type-accent').trim(), 'Running node retains its purple type color');
  check(getComputedStyle(card('model'), '::after').animationName === 'workflow-node-live', 'Running node has animated halo');
  await select('worker');
  check(panel()?.dataset.nodeId === 'worker' && card('worker').classList.contains('active'), 'Click maps node highlight to matching detail');
  check(panel().textContent.includes('Goal Worker') && panel().textContent.includes('Retain real execution content'), 'Real input and agent result rendered');
  const stageSurface = getComputedStyle(document.querySelector('.app-workflow-stage'));
  check(stageSurface.borderTopWidth === '0px' && stageSurface.backgroundImage === 'none' && stageSurface.backgroundColor === 'rgba(0, 0, 0, 0)', 'Stage adds no outer frame or background behind node details');
  const detailSurface = getComputedStyle(panel());
  check(detailSurface.borderTopWidth === '1px' && detailSurface.borderRadius === '22px' && detailSurface.backgroundImage !== 'none', 'Inner node-colored detail frame is retained');
  const canvasRect = document.querySelector('.workflow-run-canvas').getBoundingClientRect();
  const detailRect = panel().getBoundingClientRect();
  check(Math.abs(detailRect.top - canvasRect.top) < 1 && Math.abs(detailRect.bottom - canvasRect.bottom) < 1, 'Detail top and bottom align with runtime canvas');
  check(innerWidth <= 900 || Math.abs(detailRect.left - canvasRect.right) < 1, 'Desktop canvas joins detail without a horizontal gap');
  const userMeta = panel().querySelector('.user-speaker-meta');
  check(getComputedStyle(userMeta).justifyContent === 'flex-end' && getComputedStyle(userMeta.querySelector('.chat-bubble-meta-main')).flexDirection === 'row', 'You and user avatar retain shared right alignment');
  const userShell = panel().querySelector('.chat-message-row.user .message-shell');
  check(getComputedStyle(userShell).paddingRight === '38px' && getComputedStyle(userShell).paddingLeft === '0px', 'User bubble leaves avatar space on the right');
  const goldProbe = document.createElement('span');
  goldProbe.style.color = 'var(--gold)';
  goldProbe.style.background = 'color-mix(in srgb, var(--gold) 12%, transparent)';
  panel().append(goldProbe);
  const avatar = getComputedStyle(panel().querySelector('.chat-message-row.agent .chat-speaker-avatar'));
  check(avatar.color === getComputedStyle(goldProbe).color && avatar.backgroundColor === getComputedStyle(goldProbe).backgroundColor, 'Penguin avatar retains original gold color and background');
  goldProbe.remove();
  check(!/Peek|Normal|Focus/.test(panel().querySelector('header').textContent), 'No display-mode controls');
  check(getComputedStyle(panel().querySelector('.workflow-detail-icon')).backgroundImage === getComputedStyle(card('worker').querySelector('.workflow-flow-node-icon')).backgroundImage, 'Panel icon uses canvas palette');
  check(document.querySelector('.workflow-selection-link path') && getComputedStyle(document.querySelector('.workflow-selection-link')).pointerEvents === 'none', 'Visual selection link is non-interactive');
  const blue = getComputedStyle(panel()).backgroundImage;
  window.__setRuntimeTask((t) => ({ ...t, eventLog: [...t.eventLog, { type: 'text_delta', delta: 'checking', workflowNodeId: 'model' }] })); await tick();
  check(card('worker').classList.contains('active') && panel().dataset.nodeId === 'worker', 'Streaming update does not steal or drop manual selection');
  await select('model');
  check(panel().dataset.nodeId === 'model' && !card('worker').classList.contains('active') && card('model').classList.contains('active'), 'Switching selects exactly one matching node');
  check(getComputedStyle(panel()).backgroundImage !== blue, 'Panel surface changes with node type');
  check(panel().querySelector('.workflow-detail-status-dot.is-running'), 'Header shows running status');
  const body = panel().querySelector('.workflow-detail-body');
  check(body.scrollWidth <= body.clientWidth + 1, 'Detail conversation has no horizontal overflow');
  const resizeHandle = getComputedStyle(panel().querySelector('.workflow-detail-resizer'), '::after');
  check(resizeHandle.backgroundColor === 'rgba(0, 0, 0, 0)' && resizeHandle.height === '36px', 'Resize handle has no persistent full-height separator');
  const beforeWidth = panel().getBoundingClientRect().width;
  panel().querySelector('[role="separator"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await tick(350);
  check(panel().getBoundingClientRect().width >= beforeWidth, 'Keyboard panel resize retained');
  panel().querySelector('.workflow-detail-close').click(); await tick();
  check(!panel() && !document.querySelector('.workflow-flow-node.active') && !document.querySelector('.workflow-selection-link'), 'Close clears panel, highlight and visual link');
  const canvasSurface = getComputedStyle(document.querySelector('.workflow-run-canvas'));
  check(canvasSurface.borderTopWidth === '1px' && canvasSurface.backgroundImage !== 'none', 'Canvas retains its own surface after detail closes');
  await select('tool'); check(!panel(), 'Unexecuted node does not invent execution content');
  await select('worker');
  window.__setRuntimeTask((t) => ({ ...t, taskId: 'second-task' })); await tick();
  check(!panel() && !card('worker').classList.contains('active'), 'Switching task clears old selection');
  await select('model');
  window.__setRuntimeTask((t) => ({ ...t, status: 'done', eventLog: [...t.eventLog, { type: 'workflow_node_finished', workflowNodeId: 'model', status: 'done', timestamp }], workflowRun: { ...t.workflowRun, status: 'done', current_node_id: null, nodes: { ...t.workflowRun.nodes, model: result('Verification complete.') } } })); await tick();
  check(panel()?.querySelector('.workflow-detail-status-dot.is-done') && card('model').classList.contains('active'), 'Completion updates status while retaining selection');
  for (const [status, color] of [
    ['done', 'rgb(85, 214, 160)'],
    ['succeeded', 'rgb(85, 214, 160)'],
    ['failed', 'rgb(238, 122, 145)'],
    ['cancelled', 'rgb(239, 199, 94)'],
    ['pending', 'rgba(181, 195, 220, 0.72)'],
    ['queued', 'rgba(181, 195, 220, 0.72)'],
  ]) {
    window.__setRuntimeTask((t) => ({ ...t, status, workflowRun: { ...t.workflowRun, status } }));
    await tick();
    const label = document.querySelector('.workflow-run-status');
    check(getComputedStyle(label).color === color && getComputedStyle(label, '::before').backgroundColor === color, `${status} title text and status dot use semantic color`);
  }
  window.__setRuntimeTask((t) => ({ ...t, status: 'done', workflowRun: { ...t.workflowRun, status: 'succeeded' } }));
  await tick();
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { TaskRecordCompact } from '../../src/features/conversations/components/ConversationTaskCards.jsx';
import { useViewedTaskCompletionNotice } from '../../src/features/tasks/hooks/useViewedTaskCompletionNotice.js';
import { addTaskCompletionNotice, taskNoticesByTaskId } from '../../src/features/tasks/model/task-completion-notices.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const workflow = {
  workflow_id: 'fixture.update-stability', display_name: 'Runtime updates',
  nodes: [{ id: 'start', type: 'start' }, { id: 'worker', type: 'agent', label: 'Worker', agent_id: 'worker' }, { id: 'end', type: 'output' }],
  edges: [{ from: 'start', to: 'worker' }, { from: 'worker', to: 'end' }],
};
const initial = {
  taskId: 'viewed', conversationId: 'conv-a', executionMode: 'bot', title: 'Viewed task', status: 'running',
  workflowRun: { status: 'running', current_node_id: 'worker', nodes: { worker: { status: 'running' } } }, eventLog: [],
};
const agentOptions = [{ id: 'worker', label: 'Worker' }];
function Fixture() {
  const [task, setTask] = React.useState(initial);
  const [notices, setNotices] = React.useState({});
  const [visible, setVisible] = React.useState(true);
  const [focused, setFocused] = React.useState(true);
  useViewedTaskCompletionNotice({ task, conversationId: task.conversationId, visible, windowFocused: focused, notices, setNotices });
  window.__stability = { task, notices, setTask, setNotices, setVisible, setFocused };
  const byId = taskNoticesByTaskId(notices);
  return <AppTooltipProvider>
    <div id="graph" className="app-workflow-stage"><WorkflowRuntimePage workflow={workflow} task={task} agentOptions={agentOptions} /></div>
    <div className="conversations-panel">
      <TaskRecordCompact task={task} active terminalNotice={byId.viewed} />
      <TaskRecordCompact task={{ taskId: 'other', title: 'Unviewed task', status: 'done' }} terminalNotice={byId.other} />
    </div>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
const cards = () => [...document.querySelectorAll('.react-flow__node')];
const notice = (id, conversationId = 'conv-a') => ({ taskId: id, conversationId, status: 'done' });
const viewedDot = () => document.querySelector('.conversation-task-card.active .conversation-task-terminal-notice');
(async () => {
  for (let i = 0; i < 100 && cards().length < 3; i++) await tick();
  await document.fonts.ready;
  await tick(700);
  const originals = cards();
  const edgeCount = document.querySelectorAll('.react-flow__edge').length;
  let hidden = 0;
  let missing = 0;
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.target.matches?.('.react-flow__node') && (record.oldValue || '').includes('visibility: hidden')) hidden++;
    });
  });
  observer.observe(document.querySelector('.react-flow'), { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true });
  for (let i = 0; i < 30; i++) {
    window.__stability.setTask((current) => ({ ...current, eventLog: [...current.eventLog, { type: 'text_delta', delta: String(i), workflowNodeId: 'worker' }], workflowRun: { ...current.workflowRun, nodes: { worker: { status: i % 2 ? 'running' : 'done' } } } }));
    await tick(25);
    hidden += cards().filter((card) => getComputedStyle(card).visibility === 'hidden').length;
    missing += cards().length !== 3 || document.querySelectorAll('.react-flow__edge').length !== edgeCount ? 1 : 0;
  }
  observer.disconnect();
  check(edgeCount === 2 && hidden === 0 && missing === 0, '30 status/stream updates keep measured nodes and edges visible');
  check(originals.every((card, index) => card === cards()[index]), 'Runtime updates retain actual graph DOM identities');
  window.__stability.setNotices((current) => addTaskCompletionNotice(addTaskCompletionNotice(current, notice('viewed')), notice('other')));
  await tick();
  check(!!viewedDot(), 'Running task does not prematurely consume its terminal receipt');
  window.__stability.setTask((current) => ({ ...current, status: 'done', workflowRun: { ...current.workflowRun, status: 'done' } }));
  await tick();
  check(!viewedDot() && !window.__stability.notices['conv-a:viewed'], 'Selected task completion clears its green dot without navigation');
  check(!!window.__stability.notices['conv-a:other'], 'Other task in the same conversation stays unread');
  window.__stability.setNotices((current) => addTaskCompletionNotice(current, notice('viewed')));
  await tick();
  check(!viewedDot(), 'Late/persisted receipt is cleared while the completed task remains open');
  window.__stability.setFocused(false);
  await tick();
  window.__stability.setNotices((current) => addTaskCompletionNotice(current, notice('viewed')));
  await tick();
  check(!!viewedDot(), 'Background completion remains unread');
  window.__stability.setFocused(true);
  await tick();
  check(!viewedDot(), 'Returning focus clears the selected task without switching');
  window.__stability.setVisible(false);
  await tick();
  window.__stability.setNotices((current) => addTaskCompletionNotice(current, notice('viewed')));
  await tick();
  check(!!viewedDot(), 'Settings/hidden task view does not acknowledge completion');
  window.__stability.setVisible(true);
  await tick();
  check(!viewedDot(), 'Returning to the task view clears its receipt');
  window.__stability.setNotices((current) => addTaskCompletionNotice(current, notice('viewed', 'conv-b')));
  await tick();
  check(!!window.__stability.notices['conv-b:viewed'] && !!window.__stability.notices['conv-a:other'], 'Acknowledgement is scoped by conversation and task, not task ID alone');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { report.textContent += `\nERROR ${error.stack}`; report.dataset.result = 'FAIL'; });

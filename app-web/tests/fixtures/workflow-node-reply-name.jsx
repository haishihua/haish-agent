import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';
import '../../styles/markdown.css';
import '../../styles/workflow-runtime.css';

// 工作流节点详情里的回复气泡必须署名该节点在配置里绑的 agent（`nodes[].agent_id`），
// 不再写死 "Assistant"。这里挂的是生产 WorkflowRuntimePage + 生产 ChatMessageRow：
// 点开节点 → 节点配置 → workflowNodeAgentName（与节点图标同一份 catalog）→ 气泡。
// llm 节点没有 agent 可署名（core 里只有 agent 节点能绑 agent_id），保持 "Assistant"；
// 审批卡按约定也保持 "Assistant"。
const AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant' },
  { id: 'custom.agent-code', label: 'Code Agent' },
  { id: 'custom.agent-design', label: 'Design Agent' },
];

const WORKFLOW = {
  workflow_id: 'fixture.reply-name',
  display_name: 'Reply name fixture',
  nodes: [
    { id: 'start', type: 'start', label: 'Start', position: { x: 40, y: 40 } },
    { id: 'requirements', type: 'agent', label: '需求澄清', agent_id: 'custom.agent-code', position: { x: 240, y: 40 } },
    { id: 'design', type: 'agent', label: '详细设计', agent_id: 'custom.agent-design', position: { x: 460, y: 40 } },
    { id: 'summary', type: 'llm', label: '总结', prompt: 'summarise', position: { x: 680, y: 40 } },
    {
      id: 'review',
      type: 'human_approval',
      label: '人工确认',
      input: { title: '请确认详细设计', summaryText: '{{nodes.design.summary}}' },
      position: { x: 900, y: 40 },
    },
    { id: 'done', type: 'output', label: 'End', output: '{{nodes.design.summary}}', position: { x: 1120, y: 40 } },
  ],
  edges: [
    { from: 'start', to: 'requirements' },
    { from: 'requirements', to: 'design' },
    { from: 'design', to: 'summary' },
    { from: 'summary', to: 'review' },
    { from: 'review', to: 'done' },
  ],
};

const STARTED_AT = '2026-09-17T01:00:00.000Z';
const FINISHED_AT = '2026-09-17T01:00:05.000Z';

function started(nodeId, nodeInput) {
  return { type: 'workflow_node_started', workflowNodeId: nodeId, nodeInput, timestamp: STARTED_AT };
}

function finished(nodeId, summary) {
  return { type: 'workflow_node_finished', workflowNodeId: nodeId, status: 'done', success: true, summary, timestamp: FINISHED_AT };
}

const EVENT_LOG = [
  started('requirements', '用户需求：让工作流节点回复署名配置的 agent。'),
  finished('requirements', '需求理解：节点回复气泡按节点配置的 agent 署名。'),
  started('design', '请基于需求理解给出详细设计。'),
  finished('design', '详细设计：节点详情里的回复气泡改读 nodes[].agent_id。'),
  started('summary', '总结上面两步。'),
  finished('summary', 'llm 节点的总结文字。'),
];

function nodeResult(summary, agentId = '') {
  return {
    status: 'done',
    success: true,
    summary,
    attempt: 1,
    started_at: STARTED_AT,
    finished_at: FINISHED_AT,
    ...(agentId ? { agent_id: agentId } : {}),
  };
}

const RUN = {
  workflow_id: WORKFLOW.workflow_id,
  run_id: 'fixture-run',
  status: 'done',
  current_node_id: null,
  nodes: {
    start: nodeResult(''),
    requirements: nodeResult('需求理解产出。', 'custom.agent-code'),
    design: nodeResult('详细设计产出。', 'custom.agent-design'),
    summary: nodeResult('llm 节点的总结。'),
    review: {
      status: 'approved',
      success: true,
      summary: '',
      decision: 'approve',
      attempt: 1,
      started_at: STARTED_AT,
      finished_at: FINISHED_AT,
    },
  },
};

const TASK = {
  taskId: 'task-fixture',
  conversationId: 'conv-fixture',
  status: 'done',
  executionMode: 'bot',
  createdAt: Date.parse(STARTED_AT),
  completedAt: Date.parse(FINISHED_AT),
  workflowSnapshot: WORKFLOW,
  workflowRun: RUN,
  eventLog: EVENT_LOG,
};

flushSync(() => createRoot(document.getElementById('root')).render(
  <AppTooltipProvider>
    <div className="app-workflow-stage" style={{ position: 'fixed', inset: 0 }}>
      <WorkflowRuntimePage
        workflow={WORKFLOW}
        task={TASK}
        agentOptions={AGENT_OPTIONS}
        composer={null}
        onRetry={null}
      />
    </div>
  </AppTooltipProvider>,
));

const checksEl = document.getElementById('checks');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function nodeElement(nodeId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const element = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`);
    if (element) return element;
    await wait(50);
  }
  return null;
}

/** 点开一个节点，返回详情面板里每个气泡上方写的名字。 */
async function speakersFor(nodeId) {
  const element = await nodeElement(nodeId);
  if (!element) return null;
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(150);
  return [...document.querySelectorAll('.workflow-detail-panel .chat-bubble-meta-main')]
    .map((meta) => meta.textContent.trim());
}

async function runChecks() {
  const results = [];
  const record = (name, speakers, expected) => results.push({
    name,
    ok: Array.isArray(speakers) && speakers.includes(expected),
    detail: `expected "${expected}", saw ${JSON.stringify(speakers)}`,
  });

  record('需求澄清（agent 节点）的回复写着节点配置的 Code Agent', await speakersFor('requirements'), 'Code Agent');
  record('详细设计（另一个 agent 节点）写着它自己配置的 Design Agent', await speakersFor('design'), 'Design Agent');
  record('llm 节点的回复保持 Assistant', await speakersFor('summary'), 'Assistant');
  record('审批卡保持 Assistant', await speakersFor('review'), 'Assistant');

  const panel = document.querySelector('.workflow-detail-panel');
  const panelText = panel ? panel.textContent : '';
  results.push({
    name: '内部 agent id 不出现在详情面板里',
    ok: Boolean(panel) && !panelText.includes('custom.') && !panelText.includes('preset.'),
    detail: JSON.stringify(panelText.slice(0, 120)),
  });

  const userSpeakers = await speakersFor('requirements');
  results.push({
    name: '节点输入气泡仍然写着 You',
    ok: Array.isArray(userSpeakers) && userSpeakers.includes('You'),
    detail: JSON.stringify(userSpeakers),
  });

  const pageErrors = Array.isArray(window.__pageErrors) ? window.__pageErrors : [];
  results.push({
    name: '整轮点节点看回复没有页面报错',
    ok: pageErrors.length === 0,
    detail: pageErrors.join(' | ') || 'none',
  });

  const passed = results.every((entry) => entry.ok);
  checksEl.dataset.result = passed ? 'PASS' : 'FAIL';
  checksEl.textContent = results
    .map((entry) => `${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}\n        ${entry.detail}`)
    .join('\n');
  window.__workflowReplyNameChecks = { passed, results, pageErrors: Array.isArray(window.__pageErrors) ? window.__pageErrors : [] };
}

runChecks().catch((error) => {
  checksEl.dataset.result = 'FAIL';
  checksEl.textContent = `FAIL  checks crashed\n        ${String(error?.stack || error)}`;
  window.__workflowReplyNameChecks = { passed: false, error: String(error?.stack || error) };
});

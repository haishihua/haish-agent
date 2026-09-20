// 工作流运行时的输入框回归页。
//
// 背景：工作流原来有自己的一套「Task Delegation」卡片（TaskDelegation.jsx + .task-delegation
// 样式），和聊天输入框是两套 UI，改一处要改两遍。现在工作流底部停靠的就是聊天那一个
// ChatComposer（见 features/chat/components/ChatComposer.jsx），工作流这边只负责定位。
//
// 断言：舞台里只有一个 .workflow-composer-dock，dock 里只有一个 .chat-composer；页面里
// 不再有任何 .task-delegation 节点；输入框自己的外边距在 dock 里归零；dock 按
// --task-panel-edge-x（18px）贴住画布左右、离底 10px，并且落在画布底部预留的 154px 带子
// 里（不会盖住节点）；空态（还没选 workflow）挂的是同一个输入框；打字后发送键可用、点击
// 把原文交回 onSend；运行中只给 Stop（工作流不支持中途纠偏），不会冒出「Add instruction」。

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';
import '../../styles/delegation.css';
import '../../styles/workflow-runtime.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const model = JSON.parse(init.body).model;
      return Promise.resolve(Response.json({ models: [model], default_model: model }));
    }
    return Promise.reject(new Error('Unexpected API call in offline fixture'));
  }
  return originalFetch(input, init);
};

const report = document.getElementById('checks');
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(name);
  checks.push(`PASS ${name}`);
  report.textContent = checks.join('\n');
}
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  await new Promise((resolve) => setTimeout(resolve, 30));
};
const near = (actual, expected, slack = 1) => Math.abs(actual - expected) <= slack;

const WORKFLOW_OPTIONS = [
  { id: 'demo-workflow', name: 'Demo Workflow' },
  { id: 'direct-agent', name: 'Direct Agent' },
];
const PROVIDER_OPTIONS = [
  { id: 'openai-dev', provider: 'openai', requestProvider: 'openai', defaultModelId: 'gpt-4o-mini' },
];
const DEMO_WORKFLOW = {
  workflow_id: 'demo-workflow',
  display_name: 'Demo Workflow',
  version: '1',
  nodes: [
    { id: 'start', type: 'start', data: { label: 'Start' } },
    { id: 'draft', type: 'llm', data: { label: 'Draft response' } },
    { id: 'output', type: 'output', data: { label: 'Output' } },
  ],
  edges: [
    { from: 'start', to: 'draft' },
    { from: 'draft', to: 'output' },
  ],
};

function Stage({ workflow, expose, sent }) {
  const [draft, setDraft] = React.useState('');
  const [running, setRunning] = React.useState(false);
  React.useEffect(() => {
    window[expose] = {
      setDraft: (value) => flushSync(() => setDraft(value)),
      setRunning: (value) => flushSync(() => setRunning(value)),
      getDraft: () => draft,
    };
  }, [expose, draft]);
  return (
    <WorkflowRuntimePage
      workflow={workflow}
      task={null}
      agentOptions={WORKFLOW_OPTIONS}
      onRetry={() => {}}
      composer={(
        <ChatComposer
          scopeId={`workflow-${expose}`}
          draft={draft}
          onDraftChange={setDraft}
          onSend={(text) => { sent.push(text); setDraft(''); return Promise.resolve(true); }}
          onStop={() => setRunning(false)}
          running={running}
          idlePlaceholder="Describe the task you want to delegate..."
          disabledPlaceholder="Agents are currently busy executing..."
          allowRuntimeInput={false}
          providerOptions={PROVIDER_OPTIONS}
          agentOptions={WORKFLOW_OPTIONS}
          defaultAgentId="demo-workflow"
          onAgentChange={() => {}}
        />
      )}
    />
  );
}

const sentToWorkflow = [];
createRoot(document.getElementById('stage-a')).render(
  <AppTooltipProvider searchRoot={document.body}>
    <div className="app-workflow-stage" style={{ height: '100%' }}>
      <Stage workflow={DEMO_WORKFLOW} expose="__stageA" sent={sentToWorkflow} />
    </div>
  </AppTooltipProvider>,
);
createRoot(document.getElementById('stage-b')).render(
  <AppTooltipProvider searchRoot={document.body}>
    <div className="app-workflow-stage" style={{ height: '100%' }}>
      <Stage workflow={null} expose="__stageB" sent={[]} />
    </div>
  </AppTooltipProvider>,
);

const stageA = document.getElementById('stage-a');
const stageB = document.getElementById('stage-b');
const rect = (node) => node.getBoundingClientRect();

(async () => {
  await tick();
  await tick();

  // —— A. 结构：只有一套输入框 ——
  const dock = stageA.querySelector('.workflow-composer-dock');
  check(Boolean(dock), '画布底部挂着 .workflow-composer-dock');
  check(stageA.querySelectorAll('.workflow-composer-dock').length === 1, 'dock 只有一个');
  check(dock.querySelectorAll('.chat-composer').length === 1, 'dock 里就是聊天那个 .chat-composer');
  check(stageA.querySelectorAll('.chat-composer').length === 1, '整个工作流舞台只有一个输入框');
  check(!stageA.querySelector('.task-delegation'), '页面里没有任何 .task-delegation 节点');
  check(!stageA.querySelector('.chat-workspace'), '工作流舞台没有把聊天面板整套搬进来');
  const composer = dock.querySelector('.chat-composer');
  const composerStyle = getComputedStyle(composer);
  check(composerStyle.margin === '0px', 'dock 里输入框自己的外边距归零（位置交给 dock）');
  check(near(rect(composer).width, rect(dock).width), 'composer 占满 dock 宽度，没有多一层左右留白');

  // —— B. 位置：贴住画布底部预留的那 154px 带子 ——
  const canvas = stageA.querySelector('.workflow-run-canvas');
  check(Boolean(canvas), '画布 .workflow-run-canvas 渲染出来了');
  const canvasRect = rect(canvas);
  const dockRect = rect(dock);
  check(near(dockRect.left - canvasRect.left, 18), `dock 左边距 18px（实际 ${(dockRect.left - canvasRect.left).toFixed(1)}）`);
  check(near(canvasRect.right - dockRect.right, 18), `dock 右边距 18px（实际 ${(canvasRect.right - dockRect.right).toFixed(1)}）`);
  check(near(canvasRect.bottom - dockRect.bottom, 10), `dock 离底 10px（实际 ${(canvasRect.bottom - dockRect.bottom).toFixed(1)}）`);
  const reserved = 154;
  const overlap = dockRect.height + 10 - reserved;
  check(overlap <= 0, `输入框高度 ${dockRect.height.toFixed(1)}px 落在画布底部预留的 ${reserved}px 里（超出 ${overlap.toFixed(1)}px 就会压住节点）`);

  // —— C. 交互：和聊天是同一套 ——
  const sendButton = stageA.querySelector('[aria-label="Send"]');
  check(Boolean(sendButton), '空的输入框上有一个 Send 键');
  check(sendButton.disabled, '没打字时 Send 不可点');
  window.__stageA.setDraft('总结一下这个工作流的输入');
  await tick();
  check(!stageA.querySelector('[aria-label="Send"]').disabled, '打字后 Send 可用');
  stageA.querySelector('[aria-label="Send"]').click();
  await tick();
  check(sentToWorkflow.length === 1 && sentToWorkflow[0] === '总结一下这个工作流的输入',
    `点 Send 把原文交回 onSend（收到 ${JSON.stringify(sentToWorkflow)}）`);
  check(window.__stageA.getDraft() === '', '发出去之后输入框清空');
  window.__stageA.setRunning(true);
  await tick();
  check(Boolean(stageA.querySelector('[aria-label="Stop"]')), '运行中按钮变成 Stop');
  window.__stageA.setDraft('插一句话试试');
  await tick();
  check(!stageA.querySelector('[aria-label="Add instruction"]'), '工作流运行中不出现「Add instruction」（不支持中途纠偏）');
  check(Boolean(stageA.querySelector('[aria-label="Stop"]')), '在这种情况下仍然是 Stop');

  // —— D. 空态（还没选 workflow）也挂同一个输入框 ——
  const emptyDock = stageB.querySelector('.workflow-run-empty .workflow-composer-dock');
  check(Boolean(emptyDock), '空态里也有 .workflow-composer-dock');
  check(emptyDock.querySelectorAll('.chat-composer').length === 1, '空态挂的是同一个 ChatComposer');
  const emptyCopy = stageB.querySelector('.workflow-run-empty > span')?.textContent || '';
  check(emptyCopy === 'Pick a Workflow below to preview and run it.', `空态文案：${emptyCopy}`);
  const emptyStageRect = rect(stageB.querySelector('.app-workflow-stage'));
  const emptyDockRect = rect(emptyDock);
  check(emptyDockRect.bottom <= emptyStageRect.bottom + 0.5, '空态输入框落在舞台里面（没有溢出到下面去）');
  check(emptyDockRect.top > emptyStageRect.top, '空态输入框在舞台底部而不是盖住提示文案');

  // —— E. 控制台干净 ——
  check(window.__pageErrors.length === 0, `页面没有报错（${window.__pageErrors.join(' | ')}）`);

  report.dataset.result = 'PASS';
  report.textContent += '\nALL CHECKS PASSED';
})().catch((error) => {
  report.dataset.result = 'FAIL';
  report.textContent += `\nFAIL ${error.message}\n${error.stack}`;
  window.__pageErrors.push(String(error.message || error));
});

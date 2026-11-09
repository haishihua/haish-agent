// 节点卡片的呈现派生（类型色 / 文案 / 类名）：这三个值直接决定画布上那张卡片长什么样、读什么。
// 它们原先散在 WorkflowFlowNode.jsx 的函数体里，只能靠「源码里有没有这一行」守着（改个写法就红，
// 真把颜色/分隔符改错反而不一定红）。抽成纯函数后按输入输出对拍。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workflowNodeAccent,
  workflowNodeCardClassName,
  workflowNodeCardText,
} from '../../../src/features/workflow/model/workflow-node-presentation.js';

test('每个节点类型都取同一个 CSS 变量，未知类型退回 agent 色', () => {
  const accents = {
    start: 'var(--workflow-accent-start)',
    agent: 'var(--workflow-accent-agent)',
    llm: 'var(--workflow-accent-llm)',
    tool: 'var(--workflow-accent-tool)',
    condition: 'var(--workflow-accent-condition)',
    human_approval: 'var(--workflow-accent-human_approval)',
    loop: 'var(--workflow-accent-loop)',
    output: 'var(--workflow-accent-output)',
  };
  for (const [type, value] of Object.entries(accents)) {
    // 拿到的是变量引用（不是十六进制）：类型色只在 app-shell.css 里写一次。
    assert.equal(workflowNodeAccent(type), value);
  }
  // 未知/空类型退回 agent 色：一张没写类型的卡片也得有主题色，不能变成透明。
  for (const unknown of [undefined, null, '', 'weird', 'AGENT']) {
    assert.equal(workflowNodeAccent(unknown), accents.agent);
  }
});

test('卡片标题按 运行态覆盖名 → 定义 label → 类型名 退让，运行状态接在后面', () => {
  assert.deepEqual(workflowNodeCardText(undefined), {
    nodeType: 'agent', runtimeStatus: '', nodeTitle: 'agent', nodeLabel: 'agent',
  });
  assert.deepEqual(workflowNodeCardText({ workflowNode: { type: 'agent', label: 'Worker' } }), {
    nodeType: 'agent', runtimeStatus: '', nodeTitle: 'Worker', nodeLabel: 'Worker',
  });
  // 运行页只覆盖名字（不重建卡片）：runtimeAgentName 压过定义里的 label。
  assert.deepEqual(
    workflowNodeCardText({ workflowNode: { type: 'agent', label: 'Worker' }, runtimeAgentName: 'Worker #2' }),
    { nodeType: 'agent', runtimeStatus: '', nodeTitle: 'Worker #2', nodeLabel: 'Worker #2' },
  );
  // 状态词优先用本地化文案（runtimeStatusLabel），没有才退回原始状态词。
  assert.deepEqual(
    workflowNodeCardText({ workflowNode: { type: 'loop' }, runtimeStatus: 'running' }),
    { nodeType: 'loop', runtimeStatus: 'running', nodeTitle: 'loop', nodeLabel: 'loop · running' },
  );
  assert.equal(
    workflowNodeCardText({ workflowNode: { type: 'loop' }, runtimeStatus: 'done', runtimeStatusLabel: 'Completed' }).nodeLabel,
    'loop · Completed',
  );
  assert.equal(
    workflowNodeCardText({ workflowNode: { type: 'start' }, runtimeStatus: 'waiting_input', runtimeStatusLabel: '' }).nodeLabel,
    'start · waiting_input',
  );
  // 空状态词不接尾巴：卡片上不该出现一个孤零零的「·」。
  for (const runtimeStatus of ['', null, undefined, 0]) {
    assert.equal(workflowNodeCardText({ workflowNode: { type: 'start' }, runtimeStatus }).nodeLabel, 'start');
  }
});

test('卡片类名是 CSS 契约：类型名恒在，状态按固定顺序追加，空格不挪', () => {
  // 类名里串在中间的单个空格就是选择器分隔符——多一个/少一个浏览器只会「样式没生效」，
  // 肉眼看不出来，所以按整串钉住（连未选中时那个尾空格也照原样留着）。
  assert.equal(
    workflowNodeCardClassName({ nodeType: 'agent', selected: false, runtimeStatus: '' }),
    'workflow-flow-node agent ',
  );
  assert.equal(
    workflowNodeCardClassName({ nodeType: 'agent', selected: true, runtimeStatus: '' }),
    'workflow-flow-node agent active',
  );
  assert.equal(
    workflowNodeCardClassName({ nodeType: 'loop', selected: false, data: { dropPreview: true }, runtimeStatus: '' }),
    'workflow-flow-node loop  is-drop-preview',
  );
  // 追加顺序：active → is-drop-preview → is-runtime status-* → has-runtime-detail → is-reconnecting。
  assert.equal(
    workflowNodeCardClassName({
      nodeType: 'human_approval',
      selected: true,
      data: { dropPreview: true, reconnectType: 'target' },
      runtimeStatus: 'running',
      runtimeDetailAvailable: true,
    }),
    'workflow-flow-node human_approval active is-drop-preview is-runtime status-running has-runtime-detail is-reconnecting',
  );
  // 运行页把 --node-accent 换成状态色靠的就是这个 status-* 类：状态词原样拼进来，不做大小写/下划线转换。
  assert.equal(
    workflowNodeCardClassName({ nodeType: 'agent', runtimeStatus: 'waiting_input' }),
    'workflow-flow-node agent  is-runtime status-waiting_input',
  );
});

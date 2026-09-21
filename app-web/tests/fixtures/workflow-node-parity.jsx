// 节点外观一致性页（配置页 vs 运行页共用一套节点样式）。
//
// 背景：节点卡片本来就是同一个组件（WorkflowFlowNode.jsx），但颜色/尺寸过去分成两套——
// 配置页在 app-shell.css 里有一套手写的类型配色，运行页在 workflow-runtime.css 里另有一套
// （类型色变量 + 状态皮肤），没跑到的节点还会再换成一套灰。改一处 UI 要在两个文件里对齐。
// 目标：卡片外观只有一份；没跑到的节点就是配置页那副样子，跑起来/跑过之后才由 status-* 叠加。
//
// 断言（全部通过 = 两页确实是一套）：
//   1. 同名同类型节点：配置页与运行页（完成态）的高度/图标底色/图标字色/标题颜色逐项一致；
//   2. 中性卡片描边一致；选中态只有一层高亮（描边亮成类型色 + 柔光，不再套外圈/贴边环）；
//      把手两页同一份中性色、同一个尺寸；
//   3. 运行页没跑到的节点直接穿配置页那套（不再另配灰皮肤），跑过/在跑才由状态色覆盖；
//   4. 连接点（把手）两页同一套：一颗 6px 中性小圆点，平时都收起（悬停/选中该节点才露出来，
//      过去配置页常显 12px、运行页 6px 收起，两页「边的端点」看起来是两套）。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { WorkflowFlowNode } from '../../src/features/workflow/components/WorkflowFlowNode.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/workflow-runtime.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const report = document.getElementById('checks');
const lines = [];
const failures = [];
const log = (line) => { lines.push(line); report.textContent = lines.join('\n'); };
function check(condition, name) {
  log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
}

const AGENT_OPTIONS = [{ id: 'agent-a', label: 'Code Agent', description: '' }];
const NODE_TYPES = { workflowNode: WorkflowFlowNode };

const SHARED_NODES = [
  { id: 'start', type: 'start', label: 'Start', at: [20, 20] },
  { id: 'agent', type: 'agent', label: '需求澄清', agent_id: 'agent-a', at: [20, 112] },
  { id: 'tool', type: 'tool', label: '调用工具', at: [20, 204] },
  { id: 'condition', type: 'condition', label: '验收通过？', at: [200, 20] },
  { id: 'approval', type: 'human_approval', label: '人工确认', at: [200, 112] },
  { id: 'loop', type: 'loop', label: '返工', at: [200, 204] },
  { id: 'output', type: 'output', label: 'End', at: [380, 20] },
];
const RUNTIME_STATUS = { start: 'done', agent: 'done', tool: 'done', condition: 'done', approval: 'approval', loop: 'done', output: 'done' };
const STATUS_LABEL = { done: 'Completed', approval: 'Awaiting approval', pending: 'Waiting', running: 'Running' };
const DETAIL_TYPES = new Set(['agent', 'llm', 'tool', 'human_approval']);

const workflowNodeOf = (node) => ({
  id: node.id,
  type: node.type,
  label: node.label,
  ...(node.agent_id ? { agent_id: node.agent_id } : {}),
});

function editorNodes() {
  return SHARED_NODES.map((node) => ({
    id: `cfg-${node.id}`,
    type: 'workflowNode',
    position: { x: node.at[0], y: node.at[1] },
    data: { workflowNode: workflowNodeOf(node), agentOptions: AGENT_OPTIONS },
    selected: node.id === 'condition',
    draggable: true,
  }));
}

function runtimeNodes() {
  const shared = SHARED_NODES.map((node) => ({
    id: `rt-${node.id}`,
    type: 'workflowNode',
    position: { x: node.at[0], y: node.at[1] },
    data: {
      workflowNode: workflowNodeOf(node),
      agentOptions: AGENT_OPTIONS,
      runtimeStatus: RUNTIME_STATUS[node.id],
      runtimeStatusLabel: STATUS_LABEL[RUNTIME_STATUS[node.id]],
      runtimeDetailAvailable: DETAIL_TYPES.has(node.type),
    },
    selected: node.id === 'condition',
    draggable: true,
  }));
  const demos = [
    { id: 'rt-demo-pending', label: '未运行的节点', at: [380, 112], status: 'pending' },
    { id: 'rt-demo-running', label: '运行中的节点', at: [380, 204], status: 'running' },
  ].map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: { x: node.at[0], y: node.at[1] },
    data: {
      workflowNode: { id: node.id, type: 'agent', label: node.label },
      agentOptions: AGENT_OPTIONS,
      runtimeStatus: node.status,
      runtimeStatusLabel: STATUS_LABEL[node.status],
      runtimeDetailAvailable: node.status !== 'pending',
    },
    draggable: true,
  }));
  return [...shared, ...demos];
}

function mountPane(rootId, nodes) {
  createRoot(document.getElementById(rootId)).render(
    <ReactFlowProvider>
      <ReactFlow nodes={nodes} edges={[]} nodeTypes={NODE_TYPES} nodesConnectable={false} deleteKeyCode={null}
        minZoom={0.3} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
        <Background gap={22} size={1.2} color="rgba(176, 206, 255, 0.07)" />
      </ReactFlow>
    </ReactFlowProvider>,
  );
}
flushSync(() => {
  mountPane('pane-config', editorNodes());
  mountPane('pane-runtime', runtimeNodes());
});

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

const probe = document.createElement('span');
document.body.append(probe);
function resolveProp(prop, value) {
  probe.style.cssText = 'display:none';
  probe.style[prop] = value;
  return getComputedStyle(probe)[prop];
}

async function waitForNodes(selector, count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (document.querySelectorAll(`${selector} .react-flow__node[data-id]`).length >= count) return true;
    await tick(100);
  }
  return false;
}

function measurePane(selector) {
  const out = {};
  for (const el of document.querySelectorAll(`${selector} .react-flow__node[data-id]`)) {
    const node = el.querySelector('.workflow-flow-node');
    const icon = node.querySelector('.workflow-flow-node-icon');
    const label = node.querySelector('strong');
    const handle = node.querySelector('.react-flow__handle');
    const style = getComputedStyle(node);
    const iconStyle = getComputedStyle(icon);
    const after = getComputedStyle(node, '::after');
    out[el.dataset.id] = {
      classes: node.className.trim().split(/\s+/).filter((name) => name !== 'workflow-flow-node').join(' '),
      height: round(node.getBoundingClientRect().height),
      border: style.borderTopColor,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} @${style.outlineOffset}`,
      boxShadow: style.boxShadow,
      iconBg: iconStyle.backgroundColor,
      iconColor: iconStyle.color,
      iconRadius: iconStyle.borderTopLeftRadius,
      labelColor: getComputedStyle(label).color,
      handle: handle ? `${round(handle.getBoundingClientRect().width)}px, opacity ${getComputedStyle(handle).opacity}` : 'none',
      handleColor: handle ? getComputedStyle(handle).backgroundColor : 'none',
      halo: after.content === '""' && after.animationName !== 'none' ? `yes (${after.animationName})` : 'none',
    };
  }
  return out;
}

(async () => {
  try {
    log(`viewport ${window.innerWidth}x${window.innerHeight}`);
    const okConfig = await waitForNodes('#pane-config', SHARED_NODES.length);
    const okRuntime = await waitForNodes('#pane-runtime', SHARED_NODES.length + 2);
    log(`nodes rendered: config ${okConfig}, runtime ${okRuntime}`);
    await tick(400);

    const cfg = measurePane('#pane-config');
    const rt = measurePane('#pane-runtime');
    log('—— 配置页 ——');
    for (const [id, item] of Object.entries(cfg)) log(`· ${id}: ${JSON.stringify(item)}`);
    log('—— 运行页 ——');
    for (const [id, item] of Object.entries(rt)) log(`· ${id}: ${JSON.stringify(item)}`);

    log('—— 一致性断言 ——');
    for (const node of SHARED_NODES) {
      const c = cfg[`cfg-${node.id}`];
      const r = rt[`rt-${node.id}`];
      if (!c || !r) { check(false, `${node.id}: 两页都渲染`); continue; }
      check(c.height === 72 && r.height === 72, `${node.id}: 高度都是 72px（${c.height}/${r.height}）`);
      check(c.iconBg === r.iconBg, `${node.id}: 图标底色一致（${c.iconBg}）`);
      check(c.iconColor === r.iconColor, `${node.id}: 图标字色一致（${c.iconColor}）`);
      check(c.labelColor === r.labelColor, `${node.id}: 标题颜色一致（${c.labelColor}）`);
    }
    // 选中高亮只有一层：描边换成类型色 + 一圈柔光。过去还有一条 #aebdd3 外圈（在描边外面
    // 再套一层白框），以及贴着描边的 0 0 0 1px 环，两条都删了——留着就会看成「两个高亮框」。
    check(cfg['cfg-condition'].outline === rt['rt-condition'].outline && cfg['cfg-condition'].outline.includes(' none'),
      `选中态没有多余外圈（${cfg['cfg-condition'].outline}）`);
    check(
      cfg['cfg-condition'].boxShadow === rt['rt-condition'].boxShadow
        && !cfg['cfg-condition'].boxShadow.includes('0px 0px 0px 1px'),
      `选中态高亮只有一层描边 + 柔光（${cfg['cfg-condition'].boxShadow}）`,
    );
    check(
      cfg['cfg-condition'].border === resolveProp('borderTopColor', 'color-mix(in srgb, #9299ff 62%, transparent)'),
      `选中态描边就是节点类型色（${cfg['cfg-condition'].border}）`,
    );
    check(cfg['cfg-agent'].border === rt['rt-demo-pending'].border,
      `中性卡片描边一致（配置 ${cfg['cfg-agent'].border} / 运行未运行 ${rt['rt-demo-pending'].border}）`);

    log('—— 运行页状态皮肤（叠在统一底样上）——');
    const pending = rt['rt-demo-pending'];
    const running = rt['rt-demo-running'];
    check(pending.iconBg === cfg['cfg-agent'].iconBg, `未运行节点就穿配置页那套（图标底色 ${pending.iconBg}）`);
    check(pending.iconColor === cfg['cfg-agent'].iconColor, `未运行节点图标字色与配置页一致（${pending.iconColor}）`);
    check(pending.border !== rt['rt-agent'].border, `未运行与已完成可分辨（描边 ${pending.border} vs ${rt['rt-agent'].border}）`);
    check(running.iconColor === resolveProp('color', '#76b9fa'), `运行中节点运行蓝（${running.iconColor}）`);
    check(running.border === resolveProp('borderColor', '#76b9fa'), `运行中节点描边运行蓝（${running.border}）`);
    check(running.halo.startsWith('yes'), `运行中节点有呼吸圈（${running.halo}）`);

    log('—— 连接点（把手）：两页同一套 ——');
    // 过去配置页 12px 常显、运行页 6px 收起，两页「边的端点」是两套；现在两页都是同一颗中性
    // 小圆点、同样收起（悬停或选中该节点才露出来，规则在 app-shell.css 里只写了一份）。
    check(cfg['cfg-agent'].handle.startsWith('6px') && cfg['cfg-agent'].handle.endsWith('0'),
      `配置页把手平时收起（${cfg['cfg-agent'].handle}）`);
    check(rt['rt-agent'].handle.startsWith('6px') && rt['rt-agent'].handle.endsWith('0'),
      `运行页把手同一尺寸、同样收起（${rt['rt-agent'].handle}）`);
    check(cfg['cfg-agent'].handle === rt['rt-agent'].handle,
      `两页把手尺寸/透明度一致（${cfg['cfg-agent'].handle} / ${rt['rt-agent'].handle}）`);
    check(cfg['cfg-agent'].handleColor === resolveProp('backgroundColor', 'rgba(169, 187, 211, 0.9)'),
      `把手是中性色、不再是金色（${cfg['cfg-agent'].handleColor}）`);
    check(cfg['cfg-agent'].handleColor === rt['rt-agent'].handleColor,
      `两页把手同色（${rt['rt-agent'].handleColor}）`);

    check(window.__pageErrors.length === 0, `页面无报错（${window.__pageErrors.join(' | ') || 'none'}）`);
    report.dataset.result = failures.length ? 'FAIL' : 'PASS';
    log(failures.length ? `✗ ${failures.length} 项不一致` : 'ALL PASS — 配置页与运行页共用一套节点样式（含连接点）');
    window.__nodeParity = { cfg, rt, failures };
  } catch (error) {
    report.dataset.result = 'FAIL';
    log(`FAIL ${error && (error.stack || error.message) || String(error)}`);
    window.__nodeParity = { error: String(error && (error.stack || error.message) || error) };
  }
})();

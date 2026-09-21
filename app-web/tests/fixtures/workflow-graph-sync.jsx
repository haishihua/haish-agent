// 图（节点 + 边 + 排布）单一来源一致性页：真实 Page 组件并排，共享同一份工作流状态。
//
// 背景：配置页与运行页过去各有一份节点外观、一份边外观、一份排布算法——改一处要在两边对齐，
// 拖动后的位置也只活在配置页那次渲染里。目标：图（含排布）只有一份来源；
//   · 外观：WorkflowFlowNode.workflowEdgeAppearance + app-shell.css 的 .workflow-flow-node /
//     .react-flow__edge 规则，两页共用；
//   · 排布：工作流定义里的 nodes[].position（配置页拖动时写入），运行页只读这一份；
//   · 改图只在配置页发生，运行页 nodesDraggable={false}。
//
// 断言（全部通过 = 两页共用一张图）：
//   1. 两页都渲染真实组件（WorkflowConfigEditor / WorkflowRuntimePage），节点数一致；
//   2. 两页的节点都落在定义里存的位置上（Flow 坐标 = position，不各自算一套）；
//   3. 同一条边（按 from→to 配对）：同一条中性细线（平时不按类型色、无渐变），线宽一致、没有
//      虚线，也都没有文字标签、没有箭头 marker；
//   4. 「正在走」的边一套：配置页选中的边 = 运行页当前走的那条边（运行蓝 + 加粗 + 软光 +
//      沿线流动的亮斑）；
//   5. 在配置页拖节点 → 定义里的 position 变了，运行页跟着到同一坐标（保存后即同步）；
//   6. 在运行页拖同一个节点 → 定义与两页坐标都不动（运行页只读，改图只能在配置页）；
//   7. 系统预设（定义里没有保存的排布、两页画布宽度也不同）：列数是常数，两页排出同一张图；
//      「超限」边（goal_loop→output）在运行页不许被藏掉；
//   8. 运行页标题（工作流名 + 运行状态）是回配置页的入口：一个真按钮，点了把工作流 id 交回上层；
//      标题用正文色、运行中只有同一颜色的流光，没有金色/彩虹；
//   9. 同一条边两页接在同一个把手上（按 from→to 配对，比较「离端点最近的那个把手是谁、在哪
//      一侧」）：loop 的 retry 出口两页都在节点自己那一侧，次级→主链那条边两页都落在主节点
//      底部的回环端口；
//   10. 系统预设的内容不能改，但排布拖得动、存得下（本机 layout store）：拖完配置页与重新打开
//      的运行页读到同一组坐标，「重置排布」清回算出来的位置，定义（onSettingsChange）一个字都没动。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkflowConfigEditor } from '../../src/features/settings/components/WorkflowConfigEditor.jsx';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { normalizeWorkflowSettings } from '../../src/features/workflow/model/workflow-catalog.js';
import {
  clearWorkflowLayout,
  savedWorkflowLayout,
} from '../../src/features/workflow/model/workflow-layout-store.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
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

const WORKFLOW_ID = 'custom.move';
const AGENT_OPTIONS = [{ id: 'agent-a', label: 'Code Agent', description: '' }];
// 存下来的排布：每个节点都在自己该在的位置上（不是默认蛇形排出来的那一套）。
const STORED_POSITIONS = {
  start: { x: 40, y: 140 },
  worker: { x: 360, y: 140 },
  judge: { x: 680, y: 140 },
  output: { x: 1000, y: 140 },
  rescue: { x: 360, y: 460 },
};
const NODES = [
  { id: 'start', type: 'start', label: 'Start', position: STORED_POSITIONS.start },
  { id: 'worker', type: 'agent', label: 'Worker', agent_id: 'agent-a', prompt: '', input: '{{input.message}}', position: STORED_POSITIONS.worker },
  { id: 'judge', type: 'condition', label: 'Verifier', position: STORED_POSITIONS.judge },
  { id: 'rescue', type: 'loop', label: 'Retry', max_loops: 2, position: STORED_POSITIONS.rescue },
  { id: 'output', type: 'output', label: 'End', position: STORED_POSITIONS.output },
];
const EDGES = [
  { from: 'start', to: 'worker' },
  { from: 'worker', to: 'judge' },
  { from: 'judge', to: 'output', branch: 'true' },
  { from: 'judge', to: 'rescue', branch: 'false' },
  { from: 'rescue', to: 'worker', branch: 'retry' },
];
// 系统预设（照抄 core/workflow/model.py 的 goal_loop_workflow()）：定义里有节点 position，但
// system 工作流不算「保存的排布」（workflowArrangementPositions 为空），两页都走排布算法；
// 节点 position 只在走链找路时参与排序。两页容器宽度故意不同——过去列数按画布宽度算，
// 同一张图会排成 4+2 vs 3+3 两张图。
const SYSTEM_WORKFLOW_ID = 'system.goal-loop';
const SYSTEM_NODES = [
  { id: 'start', type: 'start', label: 'Start', position: { x: 40, y: 100 } },
  { id: 'goal_worker', type: 'agent', label: 'Worker', agent_id: 'agent-a', prompt: '', input: '{{input.message}}', position: { x: 320, y: 100 } },
  { id: 'goal_verifier', type: 'agent', label: 'Verifier', agent_id: 'agent-a', prompt: '', input: '{{input.message}}', position: { x: 600, y: 100 } },
  { id: 'goal_gate', type: 'condition', label: 'Verdict', position: { x: 440, y: 460 } },
  { id: 'goal_loop', type: 'loop', label: 'Retry', max_loops: 3, position: { x: 500, y: 280 } },
  { id: 'output', type: 'output', label: 'End', position: { x: 40, y: 420 } },
];
const SYSTEM_EDGES = [
  { from: 'start', to: 'goal_worker' },
  { from: 'goal_worker', to: 'goal_verifier' },
  { from: 'goal_verifier', to: 'goal_gate' },
  { from: 'goal_gate', to: 'output' },
  { from: 'goal_gate', to: 'goal_loop' },
  { from: 'goal_loop', to: 'goal_worker', branch: 'retry' },
  { from: 'goal_loop', to: 'output', branch: 'exhausted' },
];
const SYSTEM_SETTINGS = {
  default_workflow_id: SYSTEM_WORKFLOW_ID,
  presets: [{
    workflow_id: SYSTEM_WORKFLOW_ID,
    display_name: 'Goal Loop',
    version: '1.0.0',
    system: true,
    custom: false,
    editable: false,
    deletable: false,
    enabled: true,
    nodes: SYSTEM_NODES,
    edges: SYSTEM_EDGES,
  }],
  custom: [],
};
const INITIAL_SETTINGS = {
  default_workflow_id: WORKFLOW_ID,
  presets: [],
  custom: [{
    workflow_id: WORKFLOW_ID,
    display_name: 'Move me',
    version: '1.0.0',
    system: false,
    custom: true,
    editable: true,
    deletable: true,
    enabled: true,
    nodes: NODES,
    edges: EDGES,
  }],
};
// 运行中的任务：start/worker/judge 已跑完，judge 选了 false 分支去 rescue（还没跑完）
// → 运行页当前「正在走」的边就是 judge→rescue，与配置页选中的那条边应当长得一模一样。
const TASK = {
  taskId: 'task-graph-sync',
  conversationId: 'conv-graph-sync',
  status: 'running',
  executionMode: 'bot',
  createdAt: '2026-09-21T10:00:00Z',
  workflowSnapshot: { workflow_id: WORKFLOW_ID, version: '1.0.0', nodes: NODES, edges: EDGES },
  workflowRun: {
    status: 'running',
    nodes: {
      start: { status: 'done' },
      worker: { status: 'done' },
      judge: { status: 'done' },
    },
  },
  eventLog: [
    { type: 'workflow_node_started', nodeId: 'start' },
    { type: 'workflow_node_finished', nodeId: 'start' },
    { type: 'workflow_node_started', nodeId: 'worker' },
    { type: 'workflow_node_finished', nodeId: 'worker' },
    { type: 'workflow_node_started', nodeId: 'judge' },
    { type: 'workflow_node_finished', nodeId: 'judge' },
    { type: 'workflow_edge_selected', fromNodeId: 'judge', toNodeId: 'rescue' },
  ],
};

function Stage() {
  const [settings, setSettings] = React.useState(() => normalizeWorkflowSettings(INITIAL_SETTINGS));
  // 页面断言脚本直接读这份状态：它同时喂给配置页和运行页（真实 app 里保存后也是同一份）。
  window.__graphState = settings;
  const workflow = settings.custom.find((item) => item.workflow_id === WORKFLOW_ID) || null;
  // 系统预设这份状态是只读的（core 里它只有启停一个保存路径）：内容两页都从定义渲染，排布来自
  // 本机的 layout store；配置页拖动只写 store，不碰定义（onSettingsChange 计数就是证据）。
  const systemSettings = React.useMemo(() => normalizeWorkflowSettings(SYSTEM_SETTINGS), []);
  const systemWorkflow = systemSettings.presets.find((item) => item.workflow_id === SYSTEM_WORKFLOW_ID) || null;
  // 「重新打开运行页」：真实 app 里从设置页回到运行页时组件是重新挂载的，这里用一个新的 workflow
  // 对象重渲染（运行页读排布的 memo 依赖它）等价地模拟这一下。
  const [systemRuntimeEpoch, setSystemRuntimeEpoch] = React.useState(0);
  window.__reopenSystemRuntime = () => flushSync(() => setSystemRuntimeEpoch((value) => value + 1));
  const systemRuntimeWorkflow = React.useMemo(
    () => (systemWorkflow ? { ...systemWorkflow } : null),
    [systemWorkflow, systemRuntimeEpoch],
  );
  return (
    <div className="panes">
      <section>
        <h2>配置页（真实 WorkflowConfigEditor）</h2>
        <div id="pane-config" className="pane">
          {/* 真实 app 里工作流配置页就在这层抽屉里（.workflow-workbench + .settings-detail-drawer）：
              画布高度靠这套 CSS 撑开，fixture 按同样结构给高度。 */}
          <div className="settings-workbench workflow-workbench provider-list-only has-detail">
            <div className="settings-detail-drawer">
              <WorkflowConfigEditor
                selectedId={WORKFLOW_ID}
                settings={settings}
                onSettingsChange={setSettings}
                agentSettings={{}}
                readOnly={false}
                canSave
                onSave={() => { window.__saved.push(settings); }}
              />
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2>运行页（真实 WorkflowRuntimePage）</h2>
        <div id="pane-runtime" className="pane">
          {workflow ? (
            <WorkflowRuntimePage
              workflow={workflow}
              task={TASK}
              agentOptions={AGENT_OPTIONS}
              composer={null}
              onOpenConfig={(workflowId) => { window.__openConfigCalls.push(workflowId); }}
              onRetry={() => {}}
            />
          ) : null}
        </div>
      </section>
      <section>
        <h2>配置页 · 系统预设（真实 WorkflowConfigEditor，画布 1180px，定义里没有保存的排布）</h2>
        <div id="pane-config-system" className="pane pane-system-config">
          <div className="settings-workbench workflow-workbench provider-list-only has-detail">
            <div className="settings-detail-drawer">
              <WorkflowConfigEditor
                selectedId={SYSTEM_WORKFLOW_ID}
                settings={systemSettings}
                onSettingsChange={() => { window.__systemSettingsChanges += 1; }}
                agentSettings={{}}
                readOnly={false}
                canSave={false}
                onSave={() => {}}
              />
            </div>
          </div>
        </div>
      </section>
      <section>
        <h2>运行页 · 系统预设（真实 WorkflowRuntimePage，画布 760px，同一张图）</h2>
        <div id="pane-runtime-system" className="pane pane-system-runtime">
          {systemRuntimeWorkflow ? (
            <WorkflowRuntimePage
              workflow={systemRuntimeWorkflow}
              task={null}
              agentOptions={AGENT_OPTIONS}
              composer={null}
              onOpenConfig={(workflowId) => { window.__openConfigCalls.push(workflowId); }}
              onRetry={() => {}}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

window.__saved = [];
// 运行页标题点击应把「要看哪个工作流的配置」交回上层；这里只记录，真跳转在 AppShell。
window.__openConfigCalls = [];
// 系统预设拖动只该写本机排布，不该碰定义：这个计数器盯着 onSettingsChange。
window.__systemSettingsChanges = 0;
// 排布存在本机 localStorage：上一轮跑剩下的排布会污染第 7 节「算出来的坐标」的断言，开跑先清掉
// （第 10 节会重新拖出一份，最后又自己重置回去）。
clearWorkflowLayout(SYSTEM_WORKFLOW_ID);
// 真实 app 也把工具提示包在外层（app.jsx）：配置页工具栏用 PortalTooltip。
flushSync(() => {
  createRoot(document.getElementById('app')).render(
    <AppTooltipProvider>
      <Stage />
    </AppTooltipProvider>,
  );
});

const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

function fireMouse(target, type, point, buttons = 1) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons,
    clientX: point.x,
    clientY: point.y,
  }));
}

function nodeElement(pane, nodeId) {
  return document.querySelector(`${pane} .react-flow__node[data-id="${nodeId}"]`);
}

// React Flow 把排布写在节点自己的 transform 上（视口的缩放/平移在父层），
// 所以这里读到的就是「定义里的坐标」，与两页各自的 zoom 无关。
function flowPosition(pane, nodeId) {
  const el = nodeElement(pane, nodeId);
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el?.style?.transform || '');
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function flowPositions(pane) {
  const out = {};
  for (const el of document.querySelectorAll(`${pane} .react-flow__node[data-id]`)) {
    const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform || '');
    out[el.dataset.id] = match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }
  return out;
}

const samePosition = (a, b) => (
  Boolean(a && b) && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
);

// 边的 DOM id 两页写法不同（配置页 "judge:false->rescue"、运行页 "judge-rescue-false"），
// 所以按 from→to 配对，而不是比 id 字符串。
function edgeElement(pane, from, to) {
  return Array.from(document.querySelectorAll(`${pane} .react-flow__edge`)).find((el) => {
    const id = el.getAttribute('data-id') || '';
    const fromIndex = id.indexOf(from);
    const toIndex = id.indexOf(to);
    return fromIndex === 0 && toIndex > fromIndex;
  }) || null;
}

function edgeStyle(pane, from, to) {
  const el = edgeElement(pane, from, to);
  const path = el?.querySelector('.react-flow__edge-path');
  if (!path) return null;
  const style = getComputedStyle(path);
  return {
    id: el.dataset.id,
    stroke: style.stroke,
    visibility: getComputedStyle(el).visibility,
    width: style.strokeWidth,
    dash: style.strokeDasharray,
    // React Flow 把边的 className 挂在 <g class="react-flow__edge ..."> 上（不是 path）。
    flowing: el.classList.contains('is-flowing'),
    labels: el.querySelectorAll('text').length,
    markerEnd: path.getAttribute('marker-end') || '',
    halo: el.querySelectorAll('.workflow-edge-halo').length,
    spark: el.querySelectorAll('.workflow-edge-spark').length,
  };
}

// 边的两个端点必须落在同一个把手上：DOM 里的把手位置带着两页各自的缩放，所以比较的是「离
// 端点最近的那个把手是谁、在哪一侧（left/right/top/bottom）」，而不是像素坐标。
function handleSide(handle) {
  return ['left', 'right', 'top', 'bottom'].find((side) => handle.classList.contains(`react-flow__handle-${side}`)) || '';
}

function edgeAnchors(pane) {
  const handles = [];
  for (const node of document.querySelectorAll(`${pane} .react-flow__node[data-id]`)) {
    const card = node.querySelector('.workflow-flow-node');
    if (!card) continue;
    for (const handle of card.querySelectorAll('.react-flow__handle')) {
      const rect = handle.getBoundingClientRect();
      handles.push({
        node: node.dataset.id,
        id: handle.getAttribute('data-handleid') || '-',
        side: handleSide(handle),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  }
  const nearest = (point) => handles.reduce((best, handle) => {
    const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
    return !best || distance < best.distance ? { ...handle, distance } : best;
  }, null);
  const pointAt = (path, length) => {
    const local = path.getPointAtLength(length);
    const ctm = path.getScreenCTM();
    return { x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f };
  };
  const out = {};
  for (const el of document.querySelectorAll(`${pane} .react-flow__edge`)) {
    const path = el.querySelector('.react-flow__edge-path');
    if (!path) continue;
    const source = nearest(pointAt(path, 0));
    const target = nearest(pointAt(path, path.getTotalLength()));
    if (!source || !target) continue;
    out[`${source.node}->${target.node}`] = {
      source: `${source.node}:${source.id}:${source.side}`,
      target: `${target.node}:${target.id}:${target.side}`,
    };
  }
  return out;
}

function iconColorOf(pane, nodeId) {
  const node = nodeElement(pane, nodeId);
  const icon = node?.querySelector('.workflow-flow-node-icon');
  return icon ? getComputedStyle(icon).backgroundColor : null;
}

async function waitForGraph() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = document.querySelectorAll('#pane-config .react-flow__node[data-id]').length >= NODES.length
      && document.querySelectorAll('#pane-runtime .react-flow__node[data-id]').length >= NODES.length
      && document.querySelectorAll('#pane-config .react-flow__edge[data-id]').length >= EDGES.length
      && document.querySelectorAll('#pane-runtime .react-flow__edge[data-id]').length >= EDGES.length
      && document.querySelectorAll('#pane-config-system .react-flow__node[data-id]').length >= SYSTEM_NODES.length
      && document.querySelectorAll('#pane-runtime-system .react-flow__node[data-id]').length >= SYSTEM_NODES.length
      && document.querySelectorAll('#pane-config-system .react-flow__edge[data-id]').length >= SYSTEM_EDGES.length
      && document.querySelectorAll('#pane-runtime-system .react-flow__edge[data-id]').length >= SYSTEM_EDGES.length;
    if (ready) return true;
    await tick(100);
  }
  return false;
}

async function dragNode(pane, nodeId, dx, dy) {
  const el = nodeElement(pane, nodeId);
  const rect = el.getBoundingClientRect();
  const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const hit = document.elementFromPoint(from.x, from.y) || el;
  fireMouse(hit, 'mousedown', from);
  for (const step of [0.2, 0.45, 0.7, 1]) {
    fireMouse(window, 'mousemove', { x: from.x + dx * step, y: from.y + dy * step });
    await tick(20);
  }
  fireMouse(window, 'mouseup', { x: from.x + dx, y: from.y + dy }, 0);
  await tick(250);
}

async function selectEdge(pane, from, to) {
  const el = edgeElement(pane, from, to);
  const path = el?.querySelector('.react-flow__edge-path');
  if (!path) return false;
  const ctm = path.getScreenCTM();
  if (!ctm) return false;
  const total = path.getTotalLength();
  for (const ratio of [0.5, 0.35, 0.65]) {
    const point = path.getPointAtLength(total * ratio);
    const screen = new DOMPoint(point.x, point.y).matrixTransform(ctm);
    const hit = document.elementFromPoint(screen.x, screen.y);
    if (!hit) continue;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      fireMouse(hit, type, screen, type === 'click' ? 0 : 1);
      await tick(30);
    }
    await tick(150);
    if (edgeStyle(pane, from, to)?.flowing) return true;
  }
  return false;
}

const stateWorkerPosition = () => {
  const node = window.__graphState.custom[0].nodes.find((item) => item.id === 'worker');
  return node?.position || null;
};

(async () => {
  try {
    log(`viewport ${window.innerWidth}x${window.innerHeight}`);
    const ready = await waitForGraph();
    log(`graph rendered: ${ready}`);
    await tick(600);

    log('—— 1. 两页都渲染真实组件 ——');
    const configNodes = document.querySelectorAll('#pane-config .react-flow__node[data-id]').length;
    const runtimeNodes = document.querySelectorAll('#pane-runtime .react-flow__node[data-id]').length;
    check(configNodes === NODES.length, `配置页渲染 ${NODES.length} 个节点（${configNodes}）`);
    check(runtimeNodes === NODES.length, `运行页渲染 ${NODES.length} 个节点（${runtimeNodes}）`);

    log('—— 2. 排布只有定义里那一份 ——');
    for (const node of NODES) {
      const expected = STORED_POSITIONS[node.id];
      const cfg = flowPosition('#pane-config', node.id);
      const rt = flowPosition('#pane-runtime', node.id);
      check(
        samePosition(cfg, expected) && samePosition(rt, expected),
        `${node.id}: 两页都在存下来的位置 (${expected.x},${expected.y})（配置 ${JSON.stringify(cfg)} / 运行 ${JSON.stringify(rt)}）`,
      );
    }

    log('—— 3. 同一条边两页一套外观 ——');
    // 运行页当前正在走的那条边（judge→rescue）自带运行态，放到第 4 项单独比。
    const ACTIVE_EDGE = { from: 'judge', to: 'rescue' };
    for (const edge of EDGES) {
      if (edge.from === ACTIVE_EDGE.from && edge.to === ACTIVE_EDGE.to) continue;
      const cfg = edgeStyle('#pane-config', edge.from, edge.to);
      const rt = edgeStyle('#pane-runtime', edge.from, edge.to);
      if (!cfg || !rt) {
        check(false, `${edge.from}→${edge.to}: 两页都渲染这条边`);
        continue;
      }
      check(
        cfg.stroke === rt.stroke && cfg.stroke === 'rgba(169, 187, 211, 0.32)',
        `${edge.from}→${edge.to}: 两页同一条中性细线（${cfg.stroke} / ${rt.stroke}）`,
      );
      check(
        cfg.width === rt.width && cfg.dash === 'none' && rt.dash === 'none',
        `${edge.from}→${edge.to}: 线宽一致、不打虚线（${cfg.width} / ${rt.width} / 虚线 ${cfg.dash || 'none'}）`,
      );
      check(cfg.halo === 0 && rt.halo === 0 && cfg.spark === 0 && rt.spark === 0, `${edge.from}→${edge.to}: 未走的边没有光晕/亮斑`);
      check(cfg.labels === 0 && rt.labels === 0, `${edge.from}→${edge.to}: 两边都没有边上的文字标签`);
      check(!cfg.markerEnd && !rt.markerEnd, `${edge.from}→${edge.to}: 两边都没有箭头 marker`);
    }

    log('—— 4. 「正在走」的边一套 ——');
    const selected = await selectEdge('#pane-config', 'judge', 'rescue');
    const cfgActive = edgeStyle('#pane-config', 'judge', 'rescue');
    const rtActive = edgeStyle('#pane-runtime', 'judge', 'rescue');
    check(selected && cfgActive?.flowing && rtActive?.flowing,
      `配置页选中的边与运行页正在走的边都带 is-flowing（配置 ${cfgActive?.flowing} / 运行 ${rtActive?.flowing}）`);
    check(cfgActive?.halo === 1 && rtActive?.halo === 1 && cfgActive?.spark === 1 && rtActive?.spark === 1,
      `流动边带软光和沿线亮斑（光晕 ${cfgActive?.halo}/${rtActive?.halo}，亮斑 ${cfgActive?.spark}/${rtActive?.spark}）`);
    check(
      cfgActive && rtActive
        && cfgActive.stroke === rtActive.stroke
        && cfgActive.stroke === 'rgba(105, 200, 246, 0.9)'
        && cfgActive.width === rtActive.width && cfgActive.width === '2px'
        && cfgActive.dash === 'none' && rtActive.dash === 'none',
      `流动边同一条运行蓝、同样加粗且不打虚线（${cfgActive?.stroke} / ${cfgActive?.width} / 虚线 ${cfgActive?.dash || 'none'}）`,
    );

    log('—— 5. 配置页拖动 → 运行页同一坐标 ——');
    const before = stateWorkerPosition();
    const cfgBefore = flowPosition('#pane-config', 'worker');
    const rtBefore = flowPosition('#pane-runtime', 'worker');
    await dragNode('#pane-config', 'worker', 84, 63);
    const after = stateWorkerPosition();
    const cfgAfter = flowPosition('#pane-config', 'worker');
    const rtAfter = flowPosition('#pane-runtime', 'worker');
    log(`position: 拖动前 ${JSON.stringify(before)} → 拖动后 ${JSON.stringify(after)}`);
    log(`配置画布 ${JSON.stringify(cfgBefore)} → ${JSON.stringify(cfgAfter)}；运行画布 ${JSON.stringify(rtBefore)} → ${JSON.stringify(rtAfter)}`);
    check(
      after && before && (after.x !== before.x || after.y !== before.y),
      '定义里的 position 被写回（拖动就是改图）',
    );
    check(after && after.x > before.x && after.y > before.y, '位置往拖动方向移动');
    check(samePosition(cfgAfter, after), '配置页停在写回的位置上');
    check(samePosition(rtAfter, after), '运行页跟着到同一坐标（同一份排布）');
    check(rtAfter && rtBefore && (rtAfter.x !== rtBefore.x || rtAfter.y !== rtBefore.y), '运行页这一次确实动了（不是一直没变）');

    log('—— 6. 运行页只读 ——');
    const lockedBefore = stateWorkerPosition();
    const lockedCfg = flowPosition('#pane-config', 'worker');
    const lockedRt = flowPosition('#pane-runtime', 'worker');
    await dragNode('#pane-runtime', 'worker', 84, 63);
    const lockedAfter = stateWorkerPosition();
    log(`运行页拖动后：定义 ${JSON.stringify(lockedAfter)}，配置画布 ${JSON.stringify(flowPosition('#pane-config', 'worker'))}，运行画布 ${JSON.stringify(flowPosition('#pane-runtime', 'worker'))}`);
    check(samePosition(lockedAfter, lockedBefore), '运行页拖动不改定义里的 position');
    check(samePosition(flowPosition('#pane-runtime', 'worker'), lockedRt), '运行页节点没有被拖走');
    check(samePosition(flowPosition('#pane-config', 'worker'), lockedCfg), '配置页也不受影响');

    log('—— 7. 系统预设：两页排出同一张图（宽度无关）——');
    const sysConfig = flowPositions('#pane-config-system');
    const sysRuntime = flowPositions('#pane-runtime-system');
    log(`系统预设坐标：配置 ${JSON.stringify(sysConfig)}；运行 ${JSON.stringify(sysRuntime)}`);
    for (const node of SYSTEM_NODES) {
      check(
        samePosition(sysConfig[node.id], sysRuntime[node.id]),
        `${node.id}: 两页同一坐标（配置 ${JSON.stringify(sysConfig[node.id])} / 运行 ${JSON.stringify(sysRuntime[node.id])}）`,
      );
    }
    check(samePosition(sysConfig.start, { x: 48, y: 96 }) && samePosition(sysConfig.goal_worker, { x: 286, y: 96 }),
      `主链从第一列排起（start ${JSON.stringify(sysConfig.start)} / goal_worker ${JSON.stringify(sysConfig.goal_worker)}）`);
    check(samePosition(sysConfig.goal_gate, { x: 762, y: 96 }), `判定在第四列（${JSON.stringify(sysConfig.goal_gate)}）`);
    // 「超限」边（goal_loop→output）过去在运行页被藏掉：配置页有它，运行页也必须画出来。
    const cfgExhausted = edgeStyle('#pane-config-system', 'goal_loop', 'output');
    const rtExhausted = edgeStyle('#pane-runtime-system', 'goal_loop', 'output');
    check(Boolean(cfgExhausted) && Boolean(rtExhausted), '超限边（Retry→End）两页都渲染');
    check(cfgExhausted?.visibility === 'visible' && rtExhausted?.visibility === 'visible',
      `超限边两页都可见（${cfgExhausted?.visibility} / ${rtExhausted?.visibility}）`);
    check(
      cfgExhausted && rtExhausted
        && cfgExhausted.stroke === rtExhausted.stroke && cfgExhausted.stroke === 'rgba(169, 187, 211, 0.32)',
      `超限边两页同一条中性线（${cfgExhausted?.stroke} / ${rtExhausted?.stroke}）`,
    );
    // 运行页这些节点还没跑过：穿的是配置页那套外观（同一个类型色图标底），不是另一套灰。
    const sysCfgIcon = iconColorOf('#pane-config-system', 'goal_worker');
    const sysRtIcon = iconColorOf('#pane-runtime-system', 'goal_worker');
    check(Boolean(sysCfgIcon) && sysCfgIcon === sysRtIcon,
      `未运行的 Worker 图标底色与配置页一致（${sysCfgIcon} / ${sysRtIcon}）`);

    log('—— 8. 运行页标题 = 回配置页的入口 ——');
    // 标题区（工作流名 + 运行状态）整块是一个真按钮：点了把工作流 id 交回上层（AppShell 打开设置页）。
    const titleButton = document.querySelector('#pane-runtime button.workflow-run-title.is-interactive');
    check(Boolean(titleButton) && titleButton.type === 'button',
      `运行页标题是一个真按钮（${titleButton ? titleButton.tagName.toLowerCase() : 'missing'}）`);
    check(String(titleButton?.getAttribute('aria-label') || '').includes('Move me'),
      `按钮带可读的 aria-label（${titleButton?.getAttribute('aria-label') || 'none'}）`);
    if (titleButton) titleButton.click();
    await tick(80);
    check(window.__openConfigCalls.includes(WORKFLOW_ID),
      `点标题把工作流 id 交回上层（${JSON.stringify(window.__openConfigCalls)}）`);

    // 闲着的运行页（系统预设那份，没在跑）：标题是正文色，不是金色；运行状态是文案 + 一颗状态点。
    const idleTitle = document.querySelector('#pane-runtime-system button.workflow-run-title.is-interactive strong');
    const idleStatus = document.querySelector('#pane-runtime-system .workflow-run-status');
    const idleStyle = idleTitle ? getComputedStyle(idleTitle) : null;
    check(idleStyle?.color === 'rgba(235, 240, 252, 0.92)', `空闲标题用正文色（${idleStyle?.color}）`);
    check(idleStyle?.backgroundImage === 'none', `空闲标题没有渐变（${idleStyle?.backgroundImage}）`);
    check(idleStatus?.textContent === 'Ready to run', `空闲状态文案（${idleStatus?.textContent}）`);
    check(idleStatus && getComputedStyle(idleStatus, '::before').content !== 'none', '状态行带一颗状态点');

    // 正在跑的那页：标题是同一颜色的流光（不是彩虹），状态行是运行蓝。
    const runningTitle = document.querySelector('#pane-runtime button.workflow-run-title.is-interactive strong');
    const runningStyle = runningTitle ? getComputedStyle(runningTitle) : null;
    const runningStatus = document.querySelector('#pane-runtime .workflow-run-status');
    check(runningTitle?.classList.contains('is-running'), '运行中标题带 is-running');
    check(runningStyle?.animationName === 'workflow-title-shimmer' && runningStyle?.animationDuration === '2s',
      `运行中标题只跑一道 2s 流光（${runningStyle?.animationName} ${runningStyle?.animationDuration}）`);
    check(!String(runningStyle?.backgroundImage || '').includes('239, 191, 100'),
      `运行中标题没有金色（${String(runningStyle?.backgroundImage || '').slice(0, 60)}）`);
    check(
      Boolean(runningStatus) && getComputedStyle(runningStatus).color === 'rgb(118, 185, 250)',
      `运行中状态行是运行蓝（${runningStatus ? getComputedStyle(runningStatus).color : 'missing'}）`,
    );

    log('—— 9. 同一条边两页接在同一个把手上 ——');
    // 过去配置页把 loop 的 retry 出口画在节点顶部、运行页画在自己那一侧：同一条边两页形状
    // 不同，看起来就是「边的端点两个都不一样」。端口只有一份来源（workflowNodePorts）。
    const cfgAnchors = edgeAnchors('#pane-config');
    const rtAnchors = edgeAnchors('#pane-runtime');
    for (const [key, anchor] of Object.entries(cfgAnchors)) {
      const other = rtAnchors[key];
      check(
        other && other.source === anchor.source && other.target === anchor.target,
        `${key}: 两页同一组端点（配置 ${anchor.source} → ${anchor.target} / 运行 ${other ? `${other.source} → ${other.target}` : 'missing'}）`,
      );
    }
    check(cfgAnchors['rescue->worker']?.source === 'rescue:retry:left'
      && cfgAnchors['rescue->worker']?.target === 'worker:runtime-feedback:bottom',
      `loop 的 retry 出口在自己那一侧、落点是主节点底部回环端口（${JSON.stringify(cfgAnchors['rescue->worker'])}）`);
    const sysCfgAnchors = edgeAnchors('#pane-config-system');
    const sysRtAnchors = edgeAnchors('#pane-runtime-system');
    for (const [key, anchor] of Object.entries(sysCfgAnchors)) {
      const other = sysRtAnchors[key];
      check(
        other && other.source === anchor.source && other.target === anchor.target,
        `系统预设 ${key}: 两页同一组端点（配置 ${anchor.source} → ${anchor.target} / 运行 ${other ? `${other.source} → ${other.target}` : 'missing'}）`,
      );
    }
    check(sysCfgAnchors['goal_loop->goal_worker']?.source === 'goal_loop:retry:left',
      `系统预设的 retry 出口两页同侧（${sysCfgAnchors['goal_loop->goal_worker']?.source}）`);

    log('—— 10. 系统预设：拖得动、存得下、运行页同步 ——');
    // 系统预设的内容在 core 里不能改，但排布应该能自由拖：拖完存在本机（workflow-layout-store），
    // 运行页读同一份——不靠「另存为自定义副本」这种绕路。
    const sysPane = document.querySelector('#pane-config-system');
    sysPane.scrollIntoView({ block: 'center' });
    await tick(160);
    nodeElement('#pane-config-system', 'goal_worker')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, composed: true, view: window, button: 0,
    }));
    await tick(400);
    const resetButton = sysPane.querySelector('.settings-workbench button[aria-label="Reset layout"]');
    check(Boolean(resetButton), `系统预设的工具条留了「重置排布」（${resetButton ? resetButton.tagName.toLowerCase() : 'missing'}）`);
    check(resetButton?.disabled === true, '还没拖过时「重置排布」是灰的（本机没有存下来的排布）');
    check(!document.querySelector('#pane-config button[aria-label="Reset layout"]'), '可编辑工作流不摆这个按钮（它的排布跟着定义走，有自己的保存）');

    const sysBefore = flowPosition('#pane-config-system', 'goal_worker');
    await dragNode('#pane-config-system', 'goal_worker', 120, 64);
    const sysDragged = flowPosition('#pane-config-system', 'goal_worker');
    const storedLayout = savedWorkflowLayout(SYSTEM_WORKFLOW_ID);
    log(`系统预设拖动：${JSON.stringify(sysBefore)} → ${JSON.stringify(sysDragged)}；本机存下 ${storedLayout.size} 个节点`);
    check(
      Boolean(sysDragged && sysBefore) && (sysDragged.x !== sysBefore.x || sysDragged.y !== sysBefore.y),
      '系统预设的节点拖得动',
    );
    check(sysDragged.x > sysBefore.x && sysDragged.y > sysBefore.y, '位置往拖动方向移动');
    check(samePosition(storedLayout.get('goal_worker'), sysDragged), '拖完就存：本机存下的就是画布上的位置');
    check(storedLayout.size === SYSTEM_NODES.length, `存的是整张画布（${storedLayout.size}/${SYSTEM_NODES.length}）`);
    check(window.__systemSettingsChanges === 0, `拖排布没有写定义（onSettingsChange ${window.__systemSettingsChanges} 次）`);
    check(resetButton?.disabled === false, '存下排布后「重置排布」可用');

    window.__reopenSystemRuntime();
    await tick(340);
    const reopened = flowPositions('#pane-runtime-system');
    const sysConfigNow = flowPositions('#pane-config-system');
    check(
      samePosition(reopened.goal_worker, sysDragged),
      `重新打开运行页读到同一排布（配置 ${JSON.stringify(sysDragged)} / 运行 ${JSON.stringify(reopened.goal_worker)}）`,
    );
    check(
      SYSTEM_NODES.every((node) => samePosition(reopened[node.id], sysConfigNow[node.id])),
      '整张画布两页逐节点一致（不只是拖过的那一个）',
    );
    check(!document.querySelector('#pane-runtime-system button[aria-label="Reset layout"]'), '运行页还是只读：没有重置排布这种入口');

    resetButton.click();
    await tick(340);
    check(samePosition(flowPosition('#pane-config-system', 'goal_worker'), sysBefore),
      `重置回算出来的位置（${JSON.stringify(flowPosition('#pane-config-system', 'goal_worker'))}）`);
    check(savedWorkflowLayout(SYSTEM_WORKFLOW_ID).size === 0, '重置后本机不再存这份排布');
    check(resetButton.disabled === true, '重置后按钮又灰了');
    window.__reopenSystemRuntime();
    await tick(340);
    check(samePosition(flowPosition('#pane-runtime-system', 'goal_worker'), sysBefore), '运行页也回到算出来的位置');
    check(window.__systemSettingsChanges === 0, `重置也没有写定义（onSettingsChange ${window.__systemSettingsChanges} 次）`);

    check(window.__saved.length <= 1, `保存回调没有被拖动自动触发（${window.__saved.length}）`);
    check(window.__pageErrors.length === 0, `页面无报错（${window.__pageErrors.join(' | ') || 'none'}）`);

    report.dataset.result = failures.length ? 'FAIL' : 'PASS';
    log(failures.length ? `✗ ${failures.length} 项不一致` : 'ALL PASS — 配置页与运行页共用一张图（外观 + 排布（含系统预设拖存）+ 只读运行页 + 标题回配置页 + 边的端点）');
    window.__graphSync = {
      failures,
      openConfigCalls: window.__openConfigCalls,
      anchors: { config: cfgAnchors, runtime: rtAnchors, system: { config: sysCfgAnchors, runtime: sysRtAnchors } },
      positions: flowPositions('#pane-config'),
      runtimePositions: flowPositions('#pane-runtime'),
      systemPositions: { config: flowPositions('#pane-config-system'), runtime: flowPositions('#pane-runtime-system') },
      state: window.__graphState.custom[0].nodes.map((node) => ({ id: node.id, position: node.position })),
    };
  } catch (error) {
    report.dataset.result = 'FAIL';
    log(`FAIL ${error && (error.stack || error.message) || String(error)}`);
    window.__graphSync = { error: String(error && (error.stack || error.message) || error) };
  }
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeWorkflowNode, payloadForCustomWorkflow } from '../../src/features/workflow/model/workflow-catalog.js';
import { workflowArrangementPositions } from '../../src/features/workflow/model/runtime-workflow-layout.js';
import {
  clearWorkflowLayout,
  saveWorkflowLayout,
  savedWorkflowLayout,
} from '../../src/features/workflow/model/workflow-layout-store.js';

const baseStyles = fs.readFileSync(new URL('../../styles/app-shell.css', import.meta.url), 'utf8');
const runtimeStyles = fs.readFileSync(new URL('../../styles/workflow-runtime.css', import.meta.url), 'utf8');
const editorSource = fs.readFileSync(
  new URL('../../src/features/settings/components/WorkflowConfigEditor.jsx', import.meta.url),
  'utf8',
);
const runtimeSource = fs.readFileSync(
  new URL('../../src/features/workflow/components/WorkflowRuntimePage.jsx', import.meta.url),
  'utf8',
);
const flowNodeSource = fs.readFileSync(
  new URL('../../src/features/workflow/components/WorkflowFlowNode.jsx', import.meta.url),
  'utf8',
);

test('workflow node palette has a single home and the runtime layer only consumes it', () => {
  const accents = {
    agent: '#68aeff',
    start: '#55d6a0',
    llm: '#9299ff',
    tool: '#65d4ba',
    condition: '#9299ff',
    human_approval: '#b494ff',
    loop: '#56cbd4',
    output: '#bf90f5',
  };
  for (const [type, accent] of Object.entries(accents)) {
    assert.match(
      baseStyles,
      new RegExp(`\\.workflow-flow-node\\.${type} \\{ --node-type-accent: ${accent}; \\}`),
      `${type} 的类型色只许在 app-shell.css 里定义一次`,
    );
  }
  // 边不再按两种类型色渐变，JS 里也不该再留一份类型色镜像——只有一个定义处。
  assert.doesNotMatch(flowNodeSource, /WORKFLOW_NODE_TYPE_COLORS|workflowNodeTypeColor/);
  // 运行层不许再自带一套类型色：完成/审批态通过 var(--node-type-accent) 复用同一份。
  assert.doesNotMatch(runtimeStyles, /--node-type-accent:/);
  assert.match(runtimeStyles, /--node-accent: var\(--node-type-accent\);/);
});

test('node card geometry, icon tile and the single-layer selection highlight are shared by both pages', () => {
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*height: 72px;/);
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*border: 1px solid rgba\(176, 206, 255, 0\.2\);/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node-icon \{[^}]*background: color-mix\(in srgb, var\(--node-type-accent\) 22%, transparent\);/,
  );
  // 选中高亮只有一层：描边亮成类型色 + 一圈柔光。过去那条灰白外圈（`outline: 1px solid` 一个
  // 浅冷灰）和贴着描边的 `0 0 0 1px` 环都删了——叠在同一条描边上就是「两个框再套一层白框」。
  assert.doesNotMatch(baseStyles, /outline: 1px solid #aebdd3/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node\.active \{[^}]*outline:/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node:hover,\n\.workflow-flow-node\.active \{[^}]*0 0 0 1px/);
  // 运行层不许再补第二份尺寸/描边/选中态。
  assert.doesNotMatch(runtimeStyles, /\.is-runtime \{[^}]*height: 72px/);
  assert.doesNotMatch(runtimeStyles, /outline: 1px solid #aebdd3/);
  // 悬停/选中不再一律黄光，改用节点自己的类型色（配置页和运行页同一套规则）。
  assert.doesNotMatch(baseStyles, /rgba\(239, 191, 100, 0\.56\)/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node:hover,\n\.workflow-flow-node\.active \{\n {4}border-color: color-mix\(in srgb, var\(--node-type-accent\) 62%, transparent\);/,
  );
});

test('runtime keeps only its status skin and collapsed handles on top of the shared set', () => {
  assert.match(runtimeStyles, /\.status-running \{ --node-accent: #76b9fa; \}/);
  assert.match(
    runtimeStyles,
    /\.workflow-flow-node\.status-done,\n\.workflow-run-canvas \.workflow-flow-node\.status-approved \{ --node-accent: var\(--node-type-accent\); \}/,
  );
  // 未运行的节点不再另配灰色皮肤：图标底色/字色跟随 --node-accent（默认就是类型色）。
  assert.match(
    runtimeStyles,
    /\.workflow-flow-node\.is-runtime \.workflow-flow-node-icon \{\n {4}background: color-mix\(in srgb, var\(--node-accent\) 22%, transparent\);\n {4}color: var\(--node-accent\);\n\}/,
  );
  assert.doesNotMatch(runtimeStyles, /#98a5ba|#a6b3c8|rgba\(164, 178, 203, 0\.08\)/);
  assert.match(runtimeStyles, /\.is-runtime\.status-running::after \{/);
  assert.match(runtimeStyles, /animation: workflow-node-live /);
  // 连接点（把手）也不许再分两套：外观只在基础层写一份，运行层不再改写（见下一条测试）。
  assert.doesNotMatch(runtimeStyles, /react-flow__handle/);
  assert.doesNotMatch(baseStyles, /background: #efbf64/);
});

test('one handle look for both pages: a neutral dot revealed on hover/selection', () => {
  // 配置页与运行页的「边的端点」必须是同一套：中性小圆点、尺寸只写一次、平时收起。
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*width: 6px;/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*height: 6px;/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*background: rgba\(169, 187, 211, 0\.9\);/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*opacity: 0;/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node:hover \.react-flow__handle,\n\.workflow-flow-node\.active \.react-flow__handle,\n\.workflow-flow-node \.react-flow__handle\.connectingfrom,\n\.workflow-flow-node \.react-flow__handle\.connectingto,\n\.workflow-flow-node \.react-flow__handle\.clickconnecting \{\n {4}opacity: 1;\n\}/,
  );
  // React Flow 给所有把手都挂 connectionindicator（Handle 的 isConnectable 默认 true），拿它
  // 当「露出来」的条件等于两页永远显示小圆点——收起就白收了，这里只能用拖线中才有的类。
  assert.doesNotMatch(baseStyles, /connectionindicator[^}]*\{[^}]*opacity: 1/);
  // 老的两套都不许回来：配置页 12px 常显大圆点、各自挪把手位置。
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*width: 12px;/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle-left \{\n {4}left: -7px;/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle-right \{\n {4}right: -7px;/);
  // 分支把手也只是位置不同，没有自己的颜色/尺寸/位置覆盖。
  assert.doesNotMatch(baseStyles, /\.workflow-condition-handle\.[\w-]+[^{]*\{[^}]*background:/);
  assert.doesNotMatch(baseStyles, /\.workflow-condition-handle\.[\w-]+[^{]*\{[^}]*bottom:/);
});

test('node ports and the rework target come from one helper for both pages', () => {
  // 端口（含 loop 的 retry 出口）只有一份来源：两页都调 workflowNodePorts。
  assert.match(flowNodeSource, /export function workflowNodePorts\(node, layoutMeta\) \{/);
  assert.match(flowNodeSource, /branchSourcePositions: secondary && node\?\.type === 'loop' \? \{ retry: sourcePosition \} : undefined,/);
  assert.match(editorSource, /\.\.\.workflowNodePorts\(node, layout\.meta\.get\(String\(node\.id\)\)\),/);
  assert.match(runtimeSource, /\.\.\.workflowNodePorts\(node, layoutMeta\),/);
  // 回环端口（次级→主链那条边的落点）同样只有一份判断。
  assert.match(flowNodeSource, /export function workflowFeedbackTargetIds\(edges, layoutMeta\) \{/);
  assert.match(editorSource, /workflowFeedbackTargetIds\(edges, layout\.meta\)/);
  assert.match(runtimeSource, /workflowFeedbackTargetIds\(workflow\?\.edges, layout\.meta\)/);
  // 两页都不许再各写一份端口数学：配置页曾把 loop 的 retry 出口画在节点顶部、运行页画在
  // 自己那一侧，同一条边两页形状不同（肉眼就是「边的端点两个都不一样」）。
  assert.doesNotMatch(editorSource, /sourcePosition: layout\.meta/);
  assert.doesNotMatch(editorSource, /targetPosition: layout\.meta/);
  assert.doesNotMatch(runtimeSource, /sourcePosition: secondary/);
  assert.doesNotMatch(runtimeSource, /targetPosition: secondary/);
  assert.doesNotMatch(runtimeSource, /branchSourcePositions: secondary/);
});

test('editor and runtime register the very same node component', () => {
  assert.match(editorSource, /const WORKFLOW_REACT_FLOW_NODE_TYPES = \{ workflowNode: WorkflowFlowNode \};/);
  assert.match(runtimeSource, /const NODE_TYPES = \{ workflowNode: WorkflowFlowNode \};/);
});

test('edges have one appearance and one motion layer for both pages', () => {
  // 平时 = 一条中性细线（不再按源/目标类型色渐变）；正在走的那条 = 运行蓝、加粗、软光 +
  // 沿线亮斑。颜色/线宽只有 workflowEdgeAppearance 一份，画法只有 WorkflowCanvasEdge 一份。
  assert.match(flowNodeSource, /export function WorkflowCanvasEdge\(\{/);
  assert.match(flowNodeSource, /getSmoothStepPath\(\{/);
  assert.doesNotMatch(flowNodeSource, /linearGradient|gradientUnits|stopColor|sourceColor|targetColor/);
  assert.match(flowNodeSource, /rgba\(105, 200, 246, 0\.9\)/);
  assert.match(flowNodeSource, /rgba\(169, 187, 211, 0\.32\)/);
  assert.match(flowNodeSource, /className: active \? 'is-flowing' : \(traversed \? 'is-traversed' : ''\)/);
  assert.match(flowNodeSource, /sourceHandle: edge\?\.branch \|\| undefined,/);
  assert.match(flowNodeSource, /interactionWidth: 28,/);
  // 配置页不再自己配一套分支色/标签/箭头。
  assert.doesNotMatch(flowNodeSource, /markerEnd|MarkerType|labelStyle|labelBgStyle/);
  assert.doesNotMatch(editorSource, /markerEnd|labelStyle|labelBgStyle|ArrowClosed/);
  // 运行层也不许另写一份边的描边，更不许把图里已有的边藏掉（配置页有、运行页没有 = 两张图）。
  assert.doesNotMatch(runtimeSource, /stroke: 'rgba\(169, 187, 211, 0\.32\)'/);
  assert.doesNotMatch(runtimeSource, /sourceType|targetType/);
  assert.doesNotMatch(runtimeSource, /hidden:/);
  // 两页注册同一个自定义边（同一份渲染器）；配置页的选中 = 运行页的 flowing，走同一套外观。
  assert.match(editorSource, /const WORKFLOW_REACT_FLOW_EDGE_TYPES = \{ workflowEdge: WorkflowCanvasEdge \};/);
  assert.match(editorSource, /edgeTypes=\{WORKFLOW_REACT_FLOW_EDGE_TYPES\}/);
  assert.match(runtimeSource, /const EDGE_TYPES = \{ workflowEdge: WorkflowCanvasEdge \};/);
  assert.match(runtimeSource, /edgeTypes=\{EDGE_TYPES\}/);
  assert.match(editorSource, /workflowEdgeAppearance\(edge, \{\s*active: isSelected,/);
  assert.match(runtimeSource, /workflowEdgeAppearance\(edge, \{\s*active,/);
  assert.match(runtimeSource, /traversed,/);
  // 动效（软光 + 流动亮斑）只在基础层写一次，运行层不再留一份，老的虚线流动已经删掉。
  assert.match(baseStyles, /\.workflow-canvas \.react-flow__edge\.is-flowing \.react-flow__edge-path \{/);
  assert.match(baseStyles, /@keyframes workflow-edge-spark \{/);
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-spark \{/);
  assert.doesNotMatch(baseStyles, /workflow-edge-flow/);
  assert.doesNotMatch(runtimeStyles, /is-flowing/);
});

test('graph edits live in the config page and both pages read the saved arrangement', () => {
  // 配置页拖动节点 = 改图：把画布上当前的整张排布写进工作流定义，保存后运行页读同一份。
  assert.match(editorSource, /const arrangedNodes = \(overrides = new Map\(\)\) => \{/);
  assert.match(editorSource, /if \(nextNodes\.some\(\(item, index\) => item !== nodes\[index\]\)\) updateWorkflow\(\{ nodes: nextNodes \}\);/);
  assert.match(editorSource, /workflowArrangementPositions\(workflow\)/);
  assert.match(runtimeSource, /workflowArrangementPositions\(workflow\)/);
  assert.match(editorSource, /position: arrangement\.get\(String\(node\.id\)\) \|\| layout\.positions\.get/);
  assert.match(runtimeSource, /position: arrangement\.get\(id\) \|\| layout\.positions\.get/);
  // 运行页是只读视图：不拖、不写回。
  assert.match(runtimeSource, /nodesDraggable=\{false\}/);
  assert.doesNotMatch(runtimeSource, /onNodeDragStop|draggedNodePositionsRef/);
  // 配置页里永远能拖（可编辑的写回定义；系统预设写进本机 layout store）。
  assert.match(editorSource, /\n\s*nodesDraggable\n/);
  assert.doesNotMatch(editorSource, /nodesDraggable=\{isEditable\}/);
  assert.match(editorSource, /draggable: true,/);
  assert.doesNotMatch(runtimeSource, /draggable: true,/);
  // 系统预设：拖完就存（整张画布），运行页读同一份；重置只清本机那一份。
  assert.match(editorSource, /saveWorkflowLayout\(workflow\.workflow_id, capturedLayoutPositions\(overrides\)\);/);
  assert.match(editorSource, /clearWorkflowLayout\(workflowId\);/);
  assert.match(editorSource, /const showLayoutTools = !readOnly && !workflow\.custom;/);
  assert.match(editorSource, /label="Reset layout"/);
  assert.match(editorSource, /Drag nodes to rearrange · saves automatically/);
  // 运行页还是只读：不写排布、也没有保存/重置入口。
  assert.doesNotMatch(runtimeSource, /saveWorkflowLayout|clearWorkflowLayout/);
});

test('a preset layout dragged in the editor is saved locally and read by both pages', () => {
  const memoryStorage = () => {
    const values = new Map();
    return {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
  };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: memoryStorage() };
  try {
    // 系统预设的定义里没有排布（core 不存），拖出来的那一份只能存在本机这家店里。
    const preset = {
      workflow_id: 'system.goal-loop',
      system: true,
      nodes: [{ id: 'goal_worker', type: 'agent', position: { x: 320, y: 100 } }],
    };
    assert.equal(workflowArrangementPositions(preset).size, 0);
    saveWorkflowLayout('system.goal-loop', new Map([['goal_worker', { x: 466.4, y: 161.6 }]]));
    assert.deepEqual([...savedWorkflowLayout('system.goal-loop')], [['goal_worker', { x: 466, y: 162 }]]);
    assert.deepEqual(workflowArrangementPositions(preset).get('goal_worker'), { x: 466, y: 162 });
    // 可编辑工作流的定义位置仍然说话更算数（本机这份不许盖掉它）。
    const custom = {
      workflow_id: 'system.goal-loop',
      custom: true,
      nodes: [{ id: 'goal_worker', type: 'agent', position: { x: 40, y: 120 } }],
    };
    assert.deepEqual(workflowArrangementPositions(custom).get('goal_worker'), { x: 40, y: 120 });
    clearWorkflowLayout('system.goal-loop');
    assert.equal(workflowArrangementPositions(preset).size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a node without a stored position is not pinned to the origin', () => {
  assert.equal(normalizeWorkflowNode({ id: 'agent_1', type: 'agent' }).position, undefined);
  assert.deepEqual(
    normalizeWorkflowNode({ id: 'agent_1', type: 'agent', position: { x: 40, y: 100 } }).position,
    { x: 40, y: 100 },
  );
  const custom = {
    custom: true,
    system: false,
    nodes: [
      { id: 'start', type: 'start', position: { x: 40, y: 120 } },
      { id: 'agent_1', type: 'agent' },
    ],
  };
  assert.deepEqual([...workflowArrangementPositions(custom)], [['start', { x: 40, y: 120 }]]);
  assert.equal(workflowArrangementPositions({ system: true, nodes: custom.nodes }).size, 0);
  // 保存时排布要跟着走：payload 不能把 position 过滤掉（core 会原样存回来）。
  const payload = payloadForCustomWorkflow({
    workflow_id: 'custom.move',
    display_name: 'Move',
    nodes: custom.nodes,
    edges: [{ from: 'start', to: 'agent_1' }],
  });
  assert.deepEqual(payload.nodes.map((node) => node.position), [{ x: 40, y: 120 }, undefined]);
});

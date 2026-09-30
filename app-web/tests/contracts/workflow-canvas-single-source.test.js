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
    agent: '#389dff',
    start: '#24dd98',
    llm: '#9299ff',
    tool: '#65d4ba',
    condition: '#b570ff',
    human_approval: '#b494ff',
    loop: '#35deec',
    output: '#bf79ff',
  };
  for (const [type, accent] of Object.entries(accents)) {
    // 色板只在画布那一层定义一次，节点类只引用变量（连线的渐变也引用同一批变量）。
    assert.match(baseStyles, new RegExp(`--workflow-accent-${type}: ${accent};`), `${type} 的类型色只许在 app-shell.css 里定义一次`);
    assert.match(
      baseStyles,
      new RegExp(`\\.workflow-flow-node\\.${type} \\{ --node-type-accent: var\\(--workflow-accent-${type}\\); \\}`),
      `${type} 的卡片主题色引用同一份色板`,
    );
    assert.doesNotMatch(flowNodeSource, new RegExp(accent), '类型色只在 CSS 里写一次，JS 只引用变量');
  }
  assert.match(baseStyles, /\.workflow-canvas \{[^}]*--workflow-accent-start: #24dd98;/);
  assert.match(flowNodeSource, /const WORKFLOW_ACCENT_VARS = \{\n {2}start: 'var\(--workflow-accent-start\)',/);
  assert.match(flowNodeSource, /export function workflowNodeAccent\(nodeType\) \{/);
  // 运行层不许再自带一套类型色：完成/审批态通过 var(--node-type-accent) 复用同一份。
  assert.doesNotMatch(runtimeStyles, /--node-type-accent:/);
  assert.match(runtimeStyles, /--node-accent: var\(--node-type-accent\);/);
});

test('node card geometry, icon tile and the single-layer selection highlight are shared by both pages', () => {
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*height: 64px;/);
  // 卡片主题色只有一份来源：--node-accent 默认就是类型色，描边/底渐变/柔光都从它派生
  // （运行页只是把 --node-accent 换成状态色，规则不重写）。
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*--node-accent: var\(--node-type-accent\);/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node \{[^}]*border: 1\.5px solid var\(--node-accent\);/,
  );
  // 深色半透明底 + 一点蓝黑渐变（左上角带一点主题色），底下的 dot grid 透出来一点（不是一块实心卡片）。
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*radial-gradient\(100% 180% at 0% 0%, color-mix\(in srgb, var\(--node-accent\) 10%,/);
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*linear-gradient\(180deg, color-mix\(in srgb, var\(--node-accent\) 18%,/);
  assert.doesNotMatch(baseStyles, /\n {8}linear-gradient\(180deg, rgba\(24, 34, 52, 0\.96\), rgba\(12, 18, 30, 0\.96\)\);/);
  // 默认只是一圈很轻的 glow：描边 accent + 20px/24% 的外光圈，不亮；选中才到 30px/38%。
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*0 0 24px color-mix\(in srgb, var\(--node-accent\) 14%, transparent\),/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node-icon \{[^}]*background: linear-gradient\(145deg, color-mix\(in srgb, var\(--node-accent\) 54%, #102454\), color-mix\(in srgb, var\(--node-accent\) 36%, #102454\)\);/,
  );
  // 选中高亮只有一层：描边亮成 accent + 一圈柔光。过去那条灰白外圈（`outline: 1px solid` 一个
  // 浅冷灰）和贴着描边的 `0 0 0 1px` 环都删了——叠在同一条描边上就是「两个框再套一层白框」。
  assert.doesNotMatch(baseStyles, /outline: 1px solid #aebdd3/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node\.active \{[^}]*outline:/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node:hover,\n\.workflow-flow-node\.active \{[^}]*0 0 0 1px/);
  // 运行层不许再补第二份尺寸/描边/选中态。
  assert.doesNotMatch(runtimeStyles, /\.is-runtime \{[^}]*height: 72px/);
  assert.doesNotMatch(runtimeStyles, /outline: 1px solid #aebdd3/);
  // 悬停/选中不再一律黄光，改用节点自己的主题色（配置页和运行页同一套规则），默认态亮度
  // 明显低于悬停态（24% → 38%）。
  assert.doesNotMatch(baseStyles, /rgba\(239, 191, 100, 0\.56\)/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node\.active \{\n {4}border-color: color-mix\(in srgb, var\(--node-accent\) 96%, transparent\);\n {4}box-shadow:\n {8}0 16px 36px rgba\(0, 0, 0, 0\.36\),\n {8}0 0 30px color-mix\(in srgb, var\(--node-accent\) 38%, transparent\),/,
  );
});

test('runtime keeps only its status skin and collapsed handles on top of the shared set', () => {
  assert.match(runtimeStyles, /\.status-running \{ --node-accent: var\(--node-type-accent\); \}/);
  assert.match(
    runtimeStyles,
    /\.workflow-flow-node\.status-done,\n\.workflow-run-canvas \.workflow-flow-node\.status-approved \{ --node-accent: var\(--node-type-accent\); \}/,
  );
  // 未运行的节点不再另配灰色皮肤，图标块也不再重写（读的就是 --node-accent，默认就是类型色）。
  assert.doesNotMatch(runtimeStyles, /workflow-flow-node-icon/);
  assert.doesNotMatch(runtimeStyles, /#98a5ba|#a6b3c8|rgba\(164, 178, 203, 0\.08\)/);
  assert.match(runtimeStyles, /\.is-runtime\.status-running::after \{/);
  assert.match(runtimeStyles, /animation: workflow-node-live /);
  // 跑完的节点不再压一层更暗的底/光（只在描边上收一点亮度）：压下去会盖掉 .active 的选中柔光，
  // 也会让同一张图在运行页和配置页长得不一样。
  const doneBlock = runtimeStyles.slice(
    runtimeStyles.indexOf('.workflow-run-canvas .workflow-flow-node.is-runtime.status-done,'),
  ).slice(0, runtimeStyles.slice(
    runtimeStyles.indexOf('.workflow-run-canvas .workflow-flow-node.is-runtime.status-done,'),
  ).indexOf('}'));
  assert.match(doneBlock, /border-color: var\(--node-accent\);/);
  assert.doesNotMatch(doneBlock, /box-shadow|background:/);
  // 连接点（把手）也不许再分两套：外观只在基础层写一份，运行层不再改写（见下一条测试）。
  assert.doesNotMatch(runtimeStyles, /react-flow__handle/);
  assert.doesNotMatch(baseStyles, /background: #efbf64/);
});

test('one handle look for both pages: a solid glowing dot in the node accent', () => {
  // 配置页与运行页的「边的端点」必须是同一套：实心小圆点、颜色跟节点主题色（--node-accent）、
  // 尺寸只写一次、外面一圈暗色细边把点和卡片分开；悬停/选中/拉线时稍微放大、光更强。
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*width: 9px;/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*height: 9px;/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*background: var\(--node-accent\);/);
  assert.match(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*opacity: 1;/);
  assert.match(
    baseStyles,
    /\.workflow-flow-node \.react-flow__handle \{[^}]*box-shadow:\n {8}inset 0 0 0 1px rgba\(220, 255, 255, 0\.22\),\n {8}0 0 10px color-mix\(in srgb, var\(--node-accent\) 48%, transparent\);/,
  );
  assert.match(
    baseStyles,
    /\.workflow-flow-node\.active \.react-flow__handle,\n\.workflow-flow-node \.react-flow__handle\.connectingfrom,\n\.workflow-flow-node \.react-flow__handle\.connectingto,\n\.workflow-flow-node \.react-flow__handle\.clickconnecting \{\n {4}width: 11px;\n {4}height: 11px;/,
  );
  // 老的两套都不许回来：配置页 12px 常显大圆点、中性灰点、收起态（拖线时得能看见把手位置）、
  // 各自挪把手位置。
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*width: 12px;/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*background: rgba\(169, 187, 211, 0\.9\);/);
  assert.doesNotMatch(baseStyles, /\.workflow-flow-node \.react-flow__handle \{[^}]*opacity: 0;/);
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
  // 角色配色（主流程/支路/回环/收尾）只有 WORKFLOW_EDGE_ROLES 一份，画法只有 WorkflowCanvasEdge 一份：
  // 两页只是把 layout + 目标类型交给同一个函数，不自己配色、不自己画箭头/标签。
  assert.match(flowNodeSource, /export function WorkflowCanvasEdge\(\{/);
  assert.match(flowNodeSource, /export const WORKFLOW_EDGE_ROLES = \{/);
  // 边的几何只有一份：两页共用的渲染器调 model/workflow-edge-path.js（不是 React Flow 默认折线）。
  assert.match(flowNodeSource, /const \{ path, labelX, labelY \} = workflowEdgePath\(\{/);
  assert.doesNotMatch(flowNodeSource, /getSmoothStepPath/);
  // 主流程/收尾是「源类型色 → 目标类型色」的渐变（userSpaceOnUse，沿着这一段线铺）：整页只有一条
  // 渐变定义、两个 stop，颜色引用类型色变量（JS 里没有第二份十六进制）。
  assert.equal((flowNodeSource.match(/<linearGradient/g) || []).length, 1);
  assert.match(flowNodeSource, /gradientUnits="userSpaceOnUse"/);
  assert.equal((flowNodeSource.match(/<stop /g) || []).length, 2);
  assert.match(flowNodeSource, /<stop offset="0%" style=\{\{ stopColor: paint\.from \}\} \/>/);
  assert.match(flowNodeSource, /<stop offset="100%" style=\{\{ stopColor: paint\.to \}\} \/>/);
  assert.match(flowNodeSource, /const ACTIVE_EDGE_STROKE = 'rgba\(105, 200, 246, 0\.9\)';/);
  assert.match(flowNodeSource, /main: \{ gradient: true, strokeWidth: 2, opacity: 0\.78 \},/);
  assert.match(flowNodeSource, /end: \{ gradient: true, strokeWidth: 2, opacity: 0\.62, arrow: true \},/);
  assert.match(flowNodeSource, /detour: \{ stroke: 'rgba\(122, 176, 245, 0\.92\)', strokeWidth: 2, dash: '10 7', arrow: true \},/);
  assert.match(flowNodeSource, /loopback: \{ stroke: 'rgba\(104, 220, 240, 0\.95\)', strokeWidth: 2, dash: '10 7', arrow: true \},/);
  // 渐变的两端就是节点的类型色变量（和描边/图标同一份色板）；纯色边走 solid。
  assert.match(
    flowNodeSource,
    /paint: base\.gradient\n {8}\? \{ from: workflowNodeAccent\(sourceType\), to: workflowNodeAccent\(targetType\) \}\n {8}: \{ solid: base\.stroke \},/,
  );
  assert.match(flowNodeSource, /className: active \? 'is-flowing' : \(traversed \? 'is-traversed' : ''\)/);
  assert.match(flowNodeSource, /sourceHandle: branch \|\| undefined,/);
  assert.match(flowNodeSource, /interactionWidth: 28,/);
  // 主流程不打虚线、不画标签/箭头：虚线（10/7 均匀间距）与 7px 小三角只给回路/支路/收尾。
  assert.equal((flowNodeSource.match(/dash: '10 7'/g) || []).length, 2);
  assert.match(flowNodeSource, /label: circuit && branch/);
  assert.match(flowNodeSource, /defaultCase && targetType === 'loop' \? 'Need retry'/);
  assert.equal((flowNodeSource.match(/<marker/g) || []).length, 1);
  assert.match(flowNodeSource, /markerUnits="userSpaceOnUse"/);
  assert.match(flowNodeSource, /markerWidth=\{7\}/);
  assert.equal((flowNodeSource.match(/markerEnd=/g) || []).length, 1);
  assert.doesNotMatch(flowNodeSource, /MarkerType|ArrowClosed/);
  // 标签 pill 只在共享渲染器里画（EdgeLabelRenderer），不用 React Flow 自带的 label 样式 props。
  assert.equal((flowNodeSource.match(/<EdgeLabelRenderer>/g) || []).length, 1);
  assert.match(flowNodeSource, /className="workflow-edge-label"/);
  assert.doesNotMatch(flowNodeSource, /labelStyle|labelBgStyle|labelBgBorderRadius/);
  assert.deepEqual(
    ['Need retry', 'Max retries'].map((label) => (
      (flowNodeSource.match(/edgeLabel: '([^']+)'/g) || [])
        .map((entry) => entry.replace(/edgeLabel: '|'/g, ''))
        .includes(label)
    )),
    [true, true],
  );
  assert.doesNotMatch(editorSource, /markerEnd|labelStyle|labelBgStyle|ArrowClosed/);
  // 运行层也不许另写一份边的描边，更不许把图里已有的边藏掉（配置页有、运行页没有 = 两张图）。
  assert.doesNotMatch(runtimeSource, /stroke: 'rgba\(/);
  assert.doesNotMatch(runtimeSource, /hidden:/);
  // 角色要按「源/目标节点类型」分辨（进 output 那条走低亮紫、主链是源→目标渐变），两页都把类型
  // 传给同一个外观函数——少传一个，渐变两端就会退化成默认色，同一条边两页颜色不一样。
  assert.match(editorSource, /sourceType: nodeTypeById\.get\(String\(edge\.from\)\) \|\| '',/);
  assert.match(runtimeSource, /sourceType: nodeById\.get\(source\)\?\.type \|\| '',/);
  assert.match(editorSource, /targetType: nodeTypeById\.get\(String\(edge\.to\)\) \|\| '',/);
  assert.match(runtimeSource, /targetType: nodeById\.get\(target\)\?\.type \|\| '',/);
  // 两页注册同一个自定义边（同一份渲染器）；配置页的选中 = 运行页的 flowing，走同一套外观。
  assert.match(editorSource, /const WORKFLOW_REACT_FLOW_EDGE_TYPES = \{ workflowEdge: WorkflowCanvasEdge \};/);
  assert.match(editorSource, /edgeTypes=\{WORKFLOW_REACT_FLOW_EDGE_TYPES\}/);
  assert.match(runtimeSource, /const EDGE_TYPES = \{ workflowEdge: WorkflowCanvasEdge \};/);
  assert.match(runtimeSource, /edgeTypes=\{EDGE_TYPES\}/);
  assert.match(editorSource, /workflowEdgeAppearance\(edge, \{\s*active: isSelected,/);
  assert.match(runtimeSource, /workflowEdgeAppearance\(edge, \{\s*active,/);
  assert.match(runtimeSource, /traversed,/);
  // 两层画法：glow 只糊自己那一层（blur 5px），核心线永远是清晰的——不许给核心线加 filter；
  // 动效（沿线流动亮斑）也只在基础层写一次，运行层不再留一份，老的虚线流动已经删掉。
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-glow \{\n {4}filter: blur\(3px\);/);
  assert.doesNotMatch(baseStyles, /react-flow__edge-path \{[^}]*filter: blur/);
  assert.match(baseStyles, /@keyframes workflow-edge-spark \{/);
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-spark \{/);
  // 标签 pill（深蓝灰底 + 1px 半透明描边 + 轻微阴影）也只在基础层写一份；箭头比线只粗一点。
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-label \{/);
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-label \{[^}]*border: 1px solid rgba\(118, 141, 222, 0\.38\);/);
  assert.match(baseStyles, /\.workflow-canvas \.workflow-edge-label \{[^}]*background: rgba\(18, 26, 44, 0\.96\);/);
  assert.doesNotMatch(baseStyles, /workflow-edge-flow/);
  assert.doesNotMatch(runtimeStyles, /is-flowing/);
});

test('the canvas background, dot grid and edge roles stay in the shared layer', () => {
  // 画布底板：深蓝黑（#07101c → #091321）+ 两团极淡的 radial，两页同一个底色。
  assert.match(baseStyles, /\.workflow-canvas \{[^}]*linear-gradient\(180deg, #0a1119, #0b121b\);\n\}/);
  assert.match(baseStyles, /\.workflow-canvas \{[^}]*radial-gradient\(ellipse at 15% 35%, rgba\(22, 87, 92, 0\.055\), transparent 52%\)/);
  // dot grid 很淡，而且两页同一个值（配置页与运行页各写一次、必须一致）。
  assert.match(editorSource, /<Background gap=\{30\} size=\{1\.2\} color="rgba\(150, 184, 240, 0\.07\)" \/>/);
  assert.match(runtimeSource, /<Background gap=\{30\} size=\{1\.2\} color="rgba\(150, 184, 240, 0\.07\)" \/>/);
  assert.doesNotMatch(editorSource, /rgba\(176, 206, 255, 0\.07\)/);
  assert.doesNotMatch(runtimeSource, /rgba\(176, 206, 255, 0\.07\)/);
  // 边标签的文案（Need retry / Max retries）只在分支元数据里给一份。
  assert.match(flowNodeSource, /retry: \{ label: 'Retry', edgeLabel: 'Need retry' \},/);
  assert.match(flowNodeSource, /exhausted: \{ label: 'Exhausted', edgeLabel: 'Max retries' \},/);
});

test('reference UI uses wider cards, large icons, subtitles and shared viewport options', () => {
  assert.match(baseStyles, /\.workflow-flow-node \{[^}]*min-width: 160px;/);
  assert.match(baseStyles, /\.workflow-flow-node-icon \{\s*width: 36px;\s*height: 36px;/);
  assert.match(flowNodeSource, /start: 'Trigger', output: 'Complete'/);
  assert.match(baseStyles, /font-family: var\(--workflow-canvas-font\)/);
  for (const source of [editorSource, runtimeSource]) {
    assert.match(source, /fitViewOptions=\{workflowFitOptions\([^\n]+WORKFLOW_FIT_OPTIONS\)\}/);
    assert.match(source, /fitView\(\{ \.\.\.workflowFitOptions\([^\n]+WORKFLOW_FIT_OPTIONS\), duration: 220 \}\)/);
    assert.match(source, /sourceNode:/);
  }
});

test('visual reconnect never serializes a handle id as an execution branch', () => {
  assert.match(editorSource, /edges: edges\.filter\(\(edge\) => updated\.some/);
  assert.match(editorSource, /edgesReconnectable=\{!readOnly\}/);
  assert.match(editorSource, /snapToGrid=\{false\}/);
  for (const source of [editorSource, runtimeSource]) assert.match(source, /workflowRouteHandles\(edge, routes\)/);
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
  assert.match(editorSource, /onResetLayout=\{showLayoutTools \? resetWorkflowLayout : undefined\}/);
  assert.match(editorSource, /resetLayoutDisabled=\{!savedLayout\.size && !Object\.keys\(routes\)\.length\}/);
  assert.doesNotMatch(editorSource, /label="Reset layout"/);
  // 那行「Layout / Drag to align · …」说明整块删了：系统预设的编辑器不再渲染工具条
  // （只有内容可编辑或可保存才需要它），排布反馈「Layout saved」改挂画布右上角。
  assert.doesNotMatch(editorSource, /Drag to align|workflow-layout-note/);
  assert.doesNotMatch(editorSource, /isEditable \|\| canSave \|\| showLayoutTools/);
  assert.match(baseStyles, /\.workflow-canvas > \.workflow-layout-status \{/);
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

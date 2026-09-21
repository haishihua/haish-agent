// 运行页的标题区（工作流名 + 运行状态）只有这一份实现，而且它是「从运行页回配置页」的唯一入口：
//   · 运行页只读（nodesDraggable={false}），想改图就得回配置页——所以标题整块是一个真按钮，
//     点了把工作流 id 交给 AppShell，AppShell 打开设置页里同一个工作流编辑器（和列表点一下同一条路）；
//   · 外观按设计工程那套规矩收口：正文色（不是金色）、运行中只跑一道同一颜色的流光（不是彩虹），
//     状态用「文案 + 一颗状态点」表达；悬停只在有指针的设备上生效，按下有反馈，键盘有焦点环
//     （app 全局关掉了 outline，焦点环只能走 box-shadow）；动效都留了 prefers-reduced-motion 出口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const runtimeSource = read('../../src/features/workflow/components/WorkflowRuntimePage.jsx');
const runtimeStyles = read('../../styles/workflow-runtime.css');
const settingsSource = read('../../src/features/settings/components/SettingsPage.jsx');
const appShellSource = read('../../src/features/app/AppShell.jsx');
// 标题样式只有一块：从「/* 标题区」到下一节「/* 卡片外观」——别把详情面板那身金色算进来。
const titleStyles = runtimeStyles.slice(
  runtimeStyles.indexOf('/* 标题区'),
  runtimeStyles.indexOf('/* 卡片外观'),
);

test('runtime title is a real button that hands the workflow id back to AppShell', () => {
  assert.match(
    runtimeSource,
    /function WorkflowCanvas\(\{ workflow, task, composer, onRetry, agentOptions = \[\], onOpenConfig = null \}\)/,
  );
  // 运行状态常驻一行（不再用「标题变彩虹」暗示正在跑），标题整块可点。
  assert.match(runtimeSource, /className=\{`workflow-run-status is-\$\{displayRunStatus \|\| 'idle'\}`\}/);
  assert.match(runtimeSource, /className="workflow-run-title is-interactive"/);
  assert.match(runtimeSource, /onClick=\{\(\) => onOpenConfig\(displayWorkflowId\)\}/);
  assert.match(runtimeSource, /aria-label=\{`\$\{titleLabel\} · \$\{runStatusCopy\} · Open workflow settings`\}/);
  // 没有 handler 时（独立预览、别的 fixture）退化成纯文本，不留一个点了没反应的按钮。
  assert.match(runtimeSource, /\) : \(\n {10}<div className="workflow-run-title">\{titleBody\}<\/div>\n {8}\)\}/);
});

test('AppShell opens that workflow in settings, and SettingsPage consumes the one-shot request', () => {
  assert.match(appShellSource, /const \[pendingSettingsEditor, setPendingSettingsEditor\] = useState\(null\);/);
  assert.match(appShellSource, /const openWorkflowConfig = React\.useCallback\(\(workflowId\) => \{/);
  assert.match(appShellSource, /setSettingsMode\(true\);\n {4}setSettingsSection\('workflow'\);/);
  assert.match(appShellSource, /setSettingsSelection\(\(prev\) => \(\{ \.\.\.prev, workflow: id \}\)\);/);
  assert.match(appShellSource, /setPendingSettingsEditor\(\{ section: 'workflow', id, mode: 'edit' \}\);/);
  assert.match(appShellSource, /onOpenConfig=\{openWorkflowConfig\}/);
  assert.match(appShellSource, /openEditorRequest=\{pendingSettingsEditor\}/);
  assert.match(appShellSource, /onOpenEditorRequestConsumed=\{\(\) => setPendingSettingsEditor\(null\)\}/);
  // 设置页消费这个一次性请求：和列表点击同一个 setEditingSettings 入口；消费完交回上层清掉，
  // 否则关掉抽屉、再打开设置页时会被这份旧请求重新弹出来。
  assert.match(settingsSource, /const lastOpenRequestRef = useRef\(null\);/);
  assert.match(settingsSource, /if \(!request\?\.id \|\| lastOpenRequestRef\.current === request\) return;/);
  assert.match(
    settingsSource,
    /setEditingSettings\(\{ section: request\.section, id: request\.id, mode: request\.mode \|\| 'edit' \}\);/,
  );
  assert.match(settingsSource, /onOpenEditorRequestConsumed\?\.\(\);/);
});

test('title carries the runtime palette: neutral text, one status dot, one hue', () => {
  // 金色标题和「彩虹流光」都删了：它们和画布主题不是一套，而且是纯粹的装饰。
  assert.ok(titleStyles.includes('.workflow-run-title {'));
  assert.doesNotMatch(titleStyles, /workflow-title-gradient/);
  assert.doesNotMatch(titleStyles, /#efbf64|#ffe9a8|#8f8cff|#d58cff|rgba\(246, 225, 181/);
  assert.match(
    titleStyles,
    /\.workflow-run-title strong \{\n {4}max-width: 100%;\n {4}color: rgba\(235, 240, 252, 0\.92\);/,
  );
  // 运行中 = 同一颜色的流光，和聊天里工具标签（.aui-tool-label.is-running）是同一种写法。
  assert.match(titleStyles, /\.workflow-run-title strong\.is-running \{\n {4}background-image: linear-gradient\(/);
  assert.match(titleStyles, /color-mix\(in srgb, currentColor 55%, transparent\) 35%/);
  assert.match(titleStyles, /animation: workflow-title-shimmer 2s linear infinite;/);
  // 状态行：一颗状态点 + 文案，颜色跟画布上节点的状态色同一套。
  assert.match(titleStyles, /\.workflow-run-status \{\n {4}display: inline-flex;/);
  assert.match(titleStyles, /\.workflow-run-status::before \{\n {4}content: '';/);
  assert.match(titleStyles, /\.workflow-run-status\.is-running \{ color: #76b9fa; \}/);
  assert.match(titleStyles, /\.workflow-run-status\.is-done,\n\.workflow-run-status\.is-approved \{ color: #55d6a0; \}/);
});

test('title interaction is gated: fine-pointer hover, press feedback, keyboard ring, reduced motion', () => {
  // 悬停只在真有指针的设备上生效（触屏点一下就「悬停」是假状态）。
  assert.match(
    titleStyles,
    /@media \(hover: hover\) and \(pointer: fine\) \{\n {4}\.workflow-run-title\.is-interactive:hover \{/,
  );
  assert.match(titleStyles, /\.workflow-run-title\.is-interactive:active \{\n {4}transform: scale\(0\.98\);\n\}/);
  // app 全局 `:focus-visible { outline: none !important }`：焦点环只能走 box-shadow，写 outline 等于没写。
  assert.match(
    titleStyles,
    /\.workflow-run-title\.is-interactive:focus-visible \{\n {4}background: rgba\(176, 206, 255, 0\.07\);\n {4}box-shadow: 0 0 0 1px rgba\(105, 200, 246, 0\.55\);\n\}/,
  );
  assert.doesNotMatch(titleStyles, /outline:/);
  // 过渡只列具体属性，不用 `all`。
  assert.doesNotMatch(titleStyles, /transition: all/);
  // 降级：动效关掉后标题回到静态颜色，状态点也不再闪。
  assert.match(
    runtimeStyles,
    /@media \(prefers-reduced-motion: reduce\) \{\n {4}\.workflow-run-title strong\.is-running \{\n {8}animation: none;\n {8}background-image: none;\n {8}-webkit-text-fill-color: currentColor;/,
  );
  assert.match(runtimeStyles, /\.workflow-run-status\.is-running::before \{\n {8}animation: none;\n {4}\}/);
});

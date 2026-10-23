import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatCss = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const shellCss = fs.readFileSync(new URL('../../styles/app-shell.css', import.meta.url), 'utf8');
const workflowCss = fs.readFileSync(new URL('../../styles/workflow-runtime.css', import.meta.url), 'utf8');
const fixtureSource = fs.readFileSync(new URL('../fixtures/chat-scrollbar.jsx', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function cssBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open, close + 1);
}

test('shared lists are unchanged while conversation detail owns its rail', () => {
  // 隐藏规则只限会话详情，不影响工作流共用的基础列表与侧栏。
  const list = cssBlock(chatCss, '\n.chat-message-list {');
  assert.doesNotMatch(list, /scrollbar-width: none/);
  assert.doesNotMatch(chatCss, /\.conversations-body, \.chat-message-list \{[^}]*scrollbar-width: none/);
  assert.doesNotMatch(chatCss, /\.conversations-body::-webkit-scrollbar, \.chat-message-list::-webkit-scrollbar/);
  // 侧栏自己那条隐藏规则还在（没顺手改到侧栏）。
  assert.match(chatCss, /\.conversations-body \{ scrollbar-width: none; \}/);
});

test('the list reserves the same strip for the turn rail whether or not the conversation overflows', () => {
  // 24px 命中区与参考一致；右内边距始终保留给导轨，不与原生滚动条叠加。
  const chatListRule = chatCss.match(/\.chat-message-region > \.chat-message-list \{[^}]*padding:[^}]*\}/);
  assert.ok(chatListRule, 'the chat pane list needs its own padding rule');
  assert.match(chatListRule[0], /scrollbar-width: none;/);
  const workspace = cssBlock(chatCss, '.chat-workspace {');
  assert.match(workspace, /--chat-scrollbar-width: 24px;/);
  const strip = Number(workspace.match(/--chat-scrollbar-width:\s*(\d+)px/)?.[1]);
  assert.equal(strip, 24, '24px hit target, 12px default tick');
  assert.match(
    chatListRule[0],
    /padding: 24px var\(--chat-scrollbar-width, 24px\) 24px var\(--chat-gutter, 10px\);/,
  );
  assert.match(
    chatCss,
    /\.chat-composer \{[^}]*margin: 0 var\(--chat-scrollbar-width, 24px\) 16px var\(--chat-gutter, 10px\);/,
  );
  // 基础那条（工作流详情也在用）保持原来的共享 gutter，没有多余的缺口。
  assert.match(cssBlock(chatCss, '\n.chat-message-list {'), /padding: 24px var\(--chat-gutter, 10px\);/);
  // 会话内查找的命中条挂在列表右缘：得让开轮次导轨，不然两条叠在一起。
  assert.match(chatCss, /\.haish-search-hit-track \{[^}]*right: calc\(var\(--chat-scrollbar-width, 10px\) \+ 2px\);/);
});

test('the native scrollbar is hidden; the conversation map rail takes over', () => {
  // 产品决策：右缘一列轮次标签（Conversation map）就是滚动条——点标签跳轮次、按住导轨
  // 拖动连续滚动，滚轮/触控板/键盘滚动不受影响。原生滚动条（含 webkit 伪元素）彻底隐藏。
  // 四个伪元素（bar/track/thumb/corner）合并在同一条选择器列表里，整段都要藏。
  assert.match(
    chatCss,
    /\.chat-message-region > \.chat-message-list::-webkit-scrollbar,\n\.chat-message-region > \.chat-message-list::-webkit-scrollbar-track,\n\.chat-message-region > \.chat-message-list::-webkit-scrollbar-thumb,\n\.chat-message-region > \.chat-message-list::-webkit-scrollbar-corner \{\n\s*display: none;/,
  );
  // 导轨占据保留带：贴右缘、宽度就是 --chat-scrollbar-width，正文右缘扣的就是这块。
  const map = cssBlock(chatCss, '.conversation-map {');
  assert.match(map, /right: 0;/);
  assert.match(map, /width: var\(--chat-scrollbar-width, 24px\);/);
  // 拖动滚动的两个前提：指针事件不被浏览器手势截走（touch-action: none）+ 抓取光标。
  const rail = cssBlock(chatCss, '.conversation-map-rail {');
  assert.match(rail, /touch-action: none;/);
  assert.match(rail, /cursor: grab;/);
  assert.match(rail, /flex-direction: column;/);
  // 一列均分：一个轮次一格（flex:1），不是按内容占比散布。
  assert.match(cssBlock(chatCss, '.conversation-map-tick {'), /flex: 1 1 0;/);
  // 工作流详情面板那条列表用的是原生细滚动条（scrollbar-width/color 非 auto），
  // 它自己那套留在 workflow-runtime.css：会话详情这条隐藏规则不能顺手把它接管了。
  assert.match(
    cssBlock(workflowCss, '.workflow-detail-body.chat-message-list {'),
    /scrollbar-width: thin;[\s\S]*scrollbar-color: rgba\(128, 151, 190, 0\.3\) transparent;/,
  );
  assert.doesNotMatch(chatCss, /\.workflow-detail-body/);
});

test('the browser fixture measures the rail, the jump targets and the alignment', () => {
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/base\.css';/);
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/chat\.css';/);
  // 导轨的「点得动」是事件层面的东西，页面里量的是它成立的前提：原生滚动条真的没了、
  // 导轨占了那块保留带、刻度数 = 用户轮次数、正文右缘与输入框外框对齐。
  assert.match(fixtureSource, /const scrollbarStrip = \(element\) => element\.offsetWidth - element\.clientWidth;/);
  assert.match(fixtureSource, /const railNode = \(\) => document\.querySelector\('\.conversation-map'\);/);
  assert.match(fixtureSource, /const tapTick = \(tick\) => \{/);
  assert.match(fixtureSource, /const composerFrameRight = \(\) => round\(document\.querySelector\('\.chat-composer'\)\.getBoundingClientRect\(\)\.right\);/);
  assert.match(fixtureSource, /window\.__chatScrollbarChecks = async \(\) => report\(await runChecks\(\)\);/);
  // 反向断言：注回旧的「gutter − 保留带」内边距公式后正文右缘偏离输入框。
  assert.match(fixtureSource, /window\.__chatScrollbarRevertChecks = async \(\) => report\(await revertChecks\(\)\);/);
  assert.match(
    fixtureSource,
    /padding: 24px calc\(var\(--chat-gutter, 10px\) - var\(--chat-scrollbar-width, 24px\)\) 24px var\(--chat-gutter, 10px\) !important;/,
  );
  assert.match(readme, /\[chat-scrollbar\.html\]\(fixtures\/chat-scrollbar\.html\)/);
});

test('the panels keep a hairline seam instead of the 8px strip', () => {
  // 用户看到的「中间那条缝」：.app-body 的 8px 列间距露出来的底，比两侧面板都暗。
  // 现在收成一条发丝缝（2px）——不是 0（两块面板的边框会贴成一条线、像一块板），
  // 也不是 8（宽缝太显眼）。正文左缘到左栏边框 = 2（缝）+ 1（边框）+ --chat-gutter。
  const body = cssBlock(shellCss, '\n.app-body {');
  assert.match(body, /gap: 2px;/);
  assert.match(body, /发丝缝/);
  // 舞台这一层不许自己再加外边距 / 内边距——缝会被它再撑大。
  const stage = cssBlock(shellCss, '\n.app-chat-stage {');
  assert.doesNotMatch(stage, /(?:^|[;\s])(?:padding|margin)(?:-[a-z]+)?\s*:/);
});

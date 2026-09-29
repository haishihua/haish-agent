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

test('the conversation body keeps a classic scrollbar instead of hiding it', () => {
  // 之前 chat.css 和侧栏共用一条 `scrollbar-width: none`，会话详情里彻底没有滚动条：
  // 滚动时看不到、也没法拖。侧栏那条是刻意的（面板本身窄），这里只把会话详情放出来。
  const list = cssBlock(chatCss, '\n.chat-message-list {');
  assert.doesNotMatch(list, /scrollbar-width: none/);
  assert.doesNotMatch(chatCss, /\.conversations-body, \.chat-message-list \{[^}]*scrollbar-width: none/);
  assert.doesNotMatch(chatCss, /\.conversations-body::-webkit-scrollbar, \.chat-message-list::-webkit-scrollbar/);
  // 侧栏自己那条隐藏规则还在（没顺手改到侧栏）。
  assert.match(chatCss, /\.conversations-body \{ scrollbar-width: none; \}/);
});

test('the list reserves the same 10px whether or not the conversation overflows', () => {
  // 常驻占位（scrollbar-gutter: stable）：短会话不滚也不跳，正文右缘在切会话前后一致。
  // 只写在会话详情（.chat-message-region > .chat-message-list）上：工作流详情面板也在用
  // .chat-message-list，那边有自己的细滚动条与内边距，不该被这条常驻占位影响。
  // 同一个选择器还有一条更早的 `height: 100%`，这里取带 padding 的那条（常驻占位）。
  const chatListRule = chatCss.match(/\.chat-message-region > \.chat-message-list \{[^}]*padding:[^}]*\}/);
  assert.ok(chatListRule, 'the chat pane list needs its own padding rule');
  assert.match(chatListRule[0], /scrollbar-gutter: stable;/);
  const workspace = cssBlock(chatCss, '.chat-workspace {');
  assert.match(workspace, /--chat-scrollbar-width: 10px;/);
  // gutter 不能再比占位窄：右内边距 = gutter − 占位，负数会把这条对齐规则弄坏。
  const gutter = Number(workspace.match(/--chat-gutter:\s*(\d+)px/)?.[1]);
  const strip = Number(workspace.match(/--chat-scrollbar-width:\s*(\d+)px/)?.[1]);
  assert.ok(gutter >= strip, `gutter ${gutter}px must cover the ${strip}px scrollbar strip`);
  // 右内边距扣掉这条占位，正文右缘才仍然落在 --chat-gutter 上、和输入框外框对齐。
  assert.match(
    chatListRule[0],
    /padding: 24px calc\(var\(--chat-gutter, 10px\) - var\(--chat-scrollbar-width, 10px\)\) 24px var\(--chat-gutter, 10px\);/,
  );
  // 基础那条（工作流详情也在用）保持原来的共享 gutter，没有多余的缺口。
  assert.match(cssBlock(chatCss, '\n.chat-message-list {'), /padding: 24px var\(--chat-gutter, 10px\);/);
  // 会话内查找的命中条挂在列表右缘：得让开滚动条，不然两条叠在一起。
  assert.match(chatCss, /\.haish-search-hit-track \{[^}]*right: calc\(var\(--chat-scrollbar-width, 10px\) \+ 2px\);/);
});

test('the scrollbar is always visible, draggable and self-sizing', () => {
  // 样式化 ::-webkit-scrollbar 就等于放弃 macOS 那条「滚动时才现身、自己会淡出」的浮层
  // 滚动条，换成一条常显、能按住拖的经典滚动条；滑块长度仍由浏览器按 视口/内容 比例算
  // （内容越长滑块越短），min-height 只兜一个抓得住的下限。
  const bar = cssBlock(chatCss, '.chat-message-region > .chat-message-list::-webkit-scrollbar {');
  assert.doesNotMatch(bar, /display: none/);
  assert.match(bar, /width: var\(--chat-scrollbar-width, 10px\);/);
  const thumb = cssBlock(chatCss, '.chat-message-region > .chat-message-list::-webkit-scrollbar-thumb {');
  assert.match(thumb, /min-height: 28px;/);
  assert.match(thumb, /border-radius: 99px;/);
  // 兜底颜色：只引 chat.css 的夹具里没有 --line-2，没兜底会让滑块整条透明。
  assert.match(thumb, /background: var\(--line-2, #3a4463\);/);
  assert.match(thumb, /background-clip: padding-box;/);
  // 轨道与角落透明：滑块两侧那 2px 边框不能画成两条实心边。
  assert.match(
    chatCss,
    /\.chat-message-region > \.chat-message-list::-webkit-scrollbar-track,\n\.chat-message-region > \.chat-message-list::-webkit-scrollbar-corner \{\n\s*background: transparent;/,
  );
  // 悬停/按住反馈只在真指针设备上放大，别在触屏上留一个「按下去变亮」的假状态。
  assert.match(chatCss, /@media \(hover: hover\) and \(pointer: fine\) \{\n\s*\.chat-message-region > \.chat-message-list::-webkit-scrollbar-thumb:hover \{/);
  assert.match(
    cssBlock(chatCss, '.chat-message-region > .chat-message-list::-webkit-scrollbar-thumb:active {'),
    /background: rgba\(159, 177, 205, 0\.6\);/,
  );
  // 工作流详情面板那条列表用的是原生细滚动条（scrollbar-width/color 非 auto），
  // 它自己那套留在 workflow-runtime.css：会话详情这条不能顺手把它接管了。
  assert.match(
    cssBlock(workflowCss, '.workflow-detail-body.chat-message-list {'),
    /scrollbar-width: thin;[\s\S]*scrollbar-color: rgba\(128, 151, 190, 0\.3\) transparent;/,
  );
  assert.doesNotMatch(chatCss, /\.workflow-detail-body/);
});

test('the browser fixture measures the strip, the hit target and the alignment', () => {
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/base\.css';/);
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/chat\.css';/);
  // 常量在 CSS 里，滚动条本身在页面里量不到——夹具量的是它成立的前提：
  // 占位宽度、指针落在列表上、滑块比例、正文右缘与输入框外框对齐。
  assert.match(fixtureSource, /const scrollbarStrip = \(element\) => element\.offsetWidth - element\.clientWidth;/);
  assert.match(fixtureSource, /hit: document\.elementFromPoint\(/);
  assert.match(fixtureSource, /thumb: round\(\(viewport \* viewport\) \/ content\)/);
  assert.match(fixtureSource, /const composerFrameRight = \(\) => round\(document\.querySelector\('\.chat-composer'\)\.getBoundingClientRect\(\)\.right\);/);
  assert.match(fixtureSource, /window\.__chatScrollbarChecks = async \(\) => report\(await runChecks\(\)\);/);
  // 反向断言：注回 HEAD 的隐藏规则后占位塌成 0、对齐破掉。
  assert.match(fixtureSource, /window\.__chatScrollbarRevertChecks = async \(\) => report\(await revertChecks\(\)\);/);
  assert.match(fixtureSource, /\.chat-message-list \{ scrollbar-width: none !important; \}/);
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

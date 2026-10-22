import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};
const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');

const editor = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);

const css = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const toolElementsCss = fs.readFileSync(new URL('../../styles/tool-elements.css', import.meta.url), 'utf8');
const markdownCss = fs.readFileSync(new URL('../../styles/markdown.css', import.meta.url), 'utf8');

// 中间叙述（tool 调用之间模型说的话）以前一直走 IncrementalText，`##` / `**` / `-`
// 全裸着显示。定稿后必须交给 Markdown，流式期间才保留纯文本打字机效果。

test('mid-turn commentary is settled as soon as the next tool call starts', () => {
  const timeline = buildChatTimeline({
    eventLog: [
      { type: 'llm_answer_delta', message: '## Step 01 结论：**停止**\n\n先看事实。' },
      { type: 'tool_call_started', toolName: 'exec_command', callId: 'call-1', toolInput: { command: 'ls' } },
    ],
    toolCalls: [],
  }, 'done').items;

  const text = timeline.find((item) => item.kind === 'text');
  assert.ok(text, 'commentary segment should survive as a text item');
  assert.equal(text.streaming, false);
  assert.equal(text.source, 'commentary');
  assert.match(text.text, /^## Step 01/);
});

test('settled timeline text renders as Markdown, live text stays incremental', () => {
  assert.match(editor, /item\.streaming\s*\n?\s*\? <IncrementalText text=\{item\.text\} streaming \/>\s*\n?\s*: <Markdown source=\{item\.text\} \/>/);
  // 定稿分支不能再把纯文本塞进时间轴。
  assert.doesNotMatch(editor, /<IncrementalText text=\{item\.text\} streaming=\{item\.streaming\} \/>/);
});

// Markdown 的块级外边距是给「最终回答」那种整段文档写的，堆到时间轴短句上就会把
// 「正文 → 工具行」顶到 20px；行内箭头的内缩也会让它比正文多缩进 12px。
test('timeline text keeps tight rhythm and aligns tool chevrons with the prose', () => {
  assert.match(css, /\.chat-timeline-text \{[^}]*padding: 0;/);
  assert.match(css, /\.chat-timeline-text > \.haish-markdown \{\s*margin-block: 0;\s*\}/);
  assert.match(css, /\.chat-timeline-text \.haish-markdown > div > :first-child \{\s*margin-block-start: 0;\s*\}/);
  assert.match(css, /\.chat-timeline-text \.haish-markdown > div > :last-child \{\s*margin-block-end: 0;\s*\}/);
  assert.match(css, /\.chat-timeline-text \+ \.aui-tool-timeline,\s*\n\.chat-timeline-text \+ \.chat-tool-node \{\s*margin-top: -4px;\s*\}/);
  // 箭头对齐：去掉按钮左内边距；箭头再按 ChevronRight 的字形留白（13px 画布里
  // stroke 2 + round cap 之后笔画最左沿在 8/24 ≈ 4.33px）左移，笔画左沿落在正文
  // 首字那一列。留白不能取整成 5px，否则箭头比正文多走 0.67px。
  assert.match(css, /\.chat-timeline > \.aui-tool-timeline > \.aui-tool-trigger,\s*\n\.chat-timeline > \.chat-tool-node > \.aui-tool-call > \.aui-tool-trigger \{\s*padding-left: 0;\s*\}/);
  assert.match(css, /\.aui-tool-trigger > \.aui-tool-chevron,[\s\S]{0,220}margin-left: -4\.333px;/);
  assert.doesNotMatch(css, /margin-left: -5px;/);
  // 对准首字中间：只给箭头加 relative offset（13px 画布的中心在 6.5px，正文 14px 首字
  // 中心在 7px → 再右移 4.833px）。relative offset 不参与排版，工具卡片内容不动。
  assert.match(css, /\.aui-tool-trigger > \.aui-tool-chevron \{\s*position: relative;\s*\n\s*left: 4\.833px;\s*\}/);
  // 箭头右侧的间距和按钮右内边距保持原样：卡片仍然是 `padding: 5px 7px` +
  // 8px flex gap，对齐只靠箭头自己的负外边距和 relative offset 完成。
  assert.match(toolElementsCss, /\.aui-tool-trigger \{\s*display: flex;[\s\S]{0,320}gap: 8px;[\s\S]{0,200}padding: 5px 7px;/);
});

// 流式正文是纯文本（IncrementalText），定稿后同一段话交给 Markdown。两边排版必须
// 逐项对齐，否则定稿那一刻行距/字重感会跳一下，看着就像「字号变了」。
test('streaming timeline text matches the Markdown body typography', () => {
  // Markdown 这一侧的基准值：14px / 1.5 / antialiased。
  assert.match(markdownCss, /--markdown-content-size: 14px;/);
  assert.match(markdownCss, /p, li, blockquote, table, th, td, code \{\s*font-size: var\(--markdown-content-size\);\s*\n\s*line-height: 1\.5;\s*\}/);
  assert.match(markdownCss, /\.haish-markdown, \[data-streamdown\$="-fullscreen"\] \{[\s\S]{0,400}-webkit-font-smoothing: antialiased;/);
  // 流式这一侧必须写同一组值。
  assert.match(css, /\.chat-timeline-text \{[\s\S]{0,320}font-size: 14px;\s*\n\s*line-height: 1\.5;\s*\n\s*-webkit-font-smoothing: antialiased;/);
  assert.doesNotMatch(css, /\.chat-timeline-text \{[^}]*line-height: 1\.65;/);
});

// 表格排版的浏览器回归：真实 Markdown（streamdown + 真实样式）、真实的聊天气泡结构，
// 跑在 1400px 宽的窗口里（比气泡的固定宽度上限 960px 宽）。
//
// 背景：答案里的 Markdown 表格被三件事同时挤扁——
//   1. 气泡的固定宽度上限（助手 960px）先于消息列宽生效；
//   2. 单元格里的行内代码带着正文用的 `word-break: break-all` + 继承来的
//      `overflow-wrap: anywhere`，列的最小宽度因此只有一个字符，浏览器可以把列压到
//      路径中间断行（`app-web/src/features/chat/model/conversation-loading.js` 这种）；
//   3. 表格容器还有上游默认的 300px 高度上限：行数一多就变成一个内部滚动的盒子
//      （macOS 的浮层滚动条平时不显示，看起来就是「表格少了几行」）。
// 结果就是用户反馈的「要滚轮才看得全」。
//
// 断言（全部按真实几何测量，不写死字体度量）：
//   1. 带表格的消息不再被 960px 的固定上限压住（气泡实测宽 > 960）；
//   2. 14 行的表整张可见：容器没有纵向滚动（scrollHeight == clientHeight），最后一行没被裁掉；
//   3. 单元格里的长路径保持整词：行内代码只有一个行盒（getClientRects().length === 1），
//      单元格内容宽不低于最长的 token——列宽反映内容，不再折在词中间；
//   4. 内容放得下时表格不出现横向滚动；
//   5. 对照组（没有表格的消息）仍然受 960px 上限约束——放宽的只是表格消息。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
// base.css 必须先进来：里面的 `* { box-sizing: border-box }` 决定了气泡的 max-width
// 是按哪个盒量（少了它，960px 的上限会量在内容盒上，气泡外框比 960 宽出一圈内边距）。
import '../../styles/base.css';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) =>
  window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`),
);

const report = document.getElementById('checks');
let lines = [];
let failures = [];
const log = (line) => {
  lines.push(line);
  report.textContent = lines.join('\n');
};
function check(condition, name) {
  log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
}
const tick = async () => {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    } else {
      setTimeout(resolve, 24);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
};

const root = createRoot(document.getElementById('root'));
const render = (source) =>
  flushSync(() =>
    root.render(
      <div className="chat-message-list">
        <div className="chat-message-row agent">
          <div className="chat-bubble message-shell agent-response">
            <div className="message-speech-body">
              <div className="chat-bubble-text">
                <Markdown source={source} />
              </div>
            </div>
          </div>
        </div>
      </div>,
    ),
  );

const AGENT_BUBBLE_WIDTH_CAP = 960;
const WINDOW_WIDTH = 1400;
const TABLE_NATURAL_WIDTH = 1050;
const TABLE_ROWS = 14;
const COLUMN_SPLIT = 0.6;

/** 一段不含空格的路径 token（和「文件」列里的真实内容同形），长度按像素目标反推。 */
function pathToken(chars, seed) {
  let token = `app-web/src/features/chat/module-${seed}`;
  let next = seed;
  while (token.length + 12 < chars) {
    next += 7;
    token += `/part-${next}`;
  }
  return `${token}${'z'.repeat(Math.max(0, chars - token.length))}.js`;
}

function tableSource(tokenA, tokenB) {
  const rows = Array.from({ length: TABLE_ROWS }, (_, index) => `| \`${tokenA}\` | \`${tokenB}\` | row ${index + 1} |`);
  return ['| 文件 | 内容 | 备注 |', '| --- | --- | --- |', ...rows].join('\n');
}

function measureTable() {
  const bubble = document.querySelector('.chat-message-row.agent .chat-bubble');
  const container = document.querySelector('[data-streamdown="table-wrapper"] > div:last-child');
  const cell = document.querySelector('[data-streamdown="table-cell"]');
  const token = cell?.querySelector('[data-streamdown="inline-code"]');
  const lastRow = document.querySelector('[data-streamdown="table-body"] tr:last-child');
  if (!bubble || !container || !cell || !token || !lastRow) {
    check(false, '表格没有渲染出来');
    return summarize();
  }
  // 960px 这类上限要和生产一样量在外框上（base.css 的 box-sizing: border-box）。
  check(
    getComputedStyle(bubble).boxSizing === 'border-box',
    `气泡按 border-box 量宽（实际 ${getComputedStyle(bubble).boxSizing}）——否则 960px 的量法就和生产不一样`,
  );
  const bubbleWidth = Math.round(bubble.getBoundingClientRect().width);
  check(
    bubbleWidth > AGENT_BUBBLE_WIDTH_CAP + 1,
    `带表格的消息不再套用 ${AGENT_BUBBLE_WIDTH_CAP}px 固定宽度上限（气泡实测 ${bubbleWidth}px，窗口 ${WINDOW_WIDTH}px）`,
  );
  const clippedVertically = container.scrollHeight - container.clientHeight;
  check(
    clippedVertically <= 1,
    `整张表照常铺开，表内没有纵向滚动（${TABLE_ROWS} 行：scrollHeight ${container.scrollHeight} / clientHeight ${container.clientHeight}）`,
  );
  check(
    Math.round(lastRow.getBoundingClientRect().bottom) <= Math.round(container.getBoundingClientRect().bottom) + 1,
    '最后一行没有被容器裁掉',
  );
  const lineBoxes = token.getClientRects().length;
  check(lineBoxes === 1, `单元格里的长路径保持整词（最长 token 只有 ${lineBoxes} 个行盒）`);
  const tokens = [...document.querySelectorAll('[data-streamdown="table-cell"] [data-streamdown="inline-code"]')];
  const wrappedTokens = tokens.filter((node) => node.getClientRects().length !== 1);
  check(
    wrappedTokens.length === 0,
    `列宽反映内容：整张表 ${tokens.length} 个行内代码都保持整词（被折行 ${wrappedTokens.length} 个）`,
  );
  const clippedHorizontally = container.scrollWidth - container.clientWidth;
  check(
    clippedHorizontally <= 1,
    `内容放得下时不出现横向滚动（scrollWidth ${container.scrollWidth} / clientWidth ${container.clientWidth}）`,
  );
  return summarize();
}

function measureControl() {
  const bubble = document.querySelector('.chat-message-row.agent .chat-bubble');
  if (!bubble) {
    check(false, '对照组没有渲染出来');
    return summarize();
  }
  const width = Math.round(bubble.getBoundingClientRect().width);
  const cap = getComputedStyle(bubble).maxWidth;
  check(
    width <= AGENT_BUBBLE_WIDTH_CAP + 2,
    `对照组（没有表格的消息）仍然守着 ${AGENT_BUBBLE_WIDTH_CAP}px 上限（实测 ${width}px，上限声明 ${cap}）`,
  );
  return summarize();
}

function summarize() {
  check(window.__pageErrors.length === 0, `没有页面报错（${window.__pageErrors.join(' | ')}）`);
  return { failures: [...failures], lines: [...lines] };
}

// 重新渲染表格并复测：注入旧规则后应当重新变红（夹具自检用）。
let lastTokens = null;
window.__measureTableChecks = async () => {
  lines = [];
  failures = [];
  log('--- 表格消息 ---');
  render(tableSource(lastTokens[0], lastTokens[1]));
  await tick();
  return measureTable();
};

async function main() {
  await document.fonts.ready;
  // 探针：先量出一个等宽字符的实际宽度，再按像素目标反推 token 长度——夹具因此不依赖
  // 具体字体（JetBrains Mono 装没装都能跑）。
  render(`\`${'x'.repeat(20)}\``);
  await tick();
  const probe = document.querySelector('[data-streamdown="inline-code"]');
  if (!probe) throw new Error('probe inline code did not render');
  const charWidth = (probe.getBoundingClientRect().width - 8) / 20;
  log(`mono char width ≈ ${charWidth.toFixed(2)}px`);
  const chars = (pixels) => Math.max(8, Math.round(pixels / charWidth));
  const tokenA = pathToken(chars(TABLE_NATURAL_WIDTH * COLUMN_SPLIT), 1);
  const tokenB = pathToken(chars(TABLE_NATURAL_WIDTH * (1 - COLUMN_SPLIT)), 2);
  lastTokens = [tokenA, tokenB];

  render(tableSource(tokenA, tokenB));
  await tick();
  await tick();
  log('--- 表格消息 ---');
  measureTable();

  // 对照组：同样的超长 token，但消息里没有表格——上限还在。
  log('--- 对照组：没有表格的消息 ---');
  render(`Long token without a table: \`${pathToken(chars(WINDOW_WIDTH * 1.1), 3)}\``);
  await tick();
  measureControl();

  report.dataset.result = failures.length ? 'FAIL' : 'PASS';
  document.title = `${failures.length ? 'FAIL' : 'PASS'}: ${lines.length} markdown table layout checks`;
}

(async () => {
  try {
    await main();
  } catch (error) {
    check(false, `${error.message}\n${error.stack || ''}`);
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
  }
})();

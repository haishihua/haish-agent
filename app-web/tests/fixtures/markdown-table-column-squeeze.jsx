// 表格列宽的浏览器回归：真实 Markdown（streamdown + 真实样式）、真实的聊天气泡结构，
// 在 1750 / 1200 / 900px 三个消息列宽下各量一遍。
//
// 背景：报告里「四家压缩实现」的对比表，第一列只写实现名（**pi** / **opencode** /
// **codex** / **Hermes**），结果被排成一列字母——每个单词一行只放得下一个字符。
// 原因不是第一列表头为空，而是这一列的最小宽度被算成了一个字符：
//   .haish-markdown 给正文设了 `overflow-wrap: anywhere`（长路径要能断行），这个值会被
//   单元格继承，而 `anywhere` 会参与 min-content 计算——「opencode」所在列的最小宽度
//   因此只有 1 个字符。表格是 `w-full`（列宽由内容分配），另外两列是长中文，第一列分到
//   的宽度远小于单词本身，浏览器就把它压到最小宽度：一个字符一行。
//
// 断言（全部按真实几何测量，不写死字体度量）：
//   1. 四个实现名各自只有一个行盒（Range.getClientRects()，折行会变成多个）；
//   2. 第一列的列宽不低于最长的名字（opencode）——列宽反映内容；
//   3. 表头还是 3 个单元格、第一个本来就没有文字：空表头决定不了列宽（名字在 body 里）；
//   4. 内容放得下时表格不横向滚动；
//   5. 反向对照：把修复前的断行规则（break-all + anywhere）注回去，同一个单元格应当重新
//      折成多行——证明这些断言测的确实是「列的最小宽度」这件事。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
// base.css 必须先进来：里面的 `* { box-sizing: border-box }` 决定了气泡的 max-width
// 是按哪个盒量（少了它，宽度上限会量在内容盒上，气泡外框比上限宽出一圈内边距）。
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
// 用 setTimeout 而不是 rAF：自动化窗口被遮蔽时标签页是 hidden，rAF 会被冻住
// （后台标签页也要能跑完这套断言，见 tests/README）。
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 32));
  await new Promise((resolve) => setTimeout(resolve, 32));
};

// 用户在真实会话里看到的那张表（Haish 会话 9762186e… 的答案原文，逐字抄下来）。
const REPORT_TABLE = [
  '| | 摘要调用怎么配 | 什么时候触发 |',
  '| --- | --- | --- |',
  '| **pi** | `maxTokens = 0.8 × reserveTokens`（默认≈13.1K），模型支持时反而 **`reasoning:"high"`**；工具结果序列化时截 2000 字符；split turn 两份摘要**并行**（`Promise.all`） | **assistant 回合结束后**（`agent-session.ts:1759` 之后 `_runAutoCompaction("threshold")`），另有 overflow 重试兜底 |',
  '| **opencode** | compaction 是独立 agent，**可单独配模型**（`agent.compaction.model`）；v2 直接 `generation:{maxTokens: min(output, 4096)}` 流式；输入里工具结果截 2000 字符 | 上一步完成后查 `isOverflow` → 自动 compaction；另有每步可跑的 `prune` |',
  '| **codex** | 默认 `auto_compact_token_limit = 90% × context`（≈我们的 230.4K，阈值一致）；本地摘要用同模型 + 模板 prompt；另有 **remote/server-side compaction**；**token-budget 模式完全不调摘要模型**，直接“install a fresh context window” | turn-end 阈值 + reminder/fallback prompt（`token_budget.rs`）；history-notes 扩展让模型自己写 notes，压缩后可检索 |',
  '| **Hermes** | 走 `auxiliary_client.call_llm(task="compression")`，**可配独立 `summary_model`**，temperature 0.1；**刻意不传 max_tokens**（源码注释：thinking 模型会把预算烧在推理上，摘要被截断/只剩思考）；输入每消息截 6000 字符、全局 160K 字符、剥 think block | 阈值触发；另有 opt-in 的 **micro-compaction**（每 N 轮把 1 个 exchange 并入 ≤1500 tokens 滚动摘要）和 **proactive prune**（工具结果 ≥8000 字符才清，回收 ≥4096 tokens 才提交，还要等 trigger 大小的新增才 rearm——为了不每轮打断 prompt cache） |',
].join('\n');
const WIDTHS = [
  { px: 1750, fits: true },
  { px: 1200, fits: true },
  // 900px 比这张表的最小内容还窄：另外两列里的 `auxiliary_client.call_llm(task="compression")`、
  // `_runAutoCompaction("threshold")` 这些不可断的代码 token 自己就超过列宽，表格横向滚动
  // 是设计内的兜底（和「不把 token 拗断」是一件事）。这一档只验名字不被压扁，不验不滚动。
  { px: 900, fits: false },
];
const NAMES = ['pi', 'opencode', 'codex', 'Hermes'];

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
const setWidth = (width) => {
  document.getElementById('root').style.width = `${width}px`;
};

/** 一个元素占了多少行（按行盒的去重位置数；折行就多于 1）。 */
function lineBoxes(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rows = new Set();
  for (const rect of range.getClientRects()) {
    if (rect.width > 0 && rect.height > 0) rows.add(`${Math.round(rect.top)}:${Math.round(rect.left)}`);
  }
  return rows.size;
}

const firstColumnCells = () =>
  [...document.querySelectorAll('[data-streamdown="table-body"] tr')].map((row) =>
    row.querySelector('[data-streamdown="table-cell"]'),
  );

/** 单元格继承的断行规则本身就是断言对象：整词优先、不按任意字符断。 */
function measureCellRule() {
  const cell = document.querySelector('[data-streamdown="table-cell"]');
  if (!cell) {
    check(false, '表格没有渲染出来');
    return;
  }
  const style = getComputedStyle(cell);
  check(style.overflowWrap === 'break-word', `单元格的断行规则是整词优先（overflow-wrap: ${style.overflowWrap}）`);
  check(style.wordBreak === 'normal', `单元格不按任意字符断词（word-break: ${style.wordBreak}）`);
}

/** 表头还是 3 个单元格、第一个本来就没有文字：列宽由 body 里的名字决定，空表头决定不了。 */
function measureHeader() {
  const header = [...document.querySelectorAll('[data-streamdown="table-header-cell"]')];
  check(
    header.length === 3 && header[0].textContent.trim() === '',
    '表头仍是 3 个单元格、第一个本来就没有文字（空表头不参与列宽，名字在 body 里）',
  );
}

function measureWidth(width, fits) {
  const cells = firstColumnCells();
  const cell = cells.find((node) => node.textContent.trim() === 'opencode');
  const word = cell?.querySelector('[data-streamdown="strong"]');
  if (cells.length !== 4 || !cell || !word) {
    check(false, `[${width}px] 表格没有按预期渲染（第一列 ${cells.length} 个单元格）`);
    return;
  }
  const columns = [
    ...document.querySelectorAll('[data-streamdown="table-header"] [data-streamdown="table-header-cell"]'),
  ];
  const container = document.querySelector('[data-streamdown="table-wrapper"] > div:last-child');
  const overflow = container.scrollWidth - container.clientWidth;
  log(
    `[${width}px] 列宽 ${columns.map((node) => Math.round(node.getBoundingClientRect().width)).join(' / ')}px，` +
      `横向溢出 ${overflow}px`,
  );
  const stacked = cells.filter((node) => lineBoxes(node) !== 1);
  check(stacked.length === 0, `[${width}px] 首列的实现名各自单行（${NAMES.join(' / ')}，折行的 ${stacked.length} 个）`);
  const cellWidth = Math.round(cell.getBoundingClientRect().width);
  const wordWidth = Math.round(word.getBoundingClientRect().width);
  check(
    cellWidth + 1 >= wordWidth,
    `[${width}px] 列宽不低于最长的名字（列宽 ${cellWidth}px ≥ opencode ${wordWidth}px）`,
  );
  if (fits) {
    check(overflow <= 1, `[${width}px] 内容放得下时不出现横向滚动（溢出 ${overflow}px）`);
  }
}

async function main() {
  await document.fonts.ready;
  render(REPORT_TABLE);
  await tick();
  await tick();

  log('--- 单元格的断行规则 ---');
  measureCellRule();
  measureHeader();
  log('--- 三个消息列宽 ---');
  for (const { px, fits } of WIDTHS) {
    setWidth(px);
    await tick();
    measureWidth(px, fits);
  }

  // 反向对照：注入修复前的断行规则（单元格按任意字符断词），同一个单元格应当重新折成多行。
  log('--- 反向对照：注入修复前的断行规则 ---');
  const revert = document.createElement('style');
  revert.textContent =
    '[data-streamdown="table-header-cell"], [data-streamdown="table-cell"] { word-break: break-all !important; overflow-wrap: anywhere !important; }';
  document.head.append(revert);
  await tick();
  const broken = [];
  for (const { px } of WIDTHS) {
    setWidth(px);
    await tick();
    const cell = firstColumnCells().find((node) => node.textContent.trim() === 'opencode');
    if (cell) broken.push(`[${px}px] ${lineBoxes(cell)} 行`);
  }
  check(
    broken.length > 0 && !broken.some((line) => line.endsWith('1 行')),
    `注入后 opencode 重新折成多行（${broken.join('，')}）`,
  );
  revert.remove();

  check(window.__pageErrors.length === 0, `没有页面报错（${window.__pageErrors.join(' | ')}）`);
  report.dataset.result = failures.length ? 'FAIL' : 'PASS';
  document.title = `${failures.length ? 'FAIL' : 'PASS'}: ${lines.length} markdown table column checks`;
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

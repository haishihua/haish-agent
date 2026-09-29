// 代码块按视口的浏览器回归：真实 Markdown（streamdown + @streamdown/code）、真实样式，
// 跑在 chat 的滚动容器里（带 content-visibility 的真实行结构）。
//
// 背景：高亮在 streamdown 的代码块 body 里由一个普通 useEffect 触发，和可见性无关——
// 长会话挂载那一帧会把几百个块全部跑一遍 shiki 分词（离线实测 compute-use3.0：497 块
// ≈ 790ms 冷启动），其中绝大多数在屏幕外。现在未进视口的块只渲染等高纯文本占位。
//
// 断言：
//   1. 挂载后只有视口附近的块是真块，其余是占位；
//   2. 占位里能看到原文（内容不丢），且没有 shiki 的 token span；
//   3. 真块里有 shiki 的 token span（高亮确实在可见块上跑了）；
//   4. 滚到底部后，下面的块才被换真块（成本跟着滚动支付）；
//   5. 换真块不改变块高（没有跳动）；
//   6. 行内代码不受这层门影响。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
import '../../styles/chat.css';

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
// 后台标签页不会跑 rAF；用 CDP 推帧或者 setTimeout 都能推进。
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

const BLOCK_COUNT = 6;
const LINE_COUNT = 14;
const codeBlock = (index) => [
  '```js',
  ...Array.from({ length: LINE_COUNT }, (_, line) => `const marker${index}_${line} = ${line};`),
  '```',
].join('\n');
const source = [
  'Intro paragraph with `inline marker` text.',
  ...Array.from({ length: BLOCK_COUNT }, (_, index) => `Paragraph ${index}\n\n${codeBlock(index)}`),
].join('\n\n');

const root = createRoot(document.getElementById('root'));
const render = (content) => flushSync(() => root.render(content));
const deferredBlocks = () => [...document.querySelectorAll('[data-deferred-code]')];
const liveBlocks = () => [...document.querySelectorAll('[data-streamdown="code-block"]:not([data-deferred-code])')];
const tokenSpans = (node) => node.querySelectorAll('span[style*="--sdm-c"]').length;
const blockHeight = (node) => node.getBoundingClientRect().height;

async function main() {
  await document.fonts.ready;
  render(
    <div className="chat-message-list">
      <div className="chat-message-row agent">
        <div className="chat-bubble message-shell agent-response">
          <div className="chat-bubble-text"><Markdown source={source} /></div>
        </div>
      </div>
    </div>,
  );
  await tick();
  await tick();
  await tick();

  check(deferredBlocks().length + liveBlocks().length === BLOCK_COUNT,
    `all ${BLOCK_COUNT} code blocks are accounted for (${liveBlocks().length} live / ${deferredBlocks().length} waiting)`);
  check(liveBlocks().length >= 1, 'the block near the viewport renders for real');
  check(deferredBlocks().length >= 3, 'blocks further down wait as placeholders');
  check(deferredBlocks().every((block) => tokenSpans(block) === 0), 'waiting blocks carry no highlighted tokens');
  check(Array.from({ length: BLOCK_COUNT }, (_, index) => `marker${index}_0`)
    .every((marker) => document.body.textContent.includes(marker)), 'the code text itself is on screen while waiting');
  check(liveBlocks().some((block) => tokenSpans(block) > 0), 'the rendered block did run the highlighter');
  check(document.querySelector('[data-streamdown="inline-code"]')?.textContent === 'inline marker',
    'inline code is untouched by the code-block gate');

  const scroller = document.querySelector('.chat-message-list');
  const lastBlock = deferredBlocks().find((block) => block.textContent.includes('marker5_0'));
  const heightBefore = lastBlock ? blockHeight(lastBlock) : 0;
  const heightBeforeAll = scroller.scrollHeight;
  scroller.scrollTop = scroller.scrollHeight;
  await tick();
  await tick();
  await tick();

  const lastLive = liveBlocks().find((block) => block.textContent.includes('marker5_0'));
  check(Boolean(lastLive), 'scrolling to the bottom swaps the waiting block for the real one');
  check(Boolean(lastLive) && tokenSpans(lastLive) > 0, 'the block that just arrived starts highlighted');
  check(deferredBlocks().length < BLOCK_COUNT - 1, 'the number of waiting blocks drops as you scroll');
  if (lastLive) {
    check(Math.abs(blockHeight(lastLive) - heightBefore) <= 24,
      `the swap keeps the block height (${Math.round(heightBefore)}px -> ${Math.round(blockHeight(lastLive))}px)`);
  }
  check(Math.abs(scroller.scrollHeight - heightBeforeAll) <= 40,
    `the page does not jump when blocks swap in (${Math.round(heightBeforeAll)}px -> ${Math.round(scroller.scrollHeight)}px)`);
  check(window.__pageErrors.length === 0, `no page errors (${window.__pageErrors.join(' | ')})`);
}

(async () => {
  try {
    await main();
    report.dataset.result = failures.length ? 'FAIL' : 'PASS';
    document.title = `${failures.length ? 'FAIL' : 'PASS'}: ${lines.length} deferred code block checks`;
  } catch (error) {
    check(false, `${error.message}\n${error.stack || ''}`);
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
  }
})();

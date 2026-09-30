import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// 回归：streamdown 给「代码 / 图表块动作条」外面那层 wrapper 的默认类名里带
// `pointer-events-none sticky top-2 z-10 -mt-10`，而 app 的生产 CSS 真的会把这套
// Tailwind 工具类定义出来（构建产物里能查到 `.sticky{position:sticky}`、
// `.top-2{top:calc(var(--spacing) * 2)}`）。于是块滚到聊天区顶部时，整条动作条
// （下载 / 复制 / 全屏）会离开自己的块、粘在滚动容器顶上：用户看到聊天区顶部凭空
// 多出一排按钮，和顶栏那三枚图标叠在一起。
//
// 现在的口径：撤掉 sticky，动作条留在块里、随块滚走；再用 header 行高（26px）+
// 块内行距（4px）= 30px 的负 margin 把它压回 header 那一行——块高不变（动作条不再
// 自己占一行）、按钮照旧靠右，观感与之前一致。
//
// 实测（临时 vite 夹具，真实 Streamdown + 真实 markdown.css + 真实聊天气泡结构，
// 滚动的 `.chat-message-list` 顶 = 顶栏下沿）：静止时动作条与块首行重合
// （header 354..380 / row 354..380）；块上推 120px 后它跟着到块顶上方 7px 处、随块
// 离开视口，全程不再出现在容器顶部；把 streamdown 默认的 sticky 注回去，同一位置它
// 立刻粘在滚动容器顶（row.top = 容器 content 顶 + 8px）——即旧症状。
const markdownStyles = readFileSync(new URL('../../styles/markdown.css', import.meta.url), 'utf8');
const stylesDir = new URL('../../styles/', import.meta.url);

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = stripComments(markdownStyles);

/** At-rule preludes (@scope, @layer, ...) wrapping the byte at `index`. */
function enclosingAtRules(source, index) {
  const openers = [];
  const stack = [];
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '{') {
      let start = i - 1;
      while (start >= 0 && !';{}'.includes(source[start])) start -= 1;
      openers.push(source.slice(start + 1, i).trim());
      stack.push(openers.length - 1);
    } else if (source[i] === '}') {
      stack.pop();
    }
  }
  return stack.map((position) => openers[position]);
}

const ruleOf = (selector) => {
  const start = declarations.indexOf(selector);
  assert.ok(start > 0, `rule ${selector} must exist`);
  return { start, body: declarations.slice(start, declarations.indexOf('}', start) + 1) };
};

const wrapperRule = ruleOf('[data-streamdown="code-block"] > div:has(> [data-streamdown="code-block-actions"])');

test('the block actions row stays inside its block instead of sticking to the scroll container', () => {
  assert.match(
    wrapperRule.body,
    /\[data-streamdown="mermaid-block"\] > div:has\(> \[data-streamdown="mermaid-block-actions"\]\)/,
    'streamdown ships the sticky wrapper for both block types — code and mermaid',
  );
  assert.match(wrapperRule.body, /position:\s*static/, 'sticky is what makes the row crawl to the top of the viewport');
  assert.doesNotMatch(
    wrapperRule.body,
    /position:\s*(?:sticky|fixed)/,
    'a sticky/fixed row detaches from its block and hovers at the top of the chat area',
  );
  assert.match(wrapperRule.body, /top:\s*auto/, 'neutralise the wrapper\'s `top-2` utility');
  assert.match(wrapperRule.body, /z-index:\s*auto/, 'and its `z-10`');
});

test('the negative margin keeps the row on the header line and the block height unchanged', () => {
  const rowHeight = Number(wrapperRule.body.match(/height:\s*([\d.]+)px/)?.[1]);
  const marginTop = Number(wrapperRule.body.match(/margin-top:\s*(-[\d.]+)px/)?.[1]);
  const headerRule = ruleOf('[data-streamdown="code-block-header"]');
  const headerHeight = Number(headerRule.body.match(/height:\s*([\d.]+)px/)?.[1]);
  const blockRule = ruleOf('[data-streamdown="code-block"],');
  const blockGap = Number(blockRule.body.match(/gap:\s*([\d.]+)px/)?.[1]);
  assert.ok(rowHeight > 0 && marginTop < 0, `row ${rowHeight}px / margin ${marginTop}px`);
  assert.equal(
    marginTop,
    -(headerHeight + blockGap),
    `the row is lifted back onto the header line: header ${headerHeight}px + block gap ${blockGap}px`,
  );
  assert.equal(rowHeight, headerHeight, 'the row and the header share one line height');
});

test('the override is unlayered, so it beats Tailwind\'s sticky utility', () => {
  const chain = enclosingAtRules(declarations, wrapperRule.start);
  assert.ok(
    chain.some((prelude) => prelude.startsWith('@scope (.haish-markdown)')),
    `the rule must stay scoped to the markdown container, saw ${JSON.stringify(chain)}`,
  );
  // Tailwind layers its utilities (`@layer utilities`) and unlayered rules win over
  // every layer regardless of specificity — moving this into a layer would hand the
  // decision back to the wrapper's `sticky` class.
  assert.ok(
    !chain.some((prelude) => prelude.startsWith('@layer')),
    `the rule must not live inside a cascade layer, saw ${JSON.stringify(chain)}`,
  );
});

test('no app stylesheet re-introduces sticky positioning for the block actions rows', () => {
  const offenders = readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => [name, stripComments(readFileSync(new URL(name, stylesDir), 'utf8'))])
    .flatMap(([name, source]) =>
      [...source.matchAll(/[^{}]*block-actions[^{}]*\{[^}]*\}/g)]
        .filter((match) => /position:\s*(?:sticky|fixed)/.test(match[0]))
        .map((match) => `${name}: ${match[0].trim()}`),
    );
  assert.deepEqual(offenders, [], 'a sticky rule here would put the row back at the top of the viewport');
});

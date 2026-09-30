import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: 「全屏」按钮点下去没反应 —— 弹层的根节点自己也得有骨架。
//
// streamdown 的全屏出口是一个 createPortal 到 document.body 的节点，根上带着一整套
// Tailwind 工具类（mermaid 那侧是 `fixed inset-0 z-50 flex items-center justify-center
// bg-background/95 backdrop-blur-sm`，表格那侧是 `fixed inset-0 z-50 flex flex-col
// bg-background`）。app 把这些工具类按
// `@scope (.haish-markdown, [data-streamdown$="-fullscreen"])` 隔离，而 CSS `@scope`
// 只命中「作用域根的子树」——作用域根自己从来不在作用域里（浏览器实测：同一个 class 挂在
// 根上 computed position 是 static，挂到它的子节点上才是 fixed）。于是 portal 根一条工具类
// 都吃不到：弹层以静态流落在 #root 之后（body 正好一屏高 + overflow hidden，弹层整个在
// 这一屏下面且透明）——点「全屏」看上去毫无反应。
//
// 这条不能用 @scope 修，只能在根上补一条不受 @scope / @layer 约束的骨架（见
// styles/markdown.css 顶部）。几何与命中测试由浏览器夹具 fixtures/markdown-fullscreen.*
// 量（含反向：注回 static/透明后弹层必须落回视口下方）。
const markdownStyles = readFileSync(new URL('../../styles/markdown.css', import.meta.url), 'utf8');
const fixtureHtml = readFileSync(new URL('../fixtures/markdown-fullscreen.html', import.meta.url), 'utf8');
const fixtureModule = readFileSync(new URL('../fixtures/markdown-fullscreen.jsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

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

/** The declaration block of a rule whose selector list matches `selector`. */
function ruleBlock(source, selector, occurrence = 'first') {
  const index = occurrence === 'last' ? source.lastIndexOf(selector) : source.indexOf(selector);
  assert.ok(index > 0, `expected a rule containing \`${selector}\``);
  return { index, block: source.slice(index, source.indexOf('}', index) + 1) };
}

// `[data-streamdown="table-fullscreen"] {` 在共用那条选择器里也出现（它以逗号结尾的那一行），
// 所以两个根各自的声明块按「最后一次出现」取（共用那条在前、各自的在后）。
const sharedRoot = ruleBlock(declarations, '[data-streamdown="mermaid-fullscreen"],');
const mermaidRoot = ruleBlock(declarations, '[data-streamdown="mermaid-fullscreen"] {', 'last');
const tableRoot = ruleBlock(declarations, '[data-streamdown="table-fullscreen"] {', 'last');

test('both fullscreen portal roots carry the skeleton their utility classes can never supply', () => {
  assert.match(
    sharedRoot.block,
    /\[data-streamdown="table-fullscreen"\]/,
    'mermaid 和表格是同一个 portal 根机制（data-streamdown$="-fullscreen"），两边都要有',
  );
  assert.match(sharedRoot.block, /position:\s*fixed/, '`fixed inset-0` 是弹层铺满视口的前提');
  assert.match(sharedRoot.block, /inset:\s*0/, '缺了 inset 就只有 shrink-to-fit 的一块');
  assert.match(sharedRoot.block, /z-index:\s*50/, '盖在聊天区 / 侧栏之上');
  assert.match(sharedRoot.block, /display:\s*flex/, '子节点的 flex 布局（居中 / 分栏）建立在它上面');
});

test('the skeleton lives outside every @scope — a scoped rule could not reach the root', () => {
  for (const [name, rule] of [
    ['shared', sharedRoot],
    ['mermaid', mermaidRoot],
    ['table', tableRoot],
  ]) {
    const chain = enclosingAtRules(declarations, rule.index);
    assert.deepEqual(
      chain,
      [],
      `${name} rule must be top level: @scope 从不匹配作用域根自身，写进 @scope 块里等于没写（这正是这次「点了没反应」的原因），saw ${JSON.stringify(chain)}`,
    );
  }
});

test('the isolation scope stays in place for the overlay contents', () => {
  // 弹层的内容节点（标题条、图、表格）仍然是作用域内的子树，照常吃 Tailwind 工具类：
  // 修根节点不等于把工具类放出来。scope 里那份 utilities 导入要原样留着。
  const scope = ruleBlock(declarations, '@scope (.haish-markdown, [data-streamdown$="-fullscreen"]) {');
  assert.match(scope.block, /@import "tailwindcss\/utilities\.css" layer\(utilities\) source\(none\)/);
  assert.match(scope.block, /\[data-streamdown\$="-fullscreen"\]/, '全屏弹层里的内容也得算 markdown 作用域');
  assert.ok(
    markdownStyles.includes('@scope'),
    '整个 @scope 块都不见了就说明改法走偏了（弹层内容会失去全部工具类）',
  );
});

test('each root keeps the upstream skin it was supposed to get from its own classes', () => {
  // mermaid：`flex items-center justify-center bg-background/95 backdrop-blur-sm`
  assert.match(mermaidRoot.block, /align-items:\s*center/);
  assert.match(mermaidRoot.block, /justify-content:\s*center/);
  assert.match(mermaidRoot.block, /background:\s*#10131df2/i, 'bg-background/95 = #10131d @ 95%');
  assert.match(mermaidRoot.block, /backdrop-filter:\s*blur\(8px\)/, 'backdrop-blur-sm = 8px');
  assert.match(mermaidRoot.block, /-webkit-backdrop-filter:\s*blur\(8px\)/);
  // 表格：`flex flex-col bg-background`（内层自己 flex-1 + overflow-auto 滚表格）
  assert.match(tableRoot.block, /flex-direction:\s*column/);
  assert.match(tableRoot.block, /background:\s*#10131d/i, 'bg-background 是不透明的');
});

test('the browser fixture measures the portal root itself, with a reverse check', () => {
  assert.match(fixtureModule, /window\.__markdownFullscreenChecks\s*=/, '夹具要暴露主检查入口');
  assert.match(fixtureModule, /window\.__markdownFullscreenRevertChecks\s*=/, '以及反向断言入口');
  assert.match(fixtureModule, /the mermaid overlay covers the viewport/);
  assert.match(fixtureModule, /the table overlay covers the viewport too/);
  assert.match(fixtureModule, /elementFromPoint/, '弹层得真的盖在正文之上，不只是存在');
  // 反向断言：注回修复前的骨架（static + 透明）后，弹层要落回视口下面（应用里那一眼看不到的样子）。
  assert.match(fixtureModule, /position:\s*static\s*!important/);
  assert.match(fixtureModule, /inset:\s*auto\s*!important/);
  assert.match(fixtureModule, /background:\s*transparent\s*!important/);
  assert.match(fixtureModule, /without the skeleton the overlay falls below the fold/);
  assert.match(fixtureModule, /box\.top >= window\.innerHeight/, '反向断言的判据是「整块都在视口下面」');
  // 夹具页面必须和 app 同形：body 一屏高 + overflow hidden，否则「落到视口下面」不成立。
  assert.match(fixtureHtml, /html, body \{[^}]*height:\s*100%[^}]*overflow:\s*hidden/);
  assert.match(fixtureHtml, /#root \{ height: 100%; \}/);
  assert.match(readme, /markdown-fullscreen\.html/, 'README 的浏览器回归表要有这一页');
});

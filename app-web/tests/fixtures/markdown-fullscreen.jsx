// 代码块右上角那枚「全屏」按钮（还有表格那枚），点下去必须真的铺满视口。
//
// 现场：点下去「没反应」。streamdown 的全屏出口是一个 createPortal 到 document.body 的节点，
// 根上带着一整套 Tailwind 工具类（mermaid 是 `fixed inset-0 z-50 flex items-center
// justify-center bg-background/95 backdrop-blur-sm`，表格是 `fixed inset-0 z-50 flex
// flex-col bg-background`）。app 把 streamdown 的工具类按
// `@scope (.haish-markdown, [data-streamdown$="-fullscreen"])` 隔离，而 CSS `@scope`
// 只命中「作用域根的子树」——根节点自己不在作用域里。于是 portal 根一条工具类都吃不到：
// 弹层以静态流落在 #root 之后（body 正好一屏高 + overflow hidden），整个弹层就在这一屏
// 下面，点「全屏」看上去毫无反应。
//
// 这里跑真实 Markdown（真实 streamdown + 真实 markdown.css）+ 真实聊天气泡结构，量：
//   ① mermaid 块：按钮能被命中 → 弹层铺满视口、钉在视口上（fixed / inset 0 / z-50 / flex）、
//      盖在正文之上、图真的渲染出来、退出按钮在视口里、点退出后弹层消失；
//   ② 表格块：同一个 portal 根机制（table-fullscreen）同样铺满视口、子节点按列排、表格可见；
//   ③ 反向断言（window.__markdownFullscreenRevertChecks）：把修复前的骨架（static / 透明）
//      注回去，弹层必须退回「静态 + 落到视口下面」——证明上面那些断言量的就是这条规则。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Markdown } from '../../src/shared/ui/Markdown.jsx';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const SOURCE = [
  'BLUF: ER 图如下 —— 两条主结构：①定位键升级为 产品线 × 主体节点；②「协议分组」并入。',
  '',
  '```mermaid',
  'erDiagram',
  '  PRODUCT_LINE ||--o{ NODE : contains',
  '  NODE ||--o{ SCENARIO : holds',
  '  SCENARIO ||--o{ STEP : has',
  '  STEP }o--|| ACTION : uses',
  '```',
  '',
  '| 表 | 说明 |',
  '| --- | --- |',
  '| product_line | 产品线字典 |',
  '| node | 主体节点 |',
  '',
  '触发字典（TRIGGER_DEF）里再展开。',
].join('\n');

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

const boxOf = (node) => {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};
const describeBox = (node) => {
  const box = boxOf(node);
  if (!box) return 'no element';
  return `rect=[${round(box.left)}, ${round(box.top)}, ${round(box.width)}, ${round(box.height)}] viewport=[${window.innerWidth}, ${window.innerHeight}]`;
};
// 铺满视口 = 左上角贴 (0, 0) 且和视口同宽同高（1px 容差，取整误差）。
const coversViewport = (node) => {
  const box = boxOf(node);
  if (!box) return false;
  return (
    Math.abs(box.left) < 1 &&
    Math.abs(box.top) < 1 &&
    Math.abs(box.width - window.innerWidth) < 1 &&
    Math.abs(box.height - window.innerHeight) < 1
  );
};
// `rgba(16, 19, 29, 0.95)` → 0.95；`rgb(...)` → 1；transparent → 0。
const alphaOf = (color) => {
  const match = String(color).match(/rgba?\(([^)]+)\)/);
  if (!match) return 0;
  const parts = match[1].split(',').map((part) => Number(part.trim()));
  return parts.length === 4 ? parts[3] : 1;
};
const hitTest = (node) => {
  const box = boxOf(node);
  if (!box) return false;
  return node.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
};
const overlayOf = (kind) => document.querySelector(`[data-streamdown="${kind}-fullscreen"]`);
// 不给 container 兜底到 document：块不在时"找不到按钮"才是事实，
// 兜底会点到隔壁块的按钮（表不渲染时曾经把 mermaid 的弹层又打开了一次）。
const fullscreenButtonIn = (container) =>
  container?.querySelector('button[title="View fullscreen"], button[aria-label="View fullscreen"]') || null;
// 图里 svg 不止一个（缩放/下载那几枚图标是 16px 的小 svg），取面积最大的那颗 = 真正的图。
const largestSvgIn = (node) => {
  if (!node) return null;
  return [...node.querySelectorAll('svg')]
    .map((svg) => ({ svg, area: svg.getBoundingClientRect().width * svg.getBoundingClientRect().height }))
    .sort((a, b) => b.area - a.area)
    .map((entry) => entry.svg)[0] || null;
};

const report = (list) => {
  const element = document.getElementById('checks');
  element.textContent = list
    .map((item) => `${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `\n      ${item.detail}` : ''}`)
    .join('\n');
  element.dataset.result = list.length > 0 && list.every((item) => item.pass) ? 'PASS' : 'FAIL';
  window.__markdownFullscreenResults = list;
  return list;
};

async function clickFullscreen(container) {
  const button = fullscreenButtonIn(container);
  if (!button) return null;
  button.click();
  await sleep(150);
  return button;
}

async function runChecks() {
  results.length = 0;

  // ——— ① mermaid 代码块 ———
  const mermaidBlock = document.querySelector('[data-streamdown="mermaid-block"]');
  const mermaidButton = fullscreenButtonIn(mermaidBlock);
  check('the mermaid block offers a fullscreen button', Boolean(mermaidButton), mermaidBlock ? 'block found' : 'no mermaid block');
  if (!mermaidButton) return report(results);
  check('the fullscreen button is what the pointer hits', hitTest(mermaidButton), describeBox(mermaidButton));

  await clickFullscreen(mermaidBlock);
  const overlay = overlayOf('mermaid');
  check('the mermaid overlay exists after the click', Boolean(overlay), overlay ? 'portal node on body' : 'no [data-streamdown="mermaid-fullscreen"]');
  check('the mermaid overlay covers the viewport', coversViewport(overlay), describeBox(overlay));

  const style = overlay ? getComputedStyle(overlay) : null;
  check(
    'the overlay root is pinned to the viewport (fixed / inset 0 / z-50 / flex)',
    Boolean(style) && style.position === 'fixed' && style.zIndex === '50' && style.display === 'flex' && style.top === '0px' && style.left === '0px',
    style ? `position=${style.position} z-index=${style.zIndex} display=${style.display} top=${style.top} left=${style.left}` : 'no overlay',
  );
  check(
    'the overlay paints over the message underneath',
    Boolean(overlay) && overlay.contains(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)),
    overlay ? `elementFromPoint(center)=${document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.getAttribute('data-streamdown') || 'other'}` : 'no overlay',
  );
  check(
    'the overlay root keeps the upstream skin (dim backdrop + blur, content centred)',
    Boolean(style) &&
      alphaOf(style.backgroundColor) >= 0.9 &&
      style.backdropFilter.includes('blur(8px)') &&
      style.alignItems === 'center' &&
      style.justifyContent === 'center',
    style ? `background=${style.backgroundColor} backdrop=${style.backdropFilter} align-items=${style.alignItems} justify-content=${style.justifyContent}` : 'no overlay',
  );

  const diagram = largestSvgIn(overlay?.querySelector('[data-streamdown="mermaid"]'));
  const diagramBox = boxOf(diagram);
  check(
    'the diagram is really rendered inside the overlay',
    Boolean(diagramBox) && diagramBox.width > 40 && diagramBox.height > 40,
    diagramBox ? describeBox(diagram) : 'no svg',
  );

  const exitButton = overlay?.querySelector('button[title="Exit fullscreen"], button[aria-label="Exit fullscreen"]');
  const exitBox = boxOf(exitButton);
  check(
    'the exit button sits inside the viewport',
    Boolean(exitBox) &&
      exitBox.left >= 0 &&
      exitBox.top >= 0 &&
      exitBox.left + exitBox.width <= window.innerWidth &&
      exitBox.top + exitBox.height <= window.innerHeight &&
      exitBox.width >= 16,
    exitBox ? describeBox(exitButton) : 'no exit button',
  );

  exitButton?.click();
  await sleep(120);
  check(
    'closing removes the mermaid overlay and releases the scroll lock',
    !overlayOf('mermaid') && document.body.style.overflow === '',
    `overlay=${Boolean(overlayOf('mermaid'))} bodyOverflow="${document.body.style.overflow}"`,
  );

  // ——— ② 表格块（同一个 portal 根机制） ———
  // 表格是 GFM 语法，走 streamdown 默认 remark 插件里的 remark-gfm；
  // Markdown.jsx 一旦自己传 remarkPlugins 数组就会把默认那套整个换掉（表格会退化成
  // 一段带竖线的普通文本）。这不是本夹具要测的东西，但表格不渲染时后面几条也就无从量起，
  // 所以这里单独报一条并说清原因，避免误诊成"全屏又坏了"。
  const tableWrapper = document.querySelector('[data-streamdown="table-wrapper"]');
  const tableButton = fullscreenButtonIn(tableWrapper);
  if (!tableWrapper) {
    check(
      'the table renders at all (needs streamdown\'s default remark plugins: remark-gfm)',
      false,
      'Markdown 没渲染出 [data-streamdown="table-wrapper"]——当前工作区的 Markdown.jsx 自己传了 remarkPlugins 数组，把 streamdown 默认的 {gfm, codeMeta} 整套换掉了；表格块的检查因此跳过',
    );
  } else {
    check('the table block offers a fullscreen button', Boolean(tableButton), 'table found');
  }
  if (tableButton) {
    await clickFullscreen(tableWrapper);
    const tableOverlay = overlayOf('table');
    check('the table overlay covers the viewport too', coversViewport(tableOverlay), describeBox(tableOverlay));
    const tableStyle = tableOverlay ? getComputedStyle(tableOverlay) : null;
    check(
      'the table overlay stacks its rows (flex-direction: column, opaque background)',
      Boolean(tableStyle) && tableStyle.flexDirection === 'column' && alphaOf(tableStyle.backgroundColor) === 1,
      tableStyle ? `flex-direction=${tableStyle.flexDirection} background=${tableStyle.backgroundColor}` : 'no overlay',
    );
    const tableBox = boxOf(tableOverlay?.querySelector('[data-streamdown="table"]'));
    check(
      'the table is really rendered inside the overlay',
      Boolean(tableBox) && tableBox.height > 10 && tableBox.width > 10,
      tableBox ? describeBox(tableOverlay.querySelector('[data-streamdown="table"]')) : 'no table',
    );
    tableOverlay?.querySelector('button[title="Exit fullscreen"]')?.click();
    await sleep(120);
    check('closing removes the table overlay', !overlayOf('table'), `overlay=${Boolean(overlayOf('table'))}`);
  }

  check('no page errors while opening / closing the overlays', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return report(results);
}

// 反向断言：注回修复前的骨架——portal 根上的工具类本来就落不到（@scope 不匹配根），
// 弹层就是「静态 + 透明 + 落在这一屏下面」。此时必须覆盖不到视口、并且整个在视口下方。
async function revertChecks() {
  const style = document.createElement('style');
  style.textContent = `
    [data-streamdown="mermaid-fullscreen"],
    [data-streamdown="table-fullscreen"] {
      position: static !important;
      inset: auto !important;
      z-index: auto !important;
      display: block !important;
      background: transparent !important;
      -webkit-backdrop-filter: none !important;
      backdrop-filter: none !important;
    }
  `;
  document.head.appendChild(style);

  await clickFullscreen(document.querySelector('[data-streamdown="mermaid-block"]'));
  const overlay = overlayOf('mermaid');
  const box = boxOf(overlay);
  const computed = overlay ? getComputedStyle(overlay) : null;
  const list = [
    {
      name: 'revert: the overlay root goes back to static and transparent',
      pass: Boolean(computed) && computed.position === 'static' && alphaOf(computed.backgroundColor) === 0 && !computed.backdropFilter.includes('blur'),
      detail: computed ? `position=${computed.position} background=${computed.backgroundColor} backdrop=${computed.backdropFilter}` : 'no overlay',
    },
    {
      name: 'revert: without the skeleton the overlay falls below the fold',
      pass: Boolean(box) && box.top >= window.innerHeight - 1 && !coversViewport(overlay),
      detail: `${describeBox(overlay)} (body 一屏高 + overflow hidden，落下去就等于看不见)`,
    },
  ];

  overlay?.querySelector('button[title="Exit fullscreen"], button[aria-label="Exit fullscreen"]')?.click();
  await sleep(120);
  style.remove();
  return report(list);
}

const root = createRoot(document.getElementById('root'));
flushSync(() =>
  root.render(
    <div className="fullscreen-fixture">
      <header>markdown fullscreen — 代码块 / 表格的「全屏」按钮点下去真的铺满视口</header>
      <div id="stage">
        <div className="chat-message-list">
          <div className="chat-message-row agent">
            <div className="chat-bubble message-shell agent-response">
              <div className="chat-bubble-text">
                <Markdown source={SOURCE} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <pre id="checks" role="status">Running checks…</pre>
    </div>,
  ),
);

window.__markdownFullscreenChecks = async () => runChecks();
window.__markdownFullscreenRevertChecks = async () => revertChecks();
window.__markdownFullscreenAutoRun = () => {
  // 用 setTimeout 轮询而不是 rAF：后台标签页也能跑完。
  (async () => {
    await document.fonts.ready;
    for (let i = 0; i < 100; i += 1) {
      if (document.querySelector('[data-streamdown="mermaid-block"] [data-streamdown="mermaid"] svg')) break;
      await sleep(100);
    }
    try {
      await runChecks();
    } catch (error) {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    }
  })();
};

window.__markdownFullscreenAutoRun();

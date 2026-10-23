import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppToastStack } from '../../src/features/app/components/AppToast.jsx';
import '../../styles/base.css';
import '../../styles/modals.css';

// warn 是第四种 tone：动作被前置条件挡住，比 info 重、比 error 轻。
const KINDS = [
  { kind: 'success', message: 'llm provider test passed' },
  { kind: 'error', message: 'llm provider test failed' },
  { kind: 'warn', message: 'Pick an agent before sending.' },
  { kind: 'info', message: 'Checking llm provider…' },
  { kind: 'unmapped-kind', message: 'Unknown kind renders the info glyph' },
];
const TONES = ['success', 'error', 'warn', 'info'];
const QUEUED = KINDS.map((entry, index) => ({ id: `toast-${index}-${entry.kind}`, ...entry }));
const kindIndex = (kind) => KINDS.findIndex((entry) => entry.kind === kind);

let withEmptyToast = false;
let withSingleToast = false;
const root = createRoot(document.getElementById('root'));

function entries() {
  if (withSingleToast) return QUEUED.slice(0, 1);
  return withEmptyToast ? [...QUEUED, { id: 'empty-toast', kind: 'success', message: '' }] : QUEUED;
}

function render() {
  flushSync(() => root.render(
    <main className="toast-fixture">
      <h1>Toast regression</h1>
      <p>Production AppToastStack on the dark shell: one badge per kind, stacked inside the real container and asserted against the real component.</p>
      <AppToastStack toasts={entries()} />
      <pre id="checks" role="status">Running checks…</pre>
    </main>,
  ));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
const stack = () => document.querySelector('.toast-fixture .app-toast-stack');
const toasts = () => [...document.querySelectorAll('.toast-fixture .app-toast-stack .app-toast')];
const icon = (index) => toasts()[index].querySelector('.app-toast-icon');
const box = (element) => element.getBoundingClientRect();
// 固定定位的包含块是视口：用 clientWidth（已排除滚动条）当居中基准。
const viewportWidth = () => document.documentElement.clientWidth;
const centered = (rect) => Math.abs((rect.left + rect.width / 2) - viewportWidth() / 2) <= 1;
const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
}

function rgb(value) {
  return value.replace(/\s+/g, '');
}

async function run() {
  render();
  await tick();

  check(toasts().length === KINDS.length, 'Every kind renders exactly one toast');
  check(document.querySelectorAll('.app-toast-stack').length === 1
    && toasts().every((toast) => toast.parentElement === stack()),
    'Every bubble lives inside the single stack container');
  check(!stack().hasAttribute('role') && !stack().hasAttribute('aria-live'),
    'The stack adds no second live region around the polite status toasts');
  check(document.querySelectorAll('[role="alert"]').length === 0,
    'No toast escalates to an alert region');
  check(icon(0).getAttribute('aria-hidden') === 'true' && toasts()[0].getAttribute('role') === 'status',
    'Icon stays decorative inside the polite status region');
  check(toasts().map((toast) => toast.querySelector('.app-toast-message').textContent).join('|')
    === KINDS.map(({ message }) => message).join('|'), 'Toast shows the message verbatim');

  const glyphs = KINDS.map((_, index) => icon(index).querySelector('svg'));
  check(glyphs.every(Boolean) && KINDS.every((_, index) => icon(index).querySelectorAll('svg').length === 1),
    'Every icon is a single vector glyph');
  check(document.querySelectorAll('.app-toast img').length === 0
    && KINDS.every((_, index) => getComputedStyle(icon(index)).backgroundImage === 'none'),
    'Icons no longer depend on any raster asset');

  check(KINDS.every((_, index) => getComputedStyle(icon(index)).imageRendering === 'auto'),
    'Icon opts out of the inherited image-rendering: pixelated');
  check(glyphs.every((svg) => getComputedStyle(svg).imageRendering === 'auto'),
    'Glyph SVG renders with antialiasing on the dark shell');

  // 图标是细描边向量，不是实心圆底贴纸：底色透明、颜色跟着 tone 走。
  check(KINDS.every((_, index) => getComputedStyle(icon(index)).backgroundColor === 'rgba(0, 0, 0, 0)'),
    'The glyph sits on no tinted chip of its own');
  check(new Set(TONES.map((kind) => getComputedStyle(icon(kindIndex(kind))).color)).size === 4,
    'Success, error, warn and info keep four distinct icon colors');
  check(new Set(TONES.map((kind) => rgb(getComputedStyle(toasts()[kindIndex(kind)]).borderTopColor))).size === 4,
    'Each tone keeps its own border tint');
  const amber = getComputedStyle(icon(kindIndex('warn'))).color.match(/\d+/g).map(Number);
  check(amber[0] > amber[1] && amber[1] > amber[2], 'Warn icon sits in the amber range, not red or blue');
  check(icon(kindIndex('warn')).querySelector('svg').innerHTML !== icon(kindIndex('error')).querySelector('svg').innerHTML
    && icon(kindIndex('warn')).querySelector('svg').innerHTML !== icon(kindIndex('info')).querySelector('svg').innerHTML,
    'Warn draws its own triangle glyph instead of reusing the error X');

  // 15px、2px 描边：比实心徽标小一圈，跟 ErrorState 的行内图标同一个尺码。
  check(KINDS.every((_, index) => {
    const glyphBox = box(glyphs[index]);
    return Math.round(glyphBox.width) === 15 && Math.round(glyphBox.height) === 15
      && getComputedStyle(glyphs[index]).strokeWidth === '2px'
      && getComputedStyle(icon(index)).borderRadius !== '999px';
  }), 'The icon stays a small 15px 2px-stroke glyph, not a coin');

  check(KINDS.every((_, index) => {
    const badge = box(icon(index));
    const glyphBox = box(glyphs[index]);
    return Math.abs((badge.left + badge.width / 2) - (glyphBox.left + glyphBox.width / 2)) <= 1
      && Math.abs((badge.top + badge.height / 2) - (glyphBox.top + glyphBox.height / 2)) <= 1;
  }), 'Glyph is optically centered in its slot');

  check(icon(kindIndex('unmapped-kind')).querySelector('svg').innerHTML
    === icon(kindIndex('info')).querySelector('svg').innerHTML,
  'Unknown kind falls back to the info glyph instead of rendering nothing');

  // 固定定位从气泡搬到了容器上：容器顶部居中 22px、层级 520、不吃点击。
  const stackStyle = getComputedStyle(stack());
  check(stackStyle.position === 'fixed' && stackStyle.top === '22px' && stackStyle.zIndex === '520',
    'The stack container owns the fixed placement that used to sit on the toast');
  check(stackStyle.display === 'flex' && stackStyle.flexDirection === 'column'
    && stackStyle.alignItems === 'center' && stackStyle.rowGap === '8px',
    'Bubbles are a centered column with an 8px gap');
  check(stackStyle.pointerEvents === 'none', 'Toasts never eat clicks meant for the shell');
  const stackBox = box(stack());
  check(Math.round(stackBox.top) === 22 && centered(stackBox),
    'The stack is still top-centered at 22px like the single toast it replaced');

  const boxes = toasts().map(box);
  check(boxes.every((toastBox, index) => index === 0
    || Math.round(toastBox.top - boxes[index - 1].bottom) === 8),
  'Stacked bubbles keep the 8px gap instead of overlapping');
  check(boxes.every(centered), 'Every bubble stays horizontally centered');

  withSingleToast = true;
  render();
  await tick();
  const soloStack = box(stack());
  const soloToast = box(toasts()[0]);
  check(toasts().length === 1
    && Math.round(soloStack.width) === Math.round(soloToast.width)
    && Math.round(soloStack.height) === Math.round(soloToast.height)
    && Math.round(soloStack.top) === 22 && centered(soloStack),
  'A lone toast is still shrink-wrapped and top-centered at 22px');
  withSingleToast = false;

  withEmptyToast = true;
  render();
  await tick();
  check(toasts().length === KINDS.length, 'Messages stay hidden when there is nothing to announce');

  document.getElementById('checks').dataset.result = 'PASS';
  document.getElementById('checks').textContent = checks.join('\n');
}

run().catch((error) => {
  document.getElementById('checks').dataset.result = 'FAIL';
  document.getElementById('checks').textContent = [...checks, `FAIL ${error.message}`].join('\n');
});

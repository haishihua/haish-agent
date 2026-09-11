import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppToast } from '../../src/features/app/components/AppToast.jsx';
import '../../styles/base.css';
import '../../styles/modals.css';

const KINDS = [
  { kind: 'success', message: 'llm provider test passed' },
  { kind: 'error', message: 'llm provider test failed' },
  { kind: 'info', message: 'Checking llm provider…' },
  { kind: 'unmapped-kind', message: 'Unknown kind renders the info glyph' },
];
let withEmptyToast = false;
const root = createRoot(document.getElementById('root'));

function render() {
  flushSync(() => root.render(
    <main className="toast-fixture">
      <h1>Toast regression</h1>
      <p>Production AppToast on the dark shell: one badge per kind, asserted against the real component.</p>
      <section className="toast-fixture-row" aria-label="Status toasts">
        {KINDS.map(({ kind, message }) => <AppToast key={kind} kind={kind} message={message} />)}
        {withEmptyToast ? <AppToast kind="success" message="" /> : null}
      </section>
      <pre id="checks" role="status">Running checks…</pre>
    </main>,
  ));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
const toasts = () => [...document.querySelectorAll('.toast-fixture-row .app-toast')];
const icon = (index) => toasts()[index].querySelector('.app-toast-icon');
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
  check(icon(0).getAttribute('aria-hidden') === 'true' && toasts()[0].getAttribute('role') === 'status',
    'Badge stays decorative inside the polite status region');
  check(toasts().map((toast) => toast.querySelector('.app-toast-message').textContent).join('|')
    === KINDS.map(({ message }) => message).join('|'), 'Toast shows the message verbatim');

  const glyphs = KINDS.map((_, index) => icon(index).querySelector('svg'));
  check(glyphs.every(Boolean) && KINDS.every((_, index) => icon(index).querySelectorAll('svg').length === 1),
    'Every badge is a single vector glyph');
  check(document.querySelectorAll('.app-toast img').length === 0
    && KINDS.every((_, index) => getComputedStyle(icon(index)).backgroundImage === 'none'),
    'Badges no longer depend on any raster asset');

  check(KINDS.every((_, index) => getComputedStyle(icon(index)).imageRendering === 'auto'),
    'Badge opts out of the inherited image-rendering: pixelated');
  check(glyphs.every((svg) => getComputedStyle(svg).imageRendering === 'auto'),
    'Glyph SVG renders with antialiasing on the dark shell');

  check(KINDS.every((_, index) => rgb(getComputedStyle(icon(index)).color) === 'rgb(255,255,255)'),
    'Glyph contrast comes from a solid white currentColor');
  check(new Set(KINDS.slice(0, 3).map((_, index) => getComputedStyle(icon(index)).backgroundColor)).size === 3,
    'Success, error and info keep three distinct badge colors');

  check(KINDS.every((_, index) => {
    const box = icon(index).getBoundingClientRect();
    return Math.round(box.width) === 20 && Math.round(box.height) === 20
      && getComputedStyle(icon(index)).borderRadius === '999px';
  }), 'Badge stays a 20px circle');

  check(KINDS.every((_, index) => {
    const box = icon(index).getBoundingClientRect();
    const glyphBox = glyphs[index].getBoundingClientRect();
    return Math.abs((box.left + box.width / 2) - (glyphBox.left + glyphBox.width / 2)) <= 1
      && Math.abs((box.top + box.height / 2) - (glyphBox.top + glyphBox.height / 2)) <= 1;
  }), 'Glyph is optically centered inside the badge');

  check(icon(3).querySelector('svg').innerHTML === icon(2).querySelector('svg').innerHTML,
    'Unknown kind falls back to the info glyph instead of rendering nothing');

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

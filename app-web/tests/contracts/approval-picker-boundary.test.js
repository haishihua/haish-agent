import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8');

test('approval options stay symmetric around the current mode with room beside the sidebar', () => {
  const picker = css.match(/\.approval-mode-picker\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(picker, /margin-left|padding-left|transform/);
  assert.match(css, /\.approval-mode-picker\.is-open\s*\{[^}]*transform: translateX\(8px\)/);
  assert.match(css, /\.approval-mode-menu\s*\{[^}]*left: 50%/);
  assert.match(css, /@keyframes approval-mode-left-in\s*\{[^]*?to \{ transform: translate\(calc\(-50% - 30px\), calc\(-50% - 48px\)\)/);
  assert.match(css, /@keyframes approval-mode-right-in\s*\{[^]*?to \{ transform: translate\(calc\(-50% \+ 30px\), calc\(-50% - 48px\)\)/);
});

test('approval picker retains hover gating, pressed feedback and reduced motion', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.approval-mode-trigger:hover/);
  assert.match(css, /\.approval-mode-option:active \{ background:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^]*?\.approval-mode-option \{ transition: none;/);
});

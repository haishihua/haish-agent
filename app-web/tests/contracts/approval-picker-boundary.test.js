import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8');

test('approval options stay symmetric around the current mode with room beside the sidebar', () => {
  const picker = css.match(/\.approval-mode-picker\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(picker, /margin-left|padding-left|transform/);
  // Clicking must never move the button out from under the pointer: only the upper
  // options are nudged, so the fan still clears the sidebar at narrow widths.
  const opened = css.match(/\.approval-mode-picker\.is-open\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(opened, /transform/);
  assert.match(css, /\.approval-mode-picker\.is-open \.approval-mode-menu\s*\{[^}]*transform: translateX\(8px\)/);
  assert.match(css, /\.approval-mode-menu\s*\{[^}]*left: 50%/);
  assert.match(css, /\.approval-mode-option-1\s*\{[^}]*transform: translate\(calc\(-50% - 30px\), calc\(-50% - 48px\)\)/);
  assert.match(css, /\.approval-mode-option-2\s*\{[^}]*transform: translate\(calc\(-50% \+ 30px\), calc\(-50% - 48px\)\)/);
  // Opening fades the options in place instead of animating them across the screen.
  assert.match(css, /@keyframes approval-mode-fade-in\s*\{[^]*?from \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /approval-mode-left-in|approval-mode-right-in|approval-mode-blob-in/);
});

test('approval picker retains hover gating, pressed feedback and reduced motion', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.approval-mode-trigger:hover/);
  assert.match(css, /\.approval-mode-option:active \{ background:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^]*?\.approval-mode-option \{ transition: none;/);
});

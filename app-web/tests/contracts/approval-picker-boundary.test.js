import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8');
const pickerSource = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');

test('approval options stay symmetric around the current mode with room beside the sidebar', () => {
  const picker = css.match(/\.approval-mode-picker\s*\{([^}]*)\}/)[1];
  // 静态的左拉：抵消 38px 按钮内 21px 图标的光学内缩，让图标左边缘与 placeholder 文字对齐；
  // 打开时按钮本身仍然不动。
  assert.match(picker, /margin-left: -8\.5px;/);
  assert.doesNotMatch(picker, /padding-left|transform/);
  // Clicking must never move the button out from under the pointer: only the upper
  // options are nudged, so the fan still clears the sidebar at narrow widths.
  const opened = css.match(/\.approval-mode-picker\.is-open\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(opened, /transform: translate/);
  // 备选图标跟当前图标同一个中心，随它一起左移；不再额外向右偏移。
  assert.match(css, /\.approval-mode-picker\.is-open \.approval-mode-menu\s*\{\s*transform: none;/);
  assert.match(css, /\.approval-mode-menu\s*\{[^}]*left: 50%/);
  // 两个备选在当前图标上方紧凑对称展开。
  assert.match(css, /\.approval-mode-option-1\s*\{[^}]*transform: translate\(calc\(-50% - 18px\), calc\(-50% - 30px\)\)/);
  assert.match(css, /\.approval-mode-option-2\s*\{[^}]*transform: translate\(calc\(-50% \+ 18px\), calc\(-50% - 30px\)\)/);
  // 图标不再包圆框：只留 icon，不再画边框/底色/投影/背后光晕。
  const trigger = css.match(/\.approval-mode-trigger\s*\{([^}]*)\}/)[1];
  const option = css.match(/\.approval-mode-option\s*\{([^}]*)\}/)[1];
  for (const block of [trigger, option]) {
    assert.match(block, /border: 0;/);
    assert.match(block, /background: transparent;/);
    assert.match(block, /box-shadow: none;/);
    // 图标本身使用不透明白色，不添加底色或外圈。
    assert.match(block, /color: #fff;/);
  }
  assert.doesNotMatch(css, /approval-mode-menu::before\s*\{[^}]*radial-gradient/);
  // 容器不铺任何背景或覆盖层。
  assert.match(css, /\.approval-mode-menu::before \{ content: none; \}/);
  // Opening fades the options in place instead of animating them across the screen.
  assert.match(css, /@keyframes approval-mode-fade-in\s*\{[^]*?from \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /approval-mode-left-in|approval-mode-right-in|approval-mode-blob-in/);
});

test('approval icon strokes match Auto Approve in either picker position', () => {
  assert.match(pickerSource, /data-approval-mode=\{current\.id\}/);
  assert.match(pickerSource, /data-approval-mode=\{opt\.id\}/);
  // 三套素材自带的透明边不同，逐个模式抹平后可见轮廓左边缘才落在同一列上。
  assert.match(css, /\.approval-mode-icon\[data-approval-mode='smart'\][^{]*\{\s*transform: translateX\(-3px\)/);
  assert.match(css, /\.approval-mode-icon\[data-approval-mode='full'\][^{]*\{\s*transform: translateX\(-2px\)/);
  assert.match(pickerSource, /id: 'strict'[^\n]*icon: 'approval-strict-bold\.png'/);
  assert.match(pickerSource, /id: 'smart'[^\n]*icon: 'generative\.png'/);
  assert.match(pickerSource, /id: 'full'[^\n]*icon: 'approval-full-bold\.png'/);
  for (const name of ['approval-strict-bold.png', 'approval-full-bold.png']) {
    assert.ok(fs.existsSync(new URL(`../../assets/ui/icons/${name}`, import.meta.url)));
  }
});

test('approval picker retains hover gating, pressed feedback and reduced motion', () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.approval-mode-trigger:hover/);
  assert.match(css, /\.approval-mode-option:active \{ opacity:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^]*?\.approval-mode-option \{ transition: none;/);
});

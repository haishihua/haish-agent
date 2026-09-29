import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const footerSource = fs.readFileSync(
  new URL('../../src/features/conversations/components/AppUpdateFooter.jsx', import.meta.url),
  'utf8',
);
const footerCss = fs.readFileSync(new URL('../../styles/app-shell.css', import.meta.url), 'utf8');
const progressSource = fs.readFileSync(
  new URL('../../src/features/conversations/model/update-progress.js', import.meta.url),
  'utf8',
);

function cssBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open, close + 1);
}

test('the sidebar footer only grows an update entry when something can be installed', () => {
  const entrySource = footerSource.slice(footerSource.indexOf('function updateEntryLabel'));
  assert.match(entrySource, /if \(state\?\.status === 'available'\) \{/);
  assert.match(
    entrySource,
    /return state\.availableVersion \? `Update to v\$\{state\.availableVersion\}` : 'Update available';/,
  );
  assert.match(entrySource, /if \(state\?\.status === 'error' && state\.canInstall\) return 'Retry install';/);
  // 其余状态（已是最新 / 开发版 / 检查中 / 检查失败）一个入口都不长，全部落到那行弱提示。
  assert.match(entrySource, /return '';/);
});

test('every non-installable state reads as a quiet version hint', () => {
  // 版本号永远在最前面：装了哪一版、是不是最新，一眼能看到。
  assert.match(footerSource, /const withCurrent = \(text\) => \(current \? `\$\{current\} · \$\{text\}` : text\);/);
  assert.match(footerSource, /return withCurrent\('Up to date'\);/);
  assert.match(footerSource, /return withCurrent\('Dev build'\);/);
  assert.match(footerSource, /return withCurrent\('Checking…'\);/);
  assert.match(footerSource, /return withCurrent\(state\.message \|\| 'Update failed'\);/);
  // 「Updates unavailable」只剩「没有更新通道」（浏览器里没有桌面 API）这一种兜底。
  assert.match(footerSource, /canCheck \? withCurrent\('Check for updates'\) : 'Updates unavailable'/);
  // 没有入口时统一挂 is-quiet：这条类只拿掉底色，框留着。
  assert.match(footerSource, /className=\{`app-update-button\$\{quiet \? ' is-quiet' : ''\}/);
});

test('the launch check is silent: it only feeds the hint, never a toast', () => {
  assert.match(footerSource, /const AUTO_CHECK_DELAY_MS = 1500;/);
  const idleIndex = footerSource.indexOf("state?.status === 'idle' && desktop.checkForAppUpdates");
  assert.ok(idleIndex > 0, 'only the idle state of an installed build may auto-check');
  const autoCheckWindow = footerSource.slice(idleIndex, idleIndex + 420);
  assert.match(autoCheckWindow, /checkForAppUpdates\(\)/);
  assert.match(autoCheckWindow, /setUpdateState\(next\)/);
  assert.doesNotMatch(autoCheckWindow, /onToast/);
  // 静默对版本不算「用户点的那次更新」：不置 updateBusy，所以不会切出灰卡。
  assert.doesNotMatch(autoCheckWindow, /setUpdateBusy/);
  // 用户点了才弹 toast。
  assert.match(footerSource, /notifyUpdateState\(onToast, checked\);/);
});

test('the quiet hint keeps the box, only drops the fill', () => {
  const base = cssBlock(footerCss, '.app-update-button {');
  const quiet = cssBlock(footerCss, '.app-update-button.is-quiet {');
  assert.match(base, /height: 34px;/);
  // 框是两种形态共用的那一圈：弱提示不许把它擦掉——写成 border-color: transparent 之后，
  // 页脚里只剩一行飘着的字，跟上面的项目行连成一片（「那个框框怎么没有了」）。
  assert.match(base, /border: 1px solid rgba\(176, 206, 255, 0\.12\);/);
  assert.doesNotMatch(quiet, /border-color: transparent;/);
  // 弱在哪：只去掉底色（+ 压暗字色）。
  assert.match(quiet, /background: transparent;/);
  assert.match(quiet, /font-weight: 500;/);
  // 居中：这是一行状态（版本 + 状态），贴在左边会被看成一枚没做完的按钮。
  assert.match(quiet, /justify-content: center;/);
  // 版本号数字等宽：切状态（Up to date → Checking…）时数字不跳。
  assert.match(base, /font-variant-numeric: tabular-nums;/);
  // 字体跟应用正文统一（--conversation-font）：这行和它的悬浮说明、左栏列表是同一套字——
  // 过去这里单写过一套系统字体栈，悬停说明和状态行摆在一起就是「两个字体」。
  assert.match(base, /font: 500 12px\/1\.2 var\(--conversation-font\);/);
  // 弱提示和入口按钮同高：两种形态来回切换时上面的列表不跳。
  assert.doesNotMatch(quiet, /height:/);
});

test('hover, pressed, focus and motion follow the house rules', () => {
  assert.match(
    footerCss,
    /@media \(hover: hover\) and \(pointer: fine\) \{\n {4}\.app-update-button:not\(\.is-quiet\):hover \{/,
  );
  assert.match(footerCss, /\.app-update-button\.is-quiet\[data-actionable='true'\]:hover \{/);
  assert.match(footerCss, /\.app-update-button\[data-actionable='true'\]:active \{\n {4}transform: scale\(0\.985\);/);
  assert.match(
    footerCss,
    /\.app-update-button:focus-visible \{\n {4}box-shadow: 0 0 0 1px rgba\(105, 200, 246, 0\.55\);/,
  );
  assert.match(
    footerCss,
    /@media \(prefers-reduced-motion: reduce\) \{\n {4}\.app-update-button \{\n {8}transition: none;/,
  );
  assert.doesNotMatch(footerCss, /transition:\s*all/);
});

test('the card covers the whole user-started run without covering the silent check', () => {
  // 用户点的那次本来就是 Check → Download → Install 一条流程：checking 就出卡，停在 Check 阶段。
  assert.match(progressSource, /const checking = status === 'checking' && userInitiated;/);
  assert.match(progressSource, /if \(!checking && !downloading && !installing\) return null;/);
  assert.match(progressSource, /title: 'Checking updates'/);
  // 只有用户点出来的那次（updateBusy）算数；启动那次静默对版本不铺卡。
  assert.match(footerSource, /updateJobProgress\(updateState, \{ userInitiated: updateBusy \}\)/);
  assert.doesNotMatch(progressSource, /'not-available'/);
});

test('the footer has exactly one look source', () => {
  const stylesDir = new URL('../../styles/', import.meta.url);
  for (const name of [
    'base.css',
    'panels.css',
    'chat.css',
    'delegation.css',
    'modals.css',
    'tool-elements.css',
    'approvals.css',
    'workflow-runtime.css',
  ]) {
    const css = fs.readFileSync(new URL(name, stylesDir), 'utf8');
    assert.doesNotMatch(css, /app-update-button/, `${name} must not restyle the update footer`);
  }
});

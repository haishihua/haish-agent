import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelsCss = fs.readFileSync(new URL('../../styles/panels.css', import.meta.url), 'utf8');
const appShellCss = fs.readFileSync(new URL('../../styles/app-shell.css', import.meta.url), 'utf8');
const fixtureSource = fs.readFileSync(new URL('../fixtures/sidebar-density.jsx', import.meta.url), 'utf8');
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function cssBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open, close + 1);
}

test('the sidebar rows and the gaps between them are the compact rhythm', () => {
  // 「会话标题之间 / 会话与项目之间 / 项目与项目之间」的留白全部来自行高这一份：
  // 32px 行（13px 标题 + 上下 5px 内边距），项目行与折叠按钮同高，整块间距由它们叠出来。
  const rows = cssBlock(panelsCss, '.project-row,\n.conversation-row {');
  assert.match(rows, /min-height: 32px;/);
  assert.match(rows, /padding: 5px 11px;/);
  assert.doesNotMatch(rows, /min-height: 42px;/);
  // 项目行里那枚 26px 高的折叠按钮不再把项目行撑到 44px（那是「项目之间很宽」的大头）。
  assert.match(cssBlock(panelsCss, '\n.project-row {'), /padding-block: 3px;/);
  assert.match(cssBlock(panelsCss, '\n.project-node {'), /margin-bottom: 4px;/);
  assert.match(cssBlock(panelsCss, '\n.conversations-body {'), /padding: 8px 0 10px;/);
});

test('the Show more row does not add its own band back', () => {
  // 一个项目块 = 项目行 + 5 行预览 + Show more；Show more 之前有一份 30px 的
  // 覆盖值把这块又撑起来，两处 min-height 只留一条。
  const matches = panelsCss.match(/\.conversation-show-more \{[^}]*\}/g) || [];
  const blocks = matches.filter((block) => /min-height/.test(block));
  assert.equal(blocks.length, 1, 'exactly one .conversation-show-more rule may set min-height');
  assert.match(blocks[0], /min-height: 26px;/);
  assert.doesNotMatch(panelsCss, /min-height: 30px;\n\}/);
});

test('the sidebar keeps one title column: small folder icon, titles aligned, long tails fade', () => {
  // 项目标题与会话标题同一条竖线：文字列 = 图标缩进 3px + folder 15px +
  // 图标与标题之间的留白 10px = 28px；会话侧 = 子列表 17px + 会话行 11px。
  assert.match(cssBlock(panelsCss, '\n.conversations-body {'), /--sidebar-text-indent: 28px;/);
  assert.match(cssBlock(panelsCss, '\n.project-row {'), /padding-left: var\(--sidebar-text-indent, 28px\);/);
  assert.match(cssBlock(panelsCss, '\n.project-conversations {'), /padding: 0 0 0 17px;/);
  const toggle = cssBlock(panelsCss, '\n.project-icon-toggle {');
  assert.match(toggle, /position: absolute;/);
  assert.match(toggle, /width: var\(--sidebar-text-indent, 28px\);/);
  assert.match(toggle, /height: 24px;/);
  // 图标不居中：贴左边 3px，右边剩下的 10px 才是图标与标题之间那道缝。
  assert.match(toggle, /padding: 0 0 0 3px;/);
  assert.match(toggle, /justify-content: flex-start;/);
  assert.doesNotMatch(toggle, /justify-content: center;/);
  assert.match(cssBlock(panelsCss, '\n.project-icon-toggle .ico-folder,'), /width: 15px;/);
  // 标题太长不再画「…」：文字块右端 12px 渐隐（mask 末段全透明）+ text-overflow: clip。
  const fade = cssBlock(panelsCss, '\n.project-name,\n.conversation-name-static {');
  assert.match(fade, /mask-image: linear-gradient\(to right, #000 calc\(100% - var\(--sidebar-title-fade, 12px\)\), transparent\);/);
  assert.match(fade, /text-overflow: clip;/);
  assert.doesNotMatch(cssBlock(panelsCss, '\n.project-name,\n.conversation-name {'), /text-overflow: ellipsis;/);
  assert.doesNotMatch(cssBlock(panelsCss, '\n.conversation-name-static {'), /text-overflow: ellipsis;/);
  // 夹具侧：真的量对齐、图标尺寸、溢出渐隐（长标题一条、短标题一条）+ 反向断言。
  assert.match(fixtureSource, /the project title sits on the same left edge as the conversation titles/);
  assert.match(fixtureSource, /Math\.abs\(column\.project - column\.conversation\) <= 0\.5/);
  assert.match(fixtureSource, /round\(glyph\.width\) <= 16 && round\(glyph\.height\) <= 16 && round\(glyph\.right\) <= column\.conversation - 2/);
  assert.match(fixtureSource, /the folder icon keeps a breathing gap before the project title/);
  assert.match(fixtureSource, /window\.__sidebarGapRevertChecks = async \(\) => report\(await revertGapChecks\(\)\);/);
  assert.match(fixtureSource, /round\(column\.conversation - glyph\.right\) <= 5/);
  assert.match(fixtureSource, /an overflowing title fades out at the tail instead of an ellipsis/);
  assert.match(fixtureSource, /window\.__sidebarTitleRevertChecks = async \(\) => report\(await revertTitleChecks\(\)\);/);
  assert.match(fixtureSource, /reverted\.project - reverted\.conversation >= 16/);
});

test('the sidebar header hugs the left edge and the left column got narrower', () => {
  // 表头（Conversation 那一行）：图标贴左 3px（跟列表里 folder 图标同一条左缘），
  // 右内边距 18 → 8、组间距 18 → 8，图标底板与两个按钮 34 → 30px——表头一整行
  // 最少只要 ~209px，左栏因此在「表头一行放得下」的前提下再收一档
  // （min 238 → 210、18vw - 50px → 18vw - 78px、max 312 → 300）。
  const head = cssBlock(panelsCss, '\n.conversations-panel .side-panel-head {');
  assert.match(head, /gap: 8px;/);
  assert.match(head, /padding-left: 3px;/);
  assert.match(head, /padding-right: 8px;/);
  assert.doesNotMatch(head, /padding-left: 11px;/);
  // 底板与按钮同步收到 30px；折叠图标 22px 写死（按钮的内宽不再能把它压小），
  // 底部留白从按钮自己的 padding 里出，避免按钮宽度再变时图标跟着缩水。
  assert.match(cssBlock(panelsCss, '\n.conversation-brand-icon {'), /width: 30px;/);
  assert.match(cssBlock(panelsCss, '\n.conversation-head-action {'), /width: 30px;/);
  assert.match(cssBlock(panelsCss, '\n.conversation-head-action {'), /padding: 0;/);
  assert.match(cssBlock(panelsCss, '\n.conversation-head-action.conversation-panel-toggle {'), /width: 30px;/);
  const toggleIcon = cssBlock(panelsCss, '\n.sidebar-toggle-icon {');
  assert.match(toggleIcon, /width: 22px;/);
  assert.match(toggleIcon, /flex: 0 0 auto;/);
  assert.match(appShellCss, /grid-template-columns: clamp\(210px, calc\(18vw - 78px\), 300px\) minmax\(320px, 1fr\) clamp\(340px, 21vw, 420px\);/);
  assert.doesNotMatch(appShellCss, /clamp\(252px, calc\(18vw - 28px\), 332px\)/);
  assert.doesNotMatch(appShellCss, /clamp\(238px, calc\(18vw - 50px\), 312px\)/);
  // 夹具侧：图标与 folder 图标同左缘、210px（新下限）下表头不溢出 + 反向断言。
  assert.match(fixtureSource, /the conversation icon starts on the same left edge as the folder icons/);
  assert.match(fixtureSource, /Math\.abs\(brandIcon\.left - glyph\.left\) <= 0\.5/);
  assert.match(fixtureSource, /a 210px-wide sidebar \(the new floor\) still fits the whole header in one row/);
  assert.match(fixtureSource, /head\.scrollWidth <= head\.clientWidth/);
  assert.match(fixtureSource, /actionWidths\.every\(\(width\) => width === 30\)/);
  assert.match(fixtureSource, /window\.__sidebarHeadRevertChecks = async \(\) => report\(await revertHeadChecks\(\)\);/);
  assert.match(fixtureSource, /brandIcon\.left - glyph\.left >= 6/);
  assert.match(fixtureSource, /pass: overflow > 0,/);
  assert.match(readme, /__sidebarHeadRevertChecks/);
});

test('the browser fixture measures the rhythm and how many projects fit', () => {
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/base\.css';/);
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/app-shell\.css';/);
  assert.match(fixtureSource, /import '\.\.\/\.\.\/styles\/panels\.css';/);
  // 真实面板 + 收住高度的外框（否则面板被内容撑高，「一屏几个项目」量不准）。
  assert.match(fixtureSource, /<div style=\{\{ display: 'flex', width: 288, height: PANEL_HEIGHT \}\}>/);
  assert.match(fixtureSource, /const PANEL_HEIGHT = 704;/);
  // 断言的链：行高 → 行距 → 会话到项目的缝 → 整块间距 → 完整可见的项目行数。
  assert.match(fixtureSource, /current.pitches.every\(\(pitch\) => pitch === 32\)/);
  assert.match(fixtureSource, /current.conversationToProject <= 46/);
  assert.match(fixtureSource, /current.blockPitch <= 240/);
  assert.match(fixtureSource, /current.visible >= 3/);
  assert.match(fixtureSource, /window\.__sidebarDensityChecks = async \(\) => report\(\(await runChecks\(\)\)\.results\);/);
  // 反向断言：注回改前的 42px 行高，一屏里完整可见的项目行必须掉回 2 行。
  assert.match(fixtureSource, /window\.__sidebarDensityRevertChecks = async \(\) => report\(await revertChecks\(\)\);/);
  assert.match(fixtureSource, /\.project-row, \.conversation-row \{ min-height: 42px !important; padding: 9px 11px !important; \}/);
  assert.match(fixtureSource, /reverted\.visible <= 2/);
  assert.match(readme, /\[sidebar-density\.html\]\(fixtures\/sidebar-density\.html\)/);
});

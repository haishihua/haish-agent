import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const settingsCss = fs.readFileSync(new URL('../../src/features/settings/settings.css', import.meta.url), 'utf8');

// 整段抠掉一个「标记 + 花括号配对」的块（用于「剩下的 :hover 都不许有」这类断言）。
function stripBalancedBlock(source, marker) {
  let out = source;
  for (let index = out.indexOf(marker); index !== -1; index = out.indexOf(marker)) {
    let depth = 0;
    let end = index;
    for (; end < out.length; end += 1) {
      if (out[end] === '{') depth += 1;
      else if (out[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, index) + out.slice(end + 1);
  }
  return out;
}

const HOVER_MEDIA = '@media (hover: hover) and (pointer: fine) {';

test('hover 只在鼠标设备上生效：Tailwind 的 hover: 变体被整体重写成 (hover: hover) and (pointer: fine)', () => {
  // 触屏点一下就会命中 hover，是误报；变体定义改一处，设置区所有 hover: 工具类一起收敛。
  assert.match(settingsCss, /@custom-variant hover \{\n {2}@media \(hover: hover\) and \(pointer: fine\) \{\n {4}&:hover \{\n {6}@slot;\n {4}\}\n {2}\}\n\}/);
  assert.ok(settingsCss.split(HOVER_MEDIA).length - 1 >= 5, '手写的 :hover 规则也都包进了这道门禁（至少 4 条 + 变体定义本身）');
  const ungated = stripBalancedBlock(stripBalancedBlock(settingsCss, '@custom-variant hover {'), HOVER_MEDIA);
  const leftovers = ungated.split('\n').filter((line) => line.includes(':hover'));
  assert.deepEqual(leftovers, [], `不许有没被门禁住的 :hover（${leftovers.join(' | ')}）`);
});

test('输入类控件的焦点环走 box-shadow：全局 outline: none !important 之下 outline 写了也是白写', () => {
  const rule = settingsCss.match(/\[data-slot="input"\]:focus-visible[^{]*\{([^}]+)\}/);
  assert.ok(rule, '输入框必须有 focus-visible 规则');
  assert.match(rule[1], /outline: none;/);
  assert.match(rule[1], /box-shadow: 0 0 0 3px color-mix\(in srgb, var\(--ring\) 20%, transparent\);/);
});

test('设置区按钮的触感：过渡只列会变的属性、按下 scale(0.97)、reduced-motion 退回瞬时', () => {
  assert.match(settingsCss, /--ease-snappy: cubic-bezier\(0\.23, 1, 0\.32, 1\);/);
  const utilitiesAt = settingsCss.indexOf('@import "tailwindcss/utilities.css"');
  const overrideAt = settingsCss.lastIndexOf('@scope (.settings-theme) to (.settings-legacy-workflow) {\n  [data-slot="button"] {');
  assert.ok(utilitiesAt >= 0 && overrideAt > utilitiesAt, '过渡覆盖必须排在 utilities 之后（同特异性靠顺序赢过 transition-all）');
  const block = settingsCss.slice(overrideAt);
  assert.match(
    block,
    /transition: color 150ms var\(--ease-snappy\), background-color 150ms var\(--ease-snappy\), border-color 150ms var\(--ease-snappy\), box-shadow 150ms var\(--ease-snappy\), opacity 150ms var\(--ease-snappy\), scale 160ms var\(--ease-snappy\);/,
  );
  assert.doesNotMatch(block, /transition: all/);
  assert.match(block, /\[data-slot="button"\]:not\(:disabled\):active \{ scale: 0\.97; \}/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\n {4}\[data-slot="button"\] \{ transition: none; \}\n {4}\[data-slot="button"\]:not\(:disabled\):active \{ scale: none; \}\n {2}\}/);
});

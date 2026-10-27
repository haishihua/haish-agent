import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownPlainText } from '../../../src/shared/lib/markdown-text.js';

test('inline code keeps its text and drops the backticks', () => {
  assert.equal(
    markdownPlainText('只有 `contract_review.prompt.ai.deep.c.system` 不同'),
    '只有 contract_review.prompt.ai.deep.c.system 不同',
  );
});

test('emphasis markers are stripped instead of being read aloud', () => {
  assert.equal(markdownPlainText('**逐条** 差异，*顺便* 提一下 ~~旧值~~'), '逐条 差异，顺便 提一下 旧值');
});

test('links keep their label and images keep their alt text', () => {
  assert.equal(
    markdownPlainText('看 [设计稿](https://example.com/a.png) 和 ![截图](./shot.png) 两处'),
    '看 设计稿 和 截图 两处',
  );
});

test('a markdown table becomes one readable line without the divider row', () => {
  const table = ['| 项 | 线上 | 仓库 |', '|---|---|---|', '| 篇幅 | 15,695 | 16,096 |', '| 组别 | 重大后果 | 可控 |'];
  assert.equal(markdownPlainText(table.join('\n')), '项 线上 仓库 篇幅 15,695 16,096 组别 重大后果 可控');
});

test('headings, quotes and list markers do not leak into the label', () => {
  const source = ['## 目标', '> 引用一句', '- 第一项', '1. 第二项'].join('\n');
  assert.equal(markdownPlainText(source), '目标 引用一句 第一项 第二项');
});

test('fenced code loses the fence but keeps the code lines', () => {
  assert.equal(markdownPlainText(['```sh', 'npm test', '```'].join('\n')), 'npm test');
});

// 回归：词内下划线不是强调（CommonMark）。压成 `snakecasename` 等于把标识符念错。
test('identifiers with underscores survive as written', () => {
  assert.equal(markdownPlainText('把 snake_case_name 改成 x_1'), '把 snake_case_name 改成 x_1');
  assert.equal(markdownPlainText('_强调_ 保留剥除'), '强调 保留剥除');
});

// 回归：竖线只有整块是表格时才是分隔符，正文里的 “a | b” 要原样留着。
test('a pipe outside a table is content, not a cell divider', () => {
  assert.equal(markdownPlainText('用 a | b 哪一种'), '用 a | b 哪一种');
  assert.equal(markdownPlainText('| a | b |\n|---|---|\n| c | d |'), 'a b c d');
});

test('an empty or whitespace-only source produces an empty label', () => {
  assert.equal(markdownPlainText(''), '');
  assert.equal(markdownPlainText('   \n\n  '), '');
  assert.equal(markdownPlainText(null), '');
});

test('long questions are truncated with an ellipsis so the label stays short', () => {
  const label = markdownPlainText(`问题 ${'很'.repeat(40)}`, { maxLength: 10 });
  assert.equal(label.length, 10);
  assert.ok(label.endsWith('…'), label);
});

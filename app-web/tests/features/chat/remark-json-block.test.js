import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { remarkHardBreaks } from '../../../src/shared/lib/remark-hard-breaks.js';
import { hasJsonBlock, jsonBlockText, remarkJsonBlock } from '../../../src/shared/lib/remark-json-block.js';

/** Real markdown pipeline: parse the text, run the plugins, convert to hast. */
function hastFor(text, { hardBreaks = false, jsonBlock = true } = {}) {
  const mdast = unified().use(remarkParse).parse(text);
  // Streamdown registers `remarkPlugins` before its markdown→hast step and hands
  // the plugin the raw block source on the file — that source is what we slice.
  const pipeline = unified();
  if (hardBreaks) pipeline.use(remarkHardBreaks);
  if (jsonBlock) pipeline.use(remarkJsonBlock);
  return pipeline.use(remarkRehype).runSync(mdast, text);
}

function codeBlocks(node, found = []) {
  if (node?.tagName === 'pre' && node.children?.[0]?.tagName === 'code') found.push(node.children[0]);
  for (const child of node?.children || []) codeBlocks(child, found);
  return found;
}

function countTag(node, tagName) {
  let total = node?.tagName === tagName ? 1 : 0;
  for (const child of node?.children || []) total += countTag(child, tagName);
  return total;
}

/** Top-level element tags, ignoring the whitespace text nodes between blocks. */
function topTags(hast) {
  return (hast.children || []).filter((node) => node.type === 'element').map((node) => node.tagName);
}

// The shape that started this: the Verifier's whole final answer is the verdict
// JSON, escapes such as `\"` sitting inside an inline code span, eight indented
// lines — CommonMark folds all of it into one paragraph.
const VERDICT = [
  '{',
  '  "verdict": "BLOCKED",',
  '  "reason": "仍是 `\\"skill_policy\\": {\\"allow\\": []}` 这一条语义",',
  '  "evidence": [',
  '    "证据一",',
  '    "证据二"',
  '  ],',
  '  "remaining": ["要你拍板"]',
  '}',
].join('\n');

test('a bare JSON answer becomes one json code block the renderer can highlight', () => {
  assert.ok(JSON.parse(VERDICT), 'the fixture is valid JSON to begin with');
  const hast = hastFor(VERDICT);
  assert.deepEqual(topTags(hast), ['pre'], 'the paragraph is replaced, not kept alongside');
  const [code] = codeBlocks(hast);
  assert.ok(code, 'a code block is emitted');
  assert.ok(code.properties.className.includes('language-json'), 'Shiki highlights it as json');
  const value = code.children[0].value;
  assert.deepEqual(JSON.parse(value), JSON.parse(VERDICT), 'no content is lost or re-escaped');
  assert.equal(value, `${JSON.stringify(JSON.parse(VERDICT), null, 2)}\n`, 'pretty printed; the trailing newline belongs to the code block');
  assert.equal(countTag(hast, 'br'), 0, 'the payload keeps real newlines instead of <br>');
});

test('only the JSON paragraph converts; the prose around it stays prose', () => {
  const hast = hastFor('结论如下：\n\n{"verdict": "DONE"}\n\n以上。');
  assert.deepEqual(topTags(hast), ['p', 'pre', 'p']);
  assert.deepEqual(JSON.parse(codeBlocks(hast)[0].children[0].value), { verdict: 'DONE' });
});

test('braces in ordinary prose are not JSON', () => {
  const hast = hastFor('这段 {不是} JSON，只是普通文字。');
  assert.deepEqual(topTags(hast), ['p']);
  assert.equal(codeBlocks(hast).length, 0);
});

test('a half-streamed payload keeps rendering as prose until it parses', () => {
  const hast = hastFor('{\n  "verdict": "BLO');
  assert.deepEqual(topTags(hast), ['p']);
});

test('an existing json fence keeps its own bytes', () => {
  const hast = hastFor('```json\n{"a":1}\n```');
  const [code] = codeBlocks(hast);
  assert.equal(code.children[0].value, '{"a":1}\n', 'no second pass, no reformatting');
});

test('a payload nested in a list item converts in place', () => {
  const hast = hastFor('- 第一步\n- {"step": 2}');
  const [code] = codeBlocks(hast);
  assert.deepEqual(JSON.parse(code.children[0].value), { step: 2 });
});

test('the hard-break plugin and the JSON plugin do not fight', () => {
  const hast = hastFor('第一行\n第二行\n\n{"a": 1}', { hardBreaks: true });
  assert.deepEqual(topTags(hast), ['p', 'pre']);
  assert.equal(countTag(hast, 'br'), 1, 'prose keeps its break; the code block gets none');
});

test('jsonBlockText only accepts whole JSON containers', () => {
  assert.equal(jsonBlockText('{"a": 1}'), '{\n  "a": 1\n}');
  assert.equal(jsonBlockText('[1, 2]'), '[\n  1,\n  2\n]');
  assert.equal(jsonBlockText('123'), null, 'a bare number is prose');
  assert.equal(jsonBlockText('"text"'), null);
  assert.equal(jsonBlockText('{ not json }'), null);
  assert.equal(jsonBlockText(''), null);
});

test('a tree without source offsets is left untouched', () => {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: '{"a":1}' }] }] };
  remarkJsonBlock()(tree, undefined);
  assert.equal(tree.children[0].type, 'paragraph', 'no raw source on the file, no conversion');
});

test('hasJsonBlock sees exactly the payloads the plugin will convert', () => {
  assert.equal(hasJsonBlock(VERDICT), true);
  assert.equal(hasJsonBlock('结论如下：\n\n{"a": 1}\n\n以上。'), true);
  assert.equal(hasJsonBlock('第一行\n第二行'), false);
  assert.equal(hasJsonBlock('这段 {不是} JSON'), false);
});

test('the renderer loads the code plugin for a converted payload too', () => {
  // The fence regex alone would skip Shiki for a bare JSON answer: the message has
  // no ``` at all before the plugin runs, so the gate has to ask the plugin module.
  const markdown = readFileSync(new URL('../../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
  assert.match(markdown, /const hasCode = .*hasJsonBlock\(text\)/);
});

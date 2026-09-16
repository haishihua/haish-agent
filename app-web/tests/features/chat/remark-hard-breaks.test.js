import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { remarkHardBreaks, splitSoftBreaks } from '../../../src/shared/lib/remark-hard-breaks.js';

function paragraph(value) {
  return { type: 'paragraph', children: [{ type: 'text', value }] };
}

/** Real markdown pipeline: parse the typed text, then convert to the hast the renderer sees. */
function hastFor(text, { hardBreaks }) {
  const mdast = unified().use(remarkParse).parse(text);
  // Streamdown registers `remarkPlugins` before its markdown→hast step, so the
  // hard-break plugin must see mdast text nodes and not the html tree.
  const pipeline = unified();
  if (hardBreaks) pipeline.use(remarkHardBreaks);
  return pipeline.use(remarkRehype).runSync(mdast);
}

function inlineNodes(hast) {
  return (hast.children[0]?.children || [])
    .map((node) => (node.type === 'element' ? node.tagName : node.value))
    .filter((value) => typeof value !== 'string' || value.trim());
}

test('the real pipeline turns typed line breaks into <br> elements', () => {
  assert.deepEqual(inlineNodes(hastFor('第一行\n第二行\n第三行', { hardBreaks: true })),
    ['第一行', 'br', '第二行', 'br', '第三行']);
});

test('without the plugin the same text stays one soft-wrapped line', () => {
  assert.deepEqual(inlineNodes(hastFor('第一行\n第二行', { hardBreaks: false })), ['第一行\n第二行'],
    'assistant answers must keep plain CommonMark breaks');
});

test('a soft break inside a paragraph becomes a hard break', () => {
  const tree = { type: 'root', children: [paragraph('第一行\n第二行\n第三行')] };
  splitSoftBreaks(tree);
  assert.deepEqual(
    tree.children[0].children.map((node) => node.type === 'break' ? 'break' : node.value),
    ['第一行', 'break', '第二行', 'break', '第三行'],
  );
});

test('inline children keep their own soft breaks', () => {
  const tree = {
    type: 'root',
    children: [{
      type: 'paragraph',
      children: [
        { type: 'text', value: 'before\n' },
        { type: 'strong', children: [{ type: 'text', value: 'bold\nstill bold' }] },
      ],
    }],
  };
  splitSoftBreaks(tree);
  const [text, hardBreak, strong] = tree.children[0].children;
  assert.equal(text.value, 'before');
  assert.equal(hardBreak.type, 'break');
  assert.deepEqual(
    strong.children.map((node) => node.type === 'break' ? 'break' : node.value),
    ['bold', 'break', 'still bold'],
  );
});

test('code spans and code blocks are left untouched', () => {
  const inlineCode = { type: 'inlineCode', value: 'a\nb' };
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'see ' }, inlineCode, { type: 'text', value: ' now\nnext line' }],
      },
      { type: 'code', value: 'const a = 1;\nconst b = 2;' },
    ],
  };
  splitSoftBreaks(tree);
  assert.equal(inlineCode.value, 'a\nb');
  assert.equal(tree.children[1].value, 'const a = 1;\nconst b = 2;');
  assert.deepEqual(
    tree.children[0].children.map((node) => node.type === 'break' ? 'break' : (node.value ?? node.type)),
    ['see ', 'a\nb', ' now', 'break', 'next line'],
  );
});

test('code blocks keep their own line breaks in the real pipeline', () => {
  const hast = hastFor('```\nfirst\nsecond\n```', { hardBreaks: true });
  const code = hast.children[0].children[0];
  assert.equal(code.tagName, 'code');
  assert.deepEqual(code.children.map((node) => node.type), ['text'], 'no <br> may be injected inside code');
  assert.equal(code.children[0].value, 'first\nsecond\n');
});

test('text without line breaks keeps its node identity', () => {
  const node = { type: 'text', value: 'single line' };
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [node] }] };
  splitSoftBreaks(tree);
  assert.equal(tree.children[0].children[0], node);
});

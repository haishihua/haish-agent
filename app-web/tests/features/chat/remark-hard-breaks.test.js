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

function listItems(hast) {
  const list = hast.children.find((node) => node.tagName === 'ol' || node.tagName === 'ul');
  return (list?.children || []).filter((node) => node.tagName === 'li');
}

function inlineOf(node) {
  return node.children
    .map((child) => (child.type === 'element' ? child.tagName : child.value))
    .filter((value) => typeof value !== 'string' || value.trim());
}

// The shape the user edited-and-resent: a numbered list whose last item carries
// on to the next line. CommonMark reads that line as a lazy continuation of the
// list item, so the fold happens inside the item - not only in plain paragraphs.
const NUMBERED_CONTINUATION = '1. 第一项\n2. 共用\n3. 删干净吧\n先在/docs 落设计文档，然后再开始改';

test('a numbered prompt keeps the break before a continuation line', () => {
  const items = listItems(hastFor(NUMBERED_CONTINUATION, { hardBreaks: true }));
  assert.deepEqual(inlineOf(items.at(-1)), ['删干净吧', 'br', '先在/docs 落设计文档，然后再开始改'],
    'the continuation line must stay on its own line inside the list item');
});

test('without the plugin the same continuation line folds into the item', () => {
  const item = listItems(hastFor(NUMBERED_CONTINUATION, { hardBreaks: false })).at(-1);
  const text = item.children.filter((node) => node.type === 'text').map((node) => node.value).join('');
  assert.equal(inlineOf(item).includes('br'), false, 'no hard break is emitted without the plugin');
  assert.match(text, /删干净吧\n先在/, 'HTML collapses that raw newline into a space - the flattened bubble');
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

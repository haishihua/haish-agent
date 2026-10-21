import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localImageFileName,
  normalizeLocalImagePath,
  segmentLocalImagePaths,
} from '../../../src/shared/lib/local-image-path.js';
import { remarkImagePaths } from '../../../src/shared/lib/remark-image-paths.js';

// chat-image resolves the API base at import time, which reads `window`.
globalThis.window = globalThis.window || {};
const { isChatImagePreviewUrl } = await import('../../../src/shared/api/chat-image.js');

// The shape that actually showed up in chat: the runtime root has a space and the
// path is followed by full-width parentheses.
const GENERATED = '/Users/zhanruitao/Library/Application Support/Haish (Dev)/runtime/cache/'
  + 'workspaces/66a9eadb88188a52f841/tasks/98bcbe9f/artifacts/images/gen-call_00_Lv5wP1ir.png';

const resolve = (path) => `/preview?image_path=${encodeURIComponent(path)}`;

function paragraph(value, type = 'text') {
  return { type: 'root', children: [{ type: 'paragraph', children: [{ type, value }] }] };
}

function run(tree, resolver = resolve) {
  remarkImagePaths({ resolveImage: resolver })(tree);
  return tree.children[0].children;
}

test('a bare local image path in prose becomes an image node', () => {
  const tree = paragraph(`文件： ${GENERATED}（gpt-image-2）`);
  const nodes = run(tree);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].type, 'text');
  assert.match(nodes[0].value, /^文件： /);
  assert.equal(nodes[1].type, 'image');
  assert.equal(nodes[1].url, resolve(GENERATED));
  assert.equal(nodes[1].alt, 'gen-call_00_Lv5wP1ir.png');
  assert.equal(nodes[1].title, GENERATED);
  assert.equal(nodes[2].type, 'text');
  assert.equal(nodes[2].value, '（gpt-image-2）');
});

test('a path wrapped in inline code is a path, not code', () => {
  const nodes = run(paragraph(GENERATED, 'inlineCode'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].url, resolve(GENERATED));
});

test('inline code that is not exactly a path stays code', () => {
  const nodes = run(paragraph('file: ' + GENERATED, 'inlineCode'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'inlineCode');
});

test('fenced code blocks are never rewritten', () => {
  const tree = { type: 'root', children: [{ type: 'code', lang: 'sh', value: `open ${GENERATED}` }] };
  remarkImagePaths({ resolveImage: resolve })(tree);
  assert.equal(tree.children[0].type, 'code');
  assert.equal(tree.children[0].value, `open ${GENERATED}`);
});

test('a url is text, not a local path', () => {
  const nodes = run(paragraph('见 https://example.com/a.png 这里'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'text');
});

test('an unresolvable path stays visible instead of turning into a broken image', () => {
  const nodes = run(paragraph(GENERATED), () => '');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'text');
  assert.equal(nodes[0].value, GENERATED);
});

test('existing markdown images pointing at a local path are re-pointed at the preview url', () => {
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'image', url: GENERATED, alt: 'shot' }] }],
  };
  const nodes = run(tree);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].url, resolve(GENERATED));
  assert.equal(nodes[0].alt, 'shot');
});

test('paths normalize from file:// urls and reject everything else', () => {
  assert.equal(normalizeLocalImagePath(GENERATED), GENERATED);
  assert.equal(normalizeLocalImagePath(`file://${GENERATED}`), GENERATED);
  assert.equal(normalizeLocalImagePath(`\`${GENERATED}\``), GENERATED);
  assert.equal(normalizeLocalImagePath('https://example.com/a.png'), '');
  assert.equal(normalizeLocalImagePath('//example.com/a.png'), '');
  assert.equal(normalizeLocalImagePath('artifacts/images/a.png'), '');
  assert.equal(normalizeLocalImagePath('/tmp/notes.txt'), '');
});

test('segmentation keeps plain prose intact', () => {
  assert.equal(segmentLocalImagePaths('没有路径。'), null);
  const parts = segmentLocalImagePaths(`图在 ${GENERATED} 里`);
  assert.deepEqual(parts.map((part) => part.type), ['text', 'path', 'text']);
  assert.equal(localImageFileName(GENERATED), 'gen-call_00_Lv5wP1ir.png');
});

test('only the conversation preview endpoint passes the markdown url guard', () => {
  const preview = (path) => '/api/conversations/c1/messages/images/preview?image_path='
    + encodeURIComponent(path);
  assert.equal(isChatImagePreviewUrl(preview(GENERATED)), true);
  assert.equal(isChatImagePreviewUrl('/api/conversations/c1/messages/images/preview?image_path=%2Fa.png'), true);
  assert.equal(isChatImagePreviewUrl('/api/settings/llm'), false);
  assert.equal(isChatImagePreviewUrl('javascript:alert(1)'), false);
  assert.equal(isChatImagePreviewUrl(''), false);
});

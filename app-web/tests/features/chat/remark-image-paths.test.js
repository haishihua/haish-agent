import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localImageFileName,
  normalizeLocalImagePath,
  segmentLocalImagePaths,
} from '../../../src/shared/lib/local-image-path.js';
import {
  imageMarker,
  parseImageMarker,
  remarkImagePaths,
} from '../../../src/shared/lib/remark-image-paths.js';

// chat-image resolves the API base at import time, which reads `window`.
globalThis.window = globalThis.window || {};
const { isChatImagePreviewUrl } = await import('../../../src/shared/api/chat-image.js');

// The shape that actually showed up in chat: the runtime root has a space and the
// path is followed by full-width parentheses.
const GENERATED = '/Users/zhanruitao/Library/Application Support/Haish (Dev)/runtime/cache/'
  + 'workspaces/66a9eadb88188a52f841/tasks/98bcbe9f/artifacts/images/gen-call_00_Lv5wP1ir.png';

// 插件只写“路径 + 来源”的标记地址；预览地址由组件按当前会话算（见 Markdown.jsx）。
const tagged = (path, source) => imageMarker(path, source);

// 模型会把长目录缩写后再引用（`.../artifacts/images/x.png`）；省略号不是真目录，
// 预览接口按标记后的尾巴在本会话的根下匹配。前端只要认出这是路径就行。
const ELIDED = '.../artifacts/images/gen-call_00_Lv5wP1ir.png';

function paragraph(value, type = 'text') {
  return { type: 'root', children: [{ type: 'paragraph', children: [{ type, value }] }] };
}

function run(tree) {
  remarkImagePaths()(tree);
  return tree.children[0].children;
}

test('a bare local image path in prose becomes an image node', () => {
  const tree = paragraph(`文件： ${GENERATED}（gpt-image-2）`);
  const nodes = run(tree);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].type, 'text');
  assert.match(nodes[0].value, /^文件： /);
  assert.equal(nodes[1].type, 'image');
  assert.equal(nodes[1].url, tagged(GENERATED, 'prose'));
  assert.equal(nodes[1].alt, 'gen-call_00_Lv5wP1ir.png');
  assert.equal(nodes[1].title, GENERATED);
  assert.equal(nodes[2].type, 'text');
  assert.equal(nodes[2].value, '（gpt-image-2）');
});

test('a path wrapped in inline code is a path, not code', () => {
  const nodes = run(paragraph(GENERATED, 'inlineCode'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].url, tagged(GENERATED, 'code'));
});

test('inline code that is not exactly a path stays code', () => {
  const nodes = run(paragraph('file: ' + GENERATED, 'inlineCode'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'inlineCode');
});

test('fenced code blocks are never rewritten', () => {
  const tree = { type: 'root', children: [{ type: 'code', lang: 'sh', value: `open ${GENERATED}` }] };
  remarkImagePaths()(tree);
  assert.equal(tree.children[0].type, 'code');
  assert.equal(tree.children[0].value, `open ${GENERATED}`);
});

test('a url is text, not a local path', () => {
  const nodes = run(paragraph('见 https://example.com/a.png 这里'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'text');
});

test('the marker carries the path, so the component can still show it as text', () => {
  // 真正“取不到预览地址”时退回什么，是组件的事（按当前会话算不出来 → 原文路径）。
  // 插件这一层必须把路径原样留住，否则组件手里就没有能退回的文字了。
  const nodes = run(paragraph(GENERATED));
  assert.equal(nodes[0].type, 'image');
  assert.equal(parseImageMarker(nodes[0].url).path, GENERATED);
  assert.equal(nodes[0].title, GENERATED);
});

test('existing markdown images pointing at a local path are re-pointed at the preview url', () => {
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'image', url: GENERATED, alt: 'shot' }] }],
  };
  const nodes = run(tree);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].url, tagged(GENERATED, 'image'));
  assert.equal(nodes[0].alt, 'shot');
});

test('the node remembers whether the picture was prose or a markdown image', () => {
  // 取不到时两者退路不同：正文路径退回文字，markdown 图片只留图标。
  // 标记走图片地址（DOM 的 data-* 过不了 sanitize 白名单，实测 <img> 上只剩 src/alt）。
  const prose = run(paragraph(`文件： ${GENERATED}`));
  assert.equal(parseImageMarker(prose[1].url).origin, 'prose');
  const markdown = run({
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'image', url: GENERATED, alt: 'shot' }] }],
  });
  assert.equal(parseImageMarker(markdown[0].url).origin, 'image');
  // 标记不能把本地路径本身弄丢（html 里它仍然是可读的 title）。
  assert.equal(markdown[0].title, GENERATED);
  assert.equal(parseImageMarker(GENERATED), null);
  assert.equal(parseImageMarker(''), null);
  assert.equal(parseImageMarker('haish-image:nope'), null);
});

test('markers survive a decode round trip, spaces and parentheses included', () => {
  for (const path of [GENERATED, ELIDED, '/tmp/a b (1).png', '/tmp/100%真实.png']) {
    const parsed = parseImageMarker(imageMarker(path, 'code'));
    assert.equal(parsed.path, path);
    assert.equal(parsed.origin, 'code');
  }
  // 坏掉的百分号转义不能把渲染打崩，解析不出来就当没标记。
  assert.equal(parseImageMarker('haish-image:prose:%E0%A4%A'), null);
});

test('an abbreviated artifact path is still previewed', () => {
  const nodes = run(paragraph(ELIDED, 'inlineCode'));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'image');
  assert.equal(nodes[0].url, tagged(ELIDED, 'code'));
  assert.equal(nodes[0].alt, 'gen-call_00_Lv5wP1ir.png');
  assert.equal(nodes[0].title, ELIDED);
});

test('an abbreviated path is handed over exactly as the model wrote it', () => {
  assert.equal(normalizeLocalImagePath(ELIDED), ELIDED);
  assert.equal(normalizeLocalImagePath('…/artifacts/images/a.png'), '…/artifacts/images/a.png');
  assert.equal(normalizeLocalImagePath('artifacts/images/a.png'), 'artifacts/images/a.png');
  // 不是图片扩展名、或者带 scheme 的，仍然不算本地图片路径。
  assert.equal(normalizeLocalImagePath('.../artifacts/images/a.txt'), '');
  assert.equal(normalizeLocalImagePath('https://example.com/a.png'), '');
});

test('paths normalize from file:// urls and reject everything else', () => {
  assert.equal(normalizeLocalImagePath(GENERATED), GENERATED);
  assert.equal(normalizeLocalImagePath(`file://${GENERATED}`), GENERATED);
  assert.equal(normalizeLocalImagePath(`\`${GENERATED}\``), GENERATED);
  assert.equal(normalizeLocalImagePath('https://example.com/a.png'), '');
  assert.equal(normalizeLocalImagePath('//example.com/a.png'), '');
  assert.equal(normalizeLocalImagePath('/tmp/notes.txt'), '');
  // 裸文件名是正文里的词（“只写 x.png”），当成图片只会多一次 404 并把行文变成破图。
  assert.equal(normalizeLocalImagePath('x.png'), '');
  assert.equal(normalizeLocalImagePath('gen-call_00_Lv5wP1ir.png'), '');
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

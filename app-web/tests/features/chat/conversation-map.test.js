import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  conversationLensTop, conversationLensWindow, conversationMapEntries, conversationMapGeometry, conversationMapNeedsLens,
  conversationTurnPreview, conversationTurnView,
} from '../../../src/features/chat/model/conversation-map.js';

const viewport = { top: 0, bottom: 500, height: 500 };

test('the full index includes unmounted history, comments and image-only turns', () => {
  const messages = [
    ...Array.from({ length: 160 }, (_, index) => ({ id: `u-${index}`, role: 'user', text: `Question ${index}` })),
    { id: 'agent', role: 'agent', text: 'Not a user turn' },
    { id: 'comment', role: 'user', annotations: [{ comment: '这个是啥啊', text: 'Do not use this quote' }] },
    { id: 'quote', role: 'user', annotations: [{ text: 'Quoted text' }] },
    { id: 'image', role: 'user', images: [{ path: '/one.png' }] },
    { id: 'skill', role: 'user', text: 'Use the settings-manager skill.\nConfigure search' },
  ];
  const entries = conversationMapEntries(messages, (image) => `preview:${image.path}`);
  assert.equal(entries.length, 164);
  assert.equal(entries[0].id, 'u-0');
  assert.equal(entries[160].title, '这个是啥啊');
  assert.equal(entries[161].title, 'Quoted text');
  assert.deepEqual(entries[162], { id: 'image', title: 'Image', thumbnails: ['preview:/one.png'] });
  assert.equal(entries[163].title, 'Configure search');
});

test('unmounted titles hide injected instructions and storage paths while image URLs use the message scope', () => {
  const entries = conversationMapEntries([
    { id: 'files', role: 'user', text: '/Users/example/report.pdf\n/tmp/notes.txt' },
    { id: 'text', role: 'user', text: '/tmp/report.pdf\nRead this file first' },
    { id: 'image', role: 'user', conversationId: 'current', images: [{ path: '/stored/private/image.png' }] },
  ], (image, conversationId) => `${conversationId}:${image.path}`);
  assert.equal(entries[0].title, 'report.pdf · notes.txt');
  assert.equal(entries[1].title, 'Read this file first');
  assert.deepEqual(entries[2].thumbnails, ['current:/stored/private/image.png']);
});

test('dense overview groups marks by density while retaining exact turn coordinates', () => {
  assert.deepEqual(conversationMapGeometry(20, 600), { step: 14, origin: 160, stride: 1 });
  const geometry = conversationMapGeometry(400, 600);
  assert.equal(geometry.step, 1.5);
  assert.equal(geometry.origin, 0);
  assert.equal(geometry.stride, 3);
  assert.equal(conversationMapGeometry(0, 600).step, 0);
});

test('local magnification depends on turn density, not on overflowing reply content', () => {
  assert.equal(conversationMapNeedsLens(5, 348), false, 'a few multi-screen replies do not need a lens');
  assert.equal(conversationMapNeedsLens(26, 348), false, 'individually targetable overview ticks stay simple');
  assert.equal(conversationMapNeedsLens(50, 400), false, '8px per turn is still directly targetable');
  assert.equal(conversationMapNeedsLens(51, 400), true, 'below 8px per turn enables the lens');
  assert.equal(conversationMapNeedsLens(160, 348), true);
  assert.equal(conversationMapNeedsLens(400, 348), true);
  assert.equal(conversationMapNeedsLens(26, 160), true, 'a shorter pane can make the same turns dense');
  assert.equal(conversationMapNeedsLens(7, 40), false, 'do not duplicate an overview already limited to seven turns');
  assert.equal(conversationMapNeedsLens(160, 0), false, 'do not enable before layout is measured');
  assert.equal(conversationMapNeedsLens(0, 348), false);
});

test('the seven-turn lens clamps its range and position at both ends', () => {
  assert.deepEqual(conversationLensWindow(400, 200), { start: 197, size: 7 });
  assert.deepEqual(conversationLensWindow(400, 0), { start: 0, size: 7 });
  assert.deepEqual(conversationLensWindow(400, 399), { start: 393, size: 7 });
  assert.deepEqual(conversationLensWindow(3, 2), { start: 0, size: 3 });
  assert.equal(conversationLensTop(0, 0, 7, 101, { top: 100, bottom: 700 }), 108);
  assert.equal(conversationLensTop(399, 393, 7, 699, { top: 100, bottom: 700 }), 546);
  assert.equal(conversationLensTop(200, 197, 7, 400, { top: 100, bottom: 700 }), 327);
});

test('local lens preserves navigation affordances but renders no visible instruction', () => {
  const source = fs.readFileSync(new URL('../../../src/features/chat/components/ConversationMap.jsx', import.meta.url), 'utf8');
  assert.match(source, /className="conversation-map-lens"/);
  assert.match(source, /addEventListener\('wheel', browse, \{ passive: false \}\)/);
  assert.match(source, /onReveal\?\.\(id\)/);
  assert.doesNotMatch(source, /lens-caption|滚轮逐轮浏览|Esc 收起/);
  const panel = fs.readFileSync(new URL('../../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /entries=\{mapEntries\}/);
  assert.match(panel, /onReveal=\{revealMapTurn\}/);
  assert.match(panel, /key=\{conversationId \|\| 'draft'\} scrollRef=\{listRef\} entries/);
});

test('preview titles prefer body text, then comments, then unnumbered quotes', () => {
  const context = { comments: [' 这个是啥啊\n ', ' 第二条评论 '], quotes: ['引用的原文'], images: [{ src: 'image.png' }] };
  assert.deepEqual(conversationTurnPreview({ ...context, text: '  补充\n问题  ' }), { title: '补充 问题', thumbnails: [] });
  assert.deepEqual(conversationTurnPreview(context), { title: '这个是啥啊 · 第二条评论', thumbnails: [] });
  assert.deepEqual(conversationTurnPreview({ comments: ['  '], quotes: ['  引用\n的原文 ', '第二段'] }), {
    title: '引用 的原文 · 第二段', thumbnails: [],
  });
});

test('image-only turns have an accurate count and at most two thumbnails, including unavailable slots', () => {
  assert.deepEqual(conversationTurnPreview({ images: [{ src: 'one.png' }] }), { title: 'Image', thumbnails: ['one.png'] });
  assert.deepEqual(conversationTurnPreview({ images: [{ src: 'one.png' }, {}, { src: 'three.png' }] }), {
    title: '3 images', thumbnails: ['one.png', ''],
  });
  assert.deepEqual(conversationTurnPreview({ images: [{}] }), { title: 'Image', thumbnails: [''] });
  assert.deepEqual(conversationTurnPreview({ files: ' notes.md ', images: [{ src: 'one.png' }] }), { title: 'notes.md', thumbnails: [] });
  assert.deepEqual(conversationTurnPreview(), { title: 'Message', thumbnails: [] });
});

test('preview extraction keeps comment text and image slots without quote numbers or nested actions', () => {
  const source = fs.readFileSync(new URL('../../../src/features/chat/components/ConversationMap.jsx', import.meta.url), 'utf8');
  assert.match(source, /\.haish-sent-annotations \.haish-quote-comment/);
  assert.match(source, /!child\.classList\?\.contains\('haish-quote-number'\)/);
  assert.match(source, /\.chat-message-images \.chat-message-image/);
  assert.match(source, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(source, /className="conversation-map-thumbnails" aria-hidden="true"/);
  assert.doesNotMatch(source, /onPreview|ImagePreviewOverlay|<ChatImageThumb/);
  const css = fs.readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');
  assert.match(css, /\.conversation-map-thumbnail \{[^}]*width: 32px; height: 32px;/);
  assert.match(css, /\.conversation-map-thumbnail img \{[^}]*object-fit: cover;/);
});

test('the current turn includes a long assistant reply even when its user row is off screen', () => {
  const view = conversationTurnView([
    { id: 'first', top: -6000 },
    { id: 'reading', top: -1200 },
    { id: 'next', top: 700 },
  ], viewport);
  assert.equal(view.activeId, 'reading', 'must not fall back to the first tick');
  assert.deepEqual(view.visibleIds, ['reading']);
});

test('scrolling through turn boundaries changes the active tick instead of keeping the first selected', () => {
  const turns = [{ id: 'a', top: 24 }, { id: 'b', top: 800 }, { id: 'c', top: 1800 }];
  const read = (scrollTop) => conversationTurnView(turns.map((turn) => ({ ...turn, top: turn.top - scrollTop })), viewport);
  assert.equal(read(0).activeId, 'a');
  assert.equal(read(1000).activeId, 'b');
  assert.equal(read(1900).activeId, 'c');
  assert.deepEqual(read(650).visibleIds, ['a', 'b']);
});

test('no first-tick fallback before content; bottom selects the final turn', () => {
  const turns = [{ id: 'a', top: 400 }, { id: 'b', top: 900 }];
  assert.equal(conversationTurnView(turns, viewport).activeId, '');
  assert.equal(conversationTurnView(turns, viewport, true).activeId, 'b');
  assert.deepEqual(conversationTurnView([], viewport), { activeId: '', visibleIds: [] });
});

test('a centred jump highlights its target instead of the tail of the previous reply', () => {
  const view = conversationTurnView([{ id: 'previous', top: -1200 }, { id: 'target', top: 215 }], viewport);
  assert.equal(view.activeId, 'target');
});

test('the preview is an anchored, clickable title with no copy action or extra heading', () => {
  const source = fs.readFileSync(new URL('../../../src/features/chat/components/ConversationMap.jsx', import.meta.url), 'utf8');
  assert.match(source, /useFloating/);
  assert.match(source, /previewRefs\.setReference\(element\)/);
  assert.match(source, /style=\{floatingStyles\}/);
  assert.match(source, /onClick=\{\(\) => jump\(hoveredTick\.id\)\}/);
  assert.match(source, /setHoveredId\(id\)/, 'hover identity must survive prepending history');
  assert.doesNotMatch(source, /copyTextToClipboard|ico-copy|card-copy|card-head|top:\s*['"]?50%/);
});

test('tick dimensions match assistant-ui rather than the enlarged 3px/4px bars', () => {
  const css = fs.readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');
  assert.match(css, /\.conversation-map-tick::before\s*\{[^}]*width: 12px; height: 2px;/);
  assert.match(css, /\.conversation-map-tick\.is-active::before\s*\{[^}]*height: 3px;/);
  assert.match(css, /\.conversation-map-tick\s*\{[^}]*max-height: 14px;/);
  assert.doesNotMatch(css, /\.conversation-map[^{}]*::before\s*\{[^}]*(?:^|[;\s])height: 4px;/);
});

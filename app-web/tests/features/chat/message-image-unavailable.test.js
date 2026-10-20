import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const thumb = readFileSync(new URL('../../../src/features/chat/components/ChatImageThumb.jsx', import.meta.url), 'utf8');
const row = readFileSync(new URL('../../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const timeline = readFileSync(new URL('../../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');

test('a chat image whose file is gone degrades to a labelled placeholder instead of a broken <img>', () => {
  // 历史图片只有磁盘路径，preview 接口 404 时必须被 onError 接住。
  assert.match(thumb, /onError=\{\(\) => setFailedKey\(key\)\}/);
  assert.match(thumb, /chat-message-image-unavailable/);
  assert.match(thumb, /Image unavailable/);
  // 失效之后不再打开预览浮层，也不再显示可点击态。
  assert.match(thumb, /if \(failed\) return;/);
  assert.match(thumb, /disabled=\{failed\}/);
  assert.match(thumb, /aria-label=\{failed \? 'Image unavailable' : 'Preview attached image'\}/);
  // 没有 previewUrl（旧记录）仍走原来的占位字形，不拼出 file:// 路径。
  assert.match(thumb, /const src = String\(image\?\.previewUrl \|\| ''\)/);
  assert.match(thumb, /chat-message-image-fallback/);
});

test('both user message bodies and timeline inputs use the shared thumbnail', () => {
  assert.match(row, /import \{ ChatImageThumb \} from '\.\/ChatImageThumb\.jsx';/);
  assert.match(row, /<ChatImageThumb image=\{img\} onPreview=\{onPreviewImage\} \/>/);
  assert.doesNotMatch(row, /<img src=\{img\.previewUrl\}/);
  assert.match(timeline, /import \{ ChatImageThumb \} from '\.\/ChatImageThumb\.jsx';/);
  assert.match(timeline, /<ChatImageThumb image=\{image\} onPreview=\{onPreviewImage\} \/>/);
  assert.doesNotMatch(timeline, /<img src=\{image\.previewUrl\}/);
});

test('the unavailable placeholder is styled to fit both the large card and the 72px user chip', () => {
  assert.match(css, /\.chat-message-image-button\.is-unavailable \{\s*cursor: default;/);
  assert.match(css, /\.chat-message-image-unavailable \{[^}]*flex-direction: column;[^}]*font-size: 11px;/);
  assert.match(css, /\.user-speaker-meta \.chat-message-image-unavailable \{[^}]*font-size: 9px;/);
});

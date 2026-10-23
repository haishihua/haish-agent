import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 输入框的引导提示只有一套：用户做了动作但被拦下时，弹一条全局 toast（warn），
// 告诉他要怎么修；输入框上方不再挂常驻的 .haish-annotation-notice 内联 banner。
// 真正的后台状态（批注草稿写不进 localStorage、任务在跑而批注草稿还没发）依旧常驻可见，
// 真正的失败依旧走 ErrorState，两者都不归 toast 管。
const read = (path) => readFileSync(new URL(`../../../src/${path}`, import.meta.url), 'utf8');
const composer = read('features/chat/components/ChatComposer.jsx');
const panel = read('features/chat/components/ChatPanel.jsx');
const annotationsCss = read('features/chat/components/message-annotations.css');

test('the composer has no inline guidance channel left', () => {
  // pathNotice 通道连 state、自动清空的 effect、渲染行一起删掉：不许只删渲染留死 state。
  assert.equal(composer.includes('pathNotice'), false, 'the pathNotice state/effect/render is gone');
  assert.equal(composer.includes('setPathNotice'), false, 'no trigger may write the removed channel');
  assert.doesNotMatch(composer, /haish-annotation-notice/, 'the composer never renders the annotation notice banner again');
});

test('every composer guard rail reports itself through a warn toast', () => {
  const guardRails = [
    // 拖入非图片文件拿不到本地路径
    "onToast?.('warn', 'Local path unavailable. Copy the full path and paste it instead.')",
    // 路径引用超过输入上限：文案仍来自 composer/shared.js
    "onToast?.('warn', PATH_LIMIT_NOTICE)",
    // 只选了 skill 却没写内容就按回车
    "onToast?.('warn', 'Type a message after the skill, then press Enter.')",
    // /goal 还挂着批注草稿
    "onToast?.('warn', 'Send or remove comment drafts before starting Goal Loop.')",
    // /goal 没有正文却带了附件 / 引用
    "onToast?.('warn', 'Add a task description after /goal before sending attachments or references.')",
    // /schedule 缺 provider 或具体 model
    "onToast?.('warn', 'Select a configured provider and a concrete model before scheduling.')",
    // /schedule 带了文本以外的东西
    "onToast?.('warn', 'Scheduled tasks accept text only. Remove attachments, comments and path/context references first.')",
  ];
  for (const call of guardRails) assert.ok(composer.includes(call), `missing warn toast: ${call}`);
  // onPathLimit 也是同一条路：输入框自己的上限回调不能再走内联通道。
  assert.match(composer, /onPathLimit=\{\(\) => onToast\?\.\('warn', PATH_LIMIT_NOTICE\)\}/);
  // 8 个触发点 + 两条图片被拒，全部是 warn：被拦下的动作没有一条落回 error。
  const warnCalls = composer.match(/onToast\?\.\('warn'/g) || [];
  assert.equal(warnCalls.length, 10, `expected exactly 10 warn toasts, saw ${warnCalls.length}`);
  // 真正的失败面不动：stopError 仍是带重试的 inline ErrorState。
  assert.match(composer, /<ErrorState variant="inline" title="Stop not verified" detail=\{stopError\}/);
  assert.match(composer, /retryLabel="Stop again"/);
});

test('a rejected image keeps its chip error and adds exactly one warn toast', () => {
  const attach = composer.slice(composer.indexOf('function attachImageFile'), composer.indexOf('function removeComposerImage'));
  const toasts = attach.match(/onToast\?\.\('warn'/g) || [];
  assert.equal(toasts.length, 2, 'unsupported mime and oversize each report once globally');
  // chip 的红态 + tooltip 文案原样保留（AttachmentChips 的 imageDraftLabel 读的就是 img.error）。
  assert.match(attach, /error: 'Unsupported image type\. Use PNG, JPEG, WebP, or GIF\.'/);
  assert.match(attach, /error: `File too large \(>\$\{Math\.round\(CHAT_IMAGE_MAX_BYTES \/ 1024 \/ 1024\)\} MiB\)`/);
});

test('annotation feedback is a warn toast while background states stay inline', () => {
  assert.equal(panel.includes('annotationNotice'), false, 'the annotationNotice state is gone');
  assert.equal(panel.includes('setAnnotationNotice'), false, 'no action point writes the removed channel');
  // 三个动作点：保存批注的校验、发送前的校验、批注面板的 onError。
  assert.match(panel, /if \(error\) \{ onToast\?\.\('warn', error\); return false; \}/);
  assert.match(panel, /if \(commentsError\) onToast\?\.\('warn', commentsError\);/);
  // MessageAnnotations 会用 onError('') 清掉旧错误，清空不能顺手弹一条空 toast。
  assert.match(panel, /onError=\{\(message\) => \{ if \(message\) onToast\?\.\('warn', message\); \}\}/);
  // localStorage 写失败是后台状态，必须常驻可见，不走会自己消失的 toast。
  assert.match(panel, /\{storageError && <p className="haish-annotation-notice" role="status">\{storageError\}<\/p>\}/);
  // 任务在跑、批注草稿只能存着等：同样是常驻状态。
  assert.match(panel, /\{running && annotationDrafts\.length > 0 && <p className="haish-annotation-notice">Comments are saved as a draft\./);
  // 样式留着给这两条状态用。
  assert.match(annotationsCss, /\.haish-annotation-notice \{/);
});

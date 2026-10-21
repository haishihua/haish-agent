import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PATH_IMAGE_RETRY_DELAYS_MS, withRetryParam } from '../../../src/shared/lib/markdown-image-retry.js';

const markdownSource = fs.readFileSync(new URL('../../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
const PREVIEW = '/api/conversations/c1/messages/images/preview?image_path=%2Ftmp%2Fgen.png';

test('a preview URL is retried with a cache-busting param', () => {
  assert.equal(withRetryParam(PREVIEW, 0), PREVIEW);
  assert.equal(withRetryParam(PREVIEW, 1), `${PREVIEW}&haish_retry=1`);
  assert.equal(withRetryParam(PREVIEW, 2), `${PREVIEW}&haish_retry=2`);
  // No query string yet: the param still has to be well formed.
  assert.equal(withRetryParam('/api/x', 1), '/api/x?haish_retry=1');
  assert.equal(withRetryParam('', 1), '');
});

test('retries are bounded and spaced out', () => {
  assert.ok(PATH_IMAGE_RETRY_DELAYS_MS.length >= 1 && PATH_IMAGE_RETRY_DELAYS_MS.length <= 3);
  for (const delay of PATH_IMAGE_RETRY_DELAYS_MS) {
    assert.ok(Number.isFinite(delay) && delay > 0);
  }
  const ascending = PATH_IMAGE_RETRY_DELAYS_MS.every((delay, index) => index === 0 || delay > PATH_IMAGE_RETRY_DELAYS_MS[index - 1]);
  assert.ok(ascending, 'later attempts must wait longer than earlier ones');
});

test('the image view is a plain <img> that retries before falling back to the path text', () => {
  // 用浏览器原生的 <img>：不经过 fetch()->blob，请求迟迟不返回时也不会把答案永远
  // 停在一个占位块上（这就是 14:06 那版的表现）。
  assert.match(markdownSource, /import \{ PATH_IMAGE_RETRY_DELAYS_MS, withRetryParam \} from '\.\.\/lib\/markdown-image-retry\.js';/);
  assert.match(markdownSource, /src=\{withRetryParam\(src, attempt\)\}/);
  assert.match(markdownSource, /onError=\{handleError\}/);
  assert.match(markdownSource, /retryTimer\.current = setTimeout\(\n\s+\(\) => setAttempt\(\(value\) => value \+ 1\),\n\s+PATH_IMAGE_RETRY_DELAYS_MS\[attempt\],\n\s+\);/);
  // 重试也有上限：最后一轮失败才把路径文本换回来。
  assert.match(markdownSource, /if \(attempt >= PATH_IMAGE_RETRY_DELAYS_MS\.length\) \{\n\s+setFailed\(true\);/);
  assert.match(markdownSource, /data-preview-failed=\{`img-error:\$\{attempt\}`\}/);
  // 换一张图（src 变了）必须重新加载，不能继承上一张的结论。
  assert.match(markdownSource, /\}, \[src\]\);/);
  // 允许重试的定时器在卸载/换图时必须清掉。
  assert.match(markdownSource, /clearTimeout\(retryTimer\.current\)/);
  // 图片不能把绝对路径挂到 title 上：悬停会弹一条本地目录路径（链接的 title 不受影响）。
  assert.doesNotMatch(markdownSource, /<img[^>]*title=\{/);
  // 旧的 fetch->blob 方案会把 "请求不返回" 变成 "永久占位"，不允许再出现。
  assert.doesNotMatch(markdownSource, /createObjectURL/);
  assert.doesNotMatch(markdownSource, /await fetch\(/);
  assert.doesNotMatch(markdownSource, /haish-markdown-image-placeholder/);
});

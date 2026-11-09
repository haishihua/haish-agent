import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const card = fs.readFileSync(new URL('../../../src/features/chat/components/ImageGenerateToolDetail.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../../styles/image-generate-tool.css', import.meta.url), 'utf8');

test('generated result and reveal canvas retain the image aspect ratio', () => {
  assert.match(css, /\.aui-imagegen-image \{[^}]*width: auto;[^}]*height: auto;[^}]*max-width: min\(100%, 420px\);[^}]*max-height: 420px;[^}]*object-fit: contain;/);
  assert.doesNotMatch(css, /object-fit: cover/);
  assert.match(card, /aspectRatio: `\$\{resultSize\.width\} \/ \$\{resultSize\.height\}`/);
  assert.match(card, /imageSize\?\.src === previewUrl/);
});

// 卡片列必须按图片收缩：`align-items: stretch` 会把竖图撑成整宽方块，
// 图在盒子里上下留白，看起来就是“自适应”没生效。
test('the generated card hugs the picture instead of spanning the column', () => {
  assert.match(css, /\.aui-imagegen \{[^}]*display: inline-flex;[^}]*align-items: flex-start;[^}]*max-width: 100%;/);
});

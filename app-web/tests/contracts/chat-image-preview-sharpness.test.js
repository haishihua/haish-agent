import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(
  new URL('../../src/shared/ui/ImagePreviewOverlay.jsx', import.meta.url),
  'utf8',
);
const row = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url),
  'utf8',
);
const css = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

// 预览浮层的尺寸模型是对齐主流 lightbox（GPT / react-photo-view / PhotoSwipe）的
// contain：等比缩放尽量填满可用区域，小图允许放大。此前"1 图像像素 = 1 物理像素、
// 只缩不放"在 Retina 上会把预览压得只有竞品的一半大，用户看起来就是"糊"。

test('image preview fills the stage by default (contain, up or down)', () => {
  // fit 不再夹在 1：小图放大填满，大图缩小放下，预览首先要"大"。
  assert.doesNotMatch(overlaySource, /Math\.min\(1,/);
  assert.match(overlaySource, /const fit = Math\.min\(stageMaxWidth \/ naturalWidth, stageMaxHeight \/ naturalHeight\);/);
  // devicePixelRatio 不再参与布局：contain 与 dpr 无关。
  assert.doesNotMatch(overlaySource, /devicePixelRatio/);
  // 舞台上限从 CSS 读，避免在 JS 里再写一份视口常量。
  assert.match(overlaySource, /window\.getComputedStyle\(stageRef\.current\)/);
  assert.match(overlaySource, /<div\n\s+className=\{`image-preview-stage\$\{dragging \? ' is-dragging' : ''\}`\}\n\s+ref=\{stageRef\}/);
});

test('image preview never flattens the aspect ratio when scaling', () => {
  // 只给宽度时，flex 收缩会把超大截图压扁；宽高必须一起给死。
  assert.match(overlaySource, /width: displayWidth \? `\$\{displayWidth\}px` : undefined,/);
  assert.match(overlaySource, /height: displayHeight \? `\$\{displayHeight\}px` : undefined,/);
  // 量到尺寸前先不画，避免先按原始大小铺开再缩回去闪一下。
  assert.match(overlaySource, /visibility: box \|\| loadFailed \? 'visible' : 'hidden',/);
  assert.match(css, /\.image-preview-stage img \{[^}]*flex: 0 0 auto;/);
});

test('image preview zooms at the pointer and pans by dragging', () => {
  // 滚轮缩放以指针为锚点：缩放前后指针指向的图像点保持在同一屏幕位置。
  assert.match(overlaySource, /function zoomAt\(nextScaleRaw, pointer\)/);
  assert.match(overlaySource, /const factor = nextScale \/ currentScale;/);
  assert.match(overlaySource, /onWheel=\{handleWheel\}/);
  // 拖拽平移用 Pointer Events + capture，触控板/鼠标同一套路径。
  assert.match(overlaySource, /onPointerDown=\{handleDragStart\}/);
  assert.match(overlaySource, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(overlaySource, /transform: `translate\(\$\{offset\.x\}px, \$\{offset\.y\}px\) scale\(\$\{scale\}\)`/);
  // 拖拽跟手：transform 不允许再挂 transition。
  assert.match(css, /\.image-preview-stage img \{[^}]*transition: none;/);
  // 溢出改为平移控制，舞台不再出滚动条；指针手势交给组件处理。
  assert.match(css, /\.image-preview-stage \{[^}]*overflow: hidden;/);
  assert.match(css, /\.image-preview-stage \{[^}]*touch-action: none;/);
  // 双击在 contain 和 2 倍 contain 之间切换。
  assert.match(overlaySource, /onDoubleClick=\{\(\) => zoomAt\(scale > 1\.001 \? 1 : 2, null\)\}/);
});

test('image preview stays reusable from the chat module', () => {
  // 浮层抽到 shared/ui；ChatMessageRow 保持具名 re-export，旧引用不必改。
  assert.match(row, /import \{ ImagePreviewOverlay \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/ImagePreviewOverlay\.jsx';/);
  assert.match(row, /export \{ ImagePreviewOverlay \};/);
  // 旧实现不能残留在聊天模块里（否则两份实现会漂移）。
  assert.doesNotMatch(row, /export function ImagePreviewOverlay/);
  assert.doesNotMatch(row, /blobToDataUrl/);
});

test('image preview sizing cannot loop on re-render', () => {
  // ref 回调如果是内联箭头函数，React 每次渲染都会 detach/attach 一遍，量尺寸就又
  // 写一次 state，很容易变成渲染死循环。ref 必须稳定，且同样的尺寸不能重复写 state。
  assert.match(overlaySource, /const attachImage = React\.useCallback\(\(node\) => \{/);
  assert.match(overlaySource, /ref=\{attachImage\}/);
  assert.match(overlaySource, /setBox\(\(previous\) => \(/);
  assert.match(overlaySource, /Math\.abs\(previous\.width - width\) < 0\.01/);
});

test('image preview stage and image caps stay in sync', () => {
  // 控件浮在图上，舞台几乎占满视口（只留一圈呼吸空隙）；不再为工具条预留 160/170px。
  const stageCap = /\.image-preview-stage \{[^}]*max-width: calc\(100vw - 48px\);[^}]*max-height: calc\(100vh - 48px\);/;
  const imageCap = /\.image-preview-stage img \{[^}]*max-width: calc\(100vw - 48px\);[^}]*max-height: calc\(100vh - 48px\);/;
  assert.match(css, stageCap);
  assert.match(css, imageCap);
  // 浮在图上的控件要有暗色描边，亮图上才压得住。
  assert.match(css, /\.image-preview-action \{[^}]*outline: 0\.5px solid rgba\(0, 0, 0, 0\.45\);/);
  assert.match(css, /\.image-preview-zoom \{[^}]*outline: 0\.5px solid rgba\(0, 0, 0, 0\.45\);/);
});

test('zoom readout reports the scale relative to original pixels', () => {
  // 百分比按原图像素数算：小图放大填满时如实显示放大倍数，1:1 像素时是 100%。
  assert.match(overlaySource, /const readout = Math\.round\(scale \* \(box\?\.fit \?\? 1\) \* 100\);/);
  // tooltip 里给出原图像素，方便怀疑"糊"时自查。
  assert.match(overlaySource, /原图 \$\{box\.naturalWidth\} × \$\{box\.naturalHeight\} px/);
  // 点击百分比回 contain（scale=1）。
  assert.match(overlaySource, /onClick=\{\(\) => zoomAt\(1, null\)\}/);
});

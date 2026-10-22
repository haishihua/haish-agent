import { lazy } from 'react';

/**
 * 生图卡和最终回答里的图片共用同一张马赛克动效（img-fx 的 `pixels-organic`）：
 * 「在取一张图」这件事在界面上应当只用一套语言，两处各写一遍 preset 迟早会分叉。
 *
 * 这个模块不写 JSX，所以两处都能直接引用；WebGL 那份 chunk 仍然是懒加载的，
 * 只有真的有图片在加载时才拉下来。
 */
export const ImageGenerationEffect = lazy(() =>
  import('img-fx').then((module) => ({ default: module.ImageGeneration })),
);

export const IMAGE_EFFECT_PRESET = 'pixels-organic';
// 应用是纯深色（`--bg: #0a0d15`），但 img-fx 默认 `theme="auto"` 读的是*系统*主题：
// 在浅色模式的 Mac 上会挑到浅色调校，深色聊天里糊出一块白斑。
export const IMAGE_EFFECT_THEME = 'dark';
// 和卡片同一个底色，着色器的对比度逻辑才留在深色区间。
export const IMAGE_EFFECT_CARD_BG = '#0a0d15';

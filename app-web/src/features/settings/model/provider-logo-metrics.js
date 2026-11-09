// Optical sizing for provider brand marks.
//
// Every logo file is a 24x24 viewBox, but the ink inside it is not: xAI's mark
// fills ~22 of those 24 units while Gemini's star only reaches ~19, and several
// marks are wide-and-short (DeepSeek 24x18). Rendered with `contain` at a flat
// 24px they look like different sizes in one list.
//
// Each entry records the measured ink long side inside the 24px box. The icon
// is then drawn at `24 * OPTICAL_LOGO_SIZE / ink` pixels, so the ink lands on
// one common size. The scale must live in the element's width/height (or the
// mask size): the settings list clips the 32px media slot with overflow:hidden,
// so a CSS transform grows past the box edge and gets cut off invisibly.
// Numbers come from rendering the shipped assets and measuring the painted
// bounding box (see provider-logo-size.test.js, which keeps them honest).
export const OPTICAL_LOGO_SIZE = 22;

export const PROVIDER_LOGO_INK = {
  openai: 24,
  anthropic: 24,
  gemini: 19,
  deepseek: 24,
  zhipu: 24,
  xai: 22,
  dashscope: 22,
  moonshot: 24,
  minimax: 24,
  ollama: 22,
  tavily: 24,
  exa: 24,
  brave: 24,
  serpapi: 24,
  parallel: 24,
  qdrant: 24,
};

// xAI 的粗实心笔画视觉重量明显更大，缩小实际标志而不是外层占位格。
const PROVIDER_OPTICAL_WEIGHT = { xai: 0.75 };

/** Pixel size that lifts a provider mark's ink to the common optical size. */
export function providerLogoSize(key, opticalSize = OPTICAL_LOGO_SIZE) {
  const name = String(key || '').trim();
  const ink = PROVIDER_LOGO_INK[name];
  if (!ink) return null;
  return Math.round((24 * opticalSize * (PROVIDER_OPTICAL_WEIGHT[name] ?? 1)) / ink);
}

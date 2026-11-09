// 模块级求值：浏览器里 window 一定在（打包时注入 HAISH_API_BASE）；
// Node 里（跑测试、SSR 校验）没有 window —— 这时返回空串，不要因为「缺一个 HTTP 前缀」
// 让整个数据投影链加载失败。
export function resolveApiBase() {
  const explicitBase = String(globalThis.window?.HAISH_API_BASE || '').trim();
  if (explicitBase) return explicitBase.replace(/\/$/, '');
  return '';
}

export const API_BASE = resolveApiBase();

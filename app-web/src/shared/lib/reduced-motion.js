// 「用户要求减少动效」的唯一判据：多处都要据此跳过动画，各自抄一份查询字符串
// 迟早会有一处写错、静默失效。
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 当前是否要求减少动效。每次读取都是最新的（用户可能在运行中改系统设置）。 */
export function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true;
}

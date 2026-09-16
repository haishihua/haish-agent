// 上下文表盘的填充扇形：24px 图标里 inset 20% 的内圈（直径 60%）对应半径 7.2。
const SECTOR_RADIUS = 7.2;
const CENTER = 12;

const round = (value) => Math.round(value * 1000) / 1000;

/**
 * 从 12 点方向顺时针铺开的扇形路径，`ratio` 为已用比例。
 *
 * 这块以前是 CSS `conic-gradient(#fff var(--context-used), transparent 0)`：
 * Chromium 对渐变硬停点不做覆盖率抗锯齿，扇形半径边只能吸附到整像素——实测
 * 边外那颗像素在任何亚像素位置都等于背景色（没有半覆盖过渡），而且同一角度
 * 的上下两半会各自吸附到相邻像素列，直边在中间错开 1 个设备像素，看起来就是
 * “一半发糊、边缘不光滑”。换成矢量路径后由 SVG 光栅化器抗锯齿，任何比例、
 * 任何亚像素位置都是同一条带过渡像素的直边。
 */
export function contextSectorPath(ratio) {
  const used = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (used <= 0) return '';
  const top = CENTER - SECTOR_RADIUS;
  if (used >= 1) {
    // 满圈要两段半圆：单段圆弧首尾重合时不会绘制任何东西。
    return `M${CENTER} ${top} A${SECTOR_RADIUS} ${SECTOR_RADIUS} 0 1 1 ${CENTER} ${round(CENTER + SECTOR_RADIUS)}`
      + ` A${SECTOR_RADIUS} ${SECTOR_RADIUS} 0 1 1 ${CENTER} ${top} Z`;
  }
  const angle = used * Math.PI * 2;
  const x = round(CENTER + SECTOR_RADIUS * Math.sin(angle));
  const y = round(CENTER - SECTOR_RADIUS * Math.cos(angle));
  const largeArc = used > 0.5 ? 1 : 0;
  return `M${CENTER} ${CENTER} L${CENTER} ${top} A${SECTOR_RADIUS} ${SECTOR_RADIUS} 0 ${largeArc} 1 ${x} ${y} Z`;
}

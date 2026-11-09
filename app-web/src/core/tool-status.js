// 工具调用自身的状态词表：哪些状态算「这一调用还在跑」。
//
// 工具卡文案（进行时 / 过去时）、时间线里能不能把进度挂到工具下、审批请求落到哪个
// 工具卡，读的都是这一份。它比 tool-names.js 低一层：那边管「这是哪类工具」，这边
// 管「它跑完没」。新增一个进行中状态时只改这里，不要在每个调用点各写一对字符串——
// 之前就是七处各一份，改一处会漏六处。
const IN_FLIGHT_TOOL_STATUSES = new Set(['pending', 'running']);

/**
 * 工具状态是否还在进行中。
 *
 * 不做大小写归一：调用点比对的是事件里原样的状态串，多写一层归一等于悄悄放宽
 * 判据（大写状态从「不在跑」变成「在跑」）。需要归一的一方自己先 lower。
 */
export function isToolInFlight(status) {
  return IN_FLIGHT_TOOL_STATUSES.has(String(status || ''));
}

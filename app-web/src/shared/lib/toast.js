// 跨层提示：shared 里的组件（Markdown 链接、图片预览等）拿不到 shell 的 toast 状态，
// 只能通过一个出口向上报告。事件名与 payload 形状只在这里定义，收发双方都引用它，
// 不再各自硬写字符串。
const TOAST_EVENT = 'haish:toast';

/** 向上层报告一条提示。没有 window（测试、SSR 校验）时静默忽略。 */
export function notifyToast(kind, message) {
  if (typeof window === 'undefined') return;
  const detail = { kind: kind || 'info', message: String(message || '') };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

/** 订阅上面那条通道；返回退订函数。 */
export function onToast(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  const listener = (event) => callback(event?.detail || {});
  window.addEventListener(TOAST_EVENT, listener);
  return () => window.removeEventListener(TOAST_EVENT, listener);
}

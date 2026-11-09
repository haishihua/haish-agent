// 页签组（role="tablist"）的键盘导航。消息里的 Request/Response 和运行态详情的
// Config/Result 是两套独立组件，但用户对「页签」的键盘预期只有一套：Home/End 跳
// 首尾，左右方向键循环切换。键表只留在这里，避免一处补了 End、另一处没补。
export const TAB_NAVIGATION_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

// 返回应该聚焦的页签 id；不是导航键或没有页签时返回 null，调用方据此决定是否 preventDefault。
export function tabNavigationTarget(key, ids, activeId) {
  if (!TAB_NAVIGATION_KEYS.includes(key) || !Array.isArray(ids) || ids.length === 0) return null;
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids.at(-1);
  const activeIndex = ids.indexOf(activeId);
  if (activeIndex < 0) return key === 'ArrowLeft' ? ids.at(-1) : ids[0];
  const step = key === 'ArrowLeft' ? -1 : 1;
  return ids[(activeIndex + step + ids.length) % ids.length];
}

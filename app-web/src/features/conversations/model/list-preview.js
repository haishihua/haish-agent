// 侧边栏列表（会话行 / 任务卡）的预览页大小：默认先放这么多行，每点一次 “Show more”
// 再加这么多行。组件只许引用这一个常量，别再各自写死数字。
export const PREVIEW_PAGE_SIZE = 5;

export function nextExtraVisible(current, hiddenCount) {
  return hiddenCount > 0 ? current + Math.min(PREVIEW_PAGE_SIZE, hiddenCount) : 0;
}

// The preview every collapsed list starts from again.
export const DEFAULT_PREVIEW = Object.freeze({ chat: 0, bot: 0 });

// "Show more" is view state, not user data: once the list is hidden (the
// project row icon folds it away, or the whole conversation panel collapses),
// reopening it must fall back to the default preview instead of
// restoring the previously expanded list. Returning the same reference when the
// list stays visible keeps React from re-rendering on every parent update.
export function previewWhenHidden(extraVisible, listVisible) {
  return listVisible ? extraVisible : DEFAULT_PREVIEW;
}

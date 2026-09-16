export function nextExtraVisible(current, hiddenCount) {
  return hiddenCount > 0 ? current + Math.min(3, hiddenCount) : 0;
}

// The preview every collapsed list starts from again.
export const DEFAULT_PREVIEW = Object.freeze({ chat: 0, bot: 0 });

// "Show more" is view state, not user data: once the list is hidden (the
// project row icon folds it away, or the whole conversation panel collapses),
// reopening it must fall back to the default three-row preview instead of
// restoring the previously expanded list. Returning the same reference when the
// list stays visible keeps React from re-rendering on every parent update.
export function previewWhenHidden(extraVisible, listVisible) {
  return listVisible ? extraVisible : DEFAULT_PREVIEW;
}

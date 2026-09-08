export function nextExtraVisible(current, hiddenCount) {
  return hiddenCount > 0 ? current + Math.min(3, hiddenCount) : 0;
}

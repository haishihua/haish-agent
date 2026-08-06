// @haish-esm
export function resolveTooltipPosition(preferred, triggerRect, bubbleHeight, viewportHeight, margin = 8) {
  const aboveSpace = triggerRect.top - margin;
  const belowSpace = viewportHeight - triggerRect.bottom - margin;
  if (preferred === 'above' && aboveSpace < bubbleHeight && belowSpace > aboveSpace) return 'below';
  if (preferred === 'below' && belowSpace < bubbleHeight && aboveSpace > belowSpace) return 'above';
  return preferred;
}

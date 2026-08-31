// Formatting shared by chat and approval message chrome.
export function formatContextTokens(value) {
  const tokens = Math.max(0, Math.round(Number(value) || 0));
  const thousands = tokens / 1000;
  if (tokens === 0) return '0k';
  if (thousands < 10) return `${Math.max(0.1, thousands).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(thousands)}k`;
}

export function formatContextUsageLabel(usedTokens, totalTokens) {
  return `Context: ${formatContextTokens(usedTokens)} / ${formatContextTokens(totalTokens)}`;
}

export function formatElapsedDuration(start, end) {
  const startMs = Number(start) || 0;
  const endMs = Number(end) || 0;
  if (!startMs || !endMs || endMs < startMs) return '';
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatMessageClock(value) {
  const time = Number(value) || 0;
  if (!time) return '';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

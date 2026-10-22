// Final answers quote generated pictures as local paths; the renderer turns those into
// conversation-preview URLs (see remark-image-paths.js). The first load can fail for a
// reason that fixes itself without the reader doing anything: the turn just finished
// and the local runtime has not registered the task's artifact root yet (or the backend
// restarted between two renders).
//
// So one silent retry, and only one. Past that a failure is a real answer from the
// endpoint (403/404 — the picture is not part of this conversation), and every extra
// attempt multiplies work on a backend that walks the conversation's roots each time
// while the reader stares at an empty frame. The retry icon is the affordance after
// that point, not a retry loop.
export const PATH_IMAGE_RETRY_DELAYS_MS = [400];

/** Cache-busting variant of a preview URL; attempt 0 keeps the original URL. */
export function withRetryParam(url, attempt) {
  const value = String(url || '');
  if (!value || attempt <= 0) return value;
  return `${value}${value.includes('?') ? '&' : '?'}haish_retry=${attempt}`;
}

// 服务端明确回答“这张图不在本会话的可见范围内”时，界面上没有任何东西可以重试：空框加
// 一个重试图标，只会把一句技术正文变成一块空地（正文里引用 `/a b/x.png`、或者诊断里引用
// 另一个会话的 artifact 路径，都会如此）。这两种情况必须分开：
//   - 403/404/415：文件不在、不允许、不是图 → 没有“再取一次”这回事；
//   - 超时/网络/5xx：真的可以再等等。
// 用一次 1 字节的 Range 探针拿状态码（FileResponse 支持 Range；不支持时直接取消正文）。
const TERMINAL_IMAGE_STATUSES = new Set([400, 403, 404, 410, 415]);

export async function probeImageStatus(url) {
  const value = String(url || '');
  if (!value) return 'missing';
  try {
    const response = await fetch(value, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
    try {
      await response.body?.cancel();
    } catch {
      // 正文已经在读了：放弃即可，我们只要状态码。
    }
    return TERMINAL_IMAGE_STATUSES.has(response.status) ? 'missing' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

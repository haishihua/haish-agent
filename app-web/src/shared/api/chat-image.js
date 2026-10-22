import { API_BASE } from './base.js';

/**
 * One place that turns a stored image reference into something the renderer can
 * actually load.
 *
 * Chat images (uploads, pasted images, generated images) are persisted as local
 * absolute paths — the conversation store never keeps bytes. Rendering goes
 * through the conversation preview endpoint, which re-checks the path against
 * this conversation's upload root and its task artifact roots. Anything that
 * already is a URL (http/data/blob) is used as-is.
 */
export function chatImagePreviewUrl(ref, conversationId) {
  const existing = String(ref?.previewUrl || '').trim();
  if (existing) return existing;
  const path = String(ref?.path || '').trim();
  if (!path) return '';
  if (/^(blob:|data:|https?:)/i.test(path)) return path;
  // `file://` is a display form of the same local path; the endpoint wants the
  // bare absolute path (it resolves it against the conversation's roots).
  const localPath = path.replace(/^file:\/\//i, '') || path;
  // 图片始终按“这条消息所属的会话”请求。路径里即使带着别的会话编号，也不能
  // 改变请求范围；服务端会按当前会话的根目录再校验一次。
  const scopeId = String(conversationId || '');
  if (!scopeId) return '';
  const params = new URLSearchParams({ image_path: localPath });
  return `${API_BASE}/api/conversations/${encodeURIComponent(scopeId)}/messages/images/preview?${params.toString()}`;
}

/** True for the same-origin preview URL built by {@link chatImagePreviewUrl}. */
export function isChatImagePreviewUrl(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /(?:^|\/)api\/conversations\/[^/]+\/messages\/images\/preview\?/.test(text);
}

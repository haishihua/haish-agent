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
  if (!conversationId) return '';
  // `file://` is a display form of the same local path; the endpoint wants the
  // bare absolute path (it resolves it against the conversation's roots).
  const localPath = path.replace(/^file:\/\//i, '') || path;
  const params = new URLSearchParams({ image_path: localPath });
  return `${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/messages/images/preview?${params.toString()}`;
}

/** True for the same-origin preview URL built by {@link chatImagePreviewUrl}. */
export function isChatImagePreviewUrl(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /(?:^|\/)api\/conversations\/[^/]+\/messages\/images\/preview\?/.test(text);
}

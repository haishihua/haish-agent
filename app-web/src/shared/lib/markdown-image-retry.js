// Final answers quote generated pictures as local paths; the renderer turns those into
// conversation-preview URLs (see remark-image-paths.js). The first load can fail for
// reasons that fix themselves:
//
//   - the local runtime is still starting, so the preview endpoint is not answering yet,
//   - the turn finished a moment ago and its artifact root is not part of the
//     conversation's allowed roots yet,
//   - a restart of the backend between two renders.
//
// Latching the first failure as "this picture does not exist" leaves the reader with a
// bare path for the rest of the session, so the <img> reloads with a cache-busting
// `haish_retry` param before giving up.
export const PATH_IMAGE_RETRY_DELAYS_MS = [600, 1800];

/** Cache-busting variant of a preview URL; attempt 0 keeps the original URL. */
export function withRetryParam(url, attempt) {
  const value = String(url || '');
  if (!value || attempt <= 0) return value;
  return `${value}${value.includes('?') ? '&' : '?'}haish_retry=${attempt}`;
}

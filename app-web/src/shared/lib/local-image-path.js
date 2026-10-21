// Models answer with local file paths, not Markdown images: a generated picture
// comes back as `/Users/…/artifacts/images/gen-call_00_….png` pasted straight
// into the prose. Chat used to show that as an unreadable (and unsplittable)
// wall of text. The remark plugin in `remark-image-paths.js` turns exactly those
// paths into `<img>`, so this module owns the "is this really a local image
// path?" question.
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|avif|bmp)$/i;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
// A path candidate runs to the first image extension. Spaces are allowed (the
// runtime root itself is `Haish (Dev)`), but CJK text and full-width punctuation
// are not: `/path/x.png（gpt-image-2）` must stop at `.png`, and a sentence that
// mentions a path in Chinese must not swallow its neighbours.
// The lookbehind keeps the match from starting inside a word or a scheme: without
// it `https://example.com/a.png` matched `s://example.com/a.png` (a one-letter
// "drive") and got offered to the resolver as a local path.
const LOCAL_IMAGE_PATH_PATTERN = new RegExp(
  String.raw`(?<![\w+.-])(?:file:\/\/\/?)?(?:\/|[A-Za-z]:[\\/])`
  + '[^\\n\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]*?'
  + String.raw`\.(?:png|jpe?g|webp|gif|avif|bmp)(?![\w.-])`,
  'gi',
);

/** The local absolute path form of `raw`, or `''` when it is not one. */
export function normalizeLocalImagePath(raw) {
  let value = String(raw ?? '').trim();
  if (!value) return '';
  value = value.replace(/^[`"'<]+|[`"'>]+$/g, '').trim();
  if (/^file:\/\//i.test(value)) {
    value = value.replace(/^file:\/\//i, '');
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep the raw form: a path with a stray `%` is still worth a preview try.
    }
    if (value.toLowerCase().startsWith('localhost/')) value = value.slice('localhost'.length);
  }
  // Any other scheme is a URL, not a path; Windows drive letters are not schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !WINDOWS_ABSOLUTE.test(value)) return '';
  if (value.startsWith('//')) return '';
  if (!value.startsWith('/') && !WINDOWS_ABSOLUTE.test(value)) return '';
  if (!IMAGE_EXTENSION.test(value)) return '';
  return value;
}

/**
 * Split prose into plain text and local image path segments.
 *
 * Returns `null` when the text holds no usable path, so callers can keep the
 * original node untouched.
 */
export function segmentLocalImagePaths(value) {
  const text = String(value ?? '');
  if (!text) return null;
  const parts = [];
  let cursor = 0;
  let found = false;
  LOCAL_IMAGE_PATH_PATTERN.lastIndex = 0;
  let match = LOCAL_IMAGE_PATH_PATTERN.exec(text);
  while (match) {
    const path = normalizeLocalImagePath(match[0]);
    if (path) {
      found = true;
      if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) });
      parts.push({ type: 'path', value: match[0], path });
      cursor = match.index + match[0].length;
    }
    match = LOCAL_IMAGE_PATH_PATTERN.exec(text);
  }
  if (!found) return null;
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts;
}

/** File name shown as the image's alt text. */
export function localImageFileName(path) {
  const value = String(path || '');
  const name = value.split(/[\\/]/).filter(Boolean).pop();
  return name || value;
}

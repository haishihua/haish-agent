// Models answer with local file paths, not Markdown images: a generated picture
// comes back as `/Users/…/artifacts/images/gen-call_00_….png` pasted straight
// into the prose — sometimes abbreviated (`.../artifacts/images/x.png`) or with
// just the tail (`artifacts/images/x.png`). Chat used to show that as an
// unreadable wall of text.
//
// 这一层只认“正文里哪一段像图片路径”，不判断它是否真实存在：能不能解析出来由预览接口
// 决定（它只返回本会话允许根内的文件，解析不出来就 403，前端于是保留原文）。所以这里
// 既没有省略号词表也没有任何路径前缀规则，只有两条形状：
//
//   1. 从 `/` 开始的一整段（允许空格，运行时目录就叫 `Haish (Dev)`）；
//   2. 一段不含空格的连续字符（`.../artifacts/images/x.png`、`artifacts/images/x.png`）。
//
// 两条都要求以图片扩展名结尾；服务端按“丢掉前面若干段再找”的方式解析，所以前端把
// 前缀截短（例如路径里带空格时）也不会影响结果。
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|avif|bmp)$/i;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const EXTENSION = String.raw`\.(?:png|jpe?g|webp|gif|avif|bmp)`;
// 换行、中日韩文字/标点、引号（`` ` `` " '）处一律断开；空格在路径里是合法的
// （运行时目录就叫 `Haish (Dev)`），所以只对付“单 token”那种形状排除空白。
const PATH_CHAR = String.raw`[^\n\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u0060"']`;
const TOKEN_CHAR = String.raw`[^\n\s\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u0060"']`;
const LOCAL_IMAGE_PATH_PATTERN = new RegExp(
  String.raw`(?<![\w+.-])(?:file:\/\/\/?)?(?:`
  + String.raw`\/(?!\/)` + PATH_CHAR + String.raw`*?` + EXTENSION
  + '|' + TOKEN_CHAR + TOKEN_CHAR + String.raw`*?` + EXTENSION
  + String.raw`)(?![\w.-])`,
  'gi',
);

/** The path-shaped form of `raw`, or `''` when the token is not a local image reference. */
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
  // Anything with a scheme is a URL, not a path; `C:` is a drive letter, not a scheme.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !WINDOWS_ABSOLUTE.test(value)) return '';
  if (value.startsWith('//')) return '';
  // 必须有目录分隔符：裸文件名（`x.png`、`report.png`）是正文里的词，不是路径，
  // 拿去预览只会多一次 404，而且会把正常行文变成破图。
  if (!value.includes('/') && !WINDOWS_ABSOLUTE.test(value)) return '';
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

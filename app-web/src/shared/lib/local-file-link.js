// Markdown answers link to the files a task produced. The shapes models and
// CLIs actually print are `file://` URIs, Codex's `sandbox:` prefix, POSIX and
// Windows absolute paths, and paths relative to the conversation workspace.
//
// This module only resolves a link target; it never reads, uploads or rewrites
// the file, and opening one stays a user click (see MarkdownLink in Markdown.jsx).
const FILE_URI = /^file:\/\//i;
const SANDBOX_PREFIX = /^sandbox:/i;
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// A relative target needs an explicit `./` / `../` or a file-looking tail, so a
// branch name (`release/20260917`) or a bare word never turns into a file link.
const RELATIVE_PATH = /^(?:\.{1,2}[\\/]|.*[\\/][^\\/]*\.[a-z0-9]{1,10}$|[^\\/]*\.[a-z0-9]{1,10}$)/i;

let workspaceRoot = '';

/** The absolute directory relative link targets resolve against (conversation cwd). */
export function setLocalFileRoot(root) {
  workspaceRoot = String(root || '').replace(/[\\/]+$/, '');
}

export function localFileRoot() {
  return workspaceRoot;
}

function homePath() {
  return String(globalThis.window?.haish?.homePath || '');
}

/** Resolve a markdown href to an absolute local path, or '' when it is not one. */
export function localFilePath(value) {
  let raw = String(value || '').trim();
  if (!raw || raw === 'streamdown:incomplete-link') return '';
  // `[label](<path with spaces>)` keeps the angle brackets through markdown.
  if (/^<[^>]*>$/.test(raw)) raw = raw.slice(1, -1).trim();
  if (SANDBOX_PREFIX.test(raw)) {
    // Codex prints artifact links as sandbox:/abs/path; keep the absolute shape.
    raw = raw.replace(SANDBOX_PREFIX, '');
    if (raw && !raw.startsWith('/')) raw = `/${raw}`;
  }
  if (FILE_URI.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.hostname && url.hostname !== 'localhost') return '';
      raw = decodeURIComponent(url.pathname);
      // file:///C:/… carries the drive letter behind a leading slash.
      if (WINDOWS_ABSOLUTE.test(raw.slice(1))) raw = raw.slice(1);
    } catch { return ''; }
  }
  if (!raw || raw.includes('\0') || /[\r\n]/.test(raw)) return '';
  if (raw === '~' || raw.startsWith('~/')) {
    const home = homePath();
    if (!home) return '';
    raw = raw === '~' ? home : `${home.replace(/[\\/]+$/, '')}${raw.slice(1)}`;
  }
  if (WINDOWS_ABSOLUTE.test(raw) || raw.startsWith('/')) return raw;
  if (SCHEME.test(raw) || raw.includes('://') || !RELATIVE_PATH.test(raw)) return '';
  if (!workspaceRoot) return '';
  return `${workspaceRoot}/${raw.replace(/^\.\//, '').replace(/\\/g, '/')}`;
}

/** The `file://` form of the same target, so a middle-click still opens the file. */
export function localFileHref(value) {
  const target = localFilePath(value);
  if (!target) return '';
  const normalized = target.replace(/\\/g, '/');
  const encoded = normalized.split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
    // The drive colon stays readable: file:///C:/… (not C%3A).
    .replace(/^([a-z])%3A/i, '$1:');
  return `${/^[a-z]:\//i.test(normalized) ? 'file:///' : 'file://'}${encoded}`;
}

/** Ask the desktop shell to open the target with its default application. */
export async function openLocalFile(value) {
  const target = localFilePath(value);
  if (!target) return { ok: false, error: 'This link does not point to a local file.' };
  const api = globalThis.window?.haish;
  if (typeof api?.openLocalPath !== 'function') {
    return { ok: false, target, error: 'Opening local files needs the Haish desktop app.' };
  }
  try {
    const result = await api.openLocalPath(target);
    if (result?.ok) return { ok: true, target };
    return { ok: false, target, error: String(result?.error || `Could not open ${target}`) };
  } catch (error) {
    return { ok: false, target, error: String(error?.message || error) };
  }
}

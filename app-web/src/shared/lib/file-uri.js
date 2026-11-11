/** Decode only local file URIs; leave workspace and desktop policy to callers. */
export function fileUriPath(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return '';
    let path = decodeURIComponent(url.pathname);
    if (/^[a-z]:[\\/]/i.test(path.slice(1))) path = path.slice(1);
    return path.includes('\0') || /[\r\n]/.test(path) ? '' : path;
  } catch {
    return '';
  }
}

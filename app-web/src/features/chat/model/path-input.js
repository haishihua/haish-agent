// Path and paste normalization for the composer.
export function isAbsolutePathLike(value) {
  return value.startsWith('/') || value === '~' || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value);
}

export function normalizeFsPath(value, homePath = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  const normalizedHome = String(homePath || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const expanded = normalizedHome && (raw === '~' || raw.startsWith('~/'))
    ? `${normalizedHome}${raw.slice(1)}`
    : raw;
  return expanded.replace(/\/+$/, '');
}

export function basenameFromPath(value) {
  const normalized = normalizeFsPath(value);
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function workspaceRelativePath(filePath, workspacePath, homePath = '') {
  const normalizedFile = normalizeFsPath(filePath, homePath);
  if (!normalizedFile) return '';
  const normalizedWorkspace = normalizeFsPath(workspacePath || homePath, homePath);
  if (!normalizedWorkspace) return normalizedFile;
  if (normalizedFile === normalizedWorkspace) return basenameFromPath(normalizedFile);
  const prefix = `${normalizedWorkspace}/`;
  if (normalizedFile.startsWith(prefix)) return normalizedFile.slice(prefix.length);
  return normalizedFile;
}

export function stripWorkspaceNamePrefix(relativePath, workspacePath, homePath = '') {
  const normalized = normalizeFsPath(relativePath, homePath).replace(/^\.\/+/, '');
  if (!normalized) return '';
  const workspaceName = basenameFromPath(workspacePath || homePath);
  if (!workspaceName || !normalized.includes('/')) return normalized;
  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === workspaceName && parts.length > 1) return parts.slice(1).join('/');
  return normalized;
}

export function normalizePastedPathLine(line, workspacePath, options = {}) {
  const homePath = options.homePath || '';
  let text = String(line || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith('file://')) {
    try {
      text = decodeURIComponent(text.replace(/^file:\/\//, ''));
    } catch {
      text = text.replace(/^file:\/\//, '');
    }
  }
  if (isAbsolutePathLike(text)) return workspaceRelativePath(text, workspacePath, homePath);
  const relativePath = stripWorkspaceNamePrefix(text, workspacePath, homePath);
  return options.filePaste && !normalizeFsPath(workspacePath || homePath, homePath) ? basenameFromPath(relativePath) : relativePath;
}

export function normalizePastedPathText(text, workspacePath, homePath = '') {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const shouldNormalize = lines.every((line) => {
    const item = line.trim();
    return !item
      || item.startsWith('file://')
      || isAbsolutePathLike(item)
      || item.startsWith('./')
      || item.startsWith('../')
      || (item.includes('/') && !/\s/.test(item));
  });
  if (!shouldNormalize) return '';
  const normalized = lines.map((line) => normalizePastedPathLine(line, workspacePath, { homePath })).join('\n');
  return normalized === raw ? '' : normalized;
}

export function clipboardFilesToPathText(files, workspacePath, homePath = '') {
  return Array.from(files || [])
    .map((file) => {
      const nativePath = (() => {
        try {
          return window.haish?.getPathForFile?.(file) || '';
        } catch (_) {
          return '';
        }
      })();
      const rawPath = nativePath || file?.path || file?.webkitRelativePath || '';
      return normalizePastedPathLine(rawPath, workspacePath, { filePaste: true, homePath });
    })
    .filter(Boolean)
    .join('\n');
}

export function clipboardUriListToPathText(uriList, workspacePath, homePath = '') {
  return String(uriList || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizePastedPathLine(line, workspacePath, { filePaste: true, homePath }))
    .filter(Boolean)
    .join('\n');
}

export function insertTextAtSelection(value, insertText, selectionStart, selectionEnd, maxLength) {
  const current = String(value || '');
  const start = Number.isFinite(selectionStart) ? selectionStart : current.length;
  const end = Number.isFinite(selectionEnd) ? selectionEnd : start;
  const prefix = current.slice(0, start);
  const suffix = current.slice(end);
  const spacerBefore = prefix && !/[\s\n]$/.test(prefix) ? '\n' : '';
  const spacerAfter = suffix && !/^[\s\n]/.test(suffix) ? '\n' : '';
  return `${prefix}${spacerBefore}${insertText}${spacerAfter}${suffix}`.slice(0, maxLength);
}

export function handlePathPaste(event, currentValue, setValue, workspacePath, homePath = '', maxLength = 500) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const uriText = clipboardUriListToPathText(clipboard.getData('text/uri-list'), workspacePath, homePath);
  const fileText = clipboardFilesToPathText(clipboard.files, workspacePath, homePath);
  const plainText = clipboard.getData('text/plain');
  const normalizedText = uriText || fileText || normalizePastedPathText(plainText, workspacePath, homePath);
  if (!normalizedText) return;
  event.preventDefault();
  const target = event.currentTarget;
  const selectionStart = target.selectionStart;
  const nextValue = insertTextAtSelection(
    currentValue,
    normalizedText,
    selectionStart,
    target.selectionEnd,
    maxLength,
  );
  setValue(nextValue);
  window.requestAnimationFrame(() => {
    const cursor = Math.min(nextValue.length, (selectionStart || 0) + normalizedText.length);
    target.setSelectionRange(cursor, cursor);
  });
}

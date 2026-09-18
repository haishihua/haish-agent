// Presentation only: never read/upload the target or rewrite the task text.
//
// 判定不查盘（没有 stat，后缀只是提示），只看形状，分两条入口：
// - 显式路径（`/`、`~/`、`./`、`../`、盘符、UNC）：形状无歧义，段里带中文/空格照收；
// - 相对路径：段名必须都是纯路径字符，且末段像文件（带非纯数字后缀或白名单文件名）。
//   分支名（`release/20260917`）、版本号（`v1.2/3`）、中文短语（`明天/后天`）以及夹在
//   中文句子里的整行（`那就把修复分支合并到release/20260917`）都不再变成 FOLDER
//   卡片——认不出来的东西原样留在正文里，绝不把用户的话从气泡里抠走。
const FILE_NAME_WHITELIST = /^(?:readme|license|makefile|dockerfile|gemfile|procfile|\.env|\.gitignore|\.npmrc)$/i;
// 相对路径的每一段都必须像路径名；中文句子里的斜杠 token 才不会被整行吞掉。
const PLAIN_PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/;

export function localPathReference(value) {
  let path = String(value || '').trim();
  if (/^!?\[.*\]\(/.test(path)) return null;
  if (/^(["']).*\1$/.test(path)) path = path.slice(1, -1);
  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.hostname && url.hostname !== 'localhost') return null;
      if (url.search || url.hash) return null;
      path = decodeURIComponent(url.pathname).replace(/^\/([a-z]:\/)/i, '$1');
    } catch { return null; }
  }
  const explicitPath = /^(?:\/(?!\/)|~\/|\.{1,2}\/|[a-z]:[\\/]|\\\\[^\\]+\\)/i.test(path);
  const relativePath = /^[^\s/:\\]+(?:[/\\][^\s/:\\]+)+$/.test(path);
  if ((!explicitPath && !relativePath) || /[\r\n\t<>|`]/.test(path) || path.includes(String.fromCharCode(0))) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/');
  const name = segments.at(-1);
  if (!name || name === '.' || name === '..' || name === '~' || /^[a-z]:$/i.test(name)) return null;
  const extension = name.match(/^.+\.([a-z0-9]{1,10})$/i)?.[1];
  const directory = /[/\\]$/.test(path);
  // 纯数字的「后缀」是版本号（`release/1.2`）而不是文件类型。
  const fileLike = Boolean((extension && !/^[0-9]+$/.test(extension)) || FILE_NAME_WHITELIST.test(name));
  // 相对路径只在「段边界清晰 + 末段像文件」时才算引用；显式路径不做这层限制。
  if (!explicitPath && !(fileLike && segments.every((segment) => PLAIN_PATH_SEGMENT.test(segment)))) return null;
  const file = !directory && fileLike;
  return { path, name, kind: file ? 'file' : 'directory', kindLabel: file ? (extension?.toUpperCase() || 'FILE') : 'FOLDER' };
}

export function splitPathReferences(value) {
  const parts = [];
  let fence = null;
  const appendText = (text) => {
    if (!text) return;
    if (parts.length && !parts.at(-1).reference) parts.at(-1).text += text;
    else parts.push({ text });
  };
  for (const match of String(value || '').matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    const [, line, newline] = match;
    if (!match[0]) continue;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    const inCode = Boolean(fence) || /^(?: {4}|\t)/.test(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    }
    const parsed = !inCode && !marker ? pathReferenceLine(line) : null;
    if (parsed) {
      parts.push({ text: parsed.pathText, reference: parsed.reference });
      appendText(line.slice(parsed.pathText.length));
    } else appendText(line);
    appendText(newline);
  }
  return parts;
}

function pathReferenceLine(line) {
  // Quoting and encoded file URIs provide an explicit boundary, including spaces in filenames.
  const explicit = line.match(/^ {0,3}(?:"[^"]+"|'[^']+'|file:\/\/\S+)(?=\s|$)/i)?.[0];
  if (explicit) {
    const reference = localPathReference(explicit);
    return reference ? { pathText: explicit, reference } : null;
  }
  // Reserve slash commands for the skill composer. Root folders can use /name/ or quotes.
  if (/^ {0,3}\/[a-z0-9-]+(?:\s|$)/i.test(line)) return null;
  // A file suffix followed by whitespace ends the reference, not the user's sentence.
  const pathText = line.match(/^ {0,3}.+?\.[a-z0-9]{1,10}(?=\s|$)/i)?.[0] || line;
  const reference = localPathReference(pathText);
  if (!reference || /[，。！？；]/u.test(pathText)) return null;
  // ponytail: unquoted, spaced folders are ambiguous without filesystem access; keep them as text.
  if (/\s/.test(pathText.trim()) && reference.kind !== 'file') return null;
  return { pathText, reference };
}

export function splitPathReferenceDraft(value) {
  const parts = splitPathReferences(value);
  const references = parts.filter((part) => part.reference).map((part) => part.text.trim());
  if (!references.length) return { text: String(value || ''), references };
  const text = parts.map((part, index) => part.reference ? ''
    : parts[index - 1]?.reference ? part.text.replace(/^(?:[ \t]+|\r\n|\r|\n)/, '') : part.text).join('');
  return { text: text.replace(/^[\r\n]+|[\r\n]+$/g, ''), references };
}

export function composePathReferenceDraft(text, references) {
  return [...references, ...(text ? [text] : [])].join('\n');
}

// Finder supplies real paths through the existing Electron preload helper.
// Browser File.name alone is not a usable local path; never fabricate one.
export function transferredLocalPaths(transfer) {
  const files = Array.from(transfer?.files || []);
  const paths = files.filter((file) => !String(file.type || '').startsWith('image/')).map((file) => {
    let nativePath = '';
    try { nativePath = globalThis.window?.haish?.getPathForFile?.(file) || ''; } catch { /* Web preview has no native paths. */ }
    return nativePath || file.path || file.webkitRelativePath || '';
  }).filter((path) => localPathReference(path));
  if (files.length) return paths.join('\n');
  return String(transfer?.getData?.('text/uri-list') || '').split(/\r?\n/)
    .filter((line) => /^file:\/\//i.test(line.trim()))
    .map((line) => localPathReference(line)?.path).filter(Boolean).join('\n');
}

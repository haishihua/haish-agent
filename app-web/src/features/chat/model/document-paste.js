// Keep aligned with the document API's _SUPPORTED_UPLOAD_SUFFIXES.
const DOCUMENT_SUFFIXES = new Set(['md', 'txt', 'pdf', 'html', 'htm', 'docx', 'json', 'py']);

export function firstPastedDocument(clipboard) {
  const items = Array.from(clipboard?.items || []).filter((item) => item.kind === 'file');
  const candidates = items.length
    ? items.map((item) => {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) return null;
      const file = item.getAsFile();
      // Without entry metadata, an empty untyped item may be a directory.
      if (!entry && file?.size === 0 && !file.type) return null;
      return file;
    })
    : Array.from(clipboard?.files || []).filter((file) => file.size > 0 || file.type);
  return candidates.find((file) => file && DOCUMENT_SUFFIXES.has(file.name.match(/\.([^.]+)$/)?.[1].toLowerCase())) || null;
}

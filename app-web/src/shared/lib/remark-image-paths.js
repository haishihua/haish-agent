import { localImageFileName, normalizeLocalImagePath, segmentLocalImagePaths } from './local-image-path.js';

// Nodes whose text is not prose. `code` is a fenced/indented block, `html` is
// raw markup the sanitizer owns — rewriting either would corrupt real code.
// `inlineCode` is deliberately NOT skipped: models usually wrap the path in
// backticks, and a code span that contains nothing but an image path is a path,
// not code.
const SKIP_CHILDREN = new Set(['code', 'html', 'math', 'inlineMath']);

function imageNode(url, path) {
  return { type: 'image', url, alt: localImageFileName(path), title: path };
}

function tryImage(value, resolveImage) {
  const path = normalizeLocalImagePath(value);
  if (!path) return null;
  const url = resolveImage(path);
  if (!url) return null;
  return imageNode(url, path);
}

function rewriteChildren(node, resolveImage) {
  const children = Array.isArray(node.children) ? node.children : null;
  if (!children) return;
  const next = [];
  for (const child of children) {
    if (!child || typeof child !== 'object') {
      next.push(child);
      continue;
    }
    if (child.type === 'text') {
      const segments = segmentLocalImagePaths(child.value);
      if (!segments) {
        next.push(child);
        continue;
      }
      for (const segment of segments) {
        if (segment.type !== 'path') {
          next.push({ ...child, value: segment.value });
          continue;
        }
        const image = tryImage(segment.path, resolveImage);
        // The endpoint rejects paths outside this conversation; when it cannot
        // be resolved the path stays visible text instead of a broken image.
        next.push(image || { ...child, value: segment.value });
      }
      continue;
    }
    if (child.type === 'inlineCode') {
      const image = tryImage(child.value, resolveImage);
      if (image) {
        next.push(image);
        continue;
      }
    }
    if (child.type === 'image') {
      const path = normalizeLocalImagePath(child.url);
      const url = path ? resolveImage(path) : '';
      if (url) {
        next.push({ ...child, url, title: child.title || path });
        continue;
      }
    }
    if (!SKIP_CHILDREN.has(child.type)) rewriteChildren(child, resolveImage);
    next.push(child);
  }
  node.children = next;
}

/**
 * Remark plugin: render local image paths in model prose as real images.
 *
 * `resolveImage(path)` returns the URL to load (or `''` to leave the path as
 * text). Applied to finished answers only — a half-streamed path would rewrite
 * itself on every token.
 */
export function remarkImagePaths({ resolveImage } = {}) {
  return (tree) => {
    if (typeof resolveImage !== 'function') return;
    rewriteChildren(tree, resolveImage);
  };
}

import { localImageFileName, normalizeLocalImagePath, segmentLocalImagePaths } from './local-image-path.js';

// Nodes whose text is not prose. `code` is a fenced/indented block, `html` is
// raw markup the sanitizer owns — rewriting either would corrupt real code.
// `inlineCode` is deliberately NOT skipped: models usually wrap the path in
// backticks, and a code span that contains nothing but an image path is a path,
// not code.
const SKIP_CHILDREN = new Set(['code', 'html', 'math', 'inlineMath']);

// 这个插件只把“路径”变成“带标记的图片节点”，不负责算出预览地址：
// 预览地址依赖这条消息属于哪个会话，是每个 Markdown 实例自己的事。
//
// 为什么不能把 resolveImage 作为插件选项传进来（曾经就是那么写的）：
// streamdown 用一个模块级缓存复用 unified processor，key 是
// `插件名 + JSON.stringify(选项)`，而 JSON.stringify({resolveImage: 函数}) 恒等于
// `{}` —— 于是全页所有 Markdown 共用第一个实例的 resolver，所有图片都按第一个
// 渲染行的会话去取，落到别人会话就是 403（真实故障）。渲染期的事只能在组件里做。
const IMAGE_MARKER_PREFIX = 'haish-image:';

/** `haish-image:<origin>:<encodeURIComponent(path)>` */
export function imageMarker(path, origin = 'prose') {
  return `${IMAGE_MARKER_PREFIX}${origin}:${encodeURIComponent(path)}`;
}

/** 解析 {@link imageMarker} 生成的地址；不是标记就返回 null。 */
export function parseImageMarker(url) {
  const text = String(url || '');
  if (!text.startsWith(IMAGE_MARKER_PREFIX)) return null;
  const rest = text.slice(IMAGE_MARKER_PREFIX.length);
  const split = rest.indexOf(':');
  if (split <= 0) return null;
  const origin = rest.slice(0, split);
  if (!['prose', 'code', 'image'].includes(origin)) return null;
  try {
    return { origin, path: decodeURIComponent(rest.slice(split + 1)) };
  } catch {
    return null;
  }
}

function imageNode(path, source) {
  return {
    type: 'image',
    url: imageMarker(path, source),
    alt: localImageFileName(path),
    title: path,
  };
}

function tryImage(value, source) {
  const path = normalizeLocalImagePath(value);
  if (!path) return null;
  return imageNode(path, source);
}

function rewriteChildren(node) {
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
        // 取不到预览地址时由组件把原路径原样显示回去（见 MarkdownPathImage）。
        next.push(tryImage(segment.path, 'prose') || { ...child, value: segment.value });
      }
      continue;
    }
    if (child.type === 'inlineCode') {
      const image = tryImage(child.value, 'code');
      if (image) {
        next.push(image);
        continue;
      }
    }
    if (child.type === 'image') {
      const path = normalizeLocalImagePath(child.url);
      if (path) {
        next.push({ ...child, url: imageMarker(path, 'image'), title: child.title || path });
        continue;
      }
    }
    if (!SKIP_CHILDREN.has(child.type)) rewriteChildren(child);
    next.push(child);
  }
  node.children = next;
}

/**
 * Remark plugin: turn local image paths in model prose into image nodes.
 *
 * The node only carries the path (as a marker URL); the preview URL is built by
 * `MarkdownPathImage` at render time, from the conversation the row belongs to.
 * Applied to finished answers only — a half-streamed path would rewrite itself on
 * every token.
 */
export function remarkImagePaths() {
  return (tree) => {
    rewriteChildren(tree);
  };
}

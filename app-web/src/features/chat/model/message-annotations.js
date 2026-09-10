export const ANNOTATION_LIMIT = 20;
const STORAGE_PREFIX = 'haish:message-annotations:v1:';
const EXCLUDED = 'button, input, textarea, [aria-hidden="true"], [hidden], script, style';

export function annotationError(items, message = '') {
  if (!Array.isArray(items) || items.length > ANNOTATION_LIMIT) return 'You can add up to 20 comments per message.';
  const ids = new Set();
  let size = message.length;
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 64 || ids.has(item.id)
      || typeof item.source_message_id !== 'string' || !item.source_message_id || item.source_message_id.length > 128
      || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 4000
      || typeof item.comment !== 'string' || item.comment.length > 2000
      || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > 10000000
      || typeof item.prefix !== 'string' || item.prefix.length > 64 || typeof item.suffix !== 'string' || item.suffix.length > 64) {
      return 'Invalid comment. Quotes may contain up to 4,000 characters and comments up to 2,000.';
    }
    ids.add(item.id);
    size += item.text.length + item.comment.length;
  }
  return size > 20000 ? 'Message and comments must stay within 20,000 characters.' : '';
}

export function readAnnotationDraft(storage, scope) {
  if (!scope) return [];
  try {
    const items = JSON.parse(storage?.getItem(STORAGE_PREFIX + scope) || '[]');
    return annotationError(items) ? [] : items;
  } catch { return []; }
}

export function writeAnnotationDraft(storage, scope, items) {
  if (!scope) return;
  if (items.length) storage.setItem(STORAGE_PREFIX + scope, JSON.stringify(items));
  else storage.removeItem(STORAGE_PREFIX + scope);
}

function withoutMessageAnnotations(drafts, messages) {
  // Match the full snapshot so edits made during a send remain drafts.
  const saved = new Map(messages.flatMap((m) => (m.annotations || []).map((item) => [item.id, item])));
  const next = drafts.filter((item) => {
    const ack = saved.get(item.id);
    return !ack || Object.keys(item).some((key) => item[key] !== ack[key]);
  });
  return next.length === drafts.length ? drafts : next;
}

export function withoutAcknowledgedAnnotations(drafts, messages) {
  // Only server confirmation may remove the persisted recovery copy.
  return withoutMessageAnnotations(drafts, messages.filter((m) => m.role === 'user' && m.messageId));
}

export function isSubmittedAnnotationMessage(message) {
  return message.role === 'user' && Boolean(message.messageId || message.status === 'queued' || message.status === 'running');
}

export function visibleAnnotationDrafts(drafts, messages) {
  // The optimistic message owns the submitted snapshot until confirmation.
  // An unconfirmed failure/cancellation releases it back to the composer.
  return withoutMessageAnnotations(drafts, messages.filter(isSubmittedAnnotationMessage));
}

export function locateAnnotation(text, item) {
  const contextMatches = (start, end) => (!item.prefix || text.slice(0, start).endsWith(item.prefix))
    && (!item.suffix || text.slice(end).startsWith(item.suffix));
  if (text.slice(item.start, item.end) === item.text && contextMatches(item.start, item.end)) return { start: item.start, end: item.end };
  const matches = [];
  for (let start = text.indexOf(item.text); start !== -1; start = text.indexOf(item.text, start + 1)) {
    const end = start + item.text.length;
    if (contextMatches(start, end)) matches.push({ start, end });
  }
  return matches.length === 1 ? matches[0] : null;
}

export function annotationText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest(EXCLUDED)) continue;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  return { text, nodes };
}

export function captureAnnotationSelection(container, selection = window.getSelection()) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  const source = (ancestor.nodeType === 1 ? ancestor : ancestor.parentElement)?.closest('[data-annotation-source]');
  if (!source || !container?.contains(source)) return null;
  const boundary = range.cloneRange();
  boundary.selectNodeContents(source);
  boundary.setEnd(range.startContainer, range.startOffset);
  const start = annotationText(boundary.cloneContents()).text.length;
  boundary.setEnd(range.endContainer, range.endOffset);
  const end = annotationText(boundary.cloneContents()).text.length;
  const { text } = annotationText(source);
  const quote = text.slice(start, end);
  if (!quote.trim()) return null;
  return {
    range: range.cloneRange(),
    source,
    annotation: {
      id: crypto.randomUUID(), source_message_id: source.dataset.annotationSource,
      text: quote, comment: '', start, end,
      // Context snippets must not split an emoji's UTF-16 surrogate pair.
      prefix: text.slice(Math.max(0, start - 64), start).replace(/^[\uDC00-\uDFFF]/, ''),
      suffix: text.slice(end, end + 64).replace(/[\uD800-\uDBFF]$/, ''),
    },
  };
}

export function findAnnotationRange(container, item) {
  const source = [...(container?.querySelectorAll('[data-annotation-source]') || [])]
    .find((node) => node.dataset.annotationSource === item.source_message_id);
  if (!source) return null;
  const { text, nodes } = annotationText(source);
  const match = locateAnnotation(text, item);
  if (!match) return null;
  const first = nodes.find((part) => part.end > match.start);
  const last = nodes.find((part) => part.end >= match.end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, match.start - first.start);
  range.setEnd(last.node, match.end - last.start);
  return range;
}

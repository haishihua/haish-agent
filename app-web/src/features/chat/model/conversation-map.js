import { stripInjectedSkillInstruction } from './chat-text.js';
import { localPathReference, splitPathReferenceDraft } from './path-references.js';

export const CONVERSATION_LENS_ROWS = 7;
export const CONVERSATION_LENS_ROW_HEIGHT = 18;
export const CONVERSATION_LENS_INSET = 10;
// Below 8px per turn the overview becomes hard to target; content length alone
// is not a reason to add the local lens (a few long replies still have few ticks).
export const CONVERSATION_LENS_MIN_STEP = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const previewText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// Navigation names the user's intent, not the quote's numbering or its controls.
// Image-only turns keep their count even if a thumbnail is missing/unavailable.
export function conversationTurnPreview({ text, comments = [], quotes = [], files, images = [] } = {}) {
  const title = previewText(text)
    || comments.map(previewText).filter(Boolean).join(' · ')
    || quotes.map(previewText).filter(Boolean).join(' · ')
    || previewText(files);
  if (title) return { title, thumbnails: [] };
  return {
    title: images.length ? (images.length === 1 ? 'Image' : `${images.length} images`) : 'Message',
    thumbnails: images.slice(0, 2).map((image) => String(image?.src || '').trim()),
  };
}

// Index the complete message data, not just the tail mounted by the row window.
// Mounted DOM refines Markdown titles / unavailable images without losing older turns.
export function conversationMapEntries(messages, imageUrl = (image) => image.previewUrl || '') {
  return messages.filter((message) => message.role === 'user' && message.id).map((message) => {
    const content = splitPathReferenceDraft(stripInjectedSkillInstruction(message.text));
    return {
      id: String(message.id),
      ...conversationTurnPreview({
        text: content.text,
        comments: (message.annotations || []).map((item) => item.comment),
        quotes: (message.annotations || []).map((item) => item.text),
        files: content.references.map((path) => localPathReference(path)?.name).filter(Boolean).join(' · '),
        images: (message.images || []).filter((image) => image && (image.path || image.previewUrl))
          .map((image) => ({ src: imageUrl(image, message.conversationId) })),
      }),
    };
  });
}

export function conversationMapGeometry(count, height) {
  const step = count > 0 ? Math.min(14, height / count) : 0;
  return {
    step,
    origin: Math.max(0, (height - count * step) / 2),
    stride: Math.max(1, Math.ceil(count / Math.max(1, Math.floor(height / 4)))),
  };
}

export function conversationMapNeedsLens(count, height) {
  return count > CONVERSATION_LENS_ROWS && height > 0 && height / count < CONVERSATION_LENS_MIN_STEP;
}

export function conversationLensWindow(count, index) {
  const size = Math.min(CONVERSATION_LENS_ROWS, count);
  return { start: clamp(index - Math.floor(size / 2), 0, Math.max(0, count - size)), size };
}

export function conversationLensTop(index, start, size, anchorY, bounds) {
  const height = size * CONVERSATION_LENS_ROW_HEIGHT + CONVERSATION_LENS_INSET * 2;
  const desired = anchorY - CONVERSATION_LENS_INSET - (index - start + 0.5) * CONVERSATION_LENS_ROW_HEIGHT;
  return clamp(desired, bounds.top + 8, Math.max(bounds.top + 8, bounds.bottom - height - 8));
}

// A turn continues through its assistant reply, until the next user message.
// Do not filter user rows to the viewport before finding the current turn: inside
// a long reply its user row is off screen, but that turn is still being read.
export function conversationTurnView(turns, viewport, atEnd = false) {
  if (!turns.length) return { activeId: '', visibleIds: [] };
  // Read the turn covering the viewport centre; centring a jump must select
  // that turn, not the preceding reply whose tail remains above it.
  const readingLine = viewport.top + viewport.height / 2 + 1;
  let activeId = '';
  const visibleIds = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    const end = turns[index + 1]?.top ?? Infinity;
    if (turn.top <= readingLine) activeId = turn.id;
    if (turn.top < viewport.bottom && end > viewport.top) visibleIds.push(turn.id);
  }
  if (atEnd) activeId = turns.at(-1).id;
  return { activeId, visibleIds };
}

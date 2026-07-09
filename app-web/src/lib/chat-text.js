// @haish-esm
// Leaf text helpers (no imports from other lib modules).

export function stripChatImageAugmentation(value) {
  const raw = String(value || '');
  const imageRefs = [];
  const withoutMarkers = raw.replace(/^\s*\[user attached image #(\d+):\s*([^\]]+)\]\s*$/gim, (_match, index, path) => {
    const cleanPath = String(path || '').trim();
    if (cleanPath) {
      imageRefs.push({
        image_id: `restored-image-${index}-${cleanPath}`,
        path: cleanPath,
        mime: null,
      });
    }
    return '';
  });
  const hintIndex = withoutMarkers.search(/\n*\s*The user attached the image\(s\) above\./i);
  const text = (hintIndex >= 0 ? withoutMarkers.slice(0, hintIndex) : withoutMarkers)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, imageRefs };
}

export function eventDeltaText(event) {
  return String(
    event?.delta
    ?? event?.text
    ?? event?.contentDelta
    ?? event?.content_delta
    ?? event?.content
    ?? event?.message
    ?? event?.data?.delta
    ?? event?.data?.text
    ?? event?.payload?.delta
    ?? event?.payload?.text
    ?? ''
  );
}

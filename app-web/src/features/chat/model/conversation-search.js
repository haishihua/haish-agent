// Search rendered text, so Markdown delimiters and hidden source do not create phantom hits.
export function collectConversationMatches(container, query) {
  const needle = query.trim();
  if (!container || !needle) return [];
  const matches = [];
  for (const block of container.querySelectorAll('.chat-bubble-text, .chat-timeline-text-body')) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = '';
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('button, [aria-hidden="true"], script, style')) continue;
      nodes.push({ node, start: text.length, end: text.length + node.length });
      text += node.data;
    }
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of text.matchAll(new RegExp(escaped, 'giu'))) {
      const start = match.index;
      const end = start + match[0].length;
      const first = nodes.find((part) => part.end > start);
      const last = nodes.find((part) => part.end >= end);
      const range = document.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      matches.push({ range, before: text.slice(Math.max(0, start - 28), start), match: match[0], after: text.slice(end, end + 40) });
    }
  }
  return matches;
}

export function scrollToConversationMatch(container, range) {
  if (!container || !range?.startContainer.isConnected) return;
  const rect = range.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  container.scrollBy({ top: rect.top - viewport.top - viewport.height / 2 + rect.height / 2, behavior: 'instant' });
}

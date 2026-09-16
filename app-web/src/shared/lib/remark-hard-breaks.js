// CommonMark treats a single "\n" inside a paragraph as a soft break, and HTML
// then collapses it into a space. The composer keeps the line structure the user
// typed (Shift+Enter), so a multi-line prompt used to render as one continuous,
// re-wrapped paragraph as soon as it was sent. Turn those soft breaks into hard
// breaks so user-authored text reads the way it was written — the same treatment
// `white-space: pre-wrap` already gives the other user-typed bubbles.
const SKIP_CHILDREN = new Set(['code', 'inlineCode', 'html', 'math', 'inlineMath']);

/** Split every soft break in `tree` into an explicit `break` node, in place. */
export function splitSoftBreaks(tree) {
  if (!tree || typeof tree !== 'object') return;
  const children = Array.isArray(tree.children) ? tree.children : null;
  if (!children || SKIP_CHILDREN.has(tree.type)) return;
  const next = [];
  for (const child of children) {
    const value = child?.type === 'text' ? child.value : null;
    if (typeof value === 'string' && value.includes('\n')) {
      value.split('\n').forEach((line, index) => {
        if (index > 0) next.push({ type: 'break' });
        if (line) next.push({ ...child, value: line });
      });
      continue;
    }
    splitSoftBreaks(child);
    next.push(child);
  }
  tree.children = next;
}

/** Remark plugin: markdown line breaks stay visible instead of folding into spaces. */
export function remarkHardBreaks() {
  return (tree) => {
    splitSoftBreaks(tree);
  };
}

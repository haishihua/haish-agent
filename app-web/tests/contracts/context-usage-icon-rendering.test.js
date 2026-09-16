import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { contextSectorPath } from '../../src/shared/lib/context-usage-ring.js';

// Regression: the context meter's filled sector used to be painted with
// `background: conic-gradient(#fff var(--context-used), transparent 0)` on
// `.context-usage-icon::after`. Chromium rasterizes a conic stop boundary
// without coverage antialiasing, so the moving radius edge snapped to whole
// pixels — measured pixel just outside the edge stayed exactly background at
// every subpixel offset — and the two collinear radii landed on different pixel
// columns, leaving the straight edge stepped sideways in its lower half ("一半
// 发糊、不光滑"). The sector is now one SVG path, which the SVG rasterizer
// antialiases at every ratio and subpixel position.
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const delegationStyles = readFileSync(new URL('../../styles/delegation.css', import.meta.url), 'utf8');
const chatPanel = readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const taskDelegation = readFileSync(new URL('../../src/features/tasks/components/TaskDelegation.jsx', import.meta.url), 'utf8');

const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (source, selector) => {
  const stripped = withoutComments(source);
  const start = stripped.indexOf(selector);
  return start < 0 ? '' : stripped.slice(start, stripped.indexOf('}', start) + 1);
};
/** Selectors of the rules whose declarations contain `needle`. */
const selectorsUsing = (source, needle) => {
  const stripped = withoutComments(source);
  const found = [];
  for (let index = stripped.indexOf(needle); index >= 0; index = stripped.indexOf(needle, index + 1)) {
    const open = stripped.lastIndexOf('{', index);
    if (open < stripped.lastIndexOf('}', index)) continue;
    found.push(stripped.slice(Math.max(stripped.lastIndexOf('}', open), stripped.lastIndexOf('{', open - 1)) + 1, open).trim());
  }
  return found;
};

test('the context meter sector is a vector path, not a conic gradient', () => {
  const gradients = [...selectorsUsing(chatStyles, 'conic-gradient'), ...selectorsUsing(delegationStyles, 'conic-gradient')];
  assert.deepEqual(gradients.filter((selector) => /context-usage/.test(selector)), [], 'conic stop boundaries are rasterized without coverage antialiasing');
  assert.doesNotMatch(withoutComments(chatStyles), /--context-used/, 'the gradient stop variable has no consumer left');
  assert.match(rule(chatStyles, '.chat-composer .context-usage-icon-sector'), /fill:\s*#fff/, 'the used part stays white in the chat composer');
  assert.match(
    rule(chatStyles, '.chat-composer .context-usage-btn.over-limit .context-usage-icon-sector'),
    /fill:\s*#ef5b5b/,
    'over-limit keeps painting the sector red',
  );
  assert.match(rule(chatStyles, '.chat-composer .context-usage-icon-sector'), /\.task-delegation \.context-usage-icon-sector/, 'the delegation composer shares the same rule');
});

test('both composers draw the sector from the shared path helper', () => {
  for (const [name, source] of [['ChatPanel', chatPanel], ['TaskDelegation', taskDelegation]]) {
    assert.match(source, /import \{ contextSectorPath \} from '\.\.\/\.\.\/\.\.\/shared\/lib\/context-usage-ring\.js'/, `${name} imports the shared helper`);
    assert.match(source, /const contextSector = contextSectorPath\(visibleContextRatio\)/, `${name} derives the path from the visible ratio`);
    assert.match(source, /<path className="context-usage-icon-sector" d=\{contextSector\} \/>/, `${name} renders the sector path`);
  }
});

test('sector geometry covers the progress from 12 o\'clock clockwise', () => {
  assert.equal(contextSectorPath(0), '');
  assert.equal(contextSectorPath(-1), '');
  assert.equal(contextSectorPath(undefined), '');
  // Radius 7.2 = the 60% inner disc the conic gradient used to clip to.
  assert.equal(contextSectorPath(0.25), 'M12 12 L12 4.8 A7.2 7.2 0 0 1 19.2 12 Z');
  assert.equal(contextSectorPath(0.5), 'M12 12 L12 4.8 A7.2 7.2 0 0 1 12 19.2 Z');
  assert.equal(contextSectorPath(0.75), 'M12 12 L12 4.8 A7.2 7.2 0 1 1 4.8 12 Z');
  // A full turn needs two half arcs: one arc whose ends coincide draws nothing.
  assert.equal(
    contextSectorPath(1),
    'M12 4.8 A7.2 7.2 0 1 1 12 19.2 A7.2 7.2 0 1 1 12 4.8 Z',
  );
  assert.equal(contextSectorPath(1.4), contextSectorPath(1), 'over-limit clamps to a full disc');
});

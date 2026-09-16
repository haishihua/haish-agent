import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: "the orb freezes when I switch conversations" (intermittent, and permanent
// once it hits). thinking-orbs stops its rAF loop when the canvas is not intersecting or the
// page is hidden, and only resumes when its own bookkeeping agrees - a conversation switch
// that re-lays out the message list while the window is in the background can leave that
// bookkeeping stale, and a draw that throws kills the loop outright. The app cannot restart
// the library's loop, but it can remount the orb, so `<ActivityOrb>` wraps the library call
// with a liveness watchdog instead of rendering `<ThinkingOrb>` directly.
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const liveness = readFileSync(new URL('../../src/features/chat/model/orb-liveness.js', import.meta.url), 'utf8');
const activityOrb = readFileSync(new URL('../../src/features/chat/components/ActivityOrb.jsx', import.meta.url), 'utf8');
const timelineNodes = readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');

test('the activity orb is rendered through the guarded wrapper', () => {
  assert.match(timelineNodes, /<ActivityOrb\b/);
  assert.doesNotMatch(timelineNodes, /<ThinkingOrb\b/);
  assert.match(timelineNodes, /import \{ ActivityOrb \} from '\.\/ActivityOrb\.jsx';/);
});

test('the library is only reachable from the wrapper', () => {
  assert.match(activityOrb, /from 'thinking-orbs'/);
  assert.doesNotMatch(timelineNodes, /from 'thinking-orbs'/);
});

test('a stuck canvas is revived by remounting the library component', () => {
  assert.match(activityOrb, /<ThinkingOrb key=\{generation\} \{\.\.\.props\} \/>/);
  assert.match(activityOrb, /if \(result\.revive\) setGeneration\(\(value\) => value \+ 1\);/);
  assert.match(activityOrb, /const \[generation, setGeneration\] = React\.useState\(0\);/);
});

test('the watchdog only judges a canvas that is on screen in a visible window', () => {
  assert.match(activityOrb, /const visible = document\.visibilityState !== 'hidden';/);
  assert.match(activityOrb, /const onScreen = isOnScreen\(canvas\);/);
  // Off screen, hidden or unreadable samples must come back as "no signature" so the sampler
  // resets instead of counting them as frozen frames - and so a window nobody can see (or a
  // still frame the user asked for) does not cost a canvas readback every 400ms.
  assert.match(
    activityOrb,
    /const signature = onScreen && visible && !reducedMotion \? hashCanvasPixels\(canvas\) : null;/,
  );
  assert.match(liveness, /if \(!onScreen \|\| !visible \|\| stillFrameWanted \|\| signature === null\)/);
});

test('reduced motion stands both restart triggers down', () => {
  // The library's only intended still frame: it draws once and never starts a loop, so a
  // still canvas must not read as a freeze - neither to the pixel watchdog nor to the
  // return-from-hidden restart. The preference itself has one definition for the whole app.
  assert.match(activityOrb, /import \{ prefersReducedMotion \} from '\.\.\/\.\.\/\.\.\/shared\/lib\/reduced-motion\.js';/);
  assert.doesNotMatch(activityOrb, /function prefersReducedMotion\(\)/, 'the query must not be copied per component');
  assert.match(activityOrb, /const reducedMotion = prefersReducedMotion\(\);/);
  assert.match(activityOrb, /if \(document\.visibilityState === 'hidden' \|\| prefersReducedMotion\(\)\) return;/);
  assert.match(liveness, /const stillFrameWanted = sample\?\.reducedMotion === true;/);
});

test('returning from a hidden window restarts the orb, hiding it does not', () => {
  assert.match(activityOrb, /const onVisibilityChange = \(\) => \{\s*if \(document\.visibilityState === 'hidden' \|\| prefersReducedMotion\(\)\) return;\s*setGeneration\(\(value\) => value \+ 1\);\s*\};/);
  assert.match(activityOrb, /document\.addEventListener\('visibilitychange', onVisibilityChange\);/);
  assert.match(activityOrb, /document\.removeEventListener\('visibilitychange', onVisibilityChange\);/);
});

test('the quiet window sits above the frame cadence of every preset', () => {
  assert.match(liveness, /export const ORB_LIVENESS_SAMPLE_MS = 400;/);
  assert.match(liveness, /export const ORB_LIVENESS_STUCK_SAMPLES = 4;/);
  // The window itself (400ms * 4 >= 1s) is asserted numerically in
  // tests/features/chat/orb-liveness.test.js.
});

test('the wrapper stays layout-transparent for .chat-timeline-activity', () => {
  assert.match(activityOrb, /style=\{\{ display: 'contents' \}\}/);
  // A `> canvas` rule would stop matching once the host span is in between.
  assert.doesNotMatch(chatStyles, /\.chat-timeline-activity\s*>\s*canvas/);
});

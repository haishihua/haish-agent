import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `prefers-reduced-motion` is read in four places (the orb watchdog, the composer beam, the
// metal title, the penguin gestures). Four copies of the query string means one typo silently
// ignores the setting - the app would animate for someone who asked it not to - so the query
// lives in one module and every guard imports it.
const sourceRoot = fileURLToPath(new URL('../../src', import.meta.url));
const QUERY_LITERAL = "'(prefers-reduced-motion: reduce)'";

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.jsx?$/.test(entry)) found.push(path);
  }
  return found;
}

test('the reduced-motion query is written down exactly once', () => {
  const files = sourceFiles(sourceRoot);
  assert.ok(files.length > 100, 'the scan has to see the real source tree');
  const hits = files.filter((file) => readFileSync(file, 'utf8').includes(QUERY_LITERAL));

  assert.equal(hits.length, 1, `one definition, found: ${hits.join(', ')}`);
  assert.match(hits[0], /src\/shared\/lib\/reduced-motion\.js$/);
});

test('every motion guard reads the shared query instead of its own copy', () => {
  const consumers = [
    'features/chat/components/ActivityOrb.jsx',
    'features/chat/components/PenguinCards.jsx',
    'features/app/components/TopBar.jsx',
    'shared/ui/MotionEffects.jsx',
  ];

  for (const relative of consumers) {
    const source = readFileSync(join(sourceRoot, relative), 'utf8');
    assert.match(source, /from '[^']*reduced-motion\.js';/, `${relative} imports the shared query`);
    assert.doesNotMatch(source, /prefers-reduced-motion/, `${relative} must not spell the query out again`);
  }
});

test('the shared guard reports the live preference, never a cached one', () => {
  const source = readFileSync(join(sourceRoot, 'shared/lib/reduced-motion.js'), 'utf8');
  assert.match(source, /export function prefersReducedMotion\(\) \{/);
  assert.match(source, /window\.matchMedia\?\.\(REDUCED_MOTION_QUERY\)\?\.matches === true/);
  assert.doesNotMatch(source, /useState|useRef|cache/i, 'the setting can change while the app is running');
});

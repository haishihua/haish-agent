import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: the settings pane used to fall back to a bare
// `<div role="status">Loading settings…</div>` — unstyled body text parked in the
// top-left corner of an otherwise empty window. It now renders the assistant-ui
// Elements Loader: a 3x3 pixel matrix with a moving band and a shimmering label,
// centered in the pane. The label keeps the existing wording but must use the app's
// body font (`--conversation-font`, the chat text face), because `body` itself is
// the pixel font `Zpix` and inheriting would render the label as blocky bitmap text.
const appShell = readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const loaderSource = readFileSync(new URL('../../src/shared/ui/agent-elements/LoadingState.jsx', import.meta.url), 'utf8');
const loaderStyles = readFileSync(new URL('../../src/shared/ui/agent-elements/loading-state.css', import.meta.url), 'utf8');
const shellStyles = readFileSync(new URL('../../styles/app-shell.css', import.meta.url), 'utf8');

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const loaderDeclarations = stripComments(loaderStyles);

test('the settings fallback renders the loader instead of bare text', () => {
  assert.match(
    appShell,
    /<React\.Suspense fallback=\{<div className="app-body-loading"><LoadingState role="status" label="Loading settings…" \/><\/div>\}/,
    'the settings Suspense fallback must render LoadingState',
  );
  assert.doesNotMatch(
    appShell,
    /<React\.Suspense fallback=\{<div role="status">Loading settings…<\/div>\}/,
    'the unstyled text fallback must stay gone',
  );
  assert.match(appShell, /import \{ LoadingState \} from '\.\.\/\.\.\/shared\/ui\/agent-elements\/LoadingState\.jsx';/);
});

test('the fallback is centered in the settings pane', () => {
  const rule = shellStyles.match(/\.app-body-loading\s*\{([^}]*)\}/);
  assert.ok(rule, 'the centering wrapper needs a rule');
  assert.match(rule[1], /display:\s*grid/);
  assert.match(rule[1], /place-items:\s*center/, 'a centered loader is the whole point of the change');
  assert.match(rule[1], /grid-column:\s*1\s*\/\s*-1/, 'the pane is a single-column grid');
});

test('the loader keeps the upstream nine-cell band', () => {
  // assistant-ui: pixelOffset = floor(tick / 3); lit = (index * 2 + pixelOffset) % 9 < 3
  assert.match(loaderSource, /const pixelOffset = Math\.floor\(tick \/ 3\)/, 'the moving band must advance every three ticks');
  assert.match(loaderSource, /length:\s*9/, 'the matrix is nine cells');
  assert.match(loaderSource, /\(index \* 2 \+ pixelOffset\) % 9 < 3/, 'the band shape must stay upstream-identical');
  assert.match(loaderSource, /LOADER_TICK_MS = 120/, 'the docs drive the clock at 120ms');
  assert.doesNotMatch(loaderSource, /setTimeout\(/, 'the tick must be a steady interval');
  // Standalone mounting owns the clock and must stop it on unmount.
  assert.match(loaderSource, /window\.setInterval\(/, 'LoadingState ticks itself');
  assert.match(loaderSource, /return \(\) => window\.clearInterval\(id\)/, 'the interval must be cleared');
});

test('the loader label uses the app body font, not the pixel font', () => {
  assert.match(
    loaderDeclarations,
    /\.aui-loader\s*\{[^}]*font-family:\s*var\(--conversation-font/,
    'the label must ask for the conversation font explicitly (body is the Zpix pixel font)',
  );
  // Upstream utilities: size-2 cells, gap-1, text-sm, shimmer.
  const grid = loaderDeclarations.match(/\.aui-loader-grid\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(grid, /grid-template-columns:\s*repeat\(3,\s*8px\)/);
  assert.match(grid, /gap:\s*4px/);
  const cell = loaderDeclarations.match(/\.aui-loader-cell\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(cell, /width:\s*8px/);
  assert.match(cell, /transition:\s*opacity 300ms/);
  assert.match(loaderDeclarations, /\.aui-loader-cell\.is-lit\s*\{\s*opacity:\s*\.9/);
  assert.match(loaderDeclarations, /\.aui-loader-label\s*\{[^}]*font-size:\s*14px/, 'upstream `text-sm`');
  assert.match(loaderDeclarations, /background-clip:\s*text/, 'the label shimmers');
});

test('the animation respects reduced motion', () => {
  const reduced = loaderDeclarations.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}/)?.[1] || '';
  assert.match(reduced, /\.aui-loader-label\s*\{[^}]*animation:\s*none/);
  assert.match(reduced, /-webkit-text-fill-color:\s*currentColor/, 'without the sweep the label must stay visible');
});

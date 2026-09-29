import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: answer tables had to be scrolled before the whole cell content was
// visible. Three separate rules squeezed them, and all three are needed for the fix:
//
//   1. Streamdown caps a table at 300px by default (`tableMaxHeight`), so a table with
//      a few rows became an inner scroll box. macOS overlay scrollbars stay hidden
//      until the user scrolls, so the table simply looked like it was missing rows.
//      `0` disables the cap (upstream: "Set to `0` or `Infinity` to disable").
//   2. Our prose rules (`word-break: break-all` on inline code, `overflow-wrap:
//      anywhere` inherited from `.haish-markdown`) also shrink a table cell's
//      min-content width to a single character, so the browser was free to break
//      `app-web/src/features/chat/model/conversation-loading.js` mid-token and to lay the
//      table out narrower than its content.
//   3. The bubble width cap (user 680px / assistant 960px) applied to the message, so
//      the table could never use the message column even on a wide window.
//
// Geometry is covered by the browser fixture `tests/fixtures/markdown-table-layout.*`
// (a real Streamdown render at 1400px). This test only locks the source shapes.
//
// The same min-content rule also stacked a short, English-only column one letter per line:
// a report table whose first column held nothing but `**pi**` / `**opencode**` / `**codex**` /
// `**Hermes**` came out 36–53px wide at real column widths, so every name wrapped character by
// character (the missing header was only the reason that column had no label, not the reason it
// was squeezed). The override therefore covers the cells themselves, not just the inline code
// inside them; geometry for that case lives in `tests/fixtures/markdown-table-column-squeeze.*`.
const markdownSource = readFileSync(new URL('../../src/shared/ui/Markdown.jsx', import.meta.url), 'utf8');
const markdownStyles = readFileSync(new URL('../../styles/markdown.css', import.meta.url), 'utf8');
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const fixtureHtml = readFileSync(new URL('../fixtures/markdown-table-layout.html', import.meta.url), 'utf8');
const fixtureModule = readFileSync(new URL('../fixtures/markdown-table-layout.jsx', import.meta.url), 'utf8');
const squeezeHtml = readFileSync(new URL('../fixtures/markdown-table-column-squeeze.html', import.meta.url), 'utf8');
const squeezeModule = readFileSync(new URL('../fixtures/markdown-table-column-squeeze.jsx', import.meta.url), 'utf8');

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const markdownDeclarations = stripComments(markdownStyles);
const chatDeclarations = stripComments(chatStyles);

/** At-rule preludes (@scope, @layer, ...) wrapping the byte at `index`. */
function enclosingAtRules(source, index) {
  const openers = [];
  const stack = [];
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '{') {
      let start = i - 1;
      while (start >= 0 && !';{}'.includes(source[start])) start -= 1;
      openers.push(source.slice(start + 1, i).trim());
      stack.push(openers.length - 1);
    } else if (source[i] === '}') {
      stack.pop();
    }
  }
  return stack.map((position) => openers[position]);
}

/** The declaration block of the first rule whose selector list matches `selector`. */
function ruleBlock(source, selector) {
  const index = source.indexOf(selector);
  assert.ok(index > 0, `expected a rule containing \`${selector}\``);
  return { index, block: source.slice(index, source.indexOf('}', index) + 1) };
}

test('tables are not capped to a fixed height', () => {
  assert.match(
    markdownSource,
    /tableMaxHeight=\{0\}/,
    'upstream defaults tables to a 300px scroll box; `0` disables the cap',
  );
  assert.equal(
    markdownSource.match(/tableMaxHeight/g).length,
    1,
    'a second tableMaxHeight prop would make which cap applies ambiguous',
  );
  assert.match(markdownSource, /codeBlockMaxHeight=\{320\}/, 'only tables changed: code blocks keep their cap');
});

test('table cells keep whole code tokens so columns reflect their content', () => {
  const { index, block } = ruleBlock(
    markdownDeclarations,
    '[data-streamdown="table-header-cell"] [data-streamdown="inline-code"]',
  );
  assert.match(block, /\[data-streamdown="table-cell"\] \[data-streamdown="inline-code"\]/, 'body cells need it too');
  assert.match(block, /word-break:\s*normal/, 'break-all is what splits a path mid-token');
  // `overflow-wrap: anywhere` (set on .haish-markdown) also feeds min-content sizing,
  // so it has to be written back explicitly or the column can still be squeezed.
  assert.match(block, /overflow-wrap:\s*break-word/, 'anywhere inherits and keeps shrinking the column');
  const chain = enclosingAtRules(markdownDeclarations, index);
  const scope = chain.find((prelude) => prelude.startsWith('@scope (.haish-markdown'));
  assert.ok(scope, `the rule must stay scoped to the markdown container, saw ${JSON.stringify(chain)}`);
  assert.match(scope, /\[data-streamdown\$="-fullscreen"\]/, 'fullscreen tables are markdown tables too');
  assert.ok(
    !chain.some((prelude) => prelude.startsWith('@layer')),
    `unlayered rules beat every layer; inside a layer Tailwind decides again, saw ${JSON.stringify(chain)}`,
  );
  assert.match(
    markdownDeclarations,
    /\[data-streamdown="inline-code"\]\s*\{[^}]*word-break:\s*break-all/,
    'the prose rule this override exists for must still be there',
  );
});

test('a short text column cannot be squeezed to one letter per line', () => {
  // Without a rule on the cells themselves, `overflow-wrap: anywhere` (inherited from
  // `.haish-markdown`) feeds min-content sizing and a column holding nothing but `opencode`
  // can be laid out one character wide — the table is `w-full`, so long neighbouring columns
  // take the rest and the browser shrinks this one to its minimum.
  const { index, block } = ruleBlock(markdownDeclarations, '[data-streamdown="table-header-cell"],');
  assert.match(block, /\[data-streamdown="table-cell"\],/, 'body cells carry the reported names');
  assert.match(block, /word-break:\s*normal/, 'break-all is what stacks one letter per line');
  assert.match(block, /overflow-wrap:\s*break-word/, 'anywhere inherits and keeps shrinking the column');
  const chain = enclosingAtRules(markdownDeclarations, index);
  const scope = chain.find((prelude) => prelude.startsWith('@scope (.haish-markdown'));
  assert.ok(scope, `the rule must stay scoped to the markdown container, saw ${JSON.stringify(chain)}`);
  assert.ok(
    !chain.some((prelude) => prelude.startsWith('@layer')),
    `unlayered rules beat every layer; inside a layer Tailwind decides again, saw ${JSON.stringify(chain)}`,
  );
  assert.match(
    markdownDeclarations,
    /\.haish-markdown,\s*\[data-streamdown\$="-fullscreen"\]\s*\{[^}]*overflow-wrap:\s*anywhere/,
    'the inherited rule this override exists for must still be there',
  );
});

test('a message carrying a table may use the whole message column', () => {
  const { block } = ruleBlock(
    chatDeclarations,
    '.chat-message-row .chat-bubble:has([data-streamdown="table-wrapper"])',
  );
  assert.match(block, /max-width:\s*100%/, 'the bubble has to grow to the message column for wide tables');
  assert.match(
    block,
    /\.chat-message-row\.agent \.chat-bubble:has\(\[data-streamdown="table-wrapper"\]\)/,
    'assistant messages (960px cap) are the case that was reported',
  );
  // The narrow caps stay for every other message; the exemption is table-only.
  assert.match(chatDeclarations, /\.chat-bubble \{\s*max-width:\s*min\(680px, 72%\)/, 'user bubble cap unchanged');
  assert.match(
    chatDeclarations,
    /\.chat-message-row\.agent \.chat-bubble \{\s*max-width:\s*min\(960px, 82%\)/,
    'assistant bubble cap unchanged',
  );
});

test('the browser fixture renders the real component against the real stylesheet', () => {
  assert.match(fixtureHtml, /src="\.\/markdown-table-layout\.jsx"/, 'fixture HTML must load its module');
  assert.match(fixtureModule, /import \{ Markdown \} from '\.\.\/\.\.\/src\/shared\/ui\/Markdown\.jsx'/);
  assert.match(
    fixtureModule,
    /import '\.\.\/\.\.\/styles\/chat\.css'/,
    'bubble geometry needs the real chat stylesheet',
  );
  // The fixture must measure the scroll box Streamdown wraps around <table>, i.e. the
  // element that used to carry the 300px cap.
  assert.match(fixtureModule, /\[data-streamdown="table-wrapper"\] > div:last-child/);
  assert.match(fixtureModule, /getClientRects\(\)\.length === 1/, 'whole-token check must stay geometry-based');
});

test('the squeeze fixture renders the reported table against the real stylesheet', () => {
  assert.match(squeezeHtml, /src="\.\/markdown-table-column-squeeze\.jsx"/, 'fixture HTML must load its module');
  assert.match(squeezeModule, /import \{ Markdown \} from '\.\.\/\.\.\/src\/shared\/ui\/Markdown\.jsx'/);
  assert.match(
    squeezeModule,
    /import '\.\.\/\.\.\/styles\/chat\.css'/,
    'column widths depend on the real bubble geometry',
  );
  assert.match(squeezeModule, /opencode/, 'the reported table (first column = implementation names) must stay');
  assert.match(squeezeModule, /getClientRects\(\)/, 'the one-line-per-name check must be geometry-based');
  assert.match(
    squeezeModule,
    /word-break: break-all !important; overflow-wrap: anywhere !important;/,
    'the reverse check must inject the pre-fix rules',
  );
});

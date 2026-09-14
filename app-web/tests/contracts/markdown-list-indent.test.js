import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Regression: list items used to render with a hanging indent, so a wrapped line
// started under the first line's text. After Markdown moved to Streamdown the lists
// picked up Tailwind's `list-inside` (`list-style-position: inside`): the marker is
// laid out inline with the first line, and the wrapped lines fall back to the
// item's left edge — i.e. under the bullet, visibly out of line with the text above.
// The fix puts the marker outside the text column again and pays for it with a left
// padding, so every line of an item shares one left edge (measured in a real
// Electron render: first line to wrapped line delta went from 19-23px to 0px).
const markdownStyles = readFileSync(new URL('../../styles/markdown.css', import.meta.url), 'utf8');
const stylesDir = new URL('../../styles/', import.meta.url);

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = stripComments(markdownStyles);

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

const listRuleStart = declarations.indexOf('[data-streamdown="unordered-list"]');
const listRule = declarations.slice(listRuleStart, declarations.indexOf('}', listRuleStart) + 1);

test('list markers hang outside the text column', () => {
  assert.ok(listRuleStart > 0, 'the list indent rule must exist');
  assert.match(listRule, /\[data-streamdown="ordered-list"\]/, 'ordered lists wrap too');
  assert.match(listRule, /list-style-position:\s*outside/, 'inside markers make wrapped lines fall back to the bullet column');
  const padding = Number(listRule.match(/padding-left:\s*([\d.]+)em/)?.[1]);
  assert.ok(padding > 0, 'outside markers need a left padding to hang in');
});

test('the override is unlayered, so it beats Tailwind\'s list-inside utility', () => {
  const chain = enclosingAtRules(declarations, listRuleStart);
  assert.ok(
    chain.some((prelude) => prelude.startsWith('@scope (.haish-markdown)')),
    `the rule must stay scoped to the markdown container, saw ${JSON.stringify(chain)}`,
  );
  // Tailwind layers its utilities (`@layer utilities`), and unlayered rules win
  // over every layer regardless of specificity — moving this into a layer would
  // silently hand the decision back to `list-inside`.
  assert.ok(
    !chain.some((prelude) => prelude.startsWith('@layer')),
    `the rule must not live inside a cascade layer, saw ${JSON.stringify(chain)}`,
  );
});

test('no app stylesheet re-introduces inside markers in rendered Markdown', () => {
  const offenders = readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .filter((name) => /list-style-position:\s*inside/.test(stripComments(readFileSync(new URL(name, stylesDir), 'utf8'))));
  assert.deepEqual(offenders, [], 'an `inside` marker rule would break the wrap alignment again');
});

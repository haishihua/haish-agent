import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const stylesDir = new URL('../../styles/', import.meta.url);
const baseStyles = fs.readFileSync(new URL('base.css', stylesDir), 'utf8');
const componentStyleFiles = [
  '../../src/features/chat/components/message-annotations.css',
  '../../src/features/settings/settings.css',
  '../../src/shared/ui/agent-elements/quote.css',
].map((relative) => ({ file: relative, css: fs.readFileSync(new URL(relative, import.meta.url), 'utf8') }));

test('keyboard focus outlines are suppressed globally', () => {
  // Chromium paints the default focus ring with the macOS accent colour (orange on
  // this machine) and the themed rings elsewhere were inconsistent, so the app
  // removes every focus outline in one place.
  const rule = baseStyles.match(/:focus,\s*\n:focus-visible\s*\{([^}]+)\}/);
  assert.ok(rule, 'base.css must suppress focus outlines');
  assert.match(rule[1], /outline:\s*none\s*!important/);
});

test('the suppression has to outrank the per-component focus rings', () => {
  // `.message-turn-action:focus-visible { outline: 2px solid var(--gold) }` and
  // friends have higher specificity than a bare `:focus-visible`, so dropping the
  // `!important` silently brings the reported rings back.
  const withOutline = componentStyleFiles.filter(({ css }) => /:focus-visible\s*\{[^}]*outline:\s*(?!none)/.test(css));
  assert.ok(withOutline.length > 0, 'per-component outline rules are why !important is required');
});

test('no stylesheet forces an outline back on', () => {
  const sheets = [
    ...[...fs.readdirSync(stylesDir)].filter((name) => name.endsWith('.css')).map((name) => ({ file: path.join('styles', name), css: fs.readFileSync(new URL(name, stylesDir), 'utf8') })),
    ...componentStyleFiles,
  ];
  for (const { file, css } of sheets) {
    for (const declaration of css.matchAll(/outline:[^;]*!important/g)) {
      assert.equal(declaration[0].replace(/\s+/g, ' ').trim(), 'outline: none !important', `${file} must not force an outline on`);
    }
  }
});

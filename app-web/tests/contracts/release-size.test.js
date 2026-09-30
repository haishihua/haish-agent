import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('package.json')).build;
const vite = read('vite.app-web.config.ts');

test('macOS release keeps the four approved Electron locales', () => {
  assert.deepEqual(config.mac.electronLanguages, ['en', 'en_GB', 'zh_CN', 'zh_TW']);
});

test('runtime artwork uses lossless WebP copies while PNG originals remain available', () => {
  const cards = read('app-web/src/features/chat/components/PenguinCards.jsx');
  for (const name of ['hug', 'relax', 'sleepy']) {
    for (const layer of ['card', 'plate', 'smooth']) {
      const base = `app-web/assets/ui/empty-state/penguin-${name}-${layer}`;
      const png = fs.readFileSync(new URL(`../../../${base}.png`, import.meta.url));
      const webp = fs.readFileSync(new URL(`../../../${base}.webp`, import.meta.url));
      assert.equal(webp.subarray(0, 4).toString(), 'RIFF');
      assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
      assert.ok(webp.length < png.length);
      if (layer === 'card') assert.ok(vite.includes(`ui/empty-state/penguin-${name}-card.webp`));
      else assert.ok(cards.includes(`penguin-${name}-${layer}.webp`));
    }
  }
  assert.match(cards, /src=\{`assets\/ui\/empty-state\/penguin-\$\{card\.name\}-card\.webp`\}/);
  assert.doesNotMatch(vite, /penguin-[\w-]+\.png/);
  for (const file of ['AppShell.jsx', 'components/TopBar.jsx']) {
    assert.ok(read(`app-web/src/features/app/${file}`).includes('assets/ui/penguin_logo_user.png'));
  }
});

test('Dock and renderer share the original PNG in packaged and development paths', () => {
  assert.ok(!config.files.includes('build/icon.png'));
  assert.match(read('src/main/main.ts'), /app\.isPackaged \? 'dist' : '\.'/);
  assert.match(read('src/main/main.ts'), /'assets', 'ui', 'penguin_logo_user\.png'/);
  assert.ok(vite.includes('ui/penguin_logo_user.png'));
});

test('retired icon CSS no longer pulls unused images into release assets', () => {
  const css = read('app-web/styles/base.css');
  for (const name of ['background-process', 'color-palette', 'deploy', 'mobile-message', 'pen-field', 'task-filter']) {
    assert.ok(!css.includes(`.ico-${name} {`));
    assert.ok(!css.includes(`icons/${name}.png`));
  }
  assert.match(css, /\.ico-trash\s*\{/);
  assert.match(css, /\.ico-multiple\s*\{/);
});

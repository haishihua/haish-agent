import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';

test('local builds preserve live chunks; release builds clean a separate directory', async () => {
  const local = await loadConfigFromFile({ command: 'build', mode: 'production' }, 'vite.app-web.config.ts');
  const release = await loadConfigFromFile({ command: 'build', mode: 'release' }, 'vite.app-web.config.ts');
  assert.equal(local.config.build.emptyOutDir, false);
  assert.equal(release.config.build.emptyOutDir, true);
  assert.equal(local.config.build.outDir, path.resolve('app-web/dist'));
  assert.equal(release.config.build.outDir, path.resolve('app-web/dist-release'));

  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.build.files.some((entry) => entry.from === 'app-web/dist-release' && entry.to === 'app-web/dist'));
  for (const name of ['pack:mac', 'dist:mac', 'dist:mac:release']) {
    assert.match(pkg.scripts[name], /npm run build:release/);
  }
  assert.match(pkg.scripts['build:web:release'], /--mode release/);
  assert.match(fs.readFileSync('scripts/release-mac.mjs', 'utf8'), /run\('npm', \['run', 'build:release'\]\)/);
});

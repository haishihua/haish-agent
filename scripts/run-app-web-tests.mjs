import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const testRoot = resolve('app-web/tests');

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? collectTests(path) : [path];
    })
    .filter((path) => /\.test\.(?:js|mjs)$/.test(path))
    .sort();
}

const result = spawnSync(process.execPath, ['--test', ...collectTests(testRoot)], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

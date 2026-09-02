import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(
  new URL('../../../src/main/main.ts', import.meta.url),
  'utf8',
);
const runtimeSource = fs.readFileSync(
  new URL('../../../src/main/local-runtime.ts', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(fs.readFileSync(
  new URL('../../../package.json', import.meta.url),
  'utf8',
));

test('electron-only development rebuilds the renderer before launch', () => {
  assert.match(packageJson.scripts['dev:electron'], /^npm run build:web && /);
});

test('one quit request closes the UI before runtime shutdown', () => {
  const quitStart = mainSource.indexOf("app.on('before-quit'");
  const quitBody = mainSource.slice(quitStart);
  assert.match(quitBody, /event\.preventDefault\(\)/);
  assert.match(quitBody, /BrowserWindow\.getAllWindows\(\)/);
  assert.match(quitBody, /window\.destroy\(\)/);
  assert.match(quitBody, /stopLocalRuntime\(\)/);
});

test('runtime shutdown owns both spawned and reused backend processes', () => {
  assert.match(runtimeSource, /currentWorkdir = workdir;\s*state = \{ status: 'ready', baseUrl, pid: record\.pid \}/);
  assert.match(runtimeSource, /const runtimePid = child\?\.pid \?\? state\.pid/);
  assert.match(runtimeSource, /const trackedPids = runtimeProcessTree\(runtimePid\)/);
  assert.match(runtimeSource, /signalProcesses\(trackedPids, 'SIGTERM'\)/);
  assert.match(runtimeSource, /signalProcesses\(forceTargets, 'SIGKILL'\)/);
});

test('runtime shutdown is bounded to a sub-second process-tree kill', () => {
  assert.match(runtimeSource, /const SHUTDOWN_GRACE_MS = 250/);
  assert.match(runtimeSource, /const SHUTDOWN_FORCE_REAP_MS = 250/);
  assert.match(runtimeSource, /execFileSync\('ps', \['-axo', 'pid=,ppid='\]/);
});

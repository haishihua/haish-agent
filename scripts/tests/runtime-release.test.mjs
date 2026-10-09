import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { smokeRuntime } from '../smoke-runtime.mjs';

for (const mode of ['ok', '503', 'owner', 'exit', 'timeout', 'invalid']) {
  test(`runtime gate: ${mode}`, async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'haish-smoke-test-'));
    const exe = path.join(dir, 'runtime');
    const body = mode === 'exit' ? `console.error("No module named 'croniter'"); process.exit(1);`
      : mode === 'timeout' ? 'setInterval(() => {}, 1000);' : `
const http = require('node:http');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
const workdir = process.argv[process.argv.indexOf('--workdir') + 1];
if (process.env.PYTHONPATH || process.env.OPENAI_API_KEY) process.exit(44);
console.log('WORKDIR=' + workdir);
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if ('${mode}' === '503' && req.url.includes('/api/projects')) {
    res.statusCode = 503; res.end('{}'); return;
  }
  res.end(JSON.stringify(req.url.includes('/api/projects')
    ? {owner_id: '${mode}' === 'owner' ? req.url : 'test', projects: '${mode}' === 'invalid' ? null : []}
    : {ok: true}));
}).listen(port, '127.0.0.1');`;
    writeFileSync(exe, `#!${process.execPath}\n${body}\n`);
    chmodSync(exe, 0o755);
    const logPath = path.join(dir, 'smoke.log');
    try {
      const run = smokeRuntime(exe, { timeoutMs: mode === 'timeout' ? 250 : 3_000, logPath });
      const patterns = {503: /HTTP 503/, owner: /Inconsistent project owner_id/,
        exit: /croniter/, timeout: /timed out/, invalid: /Invalid chat project/};
      if (mode === 'ok') await run;
      else await assert.rejects(run, patterns[mode]);
      assert.ok(existsSync(logPath));
      const workdir = readFileSync(logPath, 'utf8').match(/WORKDIR=(.+)/)?.[1];
      if (workdir) assert.equal(existsSync(workdir), false, 'isolated data must be removed');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
}

test('missing runtime fails', async () => {
  await assert.rejects(smokeRuntime('/no/such/haish-runtime', {timeoutMs: 1_000}), /ENOENT/);
});

const read = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
test('dependency and frozen startup gates cannot be bypassed', () => {
  const build = read('scripts/build-runtime.mjs');
  assert.ok(build.indexOf("'check-runtime-dependencies.py'") < build.indexOf("'PyInstaller'"));
  assert.ok(build.indexOf("'smoke-runtime.mjs'") > build.indexOf("'PyInstaller'"));
  assert.match(build, /fs\.cpSync\(presetSource, path\.join\(runtimeRoot, 'src', 'haish_agent_core', 'skills'\)/);
  assert.match(build, /'--add-data'/);
  assert.match(build, /Frozen runtime is missing preset/);
  assert.match(build, /Frozen runtime is missing the Settings Manager client/);
  const release = read('scripts/release-mac.mjs');
  assert.match(release, /function verifyPackagedRuntime\(\)[\s\S]*?'scripts\/smoke-runtime.mjs'/);
  assert.ok(release.indexOf('  verifyPackagedRuntime();') < release.indexOf('  if (dryRun)'));
  assert.ok(release.indexOf('  verifyPackagedRuntime();') < release.indexOf("      'upload',"));
  const workflow = read('.github/workflows/release-macos.yml');
  assert.match(workflow, /ref: \$\{\{ inputs.runtime_ref \}\}/);
  assert.doesNotMatch(workflow, /ref: master/);
  assert.match(workflow, /npm run test:release/);
  assert.match(workflow, /if: always\(\)/);
});

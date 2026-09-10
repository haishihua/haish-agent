import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const source = await fs.readFile(new URL('../../../src/main/tool-screenshot.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { readToolScreenshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=', 'base64');

test('screenshot bridge reads only bounded PNG artifacts from the requested task', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'haish-screenshot-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const root = path.join(home, 'cache/workspaces/0123456789abcdef0123/tasks/task-1/artifacts/browser');
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, 'screenshot-call_1.png');
  await fs.writeFile(file, png);
  assert.equal(await readToolScreenshot(home, file, 'task-1'), `data:image/png;base64,${png.toString('base64')}`);
  await assert.rejects(readToolScreenshot(home, file, 'other-task'), /outside/);
  await assert.rejects(readToolScreenshot(home, '../screenshot.png', 'task-1'), /Invalid/);
  const outside = path.join(home, 'private.png');
  await fs.writeFile(outside, png);
  await assert.rejects(readToolScreenshot(home, outside, 'task-1'), /outside/);
  const link = path.join(root, 'screenshot-link.png');
  await fs.symlink(outside, link);
  await assert.rejects(readToolScreenshot(home, link, 'task-1'), /outside/);
  await fs.writeFile(file, '<svg onload="alert(1)">'.repeat(3));
  await assert.rejects(readToolScreenshot(home, file, 'task-1'), /PNG/);
  const hugePixels = Buffer.from(png);
  hugePixels.writeUInt32BE(100000, 16);
  hugePixels.writeUInt32BE(100000, 20);
  await fs.writeFile(file, hugePixels);
  await assert.rejects(readToolScreenshot(home, file, 'task-1'), /dimensions/);
  await fs.writeFile(file, png);
  await fs.truncate(file, 11 * 1024 * 1024);
  await assert.rejects(readToolScreenshot(home, file, 'task-1'), /size/);
});

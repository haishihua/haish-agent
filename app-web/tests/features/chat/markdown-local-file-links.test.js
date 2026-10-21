import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  localFileHref,
  localFilePath,
  openLocalFile,
  setLocalFileRoot,
} from '../../../src/shared/lib/local-file-link.js';

const read = (path) => fs.readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

test('local file links resolve the shapes model answers print', () => {
  setLocalFileRoot('/Users/me/project');
  assert.equal(localFilePath('file:///Users/me/out/report.pdf'), '/Users/me/out/report.pdf');
  // Markdown keeps the percent-encoding of the href; the shell needs the real path.
  assert.equal(localFilePath('file:///Users/me/out/Quarterly%20Report.pdf'), '/Users/me/out/Quarterly Report.pdf');
  // Codex artifact links carry a sandbox: prefix.
  assert.equal(localFilePath('sandbox:/Users/me/out/report.pdf'), '/Users/me/out/report.pdf');
  assert.equal(localFilePath('/Users/me/out/report.pdf'), '/Users/me/out/report.pdf');
  assert.equal(localFilePath('C:\\out\\report.pdf'), 'C:\\out\\report.pdf');
  assert.equal(localFilePath('file:///C:/out/report.pdf'), 'C:/out/report.pdf');
  // Relative targets belong to the conversation workspace.
  assert.equal(localFilePath('out/report.pdf'), '/Users/me/project/out/report.pdf');
  assert.equal(localFilePath('./out/report.pdf'), '/Users/me/project/out/report.pdf');
  assert.equal(localFilePath('<out/report.pdf>'), '/Users/me/project/out/report.pdf');
});

test('web links, anchors and non-file shapes never become local paths', () => {
  setLocalFileRoot('/Users/me/project');
  assert.equal(localFilePath('https://example.com/report.pdf'), '');
  assert.equal(localFilePath('http://127.0.0.1:8765/a'), '');
  assert.equal(localFilePath('mailto:someone@example.com'), '');
  assert.equal(localFilePath('#section'), '');
  // 分支名、裸词和没有 workspace 的相对路径都不能被当成文件。
  assert.equal(localFilePath('release/20260917'), '');
  assert.equal(localFilePath('notes'), '');
  assert.equal(localFilePath('streamdown:incomplete-link'), '');
  setLocalFileRoot('');
  assert.equal(localFilePath('out/report.pdf'), '');
  assert.equal(localFilePath('/Users/me/out/report.pdf'), '/Users/me/out/report.pdf');
});

test('the href kept on the anchor is a file URI so a middle-click still opens the file', () => {
  setLocalFileRoot('/Users/me/project');
  assert.equal(localFileHref('out/report.pdf'), 'file:///Users/me/project/out/report.pdf');
  assert.equal(localFileHref('sandbox:/Users/me/a b.pdf'), 'file:///Users/me/a%20b.pdf');
  assert.equal(localFileHref('C:\\out\\report.pdf'), 'file:///C:/out/report.pdf');
  assert.equal(localFileHref('https://example.com'), '');
});

test('opening goes through the desktop shell and reports why it failed', async () => {
  const previousWindow = globalThis.window;
  try {
    const calls = [];
    globalThis.window = { haish: { homePath: '/Users/me', openLocalPath: async (path) => { calls.push(path); return { ok: true }; } } };
    assert.equal((await openLocalFile('sandbox:/Users/me/out/report.pdf')).ok, true);
    assert.deepEqual(calls, ['/Users/me/out/report.pdf']);

    globalThis.window = { haish: { openLocalPath: async (path) => ({ ok: false, error: `No application for ${path}` }) } };
    const failed = await openLocalFile('file:///Users/me/out/report.pdf');
    assert.equal(failed.ok, false);
    assert.match(failed.error, /No application/);

    // 浏览器预览没有桌面 API：给出明确原因，而不是静默什么都不做。
    globalThis.window = {};
    const unsupported = await openLocalFile('/Users/me/out/report.pdf');
    assert.equal(unsupported.ok, false);
    assert.match(unsupported.error, /desktop app/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('production markdown and desktop wiring keep local links clickable', () => {
  const markdown = read('app-web/src/shared/ui/Markdown.jsx');
  // 链接点击被拦下交给 shell，且 href 已经被换成 file:// 形式。
  assert.match(markdown, /function MarkdownLink\(/);
  assert.match(markdown, /event\.preventDefault\(\)/);
  assert.match(markdown, /openLocalFile\(value\)/);
  assert.match(markdown, /data-local-file="true"/);
  assert.match(markdown, /return localFileHref\(value\) \|\| null;/);
  assert.match(markdown, /a: MarkdownLink/);
  // 打开失败要有反馈，不能安静失败。
  assert.match(markdown, /new CustomEvent\('haish:toast'/);

  const shell = read('app-web/src/features/app/AppShell.jsx');
  assert.match(shell, /useLocalFileLinks\(localWorkspace\.path, showToast\);/);
  const bridge = read('app-web/src/features/app/hooks/useLocalFileLinks.js');
  assert.match(bridge, /setLocalFileRoot\(workspacePath \|\| ''\)/);
  assert.match(bridge, /window\.addEventListener\('haish:toast'/);

  const preload = read('src/preload/preload.ts');
  assert.match(preload, /openLocalPath: \(absolutePath: string\) =>/);
  assert.match(preload, /ipcRenderer\.invoke\('fs:open-path'/);

  const main = read('src/main/main.ts');
  assert.match(main, /ipcMain\.handle\('fs:open-path'/);
  assert.match(main, /await shell\.openPath\(value\)/);
  // 相对路径不能进 shell：只接受绝对路径。
  assert.match(main, /!path\.isAbsolute\(value\)/);
});

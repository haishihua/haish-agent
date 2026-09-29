import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpServerEnabled, setMcpServerEnabled } from '../../../src/features/settings/model/mcp-server-toggle.js';

const CONFIG = () => ({
  servers: {
    figma: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'figma-developer-mcp', '--stdio'],
      env: { FIGMA_API_KEY: 'k' },
      expose: 'lazy',
    },
    sketch: { transport: 'http', url: 'http://127.0.0.1:9999/mcp', enabled: false },
    'cua-agent': { transport: 'stdio', command: 'cua-agent', enabled: true },
  },
});

test('缺省的 server 就是开着：只有明确的 false 才算关', () => {
  assert.equal(mcpServerEnabled({ transport: 'stdio' }), true);
  assert.equal(mcpServerEnabled({ enabled: true }), true);
  assert.equal(mcpServerEnabled({ enabled: false }), false);
  assert.equal(mcpServerEnabled(undefined), true);
  // 只有布尔 false 算关；别的值当成缺省（core 的 bool(...) 也是这个口径）。
  assert.equal(mcpServerEnabled({ enabled: 'false' }), true);
});

test('点一下开关只改这一台的 enabled，其它字段与其它 server 原样保留', () => {
  const before = CONFIG();
  const after = setMcpServerEnabled(before, 'figma', false);
  assert.equal(after.servers.figma.enabled, false);
  assert.deepEqual(after.servers.figma.env, { FIGMA_API_KEY: 'k' });
  assert.equal(after.servers.figma.expose, 'lazy');
  assert.deepEqual(after.servers.sketch, before.servers.sketch);
  assert.deepEqual(after.servers['cua-agent'], before.servers['cua-agent']);
  // 原对象不动。
  assert.deepEqual(before, CONFIG());
});

test('「开」把 true 明确写进文件，而不是把键删掉', () => {
  const after = setMcpServerEnabled(CONFIG(), 'figma', true);
  assert.equal(after.servers.figma.enabled, true);
  assert.deepEqual(Object.keys(after.servers.figma), ['transport', 'command', 'args', 'env', 'expose', 'enabled']);
  // 关掉再打开 = 回到开着的状态，且文件里带着 enabled: true。
  const reopened = setMcpServerEnabled(setMcpServerEnabled(CONFIG(), 'sketch', true), 'sketch', true);
  assert.equal(reopened.servers.sketch.enabled, true);
  assert.equal(reopened.servers.sketch.url, 'http://127.0.0.1:9999/mcp');
});

test('整份保存时 JSON 里就是新状态，且顺序与内容只差 enabled 这一处', () => {
  const config = setMcpServerEnabled(CONFIG(), 'cua-agent', false);
  const text = JSON.stringify(config, null, 2);
  const reparsed = JSON.parse(text);
  assert.equal(reparsed.servers['cua-agent'].enabled, false);
  assert.equal(reparsed.servers.figma.enabled, undefined);
  assert.equal(reparsed.servers.sketch.enabled, false);
  assert.ok(text.endsWith('\n}') || text.endsWith('}'));
});

test('名字不在清单里、或结构不对时原样奉还（不造新 server、不写坏文件）', () => {
  const before = CONFIG();
  const unknown = setMcpServerEnabled(before, 'ghost', false);
  assert.equal(Object.prototype.hasOwnProperty.call(unknown.servers, 'ghost'), false);
  assert.deepEqual(unknown, before);
  const unnamed = setMcpServerEnabled(before, '  ', false);
  assert.deepEqual(unnamed, before);
  assert.deepEqual(setMcpServerEnabled(undefined, 'figma', false), undefined);
  assert.deepEqual(setMcpServerEnabled({ servers: [] }, 'figma', false), { servers: [] });
  // server 条目不是一个对象时重建成能保存的形状，而不是把字符串摊成字符键。
  const broken = setMcpServerEnabled({ servers: { weird: 'oops' } }, 'weird', false);
  assert.deepEqual(broken, { servers: { weird: { enabled: false } } });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';

const toolsEditor = fs.readFileSync(new URL('../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url), 'utf8');
const handlerSource = fs.readFileSync(new URL('../../src/features/settings/hooks/createSettingsHandlers.js', import.meta.url), 'utf8');

// 取 `run('test', X)` 里的 X（括号配对到最外层闭括号），用来逐个检查测试路径都干了什么。
function testHandlers(source) {
  const marker = "run('test', ";
  const found = [];
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + 1)) {
    let depth = 0;
    const start = at + marker.length;
    for (let index = start; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') {
        if (depth === 0) { found.push(source.slice(start, index)); break; }
        depth -= 1;
      }
    }
  }
  return found;
}

test('Tools 的「Test connection」只测不存：测试按钮不许顺手保存（搜索提供商）', () => {
  // 症状：点 Test 弹的却是保存 toast——按钮先跑了保存，把密钥写进 runtime secrets，
  // 测试失败也照样落盘。后端的 test 端点直接收 api_key（空串才回落到已存的 key），测试不需要先存。
  assert.ok(
    toolsEditor.includes("run('test', () => onTestWebProvider?.(provider.id, providerDraft.api_key || ''))"),
    '搜索提供商的 Test 按钮只许调测试处理器',
  );
  const handlers = testHandlers(toolsEditor);
  assert.equal(handlers.length, 1, `搜索提供商那个 Test 按钮要在（拿到 ${handlers.length} 个）`);
  for (const handler of handlers) {
    assert.doesNotMatch(handler, /onSaveTools/, `Test 按钮不许调保存：${handler}`);
    assert.doesNotMatch(handler, /await /, `Test 按钮不许带保存那一段前置 await：${handler}`);
  }
  // 保存仍然是唯一的写入口：只有 Save 按钮走 saveProvider。
  assert.ok(toolsEditor.includes("run('save', saveProvider)"), 'Save 按钮才走保存处理器');
});

test('测试处理器只发测试请求：handleTestWebProvider 不写设置', async () => {
  const requests = [];
  const notices = [];
  const handlers = createSettingsHandlers({
    API_BASE: '',
    WEB_SEARCH_PROVIDER_OPTIONS: [{ id: 'tavily', label: 'Tavily' }],
    apiFetch: async (url, init = {}) => {
      requests.push([init.method || 'GET', url, init.body ? JSON.parse(init.body) : null]);
      return { ok: true, json: async () => ({ ok: true }) };
    },
    parseResponseMessage: async (_response, fallback) => fallback,
    showToast: (...args) => notices.push(args),
  });

  assert.equal(await handlers.handleTestWebProvider('tavily', 'typed-key'), true);
  assert.deepEqual(requests, [
    ['POST', '/api/settings/tools/web-search/test', { provider: 'tavily', api_key: 'typed-key' }],
  ]);
  assert.deepEqual(notices, [['success', 'Tavily API key test passed']]);
  // 测试路径里不许出现任何写操作：保存（PUT /api/settings/tools）只能是 handleSaveToolsSettingsDraft 的事。
  const webTest = handlerSource.slice(handlerSource.indexOf('async function handleTestWebProvider'), handlerSource.indexOf('function handleSettingsConnectionDirty'));
  assert.ok(webTest.length > 0, 'handleTestWebProvider 必须还在（切片拿不到函数体说明改名了）');
  assert.doesNotMatch(webTest, /method: 'PUT'/, 'handleTestWebProvider 不许写设置');
});

test('Jev 已随后端下线：前端不再留它自己的测试入口', () => {
  // 后端 /api/settings/tools/jev/test 已经拿掉：前端再留着按钮，点下去只有 404。
  assert.doesNotMatch(handlerSource, /handleTestJev|tools\/jev/);
  assert.doesNotMatch(toolsEditor, /onTestJev|tools-jev/);
});

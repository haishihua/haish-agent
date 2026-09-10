import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';
import { skillTrigger, toolCardHeading } from '../../../src/features/chat/model/tool-presentation.js';

globalThis.window = {};
const { buildChatTimeline } = await import('../../../src/features/chat/model/chat-timeline.js');

test('only reading a skill entry document loads a Skill, including catalog paths without metadata', () => {
  for (const root of ['.haish/skills', '.mounted-skills', '.skills', '.skills-src', '.agents/skills', '.codex/skills']) {
    const item = { toolName: 'read_file', toolInput: { path: `/workspace/${root}/browser-use/SKILL.md` } };
    assert.equal(skillTrigger(item).name, 'browser-use');
    assert.equal(buildToolView(item).mode, 'skill');
    assert.equal(buildToolView(item).body, undefined);
  }
  const metadata = { skillName: 'browser-use', skillPath: '/workspace/.skills/browser-use/SKILL.md' };
  for (const path of ['/workspace/docs/SKILL.md', '/workspace/.skills/browser-use/references/usage.md', '/workspace/.skills/browser-use/scripts/start.py']) {
    assert.equal(skillTrigger({ toolName: 'read_file', toolInput: { path } }), null);
  }
  assert.equal(skillTrigger({ ...metadata, toolName: 'read_file', toolInput: { path: '/workspace/.skills/browser-use/scripts/start.py' } }), null);
  assert.equal(skillTrigger({ ...metadata, toolName: 'write_file', toolInput: { path: metadata.skillPath } }), null);
  assert.equal(skillTrigger({ toolName: 'exec_command', toolGroup: 'knowledge' }), null);
});

test('Skill name and path survive live and restored timeline construction without duplicate nodes', () => {
  const call = { callId: 'skill-1', toolName: 'read_file', state: 'returned', toolInput: { path: '/workspace/.haish/skills/browser-use/SKILL.md' } };
  for (const events of [[], [{ type: 'tool_call_started', ...call }, { type: 'tool_call_completed', ...call }]]) {
    const timeline = buildChatTimeline({ status: 'done', toolCalls: [call], eventLog: events }, 'done');
    const skills = timeline.items.filter((item) => item.category === 'skill');
    assert.equal(skills.length, 1);
    assert.equal(skills[0].skillName, 'browser-use');
    assert.equal(skills[0].skillPath, call.toolInput.path);
    assert.equal(buildToolView(skills[0]).mode, 'skill');
    assert.equal(skills[0].callId, 'skill-1');
  }
});

test('read tools never expose their long response or an empty JSON detail', () => {
  for (const toolName of ['read_file', 'search_text', 'glob_files', 'list_dir']) {
    const view = buildToolView({ toolName, toolInput: { path: '/workspace/README.md' }, toolResponse: { data: { text: 'secret long response'.repeat(10000) } } });
    assert.equal(view.mode, 'read');
    assert.equal(view.body, '');
    assert.equal(view.responseJson, undefined);
    assert.equal(view.requestJson, undefined);
  }
});

test('vision tools use the actual analysis text and retain their media and restored task', () => {
  for (const toolName of ['vision_analyze', 'visual_inspect', 'image_describe']) {
    const view = buildToolView({ toolName, status: 'done', toolInput: { media_path: '/workspace/capture.png' }, toolResponse: {
      status: 'ok', summary: 'Short summary', subject: { task: 'Describe the visible controls' }, data: { text: 'Complete image analysis' },
    } });
    assert.equal(view.isVision, true);
    assert.equal(view.finalText, 'Complete image analysis');
    assert.equal(view.task, 'Describe the visible controls');
    assert.equal(view.mediaPath, '/workspace/capture.png');
    assert.equal(view.isRunning, false);
  }
  assert.equal(buildToolView({ toolName: 'dispatch_sub_agent', status: 'done', toolResponse: { data: { answer: 'Agent answer' } } }).isVision, false);
});

test('vision preserves failure messages, pending and cancelled state, and streamed answer text', () => {
  const failed = buildToolView({ toolName: 'vision_analyze', status: 'done', toolResponse: {
    status: 'error', summary: 'Analysis failed', error: { message: 'Image could not be read' },
  } });
  assert.equal(failed.failed, true);
  assert.equal(failed.error, 'Image could not be read');
  assert.equal(buildToolView({ toolName: 'vision_analyze', status: 'pending' }).isRunning, true);
  assert.equal(buildToolView({ toolName: 'vision_analyze', status: 'cancelled' }).cancelled, true);
  const running = buildToolView({ toolName: 'vision_analyze', status: 'running', progressEvents: [
    { type: 'sub_agent_answer_delta', message: 'Partial analysis' },
  ] });
  assert.equal(running.streamAnswerText, 'Partial analysis');
  assert.equal(running.finalText, '');
});

test('search uses real sources, safe links and retains the raw data tabs', () => {
  const view = buildToolView({ toolName: 'web_search', status: 'done', toolInput: { query: 'tools' }, toolResponse: {
    status: 'ok', data: { direct_answer: 'An answer', result_count: 100, results: [
      { title: 'One', url: 'https://www.example.com/one', snippet: 'Details' },
      { title: 'Two', url: 'https://www.example.com/two' },
      { title: 'Unsafe', url: 'javascript:alert(1)' }, null,
    ] },
  } });
  assert.equal(view.mode, 'web-search');
  assert.equal(view.search.results.length, 3);
  assert.equal(view.search.results[0].domain, 'example.com');
  assert.equal(view.search.results[2].url, '');
  assert.equal(view.search.answer, 'An answer');
  assert.match(view.requestJson, /tools/);
  assert.match(view.responseJson, /An answer/);
  assert.deepEqual(toolCardHeading({}, view), { label: 'Web search', query: 'tools' });
});

test('search distinguishes empty, pending, cancelled and failed output', () => {
  const empty = buildToolView({ toolName: 'web_search', status: 'done', toolResponse: { status: 'ok', data: { results: [] } } });
  assert.deepEqual(empty.search.results, []);
  assert.equal(empty.failed, false);
  assert.equal(buildToolView({ toolName: 'web_search', status: 'pending' }).running, true);
  assert.equal(buildToolView({ toolName: 'web_search', status: 'cancelled' }).cancelled, true);
  const failure = buildToolView({ toolName: 'web_search', toolResponse: { status: 'error', error: { message: 'Provider offline' } } });
  assert.equal(failure.failed, true);
  assert.equal(failure.search.error, 'Provider offline');
});

test('fetch maps the backend page contract into the shared search detail with the redirected source', () => {
  const item = { toolName: 'web_fetch', status: 'done', toolInput: JSON.stringify({ url: 'https://example.com/start', max_chars: 12000 }), toolResponse: {
    status: 'ok', subject: { url: 'https://example.com/start' }, data: {
      final_url: 'https://www.example.com/article', title: 'Article title', content: 'Page body',
      http_status: 200, content_type: 'text/html', content_chars: 9, truncated: false,
      links: [{ text: 'Related page', url: 'https://example.com/related' }],
    },
  } };
  const view = buildToolView(item);
  assert.equal(view.mode, 'web-search');
  assert.equal(view.search.kind, 'fetch');
  assert.equal(view.search.content, 'Page body');
  assert.deepEqual(view.search.results, [{ url: 'https://www.example.com/article', domain: 'example.com', title: 'Article title' }]);
  assert.deepEqual(toolCardHeading(item, view), { label: 'Web fetch', query: 'https://example.com/start' });
  assert.match(view.responseJson, /Page body/);
});

test('fetch bounds page content, preserves backend truncation and only exposes HTTP links', () => {
  const item = { toolName: 'web_fetch', status: 'done', toolResponse: { status: 'ok', data: {
    final_url: 'javascript:alert(1)', title: '<img src=x onerror=bad()>', content: 'a'.repeat(12000),
  } } };
  const view = buildToolView(item);
  assert.equal(view.search.results[0].url, '');
  assert.equal(view.search.content.length, 8000);
  assert.equal(view.search.truncated, true);
  const partial = buildToolView({ ...item, toolResponse: { data: { content: 'Short excerpt', truncated: true } } });
  assert.equal(partial.search.truncated, true);
  assert.equal(partial.search.content, 'Short excerpt');
  const bareUrl = buildToolView({ toolName: 'web_fetch', toolInput: 'https://example.com/bare' });
  assert.equal(bareUrl.search.query, 'https://example.com/bare');
  const restored = buildToolView({ toolName: 'web_fetch', toolResponse: { subject: { url: 'https://example.com/restored' } } });
  assert.equal(restored.search.query, 'https://example.com/restored');
});

test('fetch does not count pending, failed or empty requests as fetched sources', () => {
  for (const status of ['pending', 'running', 'cancelled', 'done']) {
    const view = buildToolView({ toolName: 'web_fetch', status, toolInput: { url: 'https://example.com' } });
    assert.deepEqual(view.search.results, []);
    assert.equal(view.running, ['pending', 'running'].includes(status));
    assert.equal(view.cancelled, status === 'cancelled');
    assert.equal(view.search.content, '');
  }
  const failed = buildToolView({ toolName: 'web_fetch', status: 'failed', toolResponse: { status: 'error', error: { message: 'HTTP 404' } } });
  assert.equal(failed.failed, true);
  assert.equal(failed.search.error, 'HTTP 404');
  assert.deepEqual(failed.search.results, []);
});

test('browser screenshot reference stays separate from sanitized JSON and never infers navigation from code', () => {
  const path = '/runtime/cache/workspaces/0123456789abcdef0123/tasks/task/artifacts/browser/screenshot-call_1.png';
  const view = buildToolView({ toolName: 'browser_use', toolInput: { code: 'goto("https://example.com")' }, toolResponse: {
    status: 'ok', data: { stdout: 'ready', screenshot: path }, artifacts: { screenshot: path },
  } });
  assert.equal(view.mode, 'browser');
  assert.equal(view.browser.screenshot, path);
  assert.equal(view.browser.url, '');
  assert.doesNotMatch(view.responseJson, /screenshot/);
  assert.match(view.responseJson, /ready/);
  assert.equal(view.browser.code, 'goto("https://example.com")');
  assert.equal(view.browser.stdout, 'ready');
  assert.equal(buildToolView({ toolName: 'browser_use' }).browser.screenshot, '');
});

test('browser calls without screenshots expose code and output independently of raw JSON', () => {
  const code = 'new_tab("https://example.com")';
  const view = buildToolView({ toolName: 'browser_use', status: 'done', toolInput: JSON.stringify({ code }) });
  assert.equal(view.mode, 'browser');
  assert.equal(view.browser.code, code);
  assert.equal(view.browser.screenshot, '');
  assert.equal(view.browser.url, '');
  assert.equal(view.browser.stdout, '');
  assert.equal(view.running, false);
  assert.equal(buildToolView({ toolName: 'browser_use' }).running, true);
});

test('browser output keeps real stderr and failure messages with bounded code and stream tails', () => {
  const view = buildToolView({ toolName: 'browser_use', status: 'failed', toolInput: { code: 'long code\n'.repeat(2000) }, toolResponse: {
    status: 'error', error: { message: 'Navigation timed out' }, data: {
      stdout: `${'old output\n'.repeat(2000)}last output`, stderr: 'Permission denied', url: 'https://example.com/result',
    },
  } });
  assert.equal(view.failed, true);
  assert.equal(view.browser.error, 'Navigation timed out');
  assert.equal(view.browser.stderr, 'Permission denied');
  assert.equal(view.browser.url, 'https://example.com/result');
  assert.ok(view.browser.code.length < 8100);
  assert.ok(view.browser.stdout.length < 8100);
  assert.match(view.browser.code, /^long code/);
  assert.match(view.browser.stdout, /last output$/);
});

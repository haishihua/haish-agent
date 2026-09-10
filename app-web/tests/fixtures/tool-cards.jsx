import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatAgentTimeline } from '../../src/features/chat/components/ChatTimelineNodes.jsx';
import { buildChatTimeline } from '../../src/features/chat/model/chat-timeline.js';
import { runtimeEventToLog } from '../../src/features/tasks/model/runtime-events.js';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '../../styles/base.css';
import '../../styles/chat.css';
import './tool-cards.css';

const tool = (id, toolName, toolInput, toolResponse = {}, status = 'done') => ({
  kind: 'tool', id, callId: id, toolName, toolInput, toolResponse, status,
});
const search = tool('search', 'web_search', { query: 'assistant-ui tool components' }, {
  status: 'ok', data: { results: [
    { title: 'Tool Timeline — assistant-ui', url: 'https://www.assistant-ui.com/elements/tool-timeline', snippet: 'Grouped activity with a compact, collapsible summary.' },
    { title: 'Tool Call — assistant-ui', url: 'https://www.assistant-ui.com/elements/tool-call', snippet: 'Individual tool calls and their request and result details.' },
  ] },
});
const first = tool('json-1', 'inspect_project', { workspace: '/workspace/haish-agent', options: { recursive: true } }, { status: 'ok', data: { files: 28, framework: 'React', ready: true, message: '<script>bad()</script>' } });
const second = tool('json-2', 'inspect_project', { workspace: '/workspace/second' }, { status: 'ok', data: { files: 5 } });
const read = tool('read', 'read_file', { path: '/Users/demo/project/haish-agent-core/domain/src/main/java/com/example/contracts/ContractReviewService.java' }, { data: { text: 'READ_OUTPUT_MUST_STAY_HIDDEN' } });
const browser = tool('browser', 'browser_use', { code: 'print("ready")' }, { status: 'ok', data: { stdout: 'ready', screenshot: '/missing/screenshot-call.png' } });
const browserCode = tool('browser-code', 'browser_use', { code: 'new_tab("https://example.com")' });
const browserOutput = tool('browser-output', 'browser_use', { code: 'print(get_page_text())' }, { status: 'ok', data: { stdout: '<h1>Page title</h1>' } });
const browserFailure = tool('browser-failure', 'browser_use', { code: 'click("Continue")' }, { status: 'error', error: { message: 'Element not found' }, data: { stderr: 'No matching element: Continue' } }, 'failed');
const skill = { ...tool('skill', 'read_file', { path: '/workspace/.haish/skills/browser-use/SKILL.md' }), category: 'skill', children: [tool('child', 'read_file', { path: '/workspace/settings.json' })] };
const retryRows = [
  { kind: 'meta', metaType: 'llm_retry', id: 'retry-running', status: 'running', summary: 'Model response interrupted · retrying 2/4' },
  { kind: 'meta', metaType: 'llm_retry', id: 'retry-recovered', status: 'done', summary: 'Model response resumed on attempt 2/4' },
  { kind: 'meta', metaType: 'llm_retry', id: 'retry-failed', status: 'failed', summary: 'Model response failed after 4 attempts' },
];
const compactionRows = [
  { kind: 'meta', id: 'compaction-running', status: 'running', summary: 'Auto-Compacting context' },
  { kind: 'meta', id: 'compaction-completed', status: 'done', summary: 'Auto-Compacting context',
    summaryText: '## Goal\nKeep the implementation focused.\n\n' + '保留当前任务目标、约束和已经完成的工作。\n\n'.repeat(30),
    details: ['7 messages', '1,200 → 300 tokens', '42 summary tokens'] },
  { kind: 'meta', id: 'compaction-empty', status: 'done', summary: 'Auto-Compacting context' },
];
const terminal = tool('terminal', 'exec_command', { command: 'npm run check:web' }, { status: 'ok', data: { stdout: 'All checks passed', exit_code: 0 } });
const diff = tool('diff', 'edit_file', { path: 'src/view.jsx' }, { status: 'ok', artifacts: { diff: '-const expanded = false;\n+const expanded = open;' } });
const failedSearch = tool('failed', 'web_search', { query: 'retry search' }, { status: 'error', error: { message: 'Provider unavailable' } }, 'failed');
const fetchedPage = tool('fetch', 'web_fetch', { url: 'https://example.com/start', max_chars: 12000 }, { status: 'ok', data: {
  final_url: 'https://example.com/article', title: 'Fetched article', content: '<script>bad()</script>\n网页正文。\n'.repeat(500), truncated: false,
} });
const pendingFetch = tool('fetch-pending', 'web_fetch', { url: 'https://example.com/loading' }, {}, 'running');
const failedFetch = tool('fetch-failed', 'web_fetch', { url: 'https://example.com/missing' }, { status: 'error', error: { message: 'HTTP 404' } }, 'failed');
const emptyFetch = tool('fetch-empty', 'web_fetch', { url: 'https://example.com/empty' }, { status: 'ok', data: { content: '' } });
const cancelledFetch = tool('fetch-cancelled', 'web_fetch', { url: 'https://example.com/cancelled' }, {}, 'cancelled');
const visionInput = { media_path: '/workspace/images/capture.png', task: '描述图片中的页面布局及可见控件。' };
const vision = tool('vision', 'vision_analyze', visionInput, { status: 'ok', data: { text: '页面包含顶部导航、侧栏和内容区域。\n'.repeat(90) + '<script>bad()</script>' } });
const runningVision = { ...tool('vision-running', 'image_describe', visionInput, {}, 'running'), progressEvents: [{ type: 'sub_agent_answer_delta', message: '已识别出顶部导航。' }] };
const failedVision = tool('vision-failed', 'visual_inspect', visionInput, { status: 'error', error: { message: 'Image could not be read' } }, 'failed');
const cancelledVision = tool('vision-cancelled', 'vision_analyze', visionInput, {}, 'cancelled');
const emptyVision = tool('vision-empty', 'vision_analyze', visionInput);
const subagent = tool('subagent', 'dispatch_sub_agent', { task: 'Inspect the project' }, { status: 'ok', data: { answer: '**Existing sub-agent answer**\n\n' + '检查结果：工具详情与正文字体保持一致。\n\n'.repeat(24) } });
const runningSubagent = { ...tool('subagent-running', 'dispatch_sub_agent', { agent: 'Reviewer', task: '检查工具卡片样式与嵌套调用。' }, {}, 'running'), progressEvents: [
  { type: 'sub_agent_answer_delta', message: '正在检查项目中的工具组件。' },
  { type: 'sub_agent_tool_call_started', callId: 'nested-shell', toolName: 'exec_command', toolInput: { command: 'npm run check:web' } },
  { type: 'sub_agent_tool_call_completed', callId: 'nested-shell', toolName: 'exec_command', toolResponse: { status: 'ok', data: { stdout: 'Nested checks passed', exit_code: 0 } } },
  { type: 'sub_agent_answer_delta', message: '验证通过，正在整理结果。' },
] };
let items = [{ kind: 'tool_group', id: 'group', summary: 'read 1 file · searched 1 time · used 3 tools', status: 'done', tools: [read, search, first, second, browser] }, { ...read, id: 'standalone-read', callId: 'standalone-read' }, skill, ...compactionRows, ...retryRows, terminal, diff, failedSearch, browserCode, browserOutput, browserFailure, fetchedPage, pendingFetch, failedFetch, emptyFetch, cancelledFetch, vision, runningVision, failedVision, cancelledVision, emptyVision, subagent, runningSubagent];
let taskId = 'fixture-task';
const metaLifecycleTask = { eventLog: [
  runtimeEventToLog({ type: 'context_compaction_started' }),
  runtimeEventToLog({ type: 'llm_retry', operation_id: 'lifecycle-retry', state: 'retrying', reason: 'timeout', attempt: 2, max_attempts: 4 }),
] };
let metaLifecycleStatus = 'running';
const root = createRoot(document.getElementById('root'));
function render() {
  flushSync(() => root.render(<main className="tool-fixture">
    <h1>Tool cards regression</h1>
    <p>Body font reference · 正文字体对照。This page exercises production components without a backend or conversation writes.</p>
    <ChatAgentTimeline items={items} taskId={taskId} conversationId="fixture" />
    <section className="meta-lifecycle-fixture" aria-label="Retry and compaction lifecycle">
      <h2>Task lifecycle without finish events</h2>
      <div className="meta-lifecycle-controls">
        {['running', 'completed', 'failed', 'cancelled'].map((status) => <button key={status} type="button"
          aria-pressed={metaLifecycleStatus === status} onClick={() => { metaLifecycleStatus = status; render(); }}>{status}</button>)}
      </div>
      <ChatAgentTimeline items={buildChatTimeline(metaLifecycleTask, metaLifecycleStatus).items} />
    </section>
    <pre id="checks" role="status">Running checks…</pre>
  </main>));
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 220));
const node = (id) => document.querySelector(`[data-tool-call-id="${id}"]`);
const trigger = (id) => node(id)?.querySelector('button.aui-tool-trigger');
const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
}
async function click(element) {
  if (!element) throw new Error('Missing interaction target');
  flushSync(() => element.click());
  await tick();
}
async function run() {
  render();
  await tick();
  check(!node('search'), 'Group starts collapsed');
  check(!trigger('skill'), 'Skill has no disclosure button');
  check(node('skill').textContent.includes('Loaded'), 'Skill describes loaded instructions');
  check(Math.abs(node('skill').querySelector('.aui-skill-line > svg').getBoundingClientRect().left - document.querySelector('.aui-timeline-trigger > svg').getBoundingClientRect().left) <= 1, 'Skill icon aligns with the outer tool group arrow');
  check(Math.abs(node('skill').querySelector('.aui-tool-label').getBoundingClientRect().left - document.querySelector('.aui-timeline-trigger .aui-tool-label').getBoundingClientRect().left) <= 1, 'Skill name aligns with the outer group label');
  check(Boolean(node('child')), 'Skill children remain visible');
  await click(document.querySelector('.aui-timeline-trigger'));
  check(!trigger('read'), 'Read-only tools have no empty detail');
  check(!document.body.textContent.includes('READ_OUTPUT_MUST_STAY_HIDDEN'), 'Long read output stays hidden');
  await click(trigger('json-1'));
  check(node('json-1').querySelector('[aria-selected="true"]').textContent === 'Response', 'Response is the default tab');
  check(!node('json-1').querySelector('script'), 'JSON is rendered as text');
  check(trigger('json-2').getAttribute('aria-expanded') === 'false', 'Same-name calls expand independently');
  await click(node('json-1').querySelector('[role="tab"]'));
  check(node('json-1').querySelector('[role="tabpanel"]').textContent.includes('recursive'), 'Request tab exposes the actual input');
  const request = node('json-1').querySelector('[role="tab"]');
  flushSync(() => request.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  check(node('json-1').querySelector('[aria-selected="true"]').textContent === 'Response', 'Arrow keys switch JSON tabs');
  items = [{ ...items[0], status: 'running', tools: [read, search, { ...first, status: 'running' }, second, browser] }, ...items.slice(1).map((item) => item.id === 'skill' ? { ...item, status: 'running' } : item)];
  render();
  await tick();
  check(trigger('json-1').getAttribute('aria-expanded') === 'true', 'Streaming updates preserve per-call open state');
  const runningAnimation = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'aui-tool-shimmer';
  check(getComputedStyle(document.querySelector('.aui-timeline-trigger .aui-tool-label')).animationName === runningAnimation, 'Running outer group has the text sweep');
  check(getComputedStyle(node('json-1').querySelector('.aui-tool-label')).animationName === runningAnimation, 'Running tool inside the group has the text sweep');
  check(['read', 'json-2', 'failed'].every((id) => getComputedStyle(node(id).querySelector('.aui-tool-label')).animationName === 'none'), 'Completed siblings and failed tools stay still while the group runs');
  check(getComputedStyle(node('vision-running').querySelector('.aui-tool-label')).animationName === runningAnimation, 'Running standalone tool has the text sweep');
  check(getComputedStyle(node('skill').querySelector('.aui-tool-label')).animationName === runningAnimation, 'Loading Skill uses the shared running effect');
  check(getComputedStyle(node('standalone-read').querySelector('.aui-tool-label')).animationName === 'none', 'Completed tool labels stay still');
  await click(trigger('search'));
  check(node('search').querySelectorAll('.aui-search-source').length === 2, 'Two sources on the same domain both render');
  check(node('search').textContent.includes('Found 2 sources'), 'Source count comes from actual results');
  check(!node('search').querySelector('.chat-json-card, .aui-tool-raw'), 'Search has no Request / Response entry');
  await click(trigger('browser'));
  check(node('browser').textContent.includes('Screenshot unavailable'), 'Unavailable screenshot has a visible fallback');
  check(!node('browser').querySelector('.aui-tool-raw'), 'Browser detail has no Request / Response entry');
  check(node('browser').querySelector('.aui-browser-output').textContent === 'ready', 'Screenshot failure keeps output in the browser panel');
  await click(trigger('browser-code'));
  check(Boolean(node('browser-code').querySelector('[data-slot="computer-use"]')), 'Code-only browser call uses ComputerUse');
  check(node('browser-code').querySelector('.aui-browser-code').textContent === browserCode.toolInput.code, 'Browser code is shown directly');
  check(!node('browser-code').querySelector('.aui-tool-raw'), 'Code-only browser has no Request / Response entry');
  check(node('browser-code').querySelector('.aui-browser-address').textContent === 'Browser', 'Code URLs are not presented as verified navigation');
  await click(trigger('browser-output'));
  check(node('browser-output').querySelector('.aui-browser-output').textContent === '<h1>Page title</h1>'
    && !node('browser-output').querySelector('h1'), 'Browser output renders as text inside ComputerUse');
  await click(trigger('browser-failure'));
  check(node('browser-failure').querySelector('.is-stderr').textContent.includes('No matching element: Continue')
    && node('browser-failure').querySelector('.is-error').textContent === 'Element not found', 'Browser failure and stderr appear without opening JSON');
  await click(trigger('terminal'));
  check(node('terminal').textContent.includes('All checks passed'), 'Terminal retains existing output component');
  await click(trigger('diff'));
  check(Boolean(node('diff').querySelector('.haish-tool-elements')), 'Diff retains existing dedicated component');
  await click(trigger('failed'));
  check(node('failed').textContent.includes('Provider unavailable'), 'Search failure is shown as failure');
  await click(trigger('fetch'));
  check(Boolean(node('fetch').querySelector('.aui-web-search')), 'Fetch uses the same detail surface as search');
  check(node('fetch').querySelector('.aui-search-source').getAttribute('href') === 'https://example.com/article', 'Fetch source uses the actual final URL');
  check(!node('fetch').querySelector('.aui-search-query') && !node('fetch').textContent.includes('Page fetched'), 'Successful fetch shows only the linked source header');
  check(!node('fetch').querySelector('.aui-search-content') && node('fetch').querySelector('.aui-fetch-toggle').getAttribute('aria-expanded') === 'false', 'Fetch body starts collapsed behind the left arrow');
  const fetchLink = node('fetch').querySelector('.aui-search-source');
  fetchLink.addEventListener('click', (event) => event.preventDefault(), { once: true });
  await click(fetchLink);
  check(!node('fetch').querySelector('.aui-search-content'), 'Source navigation does not toggle the fetched body');
  await click(node('fetch').querySelector('.aui-fetch-toggle'));
  check(node('fetch').querySelector('.aui-search-content').textContent.startsWith('<script>bad()</script>') && !node('fetch').querySelector('script'), 'Fetched content stays plain text');
  check(!node('fetch').querySelector('.chat-json-card, .aui-tool-raw'), 'Fetch has no Request / Response entry');
  check(node('fetch').querySelector('.aui-search-content').textContent.length === 8000 && node('fetch').textContent.includes('Content truncated'), 'Long fetched content is bounded with a visible truncation marker');
  await click(node('fetch').querySelector('.aui-fetch-toggle'));
  check(!node('fetch').querySelector('.aui-search-content') && !node('fetch').textContent.includes('Content truncated'), 'Fetch arrow hides both the body and truncation marker');
  await click(trigger('fetch-pending'));
  check(node('fetch-pending').textContent.includes('Fetching…') && !node('fetch-pending').querySelector('.aui-search-source'), 'Pending fetch does not invent a fetched source');
  await click(trigger('fetch-failed'));
  check(node('fetch-failed').querySelector('.aui-search-status').textContent === 'HTTP 404', 'Fetch failure is shown in the shared card');
  await click(trigger('fetch-empty'));
  check(node('fetch-empty').textContent.includes('No content returned'), 'Empty fetch has an explicit empty state');
  await click(trigger('fetch-cancelled'));
  check(node('fetch-cancelled').textContent.includes('Fetch cancelled'), 'Cancelled fetch has an explicit cancelled state');
  await click(trigger('vision'));
  check(Boolean(node('vision').querySelector('.aui-vision-detail')) && !node('vision').querySelector('.chat-imsg, .chat-json-card'), 'Vision uses one dedicated panel without conversation bubbles or JSON tabs');
  check(node('vision').querySelector('.aui-vision-filename').textContent === 'capture.png', 'Vision identifies the image by filename');
  check(!node('vision').querySelector('.aui-vision-task').open, 'Vision task instructions start collapsed');
  await click(node('vision').querySelector('.aui-vision-task > summary'));
  check(node('vision').querySelector('.aui-vision-task').open && node('vision').querySelector('.aui-vision-prompt').textContent === visionInput.task, 'Vision task instructions can be expanded');
  const visionOutput = node('vision').querySelector('.aui-vision-output');
  check(visionOutput.textContent.endsWith('<script>bad()</script>') && !node('vision').querySelector('script'), 'Vision analysis stays plain text');
  check(getComputedStyle(visionOutput).fontFamily === getComputedStyle(document.querySelector('.tool-fixture > p')).fontFamily && visionOutput.scrollHeight > visionOutput.clientHeight, 'Long vision output uses the body font and scrolls inside the panel');
  check(!node('vision').querySelector('[title], [data-haish-tooltip-trigger]'), 'Vision detail has no hover hints');
  await click(trigger('vision-running'));
  check(node('vision-running').textContent.includes('Analyzing…') && node('vision-running').querySelector('.aui-vision-output').textContent === '已识别出顶部导航。', 'Image describe preserves running state and partial analysis');
  await click(trigger('vision-failed'));
  check(node('vision-failed').querySelector('.aui-vision-result.is-error').textContent.includes('Image could not be read'), 'Visual inspect exposes the actual failure in the analysis panel');
  await click(trigger('vision-cancelled'));
  check(node('vision-cancelled').textContent.includes('Analysis cancelled'), 'Vision cancellation is explicit');
  await click(trigger('vision-empty'));
  check(node('vision-empty').textContent.includes('No analysis returned.'), 'Empty vision output is explicit');
  await click(trigger('subagent'));
  check(!node('subagent').querySelector('.chat-imsg') && node('subagent').querySelector('.chat-subagent-dispatch .message-speech-body').textContent === subagent.toolInput.task, 'Dispatched task uses the main conversation message surface');
  check(node('subagent').querySelector('.chat-subagent-speaker').textContent === 'Main agent'
    && Boolean(node('subagent').querySelector('.chat-subagent-reply [data-streamdown="strong"]')), 'Parent identity replaces the user label and final answer keeps Markdown');
  const subagentFont = getComputedStyle(document.querySelector('.tool-fixture > p')).fontFamily;
  check([...node('subagent').querySelectorAll('.chat-subagent-speaker, .chat-subagent-field-value, .chat-subagent-reply .message-speech-body')].every((el) => getComputedStyle(el).fontFamily === subagentFont), 'Sub-agent task, identity and answer use the body font');
  check(!node('subagent').querySelector('[title], [data-haish-tooltip-trigger], [role="tablist"]'), 'Sub-agent detail has no extra tooltip or Request / Response controls');
  const showAll = node('subagent').querySelector('.chat-subagent-show-toggle');
  check(showAll?.getAttribute('aria-expanded') === 'false', 'Long sub-agent answer retains View All');
  await click(showAll);
  check(showAll.getAttribute('aria-expanded') === 'true' && getComputedStyle(node('subagent').querySelector('.chat-subagent-collapsible-body')).maxHeight === 'none', 'View All reveals the complete sub-agent answer');
  await click(showAll);
  await click(trigger('subagent-running'));
  const nestedTool = node('subagent-running').querySelector('[data-tool-name="exec_command"]');
  check(Boolean(node('subagent-running').querySelector('.chat-subagent-reply .chat-timeline'))
    && node('subagent-running').textContent.includes('验证通过'), 'Sub-agent stream and nested tools use the production timeline');
  await click(nestedTool.querySelector('button.aui-tool-trigger'));
  check(nestedTool.textContent.includes('Nested checks passed') && Boolean(nestedTool.querySelector('.haish-tool-elements')), 'Nested shell preserves its dedicated detail and independent disclosure');
  items = items.map((item) => item.id === runningSubagent.id ? { ...item, progressEvents: [...item.progressEvents, { type: 'sub_agent_answer_delta', message: '补充流式内容。' }] } : item);
  render();
  await tick();
  check(nestedTool.querySelector('button.aui-tool-trigger').getAttribute('aria-expanded') === 'true'
    && node('subagent-running').textContent.includes('补充流式内容'), 'Streaming updates retain nested tool disclosure state');
  check(getComputedStyle(trigger('search')).fontFamily === getComputedStyle(document.querySelector('.tool-fixture > p')).fontFamily, 'Card font matches body text');
  items = [{ ...items[0], status: 'done', tools: [read, search, first, second, browser] }, ...items.slice(1).map((item) => item.id === 'skill' ? { ...item, status: 'done' } : item)];
  render();
  await tick();
  check(getComputedStyle(document.querySelector('.aui-timeline-trigger .aui-tool-label')).animationName === 'none'
    && getComputedStyle(node('json-1').querySelector('.aui-tool-label')).animationName === 'none'
    && getComputedStyle(node('skill').querySelector('.aui-tool-label')).animationName === 'none', 'Group, inner tool and Skill stop sweeping after completion');
  taskId = 'another-task';
  render();
  await tick();
  check(!node('search'), 'Switching tasks resets disclosure state');
  await click(document.querySelector('.aui-timeline-trigger'));
  await click(trigger('search'));
  await click(trigger('json-1'));
  await click(trigger('browser'));
  await click(trigger('browser-code'));
  await click(trigger('browser-output'));
  await click(trigger('browser-failure'));
  await click(trigger('fetch'));
  check(node('fetch').querySelector('.aui-fetch-toggle').getAttribute('aria-expanded') === 'false', 'Fetched body stays collapsed after switching tasks');
  await click(trigger('vision'));
  await click(trigger('subagent'));
  await click(trigger('subagent-running'));
  check(document.documentElement.scrollWidth <= window.innerWidth, 'No page-level horizontal overflow');
  let runningStatusIcons;
  for (const [status, expected] of [['running', 'running'], ['completed', 'done'], ['failed', 'failed'], ['cancelled', 'cancelled']]) {
    await click([...document.querySelectorAll('.meta-lifecycle-controls button')].find((button) => button.textContent === status));
    const rows = [...document.querySelectorAll('.meta-lifecycle-fixture .chat-timeline-meta')];
    const statusIcons = rows.map((row) => row.querySelector('.aui-tool-status svg'));
    if (status === 'running') runningStatusIcons = statusIcons.map((icon) => icon.innerHTML);
    const textAnimation = status === 'running' ? runningAnimation : 'none';
    const iconAnimation = status === 'running' && runningAnimation !== 'none' ? 'aui-tool-spin' : 'none';
    check(rows.length === 2 && rows.every((row, index) => row.classList.contains(`status-${expected}`)
      && statusIcons[index].innerHTML === runningStatusIcons[index]
      && getComputedStyle(row.querySelector('.aui-tool-label')).animationName === textAnimation
      && getComputedStyle(statusIcons[index]).animationName === iconAnimation), `Retry and compaction keep their ring and follow ${status} task state without finish events`);
  }
  document.getElementById('checks').dataset.result = 'PASS';
  document.getElementById('checks').textContent = checks.join('\n');
}
run().catch((error) => {
  document.getElementById('checks').dataset.result = 'FAIL';
  document.getElementById('checks').textContent = [...checks, `FAIL ${error.message}`].join('\n');
});

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

const log = [];
const event = (type, id, name, fields = {}) => log.push(runtimeEventToLog({ type, call_id: id, tool_name: name, ...fields }));
event('tool_call_started', 'script', 'code_mode', { tool_input: { code: 'const r = await tools.read_file({path:"src/main.js"});\nawait tools.exec_command({command:"npm test"});\nreturn {checked:true};' } });
for (const [id, name, input, response] of [
  ['read', 'read_file', { path: 'src/main.js' }, { status: 'ok', summary: 'Read source' }],
  ['terminal', 'exec_command', { command: 'npm test' }, { status: 'ok', data: { exit_code: 0 }, artifacts: { output: '21 tests passed' } }],
  ['edit', 'edit_file', { path: 'src/main.js' }, { status: 'ok', artifacts: { diff: '-const label = "Code Mode";\n+const label = "Tool Script";' } }],
  ['custom', 'mcp_inventory', { region: 'east' }, { status: 'ok', data: { total: 12 } }],
]) {
  event('tool_call_started', id, name, { parent_call_id: 'script', tool_input: input });
  event('tool_call_completed', id, name, { parent_call_id: 'script', tool_response: response });
}
event('tool_call_completed', 'script', 'code_mode', { tool_response: { status: 'ok', summary: 'Script completed.', data: { output: ['{"checked":true}'] } } });
event('tool_call_started', 'empty', 'code_mode', { tool_input: { code: 'return 42;' } });
event('tool_call_completed', 'empty', 'code_mode', { tool_response: { status: 'ok', data: { output: ['42'] } } });
event('tool_call_started', 'single', 'code_mode', { tool_input: { code: 'await tools.edit_file({path:"single.js"});' } });
event('tool_call_started', 'single-edit', 'edit_file', { parent_call_id: 'single', tool_input: { path: 'single.js' } });
event('tool_call_completed', 'single-edit', 'edit_file', { parent_call_id: 'single', tool_response: { status: 'ok', artifacts: { diff: '-old\n+new' } } });
event('tool_call_completed', 'single', 'code_mode', { tool_response: { status: 'ok' } });
let task = { eventLog: log };
const root = createRoot(document.getElementById('root'));
const render = () => flushSync(() => root.render(<main className="tool-fixture">
  <h1>Tool Script</h1><p>Nested calls reuse existing tool cards. Raw request and response remain a fallback.</p>
  <ChatAgentTimeline items={buildChatTimeline(task, 'completed').items} conversationId="fixture" taskId="tool-script-fixture" />
</main>));
const node = id => document.querySelector(`[data-tool-call-id="${id}"]`);
const trigger = id => node(id)?.querySelector('button.aui-tool-trigger');
const checks = [];
function check(condition, message) { if (!condition) throw new Error(message); checks.push('PASS ' + message); }
const tick = () => new Promise(resolve => setTimeout(resolve, 220));
async function click(element) { if (!element) throw new Error('Missing target'); flushSync(() => element.click()); await tick(); }
async function run() {
  render(); await tick();
  check(trigger('script').textContent.includes('Tool Script'), 'Chat label is Tool Script');
  check(Boolean(node('script').querySelector('.lucide-file-code-corner')), 'Script uses FileCode2 icon');
  check(!node('read'), 'Children start collapsed with the parent');
  await click(trigger('script'));
  check(node('script').querySelectorAll('.aui-timeline-step').length === 4, 'Four child cards nest under the parent');
  check(node('read').textContent.includes('src/main.js'), 'Read card shows real path');
  check(!node('script').querySelector('.chat-tool-script-fallback, .chat-json-card'), 'Parsed calls have no parent Request / Response');
  await click(trigger('terminal'));
  check(node('terminal').textContent.includes('21 tests passed'), 'Terminal reuses the output component');
  await click(trigger('edit'));
  check(Boolean(node('edit').querySelector('.haish-tool-elements')), 'Edit reuses the diff component');
  await click(trigger('custom'));
  check(node('custom').textContent.includes('12') && Boolean(node('custom').querySelector('[role="tablist"]')), 'Unknown tool uses JSON fallback');
  check(trigger('terminal').getAttribute('aria-expanded') === 'true', 'Child cards expand independently');
  check(!node('single') && Boolean(node('single-edit')), 'Single call renders directly without a Tool Script wrapper');
  await click(trigger('single-edit'));
  check(Boolean(node('single-edit').querySelector('.haish-tool-elements')) && !node('single-edit').querySelector('.chat-json-card'), 'Single parsed edit uses the ordinary diff card without JSON');
  await click(trigger('empty'));
  check(Boolean(node('empty').querySelector('[role="tablist"]')) && !node('empty').querySelector('.aui-timeline-steps'), 'No-call script directly uses Request / Response');
  task = { eventLog: [...log, runtimeEventToLog({ type: 'tool_output_delta', call_id: 'terminal', delta: '\nUpdated output' })] };
  render(); await tick();
  check(trigger('script').getAttribute('aria-expanded') === 'true' && trigger('terminal').getAttribute('aria-expanded') === 'true', 'Event updates preserve expansion');
  check(document.documentElement.scrollWidth <= innerWidth, 'Cards fit the viewport');
}
run().catch(error => checks.push('FAIL ' + error.message)).finally(() => {
  const output = document.getElementById('checks'); output.textContent = checks.join('\n');
  output.dataset.result = checks.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});

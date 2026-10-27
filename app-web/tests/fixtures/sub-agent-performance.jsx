import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatAgentTimeline } from '../../src/features/chat/components/ChatTimelineNodes.jsx';
import { ToolApprovalsContext } from '../../src/features/chat/components/nodes/shared.js';
import { appendStreamEvent } from '../../src/features/chat/model/stream-events.js';
import { buildChatTimeline } from '../../src/features/chat/model/chat-timeline.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

const checks = [];
const report = document.getElementById('checks');
const check = (condition, name) => {
  if (!condition) throw new Error(name);
  checks.push(`PASS ${name}`);
  report.textContent = checks.join('\n');
};
const tick = async () => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 30));
};
const root = createRoot(document.getElementById('root'));
const nativeFetch = window.fetch;
window.fetch = (input, init) => String(input).includes('/api/')
  ? Promise.reject(new Error('Unexpected API call in offline fixture')) : nativeFetch(input, init);

let detailReads = 0;
let progressReads = 0;
let measuringDetails = false;
let siblingReads = 0;
let childReads = 0;
const input = { agent: 'reviewer', task: 'Review current implementation',
  get context() { detailReads += 1; return 'large request payload'; } };
const sibling = { kind: 'tool', id: 'sibling', callId: 'sibling', category: 'subagent',
  toolName: 'dispatch_sub_agent', status: 'done', toolInput: { task: 'Other task' },
  get label() { siblingReads += 1; return 'Unchanged delegate'; } };
const childInput = { get path() { childReads += 1; return 'child.js'; } };
let task = { status: 'running', toolCalls: [], eventLog: [
  { type: 'tool_call_started', callId: 'a', toolName: 'dispatch_sub_agent', toolInput: input },
  { type: 'sub_agent_tool_call_started', parentCallId: 'a', callId: 'child', toolName: 'read_file', toolInput: childInput },
  { type: 'sub_agent_tool_call_completed', parentCallId: 'a', callId: 'child', toolName: 'read_file', outputSummary: 'Read complete' },
  { type: 'sub_agent_answer_delta', parentCallId: 'a', message: 'first ', delta: 'first ' },
] };
const draw = () => {
  // The model may inspect the previous tail once when replacing a compacted
  // delta; this counter isolates UI detail traversal, not projection metadata.
  measuringDetails = false;
  const timeline = buildChatTimeline(task);
  const item = timeline.items[0];
  // Detect actual detail traversal while retaining production projection and
  // React.memo paths. Reading an entry's type is not needed by the header.
  item.progressEvents.forEach((event) => {
    if (!Object.getOwnPropertyDescriptor(event, 'type').get) {
      const type = event.type;
      // Non-enumerable instrumentation avoids React development profiling's
      // recursive prop diff; production detail code reads event.type directly.
      Object.defineProperty(event, 'type', { enumerable: false, get() { if (measuringDetails) progressReads += 1; return type; } });
    }
  });
  measuringDetails = true;
  flushSync(() => root.render(<AppTooltipProvider>
    <ChatAgentTimeline items={[item, sibling]} taskId="offline-task" mcpUserInput={false} />
  </AppTooltipProvider>));
};
const append = (text) => {
  task = { ...task, eventLog: appendStreamEvent(task.eventLog,
    { type: 'sub_agent_answer_delta', parentCallId: 'a', delta: text, message: text }) };
  draw();
};
const card = () => document.querySelector('[data-tool-call-id="a"]');
const toggle = () => card().querySelector('.aui-tool-trigger').click();

(async () => {
  try {
    draw();
    await tick();
    check(!card().querySelector('.aui-tool-panel') && detailReads === 0 && progressReads === 0,
      'Initially folded card mounts no detail panel and reads no request/progress details');
    const siblingBaseline = siblingReads;
    for (let batch = 0; batch < 20; batch += 1) { append('word '); await tick(); }
    check(detailReads === 0 && progressReads === 0, `20 folded stream updates perform zero detail reads (request=${detailReads}, progress=${progressReads})`);
    check(siblingReads === siblingBaseline, '20 stream updates and new approval context Maps do not rerender the unchanged sibling');
    toggle();
    await tick();
    check(detailReads > 0 && progressReads > 0 && card().textContent.includes('first word'),
      'Opening projects and displays the current request and streamed answer');
    const childBaseline = childReads;
    append('expanded-marker');
    await tick();
    check(card().textContent.includes('expanded-marker'), 'Expanded card updates with the latest streamed text');
    check(childReads === childBaseline, 'Expanded text updates do not rerender a completed child tool');
    toggle();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const foldedBaseline = { detailReads, progressReads };
    append(' hidden-marker');
    await tick();
    check(detailReads === foldedBaseline.detailReads && progressReads === foldedBaseline.progressReads,
      'After folding, subsequent streaming again performs zero detail reads');
    toggle();
    await tick();
    check(card().textContent.includes('hidden-marker'), 'Reopening shows all updates received while folded');
    task = { ...task, status: 'done', eventLog: appendStreamEvent(task.eventLog,
      { type: 'tool_call_completed', callId: 'a', toolName: 'dispatch_sub_agent', toolResponse: { data: { answer: 'Final reviewed answer' } } }) };
    draw();
    await tick();
    check(card().classList.contains('status-done') && card().textContent.includes('Final reviewed answer')
      && !card().querySelector('.chat-timeline-text.streaming'), 'Completion replaces partial output with the final answer and settles the header');
    const partialEvents = task.eventLog.slice(0, -1);
    for (const status of ['failed', 'cancelled']) {
      task = { ...task, status, eventLog: partialEvents };
      draw();
      await tick();
      check(card().classList.contains(`status-${status}`) && card().textContent.includes('hidden-marker')
        && !card().querySelector('.chat-timeline-text.streaming'),
        `${status} settles the header and preserves non-streaming partial output`);
    }
    // Exercise a new approval value crossing the memo boundary, without posting
    // decisions or starting a live subscription.
    const request = { request_id: 'offline-approval', task_id: 'offline-task', tool_call_id: 'a', tool_name: 'dispatch_sub_agent', raw_command: 'Review' };
    const { ChatTimelineToolNode } = await import('../../src/features/chat/components/ChatTimelineNodes.jsx');
    const approvalItem = buildChatTimeline(task).items[0];
    const drawApproval = (requests) => flushSync(() => root.render(<AppTooltipProvider>
      <ToolApprovalsContext.Provider value={requests}><ChatTimelineToolNode item={approvalItem} taskId="offline-task" /></ToolApprovalsContext.Provider>
    </AppTooltipProvider>));
    drawApproval(new Map());
    await tick();
    drawApproval(new Map([['a', request]]));
    await tick();
    check(card().classList.contains('status-approval') && Boolean(card().querySelector('.haish-approval-card')),
      'Changing approval context still reaches a memoized tool');
    drawApproval(new Map());
    await tick();
    check(!card().querySelector('.haish-approval-card'), 'Removing approval context clears the inline request');
    report.dataset.result = 'PASS';
    document.title = `PASS: ${checks.length} sub-agent performance checks`;
  } catch (error) {
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
    report.textContent = [...checks, `FAIL ${error.message}\n${error.stack || ''}`].join('\n');
  } finally {
    root.unmount();
    window.fetch = nativeFetch;
  }
})();

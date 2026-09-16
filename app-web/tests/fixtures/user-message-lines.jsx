import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';
import '../../styles/markdown.css';

// The message the user edited-and-resent in the app: a numbered prompt whose
// third item carries on to the next line. CommonMark reads that line as a lazy
// continuation of the list item, so the user bubble has to keep the break - the
// same message used to arrive folded into one line ("3. 删干净吧 先在/…").
const NUMBERED_CONTINUATION = '1. 就跟其他目录一下样就给一个<workdir>/default 这个目录呀，也就是悬停在项目的时候要有路径提示，其他UI不需要调整\n2. 共用\n3. 删干净吧\n先在/Users/zhanruitao/py-project/haish-agent-core/docs/workspace 落设计文档，然后再开始改';

const row = (role, text) => ({
  id: `${role}-row`, messageId: `saved-${role}`, role, status: 'done', text,
  conversationId: 'fixture', taskId: 'task-lines', createdAt: Date.now(),
});

flushSync(() => createRoot(document.getElementById('root')).render(
  <AppTooltipProvider>
    <main className="app-shell" style={{ padding: 24, width: 'min(760px, 92vw)' }}>
      <div className="chat-message-list" id="user-list">
        <ChatMessageRow message={row('user', NUMBERED_CONTINUATION)} annotationNumbers={new Map()} />
      </div>
      <div className="chat-message-list" id="agent-list">
        <ChatMessageRow message={row('agent', NUMBERED_CONTINUATION)} annotationNumbers={new Map()} />
      </div>
    </main>
  </AppTooltipProvider>,
));

function bubbleOf(id) {
  const body = document.querySelector(`#${id} .chat-bubble-text`);
  const rects = [];
  if (body) {
    const range = document.createRange();
    range.selectNodeContents(body);
    rects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0));
  }
  // innerText needs a laid-out box; force one reflow before giving up.
  if (body && !body.innerText) void body.offsetHeight;
  return {
    br: body ? body.querySelectorAll('br').length : -1,
    lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
    text: body ? body.innerText : '',
  };
}

window.__lineChecks = () => {
  const user = bubbleOf('user-list');
  const agent = bubbleOf('agent-list');
  const results = [
    { name: 'user bubble keeps one hard break inside the numbered item', ok: user.br === 1, detail: `br=${user.br}` },
    { name: 'the continuation line stays on its own line', ok: /删干净吧\n先在\/Users\//.test(user.text), detail: JSON.stringify(user.text.slice(-60)) },
    { name: 'the user bubble renders the prompt on at least four lines', ok: user.lines >= 4, detail: `lines=${user.lines}` },
    { name: 'the assistant bubble keeps CommonMark soft breaks', ok: agent.br === 0 && agent.text.includes('删干净吧 先在'), detail: `br=${agent.br} folded=${agent.text.includes('删干净吧 先在')}` },
  ];
  return { passed: results.every((entry) => entry.ok), results };
};

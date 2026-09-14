import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { QuoteBlock } from '../../src/shared/ui/agent-elements/Quote.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { numberAnnotations } from '../../src/features/chat/model/message-annotations.js';
import '../../styles/base.css';
import '../../styles/chat.css';

const quote = (id, source, text) => ({
  id, source_message_id: source, text, comment: `note ${id}`, start: 0, end: text.length, prefix: '', suffix: '',
});
const userMessage = (id, text, annotations) => ({
  role: 'user', id, messageId: `srv-${id}`, status: 'done', text, annotations,
  createdAt: Date.UTC(2026, 0, 1, 12, 0, 0),
});
// Two earlier turns already carry comments, so a third turn must not restart at 1.
const older = [userMessage('m0', 'earlier turn', [quote('q0', 'a0', 'older quote')])];
const messages = [
  userMessage('m1', 'first turn', [quote('q1', 'a1', 'alpha')]),
  userMessage('m2', 'second turn', [quote('q2', 'a2', 'beta'), quote('q3', 'a2', 'gamma')]),
];
const draft = quote('q4', 'a3', 'delta');
// Stable identity keeps the memoized rows from re-rendering just because the handler is new.
const jumpToQuotedText = () => {};

let rootState = { history: [], drafts: [] };

// Mirrors ChatPanel: one conversation-scoped map feeds the rows and the composer drafts.
function App({ history, drafts }) {
  const conversation = [...history, ...messages];
  const numbers = numberAnnotations(conversation, drafts);
  return (
    <AppTooltipProvider>
    <main className="annotation-numbering-fixture">
      <h1>Comment numbering regression</h1>
      <p>Production ChatMessageRow and QuoteBlock rendered with the conversation-scoped numbers.</p>
      <section id="rows" aria-label="Conversation">
        {conversation.map((message) => (
          <ChatMessageRow key={message.id} message={message} annotationNumbers={numbers} onAnnotationJump={jumpToQuotedText} />
        ))}
      </section>
      <div id="drafts" className="haish-annotation-drafts" aria-label="Comment drafts">
        {drafts.map((item) => <QuoteBlock key={item.id} item={item} index={numbers.get(item.id)} preview onJump={jumpToQuotedText} />)}
      </div>
      <pre id="checks" role="status">Running checks…</pre>
    </main>
    </AppTooltipProvider>
  );
}

const root = createRoot(document.getElementById('root'));
function render(state = rootState) {
  rootState = state;
  flushSync(() => root.render(<App history={state.history} drafts={state.drafts} />));
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 60));
const renderedNumbers = () => [...document.querySelectorAll('#rows .haish-sent-annotations .haish-quote-number')].map((node) => node.textContent);
const draftNumbers = () => [...document.querySelectorAll('#drafts .haish-quote-number')].map((node) => node.textContent);
const rowNumbers = () => [...document.querySelectorAll('#rows .chat-message-row')].map((row) => [...row.querySelectorAll('.haish-quote-number')].map((node) => node.textContent));
const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
}

function report(result, lines) {
  let node = document.getElementById('checks');
  if (!node) {
    node = document.createElement('pre');
    node.id = 'checks';
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.dataset.result = result;
  node.textContent = lines.join('\n');
}

async function run() {
  render({ history: [], drafts: [] });
  await tick();
  check(renderedNumbers().join(',') === '1,2,3', 'A later turn continues the conversation numbering instead of restarting at 1');
  check(rowNumbers().map((list) => list.join('')).join('|') === '1|23', 'Every quoted comment keeps its own number inside its turn');

  render({ history: [], drafts: [draft] });
  await tick();
  check(draftNumbers().join(',') === '4', 'Composer drafts continue the numbering of the sent comments');
  check(renderedNumbers().join(',') === '1,2,3', 'Adding a draft does not renumber sent comments');

  // A stale memo must not freeze the numbers of already mounted rows.
  render({ history: older, drafts: [draft] });
  await tick();
  check(rowNumbers().map((list) => list.join('')).join(',') === '1,2,34', 'An earlier turn renumbers every rendered row, including the mounted ones');
  check(renderedNumbers().join(',') === '1,2,3,4', 'The whole conversation keeps a single increasing sequence');
  check(draftNumbers().join(',') === '5', 'Drafts follow the shifted sequence too');

  report('PASS', checks);
}

run().catch((error) => {
  report('FAIL', [...checks, `FAIL ${error && (error.stack || error.message) || String(error)}`]);
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

const report = document.getElementById('checks');
const checks = [];
const check = (condition, name) => {
  if (!condition) throw new Error(name);
  checks.push(`PASS ${name}`);
  report.textContent = checks.join('\n');
};
const tick = async () => {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 80));
};
const wait = async (condition) => {
  for (let i = 0; i < 40; i += 1) { if (condition()) return; await tick(); }
  throw new Error('Timed out waiting for search UI');
};
let messages = Array.from({ length: 100 }, (_, index) => ({
  id: `row-${index}`, messageId: `message-${index}`, conversationId: 'search-scroll',
  role: 'agent', status: 'done', text: `Historical message ${index}. ${index === 10 || index === 45 ? 'needle-match' : 'Reading context'}.`,
  traceTimeline: index === 10 ? [{ id: 'trace-text', kind: 'text', text: 'trace-needle in execution history' }] : [],
}));
const root = createRoot(document.getElementById('root'));
const draw = (id = 'search-scroll') => flushSync(() => root.render(
  <AppTooltipProvider><ChatPanel conversationId={id} messages={messages} providerOptions={[]} /></AppTooltipProvider>,
));
const list = () => document.querySelector('.chat-message-list');
const find = () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
};
const query = (text) => {
  const input = document.querySelector('[aria-label="Find in conversation"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const top = () => list().scrollTop;
const close = () => document.querySelector('[aria-label="Close search"]').click();
const sameTop = value => Math.abs(top() - value) < 3;
const mutateLatest = () => {
  messages = messages.map((message, index) => index === 99 ? { ...message, text: `${message.text} Updated output.` } : message);
  draw();
};
async function main() {
  draw(); await tick(); await tick();
  check(top() > 0, 'new conversation starts at latest messages');
  check(list().querySelectorAll('.chat-message-row').length < 100, 'initial history is windowed');
  find(); await tick(); query('needle-match');
  await wait(() => document.querySelector('.haish-search-count')?.textContent === '1 / 2');
  await tick();
  check(list().querySelectorAll('.chat-message-row').length === 100, 'search loads old messages outside initial window');
  const first = top();
  document.querySelector('[aria-label="Next match"]').click(); await tick();
  check(top() > first + 100, 'next match navigates deliberately');
  document.querySelector('[aria-label="Previous match"]').click(); await tick();
  check(sameTop(first), 'previous match returns to first result');
  list().dispatchEvent(new WheelEvent('wheel', { deltaY: 160, bubbles: true }));
  list().scrollTop += 160; await tick();
  const reading = top();
  check(reading > first + 100, 'reader can move away from the match with search open');
  mutateLatest(); await tick(); await tick();
  check(sameTop(reading), 'new output and refreshed hit ranges do not pull the reader back');
  close(); await tick(); await tick();
  check(sameTop(reading), 'X closes search without jumping to bottom');
  check(list().querySelectorAll('.chat-message-row').length === 100, 'found history remains mounted after close');
  check(!CSS.highlights.has('conversation-matches'), 'closing removes search highlights');
  mutateLatest(); await tick();
  check(sameTop(reading), 'after closing new output preserves the reading position');

  find(); await tick(); query('needle-match'); await wait(() => document.querySelector('.haish-search-count')?.textContent === '1 / 2');
  await tick(); const beforeClear = top(); query(''); await tick(); await tick();
  check(sameTop(beforeClear), 'clearing query also preserves position');
  query('trace-needle'); await wait(() => document.querySelector('.haish-search-count')?.textContent === '1 / 1');
  await tick(); const traceTop = top();
  list().scrollTop += 120; await tick();
  document.querySelector('[aria-label="Next match"]').click(); await tick();
  check(sameTop(traceTop), 'single-result Next remains an explicit jump back to the match');
  const match = document.querySelector('.chat-timeline-text-body');
  check(Boolean(match?.getClientRects().length), 'search finds execution history text');
  document.querySelector('[aria-label="Find in conversation"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick(); await tick();
  check(sameTop(traceTop) && match?.getClientRects().length > 0, 'Escape keeps found trace open at its reading position');
  check(Boolean(document.querySelector('[aria-label="Hide steps"]')), 'trace can be collapsed manually again after close');

  document.querySelector('[aria-label="Scroll to latest message"]').click(); await tick();
  mutateLatest(); await tick();
  check(list().scrollHeight - top() - list().clientHeight < 3, 'latest button restores automatic following');
  draw('another-conversation'); await tick(); await tick();
  check(list().querySelector('.chat-row-group:not([hidden])').querySelectorAll('.chat-message-row').length < 100, 'search expansion does not leak to another conversation');
  check(list().scrollHeight - top() - list().clientHeight < 3, 'conversation switch still resets to latest');
  report.dataset.result = 'PASS';
}
main().catch(error => { report.dataset.result = 'FAIL'; report.textContent += `\nFAIL ${error.stack || error}`; });

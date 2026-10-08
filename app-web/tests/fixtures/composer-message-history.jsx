import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { usePerConversationDraft } from '../../src/features/chat/hooks/usePerConversationDraft.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

const report = document.getElementById('checks');
const checks = [];
const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(`PASS ${name}`); report.textContent = checks.join('\n'); };
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 100)); };
let controls;
const history = Array.from({ length: 80 }, (_, index) => ({ id: `user-${index}`, role: 'user', text: `User message ${index}`, status: 'done' }));
function Fixture() {
  const [scope, setScope] = React.useState('a');
  const [mounted, setMounted] = React.useState(true);
  const { draft, setDraft } = usePerConversationDraft(scope);
  controls = { draft, setDraft, setScope, setMounted };
  return <AppTooltipProvider>{mounted && <ChatPanel conversationId={scope} messages={scope === 'a' ? history : []}
    draft={draft} onDraftChange={setDraft} providerOptions={[]} />}</AppTooltipProvider>;
}
const editor = () => document.querySelector('[contenteditable="true"]');
const text = () => editor()?.textContent;
const key = (name, end = false) => {
  const el = editor(); el.focus();
  const range = document.createRange(); range.selectNodeContents(el); range.collapse(!end);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
};
async function main() {
  flushSync(() => createRoot(document.getElementById('root')).render(<Fixture />)); await tick();
  const draft = 'A long unsent draft\nSecond line with important content';
  controls.setDraft(draft); await tick();
  key('ArrowDown', true); await tick();
  check(controls.draft === draft && text().includes('important content'), 'Down without history navigation keeps the current draft');
  key('ArrowUp'); await tick();
  check(text() === 'User message 79' && controls.draft === draft, 'Up previews the latest user message without overwriting cached draft');
  key('ArrowLeft'); await tick(); key('ArrowDown', true); await tick();
  check(controls.draft === draft && text().includes('important content'), 'caret movement does not discard draft restoration');
  key('ArrowUp'); await tick(); key('ArrowUp'); await tick();
  check(text() === 'User message 78', 'repeated Up navigates older user messages');
  key('ArrowDown', true); await tick(); key('ArrowDown', true); await tick();
  check(text().includes('important content') && controls.draft === draft, 'Down past latest restores the full multiline draft');
  key('ArrowUp'); await tick(); key('Escape'); await tick();
  check(text().includes('important content'), 'Escape restores the unsent draft directly');
  key('ArrowUp'); await tick(); controls.setScope('b'); await tick();
  check(controls.draft === '' && text() === '', 'another conversation has its own draft');
  controls.setDraft('Conversation B draft'); await tick(); controls.setScope('a'); await tick();
  check(controls.draft === draft && text().includes('important content'), 'switching back restores original draft, not history preview');
  key('ArrowUp'); await tick(); controls.setMounted(false); await tick(); controls.setMounted(true); await tick();
  check(controls.draft === draft && text().includes('important content'), 'composer remount preserves cached draft');
  key('ArrowUp'); await tick();
  for (let i = 0; i < 79; i += 1) { key('ArrowUp'); await tick(); }
  check(text() === 'User message 0', 'history includes all user messages, including outside rendered message window');
  key('Escape'); await tick();
  report.dataset.result = 'PASS';
}
main().catch(error => { report.dataset.result = 'FAIL'; report.textContent += `\nFAIL ${error.stack || error}`; });

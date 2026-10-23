import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppToast } from '../../src/features/app/components/AppToast.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import '../../styles/base.css';
import '../../styles/chat.css';

const results = [];
const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
const sleep = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (ok, label) => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  const node = document.getElementById('checks');
  node.textContent = results.join('\n');
  node.dataset.result = results.some((line) => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
};

const providers = [{ id: 'router', requestProvider: 'custom.router', provider: 'openai', label: 'ai router-ds', defaultModelId: 'deepseek-v4-flash', modelOptions: [{ id: 'deepseek-v4-flash' }] }];
const agents = [{ id: 'agent', label: 'Simple Agent', skills: [{ name: 'settings-manager', description: 'Tune settings' }, { name: 'esx' }] }];
// 已有选中的 provider/model，否则 submit 会被「未配置模型」挡掉，测不到 Enter。
localStorage.setItem('skill-scope-fixture', JSON.stringify({ providerId: 'router', modelId: 'deepseek-v4-flash', reasoningEffort: null }));

const sends = { count: 0 };
let api;

function Harness() {
  // scope = composer scope（draft 按项目固定），conv = 当前会话身份（新 draft 会换）。
  const [view, setView] = React.useState({ scope: 'conv-a', conv: 'conv-a' });
  const [drafts, setDrafts] = React.useState({ 'conv-a': '', 'conv-b': '', 'draft-project:P': '' });
  const viewRef = React.useRef(view);
  viewRef.current = view;
  const draftsRef = React.useRef(drafts);
  draftsRef.current = drafts;
  const inputRef = React.useRef(null);
  // 引导提示已经改成全局 toast：夹具拿真的 AppToast 把 onToast 渲染出来。
  const [toast, setToast] = React.useState(null);
  api = {
    get draft() { return draftsRef.current[viewRef.current.scope]; },
    setDraft(text) { const scope = viewRef.current.scope; flushSync(() => setDrafts((state) => ({ ...state, [scope]: text }))); },
    open(view) { flushSync(() => setView(view)); },
    inputRef,
  };
  return <>
    <ChatComposer
    selectionStorageKey="skill-scope-fixture"
    inputRef={inputRef}
    scopeId={view.scope}
    conversationId={view.conv}
    draft={drafts[view.scope]}
    onDraftChange={(text) => setDrafts((state) => ({ ...state, [viewRef.current.scope]: text }))}
    providerOptions={providers}
    agentOptions={agents}
    defaultAgentId="agent"
    onToast={(kind, message) => setToast({ kind, message })}
    onSend={() => { sends.count += 1; return true; }}
    onStop={() => {}}
  />
    {toast && <AppToast kind={toast.kind} message={toast.message} />}
  </>;
}

createRoot(document.getElementById('root')).render(<AppTooltipProvider>
  <SchedulesContext.Provider value={{ currentConversationId: 'conv-a' }}><Harness /></SchedulesContext.Provider>
</AppTooltipProvider>);

const composer = () => document.querySelector('[contenteditable="true"]');
const tokens = () => [...document.querySelectorAll('.chat-skill-token')];
// 引导提示是 toast（可能同时存在多条）：拼起来做包含匹配。
const notice = () => [...document.querySelectorAll('.app-toast-message')].map((node) => node.textContent || '').join(' | ');
const key = (value) => composer()?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const submit = () => document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

async function focusEnd() {
  api.inputRef.current?.focusEnd?.();
  api.inputRef.current?.focusAtEnd?.();
  await sleep(120);
}

async function pickSkill() {
  api.setDraft('/settings');
  await sleep(150);
  const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('settings-manager'));
  if (!option) throw new Error('slash menu missed settings-manager');
  key('Enter');
  await sleep(150);
}

async function run() {
  await sleep(400);

  // 1) 选 skill → token。
  await pickSkill();
  check(tokens().length === 1 && tokens()[0].textContent.toLowerCase().includes('settings-manager'), 'picking the skill renders one token');

  // 2) 只选了 skill、没写内容时按回车：要有提示，不能什么都不发生。
  await focusEnd();
  key('Enter');
  await sleep(200);
  check(sends.count === 0, 'Enter on a bare skill does not send an empty message');
  check(/type a message after the skill/i.test(notice()), `Enter on a bare skill explains what is missing (notice="${notice()}")`);
  check(tokens().length === 1, 'the skill token survives the missing-text notice');

  // 3) 光标在 token 后面时，Backspace 必须能删掉它。
  await focusEnd();
  key('Backspace');
  await sleep(200);
  check(tokens().length === 0, 'Backspace right after a leading skill token removes it');

  // 4) 真的换会话：上一会话的 skill 不能跟过来；切回来时要原样回来（草稿按会话缓存）。
  await pickSkill();
  check(tokens().length === 1, 're-picking the skill renders a token again');
  api.open({ scope: 'conv-b', conv: 'conv-b' });
  await sleep(250);
  check(tokens().length === 0, 'switching conversation drops the other conversation skill token');
  check(api.draft === '', 'switching conversation starts from the empty draft of the new scope');
  api.open({ scope: 'conv-a', conv: 'conv-a' });
  await sleep(300);
  check(tokens().length === 1, 'switching back restores the skill this conversation had selected');
  check(tokens()[0].textContent.toLowerCase().includes('settings-manager'), 'the restored token is the same skill');

  // 5) 恢复回来的 token 是活的：Backspace 删得掉，删掉后切走再回来也不会诈尸。
  await focusEnd();
  key('Backspace');
  await sleep(200);
  check(tokens().length === 0, 'the restored token can be removed with Backspace');
  api.open({ scope: 'conv-b', conv: 'conv-b' });
  await sleep(250);
  api.open({ scope: 'conv-a', conv: 'conv-a' });
  await sleep(300);
  check(tokens().length === 0, 'a removed skill does not come back after another round trip');

  // 6) 换到另一条会话发消息照常。
  api.open({ scope: 'conv-b', conv: 'conv-b' });
  await sleep(250);
  api.setDraft('hello');
  await sleep(150);
  submit();
  await sleep(300);
  check(sends.count === 1, 'Enter submits a plain message in the other conversation');
  api.open({ scope: 'conv-a', conv: 'conv-a' });
  await sleep(250);
  api.open({ scope: 'conv-b', conv: 'conv-b' });
  await sleep(300);
  check(tokens().length === 0, 'a conversation that already sent does not resurrect a skill');

  // 7) 同一个项目里再开一张新会话：scope 不变（草稿文字要留着），但 skill token 必须清掉。
  api.open({ scope: 'draft-project:P', conv: 'draft-1' });
  await sleep(200);
  await pickSkill();
  api.setDraft('keep me');
  await sleep(200);
  check(tokens().length === 1 && api.draft === 'keep me', 'project draft keeps the selected skill and text');
  api.open({ scope: 'draft-project:P', conv: 'draft-2' });
  await sleep(300);
  check(tokens().length === 0, 'a new draft in the same project drops the previous skill token');
  check(api.draft === 'keep me', 'a new draft in the same project keeps the project draft text');
  api.open({ scope: 'draft-project:P', conv: 'draft-1' });
  await sleep(300);
  check(tokens().length === 1 && api.draft === 'keep me', 'going back to that draft restores its skill and text');
  api.open({ scope: 'draft-project:P', conv: 'draft-2' });
  await sleep(250);
  await focusEnd();
  submit();
  await sleep(300);
  check(sends.count === 2, 'the new draft can still send');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
}

run().catch((error) => {
  results.push(`FAIL ${error.message}`);
  const node = document.getElementById('checks');
  node.textContent = results.join('\n');
  node.dataset.result = 'FAIL';
});

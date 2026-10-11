import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useConversationRunConfig } from '../../src/features/conversations/hooks/useConversationRunConfig.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { createConversationHandlers } from '../../src/features/conversations/hooks/createConversationHandlers.js';
import { createConversationRuntime } from '../../src/features/conversations/hooks/createConversationRuntime.js';
import { AppToast } from '../../src/features/app/components/AppToast.jsx';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { WorkflowRuntimeConfig } from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';
import '../../styles/modals.css';

// Real React hook and production retry handler; all persistence is local/offline.
const report = document.getElementById('checks');
const checks = [];
const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(`PASS ${name}`); report.textContent = checks.join('\n'); };
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const base = (agent = 'a') => ({ provider: 'provider', model_id: 'model', reasoning_effort: null, execution_mode: 'chat', use_history: true, agent_id: agent });
const stored = new Map([['one', base()], ['two', base('c')]]);
const calls = [];
let hold = false;
let reject = false;
let release;
const sync = createRunConfigSync({
  get: async id => structuredClone(stored.get(id) || null),
  save: async (id, config) => {
    calls.push({ id, config: structuredClone(config) });
    if (hold) await new Promise(resolve => { release = resolve; });
    if (reject) throw new Error('disk full');
    stored.set(id, structuredClone(config));
  },
});
let controls;
const notifications = [];
const toasts = [];
function Fixture() {
  const [id, setId] = React.useState('one');
  const [config, setConfig] = React.useState(base());
  const [readOnly, setReadOnly] = React.useState(false);
  const [hasHistory, setHasHistory] = React.useState(true);
  const state = useConversationRunConfig({ sync, conversationId: id, scopeId: id, config, restore: setConfig,
    readOnly, hasSentMessage: hasHistory, onAgentSaved: agent => notifications.push({ id, agent }),
    onToast: (kind, message) => toasts.push({ kind, message }) });
  controls = { ...state, config, setConfig, setId, setReadOnly, setHasHistory };
  return <output>{id}:{config.agent_id}:{state.pending ? 'saving' : 'idle'}:{state.error}</output>;
}
const root = createRoot(document.getElementById('root'));
async function componentChecks() {
  const originalFetch = window.fetch;
  window.fetch = (input, init) => {
    if (String(input).endsWith('/api/llm/models')) return Promise.resolve(Response.json({ models: ['model'], default_model: 'model' }));
    if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
    return originalFetch(input, init);
  };
  const events = [];
  const componentToasts = [];
  let setStatus;
  const providers = [{ id: 'provider', provider: 'provider', defaultModelId: 'model', modelOptions: ['model'] }];
  const agents = [{ id: 'a', label: 'Agent A' }, { id: 'b', label: 'Agent B' }];
  stored.set('ui', base());
  function Panel() {
    const [status, update] = React.useState('failed');
    const [toast, setToast] = React.useState(null);
    const toastTimerRef = React.useRef(null);
    React.useEffect(() => () => clearTimeout(toastTimerRef.current), []);
    const { showToast } = createConversationRuntime({ setToast, toastTimerRef });
    setStatus = update;
    const messages = [{ id: 'u', role: 'user', taskId: 'task', text: 'Original input', status },
      { id: 'r', role: 'agent', taskId: 'task', text: '', error: 'offline', status, agentName: 'Agent A' }];
    return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: 'ui', configSync: sync }}>
      <ChatPanel conversationId="ui" providerOptions={providers} agentOptions={agents} defaultAgentId="a" messages={messages} hasSentMessage
        draft="New input" onDraftChange={() => {}}
        onToast={(kind, message) => { componentToasts.push({ kind, message }); showToast(kind, message); }}
        onSend={(...args) => { events.push({ type: 'send', agent: args[5], effort: args[3] }); return true; }}
        onRetryTask={(id, config) => { events.push({ type: 'retry', agent: config.agentId, effort: config.reasoningEffort }); return true; }}
        onEditMessage={(id, text, config) => { events.push({ type: 'edit', agent: config.agentId, text, effort: config.reasoningEffort }); return true; }} />
      {toast && <AppToast kind={toast.kind} message={toast.message} />}
    </SchedulesContext.Provider></AppTooltipProvider>;
  }
  flushSync(() => root.render(<Panel />)); await tick(); await tick(); await tick();
  const select = async label => {
    document.querySelector('.model-picker-trigger').click(); await tick();
    document.querySelector('[aria-label="Open agent and model settings"]').click(); await tick();
    document.querySelector('.model-picker-submenu-entry').focus(); await tick();
    [...document.querySelectorAll('.model-picker-flyout-agent [role="option"]')].find(item => item.textContent.includes(label)).click(); await tick();
  };
  const composerHeight = document.querySelector('.chat-composer').getBoundingClientRect().height;
  hold = true; await select('Agent B');
  check(!document.querySelector('.chat-config-save-status')
    && !document.querySelector('.chat-composer [data-slot="generation-loader"]')
    && stored.get('ui').agent_id === 'a' && !document.querySelector('.chat-send').disabled,
  'short save is silent and does not disable sending or claim success early');
  await new Promise(resolve => setTimeout(resolve, 750));
  const savingStatus = document.querySelector('.chat-config-control .chat-config-save-status');
  check(savingStatus?.getAttribute('role') === 'status' && savingStatus.textContent === 'Saving…'
    && getComputedStyle(savingStatus).position === 'absolute'
    && Math.abs(document.querySelector('.chat-composer').getBoundingClientRect().height - composerHeight) < 1,
  'slow save shows only a small accessible status beside configuration without changing composer height');
  const form = document.querySelector('form.chat-composer');
  document.querySelector('.chat-send').click();
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  document.querySelector('.aui-error-state button').click(); await tick();
  check(document.querySelector('.chat-send').disabled && document.querySelector('.chat-send').getAttribute('aria-busy') === 'true'
    && document.querySelector('[contenteditable="true"]') && events.length === 0 && componentToasts.length === 0,
  'real click and repeated Enter wait once for saving, input stays editable, and Retry shares the barrier');
  hold = false; release(); await tick(); await tick();
  check(events.length === 2 && events.every(event => event.agent === 'b' && event.effort === 'high'), 'real send and retry propagate committed B and normalized high effort');
  check(componentToasts.length === 1 && componentToasts[0].kind === 'info'
    && document.querySelector('.app-toast-message')?.textContent === 'Agent switched. Future tasks will use the new Agent.'
    && getComputedStyle(document.querySelector('.app-toast')).position === 'fixed'
    && !document.querySelector('.chat-composer').textContent.includes('Agent switched'), 'successful Agent switch uses the shared floating AppToast, never a composer banner');
  check(!document.querySelector('.chat-config-save-status'), 'quiet save status disappears after success');
  check(document.querySelector('.chat-message-row.agent').textContent.includes('Agent A'), 'history label remains actual A after current selection becomes B');
  setStatus('cancelled'); await tick();
  hold = true; await select('Agent A');
  document.querySelector('[aria-label="Edit message"]').click(); await tick();
  const editor = document.querySelector('.aui-edit-message textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, 'Edited input');
  editor.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  [...document.querySelectorAll('.aui-edit-actions button')].find(button => button.textContent.trim() !== 'Cancel').click(); await tick();
  check(events.length === 2 && document.querySelector('.aui-edit-message'), 'real edited resend keeps its editor while current configuration saves');
  hold = false; release(); await tick(); await tick();
  check(events.at(-1).type === 'edit' && events.at(-1).agent === 'a' && events.at(-1).text === 'Edited input' && !document.querySelector('.aui-edit-message'), 'real edit waits and sends latest A with edited input');
  reject = true; await select('Agent B'); await tick();
  check(stored.get('ui').agent_id === 'a' && document.querySelector('.app-toast-error')?.textContent.includes('disk full')
    && !document.querySelector('.chat-composer').textContent.includes('disk full'), 'real picker save failure retains A and uses the shared error toast, not a composer banner');
  check(!document.querySelector('.chat-config-save-status') && !document.querySelector('.chat-composer [data-slot="generation-loader"]'), 'failed save leaves no lingering loading state');
  check(componentToasts.length === 3 && componentToasts.at(-1).kind === 'error'
    && componentToasts.filter(toast => toast.kind === 'info').length === 2, 'failed Agent save emits exactly one error toast and no success toast');
  await new Promise(resolve => setTimeout(resolve, 3300));
  check(!document.querySelector('.app-toast'), 'shared Agent-switch feedback automatically dismisses after 3.2 seconds');
  reject = false;
  window.fetch = originalFetch;
}
async function saveInteractionChecks() {
  const originalFetch = window.fetch;
  window.fetch = (input, init) => {
    if (String(input).endsWith('/api/llm/models')) return Promise.resolve(Response.json({ models: ['model'], default_model: 'model' }));
    if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
    return originalFetch(input, init);
  };
  const sends = [], errors = [];
  const imageStore = new Map();
  function dropImage(name) {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' }));
    document.querySelector('form').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }
  const providers = [{ id: 'provider', provider: 'provider', defaultModelId: 'model', modelOptions: ['model'] }];
  const attachment = { name: 'keep.txt', uploaded: true };
  let state, fileClears = 0;
  function Composer() {
    const [id, setId] = React.useState('waiting-send');
    const [draft, setDraft] = React.useState('Clicked payload');
    state = { setId, setDraft };
    return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: id, configSync: sync }}>
      <ChatComposer scopeId={id} draft={draft} onDraftChange={setDraft} providerOptions={providers} imageStore={imageStore}
        agentOptions={[{ id: 'a', label: 'Agent A', canUploadDocuments: true }, { id: 'b', label: 'Agent B', canUploadDocuments: true }]} defaultAgentId="a"
        attachment={attachment} onClearFile={() => { fileClears += 1; }} onToast={(kind, message) => errors.push({ kind, message })}
        onSend={(...args) => { sends.push(args); return true; }} />
    </SchedulesContext.Provider></AppTooltipProvider>;
  }
  async function mount(key) {
    stored.set('waiting-send', base()); stored.set('other-send', base());
    hold = false; reject = false; imageStore.clear();
    flushSync(() => root.render(<Composer key={key} />)); await tick(); await tick(); await tick();
  }
  async function switchWithHold() {
    hold = true;
    document.querySelector('.model-picker-trigger').click(); await tick();
    document.querySelector('[aria-label="Open agent and model settings"]').click(); await tick();
    document.querySelector('.model-picker-submenu-entry').focus(); await tick();
    [...document.querySelectorAll('.model-picker-flyout-agent [role="option"]')].find(item => item.textContent.includes('Agent B')).click(); await tick();
  }
  await mount('fast');
  let observedFeedback = false;
  const observer = new MutationObserver((records) => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE
      && (node.matches('.chat-config-save-status') || node.querySelector('.chat-config-save-status'))))) observedFeedback = true;
  });
  observer.observe(document.querySelector('.chat-composer'), { childList: true, subtree: true });
  await switchWithHold();
  hold = false; release(); await new Promise(resolve => setTimeout(resolve, 780));
  observer.disconnect();
  check(!observedFeedback && !document.querySelector('.chat-config-save-status'), 'a fast completed save never flashes or leaves delayed feedback');

  await mount('draft'); await switchWithHold();
  dropImage('clicked-image.png'); await tick();
  document.querySelector('.chat-send').click(); await tick();
  state.setDraft('Next draft typed while saving'); dropImage('next-image.png'); await tick();
  hold = false; release(); await tick(); await tick();
  check(sends.length === 1 && sends[0][0] === 'Clicked payload' && sends[0][5] === 'b'
    && document.querySelector('[contenteditable="true"]').textContent === 'Next draft typed while saving',
  'waiting send uses its clicked payload and committed B without erasing newly typed text');
  check(sends[0][4].length === 1 && sends[0][4][0].file.name === 'clicked-image.png'
    && imageStore.get('waiting-send')?.length === 1 && imageStore.get('waiting-send')[0].file.name === 'next-image.png'
    && document.querySelectorAll('.chat-composer-image-chip').length === 1,
  'waiting send consumes only its submitted image and preserves newly added images');

  await mount('failed'); await switchWithHold();
  const sentBefore = sends.length, clearsBefore = fileClears, errorsBefore = errors.length;
  document.querySelector('.chat-send').click();
  document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick(); reject = true; hold = false; release(); await tick(); await tick();
  check(sends.length === sentBefore && fileClears === clearsBefore
    && document.querySelector('[contenteditable="true"]').textContent === 'Clicked payload'
    && document.querySelector('.composer-file-chip') && !document.querySelector('.haish-annotation-notice')
    && errors.length === errorsBefore + 1 && errors.at(-1).kind === 'error'
    && !document.querySelector('.chat-send').disabled,
  'failed queued send keeps text and attachment, unlocks sending, and reports one error without an input banner');

  await mount('scope'); await switchWithHold(); document.querySelector('.chat-send').click(); await tick();
  state.setId('other-send'); state.setDraft('Other conversation draft'); await tick(); await tick();
  hold = false; release(); await tick(); await tick();
  check(sends.length === sentBefore && document.querySelector('[contenteditable="true"]').textContent === 'Other conversation draft'
    && !document.querySelector('.chat-config-save-status') && !document.querySelector('.chat-send').disabled,
  'switching conversations cancels old waiting submit without touching the new draft or busy state');

  await mount('unmounted'); await switchWithHold(); document.querySelector('.chat-send').click(); await tick();
  flushSync(() => root.render(<div>Detached composer</div>));
  hold = false; release(); await tick(); await tick();
  check(sends.length === sentBefore, 'unmounting the composer prevents an old waiting submit from starting');
  reject = false; window.fetch = originalFetch;
}

async function detachedNotificationChecks() {
  for (const fails of [false, true]) {
    reject = fails;
    flushSync(() => root.render(<Fixture key={`detached-${fails}`} />)); await tick(); await tick();
    const nextAgent = controls.config.agent_id === 'a' ? 'b' : 'a';
    const count = toasts.length;
    hold = true;
    const operation = controls.changeAgent(nextAgent).then(() => true, () => false); await tick();
    flushSync(() => root.render(<div>Composer unmounted</div>));
    hold = false; release();
    const succeeded = await operation; await tick();
    check(succeeded === !fails && toasts.length === count, `${fails ? 'failed' : 'successful'} save after composer unmount emits no stale toast`);
  }
  reject = false;
}
async function modelRuleChecks() {
  const originalFetch = window.fetch;
  window.fetch = (input, init) => String(input).endsWith('/api/llm/models')
    ? Promise.resolve(Response.json({ models: ['model'], default_model: 'model' })) : originalFetch(input, init);
  const providers = [{ id: 'provider', provider: 'provider', defaultModelId: 'model', modelOptions: ['model'] }];
  let sent = 0, cleared = 0;
  const attachment = { name: 'keep.txt', uploaded: true };
  for (const [id, config] of [['unconfigured', { ...base(), provider: null, model_id: null }], ['removed', { ...base(), provider: 'removed' }], ['fresh', null]]) {
    if (config) stored.set(id, config); else stored.delete(id);
    function Missing() {
      const [draft, setDraft] = React.useState('Keep my draft');
      return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: id, configSync: sync }}>
        <ChatComposer scopeId={id} draft={draft} onDraftChange={setDraft} providerOptions={providers}
          agentOptions={[{ id: 'a', label: 'A', canUploadDocuments: true }]} defaultAgentId="a" attachment={attachment}
          onSend={() => { sent += 1; return true; }} onClearFile={() => { cleared += 1; }} />
      </SchedulesContext.Provider></AppTooltipProvider>;
    }
    flushSync(() => root.render(<Missing key={id} />)); await tick(); await tick(); await tick();
    check(document.querySelector('.chat-send').disabled && !document.querySelector('.chat-composer .haish-annotation-notice'), `${id} Chat refuses send without putting configuration hints inside the composer`);
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await tick();
    check(sent === 0 && cleared === 0 && !document.querySelector('.chat-composer .haish-annotation-notice') && document.querySelector('[contenteditable="true"]').textContent.includes('Keep my draft'), `${id} rejection preserves text and attachment without calling send or an inline hint`);
  }
  const nodeRoute = { provider: 'provider', model_id: 'model', reasoning_effort: null };
  const workflow = { id: 'wf', label: 'Bot', nodes: [{ id: 'worker', type: 'agent' }] };
  const botSends = [];
  let setNodes;
  stored.set('bot', { execution_mode: 'bot', workflow_id: 'wf', provider: null, model_id: null, reasoning_effort: null, node_runtime_configs: {} });
  function Bot() {
    const [draft, setDraft] = React.useState('Run Bot');
    const [configs, update] = React.useState({});
    setNodes = update;
    return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: 'bot', configSync: sync }}>
      <ChatComposer scopeId="bot" executionMode="bot" draft={draft} onDraftChange={setDraft} providerOptions={providers}
        agentOptions={[workflow]} defaultAgentId="wf" scheduleNodeRuntimeConfigs={configs} onRestoreNodeConfigs={update}
        onSend={(...args) => { botSends.push(args); return true; }} />
      <WorkflowRuntimeConfig value={configs.worker || {}} providerOptions={providers} onChange={(value) => update({ worker: value })} />
    </SchedulesContext.Provider></AppTooltipProvider>;
  }
  flushSync(() => root.render(<Bot />)); await tick(); await tick(); await tick();
  check(document.querySelector('.chat-send').disabled, 'Bot with an unconfigured model node cannot send');
  document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await tick();
  check(botSends.length === 0 && document.querySelector('[contenteditable="true"]').textContent.includes('Run Bot'), 'Bot rejection preserves its draft');
  setNodes({ worker: nodeRoute }); await tick(); await tick(); await tick();
  check(!document.querySelector('.chat-send').disabled && document.querySelector('[aria-label="Node thinking level"]').textContent.includes('high'), 'configured Bot nodes need no global model and display old null as high');
  document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await tick();
  check(botSends.length === 1 && botSends[0][2] === null && botSends[0][6] === null && botSends[0][9].worker.reasoning_effort === 'high', 'Bot send carries normalized high node config with no global picker route');
  check(stored.get('bot').node_runtime_configs.worker.reasoning_effort === 'high', 'Bot saves the normalized high effort');
  window.fetch = originalFetch;
}
async function main() {
  flushSync(() => root.render(<Fixture />)); await tick();
  check(controls.ready && controls.config.agent_id === 'a', 'loads committed server selection before enabling controls');
  hold = true;
  const switched = controls.changeAgent('b'); await tick();
  check(controls.pending && controls.config.agent_id === 'a' && toasts.length === 0, 'pending switch retains committed Agent and does not notify before save succeeds');
  check(calls.length === 1 && calls[0].config.agent_id === 'b', 'Agent selection is persisted immediately without a new message');
  const actions = [];
  // All three current-composer actions consume the same production commit barrier.
  const waiting = ['send', 'retry', 'edit'].map(async action => { const saved = await controls.ensureSaved(); actions.push({ action, saved }); });
  const retryCalls = [];
  const handlers = createConversationHandlers({ configSync: sync, executeQuest: async (task, id, options) => {
    retryCalls.push({ task, id, options }); options.onAccepted(true); return true;
  }, canStartDeployForConversation: () => true, getRuntime: () => null, showToast: () => {} });
  const source = { taskId: 'failed-a', userMessageId: 'user', conversationId: 'one', executionMode: 'chat', requestedAgentId: 'a', requestedProvider: 'old', requestedModelId: 'old' };
  const sidebar = handlers.handleRetryTask(source);
  await tick();
  check(actions.length === 0 && retryCalls.length === 0, 'send/retry/edit and sidebar retry all wait during save');
  hold = false; release(); await switched; await Promise.all(waiting); await sidebar; await tick();
  check(actions.every(item => item.saved.agent_id === 'b') && controls.config.agent_id === 'b', 'waiting actions receive saved B, never stale A');
  check(retryCalls[0].options.runConfig.agentId === 'b' && retryCalls[0].options.runConfig.modelId === 'model' && source.requestedAgentId === 'a', 'sidebar uses current saved config and preserves historical source identity');
  check(toasts.length === 1 && toasts[0].kind === 'info' && toasts[0].message === 'Agent switched. Future tasks will use the new Agent.' && notifications.at(-1).agent === 'b', 'real A-to-B switch sends one concise English toast');
  const toastCount = toasts.length;
  reject = true;
  let failed = false;
  try { await controls.changeAgent('a'); } catch (error) { failed = error.message === 'disk full'; }
  await tick();
  check(failed && controls.error === 'disk full' && controls.config.agent_id === 'b' && stored.get('one').agent_id === 'b', 'failed save retains committed Agent and surfaces error');
  let blocked = false;
  try { await controls.ensureSaved(); } catch { blocked = true; }
  check(blocked && toasts.length === toastCount + 1 && toasts.at(-1).kind === 'error' && toasts.at(-1).message === 'disk full', 'failed commit blocks execution and emits exactly one error toast, not success');
  const count = calls.length; await tick(); await tick();
  check(calls.length === count, 'failed save does not start an automatic retry loop');
  reject = false; await controls.changeAgent('a'); await tick();
  check(!controls.error && controls.config.agent_id === 'a', 'explicit retry of selection can recover after persistence failure');
  controls.setReadOnly(true); await tick();
  blocked = false; try { await controls.changeAgent('b'); } catch { blocked = true; }
  check(blocked && controls.config.agent_id === 'a', 'busy/read-only state rejects switching without touching selection');
  controls.setReadOnly(false); await tick();
  hold = true;
  const oldOperation = controls.changeAgent('b').then(() => false, () => true); await tick();
  controls.setId('two'); await tick();
  check(controls.config.agent_id === 'c' && controls.ready, 'another conversation loads its own selection during old save');
  const noticeCount = notifications.length;
  const staleToastCount = toasts.length;
  hold = false; release(); check(await oldOperation, 'old operation rejects stale action completion after scope changes'); await tick();
  check(controls.config.agent_id === 'c' && notifications.length === noticeCount && toasts.length === staleToastCount, 'old save cannot mutate or toast the new conversation');
  controls.setId('one'); await tick();
  check(controls.config.agent_id === 'b', 'returning to original conversation reloads its completed persisted switch');
  // Missing current config is explicit, never source/default recovery.
  stored.delete('missing');
  blocked = false; try { await handlers.handleRetryTask({ ...source, conversationId: 'missing' }); } catch { blocked = true; }
  check(blocked && retryCalls.length === 1, 'missing current retry configuration refuses to start');
  const emptyToastCount = toasts.length;
  controls.setHasHistory(false); await tick(); await controls.changeAgent('a'); await tick();
  check(toasts.length === emptyToastCount, 'empty conversation does not show a history impact toast');
  await componentChecks();
  await saveInteractionChecks();
  await detachedNotificationChecks();
  await modelRuleChecks();
  report.dataset.result = 'PASS';
}
main().catch(error => { report.dataset.result = 'FAIL'; report.textContent += `\nFAIL ${error.stack || error}`; });

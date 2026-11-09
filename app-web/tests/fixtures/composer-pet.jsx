import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { DraftProjectPicker } from '../../src/features/chat/components/DraftProjectPicker.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import '../../styles.css';

window.__petErrors = [];
window.addEventListener('error', (event) => window.__petErrors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => window.__petErrors.push(String(event.reason)));
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const model = JSON.parse(init.body).model;
      return Promise.resolve(Response.json({ models: [model], default_model: model }));
    }
    if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'default' }));
    return Promise.reject(new Error(`Unexpected API in offline fixture: ${String(input)}`));
  }
  return originalFetch(input, init);
};
const root = createRoot(document.getElementById('root'));
const providers = [{ id: 'offline', provider: 'openai', requestProvider: 'openai', defaultModelId: 'offline-model' }];
const agents = [{ id: 'simple-agent', label: 'Simple Agent' }];
const configSync = createRunConfigSync({
  get: async () => ({ execution_mode: 'chat', agent_id: 'simple-agent', provider: 'openai', model_id: 'offline-model' }),
  save: async (_id, config) => config,
});
let state = { conversationId: 'a', petRunState: 'idle', running: false, petTask: null, mode: 'chat' };
window.showPet = (next) => {
  state = { ...state, ...next };
  const common = {
    conversationId: state.conversationId, petRunState: state.petRunState, petTask: state.petTask,
    running: state.running, providerOptions: providers, agentOptions: agents, defaultAgentId: 'simple-agent',
    onSend: async () => true, onStop: () => {},
  };
  flushSync(() => root.render(<AppTooltipProvider searchRoot={document.body}>
    <SchedulesContext.Provider value={{ currentConversationId: state.conversationId, configSync }}>
    {state.mode === 'chat' ? <div className="fixture-chat"><ChatPanel {...common} draftProjectSelector={state.showProjectPicker ? <DraftProjectPicker projects={[{ id: 'alpha', name: 'Alpha project' }, { id: 'beta', name: 'Beta project' }]} selectedId="alpha" onSelect={() => {}} /> : null} messages={state.messages || [
      { id: 'user-1', role: 'user', text: '请帮我整理这个任务。', taskId: '1' },
      { id: 'agent-1', role: 'agent', text: '好的，我会处理。', taskId: '1', status: 'done' },
    ]} /></div> : <div className="fixture-workflow app-workflow-stage"><div className="workflow-run-canvas">
      <div className="workflow-composer-dock"><ChatComposer {...common} /></div>
    </div></div>}
    </SchedulesContext.Provider>
  </AppTooltipProvider>));
};
window.showPet({});

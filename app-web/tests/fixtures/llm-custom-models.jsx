import React from 'react';
import { createRoot } from 'react-dom/client';
import { LlmConfigEditor } from '../../src/features/settings/components/LlmConfigEditor.jsx';
import { runtimeLlmProviderOptions } from '../../src/features/settings/model/llm-settings.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';
import '../../src/features/settings/settings.css';

const initial = { chat: {}, vision: { providers: [] }, profiles: [
  { id: 'zhipu-test', provider: 'zhipu', auth_mode: 'api_key', api_key_configured: true, model: 'glm-5.3-flash' },
  { id: 'other-test', provider: 'custom', name: 'Other', model: 'other-model' },
] };
window.__llmFixture = { requests: [], snapshot: null };
window.fetch = async (url, init) => {
  if (!String(url).endsWith('/api/llm/models')) throw new Error('Unexpected fixture request');
  window.__llmFixture.requests.push(JSON.parse(init.body));
  await new Promise(resolve => setTimeout(resolve, 600));
  // Deliberately omit every manually added model, like Zhipu's live catalog.
  return Response.json({ provider: 'zhipu', models_source: 'remote', models: [{ id: 'glm-5.3-flash', label: 'glm-5.3-flash' }, { id: 'glm-4.7', label: 'glm-4.7' }], default_model: 'glm-5.3-flash' });
};
function Fixture() {
  const [draft, setDraft] = React.useState(initial);
  const [mount, setMount] = React.useState(0);
  window.__llmFixture.snapshot = draft;
  window.__llmFixture.runtime = runtimeLlmProviderOptions(draft);
  return <AppTooltipProvider><main className="settings-theme dark" data-settings-portal style={{ padding: 24, width: 460 }}>
    <h1>Zhipu supplemental model regression</h1>
    <div className="settings-new-editor" style={{ position: 'relative', width: '100%', height: 'auto', padding: 24 }}>
      <LlmConfigEditor key={mount} selectedId="zhipu-test" draft={draft} onDraftChange={setDraft} refreshModels />
    </div>
    <button type="button" onClick={() => {
      const persisted = JSON.parse(JSON.stringify(draft));
      for (const profile of persisted.profiles) delete profile.model_options;
      setDraft(persisted);
      setMount(value => value + 1);
    }}>Simulate save and reopen</button>
    <pre id="state" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{JSON.stringify(draft.profiles[0], null, 2)}</pre>
  </main></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

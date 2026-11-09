import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';
import '../../styles/delegation.css';
import '../../styles/app-shell.css';
import '../../src/features/settings/settings.css';

const providers = [
  { id: 'openai-main', label: 'OpenAI', provider: 'openai', authMode: 'oauth' },
  { id: 'deepseek-main', label: 'DeepSeek', provider: 'deepseek', authMode: 'api_key' },
  { id: 'xai-main', label: 'xAI', provider: 'xai', authMode: 'oauth' },
  { id: 'router-ds', label: 'ai router-ds', provider: 'custom', customProvider: 'ai router-ds' },
  { id: 'router-glm', label: 'ai router-glm', provider: 'custom', customProvider: 'ai router-glm' },
];

function Fixture() {
  return (
    <AppTooltipProvider>
      <div style={{ width: 520, margin: 24 }}>
        <ChatComposer
          scopeId="diag"
          onSend={() => true}
          onToast={() => {}}
          onStop={() => ''}
          providerOptions={providers}
          agentOptions={[{ id: 'preset.general', label: 'Task Assistant' }]}
          defaultAgentId="preset.general"
        />
      </div>
    </AppTooltipProvider>
  );
}
createRoot(document.getElementById('root')).render(<Fixture />);

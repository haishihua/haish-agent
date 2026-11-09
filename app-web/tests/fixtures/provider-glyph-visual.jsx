import React from 'react';
import { createRoot } from 'react-dom/client';
import { AgentPicker, ModelPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { saveAgentAvatar } from '../../src/shared/lib/agent-avatars.js';
import '../../styles.css';

const agents = [
  ['a', 'Task Assistant', 'All-purpose agent with full tools for everyday work.'],
  ['b', 'Simple Agent', 'Simple Code Agent'],
  ['c', 'Code Agent', 'Own requirements clarification, test-driven changes.'],
  ['d', 'Benchmark Task Assistant', 'Dedicated agent for Harbor benchmark tasks.'],
  ['e', 'computer user', 'computer user'],
  ['f', 'Image Generator', 'Dedicated image generation agent.'],
  ['g', '运营高手', '小红书运营与图文创作助手'],
  ['h', 'Data Analyst', 'Query and summarize datasets.'],
  ['i', 'Writer', 'Draft and edit long-form copy.'],
  ['j', 'Researcher', 'Search and cite external sources.'],
];
const options = agents.map(([id, label, description]) => ({ id, label, description }));
saveAgentAvatar('a', 'penguin-01');
saveAgentAvatar('b', 'penguin-10');
const providers = [
  { id: 'p1', provider: 'openai', label: 'OpenAI', authMode: 'oauth', defaultModelId: 'gpt-6.1-sol' },
  { id: 'p2', provider: 'deepseek', label: 'DeepSeek', authMode: 'api_key', defaultModelId: 'deepseek-v4-flash' },
  { id: 'p3', provider: 'custom', label: 'ai router-ds', customProvider: 'ai router-ds', defaultModelId: 'deepseek-v4-flash' },
  { id: 'p4', provider: 'xai', label: 'xAI', authMode: 'oauth', defaultModelId: 'grok-4.7' },
  { id: 'p5', provider: 'custom', label: 'ai router-glm', customProvider: 'ai router-glm', defaultModelId: 'glm-5.3' },
  { id: 'p6', provider: 'ollama', label: 'Ollama', defaultModelId: 'llama3.2' },
  { id: 'p7', provider: 'custom', label: 'ai router-gpt', customProvider: 'ai router-gpt', defaultModelId: 'gpt-6.1-sol' },
  { id: 'p8', provider: 'custom', label: 'ai-router-ds-yp', customProvider: 'ai-router-ds-yp', defaultModelId: 'deepseek-v4-flash' },
  { id: 'p9', provider: 'custom', label: 'ai router-glm-yp', customProvider: 'ai router-glm-yp', defaultModelId: 'glm-5.3' },
  { id: 'p10', provider: 'custom', label: 'ai router-claude', customProvider: 'ai router-claude', defaultModelId: 'claude-opus-5-5' },
  { id: 'p11', provider: 'openai', label: 'OpenAI (API)', authMode: 'api_key', defaultModelId: 'gpt-6.1-sol' },
  { id: 'p12', provider: 'anthropic', label: 'Anthropic', authMode: 'api_key', defaultModelId: 'claude-opus-5-5' },
];
const models = [
  ['gpt-6.1-sol', 'GPT-6.1 Sol'],
  ['deepseek-v4-flash', 'DeepSeek V4 Flash'],
  ['glm-5.3', 'GLM-5.3'],
  ['claude-opus-5-5', 'Claude Opus 5.5'],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
  ['kimi-k2.7-code', 'Kimi K2.7 Code'],
  ['qwen3-max', 'Qwen3 Max'],
  ['grok-4.7', 'Grok 4.7'],
  ['llama3.2', 'Llama 3.2'],
  ['ai router-mystery-1', 'ai router mystery'],
].map(([id, label]) => ({ id, label }));

function Fixture() {
  const [agent, setAgent] = React.useState('b');
  const [provider, setProvider] = React.useState('p3');
  const [model, setModel] = React.useState('deepseek-v4-flash');
  return <AppTooltipProvider><div className="chat-composer" style={{ position: 'absolute', bottom: 30, left: 40, width: 760, padding: 20 }}>
    <div className="chat-composer-actions"><div className="chat-composer-tools">
      <AgentPicker value={agent} options={options} onChange={setAgent} />
    </div><div className="chat-composer-submit"><div className="chat-config-control">
      <ModelPicker value={model} options={models} onChange={setModel}
        reasoningEffort="high" onReasoningChange={() => {}}
        providerValue={provider} providerOptions={providers} onProviderChange={setProvider} />
    </div></div></div>
  </div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

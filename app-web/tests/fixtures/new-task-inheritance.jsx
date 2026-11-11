import React from 'react';
import { createRoot } from 'react-dom/client';
import { useNodeRuntimeConfigs } from '../../src/features/workflow/hooks/useNodeRuntimeConfigs.js';
import { useConversationPanelActions } from '../../src/features/app/hooks/useConversationPanelActions.js';
import { inheritedTaskNodeConfigs } from '../../src/core/node-runtime-config.js';
const workflow = { id: 'inherit-fixture', nodes: [{ id: 'agent', type: 'agent' }, { id: 'judge', type: 'llm', runtime_config_from: 'agent' }] };
const route = { agent_id: 'selected-agent', llm_config_id: 'record', model_id: 'selected-model', reasoning_effort: 'low' };
const task = { taskId: 'finished', nodeRuntimeConfigs: {}, workflowRun: { nodes: { agent: { runtime_config: route } } } };
localStorage.removeItem('inherit-fixture:nodes:inherit-fixture');
function Fixture() {
  const [current, setCurrent] = React.useState(task);
  const [conversationId, setConversationId] = React.useState('source');
  const storageKey = `inherit-fixture:${conversationId}`;
  const selection = useNodeRuntimeConfigs(storageKey, workflow, current?.nodeRuntimeConfigs, current?.taskId);
  const actions = useConversationPanelActions({
    workspaceState: { projects: [] }, viewMode: 'bot',
    handleAddConversation: async (projectId) => {
      const inherited = inheritedTaskNodeConfigs(workflow, current, selection.configs);
      const nextId = `draft-${projectId}`;
      setConversationId(nextId);
      setCurrent(null);
      await Promise.resolve();
      selection.restore(inherited, workflow.id, `inherit-fixture:${nextId}`);
    },
  });
  const passed = !current && Object.entries(route).every(([key, value]) => selection.configs.agent?.[key] === value) && !selection.configs.judge;
  return <><button id="global-new" onClick={() => actions.onAddConversation('project')}>New Task</button><button id="project-new" onClick={() => actions.onAddConversation('other-project')}>Project New Task</button><pre id="result" data-result={!current ? (passed ? 'PASS' : 'FAIL') : ''}>{JSON.stringify(selection.configs)}</pre></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

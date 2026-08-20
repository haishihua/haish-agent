// @haish-esm
// World / runtime constants used by App scene orchestration.

export const MAP_W = 1536;
export const MAP_H = 1024;
export const DEFAULT_WALK_SPEED_PX_PER_SEC = 220;
export const WALK_SPEED_BY_ACTOR = {
  guts: 220,
};
export const DEFAULT_WALK_MIN_DURATION_MS = 260;
export const WALK_MIN_DURATION_BY_ACTOR = {
  guts: 210,
};
export const SCENE_WAIT_TIMEOUT_MS = 45000;
export const CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS = 8;
export const CONVERSATION_BOOTSTRAP_RETRY_DELAY_MS = 2000;
export const THINKING_PULSE_INTERVAL_MS = 1000;
export const STREAM_EVENT_BATCH_MS = 80;
export const WORLD_ROLE_TO_ACTOR = {
  'User': 'gojo',
  'Agent Gateway': 'guts',
  'LLM Hub': 'okabe',
  'Provider Node': 'kurisu',
  'Tool Manager': 'lelouch',
  'Internal Tool Executor': 'levi',
  'External Tool Executor': 'itachi',
  'RAG Executor': 'mikey',
};

export const WORLD_KIND_MAP = {
  gojo: 'deliver',
  guts: 'report',
  okabe: 'think',
  kurisu: 'llm',
  lelouch: 'deliver',
  levi: 'tool',
  itachi: 'mcp',
  mikey: 'skill',
};

const WORKFLOW_AGENT_ACTORS = ['kurisu', 'okabe', 'itachi', 'levi'];
const WORKFLOW_AGENT_ACTOR_BY_PROFILE = {
  'preset.product': 'kurisu',
  'preset.development': 'okabe',
  'preset.qa': 'itachi',
  'preset.document-qa': 'levi',
  'preset.general': 'levi',
};
const WORKFLOW_NODE_ACTOR_BY_TYPE = {
  start: 'guts',
  output: 'gojo',
  llm: 'lelouch',
  tool: 'mikey',
};

// The office has eight fixed character slots: Start, End, four Agents, LLM, and Tool.
export function workflowNodeActorBindings(workflow) {
  const usedActors = new Set();
  const agentActors = [...WORKFLOW_AGENT_ACTORS];
  const takeAgentActor = (preferred) => {
    const actor = preferred && !usedActors.has(preferred) ? preferred : agentActors.find((id) => !usedActors.has(id));
    if (actor) usedActors.add(actor);
    return actor;
  };

  return (workflow?.nodes || []).flatMap((node) => {
    const type = String(node?.type || '').toLowerCase();
    let actor = WORKFLOW_NODE_ACTOR_BY_TYPE[type];
    if (type === 'agent') actor = takeAgentActor(WORKFLOW_AGENT_ACTOR_BY_PROFILE[node?.agent_id]);
    else if (actor && !usedActors.has(actor)) usedActors.add(actor);
    else actor = null;
    if (!actor) return [];
    return [{
      actor,
      nodeId: String(node.id || ''),
      type,
      label: type === 'start' ? 'Start' : type === 'output' ? 'End' : (String(node.label || '').trim() || type.toUpperCase()),
    }];
  });
}

export const PROVIDER_ACTOR_MAP = {
  generic: { actor: 'okabe', label: 'Auto' },
  openai: { actor: 'okabe', label: 'OpenAI protocol' },
  xai: { actor: 'okabe', label: 'xAI protocol' },
  grok: { actor: 'okabe', label: 'xAI protocol' },
  deepseek: { actor: 'okabe', label: 'OpenAI protocol' },
  dashscope: { actor: 'okabe', label: 'OpenAI protocol' },
  qwen: { actor: 'okabe', label: 'OpenAI protocol' },
  zhipu: { actor: 'okabe', label: 'OpenAI protocol' },
  modelscope: { actor: 'okabe', label: 'OpenAI protocol' },
  moonshot: { actor: 'okabe', label: 'OpenAI protocol' },
  minimax: { actor: 'okabe', label: 'OpenAI protocol' },
  ollama: { actor: 'okabe', label: 'OpenAI protocol' },
  vllm: { actor: 'okabe', label: 'OpenAI protocol' },
  anthropic: { actor: 'kurisu', label: 'Anthropic protocol' },
  claude: { actor: 'kurisu', label: 'Anthropic protocol' },
};

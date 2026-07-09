// @haish-esm
// World / runtime constants used by App scene orchestration.

export const MAP_W = 1700;
export const MAP_H = 950;
export const CALIBRATION_NUDGE = 0.004;
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
export const POSE_DEBUG_DEFAULTS = { pose: 'idle', dir: 'front', movement: 'idle' };
export const POSE_DEBUG_OPTIONS = [
  { key: 'idle', label: 'Idle' },
  { key: 'think', label: 'Think' },
  { key: 'busy', label: 'Busy' },
  { key: 'report', label: 'Report' },
  { key: 'llm', label: 'LLM' },
  { key: 'tool', label: 'Tool' },
  { key: 'mcp', label: 'MCP' },
  { key: 'skill', label: 'Skill' },
  { key: 'deliver', label: 'Deliver' },
];
export const POSE_MAPPING_FIELDS = [
  { key: 'idle_front', label: 'Idle Front', type: 'idle', dir: 'front' },
  { key: 'idle_side', label: 'Idle Side', type: 'idle', dir: 'side' },
  { key: 'idle_back', label: 'Idle Back', type: 'idle', dir: 'back' },
  { key: 'walk_front', label: 'Walk Front', type: 'walk', dir: 'front' },
  { key: 'walk_side', label: 'Walk Side', type: 'walk', dir: 'side' },
  { key: 'walk_back', label: 'Walk Back', type: 'walk', dir: 'back' },
  { key: 'think', label: 'Think', type: 'pose' },
  { key: 'busy', label: 'Busy', type: 'pose' },
  { key: 'report', label: 'Report', type: 'pose' },
  { key: 'llm', label: 'LLM', type: 'pose' },
  { key: 'tool', label: 'Tool', type: 'pose' },
  { key: 'mcp', label: 'MCP', type: 'pose' },
  { key: 'skill', label: 'Skill', type: 'pose' },
  { key: 'deliver', label: 'Deliver', type: 'pose' },
];
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

export const PROVIDER_ACTOR_MAP = {
  generic: { actor: 'okabe', label: 'Auto' },
  openai: { actor: 'okabe', label: 'OpenAI protocol' },
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

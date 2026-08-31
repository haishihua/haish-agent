// Runtime model, agent, reasoning, and timeline display catalogs.

export const OPENAI_CODEX_MODEL_OPTIONS = [
  { id: 'gpt-5.5', label: 'gpt5.5' },
  { id: 'gpt-5.4', label: 'gpt5.4' },
];

export const ANTHROPIC_CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'opus4.8' },
  { id: 'claude-opus-4-7', label: 'opus4.7' },
  { id: 'claude-sonnet-4-6', label: 'sonnet4.6' },
];

export const MODEL_OPTIONS = [
  ...OPENAI_CODEX_MODEL_OPTIONS,
  ...ANTHROPIC_CLAUDE_MODEL_OPTIONS,
];

export const DEFAULT_AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant', description: 'All-purpose agent with full tools for everyday work.' },
];

export const XAI_GROK_MODEL_OPTIONS = [
  { id: 'grok-4.5', label: 'grok-4.5' },
];

export const PROVIDER_MODEL_CATALOG = {
  oauth: {
    options: MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  openai: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  codex: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  'openai/codex': {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  openai_codex_oauth: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  xai: {
    options: XAI_GROK_MODEL_OPTIONS,
    defaultModelId: 'grok-4.5',
  },
  grok: {
    options: XAI_GROK_MODEL_OPTIONS,
    defaultModelId: 'grok-4.5',
  },
  anthropic: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  claude: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  'anthropic/claude': {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  anthropic_oauth: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  deepseek: {
    options: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
    ],
    defaultModelId: 'deepseek-v4-flash',
  },
};

export const DEFAULT_REASONING_EFFORT = 'high';

export const REASONING_EFFORT_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

export const CATEGORY_ICON_CLASS = {
  tool: 'ico-tool',
  skill: 'ico-skill',
  mcp: 'ico-mcp',
  subagent: 'ico-subagent',
};

export const CATEGORY_LABEL = {
  tool: 'Tool',
  skill: 'Skill',
  mcp: 'MCP',
  subagent: 'SubAgent',
};

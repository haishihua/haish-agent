// @haish-esm
// Shared panel constants (split out so feature modules can import without cycles).

export const LIVE_FEED_VISIBLE_COUNT = 3;

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
  { id: 'preset.general', label: 'Task Assistant', description: 'Default full-tool assistant' },
  { id: 'preset.product', label: 'Product Planner', description: 'Requirements, PRDs, scope, and acceptance criteria' },
  { id: 'preset.development', label: 'Coding Assistant', description: 'Implementation, debugging, and verification' },
  { id: 'preset.qa', label: 'Test Engineer', description: 'Test design, execution, and defect reports' },
  { id: 'preset.document-qa', label: 'Docs Search', description: 'Grounded answers from indexed documents' },
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

export const NAV_ICONS = {
  dashboard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  agents: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  tasks: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  reports: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  system: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

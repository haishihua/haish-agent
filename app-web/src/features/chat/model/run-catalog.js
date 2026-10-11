// Runtime model, agent, reasoning, and timeline display catalogs.

export const DEFAULT_AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant', description: 'All-purpose agent with full tools for everyday work.' },
];

export const DEFAULT_REASONING_EFFORT = 'high';

export const REASONING_EFFORT_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

// Runtime selections are always concrete. Legacy none/null/minimal values use
// the selected Settings row's default, or the original high UI default.
export function normalizeReasoningEffort(effort, defaultEffort = DEFAULT_REASONING_EFFORT) {
  const supported = (value) => REASONING_EFFORT_OPTIONS.some((option) => option.id === value);
  return supported(effort) ? effort : (supported(defaultEffort) ? defaultEffort : DEFAULT_REASONING_EFFORT);
}

export const CATEGORY_ICON_CLASS = {
  tool: 'ico-tool',
  skill: 'ico-skill',
  mcp: 'ico-mcp',
  subagent: 'ico-subagent',
};

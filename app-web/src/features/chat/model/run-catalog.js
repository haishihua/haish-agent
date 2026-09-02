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

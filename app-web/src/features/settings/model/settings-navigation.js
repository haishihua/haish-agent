// Settings domain model.
export const SETTINGS_SECTIONS = [
  { id: 'llm', label: 'Providers' },
  { id: 'tools', label: 'Tools' },
  {
    id: 'context',
    label: 'Context',
    children: [
      { id: 'memory', label: 'Memory', icon: 'database' },
      { id: 'knowledge', label: 'Knowledge', icon: 'book-open' },
    ],
  },
  { id: 'agent', label: 'Agent' },
  { id: 'workflow', label: 'Agentic Workflow' },
];

// 平铺查找（含分组 children），供 label / copy 等元数据查询使用。
export function settingsSectionMeta(sectionId) {
  for (const section of SETTINGS_SECTIONS) {
    if (section.id === sectionId) return section;
    if (Array.isArray(section.children)) {
      const child = section.children.find((item) => item.id === sectionId);
      if (child) return child;
    }
  }
  return null;
}

export const SETTINGS_SUBTABS = {
  llm: [
    { id: 'chat', label: 'Chat' },
    { id: 'vision', label: 'Vision' },
    { id: 'embedding', label: 'Embedding' },
  ],
  tools: [
    { id: 'tools-mcp', label: 'MCP' },
    { id: 'tools-skills', label: 'Skills' },
    { id: 'tools-web', label: 'Web Search' },
  ],
};

export const SETTINGS_SECTION_COPY = {
  llm: 'Provider management',
  tools: 'Tool integrations',
  memory: 'Configure Neo4j for long-term graph memory and relationship recall.',
  knowledge: 'Configure Qdrant for document retrieval and vector search.',
  agent: 'Manage preset and custom agents for chat and workflows.',
  workflow: 'Compose multi-step agent flows with models, tools, conditions, and structured outputs.',
};

export const LLM_SUBTAB_COPY = {
  chat: 'Chat',
  vision: 'Vision',
  embedding: 'Embedding',
  'tools-mcp': 'JSON MCP config',
  'tools-skills': 'Installed skills',
  'tools-web': 'Search providers',
};

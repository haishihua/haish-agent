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
  {
    id: 'automation',
    label: 'Automation',
    children: [
      { id: 'agent', label: 'Agent', icon: 'bot' },
      { id: 'workflow', label: 'Agentic Workflow', icon: 'workflow' },
    ],
  },
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

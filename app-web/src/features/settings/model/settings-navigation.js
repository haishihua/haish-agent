import { SKILL_TABS } from './skill-inventory.js';

export const SETTINGS_SECTIONS = [
  { id: 'llm', label: 'Providers' },
  { id: 'tools', label: 'Tools' },
  {
    id: 'context',
    label: 'Context',
    children: [
      { id: 'memory', label: 'Memory', icon: 'database' },
      { id: 'embedding', label: 'Embedding', icon: 'layers' },
      { id: 'compact', label: 'Compact', icon: 'shrink' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    children: [
      { id: 'agent', label: 'Agent', icon: 'bot' },
      { id: 'workflow', label: 'Workflow', icon: 'workflow' },
    ],
  },
];

// 三类 provider 共用同一套草稿、测试接口和保存分支：导航计数、面板测试按钮、
// 「Add provider」文案、保存路由都认这一组，新增 provider 类型时只改这里。
export const LLM_PROVIDER_SECTIONS = ['llm', 'embedding', 'compact'];

export function isLlmProviderSection(section) {
  return LLM_PROVIDER_SECTIONS.includes(section);
}

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
    { id: 'image', label: 'Image' },
  ],
  tools: [
    { id: 'tools-mcp', label: 'MCP' },
    { id: 'tools-skills', label: 'Skills', children: SKILL_TABS },
    { id: 'tools-web', label: 'Web Search' },
    { id: 'tools-browser', label: 'Browser' },
  ],
};

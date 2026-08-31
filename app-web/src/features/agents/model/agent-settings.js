// Settings domain model.
export const APP_DEFAULT_AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant', description: 'All-purpose agent with full tools for everyday work.' },
];

export const DEFAULT_AGENT_TOOL_GROUPS = [
  { id: 'workspace_read', label: 'File read', description: 'Read files, list directories, search text, and glob workspace paths.', tools: ['read_file', 'list_dir', 'search_text', 'glob_files'] },
  { id: 'file_edits', label: 'File edits', description: 'Create, edit, copy, delete, checkpoint, and roll back workspace files.', tools: ['write_file', 'edit_file', 'delete_file', 'copy_file', 'create_dir', 'delete_dir', 'list_checkpoints', 'rollback_workspace'] },
  { id: 'terminal', label: 'Terminal', description: 'Run terminal commands and manage background processes.', tools: ['terminal', 'bash', 'start_background_process', 'read_background_process_output', 'stop_background_process', 'list_background_processes'] },
  { id: 'browser', label: 'Browser', description: 'Run model-written browser automation in a controlled browser-use session.', tools: ['browser_use'] },
  { id: 'user_input', label: 'Ask user', description: 'Pause the agent to ask the user structured or open questions, then continue with the answers.', tools: ['ask_user'] },
  { id: 'web', label: 'Web', description: 'Search the web and fetch pages.', tools: ['web_search', 'web_fetch'] },
  { id: 'memory', label: 'Memory', description: 'Search, add, and forget long-term memory entries.', tools: ['memory_search', 'memory_add', 'memory_forget'] },
  { id: 'knowledge', label: 'RAG', description: 'List indexed documents and search retrieval collections.', tools: ['document_list', 'rag_search'] },
  { id: 'vision', label: 'Vision', description: 'Inspect images and visual content.', tools: ['vision_analyze'] },
  { id: 'planning', label: 'Planning', description: 'Write and update task plans.', tools: ['todo_write'] },
  { id: 'sub_agent', label: 'Sub-agent', description: 'Delegate scoped work to a sub-agent.', tools: ['dispatch_sub_agent'] },
];
export const DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS = [];

const PRESET_AGENT_ICON_NAMES = {
  'preset.general': 'sparkles',
};

export function agentIconNameForItem(item) {
  if (item?.custom) return 'box';
  return PRESET_AGENT_ICON_NAMES[item?.id] || 'sparkles';
}

export function agentIconNameForAgentId(agentId, agentOptions = []) {
  const id = String(agentId || '').trim();
  if (!id) return 'sparkles';
  const match = (Array.isArray(agentOptions) ? agentOptions : []).find((item) => item.id === id);
  if (match) return agentIconNameForItem(match);
  if (PRESET_AGENT_ICON_NAMES[id]) return PRESET_AGENT_ICON_NAMES[id];
  return id.startsWith('custom.') ? 'box' : 'sparkles';
}

export const DEFAULT_AGENT_SETTINGS = {
  presets: APP_DEFAULT_AGENT_OPTIONS.map((item) => ({
    agent_id: item.id,
    profile_id: item.id,
    display_name: item.label,
    description: item.description,
    custom: false,
    system: true,
    enabled: true,
    can_toggle: item.id !== 'preset.general',
  })),
  custom: [],
  base_profiles: APP_DEFAULT_AGENT_OPTIONS.map((item) => ({
    agent_id: item.id,
    display_name: item.label,
    description: item.description,
  })),
  tool_groups: DEFAULT_AGENT_TOOL_GROUPS,
  skills: [],
  mcp_servers: [],
};

export function normalizeAgentProfileRow(item, fallback = {}) {
  const id = String(item?.agent_id || item?.profile_id || item?.id || fallback.agent_id || fallback.id || '').trim();
  const draft = Boolean(item?.draft);
  const displayName = String(item?.display_name ?? item?.label ?? fallback.display_name ?? fallback.label ?? '');
  const visibleName = draft && displayName.trim() === id ? '' : displayName;
  return {
    ...fallback,
    ...item,
    agent_id: id,
    profile_id: String(item?.profile_id || id),
    display_name: visibleName || (draft ? '' : id),
    description: String(item?.description ?? fallback.description ?? ''),
    enabled: item?.enabled !== false,
    custom: Boolean(item?.custom),
    draft,
  };
}

export function normalizeAgentToolGroups(groups) {
  const defaultsById = new Map(DEFAULT_AGENT_TOOL_GROUPS.map((group) => [group.id, group]));
  const sourceGroups = Array.isArray(groups) && groups.length ? groups : DEFAULT_AGENT_TOOL_GROUPS;
  return sourceGroups.map((group) => {
    const fallback = defaultsById.get(group?.id);
    if (!fallback) {
      return {
        ...group,
        tools: Array.isArray(group?.tools)
          ? group.tools.filter((tool) => !DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS.includes(tool))
          : [],
      };
    }
    return {
      ...fallback,
      ...group,
      tools: (Array.isArray(group?.tools) ? group.tools : fallback.tools)
        .filter((tool) => !DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS.includes(tool)),
    };
  });
}

export function normalizeAgentSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : DEFAULT_AGENT_SETTINGS;
  const presets = Array.isArray(source.presets)
    ? source.presets.map((item, index) => normalizeAgentProfileRow(item, DEFAULT_AGENT_SETTINGS.presets[index] || {})).filter((item) => item.agent_id)
    : DEFAULT_AGENT_SETTINGS.presets;
  const custom = Array.isArray(source.custom)
    ? source.custom.map((item) => normalizeAgentProfileRow(item)).filter((item) => item.agent_id)
    : [];
  const baseProfiles = Array.isArray(source.base_profiles) && source.base_profiles.length
    ? source.base_profiles.map((item, index) => normalizeAgentProfileRow(item, DEFAULT_AGENT_SETTINGS.base_profiles[index] || {})).filter((item) => item.agent_id)
    : DEFAULT_AGENT_SETTINGS.base_profiles;
  const toolGroups = normalizeAgentToolGroups(source.tool_groups);
  const skills = Array.isArray(source.skills) ? source.skills : [];
  const mcpServers = Array.isArray(source.mcp_servers) ? source.mcp_servers : [];
  return { presets, custom, base_profiles: baseProfiles, tool_groups: toolGroups, skills, mcp_servers: mcpServers };
}

export function agentCatalogFromSettings(settings) {
  const normalized = normalizeAgentSettings(settings);
  const skillsByName = new Map(
    normalized.skills
      .filter((skill) => skill?.enabled !== false)
      .map((skill) => [String(skill?.name || skill?.id || ''), skill]),
  );
  const options = [...normalized.presets, ...normalized.custom]
    .filter((item) => item.enabled !== false && !item.draft)
    .map((item) => ({
      id: item.agent_id,
      label: item.display_name,
      description: item.description,
      custom: Boolean(item.custom),
      skills: (item.effective_skills || item.skill_policy?.effective_skills || [])
        .map((name) => skillsByName.get(String(name)))
        .filter(Boolean)
        .map((skill) => ({
          name: String(skill.name || skill.id),
          description: String(skill.description || ''),
        })),
    }));
  return {
    options: options.length ? options : APP_DEFAULT_AGENT_OPTIONS,
    defaultAgentId: options.find((item) => item.id === 'preset.general')?.id || options[0]?.id || APP_DEFAULT_AGENT_OPTIONS[0].id,
  };
}

export function agentCatalogFromProfiles(payload) {
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.agents) ? payload.agents : []);
  const options = rows
    .map((item) => {
      const id = String(item?.agent_id || item?.id || item?.profile_id || '').trim();
      if (!id) return null;
      return {
        id,
        label: String(item?.display_name || item?.label || id).trim() || id,
        description: String(item?.description || '').trim(),
        custom: Boolean(item?.custom),
        canUploadDocuments: item?.can_upload_documents === true,
        skills: (item?.effective_skill_items || item?.effective_skills || []).map((skill) => ({
          name: String(skill?.name || skill || '').trim(),
          description: String(skill?.description || '').trim(),
        })).filter((skill) => skill.name),
      };
    })
    .filter(Boolean);
  return {
    options,
    defaultAgentId: options.find((item) => item.id === 'preset.general')?.id || options[0]?.id || APP_DEFAULT_AGENT_OPTIONS[0].id,
  };
}

export function matchingAgentSkills(draft, skills = []) {
  const match = String(draft || '').match(/^\s*\/([a-z0-9-]*)(?:\s+[\s\S]*)?$/i);
  if (!match) return null;
  const query = match[1].toLowerCase();
  return skills.filter((skill) => (
    String(skill.name || '').toLowerCase().includes(query)
    || String(skill.description || '').toLowerCase().includes(query)
  ));
}

export function extractAgentSkillInvocation(draft, skills = []) {
  const match = String(draft || '').match(/^\s*\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const skill = skills.find((item) => String(item.name || '').toLowerCase() === match[1].toLowerCase());
  return skill ? { skill, prompt: match[2] || '' } : null;
}

export function withSelectedSkillInstruction(text, skill) {
  const prompt = String(text || '').trim();
  return skill?.name ? `Use the ${skill.name} skill.\n${prompt}` : prompt;
}

export function workflowToolOptionsFromAgentSettings(settings) {
  const normalized = normalizeAgentSettings(settings);
  const seen = new Set();
  const options = [];
  const add = (id, label) => {
    const value = String(id || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ id: value, label: String(label || value).trim() || value });
  };
  normalized.tool_groups.forEach((group) => {
    (group.tools || []).forEach((tool) => add(tool, tool));
  });
  normalized.mcp_servers.forEach((server) => {
    (server.tools || []).forEach((tool) => {
      add(tool.qualified_name || tool.name, `${server.name} · ${tool.name || tool.qualified_name}`);
    });
  });
  return options;
}

export function agentListItems(settings) {
  const normalized = normalizeAgentSettings(settings);
  return [...normalized.presets, ...normalized.custom].map((item) => ({
    id: item.agent_id,
    title: item.display_name || (item.draft ? 'New Agent' : item.agent_id),
    kind: item.custom ? 'Custom' : (item.can_toggle === false ? 'Default' : 'Preset'),
    summary: item.draft ? 'Draft' : (item.description || (item.enabled === false ? 'Disabled' : 'Enabled')),
    protected: !item.custom,
    enabled: item.enabled !== false,
    custom: Boolean(item.custom),
    canToggle: item.can_toggle !== false && !item.custom,
    canConfigure: Boolean(item.custom) && item.readonly !== true,
    readonly: item.readonly === true || !item.custom,
  }));
}

export function withAlwaysAllowedAgentTools(tools) {
  const result = [];
  const seen = new Set();
  for (const tool of [...DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS, ...(Array.isArray(tools) ? tools : [])]) {
    if (!tool || seen.has(tool)) continue;
    seen.add(tool);
    result.push(tool);
  }
  return result;
}

export function toolsForAgentGroups(groupIds, toolGroups) {
  const selected = new Set(groupIds || []);
  const result = withAlwaysAllowedAgentTools([]);
  const seen = new Set(result);
  for (const group of toolGroups || DEFAULT_AGENT_TOOL_GROUPS) {
    if (!selected.has(group.id)) continue;
    for (const tool of group.tools || []) {
      if (seen.has(tool)) continue;
      seen.add(tool);
      result.push(tool);
    }
  }
  return result;
}

export function groupIdsForAgentTools(tools, toolGroups) {
  const allowed = new Set(tools || []);
  return (toolGroups || DEFAULT_AGENT_TOOL_GROUPS)
    .filter((group) => (group.tools || []).some((tool) => allowed.has(tool)))
    .map((group) => group.id);
}

export function createDefaultCustomAgentPayload(agentSettings) {
  const settings = normalizeAgentSettings(agentSettings);
  const base = settings.base_profiles.find((item) => item.agent_id === 'preset.general')?.agent_id
    || settings.base_profiles[0]?.agent_id
    || 'preset.general';
  const groupIds = ['workspace_read', 'planning', 'sub_agent'];
  return {
    id: `custom.agent-${Date.now()}`,
    base,
    display_name: '',
    description: '',
    enabled: true,
    custom: true,
    draft: true,
    system_prompt: '',
    tool_policy: {
      allow: toolsForAgentGroups(groupIds, settings.tool_groups),
      deny: [],
    },
    mcp_policy: { allow_servers: [], allow_tools: [] },
    skill_policy: { allow: [], deny: [] },
  };
}

// @haish-esm
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_MCP_CONFIG_JSON,
  DEFAULT_WORKFLOW_SETTINGS,
  LLM_PROVIDER_OPTIONS,
  SETTINGS_LLM_PROVIDER_OPTIONS,
  SETTINGS_SECTIONS,
  WEB_SEARCH_PROVIDER_OPTIONS,
  createDefaultSettingsRecords,
  createDefaultWebSearchSettings,
  createDefaultCustomAgentPayload,
  getLlmProvider,
  normalizeLlmProviderId,
  modelChoicesFor,
  uniqueModelChoices,
  configuredModelOptions,
  createDefaultLlmSettings,
  normalizeLlmModelConfig,
  mergeDefaultRecords,
  mergeKnownDefaultRecords,
  normalizeNeo4jDraft,
  normalizeQdrantDraft,
  agentCatalogFromSettings,
  agentListItems,
  normalizeAgentSettings,
  runtimeProviderLabel,
} from '../../lib/agent-catalog.js';
import {
  workflowListItems,
  normalizeWorkflowSettings,
  createDefaultCustomWorkflowPayload,
} from '../../lib/workflow-catalog.js';

export function getLlmConfigItems(draft, activeSubtab = 'chat') {
  const titleForConfig = (config) => {
    if (!config?.provider) return 'Provider';
    return runtimeProviderLabel(config);
  };
  if (activeSubtab === 'vision') {
    return draft.vision.enabled ? [
      {
        id: 'vision',
        title: titleForConfig(draft.vision),
        provider: draft.vision.provider,
        kind: 'Vision Provider',
        summary: draft.vision.model || 'not set',
        protected: true,
        canDelete: true,
      },
    ] : [];
  }
  if (activeSubtab === 'embedding') {
    return draft.embedding?.enabled ? [
      {
        id: 'embedding',
        title: titleForConfig(draft.embedding),
        provider: draft.embedding.provider,
        kind: 'Embedding Provider',
        summary: draft.embedding.model || 'not set',
        protected: true,
        canDelete: true,
      },
    ] : [];
  }
  return [
    ...(draft.chat?.provider ? [{
      id: 'chat',
      title: titleForConfig(draft.chat),
      provider: draft.chat.provider,
      kind: 'Provider',
      summary: draft.chat.model || 'not set',
      protected: true,
      canDelete: true,
    }] : []),
    ...(Array.isArray(draft.profiles) ? draft.profiles.filter((profile) => profile?.provider).map((profile) => ({
      id: profile.id,
      title: titleForConfig(profile),
      provider: profile.provider,
      kind: 'Provider',
      summary: profile.model || 'not set',
      protected: false,
      canDelete: true,
    })) : []),
  ];
}

export function configItemsForSection(section, llmDraft, records, activeSubtab = '', agentSettings = null, workflowSettings = null) {
  if (section === 'llm') return getLlmConfigItems(llmDraft, activeSubtab);
  if (section === 'agent') return agentListItems(agentSettings);
  if (section === 'workflow') return workflowListItems(workflowSettings);
  if (section === 'memory') {
    return Array.isArray(records?.memory) ? records.memory.map((item) => {
      const neo4j = normalizeNeo4jDraft({ ...item.neo4j, endpoint: item.endpoint });
      return {
        id: item.id,
        title: item.name,
        kind: item.kind,
        summary: neo4j.uri || 'URI not configured',
        protected: Boolean(item.protected),
        enabled: true,
      };
    }) : [];
  }
  if (section === 'knowledge') {
    return Array.isArray(records?.knowledge) ? records.knowledge.map((item) => {
      const qdrant = normalizeQdrantDraft({ ...item.qdrant, endpoint: item.endpoint });
      return {
        id: item.id,
        title: item.name,
        kind: item.kind,
        summary: qdrant.url || 'URL not configured',
        protected: Boolean(item.protected),
        enabled: true,
      };
    }) : [];
  }
  return Array.isArray(records?.[section]) ? records[section].map((item) => ({
    id: item.id,
    title: item.name,
    kind: item.kind,
    summary: section === 'tools' ? toolsRecordSummary(item) : (item.enabled ? (item.endpoint || item.notes || 'Enabled') : 'Disabled'),
    protected: Boolean(item.protected),
    enabled: item.enabled !== false,
  })) : [];
}

export function createGenericRecord(section) {
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label || 'Config';
  return {
    id: `${section}-${Date.now()}`,
    name: `New ${label} Config`,
    kind: label,
    enabled: true,
    endpoint: '',
    notes: '',
  };
}

export function createLlmProfile() {
  return {
    id: `llm-profile-${Date.now()}`,
    name: '',
    provider: 'custom',
    auth_mode: 'api_key',
    custom_provider: '',
    model: '',
    api_key: '',
    base_url: '',
    reasoning_effort: 'high',
    model_options: [],
  };
}

export function toolsRecordSummary(record) {
  if (record?.id === 'tools-mcp') {
    const parsed = parseJsonSafe(record.mcp_json || DEFAULT_MCP_CONFIG_JSON);
    if (!parsed.ok) return 'Invalid JSON';
    const servers = parsed.value?.servers && typeof parsed.value.servers === 'object' ? parsed.value.servers : {};
    return `${Object.keys(servers).length} server${Object.keys(servers).length === 1 ? '' : 's'}`;
  }
  if (record?.id === 'tools-skills') {
    const skills = Array.isArray(record.skills) ? record.skills : [];
    const enabled = skills.filter((skill) => skill.enabled !== false).length;
    return `${enabled}/${skills.length} enabled`;
  }
  if (record?.id === 'tools-web') {
    const web = normalizeWebSearchDraft(record.web_search);
    const configured = WEB_SEARCH_PROVIDER_OPTIONS
      .filter((provider) => web.providers[provider.id]?.api_key_configured || web.providers[provider.id]?.api_key)
      .map((provider) => provider.label);
    return configured.length ? `Configured: ${configured.join(', ')}` : 'No keys configured';
  }
  return record?.enabled ? (record.endpoint || record.notes || 'Enabled') : 'Disabled';
}

export function connectionBadgeMeta(status) {
  const state = String(status?.state || 'idle');
  if (state === 'success') return { className: 'success', label: 'Active', icon: true };
  if (state === 'testing') return { className: 'testing', label: 'Testing', icon: false };
  if (state === 'error') return { className: 'error', label: 'Failed', icon: false };
  return { className: 'idle', label: 'Not tested', icon: false };
}

export function parseJsonSafe(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightJsonSyntax(text) {
  return escapeHtml(text).replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g,
    (match) => {
      let cls = 'settings-json-number';
      if (match.startsWith('"')) cls = match.endsWith(':') ? 'settings-json-key' : 'settings-json-string';
      else if (match === 'true' || match === 'false') cls = 'settings-json-boolean';
      else if (match === 'null') cls = 'settings-json-null';
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function isEmptyMcpConfigDraft(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  const parsed = parseJsonSafe(raw);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return false;
  const keys = Object.keys(parsed.value);
  const servers = parsed.value.servers;
  return keys.length === 0 || (
    keys.length === 1
    && servers
    && typeof servers === 'object'
    && !Array.isArray(servers)
    && Object.keys(servers).length === 0
  );
}

export function countMcpServersFromJson(text) {
  const parsed = parseJsonSafe(text || DEFAULT_MCP_CONFIG_JSON);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return 0;
  const servers = parsed.value.servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return 0;
  return Object.keys(servers).length;
}

export function formatMcpServerCountLabel(count) {
  const total = Number.isFinite(count) && count > 0 ? count : 0;
  return `${total} mcp server${total === 1 ? '' : 's'}`;
}

export function normalizeWebSearchDraft(value) {
  const fallback = createDefaultWebSearchSettings();
  const incoming = value && typeof value === 'object' ? value : {};
  const providers = { ...fallback.providers };
  for (const provider of WEB_SEARCH_PROVIDER_OPTIONS) {
    providers[provider.id] = {
      ...providers[provider.id],
      ...(incoming.providers?.[provider.id] || {}),
    };
  }
  return {
    ...fallback,
    ...incoming,
    mode: ['hybrid', 'tavily', 'serpapi'].includes(incoming.mode) ? incoming.mode : fallback.mode,
    providers,
  };
}

export function applyToolsSettingsPayloadToRecords(records, payload) {
  if (!payload || typeof payload !== 'object') return records;
  return {
    ...records,
    tools: mergeDefaultRecords(createDefaultSettingsRecords().tools, records?.tools).map((record) => {
      if (record.id === 'tools-mcp' && payload.mcp) {
        return {
          ...record,
          mcp_path: payload.mcp.path || record.mcp_path || '',
          mcp_error: payload.mcp.error || '',
          mcp_status: '',
          mcp_json: JSON.stringify(payload.mcp.config || { servers: {} }, null, 2),
        };
      }
      if (record.id === 'tools-skills' && payload.skills) {
        return {
          ...record,
          skills: Array.isArray(payload.skills.items) ? payload.skills.items : [],
          skill_errors: Array.isArray(payload.skills.errors) ? payload.skills.errors : [],
          skill_install_root: payload.skills.install_root || '',
        };
      }
      if (record.id === 'tools-web' && payload.web_search) {
        return {
          ...record,
          web_search: normalizeWebSearchDraft(payload.web_search),
        };
      }
      return record;
    }),
  };
}

export function applyMemorySettingsPayloadToRecords(records, payload) {
  const neo4j = normalizeNeo4jDraft(payload?.neo4j);
  return {
    ...records,
    memory: mergeKnownDefaultRecords(createDefaultSettingsRecords().memory, records?.memory).map((record) => (
      record.id === 'memory-neo4j'
        ? { ...record, endpoint: neo4j.uri, neo4j }
        : record
    )),
  };
}

export function applyKnowledgeSettingsPayloadToRecords(records, payload) {
  const qdrant = normalizeQdrantDraft(payload?.qdrant);
  return {
    ...records,
    knowledge: mergeKnownDefaultRecords(createDefaultSettingsRecords().knowledge, records?.knowledge).map((record) => (
      record.id === 'knowledge-qdrant'
        ? { ...record, endpoint: qdrant.url, qdrant }
        : record
    )),
  };
}

export function buildToolsSettingsPayload(records) {
  const tools = Array.isArray(records?.tools) ? records.tools : [];
  const mcp = tools.find((item) => item.id === 'tools-mcp');
  const skills = tools.find((item) => item.id === 'tools-skills');
  const webRecord = tools.find((item) => item.id === 'tools-web');
  const parsedMcp = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
  if (!parsedMcp.ok) {
    throw new Error(`MCP JSON is invalid: ${parsedMcp.error}`);
  }
  const web = normalizeWebSearchDraft(webRecord?.web_search);
  const providers = {};
  for (const provider of WEB_SEARCH_PROVIDER_OPTIONS) {
    const draft = web.providers[provider.id] || {};
    providers[provider.id] = {
      enabled: true,
      ...(String(draft.api_key || '').trim() ? { api_key: String(draft.api_key).trim() } : {}),
    };
  }
  return {
    mcp: { config: parsedMcp.value },
    skills: {
      disabled: (Array.isArray(skills?.skills) ? skills.skills : [])
        .filter((skill) => skill.enabled === false)
        .map((skill) => skill.name || skill.id)
        .filter(Boolean),
    },
    web_search: {
      enabled: true,
      mode: 'hybrid',
      providers,
    },
  };
}

export function buildMemorySettingsPayload(records) {
  const memory = Array.isArray(records?.memory) ? records.memory : [];
  const record = memory.find((item) => item.id === 'memory-neo4j') || {};
  const neo4j = normalizeNeo4jDraft({ ...record.neo4j, endpoint: record.endpoint });
  return {
    neo4j: {
      uri: neo4j.uri,
      username: neo4j.username,
      ...(neo4j.password ? { password: neo4j.password } : {}),
      database: neo4j.database,
    },
  };
}

export function buildKnowledgeSettingsPayload(records) {
  const knowledge = Array.isArray(records?.knowledge) ? records.knowledge : [];
  const record = knowledge.find((item) => item.id === 'knowledge-qdrant') || {};
  const qdrant = normalizeQdrantDraft({ ...record.qdrant, endpoint: record.endpoint });
  return {
    qdrant: {
      url: qdrant.url,
      ...(qdrant.api_key ? { api_key: qdrant.api_key } : {}),
      collection: {
        name: qdrant.collection.name,
        vector_size: qdrant.collection.vector_size,
        distance: qdrant.collection.distance,
      },
    },
  };
}

export function getSelectedLlmConfig(draft, selectedId) {
  if (selectedId === 'vision') return draft.vision;
  if (selectedId === 'embedding') return draft.embedding;
  if (selectedId === 'chat') return draft.chat;
  return (draft.profiles || []).find((profile) => profile.id === selectedId) || draft.chat;
}

export function updateSelectedLlmConfig(onDraftChange, selectedId, patch) {
  onDraftChange((prev) => {
    if (selectedId === 'chat') return { ...prev, chat: { ...prev.chat, ...patch } };
    if (selectedId === 'vision') return { ...prev, vision: { ...prev.vision, ...patch } };
    if (selectedId === 'embedding') return { ...prev, embedding: { ...prev.embedding, ...patch } };
    return {
      ...prev,
      profiles: (prev.profiles || []).map((profile) => (
        profile.id === selectedId ? { ...profile, ...patch } : profile
      )),
    };
  });
}

export function llmProviderRequestPayload(config, { includeSecret = false, refresh = false, includeOAuth = false } = {}) {
  const provider = normalizeLlmProviderId(config.provider);
  const payload = {
    provider,
    auth_mode: config.auth_mode || getLlmProvider(provider).defaultAuth,
    custom_provider: provider === 'custom' ? String(config.name || config.custom_provider || '').trim() : '',
    model: config.model || '',
    refresh,
  };
  if (provider === 'custom') {
    payload.base_url = config.base_url || '';
  }
  if (includeSecret && config.auth_mode === 'api_key' && config.api_key) {
    payload.api_key = config.api_key;
  }
  if (includeOAuth && config.auth_mode === 'oauth') {
    payload.oauth_code = config.oauth_code || '';
    payload.oauth_verifier = config.oauth_verifier || '';
    payload.oauth_state = config.oauth_state || '';
  }
  return payload;
}

export function llmEditorModelChoices(config) {
  const discovered = configuredModelOptions(config);
  return uniqueModelChoices(
    config?.model,
    discovered.length ? discovered : modelChoicesFor(config?.provider),
  );
}



import { reconcileSettings, copySettingsResponse, hasSettingsVersion, settingsResponseIsCurrent } from '../../../shared/lib/settings-sync.js';
import {
  DEFAULT_MCP_CONFIG_JSON,
  WEB_SEARCH_PROVIDER_OPTIONS,
  createDefaultSettingsRecords,
  createDefaultWebSearchSettings,
  mergeDefaultRecords,
  mergeKnownDefaultRecords,
  normalizeQdrantDraft,
} from './settings-records.js';
import { settingsSectionMeta } from './settings-navigation.js';
import { getLlmProvider, normalizeLlmProviderId, providerAuthBadge } from '../../../core/provider-catalog.js';
import { modelChoicesFor, uniqueModelChoices, configuredModelOptions, customModelIds, runtimeProviderLabel } from './llm-settings.js';
import { DEFAULT_REASONING_EFFORT } from '../../../core/run-catalog.js';
import { agentListItems } from '../../../core/agent-settings.js';
import {
  workflowListItems,
} from '../../../core/workflow-catalog.js';

// 业务记录 id 是前端本地约定（默认草稿见 settings-records.js）：服务端 payload 里只有
// mcp / skills / web_search / memory 这些资源名，没有「哪一行记录」这回事，所以不能指望
// 服务端给记录贴 kind。把「哪个 id 属于哪类记录、摘要怎么算、payload 落到哪些字段」
// 全集中到这张表，其余模块按 kind 查表，不再逐处写死业务 id。
const RECORD_KINDS = {
  'tools-mcp': {
    kind: 'mcp',
    section: 'tools',
    resource: 'mcp',
    // 草稿跟踪比对的是 mcp_json 文本本身。
    trackedValue: (record) => record?.mcp_json,
    summary: (record) => {
      const parsed = parseJsonSafe(record.mcp_json || DEFAULT_MCP_CONFIG_JSON);
      if (!parsed.ok) return 'Invalid JSON';
      const servers = parsed.value?.servers && typeof parsed.value.servers === 'object' ? parsed.value.servers : {};
      return `${Object.keys(servers).length} server${Object.keys(servers).length === 1 ? '' : 's'}`;
    },
    applyToolsPayload: (record, payload, response) => {
      if (!payload.mcp || !settingsResponseIsCurrent(response, 'mcp')) return record;
      return {
        ...record,
        mcp_path: payload.mcp.path || record.mcp_path || '',
        mcp_error: payload.mcp.error || '',
        mcp_status: '',
        // 服务端给的缓存快照（未启动服务器）：折叠行的状态点/工具数从这里读。
        mcp_servers: Array.isArray(payload.mcp_servers) ? payload.mcp_servers : (record.mcp_servers || []),
        mcp_json: reconcileSettings('mcp', record.mcp_json, JSON.stringify(payload.mcp.config || { servers: {} }, null, 2), response),
      };
    },
  },
  'tools-skills': {
    kind: 'skills',
    section: 'tools',
    resource: 'skills',
    // 不做草稿跟踪：技能清单的基线与版本由 applyToolsPayload 里的 reconcile 自己维护。
    summary: (record) => {
      const skills = Array.isArray(record.skills) ? record.skills : [];
      const enabled = skills.filter((skill) => skill.enabled !== false).length;
      return `${enabled}/${skills.length} enabled`;
    },
    applyToolsPayload: (record, payload, response) => {
      if (!payload.skills || !settingsResponseIsCurrent(response, 'skills')) return record;
      // 返回值丢掉：这次 reconcile 只为了让基线/版本跟上响应，清单本身整段取自 payload。
      reconcileSettings('skills', record.skills, payload.skills.items || [], response);
      return {
        ...record,
        skills: Array.isArray(payload.skills.items) ? payload.skills.items : [],
        skill_groups: payload.skills.groups || null,
        skill_workspace: payload.skills.workspace || '',
        skill_inventory_ready: Array.isArray(payload.skills.items),
        skill_errors: Array.isArray(payload.skills.errors) ? payload.skills.errors : [],
        skill_install_root: payload.skills.install_root || '',
        skill_can_install: payload.skills.can_install !== false,
      };
    },
  },
  'tools-web': {
    kind: 'web-search',
    section: 'tools',
    resource: 'web_search',
    // 草稿跟踪比对的是整段 web_search 草稿。
    trackedValue: (record) => record?.web_search,
    summary: (record) => {
      const web = normalizeWebSearchDraft(record.web_search);
      const active = WEB_SEARCH_PROVIDER_OPTIONS.find((provider) => provider.id === web.provider);
      if (active) return `Active: ${active.label}`;
      const configured = WEB_SEARCH_PROVIDER_OPTIONS
        .filter((provider) => web.providers[provider.id]?.api_key_configured || web.providers[provider.id]?.api_key)
        .map((provider) => provider.label);
      return configured.length ? `Keys configured: ${configured.join(', ')} — pick one` : 'No keys configured';
    },
    applyToolsPayload: (record, payload, response) => {
      if (!payload.web_search) return record;
      return {
        ...record,
        web_search: reconcileSettings('web_search', record.web_search, normalizeWebSearchDraft(payload.web_search), response),
      };
    },
  },
  'memory-qdrant': {
    kind: 'memory',
    section: 'memory',
    resource: 'memory',
    // 记忆是整条记录参与比较：总开关和 qdrant 连接是一起保存的。
    trackedValue: (record) => record,
    applyMemoryPayload: (record, payload) => {
      const qdrant = normalizeQdrantDraft(payload?.qdrant);
      const enabled = payload?.enabled !== false;
      return reconcileSettings('memory', record, { ...record, enabled, endpoint: qdrant.url, qdrant }, payload);
    },
  },
};

function getLlmConfigItems(draft, activeSubtab = 'chat') {
  const titleForConfig = (config) => {
    if (!config?.provider) return 'Provider';
    return runtimeProviderLabel(config);
  };
  if (activeSubtab === 'vision' || activeSubtab === 'compact' || activeSubtab === 'image') {
    return (draft[activeSubtab]?.providers || []).map((provider) => ({
      id: provider.id,
      title: titleForConfig(provider),
      provider: provider.provider,
      badge: providerAuthBadge(provider.provider, provider.auth_mode),
      kind: activeSubtab === 'compact' ? 'Compact Provider' : (activeSubtab === 'image' ? 'Image Provider' : 'Vision Provider'),
      summary: provider.model || 'not set',
      protected: true,
      canDelete: true,
      canToggle: true,
      enabled: provider.enabled === true,
    }));
  }
  if (activeSubtab === 'embedding') {
    return draft.embedding?.enabled ? [
      {
        id: 'embedding',
        title: titleForConfig(draft.embedding),
        provider: draft.embedding.provider,
        badge: providerAuthBadge(draft.embedding.provider, draft.embedding.auth_mode),
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
      badge: providerAuthBadge(draft.chat.provider, draft.chat.auth_mode),
      kind: 'Provider',
      summary: draft.chat.model || 'not set',
      protected: true,
      canDelete: true,
    }] : []),
    ...(Array.isArray(draft.profiles) ? draft.profiles.filter((profile) => profile?.provider).map((profile) => ({
      id: profile.id,
      title: titleForConfig(profile),
      provider: profile.provider,
      badge: providerAuthBadge(profile.provider, profile.auth_mode),
      kind: 'Provider',
      summary: profile.model || 'not set',
      protected: false,
      canDelete: true,
    })) : []),
  ];
}

export function configItemsForSection(section, llmDraft, records, activeSubtab = '', agentSettings = null, workflowSettings = null) {
  if (section === 'llm') return getLlmConfigItems(llmDraft, activeSubtab);
  if (section === 'embedding') return getLlmConfigItems(llmDraft, 'embedding');
  if (section === 'compact') return getLlmConfigItems(llmDraft, 'compact');
  if (section === 'agent') return agentListItems(agentSettings);
  if (section === 'workflow') return workflowListItems(workflowSettings);
  if (section === 'memory') {
    return Array.isArray(records?.memory) ? records.memory.map((item) => {
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
    summary: section === 'tools' ? recordSummary(item) : (item.enabled ? (item.endpoint || item.notes || 'Enabled') : 'Disabled'),
    protected: Boolean(item.protected),
    enabled: item.enabled !== false,
  })) : [];
}

export function createGenericRecord(section) {
  const label = settingsSectionMeta(section)?.label || 'Config';
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
    _persisted: false,
    name: '',
    provider: 'custom',
    auth_mode: 'api_key',
    custom_provider: '',
    model: '',
    api_key: '',
    base_url: '',
    reasoning_effort: DEFAULT_REASONING_EFFORT,
    model_options: [],
  };
}

function genericRecordSummary(record) {
  return record?.enabled ? (record.endpoint || record.notes || 'Enabled') : 'Disabled';
}

/** 按 kind 找记录：id → kind 的映射只写在 RECORD_KINDS 里。 */
export function findSettingsRecord(records, kind) {
  return Array.isArray(records) ? records.find((record) => RECORD_KINDS[record?.id]?.kind === kind) : undefined;
}

/** 列表行摘要：表里有专属文案就用它，其余记录仍走 enabled/endpoint/notes。 */
function recordSummary(record) {
  const summary = RECORD_KINDS[record?.id]?.summary;
  return summary ? summary(record) : genericRecordSummary(record);
}

function applyToolsRecordPayload(record, payload, response) {
  const apply = RECORD_KINDS[record?.id]?.applyToolsPayload;
  return apply ? apply(record, payload, response) : record;
}

function applyMemoryRecordPayload(record, payload) {
  const apply = RECORD_KINDS[record?.id]?.applyMemoryPayload;
  return apply ? apply(record, payload) : record;
}

/**
 * settings-sync 要跟踪的草稿：哪条记录、以什么粒度参与脏值比较。
 * 只有声明了 trackedValue 的记录才跟踪，免得凭空多出一条基线。
 */
export function settingsRecordSyncTargets() {
  return Object.values(RECORD_KINDS)
    .filter((entry) => typeof entry.trackedValue === 'function')
    .map(({ kind, section, resource, trackedValue }) => ({ kind, section, resource, value: trackedValue }));
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
  // Legacy drafts carried `mode`（hybrid/tavily/serpapi）：直接丢弃，不映射。
  const providerIds = WEB_SEARCH_PROVIDER_OPTIONS.map((item) => item.id);
  return {
    ...fallback,
    ...incoming,
    mode: undefined,
    provider: providerIds.includes(incoming.provider) ? incoming.provider : fallback.provider,
    providers,
  };
}

export function applyToolsSettingsPayloadToRecords(records, payload, recordsAtRequest) {
  if (!payload || typeof payload !== 'object') return records;
  const response = payload;
  if (!hasSettingsVersion(payload)) payload = toolsSettingsPayloadForDraft(records, payload, recordsAtRequest);
  return {
    ...records,
    tools: mergeDefaultRecords(createDefaultSettingsRecords().tools, records?.tools)
      .map((record) => applyToolsRecordPayload(record, payload, response)),
  };
}

// A delayed GET/PUT fills untouched fields but cannot erase edits made while
// it was in flight (especially a newly typed key absent from server readback).
export function toolsSettingsPayloadForDraft(records, payload, recordsAtRequest) {
  if (!recordsAtRequest) return payload;
  const find = (source, kind) => findSettingsRecord(source?.tools, kind);
  const currentMcp = find(records, 'mcp');
  const initialMcp = find(recordsAtRequest, 'mcp');
  return copySettingsResponse(payload, {
    ...payload,
    mcp: initialMcp && currentMcp?.mcp_json !== initialMcp.mcp_json ? undefined : payload.mcp,
    web_search: payload.web_search ? mergeWebSearchSettings(find(records, 'web-search')?.web_search,
      payload.web_search, find(recordsAtRequest, 'web-search')?.web_search) : undefined,
  });
}

function mergeWebSearchSettings(current, incoming, initial) {
  const saved = normalizeWebSearchDraft(incoming);
  if (!initial) return saved;
  const draft = normalizeWebSearchDraft(current);
  const before = normalizeWebSearchDraft(initial);
  return {
    ...saved,
    enabled: draft.enabled !== before.enabled ? draft.enabled : saved.enabled,
    provider: draft.provider !== before.provider ? draft.provider : saved.provider,
    providers: Object.fromEntries(WEB_SEARCH_PROVIDER_OPTIONS.map(({ id }) => [id, {
      ...saved.providers[id],
      ...(draft.providers[id].api_key !== before.providers[id].api_key
        ? { api_key: draft.providers[id].api_key } : {}),
      ...(draft.providers[id].enabled !== before.providers[id].enabled
        ? { enabled: draft.providers[id].enabled } : {}),
    }])),
  };
}

export function applyMemorySettingsPayloadToRecords(records, payload) {
  return {
    ...records,
    memory: mergeKnownDefaultRecords(createDefaultSettingsRecords().memory, records?.memory)
      .map((record) => applyMemoryRecordPayload(record, payload)),
  };
}

// web_search 的写回形状只有一个出处：单选 `provider` 加六家的 `enabled`/草稿 key。
// 没选过 provider 就不发空串——后端只接受这六家里的一个，缺省交给它自己回落。
function webSearchPayload(web) {
  return {
    enabled: web.enabled !== false,
    ...(web.provider ? { provider: web.provider } : {}),
    providers: Object.fromEntries(WEB_SEARCH_PROVIDER_OPTIONS.map(({ id }) => {
      const draft = web.providers[id] || {};
      return [id, {
        enabled: draft.enabled !== false,
        ...(String(draft.api_key || '').trim() ? { api_key: String(draft.api_key).trim() } : {}),
      }];
    })),
  };
}

export function buildToolsSettingsPayload(records, resource) {
  const tools = Array.isArray(records?.tools) ? records.tools : [];
  const mcp = findSettingsRecord(tools, 'mcp');
  const skills = findSettingsRecord(tools, 'skills');
  const webRecord = findSettingsRecord(tools, 'web-search');
  if (resource === 'mcp') {
    const parsed = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
    if (!parsed.ok) throw new Error(`MCP JSON is invalid: ${parsed.error}`);
    return { mcp: { config: parsed.value } };
  }
  if (resource === 'web_search') {
    return { web_search: webSearchPayload(normalizeWebSearchDraft(webRecord?.web_search)) };
  }
  const parsedMcp = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
  if (!parsedMcp.ok) {
    throw new Error(`MCP JSON is invalid: ${parsedMcp.error}`);
  }
  const web = normalizeWebSearchDraft(webRecord?.web_search);
  return {
    mcp: { config: parsedMcp.value },
    ...(skills?.skill_inventory_ready === false ? {} : { skills: {
      disabled: (Array.isArray(skills?.skills) ? skills.skills : [])
        .filter((skill) => skill.enabled === false)
        .map((skill) => skill.name || skill.id)
        .filter(Boolean),
    } }),
    web_search: webSearchPayload(web),
  };
}

export function buildMemorySettingsPayload(records) {
  const memory = Array.isArray(records?.memory) ? records.memory : [];
  const record = findSettingsRecord(memory, 'memory') || {};
  const qdrant = normalizeQdrantDraft({ ...record.qdrant, endpoint: record.endpoint });
  return {
    // 总开关：关掉后后端不注册记忆工具、也不再每轮自动召回。
    enabled: record.enabled !== false,
    // Qdrant 连接由 memory 段持有，知识库复用同一条。
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
  const visionProvider = (draft?.vision?.providers || []).find((item) => item.id === selectedId);
  if (visionProvider) return visionProvider;
  const imageProvider = (draft?.image?.providers || []).find((item) => item.id === selectedId);
  if (imageProvider) return imageProvider;
  const compactProvider = (draft?.compact?.providers || []).find((item) => item.id === selectedId);
  if (compactProvider) return compactProvider;
  if (selectedId === 'embedding') return draft.embedding;
  if (selectedId === 'chat') return draft.chat;
  return (draft.profiles || []).find((profile) => profile.id === selectedId) || draft.chat;
}

export function updateSelectedLlmConfig(onDraftChange, selectedId, patch) {
  onDraftChange((prev) => {
    if (selectedId === 'chat') return { ...prev, chat: { ...prev.chat, ...patch } };
    if (selectedId === 'embedding') return { ...prev, embedding: { ...prev.embedding, ...patch } };
    if ((prev.compact?.providers || []).some((item) => item.id === selectedId)) {
      return { ...prev, compact: { ...prev.compact, providers: prev.compact.providers.map(item => item.id === selectedId ? { ...item, ...patch } : item) } };
    }
    if ((prev.image?.providers || []).some((item) => item.id === selectedId)) {
      return {
        ...prev,
        image: {
          ...prev.image,
          providers: prev.image.providers.map((item) => (
            item.id === selectedId ? { ...item, ...patch } : item
          )),
        },
      };
    }
    if ((prev.vision?.providers || []).some((item) => item.id === selectedId)) {
      return {
        ...prev,
        vision: {
          ...prev.vision,
          providers: prev.vision.providers.map((item) => (
            item.id === selectedId ? { ...item, ...patch } : item
          )),
        },
      };
    }
    return {
      ...prev,
      profiles: (prev.profiles || []).map((profile) => (
        profile.id === selectedId ? { ...profile, ...patch } : profile
      )),
    };
  });
}

export function llmProviderRequestPayload(config, { includeSecret = false, refresh = false, includeOAuth = false, providerType = '' } = {}) {
  const provider = normalizeLlmProviderId(config.provider);
  const payload = {
    llm_config_id: config._persisted === false ? undefined : (String(config.id || '').trim() || undefined),
    provider,
    auth_mode: config.auth_mode || getLlmProvider(provider).defaultAuth,
    custom_provider: provider === 'custom' ? String(config.name || config.custom_provider || '').trim() : '',
    model: config.model || '',
    custom_model_ids: customModelIds(config),
    refresh,
  };
  if (providerType) payload.provider_type = providerType;
  if (providerType === 'compact') {
    payload.reasoning_effort = config.reasoning_effort || 'high';
    payload.thinking = config.thinking || 'auto';
  }
  if (provider === 'custom') {
    payload.base_url = config.base_url || '';
    payload.protocol = config.protocol || 'openai';
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
    customModelIds(config),
  );
}

// Settings domain model.
export const SETTINGS_RECORDS_STORAGE_KEY = 'haish.settingsRecordsDraft.v1';
export const DEFAULT_MCP_CONFIG_JSON = JSON.stringify({ servers: {} }, null, 2);
export const MCP_CONFIG_TEMPLATE_JSON = JSON.stringify({
  servers: {
    example: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/workspace'],
      env: {},
      enabled: true,
      timeout_seconds: 30,
    },
  },
}, null, 2);
const DEFAULT_QDRANT_CONFIG = {
  url: '',
  api_key: '',
  api_key_configured: false,
  // 最近一次连接测试的结果：由后端随已保存的连接一起存回来。
  last_test: null,
  collection: {
    name: '',
    vector_size: 1024,
    distance: 'cosine',
  },
};
export const QDRANT_DISTANCE_OPTIONS = [
  { id: 'cosine', label: 'Cosine' },
  { id: 'euclid', label: 'Euclid' },
  { id: 'dot', label: 'Dot' },
];
const LEGACY_DEFAULT_QDRANT_COLLECTION = 'haish_rag_default';
export const WEB_SEARCH_PROVIDER_OPTIONS = [
  { id: 'tavily', label: 'Tavily', keyLabel: 'Tavily API Key' },
  { id: 'serpapi', label: 'SerpApi', keyLabel: 'SerpApi API Key' },
];

export function createDefaultSettingsRecords() {
  return {
    tools: [
      { id: 'tools-mcp', name: 'MCP Servers', kind: 'JSON Config', enabled: true, protected: true, endpoint: '', notes: 'Visual editor for runtime mcp.json.', mcp_json: DEFAULT_MCP_CONFIG_JSON, mcp_path: '', mcp_error: '', mcp_status: '' },
      { id: 'tools-skills', name: 'Skills', kind: 'Package Manager', enabled: true, protected: true, endpoint: '', notes: 'Install, view, enable, disable, and uninstall skills.', skills: [], skill_errors: [], skill_install_root: '' },
      { id: 'tools-web', name: 'Web Search', kind: 'Provider Keys', enabled: true, protected: true, endpoint: '', notes: 'Configure Tavily and SerpApi search keys.', web_search: createDefaultWebSearchSettings() },
    ],
    memory: [
      { id: 'memory-qdrant', name: 'Qdrant', kind: 'Vector Store', enabled: true, protected: true, endpoint: '', notes: 'Vector search for long-term memory and the knowledge base.', qdrant: normalizeQdrantDraft() },
    ],
    agent: [
      { id: 'agent-default', name: 'Default Agent', kind: 'Profile', enabled: true, endpoint: '', notes: 'Default assistant profile.' },
    ],
    workflow: [
      { id: 'workflow-default', name: 'Default Workflow', kind: 'Workflow', enabled: true, endpoint: '', notes: 'Default planning and execution workflow.' },
    ],
  };
}

export function createDefaultWebSearchSettings() {
  return {
    enabled: true,
    mode: 'hybrid',
    providers: {
      tavily: { enabled: true, api_key: '', api_key_configured: false },
      serpapi: { enabled: true, api_key: '', api_key_configured: false },
    },
  };
}

export function normalizeQdrantDraft(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const collectionRaw = raw.collection && typeof raw.collection === 'object' ? raw.collection : {};
  const vectorSize = Number.parseInt(collectionRaw.vector_size ?? raw.vector_size ?? DEFAULT_QDRANT_CONFIG.collection.vector_size, 10);
  const distance = String(collectionRaw.distance ?? raw.distance ?? DEFAULT_QDRANT_CONFIG.collection.distance).trim().toLowerCase();
  const collectionName = String(collectionRaw.name ?? raw.collection_name ?? DEFAULT_QDRANT_CONFIG.collection.name).trim();
  return {
    ...DEFAULT_QDRANT_CONFIG,
    url: String(raw.url ?? raw.endpoint ?? DEFAULT_QDRANT_CONFIG.url).trim(),
    api_key: String(raw.api_key ?? '').trim(),
    api_key_configured: Boolean(raw.api_key_configured),
    last_test: raw.last_test && typeof raw.last_test === 'object' ? raw.last_test : DEFAULT_QDRANT_CONFIG.last_test,
    collection: {
      name: collectionName === LEGACY_DEFAULT_QDRANT_COLLECTION ? '' : collectionName,
      vector_size: Number.isFinite(vectorSize) && vectorSize > 0 ? vectorSize : DEFAULT_QDRANT_CONFIG.collection.vector_size,
      distance: QDRANT_DISTANCE_OPTIONS.some((item) => item.id === distance) ? distance : DEFAULT_QDRANT_CONFIG.collection.distance,
    },
  };
}

export function mergeDefaultRecords(defaultRecords, storedRecords) {
  const stored = Array.isArray(storedRecords) ? storedRecords : [];
  const byId = new Map(stored.map((item) => [item?.id, item]));
  const merged = defaultRecords.map((item) => ({ ...item, ...(byId.get(item.id) || {}) }));
  const known = new Set(defaultRecords.map((item) => item.id));
  return [...merged, ...stored.filter((item) => item?.id && !known.has(item.id))];
}

export function mergeKnownDefaultRecords(defaultRecords, storedRecords) {
  const stored = Array.isArray(storedRecords) ? storedRecords : [];
  const byId = new Map(stored.map((item) => [item?.id, item]));
  return defaultRecords.map((item) => ({ ...item, ...(byId.get(item.id) || {}) }));
}

export function loadSettingsRecordsDraft() {
  const fallback = createDefaultSettingsRecords();
  try {
    const raw = window.localStorage?.getItem(SETTINGS_RECORDS_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(fallback).map(([section, records]) => [
        section,
        section === 'memory'
          ? mergeKnownDefaultRecords(records, stored?.[section])
          : mergeDefaultRecords(records, stored?.[section]),
      ]),
    );
  } catch {
    return fallback;
  }
}

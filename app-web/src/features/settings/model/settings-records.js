// Settings domain model.
export const SETTINGS_RECORDS_STORAGE_KEY = 'haish.settingsRecordsDraft.v1';
export const SETTINGS_CONNECTION_STATUS_STORAGE_KEY = 'haish.settingsConnectionStatus.v1';
export const SETTINGS_CONNECTION_SECTIONS = ['memory', 'knowledge'];
export const SETTINGS_PERSISTED_CONNECTION_STATES = new Set(['success', 'error']);
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
export const DEFAULT_NEO4J_CONFIG = {
  uri: '',
  username: '',
  password: '',
  password_configured: false,
  database: '',
};
export const DEFAULT_QDRANT_CONFIG = {
  url: '',
  api_key: '',
  api_key_configured: false,
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
export const LEGACY_DEFAULT_QDRANT_COLLECTION = 'haish_rag_default';
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
      { id: 'memory-neo4j', name: 'Neo4j', kind: 'Graph Memory', protected: true, endpoint: '', notes: 'Graph-backed long-term memory.', neo4j: normalizeNeo4jDraft() },
    ],
    knowledge: [
      { id: 'knowledge-qdrant', name: 'Qdrant', kind: 'Vector Store', protected: true, endpoint: '', notes: 'Vector search for indexed documents.', qdrant: normalizeQdrantDraft() },
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

export function normalizeNeo4jDraft(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_NEO4J_CONFIG,
    uri: String(raw.uri ?? raw.endpoint ?? DEFAULT_NEO4J_CONFIG.uri).trim(),
    username: String(raw.username ?? DEFAULT_NEO4J_CONFIG.username).trim(),
    password: String(raw.password ?? '').trim(),
    password_configured: Boolean(raw.password_configured),
    database: String(raw.database ?? DEFAULT_NEO4J_CONFIG.database).trim(),
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
        ['memory', 'knowledge'].includes(section)
          ? mergeKnownDefaultRecords(records, stored?.[section])
          : mergeDefaultRecords(records, stored?.[section]),
      ]),
    );
  } catch {
    return fallback;
  }
}

export function settingsConnectionRecord(records, section, itemId) {
  const items = Array.isArray(records?.[section]) ? records[section] : [];
  return items.find((item) => item?.id === itemId) || null;
}

export function settingsConnectionSignature(section, record) {
  if (!record) return '';
  if (section === 'memory') {
    const rawNeo4j = record.neo4j || {};
    const neo4j = normalizeNeo4jDraft({ ...rawNeo4j, uri: rawNeo4j.uri || record.endpoint });
    if (!neo4j.uri) return '';
    return JSON.stringify(['memory', neo4j.uri, neo4j.username, Boolean(neo4j.password || neo4j.password_configured), neo4j.database]);
  }
  if (section === 'knowledge') {
    const rawQdrant = record.qdrant || {};
    const qdrant = normalizeQdrantDraft({ ...rawQdrant, url: rawQdrant.url || record.endpoint });
    if (!qdrant.url) return '';
    return JSON.stringify([
      'knowledge',
      qdrant.url,
      Boolean(qdrant.api_key || qdrant.api_key_configured),
      qdrant.collection?.name || '',
      qdrant.collection?.vector_size || '',
      qdrant.collection?.distance || '',
    ]);
  }
  return '';
}

export function settingsConnectionSignatureFor(records, section, itemId) {
  return settingsConnectionSignature(section, settingsConnectionRecord(records, section, itemId));
}

export function sanitizeSettingsConnectionStatus(status, records) {
  const next = { memory: {}, knowledge: {} };
  for (const section of SETTINGS_CONNECTION_SECTIONS) {
    const items = Array.isArray(records?.[section]) ? records[section] : [];
    for (const item of items) {
      const itemStatus = status?.[section]?.[item.id];
      if (!SETTINGS_PERSISTED_CONNECTION_STATES.has(String(itemStatus?.state || ''))) continue;
      const signature = settingsConnectionSignature(section, item);
      if (!signature || itemStatus.signature !== signature) continue;
      next[section][item.id] = {
        state: String(itemStatus.state),
        message: String(itemStatus.message || ''),
        signature,
      };
    }
  }
  return next;
}

export function loadSettingsConnectionStatus(records) {
  try {
    const raw = window.localStorage?.getItem(SETTINGS_CONNECTION_STATUS_STORAGE_KEY);
    return sanitizeSettingsConnectionStatus(raw ? JSON.parse(raw) : null, records);
  } catch {
    return { memory: {}, knowledge: {} };
  }
}

export function persistSettingsConnectionStatus(status, records) {
  try {
    window.localStorage?.setItem(
      SETTINGS_CONNECTION_STATUS_STORAGE_KEY,
      JSON.stringify(sanitizeSettingsConnectionStatus(status, records)),
    );
  } catch {
    // Ignore storage failures; the live status still updates in React state.
  }
}

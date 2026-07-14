// @haish-esm
// Agent catalog, LLM/settings draft defaults, and pure normalize helpers (UI-free).

export const APP_DEFAULT_AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant', description: 'All-purpose agent with full tools for everyday work.' },
  { id: 'preset.product', label: 'Product Planner', description: 'Shape requirements, PRDs, scope, risks, and acceptance criteria.' },
  { id: 'preset.development', label: 'Coding Assistant', description: 'Build, debug, and refactor code with lightweight self-checks.' },
  { id: 'preset.qa', label: 'Test Engineer', description: 'Design tests, reproduce issues, verify changes, and gate releases.' },
  { id: 'preset.document-qa', label: 'Docs Search', description: 'Answer from indexed documents with retrieved, citable evidence.' },
];

export const DEFAULT_AGENT_TOOL_GROUPS = [
  { id: 'workspace_read', label: 'File read', description: 'Read files, list directories, search text, and glob workspace paths.', tools: ['read_file', 'list_dir', 'search_text', 'glob_files'] },
  { id: 'file_edits', label: 'File edits', description: 'Create, edit, copy, delete, checkpoint, and roll back workspace files.', tools: ['write_file', 'edit_file', 'delete_file', 'copy_file', 'create_dir', 'delete_dir', 'list_checkpoints', 'rollback_workspace'] },
  { id: 'terminal', label: 'Terminal', description: 'Run terminal commands and manage background processes.', tools: ['terminal', 'start_background_process', 'read_background_process_output', 'stop_background_process', 'list_background_processes'] },
  { id: 'browser', label: 'Browser', description: 'Navigate, inspect, click, type, scroll, evaluate, and screenshot browser pages.', tools: ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_scroll', 'browser_press_key', 'browser_console', 'browser_evaluate', 'browser_screenshot', 'browser_wait_for'] },
  { id: 'web', label: 'Web', description: 'Search the web and fetch pages.', tools: ['web_search', 'web_fetch'] },
  { id: 'memory', label: 'Memory', description: 'Search, add, and forget long-term memory entries.', tools: ['memory_search', 'memory_add', 'memory_forget'] },
  { id: 'knowledge', label: 'RAG', description: 'List indexed documents and search retrieval collections.', tools: ['document_list', 'rag_search'] },
  { id: 'vision', label: 'Vision', description: 'Inspect images and visual content.', tools: ['vision_analyze'] },
  { id: 'planning', label: 'Planning', description: 'Write and update task plans.', tools: ['todo_write'] },
  { id: 'sub_agent', label: 'Sub-agent', description: 'Delegate scoped work to a sub-agent.', tools: ['dispatch_sub_agent'] },
];
export const DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS = [];

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

export const DIRECT_AGENT_WORKFLOW_ID = 'workflow.direct-agent';
export const SOFTWARE_DEVELOPMENT_WORKFLOW_ID = 'workflow.software-development';
export const DEFAULT_WORKFLOW_NODE_TYPES = [
  { id: 'agent', label: 'Agent', description: 'Invoke an assistant profile over A2A.' },
  { id: 'llm', label: 'LLM', description: 'Run a direct model call with prompt parameters.' },
  { id: 'tool', label: 'Tool', description: 'Call an exposed tool with mapped arguments.' },
  { id: 'condition', label: 'Condition', description: 'Route execution based on an expression.' },
  { id: 'output', label: 'End', description: 'Return the workflow result.' },
];

export const DEFAULT_WORKFLOW_INPUT_SCHEMA = {
  type: 'object',
  fields: [
    {
      id: 'message',
      label: 'Message',
      type: 'string',
      required: true,
      path: 'input.message',
      description: 'User message that starts the workflow.',
    },
    {
      id: 'attachments',
      label: 'Attachments',
      type: 'array',
      required: false,
      path: 'input.attachments',
      description: 'Files attached to the user request.',
    },
    {
      id: 'image_attachments',
      label: 'Images',
      type: 'array',
      required: false,
      path: 'input.image_attachments',
      description: 'Images attached to the user request.',
    },
    {
      id: 'conversation_id',
      label: 'Conversation ID',
      type: 'string',
      required: false,
      path: 'input.conversation_id',
      description: 'Current conversation identifier.',
    },
    {
      id: 'workspace',
      label: 'Workspace',
      type: 'string',
      required: false,
      path: 'input.workspace',
      description: 'Active workspace path for this run.',
    },
  ],
};

export const COMMON_WORKFLOW_OUTPUT_FIELDS = [
  {
    id: 'status',
    label: 'Status',
    type: 'string',
    group: 'status',
    description: 'Run status such as completed or failed.',
  },
  {
    id: 'success',
    label: 'Success',
    type: 'boolean',
    group: 'status',
    description: 'Whether this node finished successfully.',
  },
  {
    id: 'summary',
    label: 'Summary',
    type: 'string',
    group: 'result',
    description: 'Main text result. Usually the answer to pass downstream.',
  },
  {
    id: 'error',
    label: 'Error',
    type: 'string',
    group: 'status',
    description: 'Error message when the node fails.',
  },
  {
    id: 'metadata',
    label: 'Metadata',
    type: 'object',
    group: 'debug',
    description: 'Extra run metadata such as timing and node info.',
  },
];

export const WORKFLOW_NODE_OUTPUT_FIELDS = {
  start: [{
    id: 'structured',
    label: 'Input object',
    type: 'object',
    group: 'result',
    description: 'Full start input payload as one object.',
  }],
  agent: [
    {
      id: 'messages',
      label: 'Messages',
      type: 'array',
      group: 'result',
      description: 'Conversation messages produced during the agent run.',
    },
    {
      id: 'artifacts',
      label: 'Artifacts',
      type: 'array',
      group: 'result',
      description: 'Files or other artifacts the agent created.',
    },
    {
      id: 'structured',
      label: 'Structured',
      type: 'object',
      group: 'result',
      description: 'Structured payload returned by the agent, if any.',
    },
    {
      id: 'citations',
      label: 'Citations',
      type: 'array',
      group: 'result',
      description: 'Sources cited from retrieval or web search.',
    },
    {
      id: 'trace',
      label: 'Trace',
      type: 'object',
      group: 'debug',
      description: 'Execution trace for debugging the agent run.',
    },
  ],
  llm: [
    {
      id: 'text',
      label: 'Text',
      type: 'string',
      group: 'result',
      description: 'Model response as plain text.',
    },
    {
      id: 'json',
      label: 'JSON',
      type: 'object',
      group: 'result',
      description: 'Parsed JSON when response format is JSON object.',
    },
    {
      id: 'usage',
      label: 'Usage',
      type: 'object',
      group: 'debug',
      description: 'Token usage for this model call.',
    },
    {
      id: 'finish_reason',
      label: 'Finish reason',
      type: 'string',
      group: 'status',
      description: 'Why the model stopped generating.',
    },
  ],
  tool: [
    {
      id: 'text',
      label: 'Text',
      type: 'string',
      group: 'result',
      description: 'Tool result rendered as text.',
    },
    {
      id: 'json',
      label: 'JSON',
      type: 'object',
      group: 'result',
      description: 'Tool result as structured JSON when available.',
    },
    {
      id: 'artifacts',
      label: 'Artifacts',
      type: 'array',
      group: 'result',
      description: 'Files or artifacts produced by the tool.',
    },
    {
      id: 'raw',
      label: 'Raw result',
      type: 'object',
      group: 'debug',
      description: 'Full raw tool response for debugging.',
    },
  ],
  condition: [
    {
      id: 'matched_case',
      label: 'Matched case',
      type: 'string',
      group: 'result',
      description: 'Which condition case matched.',
    },
    {
      id: 'selected_target',
      label: 'Selected target',
      type: 'string',
      group: 'result',
      description: 'Next node chosen by this condition.',
    },
  ],
  output: [
    {
      id: 'value',
      label: 'Value',
      type: 'any',
      group: 'result',
      description: 'Final workflow value returned to the caller.',
    },
    {
      id: 'structured',
      label: 'Structured',
      type: 'object',
      group: 'result',
      description: 'Structured final payload when output mode is JSON.',
    },
  ],
};

export const DEFAULT_DIRECT_WORKFLOW = {
  id: DIRECT_AGENT_WORKFLOW_ID,
  workflow_id: DIRECT_AGENT_WORKFLOW_ID,
  version: '1.0.0',
  display_name: 'Direct Agent',
  description: 'Default single-agent path — send the user message to the chosen agent and return its final answer.',
  enabled: true,
  system: true,
  custom: false,
  default: true,
  editable: false,
  deletable: false,
  executable: true,
  input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA,
  nodes: [
    { id: 'start', type: 'start', label: 'Start', input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA, position: { x: 40, y: 160 } },
    {
      id: 'agent',
      type: 'agent',
      label: 'Agent',
      agent_id: 'preset.general',
      prompt: '',
      input: '{{input.message}}',
      input_mapping: {
        message: '{{input.message}}',
        attachments: '{{input.attachments}}',
        image_attachments: '{{input.image_attachments}}',
      },
      position: { x: 340, y: 160 },
    },
    {
      id: 'output',
      type: 'output',
      label: 'End',
      output_mode: 'json_object',
      output: '{{nodes.agent.summary}}',
      output_mapping: { answer: '{{nodes.agent.summary}}' },
      output_schema: {
        type: 'object',
        fields: [{ id: 'answer', label: 'answer', type: 'string', path: 'output.answer' }],
      },
      position: { x: 640, y: 160 },
    },
  ],
  edges: [
    { from: 'start', to: 'agent' },
    { from: 'agent', to: 'output' },
  ],
};

export const DEFAULT_SOFTWARE_DEVELOPMENT_WORKFLOW = {
  id: SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  workflow_id: SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  version: '1.0.0',
  display_name: 'Software Development',
  description: 'Product planning, implementation, and QA verification in one workflow.',
  enabled: true,
  system: true,
  custom: false,
  default: true,
  editable: false,
  deletable: false,
  executable: true,
  input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA,
  nodes: [
    { id: 'start', type: 'start', label: 'Start', input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA, position: { x: 48, y: 148 } },
    { id: 'product', type: 'agent', label: 'Product', agent_id: 'preset.product', prompt: 'Decide whether the request is actionable. If clarification is needed, return NEEDS_CLARIFICATION: followed by one concise question. Otherwise return a READY: implementation brief.', input: 'User request: {{input.message}}', position: { x: 328, y: 148 } },
    { id: 'scope_gate', type: 'condition', label: 'Scope Gate', cases: [{ name: 'clarify', when: '{{nodes.product.summary}} contains NEEDS_CLARIFICATION:', to: 'output' }], default: 'development', position: { x: 608, y: 148 } },
    { id: 'development', type: 'agent', label: 'Development', agent_id: 'preset.development', prompt: 'Implement the software task in the current workspace and report the changes for QA.', input: 'User request: {{input.message}}\nProduct brief: {{nodes.product.summary}}', position: { x: 888, y: 148 } },
    { id: 'qa', type: 'agent', label: 'QA', agent_id: 'preset.qa', prompt: 'Verify the completed software task and return a clear release conclusion.', input: 'User request: {{input.message}}\nProduct brief: {{nodes.product.summary}}\nDevelopment report: {{nodes.development.summary}}', position: { x: 1168, y: 148 } },
    { id: 'output', type: 'output', label: 'End', output_mode: 'text', output: '{{nodes.qa.summary}}', fallback_output: '{{nodes.product.summary}}', strip_prefix: 'NEEDS_CLARIFICATION:', position: { x: 1448, y: 148 } },
  ],
  edges: [
    { from: 'start', to: 'product' },
    { from: 'product', to: 'scope_gate' },
    { from: 'scope_gate', to: 'development' },
    { from: 'scope_gate', to: 'output' },
    { from: 'development', to: 'qa' },
    { from: 'qa', to: 'output' },
  ],
};

export const DEFAULT_WORKFLOW_SETTINGS = {
  default_workflow_id: SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  presets: [DEFAULT_SOFTWARE_DEVELOPMENT_WORKFLOW],
  custom: [],
  node_types: DEFAULT_WORKFLOW_NODE_TYPES,
};

export const SETTINGS_SECTIONS = [
  { id: 'llm', label: 'Providers' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'agent', label: 'Agent' },
  { id: 'workflow', label: 'Agentic Workflow' },
];

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

export const ADD_LABEL_BY_SECTION = {
  memory: 'Add',
  knowledge: 'Add',
  agent: 'Add',
  workflow: 'Add',
};

export const LLM_PROVIDER_MODELS = {
  openai: ['gpt-5.5', 'gpt-5.4'],
  xai: ['grok-4.5'],
  anthropic: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  dashscope: ['qwen3-max', 'qwen3-plus', 'qwen3-vl-max'],
  moonshot: ['kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5'],
  minimax: ['minimax-m3', 'minimax-m2.7', 'minimax-vl-01'],
  zhipu: ['glm-5.2', 'glm-5.1v-thinking-flash', 'glm-4.5v'],
  ollama: [],
  custom: [],
};

export const LLM_PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'gpt-5.5', baseUrl: 'https://api.openai.com/v1' },
  { id: 'xai', label: 'xAI', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'grok-4.5', baseUrl: 'https://api.x.ai/v1' },
  { id: 'anthropic', label: 'Anthropic', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'claude-opus-4-8', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', label: 'Gemini', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'gemini-2.5-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', label: 'DeepSeek', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com' },
  { id: 'dashscope', label: 'DashScope', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'qwen3-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'kimi-k2.7-code', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'minimax', label: 'MiniMax', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'minimax-m3', baseUrl: 'https://api.minimaxi.com/v1' },
  { id: 'zhipu', label: 'Zhipu', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'glm-5.2', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'ollama', label: 'Ollama', authModes: ['none'], defaultAuth: 'none', defaultModel: '', baseUrl: 'http://127.0.0.1:11434/v1' },
  { id: 'custom', label: 'Custom', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: '', baseUrl: '' },
];
export const HIDDEN_SETTINGS_LLM_PROVIDERS = new Set(['anthropic', 'gemini']);
export const SETTINGS_LLM_PROVIDER_OPTIONS = LLM_PROVIDER_OPTIONS.filter((item) => !HIDDEN_SETTINGS_LLM_PROVIDERS.has(item.id));
/** Providers that show OAuth fields in Settings. */
export const LLM_OAUTH_UI_PROVIDERS = new Set(['openai', 'xai']);
/** Providers whose callback is captured and completed by the local runtime. */
export const LLM_OAUTH_CALLBACK_PROVIDERS = new Set(['xai']);
/** Providers that still require a callback URL or code to be pasted manually. */
export const LLM_OAUTH_MANUAL_CODE_PROVIDERS = new Set(['openai']);

export const LLM_SETTINGS_STORAGE_KEY = 'haish.llmSettingsDraft.v1';
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
export const SETTINGS_REASONING_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

export function getLlmProvider(id) {
  return LLM_PROVIDER_OPTIONS.find((item) => item.id === id) || LLM_PROVIDER_OPTIONS[0];
}

export function normalizeLlmProviderId(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

export function formatAuthModeLabel(mode) {
  const value = String(mode || '').trim();
  if (value === 'api_key') return 'API Key';
  if (value === 'oauth') return 'OAuth';
  if (value === 'none') return 'None';
  return value.replace(/_/g, ' ');
}

export function modelChoicesFor(provider) {
  const configured = provider === 'custom' ? [] : (LLM_PROVIDER_MODELS[provider] || []);
  return Array.from(new Set(configured));
}

export function uniqueModelChoices(...groups) {
  const seen = new Set();
  const result = [];
  groups.flat().forEach((value) => {
    const id = typeof value === 'string' ? value : value?.id;
    const label = typeof value === 'string' ? value : (value?.label || value?.id);
    const normalized = String(id || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push({ id: normalized, label: String(label || normalized) });
  });
  return result;
}

export function configuredModelOptions(config) {
  if (config?.provider === 'ollama') return [];
  return config?.model_options || [];
}

export function runtimeProviderLabel(config) {
  const provider = getLlmProvider(config.provider);
  const name = String(config.name || config.custom_provider || '').trim();
  return config.provider === 'custom' && name ? name : provider.label;
}

export function runtimeProviderSelector(config) {
  const provider = normalizeLlmProviderId(config.provider);
  if (provider === 'custom') {
    const key = String(config.name || config.custom_provider || config.base_url || config.model || '').trim();
    return key ? `custom:${key}` : 'custom';
  }
  return provider || 'auto';
}

function runtimeModelChoicesForConfig(config, modelCatalog) {
  const provider = normalizeLlmProviderId(config?.provider);
  const currentModel = config?.model || '';
  const providerChoices = modelChoicesFor(provider);
  if (providerChoices.length > 0) {
    return uniqueModelChoices(currentModel, providerChoices);
  }

  const configChoices = configuredModelOptions(config);
  if (configChoices.length > 0) {
    return uniqueModelChoices(currentModel, configChoices);
  }

  const catalogProvider = normalizeLlmProviderId(modelCatalog?.provider);
  const includeCatalog = catalogProvider && catalogProvider === provider;
  return uniqueModelChoices(currentModel, includeCatalog ? (modelCatalog?.options || []) : []);
}

export function runtimeLlmProviderOptions(draft, modelCatalog) {
  const rows = [
    draft?.chat,
    ...(Array.isArray(draft?.profiles) ? draft.profiles : []),
  ].filter((item) => item && item.provider);
  const seen = new Set();
  const options = rows.map((config, index) => {
    const requestProvider = runtimeProviderSelector(config);
    const idBase = config.id || `${index === 0 ? 'chat' : 'profile'}:${requestProvider}`;
    const id = seen.has(idBase) ? `${idBase}:${index}` : idBase;
    seen.add(id);
    // Settings `model_options` is also used as a remote discovery cache after
    // testing a provider. For built-in providers the run picker must stay
    // scoped to that provider's allowed runtime models instead of treating a
    // broad `/models` response as the provider/profile allow-list.
    const modelOptions = runtimeModelChoicesForConfig(config, modelCatalog);
    return {
      id,
      label: runtimeProviderLabel(config),
      provider: config.provider,
      requestProvider,
      defaultModelId: config.model || modelOptions[0]?.id || getLlmProvider(config.provider).defaultModel,
      modelOptions,
    };
  }).filter((item) => item.modelOptions.length > 0 || item.defaultModelId);
  return options;
}

export function nextProviderDraft(providerId, previous = {}) {
  const provider = getLlmProvider(providerId);
  const isCustom = providerId === 'custom';
  const choices = modelChoicesFor(providerId);
  return {
    ...previous,
    provider: provider.id,
    auth_mode: provider.defaultAuth,
    custom_provider: isCustom ? String(previous.custom_provider || previous.name || '').trim() : '',
    model: isCustom || providerId === 'ollama' ? '' : (choices[0] || provider.defaultModel),
    base_url: isCustom ? '' : provider.baseUrl,
    name: isCustom ? String(previous.name || previous.custom_provider || '').trim() : '',
    api_key: '',
    api_key_configured: false,
    model_options: [],
    oauth_auth_url: '',
    oauth_code: '',
    oauth_state: '',
    oauth_verifier: '',
    oauth_configured: false,
  };
}

export function createDefaultLlmSettings() {
  return {
    chat: {},
    vision: {
      enabled: false,
      mode: 'auto',
      provider: 'custom',
      auth_mode: 'api_key',
      custom_provider: '',
      model: '',
      api_key: '',
      base_url: '',
    },
    embedding: {
      enabled: false,
      provider: 'custom',
      auth_mode: 'api_key',
      custom_provider: '',
      model: '',
      api_key: '',
      base_url: '',
    },
    profiles: [],
  };
}

export function normalizeLlmModelConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const provider = normalizeLlmProviderId(config.provider);
  if (!provider) return { ...config, provider: '' };
  if (provider === 'custom' && !config.name && config.custom_provider) {
    return { ...config, provider, name: config.custom_provider };
  }
  return { ...config, provider };
}

export function loadLlmSettingsDraft() {
  const fallback = createDefaultLlmSettings();
  try {
    const raw = window.localStorage?.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw);
    const draft = {
      chat: normalizeLlmModelConfig({ ...fallback.chat, ...(stored?.chat || {}) }),
      vision: { ...fallback.vision, ...(stored?.vision || {}) },
      embedding: { ...fallback.embedding, ...(stored?.embedding || {}) },
      profiles: Array.isArray(stored?.profiles) ? stored.profiles : [],
    };
    return draft;
  } catch {
    return fallback;
  }
}

export function applyLlmSettingsPayloadToDraft(previous, payload) {
  if (!payload || typeof payload !== 'object') return previous;
  const hasBackendConfig = Boolean(
    payload.chat?.provider
    || payload.vision?.provider
    || payload.embedding?.provider
    || (Array.isArray(payload.profiles) && payload.profiles.length > 0),
  );
  if (!hasBackendConfig) return previous;
  const fallback = createDefaultLlmSettings();
  return {
    chat: normalizeLlmModelConfig({ ...fallback.chat, ...(payload.chat || {}) }),
    vision: { ...fallback.vision, ...(payload.vision || {}) },
    embedding: { ...fallback.embedding, ...(payload.embedding || {}) },
    profiles: Array.isArray(payload.profiles)
      ? payload.profiles.map((profile) => normalizeLlmModelConfig(profile))
      : [],
  };
}

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
  const options = [...normalized.presets, ...normalized.custom]
    .filter((item) => item.enabled !== false && !item.draft)
    .map((item) => ({
      id: item.agent_id,
      label: item.display_name,
      description: item.description,
      custom: Boolean(item.custom),
    }));
  return {
    options: options.length ? options : APP_DEFAULT_AGENT_OPTIONS,
    defaultAgentId: options.find((item) => item.id === 'preset.general')?.id || options[0]?.id || APP_DEFAULT_AGENT_OPTIONS[0].id,
  };
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

// Settings domain model.
export const DIRECT_AGENT_WORKFLOW_ID = 'workflow.direct-agent';
export const DEFAULT_WORKFLOW_NODE_TYPES = [
  { id: 'agent', label: 'Agent', description: 'Invoke an assistant profile over A2A.' },
  { id: 'llm', label: 'LLM', description: 'Run a direct model call with prompt parameters.' },
  { id: 'tool', label: 'Tool', description: 'Call an exposed tool with mapped arguments.' },
  { id: 'condition', label: 'Condition', description: 'Route execution based on an expression.' },
  { id: 'human_approval', label: 'Approval', description: 'Pause for an approve or reject decision.' },
  { id: 'loop', label: 'Loop', description: 'Retry until success, with an optional rerun limit.' },
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
  human_approval: [
    {
      id: 'decision',
      label: 'Decision',
      type: 'string',
      group: 'result',
      description: 'Approved or rejected decision.',
    },
    {
      id: 'feedback',
      label: 'Feedback',
      type: 'string',
      group: 'result',
      description: 'Correction feedback supplied on rejection.',
    },
    {
      id: 'reviewed_input',
      label: 'Reviewed input',
      type: 'object',
      group: 'result',
      description: 'The title, content, and payload shown for review.',
    },
    {
      id: 'structured',
      label: 'Structured',
      type: 'object',
      group: 'result',
      description: 'Full normalized approval result.',
    },
    {
      id: 'attempt',
      label: 'Attempt',
      type: 'number',
      group: 'debug',
      description: 'Approval attempt number.',
    },
  ],
  loop: [
    {
      id: 'count',
      label: 'Loop count',
      type: 'number',
      group: 'result',
      description: 'Number of times this loop has been entered.',
    },
    {
      id: 'max_loops',
      label: 'Maximum loops',
      type: 'number',
      group: 'result',
      description: 'Maximum number of reruns allowed, or null when unlimited.',
    },
    {
      id: 'remaining',
      label: 'Remaining loops',
      type: 'number',
      group: 'result',
      description: 'Reruns still available, or null when unlimited.',
    },
    {
      id: 'exhausted',
      label: 'Exhausted',
      type: 'boolean',
      group: 'status',
      description: 'Whether the loop limit has been exceeded.',
    },
    {
      id: 'selected_branch',
      label: 'Selected branch',
      type: 'string',
      group: 'result',
      description: 'Retry or exhausted branch selected by this loop.',
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

export const DEFAULT_WORKFLOW_SETTINGS = {
  default_workflow_id: DIRECT_AGENT_WORKFLOW_ID,
  presets: [],
  custom: [],
  node_types: DEFAULT_WORKFLOW_NODE_TYPES,
};

// 侧边栏导航：memory / knowledge 在 UI 上合并为 Context 分组下的两个子 tab，
// 但内部 section id 仍是 memory / knowledge（后端、存储、连接检测全部按这两个
// id 工作），children 仅用于侧边栏展示。主行（大标题）不带图标，
// 只有子 tab（children / SETTINGS_SUBTABS）带图标。

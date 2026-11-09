// 视觉核对用：MCP 折叠面板的一屏（不跑断言，只渲染真实组件 + 真实 settings.css）。
// 默认把第一台（figma）展开，一次看到收起行、展开区、状态点三种状态，
// 还有一台没加载（Not loaded + Load tools）和一台失败（Failed）。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToolsConfigEditor } from '../../src/features/settings/components/ToolsConfigEditor.jsx';
import { createDefaultSettingsRecords } from '../../src/features/settings/model/settings-records.js';
import { applyToolsSettingsPayloadToRecords } from '../../src/features/settings/model/settings-payload.js';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../src/features/settings/settings.css';

const MCP_CONFIG = {
  servers: {
    figma: { transport: 'stdio', command: 'npx', args: ['-y', 'figma-developer-mcp', '--stdio'], env: { FIGMA_API_KEY: 'fixture' } },
    sketch: { transport: 'http', url: 'http://127.0.0.1:9999/mcp' },
    'node-repl': { transport: 'stdio', command: 'node', args: ['./scripts/node-repl.js'], enabled: false },
    'cua-agent': { transport: 'stdio', command: 'cua-agent' },
  },
};

const mcpServers = [
  {
    name: 'figma',
    enabled: true,
    expose: 'lazy',
    loaded: true,
    error: null,
    tools: [
      { name: 'get_file', qualified_name: 'figma__get_file', description: '' },
      { name: 'get_comments', qualified_name: 'figma__get_comments', description: '' },
      { name: 'export_png', qualified_name: 'figma__export_png', description: '' },
    ],
  },
  { name: 'sketch', enabled: true, expose: 'direct', loaded: false, error: null, tools: [] },
  { name: 'node-repl', enabled: false, expose: 'direct', loaded: false, error: null, tools: [] },
  { name: 'cua-agent', enabled: true, expose: 'direct', loaded: false, error: 'connection refused', tools: [] },
];

const records = applyToolsSettingsPayloadToRecords(createDefaultSettingsRecords(), {
  mcp: { config: MCP_CONFIG, path: '/tmp/fixture/mcp.json' },
  mcp_servers: mcpServers,
});

createRoot(document.getElementById('root')).render(
  <div className="settings-page settings-modern settings-theme dark" style={{ maxWidth: 980 }}>
    <ToolsConfigEditor
      selectedId="tools-mcp"
      records={records}
      onRecordsChange={() => {}}
      onSaveTools={async () => true}
      onRefreshTools={async () => true}
    />
  </div>,
);

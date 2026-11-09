// MCP 列表的行模型：把 mcp.json 的配置和 core 给的缓存快照拼成折叠面板要的行。
//
// 快照来自 GET /api/settings/tools 的 mcp_servers（core 侧 McpHub.catalog_snapshot，
// 只读缓存，不会为了打开 Settings 去连一台服务器），形状：
//   { name, enabled, expose, loaded, error, tools: [{ name, qualified_name, description }] }
// 没有快照（新旧版本、或 hub 尚未加载过这台）时退回配置里的 enabled/transport，
// 状态点显示为「Not loaded」，展开区给一个显式的 Load tools。
import { mcpServerEnabled } from './mcp-server-toggle.js';

const clean = (value) => String(value ?? '').trim();

export const MCP_SERVER_STATUS_LABELS = {
  connected: 'Connected',
  idle: 'Not loaded',
  failed: 'Failed',
  disabled: 'Disabled',
};

// 只有 enable 过的 server 才谈得上连接；error 优先于 loaded（加载失败后再谈「已连接」是骗人）。
export function mcpServerStatus(enabled, snapshot) {
  if (!enabled) return 'disabled';
  if (clean(snapshot?.error)) return 'failed';
  if (snapshot?.loaded) return 'connected';
  return 'idle';
}

export function mcpServerRows(config, catalog) {
  const snapshots = new Map(
    (Array.isArray(catalog) ? catalog : [])
      .filter((snapshot) => snapshot && clean(snapshot.name))
      .map((snapshot) => [clean(snapshot.name), snapshot]),
  );
  const servers = config?.servers && typeof config.servers === 'object' && !Array.isArray(config.servers)
    ? Object.entries(config.servers)
    : [];
  return servers.map(([name, server]) => {
    const snapshot = snapshots.get(name) || null;
    const enabled = mcpServerEnabled(server);
    const tools = (Array.isArray(snapshot?.tools) ? snapshot.tools : [])
      .map((tool) => clean(tool?.name))
      .filter(Boolean);
    return {
      name,
      transport: clean(server?.transport) || 'stdio',
      enabled,
      status: mcpServerStatus(enabled, snapshot),
      loaded: Boolean(snapshot?.loaded),
      error: clean(snapshot?.error),
      tools,
    };
  });
}

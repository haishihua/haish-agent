// MCP 服务器开关：Settings → Tools → MCP 列表里 Status 列那个电源按钮，只改一件事——
// 这台 server 的 `enabled` 字段。
//
// 状态就存在 mcp.json 里（core 读配置时 `enabled` 缺省为 true：mcp/config.py 的
// `enabled=bool(expanded.get("enabled", True))`），所以「关」写 false，「开」也把 true
// 明明白白写进文件——界面读到的就是文件里有的，不靠「删掉这个键」表达状态。
// 其余字段（transport / env / expose / …）一个字节都不动。

export function mcpServerEnabled(server) {
  return server?.enabled !== false;
}

// 返回新的 config；名字不在 servers 里、或者 config 结构不对时原样奉还。
export function setMcpServerEnabled(config, name, enabled) {
  const serverName = String(name ?? '').trim();
  const servers = config?.servers;
  if (!serverName || !servers || typeof servers !== 'object' || Array.isArray(servers)) return config;
  if (!Object.prototype.hasOwnProperty.call(servers, serverName)) return config;
  const entry = servers[serverName];
  const nextEntry =
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? { ...entry, enabled: Boolean(enabled) }
      : { enabled: Boolean(enabled) };
  return { ...config, servers: { ...servers, [serverName]: nextEntry } };
}

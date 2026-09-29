// MCP 工具选择：一台服务器只按「逐个工具」勾选，界面上不再有「整台服务器」的开关。
//
// 老档案里可能还留着服务器级放行（mcp_policy.allow_servers），读的时候照旧生效——
// 它名下所有工具都算勾上；一旦用户动过其中任一工具，就把这份「整台放行」落成
// 逐条工具（allow_tools），数据与界面上看到的东西从此是同一件事。

const clean = (value) => String(value ?? '').trim();

function nameList(value) {
  return (Array.isArray(value) ? value : []).map(clean).filter(Boolean);
}

// 服务端用 `${server}.${tool}` 作为逐个工具的键（core 的 allow_tools 也是这个写法）。
export function mcpToolKey(serverName, toolName) {
  const server = clean(serverName);
  const tool = clean(toolName);
  return server && tool ? `${server}.${tool}` : '';
}

function serverToolKeys(server) {
  const tools = Array.isArray(server?.tools) ? server.tools : [];
  return tools.map((tool) => mcpToolKey(server?.name, tool?.name)).filter(Boolean);
}

export function mcpServerWholesaleAllowed(policy, serverName) {
  const name = clean(serverName);
  return Boolean(name) && nameList(policy?.allow_servers).includes(name);
}

export function mcpToolSelected(policy, server, toolName) {
  if (mcpServerWholesaleAllowed(policy, server?.name)) return true;
  const key = mcpToolKey(server?.name, toolName);
  return Boolean(key) && nameList(policy?.allow_tools).includes(key);
}

// 返回新的 mcp_policy；本次点击之外的东西（其它服务器、其它工具）原样保留。
export function toggleMcpToolSelection(policy, server, toolName) {
  const allowServers = nameList(policy?.allow_servers);
  const allowTools = new Set(nameList(policy?.allow_tools));
  const key = mcpToolKey(server?.name, toolName);
  if (!key) return { allow_servers: allowServers, allow_tools: [...allowTools] };
  const keptServers = allowServers.filter((name) => name !== clean(server?.name));
  if (keptServers.length !== allowServers.length) {
    for (const item of serverToolKeys(server)) allowTools.add(item);
  }
  if (allowTools.has(key)) allowTools.delete(key);
  else allowTools.add(key);
  return { allow_servers: keptServers, allow_tools: [...allowTools] };
}

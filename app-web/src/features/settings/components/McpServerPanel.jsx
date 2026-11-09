import React from 'react';
import { ChevronRight, Plug } from 'lucide-react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import { MCP_SERVER_STATUS_LABELS } from '../model/mcp-server-panel.js';

// MCP 服务器列表（assistant-ui 的 Server panel 形态）。
//
// 收起时一行只留：箭头 + 插头 + 名字 + 工具数 + 状态点，开关钉在行尾；
// 展开才交代 transport、状态文字和这台服务器带来的工具。
// 纯受控组件：状态、展开项、加载动作全部由外面给，组件自己不请求任何东西。
export function McpServerPanel({
  servers = [],
  expandedId = '',
  onToggle,
  onToggleServer,
  onLoadTools,
  loadingName = '',
  busy = false,
}) {
  const connected = servers.filter((server) => server.status === 'connected').length;
  return (
    <div className="mcp-server-panel" data-slot="mcp-server-panel">
      <div className="mcp-server-panel-head">
        <span className="mcp-server-panel-count">
          {servers.length ? `${connected} of ${servers.length} connected` : 'No servers configured'}
        </span>
      </div>
      <ul className="mcp-server-panel-list">
        {servers.map((server) => {
          const open = expandedId === server.name;
          const toolLabel = server.tools.length
            ? `${server.tools.length} ${server.tools.length === 1 ? 'tool' : 'tools'}`
            : '';
          return (
            <li key={server.name} className={`mcp-server-panel-item${open ? ' is-open' : ''}`}>
              <div className="mcp-server-panel-row">
                <button
                  type="button"
                  className="mcp-server-summary"
                  aria-expanded={open}
                  onClick={() => onToggle?.(server.name)}
                >
                  <ChevronRight size={14} className="mcp-server-chevron" aria-hidden="true" />
                  <Plug size={15} className="mcp-server-plug" aria-hidden="true" />
                  <span className="mcp-server-name">{server.name}</span>
                  {toolLabel ? <span className="mcp-server-tool-count">{toolLabel}</span> : null}
                </button>
                <Switch
                  className="mcp-server-switch"
                  aria-label={`${server.enabled ? 'Disable' : 'Enable'} MCP server ${server.name}`}
                  checked={server.enabled}
                  onCheckedChange={(next) => onToggleServer?.(server.name, next)}
                  disabled={Boolean(busy)}
                />
              </div>
              {open ? (
                <div className="mcp-server-detail">
                  <div className="mcp-server-detail-meta">
                    <span>{server.transport}</span>
                    <span className="mcp-server-detail-sep" aria-hidden="true">·</span>
                    <span className={`mcp-server-status is-${server.status}`}>
                      <span className="mcp-status-dot" aria-hidden="true" />
                      {MCP_SERVER_STATUS_LABELS[server.status] || server.status}
                    </span>
                  </div>
                  {server.error ? <p className="mcp-server-detail-error">{server.error}</p> : null}
                  {server.tools.length ? (
                    <ul className="mcp-server-tools">
                      {server.tools.map((tool) => (
                        <li key={tool} className="mcp-server-tool-chip">{tool}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mcp-server-detail-empty">
                      <span>
                        {!server.enabled
                          ? 'Enable this server to discover its tools.'
                          : server.loaded ? 'This server exposes no tools.' : 'Tools are not loaded yet.'}
                      </span>
                      {server.enabled && !server.loaded && onLoadTools ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(busy) || Boolean(loadingName)}
                          onClick={() => onLoadTools(server.name)}
                        >
                          {loadingName === server.name ? 'Loading…' : 'Load tools'}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

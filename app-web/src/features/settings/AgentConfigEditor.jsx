// @haish-esm
import React from 'react';
import {
  DEFAULT_AGENT_TOOL_GROUPS,
  DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS,
  normalizeAgentProfileRow,
  normalizeAgentToolGroups,
  normalizeAgentSettings,
  agentCatalogFromSettings,
  withAlwaysAllowedAgentTools,
  toolsForAgentGroups,
  groupIdsForAgentTools,
} from '../../lib/agent-catalog.js';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import {
  FieldRow,
  SettingsMenuSelect,
  SettingsLucideIcon,
  AgentListIcon,
  agentIconNameForItem,
} from './settings-ui.jsx';

const { useMemo } = React;

export function AgentConfigEditor({ selectedId, settings, onSettingsChange, readOnly = false }) {
  const normalized = normalizeAgentSettings(settings);
  const current = normalized.custom.find((item) => item.agent_id === selectedId) || null;
  if (!current) {
    const preset = normalized.presets.find((item) => item.agent_id === selectedId) || null;
    if (!preset) return <div className="settings-empty">Select an agent.</div>;
    const effectiveSkills = (preset.effective_skills || [])
      .map((skill) => String(skill?.name || skill || '').trim())
      .filter(Boolean);
    const effectiveTools = (preset.effective_tools || []).map(String).filter(Boolean);
    const effectiveMcpTools = (preset.effective_mcp_tools || []).map(String).filter(Boolean);
    const renderReadOnlyList = (items, emptyLabel) => (
      <div className="settings-check-grid">
        {items.map((item) => (
          <div className="settings-check-row" key={item}>
            <span className="settings-check-label">{item}</span>
          </div>
        ))}
        {!items.length ? <small>{emptyLabel}</small> : null}
      </div>
    );
    return (
      <div className="settings-editor-form settings-agent-form">
        <FieldRow label="Name">
          <input value={preset.display_name || ''} disabled />
        </FieldRow>
        <FieldRow label="Description">
          <textarea value={preset.description || ''} disabled />
        </FieldRow>
        <FieldRow label="Tools">{renderReadOnlyList(effectiveTools, 'No tools.')}</FieldRow>
        <FieldRow label="MCP tools">{renderReadOnlyList(effectiveMcpTools, 'No MCP tools.')}</FieldRow>
        <FieldRow label="Skills">{renderReadOnlyList(effectiveSkills, 'No skills.')}</FieldRow>
      </div>
    );
  }
  const update = (patch) => onSettingsChange((prev) => {
    const next = normalizeAgentSettings(prev);
    return {
      ...next,
      custom: next.custom.map((item) => (
        item.agent_id === selectedId ? { ...item, ...patch, agent_id: selectedId, profile_id: selectedId } : item
      )),
    };
  });
  const updateToolPolicy = (patch) => update({
    tool_policy: { ...(current.tool_policy || {}), ...patch },
  });
  const updateSkillPolicy = (patch) => update({
    skill_policy: { ...(current.skill_policy || {}), ...patch },
  });
  const toolGroups = normalized.tool_groups || DEFAULT_AGENT_TOOL_GROUPS;
  const renderHelpDot = (text) => {
    const label = String(text || '').trim();
    const dot = <span className="settings-help-dot" aria-label={label} tabIndex={0}>?</span>;
    const Tooltip = PortalTooltip;
    return Tooltip ? <Tooltip text={label} position="above" multiline>{dot}</Tooltip> : dot;
  };
  const allowedTools = Array.isArray(current.tool_policy?.allow) ? current.tool_policy.allow : [];
  const selectedGroupIds = new Set(groupIdsForAgentTools(allowedTools, toolGroups));
  const baseOptions = normalized.base_profiles.map((profile) => ({
    id: profile.agent_id,
    label: profile.display_name,
  }));
  const statusOptions = [
    { id: 'enabled', label: 'Active' },
    { id: 'disabled', label: 'Disabled' },
  ];
  const toggleGroup = (groupId) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    updateToolPolicy({ allow: toolsForAgentGroups([...next], toolGroups) });
  };
  const skillOptions = (normalized.skills || [])
    .map((item) => ({
      id: String(item?.name || item?.id || '').trim(),
      label: String(item?.name || item?.label || item?.id || '').trim(),
      description: String(item?.description || '').trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.id);
  const allowedSkills = new Set(Array.isArray(current.skill_policy?.allow) ? current.skill_policy.allow : []);
  const mcpServers = Array.isArray(normalized.mcp_servers) ? normalized.mcp_servers : [];
  const allowedMcpServers = new Set(Array.isArray(current.mcp_policy?.allow_servers) ? current.mcp_policy.allow_servers : []);
  const allowedMcpTools = new Set(Array.isArray(current.mcp_policy?.allow_tools) ? current.mcp_policy.allow_tools : []);
  const toggleSkill = (skillId) => {
    const next = new Set(allowedSkills);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);
    updateSkillPolicy({ allow: [...next] });
  };
  const updateMcpPolicy = (patch) => update({
    mcp_policy: { ...(current.mcp_policy || {}), ...patch },
  });
  const toggleMcpServer = (serverName) => {
    const next = new Set(allowedMcpServers);
    if (next.has(serverName)) next.delete(serverName);
    else next.add(serverName);
    updateMcpPolicy({ allow_servers: [...next] });
  };
  const toggleMcpTool = (serverName, toolName) => {
    const key = `${serverName}.${toolName}`;
    const next = new Set(allowedMcpTools);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateMcpPolicy({ allow_tools: [...next] });
  };

  return (
    <div className="settings-editor-form settings-agent-form">
      <FieldRow label="Name">
        <input value={current.display_name || ''} onChange={(event) => update({ display_name: event.target.value })} disabled={readOnly} placeholder="Agent name" />
      </FieldRow>
      <FieldRow label="Description">
        <textarea value={current.description || ''} onChange={(event) => update({ description: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Based on">
        <SettingsMenuSelect
          value={current.base || 'preset.general'}
          options={baseOptions}
          onChange={(base) => update({ base })}
          disabled={readOnly}
          header="base profile"
        />
      </FieldRow>
      <FieldRow label="Status">
        <SettingsMenuSelect
          value={current.enabled === false ? 'disabled' : 'enabled'}
          options={statusOptions}
          onChange={(status) => update({ enabled: status === 'enabled' })}
          disabled={readOnly}
          header="status"
        />
      </FieldRow>
      <FieldRow label="Additional instructions">
        <textarea value={current.system_prompt || ''} onChange={(event) => update({ system_prompt: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Tools">
        <div className="settings-check-grid">
          {toolGroups.map((group) => (
            <label className="settings-check-row" key={group.id}>
              <input type="checkbox" checked={selectedGroupIds.has(group.id)} onChange={() => toggleGroup(group.id)} disabled={readOnly} />
              <span className="settings-check-label">{group.label}</span>
              {renderHelpDot(group.description || (group.tools || []).join(', '))}
            </label>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="MCP tools">
        <div className="settings-check-grid">
          {mcpServers.map((server) => (
            <div key={server.name} className="settings-check-group">
              <label className="settings-check-row">
                <input type="checkbox" checked={allowedMcpServers.has(server.name)} onChange={() => toggleMcpServer(server.name)} disabled={readOnly} />
                <span className="settings-check-label">{server.name} · all tools</span>
                {server.error ? renderHelpDot(server.error) : null}
              </label>
              {(server.tools || []).map((tool) => (
                <label className="settings-check-row" key={`${server.name}.${tool.name}`}>
                  <input
                    type="checkbox"
                    checked={allowedMcpServers.has(server.name) || allowedMcpTools.has(`${server.name}.${tool.name}`)}
                    onChange={() => toggleMcpTool(server.name, tool.name)}
                    disabled={readOnly || allowedMcpServers.has(server.name)}
                  />
                  <span className="settings-check-label">{tool.name}</span>
                  {tool.description ? renderHelpDot(tool.description) : null}
                </label>
              ))}
            </div>
          ))}
          {!mcpServers.length ? <small>No configured MCP servers.</small> : null}
        </div>
      </FieldRow>
      <FieldRow label="Skills">
        <div className="settings-check-grid">
          {skillOptions.map((skill) => (
            <label className="settings-check-row" key={skill.id}>
              <input type="checkbox" checked={allowedSkills.has(skill.id)} onChange={() => toggleSkill(skill.id)} disabled={readOnly || !skill.enabled} />
              <span className="settings-check-label">{skill.label}</span>
              {skill.description ? renderHelpDot(skill.description) : null}
            </label>
          ))}
          {!skillOptions.length ? <small>No installed skills.</small> : null}
        </div>
      </FieldRow>
    </div>
  );
}



import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Textarea } from '../../../shared/ui/settings-elements/ui/textarea.tsx';
import { Checkbox } from '../../../shared/ui/settings-elements/ui/checkbox.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import React from 'react';
import {
  DEFAULT_AGENT_TOOL_GROUPS,
  normalizeAgentSettings,
  toolsForAgentGroups,
  groupIdsForAgentTools,
} from '../../agents/model/agent-settings.js';
import { FieldRow, SettingsMenuSelect } from './SettingsPrimitives.jsx';

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
          <Input value={preset.display_name || ''} disabled />
        </FieldRow>
        <FieldRow label="Description">
          <Textarea value={preset.description || ''} disabled />
        </FieldRow>
        <FieldRow label="Tools">{renderReadOnlyList(effectiveTools, 'No tools.')}</FieldRow>
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
  const allowedTools = Array.isArray(current.tool_policy?.allow) ? current.tool_policy.allow : [];
  const selectedGroupIds = new Set(groupIdsForAgentTools(allowedTools, toolGroups));
  const baseOptions = normalized.base_profiles.map((profile) => ({
    id: profile.agent_id,
    label: profile.display_name,
  }));
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
  const inheritsAllSkills = current.skill_policy?.allow === null;
  const allowedSkills = new Set(
    inheritsAllSkills
      ? skillOptions.filter((skill) => skill.enabled).map((skill) => skill.id)
      : (Array.isArray(current.skill_policy?.allow) ? current.skill_policy.allow : []),
  );
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
        <Input value={current.display_name || ''} onChange={(event) => update({ display_name: event.target.value })} disabled={readOnly} placeholder="Agent name" />
      </FieldRow>
      <FieldRow label="Description">
        <Textarea value={current.description || ''} onChange={(event) => update({ description: event.target.value })} disabled={readOnly} />
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
      <div className="settings-toggle-modern"><span>Enable agent</span><Switch aria-label="Enable agent" checked={current.enabled !== false} onCheckedChange={enabled => update({ enabled })} disabled={readOnly} /></div>
      <FieldRow label="Additional instructions">
        <Textarea value={current.system_prompt || ''} onChange={(event) => update({ system_prompt: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Tools">
        <div className="settings-check-grid">
          {toolGroups.map((group) => (
            <label className="settings-check-row" key={group.id}>
              <Checkbox checked={selectedGroupIds.has(group.id)} onCheckedChange={() => toggleGroup(group.id)} disabled={readOnly} />
              <span className="settings-check-label">{group.label}</span>
            </label>
          ))}
        </div>
      </FieldRow>
      {!readOnly ? (
        <FieldRow label="MCP tools">
          <div className="settings-check-grid">
            {mcpServers.map((server) => (
              <div key={server.name} className="settings-check-group">
                <label className="settings-check-row">
                  <Checkbox checked={allowedMcpServers.has(server.name)} onCheckedChange={() => toggleMcpServer(server.name)} disabled={readOnly} />
                  <span className="settings-check-label">{server.name} · all tools</span>
                  {server.error && <span className="settings-inline-error" role="status">{server.error}</span>}
                </label>
                {(server.tools || []).map((tool) => (
                  <label className="settings-check-row" key={`${server.name}.${tool.name}`}>
                    <Checkbox
                      checked={allowedMcpServers.has(server.name) || allowedMcpTools.has(`${server.name}.${tool.name}`)}
                      onCheckedChange={() => toggleMcpTool(server.name, tool.name)}
                      disabled={readOnly || allowedMcpServers.has(server.name)}
                    />
                    <span className="settings-check-label">{tool.name}</span>
                  </label>
                ))}
              </div>
            ))}
            {!mcpServers.length ? <small>No configured MCP servers.</small> : null}
          </div>
        </FieldRow>
      ) : null}
      <FieldRow label="Skills">
        <label className="settings-check-row">
          <Switch
            checked={inheritsAllSkills}
            onCheckedChange={() => updateSkillPolicy({ allow: inheritsAllSkills ? [] : null })}
            disabled={readOnly}
          />
          <span className="settings-check-label">Allow all enabled skills</span>

        </label>
        <div className="settings-check-grid">
          {skillOptions.map((skill) => (
            <label className="settings-check-row" key={skill.id}>
              <Checkbox checked={allowedSkills.has(skill.id)} onCheckedChange={() => toggleSkill(skill.id)} disabled={readOnly || inheritsAllSkills || !skill.enabled} />
              <span className="settings-check-label">{skill.label}</span>
            </label>
          ))}
          {!skillOptions.length ? <small>No installed skills.</small> : null}
        </div>
      </FieldRow>
    </div>
  );
}

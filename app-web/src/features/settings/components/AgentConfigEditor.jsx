import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Textarea } from '../../../shared/ui/settings-elements/ui/textarea.tsx';
import { Checkbox } from '../../../shared/ui/settings-elements/ui/checkbox.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import React from 'react';
import {
  DEFAULT_AGENT_TOOL_GROUPS,
  normalizeAgentSettings,
  effectiveAgentTools,
  groupPresetTools,
  toggleAgentToolGroup,
} from '../../agents/model/agent-settings.js';
import { FieldRow, SettingsMenuSelect, SettingsToggleRow } from './SettingsPrimitives.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { mcpToolPickerServers, mcpToolSelected, toggleMcpToolSelection } from '../model/mcp-tool-selection.js';
import {
  Boxes,
  Brain,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  ListChecks,
  Lock,
  MessageCircleQuestion,
  SquarePen,
  Terminal,
  Users,
} from 'lucide-react';

// 预设 agent 只读面板：工具按运行时给的 tool_groups 归组，每组一个图标 + 计数。
// 没归到任何组的工具落到 Other，不让它们凭空消失。
const TOOL_GROUP_ICONS = {
  workspace_read: FileText,
  file_edits: SquarePen,
  terminal: Terminal,
  browser: Compass,
  user_input: MessageCircleQuestion,
  web: Globe,
  memory: Brain,
  vision: Eye,
  image: ImageIcon,
  planning: ListChecks,
  sub_agent: Users,
};

function toolGroupIcon(groupId) {
  const Icon = TOOL_GROUP_ICONS[groupId] || Boxes;
  return <Icon size={13} strokeWidth={1.7} aria-hidden="true" />;
}

// 预设面板默认只露出一小把技能名，其余收起来，避免 30+ chip 堆成一面墙。
const SKILL_PREVIEW_COUNT = 8;

export function AgentConfigEditor({ selectedId, settings, onSettingsChange, readOnly = false }) {
  const [skillsExpanded, setSkillsExpanded] = React.useState(false);
  const normalized = normalizeAgentSettings(settings);
  const current = normalized.custom.find((item) => item.agent_id === selectedId) || null;
  if (!current) {
    const preset = normalized.presets.find((item) => item.agent_id === selectedId) || null;
    if (!preset) return <div className="settings-empty">Select an agent.</div>;
    const effectiveSkills = (preset.effective_skills || [])
      .map((skill) => String(skill?.name || skill || '').trim())
      .filter(Boolean);
    const effectiveTools = (preset.effective_tools || []).map(String).filter(Boolean);
    const sections = groupPresetTools(effectiveTools, normalized.tool_groups || DEFAULT_AGENT_TOOL_GROUPS);
    const skillsOverflow = effectiveSkills.length > SKILL_PREVIEW_COUNT;
    const visibleSkills = skillsExpanded || !skillsOverflow
      ? effectiveSkills
      : effectiveSkills.slice(0, SKILL_PREVIEW_COUNT);
    return (
      <div className="settings-editor-form settings-agent-form preset-agent-form">
        <div className="preset-agent-note">
          <span className="preset-agent-note-icon" aria-hidden="true"><Lock size={12} strokeWidth={1.8} /></span>
          <div className="preset-agent-note-body">
            <span className="preset-agent-note-title">Built-in preset</span>
            <span className="preset-agent-note-text">Read-only. Create your own agent to change its tools, skills or instructions.</span>
          </div>
        </div>
        <dl className="preset-meta">
          <div className="preset-meta-row">
            <dt>Name</dt>
            <dd>{preset.display_name || 'Untitled preset'}</dd>
          </div>
          <div className="preset-meta-row">
            <dt>Description</dt>
            <dd>{preset.description || 'No description.'}</dd>
          </div>
        </dl>
        <section className="preset-caps" aria-label="Tools">
          <header className="preset-caps-head">
            <h3 className="preset-caps-title">Tools</h3>
            <span className="preset-caps-count">{effectiveTools.length}</span>
            <span className="preset-caps-aside">Grouped by capability</span>
          </header>
          {sections.length ? (
            <div className="preset-tool-groups">
              {sections.map((section) => (
                <div className="preset-tool-group" key={section.id}>
                  <span className="preset-tool-group-icon" aria-hidden="true">{toolGroupIcon(section.id)}</span>
                  <span className="preset-tool-group-body">
                    <span className="preset-tool-group-label">{section.label}</span>
                    <span className="preset-tool-group-desc">{section.description || 'Enabled for this preset.'}</span>
                  </span>
                  <span className="preset-tool-group-count">{section.tools.length}</span>
                </div>
              ))}
            </div>
          ) : <p className="preset-caps-empty">No tools.</p>}
        </section>
        <section className="preset-caps" aria-label="Skills">
          <header className="preset-caps-head">
            <h3 className="preset-caps-title">Skills</h3>
            <span className="preset-caps-count">{effectiveSkills.length}</span>
            <span className="preset-caps-aside">Enabled for this preset</span>
          </header>
          {effectiveSkills.length ? (
            <>
              <div className="preset-skills">
                {visibleSkills.map((skill) => (
                  <span className="preset-skill-chip" key={skill}>{skill}</span>
                ))}
              </div>
              {skillsOverflow ? (
                <button
                  type="button"
                  className="preset-skills-toggle"
                  onClick={() => setSkillsExpanded((prev) => !prev)}
                  aria-expanded={skillsExpanded}
                >
                  {skillsExpanded ? 'Show less' : `Show all ${effectiveSkills.length}`}
                  {skillsExpanded
                    ? <ChevronUp size={12} strokeWidth={1.9} aria-hidden="true" />
                    : <ChevronDown size={12} strokeWidth={1.9} aria-hidden="true" />}
                </button>
              ) : null}
            </>
          ) : <p className="preset-caps-empty">No skills.</p>}
        </section>
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
  const inheritsAllTools = current.tool_policy?.allow === null;
  const allowedTools = new Set(effectiveAgentTools(current.tool_policy, toolGroups));
  const groupChecked = group => {
    const tools = group.tools || [];
    const count = tools.filter(tool => allowedTools.has(tool)).length;
    return count === 0 ? false : count === tools.length ? true : 'indeterminate';
  };
  const baseOptions = normalized.base_profiles.map((profile) => ({
    id: profile.agent_id,
    label: profile.display_name,
  }));
  const toggleGroup = (groupId) => {
    updateToolPolicy(toggleAgentToolGroup(current.tool_policy, groupId, toolGroups));
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
  const mcpServers = mcpToolPickerServers(normalized.mcp_servers);
  const hasMcpTools = mcpServers.some((server) => server.tools.length > 0);
  const toggleSkill = (skillId) => {
    const next = new Set(allowedSkills);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);
    updateSkillPolicy({ allow: [...next] });
  };
  const updateMcpPolicy = (patch) => update({
    mcp_policy: { ...(current.mcp_policy || {}), ...patch },
  });
  // MCP 工具逐个勾选：服务器那行只是分组标题，没有「整台服务器」的开关。
  // 老档案里若还留着整台放行，读的时候工具照旧全亮，动一下就自动落成逐条。
  const toggleMcpTool = (server, toolName) => {
    updateMcpPolicy(toggleMcpToolSelection(current.mcp_policy, server, toolName));
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
      <SettingsToggleRow label="Enable agent" checked={current.enabled !== false} onCheckedChange={enabled => update({ enabled })} disabled={readOnly} />
      <FieldRow label="Additional instructions">
        <Textarea value={current.system_prompt || ''} onChange={(event) => update({ system_prompt: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Tools">
        <label className="settings-check-row">
          <Switch checked={inheritsAllTools} onCheckedChange={() => updateToolPolicy({ allow: inheritsAllTools ? [] : null })} disabled={readOnly} />
          <span className="settings-check-label">Allow all tools (except denied tools)</span>
        </label>
        {inheritsAllTools ? <small>Inherits all tools, including future tools. Changing a group uses an explicit selection.</small> : null}
        <div className="settings-check-grid">
          {toolGroups.map((group) => (
            <label className="settings-check-row" key={group.id} title={group.description}>
              <Checkbox checked={groupChecked(group)} onCheckedChange={() => toggleGroup(group.id)} disabled={readOnly} />
              <span className="settings-check-label">{group.label}</span>
            </label>
          ))}
        </div>
      </FieldRow>
      {!readOnly ? (
        <FieldRow label="MCP tools">
          <div className="settings-check-grid">
            {mcpServers.map((server) => {
              const tools = Array.isArray(server.tools) ? server.tools : [];
              return (
                <div key={server.name} className="settings-check-group">
                  <div className="settings-check-row">
                    <span className="settings-check-label">{server.name}</span>
                    {server.error && <ErrorState variant="inline" detail={server.error} />}
                  </div>
                  {tools.map((tool) => (
                    <label className="settings-check-row" key={`${server.name}.${tool.name}`}>
                      <Checkbox
                        checked={mcpToolSelected(current.mcp_policy, server, tool.name)}
                        onCheckedChange={() => toggleMcpTool(server, tool.name)}
                        disabled={readOnly}
                      />
                      <span className="settings-check-label">{tool.name}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {!hasMcpTools ? <small>No MCP tools available.</small> : null}
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

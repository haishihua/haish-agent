// @haish-esm
import React from 'react';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import { API_BASE } from '../../api/base.js';
import { authFetch, parseResponseMessage } from '../../api/auth.js';
import {
  DEFAULT_MCP_CONFIG_JSON,
  MCP_CONFIG_TEMPLATE_JSON,
  WEB_SEARCH_PROVIDER_OPTIONS,
} from '../../lib/agent-catalog.js';
import {
  parseJsonSafe,
  highlightJsonSyntax,
  isEmptyMcpConfigDraft,
  countMcpServersFromJson,
  formatMcpServerCountLabel,
  normalizeWebSearchDraft,
} from './settings-payload.js';
import {
  FieldRow,
  SecretKeyField,
  SettingsLucideIcon,
  SettingsTooltipIconButton,
  SettingsMenuSelect,
  BrandLogoIcon,
  WEB_SEARCH_BRAND_LOGOS,
} from './settings-ui.jsx';
import { GenericConfigEditor } from './GenericConfigEditor.jsx';

const { useState, useEffect, useRef } = React;

export function ToolsConfigEditor({
  selectedId,
  records,
  onRecordsChange,
  onSaveTools,
  onTestWebProvider,
  onInstallSkill,
  onToggleSkill,
  onUninstallSkill,
  skillActionBusy,
}) {
  const current = (records.tools || []).find((item) => item.id === selectedId) || null;
  const mcpDirtyRef = useRef(false);
  const mcpHighlightRef = useRef(null);
  const [testingWebProvider, setTestingWebProvider] = useState('');
  const [mcpServerCount, setMcpServerCount] = useState(0);
  useEffect(() => {
    mcpDirtyRef.current = false;
  }, [selectedId]);
  useEffect(() => {
    if (selectedId !== 'tools-mcp') return;
    if (mcpDirtyRef.current) return;
    const mcpRecord = (records.tools || []).find((item) => item.id === 'tools-mcp');
    setMcpServerCount(countMcpServersFromJson(mcpRecord?.mcp_json));
  }, [selectedId, records]);
  if (!current) {
    return <div className="settings-empty">Select a Tools configuration.</div>;
  }
  const nextRecordsForPatch = (patch) => ({
    ...records,
    tools: (records.tools || []).map((item) => (
      item.id === current.id ? { ...item, ...patch } : item
    )),
  });
  const updateRecord = (patch) => onRecordsChange((prev) => ({
    ...prev,
    tools: (prev.tools || []).map((item) => (
      item.id === current.id ? { ...item, ...patch } : item
    )),
  }));

  if (current.id === 'tools-mcp') {
    const mcpJson = current.mcp_json ?? DEFAULT_MCP_CONFIG_JSON;
    const parsed = parseJsonSafe(mcpJson);
    const updateMcpJson = (value) => {
      mcpDirtyRef.current = true;
      updateRecord({ mcp_json: value, mcp_error: '', mcp_status: '' });
    };
    const applyTemplate = () => {
      if (!isEmptyMcpConfigDraft(mcpJson)) {
        updateRecord({ mcp_error: 'Template can only fill an empty MCP config.', mcp_status: '' });
        return;
      }
      updateMcpJson(MCP_CONFIG_TEMPLATE_JSON);
    };
    const formatJson = () => {
      if (!parsed.ok) return;
      const formatted = JSON.stringify(parsed.value, null, 2);
      if (formatted !== current.mcp_json) mcpDirtyRef.current = true;
      updateRecord({ mcp_json: formatted, mcp_error: '', mcp_status: '' });
    };
    const validateJson = async (value) => {
      const parsedDraft = parseJsonSafe(value ?? DEFAULT_MCP_CONFIG_JSON);
      if (!parsedDraft.ok) {
        updateRecord({ mcp_json: value, mcp_error: parsedDraft.error, mcp_status: '' });
        return false;
      }
      try {
        const response = await authFetch(`${API_BASE}/api/settings/tools/mcp/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: parsedDraft.value }),
        }, { json: false });
        if (!response.ok) {
          const message = await parseResponseMessage(response, `mcp validation failed: ${response.status}`);
          throw new Error(message);
        }
        updateRecord({ mcp_json: value, mcp_error: '', mcp_status: 'MCP config is valid.' });
        return true;
      } catch (error) {
        updateRecord({ mcp_json: value, mcp_error: String(error?.message || error), mcp_status: '' });
        return false;
      }
    };
    const saveJson = async (value) => {
      if (!await validateJson(value)) return;
      const parsedDraft = parseJsonSafe(value ?? DEFAULT_MCP_CONFIG_JSON);
      if (!parsedDraft.ok) return;
      const formatted = JSON.stringify(parsedDraft.value, null, 2);
      const nextRecords = nextRecordsForPatch({ mcp_json: formatted, mcp_error: '', mcp_status: '' });
      onRecordsChange(() => nextRecords);
      const saved = await onSaveTools?.(nextRecords, 'mcp config saved and reloaded');
      if (saved) {
        mcpDirtyRef.current = false;
        setMcpServerCount(countMcpServersFromJson(formatted));
        updateRecord({ mcp_error: '', mcp_status: 'Saved and MCP reloaded.' });
      }
    };
    const syncHighlightScroll = (event) => {
      if (!mcpHighlightRef.current) return;
      mcpHighlightRef.current.style.transform = `translate(${-event.currentTarget.scrollLeft}px, ${-event.currentTarget.scrollTop}px)`;
    };
    return (
      <div className="settings-editor-form settings-tools-form settings-mcp-form">
        <div className="settings-mcp-config">
          <div className="settings-mcp-editor-shell">
            <div className="settings-mcp-actions">
              <span className="settings-mcp-server-count">{formatMcpServerCountLabel(mcpServerCount)}</span>
              <div className="settings-mcp-actions-group">
                <SettingsTooltipIconButton
                  label="Template"
                  icon="template"
                  iconSize={20}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={applyTemplate}
                />
                <SettingsTooltipIconButton
                  label="Format"
                  icon="format"
                  iconSize={20}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={formatJson}
                  disabled={!parsed.ok}
                />
                <SettingsTooltipIconButton
                  label="Validate"
                  icon="validate"
                  iconSize={20}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => validateJson(mcpJson)}
                />
                <SettingsTooltipIconButton
                  label="Save"
                  icon="save"
                  iconSize={20}
                  className="primary"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => saveJson(mcpJson)}
                />
              </div>
            </div>
            <div className="settings-json-editor-layer">
              <pre className="settings-json-highlight" aria-hidden="true"><code ref={mcpHighlightRef} dangerouslySetInnerHTML={{ __html: highlightJsonSyntax(mcpJson) }} /></pre>
              <textarea
                className="settings-json-editor"
                aria-label="Mcp Config JSON"
                value={mcpJson}
                onChange={(event) => updateMcpJson(event.target.value)}
                onScroll={syncHighlightScroll}
                spellCheck={false}
                wrap="off"
              />
            </div>
          </div>
        </div>
        {current.mcp_error ? <div className="settings-inline-error">{current.mcp_error}</div> : null}
        {!current.mcp_error && current.mcp_status ? <div className="settings-inline-success">{current.mcp_status}</div> : null}
      </div>
    );
  }

  if (current.id === 'tools-skills') {
    const skills = Array.isArray(current.skills) ? current.skills : [];
    const errors = Array.isArray(current.skill_errors) ? current.skill_errors : [];
    return (
      <div className="settings-editor-form settings-tools-form">
        <div className="settings-skills-toolbar">
          <span>{skills.length ? `${skills.length} installed skill${skills.length === 1 ? '' : 's'}` : 'No installed skills yet.'}</span>
          <SettingsTooltipIconButton
            label="Install Directory"
            icon="folder-plus"
            iconSize={20}
            onClick={onInstallSkill}
            disabled={Boolean(skillActionBusy)}
          />
        </div>
        {errors.map((error, index) => (
          <div className="settings-inline-error" key={`${error.origin || 'skill-error'}-${index}`}>
            {error.origin ? `${error.origin}: ` : ''}{error.message || error.code || 'Skill load failed'}
          </div>
        ))}
        <div className="settings-skill-list">
          {skills.map((skill) => {
            const skillEnabled = skill.enabled !== false;
            return (
              <div className="settings-skill-row" key={skill.id || skill.name}>
                <div>
                  <strong>{skill.name}</strong>
                  <span>{skill.description || 'No description.'}</span>
                </div>
                <div className="settings-row-actions">
                  <SettingsTooltipIconButton
                    label={skillEnabled ? 'Disable' : 'Enable'}
                    icon={skillEnabled ? 'toggle-right' : 'toggle-left'}
                    iconSize={22}
                    onClick={() => onToggleSkill(skill.name, !skillEnabled)}
                    disabled={Boolean(skillActionBusy)}
                  />
                  <SettingsTooltipIconButton
                    label="Uninstall"
                    icon="delete"
                    danger
                    iconSize={22}
                    onClick={() => onUninstallSkill(skill.name)}
                    disabled={Boolean(skillActionBusy)}
                  />
                </div>
              </div>
            );
          })}
          {!skills.length ? <div className="settings-empty">Install a local skill directory to use it in agent runs.</div> : null}
        </div>
      </div>
    );
  }

  if (current.id === 'tools-web') {
    const web = normalizeWebSearchDraft(current.web_search);
    const updateWeb = (patch) => updateRecord({ web_search: normalizeWebSearchDraft({ ...web, ...patch }) });
    const nextRecordsForProvider = (providerId, patch) => nextRecordsForPatch({
      web_search: normalizeWebSearchDraft({
        ...web,
        providers: {
          ...web.providers,
          [providerId]: { ...web.providers[providerId], ...patch },
        },
      }),
    });
    const updateProvider = (providerId, patch) => updateWeb({
      providers: {
        ...web.providers,
        [providerId]: { ...web.providers[providerId], ...patch },
      },
    });
    const saveProviderKey = async (providerId, apiKey) => {
      const trimmed = String(apiKey || '').trim();
      if (!trimmed) return true;
      const nextRecords = nextRecordsForProvider(providerId, { api_key: trimmed });
      onRecordsChange(() => nextRecords);
      return await onSaveTools?.(nextRecords, '') !== false;
    };
    const testProviderKey = async (provider, apiKey) => {
      const trimmed = String(apiKey || '').trim();
      setTestingWebProvider(provider.id);
      try {
        const saved = await saveProviderKey(provider.id, trimmed);
        if (!saved) return;
        await onTestWebProvider?.(provider.id, trimmed);
      } finally {
        setTestingWebProvider('');
      }
    };
    return (
      <div className="settings-editor-form settings-tools-form">
        <div className="settings-skills-toolbar settings-provider-toolbar">
          <span>{WEB_SEARCH_PROVIDER_OPTIONS.length} search providers</span>
        </div>
        <div className="settings-provider-list">
          {WEB_SEARCH_PROVIDER_OPTIONS.map((provider) => {
            const draft = web.providers[provider.id] || {};
            const configured = Boolean(draft.api_key_configured || String(draft.api_key || '').trim());
            const hasUsableKey = configured || String(draft.api_key || '').trim();
            const testing = testingWebProvider === provider.id;
            const statusLabel = configured ? 'Configured' : 'Not configured';
            return (
              <div className="settings-provider-row" key={provider.id}>
                <div className="settings-provider-identity">
                  <BrandLogoIcon logo={WEB_SEARCH_BRAND_LOGOS[provider.id]} />
                  <strong>{provider.label}</strong>
                </div>
                <SecretKeyField
                  className="settings-provider-key-field"
                  value={draft.api_key || ''}
                  onChange={(event) => updateProvider(provider.id, { api_key: event.target.value })}
                  onBlur={(event) => saveProviderKey(provider.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  configured={Boolean(draft.api_key_configured)}
                  placeholder={provider.keyLabel}
                />
                <div className="settings-row-actions">
                  <PortalTooltip text={statusLabel} position="above">
                    <span
                      className={`settings-provider-status-icon ${configured ? 'configured' : 'missing'}`}
                      aria-label={statusLabel}
                    >
                      <SettingsLucideIcon name={configured ? 'active' : 'close'} size={18} />
                    </span>
                  </PortalTooltip>
                  <SettingsTooltipIconButton
                    label={testing ? 'Testing...' : 'Test'}
                    icon="test"
                    iconSize={18}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => testProviderKey(provider, draft.api_key)}
                    disabled={testing || !hasUsableKey}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return <GenericConfigEditor section="tools" selectedId={selectedId} records={records} onRecordsChange={onRecordsChange} />;
}



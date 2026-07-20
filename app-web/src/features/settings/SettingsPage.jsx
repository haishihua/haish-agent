// @haish-esm
import React from 'react';
import { ChevronDown, CircleCheck, LoaderCircle } from 'lucide-react';
import {
  SETTINGS_SECTIONS,
  SETTINGS_SUBTABS,
  SETTINGS_SECTION_COPY,
  LLM_SUBTAB_COPY,
  ADD_LABEL_BY_SECTION,
  SETTINGS_CONNECTION_SECTIONS,
  SETTINGS_PERSISTED_CONNECTION_STATES,
  SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  agentCatalogFromSettings,
  agentListItems,
  normalizeAgentSettings,
} from '../../lib/agent-catalog.js';
import {
  workflowListItems,
  normalizeWorkflowSettings,
  workflowById,
  normalizeWorkflowRow,
} from '../../lib/workflow-catalog.js';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import {
  getLlmConfigItems,
  configItemsForSection,
  createGenericRecord,
  createLlmProfile,
  connectionBadgeMeta,
  toolsRecordSummary,
} from './settings-payload.js';
import {
  SettingsLucideIcon,
  SettingsTooltipIconButton,
  SettingsMenuSelect,
  ProviderIcon,
  ConnectionBrandIcon,
  AgentListIcon,
  WorkflowListIcon,
  SETTINGS_SUBTAB_ICONS,
} from './settings-ui.jsx';
import { LlmConfigEditor } from './LlmConfigEditor.jsx';
import { GenericConfigEditor } from './GenericConfigEditor.jsx';
import { MemoryConfigEditor } from './MemoryConfigEditor.jsx';
import { KnowledgeConfigEditor } from './KnowledgeConfigEditor.jsx';
import { AgentConfigEditor } from './AgentConfigEditor.jsx';
import { WorkflowConfigEditor } from './WorkflowConfigEditor.jsx';
import { ToolsConfigEditor } from './ToolsConfigEditor.jsx';

// Re-export public API so existing import paths keep working.
export {
  applyToolsSettingsPayloadToRecords,
  applyMemorySettingsPayloadToRecords,
  applyKnowledgeSettingsPayloadToRecords,
  buildToolsSettingsPayload,
  buildMemorySettingsPayload,
  buildKnowledgeSettingsPayload,
  getSelectedLlmConfig,
  llmProviderRequestPayload,
  updateSelectedLlmConfig,
  parseJsonSafe,
  normalizeWebSearchDraft,
  getLlmConfigItems,
  configItemsForSection,
} from './settings-payload.js';
export {
  FieldRow,
  SecretKeyField,
  SettingsLucideIcon,
  SettingsMenuSelect,
  SettingsComboInput,
  SettingsTooltipIconButton,
} from './settings-ui.jsx';
export {
  WorkflowVariablePicker,
  WorkflowVariableSelect,
  WorkflowTemplateTextarea,
  WorkflowSchemaList,
  WorkflowOutputContract,
} from './WorkflowFormControls.jsx';
export { LlmConfigEditor } from './LlmConfigEditor.jsx';
export { GenericConfigEditor } from './GenericConfigEditor.jsx';
export { MemoryConfigEditor } from './MemoryConfigEditor.jsx';
export { KnowledgeConfigEditor } from './KnowledgeConfigEditor.jsx';
export { AgentConfigEditor } from './AgentConfigEditor.jsx';
export {
  WorkflowConfigEditor,
  WorkflowFlowNode,
  canConnectWorkflowNodes,
  addWorkflowEdge,
} from './WorkflowConfigEditor.jsx';
export { ToolsConfigEditor } from './ToolsConfigEditor.jsx';

const { useState, useEffect, useMemo } = React;

export function SettingsPage({
  activeSection,
  onSectionChange,
  selectionBySection,
  onSelectionChange,
  llmDraft,
  onLlmDraftChange,
  records,
  onRecordsChange,
  agentSettings,
  onAgentSettingsChange,
  workflowSettings,
  onWorkflowSettingsChange,
  onSave,
  onSaveTools,
  onTogglePresetAgent,
  onCreateCustomAgent,
  onSaveCustomAgent,
  onDeleteCustomAgent,
  onTogglePresetWorkflow,
  onCreateCustomWorkflow,
  onSaveCustomWorkflow,
  onDeleteCustomWorkflow,
  onTestLlmConfig,
  onTestWebProvider,
  onTestSettingsConnection,
  onSettingsConnectionDirty,
  settingsConnectionStatus = {},
  onInstallSkill,
  onToggleSkill,
  onUninstallSkill,
  skillActionBusy,
}) {
  const [editingSettings, setEditingSettings] = useState(null);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [expandedSettingsSections, setExpandedSettingsSections] = useState(() => new Set([activeSection]));
  const sectionMeta = SETTINGS_SECTIONS.find((item) => item.id === activeSection) || SETTINGS_SECTIONS[0];
  const subtabs = SETTINGS_SUBTABS[activeSection] || [];
  const activeSubtab = subtabs.some((item) => item.id === selectionBySection[activeSection])
    ? selectionBySection[activeSection]
    : (subtabs[0]?.id || '');
  const showConfigList = activeSection !== 'tools';
  const displayItems = configItemsForSection(activeSection, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
  const items = showConfigList ? displayItems : [];
  const selectionKey = activeSection === 'llm' ? 'llmConfig' : activeSection;
  const selectedConfigId = selectionBySection[selectionKey] || '';
  const selectedId = activeSection === 'tools'
    ? activeSubtab
    : (items.some((item) => item.id === selectedConfigId) ? selectedConfigId : (items[0]?.id || ''));
  const selectedItem = displayItems.find((item) => item.id === selectedId) || (showConfigList ? items[0] : null) || null;
  const listTitle = activeSection === 'llm'
    ? (activeSubtab === 'vision' ? 'Vision' : (activeSubtab === 'embedding' ? 'Embedding' : 'Chat'))
    : sectionMeta.label;
  const listDescription = activeSection === 'llm'
    ? (activeSubtab === 'vision'
        ? 'Manage dedicated vision providers and image inspection fallback.'
        : activeSubtab === 'embedding'
          ? 'Manage embedding providers for retrieval and indexing.'
        : 'Manage providers, default models, and chat runtime behavior.')
    : (SETTINGS_SECTION_COPY[activeSection] || 'Manage runtime configuration.');
  const hideSettingsSearch = activeSection === 'memory' || activeSection === 'knowledge';
  const filteredItems = !hideSettingsSearch && settingsSearch.trim()
    ? items.filter((item) => `${item.title} ${item.kind || ''} ${item.summary || ''}`.toLowerCase().includes(settingsSearch.trim().toLowerCase()))
    : items;
  const canAddItem = !(['memory', 'knowledge'].includes(activeSection) || (activeSection === 'llm' && activeSubtab === 'embedding' && displayItems.length > 0));
  const isMcpConfigPane = activeSection === 'tools' && activeSubtab === 'tools-mcp';
  const isSkillsConfigPane = activeSection === 'tools' && activeSubtab === 'tools-skills';
  const isWebConfigPane = activeSection === 'tools' && activeSubtab === 'tools-web';
  const isPlainToolsPane = isMcpConfigPane || isSkillsConfigPane || isWebConfigPane;
  useEffect(() => {
    setExpandedSettingsSections((prev) => new Set([...prev, activeSection]));
  }, [activeSection]);
  const selectItem = (id) => onSelectionChange((prev) => ({ ...prev, [selectionKey]: id }));
  const selectListItem = (id) => {
    cancelEditor();
    selectItem(id);
  };
  const openEditor = (section, id, mode = 'edit') => {
    if (!id) return;
    setEditingSettings({ section, id, mode });
  };
  const closeEditor = () => setEditingSettings(null);
  const discardNewEditor = (draft = editingSettings) => {
    if (!draft || draft.mode !== 'new') return;
    if (draft.section === 'llm') {
      if (draft.id === 'vision') {
        onLlmDraftChange((prev) => ({ ...prev, vision: { ...prev.vision, enabled: false } }));
      } else if (draft.id === 'embedding') {
        onLlmDraftChange((prev) => ({ ...prev, embedding: { ...prev.embedding, enabled: false } }));
      } else {
        onLlmDraftChange((prev) => ({
          ...prev,
          profiles: (prev.profiles || []).filter((profile) => profile.id !== draft.id),
        }));
      }
      if (selectionBySection.llmConfig === draft.id) selectItem('chat');
      return;
    }
    if (draft.section === 'agent') {
      onAgentSettingsChange((prev) => {
        const next = normalizeAgentSettings(prev);
        return {
          ...next,
          custom: next.custom.filter((item) => item.agent_id !== draft.id),
        };
      });
      if (selectionBySection.agent === draft.id) {
        const normalized = normalizeAgentSettings(agentSettings);
        const fallback = [...normalized.presets, ...normalized.custom].find((item) => item.agent_id !== draft.id);
        onSelectionChange((prev) => ({ ...prev, agent: fallback?.agent_id || '' }));
      }
      return;
    }
    if (draft.section === 'workflow') {
      onWorkflowSettingsChange((prev) => {
        const next = normalizeWorkflowSettings(prev);
        return {
          ...next,
          custom: next.custom.filter((item) => item.workflow_id !== draft.id),
        };
      });
      if (selectionBySection.workflow === draft.id) {
        onSelectionChange((prev) => ({ ...prev, workflow: SOFTWARE_DEVELOPMENT_WORKFLOW_ID }));
      }
      return;
    }
    onRecordsChange((prev) => ({
      ...prev,
      [draft.section]: (prev[draft.section] || []).filter((item) => item.id !== draft.id),
    }));
    if (selectionBySection[draft.section] === draft.id) {
      const fallback = (records[draft.section] || []).find((item) => item.id !== draft.id);
      onSelectionChange((prev) => ({ ...prev, [draft.section]: fallback?.id || '' }));
    }
  };
  const cancelEditor = () => {
    discardNewEditor();
    closeEditor();
  };
  const selectSubtab = (section, id) => {
    cancelEditor();
    setExpandedSettingsSections((prev) => new Set([...prev, section]));
    onSectionChange(section);
    onSelectionChange((prev) => {
      const next = { ...prev, [section]: id };
      if (section === 'llm') {
        const nextItems = configItemsForSection('llm', llmDraft, records, id);
        next.llmConfig = nextItems[0]?.id || '';
      }
      return next;
    });
  };
  const addItem = async () => {
    if (activeSection === 'tools') return;
    if (activeSection === 'agent') {
      const id = await onCreateCustomAgent?.();
      if (id) {
        selectItem(id);
        openEditor('agent', id, 'new');
      }
      return;
    }
    if (activeSection === 'workflow') {
      const id = await onCreateCustomWorkflow?.();
      if (id) {
        selectItem(id);
        openEditor('workflow', id, 'new');
      }
      return;
    }
    if (activeSection === 'llm') {
      if (activeSubtab === 'vision') {
        onLlmDraftChange((prev) => ({
          ...prev,
          vision: {
            enabled: true,
            mode: 'auto',
            provider: 'custom',
            auth_mode: 'api_key',
            custom_provider: '',
            name: '',
            model: '',
            api_key: '',
            api_key_configured: false,
            base_url: '',
            model_options: [],
            oauth_auth_url: '',
            oauth_code: '',
            oauth_state: '',
            oauth_verifier: '',
          },
        }));
        onSelectionChange((prev) => ({ ...prev, llm: 'vision', llmConfig: 'vision' }));
        openEditor('llm', 'vision', 'new');
        return;
      }
      if (activeSubtab === 'embedding') {
        onLlmDraftChange((prev) => ({
          ...prev,
          embedding: {
            enabled: true,
            provider: 'custom',
            auth_mode: 'api_key',
            custom_provider: '',
            name: '',
            model: '',
            api_key: '',
            api_key_configured: false,
            base_url: '',
            model_options: [],
            oauth_auth_url: '',
            oauth_code: '',
            oauth_state: '',
            oauth_verifier: '',
          },
        }));
        onSelectionChange((prev) => ({ ...prev, llm: 'embedding', llmConfig: 'embedding' }));
        openEditor('llm', 'embedding', 'new');
        return;
      }
      const profile = createLlmProfile();
      onLlmDraftChange((prev) => ({ ...prev, profiles: [...(prev.profiles || []), profile] }));
      selectItem(profile.id);
      openEditor('llm', profile.id, 'new');
      return;
    }
    const record = createGenericRecord(activeSection);
    onRecordsChange((prev) => ({ ...prev, [activeSection]: [...(prev[activeSection] || []), record] }));
    selectItem(record.id);
    openEditor(activeSection, record.id, 'new');
  };
  const showSideEditor = showConfigList && Boolean(editingSettings);
  const workbenchClassName = `settings-workbench ${activeSection === 'workflow' ? 'workflow-workbench' : ''} ${showConfigList ? `provider-list-only ${showSideEditor ? 'has-detail' : ''}` : `single-pane ${isMcpConfigPane ? 'mcp-pane' : ''}`}`;
  const panelSection = editingSettings?.section || '';
  const panelSelectedId = editingSettings?.id || '';
  const panelMode = editingSettings?.mode || 'edit';
  const panelItems = panelSection === activeSection ? displayItems : configItemsForSection(panelSection, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
  const panelSelectedItem = panelItems.find((item) => item.id === panelSelectedId) || null;
  const panelEyebrow = panelMode === 'new' ? 'New' : (panelMode === 'detail' ? 'Details' : 'Edit');
  const panelIsConnectionSection = panelSection === 'memory' || panelSection === 'knowledge';
  const panelConnectionStatus = settingsConnectionStatus?.[panelSection]?.[panelSelectedId];
  const panelConnectionTesting = panelConnectionStatus?.state === 'testing';
  const panelCanSave = !panelSelectedItem?.readonly && !(panelSection === 'workflow' && !panelSelectedItem?.custom);
  const panelWorkflow = panelSection === 'workflow' ? workflowById(workflowSettings, panelSelectedId) : null;
  const updatePanelWorkflow = (patch) => {
    if (!panelWorkflow?.custom) return;
    onWorkflowSettingsChange((prev) => {
      const next = normalizeWorkflowSettings(prev);
      return {
        ...next,
        custom: next.custom.map((item) => (
          item.workflow_id === panelWorkflow.workflow_id ? normalizeWorkflowRow({ ...item, ...patch }, item) : item
        )),
      };
    });
  };
  const deleteConfig = async (section, id) => {
    const sectionItems = section === activeSection ? displayItems : configItemsForSection(section, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
    const target = sectionItems.find((item) => item.id === id);
    if (!target || (target.protected && !target.canDelete)) return;
    if (section === 'agent') {
      const deleted = await onDeleteCustomAgent?.(id);
      if (deleted === false) return;
    } else if (section === 'workflow') {
      const deleted = await onDeleteCustomWorkflow?.(id);
      if (deleted === false) return;
    } else if (section === 'llm') {
      onLlmDraftChange((prev) => {
        if (id === 'chat') return { ...prev, chat: {} };
        if (id === 'vision') return { ...prev, vision: { ...prev.vision, enabled: false } };
        if (id === 'embedding') return { ...prev, embedding: { ...prev.embedding, enabled: false } };
        return {
          ...prev,
          profiles: (prev.profiles || []).filter((profile) => profile.id !== id),
        };
      });
    } else {
      onRecordsChange((prev) => ({
        ...prev,
        [section]: (prev[section] || []).filter((item) => item.id !== id),
      }));
    }
    if (section === activeSection) {
      if (section === 'workflow') {
        selectItem(SOFTWARE_DEVELOPMENT_WORKFLOW_ID);
      } else {
        const fallback = sectionItems.find((item) => item.id !== id);
        selectItem(fallback?.id || '');
      }
    }
    if (editingSettings?.section === section && editingSettings?.id === id) closeEditor();
  };
  const saveAndClose = async () => {
    const saved = panelSection === 'agent'
      ? await onSaveCustomAgent?.(panelSelectedId)
      : panelSection === 'workflow'
        ? await onSaveCustomWorkflow?.(panelSelectedId)
        : await onSave();
    if (saved !== false) closeEditor();
  };
  const testSelectedProvider = async () => {
    if (panelSection !== 'llm' || !panelSelectedId) return;
    await onTestLlmConfig?.(panelSelectedId);
  };
  const editorBody = (section, id, mode = panelMode) => {
    const readOnly = mode === 'detail';
    if (section === 'llm') {
      return id ? (
        <LlmConfigEditor
          selectedId={id}
          draft={llmDraft}
          onDraftChange={onLlmDraftChange}
          readOnly={readOnly}
          refreshModels={mode !== 'detail'}
        />
      ) : (
        <div className="settings-empty">Click Add to create a configuration.</div>
      );
    }
    if (section === 'tools') {
      return (
        <ToolsConfigEditor
          selectedId={id}
          records={records}
          onRecordsChange={onRecordsChange}
          onInstallSkill={onInstallSkill}
          onToggleSkill={onToggleSkill}
          onUninstallSkill={onUninstallSkill}
          skillActionBusy={skillActionBusy}
          onSaveTools={onSaveTools}
          onTestWebProvider={onTestWebProvider}
        />
      );
    }
    if (section === 'agent') {
      return (
        <AgentConfigEditor
          selectedId={id}
          settings={agentSettings}
          onSettingsChange={onAgentSettingsChange}
          readOnly={readOnly}
        />
      );
    }
    if (section === 'workflow') {
      return (
        <WorkflowConfigEditor
          selectedId={id}
          settings={workflowSettings}
          onSettingsChange={onWorkflowSettingsChange}
          agentSettings={agentSettings}
          readOnly={readOnly}
          onSave={saveAndClose}
          canSave={!readOnly && panelCanSave}
        />
      );
    }
    if (section === 'memory') {
      return <MemoryConfigEditor section={section} selectedId={id} records={records} onRecordsChange={onRecordsChange} onDirty={onSettingsConnectionDirty} readOnly={readOnly} />;
    }
    if (section === 'knowledge') {
      return <KnowledgeConfigEditor section={section} selectedId={id} records={records} onRecordsChange={onRecordsChange} onDirty={onSettingsConnectionDirty} readOnly={readOnly} />;
    }
    return <GenericConfigEditor section={section} selectedId={id} records={records} onRecordsChange={onRecordsChange} readOnly={readOnly} />;
  };

  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-head">
          <span>Settings</span>
        </div>
        <nav className="settings-side-tabs">
          {SETTINGS_SECTIONS.map((section) => {
            const sectionSubtabs = SETTINGS_SUBTABS[section.id] || [];
            const sectionSubtab = sectionSubtabs.some((item) => item.id === selectionBySection[section.id])
              ? selectionBySection[section.id]
              : (sectionSubtabs[0]?.id || '');
            const isActive = activeSection === section.id;
            const isExpanded = expandedSettingsSections.has(section.id);
            return (
              <div className="settings-side-section" key={section.id}>
                <button
                  type="button"
                  className={`${isActive ? 'active' : ''}${sectionSubtabs.length ? '' : ' settings-side-leaf'}`.trim()}
                  aria-expanded={sectionSubtabs.length ? isExpanded : undefined}
                  onClick={() => {
                    if (sectionSubtabs.length) {
                      setExpandedSettingsSections((prev) => {
                        const next = new Set(prev);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      });
                      return;
                    }
                    cancelEditor();
                    onSectionChange(section.id);
                  }}
                >
                  <span>{section.label}</span>
                  {sectionSubtabs.length ? (
                    <ChevronDown
                      className={`settings-side-section-chevron${isExpanded ? ' expanded' : ''}`}
                      size={16}
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
                {isExpanded && sectionSubtabs.length ? (
                  <div className="settings-side-subtabs" role="tablist" aria-label={`${section.label} settings`}>
                    {sectionSubtabs.map((tab) => {
                      const isSubtabActive = isActive && sectionSubtab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isSubtabActive}
                          className={isSubtabActive ? 'active' : ''}
                          onClick={() => selectSubtab(section.id, tab.id)}
                        >
                          <span className="settings-side-subtab-icon">
                            <SettingsLucideIcon name={SETTINGS_SUBTAB_ICONS[tab.id] || 'configure'} size={16} />
                          </span>
                          <span>{tab.label}</span>
                          {section.id === 'llm' ? (
                            <strong className="settings-side-subtab-count">
                              {configItemsForSection(section.id, llmDraft, records, tab.id, agentSettings).length}
                            </strong>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className="settings-main">
        <div className={workbenchClassName}>
          {showConfigList ? (
            <section className="settings-config-list">
              <div className="settings-list-head">
                <div className="settings-list-title">
                  <strong>{listTitle}</strong>
                  <span>{listDescription}</span>
                </div>
              </div>
              {!hideSettingsSearch ? (
                <div className="settings-search-row">
                  <SettingsLucideIcon name="search" className="settings-search-lucide" />
                  <input
                    value={settingsSearch}
                    onChange={(event) => setSettingsSearch(event.target.value)}
                    aria-label={`Search ${listTitle.toLowerCase()}`}
                    placeholder={`Search ${listTitle.toLowerCase()}...`}
                  />
                </div>
              ) : null}
              <div className="settings-list-scroll">
                {filteredItems.map((item) => {
                  const isConnectionSection = activeSection === 'memory' || activeSection === 'knowledge';
                  const connectionStatus = settingsConnectionStatus?.[activeSection]?.[item.id];
                  const connectionMeta = connectionBadgeMeta(connectionStatus);
                  const showBrandIcon = activeSection === 'llm'
                    || activeSection === 'agent'
                    || activeSection === 'workflow'
                    || isConnectionSection;
                  return (
                    <div
                      key={item.id}
                      className={`settings-config-row${showBrandIcon ? ' provider-row' : ''}${selectedItem?.id === item.id ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className={`settings-config-main${showBrandIcon ? ' has-provider-icon' : ''}`}
                        onClick={() => {
                          selectListItem(item.id);
                        }}
                      >
                        {activeSection === 'llm' ? (
                          <ProviderIcon provider={item.provider} />
                        ) : activeSection === 'agent' ? (
                          <AgentListIcon item={item} />
                        ) : activeSection === 'workflow' ? (
                          <WorkflowListIcon item={item} />
                        ) : isConnectionSection ? (
                          <ConnectionBrandIcon itemId={item.id} title={item.title} />
                        ) : null}
                        <span className="settings-config-copy">
                          <span className="settings-config-title">{item.title}</span>
                          <span className="settings-config-summary">{item.summary}</span>
                        </span>
                      </button>
                      {isConnectionSection ? (
                        <PortalTooltip text={connectionMeta.label} position="above">
                          <span
                            className={`settings-active-badge ${connectionMeta.className}`}
                            aria-label={connectionMeta.label}
                          >
                            <SettingsLucideIcon
                              name={
                                connectionMeta.className === 'success'
                                  ? 'active'
                                  : connectionMeta.className === 'testing'
                                    ? 'test'
                                    : 'close'
                              }
                              size={18}
                            />
                          </span>
                        </PortalTooltip>
                      ) : (
                        <PortalTooltip text={item.enabled === false ? 'Disabled' : 'Enabled'} position="above">
                          <span
                            className={`settings-active-badge ${item.enabled === false ? 'disabled' : ''}`}
                            aria-label={item.enabled === false ? 'Disabled' : 'Enabled'}
                          >
                            <SettingsLucideIcon
                              name={activeSection === 'llm'
                                ? (item.enabled === false ? 'toggle-left' : 'toggle-right')
                                : (item.enabled === false ? 'close' : 'active')}
                              size={18}
                            />
                          </span>
                        </PortalTooltip>
                      )}
                      <div className="settings-config-actions">
                        {activeSection === 'agent' && item.canToggle ? (
                          <SettingsTooltipIconButton
                            label={item.enabled === false ? 'Enable' : 'Disable'}
                            icon={item.enabled === false ? 'toggle-left' : 'toggle-right'}
                            iconSize={22}
                            onClick={() => onTogglePresetAgent?.(item.id, item.enabled === false)}
                          />
                        ) : null}
                        {activeSection === 'workflow' && item.canToggle ? (
                          <SettingsTooltipIconButton
                            label={item.enabled === false ? 'Enable' : 'Disable'}
                            icon={item.enabled === false ? 'toggle-left' : 'toggle-right'}
                            iconSize={22}
                            onClick={() => onTogglePresetWorkflow?.(item.id, item.enabled === false)}
                          />
                        ) : null}
                        {activeSection !== 'agent' || item.canConfigure || item.readonly ? (
                          <SettingsTooltipIconButton
                            label={item.readonly ? 'View' : 'Configure'}
                            icon="configure"
                            iconSize={18}
                            onClick={() => {
                              selectItem(item.id);
                              openEditor(activeSection, item.id, item.readonly ? 'detail' : 'edit');
                            }}
                          />
                        ) : null}
                        {activeSection === 'llm' && item.canDelete ? (
                          <SettingsTooltipIconButton
                            label="Delete"
                            icon="delete"
                            danger
                            iconSize={20}
                            onClick={() => deleteConfig('llm', item.id)}
                          />
                        ) : null}
                        {activeSection === 'agent' && item.custom ? (
                          <SettingsTooltipIconButton
                            label="Delete"
                            icon="delete"
                            danger
                            iconSize={20}
                            onClick={() => deleteConfig('agent', item.id)}
                          />
                        ) : null}
                        {activeSection === 'workflow' && item.custom ? (
                          <SettingsTooltipIconButton
                            label="Delete"
                            icon="delete"
                            danger
                            iconSize={20}
                            onClick={() => deleteConfig('workflow', item.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {canAddItem ? (
                  <button type="button" className="settings-connect-card" onClick={addItem}>
                    <span className="settings-connect-icon" aria-hidden="true">
                      <SettingsLucideIcon name="plus" size={18} />
                    </span>
                    <span>
                      <strong>{activeSection === 'llm' ? (activeSubtab === 'vision' ? 'Connect vision provider' : (activeSubtab === 'embedding' ? 'Connect embedding provider' : 'Connect provider')) : (activeSection === 'agent' ? 'Create custom agent' : (activeSection === 'workflow' ? 'Create workflow' : `Add ${sectionMeta.label}`))}</strong>
                      <small>{activeSection === 'llm' ? 'Use official providers or OpenAI-compatible APIs.' : (activeSection === 'agent' ? 'Define prompt, tools, skills, and sub-agent access.' : (activeSection === 'workflow' ? 'Start from a blank canvas and wire agents, models, tools, conditions, and outputs into a reusable flow.' : 'Create another configuration.'))}</small>
                    </span>
                  </button>
                ) : null}
                {!filteredItems.length && items.length ? <div className="settings-empty">No matching configuration.</div> : null}
                {!items.length ? <div className="settings-empty">No configuration yet.</div> : null}
              </div>
            </section>
          ) : null}
          {showSideEditor ? (
            <section className="settings-editor settings-detail-drawer is-editing">
              <div className="settings-editor-head">
                <div>
                  {panelSection === 'workflow' ? null : <span>{panelEyebrow}</span>}
                  {panelSection === 'workflow' && panelWorkflow?.custom ? (
                    <input
                      className="workflow-title-input"
                      value={panelWorkflow.display_name ?? ''}
                      onChange={(event) => updatePanelWorkflow({ display_name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Backspace' || event.key === 'Delete') {
                          event.stopPropagation();
                        }
                      }}
                      placeholder="Workflow name"
                      aria-label="Workflow name"
                    />
                  ) : (
                    <strong>{panelSelectedItem?.title || listTitle}</strong>
                  )}
                </div>
                {panelSection === 'llm' ? (
                  <SettingsTooltipIconButton label="Close" icon="close" iconSize={20} onClick={cancelEditor} />
                ) : (
                  <button type="button" className="settings-pane-close" onClick={cancelEditor} aria-label="Close">x</button>
                )}
              </div>
              {panelSelectedId ? editorBody(panelSection, panelSelectedId, panelMode) : (
                <div className="settings-empty">Select a configuration.</div>
              )}
              {panelSelectedId && panelSection !== 'workflow' ? (
                <div className="settings-detail-footer">
                  {panelSection === 'llm' ? (
                    <SettingsTooltipIconButton label="Test" icon="test" iconSize={20} onClick={testSelectedProvider} />
                  ) : panelIsConnectionSection ? (
                    <button
                      type="button"
                      className="settings-icon-button"
                      disabled={panelConnectionTesting}
                      onClick={() => onTestSettingsConnection?.(panelSection, panelSelectedId)}
                    >
                      <SettingsLucideIcon name="test" />
                      {panelConnectionTesting ? 'Testing...' : 'Test'}
                    </button>
                  ) : null}
                  {panelCanSave ? (
                    <SettingsTooltipIconButton label="Save" icon="save" iconSize={20} onClick={saveAndClose} />
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          {!showConfigList ? (
            <section className={`settings-editor ${isPlainToolsPane ? 'settings-mcp-editor' : ''}`}>
              <div className="settings-editor-head">
                <div>
                  <strong>{isMcpConfigPane ? 'Mcp Config' : (isSkillsConfigPane ? 'Installed skills' : (isWebConfigPane ? 'Search providers' : sectionMeta.label))}</strong>
                  {isMcpConfigPane
                    ? <span>Configure Model Context Protocol servers, commands, and tool integrations.</span>
                    : isSkillsConfigPane
                      ? <span>Install skills to the system library first, then sync them into each personal project environment.</span>
                      : isWebConfigPane
                        ? <span>Configure provider API keys used by web search and page fetch tools.</span>
                    : <span>{LLM_SUBTAB_COPY[activeSubtab] || SETTINGS_SECTION_COPY[activeSection] || 'Configuration'}</span>}
                </div>
                {isPlainToolsPane ? null : (
                  <div className="settings-head-actions">
                    <button type="button" className="settings-primary-button" onClick={onSave}>Save</button>
                  </div>
                )}
              </div>
              {editorBody(activeSection, selectedId, 'edit')}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}


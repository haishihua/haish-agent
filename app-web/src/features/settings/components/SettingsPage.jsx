import React from 'react';
import { ChevronRight, Settings2, Plus, FlaskConical, LoaderCircle } from 'lucide-react';
import {
  SETTINGS_SECTIONS,
  SETTINGS_SUBTABS,
  settingsSectionMeta,
} from '../model/settings-navigation.js';
import { normalizeAgentSettings } from '../../agents/model/agent-settings.js';
import {
  normalizeWorkflowSettings,
  workflowById,
  normalizeWorkflowRow,
} from '../../workflow/model/workflow-catalog.js';
import { closeAllPortalTooltips } from '../../../shared/ui/PortalTooltip.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import {
  configItemsForSection,
  createGenericRecord,
  createLlmProfile,
  connectionBadgeMeta,
} from '../model/settings-payload.js';
import { createVisionProviderDraft } from '../model/llm-settings.js';
import {
  SettingsTooltipIconButton,
  ConnectionBrandIcon,
  AgentListIcon,
  WorkflowListIcon,
  SETTINGS_SUBTAB_ICONS,
} from './settings-ui.jsx';
import { LlmConfigEditor } from './LlmConfigEditor.jsx';
import { GenericConfigEditor } from './GenericConfigEditor.jsx';
import { MemoryConfigEditor } from './MemoryConfigEditor.jsx';
import { AgentConfigEditor } from './AgentConfigEditor.jsx';
import { WorkflowConfigEditor } from './WorkflowConfigEditor.jsx';
import { ToolsConfigEditor } from './ToolsConfigEditor.jsx';

import { SettingsRow, SettingsSearch, SettingsSheet, SettingsDeleteDialog, ProviderIcon } from './SettingsPrimitives.jsx';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { ItemGroup } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { SheetFooter } from '../../../shared/ui/settings-elements/ui/sheet.tsx';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../shared/ui/settings-elements/ui/collapsible.tsx';
import '../settings.css';

const { useState, useEffect, useRef } = React;

// Qdrant 上次连接测试的结果跟着已保存的配置存在后端；本轮还没测过时按它显示。
function storedMemoryConnectionStatus(records, section, itemId) {
  if (section !== 'memory') return null;
  const record = (records?.memory || []).find((item) => item.id === itemId);
  return record?.qdrant?.last_test || null;
}

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
  onDeleteLlmProvider,
  onToggleLlmProvider,
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
  openEditorRequest = null,
  onOpenEditorRequestConsumed,
}) {
  const [editingSettings, setEditingSettings] = useState(null);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [panelBusy, setPanelBusy] = useState('');
  const [panelError, setPanelError] = useState('');
  // 开关点按立即保存（与 Skills 一致），保存期间其它行开关暂不可点。
  const [llmToggleBusy, setLlmToggleBusy] = useState('');
  const [expandedSettingsSections, setExpandedSettingsSections] = useState(() => new Set([activeSection]));
  // 从运行页「点标题 → 配置页」跳过来时：直接把那个工作流的编辑器打开（和列表里点一行走同一个
  // setEditingSettings 入口）；消费完把请求交回上层清掉，之后关掉抽屉不会被重新打开。
  const lastOpenRequestRef = useRef(null);
  useEffect(() => {
    const request = openEditorRequest;
    if (!request?.id || lastOpenRequestRef.current === request) return;
    lastOpenRequestRef.current = request;
    setExpandedSettingsSections((prev) => new Set([...prev, request.section]));
    setEditingSettings({ section: request.section, id: request.id, mode: request.mode || 'edit' });
    setPanelError('');
    onOpenEditorRequestConsumed?.();
  }, [onOpenEditorRequestConsumed, openEditorRequest]);
  const sectionMeta = settingsSectionMeta(activeSection) || SETTINGS_SECTIONS[0];
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
  const listTitle = activeSection === 'llm'
    ? (activeSubtab === 'vision' ? 'Vision' : 'Chat')
    : sectionMeta.label;
  // 单条目段（Memory / Embedding）不需要搜索框。
  const hideSettingsSearch = activeSection === 'memory' || activeSection === 'embedding';
  const filteredItems = !hideSettingsSearch && settingsSearch.trim()
    ? items.filter((item) => `${item.title} ${item.kind || ''} ${item.summary || ''}`.toLowerCase().includes(settingsSearch.trim().toLowerCase()))
    : items;
  // Memory 是单后端配置，隐藏添加；Embedding 已配置时同样隐藏（点条目即打开配置）；
  // 其他段始终显示添加入口。
  const canAddItem = activeSection !== 'memory'
    && !(activeSection === 'embedding' && Boolean(llmDraft.embedding?.enabled));
  useEffect(() => {
    setExpandedSettingsSections((prev) => {
      const next = new Set([...prev, activeSection]);
      // memory 归属 Context 分组：激活子项时自动展开所属分组。
      const group = SETTINGS_SECTIONS.find((item) => (
        Array.isArray(item.children) && item.children.some((child) => child.id === activeSection)
      ));
      if (group) next.add(group.id);
      return next;
    });
  }, [activeSection]);
  const selectItem = (id) => onSelectionChange((prev) => ({ ...prev, [selectionKey]: id }));
  const toggleLlmProvider = async (entryId, enabled) => {
    setLlmToggleBusy(entryId);
    try {
      return await onToggleLlmProvider?.(entryId, enabled);
    } finally {
      setLlmToggleBusy('');
    }
  };
  const selectListItem = (id) => {
    cancelEditor();
    selectItem(id);
  };
  const openEditor = (section, id, mode = 'edit') => {
    if (!id) return;
    setPanelError('');
    setEditingSettings({ section, id, mode });
  };
  const closeEditor = () => setEditingSettings(null);
  const discardNewEditor = (draft = editingSettings) => {
    if (!draft || draft.mode !== 'new') return;
    if (draft.section === 'llm') {
      // Vision 是多条 provider 列表：取消新建时按 id 移除这一条。
      const isVisionDraft = (llmDraft.vision?.providers || []).some((item) => item.id === draft.id);
      if (isVisionDraft) {
        onLlmDraftChange((prev) => ({
          ...prev,
          vision: {
            ...prev.vision,
            providers: (prev.vision?.providers || []).filter((item) => item.id !== draft.id),
          },
        }));
      } else if (draft.id === 'embedding') {
        onLlmDraftChange((prev) => ({ ...prev, embedding: { ...prev.embedding, enabled: false } }));
      } else {
        onLlmDraftChange((prev) => ({
          ...prev,
          profiles: (prev.profiles || []).filter((profile) => profile.id !== draft.id),
        }));
      }
      if (selectionBySection.llmConfig === draft.id) {
        if (isVisionDraft) {
          const fallback = (llmDraft.vision?.providers || []).find((item) => item.id !== draft.id);
          selectItem(fallback?.id || '');
        } else {
          selectItem('chat');
        }
      }
      return;
    }
    // Embedding 现在挂在 Context 分组下：草稿作废时只要关回去，不动 llm 草稿的其它入口。
    if (draft.section === 'embedding') {
      onLlmDraftChange((prev) => ({ ...prev, embedding: { ...prev.embedding, enabled: false } }));
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
        onSelectionChange((prev) => ({ ...prev, workflow: '' }));
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
    setSettingsSearch('');
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
    if (activeSection === 'embedding') {
      onLlmDraftChange((prev) => ({ ...prev, embedding: { ...prev.embedding, enabled: true } }));
      openEditor('embedding', 'embedding', 'new');
      return;
    }
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
        const provider = createVisionProviderDraft();
        onLlmDraftChange((prev) => ({
          ...prev,
          vision: {
            ...prev.vision,
            providers: [...(prev.vision?.providers || []), provider],
          },
        }));
        onSelectionChange((prev) => ({ ...prev, llm: 'vision', llmConfig: provider.id }));
        openEditor('llm', provider.id, 'new');
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
  const panelSection = editingSettings?.section || '';
  const panelSelectedId = editingSettings?.id || '';
  const panelMode = editingSettings?.mode || 'edit';
  const panelItems = panelSection === activeSection ? displayItems : configItemsForSection(panelSection, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
  const panelSelectedItem = panelItems.find((item) => item.id === panelSelectedId) || null;
  const panelEyebrow = panelMode === 'new' ? 'New' : (panelMode === 'detail' ? 'Details' : 'Edit');
  const panelUsesLlmTest = panelSection === 'llm' || panelSection === 'embedding';
  const panelIsConnectionSection = panelSection === 'memory';
  const panelConnectionStatus = settingsConnectionStatus?.[panelSection]?.[panelSelectedId] || storedMemoryConnectionStatus(records, panelSection, panelSelectedId);
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
  const performDelete = async (section, id) => {
    const sectionItems = section === activeSection ? displayItems : configItemsForSection(section, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
    if (section === 'agent') {
      const deleted = await onDeleteCustomAgent?.(id);
      if (deleted === false) return false;
    } else if (section === 'workflow') {
      const deleted = await onDeleteCustomWorkflow?.(id);
      if (deleted === false) return false;
    } else if (section === 'llm' || section === 'embedding') {
      const deleted = await onDeleteLlmProvider?.(section === 'llm' ? activeSubtab : 'embedding', id);
      if (deleted === false) return false;
    } else {
      onRecordsChange((prev) => ({
        ...prev,
        [section]: (prev[section] || []).filter((item) => item.id !== id),
      }));
    }
    if (section === activeSection) {
      if (section === 'workflow') {
        selectItem('');
      } else {
        const fallback = sectionItems.find((item) => item.id !== id);
        selectItem(fallback?.id || '');
      }
    }
    if (editingSettings?.section === section && editingSettings?.id === id) closeEditor();
  };
  const requestDelete = (section, id) => {
    const sectionItems = section === activeSection ? displayItems : configItemsForSection(section, llmDraft, records, activeSubtab, agentSettings, workflowSettings);
    const target = sectionItems.find((item) => item.id === id);
    if (!target || (target.protected && !target.canDelete)) return;
    const label = String(target.title || target.id || 'this entry').trim();
    closeAllPortalTooltips();
    setDeleteConfirm({
      section, id,
      kind: 'delete',
      title: label,
      message: `"${label}" will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => performDelete(section, id),
    });
  };
  const saveAndClose = async () => {
    setPanelBusy('save'); setPanelError('');
    try {
      const saved = panelSection === 'agent' ? await onSaveCustomAgent?.(panelSelectedId) : panelSection === 'workflow' ? await onSaveCustomWorkflow?.(panelSelectedId) : await onSave();
      if (saved !== false) closeEditor();
    } catch (error) { setPanelError(String(error?.message || error)); }
    finally { setPanelBusy(''); }
  };
  const testSelectedProvider = async () => {
    setPanelBusy('test');
    try { if (panelUsesLlmTest) await onTestLlmConfig?.(panelSelectedId); else await onTestSettingsConnection?.(panelSection, panelSelectedId); }
    finally { setPanelBusy(''); }
  };
  const editorBody = (section, id, mode = panelMode) => {
    const readOnly = mode === 'detail';
    if (section === 'llm' || section === 'embedding') {
      return id ? (
        <LlmConfigEditor
          selectedId={id}
          draft={llmDraft}
          onDraftChange={onLlmDraftChange}
          readOnly={readOnly}
          refreshModels={mode !== 'detail'}
          onToggleVisionProvider={toggleLlmProvider}
          toggleBusy={Boolean(llmToggleBusy)}
        />
      ) : (
        <div className="settings-empty">Click Add to create a configuration.</div>
      );
    }
    if (section === 'tools') {
      return (
        <ToolsConfigEditor
          key={id}
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
    return <GenericConfigEditor section={section} selectedId={id} records={records} onRecordsChange={onRecordsChange} readOnly={readOnly} />;
  };

  const workflowDetailOpen = showSideEditor && panelSection === 'workflow';
  const ordinaryEditorOpen = showSideEditor && !workflowDetailOpen;
  const navCount = (section, tab) => section === 'llm' || section === 'embedding' ? configItemsForSection(section, llmDraft, records, tab, agentSettings).length : section === 'agent' || section === 'workflow' ? configItemsForSection(section, llmDraft, records, '', agentSettings, workflowSettings).length : tab === 'tools-skills' ? (records.tools || []).find(r => r.id === tab)?.skills?.length || 0 : null;
  const addButton = canAddItem && <Button size="sm" onClick={addItem} disabled={Boolean(panelBusy)}><Plus size={16} />{activeSection === 'llm' || activeSection === 'embedding' ? 'Add provider' : activeSection === 'agent' ? 'Create agent' : 'Create workflow'}</Button>;
  return <div className="settings-page settings-modern settings-theme dark">
    <aside className="settings-nav-modern"><div className="settings-nav-title"><Settings2 size={17} />Settings</div><nav aria-label="Settings navigation">
      {SETTINGS_SECTIONS.map(section => {
        const children = section.children || SETTINGS_SUBTABS[section.id] || [];
        const isGroup = Boolean(section.children);
        const isActive = section.id === activeSection || children.some(child => child.id === activeSection);
        return <Collapsible key={section.id} open={expandedSettingsSections.has(section.id)} onOpenChange={open => setExpandedSettingsSections(prev => { const next = new Set(prev); if (open) next.add(section.id); else next.delete(section.id); return next; })}>
          <CollapsibleTrigger asChild><Button variant="ghost" className={`settings-nav-group ${isActive ? 'is-current' : ''}`}><span>{section.label}</span><ChevronRight size={14} /></Button></CollapsibleTrigger>
          <CollapsibleContent><div className="settings-nav-children">{children.map(child => {
            const selected = isGroup ? activeSection === child.id : activeSection === section.id && activeSubtab === child.id;
            const count = navCount(isGroup ? child.id : section.id, child.id);
            return <Button key={child.id} variant="ghost" className={`settings-nav-item ${selected ? 'is-selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => { if (panelBusy) return; if (isGroup) { cancelEditor(); setSettingsSearch(''); onSectionChange(child.id); } else selectSubtab(section.id, child.id); }}><AppIcon name={child.icon || SETTINGS_SUBTAB_ICONS[child.id] || 'configure'} size={16} /><span>{child.label}</span>{count !== null && <small>{count}</small>}</Button>;
          })}</div></CollapsibleContent>
        </Collapsible>;
      })}
    </nav></aside>
    <main className={`settings-modern-main ${ordinaryEditorOpen ? 'with-editor' : ''}`}>
      {workflowDetailOpen ? <div className="settings-legacy-workflow settings-workbench workflow-workbench provider-list-only has-detail">
            <section className="settings-editor settings-detail-drawer is-editing">
              <div className="settings-editor-head">
                <div className="settings-editor-title">
                  {panelSection === 'workflow' ? (
                    <button
                      type="button"
                      className="settings-pane-close"
                      onClick={cancelEditor}
                      aria-label="Back"
                    >
                      <AppIcon name="back" size={18} />
                    </button>
                  ) : null}
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
                </div>
                {panelSection === 'llm' ? (
                  <SettingsTooltipIconButton label="Close" icon="close" iconSize={20} onClick={cancelEditor} />
                ) : panelSection === 'workflow' ? null : (
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
                      <AppIcon name="test" />
                      {panelConnectionTesting ? 'Testing...' : 'Test'}
                    </button>
                  ) : null}
                  {panelCanSave ? (
                    <SettingsTooltipIconButton label="Save" icon="save" iconSize={20} onClick={saveAndClose} />
                  ) : null}
                </div>
              ) : null}
            </section>
      </div> : showConfigList ? <div className="settings-content-modern">
        <div className="settings-page-heading"><h1>{activeSection === 'llm' ? `${listTitle} providers` : activeSection === 'agent' ? 'Agents' : activeSection === 'workflow' ? 'Agentic workflows' : listTitle}</h1>{activeSection !== 'llm' && addButton}</div>
        {!hideSettingsSearch && <div className={activeSection === 'llm' ? 'settings-provider-toolbar' : undefined}>
          <SettingsSearch label={activeSection === 'llm' ? 'Search providers or models' : `Search ${listTitle.toLowerCase()}`} value={settingsSearch} onChange={setSettingsSearch} />
          {activeSection === 'llm' && addButton}
        </div>}
        <ItemGroup className="settings-list-modern">{filteredItems.map(item => <SettingsRow key={item.id} title={item.title} description={item.summary} readOnly={item.readonly} selected={editingSettings?.id === item.id} icon={activeSection === 'llm' || activeSection === 'embedding' ? <ProviderIcon provider={item.provider} name={item.title} /> : activeSection === 'agent' ? <AgentListIcon item={item} /> : activeSection === 'workflow' ? <WorkflowListIcon item={item} /> : <ConnectionBrandIcon itemId={item.id} title={item.title} />} onOpen={() => { if (panelBusy) return; selectListItem(item.id); openEditor(activeSection, item.id, item.readonly ? 'detail' : 'edit'); }} enabled={item.enabled} onToggle={item.canToggle ? enabled => (activeSection === 'agent' ? onTogglePresetAgent : activeSection === 'workflow' ? onTogglePresetWorkflow : toggleLlmProvider)?.(item.id, enabled) : undefined} busy={Boolean(panelBusy) || Boolean(llmToggleBusy)} onDelete={item.canDelete || item.custom ? () => requestDelete(activeSection, item.id) : undefined} status={activeSection === 'memory' ? connectionBadgeMeta(settingsConnectionStatus?.[activeSection]?.[item.id] || storedMemoryConnectionStatus(records, activeSection, item.id)) : undefined} />)}{!filteredItems.length && <div className="settings-empty">{settingsSearch ? 'No matching configuration.' : 'No configuration yet.'}</div>}</ItemGroup>
      </div> : editorBody(activeSection, selectedId, 'edit')}
    </main>
    <div data-settings-portal="" />
    <SettingsSheet open={ordinaryEditorOpen} title={panelSelectedItem?.title || listTitle} onClose={() => { if (!panelBusy) cancelEditor(); }}>
      {ordinaryEditorOpen && <><div className="settings-editor-scroll">{editorBody(panelSection, panelSelectedId, panelMode)}{panelConnectionStatus?.message && (panelConnectionStatus.state === 'error' ? <ErrorState variant="inline" detail={panelConnectionStatus.message} /> : <p className="settings-inline-success" role="status">{panelConnectionStatus.message}</p>)}{panelError && <ErrorState variant="inline" detail={panelError} />}</div><SheetFooter><div>{(panelUsesLlmTest || panelIsConnectionSection) && <Button size="sm" variant="outline" onClick={testSelectedProvider} disabled={Boolean(panelBusy) || panelConnectionTesting}>{panelBusy === 'test' || panelConnectionTesting ? <LoaderCircle size={15} className="settings-spin" /> : <FlaskConical size={15} />}Test connection</Button>}</div><div><Button size="sm" variant="ghost" disabled={Boolean(panelBusy)} onClick={cancelEditor}>{panelCanSave ? 'Cancel' : 'Close'}</Button>{panelCanSave && <Button size="sm" onClick={saveAndClose} disabled={Boolean(panelBusy)}>{panelBusy === 'save' ? 'Saving…' : 'Save'}</Button>}</div></SheetFooter></>}
    </SettingsSheet>
    <SettingsDeleteDialog target={deleteConfirm} onClose={() => setDeleteConfirm(null)} onConfirm={target => performDelete(target.section, target.id)} />
  </div>;
}

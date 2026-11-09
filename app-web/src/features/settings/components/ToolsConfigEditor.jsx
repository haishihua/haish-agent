import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, FileJson2, FlaskConical, LoaderCircle, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import { DEFAULT_MCP_CONFIG_JSON, MCP_CONFIG_TEMPLATE_JSON, WEB_SEARCH_PROVIDER_OPTIONS } from '../model/settings-records.js';
import { parseJsonSafe, isEmptyMcpConfigDraft, normalizeWebSearchDraft } from '../model/settings-payload.js';
import { activateWebSearchProvider, patchWebSearchProvider, webSearchProviderState } from '../model/web-search-provider.js';
import { setMcpServerEnabled } from '../model/mcp-server-toggle.js';
import { mcpServerRows } from '../model/mcp-server-panel.js';
import { skillSourceLabel } from '../model/skill-source-label.js';
import { isSkillPage, skillScopeForPage, skillGroups } from '../model/skill-inventory.js';
import './skill-tabs.css';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { LoadingState } from '../../../shared/ui/agent-elements/LoadingState.jsx';
import { SecretKeyField, FieldRow, SettingsRow, SettingsSearch, SettingsSheet, SettingsDeleteDialog } from './SettingsPrimitives.jsx';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { ItemGroup } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Textarea } from '../../../shared/ui/settings-elements/ui/textarea.tsx';
import { WebSearchProviderIcon } from './settings-ui.jsx';
import { SheetFooter } from '../../../shared/ui/settings-elements/ui/sheet.tsx';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../shared/ui/settings-elements/ui/collapsible.tsx';
import { SkillUpload } from './SkillUpload.jsx';
import { BrowserConfigEditor } from './BrowserConfigEditor.jsx';
import { McpServerPanel } from './McpServerPanel.jsx';

export function ToolsConfigEditor({ selectedId, records, onRecordsChange, onSaveTools, onTestWebProvider, onInstallSkill, onToggleSkill, onUninstallSkill, skillActionBusy, onToast, toolsSettingsState = { status: 'ready', error: '' }, onRefreshTools }) {
  const [query, setQuery] = useState('');
  const skillTab = skillScopeForPage(selectedId);
  const [editing, setEditing] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // MCP 折叠面板：一次只展开一台，展开态不写进记录（纯界面状态）。
  const [expandedServer, setExpandedServer] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState('');
  if (selectedId === 'tools-browser') return <BrowserConfigEditor onToast={onToast} />;
  const current = (records.tools || []).find(item => item.id === (isSkillPage(selectedId) ? 'tools-skills' : selectedId));
  if (!current) return <div className="settings-empty">No configuration available.</div>;
  const patchedRecords = patch => ({ ...records, tools: (records.tools || []).map(item => item.id === current.id ? { ...item, ...patch } : item) });
  const update = patch => onRecordsChange(prev => ({
    ...prev,
    tools: (prev.tools || []).map(item => (item.id === current.id
      ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) }
      : item)),
  }));
  // 错误走统一 toast（下面仍留一行 ErrorState 便于对着 JSON 改），不再往记录里写状态文案。
  const run = async (name, action) => {
    setBusy(name); setError('');
    try { return await action(); } catch (failure) {
      const message = String(failure?.message || failure);
      setError(message);
      onToast?.('error', message);
      return false;
    } finally { setBusy(''); }
  };

  if (selectedId === 'tools-mcp') {
    const json = current.mcp_json ?? DEFAULT_MCP_CONFIG_JSON;
    const parsed = parseJsonSafe(json);
    const servers = parsed.ok && parsed.value?.servers && typeof parsed.value.servers === 'object' && !Array.isArray(parsed.value.servers) ? Object.entries(parsed.value.servers) : [];
    // 列表行 = mcp.json 里的配置 + core 那份缓存快照（工具清单/是否加载/错误）。
    const rows = mcpServerRows(parsed.ok ? parsed.value : null, current.mcp_servers);
    // Save 会先校验再落盘，那条成功提示由 save 自己发，不重复报一次。
    const validate = async ({ quiet = false } = {}) => {
      if (!parsed.ok) throw new Error(parsed.error);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/mcp/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: parsed.value }) }, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `MCP validation failed (${response.status})`));
      update({ mcp_error: '' });
      if (!quiet) onToast?.('success', 'MCP config is valid.');
    };
    // 开关（就是 skill 行那一颗共享 Switch）= 改这一台的 enabled 再整份保存
    // （core 会把 mcp.json 落盘并重载 hub），和下面输入框的 Save 走同一条路；
    // 读回来的配置就是服务端真正落盘的那份。
    const toggleServer = (name, enabled) => run(`server:${name}`, async () => {
      if (!parsed.ok) throw new Error(parsed.error);
      if (!onSaveTools) throw new Error('Saving MCP settings is not available from here.');
      const mcp_json = JSON.stringify(setMcpServerEnabled(parsed.value, name, enabled), null, 2);
      const saved = await onSaveTools(patchedRecords({ mcp_json, mcp_error: '', mcp_status: '' }), enabled ? `${name} enabled` : `${name} disabled`, 'mcp');
      if (saved === false) throw new Error(`MCP server ${name} was not updated.`);
    });
    // 展开区那个 Load tools：显式用户动作才去连一台 server 拿工具清单（core 的
    // POST /api/mcp/catalog/{name}），拿完重新拉一次设置让快照更新。
    const loadServerTools = async (name) => {
      setLoadingCatalog(name);
      try {
        const response = await apiFetch(`${API_BASE}/api/mcp/catalog/${encodeURIComponent(name)}`, { method: 'POST' }, { json: false });
        if (!response.ok) throw new Error(await parseResponseMessage(response, `Could not load tools from ${name} (${response.status})`));
        await response.json().catch(() => null);
        await onRefreshTools?.();
      } catch (failure) {
        const message = String(failure?.message || failure);
        setError(message);
        onToast?.('error', message);
      } finally {
        setLoadingCatalog('');
      }
    };
    return <div className="settings-content-modern"><div className="settings-page-heading"><h1>MCP servers</h1><Button variant="ghost" size="sm" className="settings-heading-action" disabled={Boolean(busy || toolsSettingsState.refreshing)} onClick={onRefreshTools}><RefreshCw size={14} aria-hidden="true" className={toolsSettingsState.refreshing ? 'settings-spin' : undefined} />Refresh</Button></div><div className="mcp-workspace">
      {rows.length > 0 && <McpServerPanel servers={rows} expandedId={expandedServer} onToggle={name => setExpandedServer(current => (current === name ? '' : name))} onToggleServer={toggleServer} onLoadTools={loadServerTools} loadingName={loadingCatalog} busy={Boolean(busy)} />}
      <div className="mcp-code-surface"><div className="mcp-code-toolbar"><div className="mcp-file-label"><FileJson2 size={16} /><strong>mcp.json</strong><span>{servers.length} {servers.length === 1 ? 'server' : 'servers'}</span></div><div className="mcp-editor-actions">
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => { if (!isEmptyMcpConfigDraft(json)) { onToast?.('warn', 'Template can only fill an empty MCP config.'); return; } setError(''); update({ mcp_json: MCP_CONFIG_TEMPLATE_JSON, mcp_error: '', mcp_status: '' }); }}>Template</Button>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => { if (!parsed.ok) { onToast?.('error', parsed.error); return; } setError(''); update({ mcp_json: JSON.stringify(parsed.value, null, 2), mcp_error: '', mcp_status: '' }); }}>Format</Button>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => run('validate', () => validate())}>{busy === 'validate' ? 'Validating…' : 'Validate'}</Button>
        <Button size="sm" disabled={Boolean(busy)} onClick={() => run('save', async () => { await validate({ quiet: true }); const next = patchedRecords({ mcp_json: JSON.stringify(parsed.value, null, 2), mcp_error: '', mcp_status: '' }); await onSaveTools?.(next, 'MCP config saved and reloaded', 'mcp'); })}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
      </div></div><Textarea className="mcp-json" aria-label="MCP configuration JSON" value={json} disabled={Boolean(busy)} onChange={event => { setError(''); update({ mcp_json: event.target.value, mcp_error: '', mcp_status: '' }); }} spellCheck={false} wrap="off" /></div>
      {(error || current.mcp_error) && <ErrorState variant="inline" detail={error || current.mcp_error} />}
    </div></div>;
  }

  const skillsPane = isSkillPage(selectedId);
  const skills = Array.isArray(current.skills) ? current.skills : [];
  const skillErrors = current.skill_errors || [];
  const web = normalizeWebSearchDraft(current.web_search);
  const groups = skillGroups(current);
  const tabSkills = groups[skillTab] || [];
  const shown = (skillsPane ? tabSkills : WEB_SEARCH_PROVIDER_OPTIONS).filter(item => `${item.name || item.label} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  const selectedSkill = tabSkills.find(skill => (skill.id || skill.name) === editing);
  const provider = WEB_SEARCH_PROVIDER_OPTIONS.find(item => item.id === editing);
  const providerDraft = provider ? web.providers[provider.id] || {} : {};
  // 开关＝“用这一家”：点一下就写回后端，失败回滚。单选没“全关”，点当前那家给一句提示。
  const activateProvider = async id => {
    const label = WEB_SEARCH_PROVIDER_OPTIONS.find(item => item.id === id)?.label || id;
    const next = activateWebSearchProvider(web, id);
    if (next === web) { onToast?.('info', `${label} is already the active search provider.`); return; }
    update({ web_search: next });
    await run(`provider:${id}`, async () => {
      if (!onSaveTools) throw new Error('Saving search settings is not available from here.');
      // 连同草稿里的 key 一起提交，否则刚贴的密钥会被默默丢掉。
      try {
        const saved = await onSaveTools(patchedRecords({ web_search: next }), `${label} is now the active search provider`, 'web_search');
        if (saved === false) throw new Error(`${label} was not saved.`);
      } catch (failure) {
        // 只回滚开关：请求期间在面板里输入的其它草稿（比如另一家的 key）不能跟着丢。
        update(record => ({ web_search: { ...record.web_search, provider: web.provider } }));
        throw failure;
      }
    });
  };
  const patchProvider = patch => update({ web_search: patchWebSearchProvider(web, provider.id, patch) });
  const saveProvider = async () => {
    const saved = await onSaveTools?.(patchedRecords({ web_search: web }), 'Search provider saved', 'web_search');
    if (saved !== false) setEditing(null);
  };
  if (skillsPane && toolsSettingsState.status !== 'ready') {
    return <div className="settings-content-modern settings-skills-content"><div className="settings-page-heading"><h1>Skills · {skillTab === 'builtin' ? 'Built-in' : skillTab === 'global' ? 'Global' : 'Project'}</h1></div>
      {toolsSettingsState.status === 'error'
        ? <><ErrorState variant="inline" detail={toolsSettingsState.error || 'Unable to load current skills.'} /><Button variant="outline" size="sm" onClick={onRefreshTools}>Retry</Button></>
        : <div className="app-body-loading"><LoadingState role="status" label="Loading settings…" /></div>}
    </div>;
  }
  return <div className={`settings-tools-modern ${editing ? 'with-editor' : ''}`}><div className={`settings-content-modern ${skillsPane ? 'settings-skills-content' : ''}`}>
    <div className="settings-page-heading"><h1>{skillsPane ? `Skills · ${skillTab === 'builtin' ? 'Built-in' : skillTab === 'global' ? 'Global' : 'Project'}` : 'Search providers'}</h1>{skillsPane && <div className="settings-skill-actions">{onRefreshTools && <Button variant="ghost" size="sm" className="settings-heading-action" disabled={Boolean(skillActionBusy || toolsSettingsState.refreshing)} onClick={onRefreshTools}><RefreshCw size={14} aria-hidden="true" className={toolsSettingsState.refreshing ? 'settings-spin' : undefined} />Refresh</Button>}{skillTab !== 'builtin' && current.skill_can_install !== false && <Button size="sm" disabled={Boolean(skillActionBusy)} onClick={() => { setEditing(null); setInstalling(true); }}><Plus size={16} />Install skill</Button>}</div>}</div>
    {skillsPane && toolsSettingsState.error && <div className="settings-skill-refresh-error"><ErrorState variant="inline" detail={toolsSettingsState.error} /><Button variant="outline" size="sm" onClick={onRefreshTools}>Retry</Button></div>}
    <div id={skillsPane ? 'skill-list-panel' : undefined}>
    <SettingsSearch value={query} onChange={setQuery} label={skillsPane ? 'Search skills' : 'Search providers'} />
    <ItemGroup className="settings-list-modern">{shown.map(item => {
      const id = skillsPane ? item.id || item.name : item.id;
      const providerState = skillsPane ? undefined : webSearchProviderState(web, id);
      const isActive = Boolean(providerState?.active);
      const skillSource = skillSourceLabel(item.source);
      return <SettingsRow key={id} title={item.name || item.label} description={skillsPane && item.shadowed ? `${item.description || ''} · Overridden by the current project.` : skillsPane && skillTab === 'project' && groups.global.some(global => global.name === item.name) ? `${item.description || ''} · Overrides the user-level Codex version.` : item.description} icon={skillsPane ? <Sparkles size={22} /> : <WebSearchProviderIcon provider={id} label={item.label} />} selected={editing === id} onOpen={() => { setEditing(id); setError(''); }} enabled={skillsPane ? item.enabled : isActive} onToggle={skillsPane ? (item.shadowed ? undefined : enabled => onToggleSkill(item.name, enabled)) : () => activateProvider(id)} busy={Boolean(skillActionBusy || busy)} onDelete={skillsPane && item.can_uninstall ? () => setDeleting({ title: item.name }) : undefined} deleteLabel="Uninstall skill" badge={skillsPane ? skillSource : undefined} toggleLabel={skillsPane ? undefined : `${item.label} for web search`} toggleTitle={skillsPane ? undefined : (isActive ? `${item.label} is the active search provider` : `Use ${item.label} for web search`)} />;
    })}{!shown.length && <div className="settings-empty">{query ? 'No matching items.' : skillsPane ? 'No skills in this scope.' : 'No providers available.'}</div>}</ItemGroup>
    </div>
    {skillsPane && skillErrors.length > 0 && <Collapsible className="settings-skill-errors">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><AlertTriangle size={14} /><span>{skillErrors.length} {skillErrors.length === 1 ? 'skill' : 'skills'} couldn’t be loaded</span><ChevronRight size={14} className="settings-skill-errors-chevron" /></Button></CollapsibleTrigger>
      <CollapsibleContent><ul>{skillErrors.map((failure, index) => <li key={index}><p>{failure.message || failure.code}</p>{failure.origin && <span>{failure.origin}</span>}</li>)}</ul></CollapsibleContent>
    </Collapsible>}
    </div>
    <SettingsSheet open={Boolean(editing)} title={selectedSkill?.name || provider?.label || 'Details'} onClose={() => { if (!busy) setEditing(null); }}><div className="settings-editor-scroll">
      {selectedSkill && <div className="skill-details"><p>{selectedSkill.description}</p>{(selectedSkill.root || selectedSkill.path || selectedSkill.origin || selectedSkill.source_path) && <dl><dt>Location</dt><dd>{selectedSkill.root || selectedSkill.path || selectedSkill.origin || selectedSkill.source_path}</dd></dl>}</div>}
      {provider && <FieldRow label="API key"><SecretKeyField value={providerDraft.api_key || ''} configured={providerDraft.api_key_configured} onChange={event => patchProvider({ api_key: event.target.value })} disabled={Boolean(busy)} /></FieldRow>}
      {error && <ErrorState variant="inline" detail={error} />}
    </div><SheetFooter><div>{provider && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => run('test', () => onTestWebProvider?.(provider.id, providerDraft.api_key || ''))}>{busy === 'test' ? <LoaderCircle size={15} className="settings-spin" /> : <FlaskConical size={15} />}Test connection</Button>}</div><div><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setEditing(null)}>{skillsPane ? 'Close' : 'Cancel'}</Button>{provider && <Button size="sm" disabled={Boolean(busy)} onClick={() => run('save', saveProvider)}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}</div></SheetFooter></SettingsSheet>
    {installing && <SkillUpload installedSkills={skills} destination={skillTab === 'project' ? `Project · ${current.skill_workspace || 'Current workspace'}` : 'Global · All projects'} onClose={() => setInstalling(false)} onInstall={(_skill, file) => onInstallSkill(file, skillTab)} />}
    <SettingsDeleteDialog target={deleting} label="Uninstall skill" onClose={() => setDeleting(null)} onConfirm={async target => { const success = await onUninstallSkill(target.title, skillTab); if (success !== false && selectedSkill?.name === target.title) setEditing(null); return success; }} />
  </div>;
}

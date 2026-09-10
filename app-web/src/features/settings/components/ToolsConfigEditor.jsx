import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, FileJson2, FlaskConical, LoaderCircle, Plus, Server, Sparkles } from 'lucide-react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import { DEFAULT_MCP_CONFIG_JSON, MCP_CONFIG_TEMPLATE_JSON, WEB_SEARCH_PROVIDER_OPTIONS } from '../model/settings-records.js';
import { parseJsonSafe, isEmptyMcpConfigDraft, normalizeWebSearchDraft } from '../model/settings-payload.js';
import { WEB_SEARCH_BRAND_LOGOS } from './settings-ui.jsx';
import { SecretKeyField, FieldRow, SettingsRow, SettingsSearch, SettingsSheet, SettingsDeleteDialog } from './SettingsPrimitives.jsx';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Item, ItemGroup } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Textarea } from '../../../shared/ui/settings-elements/ui/textarea.tsx';
import { BrandLogoIcon } from './settings-ui.jsx';
import { SheetFooter } from '../../../shared/ui/settings-elements/ui/sheet.tsx';
import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../shared/ui/settings-elements/ui/collapsible.tsx';
import { SkillUpload } from './SkillUpload.jsx';

export function ToolsConfigEditor({ selectedId, records, onRecordsChange, onSaveTools, onTestWebProvider, onInstallSkill, onToggleSkill, onUninstallSkill, skillActionBusy }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = (records.tools || []).find(item => item.id === selectedId);
  if (!current) return <div className="settings-empty">No configuration available.</div>;
  const patchedRecords = patch => ({ ...records, tools: (records.tools || []).map(item => item.id === current.id ? { ...item, ...patch } : item) });
  const update = patch => onRecordsChange(prev => ({ ...prev, tools: (prev.tools || []).map(item => item.id === current.id ? { ...item, ...patch } : item) }));
  const run = async (name, action) => { setBusy(name); setError(''); try { return await action(); } catch (failure) { setError(String(failure?.message || failure)); return false; } finally { setBusy(''); } };

  if (selectedId === 'tools-mcp') {
    const json = current.mcp_json ?? DEFAULT_MCP_CONFIG_JSON;
    const parsed = parseJsonSafe(json);
    const servers = parsed.ok && parsed.value?.servers && typeof parsed.value.servers === 'object' && !Array.isArray(parsed.value.servers) ? Object.entries(parsed.value.servers) : [];
    const validate = async () => {
      if (!parsed.ok) throw new Error(parsed.error);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/mcp/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: parsed.value }) }, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `MCP validation failed (${response.status})`));
      update({ mcp_error: '', mcp_status: 'MCP config is valid.' });
    };
    return <div className="settings-content-modern"><div className="settings-page-heading"><h1>MCP servers</h1></div><div className="mcp-workspace">
      {servers.length > 0 && <div className="mcp-servers-surface"><div className="mcp-server-columns" aria-hidden="true"><span /><span>Server</span><span>Transport</span><span>Status</span></div><ItemGroup className="mcp-server-list">{servers.map(([name, server]) => <Item key={name} className="mcp-server-row"><Server size={16} /><span className="mcp-server-name">{name}</span><span className="mcp-server-transport">{typeof server?.transport === 'string' ? server.transport : 'stdio'}</span><span className={`mcp-server-status ${server?.enabled === false ? 'is-disabled' : ''}`}><span className="mcp-status-dot" />{server?.enabled === false ? 'Disabled' : 'Enabled'}</span></Item>)}</ItemGroup></div>}
      <div className="mcp-code-surface"><div className="mcp-code-toolbar"><div className="mcp-file-label"><FileJson2 size={16} /><strong>mcp.json</strong><span>{servers.length} {servers.length === 1 ? 'server' : 'servers'}</span></div><div className="mcp-editor-actions">
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => { if (!isEmptyMcpConfigDraft(json)) { setError('Template can only fill an empty MCP config.'); return; } setError(''); update({ mcp_json: MCP_CONFIG_TEMPLATE_JSON, mcp_error: '', mcp_status: '' }); }}>Template</Button>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => { if (!parsed.ok) { setError(parsed.error); return; } setError(''); update({ mcp_json: JSON.stringify(parsed.value, null, 2), mcp_error: '', mcp_status: '' }); }}>Format</Button>
        <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => run('validate', validate)}>{busy === 'validate' ? 'Validating…' : 'Validate'}</Button>
        <Button size="sm" disabled={Boolean(busy)} onClick={() => run('save', async () => { await validate(); const next = patchedRecords({ mcp_json: JSON.stringify(parsed.value, null, 2), mcp_error: '', mcp_status: '' }); onRecordsChange(next); if (await onSaveTools?.(next, 'MCP config saved and reloaded') !== false) update({ mcp_status: 'Saved and MCP reloaded.' }); })}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>
      </div></div><Textarea className="mcp-json" aria-label="MCP configuration JSON" value={json} disabled={Boolean(busy)} onChange={event => { setError(''); update({ mcp_json: event.target.value, mcp_error: '', mcp_status: '' }); }} spellCheck={false} wrap="off" /></div>
      {(error || current.mcp_error) && <p className="settings-inline-error" role="alert">{error || current.mcp_error}</p>}{!error && current.mcp_status && <p className="settings-inline-success" role="status">{current.mcp_status}</p>}
    </div></div>;
  }

  const skillsPane = selectedId === 'tools-skills';
  const skills = Array.isArray(current.skills) ? current.skills : [];
  const skillErrors = current.skill_errors || [];
  const web = normalizeWebSearchDraft(current.web_search);
  const shown = (skillsPane ? skills : WEB_SEARCH_PROVIDER_OPTIONS).filter(item => `${item.name || item.label} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()));
  const selectedSkill = skills.find(skill => (skill.id || skill.name) === editing);
  const provider = WEB_SEARCH_PROVIDER_OPTIONS.find(item => item.id === editing);
  const providerDraft = provider ? web.providers[provider.id] || {} : {};
  const patchProvider = patch => update({ web_search: normalizeWebSearchDraft({ ...web, providers: { ...web.providers, [provider.id]: { ...providerDraft, ...patch } } }) });
  const saveProvider = async () => {
    const saved = await onSaveTools?.(patchedRecords({ web_search: web }), 'Search provider saved');
    if (saved !== false) setEditing(null);
  };
  return <div className={`settings-tools-modern ${editing ? 'with-editor' : ''}`}><div className="settings-content-modern">
    <div className="settings-page-heading"><h1>{skillsPane ? 'Installed skills' : 'Search providers'}</h1>{skillsPane && current.skill_can_install !== false && <Button size="sm" disabled={Boolean(skillActionBusy)} onClick={() => { setEditing(null); setInstalling(true); }}><Plus size={16} />Install skill</Button>}</div>
    <SettingsSearch value={query} onChange={setQuery} label={skillsPane ? 'Search skills' : 'Search providers'} />
    <ItemGroup className="settings-list-modern">{shown.map(item => {
      const id = skillsPane ? item.id || item.name : item.id;
      const configured = !skillsPane && Boolean(web.providers[id]?.api_key_configured || web.providers[id]?.api_key);
      return <SettingsRow key={id} title={item.name || item.label} description={item.description} icon={skillsPane ? <Sparkles size={22} /> : <BrandLogoIcon logo={WEB_SEARCH_BRAND_LOGOS[id]} />} selected={editing === id} onOpen={() => { setEditing(id); setError(''); }} enabled={item.enabled} onToggle={skillsPane ? enabled => onToggleSkill(item.name, enabled) : undefined} busy={Boolean(skillActionBusy || busy)} onDelete={skillsPane && item.can_uninstall ? () => setDeleting({ title: item.name }) : undefined} deleteLabel="Uninstall skill" status={!skillsPane ? { label: configured ? 'Configured' : 'Needs setup', className: configured ? 'success' : '' } : undefined} />;
    })}{!shown.length && <div className="settings-empty">{query ? 'No matching items.' : 'No installed skills.'}</div>}</ItemGroup>
    {skillsPane && skillErrors.length > 0 && <Collapsible className="settings-skill-errors">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><AlertTriangle size={14} /><span>{skillErrors.length} {skillErrors.length === 1 ? 'skill' : 'skills'} couldn’t be loaded</span><ChevronRight size={14} className="settings-skill-errors-chevron" /></Button></CollapsibleTrigger>
      <CollapsibleContent><ul>{skillErrors.map((failure, index) => <li key={index}><p>{failure.message || failure.code}</p>{failure.origin && <span>{failure.origin}</span>}</li>)}</ul></CollapsibleContent>
    </Collapsible>}
    </div>
    <SettingsSheet open={Boolean(editing)} title={selectedSkill?.name || provider?.label || 'Details'} onClose={() => { if (!busy) setEditing(null); }}><div className="settings-editor-scroll">
      {selectedSkill && <div className="skill-details"><p>{selectedSkill.description}</p>{(selectedSkill.root || selectedSkill.path || selectedSkill.origin || selectedSkill.source_path) && <dl><dt>Location</dt><dd>{selectedSkill.root || selectedSkill.path || selectedSkill.origin || selectedSkill.source_path}</dd></dl>}<div className="settings-toggle-modern"><span>Enable skill</span><Switch aria-label="Enable skill" checked={selectedSkill.enabled !== false} disabled={Boolean(skillActionBusy)} onCheckedChange={enabled => onToggleSkill(selectedSkill.name, enabled)} /></div></div>}
      {provider && <FieldRow label={`${provider.label} API key`}><SecretKeyField value={providerDraft.api_key || ''} configured={providerDraft.api_key_configured} onChange={event => patchProvider({ api_key: event.target.value })} disabled={Boolean(busy)} /></FieldRow>}
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
    </div><SheetFooter><div>{provider && <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => run('test', async () => { if (await onSaveTools?.(patchedRecords({ web_search: web }), '') !== false) await onTestWebProvider?.(provider.id, providerDraft.api_key || ''); })}>{busy === 'test' ? <LoaderCircle size={15} className="settings-spin" /> : <FlaskConical size={15} />}Test connection</Button>}</div><div><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setEditing(null)}>{skillsPane ? 'Close' : 'Cancel'}</Button>{provider && <Button size="sm" disabled={Boolean(busy)} onClick={() => run('save', saveProvider)}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}</div></SheetFooter></SettingsSheet>
    {installing && <SkillUpload installedSkills={skills} onClose={() => setInstalling(false)} onInstall={(_skill, file) => onInstallSkill(file)} />}
    <SettingsDeleteDialog target={deleting} label="Uninstall skill" onClose={() => setDeleting(null)} onConfirm={async target => { const success = await onUninstallSkill(target.title); if (success !== false && selectedSkill?.name === target.title) setEditing(null); return success; }} />
  </div>;
}

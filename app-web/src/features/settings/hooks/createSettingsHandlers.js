import { reconcileSettings, copySettingsResponse, hasSettingsVersion } from '../../../shared/lib/settings-sync.js';
import { setImageProviderEnabled, setVisionProviderEnabled } from '../model/llm-settings.js';
import { withoutStoredSkillInventory } from '../model/live-tools-settings.js';
import { toolsSettingsPayloadForDraft } from '../model/settings-payload.js';

export function skillAllowPayload(value) {
  return value === null ? null : (Array.isArray(value) ? value : []);
}

export function createSettingsHandlers(ctx) {
  const {
    API_BASE,
    beginLlmSettingsWrite,
    SETTINGS_RECORDS_STORAGE_KEY,
    WEB_SEARCH_PROVIDER_OPTIONS,
    activeTab,
    skillConversationId,
    invalidateSkillInventory,
    beginToolsSettingsSave,
    agentCatalogFromSettings,
    agentSettingsDraft,
    applyMemorySettingsPayloadToRecords,
    applyToolsSettingsPayloadToRecords,
    apiFetch,
    buildMemorySettingsPayload,
    buildToolsSettingsPayload,
    createDefaultCustomAgentPayload,
    createDefaultCustomWorkflowPayload,
    getSelectedLlmConfig,
    llmProviderRequestPayload,
    llmSettingsDraft,
    normalizeAgentSettings,
    normalizeWorkflowSettings,
    parseResponseMessage,
    payloadForCustomWorkflow,
    setActiveTab,
    setAgentCatalog,
    setAgentSettingsDraft,
    setSettingsMode,
    setSettingsRecordsDraft,
    setSkillActionBusy,
    setWorkflowSettingsDraft,
    settingsRecordsDraft,
    showToast,
    updateSettingsConnectionStatus,
    withAlwaysAllowedAgentTools,
    workflowById,
    workflowSettingsDraft,
  } = ctx;

  const skillContextQuery = skillConversationId === undefined ? '' : `?conversation_id=${encodeURIComponent(skillConversationId || '')}`;

  function handleToggleSettings() {
    if (activeTab !== 'dashboard') setActiveTab('dashboard');
    // Section and subtab selections live in AppShell, so a Settings remount
    // restores the last page. First entry still uses AppShell's default tab.
    setSettingsMode((enabled) => !enabled);
  }

  async function writeLlmSettings(path, init, failureMessage) {
    const finish = beginLlmSettingsWrite(llmSettingsDraft);
    try {
      const response = await apiFetch(`${API_BASE}${path}`, init, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `${failureMessage}: ${response.status}`));
      finish(await response.json());
    } finally {
      finish();
    }
  }

  async function handleSaveSettingsDraft(section) {
    if (section === 'tools') return handleSaveToolsSettingsDraft();
    try {
      if (['llm', 'embedding', 'compact'].includes(section)) {
        await writeLlmSettings('/api/settings/llm', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(llmSettingsDraft),
        }, 'llm settings save failed');
      } else if (section === 'memory') {
        window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(withoutStoredSkillInventory(settingsRecordsDraft)));
        const response = await apiFetch(`${API_BASE}/api/settings/memory`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildMemorySettingsPayload(settingsRecordsDraft)),
        }, { json: false });
        if (!response.ok) throw new Error(await parseResponseMessage(response, `memory settings save failed: ${response.status}`));
        const payload = await response.json();
        setSettingsRecordsDraft(prev => applyMemorySettingsPayloadToRecords(prev, payload));
        // 保存后由服务端存的测试结果接手，会话内的临时状态清空。
        updateSettingsConnectionStatus({ memory: {} });
      } else {
        throw new Error('invalid settings save section');
      }
      showToast('success', section === 'compact' ? 'compact settings saved' : 'settings saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleSaveToolsSettingsDraft(nextRecords = settingsRecordsDraft, successMessage = 'settings saved', resource) {
    // Row switches submit staged records without publishing them. Compare late
    // edits with the actual draft, not with that distinct submission payload.
    const recordsAtRequest = settingsRecordsDraft;
    const finishToolsSettingsSave = beginToolsSettingsSave?.();
    let saved = false;
    try {
      window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(withoutStoredSkillInventory(nextRecords)));
      const toolsPayload = buildToolsSettingsPayload(nextRecords, resource);
      const response = await apiFetch(`${API_BASE}/api/settings/tools${skillContextQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolsPayload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `settings save failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      invalidateSkillInventory?.();
      setSettingsRecordsDraft(prev => applyToolsSettingsPayloadToRecords(prev, hasSettingsVersion(payload) ? payload : toolsSettingsPayloadForDraft(prev, payload, recordsAtRequest)));
      saved = true;
      if (successMessage) showToast('success', successMessage);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    } finally {
      finishToolsSettingsSave?.(saved);
    }
  }

  async function handleDeleteLlmProvider(providerType, entryId) {
    try {
      const scope = String(providerType || '').trim().toLowerCase();
      const target = String(entryId || '').trim() || scope;
      if (!['chat', 'vision', 'image', 'embedding', 'compact'].includes(scope) || !target) {
        throw new Error('invalid llm provider delete scope');
      }
      await writeLlmSettings(
        `/api/settings/llm/providers/${encodeURIComponent(scope)}/${encodeURIComponent(target)}`,
        { method: 'DELETE' }, 'provider delete failed',
      );
      showToast('success', 'provider deleted');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleToggleLlmProvider(entryId, enabled) {
    const id = String(entryId || '').trim();
    const scope = (llmSettingsDraft?.compact?.providers || []).some(item => item.id === id) ? 'compact'
      : ((llmSettingsDraft?.image?.providers || []).some(item => item.id === id) ? 'image' : 'vision');
    const providers = llmSettingsDraft?.[scope]?.providers || [];
    if (!id || !providers.some((item) => item.id === id)) return false;
    // 服务端同样会收敛成“至多一条启用”；本地先收敛，避免界面短暂出现两条开启。
    const nextDraft = {
      ...llmSettingsDraft,
      [scope]: scope === 'image'
        ? setImageProviderEnabled(llmSettingsDraft?.[scope], id, enabled === true)
        : setVisionProviderEnabled(llmSettingsDraft?.[scope], id, enabled === true),
    };
    try {
      await writeLlmSettings('/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextDraft),
      }, `${scope} provider update failed`);
      showToast('success', `${scope} provider ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function applyAgentSettingsPayload(payload) {
    const normalized = normalizeAgentSettings(payload);
    if (hasSettingsVersion(payload)) setAgentSettingsDraft(previous => reconcileSettings('agents', previous, normalized, payload));
    else setAgentSettingsDraft(normalized);
    setAgentCatalog(agentCatalogFromSettings(normalized));
    return normalized;
  }

  async function fetchAgentSettingsPayload() {
    const response = await apiFetch(`${API_BASE}/api/settings/agents`, { method: 'GET' }, { json: false });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `agent settings fetch failed: ${response.status}`);
      throw new Error(message);
    }
    return response.json();
  }

  function customAgentPayload(agentId) {
    const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
    if (!current) return null;
    const displayName = String(current.display_name || '').trim();
    if (!displayName) throw new Error('agent name is required');
    return {
      id: current.agent_id,
      base: current.base || 'preset.general',
      display_name: displayName,
      description: current.description || '',
      enabled: current.enabled !== false,
      system_prompt: current.system_prompt || '',
      tool_policy: {
        allow: current.tool_policy?.allow === null ? null : withAlwaysAllowedAgentTools(current.tool_policy?.allow),
        deny: Array.isArray(current.tool_policy?.deny) ? current.tool_policy.deny : [],
      },
      mcp_policy: {
        allow_servers: Array.isArray(current.mcp_policy?.allow_servers) ? current.mcp_policy.allow_servers : [],
        allow_tools: Array.isArray(current.mcp_policy?.allow_tools) ? current.mcp_policy.allow_tools : [],
      },
      skill_policy: {
        allow: skillAllowPayload(current.skill_policy?.allow),
        deny: Array.isArray(current.skill_policy?.deny) ? current.skill_policy.deny : [],
      },
    };
  }

  async function handleTogglePresetAgent(agentId, enabled) {
    try {
      const response = await apiFetch(`${API_BASE}/api/settings/agents/presets/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent settings save failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'agent settings saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleCreateCustomAgent() {
    const draft = createDefaultCustomAgentPayload(agentSettingsDraft);
    setAgentSettingsDraft((prev) => {
      const normalized = normalizeAgentSettings(prev);
      return { ...normalized, custom: [...normalized.custom, draft] };
    });
    return draft.id;
  }

  async function handleSaveCustomAgent(agentId) {
    try {
      const payload = customAgentPayload(agentId);
      if (!payload) throw new Error('custom agent not found');
      const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
      const isDraft = Boolean(current?.draft);
      const endpoint = isDraft
        ? `${API_BASE}/api/settings/agents/custom`
        : `${API_BASE}/api/settings/agents/custom/${encodeURIComponent(agentId)}`;
      const response = await apiFetch(endpoint, {
        method: isDraft ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent save failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'custom agent saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleDeleteCustomAgent(agentId) {
    try {
      const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
      if (current?.draft) {
        setAgentSettingsDraft((prev) => {
          const normalized = normalizeAgentSettings(prev);
          return {
            ...normalized,
            custom: normalized.custom.filter((item) => item.agent_id !== agentId),
          };
        });
        return true;
      }
      const response = await apiFetch(`${API_BASE}/api/settings/agents/custom/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent delete failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'custom agent deleted');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function applyWorkflowSettingsPayload(payload) {
    const normalized = normalizeWorkflowSettings(payload);
    if (hasSettingsVersion(payload)) setWorkflowSettingsDraft(previous => reconcileSettings('workflows', previous, normalized, payload));
    else setWorkflowSettingsDraft(normalized);
    return normalized;
  }

  async function fetchWorkflowSettingsPayload() {
    const response = await apiFetch(`${API_BASE}/api/settings/workflows`, { method: 'GET' }, { json: false });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `workflow settings fetch failed: ${response.status}`);
      throw new Error(message);
    }
    return response.json();
  }

  async function handleTogglePresetWorkflow(workflowId, enabled) {
    try {
      const response = await apiFetch(`${API_BASE}/api/settings/workflows/presets/${encodeURIComponent(workflowId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow settings save failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'workflow settings saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleCreateCustomWorkflow() {
    const draft = createDefaultCustomWorkflowPayload();
    setWorkflowSettingsDraft((prev) => {
      const normalized = normalizeWorkflowSettings(prev);
      return { ...normalized, custom: [...normalized.custom, draft] };
    });
    return draft.workflow_id;
  }

  async function handleSaveCustomWorkflow(workflowId) {
    try {
      const current = workflowById(workflowSettingsDraft, workflowId);
      if (!current) throw new Error('custom workflow not found');
      if (!String(current.display_name || '').trim()) {
        showToast('error', 'Workflow name is required');
        return false;
      }
      const payload = payloadForCustomWorkflow(current);
      const isDraft = Boolean(current.draft);
      const endpoint = isDraft
        ? `${API_BASE}/api/settings/workflows/custom`
        : `${API_BASE}/api/settings/workflows/custom/${encodeURIComponent(workflowId)}`;
      const response = await apiFetch(endpoint, {
        method: isDraft ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow save failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'custom workflow saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleDeleteCustomWorkflow(workflowId) {
    try {
      const current = workflowById(workflowSettingsDraft, workflowId);
      if (current?.draft) {
        setWorkflowSettingsDraft((prev) => {
          const normalized = normalizeWorkflowSettings(prev);
          return {
            ...normalized,
            custom: normalized.custom.filter((item) => item.workflow_id !== workflowId),
          };
        });
        return true;
      }
      const response = await apiFetch(`${API_BASE}/api/settings/workflows/custom/${encodeURIComponent(workflowId)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow delete failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'custom workflow deleted');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleTestLlmConfig(selectedId) {
    const config = getSelectedLlmConfig(llmSettingsDraft, selectedId);
    if (!config?.provider) return;
    const isVisionProvider = (llmSettingsDraft?.vision?.providers || []).some((item) => item.id === selectedId);
    const isImageProvider = (llmSettingsDraft?.image?.providers || []).some((item) => item.id === selectedId);
    const isCompactProvider = (llmSettingsDraft?.compact?.providers || []).some(item => item.id === selectedId);
    const providerType = selectedId === 'embedding' ? 'embedding' : isCompactProvider ? 'compact' : isImageProvider ? 'image' : isVisionProvider ? 'vision' : 'chat';
    try {
      const response = await apiFetch(`${API_BASE}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmProviderRequestPayload(config, {
          includeSecret: true,
          providerType,
        })),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `llm test failed: ${response.status}`);
        throw new Error(message);
      }
      await response.json();
      showToast('success', providerType === 'embedding' ? 'embedding provider test passed' : 'llm provider test passed');
    } catch (error) {
      showToast('error', String(error?.message || error));
    }
  }

  async function handleTestWebProvider(provider, apiKey = '') {
    const providerLabel = WEB_SEARCH_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label || provider;
    try {
      const trimmed = String(apiKey || '').trim();
      const response = await apiFetch(`${API_BASE}/api/settings/tools/web-search/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(trimmed ? { api_key: trimmed } : {}),
        }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `web search provider test failed: ${response.status}`);
        throw new Error(message);
      }
      await response.json();
      showToast('success', `${providerLabel} API key test passed`);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function handleSettingsConnectionDirty(section, itemId) {
    if (section !== 'memory' || !itemId) return;
    updateSettingsConnectionStatus((prev) => {
      const current = prev?.[section]?.[itemId];
      if (!current || current.state === 'idle') return prev;
      return {
        ...prev,
        [section]: {
          ...(prev?.[section] || {}),
          [itemId]: { state: 'idle', message: '' },
        },
      };
    });
  }

  async function handleTestSettingsConnection(section, itemId) {
    // Qdrant 连接归 memory 段（知识库复用同一条），只有它有连接测试。
    if (section !== 'memory' || !itemId) return false;
    const label = 'Qdrant';
    const payload = buildMemorySettingsPayload(settingsRecordsDraft);
    // 结果只在“还在测”时落地：期间改过配置（handleSettingsConnectionDirty 打回 idle）就不能当数。
    const setStatus = (state, message = '', ifCurrent = null) => updateSettingsConnectionStatus((prev) => {
      const current = prev?.[section]?.[itemId];
      if (ifCurrent && current?.state !== ifCurrent) return prev;
      return {
        ...prev,
        [section]: { ...(prev?.[section] || {}), [itemId]: { state, message } },
      };
    });
    setStatus('testing');
    try {
      const response = await apiFetch(`${API_BASE}/api/settings/${section}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `${label} connection test failed: ${response.status}`);
        throw new Error(message);
      }
      const result = await response.json();
      const message = String(result?.message || `${label} connection verified.`);
      setStatus('success', message, 'testing');
      showToast('success', message);
      return true;
    } catch (error) {
      const message = String(error?.message || error);
      setStatus('error', message, 'testing');
      showToast('error', message);
      return false;
    }
  }

  async function handleInstallSkillPackage(file, scope = 'global') {
    try {
      setSkillActionBusy('install');
      const response = await apiFetch(`${API_BASE}/api/settings/tools/skills/install${skillContextQuery}${skillContextQuery ? '&' : '?'}scope=${encodeURIComponent(scope)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file,
      }, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `Skill install failed (${response.status})`));
      const payload = await response.json();
      setSettingsRecordsDraft(prev => applyToolsSettingsPayloadToRecords(prev, copySettingsResponse(payload, { skills: payload.skills })));
      showToast('success', 'Skill installed');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      throw error;
    } finally {
      invalidateSkillInventory?.();
      setSkillActionBusy('');
    }
  }

  async function handleToggleSkill(name, enabled) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}${skillContextQuery}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill update failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, copySettingsResponse(payload, { skills: payload.skills })));
      showToast('success', enabled ? 'skill enabled' : 'skill disabled');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    } finally {
      invalidateSkillInventory?.();
      setSkillActionBusy('');
    }
  }

  async function handleUninstallSkill(name, scope) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}${skillContextQuery}${scope ? `${skillContextQuery ? '&' : '?'}scope=${encodeURIComponent(scope)}` : ''}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill uninstall failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, copySettingsResponse(payload, { skills: payload.skills })));
      showToast('success', 'skill uninstalled');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    } finally {
      invalidateSkillInventory?.();
      setSkillActionBusy('');
    }
  }

  return {
    handleToggleSettings,
    handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft,
    handleDeleteLlmProvider,
    handleToggleLlmProvider,
    applyAgentSettingsPayload,
    fetchAgentSettingsPayload,
    handleTogglePresetAgent,
    handleCreateCustomAgent,
    handleSaveCustomAgent,
    handleDeleteCustomAgent,
    applyWorkflowSettingsPayload,
    fetchWorkflowSettingsPayload,
    handleTogglePresetWorkflow,
    handleCreateCustomWorkflow,
    handleSaveCustomWorkflow,
    handleDeleteCustomWorkflow,
    handleTestLlmConfig,
    handleTestWebProvider,
    handleSettingsConnectionDirty,
    handleTestSettingsConnection,
    handleInstallSkillPackage,
    handleToggleSkill,
    handleUninstallSkill,
  };
}

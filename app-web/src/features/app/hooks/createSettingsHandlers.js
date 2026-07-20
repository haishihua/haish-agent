// @haish-esm
// Extracted from AppShell.jsx (Phase C). Behavior-preserving factory.
export function createSettingsHandlers(ctx) {
  const {
    API_BASE,
    CALIBRATION_IDS,
    LLM_SETTINGS_STORAGE_KEY,
    MEET_POINTS,
    NAV_POINTS,
    SETTINGS_RECORDS_STORAGE_KEY,
    STATIONS,
    WEB_SEARCH_PROVIDER_OPTIONS,
    activeTab,
    agentCatalogFromSettings,
    agentSettingsDraft,
    applyKnowledgeSettingsPayloadToRecords,
    applyLlmSettingsPayloadToDraft,
    applyMemorySettingsPayloadToRecords,
    applyToolsSettingsPayloadToRecords,
    authFetch,
    buildKnowledgeSettingsPayload,
    buildMemorySettingsPayload,
    buildToolsSettingsPayload,
    busy,
    calibrationTarget,
    clearAllPoseDebug,
    clonePointMap,
    createDefaultCustomAgentPayload,
    createDefaultCustomWorkflowPayload,
    dragStateRef,
    getIdsForTarget,
    getSelectedLlmConfig,
    getSourceMapForTarget,
    llmProviderRequestPayload,
    llmSettingsDraft,
    normalizeAgentSettings,
    normalizeWorkflowSettings,
    originalMeetRef,
    originalNavRef,
    originalStationsRef,
    parseResponseMessage,
    payloadForCustomWorkflow,
    prepareWorldCalibration,
    resetPoseMapping,
    resolvePointTarget,
    setActiveTab,
    setAgentCatalog,
    setAgentSettingsDraft,
    setCalibrationMode,
    setCopiedCoords,
    setLlmSettingsDraft,
    setMeetDrafts,
    setNavDrafts,
    setSettingsRecordsDraft,
    setSettingsSection,
    setSkillActionBusy,
    setStationDrafts,
    setWorkflowSettingsDraft,
    settingsConnectionSignatureFor,
    settingsRecordsDraft,
    showToast,
    syncNpcPositions,
    syncSettingsConnectionStatus,
    updateSettingsConnectionStatus,
    withAlwaysAllowedAgentTools,
    workflowById,
    workflowSettingsDraft,
  } = ctx;

  function handleSettingsSectionChange(section) {
    setSettingsSection(section);
    if (section === 'world') prepareWorldCalibration();
    else {
      dragStateRef.current = null;
      clearAllPoseDebug();
    }
  }

  function handleToggleCalibration() {
    if (busy) return;
    if (activeTab !== 'dashboard') setActiveTab('dashboard');
    dragStateRef.current = null;
    setCalibrationMode((enabled) => {
      const next = !enabled;
      if (next) setSettingsSection('llm');
      else clearAllPoseDebug();
      return next;
    });
    setCopiedCoords(false);
  }

  async function handleSaveSettingsDraft() {
    try {
      window.localStorage?.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(llmSettingsDraft));
      window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(settingsRecordsDraft));
      const llmResponse = await authFetch(`${API_BASE}/api/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmSettingsDraft),
      }, { json: false });
      if (!llmResponse.ok) {
        const message = await parseResponseMessage(llmResponse, `llm settings save failed: ${llmResponse.status}`);
        throw new Error(message);
      }
      const llmPayload = await llmResponse.json();
      setLlmSettingsDraft((prev) => applyLlmSettingsPayloadToDraft(prev, llmPayload));
      const toolsPayload = buildToolsSettingsPayload(settingsRecordsDraft);
      const response = await authFetch(`${API_BASE}/api/settings/tools`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolsPayload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `settings save failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      const memoryResponse = await authFetch(`${API_BASE}/api/settings/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMemorySettingsPayload(settingsRecordsDraft)),
      }, { json: false });
      if (!memoryResponse.ok) {
        const message = await parseResponseMessage(memoryResponse, `memory settings save failed: ${memoryResponse.status}`);
        throw new Error(message);
      }
      const memoryPayload = await memoryResponse.json();
      setSettingsRecordsDraft((prev) => {
        const next = applyMemorySettingsPayloadToRecords(prev, memoryPayload);
        syncSettingsConnectionStatus(next);
        return next;
      });
      const knowledgeResponse = await authFetch(`${API_BASE}/api/settings/knowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildKnowledgeSettingsPayload(settingsRecordsDraft)),
      }, { json: false });
      if (!knowledgeResponse.ok) {
        const message = await parseResponseMessage(knowledgeResponse, `knowledge settings save failed: ${knowledgeResponse.status}`);
        throw new Error(message);
      }
      const knowledgePayload = await knowledgeResponse.json();
      setSettingsRecordsDraft((prev) => {
        const next = applyKnowledgeSettingsPayloadToRecords(prev, knowledgePayload);
        syncSettingsConnectionStatus(next);
        return next;
      });
      showToast('success', 'settings saved');
    } catch (error) {
      showToast('error', String(error?.message || error));
    }
  }

  async function handleSaveToolsSettingsDraft(nextRecords = settingsRecordsDraft, successMessage = 'settings saved') {
    try {
      window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
      const toolsPayload = buildToolsSettingsPayload(nextRecords);
      const response = await authFetch(`${API_BASE}/api/settings/tools`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolsPayload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `settings save failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      if (successMessage) showToast('success', successMessage);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function applyAgentSettingsPayload(payload) {
    const normalized = normalizeAgentSettings(payload);
    setAgentSettingsDraft(normalized);
    setAgentCatalog(agentCatalogFromSettings(normalized));
    return normalized;
  }

  async function fetchAgentSettingsPayload() {
    const response = await authFetch(`${API_BASE}/api/settings/agents`, { method: 'GET' }, { json: false });
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
        allow: withAlwaysAllowedAgentTools(current.tool_policy?.allow),
        deny: Array.isArray(current.tool_policy?.deny) ? current.tool_policy.deny : [],
      },
      mcp_policy: {
        allow_servers: Array.isArray(current.mcp_policy?.allow_servers) ? current.mcp_policy.allow_servers : [],
        allow_tools: Array.isArray(current.mcp_policy?.allow_tools) ? current.mcp_policy.allow_tools : [],
      },
      skill_policy: {
        allow: Array.isArray(current.skill_policy?.allow) ? current.skill_policy.allow : [],
        deny: Array.isArray(current.skill_policy?.deny) ? current.skill_policy.deny : [],
      },
    };
  }

  async function handleTogglePresetAgent(agentId, enabled) {
    try {
      const response = await authFetch(`${API_BASE}/api/settings/agents/presets/${encodeURIComponent(agentId)}`, {
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
      const response = await authFetch(endpoint, {
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
      const response = await authFetch(`${API_BASE}/api/settings/agents/custom/${encodeURIComponent(agentId)}`, {
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
    setWorkflowSettingsDraft(normalized);
    return normalized;
  }

  async function fetchWorkflowSettingsPayload() {
    const response = await authFetch(`${API_BASE}/api/settings/workflows`, { method: 'GET' }, { json: false });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `workflow settings fetch failed: ${response.status}`);
      throw new Error(message);
    }
    return response.json();
  }

  async function handleTogglePresetWorkflow(workflowId, enabled) {
    try {
      const response = await authFetch(`${API_BASE}/api/settings/workflows/presets/${encodeURIComponent(workflowId)}`, {
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
      const response = await authFetch(endpoint, {
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
      const response = await authFetch(`${API_BASE}/api/settings/workflows/custom/${encodeURIComponent(workflowId)}`, {
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
    try {
      const response = await authFetch(`${API_BASE}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmProviderRequestPayload(config, {
          includeSecret: true,
        })),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `llm test failed: ${response.status}`);
        throw new Error(message);
      }
      await response.json();
      showToast('success', 'llm provider test passed');
    } catch (error) {
      showToast('error', String(error?.message || error));
    }
  }

  async function handleTestWebProvider(provider, apiKey = '') {
    const providerLabel = WEB_SEARCH_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label || provider;
    try {
      const trimmed = String(apiKey || '').trim();
      const response = await authFetch(`${API_BASE}/api/settings/tools/web-search/test`, {
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
    if (!['memory', 'knowledge'].includes(section) || !itemId) return;
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
    if (!['memory', 'knowledge'].includes(section) || !itemId) return false;
    const label = section === 'memory' ? 'Neo4j' : 'Qdrant';
    const payload = section === 'memory'
      ? buildMemorySettingsPayload(settingsRecordsDraft)
      : buildKnowledgeSettingsPayload(settingsRecordsDraft);
    const signature = settingsConnectionSignatureFor(settingsRecordsDraft, section, itemId);
    updateSettingsConnectionStatus((prev) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || {}),
        [itemId]: { state: 'testing', message: '', signature },
      },
    }));
    try {
      const response = await authFetch(`${API_BASE}/api/settings/${section}/test`, {
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
      updateSettingsConnectionStatus((prev) => {
        const current = prev?.[section]?.[itemId];
        if (current?.state !== 'testing' || current?.signature !== signature) return prev;
        return {
          ...prev,
          [section]: {
            ...(prev?.[section] || {}),
            [itemId]: { state: 'success', message, signature },
          },
        };
      });
      showToast('success', message);
      return true;
    } catch (error) {
      const message = String(error?.message || error);
      updateSettingsConnectionStatus((prev) => {
        const current = prev?.[section]?.[itemId];
        if (current?.state !== 'testing' || current?.signature !== signature) return prev;
        return {
          ...prev,
          [section]: {
            ...(prev?.[section] || {}),
            [itemId]: { state: 'error', message, signature },
          },
        };
      });
      showToast('error', message);
      return false;
    }
  }

  async function handleInstallSkillDirectory() {
    try {
      let sourcePath = '';
      if (window.haish?.pickSkillDirectory) {
        const result = await window.haish.pickSkillDirectory();
        if (result?.canceled) return;
        sourcePath = result?.path || '';
      } else {
        sourcePath = String(window.prompt?.('Skill directory path') || '').trim();
      }
      if (!sourcePath) return;
      setSkillActionBusy('install');
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sourcePath }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill install failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', 'skill installed');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  async function handleToggleSkill(name, enabled) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill update failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', enabled ? 'skill enabled' : 'skill disabled');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  async function handleUninstallSkill(name) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill uninstall failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', 'skill uninstalled');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  function handleResetCalibration() {
    if (busy) return;
    if (calibrationTarget === 'poses') {
      for (const id of CALIBRATION_IDS) resetPoseMapping(id);
      clearAllPoseDebug();
      setCopiedCoords(false);
      return;
    }
    const ids = getIdsForTarget(calibrationTarget);
    const restored = calibrationTarget === 'routes' ? null : calibrationTarget === 'nav' ? clonePointMap(originalNavRef.current) : calibrationTarget === 'meet' ? clonePointMap(originalMeetRef.current) : clonePointMap(originalStationsRef.current);
    if (calibrationTarget === 'routes') {
      for (const id of ids) {
        const rt = resolvePointTarget(id);
        if (rt === 'meet') MEET_POINTS[id] = { ...originalMeetRef.current[id] };
        else if (rt === 'stations') STATIONS[id] = { ...originalStationsRef.current[id] };
        else NAV_POINTS[id] = { ...originalNavRef.current[id] };
      }
      setNavDrafts(clonePointMap(NAV_POINTS)); setMeetDrafts(clonePointMap(MEET_POINTS)); setStationDrafts(clonePointMap(STATIONS));
      syncNpcPositions(STATIONS);
    } else {
      const tm = getSourceMapForTarget(calibrationTarget);
      for (const id of ids) tm[id] = restored[id];
      if (calibrationTarget === 'nav') setNavDrafts(restored);
      else if (calibrationTarget === 'meet') setMeetDrafts(restored);
      else { setStationDrafts(restored); syncNpcPositions(restored); }
    }
    setCopiedCoords(false);
  }


  return {
    handleSettingsSectionChange,
    handleToggleCalibration,
    handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft,
    applyAgentSettingsPayload,
    fetchAgentSettingsPayload,
    customAgentPayload,
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
    handleInstallSkillDirectory,
    handleToggleSkill,
    handleUninstallSkill,
    handleResetCalibration,
  };
}

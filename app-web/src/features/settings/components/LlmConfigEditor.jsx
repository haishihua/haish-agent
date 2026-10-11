import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import React from 'react';
import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  Plus,
  X,
} from 'lucide-react';
import { API_BASE } from '../../../shared/api/base.js';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { normalizeReasoningEffort } from '../../chat/model/run-catalog.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import {
  getLlmProvider,
  LLM_OAUTH_UI_PROVIDERS,
  LLM_OAUTH_CALLBACK_PROVIDERS,
  SETTINGS_REASONING_OPTIONS,
  SETTINGS_LLM_PROVIDER_OPTIONS,
  formatAuthModeLabel,
  nextProviderDraft,
  uniqueModelChoices,
  addCustomModelId,
  customModelIds,
  llmModelCatalogPatch,
} from '../model/llm-settings.js';
import {
  getSelectedLlmConfig,
  updateSelectedLlmConfig,
  llmEditorModelChoices,
  llmProviderRequestPayload,
} from '../model/settings-payload.js';
import { FieldRow, SecretKeyField, SettingsMenuSelect, ProviderIcon, SettingsToggleRow } from './SettingsPrimitives.jsx';
import { ModelSelectorRoot, ModelSelectorTrigger, ModelSelectorValue, ModelSelectorContent, ModelSelectorSearch, ModelSelectorList, ModelSelectorEffort } from '../../../shared/ui/settings-elements/assistant-ui/model-selector.tsx';

const { useState, useEffect, useCallback, useMemo, useRef } = React;

export function LlmConfigEditor({ selectedId, draft, onDraftChange, readOnly = false, refreshModels = false, onToggleVisionProvider, toggleBusy = false }) {
  const config = getSelectedLlmConfig(draft, selectedId);
  const provider = getLlmProvider(config.provider);
  // Vision 是多条 provider 列表：每条都可独立编辑，启用状态由同一套开关控制。
  const isVisionProvider = (draft?.vision?.providers || []).some((item) => item.id === selectedId);
  const isCompactProvider = (draft?.compact?.providers || []).some(item => item.id === selectedId);
  const effortOptions = SETTINGS_REASONING_OPTIONS;
  const showEffort = !isVisionProvider && selectedId !== 'embedding';
  const [modelChoices, setModelChoices] = useState(() => llmEditorModelChoices(config));
  const [oauthStartError, setOauthStartError] = useState('');
  const [oauthStartPending, setOauthStartPending] = useState(false);
  const [oauthFlowId, setOauthFlowId] = useState('');
  const [oauthFlowStatus, setOauthFlowStatus] = useState('idle');
  const [oauthFlowMessage, setOauthFlowMessage] = useState('');
  const [modelCatalogError, setModelCatalogError] = useState('');
  const [modelIdInput, setModelIdInput] = useState('');
  const disabled = readOnly || (selectedId === 'embedding' && !draft.embedding?.enabled);
  const showProviderNameField = config.provider === 'custom';
  const showAuthModeField = provider.authModes.length > 1;
  const showApiKeyField = config.auth_mode === 'api_key';
  const showOAuthFields = config.auth_mode === 'oauth' && LLM_OAUTH_UI_PROVIDERS.has(config.provider);
  const showOAuthCallbackLogin = showOAuthFields && LLM_OAUTH_CALLBACK_PROVIDERS.has(config.provider);
  const oauthFlowPending = oauthStartPending || oauthFlowStatus === 'pending' || oauthFlowStatus === 'exchanging';
  const oauthModelCatalogReady = Boolean(config.oauth_configured);
  const showBaseUrlField = config.provider === 'custom';
  const update = useCallback(
    (patch) => updateSelectedLlmConfig(onDraftChange, selectedId, patch),
    [onDraftChange, selectedId],
  );
  const configRef = useRef(config);
  const oauthStartInFlightRef = useRef(false);
  configRef.current = config;
  const configuredModel = config.model;
  const configuredModelOptions = config.model_options;
  const configuredCustomModelIds = config.custom_model_ids;
  const configuredCustomModelIdsKey = JSON.stringify(customModelIds(config));
  const configuredProvider = config.provider;
  const localModelChoices = useMemo(
    () => llmEditorModelChoices({
      model: configuredModel,
      model_options: configuredModelOptions,
      custom_model_ids: configuredCustomModelIds,
      provider: configuredProvider,
    }),
    [configuredModel, configuredModelOptions, configuredCustomModelIds, configuredProvider],
  );
  const addModel = () => {
    if (disabled || !modelIdInput.trim()) return;
    update(addCustomModelId(configRef.current, modelIdInput));
    setModelIdInput('');
  };

  useEffect(() => {
    setModelIdInput('');
  }, [selectedId, config.provider, config.auth_mode]);

  const changeProvider = (providerId) => {
    const next = nextProviderDraft(providerId, config);
    setOauthStartError('');
    setOauthFlowId('');
    setOauthFlowStatus('idle');
    setOauthFlowMessage('');
    setModelCatalogError('');
    update({
      ...next,
      enabled: config.enabled,
      mode: config.mode || 'auto',
      reasoning_effort: normalizeReasoningEffort(config.reasoning_effort),
      ...(isCompactProvider ? { thinking: 'auto' } : {}),
    });
  };
  const startOAuthLogin = async () => {
    if (disabled || readOnly || !showOAuthFields || oauthStartInFlightRef.current) {
      return;
    }
    oauthStartInFlightRef.current = true;
    setOauthStartPending(true);
    setOauthStartError('');
    try {
      const response = await apiFetch(`${API_BASE}/api/llm/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: config.provider }),
      }, { json: false });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response, `OAuth start failed (${response.status})`));
      }
      const payload = await response.json();
      if (!payload?.auth_url) {
        throw new Error('OAuth start response did not include auth_url.');
      }
      if (!payload.flow_id) {
        throw new Error(`${provider.label} OAuth did not start an automatic callback session.`);
      }
      setOauthFlowId(payload.flow_id);
      setOauthFlowStatus(payload.status || 'pending');
      setOauthFlowMessage('Complete sign-in in your browser. This page will update automatically.');
      update({
        oauth_auth_url: '',
        oauth_code: '',
        oauth_verifier: '',
        oauth_state: '',
      });
      if ((payload.status || 'pending') === 'pending') {
        window.open(payload.auth_url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      setOauthStartError(String(error?.message || error));
    } finally {
      oauthStartInFlightRef.current = false;
      setOauthStartPending(false);
    }
  };

  useEffect(() => {
    setModelChoices(localModelChoices);
  }, [localModelChoices]);

  useEffect(() => {
    if (!showOAuthCallbackLogin || !oauthFlowId || !['pending', 'exchanging'].includes(oauthFlowStatus)) {
      return undefined;
    }
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await apiFetch(`${API_BASE}/api/llm/oauth/status/${encodeURIComponent(oauthFlowId)}`, {
          method: 'GET',
        }, { json: false });
        if (!response.ok) {
          throw new Error(await parseResponseMessage(response, `OAuth status failed (${response.status})`));
        }
        const payload = await response.json();
        if (cancelled) return;
        const status = String(payload?.status || 'pending');
        setOauthFlowStatus(status);
        setOauthFlowMessage(String(payload?.message || ''));
        if (status === 'success') {
          setOauthStartError('');
          updateSelectedLlmConfig(onDraftChange, selectedId, {
            oauth_configured: true,
            oauth_auth_url: '',
            oauth_code: '',
            oauth_verifier: '',
            oauth_state: '',
          });
          return;
        }
        if (status === 'error') {
          setOauthStartError(String(payload?.message || 'OAuth login failed. Start again.'));
          return;
        }
        timer = window.setTimeout(poll, 800);
      } catch (error) {
        if (cancelled) return;
        setOauthFlowStatus('error');
        setOauthStartError(String(error?.message || error));
      }
    };
    timer = window.setTimeout(poll, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showOAuthCallbackLogin, oauthFlowId, oauthFlowStatus, onDraftChange, selectedId]);

  useEffect(() => {
    if (!refreshModels || disabled) return undefined;
    if (config.auth_mode === 'oauth' && !oauthModelCatalogReady) return undefined;
    if (config.auth_mode === 'api_key' && config.provider !== 'ollama' && !config.api_key && !config.api_key_configured) return undefined;
    if (config.provider === 'custom' && !config.base_url) return undefined;
    let cancelled = false;
    const currentConfig = configRef.current;
    const timer = window.setTimeout(() => {
      setModelCatalogError('');
      const payload = llmProviderRequestPayload(currentConfig, { includeSecret: true, includeOAuth: true, refresh: true });
      apiFetch(`${API_BASE}/api/llm/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false })
        .then(async (response) => {
          if (response.ok) return response.json();
          throw new Error(await parseResponseMessage(response, `Model catalog request failed (${response.status})`));
        })
        .then((catalog) => {
          if (cancelled || !catalog) return;
          const remoteChoices = Array.isArray(catalog.models) ? catalog.models : [];
          const oauthPatch = catalog.oauth_saved ? {
            oauth_configured: true,
            oauth_code: '',
          } : {};
          // Refresh discovery only; the latest draft owns manual additions and
          // the default selection (including edits made while fetching).
          const latestConfig = configRef.current;
          if (remoteChoices.length) {
            const { choices, ...patch } = llmModelCatalogPatch(latestConfig, catalog);
            setModelCatalogError('');
            setModelChoices(choices);
            update(patch);
            return;
          }
          setModelChoices(llmEditorModelChoices(latestConfig));
          if (catalog.oauth_saved) update(oauthPatch);
        })
        .catch((error) => {
          if (!cancelled) {
            setModelChoices(llmEditorModelChoices(configRef.current));
            setModelCatalogError(String(error?.message || error));
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    config.provider,
    config.auth_mode,
    config.custom_provider,
    config.name,
    config.base_url,
    config.api_key,
    config.api_key_configured,
    oauthModelCatalogReady,
    configuredCustomModelIdsKey,
    disabled,
    refreshModels,
    update,
  ]);

  return (
    <div className="settings-editor-form settings-llm-form">
      {isVisionProvider && (
        <SettingsToggleRow
          label="Enable vision provider"
          checked={config.enabled === true}
          disabled={readOnly || Boolean(toggleBusy)}
          onCheckedChange={(enabled) => onToggleVisionProvider?.(selectedId, enabled)}
        />
      )}
      <FieldRow label="Provider">
        <SettingsMenuSelect
          value={config.provider}
          options={SETTINGS_LLM_PROVIDER_OPTIONS.map((item) => ({ id: item.id, label: item.label }))}
          onChange={changeProvider}
          disabled={disabled}
          header="provider"
        />
      </FieldRow>
      {showProviderNameField && (
        <FieldRow label="Provider Name">
          <Input
            value={config.name || config.custom_provider || ''}
            onChange={(event) => update({ name: event.target.value, custom_provider: event.target.value })}
            disabled={readOnly}
            placeholder="Custom provider name"
          />
        </FieldRow>
      )}
      {showAuthModeField && (
      <FieldRow label="Auth Mode">
        <SettingsMenuSelect
          value={config.auth_mode}
          options={provider.authModes.map((mode) => ({ id: mode, label: formatAuthModeLabel(mode) }))}
          onChange={(authMode) => {
            setOauthStartError('');
            setOauthFlowId('');
            setOauthFlowStatus('idle');
            setOauthFlowMessage('');
            setModelCatalogError('');
            update({
              auth_mode: authMode,
              oauth_auth_url: '',
              oauth_code: '',
              oauth_state: '',
              oauth_verifier: '',
              oauth_configured: false,
              model_options: [],
            });
          }}
          disabled={disabled}
          header="auth mode"
        />
      </FieldRow>
      )}
      {showApiKeyField && (
        <FieldRow label="API Key">
          <SecretKeyField
            value={config.api_key || ''}
            onChange={(event) => update({ api_key: event.target.value })}
            disabled={disabled}
            configured={Boolean(config.api_key_configured)}
            placeholder={config.provider === 'custom' ? 'API key' : `${provider.label} API key`}
          />
        </FieldRow>
      )}
      {showOAuthCallbackLogin && (
        <FieldRow
          label="OAuth"

        >
          <div className="settings-oauth-connect">
            <Button
              type="button"
              variant="outline"
              className="settings-oauth-connect-button"
              disabled={disabled || oauthFlowPending}
              onClick={() => { void startOAuthLogin(); }}
            >
              {oauthFlowPending
                ? <LoaderCircle size={15} className="settings-oauth-spinner" aria-hidden="true" />
                : <ExternalLink size={15} aria-hidden="true" />}
              {oauthFlowPending
                ? 'Waiting for sign-in...'
                : (config.oauth_configured ? `Reconnect ${provider.label}` : `Connect ${provider.label}`)}
            </Button>
            {oauthStartError ? (
              <ErrorState variant="inline" detail={oauthStartError} />
            ) : null}
            {!oauthStartError && oauthFlowPending ? (
              <div className="settings-oauth-message" role="status" aria-live="polite">
                {oauthFlowMessage || 'Waiting for browser authorization.'}
              </div>
            ) : null}
            {!oauthStartError && !oauthFlowPending && config.oauth_configured ? (
              <div className="settings-inline-success" role="status">
                <CircleCheck size={15} aria-hidden="true" />
                Connected to {provider.label}
              </div>
            ) : null}
          </div>
        </FieldRow>
      )}
      {showBaseUrlField && (
      <FieldRow label="Base URL">
        <Input
          value={config.base_url || ''}
          onChange={(event) => update({ base_url: event.target.value })}
          disabled={disabled}
          placeholder={provider.baseUrl || 'https://example.com/v1'}
        />
      </FieldRow>
      )}
      <ModelSelectorRoot
        models={uniqueModelChoices(modelChoices, config.model).map(model => ({ id: model.id, name: model.label, icon: <ProviderIcon provider={config.provider} name={config.name || provider.label} />, efforts: showEffort ? effortOptions.map(item => ({ id: item.id, name: item.id === 'medium' ? 'Med' : item.id === 'xhigh' ? 'XHigh' : `${item.id[0].toUpperCase()}${item.id.slice(1)}` })) : undefined }))}
        value={config.model || ''} onValueChange={model => { if (!disabled) update({ model }); }} effort={normalizeReasoningEffort(config.reasoning_effort)} onEffortChange={reasoning_effort => { if (!disabled) update({ reasoning_effort, ...(isCompactProvider ? { thinking: 'auto' } : {}) }); }}>
        <FieldRow label="Default model"><ModelSelectorTrigger disabled={disabled} className="w-full"><ModelSelectorValue showEffort={false} /></ModelSelectorTrigger></FieldRow>
        <ModelSelectorContent searchable className="settings-model-options"><ModelSelectorSearch aria-label="Search models" /><ModelSelectorList /></ModelSelectorContent>
        <FieldRow label="Model ID" hint="Add models missing from the provider list. Choose the default model separately above.">
          <Input
            value={modelIdInput}
            onChange={event => setModelIdInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                addModel();
              }
            }}
            disabled={disabled}
            maxLength={512}
            placeholder="Enter a model ID to add"
          />
        </FieldRow>
        <Button type="button" variant="outline" disabled={disabled || !modelIdInput.trim()} onClick={addModel}>
          <Plus size={14} aria-hidden="true" />Add model
        </Button>
        {customModelIds(config).length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Additional models">
            {customModelIds(config).map(id => (
              <span key={id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                <span className="break-all">{id}</span>
                <Button
                  type="button" variant="ghost" size="icon-sm" disabled={disabled}
                  aria-label={`Remove additional model ${id}`}
                  onClick={() => update({ custom_model_ids: customModelIds(config).filter(value => value !== id) })}
                ><X size={12} aria-hidden="true" /></Button>
              </span>
            ))}
          </div>
        )}
        {modelCatalogError && <ErrorState variant="inline" detail={modelCatalogError} />}
        {showEffort && <ModelSelectorEffort label="Reasoning effort" className="settings-model-effort" />}
      </ModelSelectorRoot>
    </div>
  );
}

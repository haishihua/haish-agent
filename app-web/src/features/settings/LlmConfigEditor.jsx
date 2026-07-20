// @haish-esm
import React from 'react';
import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
} from 'lucide-react';
import { API_BASE } from '../../api/base.js';
import { authFetch, parseResponseMessage } from '../../api/auth.js';
import {
  getLlmProvider,
  LLM_OAUTH_UI_PROVIDERS,
  LLM_OAUTH_CALLBACK_PROVIDERS,
  SETTINGS_REASONING_OPTIONS,
  SETTINGS_LLM_PROVIDER_OPTIONS,
  formatAuthModeLabel,
  nextProviderDraft,
  uniqueModelChoices,
} from '../../lib/agent-catalog.js';
import {
  getSelectedLlmConfig,
  updateSelectedLlmConfig,
  llmEditorModelChoices,
  llmProviderRequestPayload,
} from './settings-payload.js';
import {
  FieldRow,
  SecretKeyField,
  SettingsMenuSelect,
  SettingsComboInput,
  SettingsTooltipIconButton,
} from './settings-ui.jsx';

const { useState, useEffect, useRef } = React;

export function LlmConfigEditor({ selectedId, draft, onDraftChange, readOnly = false, refreshModels = false }) {
  const config = getSelectedLlmConfig(draft, selectedId);
  const provider = getLlmProvider(config.provider);
  const [modelChoices, setModelChoices] = useState(() => llmEditorModelChoices(config));
  const [oauthStartError, setOauthStartError] = useState('');
  const [oauthStartPending, setOauthStartPending] = useState(false);
  const [oauthFlowId, setOauthFlowId] = useState('');
  const [oauthFlowStatus, setOauthFlowStatus] = useState('idle');
  const [oauthFlowMessage, setOauthFlowMessage] = useState('');
  const [modelCatalogError, setModelCatalogError] = useState('');
  const disabled = readOnly
    || (selectedId === 'vision' && !draft.vision.enabled)
    || (selectedId === 'embedding' && !draft.embedding?.enabled);
  const showProviderNameField = config.provider === 'custom';
  const showAuthModeField = provider.authModes.length > 1;
  const showApiKeyField = config.auth_mode === 'api_key';
  const showOAuthFields = config.auth_mode === 'oauth' && LLM_OAUTH_UI_PROVIDERS.has(config.provider);
  const showOAuthCallbackLogin = showOAuthFields && LLM_OAUTH_CALLBACK_PROVIDERS.has(config.provider);
  const oauthFlowPending = oauthStartPending || oauthFlowStatus === 'pending' || oauthFlowStatus === 'exchanging';
  const oauthModelCatalogReady = Boolean(config.oauth_configured);
  const showBaseUrlField = config.provider === 'custom';
  const update = (patch) => updateSelectedLlmConfig(onDraftChange, selectedId, patch);
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
      reasoning_effort: config.reasoning_effort || 'high',
    });
  };
  const startOAuthLogin = async () => {
    if (disabled || readOnly || !showOAuthFields) {
      return;
    }
    setOauthStartPending(true);
    setOauthStartError('');
    try {
      const response = await authFetch(`${API_BASE}/api/llm/oauth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: config.provider }),
      }, { json: false });
      if (!response.ok) {
        let detail = `OAuth start failed (${response.status})`;
        try {
          const body = await response.json();
          detail = String(body?.detail || body?.message || detail);
        } catch {
          // keep fallback message
        }
        throw new Error(detail);
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
      window.open(payload.auth_url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setOauthStartError(String(error?.message || error));
    } finally {
      setOauthStartPending(false);
    }
  };

  useEffect(() => {
    setModelChoices(llmEditorModelChoices(config));
  }, [config.model, config.model_options, config.provider]);

  useEffect(() => {
    if (!showOAuthCallbackLogin || !oauthFlowId || !['pending', 'exchanging'].includes(oauthFlowStatus)) {
      return undefined;
    }
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const response = await authFetch(`${API_BASE}/api/llm/oauth/status/${encodeURIComponent(oauthFlowId)}`, {
          method: 'GET',
        }, { json: false });
        if (!response.ok) {
          let detail = `OAuth status failed (${response.status})`;
          try {
            const body = await response.json();
            detail = String(body?.detail || body?.message || detail);
          } catch {
            // keep fallback
          }
          throw new Error(detail);
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
    const fallbackChoices = llmEditorModelChoices(config);
    const timer = window.setTimeout(() => {
      setModelCatalogError('');
      const payload = llmProviderRequestPayload(config, { includeSecret: true, includeOAuth: true, refresh: true });
      authFetch(`${API_BASE}/api/llm/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false })
        .then(async (response) => {
          if (response.ok) return response.json();
          let detail = `Model catalog request failed (${response.status})`;
          try {
            const body = await response.json();
            detail = String(body?.detail || body?.message || detail);
          } catch {
            // keep fallback
          }
          throw new Error(detail);
        })
        .then((catalog) => {
          if (cancelled || !catalog) return;
          const remoteChoices = Array.isArray(catalog.models) ? catalog.models : [];
          const oauthPatch = catalog.oauth_saved ? {
            oauth_configured: true,
            oauth_code: '',
          } : {};
          // When the backend returns a live provider catalog, treat it as the
          // source of truth so newly available models (e.g. gpt-5.6) appear and
          // static allow-lists do not keep padding the dropdown.
          if (remoteChoices.length) {
            const remoteDefault = catalog.default_model || remoteChoices[0].id;
            const selectedModelSupported = remoteChoices.some((item) => item.id === config.model);
            setModelCatalogError('');
            setModelChoices(uniqueModelChoices(remoteChoices));
            update({
              model_options: remoteChoices,
              ...(selectedModelSupported ? {} : { model: remoteDefault }),
              ...oauthPatch,
            });
            return;
          }
          setModelChoices(fallbackChoices);
          if (catalog.oauth_saved) update(oauthPatch);
        })
        .catch((error) => {
          if (!cancelled) {
            setModelChoices(fallbackChoices);
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
    config.model,
    disabled,
    refreshModels,
  ]);

  return (
    <div className="settings-editor-form settings-llm-form">
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
          <input
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
        <FieldRow label="API Key" hint="Saved as secret.">
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
          hint={oauthFlowPending
            ? `Finish signing in with ${provider.label} in the browser. No code needs to be copied.`
            : 'Authorization tokens are stored in ~/.haish/auth.json.'}
        >
          <div className="settings-oauth-connect">
            <button
              type="button"
              className="settings-primary-button settings-oauth-connect-button"
              disabled={disabled || oauthFlowPending}
              onClick={() => { void startOAuthLogin(); }}
            >
              {oauthFlowPending
                ? <LoaderCircle size={15} className="settings-oauth-spinner" aria-hidden="true" />
                : <ExternalLink size={15} aria-hidden="true" />}
              {oauthFlowPending
                ? 'Waiting for sign-in...'
                : (config.oauth_configured ? `Reconnect ${provider.label}` : `Connect ${provider.label}`)}
            </button>
            {oauthStartError ? (
              <div className="settings-inline-error" role="alert">{oauthStartError}</div>
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
        <input
          value={config.base_url || ''}
          onChange={(event) => update({ base_url: event.target.value })}
          disabled={disabled}
          placeholder={provider.baseUrl || 'https://example.com/v1'}
        />
      </FieldRow>
      )}
      <FieldRow label="Default Model">
        <div className="settings-oauth-connect">
          <SettingsComboInput
            value={config.model || ''}
            options={modelChoices}
            onChange={(model) => update({ model })}
            disabled={disabled}
            placeholder={provider.defaultModel}
            header="default model"
          />
          {modelCatalogError ? (
            <div className="settings-inline-error" role="alert">{modelCatalogError}</div>
          ) : null}
        </div>
      </FieldRow>
      {selectedId !== 'vision' && selectedId !== 'embedding' && (
        <FieldRow label="Default Reasoning">
          <SettingsMenuSelect
            value={config.reasoning_effort || 'high'}
            options={SETTINGS_REASONING_OPTIONS}
            onChange={(reasoningEffort) => update({ reasoning_effort: reasoningEffort })}
            disabled={readOnly}
            header="default reasoning"
          />
        </FieldRow>
      )}
    </div>
  );
}



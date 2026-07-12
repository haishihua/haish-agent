// @haish-esm
import React from 'react';
import {
  ChevronDown,
  CircleCheck,
  ExternalLink,
  LoaderCircle,
} from 'lucide-react';
import anthropicLogo from '@lobehub/icons-static-svg/icons/anthropic.svg';
import deepseekLogo from '@lobehub/icons-static-svg/icons/deepseek.svg';
import geminiLogo from '@lobehub/icons-static-svg/icons/gemini.svg';
import minimaxLogo from '@lobehub/icons-static-svg/icons/minimax.svg';
import moonshotLogo from '@lobehub/icons-static-svg/icons/moonshot.svg';
import ollamaLogo from '@lobehub/icons-static-svg/icons/ollama.svg';
import openaiLogo from '@lobehub/icons-static-svg/icons/openai.svg';
import qwenLogo from '@lobehub/icons-static-svg/icons/qwen.svg';
import xaiLogo from '@lobehub/icons-static-svg/icons/xai.svg';
import zhipuLogo from '@lobehub/icons-static-svg/icons/zhipu.svg';
import tavilyLogo from '@lobehub/icons-static-svg/icons/tavily.svg';
import neo4jLogo from '../../../assets/ui/icons/neo4j.svg';
import qdrantLogo from '../../../assets/ui/icons/qdrant.svg';
import serpapiLogo from '../../../assets/ui/icons/serpapi.svg';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import { API_BASE } from '../../api/base.js';
import { authFetch, parseResponseMessage } from '../../api/auth.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_TOOL_GROUPS,
  DEFAULT_AGENT_ALWAYS_ALLOWED_TOOLS,
  DEFAULT_AGENT_SETTINGS,
  SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_INPUT_SCHEMA,
  COMMON_WORKFLOW_OUTPUT_FIELDS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
  DEFAULT_WORKFLOW_SETTINGS,
  SETTINGS_SECTIONS,
  SETTINGS_SUBTABS,
  SETTINGS_SECTION_COPY,
  LLM_SUBTAB_COPY,
  ADD_LABEL_BY_SECTION,
  LLM_PROVIDER_MODELS,
  LLM_PROVIDER_OPTIONS,
  HIDDEN_SETTINGS_LLM_PROVIDERS,
  SETTINGS_LLM_PROVIDER_OPTIONS,
  LLM_OAUTH_UI_PROVIDERS,
  LLM_OAUTH_CALLBACK_PROVIDERS,
  LLM_OAUTH_MANUAL_CODE_PROVIDERS,
  LLM_SETTINGS_STORAGE_KEY,
  SETTINGS_RECORDS_STORAGE_KEY,
  SETTINGS_CONNECTION_STATUS_STORAGE_KEY,
  SETTINGS_CONNECTION_SECTIONS,
  SETTINGS_PERSISTED_CONNECTION_STATES,
  DEFAULT_MCP_CONFIG_JSON,
  MCP_CONFIG_TEMPLATE_JSON,
  DEFAULT_NEO4J_CONFIG,
  DEFAULT_QDRANT_CONFIG,
  QDRANT_DISTANCE_OPTIONS,
  LEGACY_DEFAULT_QDRANT_COLLECTION,
  WEB_SEARCH_PROVIDER_OPTIONS,
  SETTINGS_REASONING_OPTIONS,
  getLlmProvider,
  normalizeLlmProviderId,
  formatAuthModeLabel,
  modelChoicesFor,
  uniqueModelChoices,
  configuredModelOptions,
  runtimeProviderLabel,
  runtimeProviderSelector,
  runtimeLlmProviderOptions,
  nextProviderDraft,
  createDefaultLlmSettings,
  normalizeLlmModelConfig,
  loadLlmSettingsDraft,
  applyLlmSettingsPayloadToDraft,
  createDefaultSettingsRecords,
  createDefaultWebSearchSettings,
  normalizeNeo4jDraft,
  normalizeQdrantDraft,
  mergeDefaultRecords,
  mergeKnownDefaultRecords,
  loadSettingsRecordsDraft,
  settingsConnectionRecord,
  settingsConnectionSignature,
  settingsConnectionSignatureFor,
  sanitizeSettingsConnectionStatus,
  loadSettingsConnectionStatus,
  persistSettingsConnectionStatus,
  normalizeAgentProfileRow,
  normalizeAgentToolGroups,
  normalizeAgentSettings,
  agentCatalogFromSettings,
  agentListItems,
  withAlwaysAllowedAgentTools,
  toolsForAgentGroups,
  groupIdsForAgentTools,
  createDefaultCustomAgentPayload,
} from '../../lib/agent-catalog.js';
import {
  normalizeWorkflowNode,
  normalizeWorkflowEdge,
  normalizeWorkflowRow,
  normalizeWorkflowSettings,
  workflowListItems,
  workflowById,
  typeLabelForWorkflowNode,
  workflowOutputFields,
  workflowSchemaFields,
  workflowUpstreamNodeIds,
  workflowFriendlyVariableLabel,
  workflowVariableCatalog,
  sanitizeWorkflowTemplateValue,
  workflowTokenRangeAt,
  workflowArgumentsText,
  WORKFLOW_OUTPUT_FIELD_OPTIONS,
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  workflowOutputFieldOptions,
  workflowOutputMappingEntries,
  workflowTemplateVariablePath,
  workflowVariableTypeForValue,
  buildWorkflowOutputPatch,
  createWorkflowExamplePatch,
  createDefaultCustomWorkflowPayload,
  payloadForCustomWorkflow,
} from '../../lib/workflow-catalog.js';

const { useState, useEffect, useRef, useMemo } = React;
const ReactFlowNS = { ReactFlow, Background, Controls, Handle, Position, MarkerType };
const SETTINGS_SUBTAB_ICONS = {
  chat: 'message',
  vision: 'eye',
  embedding: 'layers',
  'tools-mcp': 'nodes',
  'tools-skills': 'wrench',
  'tools-web': 'globe',
};
const PROVIDER_LOGOS = {
  openai: openaiLogo,
  xai: xaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  deepseek: deepseekLogo,
  dashscope: qwenLogo,
  moonshot: moonshotLogo,
  minimax: minimaxLogo,
  zhipu: zhipuLogo,
  ollama: ollamaLogo,
};

const CONNECTION_BRAND_LOGOS = {
  'memory-neo4j': neo4jLogo,
  'knowledge-qdrant': qdrantLogo,
  neo4j: neo4jLogo,
  qdrant: qdrantLogo,
};

const WEB_SEARCH_BRAND_LOGOS = {
  tavily: tavilyLogo,
  serpapi: serpapiLogo,
};

function BrandLogoIcon({ logo }) {
  if (!logo) return null;
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <span className="settings-provider-logo" style={{ '--settings-provider-logo': `url(${logo})` }} />
    </span>
  );
}

function ProviderIcon({ provider }) {
  if (provider === 'custom') {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  return <BrandLogoIcon logo={PROVIDER_LOGOS[provider]} />;
}

function ConnectionBrandIcon({ itemId, title }) {
  const logo = CONNECTION_BRAND_LOGOS[itemId]
    || CONNECTION_BRAND_LOGOS[String(title || '').trim().toLowerCase()];
  return <BrandLogoIcon logo={logo} />;
}

const PRESET_AGENT_ICON_NAMES = {
  'preset.general': 'sparkles',
  'preset.product': 'clipboard-list',
  'preset.development': 'code-2',
  'preset.qa': 'flask-conical',
  'preset.document-qa': 'book-open',
};

const PRESET_WORKFLOW_ICON_NAMES = {
  [SOFTWARE_DEVELOPMENT_WORKFLOW_ID]: 'git-branch',
};

function AgentListIcon({ item }) {
  if (item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  const iconName = PRESET_AGENT_ICON_NAMES[item?.id] || 'sparkles';
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <SettingsLucideIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

function WorkflowListIcon({ item }) {
  if (item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  const iconName = PRESET_WORKFLOW_ICON_NAMES[item?.id] || 'git-branch';
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <SettingsLucideIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

export function FieldRow({ label, hint, children }) {
  return (
    <div className="settings-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

const SECRET_KEY_SAVED_PLACEHOLDER = 'Saved · enter a new key to replace';

export function SecretKeyField({
  value = '',
  onChange,
  onBlur,
  onKeyDown,
  placeholder = 'API key',
  configured = false,
  disabled = false,
  className = '',
  autoComplete = 'off',
}) {
  const keyValue = String(value || '');
  const keySaved = Boolean(configured) && !keyValue.trim();
  return (
    <label className={`settings-secret-key-field${keySaved ? ' is-saved' : ''}${className ? ` ${className}` : ''}`}>
      <SettingsLucideIcon name="lock" size={15} className="settings-secret-key-icon" />
      <input
        type="password"
        value={keyValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={keySaved ? SECRET_KEY_SAVED_PLACEHOLDER : placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
      />
    </label>
  );
}

export function WorkflowVariablePicker({ variables, onInsert, disabled = false }) {
  if (!variables.length) return null;
  const options = variables.map((item) => ({
    id: item.path,
    label: `${item.label || item.path} · ${item.type || 'any'}`,
  }));
  return (
    <div className="workflow-variable-panel">
      <span>use data from</span>
      <SettingsMenuSelect
        className="workflow-menu-select"
        value=""
        options={options}
        disabled={disabled}
        placeholder="insert data..."
        onChange={(path) => {
          if (path) onInsert(path);
        }}
      />
    </div>
  );
}

export function WorkflowVariableSelect({ variables, value, onChange, disabled = false }) {
  const selectedPath = workflowTemplateVariablePath(value);
  const hasSelected = selectedPath && variables.some((item) => item.path === selectedPath);
  const options = [
    ...(!hasSelected && selectedPath ? [{ id: selectedPath, label: `custom: ${selectedPath}` }] : []),
    ...variables.map((item) => ({
      id: item.path,
      label: `${item.label || item.path} · ${item.type || 'any'}`,
    })),
  ];
  return (
    <SettingsMenuSelect
      className="workflow-menu-select workflow-variable-menu-select"
      value={selectedPath || ''}
      options={options}
      disabled={disabled}
      placeholder="select data..."
      onChange={(path) => {
        if (path) onChange(`{{${path}}}`);
      }}
    />
  );
}

export function WorkflowTemplateTextarea({
  value,
  onChange,
  variables,
  disabled = false,
  rows = 4,
  placeholder = '',
  showVariables = true,
  className = '',
  onFocus,
}) {
  const text = String(sanitizeWorkflowTemplateValue(value ?? ''));
  const textareaRef = useRef(null);
  const insertVariable = (path) => {
    const token = `{{${path}}}`;
    const field = textareaRef.current;
    const start = Number.isFinite(field?.selectionStart) ? field.selectionStart : text.length;
    const end = Number.isFinite(field?.selectionEnd) ? field.selectionEnd : start;
    const range = workflowTokenRangeAt(text, start, end);
    const next = `${text.slice(0, range.start)}${token}${text.slice(range.end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const cursor = range.start + token.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(cursor, cursor);
    });
  };
  return (
    <>
      <textarea
        ref={textareaRef}
        className={className}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
      />
      {showVariables ? (
        <WorkflowVariablePicker
          variables={variables}
          disabled={disabled}
          onInsert={insertVariable}
        />
      ) : null}
    </>
  );
}

export function WorkflowSchemaList({ title, fields }) {
  if (!fields.length) return null;
  const caption = String(title || '').toLowerCase();
  return (
    <div className="workflow-json-schema">
      <span className="workflow-json-caption">{caption}</span>
      <div className="workflow-json-code" aria-label={caption}>
        <div className="workflow-json-line">
          <span className="workflow-json-punct">{'{'}</span>
        </div>
        {fields.map((field, index) => {
          const key = field.id || field.key || field.label || field.path || `field_${index + 1}`;
          const path = field.path || key;
          return (
            <div className="workflow-json-line is-field" key={field.path || field.id || key}>
              <span className="workflow-json-indent" aria-hidden="true" />
              <span className="workflow-json-key">"{key}"</span>
              <span className="workflow-json-punct">:</span>
              <span className="workflow-json-string">{`"{{${path}}}"`}</span>
              {index < fields.length - 1 ? <span className="workflow-json-punct">,</span> : null}
            </div>
          );
        })}
        <div className="workflow-json-line">
          <span className="workflow-json-punct">{'}'}</span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowOutputContract({ node }) {
  return (
    <WorkflowSchemaList
      title="Outputs"
      fields={workflowOutputFields(node).map((field) => ({
        ...field,
        path: `nodes.${node.id}.${field.id}`,
      }))}
    />
  );
}

const SETTINGS_LUCIDE_ICONS = {
  message: [
    ['path', { d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z' }],
    ['path', { d: 'M8 9h8' }],
    ['path', { d: 'M8 13h5' }],
  ],
  eye: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  layers: [
    ['path', { d: 'm12 2 10 5-10 5L2 7Z' }],
    ['path', { d: 'm2 17 10 5 10-5' }],
    ['path', { d: 'm2 12 10 5 10-5' }],
  ],
  nodes: [
    ['circle', { cx: '5', cy: '12', r: '3' }],
    ['circle', { cx: '19', cy: '5', r: '3' }],
    ['circle', { cx: '19', cy: '19', r: '3' }],
    ['path', { d: 'M8 11 16.5 6.5' }],
    ['path', { d: 'M8 13 16.5 17.5' }],
  ],
  wrench: [
    ['path', { d: 'M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.9 2.9-2.1-2.1Z' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'M12 2a15.3 15.3 0 0 1 0 20' }],
    ['path', { d: 'M12 2a15.3 15.3 0 0 0 0 20' }],
  ],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  search: [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  configure: [
    ['path', { d: 'M13 21h8' }],
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
  ],
  close: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  test: [
    ['path', { d: 'M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3' }],
    ['path', { d: 'm16 2 6 6' }],
    ['path', { d: 'M12 16H4' }],
  ],
  template: [
    ['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }],
    ['path', { d: 'M4 16V6a2 2 0 0 1 2-2h10' }],
  ],
  format: [
    ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3' }],
    ['path', { d: 'M16 3h3a2 2 0 0 1 2 2v3' }],
    ['path', { d: 'M8 21H5a2 2 0 0 1-2-2v-3' }],
    ['path', { d: 'M16 21h3a2 2 0 0 0 2-2v-3' }],
    ['path', { d: 'M9 8h6' }],
    ['path', { d: 'M9 12h6' }],
    ['path', { d: 'M9 16h4' }],
  ],
  validate: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.86a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  save: [
    ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
    ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
    ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }],
  ],
  active: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  lock: [
    ['rect', { x: '4', y: '10', width: '16', height: '10', rx: '2' }],
    ['path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }],
  ],
  delete: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
  ],
  'folder-plus': [
    ['path', { d: 'M12 10v6' }],
    ['path', { d: 'M9 13h6' }],
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],
  'toggle-left': [
    ['circle', { cx: '9', cy: '12', r: '3' }],
    ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '7' }],
  ],
  'toggle-right': [
    ['circle', { cx: '15', cy: '12', r: '3' }],
    ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '7' }],
  ],
  sparkles: [
    ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: '4', cy: '20', r: '2' }],
  ],
  'clipboard-list': [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M12 11h4' }],
    ['path', { d: 'M12 16h4' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 16h.01' }],
  ],
  'code-2': [
    ['path', { d: 'm18 16 4-4-4-4' }],
    ['path', { d: 'm6 8-4 4 4 4' }],
  ],
  'flask-conical': [
    ['path', { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' }],
    ['path', { d: 'M6.453 15h11.094' }],
    ['path', { d: 'M8.5 2h7' }],
  ],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  box: [
    ['path', { d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' }],
    ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
    ['path', { d: 'M12 22V12' }],
  ],
  'git-branch': [
    ['path', { d: 'M15 6a9 9 0 0 0-9 9V3' }],
    ['circle', { cx: '18', cy: '6', r: '3' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
  ],
};

export function SettingsLucideIcon({ name, size = 14, className = '' }) {
  const nodes = SETTINGS_LUCIDE_ICONS[name] || [];
  return (
    <svg
      className={`settings-lucide ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {nodes.map(([tag, attrs], index) => React.createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}

export function SettingsTooltipIconButton({
  label,
  icon,
  onClick,
  onMouseDown,
  disabled = false,
  danger = false,
  type = 'button',
  className = '',
  iconSize = 15,
}) {
  const button = (
    <button
      type={type}
      className={`settings-tooltip-icon-button${danger ? ' danger' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
    >
      <SettingsLucideIcon name={icon} size={iconSize} />
    </button>
  );
  return <PortalTooltip text={label} position="above">{button}</PortalTooltip>;
}

export function SettingsMenuSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select',
  header = '',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const items = Array.isArray(options) ? options : [];
  const current = items.find((item) => item.id === value);
  const label = current?.label || value || placeholder;

  const cancelClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    if (!open) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className={`model-picker settings-menu-select ${className} ${open ? 'is-open' : ''}`.trim()}
      ref={rootRef}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="model-picker-trigger"
        onClick={() => { if (!disabled) setOpen((shown) => !shown); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="model-picker-value">{label}</span>
        <span className="model-picker-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-picker-menu" role="listbox">
          {header ? <div className="model-picker-header">{header}</div> : null}
          <div className="model-picker-list">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`model-picker-option ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    onChange?.(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="model-picker-option-label">{item.label || item.id}</span>
                  {active ? (
                    <span className="model-picker-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3.2,8.6 6.6,12 13,4.8" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsComboInput({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '',
  header = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const items = Array.isArray(options) ? options : [];

  const cancelClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    if (!open) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className={`model-picker settings-combo-select ${open ? 'is-open' : ''}`}
      ref={rootRef}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <input
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => { if (!disabled && items.length) setOpen(true); }}
        disabled={disabled}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="settings-combo-caret"
        onClick={() => { if (!disabled && items.length) setOpen((shown) => !shown); }}
        disabled={disabled || !items.length}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="model-picker-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-picker-menu" role="listbox">
          {header ? <div className="model-picker-header">{header}</div> : null}
          <div className="model-picker-list">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`model-picker-option ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    onChange?.(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="model-picker-option-label">{item.label || item.id}</span>
                  {active ? (
                    <span className="model-picker-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3.2,8.6 6.6,12 13,4.8" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function getLlmConfigItems(draft, activeSubtab = 'chat') {
  const titleForConfig = (config) => {
    if (!config?.provider) return 'Provider';
    return runtimeProviderLabel(config);
  };
  if (activeSubtab === 'vision') {
    return draft.vision.enabled ? [
      {
        id: 'vision',
        title: titleForConfig(draft.vision),
        provider: draft.vision.provider,
        kind: 'Vision Provider',
        summary: draft.vision.model || 'not set',
        protected: true,
        canDelete: true,
      },
    ] : [];
  }
  if (activeSubtab === 'embedding') {
    return draft.embedding?.enabled ? [
      {
        id: 'embedding',
        title: titleForConfig(draft.embedding),
        provider: draft.embedding.provider,
        kind: 'Embedding Provider',
        summary: draft.embedding.model || 'not set',
        protected: true,
        canDelete: true,
      },
    ] : [];
  }
  return [
    ...(draft.chat?.provider ? [{
      id: 'chat',
      title: titleForConfig(draft.chat),
      provider: draft.chat.provider,
      kind: 'Provider',
      summary: draft.chat.model || 'not set',
      protected: true,
      canDelete: true,
    }] : []),
    ...(Array.isArray(draft.profiles) ? draft.profiles.filter((profile) => profile?.provider).map((profile) => ({
      id: profile.id,
      title: titleForConfig(profile),
      provider: profile.provider,
      kind: 'Provider',
      summary: profile.model || 'not set',
      protected: false,
      canDelete: true,
    })) : []),
  ];
}

export function configItemsForSection(section, llmDraft, records, activeSubtab = '', agentSettings = null, workflowSettings = null) {
  if (section === 'llm') return getLlmConfigItems(llmDraft, activeSubtab);
  if (section === 'agent') return agentListItems(agentSettings);
  if (section === 'workflow') return workflowListItems(workflowSettings);
  if (section === 'memory') {
    return Array.isArray(records?.memory) ? records.memory.map((item) => {
      const neo4j = normalizeNeo4jDraft({ ...item.neo4j, endpoint: item.endpoint });
      return {
        id: item.id,
        title: item.name,
        kind: item.kind,
        summary: neo4j.uri || 'URI not configured',
        protected: Boolean(item.protected),
        enabled: true,
      };
    }) : [];
  }
  if (section === 'knowledge') {
    return Array.isArray(records?.knowledge) ? records.knowledge.map((item) => {
      const qdrant = normalizeQdrantDraft({ ...item.qdrant, endpoint: item.endpoint });
      return {
        id: item.id,
        title: item.name,
        kind: item.kind,
        summary: qdrant.url || 'URL not configured',
        protected: Boolean(item.protected),
        enabled: true,
      };
    }) : [];
  }
  return Array.isArray(records?.[section]) ? records[section].map((item) => ({
    id: item.id,
    title: item.name,
    kind: item.kind,
    summary: section === 'tools' ? toolsRecordSummary(item) : (item.enabled ? (item.endpoint || item.notes || 'Enabled') : 'Disabled'),
    protected: Boolean(item.protected),
    enabled: item.enabled !== false,
  })) : [];
}

export function createGenericRecord(section) {
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label || 'Config';
  return {
    id: `${section}-${Date.now()}`,
    name: `New ${label} Config`,
    kind: label,
    enabled: true,
    endpoint: '',
    notes: '',
  };
}

export function createLlmProfile() {
  return {
    id: `llm-profile-${Date.now()}`,
    name: '',
    provider: 'custom',
    auth_mode: 'api_key',
    custom_provider: '',
    model: '',
    api_key: '',
    base_url: '',
    reasoning_effort: 'high',
    model_options: [],
  };
}

export function toolsRecordSummary(record) {
  if (record?.id === 'tools-mcp') {
    const parsed = parseJsonSafe(record.mcp_json || DEFAULT_MCP_CONFIG_JSON);
    if (!parsed.ok) return 'Invalid JSON';
    const servers = parsed.value?.servers && typeof parsed.value.servers === 'object' ? parsed.value.servers : {};
    return `${Object.keys(servers).length} server${Object.keys(servers).length === 1 ? '' : 's'}`;
  }
  if (record?.id === 'tools-skills') {
    const skills = Array.isArray(record.skills) ? record.skills : [];
    const enabled = skills.filter((skill) => skill.enabled !== false).length;
    return `${enabled}/${skills.length} enabled`;
  }
  if (record?.id === 'tools-web') {
    const web = normalizeWebSearchDraft(record.web_search);
    const configured = WEB_SEARCH_PROVIDER_OPTIONS
      .filter((provider) => web.providers[provider.id]?.api_key_configured || web.providers[provider.id]?.api_key)
      .map((provider) => provider.label);
    return configured.length ? `Configured: ${configured.join(', ')}` : 'No keys configured';
  }
  return record?.enabled ? (record.endpoint || record.notes || 'Enabled') : 'Disabled';
}

export function connectionBadgeMeta(status) {
  const state = String(status?.state || 'idle');
  if (state === 'success') return { className: 'success', label: 'Active', icon: true };
  if (state === 'testing') return { className: 'testing', label: 'Testing', icon: false };
  if (state === 'error') return { className: 'error', label: 'Failed', icon: false };
  return { className: 'idle', label: 'Not tested', icon: false };
}

export function parseJsonSafe(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightJsonSyntax(text) {
  return escapeHtml(text).replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g,
    (match) => {
      let cls = 'settings-json-number';
      if (match.startsWith('"')) cls = match.endsWith(':') ? 'settings-json-key' : 'settings-json-string';
      else if (match === 'true' || match === 'false') cls = 'settings-json-boolean';
      else if (match === 'null') cls = 'settings-json-null';
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function isEmptyMcpConfigDraft(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  const parsed = parseJsonSafe(raw);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return false;
  const keys = Object.keys(parsed.value);
  const servers = parsed.value.servers;
  return keys.length === 0 || (
    keys.length === 1
    && servers
    && typeof servers === 'object'
    && !Array.isArray(servers)
    && Object.keys(servers).length === 0
  );
}

export function countMcpServersFromJson(text) {
  const parsed = parseJsonSafe(text || DEFAULT_MCP_CONFIG_JSON);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) return 0;
  const servers = parsed.value.servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return 0;
  return Object.keys(servers).length;
}

export function formatMcpServerCountLabel(count) {
  const total = Number.isFinite(count) && count > 0 ? count : 0;
  return `${total} mcp server${total === 1 ? '' : 's'}`;
}

export function normalizeWebSearchDraft(value) {
  const fallback = createDefaultWebSearchSettings();
  const incoming = value && typeof value === 'object' ? value : {};
  const providers = { ...fallback.providers };
  for (const provider of WEB_SEARCH_PROVIDER_OPTIONS) {
    providers[provider.id] = {
      ...providers[provider.id],
      ...(incoming.providers?.[provider.id] || {}),
    };
  }
  return {
    ...fallback,
    ...incoming,
    mode: ['hybrid', 'tavily', 'serpapi'].includes(incoming.mode) ? incoming.mode : fallback.mode,
    providers,
  };
}

export function applyToolsSettingsPayloadToRecords(records, payload) {
  if (!payload || typeof payload !== 'object') return records;
  return {
    ...records,
    tools: mergeDefaultRecords(createDefaultSettingsRecords().tools, records?.tools).map((record) => {
      if (record.id === 'tools-mcp' && payload.mcp) {
        return {
          ...record,
          mcp_path: payload.mcp.path || record.mcp_path || '',
          mcp_error: payload.mcp.error || '',
          mcp_status: '',
          mcp_json: JSON.stringify(payload.mcp.config || { servers: {} }, null, 2),
        };
      }
      if (record.id === 'tools-skills' && payload.skills) {
        return {
          ...record,
          skills: Array.isArray(payload.skills.items) ? payload.skills.items : [],
          skill_errors: Array.isArray(payload.skills.errors) ? payload.skills.errors : [],
          skill_install_root: payload.skills.install_root || '',
        };
      }
      if (record.id === 'tools-web' && payload.web_search) {
        return {
          ...record,
          web_search: normalizeWebSearchDraft(payload.web_search),
        };
      }
      return record;
    }),
  };
}

export function applyMemorySettingsPayloadToRecords(records, payload) {
  const neo4j = normalizeNeo4jDraft(payload?.neo4j);
  return {
    ...records,
    memory: mergeKnownDefaultRecords(createDefaultSettingsRecords().memory, records?.memory).map((record) => (
      record.id === 'memory-neo4j'
        ? { ...record, endpoint: neo4j.uri, neo4j }
        : record
    )),
  };
}

export function applyKnowledgeSettingsPayloadToRecords(records, payload) {
  const qdrant = normalizeQdrantDraft(payload?.qdrant);
  return {
    ...records,
    knowledge: mergeKnownDefaultRecords(createDefaultSettingsRecords().knowledge, records?.knowledge).map((record) => (
      record.id === 'knowledge-qdrant'
        ? { ...record, endpoint: qdrant.url, qdrant }
        : record
    )),
  };
}

export function buildToolsSettingsPayload(records) {
  const tools = Array.isArray(records?.tools) ? records.tools : [];
  const mcp = tools.find((item) => item.id === 'tools-mcp');
  const skills = tools.find((item) => item.id === 'tools-skills');
  const webRecord = tools.find((item) => item.id === 'tools-web');
  const parsedMcp = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
  if (!parsedMcp.ok) {
    throw new Error(`MCP JSON is invalid: ${parsedMcp.error}`);
  }
  const web = normalizeWebSearchDraft(webRecord?.web_search);
  const providers = {};
  for (const provider of WEB_SEARCH_PROVIDER_OPTIONS) {
    const draft = web.providers[provider.id] || {};
    providers[provider.id] = {
      enabled: true,
      ...(String(draft.api_key || '').trim() ? { api_key: String(draft.api_key).trim() } : {}),
    };
  }
  return {
    mcp: { config: parsedMcp.value },
    skills: {
      disabled: (Array.isArray(skills?.skills) ? skills.skills : [])
        .filter((skill) => skill.enabled === false)
        .map((skill) => skill.name || skill.id)
        .filter(Boolean),
    },
    web_search: {
      enabled: true,
      mode: 'hybrid',
      providers,
    },
  };
}

export function buildMemorySettingsPayload(records) {
  const memory = Array.isArray(records?.memory) ? records.memory : [];
  const record = memory.find((item) => item.id === 'memory-neo4j') || {};
  const neo4j = normalizeNeo4jDraft({ ...record.neo4j, endpoint: record.endpoint });
  return {
    neo4j: {
      uri: neo4j.uri,
      username: neo4j.username,
      ...(neo4j.password ? { password: neo4j.password } : {}),
      database: neo4j.database,
    },
  };
}

export function buildKnowledgeSettingsPayload(records) {
  const knowledge = Array.isArray(records?.knowledge) ? records.knowledge : [];
  const record = knowledge.find((item) => item.id === 'knowledge-qdrant') || {};
  const qdrant = normalizeQdrantDraft({ ...record.qdrant, endpoint: record.endpoint });
  return {
    qdrant: {
      url: qdrant.url,
      ...(qdrant.api_key ? { api_key: qdrant.api_key } : {}),
      collection: {
        name: qdrant.collection.name,
        vector_size: qdrant.collection.vector_size,
        distance: qdrant.collection.distance,
      },
    },
  };
}

export function getSelectedLlmConfig(draft, selectedId) {
  if (selectedId === 'vision') return draft.vision;
  if (selectedId === 'embedding') return draft.embedding;
  if (selectedId === 'chat') return draft.chat;
  return (draft.profiles || []).find((profile) => profile.id === selectedId) || draft.chat;
}

export function updateSelectedLlmConfig(onDraftChange, selectedId, patch) {
  onDraftChange((prev) => {
    if (selectedId === 'chat') return { ...prev, chat: { ...prev.chat, ...patch } };
    if (selectedId === 'vision') return { ...prev, vision: { ...prev.vision, ...patch } };
    if (selectedId === 'embedding') return { ...prev, embedding: { ...prev.embedding, ...patch } };
    return {
      ...prev,
      profiles: (prev.profiles || []).map((profile) => (
        profile.id === selectedId ? { ...profile, ...patch } : profile
      )),
    };
  });
}

export function llmProviderRequestPayload(config, { includeSecret = false, refresh = false, includeOAuth = false } = {}) {
  const provider = normalizeLlmProviderId(config.provider);
  const payload = {
    provider,
    auth_mode: config.auth_mode || getLlmProvider(provider).defaultAuth,
    custom_provider: provider === 'custom' ? String(config.name || config.custom_provider || '').trim() : '',
    model: config.model || '',
    refresh,
  };
  if (provider === 'custom') {
    payload.base_url = config.base_url || '';
  }
  if (includeSecret && config.auth_mode === 'api_key' && config.api_key) {
    payload.api_key = config.api_key;
  }
  if (includeOAuth && config.auth_mode === 'oauth') {
    payload.oauth_code = config.oauth_code || '';
    payload.oauth_verifier = config.oauth_verifier || '';
    payload.oauth_state = config.oauth_state || '';
  }
  return payload;
}

export function LlmConfigEditor({ selectedId, draft, onDraftChange, readOnly = false, refreshModels = false }) {
  const config = getSelectedLlmConfig(draft, selectedId);
  const provider = getLlmProvider(config.provider);
  const [modelChoices, setModelChoices] = useState(() => uniqueModelChoices(config.model, configuredModelOptions(config), modelChoicesFor(config.provider)));
  const [oauthStartError, setOauthStartError] = useState('');
  const [oauthStartPending, setOauthStartPending] = useState(false);
  const [oauthFlowId, setOauthFlowId] = useState('');
  const [oauthFlowStatus, setOauthFlowStatus] = useState('idle');
  const [oauthFlowMessage, setOauthFlowMessage] = useState('');
  const disabled = readOnly
    || (selectedId === 'vision' && !draft.vision.enabled)
    || (selectedId === 'embedding' && !draft.embedding?.enabled);
  const showProviderNameField = config.provider === 'custom';
  const showAuthModeField = provider.authModes.length > 1;
  const showApiKeyField = config.auth_mode === 'api_key';
  const showOAuthFields = config.auth_mode === 'oauth' && LLM_OAUTH_UI_PROVIDERS.has(config.provider);
  const showOAuthCallbackLogin = showOAuthFields && LLM_OAUTH_CALLBACK_PROVIDERS.has(config.provider);
  const showOAuthManualLogin = showOAuthFields && LLM_OAUTH_MANUAL_CODE_PROVIDERS.has(config.provider);
  const oauthFlowPending = oauthStartPending || oauthFlowStatus === 'pending' || oauthFlowStatus === 'exchanging';
  const showBaseUrlField = config.provider === 'custom';
  const update = (patch) => updateSelectedLlmConfig(onDraftChange, selectedId, patch);
  const changeProvider = (providerId) => {
    const next = nextProviderDraft(providerId, config);
    setOauthStartError('');
    setOauthFlowId('');
    setOauthFlowStatus('idle');
    setOauthFlowMessage('');
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
      if (payload.flow_id) {
        setOauthFlowId(payload.flow_id);
        setOauthFlowStatus(payload.status || 'pending');
        setOauthFlowMessage('Complete sign-in in your browser. This page will update automatically.');
        update({
          oauth_auth_url: '',
          oauth_code: '',
          oauth_verifier: '',
          oauth_state: '',
          oauth_configured: false,
        });
        window.open(payload.auth_url, '_blank', 'noopener,noreferrer');
        return;
      }
      update({
        oauth_auth_url: payload.auth_url || '',
        oauth_verifier: payload.verifier || '',
        oauth_state: payload.state || '',
      });
    } catch (error) {
      setOauthStartError(String(error?.message || error));
    } finally {
      setOauthStartPending(false);
    }
  };

  useEffect(() => {
    setModelChoices(uniqueModelChoices(config.model, configuredModelOptions(config), modelChoicesFor(config.provider)));
  }, [config.model, config.model_options, config.provider]);

  useEffect(() => {
    if (
      disabled
      || readOnly
      || !LLM_OAUTH_MANUAL_CODE_PROVIDERS.has(config.provider)
      || config.auth_mode !== 'oauth'
      || config.oauth_auth_url
    ) {
      return undefined;
    }
    let cancelled = false;
    setOauthStartPending(true);
    setOauthStartError('');
    authFetch(`${API_BASE}/api/llm/oauth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: config.provider }),
    }, { json: false })
      .then(async (response) => {
        if (!response.ok) {
          let detail = `OAuth start failed (${response.status})`;
          try {
            const body = await response.json();
            detail = String(body?.detail || body?.message || detail);
          } catch {
            // keep fallback
          }
          throw new Error(detail);
        }
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.auth_url) {
          throw new Error('OAuth start response did not include auth_url.');
        }
        update({
          oauth_auth_url: payload.auth_url || '',
          oauth_verifier: payload.verifier || '',
          oauth_state: payload.state || '',
        });
        setOauthStartError('');
      })
      .catch((error) => {
        if (!cancelled) setOauthStartError(String(error?.message || error));
      })
      .finally(() => {
        if (!cancelled) setOauthStartPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.provider, config.auth_mode, config.oauth_auth_url, disabled, readOnly]);

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
    if (config.auth_mode === 'oauth') return undefined;
    if (config.auth_mode === 'api_key' && config.provider !== 'ollama' && !config.api_key && !config.api_key_configured) return undefined;
    if (config.provider === 'custom' && !config.base_url) return undefined;
    let cancelled = false;
    const fallbackChoices = uniqueModelChoices(config.model, configuredModelOptions(config), modelChoicesFor(config.provider));
    const timer = window.setTimeout(() => {
      const payload = llmProviderRequestPayload(config, { includeSecret: true, refresh: true });
      authFetch(`${API_BASE}/api/llm/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false })
        .then((response) => (response.ok ? response.json() : null))
        .then((catalog) => {
          if (cancelled || !catalog) return;
          const remoteChoices = Array.isArray(catalog.models) ? catalog.models : [];
          setModelChoices(uniqueModelChoices(config.model, remoteChoices, fallbackChoices));
          if (remoteChoices.length) {
            update({
              model_options: remoteChoices,
              ...(config.model ? {} : { model: catalog.default_model || remoteChoices[0].id }),
            });
          }
        })
        .catch(() => {
          if (!cancelled) setModelChoices(fallbackChoices);
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
            update({
              auth_mode: authMode,
              oauth_auth_url: '',
              oauth_code: '',
              oauth_state: '',
              oauth_verifier: '',
              oauth_configured: false,
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
            ? 'Finish signing in with xAI in the browser. No code needs to be copied.'
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
                : (config.oauth_configured ? 'Reconnect xAI' : 'Connect xAI')}
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
                Connected to xAI
              </div>
            ) : null}
          </div>
        </FieldRow>
      )}
      {showOAuthManualLogin && (
        <>
          <FieldRow
            label="OAuth URL"
            hint={oauthStartError
              ? oauthStartError
              : (config.oauth_auth_url
                ? 'Open the link, complete login, then paste the callback URL or code below.'
                : (oauthStartPending
                  ? 'Generating OAuth link...'
                  : 'OAuth link will be generated automatically.'))}
          >
            <div className="settings-inline-control">
              <input
                value={config.oauth_auth_url || ''}
                readOnly
                disabled={disabled}
                placeholder={oauthStartPending ? 'Generating OAuth link...' : 'OAuth link will be generated automatically'}
              />
              {config.oauth_auth_url ? (
                <a className="settings-inline-button" href={config.oauth_auth_url} target="_blank" rel="noreferrer">Open</a>
              ) : (
                <button
                  type="button"
                  className="settings-inline-button"
                  disabled={disabled || oauthStartPending}
                  onClick={() => { void startOAuthLogin(); }}
                >
                  {oauthStartPending ? '...' : 'Generate'}
                </button>
              )}
            </div>
          </FieldRow>
          <FieldRow label="OAuth Code" hint="Paste the callback URL or authorization code after login.">
            <input
              value={config.oauth_code || ''}
              onChange={(event) => update({ oauth_code: event.target.value })}
              disabled={disabled}
              placeholder="Callback URL or code"
            />
          </FieldRow>
        </>
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
        <SettingsComboInput
          value={config.model || ''}
          options={modelChoices}
          onChange={(model) => update({ model })}
          disabled={disabled}
          placeholder={provider.defaultModel}
          header="default model"
        />
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

export function GenericConfigEditor({ section, selectedId, records, onRecordsChange, readOnly = false }) {
  const current = (records[section] || []).find((item) => item.id === selectedId) || null;
  if (!current) {
    return <div className="settings-empty">Select or add a configuration.</div>;
  }
  const update = (patch) => onRecordsChange((prev) => ({
    ...prev,
    [section]: (prev[section] || []).map((item) => (
      item.id === selectedId ? { ...item, ...patch } : item
    )),
  }));
  return (
    <div className="settings-editor-form">
      <FieldRow label="Name">
        <input value={current.name || ''} onChange={(event) => update({ name: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Type">
        <input value={current.kind || ''} onChange={(event) => update({ kind: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Endpoint">
        <input value={current.endpoint || ''} onChange={(event) => update({ endpoint: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Status">
        <SettingsMenuSelect
          value={current.enabled ? 'enabled' : 'disabled'}
          options={[
            { id: 'enabled', label: 'Enabled' },
            { id: 'disabled', label: 'Disabled' },
          ]}
          onChange={(value) => update({ enabled: value === 'enabled' })}
          disabled={readOnly}
        />
      </FieldRow>
      <FieldRow label="Notes">
        <textarea value={current.notes || ''} onChange={(event) => update({ notes: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}

export function MemoryConfigEditor({ selectedId, records, onRecordsChange, onDirty, readOnly = false }) {
  const current = (records.memory || []).find((item) => item.id === selectedId) || null;
  if (!current) return <div className="settings-empty">Select a memory configuration.</div>;
  const neo4j = normalizeNeo4jDraft({ ...current.neo4j, endpoint: current.endpoint });
  const update = (patch) => {
    onDirty?.('memory', selectedId);
    onRecordsChange((prev) => ({
      ...prev,
      memory: (prev.memory || []).map((item) => {
        if (item.id !== selectedId) return item;
        const nextNeo4j = normalizeNeo4jDraft({ ...neo4j, ...patch });
        return { ...item, endpoint: nextNeo4j.uri, neo4j: nextNeo4j };
      }),
    }));
  };
  return (
    <div className="settings-editor-form settings-tools-form">
      <FieldRow label="URI">
        <input value={neo4j.uri} onChange={(event) => update({ uri: event.target.value })} disabled={readOnly} placeholder="Optional, e.g. bolt://localhost:7687" />
      </FieldRow>
      <FieldRow label="Username">
        <input value={neo4j.username} onChange={(event) => update({ username: event.target.value })} disabled={readOnly} placeholder="neo4j" />
      </FieldRow>
      <FieldRow label="Password">
        <SecretKeyField
          value={neo4j.password}
          onChange={(event) => update({ password: event.target.value })}
          disabled={readOnly}
          configured={Boolean(neo4j.password_configured)}
          placeholder="Password"
        />
      </FieldRow>
      <FieldRow label="Database">
        <input value={neo4j.database} onChange={(event) => update({ database: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}

export function KnowledgeConfigEditor({ selectedId, records, onRecordsChange, onDirty, readOnly = false }) {
  const current = (records.knowledge || []).find((item) => item.id === selectedId) || null;
  if (!current) return <div className="settings-empty">Select a knowledge configuration.</div>;
  const qdrant = normalizeQdrantDraft({ ...current.qdrant, endpoint: current.endpoint });
  const update = (patch) => {
    onDirty?.('knowledge', selectedId);
    onRecordsChange((prev) => ({
      ...prev,
      knowledge: (prev.knowledge || []).map((item) => {
        if (item.id !== selectedId) return item;
        const nextQdrant = normalizeQdrantDraft({
          ...qdrant,
          ...patch,
          collection: { ...qdrant.collection, ...(patch.collection || {}) },
        });
        return { ...item, endpoint: nextQdrant.url, qdrant: nextQdrant };
      }),
    }));
  };
  return (
    <div className="settings-editor-form settings-tools-form">
      <FieldRow label="URL">
        <input value={qdrant.url} onChange={(event) => update({ url: event.target.value })} disabled={readOnly} placeholder="Optional, e.g. http://localhost:6333" />
      </FieldRow>
      <FieldRow label="API Key">
        <SecretKeyField
          value={qdrant.api_key}
          onChange={(event) => update({ api_key: event.target.value })}
          disabled={readOnly}
          configured={Boolean(qdrant.api_key_configured)}
          placeholder="API key"
        />
      </FieldRow>
      <FieldRow label="Collection Name">
        <input value={qdrant.collection.name} onChange={(event) => update({ collection: { name: event.target.value } })} disabled={readOnly} placeholder="Leave blank to use workspace default" />
      </FieldRow>
      <FieldRow label="Vector Size">
        <input type="number" min="1" value={qdrant.collection.vector_size} onChange={(event) => update({ collection: { vector_size: event.target.value } })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Distance">
        <SettingsMenuSelect
          value={qdrant.collection.distance}
          options={QDRANT_DISTANCE_OPTIONS}
          onChange={(distance) => update({ collection: { distance } })}
          disabled={readOnly}
          header="distance"
        />
      </FieldRow>
    </div>
  );
}

export function AgentConfigEditor({ selectedId, settings, onSettingsChange, readOnly = false }) {
  const normalized = normalizeAgentSettings(settings);
  const current = normalized.custom.find((item) => item.agent_id === selectedId) || null;
  if (!current) {
    const preset = normalized.presets.find((item) => item.agent_id === selectedId) || null;
    if (!preset) return <div className="settings-empty">Select an agent.</div>;
    const effectiveSkills = (preset.effective_skills || [])
      .map((skill) => String(skill?.name || skill || '').trim())
      .filter(Boolean);
    const effectiveTools = (preset.effective_tools || []).map(String).filter(Boolean);
    const effectiveMcpTools = (preset.effective_mcp_tools || []).map(String).filter(Boolean);
    const renderReadOnlyList = (items, emptyLabel) => (
      <div className="settings-check-grid">
        {items.map((item) => (
          <div className="settings-check-row" key={item}>
            <span className="settings-check-label">{item}</span>
          </div>
        ))}
        {!items.length ? <small>{emptyLabel}</small> : null}
      </div>
    );
    return (
      <div className="settings-editor-form settings-agent-form">
        <FieldRow label="Name">
          <input value={preset.display_name || ''} disabled />
        </FieldRow>
        <FieldRow label="Description">
          <textarea value={preset.description || ''} disabled />
        </FieldRow>
        <FieldRow label="Tools">{renderReadOnlyList(effectiveTools, 'No tools.')}</FieldRow>
        <FieldRow label="MCP tools">{renderReadOnlyList(effectiveMcpTools, 'No MCP tools.')}</FieldRow>
        <FieldRow label="Skills">{renderReadOnlyList(effectiveSkills, 'No skills.')}</FieldRow>
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
  const renderHelpDot = (text) => {
    const label = String(text || '').trim();
    const dot = <span className="settings-help-dot" aria-label={label} tabIndex={0}>?</span>;
    const Tooltip = PortalTooltip;
    return Tooltip ? <Tooltip text={label} position="above" multiline>{dot}</Tooltip> : dot;
  };
  const allowedTools = Array.isArray(current.tool_policy?.allow) ? current.tool_policy.allow : [];
  const selectedGroupIds = new Set(groupIdsForAgentTools(allowedTools, toolGroups));
  const baseOptions = normalized.base_profiles.map((profile) => ({
    id: profile.agent_id,
    label: profile.display_name,
  }));
  const statusOptions = [
    { id: 'enabled', label: 'Active' },
    { id: 'disabled', label: 'Disabled' },
  ];
  const toggleGroup = (groupId) => {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    updateToolPolicy({ allow: toolsForAgentGroups([...next], toolGroups) });
  };
  const skillOptions = (normalized.skills || [])
    .map((item) => ({
      id: String(item?.name || item?.id || '').trim(),
      label: String(item?.name || item?.label || item?.id || '').trim(),
      description: String(item?.description || '').trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.id);
  const allowedSkills = new Set(Array.isArray(current.skill_policy?.allow) ? current.skill_policy.allow : []);
  const mcpServers = Array.isArray(normalized.mcp_servers) ? normalized.mcp_servers : [];
  const allowedMcpServers = new Set(Array.isArray(current.mcp_policy?.allow_servers) ? current.mcp_policy.allow_servers : []);
  const allowedMcpTools = new Set(Array.isArray(current.mcp_policy?.allow_tools) ? current.mcp_policy.allow_tools : []);
  const toggleSkill = (skillId) => {
    const next = new Set(allowedSkills);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);
    updateSkillPolicy({ allow: [...next] });
  };
  const updateMcpPolicy = (patch) => update({
    mcp_policy: { ...(current.mcp_policy || {}), ...patch },
  });
  const toggleMcpServer = (serverName) => {
    const next = new Set(allowedMcpServers);
    if (next.has(serverName)) next.delete(serverName);
    else next.add(serverName);
    updateMcpPolicy({ allow_servers: [...next] });
  };
  const toggleMcpTool = (serverName, toolName) => {
    const key = `${serverName}.${toolName}`;
    const next = new Set(allowedMcpTools);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateMcpPolicy({ allow_tools: [...next] });
  };

  return (
    <div className="settings-editor-form settings-agent-form">
      <FieldRow label="Name">
        <input value={current.display_name || ''} onChange={(event) => update({ display_name: event.target.value })} disabled={readOnly} placeholder="Agent name" />
      </FieldRow>
      <FieldRow label="Description">
        <textarea value={current.description || ''} onChange={(event) => update({ description: event.target.value })} disabled={readOnly} />
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
      <FieldRow label="Status">
        <SettingsMenuSelect
          value={current.enabled === false ? 'disabled' : 'enabled'}
          options={statusOptions}
          onChange={(status) => update({ enabled: status === 'enabled' })}
          disabled={readOnly}
          header="status"
        />
      </FieldRow>
      <FieldRow label="Additional instructions">
        <textarea value={current.system_prompt || ''} onChange={(event) => update({ system_prompt: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Tools">
        <div className="settings-check-grid">
          {toolGroups.map((group) => (
            <label className="settings-check-row" key={group.id}>
              <input type="checkbox" checked={selectedGroupIds.has(group.id)} onChange={() => toggleGroup(group.id)} disabled={readOnly} />
              <span className="settings-check-label">{group.label}</span>
              {renderHelpDot(group.description || (group.tools || []).join(', '))}
            </label>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="MCP tools">
        <div className="settings-check-grid">
          {mcpServers.map((server) => (
            <div key={server.name} className="settings-check-group">
              <label className="settings-check-row">
                <input type="checkbox" checked={allowedMcpServers.has(server.name)} onChange={() => toggleMcpServer(server.name)} disabled={readOnly} />
                <span className="settings-check-label">{server.name} · all tools</span>
                {server.error ? renderHelpDot(server.error) : null}
              </label>
              {(server.tools || []).map((tool) => (
                <label className="settings-check-row" key={`${server.name}.${tool.name}`}>
                  <input
                    type="checkbox"
                    checked={allowedMcpServers.has(server.name) || allowedMcpTools.has(`${server.name}.${tool.name}`)}
                    onChange={() => toggleMcpTool(server.name, tool.name)}
                    disabled={readOnly || allowedMcpServers.has(server.name)}
                  />
                  <span className="settings-check-label">{tool.name}</span>
                  {tool.description ? renderHelpDot(tool.description) : null}
                </label>
              ))}
            </div>
          ))}
          {!mcpServers.length ? <small>No configured MCP servers.</small> : null}
        </div>
      </FieldRow>
      <FieldRow label="Skills">
        <div className="settings-check-grid">
          {skillOptions.map((skill) => (
            <label className="settings-check-row" key={skill.id}>
              <input type="checkbox" checked={allowedSkills.has(skill.id)} onChange={() => toggleSkill(skill.id)} disabled={readOnly || !skill.enabled} />
              <span className="settings-check-label">{skill.label}</span>
              {skill.description ? renderHelpDot(skill.description) : null}
            </label>
          ))}
          {!skillOptions.length ? <small>No installed skills.</small> : null}
        </div>
      </FieldRow>
    </div>
  );
}

export function WorkflowFlowNode({ data, selected }) {
  const flow = ReactFlowNS;
  const Handle = flow.Handle;
  const Position = flow.Position || { Left: 'left', Right: 'right' };
  const node = data?.workflowNode || {};
  const nodeType = node.type || 'agent';
  return (
    <div className={`workflow-flow-node ${nodeType} ${selected ? 'active' : ''}`}>
      {Handle && nodeType !== 'start' ? <Handle type="target" position={Position.Left} /> : null}
      <strong>{node.label || typeLabelForWorkflowNode(nodeType)}</strong>
      {Handle && nodeType !== 'output' ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

const WORKFLOW_REACT_FLOW_NODE_TYPES = { workflowNode: WorkflowFlowNode };

export function canConnectWorkflowNodes(source, target) {
  return Boolean(source && target && source.id !== target.id && source.type !== 'output' && target.type !== 'start');
}

export function addWorkflowEdge(edges, from, to) {
  if (!from || !to || from === to || edges.some((edge) => edge.from === from && edge.to === to)) return edges;
  return [...edges, { from, to }];
}

export function WorkflowConfigEditor({ selectedId, settings, onSettingsChange, agentSettings, readOnly = false }) {
  const normalized = normalizeWorkflowSettings(settings);
  const agentOptions = agentCatalogFromSettings(agentSettings).options;
  const workflow = workflowById(normalized, selectedId);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');

  useEffect(() => {
    if (!workflow) {
      setSelectedNodeId('');
      setSelectedEdgeId('');
      return;
    }
    setSelectedNodeId((current) => (
      workflow.nodes.some((node) => node.id === current) ? current : ''
    ));
    setSelectedEdgeId('');
  }, [selectedId, workflow?.nodes?.length]);

  if (!workflow) return <div className="settings-empty">Select a workflow.</div>;

  const isEditable = !readOnly && workflow.custom;
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = edges.find((edge) => `${edge.from}->${edge.to}` === selectedEdgeId) || null;
  const availableVariables = workflowVariableCatalog(workflow, selectedNodeId);
  const typeOptions = normalized.node_types
    .filter((item) => item.id !== 'output')
    .map((item) => ({ id: item.id, label: item.label }));

  const updateWorkflow = (patch) => {
    if (!isEditable) return;
    onSettingsChange((prev) => {
      const next = normalizeWorkflowSettings(prev);
      return {
        ...next,
        custom: next.custom.map((item) => (
          item.workflow_id === workflow.workflow_id ? normalizeWorkflowRow({ ...item, ...patch }, item) : item
        )),
      };
    });
  };
  const flow = ReactFlowNS;
  const ReactFlowCanvas = flow.ReactFlow;
  const Background = flow.Background;
  const Controls = flow.Controls;
  const MarkerType = flow.MarkerType || {};
  const reactNodes = nodes.map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0),
    },
    data: { workflowNode: node },
    selected: node.id === selectedNodeId,
    draggable: isEditable,
  }));
  const reactEdges = edges.map((edge, index) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    selected: `${edge.from}->${edge.to}` === selectedEdgeId,
    interactionWidth: 24,
    markerEnd: MarkerType.ArrowClosed ? { type: MarkerType.ArrowClosed } : undefined,
  }));
  const onReactFlowNodesChange = (changes) => {
    if (!isEditable || !flow.applyNodeChanges) return;
    const removeIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
    if (removeIds.size) {
      const removableIds = new Set(nodes.filter((node) => removeIds.has(node.id) && !['start', 'output'].includes(node.type)).map((node) => node.id));
      if (!removableIds.size) return;
      updateWorkflow({
        nodes: nodes.filter((node) => !removableIds.has(node.id)),
        edges: edges.filter((edge) => !removableIds.has(edge.from) && !removableIds.has(edge.to)),
      });
      if (removableIds.has(selectedNodeId)) setSelectedNodeId('');
      setSelectedEdgeId('');
      return;
    }
    if (!changes.some((change) => change.type === 'position' && change.position)) return;
    const updated = flow.applyNodeChanges(changes, reactNodes);
    const updatedById = new Map(updated.map((node) => [node.id, node]));
    updateWorkflow({
      nodes: nodes.map((node) => {
        const next = updatedById.get(node.id);
        if (!next) return node;
        return normalizeWorkflowNode({ ...node, position: next.position }, node);
      }),
    });
  };
  const onReactFlowEdgesChange = (changes) => {
    if (!isEditable || !flow.applyEdgeChanges) return;
    if (!changes.some((change) => change.type !== 'select')) return;
    const updated = flow.applyEdgeChanges(changes, reactEdges);
    if (selectedEdgeId && !updated.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId('');
    updateWorkflow({
      edges: updated
        .filter((edge) => edge.source && edge.target)
        .map((edge) => ({ from: edge.source, to: edge.target })),
    });
  };
  const onReactFlowConnect = (connection) => {
    if (!isEditable || !connection?.source || !connection?.target || connection.source === connection.target) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!canConnectWorkflowNodes(source, target)) return;
    updateWorkflow({ edges: addWorkflowEdge(edges, connection.source, connection.target) });
  };
  const onReactFlowNodeDragStop = (_, draggedNode) => {
    if (!isEditable) return;
    updateWorkflow({
      nodes: nodes.map((node) => (
        node.id === draggedNode.id ? normalizeWorkflowNode({ ...node, position: draggedNode.position }, node) : node
      )),
    });
  };
  const updateNode = (nodeId, patch) => {
    updateWorkflow({
      nodes: nodes.map((node) => (
        node.id === nodeId ? normalizeWorkflowNode({ ...node, ...patch }, node) : node
      )),
    });
  };
  const addNode = (type) => {
    const baseType = type || 'agent';
    const count = nodes.filter((node) => node.type === baseType).length + 1;
    const id = `${baseType}_${count}`;
    const newNode = {
      id,
      type: baseType,
      label: typeLabelForWorkflowNode(baseType),
      position: { x: 210 + (count * 150), y: 180 + ((count - 1) % 2) * 110 },
      ...(baseType === 'agent' ? {
        agent_id: agentOptions[0]?.id || 'preset.general',
        prompt: '{{input.message}}',
        input_mapping: {
          message: '{{input.message}}',
          attachments: '{{input.attachments}}',
          image_attachments: '{{input.image_attachments}}',
        },
      } : {}),
      ...(baseType === 'llm' ? { prompt: '{{input.message}}', response_format: 'text' } : {}),
      ...(baseType === 'tool' ? { tool_name: '', arguments: { query: '{{input.message}}' } } : {}),
      ...(baseType === 'condition' ? { expression: '{{nodes.agent_1.success}} == true' } : {}),
      ...(baseType === 'output' ? {
        output_mode: 'json_object',
        output: '{{input.message}}',
        output_mapping: DEFAULT_WORKFLOW_OUTPUT_MAPPING,
        output_schema: DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
      } : {}),
    };
    updateWorkflow({
      nodes: [...nodes.filter((node) => node.id !== id), newNode],
    });
    setSelectedNodeId(id);
    setSelectedEdgeId('');
  };
  const deleteNode = (nodeId) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || target.type === 'start' || target.type === 'output') return;
    updateWorkflow({
      nodes: nodes.filter((node) => node.id !== nodeId),
      edges: edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    });
    setSelectedNodeId('');
    setSelectedEdgeId('');
  };
  const deleteEdge = (edgeId) => {
    if (!edgeId) return;
    updateWorkflow({ edges: edges.filter((edge) => `${edge.from}->${edge.to}` !== edgeId) });
    setSelectedEdgeId('');
  };
  const deleteSelection = () => {
    if (selectedEdge) {
      deleteEdge(selectedEdgeId);
      return;
    }
    if (selectedNode) deleteNode(selectedNode.id);
  };
  const loadExampleWorkflow = () => {
    if (!isEditable) return;
    const shouldReplace = nodes.length <= 2
      || window.confirm('Replace this canvas with an example workflow?');
    if (!shouldReplace) return;
    updateWorkflow(createWorkflowExamplePatch(agentOptions));
    setSelectedNodeId('output');
    setSelectedEdgeId('');
  };

  const renderNodeFields = () => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'start') {
      return (
        <>
          <WorkflowSchemaList
            title="Inputs"
            fields={workflowSchemaFields(selectedNode.input_schema || workflow.input_schema)}
          />
        </>
      );
    }
    if (selectedNode.type === 'agent') {
      const promptValue = selectedNode.prompt ?? selectedNode.input ?? '{{input.message}}';
      return (
        <>
          <FieldRow label="agent">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.agent_id || agentOptions[0]?.id || 'preset.general'}
              options={agentOptions.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(agent_id) => updateNode(selectedNode.id, { agent_id })}
              disabled={!isEditable}
            />
          </FieldRow>
          <FieldRow label="prompt" hint="Use variables from start or upstream nodes.">
            <WorkflowTemplateTextarea
              value={promptValue}
              variables={availableVariables}
              disabled={!isEditable}
              rows={5}
              onChange={(prompt) => updateNode(selectedNode.id, { prompt, input: prompt })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'llm') {
      return (
        <>
          <FieldRow label="response format">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.response_format || 'text'}
              options={[
                { id: 'text', label: 'Text' },
                { id: 'json_object', label: 'JSON object' },
              ]}
              onChange={(response_format) => updateNode(selectedNode.id, { response_format })}
              disabled={!isEditable}
            />
          </FieldRow>
          <FieldRow label="prompt">
            <WorkflowTemplateTextarea
              value={selectedNode.prompt || '{{input.message}}'}
              variables={availableVariables}
              disabled={!isEditable}
              rows={6}
              onChange={(prompt) => updateNode(selectedNode.id, { prompt })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'tool') {
      return (
        <>
          <FieldRow label="tool name">
            <input value={selectedNode.tool_name || ''} onChange={(event) => updateNode(selectedNode.id, { tool_name: event.target.value })} disabled={!isEditable} placeholder="tool name" />
          </FieldRow>
          <FieldRow label="arguments json" hint="Objects and arrays render variables recursively.">
            <WorkflowTemplateTextarea
              value={workflowArgumentsText(selectedNode.arguments)}
              variables={availableVariables}
              disabled={!isEditable}
              rows={6}
              onChange={(argumentsText) => updateNode(selectedNode.id, { arguments: argumentsText })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'condition') {
      return (
        <>
          <FieldRow label="expression" hint="P0 supports restricted comparisons: equals, not equals, contains, exists, and truthiness.">
            <WorkflowTemplateTextarea
              value={selectedNode.expression || ''}
              variables={availableVariables}
              disabled={!isEditable}
              rows={4}
              onChange={(expression) => updateNode(selectedNode.id, { expression })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'output') {
      const outputMode = selectedNode.output_mode || (selectedNode.output_mapping ? 'json_object' : 'text');
      const outputEntries = workflowOutputMappingEntries(selectedNode);
      const updateOutputEntries = (entries) => updateNode(selectedNode.id, buildWorkflowOutputPatch(entries));
      return (
        <>
          <FieldRow label="response type">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={outputMode}
              options={[
                { id: 'text', label: 'Text' },
                { id: 'json_object', label: 'Structured JSON' },
              ]}
              onChange={(mode) => {
                if (mode === 'json_object') {
                  updateNode(selectedNode.id, buildWorkflowOutputPatch(outputEntries));
                  return;
                }
                updateNode(selectedNode.id, {
                  output_mode: 'text',
                  output: selectedNode.output || outputEntries[0]?.value || '{{input.message}}',
                  output_mapping: undefined,
                });
              }}
              disabled={!isEditable}
            />
          </FieldRow>
          {outputMode === 'json_object' ? (
            <div className="workflow-json-editor">
              <div className="workflow-json-editor-head">
                <span>output</span>
                <small>object</small>
                {isEditable ? (
                  <button
                    type="button"
                    className="workflow-json-add"
                    onClick={() => updateOutputEntries([
                      ...outputEntries,
                      { key: `field_${outputEntries.length + 1}`, value: '', type: 'any' },
                    ])}
                  >
                    + field
                  </button>
                ) : null}
              </div>
              <div className="workflow-json-code is-editable" aria-label="output json">
                <div className="workflow-json-line">
                  <span className="workflow-json-punct">{'{'}</span>
                </div>
              {outputEntries.map((entry, index) => (
                <div className="workflow-json-edit-field" key={`${entry.key}:${index}`}>
                  <div className="workflow-json-edit-key">
                    <span className="workflow-json-indent" aria-hidden="true" />
                    <span className="workflow-json-key">"</span>
                    <input
                      className="workflow-json-key-input"
                      value={entry.key}
                      disabled={!isEditable}
                      placeholder="field name"
                      onChange={(event) => {
                        const key = event.target.value;
                        const next = outputEntries.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, key } : item
                        ));
                        updateOutputEntries(next);
                      }}
                    />
                    <span className="workflow-json-key">"</span>
                    <span className="workflow-json-punct">:</span>
                  </div>
                  <div className="workflow-json-edit-value">
                    <WorkflowVariableSelect
                      value={entry.value}
                      variables={availableVariables}
                      disabled={!isEditable}
                      onChange={(value) => {
                        const nextType = workflowVariableTypeForValue(value, availableVariables);
                        const next = outputEntries.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, value, type: nextType } : item
                        ));
                        updateOutputEntries(next);
                      }}
                    />
                  </div>
                  <div className="workflow-json-edit-actions">
                    {isEditable ? (
                      <button
                        type="button"
                        className="workflow-json-delete"
                        aria-label={`delete ${entry.key || 'field'}`}
                        onClick={() => updateOutputEntries(outputEntries.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        ×
                      </button>
                    ) : null}
                    {index < outputEntries.length - 1 ? <span className="workflow-json-punct">,</span> : null}
                  </div>
                </div>
              ))}
                <div className="workflow-json-line">
                  <span className="workflow-json-punct">{'}'}</span>
                </div>
              </div>
            </div>
          ) : (
            <FieldRow label="final text">
              <WorkflowTemplateTextarea
                value={selectedNode.output || '{{input.message}}'}
                variables={availableVariables}
                disabled={!isEditable}
                rows={6}
                onChange={(output) => updateNode(selectedNode.id, { output_mode: 'text', output })}
              />
            </FieldRow>
          )}
        </>
      );
    }
    return null;
  };

  return (
    <div className="settings-editor-form settings-workflow-form">
      <div className="workflow-builder">
        <div className="workflow-toolbar">
          <div>
            <strong>Canvas</strong>
            <span>{workflow.custom ? 'Custom workflow' : 'System preset'}</span>
          </div>
          {isEditable ? (
            <div className="workflow-toolbar-actions">
              <button type="button" className="settings-row-button" onClick={loadExampleWorkflow}>
                Load example
              </button>
              {typeOptions.map((type) => (
                <button type="button" className="settings-row-button" key={type.id} onClick={() => addNode(type.id)}>
                  <SettingsLucideIcon name="plus" />
                  {type.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="workflow-canvas">
                  {ReactFlowCanvas ? (
            <ReactFlowCanvas
              nodes={reactNodes}
              edges={reactEdges}
              nodeTypes={WORKFLOW_REACT_FLOW_NODE_TYPES}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId('');
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId('');
              }}
              onPaneClick={() => {
                setSelectedNodeId('');
                setSelectedEdgeId('');
              }}
              onNodesChange={onReactFlowNodesChange}
              onEdgesChange={onReactFlowEdgesChange}
              onConnect={onReactFlowConnect}
              onNodeDragStop={onReactFlowNodeDragStop}
              nodesDraggable={isEditable}
              nodesConnectable={isEditable}
              edgesFocusable={isEditable}
              elementsSelectable
              deleteKeyCode={isEditable ? ['Backspace', 'Delete'] : null}
              connectionRadius={46}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              snapToGrid
              snapGrid={[20, 20]}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              proOptions={{ hideAttribution: true }}
            >
              {Background ? <Background gap={24} color="rgba(176, 206, 255, 0.08)" /> : null}
              {Controls ? <Controls showInteractive={false} /> : null}
            </ReactFlowCanvas>
          ) : (
            <div className="settings-empty">React Flow failed to load.</div>
          )}
        </div>
      </div>
      <div className="workflow-node-panel">
        <div className="workflow-node-panel-head">
          <div>
            <span>{selectedEdge ? 'Connection' : 'Node'}</span>
            <strong>{selectedEdge ? `${selectedEdge.from} -> ${selectedEdge.to}` : (selectedNode?.label || selectedNode?.id || 'None')}</strong>
          </div>
          {isEditable && selectedNode && !['start', 'output'].includes(selectedNode.type) ? (
            <button type="button" className="settings-row-button danger" onClick={() => deleteNode(selectedNode.id)}>Delete</button>
          ) : null}
          {isEditable && selectedEdge ? (
            <button type="button" className="settings-row-button danger" onClick={deleteSelection}>Delete</button>
          ) : null}
        </div>
        {selectedEdge ? (
          <div className="workflow-node-help">
            Connection: {selectedEdge.from}{' -> '}{selectedEdge.to}
          </div>
        ) : selectedNode ? (
          <>
            <FieldRow label="label">
              <input value={selectedNode.label || ''} onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })} disabled={!isEditable || ['start', 'output'].includes(selectedNode.type)} />
            </FieldRow>
            {renderNodeFields()}
          </>
        ) : (
          <div className="settings-empty">Select a node.</div>
        )}
      </div>
    </div>
  );
}

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
                        <PortalTooltip text={item.enabled === false ? 'Disabled' : 'Active'} position="above">
                          <span
                            className={`settings-active-badge ${item.enabled === false ? 'disabled' : ''}`}
                            aria-label={item.enabled === false ? 'Disabled' : 'Active'}
                          >
                            <SettingsLucideIcon
                              name={item.enabled === false ? 'close' : 'active'}
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
                      value={panelWorkflow.display_name || ''}
                      onChange={(event) => updatePanelWorkflow({ display_name: event.target.value })}
                      placeholder="Workflow name"
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
              {panelSelectedId ? (
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

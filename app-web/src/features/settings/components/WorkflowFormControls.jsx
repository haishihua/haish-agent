import React from 'react';
import {
  workflowOutputFields,
  workflowParameterEntries,
  workflowTemplateVariablePath,
  sanitizeWorkflowTemplateValue,
  workflowTokenRangeAt,
  workflowVariableTypeForValue,
} from '../../workflow/model/workflow-catalog.js';
import { WorkflowDetailFields, workflowDetailFieldIcon } from './WorkflowNodeDetails.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import {
  SettingsMenuSelect,
} from './settings-ui.jsx';

const { useRef } = React;

function WorkflowVariablePicker({ variables, onInsert, disabled = false, hint = '' }) {
  if (disabled || !variables?.length) return null;
  const options = variables.map((item) => ({
    id: item.path,
    label: item.label || item.path,
  }));
  const tip = String(hint || '').trim();
  const labelNode = tip ? (
    <PortalTooltip text={tip} position="above" multiline>
      <span className="settings-field-label has-hint" tabIndex={0}>use data from</span>
    </PortalTooltip>
  ) : (
    <span>use data from</span>
  );
  return (
    <div className="settings-field workflow-variable-panel">
      {labelNode}
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
    ...(!hasSelected && selectedPath ? [{ id: selectedPath, label: selectedPath }] : []),
    ...variables.map((item) => ({
      id: item.path,
      label: item.label || item.path,
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
  variableHint = '',
  title = '',
  hint = '',
  embedded = false,
  unframed = false,
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
  const panelTitle = String(title || '').trim();
  const panelHint = String(hint || '').trim();
  const titleNode = panelTitle
    ? (
        panelHint ? (
          <PortalTooltip text={panelHint} position="above" multiline>
            <strong className="settings-field-label has-hint" tabIndex={0}>{panelTitle}</strong>
          </PortalTooltip>
        ) : (
          <strong>{panelTitle}</strong>
        )
      )
    : null;
  const body = (
    <>
      <textarea
        ref={textareaRef}
        aria-label={title || undefined}
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
          hint={variableHint}
        />
      ) : null}
    </>
  );
  if (unframed) return <div className="workflow-input-panel-body workflow-template-unframed">{body}</div>;
  if (!panelTitle) return body;
  return (
    <div className={`workflow-io-panel workflow-input-panel${embedded ? ' is-embedded' : ''}`}>
      <div className="workflow-io-panel-head">
        <div className="workflow-io-panel-copy">
          {titleNode}
        </div>
      </div>
      <div className="workflow-input-panel-body">
        {body}
      </div>
    </div>
  );
}

function nextParameterName(rows) {
  let index = rows.length + 1;
  while (rows.some((row) => row.name === `arg${index}`)) index += 1;
  return `arg${index}`;
}

function sanitizeParameterName(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^[0-9]+/, '');
}

export function WorkflowParameterEditor({
  parameters,
  variables,
  onChange,
  disabled = false,
  children = null,
}) {
  const rows = workflowParameterEntries(parameters);
  const updateRow = (id, patch) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <div className="workflow-parameter-panel workflow-agent-inputs">
      <div className="workflow-parameter-head">
        <div>
          <PortalTooltip text="Give upstream data short names for this node." position="above" multiline>
            <strong className="settings-field-label has-hint" tabIndex={0}>
              <AppIcon name="layers" size={17} />Inputs
            </strong>
          </PortalTooltip>
        </div>
        {!disabled ? (
          <button
            type="button"
            className="workflow-parameter-add"
            onClick={() => onChange([
              ...rows,
              {
                id: `parameter_${Date.now()}_${rows.length}`,
                name: nextParameterName(rows),
                value: '',
              },
            ])}
          >
            <AppIcon name="plus" size={14} />Add Input
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <div className="workflow-parameter-list">
          {rows.map((row) => (
            <div className="workflow-parameter-row" key={row.id}>
              <span className="workflow-agent-row-icon"><AppIcon name={workflowDetailFieldIcon({ type: workflowVariableTypeForValue(row.value, variables) })} size={18} /></span>
              <div className="workflow-detail-field-heading workflow-parameter-heading">
              <input
                className="workflow-parameter-name"
                value={row.name}
                disabled={disabled}
                aria-label="Parameter name"
                placeholder="arg1"
                style={{ width: `${Math.max(4, row.name.length + 1)}ch` }}
                onChange={(event) => updateRow(row.id, {
                  name: sanitizeParameterName(event.target.value),
                })}
              />
              <span className={`workflow-io-type is-${workflowVariableTypeForValue(row.value, variables)}`}>
                {workflowVariableTypeForValue(row.value, variables)}
              </span>
              </div>
              <WorkflowVariableSelect
                value={row.value}
                variables={variables}
                disabled={disabled}
                onChange={(value) => updateRow(row.id, { value })}
              />
              {!disabled ? (
                <button
                  type="button"
                  className="workflow-parameter-delete"
                  aria-label={`Delete parameter ${row.name || ''}`.trim()}
                  onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
                >
                  <AppIcon name="delete" size={14} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function WorkflowSchemaList({ title, fields }) {
  return <WorkflowDetailFields title={title || 'Inputs'} fields={fields} />;
}

export function WorkflowOutputContract({ node }) {
  const fields = workflowOutputFields(node).map((field) => ({
    ...field,
    path: `nodes.${node.id}.${field.id}`,
  }));
  if (!fields.length) return null;

  return <WorkflowDetailFields title="Outputs" icon="git-branch" fields={fields} className="workflow-agent-outputs" />;
}

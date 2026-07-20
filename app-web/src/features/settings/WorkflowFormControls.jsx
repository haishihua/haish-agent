// @haish-esm
import React from 'react';
import {
  workflowOutputFields,
  workflowSchemaFields,
  WORKFLOW_OUTPUT_FIELD_OPTIONS,
  workflowTemplateVariablePath,
  sanitizeWorkflowTemplateValue,
  workflowTokenRangeAt,
} from '../../lib/workflow-catalog.js';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import {
  FieldRow,
  SettingsLucideIcon,
  SettingsMenuSelect,
} from './settings-ui.jsx';

const { useState, useRef, useEffect } = React;

export function WorkflowVariablePicker({ variables, onInsert, disabled = false, hint = '' }) {
  if (!variables.length) return null;
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
  if (!panelTitle) return body;
  return (
    <div className="workflow-io-panel workflow-input-panel">
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

const WORKFLOW_OUTPUT_GROUP_META = {
  result: {
    id: 'result',
    label: 'Result',
    hint: 'Main values to pass into later nodes.',
  },
  status: {
    id: 'status',
    label: 'Status',
    hint: 'Whether the node finished and why.',
  },
  debug: {
    id: 'debug',
    label: 'Debug',
    hint: 'Extra details for inspection and troubleshooting.',
  },
};

const WORKFLOW_OUTPUT_GROUP_ORDER = ['result', 'status', 'debug'];

function workflowOutputGroupId(field) {
  const group = String(field?.group || '').trim().toLowerCase();
  if (WORKFLOW_OUTPUT_GROUP_META[group]) return group;
  const id = String(field?.id || '').trim().toLowerCase();
  if (['status', 'success', 'error', 'finish_reason'].includes(id)) return 'status';
  if (['metadata', 'trace', 'usage', 'raw'].includes(id)) return 'debug';
  return 'result';
}

function workflowFieldTypeLabel(type) {
  const value = String(type || 'any').trim().toLowerCase();
  if (value === 'boolean') return 'bool';
  if (value === 'object') return 'object';
  if (value === 'array') return 'array';
  if (value === 'string') return 'string';
  if (value === 'number') return 'number';
  return value || 'any';
}

function WorkflowIoFieldLabel({ label, description = '' }) {
  const text = String(label || '').trim() || 'Field';
  const tip = String(description || '').trim();
  const labelNode = (
    <span className="workflow-io-item-label" tabIndex={tip ? 0 : undefined}>
      {text}
    </span>
  );
  if (!tip) return labelNode;
  return (
    <PortalTooltip text={tip} position="above" multiline>
      {labelNode}
    </PortalTooltip>
  );
}

export function WorkflowSchemaList({ title, fields }) {
  if (!fields.length) return null;
  const caption = String(title || 'Fields');
  return (
    <div className="workflow-io-panel">
      <div className="workflow-io-panel-head">
        <div className="workflow-io-panel-copy">
          <strong>{caption}</strong>
        </div>
        <span className="workflow-io-count">{fields.length}</span>
      </div>
      <div className="workflow-io-list" aria-label={caption}>
        {fields.map((field, index) => {
          const key = field.id || field.key || field.label || field.path || `field_${index + 1}`;
          const label = field.label || key;
          const type = workflowFieldTypeLabel(field.type);
          const description = field.description || (field.required ? 'Required input.' : 'Optional input.');
          return (
            <div className="workflow-io-item" key={field.path || field.id || key}>
              <div className="workflow-io-item-top">
                <div className="workflow-io-item-title">
                  <WorkflowIoFieldLabel label={label} description={description} />
                  <span className={`workflow-io-type is-${type}`}>{type}</span>
                  {field.required ? <span className="workflow-io-required">required</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowOutputContract({ node }) {
  const fields = workflowOutputFields(node).map((field) => ({
    ...field,
    path: `nodes.${node.id}.${field.id}`,
    group: workflowOutputGroupId(field),
  }));
  if (!fields.length) return null;

  const groups = WORKFLOW_OUTPUT_GROUP_ORDER
    .map((groupId) => ({
      ...WORKFLOW_OUTPUT_GROUP_META[groupId],
      fields: fields.filter((field) => field.group === groupId),
    }))
    .filter((group) => group.fields.length);

  return (
    <div className="workflow-io-panel workflow-output-contract">
      <div className="workflow-io-panel-head">
        <div className="workflow-io-panel-copy">
          <strong>Output</strong>
        </div>
        <span className="workflow-io-count">{fields.length}</span>
      </div>
      <div className="workflow-output-groups">
        {groups.map((group) => (
          <section className="workflow-output-group" key={group.id} data-group={group.id}>
            <div className="workflow-output-group-head">
              <span>{group.label}</span>
            </div>
            <div className="workflow-io-list">
              {group.fields.map((field) => {
                const type = workflowFieldTypeLabel(field.type);
                return (
                  <div className="workflow-io-item" key={field.path || field.id}>
                    <div className="workflow-io-item-top">
                      <div className="workflow-io-item-title">
                        <WorkflowIoFieldLabel
                          label={field.label || field.id}
                          description={field.description || ''}
                        />
                        <span className={`workflow-io-type is-${type}`}>{type}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}



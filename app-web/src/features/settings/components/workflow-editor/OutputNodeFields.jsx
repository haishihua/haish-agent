import React from 'react';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';
import {
  buildWorkflowOutputPatch,
  workflowOutputMappingEntries,
  workflowVariableTypeForValue,
} from '../../../workflow/model/workflow-catalog.js';
import { SettingsMenuSelect } from '../settings-ui.jsx';
import { WorkflowDetailSection, WorkflowDetailSelect } from '../WorkflowNodeDetails.jsx';
import { WorkflowTemplateTextarea, WorkflowVariableSelect } from '../WorkflowFormControls.jsx';

// output 节点的属性面板：文本 / 结构化 JSON 两种回包形态，映射表按行编辑。
export function OutputNodeFields({ selectedNode, availableVariables, isEditable, updateNode }) {
  const outputMode = selectedNode.output_mode || (selectedNode.output_mapping ? 'json_object' : 'text');
  const outputEntries = workflowOutputMappingEntries(selectedNode);
  const updateOutputEntries = (entries) => updateNode(selectedNode.id, buildWorkflowOutputPatch(entries));
  return (
    <>
        <WorkflowDetailSelect label="Response type" icon="format"
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
      {outputMode === 'json_object' ? (
        <WorkflowDetailSection key={selectedNode.id} title="Outputs" icon="git-branch" collapsible
          className="workflow-output-mapping workflow-detail-mapping"
          action={isEditable ? (
              <button
                type="button"
                className="workflow-json-add"
                onClick={() => updateOutputEntries([
                  ...outputEntries,
                  { key: `field_${outputEntries.length + 1}`, value: '', type: 'string' },
                ])}
              >
                <AppIcon name="plus" size={14} />Add Field
              </button>
            ) : null}>
          <div className="workflow-output-mapping-table" aria-label="output">
            <div className="workflow-output-mapping-row is-header">
              <span>Name</span>
              <span>Type</span>
              <span>Value</span>
              <span className="workflow-output-mapping-action-col" aria-hidden="true" />
            </div>
            {outputEntries.map((entry, index) => (
              <div className="workflow-output-mapping-row" key={index}>
                <input
                  className="workflow-output-mapping-name"
                  aria-label="Output field name"
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
                <SettingsMenuSelect
                  className="workflow-menu-select workflow-output-mapping-type"
                  value={entry.type || 'any'}
                  options={[
                    { id: 'string', label: 'string' },
                    { id: 'number', label: 'number' },
                    { id: 'boolean', label: 'boolean' },
                    { id: 'object', label: 'object' },
                    { id: 'array', label: 'array' },
                    { id: 'any', label: 'any' },
                  ]}
                  disabled={!isEditable}
                  onChange={(type) => {
                    const next = outputEntries.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, type } : item
                    ));
                    updateOutputEntries(next);
                  }}
                />
                <div className="workflow-output-mapping-value">
                  <WorkflowVariableSelect
                    value={entry.value}
                    variables={availableVariables}
                    disabled={!isEditable}
                    onChange={(value) => {
                      const nextType = workflowVariableTypeForValue(value, availableVariables);
                      const next = outputEntries.map((item, itemIndex) => (
                        itemIndex === index
                          ? { ...item, value, type: nextType === 'any' ? (item.type || 'any') : nextType }
                          : item
                      ));
                      updateOutputEntries(next);
                    }}
                  />
                </div>
                {isEditable ? (
                  <button
                    type="button"
                    className="workflow-json-delete workflow-output-mapping-delete"
                    aria-label={`delete ${entry.key || 'field'}`}
                    onClick={() => updateOutputEntries(outputEntries.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <AppIcon name="delete" size={14} />
                  </button>
                ) : (
                  <span className="workflow-output-mapping-action-col" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </WorkflowDetailSection>
      ) : (
        <WorkflowDetailSection key={selectedNode.id} title="Outputs" icon="git-branch" collapsible>
          <WorkflowTemplateTextarea
            title="Final text"
            unframed
            value={selectedNode.output || '{{input.message}}'}
            variables={availableVariables}
            disabled={!isEditable}
            rows={6}
            onChange={(output) => updateNode(selectedNode.id, { output_mode: 'text', output })}
          />
        </WorkflowDetailSection>
      )}
    </>
  );
}

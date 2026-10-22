import React from 'react';
import { AppIcon } from '../../../../shared/ui/AppIcon.jsx';
import {
  reconcileWorkflowParameterTemplate,
  workflowArgumentsText,
  workflowParameterEntries,
  workflowSchemaFields,
  workflowTemplateWithParameterAliases,
} from '../../../workflow/model/workflow-catalog.js';
import { FieldRow, SettingsMenuSelect } from '../settings-ui.jsx';
import { WorkflowDetailSection, WorkflowDetailSelect } from '../WorkflowNodeDetails.jsx';
import {
  WorkflowOutputContract,
  WorkflowParameterEditor,
  WorkflowSchemaList,
  WorkflowTemplateTextarea,
} from '../WorkflowFormControls.jsx';
import { WorkflowAgentDetails } from '../WorkflowAgentDetails.jsx';
import { OutputNodeFields } from './OutputNodeFields.jsx';

// 节点属性面板的字段区：按节点类型分派，只有选中节点的字段会渲染。
export function NodeFields({ selectedNode, workflowInputSchema, agentOptions, toolOptions, availableVariables, isEditable, updateNode }) {
  const renderNodeFields = () => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'start') {
      return (
        <>
          <WorkflowSchemaList
            title="Inputs"
            fields={workflowSchemaFields(selectedNode.input_schema || workflowInputSchema)}
          />
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    const parameterEntries = workflowParameterEntries(selectedNode.parameters);
    const renderInputParameters = (templateKey, templateValue, children) => (
      <WorkflowParameterEditor
        key={selectedNode.id}
        parameters={parameterEntries}
        variables={availableVariables}
        disabled={!isEditable}
        onChange={(parameters) => updateNode(selectedNode.id, {
          parameters,
          [templateKey]: reconcileWorkflowParameterTemplate(
            templateValue,
            parameterEntries,
            parameters,
          ),
        })}
      >
        {children}
      </WorkflowParameterEditor>
    );
    if (selectedNode.type === 'agent') {
      return <WorkflowAgentDetails key={selectedNode.id} node={selectedNode} agentOptions={agentOptions}
        variables={availableVariables} disabled={!isEditable}
        onChange={(patch) => updateNode(selectedNode.id, patch)} />;
    }
    if (selectedNode.type === 'llm') {
      const prompt = selectedNode.prompt || '{{input.message}}';
      return (
        <>
          {renderInputParameters('prompt', prompt, (
            <WorkflowTemplateTextarea
              title="Prompt"
              value={workflowTemplateWithParameterAliases(prompt, parameterEntries)}
              disabled={!isEditable}
              rows={6}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                prompt: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
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
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'tool') {
      const argumentsValue = selectedNode.arguments ?? { query: '{{input.message}}' };
      return (
        <>
          <FieldRow label="tool name">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.tool_name || ''}
              options={toolOptions}
              onChange={(tool_name) => updateNode(selectedNode.id, { tool_name })}
              disabled={!isEditable}
              placeholder="Select a tool"
              header="project tools"
            />
          </FieldRow>
          {renderInputParameters('arguments', argumentsValue, (
            <WorkflowTemplateTextarea
              title="Arguments JSON"
              hint="Objects and arrays render variables recursively."
              value={workflowArgumentsText(workflowTemplateWithParameterAliases(argumentsValue, parameterEntries))}
              disabled={!isEditable}
              rows={6}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                arguments: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'condition') {
      const expression = selectedNode.expression || '';
      return (
        <>
          <WorkflowDetailSection title="Condition" icon="workflow-condition" className="workflow-control-section">
            <div className="workflow-control-fields">
              <WorkflowTemplateTextarea
                title="Expression"
                hint="Supports equals, not equals, contains, exists, and truthiness."
                value={workflowTemplateWithParameterAliases(expression, parameterEntries)}
                variables={availableVariables}
                disabled={!isEditable}
                rows={3}
                compact
                placeholder="{{nodes.worker.success}} == true"
                onChange={(value) => updateNode(selectedNode.id, {
                  expression: workflowTemplateWithParameterAliases(value, parameterEntries),
                })}
              />
            </div>
          </WorkflowDetailSection>
          {parameterEntries.length ? renderInputParameters('expression', expression, null) : null}
        </>
      );
    }
    if (selectedNode.type === 'human_approval') {
      const approvalInput = selectedNode.input && typeof selectedNode.input === 'object' && !Array.isArray(selectedNode.input)
        ? selectedNode.input
        : {};
      return (
        <>
          <WorkflowDetailSection title="Approval request" icon="workflow-approval" className="workflow-control-section">
          <div className="workflow-control-fields">
          <div className="workflow-control-field">
            <label className="workflow-control-label" htmlFor={`workflow-approval-title-${selectedNode.id}`}>Approval title</label>
            <input
              id={`workflow-approval-title-${selectedNode.id}`}
              aria-label="Approval title"
              value={approvalInput.title || ''}
              disabled={!isEditable}
              placeholder={selectedNode.label || 'Approval required'}
              onChange={(event) => updateNode(selectedNode.id, {
                input: { ...approvalInput, title: event.target.value },
              })}
            />
          </div>
          <WorkflowTemplateTextarea
            title="Review content"
            hint="Content the user must approve or reject."
            value={approvalInput.summaryText || ''}
            variables={availableVariables}
            disabled={!isEditable}
            rows={4}
            compact
            placeholder="Select or describe the upstream result to review"
            onChange={(summaryText) => updateNode(selectedNode.id, {
              input: { ...approvalInput, summaryText },
            })}
          />
          </div>
          </WorkflowDetailSection>
        </>
      );
    }
    if (selectedNode.type === 'loop') {
      const unlimited = selectedNode.max_loops === null;
      return (
        <>
          <WorkflowDetailSection title="Retry policy" icon="workflow-loop">
          <div className="workflow-detail-fields workflow-retry-policy">
            <WorkflowDetailSelect label="Rerun limit" icon="retry"
              value={unlimited ? 'unlimited' : 'limited'}
              options={[
                { id: 'limited', label: 'Limited' },
                { id: 'unlimited', label: 'Unlimited' },
              ]}
              disabled={!isEditable}
              onChange={(value) => updateNode(selectedNode.id, {
                max_loops: value === 'unlimited' ? null : 3,
              })}
            />
          {!unlimited ? (
            <div className="workflow-detail-select settings-field">
              <label className="workflow-detail-select-label" htmlFor={`workflow-max-reruns-${selectedNode.id}`}>
                <AppIcon name="database" size={16} /><span className="workflow-detail-select-text">Maximum reruns</span>
              </label>
              <div className="workflow-detail-select-value">
              {!isEditable ? <span className="workflow-detail-select-static">{selectedNode.max_loops || 3}</span> : <input
                id={`workflow-max-reruns-${selectedNode.id}`}
                aria-describedby={`workflow-retry-hint-${selectedNode.id}`}
                type="number"
                min="1"
                step="1"
                value={selectedNode.max_loops || 3}
                disabled={!isEditable}
                onChange={(event) => updateNode(selectedNode.id, {
                  max_loops: Math.max(1, Number.parseInt(event.target.value || '1', 10)),
                })}
              />
              }
              </div>
            </div>
          ) : null}
          <p className="workflow-detail-hint" id={`workflow-retry-hint-${selectedNode.id}`}>
            {unlimited ? 'Retry until successful or stopped manually.' : 'When the limit is reached, follow Exhausted to End and fail the workflow.'}
          </p>
          </div>
          </WorkflowDetailSection>
        </>
      );
    }
    if (selectedNode.type === 'output') {
      return (
        <OutputNodeFields
          selectedNode={selectedNode}
          availableVariables={availableVariables}
          isEditable={isEditable}
          updateNode={updateNode}
        />
      );
    }
    return null;
  };
  return <>{renderNodeFields()}</>;
}

import React from 'react';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { WorkflowDetailSelect } from './WorkflowNodeDetails.jsx';
import { WorkflowParameterEditor, WorkflowTemplateTextarea, WorkflowOutputContract } from './WorkflowFormControls.jsx';
import {
  workflowParameterEntries,
  workflowTemplateWithParameterAliases,
  reconcileWorkflowParameterTemplate,
} from '../../workflow/model/workflow-catalog.js';
import './workflow-agent-details.css';

export function WorkflowAgentDetails({ node, agentOptions, variables, disabled, onChange }) {
  const parameters = workflowParameterEntries(node.parameters);
  const input = node.input ?? node.input_mapping?.message ?? '{{input.message}}';
  const prompt = node.prompt || '';
  const lineNumbers = React.useRef(null);
  return (
    <>
      <div className="workflow-agent-selector">
          <WorkflowDetailSelect label="Agent" icon="bot"
            value={node.agent_id || agentOptions[0]?.id || 'preset.general'}
            options={agentOptions.map((item) => ({ id: item.id, label: item.label }))}
            onChange={(agent_id) => onChange({ agent_id })}
            disabled={disabled}
          />
      </div>
      {!disabled || prompt.trim() ? <section className="workflow-agent-section workflow-agent-prompt" aria-label="Prompt">
        <div className="workflow-agent-section-head">
          <AppIcon name="code-2" size={17} />
          <strong>Prompt</strong>
          <PortalTooltip text="Static instructions only. Put dynamic variables in Inputs to keep the agent prefix cacheable." position="above" multiline>
            <span className="workflow-agent-prompt-hint" tabIndex={0} aria-label="Prompt guidance">?</span>
          </PortalTooltip>
          <span className="workflow-agent-section-meta">{disabled ? 'Read only' : 'Instructions'}</span>
        </div>
        <div className="workflow-agent-code">
          <div className="workflow-agent-line-numbers" ref={lineNumbers} aria-hidden="true">
            {Array.from({ length: prompt.split('\n').length }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea aria-label="Agent prompt" value={prompt} disabled={disabled} rows={5} wrap="off"
            spellCheck={false} placeholder="Stable instructions for this agent node"
            onScroll={(event) => { if (lineNumbers.current) lineNumbers.current.scrollTop = event.currentTarget.scrollTop; }}
            onChange={(event) => onChange({ prompt: event.target.value })} />
        </div>
      </section> : null}
      <WorkflowParameterEditor parameters={parameters} variables={variables} disabled={disabled}
        onChange={(next) => onChange({
          parameters: next,
          input: reconcileWorkflowParameterTemplate(input, parameters, next),
        })}>
        <WorkflowTemplateTextarea title="Message" hint="Dynamic message sent after the cached agent instructions."
          value={workflowTemplateWithParameterAliases(input, parameters)} disabled={disabled} rows={3}
          showVariables={false} embedded
          onChange={(value) => onChange({ input: workflowTemplateWithParameterAliases(value, parameters) })} />
      </WorkflowParameterEditor>
      <WorkflowOutputContract node={node} />
    </>
  );
}

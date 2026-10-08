import React from 'react';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { workflowNodeMeta } from '../../workflow/components/WorkflowFlowNode.jsx';
import { SettingsMenuSelect } from './settings-ui.jsx';
import './workflow-agent-details.css';

const NODE_DETAILS = {
  start: ['Start', 'Receive the workflow input and start execution.'],
  output: ['End', 'Return the final response from upstream results.'],
  agent: ['Agent', 'Run an agent with instructions and upstream data.'],
  llm: ['LLM', 'Generate a model response from a prompt and upstream data.'],
  tool: ['Tool', 'Call a tool with mapped arguments.'],
  condition: ['Condition', 'Evaluate a condition and choose the next branch.'],
  human_approval: ['Approval', 'Request a human decision before continuing.'],
  loop: ['Loop', 'Retry the workflow until it succeeds or reaches the rerun limit.'],
};

// The existing detail CSS classes are shared by every node; canvas cards are unaffected.
export function WorkflowNodeHeading({ node, agentOptions = [] }) {
  const [type, fallback] = NODE_DETAILS[node.type] || ['Node', 'Configure this workflow node.'];
  const agent = node.type === 'agent' ? agentOptions.find((item) => item.id === node.agent_id) : null;
  return (
    <div className="workflow-agent-heading" data-node-type={node.type}>
      <span className="workflow-agent-avatar"><AppIcon name={node.type === 'agent' ? 'sparkles' : workflowNodeMeta(node.type).icon} size={26} /></span>
      <div className="workflow-agent-heading-copy">
        <div className="workflow-agent-heading-title">
          <strong>{node.label || node.id}</strong>
          <span className="workflow-agent-badge">{type}</span>
        </div>
        <p>{node.description || agent?.description || fallback}</p>
      </div>
    </div>
  );
}

export function WorkflowDetailSelect({ label, icon, value, options, disabled, onChange }) {
  const selected = options.find((item) => item.id === value);
  const labelId = React.useId();
  return (
    <div className={`workflow-detail-select settings-field${disabled ? ' is-readonly' : ''}`}>
      <span className="workflow-detail-select-label" id={labelId}><AppIcon name={icon} size={16} /><span className="workflow-detail-select-text">{label}</span></span>
      <div className="workflow-detail-select-value" role="group" aria-labelledby={labelId}>
        {disabled ? <span className="workflow-detail-select-static">{selected?.label || value || 'Not set'}</span>
          : <SettingsMenuSelect className="workflow-menu-select" value={value} options={options} onChange={onChange} />}
      </div>
    </div>
  );
}

export function WorkflowDetailSection({ title, icon = 'layers', meta, action, children, className = '', collapsible = false, defaultExpanded = true, expanded, onExpandedChange }) {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
  const bodyId = React.useId();
  const isExpanded = expanded ?? localExpanded;
  const heading = <>
    <AppIcon name={icon} size={17} /><strong>{title}</strong>
    {meta ? <span className={`workflow-agent-section-meta${meta === 'Read only' ? ' workflow-detail-readonly-badge' : ''}`}>{meta}</span> : null}
    {collapsible ? <svg className="workflow-section-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
  </>;
  return (
    <section className={`workflow-agent-section workflow-detail-section ${collapsible ? 'workflow-collapsible-section' : ''} ${className}`.trim()} aria-label={title} data-expanded={collapsible ? isExpanded : undefined}>
      <div className="workflow-agent-section-head">
        {collapsible ? <button type="button" className="workflow-section-toggle" aria-label={title} aria-expanded={isExpanded} aria-controls={bodyId}
          onClick={() => { setLocalExpanded(!isExpanded); onExpandedChange?.(!isExpanded); }}>{heading}</button> : heading}
        {action ? <div className="workflow-section-action" onClick={() => { if (collapsible) { setLocalExpanded(true); onExpandedChange?.(true); } }}>{action}</div> : null}
      </div>
      {collapsible ? <div id={bodyId} className="workflow-section-body" hidden={!isExpanded}>{children}</div> : children}
    </section>
  );
}

export function workflowDetailFieldIcon(field) {
  const icons = {
    status: 'clock', success: 'circle-check', summary: 'format', error: 'circle-x',
    metadata: 'configure', message: 'message', messages: 'message', artifacts: 'folder-plus',
    structured: 'code-2', citations: 'book-open', trace: 'workflow', usage: 'database',
    finish_reason: 'ban', verdict: 'git-branch', iteration: 'retry',
  };
  return icons[field.id || field.key] || ({
    string: 'format', boolean: 'toggle-right', bool: 'toggle-right',
    object: 'code-2', array: 'layers', number: 'database',
  }[field.type]) || 'nodes';
}

export function WorkflowDetailFields({ title, fields, icon = 'layers', className = '' }) {
  if (!fields.length) return null;
  return (
    <WorkflowDetailSection title={title} icon={icon} meta="Read only" className={className} collapsible defaultExpanded={title !== 'Outputs'}>
      <div className="workflow-agent-output-list">
        {fields.map((field, index) => {
          const type = field.type === 'boolean' ? 'bool' : field.type || 'any';
          return (
            <div className="workflow-agent-output-row" key={field.path || field.id || field.key || index}>
              <span className="workflow-agent-row-icon"><AppIcon name={workflowDetailFieldIcon(field)} size={18} /></span>
              <div className="workflow-agent-output-copy">
                <div className="workflow-detail-field-heading">
                  <strong>{field.label || field.id || field.key || 'Field'}</strong>
                  <span className={`workflow-io-type is-${type}`}>{type}</span>
                  {field.required ? <span className="workflow-io-required">required</span> : null}
                </div>
                {field.description ? <span>{field.description}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </WorkflowDetailSection>
  );
}

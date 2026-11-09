import React from 'react';
import { useProviderModels } from '../../chat/hooks/useRunConfig.js';
import { normalizeReasoningEffort } from '../../../core/run-catalog.js';
import { nodeReasoningOptions } from '../model/node-reasoning-options.js';
import { runtimeProviderDisplay } from '../model/runtime-provider-display.js';
import { providerAuthBadge } from '../../../core/provider-catalog.js';
import { ProviderAuthBadge } from '../../../shared/ui/ProviderAuthBadge.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ProviderIcon } from '../../../shared/ui/ProviderIcon.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';
import { nodeConfigHasRouteOverride } from '../model/node-runtime-config.js';

// Empty values are placeholders, not selectable fallback options.
function ConfigSelect({ label, value, options, disabled, onChange }) {
  const id = React.useId();
  const selected = options.items.find((item) => item.id === value);
  return <div className="workflow-runtime-field">
    <label htmlFor={id}>{label}</label>
    <Select value={value ? `value:${value}` : ''} disabled={disabled} onValueChange={(next) => onChange(next.slice(6))}>
      <SelectTrigger id={id} aria-label={options.ariaLabel} aria-description={selected?.badge ? `Authentication: ${selected.badge}` : undefined} className="workflow-runtime-select"><SelectValue placeholder={options.placeholder}>{selected ? <>{selected.provider ? <ProviderIcon provider={selected.provider} /> : null}<span>{selected.label || selected.id}</span><ProviderAuthBadge label={selected.badge} /></> : null}</SelectValue></SelectTrigger>
      <SelectContent container={document.body} position="popper" align="start" sideOffset={4} collisionPadding={12} className="workflow-runtime-select-menu">
        {options.items.map((item) => <SelectItem key={item.id} disabled={item.disabled} value={`value:${item.id}`} data-value={`value:${item.id}`} className="workflow-runtime-select-option" textValue={`${item.label || item.id}${item.badge ? ` ${item.badge}` : ''}`}>
          {item.provider ? <ProviderIcon provider={item.provider} /> : null}<span>{item.label || item.id}</span><ProviderAuthBadge label={item.badge} />
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export function WorkflowRuntimeConfig({ value = {}, providerOptions = [], agentOptions = [], readOnly = false, onChange }) {
  // One route id feeds every picker: the saved llm_config_id wins over the legacy provider field.
  const routeId = value.llm_config_id || value.provider || '';
  const agentOnly = value.agent_id ? { agent_id: value.agent_id } : {};
  const display = runtimeProviderDisplay(routeId, providerOptions, readOnly);
  const provider = display.selected;
  const models = useProviderModels(provider);
  const efforts = nodeReasoningOptions(value.model_id || provider?.defaultModelId || '');
  const effort = normalizeReasoningEffort(value.reasoning_effort, provider?.defaultReasoningEffort);
  const selectedAgentId = value.agent_id || 'preset.general';
  // The catalog only carries { id, label }: an id it does not know is shown as unavailable
  // instead of being silently replaced by the default agent.
  const agentItems = [
    ...(agentOptions.some((item) => item.id === selectedAgentId) ? [] : [{ id: selectedAgentId, label: 'Unavailable Agent', disabled: true }]),
    ...agentOptions.map((item) => ({ id: item.id, label: item.label || item.id })),
  ];
  const patch = (next) => onChange?.({ ...value, reasoning_effort: effort, ...next });
  // Clearing drops the model route but keeps the selected Agent identity.
  const clearable = nodeConfigHasRouteOverride(value);
  const clearRoute = () => onChange?.(agentOnly);
  return (
    <section className="workflow-runtime-config" aria-label="Model Configuration">
      <div className="workflow-runtime-config-heading">
        <span className="workflow-runtime-config-icon" aria-hidden="true"><AppIcon name="settings" size={18} /></span>
        <div><h3>Model Configuration</h3><p>Configure the model used by this agent</p></div>
        {readOnly ? <small className="workflow-runtime-readonly">Read only</small> : clearable ? <button type="button" className="workflow-runtime-clear" aria-label="Clear node configuration" title="Clear node configuration" onClick={clearRoute}><AppIcon name="close" size={13} /></button> : null}
      </div>
      <ConfigSelect label="Agent" value={selectedAgentId} disabled={readOnly} onChange={(agent_id) => onChange?.({ ...value, agent_id })}
        options={{ ariaLabel: 'Node agent', placeholder: 'Select agent', items: agentItems }} />
      <ConfigSelect label="Model Provider" value={routeId} disabled={readOnly} onChange={(next) => {
        const selected = providerOptions.find((item) => item.id === next);
        onChange?.(selected ? { ...agentOnly, llm_config_id: next, model_id: selected.defaultModelId || '', reasoning_effort: normalizeReasoningEffort(selected.defaultReasoningEffort) } : agentOnly);
      }} options={{ ariaLabel: 'Node provider', placeholder: 'Select provider', items: [
        ...((routeId && !provider) ? [{ id: routeId, label: display.label, provider: display.provider }] : []),
        ...providerOptions.map((item) => ({ id: item.id, label: item.label || item.id, provider: item.provider || 'custom', badge: providerAuthBadge(item.provider, item.authMode) })),
      ] }} />
      <ConfigSelect label="Model" value={value.model_id || ''} disabled={readOnly || !provider} onChange={(next) => patch({ model_id: next })} options={{ ariaLabel: 'Node model', placeholder: 'Select model', items: [
        ...(value.model_id && !models.options.some((item) => item.id === value.model_id) ? [{ id: value.model_id, label: value.model_id, provider: routeId ? display.provider : null }] : []),
        ...models.options.map((item) => ({ id: item.id, label: item.label || item.id, provider: display.provider })),
      ] }} />
      {/* Model catalog refresh failures stay off this dock for the same reason as the picker:
          the last known list stays selectable instead of turning discovery into an error banner. */}
      <ConfigSelect label="Reasoning effort" value={effort} disabled={readOnly} onChange={(next) => patch({ reasoning_effort: next })} options={{ ariaLabel: 'Node thinking level', placeholder: 'Select thinking level', items: efforts }} />
    </section>
  );
}

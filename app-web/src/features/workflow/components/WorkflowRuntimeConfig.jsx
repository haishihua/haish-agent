import React from 'react';
import { useProviderModels } from '../../chat/hooks/useRunConfig.js';
import { nodeReasoningOptions } from '../model/node-reasoning-options.js';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ProviderIcon } from '../../settings/components/settings-ui.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';

// Empty values are placeholders, not selectable fallback options.
function ConfigSelect({ label, value, options, disabled, onChange }) {
  const id = React.useId();
  return <div className="workflow-runtime-field">
    <label htmlFor={id}>{label}</label>
    <Select value={value ? `value:${value}` : ''} disabled={disabled} onValueChange={(next) => onChange(next.slice(6))}>
      <SelectTrigger id={id} aria-label={options.ariaLabel} className="workflow-runtime-select"><SelectValue placeholder={options.placeholder} /></SelectTrigger>
      <SelectContent container={document.body} position="popper" align="start" sideOffset={4} collisionPadding={12} className="workflow-runtime-select-menu">
        {options.items.map((item) => <SelectItem key={item.id} value={`value:${item.id}`} data-value={`value:${item.id}`} className="workflow-runtime-select-option" textValue={item.label || item.id}>
          {item.provider ? <ProviderIcon provider={item.provider} /> : null}<span>{item.label || item.id}</span>
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export function WorkflowRuntimeConfig({ value = {}, providerOptions = [], readOnly = false, onChange }) {
  const provider = providerOptions.find((item) => (item.requestProvider || item.provider || item.id) === value.provider);
  const models = useProviderModels(provider);
  const efforts = nodeReasoningOptions(value.model_id || provider?.defaultModelId || '');
  const patch = (next) => onChange?.({ ...value, ...next });
  return (
    <section className="workflow-runtime-config" aria-label="Model Configuration">
      <div className="workflow-runtime-config-heading">
        <span className="workflow-runtime-config-icon" aria-hidden="true"><AppIcon name="settings" size={18} /></span>
        <div><h3>Model Configuration</h3><p>Configure the model used by this agent</p></div>
        {readOnly ? <small className="workflow-runtime-readonly">Read only</small> : Object.values(value).some(Boolean) ? <button type="button" className="workflow-runtime-clear" aria-label="Clear node configuration" title="Clear node configuration" onClick={() => onChange?.({})}><AppIcon name="close" size={13} /></button> : null}
      </div>
      <ConfigSelect label="Model Provider" value={value.provider || ''} disabled={readOnly} onChange={(next) => {
        const selected = providerOptions.find((item) => (item.requestProvider || item.provider || item.id) === next);
        onChange?.(selected ? { provider: next, model_id: selected.defaultModelId || '', ...(value.reasoning_effort ? { reasoning_effort: value.reasoning_effort } : {}) } : {});
      }} options={{ ariaLabel: 'Node provider', placeholder: 'Select provider', items: [
        ...(value.provider && !provider ? [{ id: value.provider, label: `Unavailable: ${value.provider}` }] : []),
        ...providerOptions.map((item) => ({ id: item.requestProvider || item.provider || item.id, label: item.label || item.id, provider: item.provider })),
      ] }} />
      <ConfigSelect label="Model" value={value.model_id || ''} disabled={readOnly || !provider || models.loading} onChange={(next) => patch({ model_id: next })} options={{ ariaLabel: 'Node model', placeholder: models.loading ? 'Loading models…' : 'Select model', items: [
        ...(value.model_id && !models.options.some((item) => item.id === value.model_id) ? [{ id: value.model_id, label: value.model_id }] : []),
        ...models.options.map((item) => ({ id: item.id, label: item.label || item.id })),
      ] }} />
      <ConfigSelect label="Reasoning effort" value={value.reasoning_effort || ''} disabled={readOnly} onChange={(next) => patch({ reasoning_effort: next })} options={{ ariaLabel: 'Node thinking level', placeholder: 'Select effort', items: [
        ...(value.reasoning_effort && !efforts.some((item) => item.id === value.reasoning_effort) ? [{ id: value.reasoning_effort, label: `Unsupported: ${value.reasoning_effort}` }] : []),
        ...efforts,
      ] }} />
    </section>
  );
}

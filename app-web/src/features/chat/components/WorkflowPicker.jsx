import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';

export function WorkflowPicker({ value, options, disabled, onChange }) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((item) => item.id === value);
  const hint = `Workflow · ${current?.label || current?.id || 'Select workflow'}`;
  return <div className="workflow-composer-selector">
    <Select open={open} onOpenChange={setOpen} value={`workflow:${value || ''}`} disabled={disabled || !options.length} onValueChange={(next) => onChange(next.slice(9))}>
      <PortalTooltip text={open ? '' : hint} position="above">
        <SelectTrigger aria-label="Workflow" aria-description={hint} className="workflow-picker-trigger">
          <svg className="workflow-picker-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path className="workflow-picker-glyph-link" d="M8 12h3a3 3 0 0 0 3-3V6h3M11 12a3 3 0 0 1 3 3v3h3" />
            <rect x="2" y="9" width="6" height="6" rx="2" />
            <rect x="17" y="3" width="5" height="6" rx="1.8" />
            <rect x="17" y="15" width="5" height="6" rx="1.8" />
          </svg>
        </SelectTrigger>
      </PortalTooltip>
      <SelectContent container={document.body} position="popper" side="top" align="start" sideOffset={6} collisionPadding={12} className="workflow-runtime-select-menu workflow-picker-menu">
        {options.map((item) => <SelectItem key={item.id} value={`workflow:${item.id}`} data-workflow-id={item.id} textValue={item.label || item.id} className="workflow-runtime-select-option">
          <span>{item.label || item.id}</span>
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

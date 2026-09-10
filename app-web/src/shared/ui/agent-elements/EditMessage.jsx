// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/edit-message.tsx
// Editing surface only: Haish retains its message bubble and toolbar trigger.
import React from 'react';
import './edit-message.css';

export function EditMessage({ value, onValueChange, onSave, onCancel, busy, disabled }) {
  const save = () => { if (value.trim() && !busy && !disabled) onSave(); };
  return <div data-slot="edit-message" className="aui-edit-message">
    <textarea value={value} rows={2} autoFocus aria-label="Edit your message" disabled={busy}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && !busy) onCancel();
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
      }} />
    <div className="aui-edit-actions">
      <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="aui-edit-send" onClick={save} disabled={busy || disabled || !value.trim()}>{busy ? 'Sending…' : 'Send'}</button>
    </div>
  </div>;
}

// @haish-esm
import React from 'react';
import {
  FieldRow,
  SettingsMenuSelect,
} from './settings-ui.jsx';

export function GenericConfigEditor({ section, selectedId, records, onRecordsChange, readOnly = false }) {
  const current = (records[section] || []).find((item) => item.id === selectedId) || null;
  if (!current) {
    return <div className="settings-empty">Select or add a configuration.</div>;
  }
  const update = (patch) => onRecordsChange((prev) => ({
    ...prev,
    [section]: (prev[section] || []).map((item) => (
      item.id === selectedId ? { ...item, ...patch } : item
    )),
  }));
  return (
    <div className="settings-editor-form">
      <FieldRow label="Name">
        <input value={current.name || ''} onChange={(event) => update({ name: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Type">
        <input value={current.kind || ''} onChange={(event) => update({ kind: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Endpoint">
        <input value={current.endpoint || ''} onChange={(event) => update({ endpoint: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Status">
        <SettingsMenuSelect
          value={current.enabled ? 'enabled' : 'disabled'}
          options={[
            { id: 'enabled', label: 'Enabled' },
            { id: 'disabled', label: 'Disabled' },
          ]}
          onChange={(value) => update({ enabled: value === 'enabled' })}
          disabled={readOnly}
        />
      </FieldRow>
      <FieldRow label="Notes">
        <textarea value={current.notes || ''} onChange={(event) => update({ notes: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}



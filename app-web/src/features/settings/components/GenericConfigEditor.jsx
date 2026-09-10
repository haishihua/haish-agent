import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { Textarea } from '../../../shared/ui/settings-elements/ui/textarea.tsx';
import { FieldRow, SettingsMenuSelect } from './SettingsPrimitives.jsx';

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
        <Input value={current.name || ''} onChange={(event) => update({ name: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Type">
        <Input value={current.kind || ''} onChange={(event) => update({ kind: event.target.value })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Endpoint">
        <Input value={current.endpoint || ''} onChange={(event) => update({ endpoint: event.target.value })} disabled={readOnly} />
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
        <Textarea value={current.notes || ''} onChange={(event) => update({ notes: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}



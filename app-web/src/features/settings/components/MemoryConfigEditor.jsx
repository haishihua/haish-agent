import { Input } from '../../../shared/ui/settings-elements/ui/input.tsx';
import { normalizeNeo4jDraft } from '../model/settings-records.js';
import { FieldRow, SecretKeyField, SettingsToggleRow } from './SettingsPrimitives.jsx';

export function MemoryConfigEditor({ selectedId, records, onRecordsChange, onDirty, readOnly = false }) {
  const current = (records.memory || []).find((item) => item.id === selectedId) || null;
  if (!current) return <div className="settings-empty">Select a memory configuration.</div>;
  const neo4j = normalizeNeo4jDraft({ ...current.neo4j, endpoint: current.endpoint });
  const update = ({ enabled, ...patch }) => {
    onDirty?.('memory', selectedId);
    onRecordsChange((prev) => ({
      ...prev,
      memory: (prev.memory || []).map((item) => {
        if (item.id !== selectedId) return item;
        // Only the draft fields feed the connection settings; `enabled` is a
        // record-level switch and must not be swallowed by the normalization.
        const nextNeo4j = normalizeNeo4jDraft({ ...neo4j, ...patch });
        return { ...item, enabled: enabled ?? item.enabled, endpoint: nextNeo4j.uri, neo4j: nextNeo4j };
      }),
    }));
  };
  return (
    <div className="settings-editor-form settings-tools-form">
      <SettingsToggleRow
        label="Enable memory"
        checked={current.enabled !== false}
        onCheckedChange={(enabled) => update({ enabled })}
        disabled={readOnly}
      />
      <FieldRow label="URI">
        <Input value={neo4j.uri} onChange={(event) => update({ uri: event.target.value })} disabled={readOnly} placeholder="Optional, e.g. bolt://localhost:7687" />
      </FieldRow>
      <FieldRow label="Username">
        <Input value={neo4j.username} onChange={(event) => update({ username: event.target.value })} disabled={readOnly} placeholder="neo4j" />
      </FieldRow>
      <FieldRow label="Password">
        <SecretKeyField
          value={neo4j.password}
          onChange={(event) => update({ password: event.target.value })}
          disabled={readOnly}
          configured={Boolean(neo4j.password_configured)}
          placeholder="Password"
        />
      </FieldRow>
      <FieldRow label="Database">
        <Input value={neo4j.database} onChange={(event) => update({ database: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}



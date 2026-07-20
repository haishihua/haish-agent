// @haish-esm
import React from 'react';
import { normalizeNeo4jDraft } from '../../lib/agent-catalog.js';
import { FieldRow, SecretKeyField } from './settings-ui.jsx';

export function MemoryConfigEditor({ selectedId, records, onRecordsChange, onDirty, readOnly = false }) {
  const current = (records.memory || []).find((item) => item.id === selectedId) || null;
  if (!current) return <div className="settings-empty">Select a memory configuration.</div>;
  const neo4j = normalizeNeo4jDraft({ ...current.neo4j, endpoint: current.endpoint });
  const update = (patch) => {
    onDirty?.('memory', selectedId);
    onRecordsChange((prev) => ({
      ...prev,
      memory: (prev.memory || []).map((item) => {
        if (item.id !== selectedId) return item;
        const nextNeo4j = normalizeNeo4jDraft({ ...neo4j, ...patch });
        return { ...item, endpoint: nextNeo4j.uri, neo4j: nextNeo4j };
      }),
    }));
  };
  return (
    <div className="settings-editor-form settings-tools-form">
      <FieldRow label="URI">
        <input value={neo4j.uri} onChange={(event) => update({ uri: event.target.value })} disabled={readOnly} placeholder="Optional, e.g. bolt://localhost:7687" />
      </FieldRow>
      <FieldRow label="Username">
        <input value={neo4j.username} onChange={(event) => update({ username: event.target.value })} disabled={readOnly} placeholder="neo4j" />
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
        <input value={neo4j.database} onChange={(event) => update({ database: event.target.value })} disabled={readOnly} />
      </FieldRow>
    </div>
  );
}



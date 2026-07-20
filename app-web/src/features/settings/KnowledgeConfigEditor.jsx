// @haish-esm
import React from 'react';
import {
  normalizeQdrantDraft,
  QDRANT_DISTANCE_OPTIONS,
} from '../../lib/agent-catalog.js';
import { FieldRow, SecretKeyField, SettingsMenuSelect } from './settings-ui.jsx';

export function KnowledgeConfigEditor({ selectedId, records, onRecordsChange, onDirty, readOnly = false }) {
  const current = (records.knowledge || []).find((item) => item.id === selectedId) || null;
  if (!current) return <div className="settings-empty">Select a knowledge configuration.</div>;
  const qdrant = normalizeQdrantDraft({ ...current.qdrant, endpoint: current.endpoint });
  const update = (patch) => {
    onDirty?.('knowledge', selectedId);
    onRecordsChange((prev) => ({
      ...prev,
      knowledge: (prev.knowledge || []).map((item) => {
        if (item.id !== selectedId) return item;
        const nextQdrant = normalizeQdrantDraft({
          ...qdrant,
          ...patch,
          collection: { ...qdrant.collection, ...(patch.collection || {}) },
        });
        return { ...item, endpoint: nextQdrant.url, qdrant: nextQdrant };
      }),
    }));
  };
  return (
    <div className="settings-editor-form settings-tools-form">
      <FieldRow label="URL">
        <input value={qdrant.url} onChange={(event) => update({ url: event.target.value })} disabled={readOnly} placeholder="Optional, e.g. http://localhost:6333" />
      </FieldRow>
      <FieldRow label="API Key">
        <SecretKeyField
          value={qdrant.api_key}
          onChange={(event) => update({ api_key: event.target.value })}
          disabled={readOnly}
          configured={Boolean(qdrant.api_key_configured)}
          placeholder="API key"
        />
      </FieldRow>
      <FieldRow label="Collection Name">
        <input value={qdrant.collection.name} onChange={(event) => update({ collection: { name: event.target.value } })} disabled={readOnly} placeholder="Leave blank to use workspace default" />
      </FieldRow>
      <FieldRow label="Vector Size">
        <input type="number" min="1" value={qdrant.collection.vector_size} onChange={(event) => update({ collection: { vector_size: event.target.value } })} disabled={readOnly} />
      </FieldRow>
      <FieldRow label="Distance">
        <SettingsMenuSelect
          value={qdrant.collection.distance}
          options={QDRANT_DISTANCE_OPTIONS}
          onChange={(distance) => update({ collection: { distance } })}
          disabled={readOnly}
          header="distance"
        />
      </FieldRow>
    </div>
  );
}



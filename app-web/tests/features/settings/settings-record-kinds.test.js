import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copySettingsResponse,
  hasSettingsVersion,
  observeSettingsResponse,
  prepareSettingsRequest,
  reconcileSettings,
  resetSettingsSync,
  settingsResponseIsCurrent,
} from '../../../src/shared/lib/settings-sync.js';
import {
  DEFAULT_MCP_CONFIG_JSON,
  WEB_SEARCH_PROVIDER_OPTIONS,
  createDefaultSettingsRecords,
  createDefaultWebSearchSettings,
  mergeDefaultRecords,
  mergeKnownDefaultRecords,
  normalizeQdrantDraft,
} from '../../../src/features/settings/model/settings-records.js';
import {
  applyMemorySettingsPayloadToRecords,
  applyToolsSettingsPayloadToRecords,
  buildMemorySettingsPayload,
  buildToolsSettingsPayload,
  configItemsForSection,
  findSettingsRecord,
  normalizeWebSearchDraft,
  parseJsonSafe,
  settingsRecordSyncTargets,
} from '../../../src/features/settings/model/settings-payload.js';

// 表驱动重构的对拍基线：下面这几个 legacy* 是重构前 settings-payload.js 的实现，逐字复制。
// 它们只准照着历史代码抄，不准跟着新实现改——同一批 records/payload 跑新旧两套、深比较，
// 12 个写死 id 的站点一旦有一处行为偏了，这里就红。

function legacyToolsRecordSummary(record) {
  if (record?.id === 'tools-mcp') {
    const parsed = parseJsonSafe(record.mcp_json || DEFAULT_MCP_CONFIG_JSON);
    if (!parsed.ok) return 'Invalid JSON';
    const servers = parsed.value?.servers && typeof parsed.value.servers === 'object' ? parsed.value.servers : {};
    return `${Object.keys(servers).length} server${Object.keys(servers).length === 1 ? '' : 's'}`;
  }
  if (record?.id === 'tools-skills') {
    const skills = Array.isArray(record.skills) ? record.skills : [];
    const enabled = skills.filter((skill) => skill.enabled !== false).length;
    return `${enabled}/${skills.length} enabled`;
  }
  if (record?.id === 'tools-web') {
    const web = normalizeWebSearchDraft(record.web_search);
    const active = WEB_SEARCH_PROVIDER_OPTIONS.find((provider) => provider.id === web.provider);
    if (active) return `Active: ${active.label}`;
    const configured = WEB_SEARCH_PROVIDER_OPTIONS
      .filter((provider) => web.providers[provider.id]?.api_key_configured || web.providers[provider.id]?.api_key)
      .map((provider) => provider.label);
    return configured.length ? `Keys configured: ${configured.join(', ')} — pick one` : 'No keys configured';
  }
  return record?.enabled ? (record.endpoint || record.notes || 'Enabled') : 'Disabled';
}

function legacyToolsSettingsPayloadForDraft(records, payload, recordsAtRequest) {
  if (!recordsAtRequest) return payload;
  const find = (source, id) => source?.tools?.find(record => record.id === id);
  const currentMcp = find(records, 'tools-mcp');
  const initialMcp = find(recordsAtRequest, 'tools-mcp');
  return copySettingsResponse(payload, {
    ...payload,
    mcp: initialMcp && currentMcp?.mcp_json !== initialMcp.mcp_json ? undefined : payload.mcp,
    web_search: payload.web_search ? legacyMergeWebSearchSettings(find(records, 'tools-web')?.web_search,
      payload.web_search, find(recordsAtRequest, 'tools-web')?.web_search) : undefined,
  });
}

function legacyMergeWebSearchSettings(current, incoming, initial) {
  const saved = normalizeWebSearchDraft(incoming);
  if (!initial) return saved;
  const draft = normalizeWebSearchDraft(current);
  const before = normalizeWebSearchDraft(initial);
  return {
    ...saved,
    enabled: draft.enabled !== before.enabled ? draft.enabled : saved.enabled,
    provider: draft.provider !== before.provider ? draft.provider : saved.provider,
    providers: Object.fromEntries(WEB_SEARCH_PROVIDER_OPTIONS.map(({ id }) => [id, {
      ...saved.providers[id],
      ...(draft.providers[id].api_key !== before.providers[id].api_key
        ? { api_key: draft.providers[id].api_key } : {}),
      ...(draft.providers[id].enabled !== before.providers[id].enabled
        ? { enabled: draft.providers[id].enabled } : {}),
    }])),
  };
}

function legacyApplyToolsSettingsPayloadToRecords(records, payload, recordsAtRequest) {
  if (!payload || typeof payload !== 'object') return records;
  const response = payload;
  if (!hasSettingsVersion(payload)) payload = legacyToolsSettingsPayloadForDraft(records, payload, recordsAtRequest);
  return {
    ...records,
    tools: mergeDefaultRecords(createDefaultSettingsRecords().tools, records?.tools).map((record) => {
      if (record.id === 'tools-mcp' && payload.mcp && settingsResponseIsCurrent(response, 'mcp')) {
        return {
          ...record,
          mcp_path: payload.mcp.path || record.mcp_path || '',
          mcp_error: payload.mcp.error || '',
          mcp_status: '',
          mcp_servers: Array.isArray(payload.mcp_servers) ? payload.mcp_servers : (record.mcp_servers || []),
          mcp_json: reconcileSettings('mcp', record.mcp_json, JSON.stringify(payload.mcp.config || { servers: {} }, null, 2), response),
        };
      }
      if (record.id === 'tools-skills' && payload.skills && settingsResponseIsCurrent(response, 'skills')) {
        reconcileSettings('skills', record.skills, payload.skills.items || [], response);
        return {
          ...record,
          skills: Array.isArray(payload.skills.items) ? payload.skills.items : [],
          skill_groups: payload.skills.groups || null,
          skill_workspace: payload.skills.workspace || '',
          skill_inventory_ready: Array.isArray(payload.skills.items),
          skill_errors: Array.isArray(payload.skills.errors) ? payload.skills.errors : [],
          skill_install_root: payload.skills.install_root || '',
          skill_can_install: payload.skills.can_install !== false,
        };
      }
      if (record.id === 'tools-web' && payload.web_search) {
        return {
          ...record,
          web_search: reconcileSettings('web_search', record.web_search, normalizeWebSearchDraft(payload.web_search), response),
        };
      }
      return record;
    }),
  };
}

function legacyApplyMemorySettingsPayloadToRecords(records, payload) {
  const qdrant = normalizeQdrantDraft(payload?.qdrant);
  const enabled = payload?.enabled !== false;
  return {
    ...records,
    memory: mergeKnownDefaultRecords(createDefaultSettingsRecords().memory, records?.memory).map((record) => (
      record.id === 'memory-qdrant'
        ? reconcileSettings('memory', record, { ...record, enabled, endpoint: qdrant.url, qdrant }, payload)
        : record
    )),
  };
}

function legacyWebSearchPayload(web) {
  return {
    enabled: web.enabled !== false,
    ...(web.provider ? { provider: web.provider } : {}),
    providers: Object.fromEntries(WEB_SEARCH_PROVIDER_OPTIONS.map(({ id }) => {
      const draft = web.providers[id] || {};
      return [id, {
        enabled: draft.enabled !== false,
        ...(String(draft.api_key || '').trim() ? { api_key: String(draft.api_key).trim() } : {}),
      }];
    })),
  };
}

function legacyBuildToolsSettingsPayload(records, resource) {
  const tools = Array.isArray(records?.tools) ? records.tools : [];
  const mcp = tools.find((item) => item.id === 'tools-mcp');
  const skills = tools.find((item) => item.id === 'tools-skills');
  const webRecord = tools.find((item) => item.id === 'tools-web');
  if (resource === 'mcp') {
    const parsed = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
    if (!parsed.ok) throw new Error(`MCP JSON is invalid: ${parsed.error}`);
    return { mcp: { config: parsed.value } };
  }
  if (resource === 'web_search') {
    return { web_search: legacyWebSearchPayload(normalizeWebSearchDraft(webRecord?.web_search)) };
  }
  const parsedMcp = parseJsonSafe(mcp?.mcp_json || DEFAULT_MCP_CONFIG_JSON);
  if (!parsedMcp.ok) {
    throw new Error(`MCP JSON is invalid: ${parsedMcp.error}`);
  }
  const web = normalizeWebSearchDraft(webRecord?.web_search);
  return {
    mcp: { config: parsedMcp.value },
    ...(skills?.skill_inventory_ready === false ? {} : { skills: {
      disabled: (Array.isArray(skills?.skills) ? skills.skills : [])
        .filter((skill) => skill.enabled === false)
        .map((skill) => skill.name || skill.id)
        .filter(Boolean),
    } }),
    web_search: legacyWebSearchPayload(web),
  };
}

function legacyBuildMemorySettingsPayload(records) {
  const memory = Array.isArray(records?.memory) ? records.memory : [];
  const record = memory.find((item) => item.id === 'memory-qdrant') || {};
  const qdrant = normalizeQdrantDraft({ ...record.qdrant, endpoint: record.endpoint });
  return {
    enabled: record.enabled !== false,
    qdrant: {
      url: qdrant.url,
      ...(qdrant.api_key ? { api_key: qdrant.api_key } : {}),
      collection: {
        name: qdrant.collection.name,
        vector_size: qdrant.collection.vector_size,
        distance: qdrant.collection.distance,
      },
    },
  };
}

const IMPLEMENTATIONS = {
  legacy: {
    applyTools: legacyApplyToolsSettingsPayloadToRecords,
    applyMemory: legacyApplyMemorySettingsPayloadToRecords,
    buildTools: legacyBuildToolsSettingsPayload,
    buildMemory: legacyBuildMemorySettingsPayload,
  },
  current: {
    applyTools: applyToolsSettingsPayloadToRecords,
    applyMemory: applyMemorySettingsPayloadToRecords,
    buildTools: buildToolsSettingsPayload,
    buildMemory: buildMemorySettingsPayload,
  },
};

const patchTool = (records, id, fields) => ({
  ...records,
  tools: records.tools.map((record) => (record.id === id ? { ...record, ...fields } : record)),
});

function webDraft({ provider = '', keys = {}, enabled = true } = {}) {
  const fallback = createDefaultWebSearchSettings();
  return {
    ...fallback,
    enabled,
    provider,
    providers: Object.fromEntries(WEB_SEARCH_PROVIDER_OPTIONS.map(({ id }) => [id, {
      ...fallback.providers[id],
      ...(keys[id] || {}),
    }])),
  };
}

function editedRecords() {
  let records = createDefaultSettingsRecords();
  records = patchTool(records, 'tools-mcp', {
    mcp_json: JSON.stringify({ servers: { alpha: { command: 'a' }, beta: { command: 'b' } } }, null, 2),
    mcp_path: '/fixture/mcp.json',
    mcp_error: 'stale error',
    mcp_status: 'running',
    mcp_servers: [{ name: 'alpha' }],
  });
  records = patchTool(records, 'tools-skills', {
    skills: [{ name: 'alpha' }, { name: 'beta', enabled: false }],
    skill_errors: [{ message: 'old' }],
    skill_can_install: true,
  });
  records = patchTool(records, 'tools-web', {
    web_search: webDraft({ provider: 'tavily', keys: { tavily: { api_key_configured: true } } }),
  });
  records = {
    ...records,
    tools: [...records.tools, { id: 'tools-custom', name: 'Custom', kind: 'Endpoint', enabled: true, endpoint: 'https://custom' }],
    memory: [{ ...records.memory[0], endpoint: 'https://qdrant', qdrant: normalizeQdrantDraft({ url: 'https://qdrant' }) }],
  };
  return records;
}

function brokenMcpRecords() {
  return patchTool(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: '{"servers": ' });
}

function sparseRecords() {
  return { tools: [{ id: 'tools-custom', name: 'Custom', kind: 'Endpoint', enabled: false, notes: 'kept' }] };
}

function toolsPayload() {
  return {
    mcp: {
      config: { servers: { alpha: { command: 'a' }, beta: { command: 'b' } } },
      path: '/server/mcp.json',
      error: '',
    },
    mcp_servers: [{ name: 'beta' }],
    skills: {
      items: [{ name: 'alpha', enabled: true }, { name: 'beta', enabled: false }],
      groups: { builtin: [], global: [] },
      workspace: '/fixture/workspace',
      errors: [],
      install_root: '/fixture/install',
      can_install: false,
    },
    web_search: webDraft({ provider: 'brave', keys: { brave: { api_key_configured: true } } }),
  };
}

// 每个场景都拿到一份全新的 payload：settings-sync 用 WeakMap 记版本号，重跑必须重新过一次响应管线。
async function versioned(body, versions, resource = 'tools') {
  const request = prepareSettingsRequest(`/api/settings/${resource}`, { method: 'GET', headers: {} });
  const response = observeSettingsResponse(new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'x-haish-settings-versions': JSON.stringify(versions) },
  }), request);
  return response.json();
}

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

async function matchesLegacy(scenario, { body, versions, resource = 'tools' } = {}) {
  const run = async (implementation) => {
    resetSettingsSync();
    const payload = body === undefined ? undefined : (
      body === null ? null : (versions === undefined ? clone(body) : await versioned(body, versions, resource))
    );
    return scenario(implementation, payload);
  };
  const before = await run(IMPLEMENTATIONS.legacy);
  const after = await run(IMPLEMENTATIONS.current);
  assert.deepEqual(after, before);
  return before;
}

const APPLY_TOOLS_CASES = [
  ['版本号齐全的 tools 响应覆盖全部三个记录', { body: toolsPayload(), versions: { mcp: 'e:1', skills: 'e:1', web_search: 'e:1' } }],
  ['只有 mcp 版本更新时 skills/web_search 保持原草稿', { body: toolsPayload(), versions: { mcp: 'e:2' } }],
  ['没有任何版本头的响应走草稿合并分支', { body: toolsPayload(), versions: {} }],
  ['缺少 sections 的响应只更新给到的那一段', { body: { skills: { items: [{ name: 'only' }] } }, versions: { mcp: 'e:1', skills: 'e:1', web_search: 'e:1' } }],
  ['skills.items 不是数组时清空清单并标记库存未就绪', { body: { skills: { items: undefined, groups: { a: [] } } }, versions: { skills: 'e:1' } }],
  ['web_search 缺失时不动 web 记录', { body: { mcp: { config: { servers: {} } } }, versions: { mcp: 'e:1', web_search: 'e:1' } }],
];

for (const [title, response] of APPLY_TOOLS_CASES) {
  test(`tools 记录应用：${title}`, async () => {
    for (const records of [createDefaultSettingsRecords(), editedRecords(), brokenMcpRecords(), sparseRecords()]) {
      await matchesLegacy(
        (implementation, payload) => implementation.applyTools(records, payload, undefined),
        response,
      );
    }
  });
}

for (const [title, requestRecords] of [
  ['请求基线等于当前草稿', () => editedRecords()],
  ['请求后 MCP 被改过（回读不能抹掉）', () => patchTool(editedRecords(), 'tools-mcp', { mcp_json: '{"servers":{}}' })],
  ['请求后 web_search 被改过（保留打过的 key）', () => patchTool(editedRecords(), 'tools-web', {
    web_search: webDraft({ provider: 'tavily', keys: { tavily: { enabled: false, api_key: 'typed-after-request' } } }),
  })],
  ['请求基线不存在', () => undefined],
]) {
  test(`tools 记录应用（无版本号 + 请求途中编辑）：${title}`, async () => {
    const records = editedRecords();
    await matchesLegacy(
      (implementation, payload) => implementation.applyTools(records, payload, requestRecords()),
      { body: toolsPayload() },
    );
  });
}

test('tools 记录应用：非对象响应原样返回', async () => {
  const records = editedRecords();
  for (const payload of [null, undefined, 'text', 42]) {
    assert.equal(applyToolsSettingsPayloadToRecords(records, payload), records);
  }
});

for (const [title, body] of [
  ['完整记忆响应', { enabled: false, qdrant: { url: 'https://q.example', api_key: 'secret', collection: { name: 'c', vector_size: 64, distance: 'dot' } } }],
  ['空响应', {}],
  ['只有总开关', { enabled: true }],
  ['qdrant 为 null', { enabled: true, qdrant: null }],
  ['带遗留集合名', { enabled: true, qdrant: { url: 'https://q.example', collection: { name: 'haish_rag_default' } } }],
]) {
  test(`memory 记录应用：${title}`, async () => {
    for (const records of [createDefaultSettingsRecords(), editedRecords(), sparseRecords()]) {
      await matchesLegacy(
        (implementation, payload) => implementation.applyMemory(records, payload),
        { body, versions: { memory: 'e:1' }, resource: 'memory' },
      );
    }
  });
}

for (const resource of ['mcp', 'web_search', undefined]) {
  test(`tools 写回 payload：resource=${resource}`, () => {
    for (const records of [createDefaultSettingsRecords(), editedRecords(), sparseRecords(), undefined]) {
      const capture = (implementation) => {
        try {
          return { ok: implementation.buildTools(records, resource) };
        } catch (error) {
          return { error: error.message };
        }
      };
      assert.deepEqual(capture(IMPLEMENTATIONS.current), capture(IMPLEMENTATIONS.legacy));
    }
  });
}

test('tools 写回 payload：MCP JSON 坏掉时新旧同样抛错', () => {
  for (const resource of ['mcp', undefined]) {
    const capture = (implementation) => {
      try {
        return { ok: implementation.buildTools(brokenMcpRecords(), resource) };
      } catch (error) {
        return { error: error.message };
      }
    };
    const current = capture(IMPLEMENTATIONS.current);
    assert.deepEqual(current, capture(IMPLEMENTATIONS.legacy));
    assert.match(current.error, /MCP JSON is invalid/);
  }
});

test('memory 写回 payload 与重构前一致', () => {
  for (const records of [createDefaultSettingsRecords(), editedRecords(), sparseRecords(), undefined]) {
    assert.deepEqual(
      IMPLEMENTATIONS.current.buildMemory(records),
      IMPLEMENTATIONS.legacy.buildMemory(records),
    );
  }
});

test('列表行摘要与重构前逐字一致（含自定义记录）', () => {
  for (const records of [
    createDefaultSettingsRecords(),
    editedRecords(),
    brokenMcpRecords(),
    sparseRecords(),
  ]) {
    const rows = configItemsForSection('tools', null, records);
    assert.deepEqual(rows.map((row) => row.summary), records.tools.map(legacyToolsRecordSummary));
  }
});

test('按 kind 查记录与旧代码按 id 查记录返回同一条记录', () => {
  const records = editedRecords();
  for (const [kind, id] of [['mcp', 'tools-mcp'], ['skills', 'tools-skills'], ['web-search', 'tools-web']]) {
    assert.equal(findSettingsRecord(records.tools, kind), records.tools.find((item) => item.id === id));
  }
  assert.equal(findSettingsRecord(records.memory, 'memory'), records.memory.find((item) => item.id === 'memory-qdrant'));
  assert.equal(findSettingsRecord(undefined, 'mcp'), undefined);
  assert.equal(findSettingsRecord([], 'mcp'), undefined);
});

test('草稿跟踪目标仍是 mcp / web_search / 整条 memory，取值与旧代码逐条一致', () => {
  const records = editedRecords();
  const expected = [
    ['mcp', records.tools.find((row) => row.id === 'tools-mcp')?.mcp_json],
    ['web_search', records.tools.find((row) => row.id === 'tools-web')?.web_search],
    ['memory', records.memory.find((row) => row.id === 'memory-qdrant')],
  ];
  const actual = settingsRecordSyncTargets().map(({ section, kind, resource, value }) => (
    [resource, value(findSettingsRecord(records[section], kind))]
  ));
  assert.deepEqual(actual, expected);
  // 整条记录参与比较的是同一个对象，不是副本。
  assert.equal(actual[2][1], expected[2][1]);
  // 草稿里缺记录时和旧代码一样给 undefined，而不是造一条空壳。
  assert.deepEqual(
    settingsRecordSyncTargets().map(({ section, kind, resource, value }) => [resource, value(findSettingsRecord(sparseRecords()[section], kind))]),
    [['mcp', undefined], ['web_search', undefined], ['memory', undefined]],
  );
});

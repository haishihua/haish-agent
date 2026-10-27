import test from 'node:test';
import assert from 'node:assert/strict';
import { WEB_SEARCH_PROVIDER_OPTIONS, createDefaultWebSearchSettings } from '../../../src/features/settings/model/settings-records.js';
import { normalizeWebSearchDraft, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { activateWebSearchProvider, patchWebSearchProvider, webSearchProviderState } from '../../../src/features/settings/model/web-search-provider.js';

const PROVIDER_IDS = ['tavily', 'serpapi', 'exa', 'brave', 'parallel', 'firecrawl'];

test('provider catalog keeps the core runtime order and carries row copy', () => {
  assert.deepEqual(WEB_SEARCH_PROVIDER_OPTIONS.map((provider) => provider.id), PROVIDER_IDS);
  for (const provider of WEB_SEARCH_PROVIDER_OPTIONS) {
    assert.ok(provider.label, `${provider.id} needs a label`);
    assert.ok(provider.description, `${provider.id} needs a row description`);
  }
});

test('default draft seeds every provider and leaves the active slot for the server', () => {
  const draft = createDefaultWebSearchSettings();
  // 空 provider 是有意的：草稿要和服务器值区分得开，落盘时 core 会回落成 tavily。
  assert.equal(draft.provider, '');
  assert.deepEqual(Object.keys(draft.providers), PROVIDER_IDS);
  assert.deepEqual(draft.providers.firecrawl, { enabled: true, api_key: '', api_key_configured: false });
});

test('legacy drafts keep their keys, drop mode and gain the new providers', () => {
  const draft = normalizeWebSearchDraft({ mode: 'hybrid', providers: { tavily: { api_key_configured: true } } });
  assert.equal(draft.mode, undefined);
  assert.equal(draft.provider, '', 'no provider picked yet; core falls back to tavily on save');
  assert.equal(draft.providers.tavily.api_key_configured, true);
  assert.equal(draft.providers.parallel.enabled, true);
});

test('activating a provider moves the single active slot and keeps other keys', () => {
  const before = normalizeWebSearchDraft({ provider: 'tavily', providers: { tavily: { api_key_configured: true } } });
  const after = activateWebSearchProvider(before, 'exa');
  assert.equal(after.provider, 'exa');
  assert.equal(after.providers.exa.enabled, true);
  assert.equal(after.providers.tavily.api_key_configured, true, 'the previous provider keeps its key');
  assert.equal(webSearchProviderState(after, 'exa').active, true);
  assert.equal(webSearchProviderState(after, 'tavily').active, false);
});

test('editing a key never changes which provider is active', () => {
  const before = normalizeWebSearchDraft({ provider: 'tavily' });
  const after = patchWebSearchProvider(before, 'parallel', { api_key: 'typed-in-sheet' });
  assert.equal(after.provider, 'tavily', 'typing a key must not silently switch providers');
  assert.equal(after.providers.parallel.api_key, 'typed-in-sheet');
  assert.equal(webSearchProviderState(after, 'parallel').configured, true);
  assert.equal(webSearchProviderState(after, 'parallel').active, false);
});

test('unknown providers are ignored instead of being written', () => {
  const before = normalizeWebSearchDraft({ provider: 'tavily' });
  assert.equal(activateWebSearchProvider(before, 'bing'), before);
  assert.equal(patchWebSearchProvider(before, 'bing', { api_key: 'x' }), before);
});

test('the row switch is on exactly for the active provider', () => {
  const web = activateWebSearchProvider(normalizeWebSearchDraft({ provider: 'tavily' }), 'firecrawl');
  const checked = WEB_SEARCH_PROVIDER_OPTIONS.filter(({ id }) => webSearchProviderState(web, id).active).map(({ id }) => id);
  assert.deepEqual(checked, ['firecrawl'], 'only one switch may be on at a time');
  assert.equal(webSearchProviderState(web, 'firecrawl').enabled, true, 'activating also clears the per-provider enabled flag');
});

test('saving web search submits all six providers plus the active one', () => {
  const draft = activateWebSearchProvider(normalizeWebSearchDraft({ provider: 'tavily' }), 'brave');
  const payload = buildToolsSettingsPayload({ tools: [{ id: 'tools-web', web_search: draft }] }, 'web_search');
  assert.equal(payload.web_search.provider, 'brave');
  assert.deepEqual(Object.keys(payload.web_search.providers), PROVIDER_IDS);
});

// 回归：拨开关那次保存必须把草稿里的 key 一起送上去，否则服务端永远 api_key_configured=false。
test('activating a provider submits the key that was just typed', () => {
  const typed = patchWebSearchProvider(normalizeWebSearchDraft({ provider: 'tavily' }), 'parallel', { api_key: 'par-typed' });
  const submitted = activateWebSearchProvider(typed, 'parallel');
  const payload = buildToolsSettingsPayload({ tools: [{ id: 'tools-web', web_search: submitted }] }, 'web_search');

  assert.equal(payload.web_search.provider, 'parallel');
  assert.equal(payload.web_search.providers.parallel.api_key, 'par-typed');
});

test('activating an unknown provider submits nothing', () => {
  const web = normalizeWebSearchDraft({ provider: 'tavily' });
  assert.equal(activateWebSearchProvider(web, 'bing'), web);
});

// 回归：点已经开着的那一家是空操作——必须原样返回同一个对象，
// 调用方才能用 `next === web` 给出提示而不是又发一次保存。
test('activating the provider that is already active changes nothing', () => {
  const web = activateWebSearchProvider(normalizeWebSearchDraft({ provider: 'tavily' }), 'brave');
  assert.equal(activateWebSearchProvider(web, 'brave'), web);
  // 只剩 enabled=false 的残留时，仍需一次改动把它打开。
  const disabled = normalizeWebSearchDraft({ provider: 'brave', providers: { brave: { enabled: false } } });
  const reenabled = activateWebSearchProvider(disabled, 'brave');
  assert.notEqual(reenabled, disabled);
  assert.equal(reenabled.providers.brave.enabled, true);
});

// 回归：还没选过 provider 的全量保存不能发 `provider: ""`——后端只接受六家里的一个，
// 空串会把一次无关的保存（比如只改了 MCP）变成校验失败。
test('an unpicked provider is omitted instead of submitted empty', () => {
  const records = { tools: [{ id: 'tools-web', web_search: createDefaultWebSearchSettings() }] };
  assert.equal('provider' in buildToolsSettingsPayload(records, 'web_search').web_search, false);
  assert.equal('provider' in buildToolsSettingsPayload(records).web_search, false);
  const picked = { tools: [{ id: 'tools-web', web_search: { ...createDefaultWebSearchSettings(), provider: 'exa' } }] };
  assert.equal(buildToolsSettingsPayload(picked).web_search.provider, 'exa');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startAgentCatalogLoad, staleAgentCatalog } from '../../../src/features/agents/model/agent-catalog-loading.js';

const payload = { agents: [{ agent_id: 'preset.general', display_name: 'Assistant', effective_skill_items: [{ name: 'demo', description: 'Demo' }] }] };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('a newer workspace catalog wins even if old JSON finishes after cancellation', async () => {
  const body = deferred();
  let catalog;
  const old = startAgentCatalogLoad({ request: async () => ({ ok: true, json: () => body.promise }), url: '/old', onState: () => {}, onCatalog: (value) => { catalog = value; } });
  await Promise.resolve();
  old.cancel();
  const newest = { agents: [{ agent_id: 'preset.general', display_name: 'newest' }] };
  await startAgentCatalogLoad({ request: async () => Response.json(newest), url: '/new', onState: () => {}, onCatalog: (value) => { catalog = value; } }).done;
  body.resolve(payload);
  await old.done;
  assert.equal(catalog.options[0].label, 'newest');
});

test('cancelling aborts HTTP and ignores a late successful response', async () => {
  const pending = deferred();
  const states = []; const catalogs = []; let signal;
  const load = startAgentCatalogLoad({ request: (_url, init) => { signal = init.signal; return pending.promise; }, url: '/agents?workspace=old', onState: (s) => states.push(s), onCatalog: (s) => catalogs.push(s) });
  load.cancel();
  assert.equal(signal.aborted, true);
  pending.resolve(Response.json(payload));
  await load.done;
  assert.deepEqual(states, [{ status: 'loading', error: '' }]);
  assert.deepEqual(catalogs, []);
});

test('HTTP failure settles only the agent region; explicit retry loads skills', async () => {
  const states = []; const catalogs = [];
  const start = (request) => startAgentCatalogLoad({ request, url: '/agents', onState: (s) => states.push(s), onCatalog: (s) => catalogs.push(s) });
  await start(async () => new Response('', { status: 500 })).done;
  assert.equal(states.at(-1).status, 'error');
  assert.match(states.at(-1).error, /500/);
  assert.equal(catalogs.length, 0);
  await start(async () => Response.json(payload)).done;
  assert.equal(states.at(-1).status, 'ready');
  assert.equal(catalogs[0].options[0].skills[0].name, 'demo');
});

test('malformed/empty response is a local error, not a successful stale fallback', async () => {
  const states = [];
  await startAgentCatalogLoad({ request: async () => Response.json({}), url: '/agents', onState: (s) => states.push(s), onCatalog: () => assert.fail('empty result published') }).done;
  assert.equal(states.at(-1).status, 'error');
});

test('old-workspace selection remains displayable without old permissions/completions', () => {
  const original = { options: [{ id: 'a', label: 'Saved name', skills: [{ name: 'old' }] }], defaultAgentId: 'a' };
  const stale = staleAgentCatalog(original);
  assert.equal(stale.options[0].label, 'Saved name');
  assert.equal(stale.options[0].unavailable, true);
  assert.deepEqual(stale.options[0].skills, []);
  assert.equal(original.options[0].skills.length, 1);
});

test('run configuration trigger is independent and status/retry stays inside agent flyout', () => {
  const source = fs.readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
  const trigger = source.slice(source.indexOf('const triggerButton ='), source.indexOf('return (', source.indexOf('const triggerButton =')));
  assert.doesNotMatch(trigger, /agentLoading|pickerLoading|loading/);
  assert.match(source, /agentLoading \? <LoadingState label="Loading agents"/);
  assert.match(source, /<ErrorState variant="inline" detail=\{agentError\} onRetry=\{onAgentRetry\}/);
  assert.match(source, /loading \? <LoadingState label="Loading models"/);
});

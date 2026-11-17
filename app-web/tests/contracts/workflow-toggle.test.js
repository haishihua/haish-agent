import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';
import { normalizeWorkflowSettings, workflowById, payloadForCustomWorkflow } from '../../src/core/workflow-catalog.js';

function harness(ok = true) {
  const workflow = { workflow_id: 'custom.workflow-qa', display_name: 'QA', enabled: true,
    nodes: [{ id: 'start', type: 'start' }, { id: 'output', type: 'output' }],
    edges: [{ source: 'start', target: 'output' }] };
  const draft = normalizeWorkflowSettings({ custom: [workflow] });
  const requests = [], applied = [], toasts = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', workflowSettingsDraft: draft, normalizeWorkflowSettings, workflowById, payloadForCustomWorkflow,
    apiFetch: async (url, init) => { requests.push({ url, ...init }); return { ok, status: 400, json: async () => draft }; },
    setWorkflowSettingsDraft: value => applied.push(value), showToast: (...args) => toasts.push(args),
    parseResponseMessage: async () => 'save rejected',
  });
  return { handlers, requests, applied, toasts, draft };
}

for (const enabled of [false, true]) {
  test(`custom workflow toggle ${enabled} uses custom PUT and preserves graph`, async () => {
    const h = harness();
    assert.equal(await h.handlers.handleTogglePresetWorkflow('custom.workflow-qa', enabled), true);
    assert.equal(h.requests[0].url, '/api/settings/workflows/custom/custom.workflow-qa');
    assert.equal(h.requests[0].method, 'PUT');
    const payload = JSON.parse(h.requests[0].body);
    assert.equal(payload.enabled, enabled);
    assert.deepEqual(payload.nodes, payloadForCustomWorkflow(workflowById(h.draft, 'custom.workflow-qa')).nodes);
    assert.deepEqual(payload.edges, payloadForCustomWorkflow(workflowById(h.draft, 'custom.workflow-qa')).edges);
    assert.equal(h.applied.length, 1);
    assert.deepEqual(h.toasts, [['success', enabled ? 'Workflow enabled' : 'Workflow disabled']]);
  });
}

test('preset toggle retains PATCH enabled-only contract', async () => {
  const h = harness();
  assert.equal(await h.handlers.handleTogglePresetWorkflow('preset.qa', false), true);
  assert.equal(h.requests[0].url, '/api/settings/workflows/presets/preset.qa');
  assert.equal(h.requests[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(h.requests[0].body), { enabled: false });
});

test('failed toggle leaves local settings unchanged and reports error', async () => {
  const h = harness(false);
  assert.equal(await h.handlers.handleTogglePresetWorkflow('custom.workflow-qa', false), false);
  assert.equal(h.applied.length, 0);
  assert.deepEqual(h.toasts, [['error', 'save rejected']]);
});

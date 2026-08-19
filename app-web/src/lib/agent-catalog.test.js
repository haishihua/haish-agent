import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_SETTINGS,
  DEFAULT_AGENT_TOOL_GROUPS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
  groupIdsForAgentTools,
  toolsForAgentGroups,
} from './agent-catalog.js';
import { normalizeWorkflowSettings } from './workflow-catalog.js';

const appShellSource = fs.readFileSync(
  new URL('../features/app/AppShell.jsx', import.meta.url),
  'utf8',
);

test('defaults expose only Task Assistant and no preset workflow', () => {
  assert.deepEqual(APP_DEFAULT_AGENT_OPTIONS.map((item) => item.id), ['preset.general']);
  assert.equal(DEFAULT_WORKFLOW_SETTINGS.default_workflow_id, 'workflow.direct-agent');
  assert.deepEqual(DEFAULT_WORKFLOW_SETTINGS.presets, []);
  assert.deepEqual(normalizeWorkflowSettings({ presets: [], custom: [] }).presets, []);
});

test('workflow settings load the agent catalog used by agent nodes', () => {
  assert.match(
    appShellSource,
    /!\['agent', 'workflow'\]\.includes\(settingsSection\)/,
  );
});

test('workflow catalog exposes the human approval gate and its decision contract', () => {
  const approvalType = DEFAULT_WORKFLOW_NODE_TYPES.find((item) => item.id === 'human_approval');
  assert.equal(approvalType?.label, 'Approval');
  assert.deepEqual(
    WORKFLOW_NODE_OUTPUT_FIELDS.human_approval.map((field) => field.id),
    ['decision', 'feedback', 'reviewed_input', 'structured', 'attempt'],
  );
});

test('workflow catalog exposes an explicit loop node and its counter contract', () => {
  const loopType = DEFAULT_WORKFLOW_NODE_TYPES.find((item) => item.id === 'loop');
  assert.equal(loopType?.label, 'Loop');
  assert.deepEqual(
    WORKFLOW_NODE_OUTPUT_FIELDS.loop.map((field) => field.id),
    ['count', 'max_loops', 'remaining', 'exhausted', 'selected_branch'],
  );
});

test('agent tool catalog exposes browser_use and ask_user without legacy browser tools', () => {
  const groups = Object.fromEntries(DEFAULT_AGENT_TOOL_GROUPS.map((group) => [group.id, group]));
  assert.deepEqual(groups.browser.tools, ['browser_use']);
  assert.deepEqual(groups.user_input.tools, ['ask_user']);

  const selected = ['browser', 'user_input'];
  assert.deepEqual(toolsForAgentGroups(selected, DEFAULT_AGENT_TOOL_GROUPS), ['browser_use', 'ask_user']);
  assert.deepEqual(
    groupIdsForAgentTools(['browser_use', 'ask_user'], DEFAULT_AGENT_TOOL_GROUPS),
    selected,
  );

  const legacyBrowserTools = new Set([
    'browser_navigate',
    'browser_snapshot',
    'browser_click',
    'browser_type',
    'browser_scroll',
    'browser_press_key',
    'browser_console',
    'browser_evaluate',
    'browser_screenshot',
    'browser_wait_for',
  ]);
  const exposedTools = DEFAULT_AGENT_TOOL_GROUPS.flatMap((group) => group.tools || []);
  assert.equal(exposedTools.some((tool) => legacyBrowserTools.has(tool)), false);
});

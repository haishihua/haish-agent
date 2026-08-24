import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_SETTINGS,
  DEFAULT_AGENT_TOOL_GROUPS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
  agentCatalogFromProfiles,
  agentCatalogFromSettings,
  extractAgentSkillInvocation,
  groupIdsForAgentTools,
  matchingAgentSkills,
  toolsForAgentGroups,
  withSelectedSkillInstruction,
} from './agent-catalog.js';
import { normalizeWorkflowSettings } from './workflow-catalog.js';

const appShellSource = fs.readFileSync(
  new URL('../features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const chatPanelSource = fs.readFileSync(new URL('../panels/ChatPanel.jsx', import.meta.url), 'utf8');
const chatStyles = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

test('empty-state cards require hover intent before swapping', () => {
  assert.match(chatPanelSource, /const EMPTY_CARD_HOVER_DELAY_MS = 140/);
  assert.match(chatPanelSource, /window\.setTimeout\([\s\S]*EMPTY_CARD_HOVER_DELAY_MS/);
  assert.match(chatPanelSource, /onMouseLeave=\{cancelEmptyCardHover\}/);
});

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

test('agent catalog exposes only enabled effective skills to the composer', () => {
  const catalog = agentCatalogFromSettings({
    presets: [{
      agent_id: 'preset.general',
      display_name: 'Task Assistant',
      enabled: true,
      effective_skills: ['esx', 'disabled-skill'],
    }],
    skills: [
      { name: 'esx', description: 'ESX workflow', enabled: true },
      { name: 'disabled-skill', description: 'Disabled', enabled: false },
    ],
  });

  assert.deepEqual(catalog.options[0].skills, [
    { name: 'esx', description: 'ESX workflow' },
  ]);
});

test('runtime agent catalog keeps effective skills for the composer', () => {
  const catalog = agentCatalogFromProfiles({
    agents: [{
      agent_id: 'custom.code',
      display_name: 'Code Agent',
      effective_skills: ['esx', 'autest'],
      effective_skill_items: [
        { name: 'esx', description: 'Requirement workflow' },
        { name: 'autest', description: 'Unit testing' },
      ],
    }],
  });

  assert.deepEqual(catalog.options[0].skills, [
    { name: 'esx', description: 'Requirement workflow' },
    { name: 'autest', description: 'Unit testing' },
  ]);
});

test('skill composer filters slash input and prefixes the submitted prompt', () => {
  const skills = [
    { name: 'esx', description: 'Requirement workflow' },
    { name: 'autest', description: 'Unit testing' },
  ];

  assert.deepEqual(matchingAgentSkills('/', skills), skills);
  assert.deepEqual(matchingAgentSkills('   /', skills), skills);
  assert.deepEqual(matchingAgentSkills('/req', skills), [skills[0]]);
  assert.deepEqual(matchingAgentSkills('  /req', skills), [skills[0]]);
  assert.deepEqual(matchingAgentSkills('/esx 分析需求 20707', skills), [skills[0]]);
  assert.deepEqual(matchingAgentSkills('/es 分析需求 20707', skills), skills);
  assert.equal(matchingAgentSkills('read /tmp/file', skills), null);
  assert.deepEqual(extractAgentSkillInvocation('/esx', skills), { skill: skills[0], prompt: '' });
  assert.deepEqual(extractAgentSkillInvocation('/esx ', skills), { skill: skills[0], prompt: '' });
  assert.deepEqual(extractAgentSkillInvocation('/esx 分析需求 20707', skills), {
    skill: skills[0],
    prompt: '分析需求 20707',
  });
  assert.deepEqual(extractAgentSkillInvocation('   /esx 分析需求 20707', skills), {
    skill: skills[0],
    prompt: '分析需求 20707',
  });
  assert.equal(extractAgentSkillInvocation('/unknown text', skills), null);
  assert.equal(
    withSelectedSkillInstruction('分析需求 20707', skills[0]),
    'Use the esx skill.\n分析需求 20707',
  );
});

test('selected skill renders as an inline Lexical token inside the composer', () => {
  assert.match(chatPanelSource, /setSelectedSkillName\(skill\.name\)/);
  assert.match(chatPanelSource, /<LexicalComposerInput/);
  const lexicalInputSource = fs.readFileSync(new URL('../panels/LexicalComposerInput.jsx', import.meta.url), 'utf8');
  assert.match(lexicalInputSource, /class SkillTokenNode extends DecoratorNode/);
  assert.match(lexicalInputSource, /data-skill-token=/);
  assert.match(lexicalInputSource, /className="chat-composer-editor"/);
  assert.match(lexicalInputSource, /onKeyDownCapture=\{onKeyDown\}/);
  assert.match(chatStyles, /\.chat-skill-token\s*\{/);
  assert.doesNotMatch(chatStyles, /--skill-chip-indent/);
  assert.match(
    chatPanelSource,
    /function selectSkill\(skill, event\)[\s\S]*skillSelectionPendingRef\.current = !prompt\.trim\(\)[\s\S]*setDraft\(prompt\)/,
  );
  assert.match(chatPanelSource, /async function submit\(e\)[\s\S]*if \(skillSelectionPendingRef\.current\) return/);
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

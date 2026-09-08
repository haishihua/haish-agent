import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_TOOL_GROUPS,
  agentCatalogFromProfiles,
  agentCatalogFromSettings,
  extractAgentSkillInvocation,
  groupIdsForAgentTools,
  matchingAgentSkills,
  toolsForAgentGroups,
  withSelectedSkillInstruction,
} from '../../src/features/agents/model/agent-settings.js';
import {
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_SETTINGS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
} from '../../src/features/workflow/model/workflow-defaults.js';
import { normalizeWorkflowSettings } from '../../src/features/workflow/model/workflow-catalog.js';

const appShellSource = fs.readFileSync(
  new URL('../../src/features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const chatPanelSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const taskDelegationSource = fs.readFileSync(new URL('../../src/features/tasks/components/TaskDelegation.jsx', import.meta.url), 'utf8');
const modelPickersSource = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const motionEffectsSource = fs.readFileSync(new URL('../../src/shared/ui/MotionEffects.jsx', import.meta.url), 'utf8');
const chatStyles = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const delegationStyles = fs.readFileSync(new URL('../../styles/delegation.css', import.meta.url), 'utf8');

test('empty-state penguins stay out until dismissed and cards never swap', () => {
  const cards = fs.readFileSync(new URL('../../src/features/chat/components/PenguinCards.jsx', import.meta.url), 'utf8');
  assert.match(chatPanelSource, /<PenguinCards \/>/);
  assert.match(cards, /id: 'secondary', name: 'relax'/);
  assert.match(cards, /<PortalTooltip text="Click to play" position="above">/);
  assert.doesNotMatch(cards, /chat-empty-penguin-hint|MousePointer2/);
  assert.doesNotMatch(cards, /card\.greeting|<small>/);
  const greetingOriginal = chatStyles.match(/\.chat-empty-card\.is-greeting \.chat-empty-card-original\s*\{([^}]+)\}/)[1];
  assert.match(greetingOriginal, /black 23%, transparent 25%, transparent 78%, black 80%/);
  const paperStyle = chatStyles.match(/\.chat-empty-card-paper\s*\{([^}]+)\}/)[1];
  assert.match(paperStyle, /transparent 21%, black 23%, black 80%, transparent 82%/);
  assert.match(chatStyles, /\.chat-empty-illustration\s*\{\s*image-rendering: auto/);
  assert.doesNotMatch(greetingOriginal, /opacity:\s*0|visibility:\s*hidden/);
  assert.match(cards, /src=\{card\.plate\}/);
  for (const name of ['relax', 'sleepy', 'hug']) {
    assert.ok(cards.includes(`import ${name}Plate from '../../../../assets/ui/empty-state/penguin-${name}-plate.png'`));
  }
  assert.match(cards, /window\.setTimeout\(\(\) => activate\(card\), 180\)/);
  assert.match(cards, /onPointerLeave=\{cancel\}/);
  assert.doesNotMatch(cards, /leaveTimer|setFront|--penguin-lean/);
  assert.match(cards, /setDelay\(active \? 220 : 0\)/);
  assert.match(cards, /addEventListener\('pointerdown', dismissOutside, true\)/);
  assert.match(cards, /removeEventListener\('pointerdown', dismissOutside, true\)/);
  assert.match(cards, /addEventListener\('input', dismissOutside\)/);
  assert.match(chatStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(chatStyles, /\.swap-secondary|\.swap-tertiary/);
  assert.match(cards, /sprite\.getAnimations\(\)/);
  assert.match(cards, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(chatStyles, /pointer-events: auto; opacity: 1/);
  assert.match(chatStyles, /prefers-reduced-motion: reduce/);
  assert.match(cards, /colorInterpolationFilters="sRGB"/);
  assert.match(cards, /3 -3 0 0 1/);
  assert.doesNotMatch(cards, /<mask|<clipPath|feComponentTransfer/);
  assert.doesNotMatch(cards, /feGaussianBlur/);
  const spriteStyle = chatStyles.match(/\.chat-empty-penguin\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(spriteStyle, /filter:/);
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
  const lexicalInputSource = fs.readFileSync(new URL('../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
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

test('run configuration progressively reveals thinking before agent and model settings', () => {
  assert.match(modelPickersSource, /className="model-picker-gauge"/);
  assert.match(modelPickersSource, /model-picker-quick thinking-/);
  assert.match(modelPickersSource, /type="range"/);
  assert.match(modelPickersSource, /setMenuOpen\(true\)/);
  assert.match(modelPickersSource, /activeSubmenu === 'agent'/);
  assert.doesNotMatch(modelPickersSource, /activeSubmenu === 'thinking'/);
  assert.match(delegationStyles, /\.model-picker-menu,[\s\S]*border-color: var\(--line\)/);
  assert.match(delegationStyles, /\.model-picker-reasoning\.thinking-xhigh input::/);
  assert.match(delegationStyles, /font-family: var\(--conversation-font\)/);
});

test('approval mode uses a compact icon orbit with copy moved to tooltips', () => {
  assert.match(modelPickersSource, /const alternateModes = APPROVAL_MODE_OPTIONS\.filter/);
  assert.match(modelPickersSource, /text=\{approvalHint\(opt\)\}/);
  assert.match(modelPickersSource, /approval-mode-option-\$\{index \+ 1\}/);
  assert.doesNotMatch(modelPickersSource, /className="approval-mode-label"/);
  assert.match(fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8'), /@keyframes approval-mode-left-in/);
});

test('send and stop actions share the chromatic metal circle effect', () => {
  assert.match(motionEffectsSource, /import \{ MetalFx \} from 'metal-fx'/);
  assert.match(motionEffectsSource, /variant="circle"[\s\S]*preset="chromatic"[\s\S]*theme="dark"/);
  assert.match(motionEffectsSource, /strength=\{1\}[\s\S]*paused=\{reduceMotion\(\)\}/);
  assert.doesNotMatch(motionEffectsSource, /children\.props\.disabled/);
  assert.match(chatPanelSource, /<MetalActionEffect>[\s\S]*chat-send-icon/);
  assert.match(taskDelegationSource, /<MetalActionEffect>[\s\S]*chat-send-icon/);
});

test('the shared MetalFx context survives chat and workflow mode switches', () => {
  assert.match(motionEffectsSource, /export function MetalFxRuntimeKeeper/);
  assert.match(motionEffectsSource, /className="metal-fx-runtime-keeper"[\s\S]*strength=\{0\}[\s\S]*paused[\s\S]*disableGlow/);
  assert.match(appShellSource, /<MetalFxRuntimeKeeper \/>/);
});

test('composer border animation only runs during interaction, input, or a task run', () => {
  assert.match(motionEffectsSource, /addEventListener\('pointerenter', engage\)/);
  assert.doesNotMatch(motionEffectsSource, /addEventListener\('focusin', engage\)/);
  assert.match(motionEffectsSource, /active=\{\(Boolean\(active\) \|\| interacting\)/);
  assert.match(chatPanelSource, /<ComposerBorderBeam active=\{running \|\| submitPending \|\| hasComposerPayload\}/);
  assert.match(taskDelegationSource, /<ComposerBorderBeam active=\{running \|\| submitPending \|\| Boolean\(v\.trim\(\)\)\}/);
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

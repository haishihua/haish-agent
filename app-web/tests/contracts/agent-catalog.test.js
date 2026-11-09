import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_TOOL_GROUPS,
  agentCatalogFromProfiles,
  agentCatalogFromSettings,
  agentDisplayNameForId,
  agentIconNameForAgentId,
  extractAgentSkillInvocation,
  groupIdsForAgentTools,
  matchingAgentSkills,
  toolsForAgentGroups,
  withSelectedSkillInstruction,
} from '../../src/core/agent-settings.js';
import {
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_SETTINGS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
} from '../../src/core/workflow-defaults.js';
import { normalizeWorkflowSettings } from '../../src/core/workflow-catalog.js';
import { appShellSource as readAppShellSource } from '../helpers/shell-source.js';

const appShellSource = [
  readAppShellSource(),
  fs.readFileSync(new URL('../../src/features/app/hooks/useShellHandlers.js', import.meta.url), 'utf8'),
].join('\n');
const chatPanelSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const composerSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
const sendControlsSource = fs.readFileSync(new URL('../../src/features/chat/components/composer/SendControls.jsx', import.meta.url), 'utf8');
const modelPickersSource = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const motionEffectsSource = fs.readFileSync(new URL('../../src/shared/ui/MotionEffects.jsx', import.meta.url), 'utf8');
const chatStyles = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const delegationStyles = fs.readFileSync(new URL('../../styles/delegation.css', import.meta.url), 'utf8');

test('welcome area uses the new headline and the shared composer', () => {
  assert.match(chatPanelSource, /<img src=\{welcomeSlogan\} alt="Your ideas\. My execution\."/);
  assert.doesNotMatch(chatPanelSource, /<PenguinCards\s*\/>/);
  assert.match(chatPanelSource, /<ChatComposer/);
  assert.match(composerSource, /className="chat-composer-surface"/);
  assert.match(chatStyles, /\.chat-composer-surface\s*\{[^}]*border:\s*0;[^}]*background:\s*#303030;[^}]*box-shadow:\s*none/s);
  assert.match(chatStyles, /\.chat-composer-editor\s*\{[^}]*min-height:\s*24px;[^}]*max-height:\s*120px/s);
  // 空态输入框保持原横向宽度，并为向上展开的审批图标预留纵向空间。
  assert.match(chatStyles, /\.chat-workspace\.is-empty \.chat-composer\s*\{[^}]*width:\s*min\(850px,/s);
  assert.match(chatStyles, /\.chat-composer-actions\s*\{[^}]*margin-top:\s*18px;/s);
});

test('empty state project picker aligns with the centered composer', () => {
  const composer = chatStyles.match(/\.chat-workspace\.is-empty \.chat-composer\s*\{([^}]*)\}/)[1];
  const picker = chatStyles.match(/\.chat-workspace\.is-empty > \.draft-project-picker\s*\{([^}]*)\}/)[1];
  for (const property of ['width', 'justify-self', 'left']) {
    const declaration = new RegExp(`(?:^|\\n)\\s*${property}: ([^;]+);`);
    assert.equal(picker.match(declaration)?.[1], composer.match(declaration)?.[1], `${property} stays aligned`);
  }
});

test('quoted comments live inside the composer box', () => {
  const surfaceIndex = composerSource.indexOf('<div className="chat-composer-surface">');
  const beforeInputIndex = composerSource.indexOf('className="chat-composer-before-input"');
  const inputRowIndex = composerSource.indexOf('className="chat-composer-input-row"');
  assert.ok(surfaceIndex > -1, 'composer keeps its surface');
  // 注释草稿属于输入框本体：在 surface 内、输入行之上，与 placeholder 同一个左内边距。
  assert.ok(beforeInputIndex > surfaceIndex, 'comment drafts render inside the composer surface');
  assert.ok(inputRowIndex > beforeInputIndex, 'comment drafts sit above the input row');
  assert.match(chatStyles, /\.chat-composer-surface\s*\{[^}]*padding:\s*7px 8px 7px 16px;/s);
  assert.match(chatStyles, /\.chat-composer-before-input\s*\{[^}]*min-width:\s*0;/s);
  const annotationStyles = fs.readFileSync(new URL('../../src/features/chat/components/message-annotations.css', import.meta.url), 'utf8');
  assert.match(annotationStyles, /\.haish-annotation-drafts \{[^}]*padding:0;/);
});

test('unused penguin cards preserve their interaction and artwork', () => {
  const cards = fs.readFileSync(new URL('../../src/features/chat/components/PenguinCards.jsx', import.meta.url), 'utf8');
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
    assert.ok(cards.includes(`import ${name}Plate from '../../../../assets/ui/empty-state/penguin-${name}-plate.webp'`));
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
  assert.match(cards, /if \(active !== card\.id \|\| prefersReducedMotion\(\)\) return;/);
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
    /automationExpanded \|\| \['agent', 'workflow'\]\.includes\(settingsSection\)/,
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
  assert.match(composerSource, /setSelectedSkillName\(skill\.name\)/);
  assert.match(composerSource, /<LexicalComposerInput/);
  const lexicalInputSource = fs.readFileSync(new URL('../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
  assert.match(lexicalInputSource, /class SkillTokenNode extends DecoratorNode/);
  assert.match(lexicalInputSource, /data-skill-token=/);
  assert.match(lexicalInputSource, /className="chat-composer-editor"/);
  assert.match(lexicalInputSource, /onKeyDownCapture=\{onKeyDown\}/);
  assert.match(chatStyles, /\.chat-skill-token\s*\{/);
  assert.doesNotMatch(chatStyles, /--skill-chip-indent/);
  assert.match(
    composerSource,
    /function selectSkill\(skill, event\)[\s\S]*skillSelectionPendingRef\.current = !prompt\.trim\(\)[\s\S]*setDraft\(composePathReferenceDraft\(prompt, composerContent\.references\)\)/,
  );
  assert.match(composerSource, /matchingAgentSkills\(composerContent\.text, resolvedSkills\)/);
  assert.match(composerSource, /extractAgentSkillInvocation\(composerContent\.text, resolvedSkills\)/);
  assert.match(composerSource, /async function submit\(e\)[\s\S]*if \(skillSelectionPendingRef\.current\) return/);
});

test('background catalog reads keep the picked skill token and only run for the next task', () => {
  // 已选的 skill 不能因为列表短暂为空（重读中/刷新失败）被静默清掉，只有拿到当前 agent
  // 的真实列表且里面确实没有它时才清。
  assert.match(
    composerSource,
    /if \(selectedSkillName && resolvedSkills\.length\s*\n\s*&& !resolvedSkills\.some\(\(skill\) => skill\.name === selectedSkillName\)\)/,
  );
  // agent/skill 目录不在 focus、也不在设置事件里重读：重读时机只有换 workspace、重试、下一次任务。
  assert.match(appShellSource, /\}, \[localWorkspace\.path, agentContextKey, agentRetry\]\);/);
  assert.doesNotMatch(appShellSource, /agentRetry, settingsSync\.epochs/);
  assert.match(appShellSource, /handleDeploy: deployTask/);
  assert.match(appShellSource, /setAgentRetry\(\(attempt\) => attempt \+ 1\); return deployTask\(\.\.\.args\);/);
});

test('picking an agent uses the composer agent picker and leaves the run-config menu alone', () => {
  assert.match(composerSource, /<AgentPicker/);
  assert.match(modelPickersSource, /export function AgentPicker/);
  assert.doesNotMatch(modelPickersSource, /model-picker-flyout-agent/);
  assert.doesNotMatch(modelPickersSource, /setActiveSubmenu\('agent'\)/);
  // 光标离开不能自动收起面板：子菜单就在面板右侧，它一收，光标就落到面板外，
  // 旧的 mouseleave + 180ms 计时器会把用户正在选的主面板直接关掉。
  assert.doesNotMatch(modelPickersSource, /leaveTimer/);
  assert.doesNotMatch(modelPickersSource, /onMouseLeave/);
});

test('run configuration progressively reveals thinking before agent and model settings', () => {
  assert.match(modelPickersSource, /<svg className=\{`model-picker-gauge /);
  assert.match(modelPickersSource, /model-picker-quick thinking-/);
  assert.match(modelPickersSource, /type="range"/);
  assert.match(modelPickersSource, /setMenuOpen\(true\)/);
  assert.match(modelPickersSource, /<div className="agent-picker-header">Agent<\/div>/);
  assert.doesNotMatch(modelPickersSource, /activeSubmenu === 'thinking'/);
  // 模型名左边要有厂商图标：与列表里的模型行用同一个 ModelGlyph，图标略小一号。
  assert.match(modelPickersSource, /<ModelGlyph modelId=\{current\?\.id \|\| value\} className="model-picker-quick-glyph" \/>/);
  assert.match(delegationStyles, /\.model-picker-quick-summary > \.model-picker-quick-glyph\s*\{[^}]*width: 16px;[^}]*height: 16px;/s);
  assert.match(delegationStyles, /\.model-picker-quick-summary > \.model-picker-quick-model\s*\{[^}]*text-overflow: ellipsis;/s);
  assert.match(delegationStyles, /\.model-picker-menu,[\s\S]*border-color: var\(--line\)/);
  assert.match(delegationStyles, /\.model-picker-reasoning\.thinking-xhigh input::/);
  assert.match(delegationStyles, /font-family: var\(--conversation-font\)/);
});

test('approval mode uses a compact icon orbit with copy moved to tooltips', () => {
  assert.match(modelPickersSource, /const alternateModes = APPROVAL_MODE_OPTIONS\.filter/);
  assert.match(modelPickersSource, /text=\{approvalHint\(opt\)\}/);
  assert.match(modelPickersSource, /approval-mode-option-\$\{index \+ 1\}/);
  assert.doesNotMatch(modelPickersSource, /className="approval-mode-label"/);
  assert.match(fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8'), /@keyframes approval-mode-fade-in/);
});

test('send and stop actions share the chromatic metal circle effect', () => {
  assert.match(motionEffectsSource, /import \{ MetalFx \} from 'metal-fx'/);
  assert.match(motionEffectsSource, /variant="circle"[\s\S]*preset="chromatic"[\s\S]*theme="dark"/);
  assert.match(motionEffectsSource, /strength=\{1\}/);
  assert.doesNotMatch(motionEffectsSource, /children\.props\.disabled/);
  assert.match(sendControlsSource, /<MetalActionEffect active=\{sendBeamActive\}>[\s\S]*chat-send-icon/);
  // 发送/停止按钮只有输入框那一份（聊天详情不再自己画一个）。
  assert.doesNotMatch(chatPanelSource, /chat-send-icon/);
});

// The ring is a state signal: it runs while this conversation has work in
// flight AND while the composer holds something sendable. Regression: gating it
// on the run state alone meant the button never animated during typing — the
// ring only appeared after the send had already been dispatched.
test('the metal ring tracks in-flight work and typed payload instead of staying lit', () => {
  assert.match(motionEffectsSource, /active = true, \.\.\.props \}, ref\)/);
  assert.match(motionEffectsSource, /`chat-send-metal \$\{active \? 'is-active' : 'is-idle'\}/);
  assert.match(motionEffectsSource, /paused=\{prefersReducedMotion\(\) \|\| !active\}/);
  assert.match(composerSource, /const sendBeamActive = running \|\| submitPending \|\| hasComposerPayload;/);
  assert.doesNotMatch(composerSource, /<MetalActionEffect>/);
  // 选中的 Goal 命令也能直接导航；贴图与批注草稿继续算「有东西可发」。
  assert.match(composerSource, /const hasComposerPayload = Boolean\(selectedCommand \|\| draft\.trim\(\) \|\| composerImages\.length > 0 \|\| pendingCommentCount\)/);
  // Unmounting the shell would swap the button surface mid-press, so the idle
  // state hides the shader layers instead and keeps the shell mounted.
  assert.match(chatStyles, /\.chat-send-metal\.is-idle \.metal-fx-canvas[\s\S]*opacity: 0;/);
  assert.match(chatStyles, /\.chat-send-metal\.is-idle \.metal-fx-glow-svg[\s\S]*opacity: 0;/);
});

test('the shared MetalFx context survives chat and workflow mode switches', () => {
  assert.match(motionEffectsSource, /export function MetalFxRuntimeKeeper/);
  assert.match(motionEffectsSource, /className="metal-fx-runtime-keeper"[\s\S]*strength=\{0\}[\s\S]*paused[\s\S]*disableGlow/);
  assert.match(appShellSource, /<MetalFxRuntimeKeeper \/>/);
});

test('composer keeps the colorful beam on its outer edge', () => {
  // 五色流光放在输入框表面内，避免被不透明背景挡住。
  const surfaceIndex = composerSource.indexOf('<div className="chat-composer-surface">');
  const beamIndex = composerSource.indexOf('<ComposerBorderBeam active={sendBeamActive} />');
  assert.ok(beamIndex > surfaceIndex, 'the beam belongs to the composer surface');
  assert.match(chatStyles, /\.composer-border-beam\s*\{[^}]*position:\s*absolute !important;[^}]*z-index:\s*2;/s);
  // 聚焦仍不会额外画出实线边框。
  assert.doesNotMatch(chatStyles, /\.chat-composer-surface:focus-within\s*\{/);
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

test('agent tool catalog drops the retired RAG group without touching memory', () => {
  const groups = Object.fromEntries(DEFAULT_AGENT_TOOL_GROUPS.map((group) => [group.id, group]));
  assert.equal(groups.knowledge, undefined);

  const exposedTools = DEFAULT_AGENT_TOOL_GROUPS.flatMap((group) => group.tools || []);
  assert.equal(exposedTools.includes('rag_search'), false);
  assert.equal(exposedTools.includes('document_list'), false);

  assert.deepEqual(groups.memory.tools, ['memory_search', 'memory_add', 'memory_forget']);
});

test('icon and bubble-name lookups share one id → catalog lookup', () => {
  // 选单、图标、气泡名字必须读同一份 catalog（同一个 id 只能有一个答案）。
  const options = [
    { id: 'preset.general', label: 'Task Assistant' },
    { id: 'custom.agent-code', label: 'Code Agent', custom: true },
  ];

  assert.equal(agentIconNameForAgentId('preset.general', options), 'sparkles');
  assert.equal(agentIconNameForAgentId('custom.agent-code', options), 'box');
  // 已下线的 custom agent 不在 catalog 里，图标仍按 custom 前缀给。
  assert.equal(agentIconNameForAgentId('custom.agent-gone', options), 'box');
  assert.equal(agentIconNameForAgentId('preset.gone', options), 'sparkles');
  assert.equal(agentIconNameForAgentId('', options), 'sparkles');

  assert.equal(agentDisplayNameForId('  preset.general  ', options), 'Task Assistant');
  assert.equal(agentDisplayNameForId('custom.agent-code', options), 'Code Agent');
  // 内部 id 不能当名字漏到界面上。
  assert.equal(agentDisplayNameForId('custom.agent-gone', options), '');
  assert.equal(agentDisplayNameForId('preset.general', null), '');
  assert.equal(agentDisplayNameForId(undefined, options), '');
  // 名字取 catalog 的 label 并 trim 两端空白。
  assert.equal(agentDisplayNameForId('custom.agent-padded', [{ id: 'custom.agent-padded', label: '  Padded  ' }]), 'Padded');
});

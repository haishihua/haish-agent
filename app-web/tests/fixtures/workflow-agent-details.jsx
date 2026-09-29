import React from 'react';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import { createRoot } from 'react-dom/client';
import { WorkflowConfigEditor } from '../../src/features/settings/components/WorkflowConfigEditor.jsx';
import { normalizeWorkflowSettings, workflowOutputFields } from '../../src/features/workflow/model/workflow-catalog.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const agentSettings = { presets: [{ agent_id: 'goal.worker', display_name: 'Goal Worker', description: 'Process the user goal and determine next steps', enabled: true }] };
const initial = normalizeWorkflowSettings({ custom: [{ workflow_id: 'custom.agent-detail', name: 'Agent detail', custom: true, editable: true, enabled: true,
  nodes: [
    { id: 'start', type: 'start', label: 'Start' },
    { id: 'worker', type: 'agent', label: 'Worker', agent_id: 'goal.worker', prompt: 'You are a goal-oriented agent.\nAnalyze the user request carefully.\nDecide the next step based on the verifier result.',
      parameters: [{ id: 'goal', name: 'Goal', value: '{{input.message}}' }], input: '{{Goal}}' },
    { id: 'output', type: 'output', label: 'End', output_mode: 'json_object', output_mapping: { answer: '{{input.message}}' } },
    { id: 'condition', type: 'condition', label: 'Verdict', expression: '{{Goal}}', parameters: [{ id: 'c', name: 'Goal', value: '{{input.message}}' }] },
    { id: 'loop', type: 'loop', label: 'Retry', max_loops: 3 },
    { id: 'llm', type: 'llm', label: 'Model', prompt: '{{Goal}}', parameters: [{ id: 'l', name: 'Goal', value: '{{input.message}}' }] },
    { id: 'tool', type: 'tool', label: 'Tool', arguments: '{{Goal}}', parameters: [{ id: 't', name: 'Goal', value: '{{input.message}}' }] },
    { id: 'approval', type: 'human_approval', label: 'Approval', input: { title: 'Review', summaryText: '{{input.message}}' } },
  ], edges: [{ from: 'start', to: 'worker' }, { from: 'worker', to: 'output' }],
}] });
function Stage() {
  const [settings, setSettings] = React.useState(initial);
  const [readOnly, setReadOnly] = React.useState(false);
  window.__detailsState = settings;
  window.__detailsReadOnly = setReadOnly;
  return <AppTooltipProvider><div className="settings-workbench workflow-workbench provider-list-only has-detail">
    <div className="settings-detail-drawer"><WorkflowConfigEditor selectedId="custom.agent-detail" settings={settings}
      onSettingsChange={setSettings} agentSettings={agentSettings} readOnly={readOnly} /></div>
  </div></AppTooltipProvider>;
}
createRoot(document.getElementById('stage')).render(<Stage />);
const tick = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
const rows = [];
let failed = false;
function check(ok, text) { rows.push(`${ok ? 'PASS' : 'FAIL'} ${text}`); failed ||= !ok; report.textContent = rows.join('\n'); }
function setValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
const worker = () => window.__detailsState.custom[0].nodes.find((node) => node.id === 'worker');
(async () => {
  for (let i = 0; i < 80 && !document.querySelector('.react-flow__node[data-id="worker"]'); i++) await tick();
  document.querySelector('.react-flow__node[data-id="worker"]').click();
  await tick(350);
  const panel = document.querySelector('.workflow-agent-detail');
  check(Boolean(panel), 'Agent has dedicated detail layout');
  const checkNodeTheme = (id) => {
    const canvas = document.querySelector(`.react-flow__node[data-id="${id}"] .workflow-flow-node`);
    const tile = getComputedStyle(canvas.querySelector('.workflow-flow-node-icon'));
    const avatar = getComputedStyle(panel.querySelector('.workflow-agent-avatar'));
    check(getComputedStyle(panel).getPropertyValue('--workflow-detail-accent').trim() === getComputedStyle(canvas).getPropertyValue('--node-type-accent').trim(), `${id}: detail uses canvas type accent`);
    check(avatar.backgroundImage === tile.backgroundImage && avatar.color === tile.color, `${id}: detail icon shares canvas icon palette`);
    const badge = getComputedStyle(panel.querySelector('.workflow-agent-badge')).color;
    check([...panel.querySelectorAll('.workflow-agent-section-head > .app-icon, .workflow-agent-row-icon')].every((el) => getComputedStyle(el).color === badge), `${id}: section and field icons follow node accent`);
  };
  checkNodeTheme('worker');
  check([...panel.querySelectorAll('strong, span, input, textarea, button')].every((el) => getComputedStyle(el).fontFamily.includes('LXGW WenKai Screen')), 'Detail text and all form controls use application reading font');
  check(panel.querySelector('.workflow-agent-heading-title strong').textContent === 'Worker', 'Title keeps node label');
  check(panel.querySelector('.workflow-agent-heading-copy p').textContent.includes('Process the user goal'), 'Description comes from selected agent');
  check(panel.querySelectorAll('.workflow-node-panel-head button').length === 1 && panel.querySelector('.workflow-node-panel-head button').ariaLabel === 'Delete', 'Header contains only delete action');
  check(![...panel.querySelectorAll('.settings-field-label')].some((el) => /^label$/i.test(el.textContent)), 'No duplicate Label field');
  check(!panel.textContent.includes('Basic'), 'No Basic frame');
  check(panel.querySelectorAll('.workflow-agent-output-row').length === workflowOutputFields('agent').length, 'All actual output contract fields retained');
  check(!panel.querySelector('.workflow-agent-outputs button'), 'Output contract has no unsupported edit action');
  panel.querySelector('.workflow-agent-selector .model-picker-trigger').click(); await tick();
  check(Boolean(panel.querySelector('.workflow-agent-selector [role="listbox"]')), 'Agent selector opens');
  panel.querySelector('.workflow-agent-selector [role="option"]').click(); await tick();
  check(worker().agent_id === 'goal.worker', 'Agent selection persists');
  panel.querySelector('.workflow-variable-menu-select .model-picker-trigger').click(); await tick();
  const option = panel.querySelector('.workflow-variable-menu-select [role="option"]');
  const rect = option.getBoundingClientRect();
  check(option.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)), 'Input menu remains visible and clickable outside row');
  option.click(); await tick();
  const prompt = panel.querySelector('[aria-label="Agent prompt"]');
  const promptCard = panel.querySelector('[aria-label="Prompt"]');
  const promptRect = promptCard.getBoundingClientRect();
  check(promptRect.height > 180 && panel.querySelector('.workflow-agent-inputs').getBoundingClientRect().top >= promptRect.bottom, 'Prompt stays visible without collapsing to a line or overlapping Inputs');
  const outputRows = [...panel.querySelectorAll('.workflow-agent-outputs .workflow-agent-output-row')];
  check(new Set(outputRows.map((row) => row.querySelector('svg').getAttribute('class'))).size >= 7, 'Output icons distinguish field meanings');
  check(outputRows.every((row) => row.querySelector('.workflow-detail-field-heading > .workflow-io-type')), 'Output type badges sit beside field names');
  const centerY = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  const alignedSelect = () => {
    const selector = panel.querySelector('.workflow-detail-select');
    const label = selector.querySelector('.workflow-detail-select-text');
    const value = selector.querySelector('.workflow-detail-select-static, .model-picker-value');
    const textRect = (el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect(); };
    const a = textRect(label), b = textRect(value);
    return Math.abs(a.bottom - b.bottom) < 0.5
      && Math.abs(centerY(selector.querySelector('.app-icon')) - (a.top + a.height / 2)) < 0.5
      && getComputedStyle(label).fontWeight === getComputedStyle(value).fontWeight;
  };
  check(alignedSelect(), 'Editable Agent icon aligns with text glyphs; label and value share baseline and weight');
  const alignedFields = (rows) => rows.every((row) => {
    const icon = row.querySelector('.workflow-agent-row-icon');
    const name = row.querySelector('.workflow-detail-field-heading > strong');
    return Math.abs(centerY(icon) - centerY(row.querySelector('.workflow-agent-output-copy'))) < 1
      && [...row.querySelectorAll('.workflow-io-type, .workflow-io-required')].every((el) => Math.abs(centerY(name) - centerY(el)) < 1);
  });
  check(alignedFields(outputRows), 'Output icons center on the full text block; badges align with field names');
  const parameter = panel.querySelector('.workflow-parameter-row');
  const parameterTop = parameter.querySelector('.workflow-parameter-heading').getBoundingClientRect().top;
  const parameterBottom = parameter.querySelector('.workflow-variable-menu-select').getBoundingClientRect().bottom;
  check(Math.abs(centerY(parameter.querySelector('.workflow-agent-row-icon')) - (parameterTop + parameterBottom) / 2) < 1, 'Input icon centers across name and value rows');
  setValue(prompt, 'Updated instructions\nSecond line');
  await tick();
  check(worker().prompt === 'Updated instructions\nSecond line', 'Prompt edits persist');
  check(panel.querySelectorAll('.workflow-agent-line-numbers > div').length === 2, 'Line numbers follow prompt edits');
  const name = panel.querySelector('[aria-label="Parameter name"]');
  setValue(name, 'Task'); await tick();
  check(worker().parameters[0].name === 'Task' && worker().input === '{{Task}}', 'Input rename reconciles message aliases');
  panel.querySelector('.workflow-parameter-add').click(); await tick();
  check(worker().parameters.length === 2, 'Add Input updates data');
  panel.querySelectorAll('.workflow-parameter-delete')[1].click(); await tick();
  check(worker().parameters.length === 1, 'Delete input updates data');
  const form = document.querySelector('.settings-workflow-form');
  for (const width of [280, 340, 520]) {
    form.style.setProperty('--workflow-node-panel-width', `${width}px`); await tick();
    check(Math.abs(panel.getBoundingClientRect().width - width) < 1 && panel.scrollWidth <= panel.clientWidth + 1, `No horizontal overflow at ${width}px`);
    check(alignedFields(outputRows), `Output icons center on wrapped text at ${width}px`);
  }
  window.__detailsReadOnly(true); await tick();
  check(!panel.querySelector('.workflow-node-panel-head button') && !panel.querySelector('.workflow-parameter-add'), 'Read-only hides destructive and add actions');
  check([...panel.querySelectorAll('input,textarea')].every((el) => el.disabled), 'Read-only disables editing');
  check(Boolean(panel.querySelector('.workflow-agent-selector .workflow-detail-select-static')) && !panel.querySelector('.workflow-agent-selector button'), 'Read-only Agent is a clean value, not a disabled dropdown');
  check(alignedSelect(), 'Read-only Agent icon, label and value visually align');
  window.__detailsReadOnly(false); await tick();
  const getNode = (id) => window.__detailsState.custom[0].nodes.find((node) => node.id === id);
  const select = async (id) => { document.querySelector(`.react-flow__node[data-id="${id}"]`).click(); await tick(150); panel.scrollTop = 0; };
  for (const id of ['start', 'output', 'condition', 'loop', 'llm', 'tool', 'approval']) {
    await select(id);
    const node = getNode(id);
    checkNodeTheme(id);
    check(panel.querySelector('.workflow-agent-heading')?.dataset.nodeType === node.type, `${id}: shared heading with correct type`);
    check(![...panel.querySelectorAll('.settings-field-label')].some((el) => /^label$/i.test(el.textContent)), `${id}: no duplicate label field`);
    check(panel.querySelectorAll('.workflow-node-panel-head button').length === (['start', 'output'].includes(id) ? 0 : 1), `${id}: header actions respect protected nodes`);
    if (id !== 'output') check(panel.querySelectorAll('.workflow-agent-outputs .workflow-agent-output-row').length === workflowOutputFields(node).length, `${id}: real output contract uses shared rows`);
    for (const width of [280, 340, 520]) {
      form.style.setProperty('--workflow-node-panel-width', `${width}px`); await tick();
      check(panel.scrollWidth <= panel.clientWidth + 1, `${id}: no overflow at ${width}px`);
      const readonlyBadges = [...panel.querySelectorAll('.workflow-detail-readonly-badge')];
      if (readonlyBadges.length) check(readonlyBadges.every((badge) => {
        const b = badge.getBoundingClientRect(), title = badge.previousElementSibling.getBoundingClientRect();
        return b.height === 24 && b.left - title.right >= 6 && b.left - title.right <= 10
          && Math.abs(b.top + b.height / 2 - title.top - title.height / 2) < 1;
      }), `${id}: large Read only badges stay beside titles and centered at ${width}px`);
    }
    if (['condition', 'llm', 'tool'].includes(id)) {
      setValue(panel.querySelector('[aria-label="Parameter name"]'), 'Renamed'); await tick();
      const key = { condition: 'expression', llm: 'prompt', tool: 'arguments' }[id];
      check(getNode(id)[key] === '{{Renamed}}', `${id}: input aliases still reconcile`);
    }
    if (id === 'start') {
      check(Boolean(panel.querySelector('[aria-label="Inputs"] .workflow-agent-output-row')), 'Start schema uses shared Inputs rows');
      const inputRows = [...panel.querySelectorAll('[aria-label="Inputs"] .workflow-agent-output-row')];
      check(alignedFields(inputRows), 'Schema icons center on the full text block; required badges align with names');
      inputRows.forEach((row) => { const description = row.querySelector('.workflow-agent-output-copy > span'); if (description) description.style.display = 'none'; });
      check(alignedFields(inputRows), 'Schema alignment also holds without descriptions');
      const heading = panel.querySelector('[aria-label="Inputs"] .workflow-detail-field-heading');
      const name = heading.querySelector('strong').getBoundingClientRect();
      const type = heading.querySelector('.workflow-io-type').getBoundingClientRect();
      const required = heading.querySelector('.workflow-io-required').getBoundingClientRect();
      check(Math.abs(name.top - type.top) < 5 && Math.abs(name.top - required.top) < 5 && required.width < 80, 'Type and required are inline compact badges next to Message');
    }
    if (id === 'loop') {
      setValue(panel.querySelector('input[type="number"]'), '5'); await tick();
      check(getNode(id).max_loops === 5, 'Loop rerun limit persists');
      const policy = panel.querySelector('.workflow-retry-policy');
      check([...policy.querySelectorAll('.workflow-detail-select')].every((row) => row.getBoundingClientRect().height <= 44), 'Retry policy uses compact aligned rows');
      policy.querySelector('.model-picker-trigger').click(); await tick();
      [...policy.querySelectorAll('[role="option"]')].find((el) => el.textContent.trim() === 'Unlimited').click(); await tick();
      check(getNode(id).max_loops === null && !policy.querySelector('input'), 'Unlimited hides count and preserves null semantics');
      policy.querySelector('.model-picker-trigger').click(); await tick();
      [...policy.querySelectorAll('[role="option"]')].find((el) => el.textContent.trim() === 'Limited').click(); await tick();
      check(getNode(id).max_loops === 3 && Boolean(policy.querySelector('input')), 'Limited restores editable rerun count');
    }
    if (id === 'output') {
      check(alignedSelect(), 'Editable Response type icon, label and value visually align');
      const selector = panel.querySelector('.workflow-detail-select');
      check(Math.abs(centerY(selector.querySelector('.workflow-detail-select-label')) - centerY(selector.querySelector('.model-picker-trigger'))) < 1 && selector.getBoundingClientRect().height <= 44, 'Response type uses a compact aligned single row');
      panel.querySelector('.workflow-json-add').click(); await tick();
      check(Object.keys(getNode(id).output_mapping).length === 2, 'End Add Field persists');
      const field = panel.querySelector('[aria-label="Output field name"]'); field.focus();
      const previousValue = Object.values(getNode(id).output_mapping)[0];
      setValue(field, 'result'); await tick();
      check(document.activeElement === field && getNode(id).output_mapping.result === previousValue, 'End rename preserves focus and mapping');
      panel.querySelectorAll('.workflow-json-delete')[1].click(); await tick();
      check(Object.keys(getNode(id).output_mapping).length === 1, 'End delete field persists');
    }
    window.__detailsReadOnly(true); await tick();
    check(!panel.querySelector('.workflow-node-panel-head button') && [...panel.querySelectorAll('input,textarea')].every((el) => el.disabled), `${id}: read-only permissions retained`);
    if (id === 'loop') check(panel.querySelectorAll('.workflow-retry-policy .workflow-detail-select-static').length === 2 && !panel.querySelector('.workflow-retry-policy button, .workflow-retry-policy input'), 'Read-only retry policy displays clean values');
    check(!panel.querySelector('.workflow-variable-panel'), `${id}: read-only hides unavailable data insertion`);
    if (id === 'output') {
      check(Boolean(panel.querySelector('.workflow-detail-select-static')) && !panel.querySelector('.workflow-detail-select button'), 'Read-only Response type has no inactive caret or disabled frame');
      check(alignedSelect(), 'Read-only Response type icon, label and value visually align');
    }
    window.__detailsReadOnly(false); await tick();
  }
  await select('worker');
  panel.querySelector('.workflow-parameter-delete').click(); await tick();
  check(worker().parameters.length === 0 && !panel.querySelector('.workflow-parameter-empty, .workflow-parameter-list') && !panel.textContent.includes('No parameters'), 'Empty parameters omit placeholder and empty list');
  check(Boolean(panel.querySelector('.workflow-parameter-add')) && Boolean(panel.querySelector('.workflow-input-panel textarea')), 'Empty parameters retain Add Input and Message editing');
  const inputHead = panel.querySelector('.workflow-parameter-head').getBoundingClientRect();
  const message = panel.querySelector('.workflow-input-panel');
  check(Math.abs(message.getBoundingClientRect().top - inputHead.bottom) < 1 && getComputedStyle(message).borderTopWidth === '0px', 'Message follows Inputs directly without empty gap or doubled border');
  setValue(panel.querySelector('[aria-label="Agent prompt"]'), ''); await tick();
  window.__detailsReadOnly(true); await tick();
  check(!panel.querySelector('[aria-label="Prompt"]'), 'Read-only empty prompt leaves no divider or empty card');
  check(!panel.textContent.includes('No parameters') && Boolean(panel.querySelector('.workflow-input-panel textarea')), 'Read-only empty parameters omit placeholder but preserve Message');
  window.__detailsReadOnly(false); await tick();
  check(panel.querySelector('[aria-label="Agent prompt"]')?.disabled === false, 'Empty editable prompt remains available');
  await select('output');
  panel.querySelector('.settings-field .model-picker-trigger').click(); await tick();
  [...panel.querySelectorAll('[role="option"]')].find((el) => el.textContent.trim() === 'Text').click(); await tick();
  const finalText = panel.querySelector('[aria-label="Final text"]');
  check(Boolean(finalText) && !panel.querySelector('[aria-label="Outputs"] .workflow-io-panel'), 'End Text uses one card, no nested Final text frame');
  setValue(finalText, 'Final result'); await tick();
  check(getNode('output').output === 'Final result', 'Unframed End text still saves');
  check(Boolean(panel.querySelector('.workflow-variable-panel')), 'Editable End retains data insertion');
  window.__detailsReadOnly(true); await tick();
  check(!panel.querySelector('.workflow-variable-panel') && panel.querySelector('[aria-label="Final text"]').value === 'Final result', 'Read-only End hides insertion but retains output content');
  const edge = document.querySelector('.react-flow__edge');
  edge.dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  check(!document.querySelector('.workflow-node-panel') && !form.classList.contains('has-node-panel'), 'Selecting an edge removes details and panel space');
  document.querySelector('.react-flow__node[data-id="loop"]').click(); await tick();
  check(Boolean(document.querySelector('.workflow-node-panel [aria-label="Retry policy"]')), 'Node details reopen after edge selection');
  window.__detailsReadOnly(false); await tick();
  const beforeEdges = window.__detailsState.custom[0].edges.length;
  document.querySelector('.react-flow__edge').dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick();
  check(!document.querySelector('.workflow-node-panel') && Boolean(document.querySelector('[aria-label="Delete connection"]')), 'Editable edge has toolbar deletion without details');
  document.querySelector('[aria-label="Delete connection"]').click(); await tick();
  check(window.__detailsState.custom[0].edges.length === beforeEdges - 1, 'Toolbar deletion still removes the selected connection');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ModelPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { REASONING_EFFORT_OPTIONS } from '../../src/features/chat/model/run-catalog.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const changes = [];
const errors = [];
const results = [];
let control;
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const baseProps = { value: 'gpt-6.1-sol', options: [{ id: 'gpt-6.1-sol', label: 'gpt-6.1-sol' }], onChange: () => {} };

function Fixture() {
  const [effort, setEffort] = React.useState('xhigh');
  const [levels, setLevels] = React.useState(REASONING_EFFORT_OPTIONS);
  const [readOnly, setReadOnly] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  control = { setEffort, setLevels, setReadOnly, setDisabled, effort };
  return <AppTooltipProvider>
    <div className="chat-composer gauge-fixture" id="live-picker">
      <ModelPicker {...baseProps} reasoningEffort={effort} reasoningOptions={levels} readOnly={readOnly} disabled={disabled}
        onReasoningChange={(value) => { changes.push(value); setEffort(value); }} />
    </div>
    <div className="gauge-samples">
      {REASONING_EFFORT_OPTIONS.map((option) => <div className="chat-composer gauge-sample" key={option.id}>
        <span className="gauge-sample-label">{option.label}</span>
        <ModelPicker {...baseProps} reasoningEffort={option.id} readOnly />
      </div>)}
    </div>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const sleep = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
const live = () => document.getElementById('live-picker');
const gauge = () => live().querySelector('.model-picker-gauge');
function check(ok, label) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) throw new Error(label);
}
function checkAngle(expected, label) {
  const needle = live().querySelector('.model-picker-gauge-needle');
  const matrix = new DOMMatrixReadOnly(getComputedStyle(needle).transform);
  const radians = expected * Math.PI / 180;
  check(gauge().style.getPropertyValue('--gauge-rotation') === `${expected}deg`
    && Math.abs(matrix.a - Math.cos(radians)) < 0.001 && Math.abs(matrix.b - Math.sin(radians)) < 0.001, label);
}
function selectSlider(index) {
  const input = live().querySelector('input[type=range]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(index));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function run() {
  await sleep();
  checkAngle(75, 'Restored xhigh points to the original right-hand maximum');
  check(live().querySelector('button').getAttribute('aria-label') === 'Run configuration, gpt-6.1-sol · xhigh', 'Tooltip label retains the actual model and effort');
  live().querySelector('.model-picker-trigger').click(); await sleep();
  check(live().querySelector('input[type=range]').max === '3' && live().querySelectorAll('.model-picker-reasoning-marks i').length === 4, 'Slider exposes exactly four concrete effort levels, without Unspecified');
  const expected = [-165, -85, -5, 75];
  for (let index = 0; index < REASONING_EFFORT_OPTIONS.length; index += 1) {
    selectSlider(index); await sleep();
    const effort = REASONING_EFFORT_OPTIONS[index].id;
    check(control.effort === effort && changes.at(-1) === effort, `Slider selects ${effort} without changing its value`);
    checkAngle(expected[index], `${effort} stays in the fixed 240-degree arc`);
  }
  // Defensive low-level geometry only: runtime hooks normalize old null before rendering.
  control.setEffort(null); await sleep();
  check(control.effort === null && changes.at(-1) === 'xhigh', 'Restoring explicit null does not select none or emit a new effort');
  check(!live().querySelector('.model-picker-reasoning-marks .is-active'), 'Explicit null is not marked as a concrete effort');
  check(gauge().classList.contains('is-unspecified') && !live().querySelector('.model-picker-gauge-needle')
    && !gauge().style.getPropertyValue('--gauge-rotation'), 'Unspecified has a neutral hub without an effort needle');
  check(getComputedStyle(gauge()).color !== getComputedStyle(live().querySelector('.model-picker-trigger')).color, 'Unspecified is visually muted');
  control.setLevels(REASONING_EFFORT_OPTIONS.filter(({ id }) => ['low', 'medium', 'high', 'xhigh'].includes(id)));
  control.setEffort('xhigh'); await sleep(); checkAngle(75, 'A four-level catalog keeps the same maximum');
  control.setEffort('high'); await sleep(); checkAngle(-5, 'A four-level catalog retains the old high position');
  control.setLevels([{ id: 'high', label: 'high' }]); await sleep(); checkAngle(-45, 'A single supported level has centered geometry');
  control.setLevels([]); await sleep();
  check(!live().querySelector('.model-picker-gauge-needle') && gauge().classList.contains('is-unspecified'), 'Unavailable effort cannot invent a needle angle');
  control.setLevels(REASONING_EFFORT_OPTIONS); control.setEffort('xhigh'); control.setReadOnly(true); await sleep();
  check(live().querySelector('input[type=range]').disabled, 'Read-only still prevents effort edits');
  checkAngle(75, 'Read-only still displays the actual xhigh position');
  control.setDisabled(true); await sleep(); check(live().querySelector('.model-picker-trigger').disabled, 'Overall disabled state remains intact');
  control.setReadOnly(false); control.setDisabled(false); await sleep();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep();
  check(!live().querySelector('.model-picker-quick'), 'Escape still closes the picker');
  check(errors.length === 0, 'No page errors');
}
run().catch((error) => results.push(`FAIL ${error.message}`)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});

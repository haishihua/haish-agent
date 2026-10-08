import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimeConfig } from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import '../../styles.css';

const providers = [{ id: 'profile-a', requestProvider: 'profile-a', provider: 'openai', label: 'Source Provider', defaultModelId: 'gpt-6.1-sol', modelOptions: [{ id: 'gpt-6.1-sol' }] }];
let changes = 0;
window.fetch = async () => new Response(JSON.stringify({ provider: 'openai', models: ['gpt-6.1-sol'] }), { status: 200 });
function Fixture() {
  return <div style={{ width: 450, padding: 20 }}>
    <div id="snapshot"><WorkflowRuntimeConfig value={{ provider: 'openai', model_id: 'gpt-6.1-sol', reasoning_effort: 'high' }} providerOptions={providers} readOnly onChange={() => changes++} /></div>
    <div id="editable"><WorkflowRuntimeConfig value={{ provider: 'profile-a', model_id: 'gpt-6.1-sol', reasoning_effort: 'high' }} providerOptions={providers} onChange={() => changes++} /></div>
    <div id="removed"><WorkflowRuntimeConfig value={{ provider: 'removed-profile', model_id: 'custom-model' }} readOnly onChange={() => changes++} /></div>
    <div id="empty"><WorkflowRuntimeConfig /></div>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; checks.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
const trigger = (id, label) => document.querySelector(`#${id} [aria-label="${label}"]`);
const visibleIcon = (element) => {
  const icon = element?.querySelector('.settings-provider-icon');
  return icon && icon.getBoundingClientRect().width > 0 && getComputedStyle(icon).display !== 'none';
};
(async () => {
  for (let i = 0; i < 40 && !trigger('snapshot', 'Node provider'); i++) await tick();
  await tick(500);
  check(trigger('snapshot', 'Node provider').textContent.trim() === 'OpenAI', 'Historical brand key shows OpenAI instead of unavailable');
  for (const id of ['snapshot', 'editable', 'removed']) {
    check(visibleIcon(trigger(id, 'Node provider')) && visibleIcon(trigger(id, 'Node model')), `${id}: both closed fields retain icons`);
  }
  check(trigger('snapshot', 'Node model').textContent.includes('gpt-6.1-sol'), 'Historical model stays unchanged');
  check([...document.querySelectorAll('#snapshot [role="combobox"]')].every((item) => item.disabled), 'Historical fields remain read-only');
  check(!trigger('empty', 'Node provider').querySelector('.settings-provider-icon'), 'Empty provider keeps plain placeholder');
  const provider = trigger('editable', 'Node provider');
  provider.focus(); provider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await tick();
  check(visibleIcon(document.querySelector('[role="option"]')), 'Provider menu has icon');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  const model = trigger('editable', 'Node model');
  model.focus(); model.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await tick();
  check(visibleIcon(document.querySelector('[role="option"]')), 'Model menu has icon');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick();
  check(changes === 0, 'Rendering icons never rewrites configuration');
  checks.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); checks.dataset.result = 'FAIL'; });

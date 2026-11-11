import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimeConfig } from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import '../../styles.css';

const providers = [{ id: 'profile-a', requestProvider: 'profile-a', provider: 'openai', label: 'Source Provider', defaultModelId: 'gpt-6.1-sol', modelOptions: [{ id: 'gpt-6.1-sol' }] },
  // custom 中转站：显示名只写了中转站，真正跑的是 deepseek-v4-flash。
  { id: 'ai-router-ds', requestProvider: 'ai-router-ds', provider: 'custom', label: 'ai router-ds', defaultModelId: 'deepseek-v4-flash' }];
let changes = 0;
window.fetch = async () => new Response(JSON.stringify({ provider: 'openai', models: ['gpt-6.1-sol'] }), { status: 200 });
function Fixture() {
  return <div style={{ width: 450, padding: 20 }}>
    <div id="snapshot"><WorkflowRuntimeConfig value={{ provider: 'openai', model_id: 'gpt-6.1-sol', reasoning_effort: 'high' }} providerOptions={providers} readOnly onChange={() => changes++} /></div>
    <div id="editable"><WorkflowRuntimeConfig value={{ llm_config_id: 'profile-a', model_id: 'gpt-6.1-sol', reasoning_effort: 'high' }} providerOptions={providers} onChange={() => changes++} /></div>
    <div id="removed"><WorkflowRuntimeConfig value={{ provider: 'removed-profile', model_id: 'custom-model' }} readOnly onChange={() => changes++} /></div>
    <div id="record-snapshot"><WorkflowRuntimeConfig value={{ llm_config_id: 'profile-a', model_id: 'saved-model' }} providerOptions={providers} readOnly onChange={() => changes++} /></div>
    <div id="removed-record"><WorkflowRuntimeConfig value={{ llm_config_id: 'removed-profile', model_id: 'custom-model' }} readOnly onChange={() => changes++} /></div>
    <div id="model-only"><WorkflowRuntimeConfig value={{ model_id: 'orphan-model' }} readOnly onChange={() => changes++} /></div>
    <div id="empty"><WorkflowRuntimeConfig /></div>
    <div id="custom-ds"><WorkflowRuntimeConfig value={{ llm_config_id: 'ai-router-ds', model_id: 'deepseek-v4-flash', reasoning_effort: 'xhigh' }} providerOptions={providers} readOnly onChange={() => changes++} /></div>
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
  for (const id of ['snapshot', 'editable', 'removed', 'record-snapshot', 'removed-record']) {
    check(visibleIcon(trigger(id, 'Node provider')) && visibleIcon(trigger(id, 'Node model')), `${id}: both closed fields retain icons`);
  }
  check(trigger('snapshot', 'Node model').textContent.includes('gpt-6.1-sol'), 'Historical model stays unchanged');
  check(trigger('record-snapshot', 'Node provider').textContent.trim() === 'Source ProviderAPI' && trigger('record-snapshot', 'Node model').textContent.includes('saved-model'), 'Exact saved record keeps its identity, default API label and historical model outside the current catalog');
  check(trigger('removed-record', 'Node provider').textContent.trim().startsWith('RP') && trigger('removed-record', 'Node model').querySelector('.settings-provider-icon-custom'), 'Deleted record keeps its own initials and a generic model icon');
  check(!trigger('model-only', 'Node model').querySelector('.settings-provider-icon'), 'A model without a provider identity does not invent a brand');
  // 参考图二：路由行还是中转站自己（首字母 AR），只有模型行才是鲸鱼；两处都不套描边圆环。
  const dsProvider = trigger('custom-ds', 'Node provider');
  check(dsProvider.textContent.trim().startsWith('AR') && !dsProvider.querySelector('.settings-provider-logo'), 'Custom route keeps its own initials instead of borrowing the vendor brand');
  check(Boolean(trigger('custom-ds', 'Node model').querySelector('.settings-provider-logo'))
    && !trigger('custom-ds', 'Node model').querySelector('.settings-provider-icon-custom'), 'Custom route model shows the vendor brand inferred from the model id');
  const flat = (element) => {
    const style = getComputedStyle(element);
    return style.borderTopWidth === '0px' && style.backgroundColor === 'rgba(0, 0, 0, 0)';
  };
  check(flat(dsProvider.querySelector('.settings-provider-icon')) && flat(trigger('custom-ds', 'Node model').querySelector('.settings-provider-icon')), 'No bordered tile wraps the marker in either row');
  const customIcon = trigger('custom-ds', 'Node model').querySelector('.settings-provider-icon');
  check(customIcon.getBoundingClientRect().width <= 18, 'Vendor mark stays inside the 18px select slot');
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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowRuntimePage } from '../../src/features/workflow/components/WorkflowRuntimePage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { workflowNodeConfiguredState } from '../../src/features/tasks/hooks/createTaskStreamHandlers.js';
import deepseekMark from '@lobehub/icons-static-svg/icons/deepseek.svg?inline';
import '../../styles.css';
const config = { provider: 'source', model_id: 'gpt-5.5', reasoning_effort: 'high' };
// 运行中的 custom 中转站节点：provider 是 custom，模型名才说明厂商（deepseek）。
const dsConfig = { llm_config_id: 'ai-router-ds', model_id: 'deepseek-v4-flash', reasoning_effort: 'xhigh' };
const ids = ['clarify', 'goal_worker', 'goal_verifier'];
const dsNode = 'ds_worker';
const chain = [...ids, dsNode];
const workflow = { workflow_id: 'fixture.all-models', display_name: 'Goal Loop', nodes: [{ id: 'start', type: 'start' }, ...chain.map((id) => ({ id, type: 'agent', label: id, agent_id: 'preset.general' })), { id: 'output', type: 'output' }], edges: ['start', ...chain].map((id, i) => ({ from: id, to: [...chain, 'output'][i] })) };
const providers = [{ id: 'source', requestProvider: 'source', provider: 'openai', label: 'Source Provider', defaultModelId: 'gpt-5.5' },
  { id: 'ai-router-ds', requestProvider: 'ai-router-ds', provider: 'custom', label: 'ai router-ds', defaultModelId: 'deepseek-v4-flash' }];
window.fetch = async () => new Response(JSON.stringify({ models: ['gpt-5.5'] }), { status: 200 });
function Fixture() {
  const [task, setTask] = React.useState({ taskId: 'fixture', status: 'running', nodeRuntimeConfigs: { ...Object.fromEntries(ids.map((id) => [id, config])), [dsNode]: dsConfig }, workflowRun: { status: 'running', current_node_id: 'goal_worker', nodes: { clarify: { status: 'done', runtime_config: config }, goal_worker: { status: 'running' }, [dsNode]: { status: 'running' } } } });
  window.__setAllModelsTask = setTask;
  return <AppTooltipProvider><div className="app-workflow-stage" style={{ height: '100%', gridColumn: 'auto' }}><WorkflowRuntimePage workflow={workflow} task={task} providerOptions={providers} nodeRuntimeConfigs={task.nodeRuntimeConfigs} configReadOnly /></div></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const tick = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const report = document.getElementById('checks');
let failed = false;
const check = (ok, label) => { failed ||= !ok; report.textContent += `\n${ok ? 'PASS' : 'FAIL'} ${label}`; };
const select = async (id) => {
  document.querySelector(`.react-flow__node[data-id="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); await tick(500);
  [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Runtime Config').click(); await tick();
};
const shown = (model, effort = 'high', provider = 'Source Provider') => document.querySelector('[aria-label="Node provider"]')?.textContent.includes(provider) && document.querySelector('[aria-label="Node model"]')?.textContent.includes(model) && document.querySelector('[aria-label="Node thinking level"]')?.textContent.includes(effort);
(async () => {
  for (let i = 0; i < 60 && !document.querySelector('.react-flow__node[data-id="goal_worker"]'); i++) await tick();
  for (const id of [...ids, dsNode]) {
    await select(id);
    check(id === dsNode ? shown('deepseek-v4-flash', 'xhigh', 'ai router-ds') : shown('gpt-5.5'), `${id}: complete model config shown whether finished, running or pending`);
    check(document.querySelector(`[data-id="${id}"] .workflow-node-model`)?.textContent.includes(id === dsNode ? 'deepseek-v4-flash' : 'gpt-5.5'), `${id}: canvas model matches detail`);
  }
  // custom 中转站：画布上跟文字同色的标记要按模型名认出厂商，不超出 14px 的槽位，也不套描边圆环。
  const dsChip = document.querySelector(`[data-id="${dsNode}"] .workflow-node-model`);
  check(Boolean(dsChip?.querySelector('.settings-provider-logo')) && !dsChip.querySelector('.settings-provider-icon-custom'), 'Custom route canvas mark uses the model vendor instead of the generic box');
  const chipMark = dsChip.querySelector('.settings-provider-icon');
  // React Flow 给视口加了缩放，getBoundingClientRect() 拿到的是 14×zoom；量布局尺寸才能钉住槽位。
  check(getComputedStyle(chipMark).width === '14px', 'Canvas model mark stays inside the 14px slot');
  const flat = (element) => getComputedStyle(element).borderTopWidth === '0px' && getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)';
  check(flat(chipMark) && flat(document.querySelector('[aria-label="Node model"] .settings-provider-icon')), 'Neither the canvas chip nor the config row wraps the mark in a bordered tile');
  // logo 的墨色 = background: currentColor + mask：背景被洗成透明就等于没画（曾经的回归）。
  check(getComputedStyle(dsChip.querySelector('.settings-provider-logo')).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Canvas brand mark keeps its mask ink');
  // 潦鱼就是潦鱼：画布上的 mask 必须是 DeepSeek 那份矢量，不是泛化的任意厂商。
  check(dsChip.querySelector('.settings-provider-logo').style.getPropertyValue('--settings-provider-logo') === `url("${deepseekMark}")`, 'Canvas mark is the DeepSeek whale asset');
  check(document.querySelector('[aria-label="Node model"] .settings-provider-logo') !== null && getComputedStyle(document.querySelector('[aria-label="Node model"] .settings-provider-icon')).width === '18px', 'Runtime config model row keeps the vendor mark inside its slot');
  check(getComputedStyle(document.querySelector('[aria-label="Node model"] .settings-provider-logo')).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Runtime config model mark keeps its mask ink');
  window.__setAllModelsTask((task) => ({ ...task, workflowRun: { ...task.workflowRun, nodes: { ...task.workflowRun.nodes, goal_worker: workflowNodeConfiguredState({ runtime_config: { ...config, model_id: 'actual-model', reasoning_effort: 'low' } }, task.workflowRun.nodes.goal_worker) } } })); await tick();
  await select('goal_worker'); check(shown('actual-model', 'low'), 'Running Worker immediately displays actual runtime config without finishing');
  await select('goal_verifier'); check(shown('gpt-5.5'), 'Worker runtime update does not overwrite pending Verifier');
  window.__setAllModelsTask((task) => ({ ...task, nodeRuntimeConfigs: {}, requestedProvider: 'source', requestedModelId: 'gpt-5.5', requestedReasoningEffort: 'high' })); await tick();
  check(shown('gpt-5.5'), 'Older task with empty node map displays its recorded default route');
  check([...document.querySelectorAll('.workflow-runtime-config [role="combobox"]')].every((field) => field.disabled), 'Running task configuration remains read-only');
  report.dataset.result = failed ? 'FAIL' : 'PASS';
})().catch((error) => { check(false, error.stack); report.dataset.result = 'FAIL'; });

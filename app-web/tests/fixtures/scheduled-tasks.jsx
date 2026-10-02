import React from 'react';
import { createRoot } from 'react-dom/client';
import { SchedulesProvider } from '../../src/features/schedules/components/SchedulesProvider.jsx';
import { ConversationNode } from '../../src/features/conversations/components/ConversationNode.jsx';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '../../styles.css';

const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
const results = [];
const check = (ok, label) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let jobs = [];
let emit;
let created = 0;
let sent = 0;
let selected = 0;
let failSave = true;
const posts = [];
const configs = [];
const configApi = { get: async () => null, save: async (id, config) => { configs.push({ id, ...config }); return config; } };
const api = {
  list: async () => jobs,
  create: async (payload) => {
    posts.push(payload);
    if (failSave) { failSave = false; throw new Error('Explicit save failure'); }
    const job = { ...payload, id: 's1', name: payload.message, state: 'active', next_run_at: '2099-01-01T00:00:00Z' };
    jobs = [...jobs, job]; return job;
  },
  update: async (id, payload) => { jobs = jobs.map((job) => job.id === id ? { ...job, ...payload } : job); return jobs.find((job) => job.id === id); },
  pause: async (id) => { jobs = jobs.map((job) => job.id === id ? { ...job, state: 'paused' } : job); return jobs[0]; },
  resume: async (id) => { jobs = jobs.map((job) => job.id === id ? { ...job, state: 'active' } : job); return jobs[0]; },
  remove: async (id) => { jobs = jobs.filter((job) => job.id !== id); return { deleted: true }; },
  runs: async () => [{ id: 'r1', scheduled_at: '2026-10-01T00:00:00Z', status: 'failed', reason: 'Conversation provider removed' }],
};
const subscribe = (callback) => { emit = callback; return () => {}; };
// This fixture only mocks the model catalog; it never sends messages or calls a model.
window.fetch = async (url) => {
  if (String(url).endsWith('/api/llm/models')) return Response.json({ provider: 'test', models: ['model-1', 'model-2'], default_model: 'model-1' });
  throw new Error(`Unexpected request: ${url}`);
};
const providers = [{ id: 'p1', provider: 'test', label: 'Provider One', requestProvider: 'p1', defaultModelId: 'model-1', modelOptions: [{ id: 'model-1', label: 'model-1' }] }];
const agents = [{ id: 'agent-1', name: 'Agent', skills: [{ name: 'review', description: 'Review code' }] }];
function Fixture() {
  const [draft, setDraft] = React.useState('/');
  return <AppTooltipProvider><SchedulesProvider currentConversationId="c1" api={api} configApi={configApi} subscribe={subscribe} ensureConversation={async () => { created++; return 'c1'; }}>
    <div style={{ width: 300, margin: 20 }}><ConversationNode project={{ id: 'p' }} conversation={{ id: 'c1', name: '前端优化 2.0', tasks: [{ taskId: 't', status: 'running' }] }} onSelectConversation={() => selected++} /></div>
    <div style={{ width: 620, margin: 20 }}><ChatComposer scopeId="c1" draft={draft} onDraftChange={setDraft} onSend={() => sent++} providerOptions={providers} agentOptions={agents} defaultAgentId="agent-1" /></div>
  </SchedulesProvider></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
async function run() {
  await sleep(700);
  check(document.querySelector('.chat-skill-menu').textContent.includes('/schedule') && document.querySelector('.chat-skill-menu').textContent.includes('/review'), 'Schedule and skill share one slash panel');
  const command = [...document.querySelectorAll('.chat-skill-menu-item')].find((item) => item.textContent.includes('/schedule'));
  check(Boolean(command.querySelector('.lucide-clock')), 'Schedule has Clock icon');
  command.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(350);
  check(Boolean(document.querySelector('[role="dialog"]')) && sent === 0 && created === 0, 'Opening config does not create conversation or send message');
  check(document.querySelectorAll('.schedule-form select:not([aria-hidden="true"]), .schedule-form input[type="datetime-local"], .schedule-form input[type="date"], .schedule-form input[type="time"]').length === 0, 'No visible native select or date/time controls');
  check(document.querySelectorAll('.schedule-select-trigger').length === 1, 'Only time rule selector, no conversation selector');
  const checkFieldFocus = (node, label, border = 'rgb(65, 65, 65)') => {
    node.focus();
    const style = getComputedStyle(node);
    check(document.activeElement === node && style.boxShadow === 'none' && style.outlineStyle === 'none' && style.borderTopColor === border && style.borderTopWidth === '1px', `${label} focus retains only the normal thin border`);
  };
  checkFieldFocus(document.querySelector('.schedule-form textarea'), 'Task input');
  checkFieldFocus(document.querySelector('.schedule-select-trigger'), 'When selector');
  checkFieldFocus(document.querySelector('.schedule-datetime-trigger'), 'Date trigger');
  document.querySelector('.schedule-select-trigger').focus();
  check(document.querySelector('.schedule-dialog .haish-dialog-description').textContent === 'Runs in this conversation. Keep Haish open.', 'Description is concise');
  const usesWenKai = (node) => getComputedStyle(node).fontFamily.includes('LXGW WenKai Screen');
  const isGray = (node, property = 'backgroundColor') => {
    const channels = getComputedStyle(node)[property].match(/\d+/g)?.slice(0, 3);
    return channels?.length === 3 && channels.every((channel) => channel === channels[0]);
  };
  check([...document.querySelectorAll('.schedule-field label, .schedule-field button')].every(usesWenKai), 'When and date labels and values use WenKai');
  check([document.querySelector('.schedule-dialog'), document.querySelector('.schedule-select-trigger'), document.querySelector('.schedule-datetime-trigger'), document.querySelector('.schedule-form textarea'), button('Save task')].every((node) => isGray(node) && isGray(node, 'borderTopColor')), 'Dialog and controls use neutral gray backgrounds and borders');
  const kindTrigger = document.querySelector('.schedule-select-trigger');
  kindTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(100);
  check(Boolean(document.querySelector('.schedule-select-menu [role="option"]')), 'Reused Radix Select opens inside dialog');
  check(usesWenKai(document.querySelector('.schedule-select-menu')) && isGray(document.querySelector('.schedule-select-menu')), 'Portaled dropdown uses WenKai and gray palette');
  [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('Every N minutes')).click(); await sleep(100);
  check(Boolean(document.querySelector('.schedule-form input[type="number"]')) && !document.querySelector('.schedule-datetime-trigger'), 'Custom menu switches to interval');
  checkFieldFocus(document.querySelector('.schedule-form input[type="number"]'), 'Interval input');
  kindTrigger.focus();
  kindTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(100);
  [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('Cron')).click(); await sleep(100);
  check(Boolean(document.querySelector('input[placeholder="0 9 * * *"]')), 'Custom menu switches to cron');
  checkFieldFocus(document.querySelector('input[placeholder="0 9 * * *"]'), 'Cron input');
  checkFieldFocus(document.querySelector('input[placeholder="Asia/Shanghai"]'), 'Timezone input');
  kindTrigger.focus();
  kindTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(100);
  [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('Once')).click(); await sleep(100);
  const dateTrigger = document.querySelector('.schedule-datetime-trigger');
  dateTrigger.click(); await sleep(100);
  const popup = document.querySelector('.schedule-datetime-popover');
  const selectedDay = popup.querySelector('[data-selected="true"]');
  check(usesWenKai(popup) && usesWenKai(selectedDay) && isGray(popup) && isGray(selectedDay), 'Portaled calendar and selected day use WenKai and gray palette');
  const expectedDate = new Date(`${selectedDay.dataset.day}T00:00:00Z`); expectedDate.setUTCDate(expectedDate.getUTCDate() + 1);
  const expectedDay = expectedDate.toISOString().slice(0, 10);
  check(document.activeElement === selectedDay && popup.closest('body'), 'Calendar receives focus through modal portal');
  selectedDay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(40);
  check(document.activeElement.dataset.day === expectedDay, 'Calendar arrow key moves focus');
  document.activeElement.click(); await sleep(40);
  check(dateTrigger.textContent.includes(expectedDay.replaceAll('-', '/')), 'Calendar selection updates local date');
  const setNumber = (name, value) => {
    const input = popup.querySelector(`input[aria-label="${name}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setNumber('Hour', '18'); await sleep(30); setNumber('Minute', '45'); await sleep(30);
  check(dateTrigger.textContent.includes('18:45'), 'Custom hour and minute inputs update trigger');
  checkFieldFocus(popup.querySelector('input[aria-label="Hour"]'), 'Hour input', 'rgb(72, 72, 72)');
  checkFieldFocus(popup.querySelector('input[aria-label="Minute"]'), 'Minute input', 'rgb(72, 72, 72)');
  button('Done').click(); await sleep(100);
  check(!document.querySelector('.schedule-datetime-popover') && document.activeElement === dateTrigger, 'Closing calendar restores focus');
  dateTrigger.click(); await sleep(80);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(80);
  check(!document.querySelector('.schedule-datetime-popover') && Boolean(document.querySelector('.schedule-form')), 'Escape closes only calendar, not schedule dialog');
  dateTrigger.click(); await sleep(80);
  document.querySelector('[aria-label="Next month"]').click(); await sleep(40);
  const nextMonth = document.activeElement.dataset.day;
  document.querySelector('[aria-label="Previous month"]').click(); await sleep(40);
  check(nextMonth.slice(0, 7) !== expectedDay.slice(0, 7) && document.activeElement.dataset.day === expectedDay, 'Month buttons change calendar and preserve day focus');
  button('Done').click(); await sleep(80);
  const textarea = document.querySelector('[role="dialog"] textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Review project');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(30);
  button('Save task').click(); await sleep(100);
  check(document.querySelector('[role="alert"]').textContent.includes('Explicit save failure'), 'API errors are explicit');
  button('Save task').click(); await sleep(400);
  check(created === 1 && posts.length === 2 && posts.every((payload) => payload.conversation_id === 'c1'), 'Retry retains exactly one bound conversation');
  check(!('options' in posts[1]) && configs.at(-1).model_id === 'model-1' && sent === 0, 'Save synchronizes conversation model without a schedule snapshot or execution');
  const savedTime = new Date(posts[1].schedule.at);
  check(savedTime.getHours() === 18 && savedTime.getMinutes() === 45, 'Custom picker saves chosen local time as offset-aware ISO');
  document.querySelector('.model-picker-trigger').click(); await sleep(50);
  document.querySelector('[aria-label="Open agent and model settings"]').click(); await sleep(50);
  document.querySelectorAll('.model-picker-submenu-entry')[2].focus(); await sleep(50);
  [...document.querySelectorAll('.model-picker-flyout-model [role="option"]')].find((option) => option.textContent.includes('model-2')).click(); await sleep(150);
  check(configs.at(-1).model_id === 'model-2' && !('options' in jobs[0]), 'Changing model after creation updates conversation, not schedule');
  document.querySelector('.model-picker-trigger').click(); await sleep(50);
  const icon = document.querySelector('.conversation-schedule-icon');
  check(Boolean(icon) && getComputedStyle(icon).opacity === '1', 'Sidebar Clock remains visible without hover');
  const box = icon.getBoundingClientRect();
  const spinner = document.querySelector('.conversation-running-indicator').getBoundingClientRect();
  check(spinner.right <= box.left, 'Clock and running indicator do not overlap');
  icon.click(); await sleep(350);
  check(selected === 0, 'Clock opens management without selecting another conversation');
  const card = document.querySelector('.schedule-card');
  const description = document.querySelector('.haish-dialog-description');
  check(getComputedStyle(card).borderTopWidth === '1px' && getComputedStyle(card).borderRadius === '12px' && getComputedStyle(description).marginBottom === '10px', 'Management uses an independent rounded bordered card');
  check(card.querySelectorAll('.schedule-detail-icon svg').length === 4 && card.querySelectorAll('.schedule-detail-row').length === 3, 'Task and three metadata rows have icons');
  check(card.querySelector('.schedule-state').dataset.state === 'active' && Boolean(card.querySelector('.schedule-state-dot')), 'Active status uses a state badge and dot');
  const actionButtons = [...card.querySelectorAll('.schedule-card-actions button')];
  check(actionButtons.every((node) => node.querySelector('svg')) && new Set(actionButtons.map((node) => node.offsetWidth)).size === 1, 'Four equal-width actions include icons');
  check(getComputedStyle(card.querySelector('.schedule-edit')).backgroundColor === 'rgb(40, 108, 236)' && getComputedStyle(card.querySelector('.schedule-danger')).color === 'rgb(250, 118, 127)', 'Edit is blue and Delete is red');
  check(getComputedStyle(document.querySelector('.schedule-dialog-footer')).borderTopWidth === '1px', 'Close has a separate footer divider');
  check(card.textContent.split('Review project').length === 2, 'Auto-generated title does not duplicate task instruction');
  check(![...card.querySelectorAll('dt')].some((node) => node.textContent === 'Model') && !card.textContent.includes('Latest conversation configuration'), 'Model row is removed');
  check(document.querySelector('.schedule-dialog').offsetWidth === Math.min(400, window.innerWidth - 32) && getComputedStyle(document.querySelector('.haish-dialog-title')).fontSize === '18px' && getComputedStyle(description).fontSize === '12px', 'Panel restores original width and typography');
  check(getComputedStyle(card).fontSize === '13px' && getComputedStyle(card.querySelector('.schedule-detail-icon')).width === '28px' && getComputedStyle(card.querySelector('.schedule-card-actions button')).minHeight === '34px', 'Card icons and actions use compact proportions');
  button('Pause').click(); await sleep(100);
  check(Boolean(button('Resume')) && Boolean(document.querySelector('.conversation-schedule-icon')), 'Paused task retains reminder and can resume');
  button('Edit').click(); await sleep(100);
  check(document.querySelector('.schedule-datetime-trigger').textContent.includes('18:45'), 'Editing reuses custom picker with saved local time');
  button('Save task').click(); await sleep(100);
  check(!document.querySelector('.schedule-form') && jobs[0].schedule.at === posts[1].schedule.at, 'Unchanged edit preserves exact saved timestamp');
  button('History').click(); await sleep(100);
  check(document.querySelector('.schedule-history').textContent.includes('Conversation provider removed'), 'History shows failure reason');
  button('Delete').click(); await sleep(40);
  check(jobs.length === 1 && Boolean(button('Confirm delete')), 'Deletion requires confirmation');
  button('Confirm delete').click(); await sleep(100);
  check(!document.querySelector('.conversation-schedule-icon'), 'Deleting last schedule removes reminder');
  emit({ type: 'schedule.event', event: { schedule: { ...posts[1], id: 's2', name: 'Realtime', state: 'active' } } });
  await sleep(100);
  check(Boolean(document.querySelector('.conversation-schedule-icon')), 'Realtime creation restores sidebar reminder');
  check(document.querySelector('.schedule-card-heading strong').textContent === 'Realtime' && document.querySelector('.schedule-card').textContent.includes('Review project'), 'Custom title and full instruction remain visible');
  const longMessage = '扫一下昨天的trace 看下是否有提示词冲突，包含系统提示词及工具提示词，以及harness侧的配置。'.repeat(5);
  emit({ type: 'schedule.event', event: { schedule: { ...posts[1], id: 's2', name: Array.from(longMessage).slice(0, 80).join(''), message: longMessage, schedule: { kind: 'cron', expr: '0 0 * * *', timezone: 'Asia/Shanghai' }, next_run_at: '2026-10-01T16:00:00Z', state: 'active' } } });
  await sleep(100);
  const cronCard = document.querySelector('.schedule-card');
  check(cronCard.querySelector('.schedule-cron').textContent === '0 0 * * *' && cronCard.textContent.includes('Asia/Shanghai'), 'Cron expression badge and timezone have separate rows');
  check(cronCard.querySelector('time').textContent.includes('00:00:00'), 'Next run uses the cron timezone rather than browser timezone');
  check(getComputedStyle(cronCard.querySelector('strong')).webkitLineClamp === '2' && cronCard.querySelector('strong').title === longMessage, 'Long instruction is clamped with complete title retained');
  check(cronCard.scrollWidth <= cronCard.clientWidth, 'Long instructions do not overflow card');
  emit({ type: 'schedule.event', event: { schedule: { id: 's2', state: 'completed', next_run_at: null } } }); await sleep(100);
  check(button('Pause').disabled && document.querySelector('.schedule-state').dataset.state === 'completed' && !document.querySelector('.schedule-card time'), 'Completed status disables Pause and shows no next run');
  button('Close').click(); await sleep(300);
  check(errors.length === 0, `No runtime errors: ${errors.join('; ')}`);
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
}
run().catch((error) => { document.getElementById('checks').textContent = `FAIL ${error.stack}`; document.getElementById('checks').dataset.result = 'FAIL'; });

export const SCHEDULE_COMMAND = { name: 'schedule', description: 'Schedule task', command: true };

export function scheduleInvocation(text) {
  return String(text || '').match(/^\s*\/schedule(?:\s+([\s\S]*))?$/i);
}

export function scheduleMenuItems(text, skills, enabled) {
  const query = String(text || '').match(/^\s*\/([a-z0-9-]*)(?:\s+[\s\S]*)?$/i)?.[1];
  return enabled && query !== undefined && 'schedule'.startsWith(query.toLowerCase())
    ? [SCHEDULE_COMMAND, ...skills.filter((skill) => skill.name !== 'schedule')]
    : skills;
}

export function localDateTime(iso) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function scheduleFields(spec) {
  return {
    kind: spec?.kind || 'once',
    at: localDateTime(spec?.at || Date.now() + 3600000),
    minutes: spec?.seconds ? String(spec.seconds / 60) : '60',
    expr: spec?.expr || '0 9 * * *',
    timezone: spec?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function buildScheduleSpec(fields, now = Date.now()) {
  if (fields.kind === 'once') {
    const date = new Date(fields.at);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= now) throw new Error('Choose a future date and time.');
    // Reject local times in the DST spring gap instead of silently shifting them.
    if (localDateTime(date) !== fields.at) throw new Error('This local time does not exist. Choose another time.');
    return { kind: 'once', at: date.toISOString() };
  }
  if (fields.kind === 'interval') {
    const minutes = Number(fields.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525600) throw new Error('Interval must be 1–525600 whole minutes.');
    return { kind: 'interval', seconds: minutes * 60 };
  }
  if (fields.kind !== 'cron' || fields.expr.trim().split(/\s+/).length !== 5) throw new Error('Use a five-field cron expression.');
  try { new Intl.DateTimeFormat('en', { timeZone: fields.timezone.trim() }); }
  catch { throw new Error('Use a valid IANA timezone.'); }
  return { kind: 'cron', expr: fields.expr.trim(), timezone: fields.timezone.trim() };
}

export function scheduleSummary(spec) {
  if (spec.kind === 'once') return new Date(spec.at).toLocaleString();
  if (spec.kind === 'interval') return `Every ${spec.seconds / 60} min`;
  return `${spec.expr} · ${spec.timezone}`;
}

export function applyScheduleEvent(items, message) {
  if (message.type !== 'schedule.event') return items;
  const event = message.event;
  if (event.action === 'deleted') return items.filter((item) => item.id !== event.schedule_id);
  if (event.schedule) {
    const previous = items.find((item) => item.id === event.schedule.id);
    return [...items.filter((item) => item.id !== event.schedule.id), { ...previous, ...event.schedule }];
  }
  if (event.run) return items.map((item) => item.id === event.run.schedule_id ? { ...item, last_run: event.run } : item);
  return items;
}

export function createScheduleBinding(materialize, conversationIdRef) {
  return async (message, expectedId) => {
    if (conversationIdRef.current !== expectedId) throw new Error('The current conversation changed. Reopen Schedule task in the intended conversation.');
    const result = await materialize({ text: message });
    if (!result?.id) throw new Error('Could not create the bound conversation.');
    return result.id;
  };
}

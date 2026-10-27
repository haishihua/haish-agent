import React from 'react';
import { CalendarDays, Clock3, FileText, Globe2 } from 'lucide-react';
import { scheduleSummary } from '../model/schedule.js';

function DetailRow({ icon: Icon, label, children }) {
  return <div className="schedule-detail-row">
    <span className="schedule-detail-icon"><Icon size={16} aria-hidden="true" /></span>
    <div className="schedule-detail-content"><dt>{label}</dt><dd>{children}</dd></div>
  </div>;
}

export function ScheduleCard({ job, children }) {
  // The stored name is often just the head of the message (auto-derived at create
  // time, or left behind after the message was edited). Printing both reads as a
  // duplicated title, so collapse to the single most informative line. The
  // backend refreshes derived names on edit and marks custom ones explicit; the
  // prefix check remains as a fallback for records written before that flag.
  const name = String(job.name || '').trim();
  const message = String(job.message || '').trim();
  const derived = !name || name === Array.from(message).slice(0, 80).join('').trim()
    || message.startsWith(name);
  const title = derived ? message || name : name;
  const subtitle = derived ? '' : message;
  const timezone = job.schedule.kind === 'cron' ? job.schedule.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nextRun = job.next_run_at ? new Intl.DateTimeFormat(undefined, {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(job.next_run_at)) : '—';
  const label = { once: 'Schedule (Once)', interval: 'Schedule (Interval)', cron: 'Schedule (Cron)' }[job.schedule.kind];
  return <article className="schedule-card">
    <div className="schedule-card-heading">
      <span className="schedule-detail-icon"><FileText size={16} aria-hidden="true" /></span>
      <div className="schedule-card-title">
        <strong title={title}>{title}</strong>
        {subtitle && <p className="schedule-card-message" title={subtitle}>{subtitle}</p>}
      </div>
      <span className="schedule-state" data-state={job.state}><span className="schedule-state-dot" aria-hidden="true" />{job.state}</span>
    </div>
    <dl className="schedule-details">
      <DetailRow icon={Clock3} label={label}>{job.schedule.kind === 'cron'
        ? <code className="schedule-cron">{job.schedule.expr}</code> : scheduleSummary(job.schedule)}</DetailRow>
      <DetailRow icon={CalendarDays} label="Next run">{job.next_run_at ? <time dateTime={job.next_run_at}>{nextRun}</time> : '—'}</DetailRow>
      <DetailRow icon={Globe2} label="Timezone">{timezone}</DetailRow>
    </dl>
    {job.paused_reason && job.paused_reason !== 'user_paused' && <p className="schedule-card-note">{job.paused_reason}</p>}
    {children}
  </article>;
}

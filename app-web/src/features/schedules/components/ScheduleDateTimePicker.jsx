import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../../../shared/ui/settings-elements/ui/popover.tsx';
import { calendarDate, calendarKeyTarget, monthDays, shiftMonth } from '../model/calendar.js';

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const dateLabel = (key) => calendarDate(key).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export function ScheduleDateTimePicker({ id, value, onChange, disabled, container }) {
  const [open, setOpen] = React.useState(false);
  const selected = value.slice(0, 10);
  const [activeDay, setActiveDay] = React.useState(selected);
  const daysRef = React.useRef(new Map());
  const focusDay = React.useRef(false);
  const days = monthDays(activeDay);
  const hour = value.slice(11).split(':')[0];
  const minute = value.slice(11).split(':')[1];
  React.useLayoutEffect(() => {
    if (focusDay.current) {
      daysRef.current.get(activeDay)?.focus();
      focusDay.current = false;
    }
  }, [activeDay]);
  function move(next) {
    focusDay.current = true;
    setActiveDay(next);
  }
  function setTime(part, next) {
    const text = next === '' ? '' : next.padStart(2, '0');
    onChange(`${selected}T${part === 'hour' ? text : hour}:${part === 'minute' ? text : minute}`);
  }
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setActiveDay(selected); }}>
    <PopoverTrigger asChild><button id={id} type="button" className="schedule-datetime-trigger" disabled={disabled} aria-label="Date and time (local)">
      <span>{selected.replaceAll('-', '/')} · {hour}:{minute}</span><CalendarDays size={16} aria-hidden="true" />
    </button></PopoverTrigger>
    <PopoverContent container={container} align="start" className="schedule-datetime-popover" aria-label="Choose date and time"
      onOpenAutoFocus={(event) => { event.preventDefault(); daysRef.current.get(selected)?.focus(); }}>
      <div className="schedule-calendar-header">
        <button type="button" aria-label="Previous month" onClick={() => move(shiftMonth(activeDay, -1))}><ChevronLeft size={16} /></button>
        <strong aria-live="polite">{calendarDate(activeDay).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
        <button type="button" aria-label="Next month" onClick={() => move(shiftMonth(activeDay, 1))}><ChevronRight size={16} /></button>
      </div>
      <div role="grid" aria-label="Calendar" className="schedule-calendar">
        <div role="row" className="schedule-calendar-week">{weekdays.map((day) => <span role="columnheader" key={day}>{day}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div role="row" className="schedule-calendar-week" key={week}>
          {days.slice(week * 7, week * 7 + 7).map((day) => <div role="gridcell" aria-selected={day === selected} key={day}>
            <button type="button" ref={(node) => { if (node) daysRef.current.set(day, node); else daysRef.current.delete(day); }}
              data-day={day} data-selected={day === selected} data-outside={day.slice(0, 7) !== activeDay.slice(0, 7)}
              tabIndex={day === activeDay ? 0 : -1} aria-label={dateLabel(day)} aria-pressed={day === selected}
              onClick={() => { setActiveDay(day); onChange(`${day}T${hour}:${minute}`); }}
              onKeyDown={(event) => {
                const next = calendarKeyTarget(day, event.key);
                if (next) { event.preventDefault(); move(next); }
              }}>{Number(day.slice(8))}</button>
          </div>)}
        </div>)}
      </div>
      <div className="schedule-time-fields" role="group" aria-label="Time (24-hour)">
        <label>Hour<input aria-label="Hour" type="number" min="0" max="23" step="1" value={hour} onChange={(event) => setTime('hour', event.target.value)} /></label>
        <span aria-hidden="true">:</span>
        <label>Minute<input aria-label="Minute" type="number" min="0" max="59" step="1" value={minute} onChange={(event) => setTime('minute', event.target.value)} /></label>
        <button type="button" onClick={() => setOpen(false)}>Done</button>
      </div>
      <p className="schedule-timezone-note">Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
    </PopoverContent>
  </Popover>;
}

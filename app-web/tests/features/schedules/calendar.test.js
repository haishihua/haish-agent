import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarKeyTarget, monthDays, shiftDay, shiftMonth } from '../../../src/features/schedules/model/calendar.js';

test('month grid covers six Sunday-first weeks including leap day', () => {
  const days = monthDays('2028-02-20');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2028-01-30');
  assert.ok(days.includes('2028-02-29'));
  assert.equal(days.at(-1), '2028-03-11');
});
test('month navigation clamps end-of-month and crosses year boundaries', () => {
  assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
  assert.equal(shiftMonth('2027-01-31', 1), '2027-02-28');
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftMonth('2026-12-31', 1), '2027-01-31');
});
test('date-only navigation is independent of DST', () => {
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
});
test('calendar keyboard supports days, weeks, week edges, and months', () => {
  const commands = { ArrowLeft: '2026-10-14', ArrowRight: '2026-10-16', ArrowUp: '2026-10-08', ArrowDown: '2026-10-22', Home: '2026-10-11', End: '2026-10-17', PageUp: '2026-09-15', PageDown: '2026-11-15' };
  for (const [key, expected] of Object.entries(commands)) assert.equal(calendarKeyTarget('2026-10-15', key), expected);
  assert.equal(calendarKeyTarget('2026-10-15', 'Escape'), null);
});

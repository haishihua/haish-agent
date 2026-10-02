import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
test('schedule controls reuse shared Select and Popover, never native pickers', () => {
  const form = read('features/schedules/components/ScheduleDialog.jsx');
  const picker = read('features/schedules/components/ScheduleDateTimePicker.jsx');
  assert.match(form, /shared\/ui\/settings-elements\/ui\/select\.tsx/);
  assert.match(picker, /shared\/ui\/settings-elements\/ui\/popover\.tsx/);
  assert.doesNotMatch(`${form}\n${picker}`, /<select\b|type=["'](?:datetime-local|date|time)["']/);
  assert.match(form, /container = document\.body/);
  assert.match(form, /<SelectContent container=\{container\}/);
  assert.match(picker, /<PopoverContent container=\{container\}/);
});

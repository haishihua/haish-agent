// Calendar arithmetic uses UTC date-only values, independently of local DST.
const pad = (value) => String(value).padStart(2, '0');
export function calendarDate(key) {
  return new Date(`${key}T00:00:00Z`);
}
export function dateKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function shiftDay(key, count) {
  const date = calendarDate(key);
  date.setUTCDate(date.getUTCDate() + count);
  return dateKey(date);
}
export function shiftMonth(key, count) {
  const date = calendarDate(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return dateKey(date);
}
export function monthDays(key) {
  const first = `${key.slice(0, 7)}-01`;
  const start = shiftDay(first, -calendarDate(first).getUTCDay());
  return Array.from({ length: 42 }, (_, index) => shiftDay(start, index));
}
export function calendarKeyTarget(key, command) {
  const weekday = calendarDate(key).getUTCDay();
  switch (command) {
    case 'ArrowLeft': return shiftDay(key, -1);
    case 'ArrowRight': return shiftDay(key, 1);
    case 'ArrowUp': return shiftDay(key, -7);
    case 'ArrowDown': return shiftDay(key, 7);
    case 'Home': return shiftDay(key, -weekday);
    case 'End': return shiftDay(key, 6 - weekday);
    case 'PageUp': return shiftMonth(key, -1);
    case 'PageDown': return shiftMonth(key, 1);
    default: return null;
  }
}

// Plain-node tests (no framework in this repo):  node src/utils/legacySchedule.test.js
const assert = require('assert');
const { parseLegacyDays, parseLegacyTimeRange, parseLegacyWorkingSchedule, parseLegacyBusinessHours, parseLegacyDuration } = require('./legacySchedule');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

test('days: ranges in several spellings', () => {
  for (const t of ['Mon-Fri', 'mon - fri', 'Monday to Friday', 'Mon–Fri', 'MON-FRI', 'Weekdays']) assert.deepStrictEqual(parseLegacyDays(t), WEEKDAYS, t);
});
test('days: lists, wrap-around, every day, weekends', () => {
  assert.deepStrictEqual(parseLegacyDays('Mon, Wed, Fri'), ['monday', 'wednesday', 'friday']);
  assert.deepStrictEqual(parseLegacyDays('Sat-Mon'), ['monday', 'saturday', 'sunday']);
  assert.strictEqual(parseLegacyDays('Every day').length, 7);
  assert.deepStrictEqual(parseLegacyDays('weekends'), ['saturday', 'sunday']);
});
test('days: unreadable text is null, never guessed', () => {
  for (const t of ['when needed', 'Mon-Funday', '', null, undefined, 'by appointment']) assert.strictEqual(parseLegacyDays(t), null, String(t));
});
test('time: clear ranges convert', () => {
  assert.deepStrictEqual(parseLegacyTimeRange('8am-6pm'), { ambiguous: false, start: '08:00', end: '18:00' });
  assert.deepStrictEqual(parseLegacyTimeRange('8:30 AM to 5:15 PM'), { ambiguous: false, start: '08:30', end: '17:15' });
  assert.deepStrictEqual(parseLegacyTimeRange('08:00-17:00'), { ambiguous: false, start: '08:00', end: '17:00' });
  assert.deepStrictEqual(parseLegacyTimeRange('8:00am - 18:00'), { ambiguous: true, reason: 'missing_am_pm' }); // mixed notation: don't guess
});
test('time: "8am-6am" is flagged ambiguous, NOT silently converted', () => {
  const r = parseLegacyTimeRange('8am-6am');
  assert.strictEqual(r.ambiguous, true);
  assert.strictEqual(r.reason, 'end_not_after_start');
  assert.strictEqual(parseLegacyTimeRange('10am-5am').ambiguous, true);
});
test('time: no am/pm is ambiguous; non-ranges are null', () => {
  assert.strictEqual(parseLegacyTimeRange('8-5').ambiguous, true);
  assert.strictEqual(parseLegacyTimeRange('whenever'), null);
});
test('worker schedule: Blessing\'s real values -> days convert, hours flagged for review', () => {
  const r = parseLegacyWorkingSchedule('Mon-Fri', '8am-6am');
  assert.deepStrictEqual(r.days, WEEKDAYS);
  assert.strictEqual(r.hours, null);
  assert.strictEqual(r.hoursNeedReview, true);
  assert.strictEqual(r.daysNeedReview, false);
});
test('business hours: clear pattern becomes a 7-day schedule', () => {
  const r = parseLegacyBusinessHours('Mon-Fri, 10am-5pm');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.schedule.length, 7);
  assert.deepStrictEqual(r.schedule[0], { day: 'monday', open: true, is24h: false, opens: '10:00', closes: '17:00', endsNextDay: false });
  assert.deepStrictEqual(r.schedule[5], { day: 'saturday', open: false });
});
test('business hours: Blessing\'s real value ("Mon-Fri, 10am-5am") is NOT converted', () => {
  const r = parseLegacyBusinessHours('Mon-Fri, 10am-5am');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'end_not_after_start');
});
test('business hours: complex or unclear text is left alone', () => {
  assert.strictEqual(parseLegacyBusinessHours('Mon-Fri 8am-5pm, Sat 9am-1pm').ok, false);
  assert.strictEqual(parseLegacyBusinessHours('Open daily').ok, false);
  assert.strictEqual(parseLegacyBusinessHours('').ok, false);
});
test('duration: explicit units convert', () => {
  assert.deepStrictEqual(parseLegacyDuration('2 weeks'), { value: 2, unit: 'weeks', assumedUnit: false });
  assert.deepStrictEqual(parseLegacyDuration('3 days'), { value: 3, unit: 'days', assumedUnit: false });
  assert.deepStrictEqual(parseLegacyDuration('1 month'), { value: 1, unit: 'months', assumedUnit: false });
  assert.deepStrictEqual(parseLegacyDuration('5hrs'), { value: 5, unit: 'hours', assumedUnit: false });
});
test('duration: a bare number is read as days and flagged as an assumption', () => {
  assert.deepStrictEqual(parseLegacyDuration('30'), { value: 30, unit: 'days', assumedUnit: true });
});
test('duration: ranges, zero and junk are not converted', () => {
  for (const t of ['1-2 days', '0', '0 days', 'a few days', '', null, '2 fortnights']) assert.strictEqual(parseLegacyDuration(t), null, String(t));
});

console.log(`\n${passed} tests passed`);

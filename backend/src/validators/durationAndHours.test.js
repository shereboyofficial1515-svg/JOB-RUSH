// Plain-node tests:  node src/validators/durationAndHours.test.js
const assert = require('assert');
const v = require('./profileValidators');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };
const accepts = (schema, body) => assert.ok(schema.safeParse(body).success, `should accept ${JSON.stringify(body)}`);
const rejects = (schema, body, messagePart) => {
  const r = schema.safeParse(body);
  assert.ok(!r.success, `should reject ${JSON.stringify(body)}`);
  if (messagePart) assert.ok(r.error.issues.some((i) => i.message.includes(messagePart)), `expected "${messagePart}" in: ${r.error.issues.map((i) => i.message).join(' | ')}`);
};

const create = v.createProfessionalServiceSchema;
const update = v.updateProfessionalServiceSchema;

test('service duration: every supported unit is accepted', () => {
  for (const unit of ['hours', 'days', 'weeks', 'months', 'years']) accepts(create, { name: 'Wiring', durationValue: 3, durationUnit: unit });
});
test('service duration: amount without unit, and unit without amount, are rejected', () => {
  rejects(create, { name: 'Wiring', durationValue: 30 }, 'needs both');
  rejects(create, { name: 'Wiring', durationUnit: 'days' }, 'needs both');
});
test('service duration: zero, negative, decimal and over-limit amounts are rejected', () => {
  rejects(create, { name: 'Wiring', durationValue: 0, durationUnit: 'days' }, 'at least 1');
  rejects(create, { name: 'Wiring', durationValue: -5, durationUnit: 'days' }, 'at least 1');
  rejects(create, { name: 'Wiring', durationValue: 1.5, durationUnit: 'weeks' }, 'whole number');
  rejects(create, { name: 'Wiring', durationValue: 1000, durationUnit: 'days' }, 'at most 999');
});
test('service duration: unknown unit and non-numeric amount are rejected', () => {
  rejects(create, { name: 'Wiring', durationValue: 3, durationUnit: 'fortnights' }, 'Choose hours');
  rejects(create, { name: 'Wiring', durationValue: '30', durationUnit: 'days' }, 'must be a number');
});
test('service duration: optional overall; both null clears it on update', () => {
  accepts(create, { name: 'Wiring' });
  accepts(update, { durationValue: null, durationUnit: null });
  accepts(update, { durationValue: 2, durationUnit: 'weeks' });
  rejects(update, { durationValue: 2 }, 'needs both');
});
test('service pricing: weekly and monthly units are supported; price and duration stay separate fields', () => {
  accepts(create, { name: 'Retainer', pricingType: 'weekly', price: 100000 });
  accepts(create, { name: 'Retainer', pricingType: 'monthly', price: 300000, durationValue: 3, durationUnit: 'months' });
  rejects(create, { name: 'Retainer', pricingType: 'yearly', price: 1 });
});
test('service: the legacy free-text duration is no longer accepted as a way to set one', () => {
  const r = create.safeParse({ name: 'Wiring', durationEstimate: '30' });
  assert.ok(r.success && r.data.durationEstimate === undefined, 'unknown key must be stripped, not stored');
});

const hours = v.upsertBusinessProfileSchema;
const week = (overrides = {}) => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, i) => (
  overrides[day] || (i < 5 ? { day, open: true, opens: '10:00', closes: '17:00' } : { day, open: false })
));

test('business hours: a normal week is accepted (open weekdays, closed weekend)', () => {
  accepts(hours, { openingHoursStructured: week() });
});
test('business hours: different hours per day, 24-hour and closed days are accepted', () => {
  accepts(hours, { openingHoursStructured: week({
    monday: { day: 'monday', open: true, opens: '08:00', closes: '12:30' },
    saturday: { day: 'saturday', open: true, is24h: true },
  }) });
});
test('business hours: closing before opening is rejected unless "closes next day" is set', () => {
  rejects(hours, { openingHoursStructured: week({ monday: { day: 'monday', open: true, opens: '10:00', closes: '05:00' } }) }, 'Closes next day');
  accepts(hours, { openingHoursStructured: week({ friday: { day: 'friday', open: true, opens: '22:00', closes: '05:00', endsNextDay: true } }) });
});
test('business hours: equal times, missing times and malformed times are rejected', () => {
  rejects(hours, { openingHoursStructured: week({ monday: { day: 'monday', open: true, opens: '09:00', closes: '09:00' } }) }, 'cannot be the same');
  rejects(hours, { openingHoursStructured: week({ monday: { day: 'monday', open: true, opens: '09:00' } }) }, 'Set opening and closing');
  rejects(hours, { openingHoursStructured: week({ monday: { day: 'monday', open: true, opens: '9am', closes: '5pm' } }) }, 'valid 24-hour');
});
test('business hours: must be exactly 7 days in Monday..Sunday order with no duplicates', () => {
  rejects(hours, { openingHoursStructured: week().slice(0, 6) }, 'all 7 days');
  const swapped = week(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  rejects(hours, { openingHoursStructured: swapped }, 'must be');
  rejects(hours, { openingHoursStructured: week({ monday: { day: 'funday', open: false } }) });
});
test('business hours: the free-text openingHours field is no longer accepted', () => {
  const r = hours.safeParse({ businessName: 'Acme', openingHours: 'Mon-Fri, 10am-5am' });
  assert.ok(r.success && r.data.openingHours === undefined, 'unknown key must be stripped, not stored');
});

console.log(`\n${passed} tests passed`);

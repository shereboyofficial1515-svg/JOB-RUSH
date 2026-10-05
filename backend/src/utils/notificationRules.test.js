// Plain-node tests:  node src/utils/notificationRules.test.js
// Notification categories (server) and the notification-centre helpers (browser module, run in a sandbox).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cats = require('../services/notificationCategories');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };

// ---------------------------------------------------------------- categories
test('every notification type that has a category maps to a known category', () => {
  for (const type of ['new_message', 'call_missed', 'application_received', 'interview_scheduled', 'escrow_released', 'new_device_login', 'announcement']) {
    assert.ok(cats.CATEGORY_KEYS.includes(cats.categoryForType(type)), type);
  }
  assert.strictEqual(cats.categoryForType('support_ticket_updated'), null); // support replies are never switched off
  assert.strictEqual(cats.categoryForType('something_new'), null);
});
test('defaults: everything on except announcements; security is always on', () => {
  const p = cats.resolveCategoryPrefs(null);
  assert.strictEqual(p.messages, true);
  assert.strictEqual(p.marketing, false);
  assert.strictEqual(cats.resolveCategoryPrefs({ security: false }).security, true);
});
test('stored switches override defaults; junk values are ignored', () => {
  const p = cats.resolveCategoryPrefs({ missed_calls: false, marketing: true, jobs: 'no', nonsense: true });
  assert.strictEqual(p.missed_calls, false);
  assert.strictEqual(p.marketing, true);
  assert.strictEqual(p.jobs, true);
  assert.ok(!('nonsense' in p));
});
test('an update from the client keeps only known, non-locked boolean switches', () => {
  assert.deepStrictEqual(cats.sanitizeCategoryUpdate({ audio_calls: false, security: false, bogus: true, jobs: 'x' }), { audio_calls: false });
  assert.deepStrictEqual(cats.sanitizeCategoryUpdate(null), {});
});

// ---------------------------------------------------------------- notification centre helpers (browser module)
const src = fs.readFileSync(path.join(__dirname, '../../../frontend/js/modules/notificationBell.js'), 'utf8');
const ctx = { esc: (s) => String(s), Icons: {}, API: {}, document: {}, window: {}, console };
vm.createContext(ctx);
vm.runInContext(`${src}\nthis.NB = NotificationBell;`, ctx);
const NB = ctx.NB;

test('timestamps: just now / min / hr / yesterday / weekday / short date / dated', () => {
  const now = new Date(2026, 9, 14, 15, 0, 0); // Wed 14 Oct 2026, 15:00 local
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.strictEqual(NB.timeAgo(ago(20 * 1000), now), 'Just now');
  assert.strictEqual(NB.timeAgo(ago(2 * 60 * 1000), now), '2 min ago');
  assert.strictEqual(NB.timeAgo(ago(18 * 60 * 1000), now), '18 min ago');
  assert.strictEqual(NB.timeAgo(ago(2 * 3600 * 1000), now), '2 hr ago');
  assert.strictEqual(NB.timeAgo(new Date(2026, 9, 13, 9, 0, 0).toISOString(), now), 'Yesterday');
  assert.ok(/^[A-Za-z]+$/.test(NB.timeAgo(new Date(2026, 9, 10, 9, 0, 0).toISOString(), now))); // a weekday name
  assert.ok(/Oct|Sep|\d/.test(NB.timeAgo(new Date(2026, 8, 1, 9, 0, 0).toISOString(), now)) && !/2026/.test(NB.timeAgo(new Date(2026, 8, 1, 9, 0, 0).toISOString(), now)));
  assert.ok(/2025/.test(NB.timeAgo(new Date(2025, 9, 3, 9, 0, 0).toISOString(), now)));
  assert.strictEqual(NB.timeAgo('not a date', now), '');
});
test('messages from the same conversation merge into one row; calls and other types never merge', () => {
  const n = (id, type, conv, read) => ({ id, type, data: conv ? { conversationId: conv } : {}, read_at: read ? 'x' : null, created_at: '2026-10-14T10:00:00Z' });
  const out = NB.groupNotifications([n(1, 'new_message', 'c1', true), n(2, 'new_message', 'c1', false), n(3, 'new_message', 'c1', true), n(4, 'call_missed', 'c1'), n(5, 'call_missed', 'c1'), n(6, 'new_message', 'c2'), n(7, 'payment_x')]);
  assert.strictEqual(out.length, 5);
  assert.strictEqual(out[0].count, 3);
  assert.strictEqual(out[0].read_at, null); // any unread inside keeps the group unread
  assert.deepStrictEqual(Array.from(out[0].ids), [1, 2, 3]);
  assert.strictEqual(out[1].type, 'call_missed');
  assert.strictEqual(out[2].type, 'call_missed'); // two missed calls stay two rows
});
test('tapping a notification goes to the right place', () => {
  assert.strictEqual(NB.targetFor({ type: 'new_message', data: { conversationId: 'abc' } }), '/pages/messages.html?conversation=abc');
  assert.strictEqual(NB.targetFor({ type: 'call_missed', data: { conversationId: 'abc', callId: 'z' } }), '/pages/messages.html?conversation=abc');
  assert.strictEqual(NB.targetFor({ type: 'escrow_released', data: {} }), '/pages/wallet.html');
  assert.strictEqual(NB.targetFor({ type: 'interview_scheduled', data: {} }), '/pages/interviews.html');
  assert.strictEqual(NB.targetFor({ type: 'unknown_type', data: {} }), null);
});
test('a notification row renders title, description, time and an unread marker, escaped', () => {
  const html = NB.rowHtml({ id: 'n1', type: 'call_missed', title: 'Missed audio call', body: 'A called you', created_at: new Date().toISOString(), read_at: null, data: { conversationId: 'c' } });
  assert.ok(html.includes('Missed audio call') && html.includes('A called you') && html.includes('is-unread') && html.includes('notif-dot') && html.includes('<time'));
});

console.log(`${passed} tests passed`);

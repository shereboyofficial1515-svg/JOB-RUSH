// Plain-node test: node src/middleware/publicWorkerGuard.test.js
const assert = require('assert');
const { isUuid } = require('./publicWorkerGuard');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };

test('a well-formed uuid is accepted (any case)', () => {
  assert.strictEqual(isUuid('4491c88f-bfc0-4135-873e-0b2a53b70b66'), true);
  assert.strictEqual(isUuid('4491C88F-BFC0-4135-873E-0B2A53B70B66'), true);
});

test('anything else is rejected, including non-strings, so it never reaches the database', () => {
  for (const bad of ['not-a-uuid', '', ' ', '4491c88f-bfc0-4135-873e-0b2a53b70b6', "4491c88f-bfc0-4135-873e-0b2a53b70b66'; DROP TABLE users;--", undefined, null, 123, {}, []]) {
    assert.strictEqual(isUuid(bad), false, String(bad));
  }
});

console.log(`\n${passed} tests passed`);

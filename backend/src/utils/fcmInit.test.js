// Plain-node tests:  node src/utils/fcmInit.test.js
// The Firebase service account from the environment must initialise (firebase-admin modular API),
// including when a dashboard turned the key's line breaks into the two characters "\n".
const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = { type: 'service_account', project_id: 'demo-proj', private_key: privateKey, client_email: 'x@demo-proj.iam.gserviceaccount.com' };

// Loads fcmService in a fresh process and returns what it logged.
function load(json) {
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '../services/fcmService.js'))}); setTimeout(()=>process.exit(0),200)`],
    { env: { ...process.env, FIREBASE_SERVICE_ACCOUNT_JSON: json }, encoding: 'utf8' });
  return r.stdout + r.stderr;
}

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };

test('a valid service account initialises FCM without errors', () => {
  assert.ok(!/is set but invalid/.test(load(JSON.stringify(account))));
});
test('a private key whose line breaks became literal \n still initialises', () => {
  assert.ok(!/is set but invalid/.test(load(JSON.stringify({ ...account, private_key: privateKey.replace(/\n/g, '\n') }))));
});
test('a service account without a private key is reported as invalid instead of crashing', () => {
  assert.ok(/is set but invalid/.test(load(JSON.stringify({ ...account, private_key: undefined }))));
});

console.log(`${passed} tests passed`);

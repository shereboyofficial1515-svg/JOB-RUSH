// Plain-node tests:  node src/utils/imageOwnership.test.js
// A photo URL saved on a profile must be one this user uploaded to the matching bucket.
const assert = require('assert');
const path = require.resolve('../config/supabase');

const ORIGIN = 'https://example-project.supabase.co/storage/v1/object/public';
require.cache[path] = {
  id: path, filename: path, loaded: true,
  exports: { getSupabaseClient: () => ({ storage: { from: (bucket) => ({ getPublicUrl: (p) => ({ data: { publicUrl: `${ORIGIN}/${bucket}/${p}` } }) }) } }) },
};
const storage = require('../services/storageService');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const own = (bucket, user, file) => `${ORIGIN}/${bucket}/${user}/${file}`;

test("the user's own upload in the right bucket is accepted and maps to its storage path", () => {
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, own('business-photos', ME, 'abc.png')), `${ME}/abc.png`);
  assert.doesNotThrow(() => storage.assertOwnedPublicUrl('BUSINESS_PHOTOS', ME, own('business-photos', ME, 'abc.png')));
});
test('a cache-busting query string does not change what the file is', () => {
  assert.strictEqual(storage.ownedPathFromPublicUrl('PROFILE_PICTURES', ME, own('profile-pictures', ME, 'a.webp') + '?t=1'), `${ME}/a.webp`);
});
test("another user's file, an outside URL and a different bucket are all rejected", () => {
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, own('business-photos', OTHER, 'x.png')), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, 'https://example.com/x.png'), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, own('profile-pictures', ME, 'x.png')), null);
  assert.throws(() => storage.assertOwnedPublicUrl('BUSINESS_PHOTOS', ME, 'https://example.com/x.png'), (e) => e.code === 'INVALID_IMAGE_URL');
});
test('path tricks are rejected (traversal, nested folders, missing file name, look-alike host)', () => {
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, `${ORIGIN}/business-photos/${ME}/..%2F${OTHER}%2Fx.png`), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, `${ORIGIN}/business-photos/${ME}/sub/x.png`), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, `${ORIGIN}/business-photos/${ME}/`), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, `${ORIGIN}.evil.com/business-photos/${ME}/x.png`), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', ME, null), null);
  assert.strictEqual(storage.ownedPathFromPublicUrl('BUSINESS_PHOTOS', '', own('business-photos', '', 'x.png')), null);
});

console.log(`${passed} tests passed`);

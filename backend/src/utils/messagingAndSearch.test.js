// Plain-node tests:  node src/utils/messagingAndSearch.test.js
const assert = require('assert');
const { detectChatFile, sanitizeDisplayFileName } = require('./fileValidation');
const { escapeLike, splitTerms, addKeywordConditions } = require('./searchTerms');
const { readImageSize } = require('./imageSize');
const v = require('../validators/messagingValidators');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };
const pad = (arr, n = 64) => Buffer.concat([Buffer.from(arr), Buffer.alloc(n)]);
const rejects = (fn, code) => assert.throws(fn, (e) => (code ? e.code === code : true));

// ---------------------------------------------------------------- chat file detection
test('images are recognised by their bytes, whatever the client says', () => {
  assert.strictEqual(detectChatFile(pad([0xff, 0xd8, 0xff, 0xe0]), 'image', 'application/pdf').mimeType, 'image/jpeg');
  assert.strictEqual(detectChatFile(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image', '').mimeType, 'image/png');
  assert.strictEqual(detectChatFile(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]), 'image').mimeType, 'image/webp');
});
test('an executable renamed to .pdf / .jpg is rejected', () => {
  const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 not a document');
  rejects(() => detectChatFile(exe, 'document', 'application/pdf'), 'FILE_SIGNATURE_MISMATCH');
  rejects(() => detectChatFile(exe, 'image', 'image/jpeg'), 'FILE_SIGNATURE_MISMATCH');
  rejects(() => detectChatFile(exe, 'voice_note', 'audio/webm'), 'FILE_SIGNATURE_MISMATCH');
});
test('the category must agree with the bytes (a photo cannot be sent as a document, audio not as an image)', () => {
  rejects(() => detectChatFile(pad([0xff, 0xd8, 0xff]), 'document'), 'FILE_SIGNATURE_MISMATCH');
  rejects(() => detectChatFile(pad([0x1a, 0x45, 0xdf, 0xa3]), 'image'), 'FILE_SIGNATURE_MISMATCH');
  rejects(() => detectChatFile(Buffer.from('%PDF-1.4'), 'voice_note'), 'FILE_SIGNATURE_MISMATCH');
});
test('every voice format a phone or browser records is accepted: webm, ogg, mp4/m4a, aac, mp3, wav', () => {
  assert.strictEqual(detectChatFile(pad([0x1a, 0x45, 0xdf, 0xa3]), 'voice_note').mimeType, 'audio/webm');
  assert.strictEqual(detectChatFile(Buffer.from('OggS\0\0\0\0'), 'voice_note').mimeType, 'audio/ogg');
  assert.strictEqual(detectChatFile(pad([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]), 'voice_note').mimeType, 'audio/mp4');
  assert.strictEqual(detectChatFile(pad([0xff, 0xf1, 0x50, 0x80]), 'voice_note').mimeType, 'audio/aac');
  assert.strictEqual(detectChatFile(pad([0xff, 0xfb, 0x90, 0x00]), 'voice_note').mimeType, 'audio/mpeg');
  assert.strictEqual(detectChatFile(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(20)]), 'voice_note').mimeType, 'audio/wav');
});
test('documents: pdf, docx, xlsx, legacy doc/xls and plain zip are told apart by content', () => {
  assert.strictEqual(detectChatFile(Buffer.from('%PDF-1.7 x'), 'document').extension, 'pdf');
  const zip = (name) => Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from(name)]);
  assert.strictEqual(detectChatFile(zip('word/document.xml'), 'document').extension, 'docx');
  assert.strictEqual(detectChatFile(zip('xl/workbook.xml'), 'document').extension, 'xlsx');
  assert.strictEqual(detectChatFile(zip('notes.txt'), 'document').extension, 'zip');
  const ole = pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assert.strictEqual(detectChatFile(ole, 'document', 'application/vnd.ms-excel; charset=x').extension, 'xls');
  assert.strictEqual(detectChatFile(ole, 'document', '').extension, 'doc');
});
test('empty files and unknown categories are rejected', () => {
  rejects(() => detectChatFile(Buffer.alloc(0), 'image'), 'EMPTY_FILE');
  rejects(() => detectChatFile(pad([0xff, 0xd8, 0xff]), 'banana'), 'INVALID_CATEGORY');
});
test('display file names lose path parts, control characters and markup characters, and stay bounded', () => {
  assert.strictEqual(sanitizeDisplayFileName(String.raw`C:\fakepath\My   Report<1>.pdf`), 'My Report1.pdf');
  assert.strictEqual(sanitizeDisplayFileName('../../etc/passwd'), 'passwd');
  assert.strictEqual(sanitizeDisplayFileName('a\u0000b\u0007c.txt'), 'abc.txt');
  assert.strictEqual(sanitizeDisplayFileName('   '), null);
  const long = sanitizeDisplayFileName(`${'x'.repeat(300)}.pdf`);
  assert.ok(long.length <= 120 && long.endsWith('.pdf'));
});
test('image dimensions are read from the header (jpeg, png, gif)', () => {
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  assert.deepStrictEqual(readImageSize(png), { width: 640, height: 480 });
  const gif = Buffer.alloc(16); gif.write('GIF89a'); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(200, 8);
  assert.deepStrictEqual(readImageSize(gif), { width: 320, height: 200 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01]);
  assert.deepStrictEqual(readImageSize(jpg), { width: 1200, height: 800 });
  assert.strictEqual(readImageSize(Buffer.from('not an image at all')), null);
});

// ---------------------------------------------------------------- search terms
test('keywords split into words (max 6, each bounded) and LIKE wildcards are escaped', () => {
  assert.deepStrictEqual(splitTerms('  wiring   warri '), ['wiring', 'warri']);
  assert.strictEqual(splitTerms('a b c d e f g h').length, 6);
  assert.strictEqual(splitTerms('x'.repeat(200))[0].length, 40);
  assert.deepStrictEqual(splitTerms('   '), []);
  assert.strictEqual(escapeLike('50%_off\\'), '50\\%\\_off\\\\');
});
test('every word becomes its own AND-ed condition with its own bound parameter', () => {
  const params = ['existing']; const conditions = [];
  const first = addKeywordConditions('wiring 100%', params, conditions, (p) => `t ILIKE ${p}`);
  assert.deepStrictEqual(params, ['existing', '%wiring%', '%100\\%%']);
  assert.deepStrictEqual(conditions, ['(t ILIKE $2)', '(t ILIKE $3)']);
  assert.strictEqual(first, '$2');
  assert.strictEqual(addKeywordConditions('', [], [], () => 'x'), null);
});
test('user text never reaches the SQL string, only the parameter list', () => {
  const params = []; const conditions = [];
  addKeywordConditions("'; DROP TABLE users;--", params, conditions, (p) => `t ILIKE ${p}`);
  assert.ok(conditions.every((c) => /^\(t ILIKE \$\d\)$/.test(c)));
  assert.ok(params.some((p) => p.includes('DROP')));
});

// ---------------------------------------------------------------- messaging validators
const send = v.sendMessageSchema;
const uuid = '3b8f8a64-1c1d-4b3a-9f0e-6e3a1c2d4e5f';
test('send: text, reply and client id are accepted; empty is not', () => {
  assert.ok(send.safeParse({ content: 'hi' }).success);
  assert.ok(send.safeParse({ content: 'hi', replyToMessageId: uuid, clientMessageId: uuid }).success);
  assert.ok(!send.safeParse({}).success);
  assert.ok(!send.safeParse({ content: 'hi', replyToMessageId: 'nope' }).success);
  assert.ok(!send.safeParse({ content: 'x'.repeat(5001) }).success);
});
test('send: attachment descriptors carry a path plus bounded display metadata only', () => {
  assert.ok(send.safeParse({ mediaItems: [{ storagePath: `${uuid}/${uuid}.png`, width: 100, height: 80 }] }).success);
  assert.ok(!send.safeParse({ mediaItems: [{ storagePath: 'a', width: -1 }] }).success);
  assert.ok(!send.safeParse({ mediaItems: [{ storagePath: 'a', waveform: new Array(81).fill(5) }] }).success);
  assert.ok(!send.safeParse({ mediaItems: Array.from({ length: 11 }, () => ({ storagePath: 'a' })) }).success);
  const stripped = send.parse({ content: 'x', messageType: 'document', mediaItems: [{ storagePath: 'p', mediaType: 'image' }] });
  assert.strictEqual(stripped.messageType, undefined, 'client-claimed message type is dropped');
  assert.strictEqual(stripped.mediaItems[0].mediaType, undefined, 'client-claimed media type is dropped');
});
test('mute and delete-scope inputs are restricted to the supported values', () => {
  assert.ok(v.muteConversationSchema.safeParse({ duration: '8h' }).success);
  assert.ok(v.muteConversationSchema.safeParse({ duration: null }).success);
  assert.ok(!v.muteConversationSchema.safeParse({ duration: '3d' }).success);
  assert.strictEqual(v.deleteMessageQuerySchema.parse({}).scope, 'everyone');
  assert.ok(!v.deleteMessageQuerySchema.safeParse({ scope: 'banana' }).success);
});

console.log(`\n${passed} tests passed`);

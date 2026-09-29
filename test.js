// ทดสอบตรรกะเกม: node test.js
const assert = require('assert');
const { Room, CATEGORIES, normalize } = require('./game');

assert.ok(CATEGORIES.includes('ผลไม้'));

// ภายในหมวดเดียวกัน คำตอบห้ามซ้ำกัน (ไม่งั้นทายคำหนึ่งอาจไปตรงอีกคำ)
const WORDS = require('./words');
for (const [cat, list] of Object.entries(WORDS)) {
  const seen = new Map();
  for (const entry of list) {
    for (const ans of entry.split('|').map(normalize)) {
      assert.ok(!seen.has(ans), `หมวด ${cat}: "${ans}" ซ้ำระหว่าง ${seen.get(ans)} กับ ${entry}`);
      seen.set(ans, entry);
    }
  }
  assert.ok(list.length >= 30, `หมวด ${cat} มีคำน้อยเกินไป`);
}

for (let i = 0; i < 200; i++) {
  const r = new Room('T');
  const n = 2 + (i % 10);
  for (let k = 0; k < n; k++) r.addPlayer('p' + k, 'คน' + k);
  r.start();
  const words = [...r.players.values()].map((p) => p.word.display);
  assert.strictEqual(new Set(words).size, n, 'คำต้องไม่ซ้ำกัน');
  // ผู้เล่นเห็นคำตัวเอง แต่ไม่เห็นของคนอื่น
  const v = r.viewFor('p0');
  assert.ok(v.players.find((p) => p.id === 'p0').word);
  assert.ok(v.players.filter((p) => p.id !== 'p0').every((p) => p.word === null));
}

// ทายคำของคนอื่น: ผิด / ถูกด้วยคำตอบสำรอง / ทายคำตัวเองไม่ได้ / โบนัสคนรอด
const r = new Room('X');
r.addPlayer('a', 'เอ');
r.addPlayer('b', 'บี');
r.addPlayer('c', 'ซี');
r.start('จังหวัด');
const b = r.players.get('b');
b.word = { display: 'นครราชสีมา', answers: ['นครราชสีมา', 'โคราช'] };
assert.strictEqual(r.guess('b', 'b', 'โคราช'), null, 'ทายคำตัวเองไม่ได้');
assert.strictEqual(r.guess('a', 'b', 'ขอนแก่น'), false);
assert.strictEqual(r.guess('a', 'b', 'จังหวัด โคราช'), true);
assert.strictEqual(r.players.get('a').score, 2);
assert.strictEqual(r.viewFor('c').players.find((p) => p.id === 'b').word, 'นครราชสีมา');
assert.strictEqual(r.guess('c', 'b', 'โคราช'), null, 'โดนทายแล้วทายซ้ำไม่ได้');
r.guess('b', 'a', r.players.get('a').word.display);
assert.strictEqual(r.state, 'playing');
r.endRound();
assert.strictEqual(r.state, 'reveal');
assert.strictEqual(r.players.get('c').score, 3, 'คนรอดได้ +3');

// ผู้เล่นเข้าห้องกลางรอบได้คำที่ไม่ซ้ำ
r.start('ผลไม้');
r.addPlayer('c', 'ซี');
const ws = [...r.players.values()].map((p) => p.word.display);
assert.strictEqual(new Set(ws).size, 3);

console.log('ผ่านทุกเทสต์ ✅');

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

// ทายคำของคนอื่นตามลำดับตา: ทายคำตัวเองไม่ได้ / ยังไม่ถึงตาทายไม่ได้ / คำตอบสำรอง / โบนัสคนรอด
const r = new Room('X');
r.addPlayer('a', 'เอ');
r.addPlayer('b', 'บี');
r.addPlayer('c', 'ซี');
r.start('จังหวัด');
assert.deepStrictEqual([...r.turnOrder].sort(), ['a', 'b', 'c'], 'ทุกคนอยู่ในลำดับตา');
r.turnOrder = ['a', 'b', 'c'];
r.turn = 0;
const b = r.players.get('b');
b.word = { display: 'นครราชสีมา', answers: ['นครราชสีมา', 'โคราช'] };
assert.strictEqual(r.guess('a', 'a', 'x'), null, 'ทายคำตัวเองไม่ได้');
assert.strictEqual(r.guess('c', 'b', 'โคราช'), null, 'ยังไม่ถึงตา');
assert.strictEqual(r.guess('a', 'b', 'ขอนแก่น'), false);
assert.strictEqual(r.currentTurnId(), 'b', 'ทายผิดแล้วเปลี่ยนตา');
assert.strictEqual(r.guess('b', 'a', r.players.get('a').word.display), true);
assert.strictEqual(r.currentTurnId(), 'c');
assert.strictEqual(r.guess('c', 'b', 'จังหวัด โคราช'), true);
assert.strictEqual(r.players.get('c').score, 2);
assert.strictEqual(r.viewFor('a').players.find((p) => p.id === 'b').word, 'นครราชสีมา');
assert.strictEqual(r.currentTurnId(), 'a');
assert.strictEqual(r.guess('a', 'b', 'โคราช'), null, 'โดนทายแล้วทายซ้ำไม่ได้');
assert.ok(r.pass('a'));
assert.strictEqual(r.currentTurnId(), 'b', 'ผ่านตาได้');
assert.ok(r.pass('c'), 'คนอื่นกดจบตาให้ได้ (คนตอบเสร็จแล้ว)');
assert.strictEqual(r.feed[r.feed.length - 1].by, 'ซี');
r.endRound();
assert.strictEqual(r.state, 'reveal');
assert.strictEqual(r.players.get('c').score, 5, 'คนรอดได้ +3');

// แชท: ห้ามพิมพ์คำลับตัวเองระหว่างรอบ
r.start('จังหวัด');
r.players.get('a').word = { display: 'เชียงใหม่', answers: ['เชียงใหม่'] };
r.players.get('b').word = { display: 'ภูเก็ต', answers: ['ภูเก็ต'] };
assert.throws(() => r.addChat('a', 'คำของฉันคือ เชียง ใหม่'));
assert.strictEqual(r.addChat('a', 'ถามมาได้เลย').text, 'ถามมาได้เลย');
assert.strictEqual(r.addChat('b', 'เชียงใหม่ใช่ไหม').name, 'บี', 'พิมพ์คำของคนอื่นได้');

// ผู้เล่นออกกลางรอบ ลำดับตาต้องไม่พัง
r.turnOrder = ['a', 'b', 'c'];
r.turn = 2;
r.removePlayer('a');
assert.strictEqual(r.currentTurnId(), 'c');
r.removePlayer('c');
assert.strictEqual(r.currentTurnId(), 'b');
r.addPlayer('a', 'เอ');
r.addPlayer('c', 'ซี');

// ผู้เล่นเข้าห้องกลางรอบได้คำที่ไม่ซ้ำ
r.start('ผลไม้');
r.addPlayer('d', 'ดี');
const ws = [...r.players.values()].map((p) => p.word.display);
assert.strictEqual(new Set(ws).size, 4);
assert.ok(r.turnOrder.includes('d'), 'คนเข้ากลางรอบได้ต่อคิว');

console.log('ผ่านทุกเทสต์ ✅');

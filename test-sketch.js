// ทดสอบเกม "แข่งวาด" (Catch Sketch): node test-sketch.js
const assert = require('assert');
const { Room } = require('./game');

const line = [{ c: '#1f1f1f', w: 0.01, p: [0.1, 0.1, 0.5, 0.5] }];
function setup(n) {
  const r = new Room('K');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startSketch();
  return r;
}
const drawersOf = (r) => r.sk.drawers.slice();

// ---- เริ่มเกม: อย่างน้อย 3 คน / คนทายไม่เห็นคำ / คนวาดเห็นคำ
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  r.addPlayer('b', 'บี');
  assert.throws(() => r.startSketch(), /3 คน/);
  const g = setup(4);
  const k = g.sk;
  assert.strictEqual(k.queue.length, 8, '≤5 คน = คนละ 2 ตา');
  assert.strictEqual(g.viewFor(k.guesser).sk.word, null);
  assert.strictEqual(g.viewFor(k.drawers[0]).sk.word, k.word.display);
  assert.throws(() => g.addChat(k.drawers[0], `มันคือ ${k.word.display}`), /คำลับ/, 'คนวาดห้ามพิมพ์คำในแชท');
  assert.throws(() => g.skDone(k.guesser, line), /เป็นคนทาย/);
  assert.throws(() => g.skDone(k.drawers[0], []), /วาดอะไร/);
  assert.throws(() => g.skSetDrawing(k.drawers[0], [{ c: 'red', w: 0.01, p: [0, 0] }]), /ไม่ถูกต้อง/);
}

// ---- 4 คน: เสร็จ 2 คน = หยุด · ภาพแรกทายผิด → ภาพ 2 ทายถูก = 2 แต้มทั้งคู่
{
  const r = setup(4);
  const k = r.sk;
  const [a, b, c] = drawersOf(r);
  r.skSetDrawing(c, line); // c วาดแต่ยังไม่กดเสร็จ
  assert.strictEqual(r.skDone(b, line), 1);
  assert.strictEqual(k.phase, 'draw');
  assert.ok(!('drawings' in r.viewFor(k.guesser).sk) || !Object.keys(r.viewFor(k.guesser).sk.drawings).length, 'ยังไม่เห็นภาพ');
  r.skDone(a, line);
  assert.strictEqual(k.phase, 'guess', 'เสร็จครบ 2 คน → หยุด!');
  assert.deepStrictEqual(k.order, [b, a, c]);
  assert.deepStrictEqual(Object.keys(r.viewFor(k.guesser).sk.drawings), [b], 'เปิดทีละภาพ');
  assert.throws(() => r.skGuess(a, 'x'), /ไม่ได้เป็นคนทาย/);
  assert.strictEqual(r.skGuess(k.guesser, 'ไม่ใช่แน่ ๆ'), false);
  assert.strictEqual(k.board, 1, 'ทายได้ภาพละ 1 ครั้ง');
  assert.strictEqual(r.skGuess(k.guesser, k.word.display), true);
  assert.strictEqual(k.phase, 'show');
  assert.strictEqual(r.players.get(k.guesser).score, 2);
  assert.strictEqual(r.players.get(a).score, 2);
  assert.strictEqual(r.players.get(b).score, 0);
  assert.strictEqual(Object.keys(r.viewFor(b).sk.drawings).length, 3, 'เฉลยแล้วเห็นทุกภาพ');
  const prev = k.guesser;
  r.timeoutTurn();
  assert.strictEqual(k.phase, 'draw');
  assert.notStrictEqual(k.guesser, prev);
}

// ---- 3 คน: เสร็จ 1 คน = หยุด · ทายได้ภาพละ 2 ครั้ง · แต้ม 3 กับ 1
{
  const r = setup(3);
  const k = r.sk;
  const [a, b] = drawersOf(r);
  r.skSetDrawing(b, line);
  r.skDone(a, line);
  assert.strictEqual(k.phase, 'guess');
  r.skGuess(k.guesser, 'ผิด');
  assert.strictEqual(k.board, 0, 'ยังทายภาพเดิมได้อีกครั้ง');
  r.skGuess(k.guesser, 'ผิดอีก');
  assert.strictEqual(k.board, 1);
  r.skGuess(k.guesser, k.word.answers[0]);
  assert.strictEqual(r.players.get(b).score, 1);
  assert.strictEqual(r.players.get(k.guesser).score, 1);
}

// ---- หมดเวลา: คนที่ไม่ได้วาดอะไรไม่นับ / ทายผิดหมด = ไม่มีใครได้แต้ม
{
  const r = setup(4);
  const k = r.sk;
  const [a] = drawersOf(r);
  r.skSetDrawing(a, line);
  r.timeoutTurn();
  assert.deepStrictEqual(k.order, [a], 'คนที่ไม่วาดไม่มีภาพให้เปิด');
  r.timeoutTurn(); // หมดเวลาทาย
  assert.strictEqual(k.phase, 'show');
  assert.strictEqual(k.winner, null);
}

// ---- คนหลุด = ไม่ต้องรอ / คนทายออก = ข้ามตา / ถึง 20 แต้ม = จบเกม
{
  const r = setup(5);
  const k = r.sk;
  const [a, b, c, d] = drawersOf(r);
  r.skDone(a, line);
  r.players.get(b).connected = false;
  r.players.get(c).connected = false;
  r.players.get(d).connected = false;
  assert.ok(r.onPresenceChange(), 'เหลือคนวาดออนไลน์ 1 คน เสร็จแล้ว = หยุด');
  assert.strictEqual(k.phase, 'guess');
  for (const x of [b, c, d]) r.players.get(x).connected = true;
  const turn = k.turnNo;
  r.removePlayer(k.guesser);
  assert.strictEqual(k.turnNo, turn + 1);
  k.gained[a] = 20;
  r.skShow();
  r.timeoutTurn();
  assert.strictEqual(r.state, 'reveal');
  assert.deepStrictEqual(k.winners, [r.players.get(a).name]);
}

console.log('แข่งวาด ผ่านทุกเทสต์ ✅');

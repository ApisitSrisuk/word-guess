// ทดสอบเกม "ทายคำตรงกลาง": node test-center.js
const assert = require('assert');
const { Room } = require('./game');
const { MAX_Q } = require('./center');

function setup(n = 3) {
  const r = new Room('M');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startCenter('สัตว์');
  // บังคับคนตอบ/ลำดับ/คำ ให้เทสต์แน่นอน
  r.ct.masterId = 'p0';
  r.ct.order = ['p1', 'p2'].slice(0, n - 1);
  r.ct.idx = 0;
  r.ct.word = { display: 'แมว', answers: ['แมว'] };
  return r;
}

// ---- เริ่มเกม: คนตอบเห็นคำ คนอื่นไม่เห็น / คนตอบไม่อยู่ในคิวถาม
{
  const r = new Room('S');
  assert.throws(() => r.startCenter(), /2 คน/);
  for (let i = 0; i < 3; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startCenter('random');
  const m = r.ct.masterId;
  assert.ok(!r.ct.order.includes(m));
  assert.strictEqual(r.ct.order.length, 2);
  assert.ok(r.viewFor(m).ct.word);
  const other = r.ct.order[0];
  assert.strictEqual(r.viewFor(other).ct.word, null);
  assert.strictEqual(r.viewFor(other).mode, 'center');
  // รอบถัดไป คนตอบวนไปคนถัดไป
  r.endRound();
  r.startCenter();
  assert.notStrictEqual(r.ct.masterId, m);
}

// ---- ถาม → ตอบ → ทายผิด → ตาถัดไป → ทายเลยถูก
{
  const r = setup();
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.throws(() => r.ctAsk('p2', 'x'), /ยังไม่ถึงตา/);
  r.ctAsk('p1', 'มีขาไหม');
  assert.strictEqual(r.currentTurnId(), 'p0', 'รอคนตอบ');
  assert.throws(() => r.ctAnswer('p1', 'yes'), /เฉพาะคนตอบ/);
  r.ctAnswer('p0', 'yes');
  assert.strictEqual(r.ct.phase, 'guess');
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.strictEqual(r.ctGuess('p1', 'หมา'), false);
  assert.strictEqual(r.currentTurnId(), 'p2');
  assert.strictEqual(r.ctGuess('p2', 'แมว'), true, 'ทายเลยโดยไม่ถามได้');
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.players.get('p2').score, 3);
  assert.strictEqual(r.players.get('p0').score, 1, 'คนตอบได้ +1');
  assert.strictEqual(r.viewFor('p1').ct.word, 'แมว', 'จบแล้วเฉลย');
}

// ---- จบตา / คนตอบไม่ตอบ / หมดเวลา
{
  const r = setup();
  assert.ok(r.pass('p2'), 'คนอื่นกดจบตาให้ได้');
  assert.strictEqual(r.currentTurnId(), 'p2');
  r.ctAsk('p2', 'บินได้ไหม');
  assert.ok(r.timeoutTurn(), 'คนตอบหมดเวลา');
  assert.strictEqual(r.ct.qa[0].a, 'none');
  assert.strictEqual(r.ct.phase, 'guess');
  assert.ok(r.timeoutTurn());
  assert.strictEqual(r.currentTurnId(), 'p1');
}

// ---- ครบจำนวนคำถาม: ทุกคนได้ทายอีกครั้ง แล้วคนตอบชนะ
{
  const r = setup();
  for (let i = 0; i < MAX_Q; i++) {
    const asker = r.ctAsker();
    r.ctAsk(asker, 'คำถาม' + i);
    r.ctAnswer('p0', 'no');
    if (i < MAX_Q - 1) r.pass(asker);
  }
  r.ctGuess(r.ctAsker(), 'ผิด1'); // คนถามข้อสุดท้ายทาย
  assert.strictEqual(r.state, 'playing', 'อีกคนยังได้ทาย');
  assert.throws(() => r.ctAsk(r.ctAsker(), 'อีก'), /ถามครบ/, 'ถามเพิ่มไม่ได้แล้ว ทายได้อย่างเดียว');
  r.ctGuess(r.ctAsker(), 'ผิด2');
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.ct.reason, 'maxq');
  assert.strictEqual(r.players.get('p0').score, 3);
}

// ---- คนตอบห้ามพิมพ์คำในแชท / เข้ากลางเกมได้ต่อคิว / คนตอบออก = จบรอบ
{
  const r = setup();
  assert.throws(() => r.addChat('p0', 'มันคือแมวนะ'), /ห้ามพิมพ์คำลับ/);
  assert.ok(r.addChat('p1', 'แมวใช่ไหม'));
  r.addPlayer('p9', 'มาสาย');
  assert.ok(r.ct.order.includes('p9'));
  assert.strictEqual(r.viewFor('p9').ct.word, null);
  r.removePlayer('p0');
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.ct.reason, 'master-left');
}
{
  const r = setup();
  r.removePlayer('p1');
  assert.strictEqual(r.currentTurnId(), 'p2', 'คนถามออก → ตาไปคนถัดไป');
}

// ---- chatKey ไม่เปลี่ยนตอนคนตอบกดตอบ (แชทไม่ถูกล้างกลางตา)
{
  const r = setup();
  const k1 = r.chatKey();
  r.ctAsk('p1', 'ใหญ่ไหม');
  r.ctAnswer('p0', 'no');
  assert.strictEqual(r.chatKey(), k1);
  assert.notStrictEqual(r.turnKey(), k1.replace('c|', 'x'), 'turnKey เปลี่ยนตามช่วง (จับเวลาใหม่)');
  r.pass('p1');
  assert.notStrictEqual(r.chatKey(), k1, 'ตาใหม่ → ล้างแชท');
}

console.log('ทายคำตรงกลาง ผ่านทุกเทสต์ ✅');

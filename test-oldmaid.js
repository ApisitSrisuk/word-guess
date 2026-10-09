// ทดสอบเกม "อีแก่กินน้ำ": node test-oldmaid.js
const assert = require('assert');
const { Room } = require('./game');

const c = (id, r, s = 0) => ({ id, r, s });
const J = { id: 99, r: 0, s: -1, joker: true };
function setup(hands, turn = 'p0') {
  const r = new Room('O');
  const ids = Object.keys(hands);
  ids.forEach((id, i) => r.addPlayer(id, 'คน' + i));
  r.startOldMaid();
  const m = r.om;
  m.order = ids;
  m.hands = hands;
  m.pairs = Object.fromEntries(ids.map((x) => [x, 0]));
  m.out = [];
  m.turnIdx = ids.indexOf(turn);
  m.phase = 'draw';
  return r;
}

// ---- แจกไพ่: ครบ 53 ใบ / ทิ้งคู่ให้อัตโนมัติ / มีอีแก่ 1 ใบ / ไม่เห็นมือคนอื่น
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  assert.throws(() => r.startOldMaid(), /2 คน/);
  for (const x of ['b', 'c']) r.addPlayer(x, x);
  r.startOldMaid();
  const m = r.om;
  const all = Object.values(m.hands).flat();
  const total = all.length + Object.values(m.pairs).reduce((a, b) => a + b, 0) * 2;
  assert.strictEqual(total, 53, 'ไพ่ครบ 52 + อีแก่ 1');
  assert.strictEqual(all.filter((x) => x.joker).length, 1);
  for (const h of Object.values(m.hands)) {
    const ranks = h.filter((x) => !x.joker).map((x) => x.r);
    assert.strictEqual(new Set(ranks).size, ranks.length, 'ในมือไม่มีคู่เหลือ');
  }
  const v = r.viewFor('a');
  assert.ok(!('hands' in v.om), 'ไม่ส่งมือคนอื่น');
  assert.strictEqual(v.om.myHand.length, m.hands.a.length);
}

// ---- ดึงไพ่: ต้องถึงตา / ดึงจากคนถัดไป / ได้คู่ทิ้ง / คนถูกดึงได้ดึงต่อ
{
  const r = setup({ p0: [c(1, 5), c(2, 9)], p1: [c(3, 5, 1), J], p2: [c(4, 9, 2), c(5, 7)] });
  assert.strictEqual(r.omTarget(), 'p1');
  assert.throws(() => r.omDraw('p1', 0), /ยังไม่ถึงตา/);
  assert.throws(() => r.omDraw('p0', 5), /ไม่ถูกต้อง/);
  const last = r.omDraw('p0', 0); // ได้ 5 → คู่กับ 5 ในมือ
  assert.strictEqual(last.pairRank, 5);
  assert.deepStrictEqual(r.om.hands.p0.map((x) => x.r), [9]);
  assert.strictEqual(r.om.pairs.p0, 1);
  // ไพ่ที่ดึงได้: คนดึงกับคนถูกดึงเห็น / คนอื่นไม่เห็น
  assert.ok(r.viewFor('p0').om.last.card);
  assert.ok(r.viewFor('p1').om.last.card);
  assert.strictEqual(r.viewFor('p2').om.last.card, null);
  assert.strictEqual(r.viewFor('p2').om.last.pairRank, 5, 'ทุกคนเห็นว่าได้คู่อะไร');
  r.timeoutTurn(); // โชว์ผลจบ
  assert.strictEqual(r.currentTurnId(), 'p1', 'คนถูกดึงได้ดึงต่อ');
  assert.strictEqual(r.omTarget(), 'p2');
}

// ---- หมดมือ = รอด / ข้ามคนหมดมือ / คนสุดท้ายถืออีแก่ = แพ้
{
  const r = setup({ p0: [c(1, 5)], p1: [c(2, 5, 1), J], p2: [c(3, 8)] });
  r.omDraw('p0', 0); // p0 ได้คู่ 5 → หมดมือ รอดเป็นคนแรก
  r.timeoutTurn();
  assert.deepStrictEqual(r.om.out, ['p0']);
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.strictEqual(r.omTarget(), 'p2', 'ข้าม p0 ที่หมดมือแล้ว');
  // เหลือ 2 คน: p1 [J] 1 ใบ, p2 [8] 1 ใบ → p1 ดึงจาก p2
  r.omDraw('p1', 0); // p1 ได้ 8 → [J, 8] / p2 หมดมือ
  r.timeoutTurn();
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.om.loser, 'p1', 'ถืออีแก่คนสุดท้าย = แพ้');
  assert.strictEqual(r.players.get('p0').score, 3, 'หมดมือคนแรก +3');
  assert.strictEqual(r.players.get('p2').score, 1);
  assert.strictEqual(r.players.get('p1').score, 0);
  assert.ok(r.viewFor('p0').om.loserHand.some((x) => x.joker), 'จบแล้วเปิดมือคนแพ้');
}

// ---- เหลือ 2 คน และมีคนถือไพ่ 1 ใบ → คนนั้นเป็นฝ่ายดึง
{
  const r = setup({ p0: [c(1, 5), c(2, 6), c(3, 7)], p1: [J] }, 'p0');
  r.omFixTwo();
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.strictEqual(r.omTarget(), 'p0');
}

// ---- สับไพ่ในมือ / หมดเวลาสุ่มดึงให้ / ออกจากห้องส่งไพ่ต่อ
{
  const r = setup({ p0: [c(1, 5), c(2, 6)], p1: [c(3, 9), J], p2: [c(4, 6, 1), c(5, 7)] });
  const before = r.om.hands.p1.map((x) => x.id).join();
  for (let i = 0; i < 10 && r.om.hands.p1.map((x) => x.id).join() === before; i++) r.omShuffle('p1');
  assert.notStrictEqual(r.om.hands.p1.map((x) => x.id).join(), before, 'สับแล้วลำดับเปลี่ยน');
  r.turnLimit = 30;
  assert.ok(r.timerKey());
  r.timeoutTurn();
  assert.strictEqual(r.om.phase, 'show', 'หมดเวลา → สุ่มดึงให้');
  r.timeoutTurn();
  r.removePlayer('p2'); // ไพ่ของ p2 ส่งต่อให้คนถัดไป
  const all = Object.values(r.om.hands).flat();
  assert.ok(all.some((x) => x.joker), 'อีแก่ยังอยู่ในเกม');
}

console.log('อีแก่กินน้ำ ผ่านทุกเทสต์ ✅');

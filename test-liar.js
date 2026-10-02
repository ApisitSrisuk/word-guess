// ทดสอบเกม "เต๋าโกหก": node test-liar.js
const assert = require('assert');
const { Room } = require('./game');

function setup(n = 3) {
  const r = new Room('L');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startLiar();
  r.lie.order = Array.from({ length: n }, (_, i) => 'p' + i);
  r.lie.turnIdx = 0;
  return r;
}
const setDice = (r, map) => { for (const [id, d] of Object.entries(map)) { r.lie.dice[id] = d; r.lie.counts[id] = d.length; } };

// ---- เริ่มเกม: เต๋าคนละ 5 / เห็นแค่ของตัวเอง
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  assert.throws(() => r.startLiar(), /2 คน/);
  r.addPlayer('b', 'บี');
  r.startLiar();
  assert.strictEqual(r.lie.dice.a.length, 5);
  const v = r.viewFor('a');
  assert.strictEqual(v.lie.myDice.length, 5);
  assert.strictEqual(v.lie.dice, null, 'ไม่เห็นเต๋าคนอื่น');
  assert.strictEqual(v.lie.total, 10);
}

// ---- ประกาศ: ต้องถึงตา / เลข 2–6 / ต้องสูงขึ้น / ไม่เกินเต๋าบนโต๊ะ
{
  const r = setup();
  assert.throws(() => r.lieBid('p1', 1, 3), /ยังไม่ถึงตา/);
  assert.throws(() => r.lieBid('p0', 1, 1), /เลข 1 เป็นไวลด์/);
  assert.throws(() => r.lieBid('p0', 16, 3), /มีเต๋าแค่ 15/);
  assert.throws(() => r.lieChallenge('p0'), /ยังไม่มีใครประกาศ/);
  r.lieBid('p0', 2, 4);
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.throws(() => r.lieBid('p1', 2, 3), /ต้องสูงกว่า/);
  assert.throws(() => r.lieBid('p1', 1, 6), /ต้องสูงกว่า/);
  r.lieBid('p1', 2, 5); // จำนวนเท่าเดิม เลขสูงขึ้น ได้
  assert.deepStrictEqual(r.lieMinBid(), { q: 2, f: 6 });
  r.lieBid('p2', 3, 2); // จำนวนมากขึ้น เลขอะไรก็ได้
  assert.deepStrictEqual(r.lieMinBid(), { q: 3, f: 3 });
  assert.strictEqual(r.lie.bids.length, 3);
}

// ---- โกหก!: นับเลข 1 เป็นไวลด์ / ประกาศจริง = คนกดเสียเต๋า
{
  const r = setup();
  setDice(r, { p0: [1, 4, 4, 6, 6], p1: [2, 3, 3, 5, 5], p2: [1, 2, 2, 2, 3] });
  r.lieBid('p0', 4, 4); // 4 สองลูก + เลข 1 สองลูก = 4 → จริง
  r.lieChallenge('p1');
  assert.strictEqual(r.lie.result.actual, 4);
  assert.strictEqual(r.lie.result.bidTrue, true);
  assert.strictEqual(r.lie.result.loser, 'p1');
  assert.strictEqual(r.lie.counts.p1, 4);
  assert.strictEqual(r.lie.phase, 'reveal');
  assert.deepStrictEqual(r.viewFor('p2').lie.dice.p0, [1, 4, 4, 6, 6], 'เปิดเต๋าให้ทุกคนเห็น');
  r.lieTimeout(); // หมดเวลาเปิดเต๋า → รอบใหม่
  assert.strictEqual(r.lie.phase, 'bid');
  assert.strictEqual(r.currentTurnId(), 'p1', 'คนเสียเต๋าเริ่มรอบใหม่');
  assert.strictEqual(r.lie.dice.p1.length, 4, 'ทอยใหม่ตามจำนวนที่เหลือ');
  assert.strictEqual(r.lie.bid, null);
}

// ---- ประกาศไม่จริง = คนประกาศเสียเต๋า / เต๋าหมด = ตกรอบ / เหลือคนเดียว = ชนะ
{
  const r = setup(2);
  setDice(r, { p0: [6], p1: [2] });
  r.lieBid('p0', 2, 6); // มีเลข 6 แค่ 1
  r.lieChallenge('p1');
  assert.strictEqual(r.lie.result.loser, 'p0');
  assert.strictEqual(r.lie.result.eliminated, true);
  r.lieTimeout();
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.lie.winner, 'p1');
  assert.strictEqual(r.players.get('p1').score, 5);
  assert.strictEqual(r.players.get('p0').score, 2, 'อันดับ 2 +2');
}

// ---- หมดเวลา: ยังไม่มีประกาศ → ประกาศขั้นต่ำให้ / มีแล้ว → กดโกหกให้
{
  const r = setup();
  r.turnLimit = 30;
  assert.ok(r.timerKey());
  r.timeoutTurn();
  assert.deepStrictEqual(r.lie.bid, { q: 1, f: 2, by: 'p0' });
  r.timeoutTurn();
  assert.strictEqual(r.lie.phase, 'reveal');
  assert.strictEqual(r.lie.result.auto, true);
  r.turnLimit = 0;
  assert.ok(r.timerKey(), 'ช่วงเปิดเต๋าจับเวลาเสมอ');
}

// ---- ออกจากห้อง: ถึงตาอยู่ → ตาไปคนถัดไป / เหลือคนเดียว → ชนะ / แชทล้างทุกการประกาศ
{
  const r = setup(3);
  const k = r.chatKey();
  r.lieBid('p0', 1, 3);
  assert.notStrictEqual(r.chatKey(), k, 'ประกาศใหม่ = ตาใหม่ → ล้างแชท');
  r.removePlayer('p1');
  assert.strictEqual(r.currentTurnId(), 'p2');
  r.removePlayer('p2');
  assert.strictEqual(r.lie.winner, 'p0');
}

console.log('เต๋าโกหก ผ่านทุกเทสต์ ✅');

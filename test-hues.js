// ทดสอบเกม "ใบ้สี" (Hues and Cues): node test-hues.js
const assert = require('assert');
const { Room } = require('./game');
const { checkClue, cellName, dist, COLS } = require('./hues');

const at = (row, col) => row * COLS + col; // แถว 0 = A, คอลัมน์ 0 = 1
function setup(n = 3) {
  const r = new Room('H');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startHues();
  return r;
}

// ---- ตัวช่วย
assert.strictEqual(cellName(0), 'A1');
assert.strictEqual(cellName(at(15, 29)), 'P30');
assert.strictEqual(dist(at(5, 5), at(6, 7)), 2);
assert.throws(() => checkClue('สีแดง', 1), /ชื่อสี/);
assert.throws(() => checkClue('blue', 1), /ชื่อสี/);
assert.throws(() => checkClue('F12', 1), /พิกัด/);
assert.throws(() => checkClue('ทะเล สวย', 1), /1 คำ/);
assert.throws(() => checkClue('ทะเล ลึก มาก', 2), /2 คำ/);
assert.strictEqual(checkClue('  ท้องฟ้า   ยามเย็น ', 2), 'ท้องฟ้า ยามเย็น');

// ---- เริ่มเกม: คิวคนใบ้ (≤3 คน = คนละ 2 รอบ) / เห็นตัวเลือกเฉพาะคนใบ้
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  assert.throws(() => r.startHues(), /2 คน/);
  const g = setup(3);
  assert.strictEqual(g.hc.queue.length, 6);
  const giver = g.hc.giver;
  const other = g.hcGuessers()[0];
  assert.strictEqual(g.viewFor(giver).hc.options.length, 4);
  assert.strictEqual(g.viewFor(other).hc.options, null, 'คนทายไม่เห็นตัวเลือก');
  assert.strictEqual(g.currentTurnId(), giver);
  assert.throws(() => g.addChat(giver, 'ใบ้แอบ ๆ'), /ห้ามคุย/);
  assert.throws(() => g.hcClue(other, 'ทะเล', g.hc.options[0]), /ไม่ได้เป็นคนใบ้/);
  assert.throws(() => g.hcClue(giver, 'ทะเล', 9999), /เลือกสี/);
  assert.strictEqual(setup(4).hc.queue.length, 4);
}

// ---- เล่น 1 ตาเต็ม + คิดคะแนน
{
  const r = setup(3);
  const h = r.hc;
  const giver = h.giver;
  const [a, b] = r.hcGuessers();
  h.options = [at(5, 10), at(0, 0), at(15, 29), at(8, 20)];
  r.hcClue(giver, 'ทะเล', at(5, 10));
  assert.strictEqual(h.phase, 'guess1');
  assert.strictEqual(r.viewFor(a).hc.target, null, 'คนทายไม่เห็นเป้าหมาย');
  assert.strictEqual(r.viewFor(giver).hc.target, at(5, 10));
  assert.throws(() => r.hcPlace(giver, 0), /ไม่ต้องวาง/);
  r.hcPlace(a, at(5, 10)); // ตรงเป๊ะ = 3
  assert.throws(() => r.hcPlace(b, at(5, 10)), /มีหมุดแล้ว/);
  r.hcPlace(a, at(5, 11)); // ย้ายได้ (ห่าง 1 = 2)
  r.hcPlace(b, at(5, 10)); // ช่องว่างแล้ว → วางได้ · ครบ → รอใบ้รอบ 2
  assert.strictEqual(h.phase, 'clue2');
  r.hcClue(giver, 'ลึก ลึก');
  assert.strictEqual(h.phase, 'guess2');
  assert.throws(() => r.hcPlace(a, at(5, 10)), /มีหมุดแล้ว/, 'ห้ามวางทับหมุดรอบแรก');
  r.hcPlace(a, at(7, 12)); // ห่าง 2 = 1
  r.hcPlace(b, at(0, 0)); // ไกล = 0
  assert.strictEqual(h.phase, 'show');
  assert.strictEqual(r.players.get(a).score, 3); // 2 + 1
  assert.strictEqual(r.players.get(b).score, 3); // 3 + 0
  assert.strictEqual(r.players.get(giver).score, 2, 'คนใบ้ได้ 1 ต่อหมุดในกรอบ 3×3');
  assert.strictEqual(r.viewFor(a).hc.target, at(5, 10), 'เฉลยแล้วทุกคนเห็น');
  r.timeoutTurn();
  assert.strictEqual(h.phase, 'clue1');
  assert.notStrictEqual(h.giver, giver, 'เปลี่ยนคนใบ้');
}

// ---- หมดเวลา / คนใบ้กดไปต่อ / ครบคิว = จบเกม
{
  const r = setup(3);
  r.turnLimit = 30;
  assert.ok(r.timerKey());
  r.timeoutTurn(); // คนใบ้ไม่ใบ้ → ข้าม
  assert.strictEqual(r.hc.turnNo, 2);
  const giver = r.hc.giver;
  r.hcClue(giver, 'ทะเล', r.hc.options[0]);
  assert.throws(() => r.hcPass(r.hcGuessers().find((x) => x !== r.hostId)), /เฉพาะคนใบ้/);
  r.hcPass(giver); // ไม่รอหมุด
  assert.strictEqual(r.hc.phase, 'clue2');
  r.timeoutTurn(); // ไม่ใบ้รอบ 2 → เฉลย
  assert.strictEqual(r.hc.phase, 'show');
  while (r.state === 'playing') r.timeoutTurn();
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.hc.phase, 'over');
}

// ---- คนหลุดไม่ต้องรอ / คนใบ้ออก = ข้ามตา
{
  const r = setup(4);
  const giver = r.hc.giver;
  const [a, b, c] = r.hcGuessers();
  r.hcClue(giver, 'ป่า', r.hc.options[0]);
  r.hcPlace(a, 0);
  r.hcPlace(b, 1);
  r.players.get(c).connected = false;
  assert.ok(r.onPresenceChange(), 'คนที่หลุดไม่ต้องรอ');
  assert.strictEqual(r.hc.phase, 'clue2');
  r.players.get(c).connected = true;
  const turn = r.hc.turnNo;
  r.removePlayer(giver);
  assert.strictEqual(r.hc.turnNo, turn + 1);
  assert.strictEqual(r.hc.phase, 'clue1');
}

console.log('ใบ้สี ผ่านทุกเทสต์ ✅');

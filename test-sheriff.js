// ทดสอบเกม "ผู้ตรวจการ": node test-sheriff.js
const assert = require('assert');
const { Room } = require('./game');

const c = (id, type) => ({ id, type });
function setup(n = 3) {
  const r = new Room('H');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startSheriff();
  const s = r.sh;
  s.order = Array.from({ length: n }, (_, i) => 'p' + i);
  s.sheriffIdx = 0; // p0 เป็นผู้ตรวจการ
  s.hands.p1 = [c(1, 'apple'), c(2, 'apple'), c(3, 'wine'), c(4, 'cheese'), c(5, 'apple'), c(6, 'bread')];
  s.hands.p2 = [c(11, 'bread'), c(12, 'bread'), c(13, 'sword'), c(14, 'apple'), c(15, 'chicken'), c(16, 'pepper')];
  return r;
}

// ---- เริ่มเกม: มือ 6 ใบ เงิน 20 / ไม่เห็นมือคนอื่น / 3 คน = 6 รอบ
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  r.addPlayer('b', 'บี');
  assert.throws(() => r.startSheriff(), /3 คน/);
  r.addPlayer('c', 'ซี');
  r.startSheriff();
  assert.strictEqual(r.sh.hands.a.length, 6);
  assert.strictEqual(r.sh.coins.a, 20);
  assert.strictEqual(r.sh.totalRounds, 6);
  const v = r.viewFor('a');
  assert.strictEqual(v.sh.myHand.length, 6);
  assert.ok(!('hands' in v.sh), 'ไม่ส่งมือคนอื่น');
}

// ---- แพ็ก: ผู้ตรวจการแพ็กไม่ได้ / 1–5 ใบ / ประกาศได้แค่ของถูกกฎหมาย / สินบนไม่เกินเงิน
{
  const r = setup();
  assert.throws(() => r.shPack('p0', [1], 'apple', 0), /ไม่ต้องแพ็ก/);
  assert.throws(() => r.shPack('p1', [], 'apple', 0), /1–5/);
  assert.throws(() => r.shPack('p1', [1, 2, 3, 4, 5, 6], 'apple', 0), /1–5/);
  assert.throws(() => r.shPack('p1', [11], 'apple', 0), /ไม่อยู่ในมือ/);
  assert.throws(() => r.shPack('p1', [1], 'wine', 0), /ถูกกฎหมาย/);
  assert.throws(() => r.shPack('p1', [1], 'apple', 99), /สินบน/);
  r.shPack('p1', [1, 2, 3], 'apple', 2); // โกหก: มีไวน์ 1 ใบ
  assert.strictEqual(r.sh.hands.p1.length, 3);
  assert.strictEqual(r.sh.phase, 'pack', 'รอ p2');
  assert.deepStrictEqual(r.viewFor('p2').sh.bags, {}, 'ระหว่างแพ็กไม่เห็นคำประกาศคนอื่น');
  assert.deepStrictEqual(r.viewFor('p2').sh.packed, ['p1']);
  r.shPack('p2', [11, 12], 'bread', 0); // พูดจริง
  assert.strictEqual(r.sh.phase, 'inspect');
  assert.strictEqual(r.currentTurnId(), 'p0', 'ผู้ตรวจการถึงตา');
  assert.strictEqual(r.viewFor('p0').sh.bags.p1.declare, 'apple');
}

// ---- ตรวจ: จับโกหกได้ / ตรวจคนพูดจริงต้องจ่าย / ปล่อยผ่านได้สินบน
{
  const r = setup();
  r.shPack('p1', [1, 2, 3], 'apple', 2);
  r.shPack('p2', [11, 12], 'bread', 3);
  assert.throws(() => r.shDecide('p1', 'pass'), /เฉพาะผู้ตรวจการ/);
  const first = r.shCurrentMerchant();
  // ตรวจทุกใบตามลำดับ
  for (let i = 0; i < 2; i++) {
    const m = r.shCurrentMerchant();
    r.shDecide('p0', 'inspect');
    assert.strictEqual(r.sh.phase, 'result');
    if (m === 'p1') {
      assert.strictEqual(r.sh.last.honest, false);
      assert.deepStrictEqual(r.sh.last.confiscated, ['wine']);
      assert.strictEqual(r.sh.last.finePaid, 4, 'ไวน์ค่าปรับ 4');
    } else {
      assert.strictEqual(r.sh.last.honest, true);
      assert.strictEqual(r.sh.last.finePaid, 4, 'ขนมปัง 2 ใบ x ค่าปรับ 2');
    }
    r.timeoutTurn(); // โชว์ผลจบ
  }
  assert.ok(first);
  assert.strictEqual(r.sh.coins.p1, 16);
  assert.strictEqual(r.sh.coins.p2, 24);
  assert.strictEqual(r.sh.coins.p0, 20, 'ได้ 4 จาก p1 เสีย 4 ให้ p2');
  assert.deepStrictEqual(r.sh.stand.p1.map((x) => x.type), ['apple', 'apple'], 'ของจริงเข้าแผง ของโกหกถูกยึด');
  assert.strictEqual(r.sh.stand.p2.length, 2);
  assert.strictEqual(r.sh.roundNo, 2, 'ตรวจครบ → รอบใหม่');
  assert.strictEqual(r.shSheriff(), 'p1', 'เปลี่ยนผู้ตรวจการ');
  assert.strictEqual(r.sh.hands.p1.length, 6, 'เติมมือกลับเป็น 6');
}
{
  const r = setup();
  r.shPack('p1', [3], 'apple', 5); // ไวน์ แอบอ้างเป็นแอปเปิ้ล + สินบน 5
  r.shPack('p2', [14], 'apple', 0);
  while (r.sh.phase === 'inspect' || r.sh.phase === 'result') {
    if (r.sh.phase === 'inspect') r.shDecide('p0', 'pass');
    else r.timeoutTurn();
  }
  assert.strictEqual(r.sh.coins.p1, 15);
  assert.strictEqual(r.sh.coins.p0, 25, 'ปล่อยผ่าน = ได้สินบน');
  assert.deepStrictEqual(r.sh.stand.p1.map((x) => x.type), ['wine'], 'ของเถื่อนรอดเข้าแผง');
}

// ---- หมดเวลา: แพ็กให้อัตโนมัติ / ไม่ตัดสิน = ปล่อยผ่าน
{
  const r = setup();
  r.turnLimit = 60;
  r.shPack('p1', [1], 'apple', 0);
  r.timeoutTurn();
  assert.strictEqual(r.sh.phase, 'inspect');
  assert.ok(r.sh.bags.p2.auto, 'แพ็กให้คนที่ไม่ทัน');
  r.timeoutTurn();
  assert.strictEqual(r.sh.last.action, 'pass');
  assert.strictEqual(r.sh.last.auto, true);
}

// ---- จบเกม: คะแนน = เงิน + ราคาของบนแผง / แต้มตามอันดับ
{
  const r = setup();
  r.sh.totalRounds = 1;
  r.sh.stand.p2 = [c(90, 'sword')]; // +9
  r.shPack('p1', [1], 'apple', 0);
  r.shPack('p2', [14], 'apple', 0);
  while (r.state === 'playing') {
    if (r.sh.phase === 'inspect') r.shDecide('p0', 'pass');
    else r.timeoutTurn();
  }
  const f = r.sh.final;
  assert.strictEqual(f[0].id, 'p2');
  assert.strictEqual(f[0].total, 20 + 9 + 2);
  assert.strictEqual(r.players.get('p2').score, 5);
  assert.ok(r.viewFor('p0').sh.final[0].stand.length, 'จบแล้วเห็นแผงทุกคน');
}

// ---- ออกจากห้อง / แชทล้างเมื่อเปลี่ยนกระเป๋า
{
  const r = setup(4);
  r.sh.hands.p3 = [c(21, 'apple')];
  r.shPack('p1', [1], 'apple', 0);
  r.shPack('p2', [14], 'apple', 0);
  r.removePlayer('p3'); // คนที่ยังไม่แพ็กออก → ไปช่วงตรวจเลย
  assert.strictEqual(r.sh.phase, 'inspect');
  const k = r.chatKey();
  r.shDecide('p0', 'pass');
  r.timeoutTurn();
  assert.notStrictEqual(r.chatKey(), k, 'กระเป๋าใหม่ → ล้างแชท');
  r.removePlayer('p0'); // ผู้ตรวจการออก → จบรอบ
  assert.strictEqual(r.sh.phase, 'pack');
}

console.log('ผู้ตรวจการ ผ่านทุกเทสต์ ✅');

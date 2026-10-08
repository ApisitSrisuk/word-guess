// ทดสอบเกม "Timeline": node test-timeline.js
const assert = require('assert');
const { Room } = require('./game');
const EVENTS = require('./timeline-data');

// ข้อมูล: ไม่มีเหตุการณ์ซ้ำ ปีเป็นจำนวนเต็มที่สมเหตุสมผล
assert.ok(EVENTS.length >= 60);
assert.strictEqual(new Set(EVENTS.map((e) => e[0])).size, EVENTS.length, 'เหตุการณ์ไม่ซ้ำ');
for (const [t, y] of EVENTS) assert.ok(Number.isInteger(y) && y > 0 && y <= 2026, `${t}: ${y}`);

const card = (id, text, year) => ({ id, text, year });
function setup(n = 2) {
  const r = new Room('T');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startTimeline();
  const t = r.tl;
  t.order = Array.from({ length: n }, (_, i) => 'p' + i);
  t.idx = 0;
  t.line = [card(900, 'กลาง', 1969)];
  return r;
}

// ---- เริ่มเกม: มือคนละ 4 / ไทม์ไลน์ 1 ใบ / ไม่เห็นปีในมือ
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  assert.throws(() => r.startTimeline(), /2 คน/);
  r.addPlayer('b', 'บี');
  r.startTimeline();
  assert.strictEqual(r.tl.line.length, 1);
  assert.strictEqual(r.tl.hands.a.length, 4);
  const v = r.viewFor('a');
  assert.ok(v.tl.myHand.every((c) => c.year === null), 'ไม่เห็นปีของการ์ดในมือ');
  assert.strictEqual(v.tl.line[0].year > 0, true, 'เห็นปีในไทม์ไลน์');
  assert.strictEqual(v.tl.hands, null, 'ไม่เห็นมือคนอื่น');
}

// ---- วาง: ถูก = เข้าไทม์ไลน์ +1 / ผิด = ทิ้ง + จั่วใหม่ / ปีเท่ากันนับว่าถูก
{
  const r = setup();
  const t = r.tl;
  t.hands.p0 = [card(1, 'ไททานิก', 1912), card(2, 'iPhone', 2007)];
  t.hands.p1 = [card(3, 'BTS', 1999), card(4, 'ซ้ำปี', 1969)];
  assert.throws(() => r.tlPlace('p1', 3, 0), /ยังไม่ถึงตา/);
  assert.throws(() => r.tlPlace('p0', 999, 0), /ไม่มีการ์ด/);
  assert.throws(() => r.tlPlace('p0', 1, 5), /ช่องไม่ถูกต้อง/);
  let res = r.tlPlace('p0', 1, 0); // 1912 ก่อน 1969 → ถูก
  assert.strictEqual(res.correct, true);
  assert.deepStrictEqual(t.line.map((c) => c.year), [1912, 1969]);
  assert.strictEqual(r.players.get('p0').score, 1);
  assert.strictEqual(t.phase, 'show');
  assert.strictEqual(r.currentTurnId(), null, 'ช่วงโชว์ผลไม่มีใครเล่น');
  r.timeoutTurn(); // โชว์ผลจบ → ตาถัดไป
  assert.strictEqual(r.currentTurnId(), 'p1');
  const deckBefore = t.deck.length;
  res = r.tlPlace('p1', 3, 0); // 1999 ก่อน 1912 → ผิด
  assert.strictEqual(res.correct, false);
  assert.strictEqual(res.year, 1999);
  assert.strictEqual(t.hands.p1.length, 2, 'ผิด → ทิ้งแล้วจั่วใหม่ (จำนวนเท่าเดิม)');
  assert.strictEqual(t.deck.length, deckBefore - 1);
  assert.strictEqual(t.line.length, 2, 'การ์ดผิดไม่เข้าไทม์ไลน์');
  r.timeoutTurn();
  r.tlPlace('p0', 2, 2); // 2007 หลัง 1969 → ถูก
  r.timeoutTurn();
  assert.strictEqual(r.tlPlace('p1', 4, 2).correct, true, 'ปีเท่ากับใบข้าง ๆ นับว่าถูก (1969 วางหลัง 1969)');
}

// ---- มือหมด → เล่นให้ครบรอบ แล้วคนมือหมดชนะ +3
{
  const r = setup(3);
  const t = r.tl;
  t.hands.p0 = [card(1, 'ไททานิก', 1912)];
  t.hands.p1 = [card(2, 'iPhone', 2007), card(5, 'x', 2010)];
  t.hands.p2 = [card(3, 'Google', 1998)];
  r.tlPlace('p0', 1, 0); // p0 มือหมด
  r.timeoutTurn();
  assert.strictEqual(r.state, 'playing', 'ยังไม่จบ ต้องให้ทุกคนได้ตาเท่ากัน');
  r.tlPlace('p1', 2, 2);
  r.timeoutTurn();
  r.tlPlace('p2', 3, 2); // 1998 ระหว่าง 1969 กับ 2007 → ถูก มือหมดด้วย
  r.timeoutTurn(); // ครบรอบ
  assert.strictEqual(r.state, 'reveal');
  assert.deepStrictEqual(r.tl.winners.sort(), ['p0', 'p2']);
  assert.strictEqual(r.players.get('p0').score, 1 + 3);
  assert.strictEqual(r.players.get('p1').score, 1);
  assert.ok(r.viewFor('p1').tl.hands, 'จบเกมเห็นมือทุกคน');
}

// ---- หมดเวลาวาง = ข้ามตา (ไม่เสียการ์ด) / ไม่จับเวลา / ออกจากห้อง / เข้ากลางเกม / แชทล้างเมื่อเปลี่ยนคน
{
  const r = setup(3);
  r.turnLimit = 60;
  const k = r.chatKey();
  const n0 = r.tl.hands.p0.length;
  assert.ok(r.timerKey());
  r.timeoutTurn();
  assert.strictEqual(r.currentTurnId(), 'p1', 'หมดเวลา → ข้ามตา');
  assert.strictEqual(r.tl.hands.p0.length, n0, 'ไม่เสียการ์ด');
  assert.notStrictEqual(r.chatKey(), k);
  r.turnLimit = 0;
  assert.strictEqual(r.timerKey(), null, 'ไม่จับเวลาช่วงวาง');
  r.addPlayer('p9', 'มาสาย');
  assert.ok(r.tl.order.includes('p9') && r.tl.hands.p9.length >= 1);
  r.removePlayer('p1');
  assert.strictEqual(r.currentTurnId(), 'p2', 'คนถึงตาออก → ตาไปคนถัดไป');
}

console.log('Timeline ผ่านทุกเทสต์ ✅');

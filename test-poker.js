// ทดสอบโป๊กเกอร์: node test-poker.js
const assert = require('assert');
const { Room } = require('./game');
const { eval5, bestHand, handName, cmp } = require('./poker');

// การ์ดจากข้อความ เช่น 'As' 'Td' '9h' (s=0 ♠/🐟, h=1 ♥/🧶, c=2 ♣/🐭, d=3 ♦/🍣)
const R = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const card = (t) => ({ r: R[t[0]] || Number(t[0]), s: 'shcd'.indexOf(t[1]) });
const cards = (str) => str.split(' ').map(card);
const name5 = (str) => handName(eval5(cards(str)));

// ---- จัดประเภทมือไพ่
assert.strictEqual(name5('As Ks Qs Js Ts'), 'รอยัลฟลัช');
assert.strictEqual(name5('9h 8h 7h 6h 5h'), 'สเตรทฟลัช');
assert.strictEqual(name5('9h 9s 9c 9d 2h'), 'โฟร์การ์ด');
assert.strictEqual(name5('9h 9s 9c 2d 2h'), 'ฟูลเฮาส์');
assert.strictEqual(name5('2h 9h Kh 4h 7h'), 'ฟลัช');
assert.strictEqual(name5('5h 4s 3c 2d Ah'), 'สเตรท', 'A-2-3-4-5');
assert.strictEqual(name5('Th Js Qc Kd Ah'), 'สเตรท');
assert.strictEqual(name5('9h 9s 9c Kd 2h'), 'ตอง');
assert.strictEqual(name5('9h 9s 4c 4d 2h'), 'สองคู่');
assert.strictEqual(name5('9h 9s 4c 3d 2h'), 'หนึ่งคู่');
assert.strictEqual(name5('Ah Js 8c 4d 2h'), 'ไพ่สูง');
assert.strictEqual(name5('Qh Ks Ac 2d 3h'), 'ไพ่สูง', 'Q-K-A-2-3 ไม่ใช่สเตรท');

// ---- ชื่อมือไพ่แบบละเอียด + มือก่อนเปิดไพ่กลาง + ไพ่ที่กำลังลุ้น
const { describe, currentHand, draws } = require('./poker');
assert.strictEqual(describe(eval5(cards('Kh Ks 7c 7d 2h'))), 'สองคู่ K กับ 7');
assert.strictEqual(describe(eval5(cards('8h 8s 8c 3d 3h'))), 'ฟูลเฮาส์ (ตอง 8 คู่ 3)');
assert.strictEqual(describe(eval5(cards('5h 4s 3c 2d Ah'))), 'สเตรท (สูงสุด 5)');
assert.strictEqual(describe(currentHand(cards('Ah Ad'))), 'หนึ่งคู่ A', 'ก่อนเปิดไพ่กลาง: คู่ในมือ');
assert.strictEqual(describe(currentHand(cards('Kh 7d'))), 'ไพ่สูง K');
{
  const c = cards('Ah 7h 2h 9h Kc'); // หัวใจ 4 ใบ
  assert.deepStrictEqual(draws(c, currentHand(c)), ['ลุ้นฟลัช (ขาดอีก 1 ใบ)']);
  const d = cards('5h 6s 7c 8d Kc'); // 5-6-7-8
  assert.deepStrictEqual(draws(d, currentHand(d)), ['ลุ้นสเตรท (ขาดอีก 1 ใบ)']);
  const e = cards('5h 6s 7c 8d Kc 2h 3s');
  assert.deepStrictEqual(draws(e, currentHand(e)), [], 'เปิดครบแล้ว ไม่มีลุ้น');
}

// ---- เปรียบเทียบ
const v = (str) => eval5(cards(str));
assert.ok(cmp(v('Ah As 2c 3d 4h'), v('Kh Ks Qc Jd 9h')) > 0, 'คู่ A ชนะคู่ K');
assert.ok(cmp(v('Ah As 9c 3d 4h'), v('Ad Ac 8c 7d 6h')) > 0, 'คู่เท่ากัน ดูไพ่ประกอบ');
assert.ok(cmp(v('6h 5s 4c 3d 2h'), v('5h 4s 3c 2d Ah')) > 0, 'สเตรท 6 สูงกว่า สเตรท A-5');
assert.ok(cmp(v('Kh Ks Kc 2d 2h'), v('Qh Qs Qc Ad Ah')) > 0, 'ฟูลเฮาส์ดูตองก่อน');
assert.strictEqual(cmp(v('Ah Ks Qc Jd 9h'), v('As Kd Qh Jc 9s')), 0, 'เสมอ');
assert.strictEqual(handName(bestHand(cards('Ah Kh 2c 3d Qh Jh Th'))), 'รอยัลฟลัช', 'เลือก 5 จาก 7');

// ---- ตั้งโต๊ะแบบกำหนดไพ่เอง
function table(n, stacks) {
  const r = new Room('P');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startPoker();
  const k = r.pk;
  // เริ่มมือใหม่ด้วยลำดับ/ชิปที่กำหนด
  k.order = Array.from({ length: n }, (_, i) => 'p' + i);
  if (stacks) stacks.forEach((c, i) => (k.chips['p' + i] = c));
  else k.order.forEach((id) => (k.chips[id] = 1000));
  k.dealerIdx = n - 1; // มือถัดไป: ดีลเลอร์ = p0
  k.handNo = 0;
  r.pkNewHand();
  return r;
}
const rig = (r, holes, board) => {
  const k = r.pk;
  for (const [id, h] of Object.entries(holes)) k.holes[id] = cards(h);
  k.deck = cards(board).reverse(); // pop() จากท้าย = ไพ่ใบแรกของ board
};

// ---- blinds / ลำดับตา (3 คน: ดีลเลอร์ p0, SB p1, BB p2, preflop เริ่ม p0)
{
  const r = table(3);
  const k = r.pk;
  assert.strictEqual(k.sbId, 'p1');
  assert.strictEqual(k.bbId, 'p2');
  assert.strictEqual(k.chips.p1, 990);
  assert.strictEqual(k.chips.p2, 980);
  assert.strictEqual(r.currentTurnId(), 'p0');
  assert.strictEqual(r.viewFor('p1').pk.myHole.length, 2);
  assert.ok(!('holes' in r.viewFor('p1').pk), 'ไม่เห็นไพ่คนอื่น');
  assert.throws(() => r.pkAct('p1', 'call'), /ยังไม่ถึงตา/);
  assert.throws(() => r.pkAct('p0', 'check'), /ต้องตาม 20/);
  assert.throws(() => r.pkAct('p0', 'raise', 30), /ขั้นต่ำเป็น 40/);
  r.pkAct('p0', 'call');
  r.pkAct('p1', 'call');
  assert.strictEqual(r.currentTurnId(), 'p2', 'BB ได้ตัดสินใจ (option)');
  r.pkAct('p2', 'check');
  assert.strictEqual(k.street, 'flop');
  assert.strictEqual(k.board.length, 3);
  assert.strictEqual(r.currentTurnId(), 'p1', 'หลัง flop เริ่มคนถัดจากดีลเลอร์');
  assert.strictEqual(r.pkPot(), 60);
}

// ---- หมอบจนเหลือคนเดียว = ได้กองเงินทันที / ไม่ต้องโชว์ไพ่
{
  const r = table(3);
  r.pkAct('p0', 'raise', 100);
  r.pkAct('p1', 'fold');
  r.pkAct('p2', 'fold');
  assert.strictEqual(r.pk.phase, 'showdown');
  assert.strictEqual(r.pk.result.uncontested, true);
  assert.strictEqual(r.pk.chips.p0, 1000 + 10 + 20);
  assert.deepStrictEqual(r.pk.result.shown, {});
}

// ---- showdown: มือดีกว่าชนะ / เสมอแบ่งกัน
{
  const r = table(2); // heads-up: ดีลเลอร์ = SB = p0
  assert.strictEqual(r.pk.sbId, 'p0');
  assert.strictEqual(r.currentTurnId(), 'p0', 'heads-up preflop ดีลเลอร์เริ่ม');
  rig(r, { p0: 'Ah Ad', p1: 'Kh Kd' }, '2c 7s 9h Jc 3d');
  r.pkAct('p0', 'call');
  r.pkAct('p1', 'check');
  for (let i = 0; i < 3; i++) { r.pkAct(r.currentTurnId(), 'check'); r.pkAct(r.currentTurnId(), 'check'); }
  assert.strictEqual(r.pk.phase, 'showdown');
  assert.strictEqual(r.pk.chips.p0, 1020);
  assert.strictEqual(r.pk.result.winners[0].hand, 'หนึ่งคู่ A');
  assert.strictEqual(r.viewFor('p1').pk.myHand, 'หนึ่งคู่ K', 'บอกมือไพ่ของเรา');
  assert.ok(r.viewFor('p1').pk.result.shown.p0, 'showdown เปิดไพ่');
}
{
  const r = table(2);
  rig(r, { p0: 'Ah 2d', p1: 'Ad 3c' }, 'Kc Qs Jh Tc 9d'); // ทั้งคู่ได้สเตรท A
  r.pkAct('p0', 'call');
  r.pkAct('p1', 'check');
  for (let i = 0; i < 3; i++) { r.pkAct(r.currentTurnId(), 'check'); r.pkAct(r.currentTurnId(), 'check'); }
  assert.strictEqual(r.pk.chips.p0, 1000);
  assert.strictEqual(r.pk.chips.p1, 1000, 'เสมอแบ่งกองเท่ากัน');
}

// ---- all-in + side pot: คนชิปน้อยชนะได้แค่กองหลัก
{
  const r = table(3, [1000, 100, 1000]); // p1 มีแค่ 100
  rig(r, { p0: 'Kh Kd', p1: 'Ah As', p2: 'Qh Qd' }, '2c 7s 9h Jc 3d');
  r.pkAct('p0', 'raise', 300);
  r.pkAct('p1', 'allin'); // 100 (ไม่ถึงขั้นต่ำ = all-in ไม่เต็ม)
  r.pkAct('p2', 'call');
  // flop → river: p0 กับ p2 เช็คกันจนจบ
  while (r.pk.phase === 'bet') r.pkAct(r.currentTurnId(), 'check');
  const k = r.pk;
  assert.strictEqual(k.phase, 'showdown');
  // กองหลัก 100x3 = 300 → p1 (AA) · side pot (300-100)x2 = 400 → p0 (KK ชนะ QQ)
  assert.strictEqual(k.chips.p1, 300);
  assert.strictEqual(k.chips.p0, 1000 - 300 + 400);
  assert.strictEqual(k.chips.p2, 700);
  assert.strictEqual(k.chips.p0 + k.chips.p1 + k.chips.p2, 2100, 'ชิปไม่หายไม่เกิน');
}

// ---- ทุกคน all-in → เปิดไพ่กลางให้ครบเอง / ชิปหมด = ตกรอบ / เหลือคนเดียว = จบเกม
{
  const r = table(2, [1000, 50]);
  rig(r, { p0: 'Ah Ad', p1: '7h 2d' }, 'Kc Qs 3h 9c 4d');
  r.pkAct('p0', 'raise', 200);
  r.pkAct('p1', 'allin');
  assert.strictEqual(r.pk.board.length, 5, 'ไม่มีใครเดิมพันต่อได้ → เปิดครบ 5 ใบ');
  assert.strictEqual(r.pk.phase, 'showdown');
  assert.strictEqual(r.pk.chips.p1, 0);
  r.timeoutTurn(); // ไปมือถัดไป → เหลือคนเดียว
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.pk.final[0].id, 'p0');
  assert.strictEqual(r.players.get('p0').score, 5);
}

// ---- หมดเวลา: ผ่านได้ = ผ่าน / ต้องตาม = หมอบ · ออกจากห้อง = หมอบ · เข้ากลางมือ = นั่งมือหน้า
{
  const r = table(3);
  r.turnLimit = 30;
  r.timeoutTurn(); // p0 ต้องตาม 20 → หมอบ
  assert.ok(r.pk.folded.includes('p0'));
  r.addPlayer('p9', 'มาสาย');
  assert.ok(r.pk.waiting.includes('p9'));
  assert.strictEqual(r.viewFor('p9').pk.myHole, null);
  r.removePlayer('p1');
  assert.strictEqual(r.pk.phase, 'showdown', 'เหลือคนเดียว → p2 ได้กอง');
  r.timeoutTurn();
  assert.ok(r.pk.inHand.includes('p9'), 'มือใหม่ได้นั่งแล้ว');
  assert.strictEqual(r.pk.chips.p9 + r.pk.bets.p9, 1000, 'ได้ชิปเริ่มต้น 1000 (อาจโดน blind ไปแล้ว)');
}

console.log('โป๊กเกอร์ ผ่านทุกเทสต์ ✅');

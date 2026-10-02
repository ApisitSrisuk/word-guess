// ทดสอบเกม "หัวขโมยชีส": node test-cheese.js
const assert = require('assert');
const { Room } = require('./game');

// ตั้งเกมแบบกำหนดเต๋า/ขโมยเอง ให้เทสต์แน่นอน
function setup(dice, thief = 'p0', accomplice = false) {
  const r = new Room('H');
  const ids = dice.map((_, i) => 'p' + i);
  ids.forEach((id, i) => r.addPlayer(id, 'หนู' + i));
  r.startCheese();
  r.ch.thiefId = thief;
  r.ch.wantAccomplice = accomplice;
  ids.forEach((id, i) => (r.ch.dice[id] = dice[i]));
  r.chStartNight(); // เข้ากลางคืน ตี 1
  return r;
}
const goto = (r, hour) => { while (r.ch.phase === 'night' && r.ch.hour < hour) r.chNextHour(); };
const mem = (r, id) => r.ch.memories[id].join(' | ');

// ---- เริ่มเกม / ทอยเต๋า
{
  const r = new Room('S');
  for (let i = 0; i < 2; i++) r.addPlayer('p' + i, 'หนู' + i);
  assert.throws(() => r.startCheese(), /3 คน/);
  r.addPlayer('p2', 'หนู2');
  r.startCheese();
  assert.strictEqual(r.ch.phase, 'roll');
  assert.strictEqual(r.ch.wantAccomplice, false, 'น้อยกว่า 6 คนไม่มีผู้สมรู้ร่วมคิด');
  const d = r.chRoll('p0');
  assert.ok(d >= 1 && d <= 6);
  assert.throws(() => r.chRoll('p0'), /ทอยไปแล้ว/);
  const v = r.viewFor('p1');
  assert.strictEqual(v.ch.myDie, null);
  assert.strictEqual(v.ch.dice, null, 'ไม่เห็นเต๋าคนอื่น');
  assert.strictEqual(v.ch.rolled.length, 1);
  // หมดเวลาทอย → ทอยให้ แล้วเข้ากลางคืน
  r.timeoutTurn();
  assert.strictEqual(r.ch.phase, 'night');
  assert.ok(Object.values(r.ch.dice).every((x) => x >= 1 && x <= 6));
  // คนที่ไม่ใช่ขโมยไม่รู้ว่าใครเป็นขโมย
  const nonThief = r.ch.ids.find((id) => id !== r.ch.thiefId);
  assert.strictEqual(r.viewFor(nonThief).ch.thiefId, null);
  assert.strictEqual(r.viewFor(r.ch.thiefId).ch.amThief, true);
}

// ---- ตื่นคนเดียว = แอบดูได้ / ตื่นพร้อมกัน = เห็นกัน / ตื่นตีเดียวกับขโมย = เห็นขโมย
{
  // p0 ขโมย ทอย 5, p1 ทอย 5 (เห็นขโมย), p2 ทอย 3 คนเดียว, p3 ทอย 1, p4 ทอย 1
  const r = setup([5, 5, 3, 1, 1]);
  assert.strictEqual(r.ch.hour, 1);
  assert.deepStrictEqual(r.viewFor('p3').ch.awakeWith, ['p4']);
  assert.match(mem(r, 'p3'), /ตื่นพร้อม หนู4/);
  assert.strictEqual(r.viewFor('p0').ch.awakeNow, false);
  goto(r, 3);
  assert.strictEqual(r.viewFor('p2').ch.pending, 'peek');
  assert.throws(() => r.chPeek('p1', 'p0'), /แอบดูไม่ได้/);
  r.chPeek('p2', 'p0');
  assert.match(mem(r, 'p2'), /แอบดูเต๋าของ หนู0 = 🎲 5/);
  assert.throws(() => r.chPeek('p2', 'p1'), /แอบดูไม่ได้/, 'แอบดูได้ครั้งเดียว');
  goto(r, 5);
  assert.match(mem(r, 'p1'), /เห็น 🐀 หนู0 ขโมยชีส/);
  assert.match(mem(r, 'p0'), /หนู1 ตื่นอยู่และเห็นคุณ/);
  assert.throws(() => r.addChat('p1', 'หนู0 ขโมย!'), /กลางคืน/, 'กลางคืนห้ามคุย');
  r.chNextHour(); // ตี 6
  r.chNextHour(); // เช้า
  assert.strictEqual(r.ch.phase, 'day');
  assert.ok(r.addChat('p1', 'หนู0 ขโมย!'), 'เช้าแล้วคุยได้');

  // โหวต: ขโมยได้มากสุด → หนูดีชนะ
  assert.throws(() => r.chVote('p1', 'p1'), /ตัวเอง/);
  r.chVote('p1', 'p0'); r.chVote('p2', 'p0'); r.chVote('p3', 'p0'); r.chVote('p4', 'p1');
  assert.strictEqual(r.ch.phase, 'day', 'รอขโมยโหวตด้วย');
  r.chVote('p0', 'p4');
  assert.strictEqual(r.ch.winner, 'mice');
  assert.strictEqual(r.players.get('p1').score, 2);
  assert.strictEqual(r.players.get('p0').score, 0);
  const v = r.viewFor('p3');
  assert.strictEqual(v.ch.thiefId, 'p0', 'จบแล้วเฉลย');
  assert.strictEqual(v.ch.dice.p2, 3);
  assert.ok(v.ch.log.some((l) => /ขโมยชีส/.test(l)));
}

// ---- ไม่ได้แอบดู (หมดเวลา) จดไว้ / จับผิดคน = ขโมยชนะ / เสมอกันที่มีขโมย = จับได้
{
  const r = setup([6, 2, 3, 4]);
  goto(r, 2);
  r.timeoutTurn(); // p1 ไม่ได้เลือก
  assert.match(mem(r, 'p1'), /ไม่ได้แอบดู/);
  goto(r, 7);
  assert.strictEqual(r.ch.phase, 'day');
  r.chVote('p0', 'p1'); r.chVote('p1', 'p2'); r.chVote('p2', 'p1'); r.chVote('p3', 'p1');
  assert.strictEqual(r.ch.winner, 'thief');
  assert.strictEqual(r.players.get('p0').score, 4);
}
{
  const r = setup([6, 2, 3, 4]);
  goto(r, 7);
  r.chVote('p0', 'p1'); r.chVote('p1', 'p0'); r.chVote('p2', 'p0'); r.chVote('p3', 'p1');
  assert.strictEqual(r.ch.winner, 'mice', 'เสมอ 2-2 รวมขโมย = จับได้');
}

// ---- ผู้สมรู้ร่วมคิด (6 คนขึ้นไป): ขโมยชวนตอนตีของตัวเอง ชนะด้วยกัน
{
  const r = setup([4, 1, 2, 3, 5, 6], 'p0', true);
  goto(r, 4);
  assert.strictEqual(r.viewFor('p0').ch.pending, 'recruit');
  r.chRecruit('p0', 'p5');
  assert.strictEqual(r.viewFor('p5').ch.amAccomplice, true);
  assert.strictEqual(r.viewFor('p5').ch.thiefId, 'p0', 'ผู้สมรู้ร่วมคิดรู้ว่าใครขโมย');
  assert.strictEqual(r.viewFor('p1').ch.accompliceId, null);
  goto(r, 7);
  for (const v of ['p0', 'p5', 'p2', 'p3', 'p4']) r.chVote(v, 'p1');
  r.chVote('p1', 'p2');
  assert.strictEqual(r.ch.winner, 'thief');
  assert.strictEqual(r.players.get('p5').score, 3);
}

// ---- คนหลุดตอนโหวต / ขโมยออกจากห้อง / เข้ามากลางเกม
{
  const r = setup([1, 2, 3, 4]);
  goto(r, 7);
  r.chVote('p0', 'p1'); r.chVote('p1', 'p0'); r.chVote('p2', 'p0');
  r.players.get('p3').connected = false;
  assert.ok(r.onPresenceChange());
  assert.strictEqual(r.ch.winner, 'mice');
}
{
  const r = setup([1, 2, 3, 4]);
  r.addPlayer('p9', 'มาสาย');
  assert.strictEqual(r.viewFor('p9').ch.inGame, false);
  r.removePlayer('p0');
  assert.strictEqual(r.ch.winner, 'mice', 'ขโมยหนีออกจากห้อง');
}

// ---- เวลา: กลางคืนจับเวลาเสมอ แม้หัวห้องตั้ง "ไม่จับเวลา"
{
  const r = setup([1, 2, 3, 4]);
  r.turnLimit = 0;
  assert.ok(r.timerKey(), 'กลางคืนต้องเดินเวลา');
  assert.strictEqual(r.timerMs(), 8000);
  goto(r, 7);
  assert.strictEqual(r.timerKey(), null, 'ตอนเช้าไม่จับเวลาถ้าตั้งไม่จับ');
  r.turnLimit = 60;
  assert.strictEqual(r.timerMs(), 120000, 'คุย+โหวต = 2 เท่าของเวลาต่อตา');
}

console.log('หัวขโมยชีส ผ่านทุกเทสต์ ✅');

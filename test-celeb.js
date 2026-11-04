// ทดสอบเกม "ทายคนดัง" (เปิดจิ๊กซอผลัดกันทาย): node test-celeb.js
const assert = require('assert');
const { Room } = require('./game');
const { CELEBS, celebByToken } = require('./celeb');

// ---- ข้อมูลคนดัง: มีรูป ไม่ซ้ำชื่อ มีทั้งไทยและต่างประเทศ
assert.ok(CELEBS.length >= 100);
assert.strictEqual(new Set(CELEBS.map((c) => c.name)).size, CELEBS.length, 'ชื่อไม่ซ้ำ');
assert.ok(CELEBS.every((c) => /^https:\/\/.+\.(jpe?g|png|webp|gif)$/i.test(c.img) && ['th', 'intl'].includes(c.group) && ['m', 'f'].includes(c.sex)));
assert.ok(CELEBS.filter((c) => c.group === 'th').length >= 40);

function setup(opts, n = 3) {
  const r = new Room('C');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startCeleb(opts);
  return r;
}
const q = (r) => r.ce.qs[r.ce.idx];
const wrongOf = (r, k = 0) => q(r).choices.filter((x) => x !== q(r).id)[k];

// ---- เลือกกลุ่ม/จำนวนข้อ · ตัวเลือก 4 ชื่อมีคำตอบ · กลุ่มเดียวกัน · รูปใช้รหัสสุ่ม
{
  const r = setup({ group: 'th', count: 5 });
  assert.strictEqual(r.ce.qs.length, 5);
  for (const x of r.ce.qs) {
    assert.strictEqual(new Set(x.choices).size, 4);
    assert.ok(x.choices.includes(x.id));
    assert.ok(x.choices.every((id) => CELEBS.find((c) => c.id === id).group === 'th'));
  }
  assert.ok(setup({ group: 'intl', count: 10 }).ce.qs.every((x) => CELEBS.find((c) => c.id === x.id).group === 'intl'));
  assert.strictEqual(setup({ group: 'xx', count: 99 }).ce.qs.length, 10, 'ค่าแปลก ๆ → ค่าเริ่มต้น');
  const v = r.viewFor('p0').ce;
  assert.ok(/^\/celeb-img\/[0-9a-f]{18}$/.test(v.img));
  assert.strictEqual(celebByToken(v.img.split('/').pop()).id, q(r).id);
  assert.strictEqual(v.answer, null);
  assert.deepStrictEqual(v.opened, [], 'เริ่มข้อ = ปิดทุกชิ้น');
}

// ---- ผลัดกัน: ต้องเปิดก่อนทาย · ไม่ใช่ตา = ทำไม่ได้ · ส่งต่อ · ทายผิด = หมดสิทธิ์ · ถูก = แต้มตามชิ้นที่เปิด
{
  const r = setup({ group: 'mix', count: 5 });
  const [a, b, c] = r.ce.order;
  assert.strictEqual(r.currentTurnId(), a);
  assert.throws(() => r.ceOpen(b, 0), /ยังไม่ถึงตา/);
  assert.throws(() => r.ceAnswer(a, q(r).id), /เปิดจิ๊กซอก่อน/);
  if (a !== r.hostId) assert.throws(() => r.pass(a), /เปิดจิ๊กซอก่อน/); // หัวห้องกด = ข้ามข้อ
  r.ceOpen(a, 5);
  assert.throws(() => r.ceOpen(a, 6), /เปิดไปแล้ว/);
  r.pass(a); // ส่งต่อ
  assert.strictEqual(r.currentTurnId(), b);
  assert.throws(() => r.ceOpen(b, 5), /ยังปิดอยู่/);
  r.ceOpen(b, 6);
  assert.strictEqual(r.ceAnswer(b, wrongOf(r)).ok, false);
  assert.deepStrictEqual(r.ce.out, [b]);
  assert.strictEqual(r.currentTurnId(), c);
  assert.strictEqual(r.viewFor(a).ce.guesses.length, 1, 'ทุกคนเห็นว่าใครทายผิดชื่อไหน');
  r.ceOpen(c, 7);
  r.pass(c);
  assert.strictEqual(r.currentTurnId(), a, 'ข้ามคนที่ทายผิดไปแล้ว');
  r.ceOpen(a, 8); // เปิดแล้ว 4 ชิ้น → 9 แต้ม
  const res = r.ceAnswer(a, q(r).id);
  assert.deepStrictEqual(res, { ok: true, pts: 9 });
  assert.strictEqual(r.players.get(a).score, 9);
  assert.strictEqual(r.ce.phase, 'reveal');
  assert.strictEqual(r.viewFor(b).ce.answer.id, q(r).id);
  r.timeoutTurn();
  assert.strictEqual(r.viewFor(a).ce.n, 2);
  assert.deepStrictEqual(r.ce.opened, []);
  assert.strictEqual(r.currentTurnId(), b, 'ข้อใหม่เริ่มที่คนถัดไป');
}

// ---- ทุกคนทายผิด = เฉลย · หมดเวลา = สุ่มเปิดให้แล้วส่งต่อ
{
  const r = setup({ group: 'mix', count: 5 }, 2);
  const [a, b] = r.ce.order;
  r.timeoutTurn();
  assert.strictEqual(r.ce.opened.length, 1, 'หมดเวลา → สุ่มเปิดให้ 1 ชิ้น');
  assert.strictEqual(r.currentTurnId(), b);
  r.ceOpen(b, r.ce.opened[0] === 0 ? 1 : 0);
  r.ceAnswer(b, wrongOf(r, 0));
  r.ceOpen(a, 19 - (r.ce.opened.includes(19) ? 1 : 0));
  r.ceAnswer(a, wrongOf(r, 1));
  assert.strictEqual(r.ce.phase, 'reveal', 'ทุกคนทายผิด → เฉลย');
  assert.strictEqual(r.ce.result, null);
}

// ---- เปิดครบทุกชิ้นแล้วส่งต่อครบรอบ = เฉลย · ได้แต้มต่ำสุด 1
{
  const r = setup({ group: 'mix', count: 5 }, 2);
  r.ce.opened = Array.from({ length: 19 }, (_, i) => i);
  const [a, b] = r.ce.order;
  r.ceOpen(a, 19);
  r.pass(a);
  assert.strictEqual(r.ce.step, 'guess', 'เปิดครบแล้ว → ไม่ต้องเปิด ทายหรือส่งต่อเลย');
  r.pass(b);
  assert.strictEqual(r.ce.phase, 'reveal', 'เห็นรูปเต็มแล้วส่งต่อครบทุกคน → เฉลย');
}

// ---- คนถึงตาออกจากห้อง → คนถัดไป · หัวห้องข้ามข้อ · ครบทุกข้อ = จบ
{
  const r = setup({ group: 'intl', count: 5 });
  const [a, b] = r.ce.order;
  r.removePlayer(a);
  assert.strictEqual(r.currentTurnId(), b);
  const notHost = r.ce.order.find((x) => x !== r.hostId && x !== r.currentTurnId());
  if (notHost) assert.throws(() => r.pass(notHost), /ยังไม่ถึงตา/);
  while (r.state === 'playing') r.cePass(r.hostId);
  assert.strictEqual(r.ce.phase, 'over');
}

// ---- เกมใหม่ไม่ซ้ำคนเดิม (ถ้ายังพอ)
{
  const r = setup({ group: 'th', count: 20 });
  const first = new Set(r.ce.qs.map((x) => x.id));
  r.startCeleb({ group: 'th', count: 20 });
  assert.ok(r.ce.qs.every((x) => !first.has(x.id)), 'ไม่ซ้ำกับเกมก่อน');
}

console.log('ทายคนดัง ผ่านทุกเทสต์ ✅');

// ทดสอบเกม "ทายคนดัง" (เปิดจิ๊กซอ แย่งกันตอบ): node test-celeb.js
const assert = require('assert');
const { Room } = require('./game');
const { CELEBS, celebByToken } = require('./celeb');

// ---- ข้อมูลคนดัง: มีรูป ไม่ซ้ำชื่อ มีทั้งไทยและต่างประเทศ
const imgsOf = (c) => c.imgs || [c.img];
assert.ok(CELEBS.length >= 100);
assert.strictEqual(new Set(CELEBS.map((c) => c.name)).size, CELEBS.length, 'ชื่อไม่ซ้ำ');
assert.ok(CELEBS.every((c) => imgsOf(c).length && imgsOf(c).every((u) => /^https:\/\/.+\.(jpe?g|png|webp|gif)$/i.test(u)) && ['th', 'intl'].includes(c.group) && ['m', 'f'].includes(c.sex)));
assert.ok(CELEBS.filter((c) => c.group === 'th').length >= 40);

function setup(opts, n = 3) {
  const r = new Room('C');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startCeleb(opts);
  return r;
}
const q = (r) => r.ce.qs[r.ce.idx];
const wrongOf = (r, k = 0) => q(r).choices.filter((x) => x !== q(r).id)[k];
const guessers = (r) => [...r.players.keys()].filter((x) => x !== r.ce.opener);

// ---- เริ่มเกม: อย่างน้อย 2 คน · กลุ่ม/จำนวนข้อ · ตัวเลือก 4 ชื่อ · รูปใช้รหัสสุ่ม · คนเปิดรู้คำตอบ
{
  const solo = new Room('S');
  solo.addPlayer('a', 'เอ');
  assert.throws(() => solo.startCeleb({}), /2 คน/);
  const r = setup({ group: 'th', count: 5 });
  assert.strictEqual(r.ce.qs.length, 5);
  for (const x of r.ce.qs) {
    assert.strictEqual(new Set(x.choices).size, 4);
    assert.ok(x.choices.includes(x.id));
    assert.ok(x.choices.every((id) => CELEBS.find((c) => c.id === id).group === 'th'));
  }
  assert.ok(setup({ group: 'intl', count: 10 }).ce.qs.every((x) => CELEBS.find((c) => c.id === x.id).group === 'intl'));
  assert.strictEqual(setup({ group: 'xx', count: 99 }).ce.qs.length, 10, 'ค่าแปลก ๆ → ค่าเริ่มต้น');
  const [g] = guessers(r);
  const v = r.viewFor(g).ce;
  assert.ok(/^\/celeb-img\/[0-9a-f]{18}$/.test(v.img));
  const hit = celebByToken(v.img.split('/').pop());
  assert.strictEqual(hit.id, q(r).id);
  assert.ok(imgsOf(CELEBS.find((c) => c.id === hit.id)).includes(hit.img), 'รูปเป็นหนึ่งในรูปของคนนั้น');
  assert.strictEqual(v.answer, null, 'คนตอบยังไม่รู้คำตอบ');
  assert.strictEqual(r.viewFor(r.ce.opener).ce.answer.id, q(r).id, 'คนเปิดรู้คำตอบ');
  assert.deepStrictEqual(v.opened, []);
  assert.strictEqual(r.currentTurnId(), r.ce.opener);
}

// ---- เปิด: เฉพาะคนเปิด · ตอบ: ต้องเปิดก่อน · คนเปิดตอบไม่ได้ · ผิด = หมดสิทธิ์ · ถูกคนแรก = แต้ม + คนเปิดได้ครึ่ง
{
  const r = setup({ group: 'mix', count: 5 });
  const op = r.ce.opener;
  const [a, b] = guessers(r);
  assert.throws(() => r.ceOpen(a, 0), /ไม่ได้เป็นคนเปิด/);
  assert.throws(() => r.ceAnswer(a, q(r).id), /เปิดชิ้นแรก/);
  r.ceOpen(op, 3);
  assert.throws(() => r.ceOpen(op, 3), /ยังปิดอยู่/);
  assert.throws(() => r.ceAnswer(op, q(r).id), /คนเปิดตอบไม่ได้/);
  assert.strictEqual(r.ceAnswer(a, wrongOf(r)).ok, false);
  assert.throws(() => r.ceAnswer(a, q(r).id), /ตอบผิดไปแล้ว/);
  assert.strictEqual(r.ce.phase, 'q', 'ยังมีคนตอบเหลือ');
  assert.strictEqual(r.viewFor(b).ce.guesses.length, 1, 'ทุกคนเห็นชื่อที่ผิดแล้ว');
  r.ceOpen(op, 4);
  r.ceOpen(op, 5); // เปิด 3 ชิ้น → 9 แต้ม
  assert.deepStrictEqual(r.ceAnswer(b, q(r).id), { ok: true, pts: 9 });
  assert.strictEqual(r.players.get(b).score, 9);
  assert.strictEqual(r.players.get(op).score, 5, 'คนเปิดได้ครึ่งหนึ่ง (ปัดขึ้น)');
  assert.strictEqual(r.ce.phase, 'reveal');
  assert.strictEqual(r.viewFor(a).ce.answer.id, q(r).id);
  const order = r.ce.order;
  r.timeoutTurn();
  assert.strictEqual(r.viewFor(a).ce.n, 2);
  assert.deepStrictEqual(r.ce.opened, []);
  assert.strictEqual(r.ce.opener, order[(order.indexOf(op) + 1) % order.length], 'ข้อใหม่ = คนเปิดคนถัดไป');
}

// ---- ทุกคนผิดหมด = เฉลย · คนเปิดช้า = สุ่มเปิดให้ · เปิดครบแล้วหมดเวลา = เฉลย
{
  const r = setup({ group: 'mix', count: 5 });
  r.timeoutTurn();
  assert.strictEqual(r.ce.opened.length, 1, 'หมดเวลา → สุ่มเปิดให้');
  const [a, b] = guessers(r);
  r.ceAnswer(a, wrongOf(r, 0));
  r.ceAnswer(b, wrongOf(r, 1));
  assert.strictEqual(r.ce.phase, 'reveal', 'ทุกคนผิดหมด → เฉลย');
  assert.strictEqual(r.ce.result, null);
  r.timeoutTurn();
  for (let i = 0; i < 20; i++) r.timeoutTurn();
  assert.strictEqual(r.ce.opened.length, 20);
  assert.strictEqual(r.ce.phase, 'q');
  r.timeoutTurn();
  assert.strictEqual(r.ce.phase, 'reveal', 'เปิดครบแล้วหมดเวลา → เฉลย');
}

// ---- คนตอบหลุดหมด = เฉลย · คนเปิดออก = เฉลย · หัวห้องข้าม · ครบทุกข้อ = จบ
{
  const r = setup({ group: 'intl', count: 5 });
  for (const x of guessers(r)) r.players.get(x).connected = false;
  assert.ok(r.onPresenceChange());
  assert.strictEqual(r.ce.phase, 'reveal');
  for (const x of r.players.keys()) r.players.get(x).connected = true;
  r.timeoutTurn();
  r.removePlayer(r.ce.opener);
  assert.strictEqual(r.ce.phase, 'reveal', 'คนเปิดออก → เฉลยข้อนี้');
  assert.throws(() => r.cePass(guessers(r).find((x) => x !== r.hostId)), /หัวห้อง/);
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

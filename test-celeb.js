// ทดสอบเกม "ทายคนดัง": node test-celeb.js
process.env.CE_Q_MS = '15000';
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

// ---- เลือกกลุ่ม/จำนวนข้อ · ตัวเลือก 4 ชื่อมีคำตอบ · กลุ่มเดียวกัน
{
  const r = setup({ group: 'th', count: 5 });
  const e = r.ce;
  assert.strictEqual(e.qs.length, 5);
  for (const q of e.qs) {
    assert.strictEqual(q.choices.length, 4);
    assert.ok(q.choices.includes(q.id));
    assert.strictEqual(new Set(q.choices).size, 4);
    assert.ok(q.choices.every((id) => CELEBS.find((c) => c.id === id).group === 'th'), 'ตัวเลือกเป็นคนไทยหมด');
  }
  assert.ok(setup({ group: 'intl', count: 10 }).ce.qs.every((q) => CELEBS.find((c) => c.id === q.id).group === 'intl'));
  assert.strictEqual(setup({ group: 'xx', count: 99 }).ce.qs.length, 10, 'ค่าแปลก ๆ → ค่าเริ่มต้น');
  // รูปใช้รหัสสุ่ม ไม่บอกชื่อ
  const v = r.viewFor('p0').ce;
  assert.ok(/^\/celeb-img\/[0-9a-f]{18}$/.test(v.img));
  assert.strictEqual(celebByToken(v.img.split('/').pop()).id, e.qs[0].id);
  assert.strictEqual(v.answer, null, 'ยังไม่เฉลย');
}

// ---- ตอบ: ครั้งเดียว · ถูกได้แต้มตามความไว · ผิด 0 · รู้ผลตอนเฉลย · ตอบครบ = เฉลย
{
  const r = setup({ group: 'mix', count: 5 });
  const q = r.ce.qs[0];
  const wrong = q.choices.find((x) => x !== q.id);
  const res = r.ceAnswer('p0', q.id);
  assert.ok(res.ok && res.pts >= 9, 'ตอบไวได้เกือบเต็ม');
  assert.throws(() => r.ceAnswer('p0', q.id), /ตอบข้อนี้ไปแล้ว/);
  assert.throws(() => r.ceAnswer('p1', 99999), /ไม่ถูกต้อง/);
  assert.strictEqual(r.viewFor('p0').ce.mine.ok, undefined, 'ยังไม่บอกว่าถูก/ผิดจนกว่าจะเฉลย');
  r.ce.startedAt -= 10000; // ผ่านไป 10 วิ
  assert.ok(r.ceAnswer('p1', q.id).pts <= 4, 'ตอบช้าได้น้อย');
  assert.strictEqual(r.ce.phase, 'q');
  r.ceAnswer('p2', wrong);
  assert.strictEqual(r.ce.phase, 'reveal', 'ตอบครบ → เฉลย');
  assert.strictEqual(r.players.get('p2').score, 0);
  const v = r.viewFor('p2').ce;
  assert.strictEqual(v.answer.id, q.id);
  assert.strictEqual(v.mine.ok, false);
  r.timeoutTurn();
  assert.strictEqual(r.ce.n === undefined && r.viewFor('p0').ce.n, 2, 'ข้อถัดไป');
}

// ---- หมดเวลา / คนหลุดไม่ต้องรอ / หัวห้องข้าม / ครบทุกข้อ = จบ
{
  const r = setup({ group: 'intl', count: 5 });
  r.timeoutTurn();
  assert.strictEqual(r.ce.phase, 'reveal', 'หมดเวลา → เฉลย');
  r.timeoutTurn();
  r.players.get('p1').connected = false;
  r.players.get('p2').connected = false;
  r.ceAnswer('p0', r.ce.qs[1].id);
  assert.strictEqual(r.ce.phase, 'reveal', 'คนหลุดไม่ต้องรอ');
  assert.throws(() => r.cePass('p1'), /หัวห้อง/);
  while (r.state === 'playing') r.cePass(r.hostId);
  assert.strictEqual(r.ce.phase, 'over');
  assert.deepStrictEqual(r.ce.winners, ['คน0']);
}

// ---- เกมใหม่ไม่ซ้ำคนเดิม (ถ้ายังพอ)
{
  const r = setup({ group: 'th', count: 20 });
  const first = new Set(r.ce.qs.map((q) => q.id));
  r.startCeleb({ group: 'th', count: 20 });
  assert.ok(r.ce.qs.every((q) => !first.has(q.id)), 'ไม่ซ้ำกับเกมก่อน');
}

console.log('ทายคนดัง ผ่านทุกเทสต์ ✅');

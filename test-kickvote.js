// ทดสอบระบบโหวตเตะ: node test-kickvote.js
process.env.KICK_MS = '400';
const assert = require('assert');
const { Room } = require('./game');

function room(n) {
  const r = new Room('K');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i).connected = true;
  return r;
}

// ---- เงื่อนไขเริ่มโหวต
{
  const r = room(2);
  assert.throws(() => r.kickStart('p0', 'p1'), /อย่างน้อย 3 คน/);
  r.addPlayer('p2', 'คน2').connected = true;
  assert.throws(() => r.kickStart('p0', 'p0'), /ตัวเอง/);
  assert.throws(() => r.kickStart('p0', 'zz'), /ไม่พบ/);
  r.kickStart('p0', 'p1');
  assert.throws(() => r.kickStart('p2', 'p0'), /อยู่แล้ว/);
  assert.throws(() => r.kickVote('p1', true), /โหวตเรื่องนี้ไม่ได้/);
  const v = r.viewFor('p2').kick;
  assert.deepStrictEqual([v.yes, v.need, v.voters, v.canVote], [1, 2, 2, true]);
  assert.strictEqual(r.viewFor('p1').kick.canVote, false, 'คนถูกเสนอเตะโหวตไม่ได้');
}

// ---- 3 คน: คนเสนอ + อีก 1 เสียง = เกินครึ่งของ 2 → เตะ
{
  const r = room(3);
  r.kickStart('p0', 'p1');
  assert.strictEqual(r.kickCheck(), null);
  r.kickVote('p2', true);
  assert.strictEqual(r.kickCheck(), 'pass');
  assert.strictEqual(r.kickLast.target, 'p1');
  assert.strictEqual(r.kick, null);
}

// ---- 5 คน (4 เสียง ต้อง 3): ไม่เห็นด้วย 2 → ไม่มีทางผ่าน ตกทันที
{
  const r = room(5);
  r.kickStart('p0', 'p4');
  r.kickVote('p1', false);
  assert.strictEqual(r.kickCheck(), null);
  r.kickVote('p1', true); // เปลี่ยนใจได้
  r.kickVote('p2', false);
  assert.strictEqual(r.kickCheck(), null, '2 เห็นด้วย 1 ไม่ — ยังลุ้นได้');
  r.kickVote('p3', false);
  assert.strictEqual(r.kickCheck(), 'fail');
}

// ---- หมดเวลา = ตก / คนหลุดไม่นับเป็นเสียง / คนถูกเสนอออกเอง = ยกเลิก
{
  const r = room(4);
  r.kickStart('p0', 'p1');
  assert.strictEqual(r.kickExpire(), 'fail');

  r.kickStart('p0', 'p1');
  r.players.get('p3').connected = false; // เหลือคนโหวตได้ 2 (p0, p2) ต้อง 2
  assert.strictEqual(r.kickCheck(), null);
  r.players.get('p2').connected = false; // เหลือคนเสนอคนเดียว → ห้ามผ่านเอง (ต้อง 2 เสียงเสมอ)
  assert.strictEqual(r.kickCheck(), 'fail');
  assert.throws(() => r.kickStart('p0', 'p1'), /อย่างน้อย 2 คน/);
  assert.strictEqual(r.kick, null);
  r.players.get('p2').connected = true;
  r.kickStart('p0', 'p1');
  assert.strictEqual(r.kickCheck(), null, 'เสนอแล้วยังไม่เตะทันที');
  r.kickVote('p2', true);
  assert.strictEqual(r.kickCheck(), 'pass');

  r.kickStart('p0', 'p2');
  r.removePlayer('p2');
  assert.strictEqual(r.kickCheck(), 'gone');
}

// ---- เซิร์ฟเวอร์จริง: โหวตผ่าน → คนนั้นได้ 'kicked' ออกจากห้อง แล้วกลับเข้ามาใหม่ได้
(async () => {
  const { io: connect } = require('socket.io-client');
  const { server, io } = require('./server');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const client = () => new Promise((r) => {
    const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.on('sync', (j) => { if (j.view) s.last = j.view; if (j.chat) (s.chat = s.chat || []).push(...j.chat); });
    s.on('connect', () => r(s));
  });
  const emit = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
  const act = (s, action, d = {}) => emit(s, 'act', { action, ...d });

  const [a, b, c] = [await client(), await client(), await client()];
  await emit(a, 'join', { name: 'เอ', code: 'KV', key: 'kA' });
  await emit(b, 'join', { name: 'บี', code: 'KV', key: 'kB' });
  const idC = (await emit(c, 'join', { name: 'ซี', code: 'KV', key: 'kC' })).view.me;
  let kicked = false;
  c.on('kicked', () => (kicked = true));

  let res = await act(a, 'kickStart', { targetId: idC });
  assert.ok(res.ok, res.error);
  await sleep(50);
  assert.strictEqual(b.last.kick.targetName, 'ซี');
  res = await act(c, 'kickVote', { yes: false });
  assert.match(res.error, /ไม่ได้/);

  // หมดเวลา → ตก
  await sleep(500);
  assert.strictEqual(b.last.kick, null);
  assert.ok(b.chat.some((m) => /ไม่ผ่าน/.test(m.text)));

  // รอบสอง: ผ่าน
  await act(a, 'kickStart', { targetId: idC });
  await act(b, 'kickVote', { yes: true });
  await sleep(50);
  assert.ok(kicked, 'คนโดนเตะได้รับ kicked');
  assert.strictEqual(a.last.players.length, 2);
  assert.ok(a.chat.some((m) => /ถูกโหวตออก/.test(m.text)));
  res = await act(c, 'chat', { text: 'ยังอยู่ไหม' });
  assert.ok(res.error, 'ส่งคำสั่งไม่ได้แล้ว');
  const c2 = await client();
  res = await emit(c2, 'join', { name: 'ซี', code: 'KV', key: 'kC' });
  assert.ok(res.ok, 'โดนเตะแล้วกลับเข้าห้องใหม่ได้');
  assert.strictEqual(res.view.players.length, 3);

  for (const s of [a, b, c, c2]) s.close();
  io.close();
  server.close();
  console.log('โหวตเตะ ผ่านทุกเทสต์ ✅');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

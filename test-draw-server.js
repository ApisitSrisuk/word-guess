// ทดสอบวาดภาพทายคำผ่านเซิร์ฟเวอร์จริง: node test-draw-server.js
process.env.DRAW_REVEAL_MS = '300';
const assert = require('assert');
const { io: connect } = require('socket.io-client');
const { server, io } = require('./server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const act = (s, action, d = {}) => emit(s, 'act', { action, ...d });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const mk = async (name, key) => {
    const s = connect(url, { transports: ['websocket'], forceNew: true });
    s.chats = [];
    s.ops = [];
    s.on('sync', (j) => { if (j.view) s.v = j.view; if (j.chat) s.chats.push(...j.chat); if (j.clearChat) s.chats = []; });
    s.on('draw', (op) => s.ops.push(op));
    await new Promise((r) => s.on('connect', r));
    s.v = (await emit(s, 'join', { name, code: 'DRW', key })).view;
    return s;
  };
  const A = await mk('เอ', 'd1');
  const B = await mk('บี', 'd2');
  const C = await mk('ซี', 'd3');
  const all = [A, B, C];
  assert.ok((await act(A, 'start', { mode: 'draw', category: 'สัตว์', turnLimit: 60 })).ok);
  await sleep(100);
  const drawer = all.find((s) => s.v.dr.amDrawer);
  const guessers = all.filter((s) => s !== drawer);
  assert.strictEqual(drawer.v.dr.choices.length, 3);
  assert.ok((await act(drawer, 'choose', { index: 0 })).ok);
  await sleep(100);
  const word = drawer.v.dr.word;
  assert.ok(word && guessers.every((g) => g.v.dr.word === null));

  // วาด → คนทายได้รับเส้นสด (คนวาดไม่ได้รับกลับ, คำสั่งของคนทายถูกปัดทิ้ง)
  all.forEach((g) => (g.ops = []));
  drawer.emit('draw', { op: 'begin', id: 'a1', c: '#000000', w: 0.01, p: [0.1, 0.1] });
  drawer.emit('draw', { op: 'pts', id: 'a1', p: [0.2, 0.2, 0.3, 0.3] });
  guessers[0].emit('draw', { op: 'clear' });
  await sleep(150);
  for (const g of guessers) assert.deepStrictEqual(g.ops.map((o) => o.op), ['begin', 'pts']);
  assert.strictEqual(drawer.ops.length, 0, 'ไม่ส่งกลับไปหาคนวาด');

  // คนเข้ามากลางเกม → ได้ภาพที่วาดไปแล้ว
  const D = await mk('ดี', 'd4');
  await sleep(100);
  const sync = D.ops.find((o) => o.op === 'sync');
  assert.ok(sync && sync.strokes.length === 1 && sync.strokes[0].p.length === 6, 'เข้ากลางเกมเห็นภาพเดิม');

  // ทายผิด → ขึ้นแชท / ทายถูก → ไม่โชว์คำ
  let r = await act(guessers[0], 'chat', { text: 'ไม่ใช่แน่ๆ' });
  assert.ok(r.ok && !r.correct);
  r = await act(guessers[1], 'chat', { text: word });
  assert.strictEqual(r.correct, true);
  await sleep(100);
  const texts = A.chats.map((c) => c.text);
  assert.ok(texts.includes('ไม่ใช่แน่ๆ'), 'คำทายผิดขึ้นแชท');
  assert.ok(!texts.includes(word), 'คำที่ถูกไม่หลุดในแชท');
  assert.ok(texts.some((t) => /ทายถูก/.test(t)));
  assert.strictEqual(guessers[1].v.dr.word, word, 'คนที่ถูกเห็นคำ');
  assert.strictEqual(guessers[0].v.dr.word, null);

  // คนวาดกดจบตา → เฉลย → คนวาดถัดไป + ภาพถูกล้าง
  guessers.forEach((g) => (g.ops = []));
  assert.ok((await act(drawer, 'pass', { turnId: drawer.v.me })).ok);
  await sleep(500);
  assert.strictEqual(A.v.dr.phase, 'choose');
  assert.notStrictEqual(A.v.dr.drawerId, drawer.v.me, 'เปลี่ยนคนวาด');
  assert.ok(guessers[0].ops.some((o) => o.op === 'sync' && o.strokes.length === 0), 'ตาใหม่ล้างภาพ');
  console.log('วาดภาพทายคำ (เซิร์ฟเวอร์จริง) ผ่านทุกเทสต์ ✅');
  [...all, D].forEach((s) => s.close());
  io.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

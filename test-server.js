// ทดสอบเซิร์ฟเวอร์จริงผ่าน Socket.IO: node test-server.js
process.env.AWAY_SKIP_MS = '300';
process.env.GRACE_MS = '800';
const assert = require('assert');
const { io: connect } = require('socket.io-client');
const { server, io } = require('./server');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let url;

function client() {
  const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  s.last = null;
  s.on('sync', (j) => { if (j.view) s.last = j.view; });
  return new Promise((r) => s.on('connect', () => r(s)));
}
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const act = (s, action, data = {}) => emit(s, 'act', { action, ...data });

(async () => {
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
  const C = 'SRV';

  const a = await client();
  const b = await client();
  let r = await emit(a, 'join', { name: 'เอ', code: C, key: 'kA' });
  assert.ok(r.ok);
  const idA = r.view.me;
  r = await emit(b, 'join', { name: 'บี', code: C, key: 'kB' });
  const idB = r.view.me;
  assert.ok(r.chat.length >= 2, 'ได้ประวัติแชทตอนเข้าห้อง');

  // ชื่อซ้ำจากเครื่องอื่นที่ออนไลน์ → ไม่ให้
  const x = await client();
  r = await emit(x, 'join', { name: 'เอ', code: C, key: 'kX' });
  assert.match(r.error, /มีคนใช้/);
  x.close();

  // เครื่องเดิมกลับมา ขณะที่ socket เก่ายังไม่หลุด → ได้ที่นั่งเดิม แท็บเก่าได้รับ 'replaced'
  let replaced = false;
  a.on('replaced', () => (replaced = true));
  const a2 = await client();
  r = await emit(a2, 'join', { name: 'เอ', code: C, key: 'kA' });
  assert.strictEqual(r.view.me, idA);
  assert.strictEqual(r.view.players.length, 2);
  await sleep(50);
  assert.ok(replaced, 'แท็บเก่าถูกแจ้งให้หยุด');

  // เริ่มเกม: เฉพาะหัวห้อง
  r = await act(b, 'start');
  assert.match(r.error, /หัวห้อง/);
  r = await act(a2, 'start', { category: 'ผลไม้' });
  assert.ok(r.ok);
  await sleep(50);
  assert.strictEqual(b.last.state, 'playing', 'ทุกคนได้สถานะใหม่ทันที');

  // จบตา: คนอื่นกดให้ได้ + กันกดซ้ำตาเดิม
  const turn1 = b.last.currentTurn;
  const other = turn1 === idA ? b : a2;
  r = await act(other, 'pass', { turnId: turn1 });
  assert.ok(r.ok);
  r = await act(other, 'pass', { turnId: turn1 });
  assert.match(r.error, /ตาเปลี่ยน/);
  await sleep(50);
  assert.notStrictEqual(b.last.currentTurn, turn1);

  // แชทถึงทุกคน
  let got = null;
  b.on('sync', (j) => { if (j.chat) got = j.chat[0]; });
  r = await act(a2, 'chat', { text: 'สวัสดี' });
  assert.ok(r.ok);
  await sleep(50);
  assert.strictEqual(got && got.text, 'สวัสดี');

  // เจ้าของตาหลุด → ข้ามตาให้อัตโนมัติหลังรอสักพัก (ไม่ใช่ทันที)
  const cur = b.last.currentTurn;
  const [leaver, stayer] = cur === idA ? [a2, b] : [b, a2];
  leaver.close();
  await sleep(100);
  assert.strictEqual(stayer.last.currentTurn, cur, 'ยังไม่ข้ามทันที');
  await sleep(400);
  assert.notStrictEqual(stayer.last.currentTurn, cur, 'ข้ามตาแล้ว');

  // หลุดนานเกินกำหนด → ถูกเอาออก
  await sleep(700);
  assert.strictEqual(stayer.last.players.length, 1);

  stayer.close();
  io.close();
  console.log('เซิร์ฟเวอร์ผ่านทุกเทสต์ ✅');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

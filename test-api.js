// ทดสอบ API (ใช้ที่เก็บแบบหน่วยความจำ): node test-api.js
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const assert = require('assert');
const { handle, store } = require('./lib/api');

let clock = 1_000_000;
Date.now = () => clock;

const post = (body) => handle('POST', {}, body);
const get = (q) => handle('GET', q);

(async () => {
  assert.strictEqual(store.kind, 'memory');
  const C = 'T1';

  // เข้าห้อง
  let r = await post({ action: 'join', code: C, key: 'kA', name: 'เอ' });
  assert.strictEqual(r.status, 200);
  const idA = r.json.view.me;
  assert.strictEqual(r.json.view.hostId, idA, 'คนแรกเป็นหัวห้อง');
  r = await post({ action: 'join', code: C, key: 'kB', name: 'บี' });
  const idB = r.json.view.me;

  // ชื่อซ้ำจากอีกเครื่องที่ออนไลน์ → ไม่ให้
  r = await post({ action: 'join', code: C, key: 'kX', name: 'เอ' });
  assert.strictEqual(r.status, 409);

  // เครื่องเดิมเข้าซ้ำ → ได้ที่นั่งเดิม ไม่มีผู้เล่นซ้ำ
  r = await post({ action: 'join', code: C, key: 'kA', name: 'เอ' });
  assert.strictEqual(r.json.view.me, idA);
  assert.strictEqual(r.json.view.players.length, 2);

  // ไม่ใช่หัวห้องเริ่มเกมไม่ได้
  r = await post({ action: 'start', code: C, key: 'kB' });
  assert.strictEqual(r.status, 403);
  r = await post({ action: 'start', code: C, key: 'kA', category: 'ผลไม้' });
  assert.strictEqual(r.json.view.state, 'playing');

  // ดึงสถานะ: เห็นคำตัวเอง ไม่เห็นของเพื่อน
  r = await get({ code: C, key: 'kB' });
  const vB = r.json.view;
  assert.ok(vB.players.find((p) => p.id === idB).word);
  assert.strictEqual(vB.players.find((p) => p.id === idA).word, null);
  assert.ok(r.json.chat.length >= 3, 'ได้ประวัติแชท');

  // ทายตามตา
  const first = vB.currentTurn;
  const [firstKey, other] = first === idA ? ['kA', idB] : ['kB', idA];
  const [otherKey] = first === idA ? ['kB'] : ['kA'];
  r = await post({ action: 'guess', code: C, key: otherKey, targetId: first, text: 'x' });
  assert.strictEqual(r.json.correct, null, 'ยังไม่ถึงตา');
  r = await post({ action: 'guess', code: C, key: firstKey, targetId: other, text: 'ไม่ใช่แน่ๆ' });
  assert.strictEqual(r.json.correct, false);
  assert.strictEqual(r.json.view.currentTurn, other, 'ผิดแล้วเปลี่ยนตา');

  // แชท + กันพิมพ์รัว
  r = await post({ action: 'chat', code: C, key: 'kA', text: 'สวัสดี', after: 0 });
  assert.strictEqual(r.status, 200);
  r = await post({ action: 'chat', code: C, key: 'kA', text: 'อีกที' });
  assert.strictEqual(r.status, 429);

  // เจ้าของตาหายไป (ไม่ได้ดึงข้อมูลเกิน 20 วิ) → ข้ามตาให้อัตโนมัติ
  clock += 25_000;
  r = await get({ code: C, key: firstKey });
  assert.strictEqual(r.json.view.currentTurn, first, 'ตาถูกข้ามมาที่คนที่ยังอยู่');
  assert.ok(r.json.view.feed.some((f) => f.type === 'pass'));

  // หายไปเกิน 10 นาที → ถูกเอาออก และอีกเครื่องใช้ชื่อนั้นได้
  clock += 11 * 60_000;
  await get({ code: C, key: 'kA' });
  r = await get({ code: C, key: 'kA' });
  assert.strictEqual(r.json.view.players.length, 1, 'คนที่หายนานถูกเอาออก');
  r = await get({ code: C, key: 'kB' });
  assert.strictEqual(r.status, 404);

  // ห้องไม่มีอยู่
  r = await get({ code: 'NOPE', key: 'kA' });
  assert.strictEqual(r.status, 404);

  console.log('API ผ่านทุกเทสต์ ✅');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

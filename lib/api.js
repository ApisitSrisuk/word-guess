// API ของเกม — ใช้ร่วมกันทั้งบน Vercel (api/room.js) และตอนรันในเครื่อง (dev-server.js)
//   GET  /api/room?code=&key=&after=   → ดึงสถานะห้อง (เรียกซ้ำทุก ~1.5 วิ แทน WebSocket)
//   POST /api/room {action, code, key, ...} → join | start | endRound | pass | guess | chat
const crypto = require('crypto');
const { Room } = require('../game');
const store = require('./store');

// ไม่ได้ติดต่อมาเกินนี้ = ไม่ได้เปิดเกม (มือถือล็อกจอ/สลับแอปจะหยุดส่งข้อมูล, Chrome แท็บเบื้องหลังส่งแค่นาทีละครั้ง)
const OFFLINE_MS = 60 * 1000;
const GRACE_MS = 10 * 60 * 1000; // หลุดเกินนี้ = เอาออกจากห้อง
const CHAT_GAP_MS = 400;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const cleanCode = (c) => String(c || '').trim().toUpperCase().slice(0, 10);
const cleanKey = (k) => String(k || '').slice(0, 64);

// ใส่สถานะออนไลน์จาก presence และเอาคนที่หายไปนานออก
function applyPresence(room, presence, now) {
  const removed = [];
  for (const p of [...room.players.values()]) {
    const seen = Math.max(presence[p.key] || 0, p.lastSeen || 0);
    p.connected = now - seen < OFFLINE_MS;
    if (now - seen > GRACE_MS) removed.push(p);
  }
  return removed;
}

function prune(room, removed) {
  for (const p of removed) {
    room.removePlayer(p.id);
    room.systemChat(`🚪 ${p.name} ออกจากห้อง`);
  }
}

function payload(room, me, after) {
  return {
    view: room.viewFor(me.id),
    chat: room.chat.filter((m) => m.id > after),
  };
}

// แก้ข้อมูลห้องแบบล็อก: โหลด → แก้ → บันทึก
async function mutate(code, key, fn, { create = false } = {}) {
  return store.withLock(code, async () => {
    const now = Date.now();
    const { data, presence } = await store.load(code, key, now);
    if (!data && !create) throw new HttpError(404, 'ไม่พบห้องนี้');
    const room = data ? Room.fromJSON(data) : new Room(code);
    prune(room, applyPresence(room, presence, now));
    const result = fn(room, now);
    room.version += 1;
    if (room.players.size) await store.save(code, room.toJSON());
    return { room, result };
  });
}

function requirePlayer(room, key) {
  const me = room.findByKey(key);
  if (!me) throw new HttpError(404, 'ไม่ได้อยู่ในห้องนี้แล้ว กรุณาเข้าห้องใหม่');
  return me;
}

async function handleGet(q) {
  const code = cleanCode(q.code);
  const key = cleanKey(q.key);
  const after = Number(q.after) || 0;
  if (!code || !key) throw new HttpError(400, 'ข้อมูลไม่ครบ');

  const now = Date.now();
  const { data, presence } = await store.load(code, key, now);
  if (!data) throw new HttpError(404, 'ไม่พบห้องนี้');
  let room = Room.fromJSON(data);
  const removed = applyPresence(room, presence, now);
  const me = requirePlayer(room, key);
  me.connected = true;

  // มีเรื่องต้องแก้ (คนหายนาน / เจ้าของตาไม่อยู่) → ทำแบบล็อก
  const cur = room.players.get(room.currentTurnId());
  if (removed.length || (room.state === 'playing' && cur && !cur.connected)) {
    ({ room } = await mutate(code, key, (r) => r.autoSkipIfAway()));
  }
  return payload(room, room.findByKey(key) || me, after);
}

async function handlePost(body) {
  const code = cleanCode(body.code);
  const key = cleanKey(body.key);
  const after = Number(body.after) || 0;
  if (!code) throw new HttpError(400, 'กรุณาใส่รหัสห้อง');
  if (!key) throw new HttpError(400, 'ข้อมูลไม่ครบ');

  if (body.action === 'join') {
    const name = String(body.name || '').trim().slice(0, 20);
    if (!name) throw new HttpError(400, 'กรุณาใส่ชื่อ');
    const { room } = await mutate(code, key, (r, now) => {
      const existing = r.findByName(name);
      const mine = r.findByKey(key);
      if (existing) {
        // ชื่อนี้เป็นของอีกเครื่องที่ยังออนไลน์อยู่ → ไม่ให้แย่ง
        if (existing.key !== key && existing.connected) throw new HttpError(409, 'ชื่อนี้มีคนใช้ในห้องแล้ว');
        // เครื่องเดิมกลับมา หรือที่นั่งของคนที่หลุดไป → คืนที่นั่งเดิม (คำ/คะแนนอยู่ครบ)
        if (mine && mine !== existing) r.removePlayer(mine.id);
        existing.key = key;
        existing.lastSeen = now;
        existing.connected = true;
        return;
      }
      // เครื่องนี้เคยอยู่ในห้องด้วยชื่ออื่น → เปลี่ยนชื่อแทนการสร้างผู้เล่นซ้ำ
      if (mine) {
        r.systemChat(`✏️ ${mine.name} เปลี่ยนชื่อเป็น ${name}`);
        mine.name = name;
        return;
      }
      const p = r.addPlayer(crypto.randomBytes(6).toString('hex'), name);
      p.key = key;
      p.lastSeen = now;
      r.systemChat(`👋 ${name} เข้าห้อง`);
    }, { create: true });
    return payload(room, room.findByKey(key), after);
  }

  let extra = {};
  const { room } = await mutate(code, key, (r, now) => {
    const me = requirePlayer(r, key);
    me.connected = true;
    const isHost = r.hostId === me.id;
    switch (body.action) {
      case 'start':
        if (!isHost) throw new HttpError(403, 'เฉพาะหัวห้องเท่านั้น');
        r.start(body.category);
        r.systemChat(`🎲 รอบ ${r.round} เริ่มแล้ว — หมวด ${r.category}`);
        break;
      case 'endRound':
        if (!isHost) throw new HttpError(403, 'เฉพาะหัวห้องเท่านั้น');
        if (r.state !== 'playing') throw new HttpError(409, 'รอบนี้จบไปแล้ว');
        r.endRound();
        break;
      case 'pass':
        if (r.state !== 'playing') throw new HttpError(409, 'ตอนนี้ไม่ได้อยู่ระหว่างเล่น');
        if (body.turnId && body.turnId !== r.currentTurnId()) throw new HttpError(409, 'ตาเปลี่ยนไปแล้ว');
        r.pass(me.id);
        break;
      case 'guess':
        extra.correct = r.guess(me.id, String(body.targetId || ''), body.text);
        break;
      case 'chat':
        if (now - (me.lastChatAt || 0) < CHAT_GAP_MS) throw new HttpError(429, 'พิมพ์เร็วไปนิด ใจเย็น ๆ 😅');
        r.addChat(me.id, body.text);
        me.lastChatAt = now;
        break;
      default:
        throw new HttpError(400, 'ไม่รู้จักคำสั่งนี้');
    }
  });
  return { ...payload(room, room.findByKey(key), after), ...extra };
}

// ตัวจัดการกลาง: รับ method/query/body คืน { status, json }
async function handle(method, query = {}, body = {}) {
  // บน Vercel ห้ามใช้หน่วยความจำ (แต่ละฟังก์ชันไม่แชร์กัน) → บอกให้ตั้งค่า Redis ให้ชัด
  if (process.env.VERCEL && store.kind === 'memory') {
    return { status: 503, json: { error: 'ยังไม่ได้เชื่อม Upstash Redis ใน Vercel (Storage → Upstash for Redis)' } };
  }
  try {
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const json = method === 'GET' ? await handleGet(query) : await handlePost(body || {});
    return { status: 200, json };
  } catch (e) {
    const status = e.status || 400;
    if (!e.status) console.error(e);
    return { status, json: { error: e.message || 'เกิดข้อผิดพลาด' } };
  }
}

module.exports = { handle, store };

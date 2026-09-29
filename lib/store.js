// ที่เก็บข้อมูลห้อง
// - บน Vercel: ใช้ Upstash Redis (ฟังก์ชัน serverless แต่ละตัวไม่มีหน่วยความจำร่วมกัน)
// - รันในเครื่อง (ไม่มีค่า env ของ Redis): เก็บในหน่วยความจำแทน
const ROOM_TTL_SEC = 6 * 60 * 60; // ห้องที่ไม่มีใครเล่น 6 ชม. หายเอง

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const roomKey = (code) => `wg:room:${code}`;
const presKey = (code) => `wg:pres:${code}`;
const lockKey = (code) => `wg:lock:${code}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redisStore() {
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url, token, automaticDeserialization: false });

  return {
    kind: 'redis',
    // อ่านห้อง + บันทึกว่าเครื่องนี้ยังออนไลน์ + อ่านสถานะออนไลน์ทุกคน ในการเรียกครั้งเดียว
    async load(code, key, now) {
      const p = redis.pipeline();
      p.get(roomKey(code));
      if (key) p.hset(presKey(code), { [key]: now });
      p.hgetall(presKey(code));
      const res = await p.exec();
      const raw = res[0];
      const pres = res[res.length - 1] || {};
      return { data: raw ? JSON.parse(raw) : null, presence: normalizePresence(pres) };
    },
    async save(code, data) {
      const p = redis.pipeline();
      p.set(roomKey(code), JSON.stringify(data), { ex: ROOM_TTL_SEC });
      p.expire(presKey(code), ROOM_TTL_SEC);
      await p.exec();
    },
    // ล็อกห้องระหว่างแก้ข้อมูล กันสองคนกดพร้อมกันแล้วข้อมูลทับกัน
    async withLock(code, fn) {
      const id = Math.random().toString(36).slice(2);
      for (let i = 0; i < 60; i++) {
        const ok = await redis.set(lockKey(code), id, { nx: true, px: 5000 });
        if (ok) {
          try {
            return await fn();
          } finally {
            await redis.eval(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
              [lockKey(code)],
              [id],
            );
          }
        }
        await sleep(40 + Math.random() * 60);
      }
      throw new Error('ห้องไม่ว่าง ลองใหม่อีกครั้ง');
    },
  };
}

function memoryStore() {
  const rooms = new Map();
  const pres = new Map();
  const locks = new Map();
  return {
    kind: 'memory',
    async load(code, key, now) {
      if (!pres.has(code)) pres.set(code, {});
      if (key) pres.get(code)[key] = now;
      const raw = rooms.get(code);
      return { data: raw ? JSON.parse(raw) : null, presence: { ...pres.get(code) } };
    },
    async save(code, data) {
      rooms.set(code, JSON.stringify(data));
    },
    async withLock(code, fn) {
      const prev = locks.get(code) || Promise.resolve();
      let release;
      const next = new Promise((r) => (release = r));
      locks.set(code, prev.then(() => next));
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

function normalizePresence(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Number(v);
  return out;
}

module.exports = url && token ? redisStore() : memoryStore();

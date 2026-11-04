// เกม "ทายคนดัง" (เปิดจิ๊กซอ แย่งกันตอบ) — เพิ่มความสามารถให้ Room
// - หัวห้องเลือก: คนดังไทย / ต่างประเทศ / ผสม และจำนวนข้อ
// - รูปคนดังถูกปิดด้วยจิ๊กซอ 20 ชิ้น (4 × 5) · แต่ละข้อมี "คนเปิด" 1 คน (ผลัดกันเป็น) เห็นรูปจาง ๆ + รู้คำตอบ
// - คนเปิดเลือกเปิดทีละชิ้น (ไม่เปิดใน 8 วิ = สุ่มเปิดให้) · คนอื่นแย่งกันตอบจาก 4 ชื่อได้ตลอด ตอบได้คนละครั้ง
// - ตอบถูกคนแรก = ได้แต้มตามชิ้นที่ยังปิด (เปิดน้อย = ได้เยอะ สูงสุด 10) · คนเปิดได้ครึ่งหนึ่ง · ตอบผิด = หมดสิทธิ์ข้อนั้น
// - จบข้อ: มีคนตอบถูก / ทุกคนตอบผิดหมด / เปิดครบแล้วรอ 10 วิ
// - คนดังแต่ละคนมีได้หลายรูป สุ่มใช้ · รูปส่งผ่านเซิร์ฟเวอร์ด้วยรหัสสุ่ม (ชื่อไฟล์บน Wikipedia มีชื่อคน กันแอบดูคำตอบ)
const crypto = require('crypto');
const CELEBS = require('./celeb-data');

const TILE_MS = Number(process.env.CE_TILE_MS) || 8000; // คนเปิดต้องเปิดชิ้นใหม่ภายในเวลานี้
const FINAL_MS = Number(process.env.CE_FINAL_MS) || 10000; // เปิดครบแล้ว รอคำตอบอีก
const REVEAL_MS = Number(process.env.CE_REVEAL_MS) || 5000;
const TILES = 20; // ชิ้นจิ๊กซอที่ปิดรูป (4 × 5)
const COUNTS = [5, 10, 15, 20];
const GROUPS = { th: 'คนดังไทย', intl: 'คนดังต่างประเทศ', mix: 'ไทย + ต่างประเทศ' };
const ptsFor = (opened) => Math.max(1, 11 - Math.ceil(opened / 2)); // เปิด 1–2 ชิ้น = 10 … เปิดครบ = 1
const imgsOf = (c) => c.imgs || [c.img];

// รหัสรูป → { id คนดัง, url รูป } (ใช้ร่วมทุกห้อง · ล้างของเก่าทิ้ง)
const tokens = new Map();
function tokenFor(id, img) {
  const t = crypto.randomBytes(9).toString('hex');
  tokens.set(t, { id, img, at: Date.now() });
  if (tokens.size > 5000) {
    const old = Date.now() - 6 * 3600 * 1000;
    for (const [k, v] of tokens) if (v.at < old) tokens.delete(k);
  }
  return t;
}
function celebByToken(t) {
  const x = tokens.get(String(t));
  const c = x && CELEBS.find((y) => y.id === x.id);
  return c ? { ...c, img: x.img } : null;
}

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.startCeleb = function ({ group = 'mix', count = 10 } = {}) {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน (คนเปิด + คนตอบ)');
    if (!GROUPS[group]) group = 'mix';
    count = COUNTS.includes(Number(count)) ? Number(count) : 10;
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const pool = CELEBS.filter((c) => group === 'mix' || c.group === group);
    // เลี่ยงคนที่เพิ่งออกในเกมก่อน ๆ ของห้องนี้
    this.ceSeen = this.ceSeen || new Set();
    let fresh = pool.filter((c) => !this.ceSeen.has(c.id));
    if (fresh.length < count) { this.ceSeen.clear(); fresh = pool; }
    const picks = shuffle(fresh).slice(0, count);
    const qs = picks.map((c) => {
      this.ceSeen.add(c.id);
      // ตัวเลือกหลอก: กลุ่ม+เพศเดียวกัน เลือกประเภทเดียวกันก่อน (นักกีฬากับนักกีฬา) ไม่พอค่อยขยาย
      const others = CELEBS.filter((x) => x.id !== c.id && x.group === c.group);
      const sameKind = shuffle(others.filter((x) => x.sex === c.sex && x.kind === c.kind));
      const sameSex = shuffle(others.filter((x) => x.sex === c.sex && x.kind !== c.kind));
      const rest = shuffle(others.filter((x) => x.sex !== c.sex));
      const wrong = [...sameKind, ...sameSex, ...rest].slice(0, 3);
      const img = shuffle(imgsOf(c))[0]; // คนเดิมก็ได้รูปไม่ซ้ำเดิม
      return { id: c.id, token: tokenFor(c.id, img), choices: shuffle([c, ...wrong]).map((x) => x.id) };
    });
    this.mode = 'celeb';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh', 'pk', 'om', 'hc', 'sk']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = GROUPS[group];
    this.ce = { group, qs, idx: 0, seq: 0, order: shuffle(players.map((p) => p.id)), cur: 0, gained: {} };
    this.ceStartQ();
  };

  // เริ่มข้อใหม่: ปิดจิ๊กซอทุกชิ้น · คนเปิด = คนถัดไปในคิว (ที่ออนไลน์)
  P.ceStartQ = function () {
    const e = this.ce;
    Object.assign(e, { phase: 'q', opened: [], out: [], guesses: [], result: null, seq: e.seq + 1 });
    e.order = e.order.filter((x) => this.players.has(x));
    for (const x of this.players.keys()) if (!e.order.includes(x)) e.order.push(x); // เข้ามาทีหลัง = ต่อท้ายคิว
    const n = e.order.length;
    for (let i = 0; i < n; i++) {
      const p = this.players.get(e.order[(e.cur + i) % n]);
      if (p && p.connected) { e.cur = (e.cur + i) % n; break; }
    }
    e.opener = e.order[e.cur % n];
  };

  P.ceGuessers = function () {
    const e = this.ce;
    return [...this.players.values()].filter((p) => p.id !== e.opener && p.connected && !e.out.includes(p.id)).map((p) => p.id);
  };

  P.ceOpen = function (id, tile) {
    const e = this.ce;
    if (this.mode !== 'celeb' || this.state !== 'playing' || e.phase !== 'q') throw new Error('ตอนนี้ยังเปิดไม่ได้');
    if (e.opener !== id) throw new Error('ข้อนี้คุณไม่ได้เป็นคนเปิด');
    tile = Math.floor(Number(tile));
    if (!(tile >= 0 && tile < TILES) || e.opened.includes(tile)) throw new Error('เลือกชิ้นที่ยังปิดอยู่');
    e.opened.push(tile);
    e.seq += 1; // เริ่มนับเวลาเปิดชิ้นถัดไปใหม่
  };

  P.ceAnswer = function (id, choice) {
    const e = this.ce;
    if (this.mode !== 'celeb' || this.state !== 'playing' || e.phase !== 'q') throw new Error('ตอนนี้ยังตอบไม่ได้');
    if (!this.players.has(id)) throw new Error('ไม่ได้อยู่ในห้อง');
    if (id === e.opener) throw new Error('คนเปิดตอบไม่ได้ 😉');
    if (e.out.includes(id)) throw new Error('คุณตอบผิดไปแล้ว รอข้อหน้านะ');
    if (!e.opened.length) throw new Error('รอคนเปิดเปิดชิ้นแรกก่อน');
    const q = e.qs[e.idx];
    choice = Number(choice);
    if (!q.choices.includes(choice)) throw new Error('ตัวเลือกไม่ถูกต้อง');
    const ok = choice === q.id;
    e.guesses.push({ id, choice, ok });
    if (!ok) {
      e.out.push(id);
      this.feed.push({ type: 'ce-wrong', name: nameOf(this, id) });
      if (!this.ceGuessers().length) this.ceReveal(); // ทุกคนผิดหมด
      return { ok, pts: 0 };
    }
    const pts = ptsFor(e.opened.length);
    const bonus = Math.ceil(pts / 2);
    this.players.get(id).score += pts;
    e.gained[id] = (e.gained[id] || 0) + pts;
    const op = this.players.get(e.opener);
    if (op) {
      op.score += bonus;
      e.gained[e.opener] = (e.gained[e.opener] || 0) + bonus;
    }
    e.result = { by: id, pts, bonus, opened: e.opened.length };
    this.ceReveal();
    return { ok, pts };
  };

  P.ceReveal = function () {
    const e = this.ce;
    const c = CELEBS.find((x) => x.id === e.qs[e.idx].id);
    e.phase = 'reveal';
    e.seq += 1;
    this.feed.push({ type: 'ce-reveal', n: e.idx + 1, name: c.name, by: e.result ? nameOf(this, e.result.by) : null, pts: e.result ? e.result.pts : 0, opened: e.opened.length });
  };

  P.ceNext = function () {
    const e = this.ce;
    if (e.idx + 1 >= e.qs.length) return this.ceFinish();
    e.idx += 1;
    e.cur = (e.cur + 1) % Math.max(1, e.order.length); // ข้อใหม่ = คนเปิดคนถัดไป
    this.ceStartQ();
  };

  P.ceFinish = function () {
    const e = this.ce;
    e.phase = 'over';
    this.state = 'reveal';
    const top = Object.entries(e.gained).filter(([x]) => this.players.has(x)).sort((a, b) => b[1] - a[1]);
    e.winners = top.filter(([, n]) => n > 0 && n === top[0][1]).map(([x]) => nameOf(this, x));
    this.feed.push({ type: 'ce-over', winners: e.winners });
  };

  // หมดเวลา: คนเปิดช้า = สุ่มเปิดให้ · เปิดครบแล้วยังไม่มีใครถูก = เฉลย · เฉลย → ข้อถัดไป
  P.ceTimeout = function () {
    const e = this.ce;
    if (e.phase === 'reveal') return this.ceNext(), true;
    if (e.phase !== 'q') return false;
    if (e.opened.length >= TILES) return this.ceReveal(), true;
    const closed = Array.from({ length: TILES }, (_, i) => i).filter((i) => !e.opened.includes(i));
    e.opened.push(closed[Math.floor(Math.random() * closed.length)]);
    e.seq += 1;
    return true;
  };
  // หัวห้อง: ข้ามข้อ (เฉลยเลย) / ไปข้อถัดไป
  P.cePass = function (id) {
    const e = this.ce;
    if (id !== this.hostId) throw new Error('เฉพาะหัวห้องเท่านั้น');
    if (e.phase === 'q') return this.ceReveal(), true;
    return this.ceTimeout();
  };
  P.ceCurrent = function () {
    const e = this.ce;
    return e && this.state === 'playing' && e.phase === 'q' ? e.opener : null;
  };
  P.ceAutoSkip = function () {
    const e = this.ce;
    if (e.phase === 'q' && !this.ceGuessers().length) return this.ceReveal(), true; // ไม่เหลือคนตอบที่ออนไลน์
    return false; // คนเปิดหลุด → หมดเวลาแต่ละชิ้นก็สุ่มเปิดให้เองอยู่แล้ว
  };
  P.ceTimerKey = function () {
    const e = this.ce;
    return e.phase === 'over' ? null : `ce|${this.round}|${e.seq}|${e.phase}`;
  };
  P.ceTimerMs = function () {
    const e = this.ce;
    if (e.phase !== 'q') return REVEAL_MS;
    return e.opened.length >= TILES ? FINAL_MS : TILE_MS;
  };
  P.ceRemove = function (id) {
    const e = this.ce;
    if (!e || this.state !== 'playing') return;
    this.players.delete(id);
    if (this.players.size < 2) return this.ceFinish();
    if (e.phase !== 'q') return;
    if (id === e.opener || !this.ceGuessers().length) this.ceReveal();
  };

  P.ceView = function (id) {
    const e = this.ce;
    const q = e.qs[e.idx];
    const open = e.phase !== 'q';
    const amOpener = e.opener === id && e.phase === 'q';
    const card = (x) => {
      const c = CELEBS.find((y) => y.id === x);
      return { id: c.id, name: c.name };
    };
    const c = CELEBS.find((x) => x.id === q.id);
    return {
      phase: e.phase,
      seq: e.seq,
      n: e.idx + 1,
      total: e.qs.length,
      group: e.group,
      img: `/celeb-img/${q.token}`,
      nextImg: e.qs[e.idx + 1] ? `/celeb-img/${e.qs[e.idx + 1].token}` : null,
      tiles: TILES,
      opened: e.opened,
      opener: e.opener,
      out: e.out,
      nowPts: ptsFor(Math.max(1, e.opened.length)), // แต้มถ้าตอบถูกตอนนี้
      choices: q.choices.map(card),
      guesses: e.guesses, // ตอบผิดทุกคนเห็น (ตัดตัวเลือกได้)
      result: e.result,
      // คนเปิดรู้คำตอบตั้งแต่ต้น (จะได้เลือกเปิดชิ้นที่ช่วยเพื่อน) · คนอื่นรู้ตอนเฉลย
      answer: open || amOpener ? { id: c.id, name: c.name, kind: c.kind, page: c.page } : null,
      gained: e.gained,
      winners: e.winners || null,
    };
  };
}

module.exports = { install, celebByToken, CELEBS, COUNTS, GROUPS };

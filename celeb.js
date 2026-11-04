// เกม "ทายคนดัง" (เปิดจิ๊กซอผลัดกันทาย) — เพิ่มความสามารถให้ Room
// - หัวห้องเลือก: คนดังไทย / ต่างประเทศ / ผสม และจำนวนข้อ
// - รูปคนดังถูกปิดด้วยจิ๊กซอ 20 ชิ้น (4 × 5) · ผลัดกันเล่นทีละคน
// - ตาเรา: แตะเปิด 1 ชิ้น → ทายเลย (เลือกจาก 4 ชื่อ) หรือส่งต่อ
//   ทายถูก = ได้แต้มตามชิ้นที่ยังปิด (เปิดน้อย = ได้เยอะ สูงสุด 10) แล้วเฉลย · ทายผิด = หมดสิทธิ์ทายข้อนี้
// - จบข้อ: มีคนทายถูก / ทุกคนทายผิดหมด / เปิดครบทุกชิ้นแล้วส่งต่อครบรอบ · หมดเวลา = สุ่มเปิดให้ 1 ชิ้นแล้วส่งต่อ
// - รูปส่งผ่านเซิร์ฟเวอร์ด้วยรหัสสุ่ม (ชื่อไฟล์บน Wikipedia มีชื่อคน กันแอบดูคำตอบ)
const crypto = require('crypto');
const CELEBS = require('./celeb-data');

const TURN_MS = Number(process.env.CE_TURN_MS) || 20000; // เวลาต่อตา
const TILES = 20; // ชิ้นจิ๊กซอที่ปิดรูป (4 × 5)
const REVEAL_MS = Number(process.env.CE_REVEAL_MS) || 5000;
const COUNTS = [5, 10, 15, 20];
const GROUPS = { th: 'คนดังไทย', intl: 'คนดังต่างประเทศ', mix: 'ไทย + ต่างประเทศ' };
const ptsFor = (opened) => Math.max(1, 11 - Math.ceil(opened / 2)); // เปิด 1–2 ชิ้น = 10 … เปิดครบ = 1

// รหัสรูป → id คนดัง (ใช้ร่วมทุกห้อง · ล้างของเก่าทิ้ง)
const tokens = new Map();
function tokenFor(id) {
  const t = crypto.randomBytes(9).toString('hex');
  tokens.set(t, { id, at: Date.now() });
  if (tokens.size > 5000) {
    const old = Date.now() - 6 * 3600 * 1000;
    for (const [k, v] of tokens) if (v.at < old) tokens.delete(k);
  }
  return t;
}
function celebByToken(t) {
  const x = tokens.get(String(t));
  return x ? CELEBS.find((c) => c.id === x.id) : null;
}

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.startCeleb = function ({ group = 'mix', count = 10 } = {}) {
    const players = [...this.players.values()];
    if (players.length < 1) throw new Error('ต้องมีผู้เล่นอย่างน้อย 1 คน');
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
      return { id: c.id, token: tokenFor(c.id), choices: shuffle([c, ...wrong]).map((x) => x.id) };
    });
    this.mode = 'celeb';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh', 'pk', 'om', 'hc', 'sk']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = GROUPS[group];
    this.ce = { group, qs, idx: 0, seq: 0, phase: 'q', order: shuffle(players.map((p) => p.id)), cur: 0, gained: {} };
    this.ceStartQ();
  };

  // เริ่มข้อใหม่: ปิดจิ๊กซอทุกชิ้น
  P.ceStartQ = function () {
    const e = this.ce;
    Object.assign(e, { phase: 'q', step: 'open', opened: [], out: [], guesses: [], passRun: 0, result: null, seq: e.seq + 1 });
    this.ceSyncOrder();
    if (!this.ceCanPlay(e.order[e.cur])) this.ceMoveNext(false);
  };

  // คนที่เข้าห้องมาทีหลัง → ต่อท้ายคิว · คนที่ออกไปแล้ว → เอาออก
  P.ceSyncOrder = function () {
    const e = this.ce;
    const cur = e.order[e.cur];
    e.order = e.order.filter((x) => this.players.has(x));
    for (const x of this.players.keys()) if (!e.order.includes(x)) e.order.push(x);
    const i = e.order.indexOf(cur);
    e.cur = i !== -1 ? i : Math.min(e.cur, Math.max(0, e.order.length - 1));
  };
  P.ceCanPlay = function (x) {
    const p = this.players.get(x);
    return !!p && p.connected && !this.ce.out.includes(x);
  };
  // ไปคนถัดไปที่ยังเล่นได้ — ไม่มีแล้ว = false
  P.ceMoveNext = function (step = true) {
    const e = this.ce;
    const n = e.order.length;
    for (let i = step ? 1 : 0; i <= n; i++) {
      const j = (e.cur + i) % n;
      if (this.ceCanPlay(e.order[j])) { e.cur = j; return true; }
    }
    return false;
  };
  P.ceCurrent = function () {
    const e = this.ce;
    return e && this.state === 'playing' && e.phase === 'q' ? e.order[e.cur] || null : null;
  };

  P.ceOpen = function (id, tile) {
    const e = this.ce;
    if (this.mode !== 'celeb' || this.state !== 'playing' || e.phase !== 'q') throw new Error('ตอนนี้ยังเปิดไม่ได้');
    if (this.ceCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    if (e.step !== 'open') throw new Error('ตานี้เปิดไปแล้ว ทายหรือส่งต่อได้เลย');
    tile = Math.floor(Number(tile));
    if (!(tile >= 0 && tile < TILES) || e.opened.includes(tile)) throw new Error('เลือกชิ้นที่ยังปิดอยู่');
    e.opened.push(tile);
    e.step = 'guess';
    e.seq += 1;
  };

  P.ceAnswer = function (id, choice) {
    const e = this.ce;
    if (this.mode !== 'celeb' || this.state !== 'playing' || e.phase !== 'q') throw new Error('ตอนนี้ยังทายไม่ได้');
    if (this.ceCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    if (e.step !== 'guess') throw new Error('เปิดจิ๊กซอก่อน 1 ชิ้น');
    const q = e.qs[e.idx];
    choice = Number(choice);
    if (!q.choices.includes(choice)) throw new Error('ตัวเลือกไม่ถูกต้อง');
    const ok = choice === q.id;
    e.guesses.push({ id, choice, ok });
    if (ok) {
      const pts = ptsFor(e.opened.length);
      this.players.get(id).score += pts;
      e.gained[id] = (e.gained[id] || 0) + pts;
      e.result = { by: id, pts, opened: e.opened.length };
      this.ceReveal();
      return { ok, pts };
    }
    e.out.push(id);
    this.feed.push({ type: 'ce-wrong', name: nameOf(this, id) });
    this.ceAdvance();
    return { ok, pts: 0 };
  };

  // ส่งตาให้คนถัดไป — เปิดครบแล้วส่งต่อครบรอบ / ไม่มีใครทายได้แล้ว = เฉลย
  P.ceAdvance = function () {
    const e = this.ce;
    if (e.opened.length >= TILES) e.passRun += 1;
    this.ceSyncOrder();
    const left = e.order.filter((x) => this.ceCanPlay(x)).length;
    if (!left || (e.opened.length >= TILES && e.passRun >= left) || !this.ceMoveNext(true)) return this.ceReveal();
    e.step = e.opened.length >= TILES ? 'guess' : 'open';
    e.seq += 1;
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
    e.cur = (e.cur + 1) % Math.max(1, e.order.length); // ข้อใหม่เริ่มที่คนถัดไป
    this.ceStartQ();
  };

  P.ceFinish = function () {
    const e = this.ce;
    e.phase = 'over';
    this.state = 'reveal';
    const top = Object.entries(e.gained).filter(([x]) => this.players.has(x)).sort((a, b) => b[1] - a[1]);
    e.winners = top.filter(([, n]) => n === top[0][1]).map(([x]) => nameOf(this, x));
    this.feed.push({ type: 'ce-over', winners: e.winners });
  };

  // หมดเวลา: ยังไม่เปิด = สุ่มเปิดให้ 1 ชิ้น แล้วส่งต่อ · เฉลย → ข้อถัดไป
  P.ceTimeout = function () {
    const e = this.ce;
    if (e.phase === 'reveal') return this.ceNext(), true;
    if (e.phase !== 'q') return false;
    if (e.step === 'open') {
      const closed = Array.from({ length: TILES }, (_, i) => i).filter((i) => !e.opened.includes(i));
      if (closed.length) e.opened.push(closed[Math.floor(Math.random() * closed.length)]);
    }
    this.feed.push({ type: 'timeout', name: nameOf(this, this.ceCurrent()) });
    this.ceAdvance();
    return true;
  };
  // คนที่ถึงตา = ส่งต่อ (หลังเปิดแล้ว) · หัวห้อง = ข้ามข้อ/ไปข้อถัดไป
  P.cePass = function (id) {
    const e = this.ce;
    if (e.phase === 'q' && this.ceCurrent() === id && e.step === 'guess') {
      this.ceAdvance();
      return true;
    }
    if (id !== this.hostId) throw new Error(this.ceCurrent() === id ? 'เปิดจิ๊กซอก่อน 1 ชิ้น' : 'ยังไม่ถึงตาคุณ');
    if (e.phase === 'q') return this.ceReveal(), true;
    return this.ceTimeout();
  };
  P.ceAutoSkip = function () {
    const cur = this.players.get(this.ceCurrent());
    if (!cur || cur.connected) return false;
    return this.ceTimeout();
  };
  P.ceTimerKey = function () {
    const e = this.ce;
    return e.phase === 'over' ? null : `ce|${this.round}|${e.seq}|${e.phase}`;
  };
  P.ceTimerMs = function () {
    return this.ce.phase === 'q' ? TURN_MS : REVEAL_MS;
  };
  P.ceRemove = function (id) {
    const e = this.ce;
    if (!e || this.state !== 'playing') return;
    const wasCur = this.ceCurrent() === id;
    this.players.delete(id);
    if (!this.players.size) return this.ceFinish();
    this.ceSyncOrder();
    if (e.phase !== 'q') return;
    if (!e.order.some((x) => this.ceCanPlay(x))) return this.ceReveal();
    if (wasCur) {
      if (!this.ceMoveNext(false)) return this.ceReveal();
      e.step = e.opened.length >= TILES ? 'guess' : 'open';
      e.seq += 1;
    }
  };

  P.ceView = function (id) {
    const e = this.ce;
    const q = e.qs[e.idx];
    const open = e.phase !== 'q';
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
      order: e.order,
      current: this.ceCurrent(),
      step: e.step,
      out: e.out,
      nowPts: ptsFor(Math.max(1, e.opened.length + (e.step === 'open' ? 1 : 0))), // แต้มถ้าทายถูกตานี้
      choices: q.choices.map(card),
      guesses: e.guesses, // ทายผิดทุกคนเห็น (ตัดตัวเลือกได้)
      result: e.result,
      answer: open ? { id: c.id, name: c.name, kind: c.kind, page: c.page } : null,
      gained: e.gained,
      winners: e.winners || null,
    };
  };
}

module.exports = { install, celebByToken, CELEBS, COUNTS, GROUPS };

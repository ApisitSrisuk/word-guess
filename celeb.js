// เกม "ทายคนดัง" — เพิ่มความสามารถให้ Room
// - หัวห้องเลือก: คนดังไทย / ต่างประเทศ / ผสม และจำนวนข้อ
// - ทุกข้อขึ้นรูปคนดัง + ตัวเลือก 4 ชื่อ · ทุกคนตอบพร้อมกัน ตอบได้ครั้งเดียว
// - ตอบถูกยิ่งไวยิ่งได้เยอะ (10 → 1 แต้ม) · ตอบครบ/หมดเวลา → เฉลย → ข้อถัดไป
// - รูปส่งผ่านเซิร์ฟเวอร์ด้วยรหัสสุ่ม (ชื่อไฟล์บน Wikipedia มีชื่อคน กันแอบดูคำตอบ)
const crypto = require('crypto');
const CELEBS = require('./celeb-data');

const Q_MS = Number(process.env.CE_Q_MS) || 15000; // เวลาต่อข้อ
const REVEAL_MS = Number(process.env.CE_REVEAL_MS) || 5000;
const COUNTS = [5, 10, 15, 20];
const GROUPS = { th: 'คนดังไทย', intl: 'คนดังต่างประเทศ', mix: 'ไทย + ต่างประเทศ' };

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
    this.ce = { group, qs, idx: 0, seq: 1, phase: 'q', startedAt: Date.now(), answers: {}, gained: {} };
  };

  P.ceAnswer = function (id, choice) {
    const e = this.ce;
    if (this.mode !== 'celeb' || this.state !== 'playing' || e.phase !== 'q') throw new Error('ตอนนี้ยังตอบไม่ได้');
    if (!this.players.has(id)) throw new Error('ไม่ได้อยู่ในห้อง');
    if (e.answers[id]) throw new Error('ตอบข้อนี้ไปแล้ว');
    const q = e.qs[e.idx];
    choice = Number(choice);
    if (!q.choices.includes(choice)) throw new Error('ตัวเลือกไม่ถูกต้อง');
    const ms = Date.now() - e.startedAt;
    const ok = choice === q.id;
    const pts = ok ? Math.max(1, Math.ceil(10 * (1 - ms / Q_MS))) : 0;
    e.answers[id] = { choice, ok, pts, ms };
    if (pts) {
      this.players.get(id).score += pts;
      e.gained[id] = (e.gained[id] || 0) + pts;
    }
    this.ceCheckAll();
    return { ok, pts };
  };

  // ทุกคน (ที่ออนไลน์) ตอบครบ → เฉลยเลย
  P.ceCheckAll = function () {
    const e = this.ce;
    if (!e || this.state !== 'playing' || e.phase !== 'q') return false;
    const live = [...this.players.values()].filter((p) => p.connected);
    if (!live.length || !live.every((p) => e.answers[p.id])) return false;
    this.ceReveal();
    return true;
  };

  P.ceReveal = function () {
    const e = this.ce;
    const q = e.qs[e.idx];
    const c = CELEBS.find((x) => x.id === q.id);
    e.phase = 'reveal';
    e.seq += 1;
    const right = Object.entries(e.answers).filter(([, a]) => a.ok).sort((a, b) => a[1].ms - b[1].ms);
    this.feed.push({ type: 'ce-reveal', n: e.idx + 1, name: c.name, right: right.length, fastest: right[0] ? nameOf(this, right[0][0]) : null });
  };

  P.ceNext = function () {
    const e = this.ce;
    if (e.idx + 1 >= e.qs.length) return this.ceFinish();
    e.idx += 1;
    e.seq += 1;
    e.phase = 'q';
    e.answers = {};
    e.startedAt = Date.now();
  };

  P.ceFinish = function () {
    const e = this.ce;
    e.phase = 'over';
    this.state = 'reveal';
    const top = Object.entries(e.gained).filter(([x]) => this.players.has(x)).sort((a, b) => b[1] - a[1]);
    e.winners = top.filter(([, n]) => n === top[0][1]).map(([x]) => nameOf(this, x));
    this.feed.push({ type: 'ce-over', winners: e.winners });
  };

  P.ceTimeout = function () {
    const e = this.ce;
    if (e.phase === 'q') return this.ceReveal(), true;
    if (e.phase === 'reveal') return this.ceNext(), true;
    return false;
  };
  // หัวห้องกดข้าม (ไม่ต้องรอคนที่ยังไม่ตอบ / ไม่ต้องรอเฉลย)
  P.cePass = function (id) {
    if (id !== this.hostId) throw new Error('เฉพาะหัวห้องเท่านั้น');
    return this.ceTimeout();
  };
  P.ceTimerKey = function () {
    const e = this.ce;
    return e.phase === 'over' ? null : `ce|${this.round}|${e.seq}|${e.phase}`;
  };
  P.ceTimerMs = function () {
    return this.ce.phase === 'q' ? Q_MS : REVEAL_MS;
  };
  P.ceRemove = function (id) {
    if (!this.ce || this.state !== 'playing') return;
    this.players.delete(id);
    if (!this.players.size) return this.ceFinish();
    this.ceCheckAll();
  };

  P.ceView = function (id) {
    const e = this.ce;
    const q = e.qs[e.idx];
    const open = e.phase !== 'q';
    const card = (x) => {
      const c = CELEBS.find((y) => y.id === x);
      return { id: c.id, name: c.name };
    };
    const ans = e.answers[id] || null;
    const c = CELEBS.find((x) => x.id === q.id);
    return {
      phase: e.phase,
      seq: e.seq,
      n: e.idx + 1,
      total: e.qs.length,
      group: e.group,
      img: `/celeb-img/${q.token}`,
      nextImg: e.qs[e.idx + 1] ? `/celeb-img/${e.qs[e.idx + 1].token}` : null,
      elapsedMs: e.phase === 'q' ? Date.now() - e.startedAt : null,
      qMs: Q_MS,
      choices: q.choices.map(card),
      mine: ans && (open ? ans : { choice: ans.choice }), // ถูก/ผิดรู้ตอนเฉลย
      answered: Object.keys(e.answers),
      // เฉลย: คำตอบ + ใครตอบอะไร + เครดิตรูป
      answer: open ? { id: c.id, name: c.name, kind: c.kind, page: c.page } : null,
      answers: open ? e.answers : null,
      gained: e.gained,
      winners: e.winners || null,
    };
  };
}

module.exports = { install, celebByToken, CELEBS, COUNTS, GROUPS };

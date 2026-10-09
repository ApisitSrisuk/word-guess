// เกม "ใบ้สี" (Hues and Cues) — เพิ่มความสามารถให้ Room
// - กระดานสี 30 × 16 = 480 ช่อง (แถว A–P, คอลัมน์ 1–30)
// - คนใบ้ได้สี 4 ช่องให้เลือก 1 → ใบ้ 1 คำ → ทุกคนวางหมุด → ใบ้เพิ่มไม่เกิน 2 คำ → วางหมุดที่ 2 → เฉลย
// - คะแนนต่อหมุด: ตรงช่อง 3 · กรอบ 3×3 ได้ 2 · กรอบ 5×5 ได้ 1 · คนใบ้ได้ 1 ต่อหมุดที่อยู่ในกรอบ 3×3
// - ห้ามใบ้ชื่อสี / พิกัดบนกระดาน · หมุดห้ามซ้อนช่องเดียวกัน
const COLS = 30;
const ROWS = 16;
const SHOW_MS = Number(process.env.HC_SHOW_MS) || 9000; // โชว์เฉลยก่อนเปลี่ยนคนใบ้
const ROW_NAMES = 'ABCDEFGHIJKLMNOP';
const COLOR_WORDS = [
  'แดง', 'ส้ม', 'เหลือง', 'เขียว', 'ฟ้า', 'น้ำเงิน', 'คราม', 'ม่วง', 'ชมพู', 'น้ำตาล', 'ดำ', 'ขาว', 'เทา', 'แสด', 'บานเย็น',
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'cyan', 'magenta',
];

const cellName = (i) => `${ROW_NAMES[Math.floor(i / COLS)]}${(i % COLS) + 1}`;
const dist = (a, b) => Math.max(Math.abs(Math.floor(a / COLS) - Math.floor(b / COLS)), Math.abs((a % COLS) - (b % COLS)));
const ptsFor = (d) => (d === 0 ? 3 : d === 1 ? 2 : d === 2 ? 1 : 0);

// ตรวจคำใบ้: จำนวนคำ / ห้ามชื่อสี / ห้ามพิกัด
function checkClue(text, maxWords) {
  text = String(text || '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('พิมพ์คำใบ้ก่อน');
  if (text.length > 30) throw new Error('คำใบ้ยาวเกินไป');
  const words = text.split(' ');
  if (words.length > maxWords) throw new Error(maxWords === 1 ? 'ใบ้รอบแรกได้แค่ 1 คำ (ห้ามเว้นวรรค)' : `ใบ้ได้ไม่เกิน ${maxWords} คำ`);
  for (const w of words) {
    const x = w.toLowerCase().replace(/^สี/, '');
    if (w === 'สี' || COLOR_WORDS.includes(x)) throw new Error('🙅 ห้ามใบ้ด้วยชื่อสี');
    if (/^[a-p]\d{1,2}$/i.test(w) || /^\d{1,2}[a-p]$/i.test(w)) throw new Error('🙅 ห้ามใบ้เป็นพิกัดบนกระดาน');
  }
  return text;
}

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.startHues = function () {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const ids = shuffle(players.map((p) => p.id));
    const laps = ids.length <= 3 ? 2 : 1; // คนน้อย → ได้ใบ้คนละ 2 ครั้ง
    this.mode = 'hues';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh', 'pk', 'om']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'ใบ้สี';
    this.hc = {
      queue: Array.from({ length: laps }, () => ids).flat(), // ลำดับคนใบ้
      idx: -1, turnNo: 0, seq: 0, phase: 'clue1',
      giver: null, options: [], target: null, clues: [], cones: {}, result: null,
      gained: Object.fromEntries(ids.map((x) => [x, 0])),
    };
    this.hcNextGiver();
  };

  // ไปคนใบ้คนถัดไป (ข้ามคนที่ออกจากห้องแล้ว) — หมดคิว = จบเกม
  P.hcNextGiver = function () {
    const h = this.hc;
    do h.idx += 1; while (h.idx < h.queue.length && !this.players.has(h.queue[h.idx]));
    if (h.idx >= h.queue.length || this.players.size < 2) return this.hcFinish();
    h.giver = h.queue[h.idx];
    h.turnNo += 1;
    h.seq += 1;
    h.phase = 'clue1';
    h.target = null;
    h.clues = [];
    h.cones = {};
    h.result = null;
    // สุ่มสี 4 ช่องให้เลือก (ห่างกันพอสมควร)
    const opts = [];
    while (opts.length < 4) {
      const c = Math.floor(Math.random() * ROWS * COLS);
      if (opts.every((o) => dist(o, c) >= 4)) opts.push(c);
    }
    h.options = opts;
  };

  P.hcGuessers = function () {
    return [...this.players.values()].filter((p) => p.id !== this.hc.giver).map((p) => p.id);
  };
  P.hcCone = function () {
    return this.hc.phase === 'guess1' ? 0 : 1;
  };

  P.hcClue = function (id, text, pick) {
    const h = this.hc;
    if (this.mode !== 'hues' || this.state !== 'playing' || !['clue1', 'clue2'].includes(h.phase)) throw new Error('ตอนนี้ยังใบ้ไม่ได้');
    if (h.giver !== id) throw new Error('ตานี้คุณไม่ได้เป็นคนใบ้');
    if (h.phase === 'clue1') {
      pick = Number(pick);
      if (!h.options.includes(pick)) throw new Error('เลือกสีที่จะใบ้ก่อน');
      text = checkClue(text, 1);
      h.target = pick;
    } else {
      text = checkClue(text, 2);
    }
    h.clues.push(text);
    this.feed.push({ type: 'hc-clue', name: nameOf(this, id), text, n: h.clues.length });
    h.phase = h.phase === 'clue1' ? 'guess1' : 'guess2';
    h.seq += 1;
  };

  // วางหมุด (ย้ายได้จนกว่าทุกคนจะวางครบ)
  P.hcPlace = function (id, cell) {
    const h = this.hc;
    if (this.mode !== 'hues' || this.state !== 'playing' || !['guess1', 'guess2'].includes(h.phase)) throw new Error('ตอนนี้ยังวางหมุดไม่ได้');
    if (id === h.giver) throw new Error('คนใบ้ไม่ต้องวางหมุด');
    if (!this.players.has(id)) throw new Error('ไม่ได้อยู่ในห้อง');
    cell = Math.floor(Number(cell));
    if (!(cell >= 0 && cell < ROWS * COLS)) throw new Error('ช่องไม่ถูกต้อง');
    const k = this.hcCone();
    for (const [pid, cs] of Object.entries(h.cones)) {
      if (cs.some((c, i) => c === cell && !(pid === id && i === k))) throw new Error('ช่องนี้มีหมุดแล้ว เลือกช่องอื่น');
    }
    const mine = h.cones[id] || (h.cones[id] = []);
    mine[k] = cell;
    return this.hcCheckPlaced();
  };

  // ทุกคน (ที่ออนไลน์) วางครบ → ไปขั้นต่อไป
  P.hcCheckPlaced = function () {
    const h = this.hc;
    if (!h || this.state !== 'playing' || !['guess1', 'guess2'].includes(h.phase)) return false;
    const k = this.hcCone();
    const live = this.hcGuessers().filter((x) => this.players.get(x).connected);
    if (!live.length || !live.every((x) => h.cones[x] && h.cones[x][k] != null)) return false;
    this.hcAfterGuess();
    return true;
  };

  P.hcAfterGuess = function () {
    const h = this.hc;
    if (h.phase === 'guess1') {
      h.phase = 'clue2';
      h.seq += 1;
    } else this.hcScore();
  };

  P.hcScore = function () {
    const h = this.hc;
    const pts = {};
    let giverPts = 0;
    for (const [pid, cs] of Object.entries(h.cones)) {
      if (!this.players.has(pid)) continue;
      for (const c of cs) {
        if (c == null) continue;
        const d = dist(c, h.target);
        pts[pid] = (pts[pid] || 0) + ptsFor(d);
        if (d <= 1) giverPts += 1;
      }
    }
    if (giverPts) pts[h.giver] = (pts[h.giver] || 0) + giverPts;
    for (const [pid, n] of Object.entries(pts)) {
      const p = this.players.get(pid);
      if (p) p.score += n;
      h.gained[pid] = (h.gained[pid] || 0) + n;
    }
    const best = Object.entries(pts).filter(([pid]) => pid !== h.giver).sort((a, b) => b[1] - a[1])[0];
    h.result = { pts, giverPts };
    h.phase = 'show';
    h.seq += 1;
    this.feed.push({
      type: 'hc-show', name: nameOf(this, h.giver), cell: cellName(h.target), target: h.target, giverPts,
      best: best && best[1] ? nameOf(this, best[0]) : null, bestPts: best ? best[1] : 0,
    });
  };

  P.hcFinish = function () {
    const h = this.hc;
    h.phase = 'over';
    this.state = 'reveal';
    const top = Object.entries(h.gained).filter(([pid]) => this.players.has(pid)).sort((a, b) => b[1] - a[1]);
    const winners = top.filter(([, n]) => top.length && n === top[0][1] && n > 0).map(([pid]) => nameOf(this, pid));
    h.winners = winners;
    this.feed.push({ type: 'hc-over', winners });
  };

  P.hcTimeout = function () {
    const h = this.hc;
    if (h.phase === 'show') return this.hcNextGiver(), true;
    if (h.phase === 'clue1') {
      this.feed.push({ type: 'timeout', name: nameOf(this, h.giver) });
      return this.hcNextGiver(), true;
    }
    if (h.phase === 'clue2') return this.hcScore(), true; // ไม่ใบ้เพิ่ม → เฉลยเลย
    if (h.phase === 'guess1' || h.phase === 'guess2') return this.hcAfterGuess(), true;
    return false;
  };
  // คนใบ้ (หรือหัวห้อง) กด "พอแล้ว" ตอนรอวางหมุด → ไปต่อเลยไม่ต้องรอ
  P.hcPass = function (id) {
    const h = this.hc;
    if (!['guess1', 'guess2', 'show'].includes(h.phase)) return false;
    if (id !== h.giver && id !== this.hostId) throw new Error('เฉพาะคนใบ้หรือหัวห้องเท่านั้น');
    return this.hcTimeout();
  };

  P.hcCurrent = function () {
    const h = this.hc;
    return h && this.state === 'playing' && (h.phase === 'clue1' || h.phase === 'clue2') ? h.giver : null;
  };
  P.hcTimerKey = function () {
    const h = this.hc;
    if (h.phase === 'show') return `hc|${this.round}|${h.seq}|show`;
    return this.turnLimit && h.phase !== 'over' ? `hc|${this.round}|${h.seq}|${h.phase}` : null;
  };
  P.hcTimerMs = function () {
    return this.hc.phase === 'show' ? SHOW_MS : this.turnLimit * 1000;
  };
  P.hcAutoSkip = function () {
    const h = this.hc;
    const g = this.players.get(h.giver);
    if (this.hcCheckPlaced()) return true;
    if (!g || g.connected || !['clue1', 'clue2'].includes(h.phase)) return false;
    return this.hcTimeout();
  };

  P.hcRemove = function (id) {
    const h = this.hc;
    if (!h || this.state !== 'playing') return;
    this.players.delete(id);
    delete h.cones[id];
    if (h.giver === id && h.phase !== 'show') {
      this.feed.push({ type: 'hc-skip', name: nameOf(this, id) });
      this.hcNextGiver();
    } else if (this.players.size < 2) this.hcFinish();
    else this.hcCheckPlaced();
  };

  P.hcView = function (id) {
    const h = this.hc;
    const isGiver = h.giver === id;
    const open = h.phase === 'show' || h.phase === 'over';
    return {
      phase: h.phase,
      seq: h.seq,
      turnNo: h.turnNo,
      totalTurns: h.queue.length,
      giver: h.giver,
      queue: h.queue.slice(h.idx + 1),
      options: isGiver && h.phase === 'clue1' ? h.options : null,
      target: isGiver || open ? h.target : null,
      clues: h.clues,
      cones: h.cones,
      cone: h.phase === 'guess1' ? 0 : h.phase === 'guess2' ? 1 : null,
      result: open ? h.result : null,
      gained: h.gained,
      winners: h.winners || null,
    };
  };
}

module.exports = { install, checkClue, cellName, dist, COLS, ROWS };

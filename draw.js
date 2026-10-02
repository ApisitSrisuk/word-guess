// เกม "วาดภาพทายคำ" — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - ผลัดกันวาดคนละ 1 ตา: เลือกคำจาก 3 ตัวเลือก → วาด → คนอื่นพิมพ์ทาย (ทายในช่องทาย/แชท)
// - ทายถูก: คนแรก +5, ถัดไป +4 … ต่ำสุด +1 / คนวาด +1 ต่อคนที่ทายถูก
// - จบตาเมื่อทุกคนทายถูก / หมดเวลา / กดจบตา → เฉลยคำ → คนวาดคนถัดไป — วาดครบทุกคน = จบเกม
const CHOOSE_MS = Number(process.env.DRAW_CHOOSE_MS) || 15000;
const REVEAL_MS = Number(process.env.DRAW_REVEAL_MS) || 4000;
const MAX_POINTS = 40000; // จำนวนจุดสูงสุดต่อภาพ (กันข้อมูลบวม)
const HARD_TO_DRAW = ['จังหวัด', 'ประเทศ'];
const seg = new Intl.Segmenter('th', { granularity: 'grapheme' });
const graphemes = (s) => [...seg.segment(s.replace(/\s+/g, ''))].length;

function install(Room, { shuffle, normalize, parseEntry, WORDS, CATEGORIES }) {
  const P = Room.prototype;

  P.startDraw = function (category) {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    if (category && category !== 'random' && !WORDS[category]) throw new Error('หมวดนี้ใช้ไม่ได้');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    this.mode = 'draw';
    this.uc = null;
    this.ct = null;
    this.ch = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = category && category !== 'random' ? category : 'สุ่มหมวด';
    this.dr = {
      fixedCategory: category && category !== 'random' ? category : null,
      order: shuffle(players.map((p) => p.id)),
      idx: 0,
      turnNo: 0,
      phase: 'choose',
      drawerId: null,
      category: null,
      choices: [],
      word: null,
      guessed: [], // ลำดับคนที่ทายถูก
      strokes: [],
      points: 0,
    };
    this.drBeginTurn();
  };

  P.drBeginTurn = function () {
    const d = this.dr;
    // ข้ามคนที่ออกจากห้องไปแล้ว
    while (d.idx < d.order.length && !this.players.has(d.order[d.idx])) d.idx += 1;
    if (d.idx >= d.order.length) return this.drFinishGame();
    d.turnNo += 1;
    d.drawerId = d.order[d.idx];
    d.category = d.fixedCategory || shuffle(CATEGORIES.filter((c) => !HARD_TO_DRAW.includes(c)))[0];
    const pool = WORDS[d.category].map(parseEntry);
    const fresh = pool.filter((w) => !this.usedWords.has(w.display));
    d.choices = shuffle(fresh.length >= 3 ? fresh : pool).slice(0, 3);
    d.word = null;
    d.guessed = [];
    d.strokes = [];
    d.points = 0;
    d.phase = 'choose';
  };

  P.drChoose = function (id, index) {
    const d = this.dr;
    if (this.mode !== 'draw' || this.state !== 'playing' || d.phase !== 'choose') throw new Error('ตอนนี้ยังเลือกคำไม่ได้');
    if (id !== d.drawerId) throw new Error('ยังไม่ถึงตาคุณวาด');
    const w = d.choices[Number(index)];
    if (!w) throw new Error('เลือกคำไม่ถูกต้อง');
    d.word = w;
    this.usedWords.add(w.display);
    d.choices = [];
    d.phase = 'draw';
  };

  // ข้อมูลการวาด (ส่งต่อให้คนอื่นแบบสด) — คืน true ถ้ารับได้
  P.drStroke = function (id, op) {
    const d = this.dr;
    if (this.mode !== 'draw' || this.state !== 'playing' || d.phase !== 'draw' || id !== d.drawerId || !op) return false;
    const okNum = (n) => typeof n === 'number' && n >= 0 && n <= 1;
    switch (op.op) {
      case 'begin': {
        if (typeof op.id !== 'string' || op.id.length > 16) return false;
        if (!/^#[0-9a-f]{6}$/i.test(op.c) || !(op.w > 0 && op.w <= 0.08)) return false;
        if (!Array.isArray(op.p) || op.p.length !== 2 || !op.p.every(okNum)) return false;
        if (d.points >= MAX_POINTS) return false;
        d.strokes.push({ id: op.id, c: op.c, w: op.w, p: op.p.slice() });
        d.points += 1;
        return true;
      }
      case 'pts': {
        const s = d.strokes.find((x) => x.id === op.id);
        if (!s || !Array.isArray(op.p) || op.p.length % 2 || op.p.length > 400 || !op.p.every(okNum)) return false;
        if (d.points + op.p.length / 2 > MAX_POINTS) return false;
        s.p.push(...op.p);
        d.points += op.p.length / 2;
        return true;
      }
      case 'undo':
        d.strokes.pop();
        return true;
      case 'clear':
        d.strokes = [];
        return true;
      default:
        return false;
    }
  };

  // ตรวจคำทาย (มาจากช่องทาย/แชท) — คืน null ถ้าไม่ใช่การทาย, true/false ถ้าเป็นการทาย
  P.drGuess = function (id, text) {
    const d = this.dr;
    if (this.mode !== 'draw' || this.state !== 'playing' || d.phase !== 'draw' || !d.word) return null;
    if (id === d.drawerId) return null;
    const n = normalize(text);
    const hit = d.word.answers.includes(n);
    if (d.guessed.includes(id)) {
      if (hit || d.word.answers.some((a) => a.length >= 2 && n.includes(a))) throw new Error('คุณทายถูกไปแล้ว ห้ามบอกคำคนอื่นนะ 🤫');
      return null;
    }
    if (!hit) return false;
    d.guessed.push(id);
    const pts = Math.max(1, 6 - d.guessed.length);
    const me = this.players.get(id);
    const drawer = this.players.get(d.drawerId);
    if (me) me.score += pts;
    if (drawer) drawer.score += 1;
    this.feed.push({ type: 'dr-correct', name: me ? me.name : '?', pts, order: d.guessed.length });
    // ทุกคน (ที่ออนไลน์) ทายถูกแล้ว → จบตา
    const guessers = [...this.players.values()].filter((p) => p.id !== d.drawerId && p.connected && d.order.includes(p.id));
    if (guessers.length && guessers.every((p) => d.guessed.includes(p.id))) this.drEndTurn('all');
    return true;
  };

  P.drEndTurn = function (reason) {
    const d = this.dr;
    if (d.phase === 'reveal' || d.phase === 'over') return;
    if (d.phase === 'choose') {
      // ไม่ได้เลือกคำ → เลือกให้เลย แล้วจบตาทันทีถ้าโดนข้าม
      d.word = d.choices[0];
      d.choices = [];
    }
    const drawer = this.players.get(d.drawerId);
    this.feed.push({ type: 'dr-end', name: drawer ? drawer.name : '?', word: d.word ? d.word.display : '?', reason, count: d.guessed.length });
    d.phase = 'reveal';
  };

  P.drNextTurn = function () {
    const d = this.dr;
    d.idx += 1;
    this.drBeginTurn();
  };

  P.drFinishGame = function () {
    const d = this.dr;
    d.phase = 'over';
    d.drawerId = null;
    this.state = 'reveal';
    this.feed.push({ type: 'dr-over' });
  };

  P.drCurrent = function () {
    const d = this.dr;
    if (!d || this.state !== 'playing' || d.phase === 'reveal') return null;
    return d.drawerId;
  };

  P.drPass = function (byId) {
    const d = this.dr;
    if (this.state !== 'playing' || (d.phase !== 'draw' && d.phase !== 'choose')) return false;
    this.drEndTurn(byId === d.drawerId ? 'pass' : 'skip');
    return true;
  };

  // หมดเวลา: เลือกคำ → เลือกให้ / วาด → จบตา / เฉลย → คนถัดไป
  P.drTimeout = function () {
    const d = this.dr;
    if (d.phase === 'choose') return this.drChoose(d.drawerId, 0), true;
    if (d.phase === 'draw') return this.drEndTurn('timeout'), true;
    if (d.phase === 'reveal') return this.drNextTurn(), true;
    return false;
  };

  P.drTimerKey = function () {
    const d = this.dr;
    if (d.phase === 'choose') return `d|${this.round}|${d.turnNo}|choose`;
    if (d.phase === 'reveal') return `d|${this.round}|${d.turnNo}|reveal`;
    if (d.phase === 'draw') return this.turnLimit ? `d|${this.round}|${d.turnNo}|draw` : null;
    return null;
  };

  P.drTimerMs = function () {
    const d = this.dr;
    if (d.phase === 'choose') return CHOOSE_MS;
    if (d.phase === 'reveal') return REVEAL_MS;
    return this.turnLimit * 1000;
  };

  P.drAddPlayer = function (id) {
    if (this.dr && this.state === 'playing') this.dr.order.push(id); // ได้วาดตอนท้าย
  };

  P.drRemove = function (id) {
    const d = this.dr;
    if (!d || this.state !== 'playing') return;
    if (id === d.drawerId && (d.phase === 'draw' || d.phase === 'choose')) this.drEndTurn('left');
  };

  P.drView = function (id) {
    const d = this.dr;
    const amDrawer = id === d.drawerId;
    const showWord = d.word && (amDrawer || d.phase === 'reveal' || d.guessed.includes(id));
    return {
      phase: d.phase,
      drawerId: d.drawerId,
      amDrawer,
      category: d.category,
      choices: amDrawer && d.phase === 'choose' ? d.choices.map((w) => w.display) : [],
      word: showWord ? d.word.display : null,
      // ใบ้: จำนวนตัวอักษร (นับแบบ grapheme — สระ/วรรณยุกต์ไทยไม่นับแยก)
      wordLen: d.word ? graphemes(d.word.display) : 0,
      guessed: d.guessed,
      turnNo: d.turnNo,
      drawn: d.idx,
      total: d.order.length,
      order: d.order,
    };
  };
}

module.exports = { install, CHOOSE_MS, REVEAL_MS };

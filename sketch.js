// เกม "แข่งวาด" (Catch Sketch) — เพิ่มความสามารถให้ Room
// กติกา (ตาม rulebook ของ Catch Sketch):
// - ทุกตามีคนทาย 1 คน · คนอื่นทุกคนเห็นคำเดียวกัน แล้วแข่งกันวาดบนกระดานของตัวเอง (ห้ามเขียนตัวหนังสือ/ตัวเลข)
// - วาดเสร็จก่อนได้ลำดับ 1, 2 · พอมีคนเสร็จครบ 2 คน (เล่น 3 คน = 1 คน) ทุกคน "หยุด!" คนที่เหลือได้ลำดับแบบสุ่ม
// - เปิดภาพตามลำดับ คนทายทายได้ภาพละ 1 ครั้ง (เล่น 3 คน = 2 ครั้ง) · ทายถูก = คนทาย + คนวาดภาพนั้นได้แต้มเท่ากัน แล้วจบตา
// - แต้ม: ภาพที่ 1 = 3 · ภาพที่ 2 = 2 · ภาพถัดไป = 1 (เล่น 3 คน: 3 กับ 1)
// - จบเกมเมื่อทุกคนได้เป็นคนทายครบ หรือมีคนได้ 20 แต้มในเกมนี้
const GUESS_MS = Number(process.env.SK_GUESS_MS) || 30000; // เวลาทายต่อภาพ
const SHOW_MS = Number(process.env.SK_SHOW_MS) || 7000;
const MAX_POINTS = 6000; // จุดสูงสุดต่อภาพ
const MAX_STROKES = 400;
const WIN_SCORE = 20;
const HARD_TO_DRAW = ['จังหวัด', 'ประเทศ'];

function install(Room, { shuffle, normalize, parseEntry, WORDS, CATEGORIES }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';
  const okNum = (n) => typeof n === 'number' && n >= 0 && n <= 1;

  P.startSketch = function () {
    const players = [...this.players.values()];
    if (players.length < 3) throw new Error('ต้องมีผู้เล่นอย่างน้อย 3 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const ids = shuffle(players.map((p) => p.id));
    const laps = ids.length <= 5 ? 2 : 1;
    this.mode = 'sketch';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh', 'pk', 'om', 'hc']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'แข่งวาด';
    this.sk = {
      queue: Array.from({ length: laps }, () => ids).flat(),
      idx: -1, turnNo: 0, seq: 0,
      gained: Object.fromEntries(ids.map((x) => [x, 0])),
    };
    this.skNextTurn();
  };

  P.skNextTurn = function () {
    const k = this.sk;
    if (Object.values(k.gained).some((n) => n >= WIN_SCORE)) return this.skFinish();
    do k.idx += 1; while (k.idx < k.queue.length && !this.players.has(k.queue[k.idx]));
    if (k.idx >= k.queue.length || this.players.size < 3) return this.skFinish();
    const category = shuffle(CATEGORIES.filter((c) => !HARD_TO_DRAW.includes(c)))[0];
    const pool = WORDS[category].map(parseEntry);
    const fresh = pool.filter((w) => !this.usedWords.has(w.display));
    const word = shuffle(fresh.length ? fresh : pool)[0];
    this.usedWords.add(word.display);
    Object.assign(k, {
      guesser: k.queue[k.idx], turnNo: k.turnNo + 1, seq: k.seq + 1, phase: 'draw',
      category, word, drawings: {}, done: [], order: [], board: 0, tries: 0, guesses: [], winner: null,
      drawers: [...this.players.keys()].filter((x) => x !== k.queue[k.idx]),
    });
  };

  // ค่าที่ขึ้นกับจำนวนคนวาด (โหมด 3 คน = คนวาด 2 คน)
  P.skSmall = function () {
    return this.sk.drawers.length <= 2;
  };
  P.skPoints = function (i) {
    if (this.skSmall()) return i === 0 ? 3 : 1;
    return i === 0 ? 3 : i === 1 ? 2 : 1;
  };
  P.skAttempts = function () {
    return this.skSmall() ? 2 : 1;
  };
  // ต้องมีคนวาดเสร็จกี่คนถึงจะ "หยุด!" ทุกคน
  P.skStopAt = function () {
    const k = this.sk;
    const live = k.drawers.filter((x) => this.players.has(x) && (this.players.get(x).connected || k.done.includes(x)));
    return Math.max(1, Math.min(this.skSmall() ? 1 : 2, live.length));
  };

  // เก็บภาพล่าสุดของคนวาด (ส่งมาทุกครั้งที่ยกนิ้ว) — ยังไม่มีใครเห็นจนกว่าจะถึงตาเปิด
  P.skSetDrawing = function (id, strokes) {
    const k = this.sk;
    if (this.mode !== 'sketch' || this.state !== 'playing' || k.phase !== 'draw') throw new Error('ตอนนี้วาดไม่ได้แล้ว');
    if (!k.drawers.includes(id)) throw new Error('ตานี้คุณเป็นคนทาย');
    if (k.done.includes(id)) throw new Error('ส่งภาพไปแล้ว');
    if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) throw new Error('ภาพไม่ถูกต้อง');
    let pts = 0;
    const clean = [];
    for (const s of strokes) {
      if (!s || !/^#[0-9a-f]{6}$/i.test(s.c) || !(s.w > 0 && s.w <= 0.08)) throw new Error('ภาพไม่ถูกต้อง');
      if (!Array.isArray(s.p) || s.p.length < 2 || s.p.length % 2 || !s.p.every(okNum)) throw new Error('ภาพไม่ถูกต้อง');
      pts += s.p.length / 2;
      if (pts > MAX_POINTS) throw new Error('ภาพละเอียดเกินไป ลองวาดให้ง่ายลงหน่อย');
      clean.push({ c: s.c, w: s.w, p: s.p });
    }
    k.drawings[id] = clean;
  };

  P.skDone = function (id, strokes) {
    const k = this.sk;
    if (strokes) this.skSetDrawing(id, strokes);
    else if (this.mode !== 'sketch' || this.state !== 'playing' || k.phase !== 'draw') throw new Error('ตอนนี้วาดไม่ได้แล้ว');
    if (!k.drawers.includes(id)) throw new Error('ตานี้คุณเป็นคนทาย');
    if (k.done.includes(id)) throw new Error('ส่งภาพไปแล้ว');
    if (!(k.drawings[id] || []).length) throw new Error('วาดอะไรสักหน่อยก่อนนะ ✏️');
    k.done.push(id);
    this.feed.push({ type: 'sk-done', name: nameOf(this, id), n: k.done.length });
    const rank = k.done.length;
    this.skCheckStop();
    return rank;
  };

  P.skCheckStop = function () {
    const k = this.sk;
    if (!k || this.state !== 'playing' || k.phase !== 'draw') return false;
    if (k.done.length < this.skStopAt()) return false;
    this.skStop();
    return true;
  };

  // หยุด! → เรียงลำดับเปิดภาพ (คนเสร็จก่อน → คนที่เหลือสุ่ม · ไม่ได้วาดอะไร = ไม่นับ)
  P.skStop = function () {
    const k = this.sk;
    const rest = shuffle(k.drawers.filter((x) => !k.done.includes(x) && this.players.has(x) && (k.drawings[x] || []).length));
    k.order = [...k.done.filter((x) => this.players.has(x)), ...rest];
    k.board = 0;
    k.tries = 0;
    k.seq += 1;
    if (!k.order.length) return this.skShow();
    k.phase = 'guess';
    this.feed.push({ type: 'sk-stop', names: k.done.map((x) => nameOf(this, x)) });
  };

  P.skGuess = function (id, text) {
    const k = this.sk;
    if (this.mode !== 'sketch' || this.state !== 'playing' || k.phase !== 'guess') throw new Error('ตอนนี้ยังทายไม่ได้');
    if (id !== k.guesser) throw new Error('ตานี้คุณไม่ได้เป็นคนทาย');
    text = String(text || '').trim().slice(0, 40);
    if (!text) throw new Error('พิมพ์คำตอบก่อน');
    const drawer = k.order[k.board];
    const ok = k.word.answers.includes(normalize(text));
    k.guesses.push({ board: k.board, text, ok });
    this.feed.push({ type: 'sk-guess', name: nameOf(this, id), text, ok, drawer: nameOf(this, drawer) });
    if (ok) {
      const pts = this.skPoints(k.board);
      k.winner = { drawer, pts, board: k.board };
      for (const x of [id, drawer]) {
        const p = this.players.get(x);
        if (p) p.score += pts;
        k.gained[x] = (k.gained[x] || 0) + pts;
      }
      this.skShow();
      return true;
    }
    k.tries += 1;
    if (k.tries >= this.skAttempts()) this.skNextBoard();
    else k.seq += 1;
    return false;
  };

  P.skNextBoard = function () {
    const k = this.sk;
    k.board += 1;
    k.tries = 0;
    k.seq += 1;
    while (k.board < k.order.length && !this.players.has(k.order[k.board])) k.board += 1;
    if (k.board >= k.order.length) this.skShow();
  };

  P.skShow = function () {
    const k = this.sk;
    k.phase = 'show';
    k.seq += 1;
    this.feed.push({
      type: 'sk-show', word: k.word.display, name: nameOf(this, k.guesser),
      drawer: k.winner ? nameOf(this, k.winner.drawer) : null, pts: k.winner ? k.winner.pts : 0,
    });
  };

  P.skFinish = function () {
    const k = this.sk;
    k.phase = 'over';
    this.state = 'reveal';
    const top = Object.entries(k.gained).filter(([x]) => this.players.has(x)).sort((a, b) => b[1] - a[1]);
    k.winners = top.filter(([, n]) => n > 0 && n === top[0][1]).map(([x]) => nameOf(this, x));
    this.feed.push({ type: 'sk-over', winners: k.winners });
  };

  P.skTimeout = function () {
    const k = this.sk;
    if (k.phase === 'draw') return this.skStop(), true;
    if (k.phase === 'guess') {
      this.feed.push({ type: 'sk-guess', name: nameOf(this, k.guesser), text: null, ok: false, drawer: nameOf(this, k.order[k.board]) });
      return this.skNextBoard(), true;
    }
    if (k.phase === 'show') return this.skNextTurn(), true;
    return false;
  };
  P.skCurrent = function () {
    const k = this.sk;
    return k && this.state === 'playing' && k.phase === 'guess' ? k.guesser : null;
  };
  P.skTimerKey = function () {
    const k = this.sk;
    if (k.phase === 'guess' || k.phase === 'show') return `sk|${this.round}|${k.seq}|${k.phase}`;
    return k.phase === 'draw' && this.turnLimit ? `sk|${this.round}|${k.seq}|draw` : null;
  };
  P.skTimerMs = function () {
    const k = this.sk;
    return k.phase === 'guess' ? GUESS_MS : k.phase === 'show' ? SHOW_MS : this.turnLimit * 1000;
  };
  P.skAutoSkip = function () {
    const k = this.sk;
    if (this.skCheckStop()) return true;
    const g = this.players.get(k.guesser);
    if (k.phase === 'guess' && (!g || !g.connected)) return this.skShow(), true;
    return false;
  };
  // คนทาย (หรือหัวห้อง) กดยอมแพ้ภาพนี้ / ข้ามโชว์เฉลย
  P.skPass = function (id) {
    const k = this.sk;
    if (k.phase === 'guess' && (id === k.guesser || id === this.hostId)) return this.skNextBoard(), true;
    if (k.phase === 'show' && (id === k.guesser || id === this.hostId)) return this.skNextTurn(), true;
    if (k.phase === 'draw' && id === this.hostId) return this.skStop(), true;
    throw new Error(k.phase === 'draw' ? 'รอเพื่อนวาดก่อน (หัวห้องกดหยุดได้)' : 'เฉพาะคนทายหรือหัวห้องเท่านั้น');
  };

  P.skRemove = function (id) {
    const k = this.sk;
    if (!k || this.state !== 'playing') return;
    this.players.delete(id);
    if (this.players.size < 3 && k.phase !== 'show') return this.skFinish();
    if (id === k.guesser && k.phase !== 'show') {
      this.feed.push({ type: 'sk-skip', name: nameOf(this, id) });
      return this.skNextTurn();
    }
    k.done = k.done.filter((x) => x !== id);
    if (k.phase === 'draw') this.skCheckStop();
    else if (k.phase === 'guess' && k.order[k.board] === id) {
      k.board -= 1;
      this.skNextBoard();
    }
  };

  P.skView = function (id) {
    const k = this.sk;
    const open = k.phase === 'show' || k.phase === 'over';
    const amGuesser = id === k.guesser;
    // ภาพ: ตอนทาย = เปิดถึงภาพปัจจุบัน · เฉลย = เปิดทุกภาพ
    const shown = k.phase === 'guess' ? k.order.slice(0, k.board + 1) : open ? k.order : [];
    return {
      phase: k.phase,
      seq: k.seq,
      turnNo: k.turnNo,
      totalTurns: k.queue.length,
      guesser: k.guesser,
      next: k.queue.slice(k.idx + 1).find((x) => this.players.has(x)) || null,
      category: k.category,
      word: !amGuesser || open ? k.word.display : null,
      amDrawer: (k.drawers || []).includes(id),
      myDrawing: k.phase === 'draw' ? k.drawings[id] || null : null, // รีเฟรชกลางตาแล้วภาพไม่หาย
      done: k.done,
      stopAt: k.phase === 'draw' ? this.skStopAt() : null,
      order: k.order,
      board: k.board,
      tries: k.tries,
      attempts: this.skAttempts(),
      points: (k.order || []).map((_, i) => this.skPoints(i)),
      drawings: Object.fromEntries(shown.filter((x) => k.drawings[x]).map((x) => [x, k.drawings[x]])),
      guesses: k.guesses,
      winner: k.winner,
      gained: k.gained,
      winners: k.winners || null,
    };
  };
}

module.exports = { install, WIN_SCORE };

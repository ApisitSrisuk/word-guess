// เกม "ทายคำตรงกลาง" — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - ทุกรอบสุ่ม (แล้ววน) 1 คนเป็น "คนตอบ" เห็นคำลับคนเดียว คนที่เหลือผลัดกันถามตามลำดับ
// - ตาของเรา: ถามใช่/ไม่ใช่ → คนตอบกด ใช่/ไม่ใช่/อาจจะ → เราทายได้ 1 ครั้ง (หรือจบตา)
//            หรือจะทายเลยโดยไม่ถามก็ได้
// - ทายถูก +3 (คนตอบ +1) / ครบ MAX_Q คำถามแล้วไม่มีใครถูก → คนตอบ +3
const MAX_Q = 20;
const PTS = { guesser: 3, masterHelp: 1, masterWin: 3 };
const ANSWERS = { yes: '✅ ใช่', no: '❌ ไม่ใช่', maybe: '🤔 อาจจะ', none: '⏱️ ไม่ได้ตอบ' };

function install(Room, { shuffle, normalize, parseEntry, WORDS, CATEGORIES }) {
  const P = Room.prototype;

  P.startCenter = function (category) {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    if (category && category !== 'random') {
      if (!WORDS[category]) throw new Error('หมวดนี้ใช้ไม่ได้');
    } else {
      category = shuffle(CATEGORIES)[0];
    }
    // เลือกคำ (เลี่ยงคำที่เคยออก)
    const pool = WORDS[category].map(parseEntry);
    const fresh = pool.filter((w) => !this.usedWords.has(w.display));
    const word = shuffle(fresh.length ? fresh : pool)[0];
    this.usedWords.add(word.display);

    // คนตอบ: วนตามลำดับคนในห้อง (รอบแรกสุ่ม)
    const ids = players.map((p) => p.id);
    const prev = this.ct && ids.indexOf(this.ct.masterId);
    const masterId = prev != null && prev >= 0 ? ids[(prev + 1) % ids.length] : shuffle(ids)[0];

    for (const p of players) { p.word = null; p.guessedBy = null; }
    this.mode = 'center';
    this.uc = null;
    this.dr = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = category;
    this.ct = {
      word, category, masterId,
      order: shuffle(ids.filter((id) => id !== masterId)),
      idx: 0,
      turnNo: 1,
      phase: 'ask', // ask → answer → guess → (ตาถัดไป) ask …  / over
      qa: [], // { id, q, a }
      guesses: [], // { id, text, correct }
      winnerId: null,
      reason: null,
    };
  };

  P.ctCurrent = function () {
    const c = this.ct;
    if (!c || this.state !== 'playing') return null;
    if (c.phase === 'answer') return c.masterId;
    return c.order[c.idx % c.order.length] || null;
  };
  P.ctAsker = function () {
    const c = this.ct;
    return c && c.order.length ? c.order[c.idx % c.order.length] : null;
  };

  P.ctAsk = function (id, text) {
    const c = this.ct;
    if (this.mode !== 'center' || this.state !== 'playing' || c.phase !== 'ask') throw new Error('ตอนนี้ยังถามไม่ได้');
    if (this.ctAsker() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    if (c.qa.length >= MAX_Q) throw new Error(`ถามครบ ${MAX_Q} ข้อแล้ว — ทายได้อย่างเดียว`);
    text = String(text || '').trim().slice(0, 100);
    if (!text) throw new Error('พิมพ์คำถามก่อน');
    c.qa.push({ id, q: text, a: null });
    c.phase = 'answer';
  };

  P.ctAnswer = function (id, answer) {
    const c = this.ct;
    if (this.mode !== 'center' || this.state !== 'playing' || c.phase !== 'answer') throw new Error('ตอนนี้ยังไม่มีคำถาม');
    if (id !== c.masterId) throw new Error('เฉพาะคนตอบเท่านั้น');
    if (!ANSWERS[answer] || answer === 'none') throw new Error('คำตอบไม่ถูกต้อง');
    c.qa[c.qa.length - 1].a = answer;
    c.phase = 'guess';
  };

  // ทาย: ตอนถึงตา (ก่อนถาม หรือหลังได้คำตอบ) ทายได้ 1 ครั้งต่อตา
  P.ctGuess = function (id, text) {
    const c = this.ct;
    if (this.mode !== 'center' || this.state !== 'playing' || (c.phase !== 'ask' && c.phase !== 'guess')) throw new Error('ตอนนี้ยังทายไม่ได้');
    if (this.ctAsker() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    text = String(text || '').trim().slice(0, 40);
    if (!text) throw new Error('พิมพ์คำที่ทายก่อน');
    const correct = c.word.answers.includes(normalize(text));
    c.guesses.push({ id, text, correct, turnNo: c.turnNo });
    const p = this.players.get(id);
    this.feed.push({ type: 'ct-guess', name: p ? p.name : '?', text, correct });
    if (correct) {
      this.ctFinish(id, 'guessed');
      return true;
    }
    this.ctNextTurn();
    return false;
  };

  P.ctNextTurn = function () {
    const c = this.ct;
    // ถามครบแล้ว และทุกคนได้ทายหลังข้อสุดท้ายแล้ว → คนตอบชนะ
    if (c.qa.length >= MAX_Q) {
      c.finalGuessesLeft = (c.finalGuessesLeft == null ? c.order.length : c.finalGuessesLeft) - 1;
      if (c.finalGuessesLeft <= 0) return this.ctFinish(null, 'maxq');
    }
    c.turnNo += 1;
    c.phase = 'ask';
    const n = c.order.length;
    // ข้ามคนที่หลุดการเชื่อมต่อ (ถ้ายังมีคนออนไลน์)
    for (let i = 1; i <= n; i++) {
      const next = (c.idx + i) % n;
      const p = this.players.get(c.order[next]);
      if (p && p.connected) { c.idx = next; return; }
    }
    c.idx = (c.idx + 1) % n;
  };

  // จบตา/ข้าม: ใครก็กดได้ — ถ้ากำลังรอคนตอบ = ไม่ได้ตอบ
  P.ctPass = function (byId, { timeout = false } = {}) {
    const c = this.ct;
    if (this.state !== 'playing') return false;
    const cur = this.players.get(this.ctCurrent());
    const by = this.players.get(byId);
    if (c.phase === 'answer') {
      c.qa[c.qa.length - 1].a = 'none';
      c.phase = 'guess';
      this.feed.push({ type: timeout ? 'timeout' : 'pass', name: cur ? cur.name : 'คนตอบ', by: !timeout && byId !== c.masterId && by ? by.name : undefined });
      return true;
    }
    this.feed.push({ type: timeout ? 'timeout' : 'pass', name: cur ? cur.name : '?', by: !timeout && byId !== this.ctAsker() && by ? by.name : undefined });
    this.ctNextTurn();
    return true;
  };

  P.ctFinish = function (winnerId, reason) {
    const c = this.ct;
    c.phase = 'over';
    c.winnerId = winnerId;
    c.reason = reason;
    this.state = 'reveal';
    const master = this.players.get(c.masterId);
    if (reason === 'guessed') {
      const w = this.players.get(winnerId);
      if (w) w.score += PTS.guesser;
      if (master) master.score += PTS.masterHelp;
    } else if (reason === 'maxq' && master) {
      master.score += PTS.masterWin;
    }
    this.feed.push({ type: 'ct-over', reason, name: winnerId ? (this.players.get(winnerId) || {}).name : master && master.name, word: c.word.display });
  };

  P.ctAddPlayer = function (id) {
    if (this.ct && this.state === 'playing') this.ct.order.push(id); // ต่อคิวถาม
  };

  P.ctRemove = function (id) {
    const c = this.ct;
    if (!c || this.state !== 'playing') return;
    if (id === c.masterId) {
      // คนตอบออก → จบรอบ เฉลยคำ ไม่มีใครได้แต้ม
      this.feed.push({ type: 'ct-over', reason: 'master-left', word: c.word.display });
      c.phase = 'over';
      c.reason = 'master-left';
      this.state = 'reveal';
      return;
    }
    const i = c.order.indexOf(id);
    if (i === -1) return;
    const wasCurrent = this.ctAsker() === id;
    c.order.splice(i, 1);
    if (!c.order.length) {
      c.phase = 'over';
      c.reason = 'empty';
      this.state = 'reveal';
      return;
    }
    if (i < c.idx) c.idx -= 1;
    c.idx %= c.order.length;
    if (wasCurrent) c.phase = 'ask';
  };

  P.ctAutoSkip = function () {
    const cur = this.players.get(this.ctCurrent());
    if (!cur || cur.connected) return false;
    return this.ctPass(cur.id);
  };

  P.ctView = function (id) {
    const c = this.ct;
    const over = c.phase === 'over';
    const amMaster = id === c.masterId;
    return {
      phase: c.phase,
      category: c.category,
      masterId: c.masterId,
      amMaster,
      word: amMaster || over ? c.word.display : null,
      asker: this.ctAsker(),
      qa: c.qa,
      guesses: c.guesses,
      maxQ: MAX_Q,
      turnNo: c.turnNo,
      winnerId: c.winnerId,
      reason: c.reason,
      answers: ANSWERS,
    };
  };
}

module.exports = { install, MAX_Q, ANSWERS };

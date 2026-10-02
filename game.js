// ตรรกะเกม (ไม่ผูกกับ socket) — ทดสอบได้ด้วย test.js
const WORDS = require('./words');

const CATEGORIES = Object.keys(WORDS);
const TURN_LIMITS = [0, 30, 45, 60, 90, 120];
const ANSWERS = { yes: '✅ ใช่', no: '❌ ไม่ใช่', maybe: '🤔 อาจจะ', none: '⏱️ ไม่ได้ตอบ' };

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^(จังหวัด|จ\.)/, '') // "จังหวัดเชียงใหม่" / "จ.เชียงใหม่" = "เชียงใหม่"
    .replace(/ฯ$/, ''); // "กรุงเทพฯ" = "กรุงเทพ"
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseEntry(entry) {
  const answers = entry.split('|');
  return { display: answers[0], answers: answers.map(normalize) };
}

class Room {
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.players = new Map(); // id -> player
    this.state = 'lobby'; // lobby | playing | reveal
    this.category = null;
    this.round = 0;
    this.feed = [];
    this.chat = [];
    this.chatSeq = 0;
    this.usedWords = new Set();
    this.turnOrder = []; // ลำดับตาเล่น (สุ่มใหม่ทุกรอบ)
    this.turn = 0;
    this.version = 0;
    this.mode = 'guess'; // guess = ทายคำ | undercover = ใครคือสปาย | center = ทายคำตรงกลาง
    this.uc = null;
    this.ct = null;
    this.ch = null; // หัวขโมยชีส
    this.nextMode = 'guess'; // เกมที่หัวห้องเลือกไว้สำหรับรอบหน้า (ทุกคนเห็น)
    // เกมทายคำ: ตาเรา = ถามใช่/ไม่ใช่เพื่อน 1 คน → เพื่อนตอบ → ทายคำของเพื่อนคนนั้น 1 ครั้ง (หรือทายเลยไม่ต้องถาม)
    this.gq = { phase: 'ask', targetId: null, turnNo: 0, qa: {} };
    this.turnLimit = 60; // เวลาต่อตา (วินาที) หัวห้องตั้งได้ 30–120, 0 = ไม่จับเวลา
    this.turnEndsAt = null;
  }

  setTurnLimit(sec) {
    sec = Number(sec);
    if (!TURN_LIMITS.includes(sec)) throw new Error('เวลาต้องอยู่ระหว่าง 30 วินาที ถึง 2 นาที');
    this.turnLimit = sec;
  }

  chatKey() {
    if (this.state === 'playing' && this.mode === 'cheese') return `ch|${this.round}|${this.ch.phase}`;
    if (this.state === 'playing' && this.mode === 'center') return `c|${this.round}|${this.ct.turnNo}`;
    if (this.state === 'playing' && this.mode === 'guess') return `g|${this.round}|${this.gq.turnNo}`;
    return this.turnKey();
  }

  timerKey() {
    if (this.mode === 'cheese') return this.state === 'playing' ? this.chTimerKey() : null; // กลางคืนจับเวลาเสมอ
    return this.turnLimit ? this.turnKey() : null;
  }

  // ระยะเวลาของตา/ช่วงปัจจุบัน (มิลลิวินาที)
  timerMs() {
    if (this.mode === 'cheese') return this.chTimerMs();
    return this.turnLimit * 1000;
  }

  // ตัวระบุ "ตา" ปัจจุบัน — เปลี่ยนเมื่อไหร่ = เริ่มจับเวลาใหม่ + ล้างแชท (null = ไม่ได้อยู่ระหว่างเล่น)
  turnKey() {
    if (this.state !== 'playing') return null;
    if (this.mode === 'cheese') return this.chTimerKey() || `ch|${this.round}|${this.ch.phase}`;
    if (this.mode === 'center') {
      const c = this.ct;
      return `c|${this.round}|${c.turnNo}|${c.phase}|${c.qa.length}|${this.ctCurrent()}`;
    }
    if (this.mode === 'undercover') {
      const u = this.uc;
      if (u.phase === 'vote') return `v|${this.round}|${u.roundNo}`;
      const cur = this.ucCurrent();
      return cur ? `${u.phase}|${this.round}|${u.roundNo}|${u.clueIdx}|${cur}` : null;
    }
    const cur = this.currentTurnId();
    return cur ? `g|${this.round}|${this.gq.turnNo}|${this.gq.phase}|${cur}` : null;
  }

  // หมดเวลา → ข้ามตา (รอบโหวต = นับผลเท่าที่มี)
  timeoutTurn() {
    if (this.state !== 'playing') return false;
    if (this.mode === 'center') return this.ctPass(null, { timeout: true });
    if (this.mode === 'cheese') return this.chTimeout();
    if (this.mode === 'undercover') {
      const u = this.uc;
      if (u.phase === 'vote') {
        this.feed.push({ type: 'timeout', vote: true });
        this.ucResolveVotes();
        return true;
      }
      const cur = this.players.get(this.ucCurrent());
      if (!cur) return false;
      this.feed.push({ type: 'timeout', name: cur.name });
      if (u.phase === 'clue') {
        u.clues.push({ round: u.roundNo, id: cur.id, text: null });
        this.ucNextClue();
      } else if (u.phase === 'white') {
        u.whiteId = null;
        this.ucAfterElimination();
      }
      return true;
    }
    const cur = this.players.get(this.currentTurnId());
    if (!cur) return false;
    this.feed.push({ type: 'timeout', name: cur.name });
    if (this.gq.phase === 'answer') return this.gNoAnswer(), true;
    this.advanceTurn();
    return true;
  }

  // ---------- เกมทายคำ: ถาม-ตอบ ----------
  gAsker() {
    return this.turnOrder.length ? this.turnOrder[this.turn % this.turnOrder.length] : null;
  }

  guessAsk(id, targetId, text) {
    const g = this.gq;
    if (this.mode !== 'guess' || this.state !== 'playing' || g.phase !== 'ask') throw new Error('ตอนนี้ยังถามไม่ได้');
    if (this.gAsker() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    const t = this.players.get(targetId);
    if (!t || t.id === id || !t.word || t.guessedBy) throw new Error('ถามคนนี้ไม่ได้');
    text = String(text || '').trim().slice(0, 100);
    if (!text) throw new Error('พิมพ์คำถามก่อน');
    (g.qa[targetId] = g.qa[targetId] || []).push({ id, q: text, a: null });
    g.phase = 'answer';
    g.targetId = targetId;
  }

  guessAnswer(id, answer) {
    const g = this.gq;
    if (this.mode !== 'guess' || this.state !== 'playing' || g.phase !== 'answer') throw new Error('ตอนนี้ยังไม่มีคำถาม');
    if (g.targetId !== id) throw new Error('คำถามนี้ไม่ได้ถามคุณ');
    if (!ANSWERS[answer] || answer === 'none') throw new Error('คำตอบไม่ถูกต้อง');
    const list = g.qa[id];
    list[list.length - 1].a = answer;
    g.phase = 'guess';
  }

  // คนตอบไม่ตอบ (หมดเวลา/โดนข้าม) → ให้คนถามทายต่อ
  gNoAnswer() {
    const g = this.gq;
    const list = g.qa[g.targetId];
    if (list && list.length) list[list.length - 1].a = 'none';
    g.phase = 'guess';
  }

  // สถานะออนไลน์เปลี่ยน (มีคนหลุด/กลับมา) → รอบโหวตอาจครบแล้ว
  onPresenceChange() {
    if (this.mode === 'undercover') return this.ucCheckVotes();
    if (this.mode === 'cheese') return this.chCheckVotes();
    return false;
  }

  // ---------- เก็บลง/โหลดจากฐานข้อมูล (Redis) ----------
  toJSON() {
    return {
      code: this.code, hostId: this.hostId, state: this.state, category: this.category,
      round: this.round, feed: this.feed, chat: this.chat, chatSeq: this.chatSeq,
      usedWords: [...this.usedWords], turnOrder: this.turnOrder, turn: this.turn, version: this.version,
      players: [...this.players.values()],
    };
  }

  static fromJSON(data) {
    const r = new Room(data.code);
    const { players, usedWords, ...rest } = data;
    Object.assign(r, rest);
    r.players = new Map(players.map((p) => [p.id, p]));
    r.usedWords = new Set(usedWords);
    return r;
  }

  findByKey(key) {
    for (const p of this.players.values()) if (key && p.key === key) return p;
    return null;
  }

  // เจ้าของตาไม่อยู่ (ล็อกจอ/ปิดแอป) → ข้ามให้อัตโนมัติ ถ้ามีคนอื่นที่ออนไลน์และทายได้
  autoSkipIfAway() {
    if (this.state !== 'playing') return false;
    if (this.mode === 'undercover') return this.ucAutoSkip();
    if (this.mode === 'center') return this.ctAutoSkip();
    if (this.mode === 'cheese') return false;
    const cur = this.players.get(this.currentTurnId());
    if (!cur || cur.connected) return false;
    const someoneCan = [...this.players.values()].some((p) => p.connected && this.hasTarget(p.id));
    if (!someoneCan) return false;
    this.feed.push({ type: 'pass', name: cur.name, auto: true });
    this.advanceTurn();
    return true;
  }

  currentTurnId() {
    if (this.mode === 'undercover') return this.ucCurrent();
    if (this.mode === 'center') return this.ctCurrent();
    if (this.mode === 'cheese') return null;
    if (this.state === 'playing' && this.gq.phase === 'answer') return this.gq.targetId; // รอเพื่อนตอบ
    return this.turnOrder.length ? this.turnOrder[this.turn % this.turnOrder.length] : null;
  }

  // ยังมีคำของคนอื่นเหลือให้ทายไหม
  hasTarget(id) {
    return [...this.players.values()].some((t) => t.id !== id && t.word && !t.guessedBy);
  }

  // ไปตาถัดไป — ข้ามคนที่หลุดการเชื่อมต่อ หรือไม่มีคำเหลือให้ทาย
  advanceTurn() {
    this.gq.phase = 'ask';
    this.gq.targetId = null;
    this.gq.turnNo += 1;
    const n = this.turnOrder.length;
    if (!n) return;
    for (let i = 1; i <= n; i++) {
      const idx = (this.turn + i) % n;
      const p = this.players.get(this.turnOrder[idx]);
      if (p && p.connected && this.hasTarget(p.id)) { this.turn = idx; return; }
    }
    this.turn = (this.turn + 1) % n;
  }

  // จบตา: ใครในห้องก็กดได้ (คนถาม/คนตอบเสร็จแล้วกดจบตาเองได้เลย)
  pass(id) {
    if (this.state !== 'playing') return false;
    const me = this.players.get(id);
    if (!me) return false;
    if (this.mode === 'undercover') return this.ucPass(id);
    if (this.mode === 'center') return this.ctPass(id);
    if (this.mode === 'cheese') return false;
    const cur = this.players.get(this.currentTurnId());
    const by = me.id !== this.currentTurnId() ? me.name : undefined;
    this.feed.push({ type: 'pass', name: cur ? cur.name : '?', by });
    if (this.gq.phase === 'answer') return this.gNoAnswer(), true;
    this.advanceTurn();
    return true;
  }

  // ข้อความแชท — ห้ามพิมพ์คำลับของตัวเองระหว่างรอบ (กันหลุดโดยไม่ตั้งใจ)
  addChat(id, text) {
    const p = this.players.get(id);
    if (!p) throw new Error('ไม่ได้อยู่ในห้อง');
    text = String(text || '').trim().slice(0, 200);
    if (!text) throw new Error('ข้อความว่าง');
    const secret = this.mode === 'undercover'
      ? this.uc && this.uc.alive.includes(id) && this.ucWordFor(id)
      : this.mode === 'center'
        ? this.ct && this.ct.masterId === id && this.ct.word
        : !p.guessedBy && p.word;
    if (this.state === 'playing' && this.mode === 'cheese' && this.ch.phase === 'night') {
      throw new Error('🌙 กลางคืนทุกคนหลับอยู่ ห้ามคุย! รอเช้าก่อนนะ 🤫');
    }
    if (this.state === 'playing' && secret) {
      const n = normalize(text);
      // คำสั้นมาก (เช่น "ตา") ไม่ตรวจ เพราะไปตรงกับคำอื่นเยอะเกิน
      if (secret.answers.some((a) => a.length >= 3 && n.includes(a))) {
        throw new Error('🙊 ห้ามพิมพ์คำลับของตัวเองในแชท!');
      }
    }
    return this.pushChat({ name: p.name, text });
  }

  clearChat() {
    this.chat = [];
  }

  systemChat(text) {
    return this.pushChat({ system: true, text });
  }

  pushChat(msg) {
    msg = { id: ++this.chatSeq, ts: Date.now(), ...msg };
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    return msg;
  }

  addPlayer(id, name) {
    const player = { id, name, score: 0, word: null, guessedBy: null, connected: true };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    // เข้าห้องกลางรอบ → แจกคำที่ยังไม่มีใครใช้ให้ทันที (ใครคือสปาย: ดูไปก่อน รอเกมหน้า)
    if (this.state === 'playing' && this.mode === 'center') this.ctAddPlayer(id);
    if (this.state === 'playing' && this.mode === 'guess') {
      this.assignWord(player);
      this.turnOrder.push(id); // ต่อท้ายคิว
    }
    return player;
  }

  findByName(name) {
    const n = normalize(name);
    for (const p of this.players.values()) if (normalize(p.name) === n) return p;
    return null;
  }

  removePlayer(id) {
    if (this.gq.targetId === id && this.gq.phase !== 'ask') {
      this.gq.phase = 'ask';
      this.gq.targetId = null;
    }
    if (this.mode === 'undercover') this.ucRemove(id);
    if (this.mode === 'center') this.ctRemove(id);
    if (this.mode === 'cheese') this.chRemove(id);
    this.players.delete(id);
    const idx = this.turnOrder.indexOf(id);
    if (idx !== -1) {
      const wasCurrent = idx === this.turn % this.turnOrder.length;
      this.turnOrder.splice(idx, 1);
      if (idx < this.turn) this.turn -= 1;
      if (this.turn >= this.turnOrder.length) this.turn = 0;
      // ถ้าคนที่ออกเป็นเจ้าของตา ตาจะตกไปที่คนถัดไปในคิวอยู่แล้ว (index เดิม)
      if (wasCurrent && this.turnOrder.length) {
        const p = this.players.get(this.currentTurnId());
        if (p && !p.connected) this.advanceTurn();
      }
    }
    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => p.connected) || [...this.players.values()][0];
      this.hostId = next ? next.id : null;
    }
    this.checkRoundEnd();
  }

  pool() {
    return WORDS[this.category].map(parseEntry);
  }

  assignWord(player) {
    const taken = new Set([...this.players.values()].filter((p) => p.word).map((p) => p.word.display));
    const free = this.pool().filter((w) => !taken.has(w.display));
    // เลี่ยงคำที่เคยออกในรอบก่อน ๆ ถ้ายังพอ
    const fresh = free.filter((w) => !this.usedWords.has(w.display));
    const choice = shuffle(fresh.length ? fresh : free)[0];
    if (!choice) throw new Error('คำในหมวดนี้ไม่พอสำหรับจำนวนผู้เล่น');
    player.word = choice;
    player.guessedBy = null;
    this.usedWords.add(choice.display);
  }

  start(category) {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    const eligible = CATEGORIES.filter((c) => WORDS[c].length >= players.length);
    if (category && category !== 'random') {
      if (!eligible.includes(category)) throw new Error('หมวดนี้ใช้ไม่ได้');
      this.category = category;
    } else {
      this.category = shuffle(eligible)[0];
    }
    this.mode = 'guess';
    this.uc = null;
    this.ct = null;
    this.ch = null;
    this.round += 1;
    this.state = 'playing';
    this.feed = [];
    for (const p of players) p.word = null;
    for (const p of shuffle(players)) this.assignWord(p);
    this.turnOrder = shuffle(players.map((p) => p.id));
    this.turn = 0;
    this.gq = { phase: 'ask', targetId: null, turnNo: 1, qa: {} };
  }

  // ทายคำของผู้เล่นคนอื่น (ทายคำตัวเองไม่ได้)
  guess(id, targetId, text) {
    const me = this.players.get(id);
    const target = this.players.get(targetId);
    if (!me || !target || this.state !== 'playing') return null;
    if (target.id === me.id || !target.word || target.guessedBy) return null;
    if (this.gAsker() !== id || this.gq.phase === 'answer') return null; // ยังไม่ถึงตา / รอคำตอบอยู่
    if (this.gq.phase === 'guess' && targetId !== this.gq.targetId) return null; // ถามใครต้องทายคนนั้น
    const guess = String(text || '').trim().slice(0, 40);
    if (!guess) return null;
    const correct = target.word.answers.includes(normalize(guess));
    if (correct) {
      target.guessedBy = me.name;
      me.score += 2;
      this.feed.push({ type: 'correct', name: me.name, target: target.name, text: target.word.display, pts: 2 });
    } else {
      this.feed.push({ type: 'wrong', name: me.name, target: target.name, text: guess });
    }
    this.feed = this.feed.slice(-50);
    this.checkRoundEnd();
    if (this.state === 'playing') this.advanceTurn();
    return correct;
  }

  checkRoundEnd() {
    if (this.state !== 'playing' || this.mode !== 'guess') return;
    const active = [...this.players.values()].filter((p) => p.word);
    if (active.length && active.every((p) => p.guessedBy)) this.finish();
  }

  endRound() {
    if (this.state !== 'playing') return;
    if (this.mode === 'cheese') {
      // หัวห้องจบเกมกลางคัน → เฉลย ไม่มีใครได้แต้ม
      this.ch.phase = 'over';
      this.ch.pending = {};
      this.state = 'reveal';
      this.feed.push({ type: 'ch-over', winner: null });
      return;
    }
    if (this.mode === 'center') {
      this.ct.phase = 'over';
      this.ct.reason = 'ended';
      this.state = 'reveal';
      this.feed.push({ type: 'ct-over', reason: 'ended', word: this.ct.word.display });
      return;
    }
    if (this.mode === 'undercover') {
      // หัวห้องจบเกมกลางคัน → เฉลย ไม่มีใครได้แต้ม
      this.uc.phase = 'over';
      this.state = 'reveal';
      this.feed.push({ type: 'uc-win', winner: null });
      return;
    }
    this.finish();
  }

  // จบรอบ: คนที่รอดไม่โดนทาย ได้โบนัส +3
  finish() {
    this.state = 'reveal';
    for (const p of this.players.values()) {
      if (p.word && !p.guessedBy) {
        p.score += 3;
        this.feed.push({ type: 'survive', name: p.name, text: p.word.display, pts: 3 });
      }
    }
  }

  // มุมมองของผู้เล่นแต่ละคน: เห็นคำตัวเอง แต่ไม่เห็นคำของคนอื่น (จนกว่าจะโดนทายถูก/จบรอบ)
  viewFor(id) {
    const reveal = this.state === 'reveal';
    const uc = this.mode === 'undercover' && this.uc;
    return {
      code: this.code,
      mode: this.mode,
      nextMode: this.nextMode,
      uc: uc ? this.ucView(id) : null,
      ct: this.mode === 'center' && this.ct ? this.ctView(id) : null,
      ch: this.mode === 'cheese' && this.ch ? this.chView(id) : null,
      turnTotalMs: this.turnTotalMs || null,
      gq: this.mode === 'guess' ? { turnNo: this.gq.turnNo, phase: this.gq.phase, targetId: this.gq.targetId, asker: this.gAsker(), qa: this.gq.qa, answers: ANSWERS } : null,
      state: this.state,
      category: this.category,
      round: this.round,
      hostId: this.hostId,
      me: id,
      categories: CATEGORIES,
      feed: this.feed,
      turnOrder: uc ? this.uc.queue : this.mode === 'center' && this.ct ? this.ct.order : this.turnOrder,
      turnLimit: this.turnLimit,
      turnRemainingMs: this.turnEndsAt ? Math.max(0, this.turnEndsAt - Date.now()) : null,
      currentTurn: this.state === 'playing' ? this.currentTurnId() : null,
      players: [...this.players.values()].map((p) => {
        const visible = this.mode === 'guess' && (p.id === id || p.guessedBy || reveal);
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          connected: p.connected,
          guessedBy: p.guessedBy,
          hasWord: !!p.word,
          word: p.word && visible ? p.word.display : null,
        };
      }),
    };
  }
}

require('./undercover').install(Room, { shuffle, normalize, parseEntry });
require('./center').install(Room, { shuffle, normalize, parseEntry, WORDS, CATEGORIES });
require('./cheese').install(Room, { shuffle });

module.exports = { Room, CATEGORIES, TURN_LIMITS, normalize };

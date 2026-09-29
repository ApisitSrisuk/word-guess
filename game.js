// ตรรกะเกม (ไม่ผูกกับ socket) — ทดสอบได้ด้วย test.js
const WORDS = require('./words');

const CATEGORIES = Object.keys(WORDS);

function normalize(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/^จังหวัด/, '');
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
    const cur = this.players.get(this.currentTurnId());
    if (!cur || cur.connected) return false;
    const someoneCan = [...this.players.values()].some((p) => p.connected && this.hasTarget(p.id));
    if (!someoneCan) return false;
    this.feed.push({ type: 'pass', name: cur.name, auto: true });
    this.advanceTurn();
    return true;
  }

  currentTurnId() {
    return this.turnOrder.length ? this.turnOrder[this.turn % this.turnOrder.length] : null;
  }

  // ยังมีคำของคนอื่นเหลือให้ทายไหม
  hasTarget(id) {
    return [...this.players.values()].some((t) => t.id !== id && t.word && !t.guessedBy);
  }

  // ไปตาถัดไป — ข้ามคนที่หลุดการเชื่อมต่อ หรือไม่มีคำเหลือให้ทาย
  advanceTurn() {
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
    const cur = this.players.get(this.currentTurnId());
    const by = me.id !== this.currentTurnId() ? me.name : undefined;
    this.feed.push({ type: 'pass', name: cur ? cur.name : '?', by });
    this.advanceTurn();
    return true;
  }

  // ข้อความแชท — ห้ามพิมพ์คำลับของตัวเองระหว่างรอบ (กันหลุดโดยไม่ตั้งใจ)
  addChat(id, text) {
    const p = this.players.get(id);
    if (!p) throw new Error('ไม่ได้อยู่ในห้อง');
    text = String(text || '').trim().slice(0, 200);
    if (!text) throw new Error('ข้อความว่าง');
    if (this.state === 'playing' && p.word && !p.guessedBy) {
      const n = normalize(text);
      // คำสั้นมาก (เช่น "ตา") ไม่ตรวจ เพราะไปตรงกับคำอื่นเยอะเกิน
      if (p.word.answers.some((a) => a.length >= 3 && n.includes(a))) {
        throw new Error('🙊 ห้ามพิมพ์คำลับของตัวเองในแชท!');
      }
    }
    return this.pushChat({ name: p.name, text });
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
    // เข้าห้องกลางรอบ → แจกคำที่ยังไม่มีใครใช้ให้ทันที
    if (this.state === 'playing') {
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
    this.round += 1;
    this.state = 'playing';
    this.feed = [];
    for (const p of players) p.word = null;
    for (const p of shuffle(players)) this.assignWord(p);
    this.turnOrder = shuffle(players.map((p) => p.id));
    this.turn = 0;
  }

  // ทายคำของผู้เล่นคนอื่น (ทายคำตัวเองไม่ได้)
  guess(id, targetId, text) {
    const me = this.players.get(id);
    const target = this.players.get(targetId);
    if (!me || !target || this.state !== 'playing') return null;
    if (target.id === me.id || !target.word || target.guessedBy) return null;
    if (this.currentTurnId() !== id) return null; // ยังไม่ถึงตา
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
    if (this.state !== 'playing') return;
    const active = [...this.players.values()].filter((p) => p.word);
    if (active.length && active.every((p) => p.guessedBy)) this.finish();
  }

  endRound() {
    if (this.state === 'playing') this.finish();
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
    return {
      code: this.code,
      state: this.state,
      category: this.category,
      round: this.round,
      hostId: this.hostId,
      me: id,
      categories: CATEGORIES,
      feed: this.feed,
      turnOrder: this.turnOrder,
      currentTurn: this.state === 'playing' ? this.currentTurnId() : null,
      players: [...this.players.values()].map((p) => {
        const visible = p.id === id || p.guessedBy || reveal;
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

module.exports = { Room, CATEGORIES, normalize };

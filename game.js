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
    this.usedWords = new Set();
  }

  addPlayer(id, name) {
    const player = { id, name, score: 0, word: null, guessedBy: null, connected: true };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    // เข้าห้องกลางรอบ → แจกคำที่ยังไม่มีใครใช้ให้ทันที
    if (this.state === 'playing') this.assignWord(player);
    return player;
  }

  findByName(name) {
    const n = normalize(name);
    for (const p of this.players.values()) if (normalize(p.name) === n) return p;
    return null;
  }

  // ให้ผู้เล่นที่หลุดกลับเข้ามาใช้ id ใหม่ แต่คงคะแนน/คำเดิม
  rebind(oldId, newId) {
    const p = this.players.get(oldId);
    this.players.delete(oldId);
    p.id = newId;
    p.connected = true;
    this.players.set(newId, p);
    if (this.hostId === oldId) this.hostId = newId;
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
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
  }

  // ทายคำของผู้เล่นคนอื่น (ทายคำตัวเองไม่ได้)
  guess(id, targetId, text) {
    const me = this.players.get(id);
    const target = this.players.get(targetId);
    if (!me || !target || this.state !== 'playing') return null;
    if (target.id === me.id || !target.word || target.guessedBy) return null;
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

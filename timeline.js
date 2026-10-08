// เกม "Timeline (เรียงเหตุการณ์)" — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - กลางโต๊ะมีไทม์ไลน์ร่วม (เปิดปีไว้ 1 ใบตอนเริ่ม) — แต่ละคนมีการ์ดในมือ (เห็นเหตุการณ์ ไม่เห็นปี)
// - ตาเรา: เลือกการ์ด 1 ใบ วางลงช่องในไทม์ไลน์ → เปิดปี
//     ถูก (ปีอยู่ระหว่างใบซ้าย-ขวา, ปีเท่ากันนับว่าถูก) = อยู่ในไทม์ไลน์ +1
//     ผิด = ทิ้งการ์ด แล้วจั่วใบใหม่
// - มีคนมือหมด → เล่นให้ครบรอบนั้น (ทุกคนได้ตาเท่ากัน) แล้วคนมือหมดชนะ +3
const EVENTS = require('./timeline-data');
const SHOW_MS = Number(process.env.TL_SHOW_MS) || 3500; // โชว์ผลการวางก่อนเปลี่ยนตา
const PTS = { correct: 1, win: 3 };

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.startTimeline = function () {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const handSize = players.length >= 6 ? 3 : 4;
    const deck = shuffle(EVENTS.map(([text, year], i) => ({ id: i, text, year })));
    const order = shuffle(players.map((p) => p.id));
    const hands = {};
    for (const id of order) hands[id] = deck.splice(0, handSize);
    this.mode = 'timeline';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'Timeline';
    this.tl = {
      order,
      idx: 0,
      seq: 1,
      turnNo: 1, // นับตา (ใช้ล้างแชทเมื่อเปลี่ยนคนเล่น)
      phase: 'place', // place → show → place … / over
      line: [deck.shift()], // ไทม์ไลน์กลาง เรียงตามปี
      hands,
      deck,
      last: null, // ผลการวางล่าสุด
      finalRound: false,
      winners: [],
    };
  };

  P.tlCurrent = function () {
    const t = this.tl;
    if (!t || this.state !== 'playing' || t.phase !== 'place') return null;
    return t.order[t.idx];
  };

  // วางการ์ด: cardId จากมือ, slot = ตำแหน่งช่อง 0..line.length (0 = ก่อนใบแรก)
  P.tlPlace = function (id, cardId, slot) {
    const t = this.tl;
    if (this.mode !== 'timeline' || this.state !== 'playing' || t.phase !== 'place') throw new Error('ตอนนี้ยังวางไม่ได้');
    if (this.tlCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    const hand = t.hands[id];
    const ci = hand.findIndex((c) => c.id === Number(cardId));
    if (ci === -1) throw new Error('ไม่มีการ์ดใบนี้ในมือ');
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > t.line.length) throw new Error('ช่องไม่ถูกต้อง');
    const card = hand.splice(ci, 1)[0];
    const before = t.line[slot - 1];
    const after = t.line[slot];
    const correct = (!before || before.year <= card.year) && (!after || card.year <= after.year);
    const p = this.players.get(id);
    if (correct) {
      t.line.splice(slot, 0, card);
      if (p) p.score += PTS.correct;
    } else if (t.deck.length) {
      hand.push(t.deck.shift()); // ผิด → จั่วใหม่
    }
    t.last = { by: id, card, slot, correct };
    this.feed.push({ type: 'tl-place', name: p ? p.name : '?', text: card.text, year: card.year, correct });
    if (!hand.length) t.finalRound = true;
    t.phase = 'show';
    t.seq += 1;
    return { correct, year: card.year };
  };

  // หลังโชว์ผล → ตาถัดไป (ครบรอบแล้วมีคนมือหมด = จบเกม)
  P.tlNext = function () {
    const t = this.tl;
    const n = t.order.length;
    let next = t.idx;
    for (let i = 1; i <= n; i++) {
      const cand = (t.idx + i) % n;
      if (this.players.has(t.order[cand])) { next = cand; break; }
    }
    // วนกลับมาคนแรกของลำดับ = จบรอบ
    if (t.finalRound && next <= t.idx) return this.tlFinish();
    t.idx = next;
    t.turnNo += 1;
    t.phase = 'place';
    t.last = null;
    t.seq += 1;
  };

  P.tlFinish = function () {
    const t = this.tl;
    const alive = t.order.filter((id) => this.players.has(id));
    const min = Math.min(...alive.map((id) => t.hands[id].length));
    t.winners = alive.filter((id) => t.hands[id].length === min);
    for (const id of t.winners) {
      const p = this.players.get(id);
      if (p) p.score += PTS.win;
    }
    t.phase = 'over';
    this.state = 'reveal';
    this.feed.push({ type: 'tl-over', winners: t.winners.map((id) => nameOf(this, id)) });
  };

  // หมดเวลา: ช่วงวาง → ข้ามตา (ไม่เสียการ์ด) / ช่วงโชว์ผล → ตาถัดไป
  P.tlTimeout = function () {
    const t = this.tl;
    if (t.phase === 'show') return this.tlNext(), true;
    if (t.phase === 'place') {
      this.feed.push({ type: 'timeout', name: nameOf(this, this.tlCurrent()) });
      t.phase = 'show';
      t.last = null;
      t.seq += 1;
      this.tlNext();
      return true;
    }
    return false;
  };

  P.tlTimerKey = function () {
    const t = this.tl;
    if (t.phase === 'show') return `tl|${this.round}|${t.seq}|show`;
    if (t.phase === 'place') return this.turnLimit ? `tl|${this.round}|${t.seq}|place` : null;
    return null;
  };
  P.tlTimerMs = function () {
    return this.tl.phase === 'show' ? SHOW_MS : this.turnLimit * 1000;
  };

  P.tlAutoSkip = function () {
    const cur = this.players.get(this.tlCurrent());
    if (!cur || cur.connected) return false;
    return this.tlTimeout();
  };

  P.tlAddPlayer = function (id) {
    const t = this.tl;
    if (!t || this.state !== 'playing') return;
    // เข้ากลางเกม → ได้การ์ดเท่ากับคนที่มีน้อยสุด (อย่างน้อย 1) แล้วต่อท้ายคิว
    const min = Math.max(1, Math.min(...t.order.filter((x) => this.players.has(x)).map((x) => t.hands[x].length)));
    t.hands[id] = t.deck.splice(0, min);
    t.order.push(id);
  };

  P.tlRemove = function (id) {
    const t = this.tl;
    if (!t || this.state !== 'playing' || !t.order.includes(id)) return;
    const wasCurrent = this.tlCurrent() === id;
    const others = t.order.filter((x) => x !== id && this.players.has(x));
    if (others.length < 1) return this.tlFinish();
    if (wasCurrent) {
      t.phase = 'show';
      t.last = null;
      this.players.delete(id); // ให้ tlNext ข้ามคนนี้
      this.tlNext();
    }
  };

  P.tlView = function (id) {
    const t = this.tl;
    const over = t.phase === 'over';
    return {
      phase: t.phase,
      seq: t.seq,
      order: t.order,
      line: t.line,
      myHand: (t.hands[id] || []).map((c) => ({ id: c.id, text: c.text, year: over ? c.year : null })),
      inGame: id in t.hands,
      handCounts: Object.fromEntries(t.order.map((x) => [x, (t.hands[x] || []).length])),
      hands: over ? t.hands : null,
      last: t.last,
      deckLeft: t.deck.length,
      finalRound: t.finalRound,
      winners: t.winners,
    };
  };
}

module.exports = { install, SHOW_MS };

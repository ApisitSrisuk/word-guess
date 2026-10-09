// เกม "อีแก่กินน้ำ" (Old Maid) ไพ่ธีมแมว — เพิ่มความสามารถให้ Room
// กติกาตาม th.wikibooks.org/wiki/อีแก่กินน้ำ:
// - ไพ่ 1 สำรับ + ไพ่ "อีแก่" 1 ใบ (ไม่มีคู่) · แจกจนหมดกอง · จับคู่เลขเดียวกันทิ้ง
// - ผลัดกันดึงไพ่ 1 ใบจากมือคนถัดไป (ไม่เห็นหน้าไพ่) ได้คู่ก็ทิ้ง · คนที่ถูกดึงได้ดึงจากคนถัดไปต่อ
// - เหลือ 2 คนและมีคนเหลือไพ่ 1 ใบ → คนที่มี 1 ใบเป็นฝ่ายดึง
// - คนสุดท้ายที่ถืออีแก่ = แพ้ (โดนลงโทษตามที่ตกลงกัน)
const SHOW_MS = Number(process.env.OM_SHOW_MS) || 2500; // โชว์ผลการดึงก่อนเปลี่ยนตา
const PTS = { first: 3, safe: 1 };

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  // ทิ้งคู่ในมือ (เลขเดียวกัน 2 ใบ = 1 คู่) — คืนรายการเลขที่ทิ้ง
  const discardPairs = (hand) => {
    const byRank = {};
    for (const c of hand) if (!c.joker) (byRank[c.r] = byRank[c.r] || []).push(c);
    const drop = new Set();
    const ranks = [];
    for (const [r, cs] of Object.entries(byRank)) {
      for (let i = 0; i + 1 < cs.length; i += 2) {
        drop.add(cs[i].id);
        drop.add(cs[i + 1].id);
        ranks.push(Number(r));
      }
    }
    return { hand: hand.filter((c) => !drop.has(c.id)), ranks };
  };

  P.startOldMaid = function () {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    if (players.length > 10) throw new Error('เล่นได้ไม่เกิน 10 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    let id = 0;
    const deck = shuffle([
      ...[0, 1, 2, 3].flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ id: ++id, r: i + 2, s }))),
      { id: ++id, r: 0, s: -1, joker: true },
    ]);
    const order = shuffle(players.map((p) => p.id));
    const hands = Object.fromEntries(order.map((x) => [x, []]));
    deck.forEach((c, i) => hands[order[i % order.length]].push(c));
    const pairs = {};
    for (const x of order) {
      const r = discardPairs(hands[x]);
      hands[x] = shuffle(r.hand);
      pairs[x] = r.ranks.length;
    }
    this.mode = 'oldmaid';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh', 'pk']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'อีแก่กินน้ำ';
    this.om = { order, hands, pairs, out: [], turnIdx: 0, seq: 1, phase: 'draw', last: null, loser: null };
    for (const x of order) if (!hands[x].length) this.om.out.push(x);
    // คนแรกที่ได้ไพ่ (และยังมีไพ่) เริ่ม
    this.om.turnIdx = order.findIndex((x) => hands[x].length);
    this.omCheckEnd() || this.omFixTwo();
  };

  P.omLive = function () {
    const m = this.om;
    return m.order.filter((x) => m.hands[x] && m.hands[x].length && this.players.has(x));
  };
  P.omNextWithCards = function (fromIdx) {
    const m = this.om;
    const n = m.order.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIdx + i) % n;
      const x = m.order[idx];
      if (m.hands[x] && m.hands[x].length && this.players.has(x)) return idx;
    }
    return -1;
  };
  P.omCurrent = function () {
    const m = this.om;
    if (!m || this.state !== 'playing' || m.phase !== 'draw') return null;
    return m.order[m.turnIdx];
  };
  P.omTarget = function () {
    const m = this.om;
    const idx = this.omNextWithCards(m.turnIdx);
    return idx === -1 || m.order[idx] === m.order[m.turnIdx] ? null : m.order[idx];
  };

  // เหลือ 2 คนและมีคนถือไพ่ 1 ใบ → คนนั้นเป็นฝ่ายดึง
  P.omFixTwo = function () {
    const m = this.om;
    const live = this.omLive();
    if (live.length !== 2) return;
    const one = live.find((x) => m.hands[x].length === 1);
    if (one && live.some((x) => m.hands[x].length > 1)) m.turnIdx = m.order.indexOf(one);
  };

  // เหลือคนถือไพ่คนเดียว (ซึ่งถืออีแก่) = จบเกม
  P.omCheckEnd = function () {
    const m = this.om;
    for (const x of m.order) if (m.hands[x] && !m.hands[x].length && !m.out.includes(x) && this.players.has(x)) m.out.push(x);
    const live = this.omLive();
    if (live.length > 1) return false;
    m.loser = live[0] || null;
    m.phase = 'over';
    this.state = 'reveal';
    m.out.forEach((x, i) => {
      const p = this.players.get(x);
      if (p) p.score += i === 0 ? PTS.first : PTS.safe;
    });
    this.feed.push({ type: 'om-over', loser: m.loser ? nameOf(this, m.loser) : null });
    return true;
  };

  // ดึงไพ่จากมือคนถัดไป (ตำแหน่งที่ index ในมือเขา)
  P.omDraw = function (id, index) {
    const m = this.om;
    if (this.mode !== 'oldmaid' || this.state !== 'playing' || m.phase !== 'draw') throw new Error('ตอนนี้ยังดึงไพ่ไม่ได้');
    if (this.omCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    const from = this.omTarget();
    if (!from) throw new Error('ไม่มีใครให้ดึง');
    const src = m.hands[from];
    index = Math.floor(Number(index));
    if (!(index >= 0 && index < src.length)) throw new Error('เลือกไพ่ไม่ถูกต้อง');
    const card = src.splice(index, 1)[0];
    m.hands[id].push(card);
    const r = discardPairs(m.hands[id]);
    m.hands[id] = r.hand;
    m.pairs[id] += r.ranks.length;
    m.last = { by: id, from, card, pairRank: r.ranks[0] ?? null, joker: !!card.joker };
    this.feed.push({ type: 'om-draw', name: nameOf(this, id), from: nameOf(this, from), pairRank: m.last.pairRank });
    m.phase = 'show';
    m.seq += 1;
    return m.last;
  };

  // หลังโชว์ผล → คนที่ถูกดึงได้ดึงต่อ (ถ้าเขาไพ่หมด ก็คนถัดไปที่ยังมีไพ่)
  P.omAfterShow = function () {
    const m = this.om;
    const fromIdx = m.last ? m.order.indexOf(m.last.from) : m.turnIdx;
    m.last = null;
    if (this.omCheckEnd()) return;
    const fromId = m.order[fromIdx];
    m.turnIdx = m.hands[fromId] && m.hands[fromId].length && this.players.has(fromId) ? fromIdx : this.omNextWithCards(fromIdx);
    m.phase = 'draw';
    m.seq += 1;
    this.omFixTwo();
  };

  // สับไพ่ในมือตัวเอง (ให้คนดึงเดาไม่ถูกว่าอีแก่อยู่ไหน)
  P.omShuffle = function (id) {
    const m = this.om;
    if (this.mode !== 'oldmaid' || !m.hands[id]) throw new Error('สับไพ่ไม่ได้');
    m.hands[id] = shuffle(m.hands[id]);
    m.shuffles = (m.shuffles || 0) + 1;
  };

  P.omTimeout = function () {
    const m = this.om;
    if (m.phase === 'show') return this.omAfterShow(), true;
    if (m.phase === 'draw') {
      const cur = this.omCurrent();
      const from = this.omTarget();
      if (!cur || !from) return false;
      this.omDraw(cur, Math.floor(Math.random() * m.hands[from].length));
      return true;
    }
    return false;
  };
  P.omTimerKey = function () {
    const m = this.om;
    if (m.phase === 'show') return `om|${this.round}|${m.seq}|show`;
    if (m.phase === 'draw') return this.turnLimit ? `om|${this.round}|${m.seq}|draw` : null;
    return null;
  };
  P.omTimerMs = function () {
    return this.om.phase === 'show' ? SHOW_MS : this.turnLimit * 1000;
  };
  P.omAutoSkip = function () {
    const cur = this.players.get(this.omCurrent());
    if (!cur || cur.connected) return false;
    return this.omTimeout();
  };

  // ออกกลางเกม → ไพ่ในมือส่งต่อให้คนถัดไป (แล้วทิ้งคู่) เกมเดินต่อ
  P.omRemove = function (id) {
    const m = this.om;
    if (!m || this.state !== 'playing' || !m.hands[id]) return;
    const cards = m.hands[id];
    m.hands[id] = [];
    const myIdx = m.order.indexOf(id);
    const wasCurrent = this.omCurrent() === id;
    this.players.delete(id);
    const nextIdx = this.omNextWithCards(myIdx);
    if (nextIdx !== -1 && cards.length) {
      const to = m.order[nextIdx];
      const r = discardPairs([...m.hands[to], ...cards]);
      m.hands[to] = shuffle(r.hand);
      m.pairs[to] += r.ranks.length;
    }
    if (this.omCheckEnd()) return;
    if (wasCurrent || m.phase === 'show') {
      m.last = null;
      m.turnIdx = nextIdx === -1 ? m.turnIdx : nextIdx;
      m.phase = 'draw';
      m.seq += 1;
      this.omFixTwo();
    }
  };

  P.omView = function (id) {
    const m = this.om;
    const over = m.phase === 'over';
    const L = m.last;
    // ไพ่ที่ดึงได้: คนดึงกับคนถูกดึงรู้ว่าเป็นใบไหน / คนอื่นรู้แค่ว่าได้คู่หรือไม่
    const last = L ? {
      by: L.by, from: L.from, pairRank: L.pairRank,
      card: L.by === id || L.from === id ? L.card : null,
    } : null;
    return {
      phase: m.phase,
      seq: m.seq,
      order: m.order,
      inGame: !!m.hands[id] && m.order.includes(id),
      myHand: m.hands[id] || [],
      counts: Object.fromEntries(m.order.map((x) => [x, (m.hands[x] || []).length])),
      pairs: m.pairs,
      out: m.out,
      current: this.omCurrent() || (m.phase === 'show' && L ? L.by : null),
      target: m.phase === 'draw' ? this.omTarget() : null,
      last,
      loser: m.loser,
      loserHand: over && m.loser ? m.hands[m.loser] : null,
    };
  };
}

module.exports = { install };

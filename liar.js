// เกม "เต๋าโกหก" (Liar's Dice) — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - ทุกคนมีเต๋า 5 ลูก ทอยลับทุกรอบ
// - ผลัดกันประกาศ "ทั้งโต๊ะมีเลข F อย่างน้อย Q ลูก" — ต้องสูงกว่าเดิม (Q มากขึ้น หรือ Q เท่าเดิมแต่ F สูงขึ้น)
//   เลข 1 เป็นไวลด์ (นับเป็นทุกเลข) และประกาศเลข 1 ไม่ได้
// - หรือกด "โกหก!" → เปิดเต๋าทุกคน: มีจริง ≥ Q → คนกดเสียเต๋า 1 / ไม่ถึง → คนประกาศเสียเต๋า 1
// - เต๋าหมด = ตกรอบ · คนสุดท้ายชนะ (+5) · อันดับ 2 (+2)
const START_DICE = 5;
const REVEAL_MS = Number(process.env.LIAR_REVEAL_MS) || 7000;
const PTS = { first: 5, second: 2 };

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const roll = (n) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.startLiar = function () {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    this.mode = 'liar';
    this.uc = null;
    this.ct = null;
    this.ch = null;
    this.dr = null;
    this.cn = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'เต๋าโกหก';
    const order = shuffle(players.map((p) => p.id));
    this.lie = {
      order,
      counts: Object.fromEntries(order.map((id) => [id, START_DICE])),
      dice: {},
      turnIdx: 0,
      roundNo: 0,
      seq: 0, // นับทุกครั้งที่มีการประกาศ/เปลี่ยนตา (ใช้จับเวลา/ล้างแชท)
      phase: 'bid', // bid → reveal → bid … / over
      bid: null, // { q, f, by }
      bids: [], // ประวัติการประกาศในรอบนี้
      result: null,
      out: [], // ลำดับคนตกรอบ (คนแรก = ตกก่อน)
      winner: null,
    };
    this.lieNewRound(order[0]);
  };

  P.lieAlive = function () {
    return this.lie.order.filter((id) => this.lie.counts[id] > 0 && this.players.has(id));
  };
  P.lieTotal = function () {
    return this.lieAlive().reduce((n, id) => n + this.lie.counts[id], 0);
  };

  P.lieNewRound = function (starterId) {
    const L = this.lie;
    L.roundNo += 1;
    L.seq += 1;
    L.phase = 'bid';
    L.bid = null;
    L.bids = [];
    L.result = null;
    L.dice = {};
    for (const id of this.lieAlive()) L.dice[id] = roll(L.counts[id]);
    const alive = this.lieAlive();
    const start = alive.includes(starterId) ? starterId : alive[0];
    L.turnIdx = L.order.indexOf(start);
  };

  P.lieCurrent = function () {
    const L = this.lie;
    if (!L || this.state !== 'playing' || L.phase !== 'bid') return null;
    return L.order[L.turnIdx];
  };

  P.lieNextTurn = function () {
    const L = this.lie;
    const n = L.order.length;
    for (let i = 1; i <= n; i++) {
      const idx = (L.turnIdx + i) % n;
      const id = L.order[idx];
      if (L.counts[id] > 0 && this.players.has(id)) { L.turnIdx = idx; break; }
    }
    L.seq += 1;
  };

  // ประกาศขั้นต่ำที่ถูกกติกา (ใช้ตอนหมดเวลาและเป็นค่าเริ่มต้นบนจอ)
  P.lieMinBid = function () {
    const b = this.lie.bid;
    if (!b) return { q: 1, f: 2 };
    if (b.f < 6) return { q: b.q, f: b.f + 1 };
    return { q: b.q + 1, f: 2 };
  };

  P.lieBid = function (id, q, f) {
    const L = this.lie;
    if (this.mode !== 'liar' || this.state !== 'playing' || L.phase !== 'bid') throw new Error('ตอนนี้ยังประกาศไม่ได้');
    if (this.lieCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    q = Number(q);
    f = Number(f);
    if (!Number.isInteger(f) || f < 2 || f > 6) throw new Error('ประกาศได้แค่เลข 2–6 (เลข 1 เป็นไวลด์)');
    if (!Number.isInteger(q) || q < 1) throw new Error('จำนวนต้องมากกว่า 0');
    if (q > this.lieTotal()) throw new Error(`บนโต๊ะมีเต๋าแค่ ${this.lieTotal()} ลูก`);
    const b = L.bid;
    if (b && !(q > b.q || (q === b.q && f > b.f))) throw new Error(`ต้องสูงกว่า ${b.q} × ${b.f} (จำนวนมากขึ้น หรือจำนวนเท่าเดิมแต่เลขสูงขึ้น)`);
    L.bid = { q, f, by: id };
    L.bids.push({ q, f, by: id });
    this.lieNextTurn();
  };

  P.lieChallenge = function (id, { auto = false } = {}) {
    const L = this.lie;
    if (this.mode !== 'liar' || this.state !== 'playing' || L.phase !== 'bid') throw new Error('ตอนนี้ยังกดโกหกไม่ได้');
    if (this.lieCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    if (!L.bid) throw new Error('ยังไม่มีใครประกาศ');
    const { q, f, by } = L.bid;
    // นับเลข f + เลข 1 (ไวลด์) จากเต๋าทุกคน
    let actual = 0;
    for (const arr of Object.values(L.dice)) for (const d of arr) if (d === f || d === 1) actual += 1;
    const bidTrue = actual >= q;
    const loser = bidTrue ? id : by;
    L.counts[loser] = Math.max(0, L.counts[loser] - 1);
    if (L.counts[loser] === 0) L.out.push(loser);
    L.result = { challenger: id, bidder: by, q, f, actual, bidTrue, loser, auto, eliminated: L.counts[loser] === 0 };
    this.feed.push({ type: 'lie-call', challenger: nameOf(this, id), bidder: nameOf(this, by), q, f, actual, loser: nameOf(this, loser), auto, eliminated: L.counts[loser] === 0 });
    L.phase = 'reveal';
    L.seq += 1;
  };

  // หลังเปิดเต๋า → รอบใหม่ (คนเสียเต๋าเริ่ม) หรือจบเกม
  P.lieAfterReveal = function () {
    const L = this.lie;
    const alive = this.lieAlive();
    if (alive.length <= 1) return this.lieFinish(alive[0] || null);
    const loser = L.result && L.result.loser;
    // คนเสียเต๋าเริ่มรอบใหม่ (ถ้าตกรอบแล้ว ให้คนถัดไป)
    let starter = loser;
    if (!alive.includes(starter)) {
      const i = L.order.indexOf(loser);
      for (let k = 1; k <= L.order.length; k++) {
        const id = L.order[(i + k) % L.order.length];
        if (alive.includes(id)) { starter = id; break; }
      }
    }
    this.lieNewRound(starter);
  };

  P.lieFinish = function (winnerId) {
    const L = this.lie;
    L.phase = 'over';
    L.winner = winnerId;
    this.state = 'reveal';
    const second = L.out[L.out.length - 1];
    const w = this.players.get(winnerId);
    if (w) w.score += PTS.first;
    const s2 = second && this.players.get(second);
    if (s2 && second !== winnerId) s2.score += PTS.second;
    this.feed.push({ type: 'lie-over', winner: winnerId ? nameOf(this, winnerId) : null, second: second ? nameOf(this, second) : null });
  };

  // หมดเวลา: มีคนประกาศแล้ว → กดโกหกให้ / ยังไม่มี → ประกาศขั้นต่ำให้ / ช่วงเปิดเต๋า → รอบถัดไป
  P.lieTimeout = function () {
    const L = this.lie;
    if (L.phase === 'reveal') return this.lieAfterReveal(), true;
    if (L.phase !== 'bid') return false;
    const cur = this.lieCurrent();
    if (L.bid) {
      this.lieChallenge(cur, { auto: true });
    } else {
      const m = this.lieMinBid();
      this.lieBid(cur, m.q, m.f);
      this.feed.push({ type: 'timeout', name: nameOf(this, cur) });
    }
    return true;
  };

  P.lieTimerKey = function () {
    const L = this.lie;
    if (L.phase === 'reveal') return `lie|${this.round}|${L.seq}|reveal`;
    if (L.phase === 'bid') return this.turnLimit ? `lie|${this.round}|${L.seq}|bid` : null;
    return null;
  };
  P.lieTimerMs = function () {
    return this.lie.phase === 'reveal' ? REVEAL_MS : this.turnLimit * 1000;
  };

  P.lieAutoSkip = function () {
    const cur = this.players.get(this.lieCurrent());
    if (!cur || cur.connected) return false;
    return this.lieTimeout();
  };

  P.lieRemove = function (id) {
    const L = this.lie;
    if (!L || this.state !== 'playing' || !(id in L.counts)) return;
    const wasCurrent = this.lieCurrent() === id;
    if (L.counts[id] > 0) L.out.push(id);
    L.counts[id] = 0;
    delete L.dice[id];
    const alive = this.lieAlive().filter((x) => x !== id);
    if (alive.length <= 1) return this.lieFinish(alive[0] || null);
    if (L.bid && L.bid.by === id) {
      // คนประกาศล่าสุดออก → เริ่มรอบใหม่
      this.lieNewRound(alive[0]);
      return;
    }
    if (wasCurrent) this.lieNextTurn();
  };

  P.lieView = function (id) {
    const L = this.lie;
    const showAll = L.phase === 'reveal' || L.phase === 'over';
    return {
      phase: L.phase,
      roundNo: L.roundNo,
      seq: L.seq,
      order: L.order,
      counts: L.counts,
      inGame: id in L.counts,
      myDice: L.dice[id] || [],
      dice: showAll ? L.dice : null,
      total: this.lieTotal(),
      bid: L.bid,
      bids: L.bids,
      minBid: this.lieMinBid(),
      result: L.result,
      out: L.out,
      winner: L.winner,
    };
  };
}

module.exports = { install, START_DICE, REVEAL_MS };

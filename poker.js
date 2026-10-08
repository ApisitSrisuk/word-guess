// เกม "โป๊กเกอร์ (Texas Hold'em)" ธีมแมว — เพิ่มความสามารถให้ Room
//
// กติกา: ไพ่ในมือ 2 ใบ + ไพ่กลาง 5 ใบ (flop 3 / turn 1 / river 1) · ชิปสมมุติคนละ 1,000 · blind 10/20
// แต่ละรอบเดิมพัน: หมอบ / ผ่าน / ตาม / เพิ่ม / ทั้งหมดหน้าตัก — เหลือคนเดียวหรือถึง showdown แล้วแบ่งกองเงิน (รองรับ side pot)
// ชิปหมด = ตกรอบ · เหลือคนเดียวที่มีชิป (หรือหัวห้องจบเกม) → จัดอันดับตามชิป +5/+3/+1
const START_CHIPS = 1000;
const SB = 10;
const BB = 20;
const SHOW_MS = Number(process.env.PK_SHOW_MS) || 7000;
const RANK_PTS = [5, 3, 1];
const HAND_NAMES = ['ไพ่สูง', 'หนึ่งคู่', 'สองคู่', 'ตอง', 'สเตรท', 'ฟลัช', 'ฟูลเฮาส์', 'โฟร์การ์ด', 'สเตรทฟลัช'];

// ---------- ประเมินมือไพ่ ----------
// การ์ด = { r: 2..14 (14 = A), s: 0..3 }
function eval5(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join() === '14,5,4,3,2') straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {};
  for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  // เรียงตาม (จำนวน, แต้ม) มาก→น้อย
  const groups = Object.entries(cnt).map(([r, n]) => [n, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map((g) => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...rs];
}
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
};
// มือที่ดีที่สุดจาก 5–7 ใบ
function bestHand(cards) {
  let best = null;
  const n = cards.length;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const v = eval5(chosen);
      if (!best || cmp(v, best) > 0) best = v;
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, cards[i]]);
  };
  if (n >= 5) pick(0, []);
  return best;
}
const handName = (v) => (v ? (v[0] === 8 && v[1] === 14 ? 'รอยัลฟลัช' : HAND_NAMES[v[0]]) : '');

// ชื่อมือไพ่แบบละเอียด เช่น "สองคู่ K กับ 7"
const L = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));
function describe(v) {
  if (!v) return '';
  switch (v[0]) {
    case 8: return v[1] === 14 ? 'รอยัลฟลัช 👑' : `สเตรทฟลัช (สูงสุด ${L(v[1])})`;
    case 7: return `โฟร์การ์ด ${L(v[1])}`;
    case 6: return `ฟูลเฮาส์ (ตอง ${L(v[1])} คู่ ${L(v[2])})`;
    case 5: return `ฟลัช (สูงสุด ${L(v[1])})`;
    case 4: return `สเตรท (สูงสุด ${L(v[1])})`;
    case 3: return `ตอง ${L(v[1])}`;
    case 2: return `สองคู่ ${L(v[1])} กับ ${L(v[2])}`;
    case 1: return `หนึ่งคู่ ${L(v[1])}`;
    default: return `ไพ่สูง ${L(v[1])}`;
  }
}

// มือไพ่ตอนนี้ (รองรับก่อนเปิดไพ่กลาง = มีแค่ 2 ใบ)
function currentHand(cards) {
  if (cards.length >= 5) return bestHand(cards);
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  return rs.length === 2 && rs[0] === rs[1] ? [1, rs[0]] : [0, ...rs];
}

// ไพ่ที่กำลังลุ้น (ยังเปิดไพ่กลางไม่ครบ): ฟลัช/สเตรทขาดอีก 1 ใบ
function draws(cards, v) {
  const out = [];
  if (cards.length < 5 || cards.length >= 7) return out;
  if (v[0] < 5) {
    const bySuit = [0, 0, 0, 0];
    for (const c of cards) bySuit[c.s] += 1;
    if (bySuit.some((n) => n === 4)) out.push('ลุ้นฟลัช (ขาดอีก 1 ใบ)');
  }
  if (v[0] < 4) {
    const set = new Set(cards.map((c) => c.r));
    if (set.has(14)) set.add(1);
    for (let lo = 1; lo <= 10; lo++) {
      let have = 0;
      for (let r = lo; r < lo + 5; r++) if (set.has(r)) have += 1;
      if (have === 4) { out.push('ลุ้นสเตรท (ขาดอีก 1 ใบ)'); break; }
    }
  }
  return out;
}

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';
  const newDeck = () => shuffle([0, 1, 2, 3].flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ r: i + 2, s }))));

  P.startPoker = function () {
    const players = [...this.players.values()];
    if (players.length < 2) throw new Error('ต้องมีผู้เล่นอย่างน้อย 2 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const order = shuffle(players.map((p) => p.id));
    this.mode = 'poker';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl', 'sh']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'โป๊กเกอร์';
    this.pk = {
      order,
      chips: Object.fromEntries(order.map((id) => [id, START_CHIPS])),
      dealerIdx: order.length - 1, // มือแรกเลื่อนไปคนแรก
      handNo: 0,
      seq: 0,
      phase: 'bet', // bet → showdown → (มือใหม่) bet … / over
      street: 'preflop',
      deck: [],
      board: [],
      holes: {},
      inHand: [], // คนที่ได้ไพ่มือนี้
      folded: [],
      bets: {}, // เดิมพันในรอบนี้ (street)
      contrib: {}, // เดิมพันรวมทั้งมือ
      currentBet: 0,
      minRaise: BB,
      acted: [],
      turnIdx: 0,
      result: null,
      final: null,
      waiting: [], // คนที่เข้ามากลางมือ ได้นั่งมือถัดไป
    };
    this.pkNewHand();
  };

  P.pkSeated = function () {
    const k = this.pk;
    return k.order.filter((id) => this.players.has(id) && k.chips[id] > 0);
  };
  const nextIdx = (k, from, ok) => {
    const n = k.order.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (ok(k.order[idx])) return idx;
    }
    return -1;
  };

  P.pkNewHand = function () {
    const k = this.pk;
    for (const id of k.waiting) if (!k.order.includes(id)) { k.order.push(id); k.chips[id] = START_CHIPS; }
    k.waiting = [];
    const seated = this.pkSeated();
    if (seated.length < 2) return this.pkFinish();
    k.handNo += 1;
    k.seq += 1;
    k.phase = 'bet';
    k.street = 'preflop';
    k.deck = newDeck();
    k.board = [];
    k.inHand = seated.slice();
    k.folded = [];
    k.holes = {};
    k.bets = {};
    k.contrib = {};
    for (const id of seated) { k.holes[id] = [k.deck.pop(), k.deck.pop()]; k.bets[id] = 0; k.contrib[id] = 0; }
    k.result = null;
    const can = (id) => seated.includes(id);
    k.dealerIdx = nextIdx(k, k.dealerIdx, can);
    // heads-up: ดีลเลอร์เป็น small blind
    const sbIdx = seated.length === 2 ? k.dealerIdx : nextIdx(k, k.dealerIdx, can);
    const bbIdx = nextIdx(k, sbIdx, can);
    k.sbId = k.order[sbIdx];
    k.bbId = k.order[bbIdx];
    this.pkPost(k.sbId, SB);
    this.pkPost(k.bbId, BB);
    k.currentBet = BB;
    k.minRaise = BB;
    k.acted = [];
    k.turnIdx = nextIdx(k, bbIdx, (id) => this.pkCanAct(id));
    if (k.turnIdx === -1) this.pkRunOut();
  };

  P.pkPost = function (id, amt) {
    const k = this.pk;
    const a = Math.min(amt, k.chips[id]);
    k.chips[id] -= a;
    k.bets[id] += a;
    k.contrib[id] += a;
    return a;
  };
  P.pkActive = function () {
    const k = this.pk;
    return k.inHand.filter((id) => !k.folded.includes(id));
  };
  P.pkCanAct = function (id) {
    const k = this.pk;
    return k.inHand.includes(id) && !k.folded.includes(id) && k.chips[id] > 0 && this.players.has(id);
  };
  P.pkCurrent = function () {
    const k = this.pk;
    if (!k || this.state !== 'playing' || k.phase !== 'bet' || k.turnIdx < 0) return null;
    return k.order[k.turnIdx];
  };
  P.pkToCall = function (id) {
    const k = this.pk;
    return Math.max(0, Math.min(k.currentBet - (k.bets[id] || 0), k.chips[id] || 0));
  };

  // action: fold | check | call | raise (to = ยอดเดิมพันรวมในรอบนี้) | allin
  P.pkAct = function (id, action, to) {
    const k = this.pk;
    if (this.mode !== 'poker' || this.state !== 'playing' || k.phase !== 'bet') throw new Error('ตอนนี้ยังเดิมพันไม่ได้');
    if (this.pkCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    const owe = k.currentBet - k.bets[id];
    let label;
    if (action === 'fold') {
      k.folded.push(id);
      label = 'หมอบ';
    } else if (action === 'check') {
      if (owe > 0) throw new Error(`ต้องตาม ${owe} หรือหมอบ`);
      label = 'ผ่าน';
    } else if (action === 'call' || (action === 'allin' && k.bets[id] + k.chips[id] <= k.currentBet)) {
      // all-in ที่ชิปไม่ถึงเดิมพันปัจจุบัน = ตามจนหมดหน้าตัก
      if (owe <= 0) throw new Error('ไม่มีอะไรต้องตาม กด "ผ่าน" ได้เลย');
      const paid = this.pkPost(id, owe);
      label = k.chips[id] === 0 ? `ตาม ${paid} (หมดหน้าตัก)` : `ตาม ${paid}`;
    } else if (action === 'raise' || action === 'allin') {
      const max = k.bets[id] + k.chips[id];
      to = action === 'allin' ? max : Math.floor(Number(to));
      const minTo = k.currentBet + k.minRaise;
      if (!(to > k.currentBet)) throw new Error('ต้องเพิ่มให้มากกว่าเดิมพันปัจจุบัน');
      if (to > max) throw new Error(`มีชิปแค่ ${max}`);
      if (to < minTo && to !== max) throw new Error(`เพิ่มขั้นต่ำเป็น ${minTo}`);
      const raiseBy = to - k.currentBet;
      this.pkPost(id, to - k.bets[id]);
      if (raiseBy >= k.minRaise) { k.minRaise = raiseBy; k.acted = []; } // เพิ่มเต็ม = ทุกคนต้องตัดสินใหม่
      k.currentBet = to;
      label = k.chips[id] === 0 ? `ทั้งหมดหน้าตัก ${to}` : `เพิ่มเป็น ${to}`;
    } else {
      throw new Error('คำสั่งไม่ถูกต้อง');
    }
    if (!k.acted.includes(id)) k.acted.push(id);
    this.feed.push({ type: 'pk-act', name: nameOf(this, id), label, street: k.street });
    this.feed = this.feed.slice(-50);
    k.seq += 1;
    this.pkAdvance();
  };

  P.pkAdvance = function () {
    const k = this.pk;
    const active = this.pkActive();
    if (active.length === 1) return this.pkAward([{ amount: this.pkPot(), eligible: active }], true);
    const canAct = active.filter((id) => k.chips[id] > 0);
    const settled = canAct.every((id) => k.acted.includes(id) && k.bets[id] === k.currentBet);
    if (!settled) {
      k.turnIdx = nextIdx(k, k.turnIdx, (id) => this.pkCanAct(id) && (!k.acted.includes(id) || k.bets[id] < k.currentBet));
      if (k.turnIdx !== -1) return;
    }
    // รอบเดิมพันจบ
    if (canAct.length <= 1 && canAct.every((id) => k.bets[id] >= k.currentBet)) return this.pkRunOut();
    this.pkNextStreet();
  };

  P.pkNextStreet = function () {
    const k = this.pk;
    const deal = (n) => { for (let i = 0; i < n; i++) k.board.push(k.deck.pop()); };
    if (k.street === 'preflop') { deal(3); k.street = 'flop'; }
    else if (k.street === 'flop') { deal(1); k.street = 'turn'; }
    else if (k.street === 'turn') { deal(1); k.street = 'river'; }
    else return this.pkShowdown();
    for (const id of k.inHand) k.bets[id] = 0;
    k.currentBet = 0;
    k.minRaise = BB;
    k.acted = [];
    k.seq += 1;
    k.turnIdx = nextIdx(k, k.dealerIdx, (id) => this.pkCanAct(id));
    if (k.turnIdx === -1 || this.pkActive().filter((id) => k.chips[id] > 0).length <= 1) this.pkRunOut();
  };

  // ไม่มีใครเดิมพันต่อได้แล้ว → เปิดไพ่กลางให้ครบแล้ว showdown
  P.pkRunOut = function () {
    const k = this.pk;
    while (k.board.length < 5) k.board.push(k.deck.pop());
    k.street = 'river';
    this.pkShowdown();
  };

  P.pkPot = function () {
    return Object.values(this.pk.contrib).reduce((a, b) => a + b, 0);
  };

  // แบ่งกองเงินหลัก + side pot ตามยอดที่แต่ละคนลง
  P.pkPots = function () {
    const k = this.pk;
    const active = this.pkActive();
    const levels = [...new Set(active.map((id) => k.contrib[id]))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      for (const id of Object.keys(k.contrib)) amount += Math.max(0, Math.min(k.contrib[id], lv) - prev);
      const eligible = active.filter((id) => k.contrib[id] >= lv);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lv;
    }
    // เศษที่เกินจากคนที่หมอบไปแล้ว (ลงมากกว่าคนที่ยังอยู่) รวมเข้ากองสุดท้าย
    const total = this.pkPot();
    const counted = pots.reduce((n, p) => n + p.amount, 0);
    if (pots.length && total > counted) pots[pots.length - 1].amount += total - counted;
    return pots;
  };

  P.pkShowdown = function () {
    this.pkAward(this.pkPots(), false);
  };

  P.pkAward = function (pots, uncontested) {
    const k = this.pk;
    const values = {};
    if (!uncontested) for (const id of this.pkActive()) values[id] = bestHand([...k.holes[id], ...k.board]);
    const won = {};
    for (const pot of pots) {
      let winners = pot.eligible;
      if (!uncontested) {
        let best = null;
        for (const id of pot.eligible) if (!best || cmp(values[id], best) > 0) best = values[id];
        winners = pot.eligible.filter((id) => cmp(values[id], best) === 0);
      }
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const id of winners) {
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
        k.chips[id] += amt;
        won[id] = (won[id] || 0) + amt;
      }
    }
    k.result = {
      uncontested,
      pot: pots.reduce((n, p) => n + p.amount, 0),
      winners: Object.entries(won).map(([id, amount]) => ({ id, amount, hand: values[id] ? describe(values[id]) : null })),
      shown: uncontested ? {} : Object.fromEntries(this.pkActive().map((id) => [id, { cards: k.holes[id], hand: describe(values[id]) }])),
    };
    this.feed.push({
      type: 'pk-win',
      winners: k.result.winners.map((w) => ({ name: nameOf(this, w.id), amount: w.amount, hand: w.hand })),
      uncontested,
    });
    k.phase = 'showdown';
    k.seq += 1;
  };

  // หลังโชว์ผล → มือใหม่ (ชิปหมด = ตกรอบ)
  P.pkAfterShow = function () {
    const k = this.pk;
    for (const id of k.order) if (k.chips[id] === 0 && !k.bustOrder?.includes(id)) (k.bustOrder = k.bustOrder || []).push(id);
    this.pkNewHand();
  };

  P.pkFinish = function () {
    const k = this.pk;
    const ids = k.order.filter((id) => this.players.has(id));
    const final = ids.map((id) => ({ id, chips: k.chips[id] })).sort((a, b) => b.chips - a.chips);
    let rank = 0;
    final.forEach((x, i) => {
      if (i > 0 && x.chips < final[i - 1].chips) rank = i;
      x.rank = rank + 1;
      x.pts = x.chips > 0 || rank === 0 ? RANK_PTS[rank] || 0 : 0;
      const p = this.players.get(x.id);
      if (p && x.pts) p.score += x.pts;
    });
    k.final = final;
    k.phase = 'over';
    this.state = 'reveal';
    this.feed.push({ type: 'pk-over', winner: final[0] ? nameOf(this, final[0].id) : null, chips: final[0] ? final[0].chips : 0 });
  };

  // หมดเวลา: ผ่านได้ = ผ่าน / ไม่งั้น = หมอบ · ช่วงโชว์ผล → มือใหม่
  P.pkTimeout = function () {
    const k = this.pk;
    if (k.phase === 'showdown') return this.pkAfterShow(), true;
    if (k.phase !== 'bet') return false;
    const cur = this.pkCurrent();
    if (!cur) return false;
    this.pkAct(cur, k.currentBet - k.bets[cur] > 0 ? 'fold' : 'check');
    return true;
  };
  P.pkTimerKey = function () {
    const k = this.pk;
    if (k.phase === 'showdown') return `pk|${this.round}|${k.seq}|show`;
    if (k.phase === 'bet') return this.turnLimit ? `pk|${this.round}|${k.seq}|bet` : null;
    return null;
  };
  P.pkTimerMs = function () {
    return this.pk.phase === 'showdown' ? SHOW_MS : this.turnLimit * 1000;
  };
  P.pkAutoSkip = function () {
    const cur = this.players.get(this.pkCurrent());
    if (!cur || cur.connected) return false;
    return this.pkTimeout();
  };
  P.pkAddPlayer = function (id) {
    if (this.pk && this.state === 'playing') this.pk.waiting.push(id);
  };
  P.pkRemove = function (id) {
    const k = this.pk;
    if (!k || this.state !== 'playing') return;
    k.waiting = k.waiting.filter((x) => x !== id);
    if (!k.inHand.includes(id) || k.folded.includes(id)) return;
    const wasCurrent = this.pkCurrent() === id;
    k.folded.push(id);
    if (k.phase !== 'bet') return;
    const active = this.pkActive();
    if (active.length === 1) return this.pkAward([{ amount: this.pkPot(), eligible: active }], true);
    if (wasCurrent) {
      this.players.delete(id); // ให้การเลื่อนตาข้ามคนนี้
      k.seq += 1;
      this.pkAdvance();
    }
  };

  P.pkView = function (id) {
    const k = this.pk;
    const over = k.phase === 'over';
    const me = k.inHand.includes(id) && !k.folded.includes(id);
    const cur = this.pkCurrent();
    const known = me ? [...k.holes[id], ...k.board] : [];
    const myBest = me ? currentHand(known) : null;
    return {
      phase: k.phase,
      street: k.street,
      handNo: k.handNo,
      seq: k.seq,
      order: k.order,
      chips: k.chips,
      bets: k.bets,
      contrib: k.contrib,
      pot: this.pkPot(),
      board: k.board,
      myHole: k.holes[id] || null,
      myHand: myBest ? describe(myBest) : null,
      myRank: myBest ? myBest[0] : null,
      myDraws: myBest ? draws(known, myBest) : [],
      inHand: k.inHand,
      folded: k.folded,
      dealerId: k.order[k.dealerIdx],
      sbId: k.sbId,
      bbId: k.bbId,
      current: cur,
      toCall: cur === id ? this.pkToCall(id) : 0,
      minRaiseTo: Math.min(k.currentBet + k.minRaise, (k.bets[id] || 0) + (k.chips[id] || 0)),
      maxRaiseTo: (k.bets[id] || 0) + (k.chips[id] || 0),
      currentBet: k.currentBet,
      myBet: k.bets[id] || 0,
      result: k.result,
      waiting: k.waiting.includes(id),
      final: over ? k.final : null,
    };
  };
}

module.exports = { install, eval5, bestHand, handName, describe, currentHand, draws, cmp, START_CHIPS, SB, BB };

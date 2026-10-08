// เกม "ผู้ตรวจการ" (แบบย่อของ Sheriff of Nottingham) — เพิ่มความสามารถให้ Room
//
// กติกา:
// - ทุกคนมีการ์ดสินค้า 6 ใบ + เงิน 20 · ผลัดกันเป็นผู้ตรวจการรอบละ 1 คน (เล่นจนทุกคนได้เป็น)
// - พ่อค้าแพ็กกระเป๋าพร้อมกัน: ใส่ 1–5 ใบ ประกาศ "มี [ของถูกกฎหมาย] N ชิ้น" (N ต้องตรง ชนิดโกหกได้) + ยื่นสินบนได้
// - ผู้ตรวจการดูทีละกระเป๋า: ปล่อยผ่าน (ได้สินบน ของเข้าแผงร้าน) หรือ เปิดตรวจ
//     พูดจริง → ผู้ตรวจการจ่ายค่าปรับให้พ่อค้า / โกหก → พ่อค้าจ่ายค่าปรับ ของที่โกหกถูกยึด
// - จบเกม: คะแนน = เงิน + ราคาสินค้าบนแผงร้าน
const GOODS = {
  apple: { name: 'แอปเปิ้ล', emoji: '🍎', value: 2, fine: 2, legal: true, count: 24 },
  cheese: { name: 'ชีส', emoji: '🧀', value: 3, fine: 2, legal: true, count: 20 },
  bread: { name: 'ขนมปัง', emoji: '🍞', value: 3, fine: 2, legal: true, count: 20 },
  chicken: { name: 'ไก่', emoji: '🐔', value: 4, fine: 2, legal: true, count: 14 },
  pepper: { name: 'พริก', emoji: '🌶️', value: 6, fine: 4, legal: false, count: 7 },
  wine: { name: 'ไวน์', emoji: '🍷', value: 7, fine: 4, legal: false, count: 6 },
  silk: { name: 'ผ้าไหม', emoji: '🧵', value: 8, fine: 4, legal: false, count: 5 },
  sword: { name: 'ดาบ', emoji: '🗡️', value: 9, fine: 4, legal: false, count: 4 },
};
const LEGAL = Object.keys(GOODS).filter((k) => GOODS[k].legal);
const HAND = 6;
const START_COINS = 20;
const RESULT_MS = Number(process.env.SH_RESULT_MS) || 4500;
const RANK_PTS = [5, 3, 1];

function install(Room, { shuffle }) {
  const P = Room.prototype;
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';
  let cardSeq = 0;
  const newDeck = () => shuffle(Object.entries(GOODS).flatMap(([type, g]) => Array.from({ length: g.count }, () => ({ id: ++cardSeq, type }))));

  P.startSheriff = function () {
    const players = [...this.players.values()];
    if (players.length < 3) throw new Error('ผู้ตรวจการ ต้องมีอย่างน้อย 3 คน');
    for (const p of players) { p.word = null; p.guessedBy = null; }
    const order = shuffle(players.map((p) => p.id));
    const deck = newDeck();
    this.mode = 'sheriff';
    for (const k of ['uc', 'ct', 'ch', 'dr', 'cn', 'lie', 'tl']) this[k] = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'ผู้ตรวจการ';
    this.sh = {
      order,
      sheriffIdx: 0,
      roundNo: 1,
      totalRounds: order.length <= 3 ? order.length * 2 : order.length, // 3 คน = ได้เป็นคนละ 2 รอบ
      seq: 1,
      phase: 'pack', // pack → inspect → result → inspect … → (รอบใหม่) pack / over
      deck,
      discard: [],
      hands: Object.fromEntries(order.map((id) => [id, deck.splice(0, HAND)])),
      coins: Object.fromEntries(order.map((id) => [id, START_COINS])),
      stand: Object.fromEntries(order.map((id) => [id, []])),
      bags: {},
      queue: [],
      qIdx: 0,
      last: null,
      final: null,
    };
  };

  P.shSheriff = function () {
    const s = this.sh;
    return s.order[s.sheriffIdx % s.order.length];
  };
  P.shMerchants = function () {
    const s = this.sh;
    return s.order.filter((id) => id !== this.shSheriff() && this.players.has(id));
  };
  P.shDraw = function (n) {
    const s = this.sh;
    if (s.deck.length < n) { s.deck.push(...shuffle(s.discard)); s.discard = []; }
    return s.deck.splice(0, n);
  };

  // พ่อค้าแพ็กกระเป๋า
  P.shPack = function (id, cardIds, declare, bribe) {
    const s = this.sh;
    if (this.mode !== 'sheriff' || this.state !== 'playing' || s.phase !== 'pack') throw new Error('ตอนนี้ยังแพ็กกระเป๋าไม่ได้');
    if (id === this.shSheriff()) throw new Error('ผู้ตรวจการไม่ต้องแพ็กกระเป๋า');
    if (!this.shMerchants().includes(id)) throw new Error('คุณไม่ได้อยู่ในเกมนี้');
    if (s.bags[id]) throw new Error('แพ็กไปแล้ว');
    const ids = [...new Set((cardIds || []).map(Number))];
    if (ids.length < 1 || ids.length > 5) throw new Error('ใส่กระเป๋าได้ 1–5 ใบ');
    const hand = s.hands[id];
    const cards = ids.map((cid) => hand.find((c) => c.id === cid));
    if (cards.some((c) => !c)) throw new Error('มีการ์ดที่ไม่อยู่ในมือ');
    if (!LEGAL.includes(declare)) throw new Error('ต้องประกาศเป็นสินค้าถูกกฎหมายเท่านั้น');
    bribe = Math.floor(Number(bribe) || 0);
    if (bribe < 0 || bribe > s.coins[id]) throw new Error(`สินบนต้องอยู่ระหว่าง 0–${s.coins[id]}`);
    s.hands[id] = hand.filter((c) => !ids.includes(c.id));
    s.bags[id] = { cards, declare, count: cards.length, bribe };
    if (this.shMerchants().every((m) => s.bags[m])) this.shStartInspect();
  };

  // หมดเวลาแพ็ก → แพ็กให้คนที่ยังไม่แพ็ก (ใส่ใบแรก 1 ใบ ประกาศตามจริงถ้าถูกกฎหมาย)
  P.shAutoPack = function () {
    const s = this.sh;
    for (const m of this.shMerchants()) {
      if (s.bags[m]) continue;
      const c = s.hands[m].shift();
      if (!c) continue;
      s.bags[m] = { cards: [c], declare: GOODS[c.type].legal ? c.type : 'apple', count: 1, bribe: 0, auto: true };
    }
    this.shStartInspect();
  };

  P.shStartInspect = function () {
    const s = this.sh;
    s.queue = this.shMerchants().filter((m) => s.bags[m]);
    s.qIdx = 0;
    s.phase = s.queue.length ? 'inspect' : 'pack';
    s.seq += 1;
    if (!s.queue.length) this.shEndRound();
  };

  P.shCurrentMerchant = function () {
    const s = this.sh;
    return s.phase === 'inspect' || s.phase === 'result' ? s.queue[s.qIdx] : null;
  };

  // ผู้ตรวจการตัดสิน: pass | inspect
  P.shDecide = function (id, action) {
    const s = this.sh;
    if (this.mode !== 'sheriff' || this.state !== 'playing' || s.phase !== 'inspect') throw new Error('ตอนนี้ยังตรวจไม่ได้');
    if (id !== this.shSheriff()) throw new Error('เฉพาะผู้ตรวจการเท่านั้น');
    this.shResolve(action === 'inspect' ? 'inspect' : 'pass');
  };

  P.shResolve = function (action, auto = false) {
    const s = this.sh;
    const m = this.shCurrentMerchant();
    const sheriff = this.shSheriff();
    const bag = s.bags[m];
    const pay = (from, to, amt) => {
      amt = Math.max(0, Math.min(amt, s.coins[from]));
      s.coins[from] -= amt;
      s.coins[to] += amt;
      return amt;
    };
    const res = { merchant: m, action, declare: bag.declare, count: bag.count, bribe: bag.bribe, auto };
    if (action === 'pass') {
      res.bribePaid = pay(m, sheriff, bag.bribe);
      s.stand[m].push(...bag.cards);
    } else {
      const honest = bag.cards.every((c) => c.type === bag.declare);
      res.honest = honest;
      res.cards = bag.cards.map((c) => c.type);
      if (honest) {
        res.finePaid = pay(sheriff, m, GOODS[bag.declare].fine * bag.count);
        s.stand[m].push(...bag.cards);
      } else {
        const lies = bag.cards.filter((c) => c.type !== bag.declare);
        const ok = bag.cards.filter((c) => c.type === bag.declare);
        res.finePaid = pay(m, sheriff, lies.reduce((n, c) => n + GOODS[c.type].fine, 0));
        res.confiscated = lies.map((c) => c.type);
        s.stand[m].push(...ok);
        s.discard.push(...lies);
      }
    }
    s.last = res;
    this.feed.push({ ...res, type: 'sh-resolve', merchant: nameOf(this, m), sheriff: nameOf(this, sheriff) });
    s.phase = 'result';
    s.seq += 1;
  };

  // หลังโชว์ผล → กระเป๋าถัดไป หรือจบรอบ
  P.shAfterResult = function () {
    const s = this.sh;
    s.qIdx += 1;
    while (s.qIdx < s.queue.length && !this.players.has(s.queue[s.qIdx])) s.qIdx += 1;
    s.last = null;
    s.seq += 1;
    if (s.qIdx < s.queue.length) { s.phase = 'inspect'; return; }
    this.shEndRound();
  };

  P.shEndRound = function () {
    const s = this.sh;
    s.bags = {};
    s.queue = [];
    s.qIdx = 0;
    if (s.roundNo >= s.totalRounds) return this.shFinish();
    s.roundNo += 1;
    s.sheriffIdx += 1;
    // ข้ามคนที่ออกไปแล้ว
    for (let i = 0; i < s.order.length && !this.players.has(this.shSheriff()); i++) s.sheriffIdx += 1;
    for (const id of s.order) if (this.players.has(id)) s.hands[id].push(...this.shDraw(HAND - s.hands[id].length));
    s.phase = 'pack';
    s.seq += 1;
  };

  P.shScoreOf = function (id) {
    const s = this.sh;
    const goods = s.stand[id].reduce((n, c) => n + GOODS[c.type].value, 0);
    return { coins: s.coins[id], goods, total: s.coins[id] + goods };
  };

  P.shFinish = function () {
    const s = this.sh;
    const alive = s.order.filter((id) => this.players.has(id));
    const scores = alive.map((id) => ({ id, ...this.shScoreOf(id) })).sort((a, b) => b.total - a.total);
    // ให้แต้มตามอันดับ (คะแนนเท่ากันได้อันดับเดียวกัน)
    let rank = 0;
    scores.forEach((x, i) => {
      if (i > 0 && x.total < scores[i - 1].total) rank = i;
      x.rank = rank + 1;
      const pts = RANK_PTS[rank] || 0;
      const p = this.players.get(x.id);
      if (p && pts) p.score += pts;
      x.pts = pts;
    });
    s.final = scores;
    s.phase = 'over';
    this.state = 'reveal';
    this.feed.push({ type: 'sh-over', winner: nameOf(this, scores[0] && scores[0].id), total: scores[0] && scores[0].total });
  };

  P.shCurrent = function () {
    const s = this.sh;
    if (!s || this.state !== 'playing') return null;
    return s.phase === 'inspect' ? this.shSheriff() : null;
  };

  // หมดเวลา: แพ็ก → แพ็กให้ / ตรวจ → ปล่อยผ่าน / โชว์ผล → ถัดไป
  P.shTimeout = function () {
    const s = this.sh;
    if (s.phase === 'pack') return this.shAutoPack(), true;
    if (s.phase === 'inspect') return this.shResolve('pass', true), true;
    if (s.phase === 'result') return this.shAfterResult(), true;
    return false;
  };
  P.shTimerKey = function () {
    const s = this.sh;
    if (s.phase === 'result') return `sh|${this.round}|${s.seq}|result`;
    if (s.phase === 'pack' || s.phase === 'inspect') return this.turnLimit ? `sh|${this.round}|${s.seq}|${s.phase}` : null;
    return null;
  };
  P.shTimerMs = function () {
    const s = this.sh;
    if (s.phase === 'result') return RESULT_MS;
    return this.turnLimit * 1000 * (s.phase === 'pack' ? 1.5 : 1); // แพ็กกระเป๋าให้เวลามากกว่าหน่อย
  };
  P.shChatKey = function () {
    const s = this.sh;
    // ล้างแชทเมื่อขึ้นรอบใหม่ หรือเปลี่ยนกระเป๋าที่กำลังตรวจ
    return `sh|${this.round}|${s.roundNo}|${s.phase === 'pack' ? 'pack' : s.qIdx}`;
  };

  P.shAutoSkip = function () {
    const s = this.sh;
    if (s.phase === 'inspect') {
      const sh = this.players.get(this.shSheriff());
      if (sh && !sh.connected) return this.shResolve('pass', true), true;
    }
    if (s.phase === 'pack') {
      // พ่อค้าที่ออนไลน์แพ็กครบแล้ว เหลือแต่คนหลุด → แพ็กให้เลย
      const waiting = this.shMerchants().filter((m) => !s.bags[m]);
      if (waiting.length && waiting.every((m) => !this.players.get(m).connected)) return this.shAutoPack(), true;
    }
    return false;
  };

  P.shRemove = function (id) {
    const s = this.sh;
    if (!s || this.state !== 'playing' || !s.order.includes(id)) return;
    const left = s.order.filter((x) => x !== id && this.players.has(x));
    if (left.length < 2) {
      this.players.delete(id);
      return this.shFinish();
    }
    if (id === this.shSheriff()) {
      // ผู้ตรวจการออก → จบรอบนี้ (ของในกระเป๋าคืนมือ)
      for (const [m, bag] of Object.entries(s.bags)) s.hands[m].push(...bag.cards);
      this.players.delete(id);
      return this.shEndRound();
    }
    if (s.phase === 'pack') {
      delete s.bags[id];
      this.players.delete(id);
      if (this.shMerchants().every((m) => s.bags[m])) this.shStartInspect();
    } else if (this.shCurrentMerchant() === id && s.phase === 'inspect') {
      this.players.delete(id);
      s.phase = 'result';
      this.shAfterResult();
    }
  };

  P.shView = function (id) {
    const s = this.sh;
    const over = s.phase === 'over';
    const sheriff = this.shSheriff();
    const bags = {};
    for (const [m, b] of Object.entries(s.bags)) bags[m] = { declare: b.declare, count: b.count, bribe: b.bribe };
    const packed = Object.keys(s.bags);
    return {
      phase: s.phase,
      roundNo: s.roundNo,
      totalRounds: s.totalRounds,
      sheriffId: sheriff,
      amSheriff: id === sheriff,
      inGame: s.order.includes(id),
      order: s.order,
      coins: s.coins,
      standCount: Object.fromEntries(s.order.map((x) => [x, s.stand[x].length])),
      myStand: (s.stand[id] || []).map((c) => c.type),
      myHand: s.hands[id] || [],
      myBag: s.bags[id] ? { ...bags[id], cards: s.bags[id].cards.map((c) => c.type) } : null,
      // ระหว่างแพ็ก: เห็นแค่ว่าใครแพ็กแล้ว (ไม่เห็นคำประกาศคนอื่นจนกว่าจะถึงช่วงตรวจ)
      bags: s.phase === 'pack' ? {} : bags,
      packed,
      merchants: this.shMerchants(),
      current: this.shCurrentMerchant(),
      queue: s.queue,
      last: s.last,
      final: over ? s.final.map((x) => ({ ...x, stand: s.stand[x.id].map((c) => c.type) })) : null,
      goods: GOODS,
    };
  };
}

module.exports = { install, GOODS, LEGAL, HAND, START_COINS };

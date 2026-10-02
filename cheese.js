// เกม "หัวขโมยชีส" (Cheese Thief) — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - ทุกคนทอยเต๋าลับ (1–6) สุ่ม 1 คนเป็นหัวขโมย (6 คนขึ้นไปมีผู้สมรู้ร่วมคิดด้วย)
// - กลางคืน ตี 1 → ตี 6: ใครทอยได้เลขไหนตื่นตีนั้น
//     ตื่นคนเดียว = แอบดูเต๋าของเพื่อนได้ 1 คน / ตื่นหลายคน = เห็นกัน
//     ขโมยขโมยชีสตอนตีของตัวเอง — ใครตื่นตีเดียวกันเห็นขโมย / ขโมยเลือกชวนผู้สมรู้ร่วมคิดได้ตอนนั้น
// - ตอนเช้า: คุยกันแล้วโหวต — ขโมยได้โหวตมากสุด (รวมเสมอ) = หนูดีชนะ ไม่งั้นขโมยชนะ
const HOUR_MS = Number(process.env.CHEESE_HOUR_MS) || 12000; // เวลาแต่ละตีตอนกลางคืน
const LOOK_MS = Number(process.env.CHEESE_LOOK_MS) || 10000; // ทอยครบแล้ว ให้เวลาดู/จำเลขเต๋าก่อนเข้ากลางคืน
const ROLL_MS = Number(process.env.CHEESE_ROLL_MS) || 15000; // เวลาทอยเต๋า (ไม่ทอย = ทอยให้อัตโนมัติ)
const PTS = { mouse: 2, thief: 4, accomplice: 3 };

function install(Room, { shuffle }) {
  const P = Room.prototype;

  P.startCheese = function () {
    const players = [...this.players.values()];
    if (players.length < 3) throw new Error('หัวขโมยชีส ต้องมีอย่างน้อย 3 คน');
    const ids = players.map((p) => p.id);
    for (const p of players) { p.word = null; p.guessedBy = null; }
    this.mode = 'cheese';
    this.uc = null;
    this.ct = null;
    this.dr = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'หัวขโมยชีส';
    this.ch = {
      phase: 'roll', // roll → look (ดูเต๋า) → night → day → over
      ids,
      thiefId: shuffle(ids)[0],
      wantAccomplice: ids.length >= 6,
      accompliceId: null,
      dice: Object.fromEntries(ids.map((id) => [id, null])),
      hour: 0,
      awake: [], // คนที่ตื่นตีนี้
      pending: {}, // id -> 'peek' | 'recruit' (สิ่งที่ทำได้ตีนี้)
      memories: Object.fromEntries(ids.map((id) => [id, []])),
      log: [], // บันทึกทั้งคืน (เฉลยตอนจบ)
      votes: {},
      tally: null,
      winner: null,
    };
  };

  const rollDie = () => 1 + Math.floor(Math.random() * 6);
  const nameOf = (room, id) => (room.players.get(id) || {}).name || '?';

  P.chRoll = function (id) {
    const c = this.ch;
    if (this.mode !== 'cheese' || this.state !== 'playing' || c.phase !== 'roll') throw new Error('ตอนนี้ไม่ใช่ช่วงทอยเต๋า');
    if (!(id in c.dice)) throw new Error('คุณไม่ได้อยู่ในเกมนี้');
    if (c.dice[id] != null) throw new Error('ทอยไปแล้ว');
    c.dice[id] = rollDie();
    if (c.ids.every((x) => c.dice[x] != null)) this.chStartLook();
    return c.dice[id];
  };

  // ทอยครบ (หรือหมดเวลาทอย) → ช่วงดูเต๋า ให้ทุกคนจำเลขตัวเองก่อนเข้ากลางคืน
  P.chStartLook = function () {
    const c = this.ch;
    for (const id of c.ids) if (c.dice[id] == null) c.dice[id] = rollDie(); // คนที่ไม่ได้ทอย ทอยให้
    c.phase = 'look';
  };

  P.chStartNight = function () {
    const c = this.ch;
    for (const id of c.ids) if (c.dice[id] == null) c.dice[id] = rollDie(); // คนที่ไม่ได้ทอย ทอยให้
    c.phase = 'night';
    c.hour = 0;
    this.chNextHour();
  };

  // ไปตีถัดไป — จัดว่าใครตื่น เห็นอะไร ทำอะไรได้
  P.chNextHour = function () {
    const c = this.ch;
    // ตีที่แล้ว: คนที่ไม่ได้เลือกทำอะไร บันทึกไว้
    for (const [id, what] of Object.entries(c.pending)) {
      c.memories[id].push(what === 'peek' ? `ตี ${c.hour}: ตื่นคนเดียว แต่ไม่ได้แอบดูใคร` : `ตี ${c.hour}: ไม่ได้ชวนใครเป็นผู้สมรู้ร่วมคิด`);
    }
    c.pending = {};
    c.hour += 1;
    if (c.hour > 6) {
      c.phase = 'day';
      c.awake = [];
      c.votes = {};
      return;
    }
    const h = c.hour;
    const awake = c.ids.filter((id) => c.dice[id] === h && this.players.has(id));
    c.awake = awake;
    const thiefHere = awake.includes(c.thiefId);
    const names = (list) => list.map((id) => nameOf(this, id)).join(', ');

    if (!awake.length) {
      c.log.push(`ตี ${h}: ไม่มีใครตื่น`);
    } else {
      c.log.push(`ตี ${h}: ${names(awake)} ตื่น${thiefHere ? ' — 🐀 ขโมยชีส!' : ''}`);
    }
    for (const id of awake) {
      const others = awake.filter((x) => x !== id);
      const mem = c.memories[id];
      if (id === c.thiefId) {
        mem.push(others.length ? `ตี ${h}: 🐀 คุณขโมยชีส! แต่ ${names(others)} ตื่นอยู่และเห็นคุณ 😱` : `ตี ${h}: 🐀 คุณขโมยชีสได้ ไม่มีใครเห็น 😏`);
        if (c.wantAccomplice && !c.accompliceId) c.pending[id] = 'recruit';
      } else if (others.length) {
        mem.push(`ตี ${h}: คุณตื่นพร้อม ${names(others)}${thiefHere ? ` — และเห็น 🐀 ${nameOf(this, c.thiefId)} ขโมยชีส!` : ''}`);
      } else {
        c.pending[id] = 'peek';
      }
    }
  };

  P.chPeek = function (id, targetId) {
    // คืนค่าเลขเต๋าที่แอบดู ให้คนดูเห็นทันที
    const c = this.ch;
    if (this.mode !== 'cheese' || c.phase !== 'night' || c.pending[id] !== 'peek') throw new Error('ตอนนี้คุณแอบดูไม่ได้');
    if (targetId === id || !(targetId in c.dice) || !this.players.has(targetId)) throw new Error('แอบดูคนนี้ไม่ได้');
    delete c.pending[id];
    c.memories[id].push(`ตี ${c.hour}: ตื่นคนเดียว แอบดูเต๋าของ ${nameOf(this, targetId)} = 🎲 ${c.dice[targetId]}`);
    return c.dice[targetId];
  };

  P.chRecruit = function (id, targetId) {
    const c = this.ch;
    if (this.mode !== 'cheese' || c.phase !== 'night' || c.pending[id] !== 'recruit') throw new Error('ตอนนี้คุณชวนไม่ได้');
    if (targetId === id || !(targetId in c.dice) || !this.players.has(targetId)) throw new Error('ชวนคนนี้ไม่ได้');
    delete c.pending[id];
    c.accompliceId = targetId;
    c.memories[id].push(`ตี ${c.hour}: 🤝 คุณชวน ${nameOf(this, targetId)} เป็นผู้สมรู้ร่วมคิด`);
    c.memories[targetId].push(`🤝 ${nameOf(this, id)} คือหัวขโมย และชวนคุณเป็นผู้สมรู้ร่วมคิด! ช่วยให้ขโมยรอด`);
  };

  P.chVoters = function () {
    return this.ch.ids.filter((id) => {
      const p = this.players.get(id);
      return p && p.connected;
    });
  };

  P.chVote = function (id, targetId) {
    const c = this.ch;
    if (this.mode !== 'cheese' || this.state !== 'playing' || c.phase !== 'day') throw new Error('ตอนนี้ยังโหวตไม่ได้');
    if (!c.ids.includes(id)) throw new Error('คุณไม่ได้อยู่ในเกมนี้');
    if (targetId === id) throw new Error('โหวตตัวเองไม่ได้');
    if (!c.ids.includes(targetId) || !this.players.has(targetId)) throw new Error('โหวตคนนี้ไม่ได้');
    c.votes[id] = targetId;
    this.chCheckVotes();
  };

  P.chCheckVotes = function () {
    const c = this.ch;
    if (!c || this.state !== 'playing' || c.phase !== 'day') return false;
    const voters = this.chVoters();
    if (voters.length && voters.every((id) => c.votes[id])) {
      this.chResolve();
      return true;
    }
    return false;
  };

  P.chResolve = function () {
    const c = this.ch;
    const tally = {};
    for (const [v, t] of Object.entries(c.votes)) if (this.players.has(v)) tally[t] = (tally[t] || 0) + 1;
    c.tally = tally;
    const max = Math.max(0, ...Object.values(tally));
    const caught = max > 0 && tally[c.thiefId] === max; // ขโมยได้มากสุด (รวมเสมอ) = จับได้
    this.chFinish(caught ? 'mice' : 'thief');
  };

  P.chFinish = function (winner) {
    const c = this.ch;
    c.phase = 'over';
    c.winner = winner;
    c.pending = {};
    this.state = 'reveal';
    for (const id of c.ids) {
      const p = this.players.get(id);
      if (!p) continue;
      const role = id === c.thiefId ? 'thief' : id === c.accompliceId ? 'accomplice' : 'mouse';
      if (winner === 'mice' && role === 'mouse') p.score += PTS.mouse;
      if (winner === 'thief' && role !== 'mouse') p.score += PTS[role];
    }
    this.feed.push({ type: 'ch-over', winner, thief: nameOf(this, c.thiefId), accomplice: c.accompliceId ? nameOf(this, c.accompliceId) : null });
  };

  // หมดเวลา: ช่วงทอย → ทอยให้ / กลางคืน → ตีถัดไป / กลางวัน → นับโหวต
  P.chTimeout = function () {
    const c = this.ch;
    if (c.phase === 'roll') return this.chStartLook(), true;
    if (c.phase === 'look') return this.chStartNight(), true;
    if (c.phase === 'night') return this.chNextHour(), true;
    if (c.phase === 'day') {
      this.feed.push({ type: 'timeout', vote: true });
      this.chResolve();
      return true;
    }
    return false;
  };

  P.chTimerKey = function () {
    const c = this.ch;
    if (c.phase === 'roll') return `ch|${this.round}|roll`;
    if (c.phase === 'look') return `ch|${this.round}|look`;
    if (c.phase === 'night') return `ch|${this.round}|night|${c.hour}`;
    if (c.phase === 'day') return this.turnLimit ? `ch|${this.round}|day` : null;
    return null;
  };

  P.chTimerMs = function () {
    const c = this.ch;
    if (c.phase === 'roll') return ROLL_MS;
    if (c.phase === 'look') return LOOK_MS;
    if (c.phase === 'night') return HOUR_MS;
    // กลางวัน: เวลาคุย+โหวต = 2 เท่าของเวลาต่อตา (คุยกันหลายคน)
    return this.turnLimit * 2000;
  };

  P.chRemove = function (id) {
    const c = this.ch;
    if (!c || this.state !== 'playing' || !c.ids.includes(id)) return;
    if (id === c.thiefId) {
      // ขโมยหนีออกจากห้อง → หนูดีชนะ
      this.feed.push({ type: 'ch-left' });
      this.chFinish('mice');
      return;
    }
    delete c.pending[id];
    delete c.votes[id];
    for (const [v, t] of Object.entries(c.votes)) if (t === id) delete c.votes[v];
    if (c.phase === 'roll' && c.ids.filter((x) => x !== id && this.players.has(x)).every((x) => c.dice[x] != null)) {
      // ทุกคนที่เหลือทอยครบแล้ว
      this.chStartLook();
    } else if (c.phase === 'day') {
      this.chCheckVotes();
    }
  };

  P.chView = function (id) {
    const c = this.ch;
    const over = c.phase === 'over';
    const inGame = c.ids.includes(id);
    const amThief = id === c.thiefId;
    const amAccomplice = id === c.accompliceId;
    return {
      phase: c.phase,
      hour: c.hour,
      inGame,
      myDie: inGame ? c.dice[id] : null,
      amThief,
      amAccomplice,
      thiefId: amThief || amAccomplice || over ? c.thiefId : null,
      accompliceId: amThief || amAccomplice || over ? c.accompliceId : null,
      wantAccomplice: c.wantAccomplice,
      rolled: c.ids.filter((x) => c.dice[x] != null),
      ids: c.ids,
      awakeNow: c.phase === 'night' && c.awake.includes(id),
      awakeWith: c.phase === 'night' && c.awake.includes(id) ? c.awake.filter((x) => x !== id) : [],
      pending: c.pending[id] || null,
      memories: inGame ? c.memories[id] : [],
      voted: c.phase === 'day' ? Object.keys(c.votes) : [],
      myVote: c.votes[id] || null,
      voters: c.phase === 'day' ? this.chVoters().length : 0,
      tally: over ? c.tally : null,
      winner: c.winner,
      dice: over ? c.dice : null,
      log: over ? c.log : null,
    };
  };
}

module.exports = { install, HOUR_MS, ROLL_MS, LOOK_MS };

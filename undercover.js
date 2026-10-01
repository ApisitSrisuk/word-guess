// เกม "ใครคือสปาย" (Undercover) — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - ชาวบ้านได้คำเดียวกัน สปายได้คำคล้าย ๆ (ไม่มีใครรู้ว่าตัวเองฝ่ายไหน) Mr. White ไม่ได้คำ (รู้ตัว)
// - รอบใบ้: ผลัดกันพิมพ์คำใบ้ตามลำดับ → รอบโหวต: คนที่ได้โหวตมากสุดออก (เสมอ = ไม่มีใครออก)
// - Mr. White โดนโหวตออก → ทายคำของชาวบ้าน 1 ครั้ง ถูก = ชนะคนเดียว
// - ชาวบ้านชนะเมื่อสปาย + Mr. White ออกหมด / ฝ่ายสปายชนะเมื่อเหลือ ≥ ชาวบ้าน
const PAIRS = require('./pairs');

const PTS = { civ: 2, uc: 5, white: 6 };
const ROLE_NAME = { civ: 'ชาวบ้าน', uc: 'สปาย', white: 'Mr. White' };

function install(Room, { shuffle, normalize, parseEntry }) {
  const P = Room.prototype;

  // จำนวนสปาย/Mr. White ตามจำนวนคน (ชาวบ้านต้องมากกว่าฝ่ายสปายเสมอ)
  P.ucCounts = function (n, withWhite) {
    let uc = n >= 10 ? 3 : n >= 6 ? 2 : 1;
    let white = withWhite && n >= 5 ? 1 : 0;
    if (n - uc - white <= uc + white) white = 0;
    if (n - uc - white <= uc + white) uc = Math.max(1, uc - 1);
    return { uc, white, civ: n - uc - white };
  };

  P.startUndercover = function ({ mrWhite = false } = {}) {
    const players = [...this.players.values()];
    if (players.length < 3) throw new Error('ใครคือสปาย ต้องมีอย่างน้อย 3 คน');
    const counts = this.ucCounts(players.length, mrWhite);

    // เลือกคู่คำ (เลี่ยงคู่ที่เพิ่งเล่น) แล้วสุ่มว่าคำไหนเป็นของชาวบ้าน
    this.usedPairs = this.usedPairs || [];
    let pool = PAIRS.map((p, i) => i).filter((i) => !this.usedPairs.includes(i));
    if (!pool.length) { this.usedPairs = []; pool = PAIRS.map((p, i) => i); }
    const idx = shuffle(pool)[0];
    this.usedPairs.push(idx);
    const [a, b] = shuffle(PAIRS[idx]).map(parseEntry);

    const ids = shuffle(players.map((p) => p.id));
    const roles = {};
    ids.forEach((id, i) => {
      roles[id] = i < counts.uc ? 'uc' : i < counts.uc + counts.white ? 'white' : 'civ';
    });
    for (const p of players) { p.word = null; p.guessedBy = null; }

    const order = shuffle(players.map((p) => p.id));
    // Mr. White ไม่ควรได้ใบ้คนแรก (ยังไม่มีข้อมูลอะไรเลย)
    if (roles[order[0]] === 'white' && order.length > 1) order.push(order.shift());

    this.mode = 'undercover';
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'ใครคือสปาย';
    this.uc = {
      civ: a, spy: b, roles, counts, order,
      alive: order.slice(),
      phase: 'clue',
      roundNo: 1,
      startIdx: 0,
      queue: order.slice(),
      clueIdx: 0,
      clues: [],
      votes: {},
      lastTally: null,
      eliminated: [],
      whiteId: null,
      winner: null,
    };
  };

  P.ucWordFor = function (id) {
    const role = this.uc && this.uc.roles[id];
    if (role === 'civ') return this.uc.civ;
    if (role === 'uc') return this.uc.spy;
    return null;
  };

  P.ucCurrent = function () {
    const u = this.uc;
    if (!u || this.state !== 'playing') return null;
    if (u.phase === 'clue') return u.queue[u.clueIdx] || null;
    if (u.phase === 'white') return u.whiteId;
    return null;
  };

  // ส่งคำใบ้ (เฉพาะคนที่ถึงตา) — ห้ามมีคำของตัวเอง
  P.ucClue = function (id, text) {
    const u = this.uc;
    if (this.mode !== 'undercover' || this.state !== 'playing' || u.phase !== 'clue') throw new Error('ตอนนี้ไม่ใช่รอบใบ้');
    if (this.ucCurrent() !== id) throw new Error('ยังไม่ถึงตาคุณ');
    text = String(text || '').trim().slice(0, 40);
    if (!text) throw new Error('พิมพ์คำใบ้ก่อน');
    const w = this.ucWordFor(id);
    if (w) {
      const n = normalize(text);
      if (w.answers.some((ans) => ans.length >= 2 && n.includes(ans))) throw new Error('🙊 ห้ามพิมพ์คำของตัวเองในคำใบ้!');
    }
    u.clues.push({ round: u.roundNo, id, text });
    this.ucNextClue();
  };

  P.ucNextClue = function () {
    const u = this.uc;
    u.clueIdx += 1;
    // ข้ามคนที่ออกจากห้องไปแล้ว
    while (u.clueIdx < u.queue.length && !u.alive.includes(u.queue[u.clueIdx])) u.clueIdx += 1;
    if (u.clueIdx >= u.queue.length) {
      u.phase = 'vote';
      u.votes = {};
    }
  };

  // ข้ามตา: รอบใบ้ = ข้ามคำใบ้ / รอบ Mr. White = สละสิทธิ์ทาย
  P.ucPass = function (byId) {
    const u = this.uc;
    if (this.state !== 'playing') return false;
    const by = this.players.get(byId);
    if (u.phase === 'clue') {
      const cur = this.ucCurrent();
      const p = this.players.get(cur);
      u.clues.push({ round: u.roundNo, id: cur, text: null });
      this.feed.push({ type: 'pass', name: p ? p.name : '?', by: byId !== cur && by ? by.name : undefined });
      this.ucNextClue();
      return true;
    }
    if (u.phase === 'white') {
      const w = this.players.get(u.whiteId);
      this.feed.push({ type: 'uc-white', name: w ? w.name : 'Mr. White', text: null, correct: false });
      u.whiteId = null;
      this.ucAfterElimination();
      return true;
    }
    return false;
  };

  // โหวต (เปลี่ยนใจได้จนกว่าจะปิดโหวต) — ครบทุกคนที่ยังอยู่และออนไลน์แล้วนับผลทันที
  P.ucVote = function (id, targetId) {
    const u = this.uc;
    if (this.mode !== 'undercover' || this.state !== 'playing' || u.phase !== 'vote') throw new Error('ตอนนี้ไม่ใช่รอบโหวต');
    if (!u.alive.includes(id)) throw new Error('คุณออกจากเกมแล้ว โหวตไม่ได้');
    if (!u.alive.includes(targetId)) throw new Error('โหวตคนนี้ไม่ได้');
    if (targetId === id) throw new Error('โหวตตัวเองไม่ได้');
    u.votes[id] = targetId;
    this.ucCheckVotes();
  };

  P.ucVoters = function () {
    return this.uc.alive.filter((id) => {
      const p = this.players.get(id);
      return p && p.connected;
    });
  };

  P.ucCheckVotes = function () {
    const u = this.uc;
    if (!u || this.state !== 'playing' || u.phase !== 'vote') return false;
    const voters = this.ucVoters();
    if (voters.length && voters.every((id) => u.votes[id])) {
      this.ucResolveVotes();
      return true;
    }
    return false;
  };

  P.ucResolveVotes = function () {
    const u = this.uc;
    const tally = {};
    for (const [voter, target] of Object.entries(u.votes)) {
      if (u.alive.includes(voter) && u.alive.includes(target)) tally[target] = (tally[target] || 0) + 1;
    }
    u.lastTally = tally;
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    u.votes = {};
    if (!max || top.length !== 1) {
      this.feed.push({ type: 'uc-tie' });
      this.ucNextRound();
      return;
    }
    const outId = top[0];
    const role = u.roles[outId];
    const p = this.players.get(outId);
    u.alive = u.alive.filter((id) => id !== outId);
    u.eliminated.push({ id: outId, role, round: u.roundNo, votes: max });
    this.feed.push({ type: 'uc-out', name: p ? p.name : '?', role: ROLE_NAME[role], votes: max });
    if (role === 'white' && p) {
      u.phase = 'white';
      u.whiteId = outId;
      return;
    }
    this.ucAfterElimination();
  };

  // Mr. White ทายคำของชาวบ้าน
  P.ucWhiteGuess = function (id, text) {
    const u = this.uc;
    if (this.state !== 'playing' || u.phase !== 'white' || u.whiteId !== id) throw new Error('ตอนนี้คุณทายไม่ได้');
    text = String(text || '').trim().slice(0, 40);
    if (!text) throw new Error('พิมพ์คำที่ทายก่อน');
    const correct = u.civ.answers.includes(normalize(text));
    const p = this.players.get(id);
    this.feed.push({ type: 'uc-white', name: p ? p.name : 'Mr. White', text, correct });
    u.whiteId = null;
    if (correct) return this.ucFinish('white', id), true;
    this.ucAfterElimination();
    return false;
  };

  P.ucAfterElimination = function () {
    if (!this.ucCheckWin()) this.ucNextRound();
  };

  P.ucCheckWin = function () {
    const u = this.uc;
    const civ = u.alive.filter((id) => u.roles[id] === 'civ').length;
    const imp = u.alive.length - civ;
    if (imp === 0) return this.ucFinish('civ'), true;
    if (civ <= imp) return this.ucFinish('uc'), true;
    return false;
  };

  P.ucNextRound = function () {
    const u = this.uc;
    u.roundNo += 1;
    u.phase = 'clue';
    u.startIdx += 1;
    // เริ่มใบ้จากคนถัดไปในลำดับ (หมุนคนเริ่มทุกรอบ) เฉพาะคนที่ยังอยู่
    const alive = u.order.filter((id) => u.alive.includes(id));
    const s = u.startIdx % alive.length;
    u.queue = alive.slice(s).concat(alive.slice(0, s));
    u.clueIdx = 0;
  };

  P.ucFinish = function (winner, whiteId) {
    const u = this.uc;
    u.phase = 'over';
    u.winner = winner;
    this.state = 'reveal';
    for (const [id, role] of Object.entries(u.roles)) {
      const p = this.players.get(id);
      if (!p) continue;
      let pts = 0;
      if (winner === 'civ' && role === 'civ') pts = PTS.civ;
      if (winner === 'uc' && role !== 'civ') pts = PTS.uc;
      if (winner === 'white' && id === whiteId) pts = PTS.white;
      if (pts) p.score += pts;
    }
    this.feed.push({ type: 'uc-win', winner, pts: PTS[winner] });
  };

  // ผู้เล่นออกจากห้องกลางเกม
  P.ucRemove = function (id) {
    const u = this.uc;
    if (!u || this.state !== 'playing' || !u.roles[id]) return;
    const wasCurrent = this.ucCurrent() === id;
    u.alive = u.alive.filter((x) => x !== id);
    delete u.votes[id];
    for (const [v, t] of Object.entries(u.votes)) if (t === id) delete u.votes[v];
    if (u.phase === 'white' && u.whiteId === id) {
      u.whiteId = null;
      return this.ucAfterElimination();
    }
    if (this.ucCheckWin()) return;
    if (u.phase === 'clue' && wasCurrent) {
      u.clueIdx -= 1;
      this.ucNextClue();
    } else if (u.phase === 'vote') {
      this.ucCheckVotes();
    }
  };

  // เจ้าของตาไม่อยู่ → ข้ามให้ (เรียกจาก server หลังรอสักพัก)
  P.ucAutoSkip = function () {
    const cur = this.players.get(this.ucCurrent());
    if (!cur || cur.connected) return false;
    return this.ucPass(cur.id);
  };

  P.ucView = function (id) {
    const u = this.uc;
    const over = u.phase === 'over';
    const inGame = !!u.roles[id];
    const myRole = u.roles[id];
    const myWord = this.ucWordFor(id);
    const out = u.eliminated.map((e) => e.id);
    const voters = this.ucVoters();
    return {
      phase: u.phase,
      roundNo: u.roundNo,
      inGame,
      amWhite: myRole === 'white',
      myWord: myWord ? myWord.display : null,
      // ฝ่ายของตัวเองรู้เมื่อโดนโหวตออก หรือจบเกม
      myRole: over || out.includes(id) ? myRole : null,
      alive: u.alive,
      clues: u.clues.map((c) => ({ round: c.round, id: c.id, text: c.text })),
      voted: u.phase === 'vote' ? Object.keys(u.votes) : [],
      myVote: u.votes[id] || null,
      voters: u.phase === 'vote' ? voters.length : 0,
      lastTally: u.lastTally,
      eliminated: u.eliminated,
      whiteId: u.whiteId,
      counts: u.counts,
      winner: u.winner,
      roles: over ? u.roles : null,
      civWord: over ? u.civ.display : null,
      spyWord: over ? u.spy.display : null,
    };
  };
}

module.exports = { install, ROLE_NAME };

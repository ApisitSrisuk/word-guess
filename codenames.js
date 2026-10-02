// เกม "Codenames" (ทีมใบ้คำ) — เพิ่มความสามารถให้ Room (เรียก install(Room, helpers) จาก game.js)
//
// กติกา:
// - 2 ทีม แดง/น้ำเงิน ทีมละ 1 หัวหน้า (เห็นสีการ์ดทุกใบ) — กระดาน 25 คำ: ทีมเริ่ม 9, อีกทีม 8, กลาง 7, นักฆ่า 1
// - หัวหน้าใบ้ 1 คำ + ตัวเลข → ลูกทีมเปิดการ์ดได้ไม่เกิน ตัวเลข+1 ใบ
//   เจอสีตัวเอง = ทายต่อ / กลางหรือสีตรงข้าม = จบตา / นักฆ่า = แพ้ทันที
// - เปิดการ์ดสีตัวเองครบก่อน = ชนะ (+3 ทุกคนในทีม)
const PTS_WIN = 3;
const CATS = ['สัตว์', 'ผลไม้', 'สิ่งของ', 'อาชีพ', 'สถานที่', 'ยานพาหนะ', 'กีฬา', 'อาหารไทย', 'ผัก', 'เครื่องดนตรี', 'ตัวละคร', 'ประเทศ', 'เครื่องดื่ม', 'ขนมไทย'];
const TEAM_NAME = { red: '🟥 ทีมแดง', blue: '🟦 ทีมน้ำเงิน' };
const other = (t) => (t === 'red' ? 'blue' : 'red');

function install(Room, { shuffle, normalize, parseEntry, WORDS }) {
  const P = Room.prototype;

  P.startCodenames = function () {
    const players = [...this.players.values()];
    if (players.length < 4) throw new Error('Codenames ต้องมีอย่างน้อย 4 คน (ทีมละ 2)');
    // คำบนกระดาน: 25 คำไม่ซ้ำ สั้นพอใส่การ์ด
    const seen = new Set();
    const pool = shuffle(CATS.flatMap((c) => (WORDS[c] || []).map(parseEntry)))
      .filter((w) => !/\s/.test(w.display) && [...w.display].length <= 12 && !seen.has(w.display) && seen.add(w.display));
    const words = pool.slice(0, 25);
    const first = Math.random() < 0.5 ? 'red' : 'blue';
    const colors = shuffle([
      ...Array(9).fill(first), ...Array(8).fill(other(first)), ...Array(7).fill('neutral'), 'assassin',
    ]);
    // แบ่งทีมให้เท่ากัน + สุ่มหัวหน้า
    const ids = shuffle(players.map((p) => p.id));
    const teams = { red: [], blue: [] };
    ids.forEach((id, i) => teams[i % 2 === 0 ? first : other(first)].push(id));
    for (const p of players) { p.word = null; p.guessedBy = null; }

    this.mode = 'codenames';
    this.uc = null;
    this.ct = null;
    this.ch = null;
    this.dr = null;
    this.state = 'playing';
    this.round += 1;
    this.feed = [];
    this.category = 'Codenames';
    this.cn = {
      cards: words.map((w, i) => ({ word: w.display, answers: w.answers, color: colors[i], revealed: false, by: null })),
      teams,
      spymaster: { red: teams.red[0], blue: teams.blue[0] },
      turn: first,
      first,
      phase: 'clue', // clue → guess → (อีกทีม) clue … / over
      turnNo: 1,
      clue: null, // { team, word, num }
      guessesLeft: 0,
      guessed: 0,
      clues: [], // ประวัติคำใบ้
      winner: null,
      reason: null,
    };
  };

  P.cnTeamOf = function (id) {
    const c = this.cn;
    return c.teams.red.includes(id) ? 'red' : c.teams.blue.includes(id) ? 'blue' : null;
  };
  P.cnRemaining = function (team) {
    return this.cn.cards.filter((k) => k.color === team && !k.revealed).length;
  };

  P.cnGiveClue = function (id, word, num) {
    const c = this.cn;
    if (this.mode !== 'codenames' || this.state !== 'playing' || c.phase !== 'clue') throw new Error('ตอนนี้ยังใบ้ไม่ได้');
    if (c.spymaster[c.turn] !== id) throw new Error('เฉพาะหัวหน้าทีมที่ถึงตาเท่านั้น');
    word = String(word || '').trim().slice(0, 30);
    num = Number(num);
    if (!word) throw new Error('พิมพ์คำใบ้ก่อน');
    if (/\s/.test(word)) throw new Error('ใบ้ได้แค่ 1 คำ (ห้ามเว้นวรรค)');
    if (!Number.isInteger(num) || num < 1 || num > 9) throw new Error('ตัวเลขต้องเป็น 1–9');
    const n = normalize(word);
    const clash = c.cards.find((k) => !k.revealed && k.answers.some((a) => a === n || (a.length >= 2 && n.includes(a)) || (n.length >= 2 && a.includes(n))));
    if (clash) throw new Error(`🙊 คำใบ้ห้ามซ้ำหรือเป็นส่วนของคำบนกระดาน ("${clash.word}")`);
    c.clue = { team: c.turn, word, num };
    c.clues.push({ team: c.turn, word, num });
    c.guessesLeft = num + 1;
    c.guessed = 0;
    c.phase = 'guess';
  };

  // ลูกทีมเปิดการ์ด — คืนสีที่เปิดได้
  P.cnPick = function (id, index) {
    const c = this.cn;
    if (this.mode !== 'codenames' || this.state !== 'playing' || c.phase !== 'guess') throw new Error('ตอนนี้ยังเปิดการ์ดไม่ได้');
    if (this.cnTeamOf(id) !== c.turn) throw new Error('ยังไม่ถึงตาทีมคุณ');
    if (c.spymaster[c.turn] === id) throw new Error('หัวหน้าเปิดการ์ดไม่ได้ ให้ลูกทีมเลือก');
    const card = c.cards[Number(index)];
    if (!card || card.revealed) throw new Error('เปิดการ์ดใบนี้ไม่ได้');
    card.revealed = true;
    card.by = id;
    c.guessed += 1;
    c.guessesLeft -= 1;
    const p = this.players.get(id);
    this.feed.push({ type: 'cn-pick', name: p ? p.name : '?', team: c.turn, word: card.word, color: card.color });
    if (card.color === 'assassin') {
      this.cnFinish(other(c.turn), 'assassin');
      return card.color;
    }
    // ใครเปิดครบก่อนชนะ (เปิดสีตรงข้ามจนครบก็นับให้ทีมนั้น)
    for (const t of ['red', 'blue']) {
      if (this.cnRemaining(t) === 0) {
        this.cnFinish(t, 'cleared');
        return card.color;
      }
    }
    if (card.color !== c.turn || c.guessesLeft <= 0) this.cnEndTurn();
    return card.color;
  };

  P.cnEndTurn = function () {
    const c = this.cn;
    if (c.phase === 'over') return;
    c.turn = other(c.turn);
    c.phase = 'clue';
    c.clue = null;
    c.guessesLeft = 0;
    c.guessed = 0;
    c.turnNo += 1;
  };

  P.cnPass = function (id) {
    const c = this.cn;
    if (this.state !== 'playing' || c.phase === 'over') return false;
    const p = this.players.get(id);
    this.feed.push({ type: 'cn-pass', team: c.turn, name: p ? p.name : null, phase: c.phase });
    this.cnEndTurn();
    return true;
  };

  P.cnFinish = function (winner, reason) {
    const c = this.cn;
    c.phase = 'over';
    c.winner = winner;
    c.reason = reason;
    this.state = 'reveal';
    if (winner) {
      for (const id of c.teams[winner]) {
        const p = this.players.get(id);
        if (p) p.score += PTS_WIN;
      }
    }
    this.feed.push({ type: 'cn-over', winner, reason });
  };

  P.cnCurrent = function () {
    const c = this.cn;
    if (!c || this.state !== 'playing') return null;
    return c.phase === 'clue' ? c.spymaster[c.turn] : null;
  };

  P.cnAutoSkip = function () {
    const c = this.cn;
    if (c.phase === 'clue') {
      const sm = this.players.get(c.spymaster[c.turn]);
      if (sm && !sm.connected) return this.cnPass(null);
      return false;
    }
    if (c.phase === 'guess') {
      const ops = c.teams[c.turn].filter((id) => id !== c.spymaster[c.turn]).map((id) => this.players.get(id));
      if (ops.length && ops.every((p) => !p || !p.connected)) return this.cnPass(null);
    }
    return false;
  };

  P.cnAddPlayer = function (id) {
    const c = this.cn;
    if (!c || this.state !== 'playing') return;
    // เข้ามากลางเกม → ลงทีมที่คนน้อยกว่า เป็นลูกทีม
    const t = c.teams.red.length <= c.teams.blue.length ? 'red' : 'blue';
    c.teams[t].push(id);
  };

  P.cnRemove = function (id) {
    const c = this.cn;
    if (!c || this.state !== 'playing') return;
    const t = this.cnTeamOf(id);
    if (!t) return;
    c.teams[t] = c.teams[t].filter((x) => x !== id);
    if (!c.teams[t].length) return this.cnFinish(other(t), 'empty');
    if (c.spymaster[t] === id) {
      // หัวหน้าออก → ให้ลูกทีมคนแรกเป็นหัวหน้าแทน
      c.spymaster[t] = c.teams[t][0];
    }
  };

  P.cnView = function (id) {
    const c = this.cn;
    const over = c.phase === 'over';
    const team = this.cnTeamOf(id);
    const amSpymaster = team && c.spymaster[team] === id;
    return {
      phase: c.phase,
      turn: c.turn,
      first: c.first,
      myTeam: team,
      amSpymaster,
      spymaster: c.spymaster,
      teams: c.teams,
      cards: c.cards.map((k) => ({
        word: k.word,
        revealed: k.revealed,
        // สีการ์ด: หัวหน้าเห็นทุกใบ / คนอื่นเห็นเฉพาะใบที่เปิดแล้ว / จบเกมเห็นหมด
        color: k.revealed || amSpymaster || over ? k.color : null,
      })),
      clue: c.clue,
      clues: c.clues,
      guessesLeft: c.guessesLeft,
      remaining: { red: this.cnRemaining('red'), blue: this.cnRemaining('blue') },
      winner: c.winner,
      reason: c.reason,
      turnNo: c.turnNo,
    };
  };
}

module.exports = { install, TEAM_NAME };

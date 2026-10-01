// ทดสอบเกม "ใครคือสปาย": node test-undercover.js
const assert = require('assert');
const { Room, normalize } = require('./game');
const PAIRS = require('./pairs');

// คู่คำ: สองคำต้องไม่เหมือนกัน
for (const [a, b] of PAIRS) {
  assert.notStrictEqual(normalize(a.split('|')[0]), normalize(b.split('|')[0]), `คู่คำซ้ำ ${a}/${b}`);
}
assert.ok(PAIRS.length >= 100);

// จำนวนสปายตามจำนวนคน + ชาวบ้านมากกว่าฝ่ายสปายเสมอ
const r0 = new Room('C');
for (let n = 3; n <= 14; n++) {
  for (const w of [false, true]) {
    const c = r0.ucCounts(n, w);
    assert.strictEqual(c.uc + c.white + c.civ, n);
    assert.ok(c.civ > c.uc + c.white, `n=${n} white=${w}`);
    assert.ok(c.uc >= 1);
  }
}
assert.strictEqual(r0.ucCounts(5, true).white, 1);
assert.strictEqual(r0.ucCounts(4, true).white, 0, 'Mr. White ต้อง 5 คนขึ้นไป');
assert.strictEqual(r0.ucCounts(6, false).uc, 2);

function setup(n, roles) {
  const r = new Room('U');
  const ids = [];
  for (let i = 0; i < n; i++) { r.addPlayer('p' + i, 'คน' + i); ids.push('p' + i); }
  r.startUndercover({ mrWhite: roles.includes('white') });
  // บังคับบทและลำดับให้เทสต์แน่นอน
  r.uc.roles = Object.fromEntries(ids.map((id, i) => [id, roles[i]]));
  r.uc.order = ids.slice();
  r.uc.alive = ids.slice();
  r.uc.queue = ids.slice();
  r.uc.clueIdx = 0;
  r.uc.civ = { display: 'ทุเรียน', answers: ['ทุเรียน'] };
  r.uc.spy = { display: 'ขนุน', answers: ['ขนุน'] };
  return r;
}
const clueAll = (r) => {
  while (r.uc.phase === 'clue') r.ucClue(r.ucCurrent(), 'ใบ้' + r.ucCurrent());
};

// ---- เริ่มเกม: แต่ละคนเห็นแค่คำตัวเอง ไม่รู้ฝ่าย
{
  const r = new Room('V');
  for (let i = 0; i < 6; i++) r.addPlayer('p' + i, 'คน' + i);
  assert.throws(() => new Room('X').startUndercover(), /3 คน/);
  r.startUndercover();
  const roles = Object.values(r.uc.roles);
  assert.strictEqual(roles.filter((x) => x === 'uc').length, 2);
  const v = r.viewFor('p0');
  assert.strictEqual(v.mode, 'undercover');
  assert.ok(v.uc.myWord);
  assert.strictEqual(v.uc.myRole, null, 'ไม่รู้ฝ่ายตัวเอง');
  assert.strictEqual(v.uc.roles, null, 'ไม่เห็นฝ่ายของคนอื่น');
  assert.ok(v.players.every((p) => p.word === null), 'ไม่เห็นคำของคนอื่น');
}

// ---- ใบ้ตามตา + ห้ามใบ้คำตัวเอง + ชาวบ้านชนะ
{
  const r = setup(4, ['civ', 'civ', 'uc', 'civ']);
  assert.throws(() => r.ucClue('p1', 'x'), /ยังไม่ถึงตา/);
  assert.throws(() => r.ucClue('p0', 'ทุ เรียน'), /ห้ามพิมพ์คำของตัวเอง/);
  r.ucClue('p0', 'มีหนาม');
  assert.strictEqual(r.currentTurnId(), 'p1');
  assert.ok(r.pass('p3'), 'คนอื่นกดข้ามตาให้ได้');
  assert.strictEqual(r.uc.clues[1].text, null);
  clueAll(r);
  assert.strictEqual(r.uc.phase, 'vote');
  assert.throws(() => r.ucVote('p0', 'p0'), /ตัวเอง/);
  r.ucVote('p0', 'p2');
  r.ucVote('p1', 'p2');
  r.ucVote('p2', 'p0');
  assert.strictEqual(r.uc.phase, 'vote', 'ยังโหวตไม่ครบ');
  r.ucVote('p3', 'p2');
  assert.strictEqual(r.state, 'reveal');
  assert.strictEqual(r.uc.winner, 'civ');
  assert.strictEqual(r.players.get('p0').score, 2);
  assert.strictEqual(r.players.get('p2').score, 0);
  const v = r.viewFor('p2');
  assert.strictEqual(v.uc.civWord, 'ทุเรียน');
  assert.strictEqual(v.uc.roles.p2, 'uc');
}

// ---- โหวตเสมอ = ไม่มีใครออก ไปรอบใบ้ใหม่ (คนเริ่มหมุน)
{
  const r = setup(4, ['civ', 'civ', 'uc', 'civ']);
  clueAll(r);
  r.ucVote('p0', 'p1'); r.ucVote('p1', 'p0'); r.ucVote('p2', 'p3'); r.ucVote('p3', 'p2');
  assert.strictEqual(r.uc.phase, 'clue');
  assert.strictEqual(r.uc.roundNo, 2);
  assert.strictEqual(r.uc.alive.length, 4);
  assert.strictEqual(r.currentTurnId(), 'p1', 'รอบใหม่เริ่มคนถัดไป');
}

// ---- สปายชนะเมื่อเหลือเท่ากับชาวบ้าน
{
  const r = setup(3, ['civ', 'uc', 'civ']);
  clueAll(r);
  r.ucVote('p0', 'p2'); r.ucVote('p1', 'p2'); r.ucVote('p2', 'p0');
  assert.strictEqual(r.uc.winner, 'uc');
  assert.strictEqual(r.players.get('p1').score, 5);
}

// ---- Mr. White โดนโหวตออกแล้วทายถูก = ชนะคนเดียว / ทายผิด = เกมเดินต่อ
{
  const r = setup(5, ['civ', 'civ', 'white', 'uc', 'civ']);
  assert.strictEqual(r.viewFor('p2').uc.amWhite, true);
  assert.strictEqual(r.viewFor('p2').uc.myWord, null);
  clueAll(r);
  for (const v of ['p0', 'p1', 'p3', 'p4']) r.ucVote(v, 'p2');
  r.ucVote('p2', 'p0');
  assert.strictEqual(r.uc.phase, 'white');
  assert.strictEqual(r.currentTurnId(), 'p2');
  assert.throws(() => r.ucWhiteGuess('p0', 'x'));
  assert.strictEqual(r.ucWhiteGuess('p2', 'ทุเรียน'), true);
  assert.strictEqual(r.uc.winner, 'white');
  assert.strictEqual(r.players.get('p2').score, 6);
}
{
  const r = setup(5, ['civ', 'civ', 'white', 'uc', 'civ']);
  clueAll(r);
  for (const v of ['p0', 'p1', 'p3', 'p4']) r.ucVote(v, 'p2');
  r.ucVote('p2', 'p0');
  assert.strictEqual(r.ucWhiteGuess('p2', 'ขนุน'), false);
  assert.strictEqual(r.state, 'playing', 'สปายยังอยู่ เกมเดินต่อ');
  assert.strictEqual(r.uc.phase, 'clue');
}

// ---- คนหลุดตอนโหวต → นับเฉพาะคนที่ออนไลน์ / ออกจากห้องกลางเกม
{
  const r = setup(4, ['civ', 'civ', 'uc', 'civ']);
  clueAll(r);
  r.ucVote('p0', 'p2'); r.ucVote('p1', 'p2'); r.ucVote('p2', 'p0');
  assert.strictEqual(r.uc.phase, 'vote', 'รอ p3');
  r.players.get('p3').connected = false;
  assert.ok(r.onPresenceChange(), 'p3 หลุด → ไม่ต้องรอ นับผลเลย');
  assert.strictEqual(r.uc.winner, 'civ');
}
{
  const r = setup(4, ['civ', 'civ', 'uc', 'civ']);
  r.removePlayer('p0');
  assert.strictEqual(r.currentTurnId(), 'p1', 'คนถึงตาออก → ตาไปคนถัดไป');
  r.removePlayer('p2');
  assert.strictEqual(r.uc.winner, 'civ', 'สปายออกจากห้อง → ชาวบ้านชนะ');
}

// ---- เข้าห้องกลางเกม = ดูไปก่อน / แชทห้ามพิมพ์คำตัวเอง / กลับไปเล่นทายคำได้
{
  const r = setup(4, ['civ', 'civ', 'uc', 'civ']);
  r.addPlayer('p9', 'มาสาย');
  const v = r.viewFor('p9');
  assert.strictEqual(v.uc.inGame, false);
  assert.strictEqual(v.uc.myWord, null);
  assert.throws(() => r.addChat('p0', 'ทุเรียนนะ'), /ห้ามพิมพ์คำลับ/);
  assert.ok(r.addChat('p9', 'ทุเรียน'));
  r.endRound();
  assert.strictEqual(r.state, 'reveal');
  r.start('ผลไม้');
  assert.strictEqual(r.mode, 'guess');
  assert.ok(r.players.get('p9').word);
}

console.log('ใครคือสปาย ผ่านทุกเทสต์ ✅');

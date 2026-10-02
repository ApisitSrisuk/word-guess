// ทดสอบเกม "Codenames": node test-codenames.js
const assert = require('assert');
const { Room } = require('./game');

// ตั้งเกม 4 คน: แดง = p0 (หัวหน้า), p2 / น้ำเงิน = p1 (หัวหน้า), p3 · แดงเริ่ม
function setup() {
  const r = new Room('C');
  for (let i = 0; i < 4; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startCodenames();
  const c = r.cn;
  c.teams = { red: ['p0', 'p2'], blue: ['p1', 'p3'] };
  c.spymaster = { red: 'p0', blue: 'p1' };
  c.turn = 'red';
  c.first = 'red';
  // สีการ์ดแบบกำหนดเอง: 0-8 แดง, 9-16 น้ำเงิน, 17-23 กลาง, 24 นักฆ่า
  c.cards.forEach((k, i) => (k.color = i < 9 ? 'red' : i < 17 ? 'blue' : i < 24 ? 'neutral' : 'assassin'));
  return r;
}
const idx = (r, color) => r.cn.cards.findIndex((k) => k.color === color && !k.revealed);

// ---- เริ่มเกม: 25 คำไม่ซ้ำ / 9-8-7-1 / ทีมเท่ากัน / หัวหน้าเห็นสี ลูกทีมไม่เห็น
{
  const r = new Room('S');
  for (let i = 0; i < 3; i++) r.addPlayer('p' + i, 'คน' + i);
  assert.throws(() => r.startCodenames(), /4 คน/);
  r.addPlayer('p3', 'คน3');
  r.addPlayer('p4', 'คน4');
  r.startCodenames();
  const c = r.cn;
  assert.strictEqual(c.cards.length, 25);
  assert.strictEqual(new Set(c.cards.map((k) => k.word)).size, 25, 'คำไม่ซ้ำ');
  const count = (col) => c.cards.filter((k) => k.color === col).length;
  assert.strictEqual(count(c.first), 9);
  assert.strictEqual(count(c.first === 'red' ? 'blue' : 'red'), 8);
  assert.strictEqual(count('neutral'), 7);
  assert.strictEqual(count('assassin'), 1);
  assert.ok(Math.abs(c.teams.red.length - c.teams.blue.length) <= 1, 'ทีมเท่ากัน');
  assert.strictEqual(c.teams[c.first].length, 3, 'ทีมที่เริ่มได้คนเกิน (ทำงานหนักกว่า)');
  const sm = c.spymaster.red;
  const op = c.teams.red.find((x) => x !== sm);
  assert.ok(r.viewFor(sm).cn.cards.every((k) => k.color), 'หัวหน้าเห็นสีทุกใบ');
  assert.ok(r.viewFor(op).cn.cards.every((k) => k.color === null), 'ลูกทีมไม่เห็นสี');
}

// ---- ใบ้: เฉพาะหัวหน้าทีมที่ถึงตา / 1 คำ / เลข 1–9 / ห้ามใช้คำบนกระดาน
{
  const r = setup();
  const board = r.cn.cards[0].word;
  assert.throws(() => r.cnGiveClue('p1', 'อะไร', 1), /หัวหน้าทีมที่ถึงตา/);
  assert.throws(() => r.cnGiveClue('p2', 'อะไร', 1), /หัวหน้าทีมที่ถึงตา/);
  assert.throws(() => r.cnGiveClue('p0', 'สอง คำ', 1), /1 คำ/);
  assert.throws(() => r.cnGiveClue('p0', 'ดี', 0), /1–9/);
  assert.throws(() => r.cnGiveClue('p0', board, 1), /ห้ามซ้ำ/);
  assert.throws(() => r.addChat('p0', 'ใบ้ให้นะ'), /หัวหน้าห้ามคุย/, 'หัวหน้าห้ามแชท');
  assert.ok(r.addChat('p2', 'คิดว่าใบไหนดี'), 'ลูกทีมคุยได้');
  r.cnGiveClue('p0', 'ทดสอบ', 2);
  assert.strictEqual(r.cn.phase, 'guess');
  assert.strictEqual(r.cn.guessesLeft, 3, 'ทายได้ ตัวเลข+1');
  assert.deepStrictEqual(r.viewFor('p3').cn.clue, { team: 'red', word: 'ทดสอบ', num: 2 }, 'ทุกคนเห็นคำใบ้');
}

// ---- เปิดการ์ด: สีตัวเอง = ต่อ / ครบโควตา = จบตา / กลาง = จบตา / หัวหน้าเปิดไม่ได้ / อีกทีมเปิดไม่ได้
{
  const r = setup();
  r.cnGiveClue('p0', 'ทดสอบ', 1);
  assert.throws(() => r.cnPick('p0', 0), /หัวหน้าเปิด/);
  assert.throws(() => r.cnPick('p3', 0), /ยังไม่ถึงตาทีมคุณ/);
  assert.strictEqual(r.cnPick('p2', idx(r, 'red')), 'red');
  assert.strictEqual(r.cn.turn, 'red', 'ถูก → ทายต่อ');
  assert.throws(() => r.cnPick('p2', 0), /เปิดการ์ดใบนี้ไม่ได้/, 'ใบที่เปิดแล้วเปิดซ้ำไม่ได้');
  r.cnPick('p2', idx(r, 'red'));
  assert.strictEqual(r.cn.turn, 'blue', 'ครบ ตัวเลข+1 → จบตา');
  assert.strictEqual(r.cn.phase, 'clue');
  r.cnGiveClue('p1', 'อีกคำ', 3);
  assert.strictEqual(r.cnPick('p3', idx(r, 'neutral')), 'neutral');
  assert.strictEqual(r.cn.turn, 'red', 'เปิดใบกลาง → จบตา');
  assert.strictEqual(r.viewFor('p2').cn.remaining.red, 7);
}

// ---- นักฆ่า = แพ้ทันที / เปิดสีตรงข้ามจนครบ = ทีมนั้นชนะ / จบตาเอง
{
  const r = setup();
  r.cnGiveClue('p0', 'ทดสอบ', 1);
  r.cnPick('p2', idx(r, 'assassin'));
  assert.strictEqual(r.cn.winner, 'blue');
  assert.strictEqual(r.cn.reason, 'assassin');
  assert.strictEqual(r.players.get('p3').score, 3);
  assert.strictEqual(r.players.get('p2').score, 0);
  assert.ok(r.viewFor('p2').cn.cards.every((k) => k.color), 'จบเกมเห็นสีทุกใบ');
}
{
  const r = setup();
  // แดงเปิดครบ 9 ใบ → ชนะ
  for (let t = 0; t < 5; t++) {
    if (r.cn.turn === 'blue') { r.cnGiveClue('p1', 'ข้าม' + t, 1); r.pass('p3'); }
    r.cnGiveClue('p0', 'ใบ้' + t, 2);
    for (let k = 0; k < 3 && r.cn.phase === 'guess'; k++) r.cnPick('p2', idx(r, 'red'));
    if (r.cn.phase === 'over') break;
  }
  assert.strictEqual(r.cn.winner, 'red');
  assert.strictEqual(r.cn.reason, 'cleared');
}
{
  const r = setup();
  r.cnGiveClue('p0', 'ทดสอบ', 2);
  r.cnPick('p2', idx(r, 'red'));
  assert.ok(r.pass('p2'), 'ลูกทีมกดจบตาเองได้');
  assert.strictEqual(r.cn.turn, 'blue');
}

// ---- หมดเวลา / หัวหน้าออก → ลูกทีมเป็นแทน / เข้ากลางเกม → ลงทีมคนน้อย / แชทล้างตอนเปลี่ยนทีม
{
  const r = setup();
  r.turnLimit = 60;
  const k1 = r.chatKey();
  assert.ok(r.timerKey());
  r.timeoutTurn();
  assert.strictEqual(r.cn.turn, 'blue', 'หมดเวลา → อีกทีม');
  assert.notStrictEqual(r.chatKey(), k1);
  r.removePlayer('p1');
  assert.strictEqual(r.cn.spymaster.blue, 'p3');
  r.addPlayer('p9', 'มาสาย');
  assert.ok(r.cn.teams.blue.includes('p9'));
  r.removePlayer('p3');
  r.removePlayer('p9');
  assert.strictEqual(r.cn.winner, 'red', 'ทีมว่าง → อีกทีมชนะ');
}

console.log('Codenames ผ่านทุกเทสต์ ✅');

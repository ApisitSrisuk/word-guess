// ทดสอบเกม "วาดภาพทายคำ": node test-draw.js
const assert = require('assert');
const { Room } = require('./game');

function setup(n = 3, category = 'สัตว์') {
  const r = new Room('D');
  for (let i = 0; i < n; i++) r.addPlayer('p' + i, 'คน' + i);
  r.startDraw(category);
  r.dr.order = r.dr.order.slice().sort(); // p0, p1, p2 …
  r.dr.idx = 0;
  r.dr.drawerId = 'p0';
  return r;
}
const pick = (r, display) => {
  r.dr.choices = [{ display, answers: [display] }, { display: 'x', answers: ['x'] }, { display: 'y', answers: ['y'] }];
  r.drChoose(r.dr.drawerId, 0);
};

// ---- เริ่มเกม / เลือกคำ: คนวาดเห็นตัวเลือก คนอื่นไม่เห็น
{
  const r = new Room('S');
  r.addPlayer('a', 'เอ');
  assert.throws(() => r.startDraw(), /2 คน/);
  r.addPlayer('b', 'บี');
  r.startDraw('random');
  assert.ok(!['จังหวัด', 'ประเทศ'].includes(r.dr.category), 'สุ่มไม่เอาหมวดวาดยาก');
  const drawer = r.dr.drawerId;
  const other = drawer === 'a' ? 'b' : 'a';
  assert.strictEqual(r.viewFor(drawer).dr.choices.length, 3);
  assert.strictEqual(r.viewFor(other).dr.choices.length, 0);
  assert.throws(() => r.drChoose(other, 0), /ยังไม่ถึงตา/);
  r.drChoose(drawer, 1);
  assert.strictEqual(r.dr.phase, 'draw');
  assert.ok(r.viewFor(drawer).dr.word);
  assert.strictEqual(r.viewFor(other).dr.word, null, 'คนทายไม่เห็นคำ');
  assert.ok(r.viewFor(other).dr.wordLen > 0, 'เห็นจำนวนตัวอักษร');
}

// ---- จำนวนตัวอักษรนับแบบ grapheme (สระ/วรรณยุกต์ไทยไม่นับแยก)
{
  const r = setup();
  pick(r, 'แมว');
  assert.strictEqual(r.viewFor('p1').dr.wordLen, 3);
}

// ---- วาด: เฉพาะคนวาด / ตรวจข้อมูล / undo / clear
{
  const r = setup();
  assert.strictEqual(r.drStroke('p0', { op: 'begin', id: 's1', c: '#000000', w: 0.01, p: [0.1, 0.1] }), false, 'ยังไม่ได้เลือกคำ วาดไม่ได้');
  pick(r, 'แมว');
  assert.strictEqual(r.drStroke('p1', { op: 'begin', id: 's1', c: '#000000', w: 0.01, p: [0.1, 0.1] }), false, 'คนทายวาดไม่ได้');
  assert.ok(r.drStroke('p0', { op: 'begin', id: 's1', c: '#000000', w: 0.01, p: [0.1, 0.1] }));
  assert.ok(r.drStroke('p0', { op: 'pts', id: 's1', p: [0.2, 0.2, 0.3, 0.3] }));
  assert.strictEqual(r.drStroke('p0', { op: 'pts', id: 's1', p: [2, 0.2] }), false, 'พิกัดเกินกรอบ');
  assert.strictEqual(r.drStroke('p0', { op: 'begin', id: 's2', c: 'red', w: 0.01, p: [0, 0] }), false, 'สีต้องเป็น #rrggbb');
  assert.strictEqual(r.dr.strokes[0].p.length, 6);
  r.drStroke('p0', { op: 'begin', id: 's2', c: '#ff0000', w: 0.02, p: [0.5, 0.5] });
  r.drStroke('p0', { op: 'undo' });
  assert.strictEqual(r.dr.strokes.length, 1);
  r.drStroke('p0', { op: 'clear' });
  assert.strictEqual(r.dr.strokes.length, 0);
}

// ---- ทาย: คะแนนตามลำดับ / คนวาดได้ +1 ต่อคนถูก / ทุกคนถูก = จบตา
{
  const r = setup(4);
  pick(r, 'แมว');
  assert.strictEqual(r.drGuess('p0', 'แมว'), null, 'คนวาดไม่ใช่คนทาย');
  assert.throws(() => r.addChat('p0', 'คำคือแมวนะ'), /ห้ามพิมพ์คำลับ/, 'คนวาดห้ามพิมพ์คำ');
  assert.strictEqual(r.drGuess('p1', 'หมา'), false);
  assert.strictEqual(r.drGuess('p1', 'แมว'), true);
  assert.throws(() => r.drGuess('p1', 'แมว'), /ทายถูกไปแล้ว/, 'ถูกแล้วห้ามบอกคำ');
  assert.strictEqual(r.drGuess('p1', 'ง่ายมาก'), null, 'ถูกแล้วคุยเรื่องอื่นได้');
  assert.strictEqual(r.viewFor('p1').dr.word, 'แมว', 'ทายถูกแล้วเห็นคำ');
  assert.strictEqual(r.viewFor('p2').dr.word, null);
  r.drGuess('p2', 'แมว');
  assert.strictEqual(r.players.get('p1').score, 5);
  assert.strictEqual(r.players.get('p2').score, 4);
  assert.strictEqual(r.dr.phase, 'draw', 'ยังเหลือ p3');
  r.drGuess('p3', ' แ มว ');
  assert.strictEqual(r.players.get('p3').score, 3);
  assert.strictEqual(r.players.get('p0').score, 3, 'คนวาด +1 x 3 คน');
  assert.strictEqual(r.dr.phase, 'reveal', 'ทุกคนถูก → เฉลย');
  assert.strictEqual(r.viewFor('p2').dr.word, 'แมว');
}

// ---- หมดเวลา: เลือกคำให้ / จบตา / ไปคนถัดไป / วาดครบทุกคน = จบเกม
{
  const r = setup(2);
  r.turnLimit = 60;
  assert.strictEqual(r.timerMs(), 15000, 'เลือกคำ 15 วิ');
  r.timeoutTurn(); // เลือกคำให้
  assert.strictEqual(r.dr.phase, 'draw');
  assert.strictEqual(r.timerMs(), 60000, 'วาดตามเวลาต่อตา');
  r.timeoutTurn(); // หมดเวลาวาด
  assert.strictEqual(r.dr.phase, 'reveal');
  assert.strictEqual(r.timerMs(), 4000);
  r.timeoutTurn(); // คนถัดไป
  assert.strictEqual(r.dr.drawerId, 'p1');
  assert.strictEqual(r.dr.phase, 'choose');
  assert.strictEqual(r.dr.strokes.length, 0, 'ตาใหม่ภาพว่าง');
  assert.ok(r.pass('p0'), 'คนอื่นกดจบตาได้');
  assert.strictEqual(r.dr.phase, 'reveal');
  r.timeoutTurn();
  assert.strictEqual(r.state, 'reveal', 'วาดครบทุกคน → จบเกม');
  assert.strictEqual(r.dr.phase, 'over');
}

// ---- ไม่จับเวลา: ช่วงวาดไม่มีเวลา แต่เลือกคำ/เฉลยยังเดิน
{
  const r = setup(2);
  r.turnLimit = 0;
  assert.ok(r.timerKey());
  pick(r, 'แมว');
  assert.strictEqual(r.timerKey(), null);
}

// ---- คนวาดออก → จบตา / เข้ามากลางเกม = ได้วาดตอนท้าย / แชทล้างทุกตาวาด
{
  const r = setup(3);
  pick(r, 'แมว');
  const k = r.chatKey();
  r.addPlayer('p9', 'มาสาย');
  assert.ok(r.dr.order.includes('p9'));
  r.removePlayer('p0');
  assert.strictEqual(r.dr.phase, 'reveal');
  r.timeoutTurn();
  assert.notStrictEqual(r.chatKey(), k);
}

console.log('วาดภาพทายคำ ผ่านทุกเทสต์ ✅');

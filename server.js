// เซิร์ฟเวอร์เกม (Socket.IO) — deploy บน Render หรือรันในเครื่องด้วย npm start
// ห้องเก็บในหน่วยความจำ: เซิร์ฟเวอร์เดียว เปิดค้างไว้ ส่งข้อมูลสดถึงทุกคนทันที
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Room } = require('./game');

const PORT = process.env.PORT || 3456;
const GRACE_MS = Number(process.env.GRACE_MS) || 10 * 60 * 1000; // หลุดเกินนี้ = เอาออกจากห้อง (ที่นั่ง/คำ/คะแนนเก็บไว้ให้จนถึงตอนนั้น)
const AWAY_SKIP_MS = Number(process.env.AWAY_SKIP_MS) || 30 * 1000; // ถึงตาแต่หลุดเกินนี้ = ข้ามตาให้อัตโนมัติ
const CHAT_GAP_MS = 400;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));
const server = http.createServer(app);
// มือถือพับจอ/สลับแอปบ่อย → ping ห่างขึ้นหน่อย กันหลุดง่ายเกิน
const io = new Server(server, { pingInterval: 20000, pingTimeout: 25000 });

const rooms = new Map(); // code -> Room
const socketsOf = new Map(); // playerId -> socket
const timers = new Map(); // playerId -> { remove, skip }

class GameError extends Error {}
const MODES = ['guess', 'undercover', 'center', 'cheese', 'draw', 'codenames', 'liar', 'timeline', 'sheriff', 'poker', 'oldmaid', 'hues'];

// จับเวลาต่อตา: ตาเปลี่ยนเมื่อไหร่ เริ่มนับใหม่ หมดเวลา = ข้ามตา
function syncTimer(room) {
  const key = room.timerKey();
  if (key === room._timerKey) return;
  clearTimeout(room._timer);
  room._timerKey = key;
  const ms = key ? room.timerMs() : 0;
  room.turnEndsAt = key ? Date.now() + ms : null;
  room.turnTotalMs = key ? ms : null;
  if (!key) return;
  room._timer = setTimeout(() => {
    if (room.timerKey() !== key) return;
    if (room.timeoutTurn()) broadcast(room);
  }, ms);
}

// เปลี่ยนตา → ล้างแชทของทุกคน แล้วบอกว่าตาใคร
function syncTurn(room) {
  const key = room.chatKey();
  if (key === room._turnKey) return;
  room._turnKey = key;
  if (!key) return;
  room.clearChat();
  io.to(room.code).emit('sync', { clearChat: true });
  let label;
  if (room.mode === 'hues') {
    const g = room.players.get(room.hc.giver);
    label = `🎨 ตาของ ${g ? g.name : '?'} ใบ้สี — คนใบ้ห้ามคุยในแชทนะ`;
  } else if (room.mode === 'oldmaid') {
    label = '👵 แจกไพ่แล้ว! ทิ้งคู่ให้อัตโนมัติ — ระวังได้อีแก่นะ 😹';
  } else if (room.mode === 'poker') {
    label = `🃏 มือที่ ${room.pk.handNo} — แจกไพ่แล้ว! 😺`;
  } else if (room.mode === 'sheriff') {
    const sh = room.players.get(room.shSheriff());
    if (room.sh.phase === 'pack') label = `🧳 รอบ ${room.sh.roundNo}: พ่อค้าแพ็กกระเป๋า — ผู้ตรวจการคือ ${sh ? sh.name : '?'}`;
    else {
      const m = room.players.get(room.shCurrentMerchant());
      label = `👮 ตรวจกระเป๋าของ ${m ? m.name : '?'} — อ้อน/ต่อรองได้เลย!`;
    }
  } else if (room.mode === 'timeline') {
    const cur = room.players.get(room.tl.order[room.tl.idx]);
    label = `📅 ตาของ ${cur ? cur.name : '?'} — วางเหตุการณ์ลงไทม์ไลน์`;
  } else if (room.mode === 'liar') {
    if (room.lie.phase === 'reveal') label = '🎲 เปิดเต๋า! ดูผลกัน';
    else {
      const cur = room.players.get(room.lieCurrent());
      label = `🎲 ตาของ ${cur ? cur.name : '?'} — ประกาศหรือกด "โกหก!"`;
    }
  } else if (room.mode === 'codenames') {
    const team = room.cn.turn === 'red' ? '🟥 ทีมแดง' : '🟦 ทีมน้ำเงิน';
    label = `${team} ถึงตา — หัวหน้าใบ้ได้เลย (ลูกทีมคุยกันในนี้ได้)`;
  } else if (room.mode === 'draw') {
    const d = room.players.get(room.dr.drawerId);
    label = `🎨 ตาของ ${d ? d.name : '?'} วาด — พิมพ์ทายได้เลย!`;
  } else if (room.mode === 'cheese') {
    label = { roll: '🎲 ทอยเต๋าลับกันก่อน — อย่าบอกใครนะ!', look: '👀 จำเลขเต๋าของตัวเองไว้ — อีกเดี๋ยวเข้ากลางคืน', night: '🌙 กลางคืนแล้ว… ทุกคนหลับ ห้ามคุย 🤫', day: '☀️ เช้าแล้ว! ชีสหายไป 🧀 ใครขโมย? คุยกันแล้วโหวต' }[room.ch.phase];
    if (!label) return;
  } else if (room.mode === 'center') {
    const cur = room.players.get(room.ctAsker());
    label = `❓ ตาของ ${cur ? cur.name : '?'} — ถามใช่/ไม่ใช่ หรือทายเลย`;
  } else if (room.mode === 'undercover' && room.uc.phase === 'vote') label = '🗳️ ถึงเวลาโหวต! คุยกันได้เลยว่าใครน่าสงสัย';
  else if (room.mode === 'undercover' && room.uc.phase === 'white') label = '🤍 Mr. White กำลังทายคำของชาวบ้าน…';
  else {
    const cur = room.players.get(room.currentTurnId());
    const asker = room.mode === 'guess' ? room.players.get(room.gAsker()) : cur;
    label = room.mode === 'undercover' ? `🕵️ ตาของ ${cur ? cur.name : '?'} ใบ้คำ` : `🎯 ตาของ ${asker ? asker.name : '?'} — ถามเพื่อน หรือทายเลย`;
  }
  sendChat(room, room.systemChat(label));
}

// ตาวาดใหม่ → ล้างภาพบนจอทุกคน
function syncCanvas(room) {
  const key = room.mode === 'draw' && room.dr ? `${room.round}|${room.dr.turnNo}` : null;
  if (key === room._canvasKey) return;
  room._canvasKey = key;
  if (key) io.to(room.code).emit('draw', { op: 'sync', strokes: [] });
}

function broadcast(room) {
  if (settleKick(room)) return; // โหวตเตะจบ → settleKick broadcast ให้แล้ว
  syncCanvas(room);
  syncTurn(room);
  syncTimer(room);
  for (const p of room.players.values()) {
    const s = socketsOf.get(p.id);
    if (s && p.connected) s.emit('sync', { view: room.viewFor(p.id) });
  }
}

// โหวตเตะ: ตั้งเวลาหมดโหวต / นับผล แล้วเตะออกถ้าผ่าน
function syncKickTimer(room) {
  const id = room.kick ? room.kick.id : null;
  if (room._kickTimerFor === id) return;
  clearTimeout(room._kickTimer);
  room._kickTimerFor = id;
  room._kickTimer = id ? setTimeout(() => settleKick(room, true), room.kick.endsAt - Date.now()) : null;
}

function settleKick(room, expired = false) {
  const res = expired ? room.kickExpire() : room.kickCheck();
  syncKickTimer(room);
  if (!res) return false;
  const { target, name } = room.kickLast;
  if (res === 'pass') {
    kickOut(room, target);
    sendChat(room, room.systemChat(`🚫 ${name} ถูกโหวตออกจากห้อง`));
  } else if (res === 'fail') {
    sendChat(room, room.systemChat(`🙅 โหวตเตะ ${name} ไม่ผ่าน`));
  }
  broadcast(room);
  scheduleAwaySkip(room);
  return true;
}

function kickOut(room, id) {
  const p = room.players.get(id);
  if (!p) return;
  clearTimers(id);
  const s = socketsOf.get(id);
  socketsOf.delete(id);
  if (s) {
    s.emit('kicked', { code: room.code });
    s.leave(room.code);
  }
  room.removePlayer(id);
}

function sendChat(room, msg) {
  io.to(room.code).emit('sync', { chat: [msg] });
}

function clearTimers(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t.remove);
    clearTimeout(t.skip);
    timers.delete(id);
  }
}

// ถึงตาคนที่หลุดอยู่ → รอ AWAY_SKIP_MS แล้วข้ามให้ (คนอื่นกด "จบตา" ให้ก่อนก็ได้)
function scheduleAwaySkip(room) {
  const curId = room.currentTurnId();
  const cur = room.players.get(curId);
  if (room.state !== 'playing' || !cur || cur.connected) return;
  const t = timers.get(curId) || {};
  if (t.skip) return;
  t.skip = setTimeout(() => {
    t.skip = null;
    if (room.currentTurnId() === curId && room.autoSkipIfAway()) {
      broadcast(room);
      scheduleAwaySkip(room);
    }
  }, AWAY_SKIP_MS);
  timers.set(curId, t);
}

io.on('connection', (socket) => {
  let room = null;
  let me = null;

  socket.on('join', ({ name, code, key } = {}, ack = () => {}) => {
    name = String(name || '').trim().slice(0, 20);
    code = String(code || '').trim().toUpperCase().slice(0, 10);
    key = String(key || '').slice(0, 64);
    if (!name) return ack({ error: 'กรุณาใส่ชื่อ' });
    if (!code) return ack({ error: 'กรุณาใส่รหัสห้อง' });
    if (!key) return ack({ error: 'ข้อมูลไม่ครบ' });

    const r = rooms.get(code) || new Room(code);
    const existing = r.findByName(name);
    const mine = r.findByKey(key);
    let p;
    if (existing) {
      // ชื่อนี้เป็นของอีกเครื่องที่ยังออนไลน์อยู่ → ไม่ให้แย่ง
      if (existing.key !== key && existing.connected) return ack({ error: 'ชื่อนี้มีคนใช้ในห้องแล้ว' });
      // เครื่องเดิมกลับมา (แม้เซิร์ฟเวอร์ยังไม่รู้ว่าอันเก่าหลุด) หรือที่นั่งว่าง → คืนที่นั่งเดิม คำ/คะแนนครบ
      if (mine && mine !== existing) {
        clearTimers(mine.id);
        socketsOf.delete(mine.id);
        r.removePlayer(mine.id);
      }
      p = existing;
      p.key = key;
    } else if (mine) {
      // เครื่องนี้เคยอยู่ในห้องด้วยชื่ออื่น → เปลี่ยนชื่อแทนการสร้างซ้ำ
      sendChat(r, r.systemChat(`✏️ ${mine.name} เปลี่ยนชื่อเป็น ${name}`));
      mine.name = name;
      p = mine;
    } else {
      try {
        p = r.addPlayer(crypto.randomBytes(6).toString('hex'), name);
      } catch (e) {
        return ack({ error: e.message });
      }
      p.key = key;
      rooms.set(code, r);
      sendChat(r, r.systemChat(`👋 ${name} เข้าห้อง`));
    }
    rooms.set(code, r);

    // มีแท็บ/เครื่องอื่นถือที่นั่งนี้อยู่ → บอกให้หยุด แล้วย้ายมาที่ socket นี้
    const old = socketsOf.get(p.id);
    if (old && old.id !== socket.id) {
      old.data.replaced = true;
      old.emit('replaced');
      old.disconnect(true);
    }
    clearTimers(p.id);
    socketsOf.set(p.id, socket);
    p.connected = true;
    room = r;
    me = p;
    socket.join(code);
    ack({ ok: true, view: r.viewFor(p.id), chat: r.chat });
    // เข้ามากลางตาวาด → ส่งภาพที่วาดไปแล้วให้
    if (r.mode === 'draw' && r.dr) socket.emit('draw', { op: 'sync', strokes: r.dr.strokes });
    broadcast(r);
  });

  // คำสั่งในเกม — ตอบกลับ { error } หรือ { ok, correct? }
  socket.on('act', ({ action, ...data } = {}, ack = () => {}) => {
    if (!room || !me || !room.players.has(me.id)) return ack({ error: 'ไม่ได้อยู่ในห้องนี้แล้ว กรุณาเข้าห้องใหม่', kicked: true });
    const r = room;
    const isHost = r.hostId === me.id;
    const out = { ok: true };
    try {
      switch (action) {
        case 'start':
          if (!isHost) throw new GameError('เฉพาะหัวห้องเท่านั้น');
          if (data.turnLimit != null) r.setTurnLimit(data.turnLimit);
          if (MODES.includes(data.mode)) r.nextMode = data.mode;
          if (r.nextMode === 'undercover') {
            r.startUndercover({ mrWhite: !!data.mrWhite });
          } else if (r.nextMode === 'hues') {
            r.startHues();
          } else if (r.nextMode === 'oldmaid') {
            r.startOldMaid();
          } else if (r.nextMode === 'poker') {
            r.startPoker();
          } else if (r.nextMode === 'sheriff') {
            r.startSheriff();
          } else if (r.nextMode === 'timeline') {
            r.startTimeline();
          } else if (r.nextMode === 'liar') {
            r.startLiar();
          } else if (r.nextMode === 'codenames') {
            r.startCodenames();
          } else if (r.nextMode === 'draw') {
            r.startDraw(data.category);
          } else if (r.nextMode === 'cheese') {
            r.startCheese();
          } else if (r.nextMode === 'center') {
            r.startCenter(data.category);
          } else {
            r.start(data.category);
          }
          break;
        case 'settings':
          if (!isHost) throw new GameError('เฉพาะหัวห้องเท่านั้น');
          if (MODES.includes(data.mode)) r.nextMode = data.mode;
          if (data.turnLimit != null) {
            r.setTurnLimit(data.turnLimit);
            r._timerKey = undefined; // ใช้เวลาใหม่กับตาปัจจุบันด้วย
          }
          break;
        case 'clue':
          r.ucClue(me.id, data.text);
          break;
        case 'vote':
          if (r.mode === 'cheese') r.chVote(me.id, String(data.targetId || ''));
          else r.ucVote(me.id, String(data.targetId || ''));
          break;
        case 'closeVote':
          if (!isHost) throw new GameError('เฉพาะหัวห้องเท่านั้น');
          if (r.mode === 'cheese' && r.state === 'playing' && r.ch.phase === 'day') {
            r.chResolve();
            break;
          }
          if (r.mode !== 'undercover' || r.state !== 'playing' || r.uc.phase !== 'vote') throw new GameError('ตอนนี้ไม่ใช่รอบโหวต');
          r.ucResolveVotes();
          break;
        case 'omDraw':
          out.last = r.omDraw(me.id, data.index);
          break;
        case 'hcClue':
          r.hcClue(me.id, data.text, data.pick);
          break;
        case 'hcPlace':
          r.hcPlace(me.id, data.cell);
          break;
        case 'omShuffle':
          r.omShuffle(me.id);
          break;
        case 'pkAct':
          r.pkAct(me.id, String(data.move || ''), data.to);
          break;
        case 'shPack':
          r.shPack(me.id, data.cardIds, data.declare, data.bribe);
          break;
        case 'shDecide':
          r.shDecide(me.id, data.choice);
          out.last = r.sh.last;
          break;
        case 'tlPlace': {
          const res = r.tlPlace(me.id, data.cardId, data.slot);
          out.correct = res.correct;
          out.year = res.year;
          break;
        }
        case 'bid':
          r.lieBid(me.id, data.q, data.f);
          break;
        case 'liar':
          r.lieChallenge(me.id);
          out.result = r.lie.result;
          break;
        case 'cnClue':
          r.cnGiveClue(me.id, data.word, data.num);
          break;
        case 'cnPick':
          out.color = r.cnPick(me.id, data.index);
          break;
        case 'choose':
          r.drChoose(me.id, data.index);
          break;
        case 'roll':
          out.die = r.chRoll(me.id);
          break;
        case 'peek':
          out.die = r.chPeek(me.id, String(data.targetId || ''));
          break;
        case 'recruit':
          r.chRecruit(me.id, String(data.targetId || ''));
          break;
        case 'ask':
          if (r.mode === 'guess') r.guessAsk(me.id, String(data.targetId || ''), data.text);
          else r.ctAsk(me.id, data.text);
          break;
        case 'answer':
          if (r.mode === 'guess') r.guessAnswer(me.id, data.answer);
          else r.ctAnswer(me.id, data.answer);
          break;
        case 'ctGuess':
          out.correct = r.ctGuess(me.id, data.text);
          break;
        case 'whiteGuess':
          out.correct = r.ucWhiteGuess(me.id, data.text);
          break;
        case 'endRound':
          if (!isHost) throw new GameError('เฉพาะหัวห้องเท่านั้น');
          if (r.state !== 'playing') throw new GameError('รอบนี้จบไปแล้ว');
          r.endRound();
          break;
        case 'kickStart': {
          const t = r.players.get(String(data.targetId || ''));
          r.kickStart(me.id, String(data.targetId || ''));
          sendChat(r, r.systemChat(`🗳️ ${me.name} เสนอโหวตเตะ ${t.name} ออกจากห้อง`));
          break;
        }
        case 'kickVote':
          r.kickVote(me.id, !!data.yes);
          break;
        case 'pass':
          if (r.state !== 'playing') throw new GameError('ตอนนี้ไม่ได้อยู่ระหว่างเล่น');
          // กันสองคนกดพร้อมกันแล้วข้ามไปสองตา
          if (data.turnId && data.turnId !== r.currentTurnId()) throw new GameError('ตาเปลี่ยนไปแล้ว');
          r.pass(me.id);
          break;
        case 'guess':
          out.correct = r.guess(me.id, String(data.targetId || ''), data.text);
          break;
        case 'chat': {
          const now = Date.now();
          if (now - (me.lastChatAt || 0) < CHAT_GAP_MS) throw new GameError('พิมพ์เร็วไปนิด ใจเย็น ๆ 😅');
          if (r.mode === 'draw') {
            const hit = r.drGuess(me.id, String(data.text || ''));
            if (hit) {
              me.lastChatAt = now;
              sendChat(r, r.systemChat(`🎉 ${me.name} ทายถูก!`));
              out.correct = true;
              break; // สถานะเกมเปลี่ยน → broadcast ด้านล่าง
            }
          }
          const msg = r.addChat(me.id, data.text);
          me.lastChatAt = now;
          sendChat(r, msg);
          return ack(out); // แชทไม่เปลี่ยนสถานะเกม ไม่ต้อง broadcast
        }
        default:
          throw new GameError('ไม่รู้จักคำสั่งนี้');
      }
    } catch (e) {
      return ack({ error: e.message });
    }
    ack(out);
    broadcast(r);
    scheduleAwaySkip(r);
  });

  // เส้นที่คนวาดกำลังวาด → ส่งต่อให้ทุกคนในห้องแบบสด
  socket.on('draw', (op) => {
    if (!room || !me || !room.drStroke || room.mode !== 'draw') return;
    if (room.drStroke(me.id, op)) socket.to(room.code).emit('draw', op);
  });

  // ออกจากห้องเอง → เอาออกทันที (ไม่ต้องรอ 10 นาที)
  socket.on('leave', (ack = () => {}) => {
    if (!room || !me) return ack({ ok: true });
    const r = room;
    const p = me;
    room = null;
    me = null;
    socket.leave(r.code);
    if (!r.players.has(p.id)) return ack({ ok: true });
    clearTimers(p.id);
    if (socketsOf.get(p.id) === socket) socketsOf.delete(p.id);
    r.removePlayer(p.id);
    ack({ ok: true });
    if (r.players.size === 0) return rooms.delete(r.code);
    sendChat(r, r.systemChat(`🚪 ${p.name} ออกจากห้อง`));
    broadcast(r);
    scheduleAwaySkip(r);
  });

  socket.on('disconnect', () => {
    if (!room || !me || socket.data.replaced) return;
    if (socketsOf.get(me.id) !== socket) return;
    const r = room;
    const p = me;
    p.connected = false;
    socketsOf.delete(p.id);
    r.onPresenceChange();
    broadcast(r);
    scheduleAwaySkip(r);
    const t = timers.get(p.id) || {};
    t.remove = setTimeout(() => {
      clearTimers(p.id);
      r.removePlayer(p.id);
      if (r.players.size === 0) return rooms.delete(r.code);
      sendChat(r, r.systemChat(`🚪 ${p.name} ออกจากห้อง`));
      broadcast(r);
      scheduleAwaySkip(r);
    }, GRACE_MS);
    timers.set(p.id, t);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`เกมทายคำพร้อมแล้ว: http://localhost:${PORT}`);
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets || []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`เพื่อนในวง LAN เดียวกันเข้าได้ที่: http://${n.address}:${PORT}`);
      }
    }
  });
}

module.exports = { server, io, rooms, AWAY_SKIP_MS };

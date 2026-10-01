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
const MODES = ['guess', 'undercover', 'center'];

// จับเวลาต่อตา: ตาเปลี่ยนเมื่อไหร่ เริ่มนับใหม่ หมดเวลา = ข้ามตา
function syncTimer(room) {
  const key = room.timerKey();
  if (key === room._timerKey) return;
  clearTimeout(room._timer);
  room._timerKey = key;
  room.turnEndsAt = key ? Date.now() + room.turnLimit * 1000 : null;
  if (!key) return;
  room._timer = setTimeout(() => {
    if (room.timerKey() !== key) return;
    if (room.timeoutTurn()) broadcast(room);
  }, room.turnLimit * 1000);
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
  if (room.mode === 'center') {
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

function broadcast(room) {
  syncTurn(room);
  syncTimer(room);
  for (const p of room.players.values()) {
    const s = socketsOf.get(p.id);
    if (s && p.connected) s.emit('sync', { view: room.viewFor(p.id) });
  }
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
          r.ucVote(me.id, String(data.targetId || ''));
          break;
        case 'closeVote':
          if (!isHost) throw new GameError('เฉพาะหัวห้องเท่านั้น');
          if (r.mode !== 'undercover' || r.state !== 'playing' || r.uc.phase !== 'vote') throw new GameError('ตอนนี้ไม่ใช่รอบโหวต');
          r.ucResolveVotes();
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

const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { Room } = require('./game');

const PORT = process.env.PORT || 3456;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map(); // code -> Room
const leaveTimers = new Map(); // socketId -> timeout

function broadcast(room) {
  for (const p of room.players.values()) {
    if (p.connected) io.to(p.id).emit('state', room.viewFor(p.id));
  }
}

io.on('connection', (socket) => {
  let room = null;

  socket.on('join', ({ name, code } = {}, ack = () => {}) => {
    name = String(name || '').trim().slice(0, 20);
    code = String(code || '').trim().toUpperCase().slice(0, 10);
    if (!name) return ack({ error: 'กรุณาใส่ชื่อ' });
    if (!code) return ack({ error: 'กรุณาใส่รหัสห้อง' });

    room = rooms.get(code);
    if (!room) {
      room = new Room(code);
      rooms.set(code, room);
    }

    const existing = room.findByName(name);
    if (existing) {
      if (existing.connected) return ack({ error: 'ชื่อนี้มีคนใช้ในห้องแล้ว' });
      clearTimeout(leaveTimers.get(existing.id));
      leaveTimers.delete(existing.id);
      room.rebind(existing.id, socket.id);
    } else {
      try {
        room.addPlayer(socket.id, name);
      } catch (e) {
        return ack({ error: e.message });
      }
      io.to(code).emit('chat', room.systemChat(`👋 ${name} เข้าห้อง`));
    }
    socket.join(code);
    ack({ ok: true });
    socket.emit('chatHistory', room.chat);
    broadcast(room);
  });

  let lastChatAt = 0;
  socket.on('chat', (text, ack = () => {}) => {
    if (!room) return ack({ error: 'ยังไม่ได้เข้าห้อง' });
    const now = Date.now();
    if (now - lastChatAt < 400) return ack({ error: 'พิมพ์เร็วไปนิด ใจเย็น ๆ 😅' });
    try {
      const msg = room.addChat(socket.id, text);
      lastChatAt = now;
      io.to(room.code).emit('chat', msg);
      ack({ ok: true });
    } catch (e) {
      ack({ error: e.message });
    }
  });

  const hostOnly = (fn) => (...args) => {
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    if (!room || room.hostId !== socket.id) return ack({ error: 'เฉพาะหัวห้องเท่านั้น' });
    try {
      fn(...args);
      ack({ ok: true });
    } catch (e) {
      ack({ error: e.message });
    }
    broadcast(room);
  };

  socket.on('start', hostOnly((category) => {
    room.start(category);
    io.to(room.code).emit('chat', room.systemChat(`🎲 รอบ ${room.round} เริ่มแล้ว — หมวด ${room.category}`));
  }));
  socket.on('endRound', hostOnly(() => room.endRound()));

  socket.on('pass', () => {
    if (room && room.pass(socket.id)) broadcast(room);
  });

  socket.on('guess', ({ targetId, text } = {}, ack = () => {}) => {
    if (!room) return;
    const correct = room.guess(socket.id, targetId, text);
    ack({ correct });
    broadcast(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.connected = false;
    // หลุดตอนถึงตาตัวเอง → ส่งตาให้คนถัดไป
    if (room.state === 'playing' && room.currentTurnId() === socket.id) room.advanceTurn();
    broadcast(room);
    // เผื่อเวลา 60 วินาทีให้กลับเข้าห้องด้วยชื่อเดิม
    const r = room;
    leaveTimers.set(socket.id, setTimeout(() => {
      leaveTimers.delete(socket.id);
      r.removePlayer(socket.id);
      if (r.players.size === 0) return rooms.delete(r.code);
      io.to(r.code).emit('chat', r.systemChat(`🚪 ${p.name} ออกจากห้อง`));
      broadcast(r);
    }, 60_000));
  });
});

server.listen(PORT, () => {
  console.log(`เกมทายคำพร้อมแล้ว: http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`เพื่อนในวง LAN เดียวกันเข้าได้ที่: http://${n.address}:${PORT}`);
    }
  }
});

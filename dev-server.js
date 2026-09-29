// เซิร์ฟเวอร์สำหรับรันในเครื่อง (npm run dev) — บน Vercel ไม่ได้ใช้ไฟล์นี้
// ถ้าไม่ได้ตั้งค่า Redis จะเก็บห้องในหน่วยความจำ
const path = require('path');
const os = require('os');
const express = require('express');
const { handle, store } = require('./lib/api');

const PORT = process.env.PORT || 3456;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.all('/api/room', async (req, res) => {
  const { status, json } = await handle(req.method, req.query, req.body);
  res.set('Cache-Control', 'no-store').status(status).json(json);
});

app.listen(PORT, () => {
  console.log(`เกมทายคำพร้อมแล้ว: http://localhost:${PORT}  (ที่เก็บข้อมูล: ${store.kind})`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`เพื่อนในวง LAN เดียวกันเข้าได้ที่: http://${n.address}:${PORT}`);
    }
  }
});

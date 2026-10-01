const socket = io();
const $ = (id) => document.getElementById(id);
let state = null;
let session = null;
let peek = false; // คำลับของฉันแสดงอยู่ไหม (ค่าเริ่มต้นเบลอ กันเพื่อนข้าง ๆ แอบดู)
let lastFeedLen = 0;
let lastRound = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(msg, buzz) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 2200);
  if (buzz && navigator.vibrate) navigator.vibrate(buzz);
}

// รหัสประจำเครื่อง — ใช้ยืนยันว่าเป็นคนเดิมตอนต่อใหม่ (ไม่แสดงให้ใครเห็น)
function deviceKey() {
  try {
    let k = localStorage.getItem('wg-key');
    if (!k) {
      k = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('wg-key', k);
    }
    return k;
  } catch {
    return (window.__wgKey ||= Math.random().toString(36).slice(2));
  }
}

// ลิงก์ชวนเพื่อน ?room=CODE → กรอกรหัสห้องให้เลย
const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
try {
  const saved = JSON.parse(localStorage.getItem('wg-session') || 'null');
  if (saved) { $('nameInput').value = saved.name; $('codeInput').value = saved.code; }
  // รีเฟรช/เปิดลิงก์ห้องเดิมอีกครั้ง → กลับเข้าห้องอัตโนมัติ
  session = JSON.parse(sessionStorage.getItem('wg-session') || 'null');
  if (!session && saved && roomParam && saved.code === roomParam) session = saved;
} catch {}
if (roomParam) $('codeInput').value = roomParam;

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  join($('nameInput').value, $('codeInput').value);
});

function showRoom(on) {
  $('login').hidden = on;
  $('room').hidden = !on;
}

// ---------- คุยกับเซิร์ฟเวอร์ (Socket.IO: ส่งข้อมูลสดทันที) ----------
let lastChatId = 0;
let lastSig = '';
let replaced = false;

// ส่งคำสั่ง แล้วรอคำตอบ (ถ้าเน็ตหลุดนานเกิน 8 วิ ถือว่าไม่สำเร็จ)
function api(action, data = {}) {
  return new Promise((resolve) => {
    if (!socket.connected) {
      setOffline(true);
      return resolve({ error: 'ยังเชื่อมต่อไม่ได้ กำลังต่อใหม่…' });
    }
    socket.timeout(8000).emit('act', { action, ...data }, (err, res) => {
      if (err) return resolve({ error: 'เซิร์ฟเวอร์ตอบช้า ลองใหม่อีกครั้ง' });
      if (res.kicked) {
        // เซิร์ฟเวอร์ไม่รู้จักเราแล้ว (เช่น เซิร์ฟเวอร์เพิ่งรีสตาร์ท) → เข้าห้องใหม่ด้วยชื่อเดิม
        if (session) join(session.name, session.code);
      }
      resolve(res || {});
    });
  });
}

let joining = null;
function join(name, code) {
  $('loginError').textContent = '';
  code = code.trim().toUpperCase();
  name = name.trim();
  replaced = false;
  if (!socket.connected) socket.connect();
  const p = new Promise((resolve) => {
    socket.timeout(10000).emit('join', { name, code, key: deviceKey() }, (err, res) => {
      if (err) res = { error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' };
      if (res.error) {
        $('loginError').textContent = res.error;
        // เด้งออกจากห้องเฉพาะกรณีที่เข้าไม่ได้จริง ๆ (ชื่อซ้ำ ฯลฯ) ไม่ใช่แค่เน็ตช้า
        if (!err) {
          session = null;
          try { sessionStorage.removeItem('wg-session'); } catch {}
          showRoom(false);
        }
        return resolve(res);
      }
      session = { name, code };
      try {
        localStorage.setItem('wg-session', JSON.stringify(session));
        sessionStorage.setItem('wg-session', JSON.stringify(session));
      } catch {}
      history.replaceState(null, '', `?room=${encodeURIComponent(code)}`);
      setOffline(false);
      showRoom(true);
      applyPayload(res);
      resolve(res);
    });
  });
  joining = p.finally(() => (joining = null));
  return p;
}

function setOffline(on) {
  $('offline').hidden = !on;
}

// ต่อติด (ครั้งแรก/หลังหลุด) → กลับเข้าห้องเดิมอัตโนมัติ
socket.on('connect', () => {
  if (session && !replaced && !joining) join(session.name, session.code);
});
socket.on('disconnect', (reason) => {
  if (session && !replaced) setOffline(true);
  // เซิร์ฟเวอร์ตัดเอง socket.io จะไม่ต่อใหม่ให้ → สั่งต่อเอง
  if (reason === 'io server disconnect' && !replaced) socket.connect();
});
// เปิดเกมชื่อเดียวกันจากแท็บ/เครื่องอื่น → แท็บนี้หยุด ไม่แย่งกลับ
socket.on('replaced', () => {
  replaced = true;
  setOffline(false);
  showRoom(false);
  $('loginError').textContent = 'คุณเปิดเกมนี้ในแท็บหรือหน้าต่างอื่นแล้ว — กด "เข้าห้อง" เพื่อเล่นที่นี่แทน';
});
socket.on('sync', applyPayload);

// กลับมาที่แอป/แท็บ (หลังล็อกจอ สลับแอป) → ต่อใหม่ทันที ไม่ต้องรอ
function wake() {
  if (document.visibilityState !== 'visible' || replaced || !session) return;
  if (!socket.connected) socket.connect();
}
document.addEventListener('visibilitychange', wake);
window.addEventListener('online', wake);
window.addEventListener('pageshow', wake);

function applyPayload(j) {
  if (j.clearChat) clearChatList();
  for (const m of j.chat || []) addChatMsg(m);
  if (!j.view) return;
  // เวลาที่เหลือของตานี้ (นับจากเครื่องเรา กันนาฬิกาเครื่อง/เซิร์ฟเวอร์ไม่ตรงกัน)
  turnDeadline = j.view.turnRemainingMs != null ? Date.now() + j.view.turnRemainingMs : null;
  delete j.view.turnRemainingMs;
  const sig = JSON.stringify(j.view);
  if (sig === lastSig) return; // ไม่มีอะไรเปลี่ยน → ไม่วาดใหม่ (ไม่ไปปิด dropdown ที่กำลังเลือก)
  lastSig = sig;
  const prev = state;
  state = j.view;
  notify(prev, state);
  render();
}

// แจ้งเตือนสิ่งสำคัญที่เกิดกับฉัน
function notify(prev, s) {
  const uc = s.mode === 'undercover' && s.uc;
  if (s.round !== lastRound && s.state === 'playing') {
    lastRound = s.round;
    peek = false;
    toast(uc ? '🕵️ เกมใหม่: ใครคือสปาย! ดูคำของคุณ'
      : s.mode === 'center' && s.ct ? (s.ct.amMaster ? '🎙️ คุณเป็นคนตอบรอบนี้! ดูคำลับได้เลย' : `❓ ทายคำตรงกลาง — หมวด ${s.category}`)
      : `🎲 รอบใหม่! หมวด: ${s.category}`, 150);
  }
  const turnKey = (v) => v && `${v.gq ? v.gq.turnNo + v.gq.phase : ''}|${v.round}|${v.uc ? v.uc.roundNo + v.uc.phase + v.uc.clues.length : ''}|${v.ct ? v.ct.turnNo + v.ct.phase : ''}|${v.currentTurn}`;
  const ct = s.mode === 'center' && s.ct;
  if (s.state === 'playing' && s.currentTurn === s.me && (!prev || turnKey(prev) !== turnKey(s))) {
    const msg = ct ? (ct.phase === 'answer' ? '❓ มีคำถามมา! ตอบ ใช่/ไม่ใช่ เลย' : ct.phase === 'guess' ? '🎯 ได้คำตอบแล้ว ทายได้ 1 ครั้ง' : '🫵 ตาคุณ! ถามใช่/ไม่ใช่ หรือทายเลย')
      : !uc && s.gq ? (s.gq.phase === 'answer' ? '❓ มีคนถามคุณ! ตอบ ใช่/ไม่ใช่/อาจจะ' : s.gq.phase === 'guess' ? '🎯 ได้คำตอบแล้ว ทายได้ 1 ครั้ง' : '🫵 ตาคุณ! ถามเพื่อน หรือทายเลย')
      : uc.phase === 'white' ? '🤍 คุณโดนโหวตออก! ทายคำของชาวบ้านให้ถูกเพื่อชนะ'
      : '🫵 ถึงตาคุณใบ้คำแล้ว!';
    setTimeout(() => toast(msg, [120, 60, 120]), prev && prev.round !== s.round ? 1200 : 0);
  }
  if (uc && uc.phase === 'vote' && (!prev || !prev.uc || prev.uc.phase !== 'vote')) {
    toast(uc.alive.includes(s.me) ? '🗳️ ถึงเวลาโหวต! แตะการ์ดคนที่สงสัย' : '🗳️ เพื่อนกำลังโหวต', [80, 40, 80]);
  }
  if (prev && s.state === 'reveal' && prev.state === 'playing') toast('🏁 จบรอบ! ดูเฉลยและอันดับได้เลย', [100, 60, 100]);
  const myName = s.players.find((p) => p.id === s.me)?.name;
  const fresh = s.feed.length >= lastFeedLen ? s.feed.slice(lastFeedLen) : s.feed;
  lastFeedLen = s.feed.length;
  for (const f of fresh) {
    if (f.type === 'correct' && f.target === myName) toast(`😱 ${f.name} ทายคำของคุณถูก!`, [200, 80, 200]);
  }
}

$('shareBtn').addEventListener('click', async () => {
  const url = `${location.origin}/?room=${encodeURIComponent(state.code)}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'มาเล่นทายคำกัน!', text: `เข้าห้อง ${state.code}`, url });
    await navigator.clipboard.writeText(url);
    toast('📋 คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย');
  } catch {
    toast(`รหัสห้อง: ${state.code}`);
  }
});

$('startBtn').addEventListener('click', () => {
  $('hostError').textContent = '';
  api('start', {
    mode: state.nextMode,
    category: $('categorySelect').value,
    mrWhite: $('whiteCheck').checked,
    turnLimit: Number($('timeSelect').value),
  }).then((res) => {
    if (res.error) $('hostError').textContent = res.error;
  });
});

// หัวห้องเลือกเกม → ทุกคนในห้องเห็นทันที
$('modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || !state || b.dataset.mode === state.nextMode) return;
  api('settings', { mode: b.dataset.mode }).then((res) => res.error && toast(`⚠️ ${res.error}`));
});
$('timeSelect').addEventListener('change', () => {
  api('settings', { turnLimit: Number($('timeSelect').value) }).then((res) => {
    toast(res.error ? `⚠️ ${res.error}` : `⏱️ ตั้งเวลาต่อตา: ${$('timeSelect').selectedOptions[0].textContent}`);
  });
});

// ---------- ตัวนับถอยหลัง ----------
let turnDeadline = null;
function fmtTime(ms) {
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function tickTimer() {
  const box = $('timer');
  const on = !!(state && state.state === 'playing' && turnDeadline && state.turnLimit);
  box.hidden = !on;
  if (!on) return;
  const left = Math.max(0, turnDeadline - Date.now());
  const uc = state.mode === 'undercover' && state.uc;
  const what = uc && uc.phase === 'vote' ? 'เวลาโหวต' : 'เวลาตานี้';
  $('timerText').textContent = `⏱️ ${what} ${fmtTime(left)}`;
  $('timerFill').style.width = `${Math.min(100, (left / (state.turnLimit * 1000)) * 100)}%`;
  box.classList.toggle('urgent', left <= 10000);
}
setInterval(tickTimer, 250);
// ปุ่มที่ต้องยืนยัน: แตะครั้งแรกเปลี่ยนเป็น "แตะอีกครั้งเพื่อยืนยัน"
// (ไม่ใช้ confirm() เพราะเบราว์เซอร์ในแอป เช่น LINE/Messenger มักบล็อกป๊อปอัป ทำให้กดแล้วไม่เกิดอะไร)
function confirmTap(btn, askText, fn) {
  if (btn.dataset.armed) {
    clearTimeout(btn._disarm);
    disarm(btn);
    fn();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = askText;
  btn.classList.add('armed');
  btn._disarm = setTimeout(() => disarm(btn), 3000);
}
function disarm(btn) {
  if (!btn.dataset.armed) return;
  delete btn.dataset.armed;
  btn.textContent = btn.dataset.label;
  btn.classList.remove('armed');
}

// ส่งคำสั่งแล้วแสดงผล/ข้อผิดพลาดเสมอ + กันกดซ้ำระหว่างรอ
async function act(btn, action, data, okMsg) {
  if (btn.disabled) return;
  btn.disabled = true;
  const res = await api(action, data);
  btn.disabled = false;
  if (res.error) toast(`⚠️ ${res.error}`, 150);
  else if (okMsg) toast(okMsg);
  return res;
}

$('endBtn').addEventListener('click', () => {
  confirmTap($('endBtn'), '⚠️ แตะอีกครั้งเพื่อจบรอบ', () => act($('endBtn'), 'endRound'));
});

// เกมทายคำ: ถามเพื่อน (ค่าเริ่มต้น) หรือ "ทายเลย" — รีเซ็ตเป็นถามทุกตาใหม่
let gInput = 'ask';
let gInputTurn = '';
const gGuessing = () => state.gq.phase === 'guess' || gInput === 'guess';
$('gModeBtn').addEventListener('click', () => {
  gInput = gInput === 'ask' ? 'guess' : 'ask';
  render();
  $('guessInput').focus();
});
$('gAnswerRow').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (b) act(b, 'answer', { answer: b.dataset.a });
});

$('guessForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const targetId = $('targetSelect').value;
  const text = $('guessInput').value.trim();
  if (!text || !targetId) return;
  const targetName = $('targetSelect').selectedOptions[0].textContent;
  if (!gGuessing()) {
    api('ask', { targetId, text }).then((res) => res.error && toast(`⚠️ ${res.error}`, 150));
    $('guessInput').value = '';
    return;
  }
  api('guess', { targetId, text }).then((res) => {
    if (res.error) return toast(res.error, 150);
    if (res.correct == null) return toast('ยังไม่ถึงตาคุณ หรือคนนี้โดนทายไปแล้ว');
    if (res.correct) toast(`🎉 ถูกต้อง! คำของ ${targetName} คือ "${text}" (+2)`, [60, 40, 60, 40, 120]);
    else toast(`❌ "${text}" ไม่ใช่คำของ ${targetName}`, 80);
  });
  $('guessInput').value = '';
});

// จบตา: เจ้าของตากดได้ทันที / คนอื่น (เช่น คนตอบ) แตะ 2 ครั้งกันกดพลาด
$('passBtn').addEventListener('click', () => act($('passBtn'), 'pass', { turnId: state.currentTurn }, '✅ จบตาแล้ว'));
$('skipBtn').addEventListener('click', () => {
  const cur = state.players.find((p) => p.id === state.currentTurn);
  const turnId = state.currentTurn;
  confirmTap($('skipBtn'), `แตะอีกครั้ง จบตา ${cur ? cur.name : ''}`, () => act($('skipBtn'), 'pass', { turnId }, '✅ จบตาแล้ว'));
});

// ---------- ใครคือสปาย: ใบ้คำ / Mr. White ทาย / ข้ามตา / ปิดโหวต ----------
$('ucBar').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('ucInput').value.trim();
  if (!text) return;
  const uc = state.uc;
  if (uc.phase === 'white') {
    api('whiteGuess', { text }).then((res) => {
      if (res.error) return toast(`⚠️ ${res.error}`, 150);
      toast(res.correct ? '🎉 ทายถูก! Mr. White ชนะ!' : `❌ "${text}" ไม่ใช่คำของชาวบ้าน`, res.correct ? [60, 40, 60, 40, 120] : 80);
    });
  } else {
    api('clue', { text }).then((res) => res.error && toast(`⚠️ ${res.error}`, 150));
  }
  $('ucInput').value = '';
});
$('ucPassBtn').addEventListener('click', () => {
  confirmTap($('ucPassBtn'), 'ข้าม?', () => act($('ucPassBtn'), 'pass', { turnId: state.currentTurn }));
});
$('ucSkipBtn').addEventListener('click', () => {
  const cur = state.players.find((p) => p.id === state.currentTurn);
  const turnId = state.currentTurn;
  confirmTap($('ucSkipBtn'), `แตะอีกครั้ง ข้าม ${cur ? cur.name : ''}`, () => act($('ucSkipBtn'), 'pass', { turnId }, '✅ จบตาแล้ว'));
});
$('closeVoteBtn').addEventListener('click', () => {
  confirmTap($('closeVoteBtn'), 'แตะอีกครั้ง นับผลเลย', () => act($('closeVoteBtn'), 'closeVote'));
});

// ---------- ทายคำตรงกลาง: ถาม / ตอบ / ทาย / จบตา ----------
let ctInput = 'ask'; // ตอนเลือกได้ (ช่วงถาม) จะ "ถาม" หรือ "ทายเลย" — รีเซ็ตเป็น 'ask' ทุกตาใหม่
let ctInputTurn = '';
$('ctBar').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('ctInput').value.trim();
  if (!text) return;
  const ct = state.ct;
  const guessing = ct.phase === 'guess' || ct.qa.length >= ct.maxQ || ctInput === 'guess';
  if (guessing) {
    api('ctGuess', { text }).then((res) => {
      if (res.error) return toast(`⚠️ ${res.error}`, 150);
      toast(res.correct ? `🎉 ถูกต้อง! คำคือ "${text}" (+3)` : `❌ "${text}" ยังไม่ใช่`, res.correct ? [60, 40, 60, 40, 120] : 80);
    });
  } else {
    api('ask', { text }).then((res) => res.error && toast(`⚠️ ${res.error}`, 150));
  }
  $('ctInput').value = '';
  ctInput = 'ask';
});
$('ctModeBtn').addEventListener('click', () => {
  ctInput = ctInput === 'ask' ? 'guess' : 'ask';
  render();
  $('ctInput').focus();
});
$('ctAnswerRow').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]');
  if (b) act(b, 'answer', { answer: b.dataset.a });
});
$('ctPassBtn').addEventListener('click', () => act($('ctPassBtn'), 'pass', { turnId: state.currentTurn }, '✅ จบตาแล้ว'));
$('ctSkipBtn').addEventListener('click', () => {
  const cur = state.players.find((p) => p.id === state.currentTurn);
  const turnId = state.currentTurn;
  confirmTap($('ctSkipBtn'), `แตะอีกครั้ง ข้าม ${cur ? cur.name : ''}`, () => act($('ctSkipBtn'), 'pass', { turnId }, '✅ จบตาแล้ว'));
});

// ---------- แชท ----------
let chatOpen = false;
// จอกว้าง (คอม) → แชทเปิดค้างไว้ด้านขวาตลอด ไม่ต้องกดเปิด
const dockQuery = window.matchMedia('(min-width: 1100px)');
const chatVisible = () => chatOpen || dockQuery.matches;
dockQuery.addEventListener?.('change', () => { if (dockQuery.matches) setUnread(0); });
let unread = 0;
const chatMsgs = [];

function renderChatMsg(m) {
  const li = document.createElement('li');
  if (m.system) {
    li.className = 'sys';
    li.textContent = m.text;
  } else {
    const mine = session && m.name === session.name;
    li.className = mine ? 'mine' : '';
    li.innerHTML = `${mine ? '' : `<div class="who">${esc(m.name)}</div>`}<span class="bubble">${esc(m.text)}</span>`;
  }
  return li;
}
function scrollChat() { $('chatList').scrollTop = $('chatList').scrollHeight; }
function setUnread(n) {
  unread = n;
  $('chatBadge').hidden = n === 0;
  $('chatBadge').textContent = n > 9 ? '9+' : n;
}

function addChatMsg(m) {
  if (m.id <= lastChatId || chatMsgs.some((x) => x.id === m.id)) return;
  lastChatId = m.id;
  chatMsgs.push(m);
  if (chatMsgs.length > 100) { chatMsgs.shift(); $('chatList').firstChild?.remove(); }
  const nearBottom = $('chatList').scrollHeight - $('chatList').scrollTop - $('chatList').clientHeight < 80;
  $('chatList').append(renderChatMsg(m));
  if (nearBottom || !chatVisible()) scrollChat();
  const fromMe = session && m.name === session.name;
  if (!chatVisible() && !m.system && !fromMe) {
    setUnread(unread + 1);
    if (navigator.vibrate) navigator.vibrate(30);
  }
}

// เปลี่ยนตา → ล้างแชทเก่า
function clearChatList() {
  chatMsgs.length = 0;
  $('chatList').replaceChildren();
  setUnread(0);
}

function openChat() {
  chatOpen = true;
  $('chatSheet').hidden = false;
  setUnread(0);
  scrollChat();
  if (!dockQuery.matches) $('chatInput').focus();
}
function closeChat() {
  chatOpen = false;
  $('chatSheet').hidden = true;
}
$('chatBtn').addEventListener('click', () => (chatOpen ? closeChat() : openChat()));
$('chatClose').addEventListener('click', closeChat);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatOpen) closeChat(); });

function sendChat(text) {
  text = text.trim();
  if (!text) return;
  api('chat', { text }).then((res) => {
    if (res.error) toast(res.error, 150);
  });
}
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat($('chatInput').value);
  $('chatInput').value = '';
  $('chatInput').focus();
});
document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => sendChat(b.dataset.q)));

// ออกจากห้อง: แตะ 2 ครั้ง → เอาออกจากห้องทันที แล้วกลับหน้าเข้าห้อง (จำชื่อไว้ แต่ไม่เข้าห้องเดิมอัตโนมัติ)
$('leaveBtn').addEventListener('click', () => {
  confirmTap($('leaveBtn'), 'ออก?', leaveRoom);
});
function leaveRoom() {
  const done = () => {
    try {
      sessionStorage.removeItem('wg-session');
      localStorage.setItem('wg-session', JSON.stringify({ name: session ? session.name : $('nameInput').value, code: '' }));
    } catch {}
    session = null;
    state = null;
    lastSig = '';
    lastChatId = 0;
    lastFeedLen = 0;
    lastRound = 0;
    peek = false;
    chatMsgs.length = 0;
    $('chatList').replaceChildren();
    setUnread(0);
    closeChat();
    history.replaceState(null, '', location.pathname);
    $('codeInput').value = '';
    $('loginError').textContent = '';
    setOffline(false);
    showRoom(false);
    toast('👋 ออกจากห้องแล้ว');
  };
  if (!socket.connected) return done();
  socket.timeout(3000).emit('leave', done);
}

// แตะการ์ดเพื่อนเพื่อเลือกคนที่จะทาย
$('players').addEventListener('click', (e) => {
  const voteCard = e.target.closest('.player.votable');
  if (voteCard) {
    api('vote', { targetId: voteCard.dataset.id }).then((res) => {
      if (res.error) toast(`⚠️ ${res.error}`, 150);
      else toast(`🗳️ โหวต ${voteCard.dataset.name} แล้ว (เปลี่ยนใจได้จนกว่าจะนับผล)`, 40);
    });
    return;
  }
  const card = e.target.closest('.player.target');
  if (!card) return;
  $('targetSelect').value = card.dataset.id;
  render();
  $('guessInput').focus();
});
$('targetSelect').addEventListener('change', () => render());
$('myCard').addEventListener('click', () => { peek = !peek; render(); });

// ตารางอันดับ: เรียงตามแต้ม คะแนนเท่ากันได้อันดับเดียวกัน
function renderLeaderboard(s) {
  const sorted = s.players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'th'));
  const medals = ['🥇', '🥈', '🥉'];
  let rank = 0;
  let prevScore = null;
  $('leaderboard').innerHTML = sorted.map((p, i) => {
    if (p.score !== prevScore) { rank = i; prevScore = p.score; }
    const badge = medals[rank] || `${rank + 1}.`;
    return `<li class="${p.id === s.me ? 'me' : ''}">
      <span class="rank">${badge}</span>
      <span class="lb-name">${esc(p.name)}${p.id === s.me ? ' (ฉัน)' : ''}${p.id === s.hostId ? ' 👑' : ''}</span>
      <span class="lb-score">${p.score}</span>
    </li>`;
  }).join('');
  // จบรอบ → ยกตารางอันดับขึ้นมาไว้บนสุดให้เห็นชัดบนมือถือ
  $('lbCard').classList.toggle('spotlight', s.state === 'reveal');
}

const MODE_NAME = { guess: '🎯 ทายคำ', undercover: '🕵️ ใครคือสปาย', center: '❓ ทายคำตรงกลาง' };
const MODE_HINT = {
  guess: 'ทุกคนได้คำลับไม่ซ้ำกัน เห็นคำตัวเอง แล้วผลัดกันทายคำของเพื่อน',
  undercover: 'ชาวบ้านได้คำเดียวกัน สปายได้คำคล้าย ผลัดกันใบ้แล้วโหวตจับสปาย (3 คนขึ้นไป)',
  center: 'สุ่ม 1 คนเป็นคนตอบ (เห็นคำลับคนเดียว) ที่เหลือผลัดกันถามใช่/ไม่ใช่ แล้วแข่งกันทายให้ถูกก่อน (ถามได้ 20 ข้อ)',
};
const ROLE = { civ: '🏡 ชาวบ้าน', uc: '🕵️ สปาย', white: '🤍 Mr. White' };

function render() {
  const s = state;
  const me = s.players.find((p) => p.id === s.me);
  const isHost = s.hostId === s.me;
  const ucMode = s.mode === 'undercover' && s.uc && s.state !== 'lobby';
  const ctMode = s.mode === 'center' && s.ct && s.state !== 'lobby';
  const turnPlayer = s.players.find((p) => p.id === s.currentTurn);

  $('roomCode').textContent = s.code;
  $('roundInfo').textContent = s.round ? `· เกม ${s.round}` : `· ${s.players.length} คน`;

  // ลำดับตาเล่น
  $('turnStrip').hidden = s.state !== 'playing' || (ucMode && s.uc.phase === 'vote');
  $('turnStrip').innerHTML = s.turnOrder.map((id, i) => {
    const p = s.players.find((x) => x.id === id);
    if (!p) return '';
    const done = ucMode && s.uc.clues.some((c) => c.id === id && c.round === s.uc.roundNo);
    const cls = [id === s.currentTurn && 'now', !p.connected && 'off', done && 'done'].filter(Boolean).join(' ');
    return `<li class="${cls}">${i + 1}. ${esc(p.name)}${id === s.me ? ' (ฉัน)' : ''}</li>`;
  }).join('');
  $('turnStrip').querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  $('ctBar').hidden = true;
  if (ctMode) renderCenter(s, me, isHost, turnPlayer);
  else if (ucMode) renderUndercover(s, me, isHost, turnPlayer);
  else renderGuess(s, me, isHost, turnPlayer);

  renderLeaderboard(s);
  renderHost(s, isHost);
  tickTimer();

  $('feed').innerHTML = s.feed.slice().reverse().map(feedItem).join('') || '<li class="muted">ยังไม่มีอะไรเกิดขึ้น</li>';
}

// ---------- ปุ่มหัวห้อง ----------
function renderHost(s, isHost) {
  const setup = s.state !== 'playing';
  $('hostControls').hidden = !isHost;
  $('setupBox').hidden = !setup;
  $('startBtn').hidden = !setup;
  $('endBtn').hidden = setup;
  $('endBtn').textContent = s.mode === 'guess' ? 'จบรอบ/เฉลยทั้งหมด' : 'จบเกม/เฉลยคำ';
  for (const b of $('modeSeg').querySelectorAll('button')) {
    const on = b.dataset.mode === s.nextMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  $('modeHint').textContent = MODE_HINT[s.nextMode];
  $('categoryRow').hidden = s.nextMode === 'undercover';
  $('whiteRow').hidden = s.nextMode !== 'undercover';
  $('startBtn').textContent = s.nextMode === 'undercover' ? '🕵️ เริ่มเกมสปาย' : s.nextMode === 'center' ? '❓ เริ่มทายคำตรงกลาง' : s.round ? 'เริ่มรอบใหม่' : 'เริ่มเกม';
  const sel = $('categorySelect');
  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="random">🎲 สุ่มหมวด</option>' +
      s.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  if (document.activeElement !== $('timeSelect')) $('timeSelect').value = String(s.turnLimit);
  $('waitHost').hidden = isHost || !setup;
  $('waitHost').textContent = `หัวห้องเลือก: ${MODE_NAME[s.nextMode]} — รอหัวห้องกดเริ่ม…`;
}

// ---------- เกมทายคำ ----------
function renderGuess(s, me, isHost, turnPlayer) {
  $('ucBar').hidden = true;
  $('subBanner').hidden = true;
  const gq = s.gq || { phase: 'ask', qa: {} };
  const playing = s.state === 'playing' && s.mode === 'guess';
  const myTurn = playing && gq.asker === s.me && gq.phase !== 'answer';
  const amAnswering = playing && gq.phase === 'answer' && gq.targetId === s.me;
  const targets = myTurn
    ? s.players.filter((p) => p.id !== s.me && p.hasWord && !p.guessedBy && (gq.phase !== 'guess' || p.id === gq.targetId))
    : [];
  const askerP = s.players.find((p) => p.id === gq.asker);
  const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || '?';
  const turnId = `${s.round}|${gq.turnNo}`;
  if (turnId !== gInputTurn) { gInputTurn = turnId; gInput = 'ask'; }

  // ตัวเลือกคนที่จะทาย (คงค่าที่เลือกไว้ถ้ายังทายได้)
  const tsel = $('targetSelect');
  const prev = tsel.value;
  tsel.innerHTML = targets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if (targets.some((p) => p.id === prev)) tsel.value = prev;
  const selected = tsel.value;

  $('banner').textContent = {
    lobby: 'รอเริ่มเกม',
    playing: `🎯 หมวด: ${s.category}${askerP ? ` · ตาของ ${askerP.id === s.me ? 'คุณ' : askerP.name}` : ''}`,
    reveal: s.mode !== 'guess' ? 'รอเริ่มเกมใหม่' : `เฉลย — หมวด ${s.category}`,
  }[s.state];

  // การ์ดคำลับของฉัน
  if (me && s.state !== 'lobby' && me.hasWord && s.mode === 'guess') {
    const safe = me.guessedBy || s.state === 'reveal';
    const blur = !safe && !peek;
    let hint = blur ? '👆 แตะเพื่อดูคำลับ (ระวังเพื่อนแอบดู!)' : '👆 แตะเพื่อซ่อน';
    if (me.guessedBy) hint = `🎯 โดน ${esc(me.guessedBy)} ทายถูกแล้ว`;
    else if (s.state === 'reveal') hint = '🛡️ รอด! ไม่มีใครทายถูก (+3)';
    $('myCard').innerHTML = `<div class="mycard">
      <div class="label"><span>🤫 คำลับของ${esc(me.name)}</span><span>${me.score} แต้ม${isHost ? ' 👑' : ''}</span></div>
      <div class="big ${blur ? 'blur' : ''}">${esc(me.word)}</div>
      <div class="hint">${hint}</div>
      ${qaOf(gq, s.me, nameOf)}
    </div>`;
  } else if (me) {
    $('myCard').innerHTML = `<div class="mycard"><div class="label"><span>${esc(me.name)} (ฉัน)</span><span>${me.score} แต้ม${isHost ? ' 👑' : ''}</span></div>
      <div class="hint">${s.state === 'playing' ? 'รอรอบหน้า' : 'รอเริ่มเกม…'}</div></div>`;
  }

  // การ์ดเพื่อน
  $('players').innerHTML = s.players
    .filter((p) => p.id !== s.me)
    .map((p) => {
      let word = '';
      if (s.state !== 'lobby' && s.mode === 'guess') {
        word = !p.hasWord
          ? '<div class="word secret">รอรอบหน้า</div>'
          : p.word == null
            ? '<div class="word secret">???</div>'
            : `<div class="word">${esc(p.word)}</div>`;
      }
      const canTarget = targets.some((t) => t.id === p.id);
      let status = '';
      if (s.mode === 'guess') {
        if (p.guessedBy) status = `🎯 โดน ${esc(p.guessedBy)} ทาย`;
        else if (s.state === 'reveal' && p.hasWord) status = '🛡️ รอด (+3)';
        else if (playing && gq.phase === 'answer' && gq.targetId === p.id) status = '❓ กำลังตอบ';
        else if (canTarget) status = p.id === selected ? (gGuessing() ? '🎯 กำลังทายคนนี้' : '❓ กำลังถามคนนี้') : '👆 แตะเพื่อเลือก';
      }
      if (!p.connected) status = '💤 ไม่ได้เปิดเกม';
      const cls = ['player', !p.connected && 'off', canTarget && 'target', canTarget && p.id === selected && 'selected'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-id="${esc(p.id)}">
        ${p.id === s.hostId ? '<span class="crown" title="หัวห้อง">👑</span>' : ''}
        <span class="score">${p.score} แต้ม</span>
        <div class="name">${esc(p.name)}</div>
        ${word}
        ${s.mode === 'guess' && s.state !== 'lobby' ? qaOf(gq, p.id, nameOf) : ''}
        <div class="status">${status}</div>
      </div>`;
    })
    .join('') || '<p class="muted center" style="grid-column:1/-1">ยังไม่มีเพื่อนในห้อง — กด 📤 ชวนเพื่อน</p>';

  // แถบทายคำ: ตาเรา → ช่องทาย / ไม่ใช่ตาเรา → บอกว่ารอใคร
  $('guessForm').hidden = !playing || !me || !me.hasWord;
  $('myTurn').hidden = !myTurn || targets.length === 0;
  $('waitTurn').hidden = myTurn;
  $('gAnswerRow').hidden = !amAnswering;
  const lastQ = gq.phase === 'answer' && (gq.qa[gq.targetId] || []).slice(-1)[0];
  $('waitTurnText').textContent = amAnswering ? `❓ ${nameOf(gq.asker)} ถามคุณ: "${lastQ ? lastQ.q : ''}"`
    : gq.phase === 'answer' ? `⏳ รอ ${nameOf(gq.targetId)} ตอบคำถามของ ${nameOf(gq.asker)}…`
    : askerP ? `⏳ ตาของ ${askerP.name}…` : '';
  const guessing = gGuessing();
  $('gTargetLabel').textContent = gq.phase === 'guess' ? '🎯 ได้คำตอบแล้ว! ทายคำของ' : guessing ? '🫵 ตาคุณ! ทายคำของ' : '🫵 ตาคุณ! ถามเพื่อน';
  $('targetSelect').disabled = gq.phase === 'guess';
  $('guessInput').placeholder = guessing ? 'พิมพ์คำที่ทาย… (ทายได้ 1 ครั้ง)' : 'ถามใช่/ไม่ใช่ เช่น "กินได้ไหม"';
  $('gSend').textContent = guessing ? 'ทาย!' : 'ถาม';
  $('gModeBtn').hidden = gq.phase !== 'ask';
  $('gModeBtn').textContent = guessing ? '❓ ถามแทน' : '🎯 ทายเลย';
  $('skipBtn').hidden = myTurn || amAnswering || !turnPlayer;
  if (!$('skipBtn').dataset.armed) $('skipBtn').textContent = turnPlayer ? `✅ จบตา ${turnPlayer.name}` : '✅ จบตา';
}

// ---------- ใครคือสปาย ----------
function renderUndercover(s, me, isHost, turnPlayer) {
  const uc = s.uc;
  const over = uc.phase === 'over';
  const amAlive = uc.alive.includes(s.me);
  const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || '?';
  const out = Object.fromEntries(uc.eliminated.map((e) => [e.id, e]));
  $('guessForm').hidden = true;

  // ป้ายด้านบน
  const phaseText = {
    clue: turnPlayer ? `ตาของ ${turnPlayer.id === s.me ? 'คุณ' : turnPlayer.name} ใบ้คำ` : 'รอบใบ้คำ',
    vote: '🗳️ โหวตจับสปาย',
    white: `🤍 ${nameOf(uc.whiteId)} (Mr. White) กำลังทายคำ`,
    over: { civ: '🏡 ชาวบ้านชนะ!', uc: '🕵️ สปายชนะ!', white: '🤍 Mr. White ชนะ!' }[uc.winner] || '🏁 จบเกม',
  }[uc.phase];
  $('banner').textContent = over ? phaseText : `🕵️ รอบ ${uc.roundNo} · ${phaseText}`;
  $('subBanner').hidden = false;
  $('subBanner').innerHTML = over
    ? `คำของชาวบ้าน: <b>${esc(uc.civWord)}</b> · คำของสปาย: <b>${esc(uc.spyWord)}</b>`
    : `ในเกมมี สปาย ${uc.counts.uc} คน${uc.counts.white ? ' + Mr. White 1 คน' : ''} · เหลือ ${uc.alive.length} คน`;

  // การ์ดของฉัน
  const myClues = cluesOf(uc, s.me);
  let big;
  let hint;
  if (!uc.inGame) {
    big = '<div class="big">👀</div>';
    hint = 'คุณเข้ามากลางเกม — ดูไปก่อน รอเกมหน้า';
  } else if (uc.amWhite) {
    big = `<div class="big ${!peek && !over ? 'blur' : ''}">🤍 Mr. White</div>`;
    hint = over || peek ? 'คุณไม่มีคำ! ฟังคำใบ้ของเพื่อน แล้วใบ้ให้เนียน' : '👆 แตะเพื่อดู';
  } else {
    big = `<div class="big ${!peek && !over ? 'blur' : ''}">${esc(uc.myWord)}</div>`;
    hint = over || peek ? 'ไม่รู้ว่าเป็นชาวบ้านหรือสปาย — ใบ้ให้เนียน ไม่ชัดเกินไป!' : '👆 แตะเพื่อดูคำ (ระวังเพื่อนแอบดู!)';
  }
  if (uc.myRole) hint = `${out[s.me] ? '❌ คุณโดนโหวตออก — ' : ''}คุณคือ ${ROLE[uc.myRole]}`;
  $('myCard').innerHTML = `<div class="mycard ${out[s.me] ? 'is-out' : ''}">
    <div class="label"><span>🤫 คำของ${esc(me ? me.name : '')}</span><span>${me ? me.score : 0} แต้ม${isHost ? ' 👑' : ''}</span></div>
    ${big}
    <div class="hint">${hint}</div>
    ${myClues}
  </div>`;

  // การ์ดเพื่อน: คำใบ้ทุกรอบ / โหวต / ฝ่ายที่เปิดเผย
  const canVote = uc.phase === 'vote' && amAlive;
  $('players').innerHTML = s.players
    .filter((p) => p.id !== s.me)
    .map((p) => {
      const inGame = uc.alive.includes(p.id) || out[p.id] || (over && uc.roles && uc.roles[p.id]);
      const isOut = !!out[p.id];
      const role = (out[p.id] && out[p.id].role) || (uc.roles && uc.roles[p.id]);
      let status = '';
      if (!inGame) status = '👀 ดูอยู่ (รอเกมหน้า)';
      else if (isOut) status = `❌ ออกรอบ ${out[p.id].round} — ${ROLE[out[p.id].role]}`;
      else if (over && role) status = ROLE[role];
      else if (uc.phase === 'vote') status = uc.voted.includes(p.id) ? '✓ โหวตแล้ว' : '…ยังไม่โหวต';
      else if (p.id === s.currentTurn) status = uc.phase === 'white' ? '🤍 กำลังทาย' : '✏️ กำลังใบ้';
      if (!p.connected) status = '💤 ไม่ได้เปิดเกม';
      const votable = canVote && uc.alive.includes(p.id);
      const tally = uc.lastTally && uc.lastTally[p.id] && uc.phase !== 'vote' ? `<span class="tally">🗳️ ${uc.lastTally[p.id]}</span>` : '';
      const cls = ['player', 'uc-card', !p.connected && 'off', isOut && 'is-out', votable && 'votable target',
        uc.myVote === p.id && 'selected', role === 'uc' && 'role-uc', role === 'white' && 'role-white'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-id="${esc(p.id)}" data-name="${esc(p.name)}">
        ${p.id === s.hostId ? '<span class="crown" title="หัวห้อง">👑</span>' : ''}
        <span class="score">${p.score} แต้ม</span>
        <div class="name">${esc(p.name)} ${tally}</div>
        ${inGame ? cluesOf(uc, p.id) : ''}
        <div class="status">${votable ? (uc.myVote === p.id ? '🗳️ คุณโหวตคนนี้' : '👆 แตะเพื่อโหวต') : status}</div>
      </div>`;
    })
    .join('') || '<p class="muted center" style="grid-column:1/-1">ยังไม่มีเพื่อนในห้อง</p>';

  // แถบล่างจอ
  const bar = $('ucBar');
  bar.hidden = over;
  if (over) return;
  const myTurn = s.currentTurn === s.me;
  let info = '';
  let input = false;
  if (uc.phase === 'clue') {
    if (myTurn) {
      info = '🫵 ตาคุณ! ใบ้คำของคุณสั้น ๆ (ห้ามพูดคำตรง ๆ)';
      input = true;
      $('ucInput').placeholder = 'คำใบ้ เช่น "มีหนาม" "กลิ่นแรง"';
    } else info = turnPlayer ? `⏳ รอ ${turnPlayer.name} ใบ้คำ…` : '';
  } else if (uc.phase === 'vote') {
    info = `${amAlive ? (uc.myVote ? `🗳️ คุณโหวต ${nameOf(uc.myVote)} แล้ว` : '🗳️ แตะการ์ดคนที่คิดว่าเป็นสปาย') : '👀 เพื่อนกำลังโหวต'} · ${uc.voted.length}/${uc.voters}`;
  } else if (uc.phase === 'white') {
    if (myTurn) {
      info = '🤍 ทายคำของชาวบ้าน — ถูกแล้วชนะเลย!';
      input = true;
      $('ucInput').placeholder = 'คำของชาวบ้านคือ…';
    } else info = `⏳ ${nameOf(uc.whiteId)} (Mr. White) กำลังทายคำของชาวบ้าน…`;
  }
  $('ucInfoText').textContent = info;
  $('ucInputRow').hidden = !input;
  $('ucSend').textContent = uc.phase === 'white' ? 'ทาย!' : 'ส่งคำใบ้';
  $('ucPassBtn').hidden = !input;
  $('ucSkipBtn').hidden = myTurn || !turnPlayer || uc.phase === 'vote';
  if (!$('ucSkipBtn').dataset.armed) $('ucSkipBtn').textContent = turnPlayer ? `✅ จบตา ${turnPlayer.name}` : '✅ จบตา';
  $('closeVoteBtn').hidden = !(isHost && uc.phase === 'vote');
}

// ---------- ทายคำตรงกลาง ----------
function renderCenter(s, me, isHost, turnPlayer) {
  const ct = s.ct;
  const over = ct.phase === 'over';
  const nameOf = (id) => (s.players.find((p) => p.id === id) || {}).name || '?';
  const askerName = nameOf(ct.asker);
  $('guessForm').hidden = true;
  $('ucBar').hidden = true;

  const qLeft = ct.maxQ - ct.qa.length;
  if (over) {
    $('banner').textContent = ct.reason === 'guessed' ? `🎉 ${nameOf(ct.winnerId)} ทายถูก!`
      : ct.reason === 'maxq' ? `🎙️ ${nameOf(ct.masterId)} (คนตอบ) ชนะ! ไม่มีใครทายถูก` : '🏁 จบเกม';
  } else {
    const who = ct.phase === 'answer' ? `รอ ${nameOf(ct.masterId)} ตอบ` : `ตาของ ${ct.asker === s.me ? 'คุณ' : askerName}`;
    $('banner').textContent = `❓ หมวด: ${ct.category} · ${who}`;
  }
  $('subBanner').hidden = false;
  $('subBanner').innerHTML = `🎙️ คนตอบ: <b>${esc(nameOf(ct.masterId))}</b> · ถามแล้ว ${ct.qa.length}/${ct.maxQ}${!over && qLeft <= 0 ? ' — ทายได้อย่างเดียว' : ''}`;

  // กระดานกลาง: คำลับ + คำถาม/คำตอบทั้งหมด
  const showWord = ct.word && (over || !ct.amMaster || peek);
  const wordBox = ct.word
    ? `<div class="big ${showWord ? '' : 'blur'}">${esc(ct.word)}</div>`
    : '<div class="big secret">❓ ❓ ❓</div>';
  const hint = over ? 'เฉลยคำตรงกลาง'
    : ct.amMaster ? (peek ? '🎙️ คุณเป็นคนตอบ — ตอบตามจริง ห้ามบอกคำ!' : '🎙️ คุณเป็นคนตอบ · 👆 แตะเพื่อดูคำลับ')
    : `คำลับตรงกลาง (หมวด ${esc(ct.category)}) — ถามใช่/ไม่ใช่ แล้วทายให้ถูก`;
  const qa = ct.qa.map((x, i) => `<li><span class="rno">${i + 1}</span><b>${esc(nameOf(x.id))}:</b> ${esc(x.q)}
      <span class="ans ans-${x.a || 'wait'}">${x.a ? esc(ct.answers[x.a]) : '…รอคำตอบ'}</span></li>`).reverse().join('');
  const wrong = ct.guesses.filter((g) => !g.correct).map((g) => `<span class="chip-x">${esc(nameOf(g.id))}: ${esc(g.text)} ❌</span>`).join('');
  $('myCard').innerHTML = `<div class="mycard center-board">
    <div class="label"><span>${ct.amMaster ? '🤫 คำลับ (เห็นคนเดียว)' : '❓ คำตรงกลาง'}</span><span>${me ? me.score : 0} แต้ม${isHost ? ' 👑' : ''}</span></div>
    ${wordBox}
    <div class="hint">${hint}</div>
    ${wrong ? `<div class="wrong-list">${wrong}</div>` : ''}
    <ul class="qa">${qa || '<li class="muted">ยังไม่มีคำถาม — คนแรกเริ่มถามได้เลย</li>'}</ul>
  </div>`;

  // การ์ดเพื่อน
  $('players').innerHTML = s.players
    .filter((p) => p.id !== s.me)
    .map((p) => {
      let status = '';
      if (p.id === ct.masterId) status = '🎙️ คนตอบ';
      else if (over && p.id === ct.winnerId) status = '🎉 ทายถูก!';
      else if (!over && p.id === ct.asker) status = ct.phase === 'answer' ? '❓ ถามอยู่' : '✏️ ถึงตา';
      if (!p.connected) status = '💤 ไม่ได้เปิดเกม';
      const cls = ['player', !p.connected && 'off', p.id === ct.masterId && 'role-master'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-id="${esc(p.id)}">
        ${p.id === s.hostId ? '<span class="crown" title="หัวห้อง">👑</span>' : ''}
        <span class="score">${p.score} แต้ม</span>
        <div class="name">${esc(p.name)}</div>
        <div class="status">${status}</div>
      </div>`;
    })
    .join('') || '<p class="muted center" style="grid-column:1/-1">ยังไม่มีเพื่อนในห้อง</p>';

  // แถบล่างจอ
  const bar = $('ctBar');
  bar.hidden = over;
  if (over) return;
  const myAsk = ct.asker === s.me && ct.phase !== 'answer';
  const myAnswer = ct.amMaster && ct.phase === 'answer';
  const turnId = `${s.round}|${ct.turnNo}`;
  if (turnId !== ctInputTurn) { ctInputTurn = turnId; ctInput = 'ask'; }
  let info = '';
  if (myAnswer) info = `❓ ${askerName} ถาม: "${ct.qa[ct.qa.length - 1].q}"`;
  else if (myAsk) info = ct.phase === 'guess' ? '🎯 ได้คำตอบแล้ว — ทายได้ 1 ครั้ง หรือจบตา' : '🫵 ตาคุณ! ถามใช่/ไม่ใช่ หรือกด "ทายเลย"';
  else if (ct.phase === 'answer') info = ct.amMaster ? '' : `⏳ รอ ${nameOf(ct.masterId)} ตอบคำถามของ ${askerName}…`;
  else info = `⏳ ตาของ ${askerName}…`;
  $('ctInfoText').textContent = info;
  $('ctAnswerRow').hidden = !myAnswer;
  $('ctInputRow').hidden = !myAsk;
  const guessing = ct.phase === 'guess' || qLeft <= 0 || ctInput === 'guess';
  $('ctInput').placeholder = guessing ? 'ทายคำ… (ทายได้ 1 ครั้งต่อตา)' : 'ถามใช่/ไม่ใช่ เช่น "มีขาไหม"';
  $('ctSend').textContent = guessing ? 'ทาย!' : 'ถาม';
  $('ctModeBtn').hidden = ct.phase !== 'ask' || qLeft <= 0;
  $('ctModeBtn').textContent = guessing ? '❓ ถามแทน' : '🎯 ทายเลย';
  $('ctPassBtn').hidden = false;
  $('ctSkipBtn').hidden = myAsk || myAnswer || !turnPlayer;
  if (!$('ctSkipBtn').dataset.armed) $('ctSkipBtn').textContent = turnPlayer ? `✅ จบตา ${turnPlayer.name}` : '✅ จบตา';
}

// ถาม-ตอบ ที่เพื่อนถามเกี่ยวกับคำของคนนี้ (เกมทายคำ)
function qaOf(gq, id, nameOf) {
  const list = (gq.qa && gq.qa[id]) || [];
  if (!list.length) return '';
  return `<ul class="qa qa-mini">${list.map((x) => `<li><b>${esc(nameOf(x.id))}:</b> ${esc(x.q)}
    <span class="ans ans-${x.a || 'wait'}">${x.a ? esc(gq.answers[x.a]) : '…'}</span></li>`).join('')}</ul>`;
}

function cluesOf(uc, id) {
  const list = uc.clues.filter((c) => c.id === id);
  if (!list.length) return '<ul class="clues"><li class="muted">ยังไม่ได้ใบ้</li></ul>';
  return `<ul class="clues">${list.map((c) => `<li><span class="rno">R${c.round}</span>${c.text == null ? '<i class="muted">ข้าม</i>' : esc(c.text)}</li>`).join('')}</ul>`;
}

function feedItem(f) {
  switch (f.type) {
    case 'correct': return `<li class="ok">🎉 <b>${esc(f.name)}</b> ทายคำของ <b>${esc(f.target)}</b> ถูก! "${esc(f.text)}" (+${f.pts})</li>`;
    case 'pass':
      if (f.auto) return `<li class="muted">💤 ข้ามตา <b>${esc(f.name)}</b> (ไม่ได้เปิดเกม)</li>`;
      if (f.by) return `<li class="muted">✅ <b>${esc(f.by)}</b> จบตาของ ${esc(f.name)}</li>`;
      return `<li class="muted">✅ <b>${esc(f.name)}</b> จบตา</li>`;
    case 'timeout': return f.vote ? '<li class="muted">⏱️ หมดเวลาโหวต — นับผลเท่าที่มี</li>' : `<li class="muted">⏱️ หมดเวลา! ข้ามตา <b>${esc(f.name)}</b></li>`;
    case 'survive': return `<li>🛡️ <b>${esc(f.name)}</b> รอด — คำคือ "${esc(f.text)}" (+${f.pts})</li>`;
    case 'ct-guess': return `<li class="${f.correct ? 'ok' : 'bad'}">${f.correct ? '🎉' : '❌'} <b>${esc(f.name)}</b> ทาย "${esc(f.text)}"${f.correct ? ' — ถูก! (+3)' : ''}</li>`;
    case 'ct-over':
      if (f.reason === 'maxq') return `<li class="ok">🎙️ ครบ 20 คำถาม ไม่มีใครทายถูก — <b>${esc(f.name)}</b> (คนตอบ) +3 · คำคือ "${esc(f.word)}"</li>`;
      if (f.reason === 'guessed') return `<li class="ok">🏁 จบรอบ — คำคือ "${esc(f.word)}"</li>`;
      return `<li class="muted">🏁 จบรอบ — คำคือ "${esc(f.word)}"</li>`;
    case 'uc-tie': return '<li class="muted">🤝 โหวตเสมอ — ไม่มีใครออก ใบ้ต่อรอบหน้า</li>';
    case 'uc-out': return `<li class="${f.role === 'ชาวบ้าน' ? 'bad' : 'ok'}">🗳️ <b>${esc(f.name)}</b> โดนโหวตออก (${f.votes} เสียง) — เป็น <b>${esc(f.role)}</b></li>`;
    case 'uc-white': return f.text == null
      ? `<li class="muted">🤍 <b>${esc(f.name)}</b> ไม่ได้ทายคำ</li>`
      : `<li class="${f.correct ? 'ok' : 'bad'}">🤍 <b>${esc(f.name)}</b> ทายว่า "${esc(f.text)}" — ${f.correct ? 'ถูก!' : 'ผิด'}</li>`;
    case 'uc-win': return f.winner
      ? `<li class="ok">🏆 ${{ civ: 'ชาวบ้านชนะ', uc: 'สปายชนะ', white: 'Mr. White ชนะ' }[f.winner]}! (+${f.pts})</li>`
      : '<li class="muted">🏁 หัวห้องจบเกม</li>';
    default: return `<li class="bad"><b>${esc(f.name)}</b> ทายคำของ ${esc(f.target)} ว่า "${esc(f.text)}" — ผิด</li>`;
  }
}

// เปิดหน้ามาแล้วเคยอยู่ในห้อง → โชว์ห้องไว้ก่อน แล้วเข้าห้องอัตโนมัติเมื่อต่อติด (socket 'connect')
if (session) showRoom(true);

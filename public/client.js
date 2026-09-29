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
  for (const m of j.chat || []) addChatMsg(m);
  if (!j.view) return;
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
  if (s.round !== lastRound && s.state === 'playing') {
    lastRound = s.round;
    peek = false;
    toast(`🎲 รอบใหม่! หมวด: ${s.category}`, 150);
  }
  if (s.state === 'playing' && s.currentTurn === s.me && (!prev || prev.currentTurn !== s.me || prev.round !== s.round)) {
    setTimeout(() => toast('🫵 ถึงตาคุณแล้ว! ทายคำของเพื่อนได้เลย', [120, 60, 120]), prev && prev.round !== s.round ? 1200 : 0);
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
  api('start', { category: $('categorySelect').value }).then((res) => {
    if (res.error) $('hostError').textContent = res.error;
  });
});
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

$('guessForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const targetId = $('targetSelect').value;
  const text = $('guessInput').value.trim();
  if (!text || !targetId) return;
  const targetName = $('targetSelect').selectedOptions[0].textContent;
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

// ---------- แชท ----------
let chatOpen = false;
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
  if (nearBottom || !chatOpen) scrollChat();
  const fromMe = session && m.name === session.name;
  if (!chatOpen && !m.system && !fromMe) {
    setUnread(unread + 1);
    if (navigator.vibrate) navigator.vibrate(30);
  }
}

function openChat() {
  chatOpen = true;
  $('chatSheet').hidden = false;
  setUnread(0);
  scrollChat();
  $('chatInput').focus();
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

// แตะการ์ดเพื่อนเพื่อเลือกคนที่จะทาย
$('players').addEventListener('click', (e) => {
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

function render() {
  const s = state;
  const me = s.players.find((p) => p.id === s.me);
  const isHost = s.hostId === s.me;
  const myTurn = s.state === 'playing' && s.currentTurn === s.me;
  const targets = myTurn
    ? s.players.filter((p) => p.id !== s.me && p.hasWord && !p.guessedBy)
    : [];
  const turnPlayer = s.players.find((p) => p.id === s.currentTurn);

  // ตัวเลือกคนที่จะทาย (คงค่าที่เลือกไว้ถ้ายังทายได้)
  const tsel = $('targetSelect');
  const prev = tsel.value;
  tsel.innerHTML = targets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if (targets.some((p) => p.id === prev)) tsel.value = prev;
  const selected = tsel.value;

  $('roomCode').textContent = s.code;
  $('roundInfo').textContent = s.round ? `· รอบ ${s.round}` : `· ${s.players.length} คน`;

  // ลำดับตาเล่น
  $('turnStrip').hidden = s.state !== 'playing';
  $('turnStrip').innerHTML = s.turnOrder.map((id, i) => {
    const p = s.players.find((x) => x.id === id);
    if (!p) return '';
    const cls = [id === s.currentTurn && 'now', !p.connected && 'off'].filter(Boolean).join(' ');
    return `<li class="${cls}">${i + 1}. ${esc(p.name)}${id === s.me ? ' (ฉัน)' : ''}</li>`;
  }).join('');
  $('turnStrip').querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  $('banner').textContent = {
    lobby: 'รอเริ่มเกม',
    playing: `หมวด: ${s.category}${turnPlayer ? ` · ตาของ ${turnPlayer.id === s.me ? 'คุณ' : turnPlayer.name}` : ''}`,
    reveal: `เฉลย — หมวด ${s.category}`,
  }[s.state];

  // การ์ดคำลับของฉัน
  if (me && s.state !== 'lobby' && me.hasWord) {
    const safe = me.guessedBy || s.state === 'reveal';
    const blur = !safe && !peek;
    let hint = blur ? '👆 แตะเพื่อดูคำลับ (ระวังเพื่อนแอบดู!)' : '👆 แตะเพื่อซ่อน';
    if (me.guessedBy) hint = `🎯 โดน ${esc(me.guessedBy)} ทายถูกแล้ว`;
    else if (s.state === 'reveal') hint = '🛡️ รอด! ไม่มีใครทายถูก (+3)';
    $('myCard').innerHTML = `<div class="mycard">
      <div class="label"><span>🤫 คำลับของ${esc(me.name)}</span><span>${me.score} แต้ม${isHost ? ' 👑' : ''}</span></div>
      <div class="big ${blur ? 'blur' : ''}">${esc(me.word)}</div>
      <div class="hint">${hint}</div>
    </div>`;
  } else if (me) {
    $('myCard').innerHTML = `<div class="mycard"><div class="label"><span>${esc(me.name)} (ฉัน)</span><span>${me.score} แต้ม${isHost ? ' 👑' : ''}</span></div>
      <div class="hint">${s.state === 'lobby' ? 'รอเริ่มเกม…' : 'รอรอบหน้า'}</div></div>`;
  }

  // การ์ดเพื่อน
  $('players').innerHTML = s.players
    .filter((p) => p.id !== s.me)
    .map((p) => {
      let word = '';
      if (s.state !== 'lobby') {
        word = !p.hasWord
          ? '<div class="word secret">รอรอบหน้า</div>'
          : p.word == null
            ? '<div class="word secret">???</div>'
            : `<div class="word">${esc(p.word)}</div>`;
      }
      const canTarget = targets.some((t) => t.id === p.id);
      let status = '';
      if (p.guessedBy) status = `🎯 โดน ${esc(p.guessedBy)} ทาย`;
      else if (s.state === 'reveal' && p.hasWord) status = '🛡️ รอด (+3)';
      else if (canTarget) status = p.id === selected ? '✏️ กำลังทายคนนี้' : '👆 แตะเพื่อทาย';
      if (!p.connected) status = '💤 ไม่ได้เปิดเกม';
      const cls = ['player', !p.connected && 'off', canTarget && 'target', canTarget && p.id === selected && 'selected'].filter(Boolean).join(' ');
      return `<div class="${cls}" data-id="${esc(p.id)}">
        ${p.id === s.hostId ? '<span class="crown" title="หัวห้อง">👑</span>' : ''}
        <span class="score">${p.score} แต้ม</span>
        <div class="name">${esc(p.name)}</div>
        ${word}
        <div class="status">${status}</div>
      </div>`;
    })
    .join('') || '<p class="muted center" style="grid-column:1/-1">ยังไม่มีเพื่อนในห้อง — กด 📤 ชวนเพื่อน</p>';

  renderLeaderboard(s);

  // ปุ่มหัวห้อง
  $('hostControls').hidden = !isHost;
  $('startBtn').hidden = s.state === 'playing';
  $('categorySelect').parentElement.hidden = s.state === 'playing';
  $('endBtn').hidden = s.state !== 'playing';
  $('startBtn').textContent = s.round ? 'เริ่มรอบใหม่' : 'เริ่มเกม';
  const sel = $('categorySelect');
  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="random">🎲 สุ่มหมวด</option>' +
      s.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  $('waitHost').hidden = isHost || s.state === 'playing';

  // แถบทายคำ: ตาเรา → ช่องทาย / ไม่ใช่ตาเรา → บอกว่ารอใคร
  $('guessForm').hidden = s.state !== 'playing' || !me || !me.hasWord;
  $('myTurn').hidden = !myTurn || targets.length === 0;
  $('waitTurn').hidden = myTurn;
  $('waitTurnText').textContent = turnPlayer ? `⏳ รอตาของ ${turnPlayer.name}…` : '';
  $('skipBtn').hidden = myTurn || !turnPlayer;
  if (!$('skipBtn').dataset.armed) $('skipBtn').textContent = turnPlayer ? `✅ จบตา ${turnPlayer.name}` : '✅ จบตา';

  // ฟีด
  $('feed').innerHTML = s.feed.slice().reverse().map((f) => {
    if (f.type === 'correct') return `<li class="ok">🎉 <b>${esc(f.name)}</b> ทายคำของ <b>${esc(f.target)}</b> ถูก! "${esc(f.text)}" (+${f.pts})</li>`;
    if (f.type === 'pass') {
      if (f.auto) return `<li class="muted">💤 ข้ามตา <b>${esc(f.name)}</b> (ไม่ได้เปิดเกม)</li>`;
      if (f.by) return `<li class="muted">✅ <b>${esc(f.by)}</b> จบตาของ ${esc(f.name)}</li>`;
      return `<li class="muted">✅ <b>${esc(f.name)}</b> จบตา</li>`;
    }
    if (f.type === 'survive') return `<li>🛡️ <b>${esc(f.name)}</b> รอด — คำคือ "${esc(f.text)}" (+${f.pts})</li>`;
    return `<li class="bad"><b>${esc(f.name)}</b> ทายคำของ ${esc(f.target)} ว่า "${esc(f.text)}" — ผิด</li>`;
  }).join('') || '<li class="muted">ยังไม่มีอะไรเกิดขึ้น</li>';
}

// เปิดหน้ามาแล้วเคยอยู่ในห้อง → โชว์ห้องไว้ก่อน แล้วเข้าห้องอัตโนมัติเมื่อต่อติด (socket 'connect')
if (session) showRoom(true);

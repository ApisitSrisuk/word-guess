const API = '/api/room';
const POLL_MS = 1500;
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

// ---------- คุยกับเซิร์ฟเวอร์ (HTTP + ดึงข้อมูลซ้ำทุก ~1.5 วิ แทน WebSocket ให้ใช้บน Vercel ได้) ----------
let lastChatId = 0;
let lastSig = '';

async function api(action, data = {}) {
  const code = data.code || (session && session.code);
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code, key: deviceKey(), after: lastChatId, ...data }),
    });
    const j = await r.json().catch(() => ({ error: 'เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้ง' }));
    if (r.status === 404 && action !== 'join') kicked(j.error);
    else if (j.view) applyPayload(j);
    return j;
  } catch {
    setOffline(true);
    return { error: 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ต' };
  }
}

async function join(name, code) {
  $('loginError').textContent = '';
  code = code.trim().toUpperCase();
  const res = await api('join', { name, code });
  if (res.error) {
    $('loginError').textContent = res.error;
    showRoom(false);
    return;
  }
  session = { name: name.trim(), code };
  try {
    localStorage.setItem('wg-session', JSON.stringify(session));
    sessionStorage.setItem('wg-session', JSON.stringify(session));
  } catch {}
  history.replaceState(null, '', `?room=${encodeURIComponent(code)}`);
  setOffline(false);
  showRoom(true);
  schedulePoll(POLL_MS);
}

// ไม่ได้อยู่ในห้องแล้ว (หายไปนานเกิน 10 นาที หรือห้องหมดอายุ) → กลับหน้าเข้าห้อง
function kicked(msg) {
  clearTimeout(pollTimer);
  session = null;
  state = null;
  lastSig = '';
  try { sessionStorage.removeItem('wg-session'); } catch {}
  setOffline(false);
  showRoom(false);
  $('loginError').textContent = msg || 'หลุดออกจากห้องแล้ว กรุณาเข้าห้องใหม่';
}

function setOffline(on) {
  $('offline').hidden = !on;
}

let pollTimer;
let polling = false;
let fails = 0;
function schedulePoll(ms) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, ms);
}
async function poll() {
  if (!session || polling) return;
  polling = true;
  try {
    const q = new URLSearchParams({ code: session.code, key: deviceKey(), after: lastChatId });
    const r = await fetch(`${API}?${q}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) {
      // ไม่อยู่ในห้องแล้ว → ลองกลับเข้าห้องด้วยชื่อเดิมอัตโนมัติ
      polling = false;
      const res = await api('join', { name: session.name, code: session.code });
      if (res.error) kicked(res.error);
      else schedulePoll(POLL_MS);
      return;
    }
    if (!r.ok) throw new Error(j.error);
    fails = 0;
    setOffline(false);
    applyPayload(j);
  } catch {
    fails += 1;
    if (fails >= 2) setOffline(true);
  } finally {
    polling = false;
  }
  // แท็บ/แอปอยู่เบื้องหลัง → ดึงช้าลง (ประหยัดแบต แต่ยังนับว่าออนไลน์) แล้วดึงทันทีเมื่อกลับมา
  const base = document.visibilityState === 'visible' ? POLL_MS : 8000;
  if (session) schedulePoll(fails ? Math.min(base * 2 ** fails, 10000) : base);
}

function wake() {
  if (document.visibilityState === 'visible' && session) poll();
}
document.addEventListener('visibilitychange', wake);
window.addEventListener('online', wake);
window.addEventListener('pageshow', wake);

function applyPayload(j) {
  for (const m of j.chat || []) addChatMsg(m);
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
$('endBtn').addEventListener('click', () => {
  if (confirm('จบรอบและเฉลยคำทั้งหมดเลยไหม?')) api('endRound');
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

$('passBtn').addEventListener('click', () => api('pass'));
$('skipBtn').addEventListener('click', () => {
  const cur = state.players.find((p) => p.id === state.currentTurn);
  if (confirm(`ข้ามตาของ ${cur ? cur.name : 'คนนี้'}?`)) api('pass');
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
      if (!p.connected) status = '📴 หลุด';
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
  $('skipBtn').hidden = !isHost || myTurn || !turnPlayer;

  // ฟีด
  $('feed').innerHTML = s.feed.slice().reverse().map((f) => {
    if (f.type === 'correct') return `<li class="ok">🎉 <b>${esc(f.name)}</b> ทายคำของ <b>${esc(f.target)}</b> ถูก! "${esc(f.text)}" (+${f.pts})</li>`;
    if (f.type === 'pass') return `<li class="muted">⏭️ <b>${esc(f.name)}</b> ผ่านตา</li>`;
    if (f.type === 'survive') return `<li>🛡️ <b>${esc(f.name)}</b> รอด — คำคือ "${esc(f.text)}" (+${f.pts})</li>`;
    return `<li class="bad"><b>${esc(f.name)}</b> ทายคำของ ${esc(f.target)} ว่า "${esc(f.text)}" — ผิด</li>`;
  }).join('') || '<li class="muted">ยังไม่มีอะไรเกิดขึ้น</li>';
}

// เปิดหน้ามาแล้วเคยอยู่ในห้อง → กลับเข้าห้องเลย
if (session) {
  showRoom(true);
  join(session.name, session.code);
}

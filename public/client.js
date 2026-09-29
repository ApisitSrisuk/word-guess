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

// ลิงก์ชวนเพื่อน ?room=CODE → กรอกรหัสห้องให้เลย
const roomParam = new URLSearchParams(location.search).get('room');
try {
  const saved = JSON.parse(localStorage.getItem('wg-session') || 'null');
  if (saved) { $('nameInput').value = saved.name; $('codeInput').value = saved.code; }
  // รีเฟรชหน้า → กลับเข้าห้องเดิมอัตโนมัติ (จำเฉพาะแท็บนี้)
  session = JSON.parse(sessionStorage.getItem('wg-session') || 'null');
} catch {}
if (roomParam) $('codeInput').value = roomParam.toUpperCase();

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  join($('nameInput').value, $('codeInput').value);
});

function join(name, code, retries = 0) {
  $('loginError').textContent = '';
  socket.emit('join', { name, code }, (res) => {
    // ตอนรีเฟรช เซิร์ฟเวอร์อาจยังไม่รู้ว่าแท็บเก่าหลุด → ลองใหม่อีกครั้ง
    if (res.error && retries > 0) return setTimeout(() => join(name, code, retries - 1), 1500);
    if (res.error) {
      $('loginError').textContent = res.error;
      session = null;
      try { sessionStorage.removeItem('wg-session'); } catch {}
      return;
    }
    session = { name: name.trim(), code: code.trim().toUpperCase() };
    try {
      localStorage.setItem('wg-session', JSON.stringify(session));
      sessionStorage.setItem('wg-session', JSON.stringify(session));
    } catch {}
    history.replaceState(null, '', `?room=${encodeURIComponent(session.code)}`);
    $('login').hidden = true;
    $('room').hidden = false;
  });
}

// หลุดแล้วต่อใหม่ → กลับเข้าห้องเดิมอัตโนมัติ
socket.on('connect', () => { if (session) join(session.name, session.code, 2); });
socket.on('disconnect', () => { if (session) toast('📴 การเชื่อมต่อหลุด กำลังต่อใหม่…'); });

socket.on('state', (s) => {
  const prev = state;
  state = s;
  notify(prev, s);
  render();
});

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
  socket.emit('start', $('categorySelect').value, (res) => {
    if (res.error) $('hostError').textContent = res.error;
  });
});
$('endBtn').addEventListener('click', () => {
  if (confirm('จบรอบและเฉลยคำทั้งหมดเลยไหม?')) socket.emit('endRound');
});

$('guessForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const targetId = $('targetSelect').value;
  const text = $('guessInput').value.trim();
  if (!text || !targetId) return;
  const targetName = $('targetSelect').selectedOptions[0].textContent;
  socket.emit('guess', { targetId, text }, (res) => {
    if (res.correct) toast(`🎉 ถูกต้อง! คำของ ${targetName} คือ "${text}" (+2)`, [60, 40, 60, 40, 120]);
    else toast(`❌ "${text}" ไม่ใช่คำของ ${targetName}`, 80);
  });
  $('guessInput').value = '';
});

$('passBtn').addEventListener('click', () => socket.emit('pass'));
$('skipBtn').addEventListener('click', () => {
  const cur = state.players.find((p) => p.id === state.currentTurn);
  if (confirm(`ข้ามตาของ ${cur ? cur.name : 'คนนี้'}?`)) socket.emit('pass');
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

socket.on('chatHistory', (list) => {
  chatMsgs.length = 0;
  chatMsgs.push(...list);
  $('chatList').replaceChildren(...list.map(renderChatMsg));
  scrollChat();
});
socket.on('chat', (m) => {
  if (chatMsgs.some((x) => x.id === m.id)) return;
  chatMsgs.push(m);
  if (chatMsgs.length > 100) { chatMsgs.shift(); $('chatList').firstChild?.remove(); }
  const nearBottom = $('chatList').scrollHeight - $('chatList').scrollTop - $('chatList').clientHeight < 80;
  $('chatList').append(renderChatMsg(m));
  if (nearBottom) scrollChat();
  const fromMe = session && m.name === session.name;
  if (!chatOpen && !m.system && !fromMe) {
    setUnread(unread + 1);
    if (navigator.vibrate) navigator.vibrate(30);
  }
});

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
  socket.emit('chat', text, (res) => {
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

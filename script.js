/* ---------- Mini state + persistence ---------- */
const STORAGE_KEY = 'mpd_state_v1';
const defaultState = {
  todos: [],
  notes: [],
  pomodoro: { work: 25, break: 5, running: false, mode: 'work', remaining: 25 * 60, lastTick: null },
  habits: []
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(defaultState);
  } catch (e) {
    console.error('loadState', e);
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------- Helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const el = id => document.getElementById(id);
const fmtTime = s => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ringCircumference = 2 * Math.PI * 94;

function animateValue(node, target) {
  if (!node) return;
  const text = String(target);
  if (reduceMotion || !/\d/.test(text)) {
    node.textContent = text;
    return;
  }
  const numeric = Number(text.replace(/[^\d.-]/g, ''));
  if (Number.isNaN(numeric)) {
    node.textContent = text;
    return;
  }
  const suffix = text.replace(/^[\d.-]+/, '');
  const start = performance.now();
  const duration = 850;
  function step(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = `${Math.round(numeric * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setTimerRing() {
  const ring = el('pomRing');
  if (!ring) return;
  const p = state.pomodoro;
  const total = Math.max(1, (p.mode === 'work' ? p.work : p.break) * 60);
  const ratio = Math.max(0, Math.min(1, p.remaining / total));
  ring.style.strokeDasharray = `${ringCircumference}`;
  ring.style.strokeDashoffset = `${ringCircumference * (1 - ratio)}`;
}

function applyNoteStyles() {
  const notes = el('notesGrid');
  if (!notes) return;
  const cards = notes.querySelectorAll('.note');
  const accents = ['rgba(251, 191, 36, 0.2)', 'rgba(244, 63, 94, 0.18)', 'rgba(168, 85, 247, 0.18)'];
  cards.forEach((card, index) => {
    card.style.setProperty('--note-rotation', `${((index % 3) - 1) * 0.55}deg`);
    card.style.setProperty('--note-accent', accents[index % accents.length]);
  });
}

function initCursor() {
  const cursor = document.querySelector('.cursor-dot');
  if (!cursor || reduceMotion) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let targetX = x;
  let targetY = y;
  window.addEventListener('pointermove', event => {
    targetX = event.clientX;
    targetY = event.clientY;
  }, { passive: true });
  (function follow() {
    x += (targetX - x) * 0.14;
    y += (targetY - y) * 0.14;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    requestAnimationFrame(follow);
  })();
}

function initStarfield() {
  const canvas = el('starfield');
  if (!canvas || reduceMotion) return;
  const context = canvas.getContext('2d');
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.2, v: Math.random() * 0.18 + 0.03, a: Math.random() * 0.6 + 0.12 }));
  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  function frame() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    stars.forEach(star => {
      star.y += star.v / 100;
      if (star.y > 1.05) {
        star.y = -0.05;
        star.x = Math.random();
      }
      context.globalAlpha = star.a;
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(star.x * window.innerWidth, star.y * window.innerHeight, star.r, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  frame();
}

/* ---------- To-Do logic ---------- */
function renderTodos() {
  const container = el('todoList');
  container.innerHTML = '';
  state.todos.sort((a, b) => b.createdAt - a.createdAt).forEach(t => {
    const row = document.createElement('div');
    row.className = 'todo-row' + (t.done ? ' completed' : '');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!t.done;
    chk.addEventListener('change', () => { t.done = chk.checked; saveState(); renderTodos(); updateStats(); });
    const txt = document.createElement('div');
    txt.textContent = t.text;
    txt.style.marginLeft = '8px';
    txt.style.flex = '1';
    const actions = document.createElement('div');
    actions.className = 'todo-actions';
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', () => { state.todos = state.todos.filter(x => x.id !== t.id); saveState(); renderTodos(); updateStats(); });
    actions.appendChild(del);
    row.appendChild(chk);
    row.appendChild(txt);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

el('addTodo').addEventListener('click', e => { e.preventDefault(); addTodo(); });
el('todoInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } });
function addTodo() {
  const v = el('todoInput').value.trim();
  if (!v) return;
  state.todos.push({ id: uid(), text: v, done: false, createdAt: Date.now() });
  el('todoInput').value = '';
  saveState();
  renderTodos();
  updateStats();
}

/* ---------- Notes logic ---------- */
function renderNotes() {
  const grid = el('notesGrid');
  grid.innerHTML = '';
  state.notes.slice().reverse().forEach(n => {
    const card = document.createElement('div');
    card.className = 'note';
    const p = document.createElement('div');
    p.textContent = n.text;
    p.style.whiteSpace = 'pre-wrap';
    const foot = document.createElement('div');
    foot.className = 'small';
    foot.style.marginTop = '8px';
    foot.style.display = 'flex';
    foot.style.justifyContent = 'space-between';
    foot.style.alignItems = 'center';
    const date = new Date(n.createdAt).toLocaleString();
    foot.innerHTML = `<div>${date}</div>`;
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', () => { state.notes = state.notes.filter(x => x.id !== n.id); saveState(); renderNotes(); });
    foot.appendChild(del);
    card.appendChild(p);
    card.appendChild(foot);
    grid.appendChild(card);
  });
  applyNoteStyles();
}

el('saveNote').addEventListener('click', saveNote);
el('noteInput').addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') saveNote(); });
function saveNote() {
  const val = el('noteInput').value.trim();
  if (!val) return;
  state.notes.push({ id: uid(), text: val, createdAt: Date.now() });
  el('noteInput').value = '';
  saveState();
  renderNotes();
}
el('clearNotes').addEventListener('click', () => { if (confirm('Clear all notes?')) { state.notes = []; saveState(); renderNotes(); } });

/* ---------- Pomodoro ---------- */
let pomInterval = null;
function renderPom() {
  const p = state.pomodoro;
  el('pomMode').textContent = p.mode === 'work' ? 'Work' : 'Break';
  el('pomTimer').textContent = fmtTime(p.remaining);
  el('workDuration').value = p.work;
  el('breakDuration').value = p.break;
  setTimerRing();
}
function tickPom() {
  const p = state.pomodoro;
  const now = Date.now();
  if (!p.running) { p.lastTick = null; return; }
  if (!p.lastTick) p.lastTick = now;
  const elapsed = Math.floor((now - p.lastTick) / 1000);
  if (elapsed <= 0) return;
  p.remaining = Math.max(0, p.remaining - elapsed);
  p.lastTick = now;
  if (p.remaining === 0) {
    if (p.mode === 'work') { p.mode = 'break'; p.remaining = p.break * 60; }
    else { p.mode = 'work'; p.remaining = p.work * 60; }
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(); ac.close(); } catch (e) {}
  }
  saveState();
  renderPom();
}
el('pomStart').addEventListener('click', () => {
  const p = state.pomodoro;
  if (p.running) return;
  p.running = true;
  p.lastTick = Date.now();
  saveState();
  renderPom();
  pomInterval = setInterval(() => { tickPom(); }, 1000);
});
el('pomPause').addEventListener('click', () => { const p = state.pomodoro; p.running = false; p.lastTick = null; saveState(); renderPom(); clearInterval(pomInterval); pomInterval = null; });
el('pomReset').addEventListener('click', () => { const p = state.pomodoro; p.running = false; p.mode = 'work'; p.remaining = p.work * 60; p.lastTick = null; saveState(); renderPom(); clearInterval(pomInterval); pomInterval = null; });
el('saveDur').addEventListener('click', () => {
  const w = parseInt(el('workDuration').value) || 25;
  const b = parseInt(el('breakDuration').value) || 5;
  state.pomodoro.work = Math.max(1, Math.min(120, w));
  state.pomodoro.break = Math.max(1, Math.min(60, b));
  state.pomodoro.remaining = state.pomodoro.mode === 'work' ? state.pomodoro.work * 60 : state.pomodoro.break * 60;
  saveState();
  renderPom();
});

function tryResumePom() {
  if (state.pomodoro.running) {
    pomInterval = setInterval(() => tickPom(), 1000);
  }
}

/* ---------- Habit tracker ---------- */
function renderHabits() {
  const container = el('habitList');
  container.innerHTML = '';
  state.habits.forEach(h => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    const title = document.createElement('div');
    title.textContent = h.name;
    title.style.fontWeight = '600';

    const days = document.createElement('div');
    days.className = 'days';
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayEl = document.createElement('div');
      dayEl.className = 'day' + (h.week && h.week[key] ? ' active' : '');
      dayEl.textContent = new Date(key).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
      dayEl.title = new Date(key).toLocaleDateString();
      dayEl.addEventListener('click', () => {
        h.week = h.week || {};
        if (h.week[key]) delete h.week[key]; else h.week[key] = true;
        saveState();
        renderHabits();
        updateStats();
      });
      days.appendChild(dayEl);
    }

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    del.addEventListener('click', () => { state.habits = state.habits.filter(x => x.id !== h.id); saveState(); renderHabits(); updateStats(); });
    row.appendChild(title);
    row.appendChild(days);
    row.appendChild(del);
    container.appendChild(row);
  });
}
el('addHabit').addEventListener('click', () => {
  const v = el('habitName').value.trim();
  if (!v) return;
  state.habits.push({ id: uid(), name: v, week: {} });
  el('habitName').value = '';
  saveState();
  renderHabits();
  updateStats();
});

/* ---------- Import/Export & reset ---------- */
el('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'productivity-dashboard-export.json';
  a.click();
  URL.revokeObjectURL(url);
});
el('importBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const imported = JSON.parse(r.result);
        state = Object.assign(structuredClone(defaultState), imported);
        saveState();
        renderAll();
        alert('Data imported successfully');
      } catch (err) {
        alert('Invalid file format');
      }
    };
    r.readAsText(f);
  };
  input.click();
});
el('resetBtn').addEventListener('click', () => { if (confirm('Reset all data to default? This cannot be undone.')) { state = structuredClone(defaultState); saveState(); renderAll(); } });

/* ---------- Small UI helpers ---------- */
el('startTour').addEventListener('click', () => {
  const appSurface = document.querySelector('.app-surface');
  window.scrollTo({ top: appSurface.offsetTop - 20, behavior: 'smooth' });
});

/* ---------- Stats ---------- */
function updateStats() {
  const pendingTasks = state.todos.filter(t => !t.done).length;
  animateValue(el('pendingTasksCount'), pendingTasks);

  const todayStr = new Date().toISOString().slice(0, 10);
  const habitsToday = state.habits.filter(h => h.week && h.week[todayStr]).length;
  animateValue(el('habitsTodayCount'), habitsToday);

  animateValue(el('focusSessionsCount'), state.pomodoro.totalSessions || 0);

  const totalTasks = state.todos.length;
  const completedTasks = state.todos.filter(t => t.done).length;
  const taskRate = totalTasks > 0 ? (completedTasks / totalTasks) : 1;
  const habitRate = state.habits.length > 0 ? (habitsToday / state.habits.length) : 1;
  const score = Math.round(((taskRate + habitRate) / 2) * 100);
  animateValue(el('productivityScore'), `${score || 0}%`);
}

/* ---------- Boot / renderAll ---------- */
function renderAll() {
  renderTodos();
  renderNotes();
  renderPom();
  renderHabits();
  updateStats();
}

if (!state.pomodoro.remaining) state.pomodoro.remaining = state.pomodoro.work * 60;

initCursor();
initStarfield();
renderAll();
tryResumePom();

setInterval(() => { saveState(); }, 2000);

window.__MPD = { getState: () => state, saveState };
/* OMAD — app logic */
(function () {
  'use strict';

  const LBS_PER_KG = 2.20462262185;

  // ---------- State ----------
  let settings = { key: 'app', displayUnit: 'kg', theme: 'light', countdownEnd: null };
  let meals = [];    // sorted ascending by time
  let weights = [];  // sorted ascending by time
  let vitaminDays = new Set(); // dayKeys where multivitamins were taken
  let currentView = 'today';
  let calMonth = null;
  let tickTimer = null;

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const kgToDisplay = (kg) => settings.displayUnit === 'kg' ? kg : kg * LBS_PER_KG;
  const displayToKg = (v) => settings.displayUnit === 'kg' ? v : v / LBS_PER_KG;
  const fmtWeight = (kg) => kgToDisplay(kg).toFixed(1);

  // Count-up duration. Under 24h: "Xh YYm". 24h or more: "Xd YYh ZZm".
  function fmtElapsed(ms) {
    if (ms < 0) ms = 0;
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (days >= 1) return days + 'd ' + String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm';
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }
  // Countdown with seconds.
  function fmtCountdown(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
  }
  const fmtClock = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  function toLocalInput(date) {
    const off = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - off).toISOString().slice(0, 16);
  }
  const sortByTime = (arr) => arr.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  function mealsWithGaps() {
    return meals.map((m, i) => ({
      ...m,
      gapMs: i > 0 ? new Date(m.timestamp) - new Date(meals[i - 1].timestamp) : null
    }));
  }

  // ---------- Data ----------
  async function loadAll() {
    const s = await DB.get('settings', 'app');
    if (s) settings = Object.assign(settings, s);
    meals = sortByTime(await DB.getAll('meals'));
    weights = sortByTime(await DB.getAll('weights'));
    vitaminDays = new Set((await DB.getAll('vitamins')).map(v => v.day));
  }
  async function setVitamins(taken) {
    const k = dayKey(new Date());
    if (taken) { await DB.put('vitamins', { day: k, taken: true }); vitaminDays.add(k); }
    else { await DB.remove('vitamins', k); vitaminDays.delete(k); }
  }
  async function resetAllData() {
    const ok = window.confirm('Reset ALL data?\n\nThis permanently deletes every meal, weigh-in, vitamin record, and setting on this device. It cannot be undone.');
    if (!ok) return;
    await DB.clear('meals');
    await DB.clear('weights');
    await DB.clear('vitamins');
    await DB.clear('settings');
    location.reload();
  }
  async function saveSettings() { await DB.put('settings', settings); }

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#16191C' : '#6B9080');
  }

  // ---------- Navigation ----------
  const TITLES = { today: 'Today', log: 'Fasting Log', weight: 'Weight', progress: 'Progress', settings: 'Settings' };
  function switchView(view) {
    currentView = view;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    $('#view-title').textContent = TITLES[view];
    renderView(view);
  }
  function renderView(view) {
    if (view === 'today') renderToday();
    else if (view === 'log') renderLog();
    else if (view === 'weight') renderWeight();
    else if (view === 'progress') renderProgress();
    else if (view === 'settings') renderSettings();
  }

  // ---------- TODAY ----------
  function renderToday() {
    syncUnitToggles();
    $('#quick-weight-unit').textContent = settings.displayUnit;
    const latest = weights[weights.length - 1];
    $('#quick-weight-latest').textContent = latest
      ? 'Last: ' + fmtWeight(latest.weightKg) + ' ' + settings.displayUnit + ' · ' + fmtDay(new Date(latest.timestamp))
      : 'No weigh-ins yet.';
    $('#chk-vitamins').checked = vitaminDays.has(dayKey(new Date()));
    renderCountdownState();
    tick();
  }

  function tick() {
    updateFasting();
    updateCountdown();
  }

  function updateFasting() {
    const last = meals[meals.length - 1];
    const editBtn = $('#edit-last-meal');
    if (!last) {
      $('#fast-elapsed').textContent = '—';
      $('#fast-last').textContent = 'No meals logged yet.';
      editBtn.classList.add('hidden');
      return;
    }
    const d = new Date(last.timestamp);
    $('#fast-elapsed').textContent = fmtElapsed(Date.now() - d);
    $('#fast-last').textContent = 'Last meal ' + fmtClock(d) + ' · ' + fmtDay(d);
    editBtn.classList.remove('hidden');
  }

  // ---------- COUNTDOWN ----------
  function renderCountdownState() {
    const running = !!settings.countdownEnd;
    $('#cd-setup').classList.toggle('hidden', running);
    $('#cd-running').classList.toggle('hidden', !running);
    $('#cd-cancel').classList.toggle('hidden', !running);
  }
  function updateCountdown() {
    if (!settings.countdownEnd) return;
    const remaining = new Date(settings.countdownEnd) - Date.now();
    const card = $('.cd-card');
    if (remaining <= 0) {
      card.classList.add('done');
      $('#cd-display').textContent = "Time's up";
      $('#cd-sub').textContent = 'Tap Reset to set a new countdown.';
    } else {
      card.classList.remove('done');
      $('#cd-display').textContent = fmtCountdown(remaining);
      $('#cd-sub').textContent = 'remaining';
    }
  }
  async function startCountdown() {
    const h = parseInt($('#cd-hours').value, 10) || 0;
    const m = parseInt($('#cd-mins').value, 10) || 0;
    const totalMs = (h * 60 + m) * 60000;
    if (totalMs <= 0) return;
    settings.countdownEnd = new Date(Date.now() + totalMs).toISOString();
    await saveSettings();
    $('#cd-hours').value = '';
    $('#cd-mins').value = '';
    renderCountdownState();
    updateCountdown();
  }
  async function cancelCountdown() {
    settings.countdownEnd = null;
    await saveSettings();
    $('.cd-card').classList.remove('done');
    renderCountdownState();
  }

  // ---------- Meals / weights ----------
  async function logMeal(date, sugar) {
    await DB.put('meals', { id: DB.uid(), timestamp: date.toISOString(), sugar: sugar });
    meals = sortByTime(await DB.getAll('meals'));
    renderToday();
  }

  // ---------- Sugar picker helpers ----------
  function wireSugarPair(sugarEl, noSugarEl) {
    sugarEl.addEventListener('change', () => { if (sugarEl.checked) noSugarEl.checked = false; });
    noSugarEl.addEventListener('change', () => { if (noSugarEl.checked) sugarEl.checked = false; });
  }
  // returns true (had sugar), false (no sugar), or null (nothing picked)
  function readSugarPair(sugarEl, noSugarEl) {
    if (sugarEl.checked) return true;
    if (noSugarEl.checked) return false;
    return null;
  }
  function setSugarPair(sugarEl, noSugarEl, val) {
    sugarEl.checked = val === true;
    noSugarEl.checked = val === false;
  }
  function resetTodaySugar() {
    $('#chk-sugar').checked = false;
    $('#chk-nosugar').checked = false;
    $('#sugar-pick').classList.remove('needs');
  }
  async function addWeight(date, kg) {
    await DB.put('weights', { id: DB.uid(), timestamp: date.toISOString(), weightKg: kg });
    weights = sortByTime(await DB.getAll('weights'));
  }

  // ---------- FASTING LOG ----------
  function renderLog() {
    const list = $('#meal-list');
    if (!meals.length) { list.innerHTML = '<li class="empty">No meals yet. Log one from the Today tab.</li>'; return; }
    list.innerHTML = mealsWithGaps().slice().reverse().map(m => {
      const d = new Date(m.timestamp);
      const sub = m.gapMs == null ? 'First entry' : fmtElapsed(m.gapMs) + ' since previous meal';
      const tag = m.sugar === false
        ? '<span class="entry-badge badge-nosugar">no sugar</span>'
        : (m.sugar === true ? '<span class="entry-badge badge-sugar">sugar</span>' : '');
      return '<li class="entry-item" data-id="' + m.id + '" data-type="meal">' +
        '<div class="entry-main"><span class="entry-title">' + fmtClock(d) + ' · ' + fmtDay(d) + '</span>' +
        '<span class="entry-sub">' + sub + '</span></div>' + tag + '</li>';
    }).join('');
  }

  // ---------- WEIGHT ----------
  function renderWeight() {
    syncUnitToggles();
    renderChart();
    renderWeightStats();
    const list = $('#weight-list');
    if (!weights.length) { list.innerHTML = '<li class="empty">No weigh-ins yet.</li>'; return; }
    list.innerHTML = weights.slice().reverse().map(w => {
      const d = new Date(w.timestamp);
      return '<li class="entry-item" data-id="' + w.id + '" data-type="weight">' +
        '<div class="entry-main"><span class="entry-title">' + fmtClock(d) + ' · ' + fmtDay(d) + '</span></div>' +
        '<span class="entry-weight">' + fmtWeight(w.weightKg) + ' ' + settings.displayUnit + '</span></li>';
    }).join('');
  }

  function renderWeightStats() {
    const el = $('#weight-stats');
    if (weights.length < 1) { el.innerHTML = ''; return; }
    const first = weights[0].weightKg, last = weights[weights.length - 1].weightKg;
    const change = kgToDisplay(last) - kgToDisplay(first);
    let arrow = '·', color = 'var(--muted)';
    if (change > 0.05) { arrow = '▲'; color = 'var(--accent)'; }
    else if (change < -0.05) { arrow = '▼'; color = 'var(--primary)'; }
    const sign = change > 0 ? '+' : '';
    el.innerHTML =
      '<div><div class="ws-val">' + fmtWeight(last) + '</div><div class="ws-lab">current ' + settings.displayUnit + '</div></div>' +
      '<div><div class="ws-val" style="color:' + color + '">' + arrow + ' ' + sign + change.toFixed(1) + '</div><div class="ws-lab">trend ' + settings.displayUnit + '</div></div>' +
      '<div><div class="ws-val">' + weights.length + '</div><div class="ws-lab">entries</div></div>';
  }

  function renderChart() {
    const wrap = $('#weight-chart');
    if (weights.length < 2) {
      wrap.innerHTML = '<p class="muted-sm" style="text-align:center;padding:20px 0;">Add at least two weigh-ins to see a trend.</p>';
      return;
    }
    const W = 320, H = 150, padX = 10, padY = 18;
    const vals = weights.map(w => kgToDisplay(w.weightKg));
    const times = weights.map(w => new Date(w.timestamp).getTime());
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const span = (maxV - minV) || 1;
    const t0 = times[0], tSpan = (times[times.length - 1] - t0) || 1;
    const x = (t) => padX + ((t - t0) / tSpan) * (W - 2 * padX);
    const y = (v) => padY + (1 - (v - minV) / span) * (H - 2 * padY);
    const pts = vals.map((v, i) => x(times[i]) + ',' + y(v));
    const dots = vals.map((v, i) => '<circle cx="' + x(times[i]).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--accent)" />').join('');
    wrap.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
        '<text x="' + padX + '" y="12" fill="var(--muted)" font-size="10">' + maxV.toFixed(1) + '</text>' +
        '<text x="' + padX + '" y="' + (H - 4) + '" fill="var(--muted)" font-size="10">' + minV.toFixed(1) + '</text>' +
        '<polyline fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '" />' +
        dots +
      '</svg>';
  }

  // ---------- PROGRESS ----------
  // Per-day colour, purely by meals logged that calendar day (+ a blue stripe when no sugar):
  //   0 meals  -> gb     (green + blue: a no-meal day is a full fast, and has no sugar)
  //   1 meal   -> yellow (had sugar)  /  yb (yellow + blue: no sugar)
  //   2+ meals -> purple (any meal had sugar)  /  pb (purple + blue: none had sugar)
  // Blue (no sugar) never appears alone. Green days are the streak days.
  function dayStatuses() {
    const byDay = {};
    meals.forEach(m => {
      const k = dayKey(new Date(m.timestamp));
      if (!byDay[k]) byDay[k] = { count: 0, anySugar: false };
      byDay[k].count++;
      if (m.sugar !== false) byDay[k].anySugar = true; // undefined/true => treat as had sugar
    });
    const status = {};
    Object.keys(byDay).forEach(k => {
      const d = byDay[k];
      const noSugar = !d.anySugar;
      if (d.count >= 2) status[k] = noSugar ? 'pb' : 'purple';
      else status[k] = noSugar ? 'yb' : 'yellow';
    });
    // Any calendar day with no meal (from the first logged meal through today) = green + blue.
    if (meals.length) {
      const start = new Date(meals[0].timestamp); start.setHours(0, 0, 0, 0);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let dt = new Date(start); dt <= today; dt.setDate(dt.getDate() + 1)) {
        const k = dayKey(dt);
        if (!status[k]) status[k] = 'gb';
      }
    }
    return status;
  }
  function computeStreaks(days) {
    if (!days.size) return { current: 0, longest: 0 };
    const keys = Array.from(days).map(k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b);
    const DAY = 86400000;
    let longest = 1, run = 1;
    for (let i = 1; i < keys.length; i++) {
      if (Math.round((keys[i] - keys[i - 1]) / DAY) === 1) run++; else run = 1;
      if (run > longest) longest = run;
    }
    const n = new Date();
    const todayMid = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const set = new Set(keys);
    let current = 0;
    let cursor = set.has(todayMid) ? todayMid : (set.has(todayMid - DAY) ? todayMid - DAY : null);
    while (cursor != null && set.has(cursor)) { current++; cursor -= DAY; }
    return { current, longest };
  }

  function renderProgress() {
    const status = dayStatuses();
    const greenDays = new Set(Object.keys(status).filter(k => status[k] === 'gb'));
    const streaks = computeStreaks(greenDays);
    const gaps = mealsWithGaps().map(m => m.gapMs).filter(g => g != null);
    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const longestFast = gaps.length ? Math.max(...gaps) : 0;
    $('#stat-grid').innerHTML =
      statCard(streaks.current, 'fast streak') +
      statCard(streaks.longest, 'longest streak') +
      statCard(gaps.length ? fmtElapsed(avg) : '—', 'avg fast', true) +
      statCard(gaps.length ? fmtElapsed(longestFast) : '—', 'longest fast', true);

    if (!calMonth) { const n = new Date(); calMonth = { y: n.getFullYear(), m: n.getMonth() }; }
    renderCalendar(status);
  }
  function statCard(num, lab, raw) {
    return '<div class="stat-card"><div class="stat-num"' + (raw ? ' style="font-size:1.3rem"' : '') + '>' + num + '</div><div class="stat-lab">' + lab + '</div></div>';
  }
  function renderCalendar(status) {
    const { y, m } = calMonth;
    $('#cal-month-label').textContent = new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const todayK = dayKey(new Date());
    const dow = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => '<div class="cal-dow">' + d + '</div>').join('');
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="cal-day blank"></div>';
    for (let d = 1; d <= total; d++) {
      const k = y + '-' + (m + 1) + '-' + d;
      let cls = 'cal-day';
      if (status[k]) cls += ' ' + status[k];
      if (k === todayK) cls += ' today';
      cells += '<div class="' + cls + '">' + d + '</div>';
    }
    $('#calendar').innerHTML = dow + cells;
  }

  // ---------- SETTINGS ----------
  function renderSettings() { syncUnitToggles(); }

  function syncUnitToggles() {
    $$('[data-toggle^="unit-"]').forEach(group => {
      group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.unit === settings.displayUnit));
    });
    $$('[data-toggle="theme"] button').forEach(b => b.classList.toggle('active', b.dataset.themeOpt === settings.theme));
  }

  // ---------- Modal ----------
  let modalCtx = null;
  function showModal() { $('#modal').classList.remove('hidden'); }
  function hideModal() { $('#modal').classList.add('hidden'); modalCtx = null; }
  function sugarRowHtml() {
    return '<div class="modal-body-row"><label>This meal had</label>' +
      '<div class="sugar-pick" id="modal-sugar-pick">' +
      '<label class="chk"><input type="checkbox" id="modal-sugar" /> Sugar</label>' +
      '<label class="chk"><input type="checkbox" id="modal-nosugar" /> No sugar</label>' +
      '</div></div>';
  }

  function openMealEdit(id) {
    const meal = meals.find(x => x.id === id);
    if (!meal) return;
    modalCtx = { type: 'meal', id };
    $('#modal-delete').classList.remove('hidden');
    $('#modal-title').textContent = 'Edit meal';
    $('#modal-body').innerHTML =
      '<div class="modal-body-row"><label>Date &amp; time eaten</label>' +
      '<input type="datetime-local" id="modal-dt" value="' + toLocalInput(new Date(meal.timestamp)) + '"></div>' +
      sugarRowHtml();
    const sEl = $('#modal-sugar'), nEl = $('#modal-nosugar');
    wireSugarPair(sEl, nEl);
    setSugarPair(sEl, nEl, meal.sugar === false ? false : (meal.sugar === true ? true : null));
    showModal();
  }
  function openWeightEdit(id) {
    const w = weights.find(x => x.id === id);
    if (!w) return;
    modalCtx = { type: 'weight', id };
    $('#modal-delete').classList.remove('hidden');
    $('#modal-title').textContent = 'Edit weigh-in';
    $('#modal-body').innerHTML =
      '<div class="modal-body-row"><label>Date &amp; time</label>' +
      '<input type="datetime-local" id="modal-dt" value="' + toLocalInput(new Date(w.timestamp)) + '"></div>' +
      '<div class="modal-body-row"><label>Weight (' + settings.displayUnit + ')</label>' +
      '<input type="number" inputmode="decimal" step="0.1" id="modal-weight" value="' + fmtWeight(w.weightKg) + '"></div>';
    showModal();
  }
  function openAddMeal() {
    modalCtx = { type: 'meal-new' };
    $('#modal-delete').classList.add('hidden');
    $('#modal-title').textContent = 'Add a past meal';
    $('#modal-body').innerHTML =
      '<div class="modal-body-row"><label>Date &amp; time eaten</label>' +
      '<input type="datetime-local" id="modal-dt" value="' + toLocalInput(new Date()) + '"></div>' +
      sugarRowHtml();
    wireSugarPair($('#modal-sugar'), $('#modal-nosugar'));
    showModal();
  }
  function openAddWeight() {
    modalCtx = { type: 'weight-new' };
    $('#modal-delete').classList.add('hidden');
    $('#modal-title').textContent = 'Add a past weigh-in';
    $('#modal-body').innerHTML =
      '<div class="modal-body-row"><label>Date &amp; time</label>' +
      '<input type="datetime-local" id="modal-dt" value="' + toLocalInput(new Date()) + '"></div>' +
      '<div class="modal-body-row"><label>Weight (' + settings.displayUnit + ')</label>' +
      '<input type="number" inputmode="decimal" step="0.1" id="modal-weight" placeholder="0.0"></div>';
    showModal();
  }

  async function modalSave() {
    if (!modalCtx) return;
    const dtVal = $('#modal-dt').value;
    if (!dtVal) return;
    const date = new Date(dtVal);
    if (modalCtx.type === 'meal') {
      const sugar = readSugarPair($('#modal-sugar'), $('#modal-nosugar'));
      if (sugar === null) { $('#modal-sugar-pick').classList.add('needs'); return; }
      const meal = meals.find(x => x.id === modalCtx.id);
      meal.timestamp = date.toISOString();
      meal.sugar = sugar;
      await DB.put('meals', meal);
      meals = sortByTime(await DB.getAll('meals'));
    } else {
      const w = weights.find(x => x.id === modalCtx.id);
      const val = parseFloat($('#modal-weight').value);
      if (!isNaN(val)) w.weightKg = displayToKg(val);
      w.timestamp = date.toISOString();
      await DB.put('weights', w);
      weights = sortByTime(await DB.getAll('weights'));
    }
    hideModal();
    renderView(currentView);
  }
  async function modalSaveNew() {
    const dtVal = $('#modal-dt').value;
    if (!dtVal) return;
    const date = new Date(dtVal);
    if (modalCtx.type === 'meal-new') {
      const sugar = readSugarPair($('#modal-sugar'), $('#modal-nosugar'));
      if (sugar === null) { $('#modal-sugar-pick').classList.add('needs'); return; }
      await logMeal(date, sugar);
    } else {
      const val = parseFloat($('#modal-weight').value);
      if (isNaN(val)) { hideModal(); return; }
      await addWeight(date, displayToKg(val));
    }
    hideModal();
    renderView(currentView);
  }
  async function modalDelete() {
    if (!modalCtx) return;
    if (modalCtx.type === 'meal') {
      await DB.remove('meals', modalCtx.id);
      meals = sortByTime(await DB.getAll('meals'));
    } else {
      await DB.remove('weights', modalCtx.id);
      weights = sortByTime(await DB.getAll('weights'));
    }
    hideModal();
    renderView(currentView);
  }

  // ---------- Events ----------
  function bindEvents() {
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

    wireSugarPair($('#chk-sugar'), $('#chk-nosugar'));

    $('#btn-log-now').addEventListener('click', async () => {
      const sugar = readSugarPair($('#chk-sugar'), $('#chk-nosugar'));
      if (sugar === null) { $('#sugar-pick').classList.add('needs'); return; }
      await logMeal(new Date(), sugar);
      resetTodaySugar();
    });
    $('#btn-log-toggle').addEventListener('click', () => {
      const p = $('#time-picker');
      p.classList.toggle('hidden');
      if (!p.classList.contains('hidden')) $('#custom-meal-time').value = toLocalInput(new Date());
    });
    $('#btn-log-custom').addEventListener('click', async () => {
      const v = $('#custom-meal-time').value;
      if (!v) return;
      const sugar = readSugarPair($('#chk-sugar'), $('#chk-nosugar'));
      if (sugar === null) { $('#sugar-pick').classList.add('needs'); return; }
      await logMeal(new Date(v), sugar);
      resetTodaySugar();
      $('#time-picker').classList.add('hidden');
    });
    $('#edit-last-meal').addEventListener('click', () => {
      const last = meals[meals.length - 1];
      if (last) openMealEdit(last.id);
    });

    $('#cd-start').addEventListener('click', startCountdown);
    $('#cd-cancel').addEventListener('click', cancelCountdown);

    $('#chk-vitamins').addEventListener('change', (e) => setVitamins(e.target.checked));
    $('#btn-reset').addEventListener('click', resetAllData);

    $('#btn-add-weight').addEventListener('click', async () => {
      const val = parseFloat($('#quick-weight-input').value);
      if (isNaN(val)) return;
      await addWeight(new Date(), displayToKg(val));
      $('#quick-weight-input').value = '';
      renderToday();
    });

    $('#fab-add-meal').addEventListener('click', openAddMeal);
    $('#fab-add-weight').addEventListener('click', openAddWeight);

    document.addEventListener('click', async (e) => {
      const unitBtn = e.target.closest('[data-toggle^="unit-"] button');
      if (unitBtn) {
        settings.displayUnit = unitBtn.dataset.unit;
        await saveSettings();
        syncUnitToggles();
        $('#quick-weight-unit').textContent = settings.displayUnit;
        renderView(currentView);
        return;
      }
      const themeBtn = e.target.closest('[data-toggle="theme"] button');
      if (themeBtn) {
        settings.theme = themeBtn.dataset.themeOpt;
        await saveSettings();
        applyTheme();
        syncUnitToggles();
      }
    });

    $('#meal-list').addEventListener('click', (e) => {
      const li = e.target.closest('.entry-item'); if (li) openMealEdit(li.dataset.id);
    });
    $('#weight-list').addEventListener('click', (e) => {
      const li = e.target.closest('.entry-item'); if (li) openWeightEdit(li.dataset.id);
    });

    $('#cal-prev').addEventListener('click', () => { calMonth.m--; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } renderProgress(); });
    $('#cal-next').addEventListener('click', () => { calMonth.m++; if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } renderProgress(); });

    $('#modal-cancel').addEventListener('click', hideModal);
    $('#modal-delete').addEventListener('click', modalDelete);
    $('#modal-save').addEventListener('click', () => {
      if (modalCtx && modalCtx.type && modalCtx.type.endsWith('-new')) modalSaveNew(); else modalSave();
    });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') hideModal(); });
  }

  // ---------- Init ----------
  async function init() {
    await loadAll();
    applyTheme();
    $('#header-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    bindEvents();
    switchView('today');
    let secs = 0;
    tickTimer = setInterval(() => {
      secs++;
      if (currentView === 'today') tick();
      else if (currentView === 'progress' && secs % 30 === 0) renderProgress(); // flip days green as 24h passes
    }, 1000);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

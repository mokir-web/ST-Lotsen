// ── Startsidan "Idag" (#/) ───────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), todayStockholm(), mondayOfISO(), addDaysISO(),
// isoWeek(), fmtDM(), fmtDateLong(), js/oversikt.js (OV_LABEL) och js/dopsapp.js (dopsWho). Global entry: renderToday(root).
//
// Det viktigaste ur alla moduler på ett ställe (ui_forslag.md §1, S2): att göra (studierektor, handledare, global admin),
// dagens opjour och mina pass, min vecka, veckoschemat och mina aktiviteter, bemanningen i ST-gruppen, mitt förlopp, DOPS och
// nytt i utbildningsmaterialet. Varje kort hämtar sin egen data; går en hämtning fel visas bara det kortet som tomt.
// Korten ligger i ett rutnät som var och en lägger och ställer in själv (se TODAY_WIDGETS).

async function renderToday(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    const mods = me.modules || ['opjour'], today = todayStockholm(), monday = mondayOfISO(today);
    const soft = p => p ? p.catch(() => null) : Promise.resolve(null);
    const dopsOn = mods.includes('dops') && me.dopsUser;
    const layout = twLayout(me.todayLayout), on = id => layout.find(c => c.id === id)?.on;
    // Veckoschemat hämtas så långt fram som korten behöver (minst 12 veckor, högst 104).
    const act = layout.find(c => c.id === 'aktiviteter'), ao = twOpts(twDef('aktiviteter'), act);
    const weeks = Math.min(104, Math.max(12, on('aktiviteter') ? (ao.period === 'year' ? 53 : Math.ceil(ao.months * 4.35) + 1) : 0));
    const [cal, sch, plan, todo, dops, dopsRec, dopsSent, edu] = await Promise.all([
      soft(mods.includes('opjour') ? api(`/calendar?start=${monday}&weeks=1`) : null),
      soft(mods.includes('schema') && (me.isSt || me.isDirector || me.isAdmin) ? api(`/schema?from=${monday}&weeks=${weeks}`) : null),
      soft(mods.includes('mal') && me.isSt ? api('/plan/me') : null),
      soft(api('/today/todo')),
      soft(dopsOn ? api('/dops/app/overview') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=received') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=sent') : null),
      soft(mods.includes('utbildning') && on('utbildning') ? api('/edu') : null)
    ]);
    drawToday(root, { me, mods, today, cal, sch, plan, todo, dops, dopsRec, dopsSent, edu: edu ? { ...edu, loaded: true } : mods.includes('utbildning') ? { sections: [], loaded: false } : null });
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: 'numeric' }).format(new Date()));
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
}

// ── Rutnät med kort (widgets) ──────────────────────────────────────────
// Rutnätet har tre kolumner och rader på 215 px. Varje kort har en storlek (liten 1×1, bred 2×1, hög 1×2, stor 2×2) och en
// plats (x, y). "Anpassa" slår på redigeringsläget: dra i ⠿ och släpp kortet på valfri ruta, även en tom. Övriga kort ligger
// kvar; får kortet inte plats i sin storlek fälls det ihop (stor → bred → hög → liten) tills det får plats, och går inte ens
// det ligger det kvar. ⚙ ställer in innehållet, ✕ döljer. Dolda kort ligger under rutnätet och läggs tillbaka med +.
// På smal skärm (under 720 px) visas korten i läsordning (rad för rad) i en eller två kolumner; där flyttas de i ordning och
// rutnätet packas om. Layouten sparas på kontot (PUT /profile/today-layout) och följer med mellan enheter; null = standard.
// Kort som inte gäller personen (t.ex. DOPS utan kopplat konto) syns varken i rutnätet eller bland de dolda.
const TW_SIZES = [['s', 'Liten'], ['w', 'Bred'], ['t', 'Hög'], ['l', 'Stor']];
const TW_DIM = { s: [1, 1], w: [2, 1], t: [1, 2], l: [2, 2] };
const TW_SHRINK = { l: ['l', 'w', 't', 's'], w: ['w', 's'], t: ['t', 's'], s: ['s'] };
const TW_COLS = 3, TW_ROW = 215, TW_GAP = 16, TW_PLACED_MIN = 720;
const TODAY_WIDGETS = [
  { id: 'todo', title: 'Att göra', size: 't', fn: todoCard, opts: [{ k: 'names', label: 'Visa namn under varje punkt', def: true }] },
  { id: 'opjour', title: 'Opjour', size: 's', fn: opjourCard, opts: [
    { k: 'tomorrow', label: 'Visa vem som har i morgon', def: true }, { k: 'mine', label: 'Visa mina kommande pass', def: true },
    { k: 'mineCount', label: 'Antal pass', def: 4, min: 1, max: 20 }] },
  { id: 'vecka', title: 'Min vecka', size: 't', fn: myWeekCard, opts: [
    { k: 'later', label: 'Visa kommande', def: true }, { k: 'count', label: 'Antal kommande', def: 5, min: 1, max: 30 }] },
  { id: 'bemanning', title: 'I tjänst', size: 's', fn: staffingCard, opts: [
    { k: 'weeks', label: 'Antal veckor', def: 6, min: 1, max: 12 }, { k: 'hint', label: 'Visa förklaring', def: true }] },
  { id: 'forlopp', title: 'Mitt förlopp', size: 's', fn: progressCard, opts: [
    { k: 'goals', label: 'Visa delmål', def: true }, { k: 'year', label: 'Visa ST-år och beräknat slut', def: true }] },
  { id: 'styear', title: 'Kvar under ST-året', size: 't', fn: stYearCard, opts: [
    { k: 'late', label: 'Visa ej klara krav från tidigare år', def: true }, { k: 'optional', label: 'Ta med valfria krav', def: true }] },
  { id: 'dops', title: 'DOPS', size: 't', fn: todayDopsCard, opts: [
    { k: 'bar', label: 'Visa måluppfyllelse', def: true }, { k: 'list', label: 'Visa senaste bedömningar', def: true },
    { k: 'count', label: 'Antal bedömningar', def: 5, min: 1, max: 30 },
    { k: 'dir', label: 'Bedömningar', def: 'alla', choices: [['alla', 'Mottagna och registrerade'], ['in', 'Bara mottagna'], ['ut', 'Bara registrerade']] }] },
  { id: 'schema', title: 'Veckoschemat', size: 'l', on: false, fn: schemaCard, opts: [
    { k: 'weeks', label: 'Antal veckor', def: 4, min: 1, max: 12 }, { k: 'service', label: 'Visa raden I tjänst', def: true }] },
  { id: 'aktiviteter', title: 'Mina aktiviteter', size: 't', on: false, fn: myActsCard, opts: [
    { k: 'period', label: 'Visa', def: 'months', choices: [['months', 'Ett antal månader framåt'], ['year', 'Resten av innevarande ST-år']] },
    { k: 'months', label: 'Antal månader', def: 6, min: 1, max: 24 }] },
  { id: 'utbildning', title: 'Utbildningsmaterial', size: 's', on: false, fn: eduCard, opts: [
    { k: 'count', label: 'Antal nya poster', def: 5, min: 1, max: 20 }] }
];
const twDef = id => TODAY_WIDGETS.find(w => w.id === id);
const twOpts = (w, c) => Object.fromEntries(w.opts.map(o => [o.k, c?.opts && o.k in c.opts ? c.opts[o.k] : o.def]));

let _today = null;

// Sparad layout + kort som tillkommit sedan den sparades (sist; nya korttyper kan vara dolda från början). Okända id:n hoppas över.
function twLayout(saved) {
  const out = (saved || []).filter(c => twDef(c.id)).map(c => ({ id: c.id, on: c.on !== false, size: TW_DIM[c.size] ? c.size : twDef(c.id).size,
    ...(Number.isInteger(c.x) && Number.isInteger(c.y) ? { x: c.x, y: c.y } : {}), opts: { ...(c.opts || {}) } }));
  for (const w of TODAY_WIDGETS) if (!out.some(c => c.id === w.id)) out.push({ id: w.id, on: w.on !== false, size: w.size, opts: {} });
  return out;
}

// Upptagna rutor (utom kortet skip) och om ett kort i storleken size får plats på (x, y).
function twOccupied(cards, skip) {
  const occ = new Set();
  for (const c of cards) {
    if (c === skip || c.x == null) continue;
    const [w, h] = TW_DIM[c.size];
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) occ.add((c.x + i) + ',' + (c.y + j));
  }
  return occ;
}
function twFits(occ, x, y, size) {
  const [w, h] = TW_DIM[size];
  if (x < 0 || y < 0 || x + w > TW_COLS) return false;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (occ.has((x + i) + ',' + (y + j))) return false;
  return true;
}
function twFirstFree(occ, size) {
  for (let y = 0; ; y++) for (let x = 0; x < TW_COLS; x++) if (twFits(occ, x, y, size)) return { x, y };
}

// Ger alla synliga kort en plats: först de som har en giltig plats (i layoutens ordning), sedan övriga där de först får plats.
function twPlace(shown) {
  const placed = [], rest = [];
  for (const c of shown) {
    if (c.x != null && twFits(twOccupied(placed), c.x, c.y, c.size)) placed.push(c);
    else { delete c.x; delete c.y; rest.push(c); }
  }
  for (const c of rest) { Object.assign(c, twFirstFree(twOccupied(placed), c.size)); placed.push(c); }
}
// Packar om i given ordning (smal skärm efter flytt, och standardlayouten).
function twRepack(order) {
  for (const c of order) { delete c.x; delete c.y; }
  twPlace(order);
}
const twReading = cards => [...cards].sort((a, b) => a.y - b.y || a.x - b.x);

function drawToday(root, d) {
  _today = { d, layout: twLayout(d.me.todayLayout), edit: false, open: null };
  const first = (d.me.displayName || '').split(' ')[0];
  root.innerHTML = `
    <div class="tw-head">
      <div><h1 class="page" style="margin-bottom:2px">${greeting()}${first ? ', ' + esc(first) : ''}</h1>
        <p class="muted" style="margin:0">${esc(fmtDateLong(d.today))} · vecka ${isoWeek(d.today)}</p></div>
      <div class="tw-actions" id="tw-actions"></div>
    </div>
    <p class="hint hidden" id="tw-hint" style="margin:-6px 0 12px"></p>
    <div class="today-grid" id="tw-grid"></div>
    <div id="tw-hidden"></div>`;
  el('tw-actions').addEventListener('click', onTwAction);
  el('tw-grid').addEventListener('click', onTwGrid);
  el('tw-grid').addEventListener('change', onTwOpt);
  el('tw-grid').addEventListener('pointerdown', onTwDragStart);
  el('tw-grid').addEventListener('keydown', onTwKey);
  el('tw-hidden').addEventListener('click', onTwGrid);
  drawTw();
}

// Byter rutnätet mellan fri placering och läsordning när fönstret ändrar bredd.
let _twResize = 0;
addEventListener('resize', () => {
  clearTimeout(_twResize);
  _twResize = setTimeout(() => { if (_today && el('tw-grid') && twPlacedMode() !== _today.placed) drawTw(); }, 150);
});
const twPlacedMode = () => (el('tw-grid')?.parentElement?.clientWidth || 0) >= TW_PLACED_MIN;

// Kortets innehåll med inställningarna, eller null när kortet inte gäller personen.
function twRender(c) {
  const w = twDef(c.id);
  return w.fn(_today.d, twOpts(w, c)) || null;
}

function drawTw() {
  const { layout, edit, open } = _today;
  const placed = _today.placed = twPlacedMode();
  el('tw-actions').innerHTML = edit
    ? '<button type="button" class="btn-ghost" data-act="reset">Återställ</button><button type="button" class="btn-ghost" data-act="cancel">Avbryt</button><button type="button" class="btn" data-act="save">Klar</button>'
    : '<button type="button" class="btn-ghost tw-edit" data-act="edit" title="Flytta, dölj och ställ in korten">✎ Anpassa</button>';
  const hint = el('tw-hint');
  hint.classList.toggle('hidden', !edit);
  hint.textContent = placed ? 'Dra i ⠿ och släpp kortet på valfri ruta. Får det inte plats fälls det ihop. Välj storlek, ⚙ för innehåll och ✕ för att dölja. Tryck Klar för att spara.'
    : 'Dra i ⠿ för att flytta kortet i ordningen. På en större skärm kan du lägga korten fritt i rutnätet. Tryck Klar för att spara.';
  const shown = [], hidden = [];
  for (const c of layout) { const r = twRender(c); if (r) (c.on ? shown : hidden).push([c, r]); }
  twPlace(shown.map(([c]) => c));
  const order = placed ? shown : twReading(shown.map(([c]) => c)).map(c => shown.find(s => s[0] === c));
  const grid = el('tw-grid');
  grid.classList.toggle('editing', edit);
  grid.classList.toggle('placed', placed);
  const occ = twOccupied(shown.map(([c]) => c));
  const bottom = Math.max(0, ...shown.map(([c]) => c.y + TW_DIM[c.size][1]));
  const rows = edit ? bottom + 2 : bottom;
  const cells = placed && edit ? Array.from({ length: rows * TW_COLS }, (_, i) => { const x = i % TW_COLS, y = Math.floor(i / TW_COLS);
    return occ.has(x + ',' + y) ? '' : `<div class="tw-cell" style="grid-column:${x + 1};grid-row:${y + 1}"></div>`; }).join('') : '';
  grid.innerHTML = cells + order.map(([c, r]) => {
    const w = twDef(c.id), [cw, ch] = TW_DIM[c.size];
    const fitsAt = k => !placed || twFits(twOccupied(shown.map(([x]) => x), c), c.x, c.y, k);
    const bar = edit ? `<div class="tw-bar">
        <button type="button" class="tw-handle" data-drag="${c.id}" aria-label="Flytta ${esc(r.title)} (piltangenter)" title="Dra för att flytta">⠿</button>
        <span class="tw-sizes" role="group" aria-label="Storlek">${TW_SIZES.map(([k, l]) => { const ok = fitsAt(k);
          return `<button type="button" data-size="${k}" data-id="${c.id}" class="${c.size === k ? 'on' : ''}" title="${ok ? l : l + ' – får inte plats här'}" aria-label="${l}" aria-pressed="${c.size === k}"${ok ? '' : ' disabled'}><i class="tw-sz tw-sz-${k}"></i></button>`; }).join('')}</span>
        ${w.opts.length ? `<button type="button" class="tw-ico${open === c.id ? ' on' : ''}" data-opts="${c.id}" title="Innehåll" aria-expanded="${open === c.id}">⚙</button>` : ''}
        <button type="button" class="tw-ico" data-hide="${c.id}" title="Dölj kortet">✕</button>
      </div>` : '';
    const body = edit && open === c.id ? twOptsForm(w, c) : `<div class="tw-body"><h2>${esc(r.title)}</h2>${r.body}${r.link ? `<p class="tw-link"><a href="${r.link[0]}">${r.link[1]} →</a></p>` : ''}</div>`;
    const pos = placed ? ` style="grid-column:${c.x + 1} / span ${cw};grid-row:${c.y + 1} / span ${ch}"` : '';
    return `<section class="card today-card tw tw-${c.size}" data-id="${c.id}"${pos}>${bar}${body}</section>`;
  }).join('') + (shown.length ? '' : `<div class="card tw-empty"><p class="muted" style="margin:0">${edit ? 'Alla kort är dolda. Lägg tillbaka dem nedan.' : 'Inget att visa här än.'}</p></div>`);
  el('tw-hidden').innerHTML = edit && hidden.length ? `<div class="tw-tray"><h3 class="today-sub" style="margin-top:0">Dolda kort</h3>
      ${hidden.map(([c, r]) => `<button type="button" class="btn-ghost" data-show="${c.id}">+ ${esc(r.title)}</button>`).join(' ')}</div>` : '';
}

function twOptsForm(w, c) {
  const o = twOpts(w, c);
  return `<div class="tw-body tw-form"><h2>${esc(w.title)} – innehåll</h2>
    ${w.opts.map(d => d.choices
      ? `<label class="tw-opt">${esc(d.label)}<select data-opt="${d.k}" data-id="${c.id}">${d.choices.map(([v, l]) => `<option value="${esc(v)}"${String(o[d.k]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
      : d.min != null
      ? `<label class="tw-opt">${esc(d.label)} <span class="muted">(${d.min}–${d.max})</span><input type="number" inputmode="numeric" min="${d.min}" max="${d.max}" step="1" value="${esc(o[d.k])}" data-opt="${d.k}" data-id="${c.id}"></label>`
      : `<label class="tw-opt tw-check"><input type="checkbox" data-opt="${d.k}" data-id="${c.id}"${o[d.k] ? ' checked' : ''}> ${esc(d.label)}</label>`).join('')}
    <p style="margin:10px 0 0"><button type="button" class="btn-ghost" data-opts="${c.id}">Visa kortet</button></p></div>`;
}

const twFind = id => _today.layout.find(c => c.id === id);

async function onTwAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit') { _today.before = JSON.stringify(_today.layout); _today.edit = true; }
  else if (act === 'cancel') { _today.layout = JSON.parse(_today.before); _today.edit = false; _today.open = null; }
  else if (act === 'reset') { if (!confirm('Återställa startsidan till standardlayouten? Placering, storlekar och inställningar för korten försvinner.')) return; _today.layout = twLayout(null); _today.reset = true; _today.open = null; }
  else if (act === 'save') {
    b.disabled = true;
    try {
      const plain = JSON.stringify(_today.layout.map(({ x, y, ...c }) => c)) === JSON.stringify(twLayout(null).map(({ x, y, ...c }) => c));
      const r = await api('/profile/today-layout', { method: 'PUT', body: { layout: _today.reset && plain ? null : _today.layout } });
      _today.d.me.todayLayout = r.layout;
      _today.edit = false; _today.open = null; _today.reset = false;
      // Ett kort som behöver mer data (fler veckor i schemat, utbildningsmaterialet) hämtar den vid nästa laddning.
      if (twNeedsReload()) { renderToday(el('view')); return; }
    } catch (err) { b.disabled = false; alert(err.message); return; }
  }
  drawTw();
}
function twNeedsReload() {
  const d = _today.d, on = id => twFind(id)?.on;
  if (on('utbildning') && d.edu && !d.edu.loaded && d.mods.includes('utbildning')) return true;
  const ao = twOpts(twDef('aktiviteter'), twFind('aktiviteter'));
  const need = on('aktiviteter') ? (ao.period === 'year' ? 53 : Math.ceil(ao.months * 4.35) + 1) : 0;
  return !!d.sch && need > d.sch.window.weeks.length;
}

function onTwGrid(e) {
  const dopsBtn = !_today.edit && e.target.closest('[data-dops]');
  if (dopsBtn) { openTodayDops(Number(dopsBtn.dataset.dops)); return; }
  const t = e.target.closest('button'); if (!t || !_today.edit) return;
  if (t.dataset.size) { twFind(t.dataset.id).size = t.dataset.size; }
  else if (t.dataset.opts) { _today.open = _today.open === t.dataset.opts ? null : t.dataset.opts; }
  else if (t.dataset.hide) { twFind(t.dataset.hide).on = false; if (_today.open === t.dataset.hide) _today.open = null; }
  else if (t.dataset.show) { const c = twFind(t.dataset.show); c.on = true; delete c.x; delete c.y; _today.layout = [..._today.layout.filter(x => x !== c), c]; }
  else return;
  drawTw();
}

function onTwOpt(e) {
  const i = e.target.closest('[data-opt]'); if (!i) return;
  const c = twFind(i.dataset.id), d = twDef(c.id).opts.find(o => o.k === i.dataset.opt);
  if (i.type === 'checkbox') c.opts[d.k] = i.checked;
  else if (d.min != null) { const n = Math.round(Number(i.value)); c.opts[d.k] = Number.isFinite(n) ? Math.min(d.max, Math.max(d.min, n)) : d.def; i.value = c.opts[d.k]; }
  else c.opts[d.k] = i.value;
}

const twShownCards = () => [...el('tw-grid').querySelectorAll('.tw')].map(n => twFind(n.dataset.id));

// Piltangenter på handtaget: fri placering flyttar en ruta åt hållet (om kortet får plats där); läsordning byter plats med grannen.
function onTwKey(e) {
  const h = e.target.closest('[data-drag]'); if (!h) return;
  const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
  if (!dx && !dy) return;
  e.preventDefault();
  const c = twFind(h.dataset.drag), cards = twShownCards();
  if (_today.placed) {
    if (!twFits(twOccupied(cards, c), c.x + dx, c.y + dy, c.size)) return;
    c.x += dx; c.y += dy;
  } else {
    const order = twReading(cards), i = order.indexOf(c), j = i + (dx || dy);
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    twRepack(order);
  }
  drawTw();
  el('tw-grid').querySelector(`[data-drag="${c.id}"]`)?.focus();
}

// Dra med pekare (mus, finger, penna). Fri placering: en markering visar var kortet hamnar och i vilken storlek (röd = får inte
// plats); kortet flyttas när det släpps. Läsordning: kortet flyttas i listan medan man drar. Nära skärmkanten rullar sidan.
function onTwDragStart(e) {
  const h = e.target.closest('[data-drag]'); if (!h || e.button > 0) return;
  e.preventDefault();
  const grid = el('tw-grid'), c = twFind(h.dataset.drag), node = grid.querySelector(`.tw[data-id="${c.id}"]`);
  const cards = twShownCards(), occ = twOccupied(cards, c);
  node.classList.add('dragging');
  let lastY = e.clientY, raf = 0, target = null, ghost = null;
  if (_today.placed) { ghost = document.createElement('div'); ghost.className = 'tw-ghost'; grid.appendChild(ghost); }
  const scroll = () => {
    const edge = 70, v = lastY < edge ? -12 : lastY > innerHeight - edge ? 12 : 0;
    if (v) { scrollBy(0, v); raf = requestAnimationFrame(scroll); } else raf = 0;
  };
  const cellAt = (px, py) => {
    const r = grid.getBoundingClientRect(), colW = (r.width - TW_GAP * (TW_COLS - 1)) / TW_COLS;
    return { x: Math.min(TW_COLS - 1, Math.max(0, Math.floor((px - r.left) / (colW + TW_GAP)))), y: Math.max(0, Math.floor((py - r.top) / (TW_ROW + TW_GAP))) };
  };
  const move = ev => {
    lastY = ev.clientY;
    if (!raf) raf = requestAnimationFrame(scroll);
    if (_today.placed) {
      const at = cellAt(ev.clientX, ev.clientY), size = TW_SHRINK[c.size].find(k => twFits(occ, at.x, at.y, k));
      target = size ? { ...at, size } : null;
      const [w, hh] = TW_DIM[size || 's'];
      ghost.style.gridColumn = `${at.x + 1} / span ${w}`; ghost.style.gridRow = `${at.y + 1} / span ${hh}`;
      ghost.classList.toggle('bad', !size);
      ghost.textContent = !size ? 'Får inte plats' : size !== c.size ? `Fälls ihop till ${TW_SIZES.find(s => s[0] === size)[1].toLowerCase()}` : '';
      return;
    }
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tw');
    if (!over || over === node || !grid.contains(over)) return;
    const r = over.getBoundingClientRect();
    const after = r.width > r.height * 1.4 ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
    over[after ? 'after' : 'before'](node);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (raf) cancelAnimationFrame(raf);
    if (_today.placed) { if (target) Object.assign(c, target); }
    else twRepack([...grid.querySelectorAll('.tw')].map(n => twFind(n.dataset.id)));
    drawTw();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

const todayCard = (title, body, link) => ({ title, body, link });

// Att göra: bara för den som har något att ta hand om (studierektor/admin, handledare, global admin).
function todoCard({ me, todo }, o = {}) {
  const items = todo?.items || [];
  if (!items.length && !(me.isDirector || me.isAdmin || me.isSupervisor)) return '';
  return todayCard('Att göra', items.length
    ? `<ul class="todo">${items.map(i => `<li>${i.href ? `<a href="${esc(i.href)}">${esc(i.text)}</a>` : `<strong>${esc(i.text)}</strong>`}${i.names && o.names !== false ? `<br><span class="muted" style="font-size:13px">${esc(i.names.join(', '))}</span>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Inget att göra just nu.</p>');
}

function opjourCard({ me, cal }, o = {}) {
  if (!cal) return '';
  const t = cal.opjourToday, mine = t && t.userId === me.userId;
  const who = t ? `<div class="big-name">${esc(t.displayName)}${mine ? ' <span class="tagchip admin">Du</span>' : ''}</div>`
    : cal.reservesToday?.length ? `<div class="big-name muted">Ingen bokad</div><p class="hint" style="margin:2px 0 0">Reserver: ${cal.reservesToday.map(r => esc(r.displayName)).join(', ')}</p>`
    : '<div class="big-name muted">Ingen bokad</div>';
  const next = cal.nextShift && o.tomorrow !== false ? `<p style="margin:8px 0 0">I morgon: ${cal.nextShift.displayName ? `<strong>${esc(cal.nextShift.displayName)}</strong>` : '<span class="muted">ledigt</span>'}</p>` : '';
  const up = (me.upcoming || []).slice(0, o.mineCount || 4);
  const mineList = o.mine === false ? '' : `<p style="margin:8px 0 0">Dina pass: ${up.length ? up.map(u => esc(fmtDateLong(u.serviceDate))).join(', ') : '<span class="muted">inga bokade</span>'}</p>`;
  return todayCard(`Opjour ${cal.shiftISO && cal.shiftISO !== cal.todayISO ? '(pågående pass)' : 'idag'}`, who + next + mineList, ['#/kalender', 'Till kalendern']);
}

// Mina aktiviteter i veckoschemat: den här veckan och det som kommer (ST-läkare).
function myWeekCard({ me, sch }, o = {}) {
  if (!sch || !me.isSt) return '';
  const type = id => sch.types.find(t => t.id === id), req = id => sch.requirements.find(r => r.id === id);
  const label = a => { const t = type(a.typeId), r = a.requirementId ? req(a.requirementId) : null;
    return (r ? `${t ? t.code + ': ' : ''}${r.name}` : (t ? t.code : '?')) + (a.detail ? ` · ${a.detail}` : ''); };
  const chip = a => `<span class="sact${a.status === 'ev' ? ' ev' : ''}" style="--c:${esc(type(a.typeId)?.color || '#9aa5ad')}">${a.status === 'ev' ? 'Ev. ' : ''}${esc(label(a))}</span>`;
  const mine = sch.activities.filter(a => a.userId === me.userId).sort((a, b) => a.weekFrom.localeCompare(b.weekFrom));
  const now = mine.filter(a => a.weekFrom <= sch.thisMonday && a.weekTo >= sch.thisMonday);
  const later = mine.filter(a => a.weekFrom > sch.thisMonday).slice(0, o.count || 5);
  const wk = a => a.weekFrom === a.weekTo ? `v${isoWeek(a.weekFrom)}` : `v${isoWeek(a.weekFrom)}–${isoWeek(a.weekTo)}`;
  const inService = sch.inServiceByPerson?.[me.userId]?.[sch.thisMonday];
  return todayCard('Min vecka', `
    <p style="margin:0">${now.length ? now.map(a => chip(a) + (a.weekTo > sch.thisMonday ? ` <span class="muted" style="font-size:14px">t.o.m. v${isoWeek(a.weekTo)}</span>` : '')).join(' ') : '<span class="muted">Inget inlagt den här veckan</span>'}
      ${inService === false ? ' <span class="tagchip">ej i tjänst</span>' : ''}</p>
    ${o.later === false ? '' : `<h3 class="today-sub">Kommande</h3>
    ${later.length ? `<ul class="today-list">${later.map(a => `<li><span class="muted">${wk(a)}</span> ${chip(a)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Inget planerat de närmaste veckorna.</p>'}`}`,
    ['#/schema', 'Veckoschemat']);
}

// Bemanningen i ST-gruppen de närmaste veckorna (studierektor/admin).
function staffingCard({ me, sch }, o = {}) {
  if (!sch || !(me.isDirector || me.isAdmin)) return '';
  const weeks = sch.window.weeks.slice(0, o.weeks || 6);
  const low = w => sch.minInService != null && sch.inService[w] < sch.minInService;
  const lows = weeks.filter(low);
  return todayCard('I tjänst', `<div class="staff-row">${weeks.map(w => `<div class="${[w === sch.thisMonday ? 'cur' : '', low(w) ? 'low' : ''].join(' ')}"><span>v${isoWeek(w)}</span><strong>${sch.inService[w] ?? '–'}</strong></div>`).join('')}</div>
    <p class="hint" style="margin:6px 0 0">${lows.length ? `<strong style="color:var(--danger)">Under ${sch.minInService} i tjänst vecka ${lows.map(w => isoWeek(w)).join(', ')}.</strong> ` : ''}${o.hint === false ? '' : `Antal ST-läkare i tjänst per vecka enligt veckoschemat${sch.minInService != null ? ` (minst ${sch.minInService})` : ''}.`}</p>`, ['#/schema', 'Veckoschemat']);
}

// Mitt förlopp: obligatoriska krav klara och delmål vars kopplade krav är klara (ST-läkare).
function progressCard({ plan }, o = {}) {
  if (!plan) return '';
  const reqs = plan.requirements.filter(r => r.mandatory !== false);
  const st = r => plan.cells[r.id]?.status;
  const done = reqs.filter(r => ['klart', 'tidigare'].includes(st(r))).length, booked = reqs.filter(r => ['bokad', 'pagaende'].includes(st(r))).length;
  const goals = (plan.goals || []).filter(g => g.total), covered = goals.filter(g => g.done === g.total).length;
  const pct = reqs.length ? Math.round(100 * done / reqs.length) : 0;
  const p = plan.person;
  return todayCard('Mitt förlopp', `
    <div class="pbar"><span style="width:${pct}%"></span></div>
    <p style="margin:6px 0 0"><strong>${done} av ${reqs.length}</strong> obligatoriska krav klara${booked ? ` · ${booked} pågående/bokade` : ''}</p>
    ${goals.length && o.goals !== false ? `<p style="margin:4px 0 0">${covered} av ${goals.length} delmål med alla kopplade krav klara</p>` : ''}
    ${p.stMonths != null && o.year !== false ? `<p class="muted" style="margin:4px 0 0">ST-år ${Math.floor(p.stMonths / 12) + 1}, månad ${p.stMonths} av 60${p.expectedEnd ? ` · beräknat klar ${esc(fmtMonth(p.expectedEnd))}` : ''}</p>` : ''}`,
    ['#/plan', 'Min utbildningsplan']);
}

// Kvar under innevarande ST-år enligt den individuella utbildningsplanen (ST-läkare). Krav från tidigare ST-år som inte är klara
// visas först som försenade. Slutet på ST-året räknas bakåt från beräknat ST-slut (som tar hänsyn till förlängande ledighet).
function stYearCard({ plan }, o = {}) {
  if (!plan || plan.person.stMonths == null || plan.person.stEnd) return '';
  const p = plan.person, year = Math.floor(p.stMonths / 12) + 1;
  if (year > 5) return '';
  const st = r => plan.cells[r.id] || {};
  const open = r => !['klart', 'tidigare', 'ej'].includes(st(r).status);
  const now = plan.requirements.filter(r => r.stYear === year && open(r) && (o.optional !== false || r.mandatory !== false));
  const late = plan.requirements.filter(r => r.stYear && r.stYear < year && r.mandatory !== false && open(r));
  const all = plan.requirements.filter(r => r.stYear === year);
  const yearEnd = p.expectedEnd ? addMonthsISO(p.expectedEnd, -12 * (5 - year)) : null;
  const shown = r => st(r).status === 'saknas' ? 'ejgjort' : st(r).status;   // innevarande år: inte gjort än, inte försenat
  const row = r => `<li><span class="pchip st-${shown(r) || 'ejgjort'}">${esc(OV_LABEL[shown(r)] || 'Ej gjort')}</span> ${esc(r.name)}<span class="muted" style="font-size:13px">${r.mandatory === false ? ' · valfritt' : ''}${
    ['bokad', 'pagaende', 'forslag'].includes(st(r).status) ? ' · ' + esc(ovCellText(st(r))) : ''}</span></li>`;
  return todayCard(`Kvar under ST-år ${year}`, `
    <p class="muted" style="margin:0 0 6px">${all.length - now.length} av ${all.length} krav klara${yearEnd ? ` · ST-året slutar ca ${esc(fmtMonth(yearEnd))}` : ''}</p>
    ${late.length && o.late !== false ? `<p class="yr-late"><strong>${late.length} krav från tidigare ST-år är inte klara:</strong> ${esc(late.slice(0, 6).map(r => r.name).join(', '))}${late.length > 6 ? ` och ${late.length - 6} till` : ''}.</p>` : ''}
    ${now.length ? `<ul class="today-list yr-list">${now.map(row).join('')}</ul>` : `<p style="margin:0">${all.length ? '✓ Allt för ST-år ' + year + ' är klart.' : 'Inga krav inlagda för ST-år ' + year + '.'}</p>`}`,
    ['#/plan', 'Min utbildningsplan']);
}
const addMonthsISO = (iso, n) => { const [y, m] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 10); };

// DOPS: total måluppfyllelse som en stapel (mottagna och registrerade senaste 6 månaderna mot klinikens mål, som DOPS → Översikt)
// och de fem senaste bedömningarna (mottagna och registrerade). Bara när modulen DOPS är på och kontot är kopplat.
function todayDopsCard(d, o = {}) {
  const { dops, dopsRec, dopsSent } = d;
  if (!dops) return '';
  const hidRec = new Set(dops.hiddenFormTypes?.received || []), hidSent = new Set(dops.hiddenFormTypes?.sent || []);
  const short = ft => ft.replace(/^DOPS:?\s*/, '');
  const goals = [
    ...Object.entries(dops.received || {}).filter(([ft, v]) => v.goal && !hidRec.has(ft)).map(([ft, v]) => ({ ft, n: (dops.received_6m || {})[ft] || 0, g: v.goal })),
    ...Object.entries(dops.sent || {}).filter(([ft, v]) => v.sentGoal && !hidSent.has(ft)).map(([ft, v]) => ({ ft, n: (dops.sent_6m || {})[ft] || 0, g: v.sentGoal }))
  ];
  const sum = goals.reduce((s, x) => s + x.g, 0), got = goals.reduce((s, x) => s + Math.min(x.n, x.g), 0);
  const pct = sum ? Math.round(100 * got / sum) : 0, met = goals.filter(x => x.n >= x.g).length;
  const tone = pct >= 100 ? '#4a9e62' : pct >= 50 ? '#d9a441' : '#c0392b';
  const dir = o.dir || 'alla';
  const latest = [...(dir !== 'ut' ? dopsRec || [] : []).map(a => ({ ...a, dir: 'in' })), ...(dir !== 'in' ? dopsSent || [] : []).map(a => ({ ...a, dir: 'ut' }))]
    .filter(a => !a.isAiDemo).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, o.count || 5);
  d.dopsLatest = latest;
  const who = a => a.dir === 'in' ? 'från ' + a.registrar : 'till ' + a.recipient.replace(/ -- .*$/, '');
  const goalBar = goals.length ? `
    <div class="dg-head"><span>Måluppfyllelse senaste 6 mån</span><strong style="color:${tone}">${pct} %</strong></div>
    <div class="dg-track" role="img" aria-label="${pct} procent av målen"><i style="width:${Math.min(100, pct)}%;background:${tone}"></i></div>
    <p class="muted" style="margin:4px 0 0;font-size:13px">${met} av ${goals.length} mål uppnådda · ${got} av ${sum} bedömningar</p>`
    : '<p class="muted" style="margin:0">Kliniken har inga mål för dina formulär.</p>';
  const list = latest.length ? `<ul class="today-list dg-list">${latest.map((a, i) => `<li><button type="button" class="dg-open" data-dops="${i}" title="Visa bedömningen">
      <span class="dg-dir ${a.dir}" title="${a.dir === 'in' ? 'Mottagen' : 'Registrerad av dig'}">${a.dir === 'in' ? '↓' : '↑'}</span>
      <span><strong>${esc(short(a.formType))}</strong><br><span class="muted" style="font-size:13px">${esc(who(a))} · ${esc(fmtDM(a.timestamp.slice(0, 10)))}</span></span></button></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Inga bedömningar än.</p>';
  const parts = [o.bar !== false ? goalBar : '', o.list !== false ? (o.bar !== false ? '<h3 class="today-sub">Senaste bedömningar</h3>' : '') + list : ''];
  return todayCard('DOPS', parts.join('') || '<p class="muted" style="margin:0">Allt innehåll är avstängt i kortets inställningar.</p>', ['#/dops', 'Till DOPS']);
}

// En bedömning ur DOPS-kortet i ett eget fönster (som i Mina bedömningar): frågor och svar per avsnitt.
function openTodayDops(i) {
  const a = _today?.d.dopsLatest?.[i]; if (!a) return;
  const bySec = [];
  for (const x of a.answers || []) {
    if (!String(x.answer || '').trim()) continue;
    let sec = bySec.find(b => b.section === (x.section || ''));
    if (!sec) bySec.push(sec = { section: x.section || '', rows: [] });
    sec.rows.push(x);
  }
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const who = a.dir === 'in' ? 'Från ' + dopsWho(a.registrar) : 'Till ' + dopsWho(a.recipient);
  root.innerHTML = `
    <div class="overlay" data-close="1">
      <div class="sheet" role="dialog" aria-label="Bedömning">
        <h2>${esc(a.formType)} <button class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
        <p class="muted" style="margin:0 0 8px">${esc(fmtDateLong(a.timestamp.slice(0, 10)))} · ${esc(who)}${a.category ? ' · ' + esc(a.category) : ''}</p>
        ${bySec.length ? bySec.map(sec => `${sec.section ? `<div class="bed-q">${esc(sec.section)}</div>` : ''}<table class="bed-ans">${sec.rows.map(x => `<tr><th>${esc(x.question)}</th><td>${esc(x.answer)}</td></tr>`).join('')}</table>`).join('')
          : '<p class="muted">Inga svar ifyllda.</p>'}
        <p style="margin:14px 0 0"><a href="#/dops/mina">Alla mina bedömningar →</a></p>
      </div>
    </div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
}

// Veckoschemat för hela ST-gruppen de närmaste veckorna, kompakt: en rad per person, kodorden i färg (studierektor, admin, ST).
function schemaCard({ me, sch }, o = {}) {
  if (!sch) return '';
  const weeks = sch.window.weeks.slice(0, o.weeks || 4);
  const type = id => sch.types.find(t => t.id === id);
  const people = sch.people.filter(p => !p.stEnd || p.stEnd >= weeks[0]);
  const cell = (p, w) => sch.activities.filter(a => a.userId === p.id && a.weekFrom <= w && a.weekTo >= w)
    .map(a => `<span class="sact${a.status === 'ev' ? ' ev' : ''}" style="--c:${esc(type(a.typeId)?.color || '#9aa5ad')}" title="${esc((type(a.typeId)?.label || '') + (a.detail ? ' · ' + a.detail : ''))}">${esc(type(a.typeId)?.code || '?')}</span>`).join('');
  const low = w => sch.minInService != null && sch.inService[w] < sch.minInService;
  return todayCard('Veckoschemat', `<div class="tw-sch"><table>
      <tr><th></th>${weeks.map(w => `<th class="${w === sch.thisMonday ? 'cur' : ''}">v${isoWeek(w)}</th>`).join('')}</tr>
      ${people.map(p => `<tr class="${p.id === me.userId ? 'me' : ''}"><td>${esc(p.displayName)}</td>${weeks.map(w => `<td class="${w === sch.thisMonday ? 'cur' : ''}">${cell(p, w)}</td>`).join('')}</tr>`).join('')}
      ${o.service === false ? '' : `<tr class="svc"><td>I tjänst</td>${weeks.map(w => `<td class="${low(w) ? 'low' : ''}">${sch.inService[w] ?? '–'}</td>`).join('')}</tr>`}
    </table></div>`, ['#/schema', 'Veckoschemat']);
}

// Mina aktiviteter i veckoschemat från och med den här veckan: ett antal månader framåt eller resten av innevarande ST-år (ST-läkare).
function myActsCard({ me, sch, plan, today }, o = {}) {
  if (!sch || !me.isSt) return '';
  let end = addMonthsISO(today, o.months || 6), label = `${o.months || 6} mån framåt`;
  if (o.period === 'year' && plan?.person?.stMonths != null && plan.person.expectedEnd) {
    const year = Math.floor(plan.person.stMonths / 12) + 1;
    if (year <= 5) { end = addMonthsISO(plan.person.expectedEnd, -12 * (5 - year)); label = `resten av ST-år ${year} (t.o.m. ${fmtMonth(end)})`; }
  }
  const type = id => sch.types.find(t => t.id === id), req = id => sch.requirements.find(r => r.id === id);
  const mine = sch.activities.filter(a => a.userId === me.userId && a.weekTo >= sch.thisMonday && a.weekFrom < end)
    .sort((a, b) => a.weekFrom.localeCompare(b.weekFrom));
  const wk = a => a.weekFrom === a.weekTo ? `v${isoWeek(a.weekFrom)}` : `v${isoWeek(a.weekFrom)}–${isoWeek(a.weekTo)}`;
  const name = a => { const t = type(a.typeId), r = a.requirementId ? req(a.requirementId) : null; return (r ? r.name : t?.label || t?.code || '?') + (a.detail ? ' · ' + a.detail : ''); };
  const capped = sch.window.toISO < end;
  return todayCard('Mina aktiviteter', `<p class="muted" style="margin:0 0 6px;font-size:13px">${esc(label)}</p>
    ${mine.length ? `<ul class="today-list">${mine.map(a => `<li><span class="muted">${wk(a)}</span> <span class="sact${a.status === 'ev' ? ' ev' : ''}" style="--c:${esc(type(a.typeId)?.color || '#9aa5ad')}">${a.status === 'ev' ? 'Ev. ' : ''}${esc(type(a.typeId)?.code || '?')}</span> ${esc(name(a))}</li>`).join('')}</ul>`
      : '<p class="muted" style="margin:0">Inget inlagt under perioden.</p>'}
    ${capped ? '<p class="hint" style="margin:6px 0 0">Ladda om sidan för att se hela perioden.</p>' : ''}`, ['#/schema', 'Veckoschemat']);
}

// Det senast tillagda i utbildningsmaterialet (modulen Utbildningsmaterial).
function eduCard({ edu }, o = {}) {
  if (!edu) return '';
  const items = edu.sections.flatMap(s => s.items.map(i => ({ ...i, section: s }))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, o.count || 5);
  return todayCard('Nytt i utbildningsmaterialet', items.length
    ? `<ul class="today-list">${items.map(i => `<li><a href="#/utbildning/${esc(i.section.id)}">${esc(i.title)}</a><br><span class="muted" style="font-size:13px;min-width:0">${esc(i.section.title)} · ${esc(fmtDM(String(i.createdAt).slice(0, 10)))}</span></li>`).join('')}</ul>`
    : `<p class="muted" style="margin:0">${edu.loaded ? 'Inget material inlagt än.' : 'Ladda om sidan för att se det senaste.'}</p>`, ['#/utbildning', 'Utbildningsmaterial']);
}

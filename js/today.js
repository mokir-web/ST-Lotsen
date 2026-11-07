// ── Startsidan "Idag" (#/) ───────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), todayStockholm(), mondayOfISO(), addDaysISO(),
// isoWeek(), fmtDM(), fmtDateLong() och js/oversikt.js (OV_LABEL). Global entry: renderToday(root).
//
// Det viktigaste ur alla moduler på ett ställe (ui_forslag.md §1, S2): att göra (studierektor, handledare, global admin),
// dagens opjour och mina pass, min vecka och kommande i veckoschemat, bemanningen i ST-gruppen och mitt förlopp.
// Varje kort hämtar sin egen data; går en hämtning fel visas bara det kortet som tomt. Korten ligger i ett rutnät som var och en
// ordnar och ställer in själv (se TODAY_WIDGETS).

async function renderToday(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    const mods = me.modules || ['opjour'], today = todayStockholm(), monday = mondayOfISO(today);
    const soft = p => p ? p.catch(() => null) : Promise.resolve(null);
    const dopsOn = mods.includes('dops') && me.dopsUser;
    const [cal, sch, plan, todo, dops, dopsRec, dopsSent] = await Promise.all([
      soft(mods.includes('opjour') ? api(`/calendar?start=${monday}&weeks=1`) : null),
      soft(mods.includes('schema') && (me.isSt || me.isDirector || me.isAdmin) ? api(`/schema?from=${monday}&weeks=12`) : null),
      soft(mods.includes('mal') && me.isSt ? api('/plan/me') : null),
      soft(api('/today/todo')),
      soft(dopsOn ? api('/dops/app/overview') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=received') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=sent') : null)
    ]);
    drawToday(root, { me, mods, today, cal, sch, plan, todo, dops, dopsRec, dopsSent });
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: 'numeric' }).format(new Date()));
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
}

// ── Rutnät med kort (widgets) ──────────────────────────────────────────
// Varje kort har en storlek i rutnätet (liten 1×1, bred 2×1, hög 1×2, stor 2×2) och egna inställningar för innehållet.
// "Anpassa" slår på redigeringsläget: dra i ⠿ för att flytta (mus eller finger; piltangenter på handtaget), byt storlek,
// ⚙ för innehåll, ✕ för att dölja. Dolda kort ligger under rutnätet och läggs tillbaka med +. Layouten sparas på kontot
// (PUT /profile/today-layout) och följer med mellan enheter; null = standardlayouten nedan.
// Kort som inte gäller personen (t.ex. DOPS utan kopplat konto) syns varken i rutnätet eller bland de dolda.
const TW_SIZES = [['s', 'Liten'], ['w', 'Bred'], ['t', 'Hög'], ['l', 'Stor']];
const TW_COUNT = n => n.map(x => [x, String(x)]);
const TODAY_WIDGETS = [
  { id: 'todo', title: 'Att göra', size: 't', fn: todoCard, opts: [{ k: 'names', label: 'Visa namn under varje punkt', def: true }] },
  { id: 'opjour', title: 'Opjour', size: 's', fn: opjourCard, opts: [
    { k: 'tomorrow', label: 'Visa vem som har i morgon', def: true }, { k: 'mine', label: 'Visa mina kommande pass', def: true },
    { k: 'mineCount', label: 'Antal pass', def: 4, choices: TW_COUNT([2, 4, 6, 8]) }] },
  { id: 'vecka', title: 'Min vecka', size: 't', fn: myWeekCard, opts: [
    { k: 'later', label: 'Visa kommande', def: true }, { k: 'count', label: 'Antal kommande', def: 5, choices: TW_COUNT([3, 5, 8, 12]) }] },
  { id: 'bemanning', title: 'I tjänst', size: 's', fn: staffingCard, opts: [
    { k: 'weeks', label: 'Antal veckor', def: 6, choices: TW_COUNT([4, 6, 8, 12]) }, { k: 'hint', label: 'Visa förklaring', def: true }] },
  { id: 'forlopp', title: 'Mitt förlopp', size: 's', fn: progressCard, opts: [
    { k: 'goals', label: 'Visa delmål', def: true }, { k: 'year', label: 'Visa ST-år och beräknat slut', def: true }] },
  { id: 'styear', title: 'Kvar under ST-året', size: 't', fn: stYearCard, opts: [
    { k: 'late', label: 'Visa ej klara krav från tidigare år', def: true }, { k: 'optional', label: 'Ta med valfria krav', def: true }] },
  { id: 'dops', title: 'DOPS', size: 't', fn: todayDopsCard, opts: [
    { k: 'bar', label: 'Visa måluppfyllelse', def: true }, { k: 'list', label: 'Visa senaste bedömningar', def: true },
    { k: 'count', label: 'Antal bedömningar', def: 5, choices: TW_COUNT([3, 5, 8, 10]) },
    { k: 'dir', label: 'Bedömningar', def: 'alla', choices: [['alla', 'Mottagna och registrerade'], ['in', 'Bara mottagna'], ['ut', 'Bara registrerade']] }] }
];
const twDef = id => TODAY_WIDGETS.find(w => w.id === id);
const twOpts = (w, c) => Object.fromEntries(w.opts.map(o => [o.k, c?.opts && o.k in c.opts ? c.opts[o.k] : o.def]));

let _today = null;

// Sparad layout + kort som tillkommit sedan den sparades (läggs sist, synliga). Okända id:n hoppas över.
function twLayout(saved) {
  const out = (saved || []).filter(c => twDef(c.id)).map(c => ({ id: c.id, on: c.on !== false, size: c.size || twDef(c.id).size, opts: { ...(c.opts || {}) } }));
  for (const w of TODAY_WIDGETS) if (!out.some(c => c.id === w.id)) out.push({ id: w.id, on: true, size: w.size, opts: {} });
  return out;
}

function drawToday(root, d) {
  _today = { d, layout: twLayout(d.me.todayLayout), edit: false, open: null };
  const first = (d.me.displayName || '').split(' ')[0];
  root.innerHTML = `
    <div class="tw-head">
      <div><h1 class="page" style="margin-bottom:2px">${greeting()}${first ? ', ' + esc(first) : ''}</h1>
        <p class="muted" style="margin:0">${esc(fmtDateLong(d.today))} · vecka ${isoWeek(d.today)}</p></div>
      <div class="tw-actions" id="tw-actions"></div>
    </div>
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

// Kortets innehåll med inställningarna, eller null när kortet inte gäller personen.
function twRender(c) {
  const w = twDef(c.id), r = w.fn(_today.d, twOpts(w, c));
  return r || null;
}

function drawTw() {
  const { layout, edit, open } = _today;
  el('tw-actions').innerHTML = edit
    ? '<button type="button" class="btn-ghost" data-act="reset">Återställ</button><button type="button" class="btn-ghost" data-act="cancel">Avbryt</button><button type="button" class="btn" data-act="save">Klar</button>'
    : '<button type="button" class="btn-ghost tw-edit" data-act="edit" title="Ordna, dölj och ställ in korten">✎ Anpassa</button>';
  const shown = [], hidden = [];
  for (const c of layout) { const r = twRender(c); if (r) (c.on ? shown : hidden).push([c, r]); }
  el('tw-hint')?.remove();
  if (edit) el('tw-grid').insertAdjacentHTML('beforebegin', '<p class="hint" id="tw-hint" style="margin:-6px 0 12px">Dra i ⠿ för att flytta. Välj storlek, ⚙ för innehåll och ✕ för att dölja. Tryck Klar för att spara.</p>');
  const grid = el('tw-grid');
  grid.classList.toggle('editing', edit);
  grid.innerHTML = shown.map(([c, r]) => {
    const w = twDef(c.id);
    const bar = edit ? `<div class="tw-bar">
        <button type="button" class="tw-handle" data-drag="${c.id}" aria-label="Flytta ${esc(r.title)} (piltangenter)" title="Dra för att flytta">⠿</button>
        <span class="tw-sizes" role="group" aria-label="Storlek">${TW_SIZES.map(([k, l]) => `<button type="button" data-size="${k}" data-id="${c.id}" class="${c.size === k ? 'on' : ''}" title="${l}" aria-label="${l}" aria-pressed="${c.size === k}"><i class="tw-sz tw-sz-${k}"></i></button>`).join('')}</span>
        ${w.opts.length ? `<button type="button" class="tw-ico${open === c.id ? ' on' : ''}" data-opts="${c.id}" title="Innehåll" aria-expanded="${open === c.id}">⚙</button>` : ''}
        <button type="button" class="tw-ico" data-hide="${c.id}" title="Dölj kortet">✕</button>
      </div>` : '';
    const body = edit && open === c.id ? twOptsForm(w, c) : `<div class="tw-body"><h2>${esc(r.title)}</h2>${r.body}${r.link ? `<p class="tw-link"><a href="${r.link[0]}">${r.link[1]} →</a></p>` : ''}</div>`;
    return `<section class="card today-card tw tw-${c.size}" data-id="${c.id}">${bar}${body}</section>`;
  }).join('') || `<div class="card"><p class="muted" style="margin:0">${edit ? 'Alla kort är dolda. Lägg tillbaka dem nedan.' : 'Inget att visa här än.'}</p></div>`;
  el('tw-hidden').innerHTML = edit && hidden.length ? `<div class="tw-tray"><h3 class="today-sub" style="margin-top:0">Dolda kort</h3>
      ${hidden.map(([c, r]) => `<button type="button" class="btn-ghost" data-show="${c.id}">+ ${esc(r.title)}</button>`).join(' ')}</div>` : '';
}

function twOptsForm(w, c) {
  const o = twOpts(w, c);
  return `<div class="tw-body tw-form"><h2>${esc(w.title)} – innehåll</h2>
    ${w.opts.map(d => d.choices
      ? `<label class="tw-opt">${esc(d.label)}<select data-opt="${d.k}" data-id="${c.id}">${d.choices.map(([v, l]) => `<option value="${esc(v)}"${String(o[d.k]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
      : `<label class="tw-opt tw-check"><input type="checkbox" data-opt="${d.k}" data-id="${c.id}"${o[d.k] ? ' checked' : ''}> ${esc(d.label)}</label>`).join('')}
    <p style="margin:10px 0 0"><button type="button" class="btn-ghost" data-opts="${c.id}">Visa kortet</button></p></div>`;
}

const twFind = id => _today.layout.find(c => c.id === id);

async function onTwAction(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit') { _today.before = JSON.stringify(_today.layout); _today.edit = true; }
  else if (act === 'cancel') { _today.layout = JSON.parse(_today.before); _today.edit = false; _today.open = null; }
  else if (act === 'reset') { if (!confirm('Återställa Idag till standardlayouten? Ordning, storlekar och inställningar för korten försvinner.')) return; _today.layout = twLayout(null); _today.reset = true; _today.open = null; }
  else if (act === 'save') {
    b.disabled = true;
    try {
      const unchanged = _today.reset && JSON.stringify(_today.layout) === JSON.stringify(twLayout(null));
      const r = await api('/profile/today-layout', { method: 'PUT', body: { layout: unchanged ? null : _today.layout } });
      _today.d.me.todayLayout = r.layout;
      _today.edit = false; _today.open = null; _today.reset = false;
    } catch (err) { b.disabled = false; alert(err.message); return; }
  }
  drawTw();
}

function onTwGrid(e) {
  const t = e.target.closest('button'); if (!t || !_today.edit) return;
  if (t.dataset.size) { twFind(t.dataset.id).size = t.dataset.size; }
  else if (t.dataset.opts) { _today.open = _today.open === t.dataset.opts ? null : t.dataset.opts; }
  else if (t.dataset.hide) { twFind(t.dataset.hide).on = false; if (_today.open === t.dataset.hide) _today.open = null; }
  else if (t.dataset.show) { const c = twFind(t.dataset.show); c.on = true; _today.layout = [..._today.layout.filter(x => x !== c), c]; }
  else return;
  drawTw();
}

function onTwOpt(e) {
  const i = e.target.closest('[data-opt]'); if (!i) return;
  const c = twFind(i.dataset.id), d = twDef(c.id).opts.find(o => o.k === i.dataset.opt);
  c.opts[d.k] = i.type === 'checkbox' ? i.checked : typeof d.def === 'number' ? Number(i.value) : i.value;
}

// Flytta ett kort i layouten till platsen före/efter ett annat (bland de synliga följer ordningen layouten).
function twMove(id, toId, after) {
  const L = _today.layout, c = L.find(x => x.id === id);
  const rest = L.filter(x => x !== c), at = rest.findIndex(x => x.id === toId);
  rest.splice(at + (after ? 1 : 0), 0, c);
  _today.layout = rest;
}

function onTwKey(e) {
  const h = e.target.closest('[data-drag]'); if (!h) return;
  const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!dir) return;
  e.preventDefault();
  const vis = [...el('tw-grid').querySelectorAll('.tw')].map(n => n.dataset.id), i = vis.indexOf(h.dataset.drag), j = i + dir;
  if (j < 0 || j >= vis.length) return;
  twMove(h.dataset.drag, vis[j], dir > 0);
  drawTw();
  el('tw-grid').querySelector(`[data-drag="${h.dataset.drag}"]`)?.focus();
}

// Dra med pekare (mus, finger, penna). Kortet följer inte pekaren; i stället flyttas det i rutnätet när pekaren
// passerar ett annat kort (före om pekaren är i kortets första halva, annars efter). Nära skärmkanten rullar sidan.
function onTwDragStart(e) {
  const h = e.target.closest('[data-drag]'); if (!h || e.button > 0) return;
  e.preventDefault();
  const grid = el('tw-grid'), id = h.dataset.drag, card = () => grid.querySelector(`.tw[data-id="${id}"]`);
  card().classList.add('dragging');
  let lastY = e.clientY, raf = 0;
  const scroll = () => {
    const edge = 70, v = lastY < edge ? -12 : lastY > innerHeight - edge ? 12 : 0;
    if (v) { scrollBy(0, v); raf = requestAnimationFrame(scroll); } else raf = 0;
  };
  const move = ev => {
    lastY = ev.clientY;
    if (!raf) raf = requestAnimationFrame(scroll);
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tw');
    if (!over || over.dataset.id === id || !grid.contains(over)) return;
    const r = over.getBoundingClientRect();
    const after = r.width > r.height * 1.4 ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2 || ev.clientX > r.left + r.width / 2 && ev.clientY > r.top + r.height / 3;
    over[after ? 'after' : 'before'](card());
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (raf) cancelAnimationFrame(raf);
    const order = [...grid.querySelectorAll('.tw')].map(n => n.dataset.id);
    const vis = _today.layout.filter(c => order.includes(c.id)), slots = _today.layout.map(c => order.includes(c.id));
    const sorted = order.map(i => vis.find(c => c.id === i));
    let k = 0;
    _today.layout = _today.layout.map((c, i) => slots[i] ? sorted[k++] : c);
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
function todayDopsCard({ dops, dopsRec, dopsSent }, o = {}) {
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
  const who = a => a.dir === 'in' ? 'från ' + a.registrar : 'till ' + a.recipient.replace(/ -- .*$/, '');
  const goalBar = goals.length ? `
    <div class="dg-head"><span>Måluppfyllelse senaste 6 mån</span><strong style="color:${tone}">${pct} %</strong></div>
    <div class="dg-track" role="img" aria-label="${pct} procent av målen"><i style="width:${Math.min(100, pct)}%;background:${tone}"></i></div>
    <p class="muted" style="margin:4px 0 0;font-size:13px">${met} av ${goals.length} mål uppnådda · ${got} av ${sum} bedömningar</p>`
    : '<p class="muted" style="margin:0">Kliniken har inga mål för dina formulär.</p>';
  const list = latest.length ? `<ul class="today-list dg-list">${latest.map(a => `<li><span class="dg-dir ${a.dir}" title="${a.dir === 'in' ? 'Mottagen' : 'Registrerad av dig'}">${a.dir === 'in' ? '↓' : '↑'}</span>
      <span><strong>${esc(short(a.formType))}</strong><br><span class="muted" style="font-size:13px">${esc(who(a))} · ${esc(fmtDM(a.timestamp.slice(0, 10)))}</span></span></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Inga bedömningar än.</p>';
  const parts = [o.bar !== false ? goalBar : '', o.list !== false ? (o.bar !== false ? '<h3 class="today-sub">Senaste bedömningar</h3>' : '') + list : ''];
  return todayCard('DOPS', parts.join('') || '<p class="muted" style="margin:0">Allt innehåll är avstängt i kortets inställningar.</p>', ['#/dops', 'Till DOPS']);
}

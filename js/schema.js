// ── Planering → Veckoschema (#/schema) ───────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), todayStockholm(), mondayOfISO(),
// addDaysISO(), isoWeek(), fmtDM(). Global entry: renderSchema(root).
//
// ST-gruppens schema vecka för vecka (ersätter fliken "Fullständigt veckoschema" i ST-plan.xlsx).
// Rader = ST-läkare, kolumner = veckor. Raden "I tjänst" räknas av servern (plattform_plan.md §3).
// Tryck på en ruta öppnar veckan för personen: lägg till, ändra eller ta bort aktiviteter.
// ST-läkaren ändrar sin egen rad; studierektor och admin alla rader (servern kontrollerar).
// Dra över flera veckor i en rad (dator) för att skapa en period. Bemanningsvarning: "I tjänst" blir röd under klinikens minsta antal.
// Vyer: Tabell (förval på dator), Jag (min rad som lista vecka för vecka) och Alla (lista per vecka) — förval på mobil.

let _sch = null;

const SCH_WEEKS = 26, SCH_STEP = 4;

async function renderSchema(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const from = addDaysISO(mondayOfISO(todayStockholm()), -14);
    const [me, data] = await Promise.all([api('/me'), api(`/schema?from=${from}&weeks=${SCH_WEEKS}`)]);
    setMenuForUser(me);
    const mobile = window.matchMedia('(max-width: 640px)').matches;
    _sch = { me, data, from, sheet: null, view: mobile ? (data.people.some(p => p.id === data.me) ? 'me' : 'all') : 'table' };
    drawSchema(root);
    if (_sch.view !== 'table') document.querySelector('.wk.now')?.scrollIntoView({ block: 'start' });   // listan börjar två veckor bakåt
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadSchema() {
  _sch.data = await api(`/schema?from=${_sch.from}&weeks=${SCH_WEEKS}`);
  _sch.yearData = null;   // årsvyn hämtas om nästa gång den visas
  drawSchema(el('view'));
}

async function stepSchema(n) {
  _sch.from = n === 'today' ? addDaysISO(mondayOfISO(todayStockholm()), -14) : addDaysISO(_sch.from, 7 * SCH_STEP * n);
  try { await reloadSchema(); } catch (err) { alert(err.message); }
}

const schType = id => _sch.data.types.find(t => t.id === id);
const schReq = id => _sch.data.requirements.find(r => r.id === id);
const schCanEdit = userId => _sch.data.canEditAll || userId === _sch.data.me;

// Kort text i rutan: kravets namn (t.ex. "Kolo") om det finns, annars typens kod; detaljen efter.
function actLabel(a) {
  const t = schType(a.typeId), r = a.requirementId ? schReq(a.requirementId) : null;
  return (r ? `${t ? t.code + ': ' : ''}${r.name}` : (t ? t.code : '?')) + (a.detail ? ` · ${a.detail}` : '');
}

function actChip(a) {
  const t = schType(a.typeId);
  const color = t ? t.color : '#9aa5ad';
  return `<span class="sact${a.status === 'ev' ? ' ev' : ''}" style="--c:${esc(color)}" title="${esc((a.status === 'ev' ? 'Ev. ' : '') + actLabel(a))}">${a.status === 'ev' ? 'Ev. ' : ''}${esc(actLabel(a))}</span>`;
}

const schLow = m => _sch.data.minInService != null && _sch.data.inService[m] < _sch.data.minInService;

// Listvy (mobil): en ruta per vecka. "Jag" = min rad; "Alla" = de som har något inlagt den veckan.
function schList(weeks, byCell) {
  const { data } = _sch;
  const mine = _sch.view === 'me';
  const people = mine ? data.people.filter(p => p.id === data.me) : data.people;
  const week = m => {
    const rows = people.map(p => {
      const acts = byCell.get(p.id + '|' + m) || [];
      const inSt = data.inServiceByPerson[p.id][m] !== null;
      if (!mine && !acts.length) return '';
      const edit = schCanEdit(p.id) && inSt;
      return `<button type="button" class="wk-row${edit ? ' edit' : ''}${inSt ? '' : ' out'}"${edit ? ` data-p="${esc(p.id)}" data-w="${m}"` : ' disabled'}>
        ${mine ? '' : `<span class="who">${esc(p.displayName)}</span>`}<span>${!inSt ? 'utanför ST-tiden' : acts.length ? acts.map(actChip).join(' ') : '<span class="muted">– i tjänst –</span>'}</span></button>`;
    }).join('');
    return `<div class="wk${m === data.thisMonday ? ' now' : ''}"><h3><span>v${isoWeek(m)} · ${fmtDM(m)}</span>
      <span class="svcn${schLow(m) ? ' low' : ''}">${data.inService[m]} i tjänst${schLow(m) ? ` (minst ${data.minInService})` : ''}</span></h3>
      ${rows || '<div class="wk-row out">Inga aktiviteter inlagda</div>'}</div>`;
  };
  if (!mine || !people.length) return `<div class="wk-list">${weeks.map(week).join('')}</div>`;
  // Läget Jag: veckor i följd i tjänst utan aktivitet slås ihop till en rad, t.ex. "v45–v53 · i tjänst" (granskning G6).
  const p = people[0];
  const quiet = m => data.inServiceByPerson[p.id][m] !== null && !(byCell.get(p.id + '|' + m) || []).length && m !== data.thisMonday && !schLow(m);
  const out = [];
  for (let i = 0; i < weeks.length; i++) {
    let j = i;
    if (quiet(weeks[i])) while (j + 1 < weeks.length && quiet(weeks[j + 1])) j++;
    if (j === i) { out.push(week(weeks[i])); continue; }
    const edit = schCanEdit(p.id);
    out.push(`<div class="wk"><button type="button" class="wk-row${edit ? ' edit' : ''}"${edit ? ` data-p="${esc(p.id)}" data-w="${weeks[i]}"` : ' disabled'}>
      <span>v${isoWeek(weeks[i])}–v${isoWeek(weeks[j])} · ${fmtDM(weeks[i])}–${fmtDM(addDaysISO(weeks[j], 6))}</span><span class="muted">– i tjänst –</span></button></div>`);
    i = j;
  }
  return `<div class="wk-list">${out.join('')}</div>`;
}

// Dra över veckor i en rad: markera från första till sista rutan och öppna "Ny aktivitet" med period ifylld.
function schDragSetup(root) {
  const table = root.querySelector('table.sch');
  if (!table) return;
  let start = null, cur = null;
  const cellsOf = (p, a, b) => [...table.querySelectorAll(`.scell.edit[data-p="${CSS.escape(p)}"]`)].filter(td => td.dataset.w >= (a < b ? a : b) && td.dataset.w <= (a < b ? b : a));
  const paint = () => { table.querySelectorAll('.scell.sel').forEach(td => td.classList.remove('sel')); if (start && cur) cellsOf(start.p, start.w, cur).forEach(td => td.classList.add('sel')); };
  table.addEventListener('pointerdown', e => {
    const td = e.target.closest('.scell.edit');
    if (!td || e.button !== 0 || e.pointerType === 'touch') return;
    start = { p: td.dataset.p, w: td.dataset.w }; cur = td.dataset.w;
  });
  table.addEventListener('pointerover', e => {
    if (!start) return;
    const td = e.target.closest('.scell.edit');
    if (!td || td.dataset.p !== start.p || td.dataset.w === cur) return;
    cur = td.dataset.w; table.classList.add('dragging'); paint();
  });
  const finish = () => {
    if (!start) return;
    const s = start, end = cur; start = cur = null; table.classList.remove('dragging');
    if (end === s.w) return;   // vanligt klick — click-hanteraren öppnar veckan
    const a = s.w < end ? s.w : end, b = s.w < end ? end : s.w;
    const weeks = Math.round((Date.parse(b) - Date.parse(a)) / 6048e5) + 1;
    _sch.dragged = true; setTimeout(() => { _sch.dragged = false; }, 0);
    _sch.sheet = { userId: s.p, monday: a, editing: 'new', weeks }; drawSchemaSheet();
    table.querySelectorAll('.scell.sel').forEach(td => td.classList.remove('sel'));
  };
  table.addEventListener('pointerup', finish);
  table.addEventListener('pointerleave', () => { if (start && cur !== start.w) finish(); else { start = cur = null; table.classList.remove('dragging'); paint(); } });
}

// ── Årsöversikt: en rad per ST-läkare, en smal ruta per vecka (färg = aktivitetstypen), hela kalenderåret ──
// Data från samma /schema (53 veckor från måndagen i vecka 1). Klick på en ruta öppnar tabellen vid den veckan.
async function loadSchYear(year) {
  const jan4 = `${year}-01-04`;   // vecka 1 innehåller alltid 4 januari
  const from = mondayOfISO(jan4);
  const data = await api(`/schema?from=${from}&weeks=53`);
  data.window.weeks = data.window.weeks.filter(m => isoWeekYear(m) === year);
  _sch.year = year; _sch.yearData = data;
}
const isoWeekYear = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); return d.getUTCFullYear(); };

function schYearView() {
  const d = _sch.yearData, weeks = d.window.weeks;
  const typeOf = id => d.types.find(t => t.id === id);
  const label = a => { const t = typeOf(a.typeId), r = a.requirementId ? d.requirements.find(x => x.id === a.requirementId) : null;
    return (a.status === 'ev' ? 'Ev. ' : '') + (r ? `${t ? t.code + ': ' : ''}${r.name}` : (t ? t.label : '?')) + (a.detail ? ` · ${a.detail}` : ''); };
  const months = [];
  for (const m of weeks) { const mo = +m.slice(5, 7); if (!months.length || months[months.length - 1].mo !== mo) months.push({ mo, n: 1 }); else months[months.length - 1].n++; }
  const MON = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const rows = d.people.map(p => `<tr><th class="pname${p.id === d.me ? ' me' : ''}">${esc(p.displayName)}</th>${weeks.map(m => {
    const acts = d.activities.filter(a => a.userId === p.id && m >= a.weekFrom && m <= a.weekTo);
    const out = d.inServiceByPerson[p.id]?.[m] === null;
    const cols = acts.map(a => typeOf(a.typeId)?.color || '#9aa5ad');
    const bg = !cols.length ? '' : cols.length === 1 ? cols[0] : `linear-gradient(${cols.map((c, i) => `${c} ${i / cols.length * 100}% ${(i + 1) / cols.length * 100}%`).join(',')})`;
    const tip = `v${isoWeek(m)} ${fmtDM(m)}${acts.length ? ': ' + acts.map(label).join(' / ') : ''}${out ? ' (utanför ST)' : ''}`;
    return `<td class="yc${out ? ' out' : ''}${m === d.thisMonday ? ' now' : ''}${acts.some(a => a.status === 'ev') ? ' ev' : ''}" data-w="${m}" title="${esc(tip)}"${bg ? ` style="background:${esc(bg)}"` : ''}></td>`;
  }).join('')}</tr>`).join('');
  const svc = weeks.map(m => { const low = d.minInService != null && d.inService[m] < d.minInService;
    return `<td class="yc ysvc${low ? ' low' : ''}" title="v${isoWeek(m)}: ${d.inService[m]} i tjänst${low ? ` (under ${d.minInService})` : ''}">${d.inService[m]}</td>`; }).join('');
  return `<div class="sch-scroll"><table class="sch ysch">
      <thead><tr><th class="pname">${_sch.year}</th>${months.map(x => `<th colspan="${x.n}" class="ymon">${MON[x.mo - 1]}</th>`).join('')}</tr>
        <tr><th class="pname"></th>${weeks.map(m => `<th class="ywk${m === d.thisMonday ? ' now' : ''}">${isoWeek(m) % 2 ? isoWeek(m) : ''}</th>`).join('')}</tr></thead>
      <tbody><tr class="svc-row"><th class="pname">I tjänst</th>${svc}</tr>${rows}</tbody></table></div>
    <p class="hint">Peka på en ruta för att se vad som är inlagt. Klicka för att öppna veckan i tabellen.</p>`;
}

async function stepSchYear(n) {
  try { await loadSchYear(_sch.year + n); drawSchema(el('view')); } catch (err) { alert(err.message); }
}

function drawSchema(root) {
  const { data } = _sch;
  const weeks = data.window.weeks;
  const byCell = new Map();   // "userId|monday" → [aktivitet]
  for (const a of data.activities) for (const m of weeks) {
    if (m < a.weekFrom || m > a.weekTo) continue;
    const k = a.userId + '|' + m;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(a);
  }

  const head = weeks.map(m => `<th class="${m === data.thisMonday ? 'now' : ''}">v${isoWeek(m)}<br><span>${fmtDM(m)}</span></th>`).join('');
  const service = weeks.map(m => `<td class="svc${m === data.thisMonday ? ' now' : ''}${schLow(m) ? ' low' : ''}"${schLow(m) ? ` title="Under ${data.minInService} i tjänst"` : ''}>${data.inService[m]}</td>`).join('');
  const rows = data.people.map(p => {
    const editable = schCanEdit(p.id);
    const cells = weeks.map(m => {
      const inSt = data.inServiceByPerson[p.id][m] !== null;
      const acts = byCell.get(p.id + '|' + m) || [];
      const cls = ['scell', m === data.thisMonday ? 'now' : '', inSt ? '' : 'outside', editable ? 'edit' : ''].filter(Boolean).join(' ');
      const attrs = editable ? ` data-p="${esc(p.id)}" data-w="${m}" role="button" tabindex="0"` : '';
      return `<td class="${cls}"${attrs}>${acts.map(actChip).join('')}</td>`;
    }).join('');
    return `<tr><th class="pname${p.id === data.me ? ' me' : ''}">${esc(p.displayName)}</th>${cells}</tr>`;
  }).join('');

  const types = data.types.filter(t => t.active);
  const legend = types.map(t => `<span class="sact" style="--c:${esc(t.color)}">${esc(t.code)}</span> <span class="muted" style="font-size:13px;margin-right:10px">${esc(t.label)}</span>`).join('');
  const first = weeks[0], last = weeks[weeks.length - 1];

  root.innerHTML = `
    <div class="card">
      <h1 class="page" style="margin-top:0">Veckoschema</h1>
      ${_sch.view === 'year' ? `<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button class="btn-ghost" onclick="stepSchYear(-1)">‹ ${_sch.year - 1}</button>
        <strong>Året ${_sch.year}</strong>
        <span class="row" style="gap:8px"><button class="btn-ghost" onclick="stepSchYear(${new Date().getFullYear()} - _sch.year)">I år</button>
          <button class="btn-ghost" onclick="stepSchYear(1)">${_sch.year + 1} ›</button></span>
      </div>` : `<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">
        <button class="btn-ghost" onclick="stepSchema(-1)">‹ ${SCH_STEP} veckor</button>
        <strong>v${isoWeek(first)} ${first.slice(0, 4)} – v${isoWeek(last)} ${last.slice(0, 4)}</strong>
        <span class="row" style="gap:8px">
          <button class="btn-ghost" onclick="stepSchema('today')">Idag</button>
          <button class="btn-ghost" onclick="stepSchema(1)">${SCH_STEP} veckor ›</button>
          ${data.canEditAll ? '<button class="btn-ghost" onclick="openJobImport()" title="Fyll i veckoschemat från jobbschemat (.xlsx)">Importera jobbschema…</button>' : ''}
        </span>
      </div>`}
      ${data.people.length ? `
      <div class="seg" id="sch-view" style="margin-top:10px">${[['table', 'Tabell'], ...(data.people.some(p => p.id === data.me) ? [['me', 'Jag']] : []), ['all', 'Alla'], ['year', 'År']].map(([k, l]) =>
        `<button type="button" data-v="${k}" class="${_sch.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${data.minInService != null ? `<span class="muted" style="font-size:13px;margin-left:8px">Minst ${data.minInService} i tjänst</span>` : ''}
      ${_sch.view === 'year' ? schYearView() : _sch.view !== 'table' ? schList(weeks, byCell) : `
      <div class="sch-scroll">
        <table class="sch">
          <thead><tr><th class="pname">ST-läkare</th>${head}</tr></thead>
          <tbody>
            <tr class="svc-row"><th class="pname">I tjänst</th>${service}</tr>
            ${rows}
          </tbody>
        </table>
      </div>`}` : `<div class="empty"><p><strong>Inga ST-läkare i perioden.</strong></p><p class="hint">Vem som är ST-läkare och när ST började sätts under Inställningar → ST-utbildning.</p>
        ${data.canEditAll ? '<a class="btn" href="#/installningar/st/personer" style="text-decoration:none">ST-läkare och handledare</a>' : ''}</div>`}
      ${types.length ? `<p style="margin:12px 0 0;line-height:2">${legend}<span class="sact ev" style="--c:#9aa5ad">Ev.</span> <span class="muted" style="font-size:13px">preliminär</span></p>`
        : `<div class="empty"><p><strong>Inga aktivitetstyper än.</strong> ${data.canEditAll ? 'Börja med standardtyperna — allt går att ändra efteråt.' : 'Studierektor lägger in dem.'}</p>
          ${data.canEditAll ? '<a class="btn" href="#/installningar/planering" style="text-decoration:none">Till inställningarna</a>' : ''}</div>`}
      <p class="hint${_sch.view === 'year' ? ' hidden' : ''}">${data.canEditAll ? 'Tryck på en ruta för att lägga till eller ändra.' : 'Tryck på en ruta i din egen rad för att lägga till eller ändra.'}
        ${_sch.view === 'table' ? 'Dra över flera veckor i en rad för att lägga in en period.' : ''}</p>
    </div>`;

  el('sch-view')?.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.v === 'year' && !_sch.yearData) { try { await loadSchYear(new Date().getFullYear()); } catch (err) { alert(err.message); return; } }
    _sch.view = b.dataset.v; drawSchema(el('view'));
  });
  // Årsvyn: klick på en vecka → tabellen med den veckan nära början.
  root.querySelectorAll('.ysch td.yc[data-w]').forEach(td => td.addEventListener('click', async () => {
    _sch.from = addDaysISO(td.dataset.w, -14); _sch.view = 'table';
    try { await reloadSchema(); } catch (err) { alert(err.message); }
  }));
  root.querySelectorAll('.wk-row.edit').forEach(r => r.addEventListener('click', () => { _sch.sheet = { userId: r.dataset.p, monday: r.dataset.w, editing: null }; drawSchemaSheet(); }));
  schDragSetup(root);

  root.querySelectorAll('.scell.edit').forEach(td => {
    const open = () => { if (_sch.dragged) { _sch.dragged = false; return; } _sch.sheet = { userId: td.dataset.p, monday: td.dataset.w, editing: null }; drawSchemaSheet(); };
    td.addEventListener('click', open);
    td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  drawSchemaSheet();
}

// ── Veckovy för en person: lista + formulär ──────────────────────────────
function drawSchemaSheet() {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const s = _sch && _sch.sheet;
  if (!s) { root.innerHTML = ''; return; }
  const { data } = _sch;
  const person = data.people.find(p => p.id === s.userId);
  const acts = data.activities.filter(a => a.userId === s.userId && s.monday >= a.weekFrom && s.monday <= a.weekTo);
  const editing = s.editing === 'new' ? null : acts.find(a => a.id === s.editing) || null;
  const showForm = s.editing === 'new' || editing || !acts.length;

  const list = acts.map(a => {
    const n = Math.round((Date.parse(a.weekTo) - Date.parse(a.weekFrom)) / 6048e5) + 1;
    return `<div class="pass-card"><span>${actChip(a)} <span class="muted" style="font-size:13px">v${isoWeek(a.weekFrom)}${n > 1 ? '–v' + isoWeek(a.weekTo) : ''} (${n} v)</span></span>
      <button class="link-btn" data-ss="edit" data-id="${esc(a.id)}">Ändra</button></div>`;
  }).join('');

  root.innerHTML = `
    <div class="overlay" data-ss="close">
      <div class="sheet" role="dialog" aria-label="Vecka">
        <h2>${esc(person ? person.displayName : '')} · v${isoWeek(s.monday)}${s.weeks > 1 ? '–' + isoWeek(addDaysISO(s.monday, 7 * (s.weeks - 1))) : ''} <button class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-ss="close" aria-label="Stäng">✕</button></h2>
        ${acts.length ? `<h3>Den här veckan</h3>${list}` : ''}
        ${showForm ? activityForm(editing, s.monday, s.weeks) : '<button class="btn btn-block" data-ss="new">Lägg till aktivitet</button>'}
        <div id="ss-err" class="status err"></div>
      </div>
    </div>`;
  root.querySelectorAll('[data-ss]').forEach(n => n.addEventListener('click', onSchemaSheet));
  const typeSel = el('af-type');
  if (typeSel) { typeSel.addEventListener('change', syncReqField); el('af-req').addEventListener('change', onReqPicked); syncReqField(); }
}

function activityForm(a, monday, prefillWeeks) {
  const types = _sch.data.types.filter(t => t.active || (a && t.id === a.typeId));
  const reqs = _sch.data.requirements.filter(r => r.active || (a && r.id === a.requirementId));
  const cats = [...new Set(reqs.map(r => r.category))];
  const weeks = a ? Math.round((Date.parse(a.weekTo) - Date.parse(a.weekFrom)) / 6048e5) + 1 : prefillWeeks || 1;
  if (!types.length) return '<p class="hint">Inga aktivitetstyper finns. Studierektor eller admin lägger in dem under Inställningar → Planering.</p>';
  return `
    <h3>${a ? 'Ändra aktivitet' : 'Ny aktivitet'}</h3>
    <label for="af-type" style="margin-top:0">Typ</label>
    <select id="af-type">${types.map(t => `<option value="${esc(t.id)}"${a && a.typeId === t.id ? ' selected' : ''}>${esc(t.code)} – ${esc(t.label)}</option>`).join('')}</select>
    <div id="af-req-wrap">
      <label for="af-req">Krav (måluppfyllelse)</label>
      <select id="af-req"><option value="">– inget –</option>${cats.map(c => `<optgroup label="${esc(c)}">${reqs.filter(r => r.category === c).map(r =>
        `<option value="${esc(r.id)}"${a && a.requirementId === r.id ? ' selected' : ''}>${esc(r.name)}${r.location ? ' (' + esc(r.location) + ')' : ''}</option>`).join('')}</optgroup>`).join('')}</select>
    </div>
    <label for="af-detail">Detalj (valfritt)</label>
    <input type="text" id="af-detail" maxlength="80" value="${esc(a ? a.detail || '' : '')}" placeholder="t.ex. mån–ons">
    <div class="field-row">
      <div><label for="af-from">Från vecka (valfri dag i veckan)</label><input type="date" id="af-from" value="${a ? a.weekFrom : monday}" required></div>
      <div><label for="af-weeks">Antal veckor</label><input type="number" id="af-weeks" min="1" max="104" value="${weeks}" required></div>
    </div>
    <label class="row" style="gap:8px;font-weight:normal;margin-top:12px"><input type="checkbox" id="af-ev"${a && a.status === 'ev' ? ' checked' : ''}> Ev. (preliminär — räknas ändå i "I tjänst")</label>
    <button class="btn btn-block" data-ss="save" data-id="${a ? esc(a.id) : ''}">${a ? 'Spara' : 'Lägg till'}</button>
    ${a ? `<button class="btn btn-danger btn-block" data-ss="delete" data-id="${esc(a.id)}">Ta bort aktiviteten</button>` : ''}`;
}

// Kravfältet visas bara för typer som ger måluppfyllelse (Rand, Kurs, Körkort, Projekt …).
function syncReqField() {
  const t = schType(el('af-type').value);
  const on = !!(t && t.givesProgress);
  el('af-req-wrap').classList.toggle('hidden', !on);
  if (!on) el('af-req').value = '';
}
// Krav med planerad längd fyller i antal veckor (t.ex. Narkos 8 v).
function onReqPicked() {
  const r = schReq(el('af-req').value);
  if (r && r.weeks) el('af-weeks').value = r.weeks;
}

async function onSchemaSheet(e) {
  const kind = e.currentTarget.dataset.ss;
  if (kind === 'close') {
    if (e.target !== e.currentTarget) return;   // klick inne i dialogen bubblar hit
    _sch.sheet = null; drawSchemaSheet(); return;
  }
  e.stopPropagation();
  const s = _sch.sheet, id = e.currentTarget.dataset.id;
  if (kind === 'new') { s.editing = 'new'; drawSchemaSheet(); return; }
  if (kind === 'edit') { s.editing = id; drawSchemaSheet(); return; }
  try {
    if (kind === 'save') {
      const body = {
        typeId: el('af-type').value, requirementId: el('af-req').value || null, detail: el('af-detail').value,
        weekFrom: el('af-from').value, weeks: Number(el('af-weeks').value), status: el('af-ev').checked ? 'ev' : 'bokad'
      };
      if (id) await api('/activities/' + encodeURIComponent(id), { method: 'PUT', body });
      else await api('/activities', { method: 'POST', body: { ...body, userId: s.userId } });
    } else if (kind === 'delete') {
      if (!confirm('Ta bort aktiviteten (alla dess veckor)?')) return;
      await api('/activities/' + encodeURIComponent(id), { method: 'DELETE' });
    }
    _sch.sheet = null;
    await reloadSchema();
  } catch (err) {
    const box = el('ss-err'); if (box) box.textContent = err.message;
  }
}

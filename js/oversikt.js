// ── Måluppfyllelse (#/oversikt) ──────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), isoWeek(). Global entry: renderOversikt(root).
//
// Matrisen person × krav (ersätter flikarna "Översikt", "Randningsöversikt" och "Tidigare" i ST-plan.xlsx).
// Status räknas av servern (utils/progress.js): klart när schemaposten tidsmässigt passerats, annars bokad/förslag ur schemat,
// eller det som angetts för hand (Tidigare, Klart, Plan). Tryck på en ruta för att se underlaget och ändra det manuella.
// Studierektor och admin ser alla ST-läkare; en ST-läkare ser sin egen rad.
// Kompakt läge (förval): ikon + vecka i rutan, full text i verktygstipset. Alla rubriker sorterar: namn, ST-tid, % klart
// (obligatoriska krav) och varje krav (klara först, sedan bokade, förslag …). Klick på samma rubrik vänder ordningen.
// Filter per kategori; på mobil visas en kategori åt gången.

let _ov = null;

const OV_LABEL = { klart: 'Klart', tidigare: 'Tidigare', bokad: 'Bokad', forslag: 'Förslag', plan: 'Plan', saknas: 'Saknas', ejgjort: 'Ej gjort', ej: 'Ej i planen' };

// Saknas är rött bara när personen passerat kravets ST-år (late från servern); annars grått "Ej gjort" — inte gjort än.
function ovMarkDue(o) {
  if (!o || typeof o !== 'object') return o;
  if (o.status === 'saknas' && !o.late) o.status = 'ejgjort';
  for (const v of Object.values(o)) ovMarkDue(v);
  return o;
}
const weekShort = iso => `v${isoWeek(iso)} ${iso.slice(0, 4)}`;
// Beräknat ST-slut har passerats men inget ST-slut är angivet (troligen klar — studierektorn får en påminnelse på Idag).
const ovPassedEnd = (p, today) => !p.stEnd && p.expectedEnd && p.expectedEnd < today;

async function renderOversikt(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [me, data] = await Promise.all([api('/me'), api('/progress').then(d => (ovMarkDue(d.cells), d))]);
    setMenuForUser(me);
    let compact = true; try { compact = localStorage.getItem('ov_compact') !== '0'; } catch {}
    const mobile = window.matchMedia('(max-width: 640px)').matches;
    _ov = { me, data, showEnded: false, sheet: null, compact, sort: 'name', desc: false, cat: mobile ? 'first' : 'alla' };
    drawOversikt(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadOversikt() {
  _ov.data = await api('/progress');
  ovMarkDue(_ov.data.cells);
  drawOversikt(el('view'));
}

function ovCellText(s) {
  if (!s || !s.status) return '';
  if (s.status === 'klart') return s.week ? weekShort(s.week) : 'Klart';
  if (s.status === 'bokad') return weekShort(s.week);
  if (s.status === 'forslag') return 'Ev. ' + weekShort(s.week);
  if (s.status === 'plan') return s.note || 'Plan';
  return OV_LABEL[s.status];
}

// Kompakt: ✓ klart/tidigare, ◷ + vecka bokad, ? + vecka förslag, ✎ plan, · ej gjort, ! saknas (försenat), – borttaget ur personens plan.
const OV_ICON = { klart: '✓', tidigare: '✓', bokad: '◷', forslag: '?', plan: '✎', saknas: '!', ejgjort: '·', ej: '–' };
function ovCompact(s) {
  if (!s || !s.status) return '';
  const wk = s.week ? ' ' + isoWeek(s.week) : '';
  return OV_ICON[s.status] + (['bokad', 'forslag'].includes(s.status) ? wk : '');
}
const ovTip = s => !s || !s.status ? '' : OV_LABEL[s.status] + (ovCellText(s) && ovCellText(s) !== OV_LABEL[s.status] ? ': ' + ovCellText(s) : '');
const ovDone = s => ['klart', 'tidigare'].includes(s && s.status);

// Sortering: nyckel per person (lägre = först). ST-tid och % klart: störst först. Krav: klara (tidigast först), bokade, förslag, plan,
// saknas, ej gjort, borttaget ur planen.
const OV_RANK = { klart: 0, tidigare: 0, bokad: 1, forslag: 2, plan: 3, saknas: 4, ejgjort: 5, ej: 6 };
function ovSortKey(sort, pct) {
  if (sort === 'pct') return p => [-pct(p)];
  if (sort === 'st') return p => [p.stMonths == null ? Infinity : -p.stMonths];
  return p => { const s = _ov.data.cells[p.id]?.[sort] || {}; return [OV_RANK[s.status] ?? 7, s.week || '']; };
}
const ovCmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
const ovEnded = p => p.stEnd && p.stEnd <= _ov.data.today;
// Handledare ser sina adepter men ändrar inte (beslut 2026-11-05).
const ovCanEdit = userId => _ov.data.canEditAll || userId === _ov.data.me;

function drawOversikt(root) {
  const { data } = _ov;
  const mand = data.requirements.filter(r => r.mandatory);
  // Krav som tagits bort ur personens plan (status 'ej') räknas inte.
  const pct = p => { const m = mand.filter(r => data.cells[p.id][r.id]?.status !== 'ej'); return m.length ? Math.round(100 * m.filter(r => ovDone(data.cells[p.id][r.id])).length / m.length) : 0; };
  const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'sv');
  const key = ovSortKey(_ov.sort, pct);
  const people = data.people.filter(p => _ov.showEnded || !ovEnded(p))
    .sort((a, b) => _ov.sort === 'name' ? (_ov.desc ? -1 : 1) * byName(a, b) : (_ov.desc ? -1 : 1) * ovCmp(key(a), key(b)) || byName(a, b));
  const arrow = k => _ov.sort === k ? (_ov.desc ? ' ▴' : ' ▾') : '';
  const allReqs = data.requirements;
  // Kategorier i kravens sorteringsordning (Moras: Körkort, Kurs, Randning, Projekt — som arket), inte alfabetiskt.
  const catSort = c => Math.min(...allReqs.filter(r => r.category === c).map(r => r.sort));
  const cats = [...new Set(allReqs.map(r => r.category))].sort((a, b) => catSort(a) - catSort(b));
  if (_ov.cat === 'first' || (_ov.cat !== 'alla' && !cats.includes(_ov.cat))) _ov.cat = cats[0] || 'alla';
  const reqs = _ov.cat === 'alla' ? allReqs : allReqs.filter(r => r.category === _ov.cat);
  const byCat = cats.map(c => ({ c, rs: reqs.filter(r => r.category === c) })).filter(g => g.rs.length);
  const ordered = byCat.flatMap(g => g.rs);
  const endedCount = data.people.filter(ovEnded).length;

  const head1 = byCat.map(g => `<th colspan="${g.rs.length}" class="cat">${esc(g.c)}</th>`).join('');
  const head2 = ordered.map(r => `<th${_ov.sort === r.id ? ' class="sorted"' : ''}><button type="button" class="link-btn ov-sort" data-sort="${esc(r.id)}" title="${esc(r.name + (r.location ? ' (' + r.location + ')' : '') + (r.mandatory ? '' : ' — valfritt'))} — klicka för att sortera"><span class="vt">${esc(r.name)}${r.mandatory ? '' : '<sup>*</sup>'}${arrow(r.id)}</span></button></th>`).join('');
  const rows = people.map(p => {
    const yr = p.stMonths == null ? '' : `ST-år ${Math.floor(p.stMonths / 12) + 1} · mån ${p.stMonths}`;
    const cells = ordered.map(r => {
      const s = data.cells[p.id][r.id];
      const edit = ovCanEdit(p.id) && s.status !== 'ej';
      return `<td class="pc st-${s.status || 'none'}${edit ? ' edit' : ''}"${edit ? ` data-p="${esc(p.id)}" data-r="${esc(r.id)}" role="button" tabindex="0"` : ''} title="${esc(r.name + ' — ' + ovTip(s))}">${esc(_ov.compact ? ovCompact(s) : ovCellText(s))}</td>`;
    }).join('');
    const pc = pct(p);
    return `<tr><th class="pname${p.id === data.me ? ' me' : ''}"><a href="#/plan/${esc(p.id)}" title="Utbildningsplan">${esc(p.displayName)}</a><br><span class="muted" style="font-weight:normal;font-size:11px">${esc(yr)}${ovEnded(p) ? ' · ST klar' : ''}${ovPassedEnd(p, data.today)
      ? '<br><span style="color:var(--danger)" title="Beräknat ST-slut har passerats men inget ST-slut är angivet">passerat ST-slut</span>' : ''}</span></th>
      <td class="pct" title="${pc} % av de obligatoriska kraven klara"><span class="pbar sm"><span style="width:${pc}%"></span></span>${pc} %</td>${cells}</tr>`;
  }).join('');
  const done = ordered.map(r => {
    const n = people.filter(p => ['klart', 'tidigare'].includes(data.cells[p.id][r.id].status)).length;
    return `<td class="svc" title="${n} av ${people.length}">${n}</td>`;
  }).join('');

  root.innerHTML = `
    <div class="card">
      <h1 class="page" style="margin-top:0">Måluppfyllelse</h1>
      <div class="row" style="justify-content:space-between;gap:8px">
        <span class="muted" style="font-size:14px">Läget vecka ${isoWeek(data.thisMonday)}, ${esc(data.thisMonday.slice(0, 4))}. Klart = passerat i schemat eller angett för hand.</span>
        ${data.canEditAll && endedCount ? `<label class="row" style="gap:6px;font-weight:normal;margin:0"><input type="checkbox" ${_ov.showEnded ? 'checked' : ''} onchange="_ov.showEnded=this.checked;drawOversikt(el('view'))"> Visa avslutade ST (${endedCount})</label>` : ''}
      </div>
      <div class="row" style="gap:8px;margin:10px 0 2px">
        <div class="seg" id="ov-cat">${[['alla', 'Alla'], ...cats.map(c => [c, c])].map(([k, l]) => `<button type="button" data-c="${esc(k)}" class="${_ov.cat === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <div class="seg" id="ov-mode"><button type="button" data-m="1" class="${_ov.compact ? 'on' : ''}">Kompakt</button><button type="button" data-m="0" class="${_ov.compact ? '' : 'on'}">Detaljerad</button></div>
      </div>
      ${people.length && ordered.length ? `
      <div class="sch-scroll">
        <table class="sch prog${_ov.compact ? ' compact' : ''}">
          <thead><tr><th class="pname" rowspan="2"><button type="button" class="link-btn ov-sort" data-sort="name">ST-läkare${arrow('name')}</button>
            <button type="button" class="link-btn ov-sort" data-sort="st" title="Sortera på ST-tid (längst först)" style="font-weight:normal">ST-tid${arrow('st')}</button></th>
            <th rowspan="2" class="pct"><button type="button" class="link-btn ov-sort" data-sort="pct" title="Andel obligatoriska krav klara — klicka för att sortera">% klart${arrow('pct')}</button></th>${head1}</tr><tr>${head2}</tr></thead>
          <tbody>${rows}<tr class="svc-row"><th class="pname">Klara</th><td></td>${done}</tr></tbody>
        </table>
      </div>` : (ordered.length ? '<p class="muted">Inga ST-läkare att visa.</p>'
        : `<div class="empty"><p><strong>Inga krav än.</strong> Kraven är klinikens mall per ST-år — det ST-läkarna ska uppnå.</p>
          ${data.canEditAll ? '<a class="btn" href="#/st/krav" style="text-decoration:none">Lägg in krav</a>' : '<p class="hint">Studierektor lägger in dem.</p>'}</div>`)}
      <p style="margin:12px 0 0;line-height:2;font-size:13px">
        <span class="pchip st-klart">✓ Klart</span> <span class="pchip st-tidigare">✓ Tidigare</span> <span class="pchip st-bokad">◷ Bokad (vecka)</span>
        <span class="pchip st-forslag">? Förslag/Ev.</span> <span class="pchip st-plan">✎ Plan</span> <span class="pchip st-ejgjort">· Ej gjort</span> <span class="pchip st-saknas">! Saknas (försenat)</span>
        <span class="muted">* = valfritt · % klart = obligatoriska krav</span></p>
      <p class="hint">${data.canEditAll ? 'Tryck på en ruta för att se underlaget och ange Tidigare, Klart eller Plan.' : 'Tryck på en ruta för att se underlaget och ange Tidigare, Klart eller Plan för dig själv.'}</p>
    </div>`;

  el('ov-cat')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { _ov.cat = b.dataset.c; drawOversikt(el('view')); } });
  el('ov-mode')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    _ov.compact = b.dataset.m === '1'; try { localStorage.setItem('ov_compact', b.dataset.m); } catch {}
    drawOversikt(el('view'));
  });
  root.querySelectorAll('.ov-sort').forEach(b => b.addEventListener('click', () => {
    _ov.desc = _ov.sort === b.dataset.sort ? !_ov.desc : false;
    _ov.sort = b.dataset.sort; drawOversikt(el('view'));
  }));
  root.querySelectorAll('.pc.edit').forEach(td => {
    const open = () => { _ov.sheet = { userId: td.dataset.p, reqId: td.dataset.r }; drawOversiktSheet(); };
    td.addEventListener('click', open);
    td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  drawOversiktSheet();
}

function drawOversiktSheet() {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const s = _ov && _ov.sheet;
  if (!s) { root.innerHTML = ''; return; }
  const { data } = _ov;
  const p = data.people.find(x => x.id === s.userId), r = data.requirements.find(x => x.id === s.reqId);
  const cell = data.cells[s.userId][s.reqId];
  const acts = data.activities.filter(a => a.userId === s.userId && a.requirementId === s.reqId);
  const ach = data.achievements.find(a => a.userId === s.userId && a.requirementId === s.reqId);
  const list = acts.length
    ? acts.map(a => `<div class="pass-card"><span>${a.status === 'ev' ? 'Ev. ' : ''}${weekShort(a.weekFrom)}${a.weekTo !== a.weekFrom ? ' – ' + weekShort(a.weekTo) : ''}${a.detail ? ' · ' + esc(a.detail) : ''}</span></div>`).join('')
    : '<p class="muted" style="margin:0">Inga poster i veckoschemat för det här kravet.</p>';

  root.innerHTML = `
    <div class="overlay" data-os="close">
      <div class="sheet" role="dialog" aria-label="Krav">
        <h2>${esc(r.name)} <button class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-os="close" aria-label="Stäng">✕</button></h2>
        <p style="margin:0">${esc(p.displayName)} · ${esc(r.category)}${r.location ? ' · ' + esc(r.location) : ''}${r.mandatory ? '' : ' · valfritt'}</p>
        <p style="font-size:18px;margin:10px 0 0"><span class="pchip st-${cell.status || 'none'}">${esc(OV_LABEL[cell.status] || 'Inget')}</span> ${esc(ovCellText(cell) !== OV_LABEL[cell.status] ? ovCellText(cell) : '')}</p>
        <p class="hint">${cell.source === 'schema' ? 'Enligt veckoschemat.' : cell.source === 'manuell' ? 'Angett för hand.' : ''}</p>
        <h3>I veckoschemat</h3>${list}
        <h3>Ange för hand</h3>
        <p class="hint" style="margin-top:0">För det som inte syns i schemat: gjort före 2025 (Tidigare), klart på annat sätt, eller en lös plan. En avslutad post i schemat räknas alltid som klart.</p>
        <label for="os-status">Status</label>
        <select id="os-status">
          <option value="">– inget (bara schemat gäller) –</option>
          ${['tidigare', 'klart', 'plan'].map(v => `<option value="${v}"${ach && ach.status === v ? ' selected' : ''}>${OV_LABEL[v]}</option>`).join('')}
        </select>
        <label for="os-note">Anteckning (valfritt)</label>
        <input type="text" id="os-note" maxlength="120" value="${esc(ach ? ach.note || '' : '')}" placeholder="t.ex. höst 2027?">
        <button class="btn btn-block" data-os="save">Spara</button>
        <div id="os-err" class="status err"></div>
      </div>
    </div>`;
  root.querySelectorAll('[data-os]').forEach(n => n.addEventListener('click', onOversiktSheet));
}

async function onOversiktSheet(e) {
  const kind = e.currentTarget.dataset.os;
  if (kind === 'close') {
    if (e.target !== e.currentTarget) return;   // klick inne i dialogen bubblar hit
    _ov.sheet = null; drawOversiktSheet(); return;
  }
  e.stopPropagation();
  const s = _ov.sheet;
  try {
    await api('/achievements', { method: 'PUT', body: { userId: s.userId, requirementId: s.reqId, status: el('os-status').value || null, note: el('os-note').value } });
    _ov.sheet = null;
    await reloadOversikt();
  } catch (err) { const b = el('os-err'); if (b) b.textContent = err.message; }
}

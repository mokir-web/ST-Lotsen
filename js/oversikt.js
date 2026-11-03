// ── Måluppfyllelse (#/oversikt) ──────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), isoWeek(). Global entry: renderOversikt(root).
//
// Matrisen person × krav (ersätter flikarna "Översikt", "Randningsöversikt" och "Tidigare" i ST-plan.xlsx).
// Status räknas av servern (utils/progress.js): klart när schemaposten tidsmässigt passerats, annars bokad/förslag ur schemat,
// eller det som angetts för hand (Tidigare, Klart, Plan). Tryck på en ruta för att se underlaget och ändra det manuella.
// Studierektor och admin ser alla ST-läkare; en ST-läkare ser sin egen rad.

let _ov = null;

const OV_LABEL = { klart: 'Klart', tidigare: 'Tidigare', bokad: 'Bokad', forslag: 'Förslag', plan: 'Plan', saknas: 'Saknas' };
const weekShort = iso => `v${isoWeek(iso)} -${iso.slice(2, 4)}`;

async function renderOversikt(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [me, data] = await Promise.all([api('/me'), api('/progress')]);
    setMenuForUser(me);
    _ov = { me, data, showEnded: false, sheet: null };
    drawOversikt(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadOversikt() {
  _ov.data = await api('/progress');
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

const ovEnded = p => p.stEnd && p.stEnd <= _ov.data.today;
const ovCanEdit = userId => _ov.data.canEditAll || userId === _ov.data.me;

function drawOversikt(root) {
  const { data } = _ov;
  const people = data.people.filter(p => _ov.showEnded || !ovEnded(p));
  const reqs = data.requirements;
  // Kategorier i kravens sorteringsordning (Moras: Körkort, Kurs, Randning, Projekt — som arket), inte alfabetiskt.
  const catSort = c => Math.min(...reqs.filter(r => r.category === c).map(r => r.sort));
  const cats = [...new Set(reqs.map(r => r.category))].sort((a, b) => catSort(a) - catSort(b));
  const byCat = cats.map(c => ({ c, rs: reqs.filter(r => r.category === c) }));
  const ordered = byCat.flatMap(g => g.rs);
  const endedCount = data.people.filter(ovEnded).length;

  const head1 = byCat.map(g => `<th colspan="${g.rs.length}" class="cat">${esc(g.c)}</th>`).join('');
  const head2 = ordered.map(r => `<th title="${esc(r.name + (r.location ? ' (' + r.location + ')' : '') + (r.mandatory ? '' : ' — valfritt'))}">${esc(r.name)}${r.mandatory ? '' : '<sup>*</sup>'}</th>`).join('');
  const rows = people.map(p => {
    const yr = p.stMonths == null ? '' : `år ${Math.floor(p.stMonths / 12) + 1} · mån ${p.stMonths}`;
    const cells = ordered.map(r => {
      const s = data.cells[p.id][r.id];
      const edit = ovCanEdit(p.id);
      return `<td class="pc st-${s.status || 'none'}${edit ? ' edit' : ''}"${edit ? ` data-p="${esc(p.id)}" data-r="${esc(r.id)}" role="button" tabindex="0"` : ''} title="${esc(OV_LABEL[s.status] || '')}">${esc(ovCellText(s))}</td>`;
    }).join('');
    return `<tr><th class="pname${p.id === data.me ? ' me' : ''}">${esc(p.displayName)}<br><span class="muted" style="font-weight:normal;font-size:11px">${esc(yr)}${ovEnded(p) ? ' · ST klar' : ''}</span></th>${cells}</tr>`;
  }).join('');
  const done = ordered.map(r => {
    const n = people.filter(p => ['klart', 'tidigare'].includes(data.cells[p.id][r.id].status)).length;
    return `<td class="svc" title="${n} av ${people.length}">${n}</td>`;
  }).join('');

  root.innerHTML = `
    <div class="card">
      <h1 class="page" style="margin-top:0">Måluppfyllelse</h1>
      <div class="row" style="justify-content:space-between;gap:8px">
        <span class="muted" style="font-size:14px">Läget ${esc(weekShort(data.thisMonday))}. Klart = passerat i schemat eller angett för hand.</span>
        ${data.canEditAll && endedCount ? `<label class="row" style="gap:6px;font-weight:normal;margin:0"><input type="checkbox" ${_ov.showEnded ? 'checked' : ''} onchange="_ov.showEnded=this.checked;drawOversikt(el('view'))"> Visa avslutade ST (${endedCount})</label>` : ''}
      </div>
      ${people.length && ordered.length ? `
      <div class="sch-scroll">
        <table class="sch prog">
          <thead><tr><th class="pname" rowspan="2">ST-läkare</th>${head1}</tr><tr>${head2}</tr></thead>
          <tbody>${rows}<tr class="svc-row"><th class="pname">Klara</th>${done}</tr></tbody>
        </table>
      </div>` : `<p class="muted">${ordered.length ? 'Inga ST-läkare att visa.' : 'Inga krav än — lägg in dem under ST-inställningar.'}</p>`}
      <p style="margin:12px 0 0;line-height:2;font-size:13px">
        <span class="pchip st-klart">Klart</span> <span class="pchip st-tidigare">Tidigare</span> <span class="pchip st-bokad">Bokad</span>
        <span class="pchip st-forslag">Förslag (Ev.)</span> <span class="pchip st-plan">Plan</span> <span class="pchip st-saknas">Saknas</span>
        <span class="muted">* = valfritt</span></p>
      <p class="hint">${data.canEditAll ? 'Tryck på en ruta för att se underlaget och ange Tidigare, Klart eller Plan.' : 'Tryck på en ruta för att se underlaget och ange Tidigare, Klart eller Plan för dig själv.'}</p>
    </div>`;

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

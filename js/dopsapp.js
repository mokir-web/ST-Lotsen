// ── DOPS-modulen: Översikt, Mina bedömningar, Kliniken (#/dops, #/dops/mina, #/dops/kliniken) ──
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), toast(). Globala entréer: renderDopsOverview,
// renderDopsMine, renderDopsClinic. Progress ligger i js/dops.js.
//
// Sidorna motsvarar DOPS-appens Min översikt, Mina bedömningar och Klinikens bedömningar (dops/js/overview.js, my-assessments.js,
// clinic-assessments.js i DOPS-appen) och läser samma data via DOPS-appens kopierade backend under /dops/app — samma regler.
// Det som skriver (dölja formulärtyp, ta bort bedömning) är låst tills skrivrätt ges: servern svarar 423 och det visas som besked.

let _dme = null;   // det kopplade DOPS-kontot (/dops/app/me), hämtas en gång per sidvisning
const dopsApi = (path, opts) => api('/dops/app' + path, opts);
const dopsPriv = me => (me.privileges || []).some(p => p.privilege === 'Studierektor' || p.privilege === 'Administratör');

async function dopsStart(root, title) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  const [me, dme] = await Promise.all([api('/me'), dopsApi('/me')]);
  setMenuForUser(me);
  _dme = dme;
  dopsNav(dme);
  return me;
}
// Undersidor som beror på behörigheten i DOPS (Studierektor/Administratör).
function dopsNav(dme) {
  el('nav-dops-registrera')?.classList.toggle('hidden', dme.userRole === 'Mottagare');
  el('nav-dops-kliniken')?.classList.toggle('hidden', !dopsPriv(dme));
  el('nav-dops-statistik')?.classList.toggle('hidden', !dopsPriv(dme));
  el('nav-dops-installningar')?.classList.toggle('hidden', !dopsPriv(dme));
  el('nav-dops-dokument')?.classList.toggle('hidden', !(dme.privileges || []).some(p => p.privilege === 'Administratör'));
}
const dopsFail = (root, title, err) => { root.innerHTML = `<h1 class="page">${title}</h1><p class="err">${esc(err.message)}</p>`; };
// Låst (423) och andra fel visas som besked; inget ändras.
async function dopsWrite(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (err) { toast(err.message, 'err'); return false; }
}

// ── Översikt ──────────────────────────────────────────────────────────────
// Mål per formulärtyp och roll (klinikens målvärden gäller per 6 månader och skalas med vald period), tidsbesparing och
// en stapelgraf per riktning. Registrerade visas för Registrerare/Blandbild, mottagna för Mottagare/Blandbild (som DOPS-appen).
const DOPS_PERIODS = [['1 vecka', 7], ['1 månad', 30], ['3 månader', 90], ['6 månader', 180], ['1 år', 365], ['Allt', 0]];
let _dov = null;

async function renderDopsOverview(root) {
  try {
    await dopsStart(root);
    _dov = { data: await dopsApi('/overview'), days: _dov?.days ?? 180 };
    drawDopsOverview(root);
  } catch (err) { dopsFail(root, 'Översikt', err); }
}

const dayKey = d => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
function dovStart(days, byDay) {
  if (days) { const d = new Date(); d.setDate(d.getDate() - days); return dayKey(d); }
  return Object.keys(byDay || {}).sort()[0] || '0000-00-00';
}
// Antal per formulärtyp sedan startdagen, ur byDay(Rec|Sent)Ft.
function dovCounts(byDayFt, start) {
  const out = {};
  for (const [day, m] of Object.entries(byDayFt || {})) if (day >= start) for (const [ft, n] of Object.entries(m)) if (ft !== 'label') out[ft] = (out[ft] || 0) + n;
  return out;
}
const goalColor = (n, g) => n >= g ? 'var(--ok, #4a9e62)' : n > 0 ? '#d9a441' : '#c0392b';

function drawDopsOverview(root) {
  const { data, days } = _dov;
  const role = _dme.userRole;
  const showSent = role === 'Registrerare' || role === 'Blandbild', showRec = role === 'Mottagare' || role === 'Blandbild';
  const start = dovStart(days, data.byDay);
  const nM = days === 0 ? -1 : days === 180 ? 0 : Math.max(1, Math.ceil(days / 30));
  const periodLabel = nM === -1 ? 'totalt' : nM === 0 ? 'senaste 6 mån' : nM <= 1 ? 'senaste månaden' : `senaste ${nM} mån`;
  const scale = g => (nM === 0 || nM === -1) ? g : Math.round(g * nM / 6);
  const hidden = { received: new Set(data.hiddenFormTypes?.received || []), sent: new Set(data.hiddenFormTypes?.sent || []) };
  const saved = data.totalMinutesSaved || 0;
  // Samma färg för en formulärtyp i båda graferna.
  const allFt = [...new Set([...Object.keys(data.received), ...Object.keys(data.sent)])].sort((a, b) => a.localeCompare(b, 'sv'));
  const colorOf = t => DOV_COLORS[Math.max(0, allFt.indexOf(t)) % DOV_COLORS.length];

  const group = (title, forms, counts, dir, goalOf) => {
    const entries = Object.entries(forms);
    if (!entries.length) return '';
    const vis = entries.filter(([ft]) => !hidden[dir].has(ft)), hid = entries.filter(([ft]) => hidden[dir].has(ft));
    const isDops = ft => ft.startsWith('DOPS:') || ft.startsWith('DOPS ');
    const row = ([ft, v]) => {
      const n = counts[ft] || 0, g = scale(goalOf(v));
      return `<div class="dov-row">
        <span class="dov-name">${esc(isDops(ft) ? ft.replace(/^DOPS:?\s*/, '') : ft)}</span>
        <span class="dov-bar">${g ? `<span class="dov-track"><i style="width:${Math.min(100, Math.round(n / g * 100))}%;background:${goalColor(n, g)}"></i></span><small class="muted">${n} / ${g} ${periodLabel}${n >= g ? ' ✓' : ''}</small>` : ''}</span>
        <strong class="dov-n" style="color:${g ? goalColor(n, g) : 'inherit'}">${n}</strong>
        ${g ? `<button class="link-btn" data-hide="${esc(ft)}" data-dir="${dir}">Ej aktuellt</button>` : '<span></span>'}
      </div>`;
    };
    const dopsRows = vis.filter(([ft]) => isDops(ft)).sort((a, b) => a[0].localeCompare(b[0], 'sv'));
    const other = vis.filter(([ft]) => !isDops(ft) && ft !== 'Operationsspecifik DOPS').sort((a, b) => a[0].localeCompare(b[0], 'sv'));
    return `<div class="card"><h2 style="margin-top:0">${title}</h2>
      ${dopsRows.length ? `<div class="dov-sub">DOPS</div>${dopsRows.map(row).join('')}` : ''}
      ${dopsRows.length && other.length ? '<hr class="dov-hr">' : ''}
      ${other.map(row).join('')}
      ${hid.length ? `<details class="dov-hidden"><summary class="muted">Ej aktuella (${hid.length})</summary>${hid.map(([ft]) =>
        `<div class="dov-row"><span class="dov-name muted">${esc(ft)}</span><span></span><span></span><button class="link-btn" data-show="${esc(ft)}" data-dir="${dir}">Återställ</button></div>`).join('')}</details>` : ''}
    </div>`;
  };

  root.innerHTML = `
    <h1 class="page">Översikt</h1>
    <p class="hint" style="margin:-4px 0 14px">Formulär med mål satt av kliniken visas med en stapel. Målet gäller per 6 månader och skalas med vald period. Grönt = uppnått, gult = delvis, rött = inget än.</p>
    <div class="seg" id="dov-period" style="margin-bottom:12px;flex-wrap:wrap">${DOPS_PERIODS.map(([l, d]) => `<button type="button" data-d="${d}" class="${d === days ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${saved > 0 && showSent ? `<div class="card dov-saved"><small>TOTALT SPARAT MED DOPS</small><strong>${saved >= 60 ? Math.floor(saved / 60) + ' tim ' : ''}${saved % 60} min</strong></div>` : ''}
    ${showRec ? dovChart('Mottagna bedömningar', data.byDayRecFt, start, colorOf) : ''}
    ${showSent ? dovChart('Registrerade bedömningar', data.byDaySentFt, start, colorOf) : ''}
    ${showRec ? group('Mottagna bedömningar', data.received, dovCounts(data.byDayRecFt, start), 'received', v => v.goal || 0) : ''}
    ${showSent ? group('Registrerade bedömningar', data.sent, dovCounts(data.byDaySentFt, start), 'sent', v => v.sentGoal || 0) : ''}
    ${!Object.keys(data.received).length && !Object.keys(data.sent).length ? '<div class="card"><p class="muted" style="margin:0">Inga bedömningar än.</p></div>' : ''}`;

  el('dov-period').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { _dov.days = +b.dataset.d; drawDopsOverview(root); } });
  root.querySelectorAll('[data-hide],[data-show]').forEach(b => b.onclick = async () => {
    const hide = !!b.dataset.hide;
    if (await dopsWrite(() => dopsApi('/overview/hidden-form-types', { method: 'PUT', body: { formType: b.dataset.hide || b.dataset.show, hidden: hide, direction: b.dataset.dir } }))) {
      renderDopsOverview(root);
    }
  });
}

// Staplad stapelgraf (SVG) per vecka (≤ 3 mån) eller månad, en färg per formulärtyp.
const DOV_COLORS = ['#b5641a', '#4f8fc0', '#5aa58c', '#8e6bbf', '#d9a441', '#c0392b', '#3d4f5c', '#e8a0a8', '#7fb069', '#a3c4dc'];
function dovChart(title, byDayFt, start, colorOf) {
  const days = Object.entries(byDayFt || {}).filter(([d]) => d >= start);
  if (!days.length) return '';
  const span = (Date.now() - new Date(start + 'T00:00:00').getTime()) / 864e5;
  const weekly = span <= 100;
  const bucketOf = d => {
    if (!weekly) return d.slice(0, 7);
    const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return dayKey(t);
  };
  const buckets = new Map(), types = new Set();
  for (const [d, m] of days) {
    const k = bucketOf(d);
    if (!buckets.has(k)) buckets.set(k, {});
    for (const [ft, n] of Object.entries(m)) if (ft !== 'label') { buckets.get(k)[ft] = (buckets.get(k)[ft] || 0) + n; types.add(ft); }
  }
  // Tomma perioder däremellan, så att tidsaxeln inte hoppar.
  const keys = [];
  const first = bucketOf(start);
  for (let t = new Date(first + (weekly ? 'T12:00:00' : '-01T12:00:00')); dayKey(t) <= dayKey(new Date()); weekly ? t.setDate(t.getDate() + 7) : t.setMonth(t.getMonth() + 1)) {
    keys.push(weekly ? dayKey(t) : dayKey(t).slice(0, 7));
  }
  const ft = [...types].sort((a, b) => a.localeCompare(b, 'sv'));
  const totals = keys.map(k => Object.values(buckets.get(k) || {}).reduce((s, n) => s + n, 0));
  const max = Math.max(1, ...totals);
  const W = 600, H = 180, P = 22, bw = (W - P) / keys.length;
  const bars = keys.map((k, i) => {
    let y = H - P;
    return ft.map((t, j) => {
      const n = buckets.get(k)?.[t] || 0; if (!n) return '';
      const h = n / max * (H - P - 8); y -= h;
      return `<rect x="${(P + i * bw + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="${colorOf(t)}"><title>${esc(k)} · ${esc(t)}: ${n}</title></rect>`;
    }).join('');
  }).join('');
  const step = Math.ceil(keys.length / 8);
  const labels = keys.map((k, i) => i % step ? '' : `<text x="${(P + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="dov-ax" text-anchor="middle">${weekly ? 'v' + isoWeek(k) : k.slice(2)}</text>`).join('');
  return `<div class="card"><h2 style="margin-top:0">${title}</h2>
    <svg viewBox="0 0 ${W} ${H}" class="bed-svg" role="img" aria-label="${title} per ${weekly ? 'vecka' : 'månad'}">
      <line x1="${P}" x2="${W}" y1="${H - P}" y2="${H - P}" class="bed-avgline"/>
      <text x="2" y="12" class="dov-ax">${max}</text>${bars}${labels}</svg>
    <div class="dov-legend">${ft.map(t => `<span><i style="background:${colorOf(t)}"></i>${esc(t)}</span>`).join('')}</div>
  </div>`;
}

// ── Mina bedömningar ──────────────────────────────────────────────────────
// Mottagna och skickade, filter på datum och formulärtyp. Ta bort egen skickad bedömning är låst tills skrivrätt ges.
let _dmi = null;

async function renderDopsMine(root) {
  try {
    await dopsStart(root);
    const role = _dme.userRole;
    const tabs = [role !== 'Registrerare' && 'received', role !== 'Mottagare' && 'sent'].filter(Boolean);
    _dmi = { tab: tabs.includes(_dmi?.tab) ? _dmi.tab : tabs[0], tabs, from: '', to: '', types: new Set(), list: [], showFilter: false };
    await loadDopsMine(root);
  } catch (err) { dopsFail(root, 'Mina bedömningar', err); }
}

async function loadDopsMine(root) {
  const q = new URLSearchParams({ role: _dmi.tab, dateFrom: _dmi.from, dateTo: _dmi.to, formTypes: [..._dmi.types].join(',') });
  _dmi.list = await dopsApi('/assessments/mine?' + q);
  if (!_dmi.allTypes || !_dmi.types.size) _dmi.allTypes = [...new Set(_dmi.list.map(a => a.formType))].sort((a, b) => a.localeCompare(b, 'sv'));
  drawDopsMine(root);
}

// DOPS-appen skriver personer som "Namn -- Klinik".
const dopsWho = s => String(s || '').replace(' -- ', ', ');
function dopsAssessmentCard(a, counterpart, extra = '') {
  const bySec = [];
  for (const x of a.answers || []) {
    if (!String(x.answer || '').trim()) continue;
    let s = bySec.find(b => b.section === (x.section || ''));
    if (!s) bySec.push(s = { section: x.section || '', rows: [] });
    s.rows.push(x);
  }
  return `<details class="bed-one"><summary><input type="checkbox" class="dsel" value="${esc(a.id)}" onclick="event.stopPropagation()" aria-label="Markera för export"> <strong>${esc(a.timestamp.slice(0, 10))}</strong> ${esc(a.formType)} <span class="muted">· ${esc(counterpart)}${a.category ? ' · ' + esc(a.category) : ''}</span>${a.isAiDemo ? ' <span class="chip" style="font-size:11px;padding:0 7px">AI-demo</span>' : ''}</summary>
    ${bySec.map(s => `${s.section ? `<div class="bed-q">${esc(s.section)}</div>` : ''}<table class="bed-ans">${s.rows.map(x => `<tr><th>${esc(x.question)}</th><td>${esc(x.answer)}</td></tr>`).join('')}</table>`).join('')}
    ${extra}</details>`;
}

// Markera alla + Word-export, under filtret i Mina bedömningar och Kliniken.
const dopsExportRow = n => n ? `<div class="row" style="gap:10px;margin-bottom:10px;flex-wrap:wrap">
    <label style="margin:0;font-weight:normal"><input type="checkbox" id="dsel-all"> Markera alla</label>
    <button class="btn-ghost" id="dsel-export">Exportera till Word</button></div>` : '';
function wireDopsExport(root, info) {
  el('dsel-all')?.addEventListener('change', e => root.querySelectorAll('.dsel').forEach(c => { c.checked = e.target.checked; }));
  if (el('dsel-export')) el('dsel-export').onclick = () => dopsExportDocx([...root.querySelectorAll('.dsel:checked')].map(c => c.value), info());
}

function drawDopsMine(root) {
  const d = _dmi;
  const label = { received: 'Mottagna', sent: 'Skickade' };
  root.innerHTML = `
    <h1 class="page">Mina bedömningar</h1>
    <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
      ${d.tabs.length > 1 ? `<div class="seg" id="dmi-tab">${d.tabs.map(t => `<button type="button" data-t="${t}" class="${t === d.tab ? 'on' : ''}">${label[t]}</button>`).join('')}</div>` : ''}
      <button class="btn-ghost" id="dmi-ftoggle">${d.showFilter ? 'Dölj filter' : 'Filtrera'}</button>
      <span class="muted">${d.list.length} st</span>
    </div>
    ${dopsExportRow(d.list.length)}
    <div class="card${d.showFilter ? '' : ' hidden'}" id="dmi-filter">
      <div class="field-row"><div><label for="dmi-from" style="margin-top:0">Från</label><input type="date" id="dmi-from" value="${esc(d.from)}"></div>
        <div><label for="dmi-to" style="margin-top:0">Till</label><input type="date" id="dmi-to" value="${esc(d.to)}"></div></div>
      <label>Formulärtyp</label>
      <div class="dmi-types">${(d.allTypes || []).map(t => `<label class="chip"><input type="checkbox" value="${esc(t)}"${d.types.has(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" id="dmi-apply">Sök</button><button class="btn-ghost" id="dmi-reset">Återställ</button></div>
    </div>
    <div class="card">${d.list.length ? d.list.map(a => dopsAssessmentCard(a, d.tab === 'sent' ? 'till ' + dopsWho(a.recipient) : 'från ' + dopsWho(a.registrar),
      d.tab === 'sent' ? `<div class="row" style="margin-top:8px"><button class="btn-ghost" data-del="${esc(a.id)}">Ta bort bedömningen</button></div>` : '')).join('')
      : '<p class="muted" style="margin:0">Inga bedömningar.</p>'}</div>`;

  el('dmi-tab')?.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { d.tab = b.dataset.t; d.types.clear(); d.allTypes = null; loadDopsMine(root); } });
  el('dmi-ftoggle').onclick = () => { d.showFilter = !d.showFilter; drawDopsMine(root); };
  wireDopsExport(root, () => ({ name: `${_dme.firstName} ${_dme.lastName}`.trim() + (d.tab === 'sent' ? ' (skickade)' : ' (mottagna)'), clinic: _dme.clinic, period: dopsPeriod(d.from, d.to) }));
  el('dmi-apply').onclick = () => {
    d.from = el('dmi-from').value; d.to = el('dmi-to').value;
    d.types = new Set([...root.querySelectorAll('.dmi-types input:checked')].map(c => c.value));
    loadDopsMine(root);
  };
  el('dmi-reset').onclick = () => { d.from = d.to = ''; d.types.clear(); d.allTypes = null; loadDopsMine(root); };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Ta bort bedömningen? Det går inte att ångra.')) return;
    if (await dopsWrite(() => dopsApi('/assessments/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }), 'Bedömningen är borttagen.')) loadDopsMine(root);
  });
}

// ── Kliniken ──────────────────────────────────────────────────────────────
// Klinikens bedömningar för Studierektor/Administratör (DOPS-appens privileges). Filter: datum, mottagarkategori, mottagare
// (namn) och formulärtyp. Global Administratör väljer klinik.
let _dco = null;

async function renderDopsClinic(root) {
  try {
    await dopsStart(root);
    if (!dopsPriv(_dme)) { root.innerHTML = '<h1 class="page">Kliniken</h1><p class="muted">Kräver Studierektor eller Administratör i DOPS.</p>'; return; }
    const clinics = _dme.privileges.filter(p => ['Studierektor', 'Administratör'].includes(p.privilege)).map(p => p.klinikId);
    const ref = await dopsApi('/reference-data?clinicId=' + encodeURIComponent(_dme.klinikId));
    _dco = { klinik: _dco?.klinik || _dme.klinikId, global: clinics.includes('*'), clinicIds: ref.clinicIdMap || {},
      from: '', to: '', category: '', recipient: '', types: new Set(), list: [], showFilter: false };
    await loadDopsClinic(root);
  } catch (err) { dopsFail(root, 'Kliniken', err); }
}

async function loadDopsClinic(root) {
  const d = _dco;
  const q = new URLSearchParams({ dateFrom: d.from, dateTo: d.to, category: d.category, recipient: d.recipient, formTypes: [...d.types].join(',') });
  d.list = await dopsApi('/clinics/' + encodeURIComponent(d.klinik) + '/assessments?' + q);
  if (!d.allTypes || !d.types.size) d.allTypes = [...new Set(d.list.map(a => a.formType))].sort((a, b) => a.localeCompare(b, 'sv'));
  if (!d.categories) d.categories = [...new Set(d.list.map(a => a.category).filter(Boolean))].sort();
  drawDopsClinic(root);
}

function drawDopsClinic(root) {
  const d = _dco;
  const clinicOpts = Object.entries(d.clinicIds).sort((a, b) => a[0].localeCompare(b[0], 'sv'));
  root.innerHTML = `
    <h1 class="page">Klinikens bedömningar</h1>
    ${d.global && clinicOpts.length ? `<div class="card"><label for="dco-klinik" style="margin-top:0">Klinik</label>
      <select id="dco-klinik" style="max-width:320px">${clinicOpts.map(([n, id]) => `<option value="${esc(id)}"${id === d.klinik ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
    <div class="row" style="gap:8px;margin-bottom:12px"><button class="btn-ghost" id="dco-ftoggle">${d.showFilter ? 'Dölj filter' : 'Filtrera'}</button><span class="muted">${d.list.length} st</span></div>
    ${dopsExportRow(d.list.length)}
    <div class="card${d.showFilter ? '' : ' hidden'}">
      <div class="field-row"><div><label for="dco-from" style="margin-top:0">Från</label><input type="date" id="dco-from" value="${esc(d.from)}"></div>
        <div><label for="dco-to" style="margin-top:0">Till</label><input type="date" id="dco-to" value="${esc(d.to)}"></div></div>
      <div class="field-row"><div><label for="dco-cat">Mottagarkategori</label><select id="dco-cat"><option value="">Alla</option>${(d.categories || []).map(c => `<option${c === d.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label for="dco-rec">Mottagare (namn)</label><input type="text" id="dco-rec" value="${esc(d.recipient)}"></div></div>
      <label>Formulärtyp</label>
      <div class="dmi-types">${(d.allTypes || []).map(t => `<label class="chip"><input type="checkbox" value="${esc(t)}"${d.types.has(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" id="dco-apply">Sök</button><button class="btn-ghost" id="dco-reset">Återställ</button></div>
    </div>
    <div class="card">${d.list.length ? d.list.map(a => dopsAssessmentCard(a, `${dopsWho(a.registrar)} → ${dopsWho(a.recipient)}`)).join('') : '<p class="muted" style="margin:0">Inga bedömningar.</p>'}</div>`;

  el('dco-klinik')?.addEventListener('change', e => { d.klinik = e.target.value; d.types.clear(); d.allTypes = null; d.categories = null; loadDopsClinic(root); });
  el('dco-ftoggle').onclick = () => { d.showFilter = !d.showFilter; drawDopsClinic(root); };
  wireDopsExport(root, () => ({ name: d.recipient || 'Klinikens bedömningar', clinic: Object.entries(d.clinicIds).find(([, id]) => id === d.klinik)?.[0] || _dme.clinic, period: dopsPeriod(d.from, d.to) }));
  el('dco-apply').onclick = () => {
    d.from = el('dco-from').value; d.to = el('dco-to').value; d.category = el('dco-cat').value; d.recipient = el('dco-rec').value.trim();
    d.types = new Set([...root.querySelectorAll('.dmi-types input:checked')].map(c => c.value));
    loadDopsClinic(root);
  };
  el('dco-reset').onclick = () => { Object.assign(d, { from: '', to: '', category: '', recipient: '' }); d.types.clear(); d.allTypes = null; loadDopsClinic(root); };
}

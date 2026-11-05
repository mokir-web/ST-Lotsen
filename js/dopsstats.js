// ── DOPS-modulen: Statistik, Tävling, Dokument och Word-export (#/dops/statistik, #/dops/tavling, #/dops/dokument) ──
// Klassiskt script. Beror på index.html och js/dopsapp.js (dopsStart, dopsApi, dopsPriv, dopsFail, dopsWrite, dovChart, DOV_COLORS).
//
// Motsvarar DOPS-appens Klinikens statistik + Förfrågningsöversikt (statistics.js, request-stats.js), Kvartalstävling
// (competition.js) och Dokument (documents.js), med samma data via DOPS-appens backend under /dops/app. Statistik och
// förfrågningar: Studierektor/Administratör. Tävling: alla på kliniken ser ställningen; starta/avsluta omgång är låst.
// Dokument: Administratör. Word-exporten laddas ner i stället för att mejlas.

const dopsMin = m => m >= 60 ? `${Math.floor(m / 60)} tim ${m % 60} min` : `${m} min`;
const dopsDur = s => { s = Math.round(s); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
const dopsAdmin = me => (me.privileges || []).some(p => p.privilege === 'Administratör');
const dopsPrivClinics = me => (me.privileges || []).filter(p => ['Studierektor', 'Administratör'].includes(p.privilege)).map(p => p.klinikId);

// Klinikväljare för global behörighet ('*'), annars den egna kliniken.
async function dopsClinicChoice(state) {
  if (!dopsPrivClinics(_dme).includes('*')) return '';
  const ref = await dopsApi('/reference-data?clinicId=' + encodeURIComponent(_dme.klinikId));
  const opts = Object.entries(ref.clinicIdMap || {}).sort((a, b) => a[0].localeCompare(b[0], 'sv'));
  return `<div class="card"><label for="dst-klinik" style="margin-top:0">Klinik</label>
    <select id="dst-klinik" style="max-width:320px">${opts.map(([n, id]) => `<option value="${esc(id)}"${id === state.klinik ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
}

// ── Statistik ─────────────────────────────────────────────────────────────
let _dst = null;

async function renderDopsStats(root) {
  try {
    await dopsStart(root);
    if (!dopsPriv(_dme)) { root.innerHTML = '<h1 class="page">Statistik</h1><p class="muted">Kräver Studierektor eller Administratör i DOPS.</p>'; return; }
    _dst = { klinik: _dst?.klinik || _dme.klinikId, from: '', to: '', types: new Set(), showFilter: false, idleWeeks: 8, idleSpec: false };
    await loadDopsStats(root);
  } catch (err) { dopsFail(root, 'Statistik', err); }
}

async function loadDopsStats(root) {
  const d = _dst;
  const q = new URLSearchParams({ clinicId: d.klinik, dateFrom: d.from, dateTo: d.to });
  [d.stats, d.trainees, d.requests, d.choice] = await Promise.all([
    dopsApi('/statistics?' + q), dopsApi('/statistics/trainees?' + q).catch(() => null),
    dopsApi('/requests/stats?clinicId=' + encodeURIComponent(d.klinik)).catch(() => null), dopsClinicChoice(d)
  ]);
  drawDopsStats(root);
}

function drawDopsStats(root) {
  const d = _dst, s = d.stats;
  const allFt = Object.keys(s.byFormType || {}).sort((a, b) => a.localeCompare(b, 'sv'));
  const colorOf = t => DOV_COLORS[Math.max(0, allFt.indexOf(t)) % DOV_COLORS.length];
  const on = ft => !d.types.size || d.types.has(ft);
  // Filtrera formulärtyper i klienten, som DOPS-appen.
  const byDay = {};
  for (const [day, m] of Object.entries(s.byFormTypeByDay || {})) {
    byDay[day] = { label: m.label };
    for (const [ft, n] of Object.entries(m)) if (ft !== 'label' && on(ft)) byDay[day][ft] = n;
  }
  const start = d.from || Object.keys(byDay).sort()[0] || dayKey(new Date());
  const dist = allFt.filter(on).map(ft => [ft, s.byFormType[ft]]).sort((a, b) => b[1] - a[1]);
  const distMax = Math.max(1, ...dist.map(x => x[1]));
  const people = (title, by, forms) => {
    const top = Object.entries(by || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return '';
    const max = Math.max(...top.map(x => x[1]));
    return `<div class="card"><h2 style="margin-top:0">${title}</h2>${top.map(([name, n]) => `<div class="bed-bar dst-bar"><span>${esc(name)}</span>
      <div class="dst-stack" style="width:${(n / max * 100).toFixed(0)}%">${Object.entries(forms?.[name] || {}).filter(([ft]) => on(ft)).map(([ft, c]) =>
        `<i style="flex:${c};background:${colorOf(ft)}" title="${esc(ft)}: ${c}"></i>`).join('')}</div><span>${n}</span></div>`).join('')}</div>`;
  };
  const time = Object.entries(s.timeByFormType || {}).filter(([ft]) => on(ft)).sort((a, b) => b[1].count - a[1].count);
  const fb = Object.entries(s.feedbackByFormType || {}).filter(([ft]) => on(ft)).sort((a, b) => b[1].assessments - a[1].assessments);
  const t = d.trainees, r = d.requests;
  const who = p => `${esc(p.name)} <span class="muted">(${esc(p.jobRole || '–')})</span>`;
  const idle = t ? t.lastReceived.filter(p => (d.idleSpec || p.jobRole !== 'Spec') && (p.daysSince === null || p.daysSince >= d.idleWeeks * 7)) : [];

  root.innerHTML = `
    <h1 class="page">Statistik</h1>
    ${d.choice}
    <div class="row" style="gap:8px;margin-bottom:12px"><button class="btn-ghost" id="dst-ftoggle">${d.showFilter ? 'Dölj filter' : 'Filtrera'}</button>
      <span class="muted">${d.from || d.to ? `${esc(d.from || '…')} – ${esc(d.to || 'idag')}` : 'Hela perioden'}</span></div>
    <div class="card${d.showFilter ? '' : ' hidden'}">
      <div class="field-row"><div><label for="dst-from" style="margin-top:0">Från</label><input type="date" id="dst-from" value="${esc(d.from)}"></div>
        <div><label for="dst-to" style="margin-top:0">Till</label><input type="date" id="dst-to" value="${esc(d.to)}"></div></div>
      <label>Formulärtyper (tomt = alla)</label>
      <div class="dmi-types">${allFt.map(ft => `<label class="chip"><input type="checkbox" value="${esc(ft)}"${d.types.has(ft) ? ' checked' : ''}> ${esc(ft)}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" id="dst-apply">Visa statistik</button><button class="btn-ghost" id="dst-reset">Återställ</button></div>
    </div>
    <div class="card dov-saved"><small>TOTALT ANTAL BEDÖMNINGAR</small><strong>${dist.reduce((n, x) => n + x[1], 0)}</strong></div>
    ${dovChart('Bedömningar över tid', byDay, start, colorOf)}
    ${dist.length ? `<div class="card"><h2 style="margin-top:0">Fördelning per formulärtyp</h2>${dist.map(([ft, n]) =>
      `<div class="bed-bar dst-bar"><span>${esc(ft)}</span><div><i style="width:${(n / distMax * 100).toFixed(0)}%;background:${colorOf(ft)}"></i></div><span>${n}</span></div>`).join('')}</div>` : ''}
    ${time.length ? `<div class="card"><h2 style="margin-top:0">Tidsåtgång och sparad tid</h2>
      <p style="margin-top:0">Sparad tid jämfört med pappersblankett: <strong>${dopsMin(time.reduce((n, [, v]) => n + v.savedMinutes, 0))}</strong>${(() => { const tc = time.reduce((n, [, v]) => n + v.timedCount, 0); return tc ? ` · snittid per bedömning <strong>${dopsDur(time.reduce((n, [, v]) => n + v.elapsedSeconds, 0) / tc)}</strong>` : ''; })()}</p>
      <table class="bed-ans dst-table"><tr><th>Formulär</th><th>Antal</th><th>Snittid</th><th>Sparad tid</th></tr>${time.map(([ft, v]) =>
        `<tr><td>${esc(ft)}</td><td>${v.count}</td><td>${v.timedCount ? dopsDur(v.elapsedSeconds / v.timedCount) : '–'}</td><td><strong>${dopsMin(v.savedMinutes)}</strong></td></tr>`).join('')}</table>
      <p class="hint">Sparad tid = antal × formulärets referenstid. Snittiden räknar bara mätningar mellan 10 s och 60 min.</p></div>` : ''}
    ${fb.length ? `<div class="card"><h2 style="margin-top:0">Återkoppling i fritext</h2>
      <table class="bed-ans dst-table"><tr><th>Formulär</th><th>Med fritext</th><th>Snittlängd</th></tr>${fb.map(([ft, v]) => { const pct = v.assessments ? Math.round(v.withText / v.assessments * 100) : 0;
        return `<tr><td>${esc(ft)}</td><td><strong style="color:${pct >= 80 ? '#2f7d47' : pct >= 50 ? '#9a6b12' : '#9e2a18'}">${pct} %</strong> <span class="muted">(${v.withText} av ${v.assessments})</span></td><td>${v.withText ? v.avgChars + ' tecken' : '–'}</td></tr>`; }).join('')}</table></div>` : ''}
    ${t ? `<div class="card"><h2 style="margin-top:0">Måluppfyllelse — senaste 6 månaderna</h2>
      ${!t.targets.length ? '<p class="muted">Inga målvärden satta för kliniken.</p>' : `<p class="hint" style="margin-top:0">Mottagna bedömningar mot klinikens mål per yrkesroll, lägst först. Formulär personen markerat "Ej aktuellt" räknas inte.</p>
      ${t.targets.map(p => { const c = p.pct >= 100 ? '#4a9e62' : p.pct >= 50 ? '#c8a96e' : '#9e2a18';
        return `<div class="bed-free"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><strong>${who(p)}</strong><span>${p.met} av ${p.total} mål · <strong style="color:${c}">${p.pct} %</strong></span></div>
          <span class="dov-track" style="margin:6px 0"><i style="width:${Math.min(100, p.pct)}%;background:${c}"></i></span>
          <small>${p.forms.map(f => `<span style="white-space:nowrap;color:${f.count >= f.goal ? '#2f7d47' : 'inherit'}">${esc(f.formType)} ${f.count}/${f.goal}</span>`).join(' · ')}</small></div>`; }).join('')}`}
    </div>
    <div class="card"><h2 style="margin-top:0">Utan mottagen bedömning</h2>
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:6px">Ingen bedömning på minst
        <select id="dst-idle" style="width:auto">${[4, 8, 12, 26].map(w => `<option value="${w}"${w === d.idleWeeks ? ' selected' : ''}>${w} veckor</option>`).join('')}</select>
        <label style="margin:0;font-weight:normal"><input type="checkbox" id="dst-spec"${d.idleSpec ? ' checked' : ''}> Visa även specialister</label></div>
      ${idle.length ? `<table class="bed-ans">${idle.map(p => `<tr><th>${who(p)}</th><td>${p.lastAt ? `senast ${esc(p.lastAt)} (${p.daysSince} dagar sedan)` : 'aldrig'}</td></tr>`).join('')}</table>`
        : '<p style="color:#2f7d47;margin:0">Alla har fått minst en bedömning under perioden.</p>'}
    </div>
    <div class="card"><h2 style="margin-top:0">Spridning av bedömare</h2>
      ${t.spread.length ? `<p class="hint" style="margin-top:0">Antal olika bedömare per mottagare, färst först.</p><table class="bed-ans dst-table"><tr><th>Mottagare</th><th>Bedömningar</th><th>Olika bedömare</th></tr>${t.spread.map(p =>
        `<tr><td>${who(p)}</td><td>${p.assessments}</td><td><strong style="color:${p.assessors <= 1 ? '#9e2a18' : 'inherit'}">${p.assessors}</strong></td></tr>`).join('')}</table>` : '<p class="muted">Inga bedömningar i valt intervall.</p>'}
    </div>` : ''}
    ${people('Mest aktiva registrerare', s.byRegistrar, s.byRegistrarForms)}
    ${people('Mest bedömda', s.byRecipient, s.byRecipientForms)}
    ${r ? `<div class="card"><h2 style="margin-top:0">Förfrågningar</h2>
      <p style="margin-top:0">${r.summary.total} totalt · ${r.summary.done} utförda · ${r.summary.pending} väntar · ${r.summary.inaktuell} inaktuella</p>
      ${r.requests.length ? `<table class="bed-ans dst-table"><tr><th>Datum</th><th>Från</th><th>Till</th><th>Formulär</th><th>Status</th></tr>${r.requests.map(q =>
        `<tr><td>${esc(q.timestamp.slice(0, 10))}</td><td>${esc(q.fromName)}</td><td>${esc(q.toName)}</td><td>${esc(q.formType || '–')}</td><td>${esc(q.status === 'done' ? 'Utförd' : q.status === 'expired' ? 'Inaktuell' : 'Väntar')}</td></tr>`).join('')}</table>` : ''}
    </div>` : ''}`;

  el('dst-klinik')?.addEventListener('change', e => { d.klinik = e.target.value; loadDopsStats(root); });
  el('dst-ftoggle').onclick = () => { d.showFilter = !d.showFilter; drawDopsStats(root); };
  el('dst-apply').onclick = () => {
    const from = el('dst-from').value, to = el('dst-to').value, refetch = from !== d.from || to !== d.to;
    d.from = from; d.to = to; d.types = new Set([...root.querySelectorAll('.dmi-types input:checked')].map(c => c.value));
    refetch ? loadDopsStats(root) : drawDopsStats(root);
  };
  el('dst-reset').onclick = () => { d.from = d.to = ''; d.types.clear(); loadDopsStats(root); };
  el('dst-idle')?.addEventListener('change', e => { d.idleWeeks = +e.target.value; drawDopsStats(root); });
  el('dst-spec')?.addEventListener('change', e => { d.idleSpec = e.target.checked; drawDopsStats(root); });
}

// ── Tävling ───────────────────────────────────────────────────────────────
// Kvartalstävlingen: flest registrerade och flest mottagna bedömningar under en omgång (3 månader).
let _dcp = null;

async function renderDopsCompetition(root) {
  try {
    await dopsStart(root);
    _dcp = { klinik: _dcp?.klinik || _dme.klinikId };
    await loadDopsCompetition(root);
  } catch (err) { dopsFail(root, 'Tävling', err); }
}

async function loadDopsCompetition(root) {
  const d = _dcp;
  [d.data, d.choice] = await Promise.all([dopsApi('/competition?clinicId=' + encodeURIComponent(d.klinik)), dopsClinicChoice(d)]);
  const c = d.data;
  const medal = p => ['🥇', '🥈', '🥉'][p.place - 1] || `${p.place}.`;
  const board = (title, list) => `<div><h3 style="margin:8px 0 4px">${title}</h3>${list.length ? `<table class="bed-ans">${list.map(p =>
    `<tr><th>${medal(p)} ${esc(p.name)}</th><td>${p.count}</td></tr>`).join('')}</table>` : '<p class="muted">Inga än.</p>'}</div>`;
  const round = (r, title) => `<div class="card"><h2 style="margin-top:0">${title}</h2>
    <p class="muted" style="margin-top:0">${esc(r.startDate)} – ${esc(r.endDate)}${r.daysLeft != null ? ` · ${r.daysLeft} dagar kvar` : ''}${r.endedEarly ? ' · avslutad i förtid' : ''}</p>
    <div class="dcp-boards">${board('Flest registrerade', r.registrars || r.podium?.registrars || [])}${board('Flest mottagna', r.recipients || r.podium?.recipients || [])}</div></div>`;
  root.innerHTML = `
    <h1 class="page">Kvartalstävling</h1>
    <p class="hint" style="margin:-4px 0 14px">Flest registrerade och flest mottagna bedömningar under en omgång på tre månader. När en omgång är slut mejlar DOPS-appen resultatet till klinikens studierektorer och administratörer.</p>
    ${d.choice}
    ${c.current ? round(c.current, 'Pågående omgång') : '<div class="card"><p class="muted" style="margin:0">Ingen pågående omgång.</p></div>'}
    ${c.upcoming ? `<div class="card"><p style="margin:0">Nästa omgång: ${esc(c.upcoming.startDate)} – ${esc(c.upcoming.endDate)}</p></div>` : ''}
    ${c.privileged ? `<div class="card"><h2 style="margin-top:0">Omgångar</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap"><input type="date" id="dcp-start" style="max-width:180px"><button class="btn" id="dcp-new">Starta omgång</button>
      ${c.current ? `<button class="btn-ghost" id="dcp-del" data-id="${esc(c.current.id)}">Avsluta pågående</button>` : ''}</div></div>` : ''}
    ${(c.history || []).map(h => round(h, 'Avslutad omgång')).join('')}`;
  el('dst-klinik')?.addEventListener('change', e => { d.klinik = e.target.value; loadDopsCompetition(root); });
  if (el('dcp-new')) el('dcp-new').onclick = async () => {
    if (await dopsWrite(() => dopsApi('/competition/rounds', { method: 'POST', body: { clinicId: d.klinik, startDate: el('dcp-start').value } }), 'Omgången är startad.')) loadDopsCompetition(root);
  };
  if (el('dcp-del')) el('dcp-del').onclick = async () => {
    if (!confirm('Avsluta den pågående omgången?')) return;
    if (await dopsWrite(() => dopsApi('/competition/rounds/' + encodeURIComponent(el('dcp-del').dataset.id), { method: 'DELETE' }), 'Omgången är avslutad.')) loadDopsCompetition(root);
  };
}

// ── Dokument ──────────────────────────────────────────────────────────────
async function renderDopsDocuments(root) {
  try {
    await dopsStart(root);
    const docs = await dopsApi('/documents');
    root.innerHTML = `<h1 class="page">Dokument</h1>
      <p class="hint" style="margin:-4px 0 14px">Mallar och avtal för kliniker som vill ansluta till DOPS.</p>
      <div class="card">${docs.length ? docs.map(x => `<div class="pass-card" style="display:block">
        <strong>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)}</strong>
        <span class="muted">${x.version ? ' · version ' + esc(x.version) : ''}${x.date ? ' · ' + esc(x.date) : ''}</span>
        ${x.description ? `<div class="muted" style="font-size:14px">${esc(x.description)}</div>` : ''}</div>`).join('') : '<p class="muted" style="margin:0">Inga dokument.</p>'}</div>`;
  } catch (err) { dopsFail(root, 'Dokument', err); }
}

// ── Word-export (Mina bedömningar, Kliniken) ─────────────────────────────
// Samma dokument som DOPS-appen, men laddas ner direkt i stället för att mejlas.
async function dopsExportDocx(ids, filterInfo) {
  if (!ids.length) return toast('Markera minst en bedömning.', 'err');
  try {
    const r = await dopsApi('/export/docx', { method: 'POST', body: { ids, filterInfo } });
    const bytes = Uint8Array.from(atob(r.base64), ch => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: r.filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`${r.count} bedömningar exporterade.`);
  } catch (err) { toast(err.message, 'err'); }
}
const dopsPeriod = (from, to) => from || to ? `${from || '…'} – ${to || 'idag'}` : 'Alla datum';

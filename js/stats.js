// ── Statistik (#/stats) — admin och användare som admin gett rätten ───────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), fmtDM().
// Hämtar GET /stats?period=… och ritar med ren HTML/CSS (inga diagrambibliotek).

let _stats = null;
const PERIODS = [['30', '30 dagar'], ['90', '90 dagar'], ['365', '12 månader'], ['all', 'Allt']];

async function renderStats(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!me.canSeeStats) { location.hash = '#/'; return; }
    _stats = { period: '90', data: null };
    await loadStats(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function loadStats(root) {
  _stats.data = await api('/stats?period=' + _stats.period);
  drawStats(root);
}

async function setStatsPeriod(p) {
  _stats.period = p;
  try { await loadStats(el('view')); } catch (err) { alert(err.message); }
}

const barRow = (label, pct, right, cls = '') =>
  `<div class="brow"><span>${esc(label)}</span><div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div><span class="n">${right}</span></div>`;

const fmtNum = n => String(n).replace('.', ',');
const fmtPct = n => `${fmtNum(n)} %`;

// Utlottning: när ingen bokat en dag lottas den ut bland de intresserade (se plan §18).
function drawCard(w) {
  if (!w || !w.total) {
    return `<div class="card" style="margin-top:16px"><h2>Utlottning</h2>
      <p class="muted" style="margin:0">Inga utlottningar i perioden. Utlottning sker när ingen bokat en dag men någon anmält intresse.</p></div>`;
  }
  const maxWon = Math.max(1, ...w.perPerson.map(p => Math.max(p.won, p.expected)));
  return `<div class="card" style="margin-top:16px">
      <h2>Utlottning</h2>
      <p style="margin:0 0 4px"><strong>${w.total}</strong> utlottning${w.total === 1 ? '' : 'ar'} · ${fmtPct(w.sharePercent)} av bokningarna i perioden kom via utlottning (${w.drawnClaims} st).</p>
      <p class="muted" style="margin:0 0 10px">${w.alone} med en ensam intresserad · ${w.contested} med flera${w.avgCandidates != null ? ` (snitt ${fmtNum(w.avgCandidates)} i lotten)` : ''}
        · ${w.cancelledAfter} utlottad${w.cancelledAfter === 1 ? '' : 'e'} bokning${w.cancelledAfter === 1 ? '' : 'ar'} avbokades${w.redraws ? `, ${w.redraws} omlottning${w.redraws === 1 ? '' : 'ar'}` : ''}.</p>
      <div style="overflow-x:auto"><table class="stats-table">
        <tr><th>Namn</th><th class="num">Var med</th><th>Utlottad</th><th class="num">Förväntat</th></tr>
        ${w.perPerson.map(p => `<tr>
          <td><strong>${esc(p.displayName)}</strong></td>
          <td class="num">${p.participated}</td>
          <td style="min-width:150px"><div style="display:flex;gap:8px;align-items:center"><div class="bar" style="flex:1"><span style="width:${(p.won / maxWon) * 100}%"></span></div><span class="n" style="min-width:24px;text-align:right">${p.won}</span></div></td>
          <td class="num">${fmtNum(p.expected)}</td></tr>`).join('')}
      </table></div>
      <p class="muted" style="margin:8px 0 0;font-size:13px">"Förväntat" är hur många utlottningar personen borde ha vunnit om lotten är rättvis (summan av 1/antal i lotten). Över tid ska "Utlottad" ligga nära det.</p>
    </div>`;
}

function drawStats(root) {
  const d = _stats.data;
  const maxCount = Math.max(1, ...d.perPerson.map(p => p.count));
  const maxHour = Math.max(1, ...d.hours.map(h => h.count));
  const maxLead = Math.max(1, ...d.leadTime.buckets.map(b => b.count));
  const seg = `<div class="seg" role="group" aria-label="Period">${PERIODS.map(([k, label]) =>
    `<button class="${_stats.period === k ? 'on' : ''}" onclick="setStatsPeriod('${k}')">${label}</button>`).join('')}</div>`;

  if (!d.totals.claims && !d.outlook.covered) {
    root.innerHTML = `<h1 class="page">Statistik</h1><div class="row" style="margin-bottom:14px">${seg}</div>
      <div class="card"><p class="muted" style="margin:0">Inga bokningar i perioden ${fmtDM(d.period.fromISO)} – ${fmtDM(d.period.toISO)}.</p></div>`;
    return;
  }

  root.innerHTML = `
    <h1 class="page">Statistik</h1>
    <div class="row" style="margin-bottom:14px;justify-content:space-between">
      ${seg}
      <span class="muted" style="font-size:13px">${fmtDM(d.period.fromISO)} – ${fmtDM(d.period.toISO)} · ${d.period.days} dagar</span>
    </div>

    <div class="stat-grid">
      <div class="card">
        <h2>Täckning</h2>
        <div class="stat-big">${fmtPct(d.coverage.percent)}</div>
        <p class="muted" style="margin:6px 0 10px">${d.coverage.covered} av ${d.coverage.days} dagar hade någon uppskriven · ${d.coverage.uncovered} dagar saknade jour (reserv gäller då).</p>
        <div class="bar"><span style="width:${d.coverage.percent}%"></span></div>
        <p style="margin:14px 0 0"><strong>Utsikt:</strong> ${d.outlook.covered} av de kommande ${d.outlook.days} dagarna har redan någon uppskriven.</p>
        <p class="muted" style="margin:6px 0 0;font-size:13px">${d.totals.claims} bokningar av ${d.totals.people} personer (${d.totals.activePeople} aktiva).</p>
      </div>

      <div class="card">
        <h2>Täckning per veckodag</h2>
        ${d.perWeekday.map(w => barRow(w.label, w.percent, `${w.covered}/${w.days}`)).join('')}
      </div>

      <div class="card">
        <h2>Hur långt i förväg man bokar</h2>
        <p class="muted" style="margin:0 0 8px">Median ${d.leadTime.medianDays != null ? fmtNum(d.leadTime.medianDays) : '–'} dagar · snitt ${d.leadTime.avgDays != null ? fmtNum(d.leadTime.avgDays) : '–'} dagar.</p>
        ${d.leadTime.buckets.map(b => barRow(b.label, (b.count / maxLead) * 100, b.count, 'blue')).join('')}
      </div>

      <div class="card">
        <h2>Tid på dygnet man bokar</h2>
        <div class="cols">${d.hours.map(h => `<div class="c blue" title="${h.hour}:00 – ${h.count} bokningar"><i style="height:${(h.count / maxHour) * 100}%"></i><span>${h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : '&nbsp;'}</span></div>`).join('')}</div>
        <p class="muted" style="margin:8px 0 0;font-size:13px">Klockslag då bokningen gjordes (svensk tid).</p>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>Täckning per månad</h2>
      <div class="cols">${d.perMonth.map(m => `<div class="c" title="${esc(m.label)}: ${m.covered}/${m.days} dagar"><b>${Math.round(m.percent)}</b><i style="height:${m.percent}%"></i><span>${esc(m.label)}</span></div>`).join('')}</div>
      <p class="muted" style="margin:8px 0 0;font-size:13px">Andel av månadens dagar (hittills) som hade någon uppskriven, i procent.</p>
    </div>

    ${drawCard(d.draws)}

    <div class="card" style="margin-top:16px">
      <h2>Jourer per person</h2>
      <div style="overflow-x:auto"><table class="stats-table">
        <tr><th>Namn</th><th>Antal</th><th class="num">Andel</th><th class="num">Senast</th><th class="num">Nästa</th><th class="num">Snitt i förväg</th></tr>
        ${d.perPerson.map(p => `<tr>
          <td><strong>${esc(p.displayName)}</strong>${p.active ? '' : ' <span class="tagchip off">Inaktiv</span>'}</td>
          <td style="min-width:150px"><div style="display:flex;gap:8px;align-items:center"><div class="bar" style="flex:1"><span style="width:${(p.count / maxCount) * 100}%"></span></div><span class="n" style="min-width:24px;text-align:right">${p.count}</span></div></td>
          <td class="num">${p.count ? fmtPct(p.percent) : '–'}</td>
          <td class="num">${p.lastDate ? fmtDM(p.lastDate) : '–'}</td>
          <td class="num">${p.nextDate ? fmtDM(p.nextDate) : '–'}</td>
          <td class="num">${p.avgLeadDays != null ? fmtNum(p.avgLeadDays) + ' d' : '–'}</td></tr>`).join('')}
      </table></div>
      <p class="muted" style="margin:8px 0 0;font-size:13px">Andel = personens del av alla bokade dagar i perioden. "Snitt i förväg" = hur många dagar före jourdagen man brukar boka.</p>
    </div>`;
}

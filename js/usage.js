// ── Användning (#/installningar/anvandning) ──────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), fmtDM(). Global entry: renderUsage(root).
// Global admin: användningsstatistik för ST-Lotsen (insamlad sedan 0.39.0) och DOPS-appen (dess usage_events, utan demokonton).
// Nyckeltal, sessioner per dag, mest besökta sidor, enheter och webbläsare och en lista per person.

let _use = null;

const USE_PANEL = {
  '#/': 'Startsida', '#/kalender': 'Opjour – kalender', '#/stats': 'Opjour – statistik', '#/schema': 'Planering – veckoschema',
  '#/oversikt': 'Måluppfyllelse', '#/plan': 'Min utbildningsplan', '#/plan/:id': 'Utbildningsplan (annan)', '#/dops': 'DOPS – översikt',
  '#/dops/registrera': 'DOPS – registrera', '#/dops/inkorg': 'DOPS – inkorg', '#/dops/mina': 'DOPS – mina', '#/dops/progress': 'DOPS – progress',
  '#/dops/kliniken': 'DOPS – kliniken', '#/dops/statistik': 'DOPS – statistik', '#/dops/tavling': 'DOPS – tävling', '#/dops/dokument': 'DOPS – dokument'
};
const USE_SET = { konto: 'Mitt konto', anvandare: 'Användare', klinik: 'Klinik', opjour: 'Opjour', planering: 'Planering', st: 'ST-utbildning', dops: 'DOPS',
  system: 'System', anvandning: 'Användning', felanmalan: 'Felanmälan' };
const usePanelName = p => USE_PANEL[p] || (p.startsWith('#/installningar') ? 'Inställningar' + (p.split('/')[2] ? ' – ' + (USE_SET[p.split('/')[2]] || p.split('/')[2]) : '') : p);

async function renderUsage(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!me.isGlobalAdmin) { location.hash = '#/installningar/konto'; return; }
    _use = _use || { source: 'lotsen', days: 30 };
    await loadUsage();
  } catch (err) { root.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

async function loadUsage() {
  const root = el('view');
  try {
    _use.data = await api(`/usage/summary?source=${_use.source}&days=${_use.days}`);
    _use.error = null;
  } catch (err) { _use.data = null; _use.error = err.message; }
  drawUsage(root);
}

// Staplar per dag (SVG). Dagar utan sessioner fylls i så att tidsaxeln blir rätt.
function useDayChart(perDay, days) {
  const by = new Map(perDay.map(d => [d.day, d])), list = [];
  const today = todayStockholm();
  for (let i = days - 1; i >= 0; i--) { const d = addDaysISO(today, -i); list.push({ day: d, n: by.get(d)?.sessions || 0, u: by.get(d)?.users || 0 }); }
  const max = Math.max(1, ...list.map(d => d.n)), W = 640, H = 150, pad = 22, bw = (W - pad) / list.length;
  const ticks = [max, Math.round(max / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const step = Math.ceil(list.length / 8);
  return `<svg viewBox="0 0 ${W} ${H + 18}" class="bed-svg" role="img" aria-label="Sessioner per dag">
      ${ticks.map(t => { const y = H - (t / max) * (H - 8); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" class="use-grid"/><text x="${pad - 4}" y="${y + 3}" text-anchor="end" class="dov-ax">${t}</text>`; }).join('')}
      <line x1="${pad}" x2="${W}" y1="${H}" y2="${H}" class="use-base"/>
      ${list.map((d, i) => { const h = (d.n / max) * (H - 8); return `<rect x="${pad + i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="2" class="use-bar"><title>${esc(fmtDM(d.day))}: ${d.n} sessioner, ${d.u} personer</title></rect>`; }).join('')}
      ${list.map((d, i) => i % step === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H + 13}" text-anchor="middle" class="dov-ax">${esc(fmtDM(d.day))}</text>` : '').join('')}
    </svg>`;
}

const useShare = (rows, label = r => r.k) => {
  const tot = rows.reduce((s, r) => s + r.n, 0) || 1;
  return rows.map(r => `<div class="bed-bar dst-bar"><span>${esc(label(r))}</span><div><i style="width:${Math.round(100 * r.n / tot)}%"></i></div><span>${Math.round(100 * r.n / tot)}%</span></div>`).join('');
};

function drawUsage(root) {
  const d = _use.data;
  const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([k, l]) => `<button type="button" data-k="${k}" class="${String(cur) === String(k) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const when = iso => iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const t = d?.totals || {};
  const maxPanel = Math.max(1, ...(d?.panels || []).map(p => p.n));
  root.innerHTML = `
    <h1 class="page">Användning</h1>
    <div class="row" style="gap:8px;margin-bottom:12px">
      ${seg('use-src', [['lotsen', 'ST-Lotsen'], ['dops', 'DOPS-appen']], _use.source)}
      ${seg('use-days', [[7, '7 dagar'], [30, '30 dagar'], [90, '90 dagar'], [365, 'Ett år']], _use.days)}
    </div>
    ${_use.error ? `<div class="card"><p class="err" style="margin:0">${esc(_use.error)}</p></div>` : `
    <div class="use-kpis">
      <div class="use-kpi"><small>PERSONER</small><strong>${t.users ?? 0}</strong></div>
      <div class="use-kpi"><small>SESSIONER</small><strong>${t.sessions ?? 0}</strong></div>
      <div class="use-kpi"><small>SIDVISNINGAR</small><strong>${t.views ?? 0}</strong></div>
      <div class="use-kpi"><small>PER SESSION</small><strong>${t.sessions ? (t.views / t.sessions).toFixed(1) : '–'}</strong></div>
    </div>
    <div class="card"><h2>Sessioner per dag</h2>${useDayChart(d.perDay, Math.min(_use.days, 90))}
      ${_use.days > 90 ? '<p class="hint" style="margin:4px 0 0">Diagrammet visar de senaste 90 dagarna; nyckeltalen hela perioden.</p>' : ''}</div>
    <div class="bed-grid">
      <div class="card"><h2>Mest besökta sidor</h2>${d.panels.length ? d.panels.map(p => `<div class="bed-bar dst-bar"><span>${esc(_use.source === 'dops' ? p.panel : usePanelName(p.panel))}</span><div><i style="width:${Math.round(100 * p.n / maxPanel)}%"></i></div><span>${p.n}</span></div>`).join('') : '<p class="muted" style="margin:0">Inga sidvisningar.</p>'}</div>
      <div class="card"><h2>Enheter</h2>${useShare(d.devices) || '<p class="muted" style="margin:0">–</p>'}
        <h3 style="margin-top:14px">Webbläsare</h3>${useShare(d.browsers) || '<p class="muted" style="margin:0">–</p>'}</div>
    </div>
    <div class="card"><h2>Per person (${d.people.length})</h2>
      ${d.people.length ? `<div class="sch-scroll"><table class="dst-table use-table"><tr><th>Namn</th><th>Klinik</th><th>Sessioner</th><th>Sidor</th><th>Senast</th></tr>
        ${d.people.map(p => `<tr><td>${esc(p.name || '–')}</td><td class="muted">${esc(p.clinic || '')}</td><td>${p.sessions}</td><td>${p.views}</td><td class="muted">${esc(when(p.lastAt))}</td></tr>`).join('')}</table></div>`
        : '<p class="muted" style="margin:0">Ingen aktivitet under perioden.</p>'}
      ${_use.source === 'lotsen' ? '<p class="hint">ST-Lotsen samlar in sessioner och sidvisningar sedan version 0.39.0. Ingen IP-adress sparas.</p>' : '<p class="hint">Läses ur DOPS-appens databas. Demokonton räknas inte.</p>'}
    </div>`}`;
  el('use-src').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { _use.source = b.dataset.k; loadUsage(); } });
  el('use-days').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { _use.days = Number(b.dataset.k); loadUsage(); } });
}

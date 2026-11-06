// ── DOPS-modulens diagram (Chart.js, som DOPS-appen) ──────────────────────
// Klassiskt script. Beror på index.html: esc(), el(), isoWeek() och Chart.js (cdnjs, laddas i index.html). Används av js/dopsapp.js
// (Översikt), js/dopsstats.js (Statistik) och js/dops.js (Progress).
// Utseendet följer DOPS-appens js/charts.js: staplade staplar per formulärtyp med en röd linje för totalen, klick på en etikett
// isolerar den (klick igen visar alla), upplösning dag/vecka/månad och samma färgpalett. Saknas Chart.js (t.ex. blockerat nät)
// ritas den äldre SVG-grafen i stället.
//
// Mönster: dchartCard(...) / dchartPie(...) / dchartHBar(...) / dchartLine(...) returnerar HTML och köar diagrammet;
// dchartMount() efter att sidan ritats skapar dem (och tar bort de förra).

const DCHART_COLORS = ['#00e5ff', '#ff1266', '#00ff9d', '#ffd500', '#b026ff', '#ff5e00', '#2e4a5f', '#8b3a9e', '#1a8fa0', '#e87db3'];
const DCHART_GRID = '#c7d1d7', DCHART_TOTAL = '#c4292a';
const _dch = { queue: [], live: [], res: null, seq: 0 };
const dchartOk = () => typeof Chart !== 'undefined';

// Tidsnycklar: dag YYYY-MM-DD, vecka = måndagens datum, månad YYYY-MM.
const dchartDay = d => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
function dchartBucket(day, res) {
  if (res === 'day') return day;
  if (res === 'month') return day.slice(0, 7);
  const t = new Date(day + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return dchartDay(t);
}
function dchartKeys(start, res) {
  const keys = [], today = dchartDay(new Date());
  const t = new Date(dchartBucket(start, res) + (res === 'month' ? '-01' : '') + 'T12:00:00');
  while (dchartDay(t) <= today && keys.length < 800) {
    keys.push(res === 'month' ? dchartDay(t).slice(0, 7) : dchartDay(t));
    if (res === 'day') t.setDate(t.getDate() + 1); else if (res === 'week') t.setDate(t.getDate() + 7); else t.setMonth(t.getMonth() + 1);
  }
  return keys;
}
const DCHART_MON = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function dchartLabel(k, res) {
  if (res === 'day') return k.slice(5);
  if (res === 'week') return [`v.${isoWeek(k)}`, `${+k.slice(8)}/${+k.slice(5, 7)}`];
  return k;
}
function dchartTip(k, res) {
  if (res !== 'week') return res === 'day' ? k : `${DCHART_MON[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
  const m = new Date(k + 'T12:00:00'), s = new Date(m); s.setDate(m.getDate() + 6);
  return `Vecka ${isoWeek(k)} (${m.getDate()} ${DCHART_MON[m.getMonth()]}–${s.getDate()} ${DCHART_MON[s.getMonth()]})`;
}
// Förvald upplösning efter periodens längd (som DOPS-appen): ≤ 1 mån dag, ≤ 3 mån vecka, annars månad.
const dchartAutoRes = start => { const days = (Date.now() - new Date(start + 'T00:00:00').getTime()) / 864e5; return days <= 31 ? 'day' : days <= 92 ? 'week' : 'month'; };

// Klick på en etikett: isolera den; fler klick lägger till; klick på en vald tar bort den; ingen vald = alla.
function dchartLegendClick(chart) {
  return (e, item) => {
    const i = item.datasetIndex, sel = chart._sel || (chart._sel = new Set());
    if (!sel.size) { sel.add(i); chart.data.datasets.forEach((_, j) => chart.setDatasetVisibility(j, j === i)); }
    else if (sel.has(i)) { sel.delete(i); chart.setDatasetVisibility(i, false); if (!sel.size) chart.data.datasets.forEach((_, j) => chart.setDatasetVisibility(j, true)); }
    else { sel.add(i); chart.setDatasetVisibility(i, true); }
    chart.update();
  };
}
// Mobil: etiketterna döljs bakom en knapp så att de inte tar hela diagrammet.
function dchartMobileLegend(chart, box) {
  if (window.innerWidth > 600 || !box) return;
  chart.options.plugins.legend.display = false; chart.update();
  const b = document.createElement('button');
  b.className = 'btn-ghost dchart-legend-btn'; b.textContent = 'Visa etiketter';
  b.onclick = () => { const on = !chart.options.plugins.legend.display; chart.options.plugins.legend.display = on; chart.update(); b.textContent = on ? 'Dölj etiketter' : 'Visa etiketter'; };
  box.appendChild(b);
}

// ── Staplad tidsserie per formulärtyp + total ─────────────────────────────
// byDayFt: { 'YYYY-MM-DD': { formulär: antal, label? } }, start: första dagen, colorOf(formulär).
function dchartCard(title, byDayFt, start, colorOf, { section = true } = {}) {
  const days = Object.entries(byDayFt || {}).filter(([d]) => d >= start);
  if (!days.length) return '';
  if (!dchartOk()) return dovSvgChart(title, byDayFt, start, colorOf);
  const id = 'dch' + (++_dch.seq);
  _dch.queue.push({ id, kind: 'time', byDayFt, start, colorOf });
  const res = _dch.res || dchartAutoRes(start);
  return `${section ? `<div class="dsec">${esc(title)}</div>` : ''}<div class="card dchart-card" id="${id}-box">
      ${section ? '' : `<h2 style="margin-top:0">${esc(title)}</h2>`}
      <div class="dchart-tools"><label for="${id}-res">Upplösning</label>
        <select id="${id}-res" data-dres="${id}">${[['day', 'Dag'], ['week', 'Vecka'], ['month', 'Månad']].map(([v, l]) => `<option value="${v}"${v === res ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="dchart-wrap"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div>
      <p class="hint dchart-hint">Klicka på en etikett för att isolera den, klicka igen för att visa alla.</p>
    </div>`;
}

function dchartTime(spec) {
  const res = _dch.res || dchartAutoRes(spec.start);
  const keys = dchartKeys(spec.start, res), idx = new Map(keys.map((k, i) => [k, i]));
  const by = {};
  for (const [day, m] of Object.entries(spec.byDayFt)) {
    if (day < spec.start) continue;
    const i = idx.get(dchartBucket(day, res)); if (i == null) continue;
    for (const [ft, n] of Object.entries(m)) if (ft !== 'label') (by[ft] ||= Array(keys.length).fill(0))[i] += n;
  }
  // Minst först (underst), som DOPS-appen.
  const fts = Object.keys(by).sort((a, b) => by[a].reduce((s, n) => s + n, 0) - by[b].reduce((s, n) => s + n, 0));
  const bars = fts.map(ft => ({ label: ft, data: by[ft], backgroundColor: spec.colorOf(ft) + 'cc', borderColor: spec.colorOf(ft), borderWidth: 1, borderRadius: 2, stack: 's' }));
  const total = { type: 'line', label: 'Totalt', data: keys.map((_, i) => bars.reduce((s, d) => s + d.data[i], 0)), borderColor: DCHART_TOTAL,
    backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: keys.length > 60 ? 0 : 3, pointBackgroundColor: DCHART_TOTAL, tension: 0.2, order: -1 };
  const chart = new Chart(el(spec.id), {
    type: 'bar',
    data: { labels: keys.map(k => dchartLabel(k, res)), datasets: [...bars, total] },
    options: {
      responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 }, onClick: (e, it) => dchartLegendClick(chart)(e, it) },
        tooltip: { filter: it => it.raw > 0 || it.dataset.type === 'line', callbacks: { title: items => items.length ? dchartTip(keys[items[0].dataIndex], res) : '' } }
      },
      scales: {
        y: { beginAtZero: true, stacked: true, ticks: { precision: 0 }, grid: { color: DCHART_GRID } },
        x: res === 'week' ? { stacked: true, grid: { offset: false, drawOnChartArea: false, tickLength: 6, color: '#5b6b75' }, ticks: { maxRotation: 0, autoSkipPadding: 10, font: { size: 11 } } }
          : { stacked: true, grid: { color: DCHART_GRID }, ticks: { maxRotation: 0, autoSkipPadding: 8, font: { size: 11 } } }
      }
    }
  });
  dchartMobileLegend(chart, el(spec.id + '-box'));
  return chart;
}

// ── Paj: fördelning per formulärtyp ───────────────────────────────────────
function dchartPie(title, rows, colorOf) {
  if (!rows.length) return '';
  if (!dchartOk()) return '';
  const id = 'dch' + (++_dch.seq);
  _dch.queue.push({ id, kind: 'pie', rows, colorOf });
  return `<div class="dsec">${esc(title)}</div><div class="card dchart-card" id="${id}-box"><div class="dchart-wrap pie"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
}
function dchartPieMount(spec) {
  const chart = new Chart(el(spec.id), {
    type: 'pie',
    data: { labels: spec.rows.map(r => r[0]), datasets: [{ data: spec.rows.map(r => r[1]), backgroundColor: spec.rows.map(r => spec.colorOf(r[0])), borderColor: '#fff', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: window.innerWidth > 600 ? 'right' : 'bottom', labels: { font: { size: 12 }, boxWidth: 12 } },
      tooltip: { callbacks: { label: it => { const tot = it.dataset.data.reduce((s, n) => s + n, 0); return ` ${it.label}: ${it.raw} (${Math.round(100 * it.raw / tot)} %)`; } } } } }
  });
  return chart;
}

// ── Liggande staplad stapel per person och formulär ──────────────────────
// by: { namn: antal }, forms: { namn: { formulär: antal } }. Topp 10.
function dchartHBar(title, by, forms, colorOf, on = () => true) {
  const top = Object.entries(by || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!top.length || !dchartOk()) return null;
  const id = 'dch' + (++_dch.seq);
  _dch.queue.push({ id, kind: 'hbar', top, forms: forms || {}, colorOf, on });
  return `<div class="dsec">${esc(title)}</div><div class="card dchart-card" id="${id}-box"><div class="dchart-wrap" style="height:${60 + top.length * 30}px"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
}
function dchartHBarMount(spec) {
  const names = spec.top.map(t => t[0]);
  const fts = [...new Set(names.flatMap(n => Object.keys(spec.forms[n] || {})))].filter(spec.on).sort((a, b) => a.localeCompare(b, 'sv'));
  const chart = new Chart(el(spec.id), {
    type: 'bar',
    data: { labels: names, datasets: fts.map(ft => ({ label: ft, data: names.map(n => spec.forms[n]?.[ft] || 0), backgroundColor: spec.colorOf(ft) + 'cc', borderColor: spec.colorOf(ft), borderWidth: 1, borderRadius: 2 })) },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 }, onClick: (e, it) => dchartLegendClick(chart)(e, it) },
        tooltip: { filter: it => it.raw > 0 } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: DCHART_GRID } }, y: { stacked: true, grid: { display: false } } } }
  });
  dchartMobileLegend(chart, el(spec.id + '-box'));
  return chart;
}

// ── Linje för en skalfråga (Progress) ─────────────────────────────────────
// pts: [{ at: ms, v }], lo/hi: skalans ändar, avg: medelvärde.
function dchartLine(pts, lo, hi, avg, label) {
  if (!dchartOk()) return null;
  const id = 'dch' + (++_dch.seq);
  _dch.queue.push({ id, kind: 'line', pts, lo, hi, avg, label });
  return `<div class="dchart-wrap line"><canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas></div>`;
}
function dchartLineMount(spec) {
  const { pts, lo, hi, avg } = spec;
  const x0 = pts[0].at, x1 = pts[pts.length - 1].at, pad = Math.max((x1 - x0) * 0.05, 864e5 * 3);
  return new Chart(el(spec.id), {
    type: 'line',
    data: { datasets: [
      { label: 'Poäng', data: pts.map(p => ({ x: p.at, y: p.v })), borderColor: '#1a8fa0', backgroundColor: '#00e5ff', pointRadius: 5, pointHoverRadius: 7, borderWidth: 2, tension: 0.25 },
      { label: `Snitt ${avg.toFixed(1).replace('.', ',')}`, data: [{ x: x0 - pad, y: avg }, { x: x1 + pad, y: avg }], borderColor: '#d9a441', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14 } },
        tooltip: { callbacks: { title: items => new Date(items[0].parsed.x).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) } } },
      scales: {
        x: { type: 'linear', min: x0 - pad, max: x1 + pad, ticks: { maxTicksLimit: 6, font: { size: 11 }, callback: v => new Date(v).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }) }, grid: { color: 'rgba(0,0,0,.04)' } },
        y: { min: lo - 0.5, max: hi + 0.5, afterBuildTicks: s => { s.ticks = []; for (let i = lo; i <= hi; i++) s.ticks.push({ value: i }); }, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.13)' } }
      } }
  });
}

// Skapa köade diagram (efter att sidan ritats). Gamla instanser tas bort först.
function dchartMount(root = document) {
  _dch.live.forEach(c => { try { c.destroy(); } catch {} });
  _dch.live = [];
  const queue = _dch.queue; _dch.queue = [];
  if (!dchartOk()) return;
  for (const spec of queue) {
    if (!el(spec.id)) continue;
    const mk = { time: dchartTime, pie: dchartPieMount, hbar: dchartHBarMount, line: dchartLineMount }[spec.kind];
    try { _dch.live.push(mk(spec)); } catch (err) { console.error(err); }
    if (spec.kind === 'time') {
      root.querySelector(`[data-dres="${spec.id}"]`)?.addEventListener('change', e => {
        _dch.res = e.target.value;
        const i = _dch.live.findIndex(c => c.canvas?.id === spec.id);
        if (i >= 0) { _dch.live[i].destroy(); el(spec.id + '-box').querySelector('.dchart-legend-btn')?.remove(); _dch.live[i] = dchartTime(spec); }
      });
    }
  }
}

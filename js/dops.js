// ── DOPS → Progress (#/dops) ─────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(). Global entry: renderBedomningar(root).
//
// DOPS fas 4 (dops_plan.md): läser bedömningarna direkt ur DOPS databas. Bara läsning — nya bedömningar görs i DOPS.
// Behörighet som i DOPS: sina egna, eller alla på kliniken för den som är Studierektor/Administratör i DOPS.
// Per formulärtyp: skalfrågor som kurva över tid med medelvärde, flervalsfrågor som fördelning, fritext samlad, och varje bedömning.

let _bed = null;

const bedDate = iso => new Date(iso).toLocaleDateString('sv-SE');

async function renderBedomningar(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [me, people] = await Promise.all([api('/me'), api('/dops/assessments/people')]);
    setMenuForUser(me);
    dopsApi('/me').then(dopsNav).catch(() => {});
    _bed = { me, people, recipient: _bed?.recipient || people.self.id, data: null, type: null };
    if (!people.canSeeOthers) _bed.recipient = people.self.id;
    await loadBedomningar(root);
  } catch (err) {
    root.innerHTML = `<h1 class="page">Progress</h1><p class="err">${esc(err.message)}</p>`;
  }
}

async function loadBedomningar(root) {
  _bed.data = await api('/dops/assessments?recipient=' + encodeURIComponent(_bed.recipient));
  if (!_bed.data.formTypes.some(t => t.id === _bed.type)) _bed.type = _bed.data.formTypes[0]?.id || null;
  drawBedomningar(root);
}

function drawBedomningar(root) {
  const { people, data } = _bed;
  const picker = people.canSeeOthers ? `<label for="bed-who" style="margin-top:0">Person</label>
      <select id="bed-who" onchange="_bed.recipient=this.value;loadBedomningar(el('view'))" style="max-width:340px">
        <option value="${esc(people.self.id)}"${_bed.recipient === people.self.id ? ' selected' : ''}>Mina egna (${people.self.count})</option>
        ${people.people.filter(p => p.id !== people.self.id).map(p => `<option value="${esc(p.id)}"${p.id === _bed.recipient ? ' selected' : ''}>${esc(p.name)} (${p.count})</option>`).join('')}
      </select>` : '';
  const types = data.formTypes;
  const t = types.find(x => x.id === _bed.type);
  root.innerHTML = `
    <h1 class="page">Progress</h1>
    <p class="hint" style="margin:-4px 0 14px">Läses direkt ur DOPS-appens databas (moradops.se). Nya bedömningar görs i DOPS-appen tills registreringen slås på här.</p>
    ${picker ? `<div class="card">${picker}</div>` : ''}
    ${!types.length ? `<div class="card"><p class="muted" style="margin:0">${_bed.recipient === people.self.id ? 'Du har' : esc(data.recipient.name) + ' har'} inga bedömningar i DOPS än.</p></div>` : `
    <div class="card">
      <h2 style="margin-top:0">${esc(data.recipient.name)}</h2>
      <div class="bed-types">${types.map(x => `<button type="button" class="bed-type${x.id === _bed.type ? ' on' : ''}" data-t="${esc(x.id)}">
        <strong>${esc(x.name)}</strong><span class="muted">${x.count} st · senast ${bedDate(x.last)}</span></button>`).join('')}</div>
    </div>
    ${t ? bedTypeDetail(t) : ''}`}`;
  root.querySelector('.bed-types')?.addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    _bed.type = b.dataset.t; drawBedomningar(root);
  });
}

const bedAnswer = (a, q) => a.answers.find(x => x.question.trim().toLowerCase() === q.question.trim().toLowerCase())?.answer?.trim() || '';

function bedTypeDetail(t) {
  const list = t.assessments;   // äldst först
  const cards = t.questions.map(q => {
    if (q.type === 'skala') return bedScale(q, list);
    if (q.type === 'radio' && q.options.length) return bedRadio(q, list);
    return '';
  }).filter(Boolean);
  const scaleOrRadio = new Set(t.questions.filter(q => q.type === 'skala' || q.type === 'radio').map(q => q.question.trim().toLowerCase()));
  const free = t.questions.filter(q => !scaleOrRadio.has(q.question.trim().toLowerCase()))
    .map(q => ({ q, items: list.map(a => ({ a, text: bedAnswer(a, q) })).filter(x => x.text.length > 2 && !/^\d+(\.\d+)?$/.test(x.text)).reverse() }))
    .filter(x => x.items.length);
  return `
    ${cards.length ? `<div class="bed-grid">${cards.join('')}</div>` : ''}
    ${free.length ? `<div class="card"><h2 style="margin-top:0">Fritextsvar</h2>${free.map(({ q, items }) => `
      <div class="bed-q">${esc(q.question)}</div>
      ${items.map(({ a, text }) => `<div class="bed-free"><div class="muted">${bedDate(a.at)}${a.registrar ? ' · ' + esc(a.registrar) : ''}</div>${esc(text)}</div>`).join('')}`).join('')}
    </div>` : ''}
    <div class="card">
      <h2 style="margin-top:0">Alla bedömningar (${list.length})</h2>
      ${[...list].reverse().map(a => `<details class="bed-one"><summary><strong>${bedDate(a.at)}</strong> <span class="muted">${a.registrar ? esc(a.registrar) : 'Okänd bedömare'}</span></summary>
        <table class="bed-ans">${a.answers.filter(x => x.answer.trim()).map(x => `<tr><th>${esc(x.question)}</th><td>${esc(x.answer)}</td></tr>`).join('')}</table></details>`).join('')}
    </div>`;
}

// Skalfråga: värden över tid som en enkel kurva (SVG), medelvärde och skalans steg ur beskrivningen ("1: … | 5: …").
function bedScale(q, list) {
  const pts = list.map(a => ({ at: new Date(a.at).getTime(), v: parseFloat(bedAnswer(a, q)) })).filter(p => !isNaN(p.v));
  if (!pts.length) return '';
  const nums = [...q.description.matchAll(/(\d+):/g)].map(m => +m[1]);
  const lo = Math.min(nums.length ? Math.min(...nums) : 1, ...pts.map(p => p.v)), hi = Math.max(nums.length ? Math.max(...nums) : 5, ...pts.map(p => p.v));
  const avg = pts.reduce((s, p) => s + p.v, 0) / pts.length;
  const W = 300, H = 90, P = 8;
  const t0 = pts[0].at, t1 = pts[pts.length - 1].at;
  const x = at => t1 === t0 ? W / 2 : P + (at - t0) / (t1 - t0) * (W - 2 * P);
  const y = v => hi === lo ? H / 2 : H - P - (v - lo) / (hi - lo) * (H - 2 * P);
  const line = pts.map(p => `${x(p.at).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const steps = q.description.split('|').map(s => s.trim()).filter(s => /^\d+:\s*\S/.test(s));
  return `<div class="card bed-card">
      <div class="bed-head"><strong>${esc(q.question)}</strong><span class="muted">n=${pts.length}</span><span class="bed-avg">⌀ ${avg.toFixed(1).replace('.', ',')}</span></div>
      <svg viewBox="0 0 ${W} ${H}" class="bed-svg" role="img" aria-label="${esc(q.question)}: ${pts.map(p => p.v).join(', ')}">
        <line x1="${P}" x2="${W - P}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" class="bed-avgline"/>
        <polyline points="${line}" class="bed-line"/>
        ${pts.map(p => `<circle cx="${x(p.at).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" class="bed-dot"><title>${bedDate(p.at)}: ${p.v}</title></circle>`).join('')}
      </svg>
      <div class="bed-axis muted"><span>${bedDate(t0)}</span><span>${lo}–${hi}</span><span>${bedDate(t1)}</span></div>
      ${steps.length ? `<div class="muted bed-steps">${steps.map(esc).join(' · ')}</div>` : ''}
    </div>`;
}

// Flervalsfråga: hur ofta varje alternativ angetts, i formulärets ordning, och det senaste svaret.
function bedRadio(q, list) {
  const answers = list.map(a => bedAnswer(a, q)).filter(Boolean);
  if (!answers.length) return '';
  const max = Math.max(...q.options.map(o => answers.filter(a => a === o).length), 1);
  return `<div class="card bed-card">
      <div class="bed-head"><strong>${esc(q.question)}</strong><span class="muted">n=${answers.length}</span><span class="muted">senast: ${esc(answers[answers.length - 1])}</span></div>
      ${q.options.map(o => { const n = answers.filter(a => a === o).length; return `<div class="bed-bar"><span>${esc(o)}</span><div><i style="width:${(n / max * 100).toFixed(0)}%"></i></div><span>${n}</span></div>`; }).join('')}
    </div>`;
}

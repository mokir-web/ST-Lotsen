// ── Planering → Veckoschema → Importera jobbschema ────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), toast(), showStatus(), isoWeek(), todayStockholm(),
// js/import.js (OpjourImport.readTable), js/jobschema.js (OpjourJobSchedule) och js/schema.js (reloadSchema).
// Global entry: openJobImport(). Bara studierektor och admin (servern kontrollerar).
//
// 1. Välj filen (läses i webbläsaren). 2. Personerna i filen matchas mot ST-läkarna — övriga läkare hoppas över.
// 3. Koderna översätts till aktivitetstyper (klinikens sparade val, annars förslag). 4. Fynden per person och vecka granskas
// ett i taget: Acceptera (eller vid krock: Lägg till också / Ersätt) sparar posten direkt; Avvisa hoppar över den.
// Det som redan finns i veckoschemat visas bara. Inget läggs in utan att studierektorn klickat.

let _job = null;
const JS = () => window.OpjourJobSchedule;

function openJobImport() {
  _job = { step: 'file' };
  drawJobPanel();
}

// Veckoschemat bakom panelen ritas om om något lagts till.
function closeJobImport() {
  const changed = _job?.done;
  el('sheet-root')?.remove(); _job = null;
  if (changed) reloadSchema().catch(err => toast(err.message, 'err'));
}

async function onJobFile(file) {
  if (!file) return;
  const box = el('job-status');
  box.textContent = 'Läser filen…'; box.className = 'status';
  try {
    const table = await OpjourImport.readTable(file);
    const parsed = JS().parseJobSchedule(table, { today: todayStockholm(), fileName: file.name });
    const from = JS().mondayOf(parsed.dates[0]);
    const weeks = Math.min(104, Math.ceil((new Date(parsed.dates.at(-1)) - new Date(from)) / (7 * 86400000)) + 1);
    const data = await api(`/schema?from=${from}&weeks=${weeks}`);
    const matched = JS().matchPeople(parsed.people, data.people);
    const pick = new Map(parsed.people.map(p => [p.name, matched.get(p.name) || '']));
    // Sparade val som pekar på typer eller krav som inaktiverats gäller inte längre.
    const typeOk = new Set(data.types.filter(t => t.active).map(t => t.id)), reqOk = new Set(data.requirements.filter(r => r.active).map(r => r.id));
    const map = {};
    for (const [code, m] of Object.entries(data.jobImportMap || {}))
      map[code] = { typeId: typeOk.has(m.typeId) ? m.typeId : null, requirementId: reqOk.has(m.requirementId) ? m.requirementId : null, minDays: m.minDays || 3 };
    _job = { step: 'review', fileName: file.name, parsed, data, pick, map, suggested: new Set(), rejected: new Set(), added: new Set(), done: 0 };
    jobFillSuggestions();
    drawJobPanel();
  } catch (err) { showStatus(box, err.message, false); }
}

// Koder som saknas i klinikens översättning får ett förslag (eller "ignoreras").
function jobFillSuggestions() {
  const { data, map } = _job;
  for (const { code } of JS().codeCounts(jobPeople())) {
    if (code in map) continue;
    const s = JS().suggest(code, data.types, data.requirements);
    map[code] = s || { typeId: null, requirementId: null, minDays: 3 };
    _job.suggested.add(code);
  }
}

// Personer i filen som ska importeras: [{ ...person, userId }].
const jobPeople = () => _job.parsed.people.filter(p => _job.pick.get(p.name)).map(p => ({ ...p, userId: _job.pick.get(p.name) }));

const jobWeeks = (a, b) => a === b ? `v${isoWeek(a)} ${a.slice(0, 4)}` : `v${isoWeek(a)}${a.slice(0, 4) === b.slice(0, 4) ? '' : ' ' + a.slice(0, 4)}–v${isoWeek(b)} ${b.slice(0, 4)}`;
function jobLabel(x) {
  const t = _job.data.types.find(t => t.id === x.typeId), r = x.requirementId && _job.data.requirements.find(r => r.id === x.requirementId);
  return (t ? t.code : '?') + (r ? ': ' + r.name : x.detail ? ': ' + x.detail : '');
}

// Alla förslag med jämförelse mot befintliga poster.
function jobProposals() {
  const { parsed, data, map } = _job;
  const out = [];
  for (const p of jobPeople()) {
    const existing = data.activities.filter(a => a.userId === p.userId);
    for (const x of JS().proposals(p, parsed.dates, map))
      for (const part of JS().compare(x, existing)) {
        const key = [p.userId, part.typeId, part.requirementId || '', part.weekFrom].join('|');
        out.push({ ...part, key, userId: p.userId, person: p.name, rejected: _job.rejected.has(key) });
      }
  }
  return out;
}

function drawJobPanel() {
  const j = _job;
  let body, foot = '';
  if (j.step === 'file') {
    body = `<p class="hint" style="margin-top:8px">Exportera jobbschemat som Excel (.xlsx) med en kolumn per dag och välj filen här. Den läses i din webbläsare —
      bara de färdiga veckoposterna sparas. Läkare som inte är ST-läkare i appen hoppas över.</p>
      <input type="file" accept=".xlsx" onchange="onJobFile(this.files[0])">
      <div class="status" id="job-status"></div>`;
  } else {
    const { parsed, data, pick, map } = j;
    const users = data.people;
    const shown = parsed.people.filter(p => pick.get(p.name) || JS().isStGroup(p.group));
    const nSel = shown.filter(p => pick.get(p.name)).length;
    const personRows = shown.map(p => `<tr><td>${esc(p.name)}<br><span class="muted" style="font-size:12px">${esc(p.group)}</span></td>
      <td><select data-jp="${esc(String(parsed.people.indexOf(p)))}"><option value="">– hoppa över –</option>${users.map(u =>
        `<option value="${esc(u.id)}"${pick.get(p.name) === u.id ? ' selected' : ''}>${esc(u.displayName)}</option>`).join('')}</select></td></tr>`).join('');

    const codes = JS().codeCounts(jobPeople());
    const typeOpts = sel => `<option value="">Ignoreras</option>` + data.types.filter(t => t.active).map(t =>
      `<option value="${esc(t.id)}"${sel === t.id ? ' selected' : ''}>${esc(t.code)} · ${esc(t.label)}</option>`).join('');
    const reqOpts = sel => `<option value="">Inget krav</option>` + data.requirements.filter(r => r.active).map(r =>
      `<option value="${esc(r.id)}"${sel === r.id ? ' selected' : ''}>${esc(r.category)}: ${esc(r.name)}</option>`).join('');
    const codeRow = ({ code, days }) => {
      const m = map[code], i = codes.findIndex(c => c.code === code);
      return `<tr${m.typeId ? '' : ' class="muted"'}><td>${esc(code)}${j.suggested.has(code) && m.typeId ? ' <span class="pchip st-plan" title="Förslag — sparas när du importerar">förslag</span>' : ''}<br>
        <span class="muted" style="font-size:12px">${days} dagar</span></td>
        <td><select data-jt="${i}">${typeOpts(m.typeId)}</select>${m.typeId ? `<select data-jr="${i}" style="margin-top:4px">${reqOpts(m.requirementId)}</select>` : ''}</td>
        <td>${m.typeId ? `<input type="number" min="1" max="7" value="${esc(String(m.minDays || 3))}" data-jd="${i}" style="width:64px" title="Minsta antal dagar i veckan">` : ''}</td></tr>`;
    };
    const mapped = codes.filter(c => map[c.code].typeId), ignored = codes.filter(c => !map[c.code].typeId);

    const props = jobProposals();
    const pending = props.filter(x => x.kind !== 'same' && !x.rejected);
    const byPerson = new Map();
    for (const x of props) { if (!byPerson.has(x.person)) byPerson.set(x.person, []); byPerson.get(x.person).push(x); }
    const btn = (cls, attrs, label) => `<button type="button" class="${cls}" style="padding:5px 10px;font-size:13px" ${attrs}>${label}</button>`;
    const propRow = x => {
      const what = `<strong>${esc(jobLabel(x))}</strong> ${esc(jobWeeks(x.weekFrom, x.weekTo))}<br><span class="muted" style="font-size:12px">${esc(x.codes.join(', '))}</span>`;
      const k = esc(x.key);
      if (x.kind === 'same') return _job.added.has(x.key) ? `<li>${what} · <span class="pchip st-klart">✓ tillagd</span></li>` : `<li class="muted">${what} · finns i veckoschemat</li>`;
      if (x.rejected) return `<li class="muted">${what} · avvisad ${btn('link-btn', `data-ju="${k}"`, 'Ångra')}</li>`;
      if (x.kind === 'new') return `<li>${what}<div class="row" style="gap:6px;margin-top:4px">${btn('btn', `data-ja="${k}" data-mode="add"`, 'Acceptera')}${btn('btn-ghost', `data-jx="${k}"`, 'Avvisa')}</div></li>`;
      const others = x.with.map(a => `${jobLabel(a)} ${jobWeeks(a.weekFrom, a.weekTo)}`).join(', ');
      return `<li>${what}<br><span style="font-size:13px">Krockar med <strong>${esc(others)}</strong></span>
        <div class="row" style="gap:6px;margin-top:4px;flex-wrap:wrap">${btn('btn', `data-ja="${k}" data-mode="add"`, 'Lägg till också')}${btn('btn-ghost', `data-ja="${k}" data-mode="replace"`, 'Ersätt veckorna')}${btn('btn-ghost', `data-jx="${k}"`, 'Avvisa')}</div></li>`;
    };

    body = `<p class="hint" style="margin-top:8px">${esc(j.fileName)} · ${esc(jobWeeks(JS().mondayOf(parsed.dates[0]), JS().mondayOf(parsed.dates.at(-1))))}</p>
      <h3>ST-läkare (${nSel})</h3>
      <p class="hint" style="margin-top:0">Namnen i filen matchas mot ST-läkarna. ${parsed.people.length - shown.length} läkare i andra grupper hoppas över.</p>
      <table class="tbl job-tbl">${personRows}</table>
      <h3>Koder → aktivitetstyper</h3>
      <p class="hint" style="margin-top:0">En kod blir en post för veckan när den finns minst så många dagar (mån–sön). Vanligt kliniskt arbete (avdelning, mottagning, jour) ignoreras — då är man i tjänst. Valen sparas till nästa import.</p>
      <table class="tbl job-tbl">${mapped.map(codeRow).join('')}</table>
      <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Övriga koder som ignoreras (${ignored.length})</summary>
        <table class="tbl job-tbl">${ignored.map(codeRow).join('')}</table></details>
      <h3>Fynd att granska (${pending.length} kvar${j.done ? ` · ${j.done} tillagda` : ''})</h3>
      <p class="hint" style="margin-top:0">Gå igenom fynden ett i taget. <strong>Acceptera</strong> sparar posten i veckoschemat direkt; <strong>Avvisa</strong> hoppar över den.
        Vid krock: <strong>Lägg till också</strong> behåller det som finns, <strong>Ersätt veckorna</strong> tar bort just de veckorna ur den befintliga posten (resten behålls).</p>
      ${[...byPerson].map(([name, xs]) => `<p style="margin:10px 0 2px"><strong>${esc(name)}</strong></p><ul class="job-list">${xs.map(propRow).join('')}</ul>`).join('')
        || '<p class="muted">Inga veckor med översatta koder.</p>'}`;
    foot = `<button class="btn${pending.length ? '-ghost' : ''}" onclick="closeJobImport()">${pending.length ? 'Stäng' : 'Klar'}</button>
      <span class="muted" style="font-size:13px">${pending.length ? `${pending.length} fynd kvar att granska` : 'Alla fynd är granskade.'}</span><div class="status" id="job-status"></div>`;
  }
  const scroll = el('sheet-root')?.querySelector('.sp-body')?.scrollTop || 0;
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel wide" role="dialog" aria-label="Importera jobbschema">
    <div class="sp-head"><h2 style="margin:0">Importera jobbschema</h2><button class="btn-ghost" onclick="closeJobImport()" aria-label="Stäng">✕</button></div>
    <div class="sp-body">${body}</div>${foot ? `<div class="sp-foot">${foot}</div>` : ''}</aside>`;
  root.addEventListener('click', e => { if (e.target === root) closeJobImport(); });
  root.addEventListener('change', onJobChange);
  root.addEventListener('click', onJobClick);
  document.body.appendChild(root);
  root.querySelector('.sp-body').scrollTop = scroll;
}

function onJobChange(e) {
  const t = e.target, d = t.dataset, codes = _job.step === 'review' ? JS().codeCounts(jobPeople()) : [];
  if (d.jp !== undefined) {
    _job.pick.set(_job.parsed.people[Number(d.jp)].name, t.value);
    jobFillSuggestions();
  } else if (d.jt !== undefined) {
    const m = _job.map[codes[Number(d.jt)].code];
    m.typeId = t.value || null; m.requirementId = null;
  } else if (d.jr !== undefined) {
    _job.map[codes[Number(d.jr)].code].requirementId = t.value || null;
  } else if (d.jd !== undefined) {
    const n = Number(t.value);
    if (Number.isInteger(n) && n >= 1 && n <= 7) _job.map[codes[Number(d.jd)].code].minDays = n;
  } else return;
  drawJobPanel();
}

function onJobClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.ja) acceptJob(d.ja, d.mode, b);
  else if (d.jx) { _job.rejected.add(d.jx); drawJobPanel(); }
  else if (d.ju) { _job.rejected.delete(d.ju); drawJobPanel(); }
}

// Ett fynd accepteras: posten sparas direkt. "Ersätt" tar bara bort de krockande veckorna ur de befintliga posterna —
// resten av en befintlig post (före och efter) läggs tillbaka med samma typ, krav, detalj och status. Allt i en transaktion.
async function acceptJob(key, mode, button) {
  const x = jobProposals().find(p => p.key === key);
  if (!x) return;
  const keep = [];
  if (mode === 'replace') {
    for (const a of x.with) {
      const rest = { userId: a.userId, typeId: a.typeId, requirementId: a.requirementId, detail: a.detail, status: a.status };
      if (a.weekFrom < x.weekFrom) keep.push({ ...rest, weekFrom: a.weekFrom, weekTo: JS().addDays(x.weekFrom, -7) });
      if (a.weekTo > x.weekTo) keep.push({ ...rest, weekFrom: JS().addDays(x.weekTo, 7), weekTo: a.weekTo });
    }
    const what = x.with.map(a => `${jobLabel(a)} ${jobWeeks(a.weekFrom, a.weekTo)}`).join(', ');
    if (!confirm(`${jobWeeks(x.weekFrom, x.weekTo)} i ${what} ersätts med ${jobLabel(x)}. Resten av ${x.with.length === 1 ? 'posten' : 'posterna'} behålls.`)) return;
  }
  const replaceIds = mode === 'replace' ? x.with.map(a => a.id) : [];
  button.disabled = true;
  try {
    // Översättningen sparas också: översatta koder och koder där ett förslag valts bort (annars kommer förslaget tillbaka nästa gång).
    const { data } = _job;
    const map = Object.fromEntries(Object.entries(_job.map).filter(([code, m]) => m.typeId || JS().suggest(code, data.types, data.requirements)).slice(0, 500));
    const item = { userId: x.userId, typeId: x.typeId, requirementId: x.requirementId, weekFrom: x.weekFrom, weekTo: x.weekTo };
    const r = await api('/schema/import', { method: 'POST', body: { items: [item, ...keep], replaceIds, map } });
    data.activities = data.activities.filter(a => !replaceIds.includes(a.id)).concat(r.activities || []);
    _job.done++; _job.added.add(key); _job.suggested.clear();
    drawJobPanel();
  } catch (err) {
    button.disabled = false;
    const box = el('job-status'); box.textContent = err.message; box.className = 'status err';
  }
}

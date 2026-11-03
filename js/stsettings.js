// ── ST-inställningar (#/st) ──────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(). Global entry: renderStSettings(root).
//
// Klinikens egna inställningar för veckoschemat (plattform_plan.md §3, §5): aktivitetstyper (kod, namn, färg, påverkan på
// "I tjänst", ger måluppfyllelse) och krav (kategori, namn, randning/ort, längd, undantag för i tjänst, ST-år, obligatoriskt).
// För studierektor och admin. Inget raderas — inaktivera i stället, så att befintliga schemaposter behåller sin betydelse.

let _sts = null;

const EFFECT_LABEL = { i_tjanst: 'I tjänst', ej_i_tjanst: 'Ej i tjänst', neutral: 'Neutral (påverkar inte)' };
const effectOptions = (sel, inherit) =>
  (inherit ? `<option value=""${!sel ? ' selected' : ''}>Ärv från typen</option>` : '')
  + Object.entries(EFFECT_LABEL).map(([v, l]) => `<option value="${v}"${sel === v ? ' selected' : ''}>${l}</option>`).join('');

async function renderStSettings(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!(me.isDirector || me.isAdmin)) { location.hash = '#/'; return; }
    _sts = { me, cfg: await api('/admin/st/config') };
    drawStSettings(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadStSettings(msg) {
  const y = window.scrollY;
  _sts.cfg = await api('/admin/st/config');
  drawStSettings(el('view'));
  window.scrollTo(0, y);
  if (msg) { const b = el(msg.box); if (b) { b.textContent = msg.text; b.className = 'status ok'; } }
}

function typeRow(t) {
  return `<tr data-id="${esc(t.id)}"${t.active ? '' : ' class="inactive"'}>
    <td><input type="text" data-f="code" value="${esc(t.code)}" maxlength="20" style="width:90px"></td>
    <td><input type="text" data-f="label" value="${esc(t.label)}" maxlength="40"></td>
    <td><input type="color" data-f="color" value="${esc(t.color)}"></td>
    <td><select data-f="serviceEffect">${effectOptions(t.serviceEffect)}</select></td>
    <td style="text-align:center"><input type="checkbox" data-f="givesProgress"${t.givesProgress ? ' checked' : ''}></td>
    <td style="text-align:center"><input type="checkbox" data-f="active"${t.active ? ' checked' : ''}></td>
    <td><button class="btn-ghost" data-a="save-type">Spara</button></td>
  </tr>`;
}

function reqRow(r) {
  return `<tr data-id="${esc(r.id)}"${r.active ? '' : ' class="inactive"'}>
    <td><input type="text" data-f="category" value="${esc(r.category)}" maxlength="40" style="width:100px"></td>
    <td><input type="text" data-f="name" value="${esc(r.name)}" maxlength="60" style="width:120px"></td>
    <td style="text-align:center"><input type="checkbox" data-f="away"${r.away ? ' checked' : ''}></td>
    <td><input type="text" data-f="location" value="${esc(r.location || '')}" maxlength="60" style="width:90px"></td>
    <td><input type="number" data-f="weeks" value="${r.weeks ?? ''}" min="1" max="104" style="width:64px"></td>
    <td><select data-f="serviceEffect">${effectOptions(r.serviceEffect, true)}</select></td>
    <td><input type="number" data-f="stYear" value="${r.stYear ?? ''}" min="1" max="6" style="width:56px"></td>
    <td style="text-align:center"><input type="checkbox" data-f="mandatory"${r.mandatory ? ' checked' : ''}></td>
    <td style="text-align:center"><input type="checkbox" data-f="active"${r.active ? ' checked' : ''}></td>
    <td><button class="btn-ghost" data-a="save-req">Spara</button></td>
  </tr>`;
}

function drawStSettings(root) {
  const { types, requirements } = _sts.cfg;
  const cats = [...new Set(requirements.map(r => r.category))];
  root.innerHTML = `
    <h1 class="page">ST-inställningar</h1>

    <div class="card">
      <h2>Aktivitetstyper</h2>
      <p class="hint" style="margin-top:0">Kodorden i veckoschemat. <strong>Påverkan</strong> styr raden "I tjänst": en vecka med någon aktivitet som är
        <em>ej i tjänst</em> räknas bort; <em>neutral</em> (t.ex. Körkort) påverkar inte. <strong>Mål</strong> = aktiviteten kan kopplas till ett krav.</p>
      ${types.length ? `<div class="sch-scroll"><table class="imp-table st-table">
        <thead><tr><th>Kod</th><th>Namn</th><th>Färg</th><th>Påverkan på i tjänst</th><th>Mål</th><th>Aktiv</th><th></th></tr></thead>
        <tbody id="st-types">${types.map(typeRow).join('')}</tbody>
      </table></div>`
      : `<p>Kliniken har inga aktivitetstyper än.</p>
         <button class="btn" onclick="addDefaultTypes()">Lägg in standardtyperna</button>
         <p class="hint">Rand, Kurs, Körkort, Projekt, Natt, FoU, Frv (frånvaro), FL, Idre och Admin — med Morakirurgens påverkan på i tjänst. Allt går att ändra efteråt.</p>`}
      <div class="status" id="st-types-status"></div>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">Ny aktivitetstyp</summary>
        <div class="field-row">
          <div><label for="nt-code">Kod</label><input type="text" id="nt-code" maxlength="20" placeholder="t.ex. Rand"></div>
          <div><label for="nt-label">Namn</label><input type="text" id="nt-label" maxlength="40" placeholder="t.ex. Randning"></div>
        </div>
        <div class="field-row">
          <div><label for="nt-color">Färg</label><input type="color" id="nt-color" value="#9aa5ad"></div>
          <div><label for="nt-effect">Påverkan på i tjänst</label><select id="nt-effect">${effectOptions('ej_i_tjanst')}</select></div>
        </div>
        <label class="row" style="gap:8px;font-weight:normal;margin-top:10px"><input type="checkbox" id="nt-progress"> Kan kopplas till krav (måluppfyllelse)</label>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="addType()">Lägg till</button></div>
        <div class="status err" id="nt-status"></div>
      </details>
    </div>

    <div class="card">
      <h2>Krav</h2>
      <p class="hint" style="margin-top:0">Det som ska uppnås: körkort, kurser, randningar, projekt — i valfria kategorier. <strong>Randning</strong> = görs utanför
        egna kliniken (ort visas i schemat). <strong>I tjänst</strong>: lämna "Ärv från typen" om inte just detta krav ska räknas annorlunda
        (t.ex. Randning Kolo som görs på egna kliniken och därför räknas som i tjänst). <strong>Veckor</strong> fylls i automatiskt i schemat.</p>
      ${requirements.length ? `<div class="sch-scroll"><table class="imp-table st-table">
        <thead><tr><th>Kategori</th><th>Namn</th><th>Randning</th><th>Ort</th><th>Veckor</th><th>I tjänst</th><th>ST-år</th><th>Obligat.</th><th>Aktiv</th><th></th></tr></thead>
        <tbody id="st-reqs">${cats.map(c => requirements.filter(r => r.category === c).map(reqRow).join('')).join('')}</tbody>
      </table></div>` : '<p class="muted">Inga krav än.</p>'}
      <div class="status" id="st-reqs-status"></div>
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">Nytt krav</summary>
        <div class="field-row">
          <div><label for="nr-cat">Kategori</label><input type="text" id="nr-cat" maxlength="40" list="nr-cats" placeholder="t.ex. Randning">
            <datalist id="nr-cats">${['Körkort', 'Kurs', 'Randning', 'Projekt', 'Bedömning', ...cats].filter((v, i, a) => a.indexOf(v) === i).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div><label for="nr-name">Namn</label><input type="text" id="nr-name" maxlength="60" placeholder="t.ex. Uro Falun"></div>
        </div>
        <div class="field-row">
          <div><label for="nr-loc">Ort (vid randning)</label><input type="text" id="nr-loc" maxlength="60"></div>
          <div><label for="nr-weeks">Veckor</label><input type="number" id="nr-weeks" min="1" max="104"></div>
          <div><label for="nr-effect">I tjänst</label><select id="nr-effect">${effectOptions(null, true)}</select></div>
        </div>
        <label class="row" style="gap:8px;font-weight:normal;margin-top:10px"><input type="checkbox" id="nr-away"> Randning (utanför egna kliniken)</label>
        <label class="row" style="gap:8px;font-weight:normal"><input type="checkbox" id="nr-mand" checked> Obligatoriskt</label>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="addReq()">Lägg till</button></div>
        <div class="status err" id="nr-status"></div>
      </details>
    </div>`;

  root.querySelectorAll('.st-table').forEach(t => t.addEventListener('click', onStTableClick));
}

const rowVal = (tr, f) => { const n = tr.querySelector(`[data-f="${f}"]`); return n.type === 'checkbox' ? n.checked : n.value; };

async function onStTableClick(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const tr = btn.closest('tr'), id = tr.dataset.id, isType = btn.dataset.a === 'save-type';
  const box = el(isType ? 'st-types-status' : 'st-reqs-status');
  const body = isType
    ? Object.fromEntries(['code', 'label', 'color', 'serviceEffect', 'givesProgress', 'active'].map(f => [f, rowVal(tr, f)]))
    : Object.fromEntries(['category', 'name', 'away', 'location', 'weeks', 'serviceEffect', 'stYear', 'mandatory', 'active'].map(f => [f, rowVal(tr, f)]));
  try {
    await api(`/admin/st/${isType ? 'types' : 'requirements'}/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    await reloadStSettings({ box: box.id, text: `Sparat: ${body.code || body.name}.` });
  } catch (err) { box.textContent = err.message; box.className = 'status err'; }
}

async function addDefaultTypes() {
  try {
    await api('/admin/st/types/defaults', { method: 'POST' });
    await reloadStSettings({ box: 'st-types-status', text: 'Standardtyperna är inlagda.' });
  } catch (err) { const b = el('st-types-status'); b.textContent = err.message; b.className = 'status err'; }
}

async function addType() {
  try {
    await api('/admin/st/types', { method: 'POST', body: {
      code: el('nt-code').value, label: el('nt-label').value, color: el('nt-color').value,
      serviceEffect: el('nt-effect').value, givesProgress: el('nt-progress').checked
    } });
    await reloadStSettings({ box: 'st-types-status', text: 'Aktivitetstypen är tillagd.' });
  } catch (err) { el('nt-status').textContent = err.message; }
}

async function addReq() {
  try {
    await api('/admin/st/requirements', { method: 'POST', body: {
      category: el('nr-cat').value, name: el('nr-name').value, location: el('nr-loc').value, weeks: el('nr-weeks').value,
      serviceEffect: el('nr-effect').value, away: el('nr-away').checked, mandatory: el('nr-mand').checked
    } });
    await reloadStSettings({ box: 'st-reqs-status', text: 'Kravet är tillagt.' });
  } catch (err) { el('nr-status').textContent = err.message; }
}

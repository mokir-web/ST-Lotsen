// ── ST-utbildning → Inställningar (#/st/<flik>) och Planering → Inställningar (#/schema/installningar) ──
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(). Global entry: renderStSettings(root).
//
// Klinikens egna inställningar för veckoschemat (plattform_plan.md §3, §5): aktivitetstyper (kod, namn, färg, påverkan på
// "I tjänst", ger måluppfyllelse) och krav (kategori, namn, randning/ort, längd, undantag för i tjänst, ST-år, obligatoriskt).
// För studierektor och admin. Inget raderas — inaktivera i stället, så att befintliga schemaposter behåller sin betydelse.
// ST-flikar: Krav, Delmål (målbeskrivning + vilka delmål kraven täcker) och ST-läkare (ST-uppgifter och handledare).
// Planeringens inställningar (bemanning och aktivitetstyper) använder samma kod med page = 'plan'.

let _sts = null;

const EFFECT_LABEL = { i_tjanst: 'I tjänst', ej_i_tjanst: 'Ej i tjänst', neutral: 'Neutral (påverkar inte)' };
const effectOptions = (sel, inherit) =>
  (inherit ? `<option value=""${!sel ? ' selected' : ''}>Ärv från typen</option>` : '')
  + Object.entries(EFFECT_LABEL).map(([v, l]) => `<option value="${v}"${sel === v ? ' selected' : ''}>${l}</option>`).join('');

const STS_TABS = [['krav', 'Krav'], ['delmal', 'Delmål'], ['personer', 'ST-läkare och handledare']];

async function renderStSettings(root, tab, page = 'st') {
  if (page === 'st' && tab === 'typer') { location.hash = '#/schema/installningar'; return; }   // gamla länkar
  if (page === 'st' && !STS_TABS.some(t => t[0] === tab)) tab = 'krav';
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!(me.isDirector || me.isAdmin)) { location.hash = '#/'; return; }
    const [cfg, fw, ppl] = await Promise.all([api('/admin/st/config'), api('/goals/frameworks?goals=1'), tab === 'personer' ? api('/admin/st/people') : null]);
    _sts = { me, cfg, frameworks: fw.frameworks, tab, page, people: ppl?.people || null };
    drawStSettings(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadStSettings(msg) {
  const y = window.scrollY;
  [_sts.cfg, _sts.people] = await Promise.all([api('/admin/st/config'), _sts.tab === 'personer' ? api('/admin/st/people').then(r => r.people) : null]);
  drawStSettings(el('view'));
  window.scrollTo(0, y);
  if (msg) showStatus(el(msg.box), msg.text, true);
}

// Aktivitetstyper som kort (5f): påverkan på "I tjänst" med tre knappar, klicka för att ändra i panelen, dra (eller ↑↓) för ordningen.
const EFFECT_SHORT = [['i_tjanst', 'I tjänst'], ['ej_i_tjanst', 'Ej i tjänst'], ['neutral', 'Påverkar inte']];
function typeCard(t) {
  return `<div class="tcard${t.active ? '' : ' inactive'}" data-id="${esc(t.id)}" draggable="true">
    <span class="tgrip" title="Dra för att ändra ordningen" aria-hidden="true">⋮⋮</span>
    <button type="button" class="tmain" data-t="edit" title="Ändra">
      <span class="sact" style="--c:${esc(t.color)}">${esc(t.code)}</span> <span class="tlabel">${esc(t.label)}</span>
      ${t.givesProgress ? '<span class="tagchip">Krav</span>' : ''}${t.active ? '' : '<span class="tagchip">Inaktiv</span>'}
    </button>
    <div class="seg sm" role="group" aria-label="Påverkan på i tjänst">${EFFECT_SHORT.map(([v, l]) => `<button type="button" data-t="effect" data-e="${v}"${t.serviceEffect === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>${l}</button>`).join('')}</div>
    <span class="tmove"><button type="button" class="btn-ghost" data-t="up" aria-label="Flytta upp">↑</button><button type="button" class="btn-ghost" data-t="down" aria-label="Flytta ned">↓</button></span>
  </div>`;
}

const stsDefaultGoals = () => (_sts.frameworks.find(f => f.id === _sts.cfg.defaultFrameworkId) || { goals: [] }).goals;

function drawStSettings(root) {
  const { tab } = _sts;
  root.innerHTML = _sts.page === 'plan' ? `
    <h1 class="page">Inställningar för planering</h1>
    ${stsTypesTab()}` : `
    <h1 class="page">Inställningar för ST-utbildning</h1>
    <nav class="subtabs" aria-label="Flikar">${STS_TABS.map(([k, l]) => `<a href="#/st/${k}"${k === tab ? ' class="active" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${tab === 'delmal' ? stsGoalsTab() : tab === 'personer' ? stsPeopleTab() : stsReqTab()}`;
  attachTypeCards(root);
  attachYearBoard(root, { onMove: moveReq, onEdit: id => openReqPanel(id), onAdd: y => openReqPanel(null, y) });
  root.querySelectorAll('.stp').forEach(t => t.addEventListener('click', onStPeopleClick));
}

function stsTypesTab() {
  const { types, minInService } = _sts.cfg;
  return `
    <div class="card">
      <h2>Bemanning</h2>
      <p class="hint" style="margin-top:0">Minsta antal ST-läkare i tjänst per vecka. Raden "I tjänst" i veckoschemat och på startsidan blir röd när
        antalet är lägre. Lämna tomt för ingen varning.</p>
      <div class="row" style="gap:8px;align-items:flex-end">
        <div><label for="st-min" style="margin-top:0">Minst i tjänst</label><input type="number" id="st-min" min="0" max="99" value="${minInService ?? ''}" style="max-width:120px"></div>
        <button class="btn" onclick="saveMinInService()">Spara</button>
      </div>
      <div class="status" id="st-min-status"></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <p class="hint" style="margin:0;flex:1 1 300px"><strong>Aktivitetstyper</strong> är kodorden i veckoschemat. Knapparna styr raden "I tjänst": en vecka med
          någon aktivitet som är <em>ej i tjänst</em> räknas bort; <em>påverkar inte</em> (t.ex. Körkort) räknas varken bort eller till.
          <strong>Krav</strong> = aktiviteten kan kopplas till ett krav. Klicka på en typ för att ändra, dra för att ändra ordningen i schemat.</p>
        ${types.length ? '<button class="btn" onclick="openTypePanel(null)">+ Ny typ</button>' : ''}
      </div>
      ${types.length ? `<div class="tcards" id="st-types">${types.map(typeCard).join('')}</div>`
      : `<div class="empty">
          <p><strong>Inga aktivitetstyper än.</strong> Börja med standardtyperna — allt går att ändra efteråt.</p>
          <p class="hint">Rand, Kurs, Körkort, Projekt, Natt, FoU, Frv (frånvaro), FL, Idre och Admin — med Morakirurgens påverkan på i tjänst.</p>
          <div class="row" style="gap:8px;justify-content:center"><button class="btn" onclick="addDefaultTypes()">Lägg in standardtyperna</button>
            <button class="btn-ghost" onclick="openTypePanel(null)">Egen typ</button></div>
        </div>`}
      <div class="status" id="st-types-status"></div>
    </div>`;
}

// Krav (K3): kraven per ST-år — samma vy som ST-läkaren ser i sin plan. Dra ett krav mellan åren, klicka för att ändra.
function stsReqTab() {
  const reqs = _sts.cfg.requirements, active = reqs.filter(r => r.active), inactive = reqs.filter(r => !r.active);
  const goals = stsDefaultGoals();
  const detail = r => {
    const tags = [r.away ? 'Randning' + (r.location ? ' · ' + r.location : '') : (r.location || ''), r.weeks ? r.weeks + ' v' : '',
      r.serviceEffect ? EFFECT_LABEL[r.serviceEffect].replace(' (påverkar inte)', '') : '',
      ...(r.goalIds || []).map(id => goals.find(g => g.id === id)?.code).filter(Boolean)].filter(Boolean);
    return tags.length ? `<div class="yb-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  };
  return `
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <p class="hint" style="margin:0;flex:1 1 300px">Klinikens mall: det som ska uppnås, per ST-år. ST-läkarna ser samma vy i sin utbildningsplan, med status.
          <strong>Dra</strong> ett krav till ett annat år, <strong>klicka</strong> för att ändra det (delmål, randning, längd, i tjänst). * = valfritt.</p>
        <button class="btn" onclick="openReqPanel(null, null)">+ Nytt krav</button>
      </div>
      <div class="status" id="st-reqs-status"></div>
      ${yearBoardHtml(active, { editable: true, detail })}
      ${inactive.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">Inaktiva krav (${inactive.length})</summary>
        <div class="yb-inactive">${inactive.map(r => `<button type="button" class="btn-ghost" onclick="openReqPanel('${esc(r.id)}')">${esc(r.category)} ${esc(r.name)}</button>`).join(' ')}</div></details>` : ''}
    </div>`;
}

function stsReqStatus(text, ok) { showStatus(el('st-reqs-status'), text, ok); }

async function moveReq(id, year) {
  const r = _sts.cfg.requirements.find(x => x.id === id);
  try {
    await api('/admin/st/requirements/' + encodeURIComponent(id), { method: 'PATCH', body: { stYear: year } });
    await reloadStSettings({ box: 'st-reqs-status', text: `${r.category} ${r.name} flyttat till ${year ? 'år ' + year : 'inget år'}.` });
  } catch (err) { await reloadStSettings(); stsReqStatus(err.message, false); }
}

// Panel från höger: ändra eller lägg till ett krav. year = förvalt ST-år för nytt krav.
function openReqPanel(id, year) {
  const r = id ? _sts.cfg.requirements.find(x => x.id === id) : { category: '', name: '', mandatory: true, active: true, away: false, stYear: year, goalIds: [] };
  const goals = stsDefaultGoals(), cats = [...new Set(['Körkort', 'Kurs', 'Randning', 'Projekt', ..._sts.cfg.requirements.map(x => x.category)])];
  const fw = _sts.frameworks.find(f => f.id === _sts.cfg.defaultFrameworkId);
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel" role="dialog" aria-label="${id ? 'Ändra krav' : 'Nytt krav'}">
    <div class="sp-head"><h2 style="margin:0">${id ? esc(r.category + ' ' + r.name) : 'Nytt krav'}</h2><button class="btn-ghost" onclick="closeReqPanel()" aria-label="Stäng">✕</button></div>
    <div class="sp-body">
      <h3>Grund</h3>
      <div class="field-row">
        <div><label for="rp-cat">Kategori</label><input type="text" id="rp-cat" maxlength="40" list="rp-cats" value="${esc(r.category)}" placeholder="t.ex. Randning">
          <datalist id="rp-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label for="rp-name">Namn</label><input type="text" id="rp-name" maxlength="60" value="${esc(r.name)}" placeholder="t.ex. Uro Falun"></div>
      </div>
      <label class="check"><input type="checkbox" id="rp-mand"${r.mandatory ? ' checked' : ''}> Obligatoriskt</label>
      ${id ? `<label class="check"><input type="checkbox" id="rp-active"${r.active ? ' checked' : ''}> Aktivt (inaktiva visas inte för ST-läkarna)</label>` : ''}

      <h3>ST-år</h3>
      <div class="seg" id="rp-year">${[1, 2, 3, 4, 5, 6, null].map(y => `<button type="button" data-y="${y ?? ''}" class="${(r.stYear ?? null) === y ? 'on' : ''}">${y ?? '–'}</button>`).join('')}</div>

      <h3>I schemat</h3>
      <label class="check"><input type="checkbox" id="rp-away"${r.away ? ' checked' : ''}> Randning — görs utanför egna kliniken</label>
      <div class="field-row">
        <div><label for="rp-loc">Ort</label><input type="text" id="rp-loc" maxlength="60" value="${esc(r.location || '')}"></div>
        <div><label for="rp-weeks">Veckor</label><input type="number" id="rp-weeks" min="1" max="104" value="${r.weeks ?? ''}"></div>
      </div>
      <label for="rp-effect">Räknas i "I tjänst" som</label>
      <select id="rp-effect">${effectOptions(r.serviceEffect, true)}</select>
      <p class="hint">Lämna "Ärv från typen" om inte just detta krav ska räknas annorlunda (t.ex. Randning Kolo på egna kliniken = i tjänst).</p>

      <h3>Delmål${fw ? ' · ' + esc(fw.label) : ''}</h3>
      ${goals.length ? `<input type="search" id="rp-gsearch" placeholder="Sök delmål…" oninput="filterReqGoals(this.value)" style="max-width:none">
        <div class="goalpick">${goals.map(g => `<label data-txt="${esc((g.code + ' ' + g.text).toLowerCase())}"><input type="checkbox" data-goal="${esc(g.id)}"${(r.goalIds || []).includes(g.id) ? ' checked' : ''}><b>${esc(g.code)}</b><span>${esc(g.text)}</span></label>`).join('')}</div>`
      : '<p class="hint">Välj en förvald målbeskrivning under fliken <a href="#/st/delmal">Delmål</a> för att koppla delmål.</p>'}
    </div>
    <div class="sp-foot"><button class="btn" onclick="saveReqPanel(${id ? `'${esc(id)}'` : 'null'})">${id ? 'Spara' : 'Lägg till'}</button>
      <button class="btn-ghost" onclick="closeReqPanel()">Avbryt</button><div class="status err" id="rp-status"></div></div>
  </aside>`;
  root.addEventListener('click', e => { if (e.target === root) closeReqPanel(); });
  root.querySelector('#rp-year').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('#rp-year button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.body.appendChild(root);
  (id ? root.querySelector('.sidepanel') : el('rp-cat')).focus?.();
}

function closeReqPanel() { el('sheet-root')?.remove(); }
function filterReqGoals(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll('.goalpick label').forEach(l => l.classList.toggle('hidden', !!q && !l.dataset.txt.includes(q)));
}

async function saveReqPanel(id) {
  const yb = document.querySelector('#rp-year button.on');
  const body = { category: el('rp-cat').value, name: el('rp-name').value, mandatory: el('rp-mand').checked, away: el('rp-away').checked,
    location: el('rp-loc').value, weeks: el('rp-weeks').value, serviceEffect: el('rp-effect').value, stYear: yb && yb.dataset.y ? Number(yb.dataset.y) : null };
  if (id) body.active = el('rp-active').checked;
  const picks = document.querySelectorAll('.goalpick [data-goal]');
  const own = new Set([...picks].map(c => c.dataset.goal));
  try {
    let reqId = id;
    if (id) {
      // Kopplingar till delmål i andra målbeskrivningar än klinikens förval behålls.
      if (picks.length) body.goalIds = [...(_sts.cfg.requirements.find(r => r.id === id).goalIds || []).filter(g => !own.has(g)), ...[...picks].filter(c => c.checked).map(c => c.dataset.goal)];
      await api('/admin/st/requirements/' + encodeURIComponent(id), { method: 'PATCH', body });
    } else {
      reqId = (await api('/admin/st/requirements', { method: 'POST', body })).requirement.id;
      const goalIds = [...picks].filter(c => c.checked).map(c => c.dataset.goal);
      if (goalIds.length) await api('/admin/st/requirements/' + encodeURIComponent(reqId), { method: 'PATCH', body: { goalIds } });
    }
    closeReqPanel();
    await reloadStSettings({ box: 'st-reqs-status', text: `${id ? 'Sparat' : 'Tillagt'}: ${body.category} ${body.name}.` });
  } catch (err) { el('rp-status').textContent = err.message; }
}

// Delmål: målbeskrivningen och vilka delmål klinikens (aktiva) krav täcker — delmål utan krav syns direkt.
function stsGoalsTab() {
  const goals = stsDefaultGoals(), reqs = _sts.cfg.requirements.filter(r => r.active);
  const byGoal = new Map(goals.map(g => [g.id, reqs.filter(r => (r.goalIds || []).includes(g.id))]));
  const covered = goals.filter(g => byGoal.get(g.id).length).length;
  const own = new Set(goals.map(g => g.id));
  const loose = reqs.filter(r => !(r.goalIds || []).some(id => own.has(id)));
  return `
    <div class="card">
      <h2>Målbeskrivning</h2>
      <p class="hint" style="margin-top:0">Förval för klinikens ST-läkare (Socialstyrelsens målbeskrivningar). Den som följer ett annat regelverk får ett eget
        under fliken ST-läkare och handledare. Kravens delmål väljs i den här målbeskrivningen (klicka på ett krav i fliken Krav).</p>
      <div class="row" style="gap:8px;align-items:flex-end">
        <div><label for="st-fw" style="margin-top:0">Förvald målbeskrivning</label>
          <select id="st-fw"><option value="">– ingen –</option>${_sts.frameworks.map(f => `<option value="${esc(f.id)}"${f.id === _sts.cfg.defaultFrameworkId ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <button class="btn" onclick="saveDefaultFramework()">Spara</button>
      </div>
      <div class="status" id="st-fw-status"></div>
    </div>
    ${goals.length ? `<div class="card">
      <h2>Täckning</h2>
      <p class="hint" style="margin-top:0"><strong>${covered} av ${goals.length}</strong> delmål har minst ett krav. Kopplingarna görs genom att klicka på ett krav i fliken
        <a href="#/st/krav">Krav</a>. Ett delmål kan också uppfyllas på annat sätt — det här är bara klinikens mall.</p>
      <div class="sch-scroll"><table class="imp-table goal-cov">
        <thead><tr><th>Delmål</th><th>Beskrivning</th><th>Krav</th></tr></thead>
        <tbody>${goals.map(g => { const rs = byGoal.get(g.id); return `<tr${rs.length ? '' : ' class="nocov"'}>
          <td><strong>${esc(g.code)}</strong></td><td>${esc(g.text)}</td>
          <td>${rs.length ? rs.map(r => `<span class="chip">${esc(r.category)} ${esc(r.name)}${r.stYear ? ` <span class="muted">år ${r.stYear}</span>` : ''}</span>`).join('') : '<span class="muted">Inget krav</span>'}</td></tr>`; }).join('')}</tbody>
      </table></div>
      ${loose.length ? `<p class="hint"><strong>Krav utan delmål (${loose.length}):</strong> ${loose.map(r => esc(r.category + ' ' + r.name)).join(', ')}.</p>` : ''}
    </div>` : '<div class="card"><p class="muted" style="margin:0">Välj en förvald målbeskrivning för att se vilka delmål kraven täcker.</p></div>'}`;
}

// ST-läkare och handledare: ST-start/-slut, egen målbeskrivning och handledare per ST-läkare. Studierektorsrollen sätts av admin.
function stsPeopleTab() {
  const people = _sts.people || [], st = people.filter(p => p.isSt), others = people.filter(p => !p.isSt);
  const name = id => people.find(p => p.id === id)?.displayName || '?';
  const active = st.filter(p => !p.stEnd), done = st.filter(p => p.stEnd);
  const card = p => `<div class="stp-row" data-id="${esc(p.id)}">
      <div class="stp-head"><strong>${esc(p.displayName)}</strong> <span class="muted">${esc(p.username || '')}</span>
        <a href="#/plan/${esc(p.id)}" style="margin-left:auto;font-size:14px">Utbildningsplan</a></div>
      <div class="field-row">
        <div><label>ST-start</label><input type="month" data-f="stStart" value="${esc(toMonthSts(p.stStart))}"></div>
        <div><label>ST-slut (när ST är klar)</label><input type="month" data-f="stEnd" value="${esc(toMonthSts(p.stEnd))}"></div>
        <div><label>Målbeskrivning</label><select data-f="framework"><option value="">Klinikens förval</option>${_sts.frameworks.map(f => `<option value="${esc(f.id)}"${f.id === p.frameworkId ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
      </div>
      <label>Handledare</label>
      <details class="sup-pick"><summary>${p.supervisorIds.length ? p.supervisorIds.map(id => `<span class="chip">${esc(name(id))}</span>`).join('') : '<span class="muted">Ingen handledare — välj</span>'}</summary>
        <div class="sup-list">${people.filter(x => x.id !== p.id).map(x => `<label class="row" style="gap:6px;font-weight:normal;margin:2px 0"><input type="checkbox" data-sup="${esc(x.id)}"${p.supervisorIds.includes(x.id) ? ' checked' : ''}> ${esc(x.displayName)}</label>`).join('')}</div>
      </details>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" data-a="save">Spara</button>
        <button class="btn-ghost" data-a="unst">Inte ST-läkare</button></div>
      <div class="status" data-s></div>
    </div>`;
  return `
    <div class="card stp">
      <h2>ST-läkare (${active.length})</h2>
      <p class="hint" style="margin-top:0">Handledaren ser sina ST-läkares måluppfyllelse och plan och kan signera delmål. ST-slut sätts när ST är klar — personen
        syns då som avslutad i översikten.</p>
      ${active.map(card).join('') || '<p class="muted">Inga ST-läkare.</p>'}
    </div>
    ${done.length ? `<div class="card stp"><details><summary style="cursor:pointer;font-weight:bold">Avslutad ST (${done.length})</summary>${done.map(card).join('')}</details></div>` : ''}
    <div class="card stp">
      <h2>Övriga på kliniken (${others.length})</h2>
      <p class="hint" style="margin-top:0">Kan väljas som handledare. ${_sts.me.isAdmin ? 'Studierektor utses under Administration.' : 'Studierektor utses av admin.'}</p>
      ${others.map(p => `<div class="stp-row compact" data-id="${esc(p.id)}"><span>${esc(p.displayName)}${p.isDirector ? ' <span class="tagchip">Studierektor</span>' : ''}</span>
        <button class="btn-ghost" data-a="mkst">Gör till ST-läkare</button><div class="status" data-s></div></div>`).join('')}
    </div>`;
}

const toMonthSts = iso => (iso || '').slice(0, 7);

async function onStPeopleClick(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const row = btn.closest('.stp-row'), id = row.dataset.id, who = _sts.people.find(p => p.id === id);
  let body;
  if (btn.dataset.a === 'save') body = { stStart: row.querySelector('[data-f="stStart"]').value, stEnd: row.querySelector('[data-f="stEnd"]').value,
    frameworkId: row.querySelector('[data-f="framework"]').value || null, supervisorIds: [...row.querySelectorAll('[data-sup]')].filter(c => c.checked).map(c => c.dataset.sup) };
  else if (btn.dataset.a === 'mkst') body = { isSt: true };
  else if (btn.dataset.a === 'unst') {
    if (!confirm(`Ta bort ST-läkarrollen för ${who.displayName}? Schema och måluppfyllelse ligger kvar men personen syns inte längre i ST-vyerna. Har ST blivit klar: sätt ST-slut i stället.`)) return;
    body = { isSt: false };
  }
  try {
    await api('/admin/st/people/' + encodeURIComponent(id), { method: 'PATCH', body });
    await reloadStSettings();
    toast(`Sparat: ${who.displayName}.`);
  } catch (err) { const b = row.querySelector('[data-s]'); b.textContent = err.message; b.className = 'status err'; }
}

async function saveMinInService() {
  try {
    await api('/admin/st/clinic', { method: 'PUT', body: { minInService: el('st-min').value } });
    await reloadStSettings({ box: 'st-min-status', text: 'Sparat.' });
  } catch (err) { const b = el('st-min-status'); b.textContent = err.message; b.className = 'status err'; }
}

async function saveDefaultFramework() {
  try {
    await api('/admin/st/clinic', { method: 'PUT', body: { defaultFrameworkId: el('st-fw').value || null } });
    await reloadStSettings({ box: 'st-fw-status', text: 'Sparat.' });
  } catch (err) { const b = el('st-fw-status'); b.textContent = err.message; b.className = 'status err'; }
}

function attachTypeCards(root) {
  const list = root.querySelector('#st-types');
  if (!list) return;
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const id = b.closest('.tcard').dataset.id;
    if (b.dataset.t === 'edit') openTypePanel(id);
    else if (b.dataset.t === 'effect') setTypeEffect(id, b.dataset.e);
    else moveType(id, b.dataset.t === 'up' ? -1 : 1);
  });
  let dragId = null;
  list.addEventListener('dragstart', e => { const c = e.target.closest('.tcard'); if (!c) return; dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  list.addEventListener('dragend', e => { e.target.closest('.tcard')?.classList.remove('dragging'); });
  list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    const card = list.querySelector('.dragging'), after = [...list.querySelectorAll('.tcard:not(.dragging)')].find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (card) list.insertBefore(card, after || null);
  });
  list.addEventListener('drop', e => { e.preventDefault(); if (!dragId) return; dragId = null; saveTypeOrder([...list.querySelectorAll('.tcard')].map(c => c.dataset.id)); });
}

async function saveTypeOrder(ids) {
  try {
    await api('/admin/st/types/order', { method: 'PUT', body: { ids } });
    await reloadStSettings({ box: 'st-types-status', text: 'Ordningen är sparad.' });
  } catch (err) { showStatus(el('st-types-status'), err.message, false); }
}
function moveType(id, dir) {
  const ids = _sts.cfg.types.map(t => t.id), i = ids.indexOf(id), j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  saveTypeOrder(ids);
}
async function setTypeEffect(id, serviceEffect) {
  const t = _sts.cfg.types.find(x => x.id === id);
  if (!t || t.serviceEffect === serviceEffect) return;
  try {
    await api(`/admin/st/types/${encodeURIComponent(id)}`, { method: 'PATCH', body: { serviceEffect } });
    await reloadStSettings({ box: 'st-types-status', text: `${t.code}: ${EFFECT_LABEL[serviceEffect].replace(' (påverkar inte)', '').toLowerCase()}.` });
  } catch (err) { showStatus(el('st-types-status'), err.message, false); }
}

function openTypePanel(id) {
  const t = id ? _sts.cfg.types.find(x => x.id === id) : { code: '', label: '', color: '#9aa5ad', serviceEffect: 'ej_i_tjanst', givesProgress: false, active: true };
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel" role="dialog" aria-label="${id ? 'Ändra aktivitetstyp' : 'Ny aktivitetstyp'}">
    <div class="sp-head"><h2 style="margin:0">${id ? esc(t.code + ' · ' + t.label) : 'Ny aktivitetstyp'}</h2><button class="btn-ghost" onclick="closeReqPanel()" aria-label="Stäng">✕</button></div>
    <div class="sp-body">
      <div class="field-row">
        <div><label for="tp-code">Kod</label><input type="text" id="tp-code" maxlength="20" value="${esc(t.code)}" placeholder="t.ex. Rand"></div>
        <div><label for="tp-label">Namn</label><input type="text" id="tp-label" maxlength="40" value="${esc(t.label)}" placeholder="t.ex. Randning"></div>
      </div>
      <label for="tp-color">Färg</label><input type="color" id="tp-color" value="${esc(t.color)}">
      <label>Räknas i "I tjänst" som</label>
      <div class="seg" id="tp-effect">${EFFECT_SHORT.map(([v, l]) => `<button type="button" data-e="${v}"${t.serviceEffect === v ? ' class="on"' : ''}>${l}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="tp-progress"${t.givesProgress ? ' checked' : ''}> Kan kopplas till krav (måluppfyllelse)</label>
      ${id ? `<label class="check"><input type="checkbox" id="tp-active"${t.active ? ' checked' : ''}> Aktiv (inaktiva går inte att välja i schemat)</label>` : ''}
    </div>
    <div class="sp-foot"><button class="btn" onclick="saveTypePanel(${id ? `'${esc(id)}'` : 'null'})">${id ? 'Spara' : 'Lägg till'}</button>
      <button class="btn-ghost" onclick="closeReqPanel()">Avbryt</button><div class="status" id="tp-status"></div></div>
  </aside>`;
  root.addEventListener('click', e => { if (e.target === root) closeReqPanel(); });
  root.querySelector('#tp-effect').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('#tp-effect button').forEach(x => x.classList.toggle('on', x === b));
  });
  document.body.appendChild(root);
  el('tp-code').focus();
}

async function saveTypePanel(id) {
  const body = { code: el('tp-code').value, label: el('tp-label').value, color: el('tp-color').value,
    serviceEffect: document.querySelector('#tp-effect button.on')?.dataset.e, givesProgress: el('tp-progress').checked };
  if (id) body.active = el('tp-active').checked;
  try {
    await api(id ? `/admin/st/types/${encodeURIComponent(id)}` : '/admin/st/types', { method: id ? 'PATCH' : 'POST', body });
    closeReqPanel();
    await reloadStSettings({ box: 'st-types-status', text: `${id ? 'Sparat' : 'Tillagt'}: ${body.code}.` });
  } catch (err) { showStatus(el('tp-status'), err.message, false); }
}

async function addDefaultTypes() {
  try {
    await api('/admin/st/types/defaults', { method: 'POST' });
    await reloadStSettings({ box: 'st-types-status', text: 'Standardtyperna är inlagda.' });
  } catch (err) { const b = el('st-types-status'); b.textContent = err.message; b.className = 'status err'; }
}



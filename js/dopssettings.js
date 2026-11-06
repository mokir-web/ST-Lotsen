// ── Inställningar → DOPS (#/installningar/dops/<flik>) ─────────────────────
// Klassiskt script. Beror på index.html och js/dopsapp.js (dopsStart, dopsApi, dopsFail, dopsWrite, dopsPriv, _dme).
//
// DOPS-appens Klinikinställningar, formulärens grupper och mål, Schemalagda utskick och Formulärbyggaren (global Administratör), mot
// DOPS-appens backend under /dops/app med samma regler. Allt som sparas skriver i DOPS-appens databas och är låst tills skrivrätt
// ges (servern svarar 423, visas som besked). Kontokopplingen mellan ST-Lotsen och DOPS ligger kvar under Inställningar → Användare.

// Användarna (roller, yrkesroll, DOPS-roll och koppling) sköts under Inställningar → Användare, inte här.
const DSET_TABS = [['klinik', 'Klinik'], ['formular', 'Formulär'], ['utskick', 'Utskick'], ['byggare', 'Formulärbyggare']];
const DOPS_ROLES = ['ST', 'AT', 'BT', 'Spec'];
let _dset = null;

async function renderDopsSettings(root, tab) {
  try {
    await dopsStart(root);
    const global = (_dme.privileges || []).some(p => p.privilege === 'Administratör' && p.klinikId === '*');
    if (!dopsPriv(_dme)) { root.innerHTML = '<h1 class="page">DOPS</h1><p class="muted">Kräver Studierektor eller Administratör i DOPS.</p>'; return; }
    const tabs = DSET_TABS.filter(([k]) => k !== 'byggare' || global);
    if (!tabs.some(t => t[0] === tab)) tab = 'klinik';
    _dset = { tab, tabs, global, klinik: _dme.klinikId };
    const k = encodeURIComponent(_dset.klinik);
    const load = {
      klinik: () => dopsApi(`/clinics/${k}/settings`),
      formular: () => Promise.all([dopsApi(`/clinics/${k}/form-settings`), dopsApi(`/clinics/${k}/form-groups`)]),
      utskick: () => Promise.all([dopsApi(`/scheduled-sends?clinicId=${k}`), dopsApi(`/users?clinicId=${k}`)]),
      byggare: () => dopsApi('/form-types')
    };
    _dset.data = await load[tab]();
    drawDopsSettings(root);
  } catch (err) { dopsFail(root, 'Inställningar för DOPS', err); }
}

function drawDopsSettings(root) {
  const d = _dset;
  const body = { klinik: dsetClinic, formular: dsetForms, utskick: dsetSends, byggare: dsetBuilder }[d.tab]();
  root.innerHTML = `
    <h1 class="page">DOPS</h1>
    <p class="hint" style="margin:-4px 0 10px">Samma inställningar som i DOPS-appen, för ${esc(_dme.clinic)}. Att spara är låst tills ST-Lotsen får skriva i DOPS-appens databas.</p>
    <nav class="subtabs" aria-label="Flikar">${d.tabs.map(([k, l]) => `<a href="#/installningar/dops/${k}"${k === d.tab ? ' class="active" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${body}`;
  ({ klinik: wireDsetClinic, formular: wireDsetForms, utskick: wireDsetSends, byggare: wireDsetBuilder })[d.tab](root);
}
const dsetSave = (fn, msg, root) => dopsWrite(fn, msg).then(ok => { if (ok) renderDopsSettings(root, _dset.tab); });
const dk = () => encodeURIComponent(_dset.klinik);

// ── Klinik ────────────────────────────────────────────────────────────────
function dsetClinic() {
  const s = _dset.data;
  return `<div class="card">
    <label for="ds-inact" style="margin-top:0">Inaktivera konton efter (månader utan inloggning)</label><input type="number" id="ds-inact" min="1" max="120" value="${esc(s.inaktiveringsMånader)}" style="max-width:120px">
    <label for="ds-exp">Förfrågningar blir inaktuella efter (veckor, 0 = aldrig)</label><input type="number" id="ds-exp" min="0" max="52" value="${esc(s.requestExpiry)}" style="max-width:120px">
    <div class="row" style="margin-top:12px"><button class="btn" id="ds-save">Spara</button></div></div>`;
}
function wireDsetClinic(root) {
  el('ds-save').onclick = () => dsetSave(() => dopsApi(`/clinics/${dk()}/settings`, { method: 'PUT', body: { inaktiveringsMånader: +el('ds-inact').value, requestExpiry: +el('ds-exp').value } }), 'Sparat.', root);
}

// ── Formulär (klinikens): grupp, vilka kategorier som ser formuläret, mål per roll ──
function dsetForms() {
  const [forms, groups] = _dset.data;
  return `<div class="card"><h2 style="margin-top:0">Grupper</h2>
      ${groups.map((g, i) => `<div class="pass-card"><span>${esc(g.name)}</span><label style="margin:0;font-weight:normal"><input type="checkbox" data-ghide="${i}"${g.hidden ? ' checked' : ''}> Dold</label></div>`).join('') || '<p class="muted">Inga grupper.</p>'}
      <div class="row" style="gap:8px;margin-top:8px"><input type="text" id="ds-gnew" placeholder="Ny grupp" style="max-width:240px"><button class="btn-ghost" id="ds-gsave">Spara grupper</button></div></div>
    <div class="card"><h2 style="margin-top:0">Formulär</h2><p class="hint" style="margin-top:0">Mål per yrkesroll gäller per 6 månader (mottagna eller registrerade bedömningar).</p>
      ${forms.map((f, i) => `<details class="bed-one" data-fi="${i}"><summary><strong>${esc(f.formType)}</strong> <span class="muted">${esc(f.groupName || 'ingen grupp')} · ${esc(f.categories || 'alla')}</span></summary>
        <label>Grupp</label><select data-k="group"><option value="">Ingen</option>${groups.map(g => `<option${g.name === f.groupName ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <label>Visas för</label><div class="dmi-types">${DOPS_ROLES.map(r => `<label class="chip"><input type="checkbox" data-cat="${r}"${(f.categories || '').split(',').map(s => s.trim()).includes(r) ? ' checked' : ''}> ${r}</label>`).join('')}</div>
        <label>Mål per 6 månader</label><table class="bed-ans dst-table"><tr><th>Roll</th><th>Mottagna</th><th>Registrerade</th></tr>${DOPS_ROLES.map(r => `<tr><td>${r}</td>
          <td><input type="number" min="0" data-t="${r}|mottagen" value="${f.targets?.[r]?.mottagen ?? ''}" style="max-width:80px"></td>
          <td><input type="number" min="0" data-t="${r}|registrerad" value="${f.targets?.[r]?.registrerad ?? ''}" style="max-width:80px"></td></tr>`).join('')}</table>
        <div class="row" style="margin-top:8px"><button class="btn" data-fsave="${i}">Spara formuläret</button></div></details>`).join('')}</div>`;
}
function wireDsetForms(root) {
  const [forms, groups] = _dset.data;
  el('ds-gsave').onclick = () => {
    const gs = groups.map((g, i) => ({ name: g.name, hidden: root.querySelector(`[data-ghide="${i}"]`).checked }));
    const nw = el('ds-gnew').value.trim(); if (nw) gs.push({ name: nw, hidden: false });
    dsetSave(() => dopsApi(`/clinics/${dk()}/form-groups`, { method: 'PUT', body: { groups: gs } }), 'Grupperna är sparade.', root);
  };
  root.querySelectorAll('[data-fsave]').forEach(b => b.onclick = () => {
    const box = root.querySelector(`[data-fi="${b.dataset.fsave}"]`), f = forms[+b.dataset.fsave];
    const targets = {};
    box.querySelectorAll('[data-t]').forEach(inp => { if (inp.value === '') return; const [r, m] = inp.dataset.t.split('|'); (targets[r] ||= {})[m] = +inp.value; });
    const categories = [...box.querySelectorAll('[data-cat]:checked')].map(c => c.dataset.cat).join(',');
    dsetSave(() => dopsApi(`/clinics/${dk()}/form-settings`, { method: 'PUT', body: { formTypeId: f.formTypeId, targets, categories, groupName: box.querySelector('[data-k=group]').value } }), 'Formuläret är sparat.', root);
  });
}

// ── Schemalagda utskick ───────────────────────────────────────────────────
// DOPS-appen mejlar sammanställningar på schema. I ST-Lotsen körs de inte förrän utskicken flyttas hit (då stängs DOPS-appens).
function dsetSends() {
  const [sends, users] = _dset.data;
  const form = (s = {}) => `<div class="field-row"><div><label>Namn</label><input type="text" data-k="namn" value="${esc(s.namn || '')}"></div>
      <div><label>Dag</label><select data-k="dag">${['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'].map(x => `<option${x === s.dag ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
      <div><label>Tid</label><input type="time" data-k="tid" value="${esc(s.tid || '07:00')}"></div>
      <div><label>Var n:e vecka</label><input type="number" min="1" max="12" data-k="periodVeckor" value="${s.periodVeckor || 1}"></div></div>
    <label>Mottagare</label><div class="dmi-types">${users.map(u => `<label class="chip"><input type="checkbox" data-r="${esc(u.email)}"${(s.mottagare || []).includes(u.email) ? ' checked' : ''}> ${esc(u.firstName)} ${esc(u.lastName)}</label>`).join('')}</div>`;
  return `<div class="card"><p class="hint" style="margin-top:0">Utskicken körs av DOPS-appen så länge den är i drift — inte av ST-Lotsen, så att inget skickas dubbelt.</p>
    ${sends.map((s, i) => `<details class="bed-one" data-si="${i}"><summary><strong>${esc(s.namn)}</strong> <span class="muted">${esc(s.dag)} ${esc(s.tid)} · ${(s.mottagare || []).length} mottagare · ${s.aktiv ? 'aktiv' : 'pausad'}${s.senastSkickad ? ' · senast ' + esc(s.senastSkickad) : ''}</span></summary>
      ${form(s)}<div class="row" style="gap:8px;margin-top:8px"><button class="btn" data-ssave="${i}">Spara</button><button class="btn-ghost" data-stog="${i}">${s.aktiv ? 'Pausa' : 'Aktivera'}</button><button class="btn-ghost" data-sdel="${i}">Ta bort</button></div></details>`).join('') || '<p class="muted">Inga schemalagda utskick.</p>'}
    <details class="bed-one" data-si="new"><summary><strong>Nytt utskick</strong></summary>${form()}<div class="row" style="margin-top:8px"><button class="btn" data-ssave="new">Spara</button></div></details></div>`;
}
function wireDsetSends(root) {
  const [sends] = _dset.data;
  root.querySelectorAll('[data-ssave]').forEach(b => b.onclick = () => {
    const i = b.dataset.ssave, x = root.querySelector(`[data-si="${i}"]`), s = i === 'new' ? {} : sends[+i];
    const v = k => x.querySelector(`[data-k=${k}]`).value;
    dsetSave(() => dopsApi('/scheduled-sends', { method: 'PUT', body: { ...s, klinikId: _dset.klinik, namn: v('namn'), dag: v('dag'), tid: v('tid'), periodVeckor: +v('periodVeckor'),
      mottagare: [...x.querySelectorAll('[data-r]:checked')].map(c => c.dataset.r), aktiv: s.aktiv ?? true } }), 'Utskicket är sparat.', root);
  });
  root.querySelectorAll('[data-stog]').forEach(b => b.onclick = () => dsetSave(() => dopsApi('/scheduled-sends/' + sends[+b.dataset.stog].id + '/active', { method: 'PATCH' }), 'Ändrat.', root));
  root.querySelectorAll('[data-sdel]').forEach(b => b.onclick = () => confirm('Ta bort utskicket?') && dsetSave(() => dopsApi('/scheduled-sends/' + sends[+b.dataset.sdel].id, { method: 'DELETE' }), 'Borttaget.', root));
}

// ── Formulärbyggare (global Administratör) ────────────────────────────────
function dsetBuilder() {
  return `<div class="card"><p class="hint" style="margin-top:0">Formulären gäller alla kliniker. Öppna ett formulär för att se och ändra frågorna.</p>
    ${_dset.data.map(f => `<details class="bed-one" data-ft="${esc(f.id)}"><summary><strong>${esc(f.name)}</strong> <span class="muted">${f.questionCount ?? f.question_count ?? ''} frågor${f.categories ? ' · ' + esc(f.categories) : ''}</span></summary><div class="dfb-q"><p class="muted">Hämtar…</p></div></details>`).join('')}
    <details class="bed-one"><summary><strong>Nytt formulär</strong></summary>
      <div class="field-row"><div><label>Namn</label><input type="text" id="dfb-name" placeholder="t.ex. DOPS: Hemikolektomi"></div><div><label>Sparad tid (min)</label><input type="number" id="dfb-min" min="0" value="5"></div></div>
      <div class="row" style="margin-top:8px"><button class="btn" id="dfb-new">Skapa</button></div></details></div>`;
}
function wireDsetBuilder(root) {
  el('dfb-new').onclick = () => dsetSave(() => dopsApi('/form-types', { method: 'POST', body: { name: el('dfb-name').value.trim(), timeSavingsMinutes: +el('dfb-min').value } }), 'Formuläret är skapat.', root);
  root.querySelectorAll('[data-ft]').forEach(det => det.addEventListener('toggle', async () => {
    if (!det.open || det.dataset.loaded) return;
    det.dataset.loaded = '1';
    const id = det.dataset.ft, box = det.querySelector('.dfb-q');
    try {
      const qs = await dopsApi('/form-types/' + encodeURIComponent(id) + '/admin-questions');
      const row = (q = {}) => `<tr data-qid="${esc(q.id || '')}"><td><input data-k="section" value="${esc(q.section || '')}"></td><td><input data-k="question" value="${esc(q.question || '')}"></td>
        <td><select data-k="type">${['skala', 'radio', 'multi', 'fritext', 'rubrik'].map(t => `<option${t === q.type ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input data-k="options" value="${esc(q.options || '')}"></td><td><input data-k="description" value="${esc(q.description || '')}"></td>
        <td><input data-k="nextSection" value="${esc(q.nextSection || '')}"></td><td><input data-k="jumpTo" value="${esc(q.jumpTo || '')}"></td>
        <td><button class="link-btn" data-qsave>${q.id ? 'Spara' : 'Lägg till'}</button>${q.id ? ' <button class="link-btn" data-qdel>Ta bort</button>' : ''}</td></tr>`;
      box.innerHTML = `<div class="sch-scroll"><table class="bed-ans dfb-table"><tr><th>Avsnitt</th><th>Fråga</th><th>Typ</th><th>Alternativ</th><th>Beskrivning</th><th>Nästa avsnitt</th><th>Hoppregel</th><th></th></tr>
        ${qs.map(row).join('')}${row()}</table></div>`;
      box.querySelectorAll('[data-qsave]').forEach(b => b.onclick = () => {
        const tr = b.closest('tr'), qid = tr.dataset.qid, q = {};
        tr.querySelectorAll('[data-k]').forEach(i => { q[i.dataset.k] = i.value; });
        dsetSave(() => dopsApi('/form-types/' + encodeURIComponent(id) + '/questions' + (qid ? '/' + qid : ''), { method: qid ? 'PUT' : 'POST', body: q }), 'Frågan är sparad.', root);
      });
      box.querySelectorAll('[data-qdel]').forEach(b => b.onclick = () => confirm('Ta bort frågan?') &&
        dsetSave(() => dopsApi('/form-types/' + encodeURIComponent(id) + '/questions/' + b.closest('tr').dataset.qid, { method: 'DELETE' }), 'Frågan är borttagen.', root));
    } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  }));
}

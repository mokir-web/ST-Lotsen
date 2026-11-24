// ── Operationskompetens (#/operationer, #/operationer/vem, #/installningar/operationer) ──────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), toast(), showStatus(), todayStockholm() och js/import.js
// (OpjourImport). Globala entries: renderOpkomp(root, sub), renderOpkompSettings(root).
// Ersätter kalkylarket "Operatör vs. ingrepp" (0.61.0): vilka ingrepp var och en opererar själv (O) eller som assistent (A).
// Var och en ändrar sin egen rad; specialister, studierektor och admin ändrar allas (servern, routes/opkomp.js). Operations-
// koordinatorerna ser sidan via ett visningskonto (läsläge). "Sök operatör" visar för ett ingrepp vem som opererar själv och vem som assisterar.
// Undersidorna (Översikt, Sök operatör) väljs i sidomenyn som i andra moduler; ingreppen ställs in under Inställningar (0.62.0).

let _opk = null;
const OPK_GROUPS = [['ST', 'ST-läkare'], ['BTAT', 'BT- och AT-läkare'], ['Spec', 'Specialister'], ['', 'Övriga']];
const opkGroup = r => r === 'ST' || r === 'Spec' ? r : r === 'BT' || r === 'AT' ? 'BTAT' : '';
const OPK_LABEL = { O: 'Opererar själv', A: 'Som assistent' };
const OPK_ROLE = { ST: 'ST', BT: 'BT', AT: 'AT', Spec: 'Spec' };

async function renderOpkomp(root, sub) {
  try {
    const [me, data] = await Promise.all([api('/me'), api('/opkomp')]);
    setMenuForUser(me);
    // Telefon: en kategori åt gången (som Måluppfyllelsen), om inget annat valts tidigare.
    let cat = window.matchMedia('(max-width: 640px)').matches ? 'first' : 'alla', proc = '';
    try { cat = localStorage.getItem('opk_cat') || cat; proc = localStorage.getItem('opk_proc') || ''; } catch {}
    _opk = { me, data, sub: sub === 'vem' ? 'vem' : '', cat, proc, q: '' };
    drawOpkomp(root);
  } catch (err) { root.innerHTML = `<h1 class="page">Operationskompetens</h1><p class="err">${esc(err.message)}</p>`; }
}

const opkCats = () => [...new Set(_opk.data.procedures.map(p => p.category))];
const opkCanEdit = uid => !_opk.data.viewer && (_opk.data.canEditAll || uid === _opk.data.me);

function drawOpkomp(root) {
  const { data, sub } = _opk;
  const admin = _opk.me.isAdmin && !_opk.me.isDisplay;
  root.innerHTML = `<h1 class="page" style="margin-bottom:2px">${sub === 'vem' ? 'Sök operatör' : 'Operatörer'}</h1>
      <p class="muted" style="margin:0 0 12px">Vilka ingrepp var och en opererar själv (<span class="opk-o">O</span>) eller som assistent (<span class="opk-a">A</span>).</p>
    ${!data.procedures.length ? `<div class="card"><p class="muted" style="margin:0">Inga ingrepp än. ${admin ? '<a href="#/installningar/operationer">Lägg in ingreppen</a> eller läs in kalkylarket.' : 'Admin lägger in dem.'}</p></div>`
      : sub === 'vem' ? opkWhoHtml() : opkMatrixHtml()}`;
  root.onclick = onOpkClick;
  root.oninput = e => { if (e.target.id === 'opk-q') { _opk.q = e.target.value; el('opk-table').outerHTML = opkTableHtml(); } };
  root.onchange = e => {
    if (e.target.id === 'opk-proc') { _opk.proc = e.target.value; try { localStorage.setItem('opk_proc', _opk.proc); } catch {} drawOpkomp(root); }
  };
}

function opkMatrixHtml() {
  const cats = opkCats();
  if (_opk.cat === 'first' || (_opk.cat !== 'alla' && !cats.includes(_opk.cat))) _opk.cat = _opk.cat === 'first' ? cats[0] || 'alla' : 'alla';
  return `<div class="card">
    <div class="row" style="gap:8px;margin:0 0 8px">
      <div class="seg" id="opk-cat" style="flex-wrap:wrap">${[['alla', 'Alla'], ...cats.map(c => [c, c])].map(([k, l]) => `<button type="button" data-cat="${esc(k)}" class="${_opk.cat === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      <input type="search" id="opk-q" placeholder="Sök person…" value="${esc(_opk.q)}" style="flex:0 1 220px">
    </div>
    ${opkTableHtml()}
    <p class="hint" style="margin-bottom:0">${_opk.data.viewer ? 'Läsläge.' : _opk.data.canEditAll ? 'Tryck på en ruta för att ändra: tom → A → O → tom. Du kan ändra allas rader.' : 'Tryck på en ruta i din egen rad för att ändra: tom → A → O → tom.'}</p>
  </div>`;
}

function opkTableHtml() {
  const { data } = _opk;
  const procs = data.procedures.filter(p => _opk.cat === 'alla' || p.category === _opk.cat);
  const byCat = opkCats().map(c => ({ c, ps: procs.filter(p => p.category === c) })).filter(g => g.ps.length);
  const q = _opk.q.trim().toLowerCase();
  const people = data.people.filter(p => !q || p.name.toLowerCase().includes(q));
  const head1 = byCat.map(g => `<th colspan="${g.ps.length}" class="cat">${esc(g.c)}</th>`).join('');
  const head2 = byCat.flatMap(g => g.ps).map(p => `<th title="${esc(p.category + ': ' + p.name)}"><span class="vt">${esc(p.name)}</span></th>`).join('');
  const cols = byCat.flatMap(g => g.ps);
  const body = OPK_GROUPS.map(([k, label]) => {
    const ps = people.filter(p => opkGroup(p.jobRole) === k);
    if (!ps.length) return '';
    return `<tr class="opk-grp"><th class="pname" colspan="${cols.length + 1}">${esc(label)} (${ps.length})</th></tr>` + ps.map(p => {
      const sk = data.skills[p.id] || {}, edit = opkCanEdit(p.id);
      return `<tr${p.id === data.me ? ' class="opk-me"' : ''}><th class="pname">${esc(p.name)}</th>${cols.map(c => {
        const v = sk[c.id] || '';
        return `<td class="opk-c${v ? ' opk-' + v.toLowerCase() : ''}${edit ? ' edit' : ''}"${edit ? ` data-u="${esc(p.id)}" data-p="${esc(c.id)}" role="button" tabindex="0"` : ''} title="${esc(p.name + ' — ' + c.name + ': ' + (OPK_LABEL[v] || 'inget angett'))}">${v}</td>`;
      }).join('')}</tr>`;
    }).join('');
  }).join('');
  return `<div class="sch-scroll" id="opk-table"><table class="sch prog compact opk">
    <thead><tr><th class="pname" rowspan="2">Namn</th>${head1}</tr><tr>${head2}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols.length + 1}" class="muted">Ingen matchar.</td></tr>`}</tbody></table></div>`;
}

function opkWhoHtml() {
  const { data } = _opk;
  if (!data.procedures.some(p => p.id === _opk.proc)) _opk.proc = data.procedures[0]?.id || '';
  const p = data.procedures.find(x => x.id === _opk.proc);
  const list = lvl => data.people.filter(x => (data.skills[x.id] || {})[p.id] === lvl)
    .sort((a, b) => OPK_GROUPS.findIndex(g => g[0] === opkGroup(b.jobRole)) - OPK_GROUPS.findIndex(g => g[0] === opkGroup(a.jobRole)) || a.name.localeCompare(b.name, 'sv'));
  const col = lvl => { const ps = list(lvl); return `<div class="card opk-who"><h2><span class="opk-${lvl.toLowerCase()}">${lvl}</span> ${OPK_LABEL[lvl]} (${ps.length})</h2>
    ${ps.length ? `<ul>${ps.map(x => `<li>${esc(x.name)} <span class="tagchip">${esc(OPK_ROLE[x.jobRole] || 'Övrig')}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Ingen.</p>'}</div>`; };
  return `<div class="card"><label for="opk-proc" style="margin-top:0">Ingrepp</label>
      <select id="opk-proc" style="max-width:420px">${opkCats().map(c => `<optgroup label="${esc(c)}">${data.procedures.filter(x => x.category === c).map(x => `<option value="${esc(x.id)}"${x.id === _opk.proc ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div class="opk-whogrid">${col('O')}${col('A')}</div>`;
}

async function onOpkClick(e) {
  const go = e.target.closest('[data-go]');
  if (go) { location.hash = go.dataset.go; return; }
  const c = e.target.closest('[data-cat]');
  if (c) { _opk.cat = c.dataset.cat; try { localStorage.setItem('opk_cat', _opk.cat); } catch {} drawOpkomp(el('view')); return; }
  const td = e.target.closest('td.opk-c.edit');
  if (!td) return;
  const { u, p } = td.dataset, sk = (_opk.data.skills[u] ||= {});
  const old = sk[p] || '', next = { '': 'A', A: 'O', O: '' }[old];
  next ? sk[p] = next : delete sk[p];
  td.className = `opk-c${next ? ' opk-' + next.toLowerCase() : ''} edit`; td.textContent = next;
  try { await api('/opkomp/skills', { method: 'PUT', body: { userId: u, procedureId: p, level: next || null } }); }
  catch (err) { old ? sk[p] = old : delete sk[p]; td.className = `opk-c${old ? ' opk-' + old.toLowerCase() : ''} edit`; td.textContent = old; alert(err.message); }
}
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('td.opk-c.edit')) { e.preventDefault(); e.target.click(); } });

// ── Inställningar → Operationskompetens (admin) ──────────────────────────
// Ingreppen i kategorier: lägg till, byt namn eller kategori, ordna (↑↓) och ta bort. Hela matrisen exporteras till och läses in från Excel.
async function renderOpkompSettings(root) {
  try {
    const [me, data] = await Promise.all([api('/me'), api('/opkomp')]);
    setMenuForUser(me);
    if (!me.isAdmin) { location.hash = '#/operationer'; return; }
    _opk = { me, data, sub: 'set', cat: 'alla', proc: '', q: '' };
    drawOpkSettings(root);
  } catch (err) { root.innerHTML = `<h1 class="page">Operationskompetens</h1><p class="err">${esc(err.message)}</p>`; }
}
async function opkReloadSettings(msg) {
  _opk.data = await api('/opkomp');
  drawOpkSettings(el('view'));
  if (msg) showStatus(el('opk-st'), msg, true);
}

function drawOpkSettings(root) {
  const { data } = _opk, cats = opkCats();
  root.innerHTML = `<h1 class="page">Operationskompetens</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
        <p class="hint" style="margin:0;flex:1 1 300px">Klinikens ingrepp i kategorier. Varje person anger för varje ingrepp om hen opererar själv (O) eller som assistent (A)
          på sidan <a href="#/operationer">Operationskompetens</a>. Kategorierna visas i ordningen för sitt första ingrepp.</p>
        <div class="row" style="gap:8px"><button class="btn-ghost" data-o="export">Exportera till Excel</button><button class="btn-ghost" data-o="import">Uppdatera från Excel…</button></div>
      </div>
      <div class="status" id="opk-st"></div>
      ${cats.map(c => `<h3>${esc(c)}</h3><ul class="opk-plist">${data.procedures.filter(p => p.category === c).map(p => {
        const i = data.procedures.indexOf(p), n = Object.values(data.skills).filter(s => s[p.id]).length;
        return `<li><span>${esc(p.name)} <span class="muted" style="font-size:13px">${n ? n + ' angett' : ''}</span></span><span class="edu-tools">
          <button class="tw-ico" data-o="up" data-id="${esc(p.id)}" title="Flytta upp"${i ? '' : ' disabled'}>↑</button><button class="tw-ico" data-o="down" data-id="${esc(p.id)}" title="Flytta ner"${i < data.procedures.length - 1 ? '' : ' disabled'}>↓</button>
          <button class="tw-ico" data-o="edit" data-id="${esc(p.id)}" title="Byt namn eller kategori">✎</button><button class="tw-ico" data-o="del" data-id="${esc(p.id)}" title="Ta bort">✕</button></span></li>`;
      }).join('')}</ul>`).join('') || '<p class="muted">Inga ingrepp än. Lägg till nedan eller läs in ett kalkylark.</p>'}
      <h3>Lägg till ingrepp</h3>
      <form class="row" id="opk-add" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div><label for="opk-ncat" style="margin-top:0">Kategori</label><input id="opk-ncat" list="opk-cats" maxlength="60" required placeholder="t.ex. Bråck" style="max-width:200px">
          <datalist id="opk-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label for="opk-nname" style="margin-top:0">Ingrepp</label><input id="opk-nname" maxlength="80" required placeholder="t.ex. TAPP" style="max-width:260px"></div>
        <button class="btn" type="submit">Lägg till</button>
      </form>
    </div>`;
  root.onclick = onOpkSetClick;
  el('opk-add').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/opkomp/procedures', { method: 'POST', body: { category: el('opk-ncat').value, name: el('opk-nname').value } });
      const cat = el('opk-ncat').value;
      await opkReloadSettings('Tillagt.');
      el('opk-ncat').value = cat; el('opk-nname').focus();
    } catch (err) { showStatus(el('opk-st'), err.message, false); }
  };
}

async function onOpkSetClick(e) {
  const b = e.target.closest('[data-o]'); if (!b) return;
  const { data } = _opk, p = data.procedures.find(x => x.id === b.dataset.id);
  try {
    if (b.dataset.o === 'export') return opkExport();
    if (b.dataset.o === 'import') return opkImportForm();
    if (b.dataset.o === 'up' || b.dataset.o === 'down') {
      const ids = data.procedures.map(x => x.id), i = ids.indexOf(p.id), j = i + (b.dataset.o === 'up' ? -1 : 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api('/opkomp/order', { method: 'PUT', body: { ids } }); return opkReloadSettings();
    }
    if (b.dataset.o === 'edit') return opkEditProc(p);
    if (b.dataset.o === 'del') {
      const n = Object.values(data.skills).filter(s => s[p.id]).length;
      if (!confirm(`Ta bort ${p.name}?${n ? `\n\n${n} personers angivelser för ingreppet tas också bort.` : ''} Det går inte att ångra.`)) return;
      await api('/opkomp/procedures/' + p.id, { method: 'DELETE' }); return opkReloadSettings('Borttaget.');
    }
  } catch (err) { showStatus(el('opk-st'), err.message, false); }
}

// Ändra ett ingrepp (0.62.0): namn, kategori och "Sätt för alla" i en yrkesroll — för sådant som alla gör (t.ex. alla specialister
// opererar själv). O sätts för alla i rollen; A bara för dem som inte har något angett (ingen som opererar själv flyttas ner);
// "Ta bort" tömmer rollens angivelser för ingreppet.
const OPK_SET_ROLES = [['all', 'Alla'], ['ST', 'ST-läkare'], ['BTAT', 'BT- och AT-läkare'], ['Spec', 'Specialister']];
function opkEditProc(p) {
  const cats = opkCats();
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="overlay" data-close="1"><form class="sheet" role="dialog" aria-label="Ändra ingrepp" id="oe">
    <h2>${esc(p.name)} <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
    <label for="oe-name">Namn</label><input id="oe-name" maxlength="80" value="${esc(p.name)}" required>
    <label for="oe-cat">Kategori</label><input id="oe-cat" maxlength="60" list="oe-cats" value="${esc(p.category)}" required>
    <datalist id="oe-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row" style="margin-top:12px"><button class="btn" type="submit">Spara</button><button class="btn-ghost" type="button" data-close="1">Avbryt</button></div>
    <h3>Sätt för alla</h3>
    <p class="hint" style="margin-top:0">För ingrepp som alla i en yrkesroll gör. <strong>O</strong> sätts för alla i rollen; <strong>A</strong> bara för dem som inte har något angett.
      <strong>Ta bort</strong> tömmer rollens angivelser för ingreppet.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div><label for="oe-role" style="margin-top:0">Yrkesroll</label><select id="oe-role">${OPK_SET_ROLES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div><label for="oe-lvl" style="margin-top:0">Nivå</label><select id="oe-lvl"><option value="O">O – opererar själv</option><option value="A">A – som assistent</option><option value="">Ta bort</option></select></div>
      <button class="btn-ghost" type="button" id="oe-bulk">Sätt</button>
    </div>
    <div class="status" id="oe-st"></div>
  </form></div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  el('oe').onsubmit = async e => {
    e.preventDefault();
    try { await api('/opkomp/procedures/' + p.id, { method: 'PUT', body: { name: el('oe-name').value, category: el('oe-cat').value } }); root.innerHTML = ''; opkReloadSettings('Sparat.'); }
    catch (err) { showStatus(el('oe-st'), err.message, false); }
  };
  el('oe-bulk').onclick = async () => {
    const role = el('oe-role').value, level = el('oe-lvl').value || null, rl = OPK_SET_ROLES.find(r => r[0] === role)[1].toLowerCase();
    if (!level && !confirm(`Ta bort angivelserna för ${p.name} för ${rl === 'alla' ? 'alla' : 'alla ' + rl}?`)) return;
    try {
      const r = await api(`/opkomp/procedures/${p.id}/all`, { method: 'POST', body: { role, level } });
      showStatus(el('oe-st'), `${r.changed} ${r.changed === 1 ? 'person' : 'personer'} ändrade.`, true);
      _opk.data = await api('/opkomp');
      drawOpkSettings(el('view'));   // antalet angivna i listan bakom rutan
    } catch (err) { showStatus(el('oe-st'), err.message, false); }
  };
  el('oe-name').focus();
}

// ── Excel ───────────────────────────────────────────────────────────────
// Rad 1: kategori per kolumn, rad 2: Namn, Yrkesroll och ingreppen, sedan en rad per person med O, A eller tomt. Vid inläsning får
// sammanslagna kategoriceller (som i det gamla arket) gälla för kolumnerna till höger tills nästa kategori.
function opkExport() {
  const { data } = _opk, ps = data.procedures;
  const rows = [['', '', ...ps.map(p => p.category)], ['Namn', 'Yrkesroll', ...ps.map(p => p.name)],
    ...data.people.map(u => [u.name, OPK_ROLE[u.jobRole] || '', ...ps.map(p => (data.skills[u.id] || {})[p.id] || '')])];
  const blob = OpjourImport.writeXlsx(rows, { sheet: 'Operationskompetens', widths: [24, 10, ...ps.map(() => 6)] });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `operationskompetens-${(_opk.me.clinicName || 'klinik').replace(/[^\wåäöÅÄÖ-]+/g, '-')}-${todayStockholm()}.xlsx` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function opkFromTable(table) {
  const norm = s => String(s ?? '').trim().toLowerCase();
  const hIdx = table.findIndex(r => norm(r[0]) === 'namn' || norm(r[0]) === 'operatör');
  if (hIdx < 0) throw new Error('Hittar ingen rubrikrad som börjar med "Namn". Utgå från exporten.');
  const head = table[hIdx], catRow = hIdx > 0 ? table[hIdx - 1] : [];
  const roleCol = head.findIndex(c => ['yrkesroll', 'befattning'].includes(norm(c)));
  const first = Math.max(1, roleCol + 1), known = new Map(_opk.data.procedures.map(p => [p.name.toLowerCase(), p.category]));
  const procedures = [];
  let cat = '';
  for (let i = first; i < head.length; i++) {
    if (String(catRow[i] ?? '').trim()) cat = String(catRow[i]).trim();
    const name = String(head[i] ?? '').trim();
    procedures.push({ category: cat || known.get(name.toLowerCase()) || '', name });
  }
  const rows = table.slice(hIdx + 1).map((r, k) => ({ line: hIdx + 2 + k, name: String(r[0] ?? '').trim(), levels: procedures.map((_, j) => String(r[first + j] ?? '').trim()) }))
    .filter(r => r.name);
  return { procedures, rows };
}

function opkImportForm() {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-label="Uppdatera från Excel" style="max-width:720px">
    <h2>Uppdatera från Excel <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
    <p class="hint" style="margin-top:0">Exportera, ändra i Excel och läs in filen här. Du ser allt innan något sparas. Nya ingrepp läggs till och filens ordning blir
      ordningen. Personer matchas på namn (även "Efternamn Förnamn" och förkortat, t.ex. "Erik B."); för dem gäller filen — en tom cell tar bort
      det som var angett. Ingrepp som inte finns i filen och personer som inte står med lämnas orörda.</p>
    <input type="file" id="oi-file" accept=".xlsx,.csv"><div id="oi-out"></div></div></div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  el('oi-file').onchange = async () => {
    const out = el('oi-out'), file = el('oi-file').files[0]; if (!file) return;
    out.innerHTML = '<p class="muted">Läser filen…</p>';
    try {
      const body = opkFromTable(await OpjourImport.readTable(file));
      const plan = await api('/opkomp/import', { method: 'POST', body });
      const n = plan.people.filter(p => p.added + p.changed + p.removed).length;
      out.innerHTML = `
        ${plan.errors.length ? `<div class="notice warn" style="margin-top:10px"><strong>Rätta i filen och läs in den igen:</strong><ul>${plan.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${plan.newProcedures.length ? `<h3>Nya ingrepp (${plan.newProcedures.length})</h3><p style="margin:0">${plan.newProcedures.map(p => `${esc(p.name)} <span class="muted">(${esc(p.category)})</span>`).join(', ')}</p>` : ''}
        ${plan.recategorized.length ? `<h3>Byter kategori (${plan.recategorized.length})</h3><p style="margin:0">${plan.recategorized.map(p => `${esc(p.name)}: <del>${esc(p.from)}</del> → <ins>${esc(p.to)}</ins>`).join(', ')}</p>` : ''}
        <h3>Personer (${plan.people.length})</h3>
        <ul class="ub-list">${plan.people.map(p => `<li><strong>${esc(p.userName)}</strong>${p.name !== p.userName ? ` <span class="muted">← ${esc(p.name)}</span>` : ''}
          <span class="muted">· ${p.added + p.changed + p.removed ? [p.added && `${p.added} nya`, p.changed && `${p.changed} ändrade`, p.removed && `${p.removed} borttagna`].filter(Boolean).join(', ') : 'oförändrad'}</span></li>`).join('')}</ul>
        ${plan.unmatched.length ? `<div class="notice warn"><strong>Hittades inte (hoppas över):</strong> ${plan.unmatched.map(u => `${esc(u.name)} <span class="muted">(${esc(u.reason)})</span>`).join(', ')}
          <br><span class="muted">Lägg upp kontot eller skriv namnet som i ST-Lotsen och läs in igen.</span></div>` : ''}
        ${plan.errors.length ? '' : `<div class="row" style="margin-top:12px"><button class="btn" id="oi-run">${n || plan.newProcedures.length || plan.recategorized.length ? 'Genomför' : 'Spara ordningen'}</button></div>`}
        <div class="status" id="oi-st"></div>`;
      el('oi-run')?.addEventListener('click', async ev => {
        ev.target.disabled = true;
        try { await api('/opkomp/import', { method: 'POST', body: { ...body, apply: true } }); root.innerHTML = ''; toast('Operationskompetensen är uppdaterad.'); opkReloadSettings(); }
        catch (err) { ev.target.disabled = false; showStatus(el('oi-st'), err.message, false); }
      });
    } catch (err) { out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  };
}

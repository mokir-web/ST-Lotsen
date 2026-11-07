// ── Inställningar → Användare: markera flera, massändra, exportera och importera som Excel ────────────────
// Klassiskt script. Beror på js/admin.js (_admin, sortedRoster, nameOf, mods, drawUserRows, reloadAdmin, downloadFile, closeUserPanel),
// js/import.js (OpjourImport) och index.html (api, esc, el, START_PAGES, showStatus, toast).
//
// Fälten nedan används på tre ställen: massändring av markerade, export till Excel och import av en ändrad lista. Ändringar
// görs med samma anrop som panelen (PUT /profile, PATCH /admin/users/:id, PUT /reserve, PATCH /admin/st/people/:id) så att
// samma regler gäller (t.ex. att man inte kan ta bort sin egen admin). Vid import ändras bara det som skiljer sig; en tom cell
// betyder "ändra inte". Personer matchas på Id (exportens första kolumn), annars användarnamn, annars namn (om det är unikt).

const UB_ROLES = [['ST', 'ST-läkare'], ['BT', 'BT-läkare'], ['AT', 'AT-läkare'], ['Spec', 'Specialist'], ['Annan', 'Annan']];
const ubYes = v => { const s = String(v ?? '').trim().toLowerCase(); return ['ja', 'j', 'yes', 'true', 'sant', '1', 'x'].includes(s) ? true : ['nej', 'n', 'no', 'false', 'falskt', '0'].includes(s) ? false : undefined; };
const ubBool = b => b ? 'Ja' : 'Nej';
const ubMonth = v => { const s = String(v ?? '').trim(); if (!s) return undefined; const m = s.match(/^(\d{4})-(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}` : null; };
const ubHasOp = () => mods().includes('opjour'), ubHasSt = () => mods().some(m => m === 'schema' || m === 'mal');

// k: fältnamn, h: rubrik i Excel, get: värde som text, parse: text → värde (undefined = ändra inte, null = ogiltigt),
// cur: nuvarande värde att jämföra med, grp: vilket anrop som sparar det.
function ubFields() {
  const f = [
    { k: 'displayName', h: 'Fullständigt namn', get: u => u.displayName, grp: 'profile' },
    { k: 'username', h: 'Användarnamn', get: u => u.username || '', grp: 'profile' },
    { k: 'email', h: 'E-post', get: u => u.email || '', grp: 'profile' },
    { k: 'phone', h: 'Telefon', get: u => u.phone || '', grp: 'profile' },
    { k: 'jobRole', h: 'Yrkesroll', get: u => (UB_ROLES.find(r => r[0] === (u.jobRole || (u.isSt ? 'ST' : ''))) || ['', ''])[1], cur: u => u.jobRole || (u.isSt ? 'ST' : ''),
      parse: v => { const s = String(v ?? '').trim().toLowerCase(); if (!s) return undefined; const r = UB_ROLES.find(([c, l]) => c.toLowerCase() === s || l.toLowerCase() === s); return r ? r[0] : null; }, grp: 'patch' },
    { k: 'isAdmin', h: 'Admin', bool: true, get: u => ubBool(u.isAdmin), cur: u => !!u.isAdmin, grp: 'patch' },
    { k: 'isDirector', h: 'Studierektor', bool: true, get: u => ubBool(u.isDirector), cur: u => !!u.isDirector, grp: 'patch' },
    { k: 'active', h: 'Aktiv', bool: true, get: u => ubBool(u.active), cur: u => !!u.active, grp: 'patch' }
  ];
  if (ubHasOp()) f.push(
    { k: 'opjourBook', h: 'Bokar opjour', bool: true, get: u => ubBool(!u.opjourView), cur: u => !u.opjourView, grp: 'patch' },
    { k: 'availableReserve', h: 'Reserv', bool: true, get: u => ubBool(u.availableReserve), cur: u => !!u.availableReserve, grp: 'reserve' },
    { k: 'canSeeStats', h: 'Statistik', bool: true, get: u => ubBool(u.canSeeStats), cur: u => !!u.canSeeStats, grp: 'patch' });
  if (ubHasSt()) f.push(
    { k: 'stStart', h: 'ST-start (ÅÅÅÅ-MM)', get: u => (u.stStart || '').slice(0, 7), parse: ubMonth, grp: 'st' },
    { k: 'stEnd', h: 'ST-slut (ÅÅÅÅ-MM)', get: u => (u.stEnd || '').slice(0, 7), parse: ubMonth, grp: 'st' },
    { k: 'supervisorIds', h: 'Handledare', get: u => (u.supervisorIds || []).map(nameOf).join('; '),
      cur: u => [...(u.supervisorIds || [])].sort().join(','),
      parse: v => { const s = String(v ?? '').trim(); if (!s) return undefined;
        const ids = s.split(/[;,]/).map(x => x.trim()).filter(Boolean).map(n => sortedRoster().filter(x => normName(x.displayName) === normName(n)));
        return ids.every(m => m.length === 1) ? ids.map(m => m[0].id).sort().join(',') : null; }, grp: 'st' });
  f.push({ k: 'startPage', h: 'Startsida', get: u => (START_PAGES.find(p => p[0] === (u.startPage || '')) || ['', ''])[1],
    cur: u => u.startPage || '', parse: v => { const s = String(v ?? '').trim().toLowerCase(); if (!s) return undefined; const p = START_PAGES.find(x => x[1].toLowerCase() === s); return p ? p[0] : null; }, grp: 'profile' });
  return f;
}
const ubParse = (f, v) => f.parse ? f.parse(v) : f.bool ? (String(v ?? '').trim() ? (ubYes(v) ?? null) : undefined) : (String(v ?? '').trim() ? String(v).trim() : undefined);
const ubCur = (f, u) => f.cur ? f.cur(u) : f.get(u);

// Sparar ändringar { k: värde } för en person. Returnerar en lista med fel (tom = allt gick bra).
async function ubApply(u, ch) {
  const errs = [], by = g => Object.entries(ch).filter(([k]) => ubFields().find(f => f.k === k)?.grp === g);
  const run = async (what, fn) => { try { await fn(); } catch (e) { errs.push(`${what}: ${e.message}`); } };
  const prof = Object.fromEntries(by('profile'));
  if (Object.keys(prof).length) await run('Uppgifter', () => api('/profile', { method: 'PUT', body: { userId: u.id, ...prof } }));
  const p = Object.fromEntries(by('patch').map(([k, v]) => k === 'opjourBook' ? ['opjourView', !v] : [k, v]));
  if (Object.keys(p).length) await run('Roller', () => api('/admin/users/' + encodeURIComponent(u.id), { method: 'PATCH', body: p }));
  if ('availableReserve' in ch) await run('Reserv', () => api('/reserve', { method: 'PUT', body: { available: ch.availableReserve, userId: u.id } }));
  const st = Object.fromEntries(by('st').map(([k, v]) => k === 'supervisorIds' ? [k, v ? v.split(',') : []] : [k, v]));
  if ('frameworkId' in ch) st.frameworkId = ch.frameworkId;
  if (Object.keys(st).length) await run('ST-uppgifter', () => api('/admin/st/people/' + encodeURIComponent(u.id), { method: 'PATCH', body: st }));
  return errs;
}

// ── Markering i listan ────────────────────────────────────────────────────
function ubSel() { return (_admin.sel = _admin.sel || new Set()); }
function ubToggle(id, on) { on ? ubSel().add(id) : ubSel().delete(id); ubBar(); }
function ubToggleAll(ids, on) { ids.forEach(id => on ? ubSel().add(id) : ubSel().delete(id)); drawUserRows(); }
function ubBar() {
  const n = [...ubSel()].filter(id => sortedRoster().some(u => u.id === id)).length, bar = el('u-bulk');
  if (!bar) return;
  bar.classList.toggle('hidden', !n);
  bar.innerHTML = n ? `<strong>${n} markerade</strong>
    <button class="btn" onclick="openUserPanel({ kind: 'bulk' })">Ändra markerade…</button>
    <button class="btn-ghost" onclick="_admin.sel.clear();drawUserRows()">Avmarkera</button>` : '';
}

// ── Massändring ───────────────────────────────────────────────────────────
function ubBulkPanel() {
  const n = ubSel().size;
  const keep = '<option value="">— Ändra inte —</option>';
  const yn = (id, label, info) => `<label class="role-row"><span><strong>${label}</strong>${info ? `<small>${info}</small>` : ''}</span><select id="${id}" style="max-width:150px">${keep}<option value="1">Ja</option><option value="0">Nej</option></select></label>`;
  const others = sortedRoster().filter(x => !x.isDisplay && x.active);
  return {
    title: `Ändra ${n} användare`,
    body: `<p class="hint" style="margin-top:6px">Bara fälten du väljer ändras; övriga lämnas som de är. Ändringen gäller alla markerade (${[...ubSel()].map(nameOf).join(', ')}).</p>
      <label class="role-row"><span><strong>Yrkesroll</strong></span><select id="bk-role" style="max-width:150px">${keep}${UB_ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      ${yn('bk-director', 'Studierektor')}
      ${yn('bk-active', 'Aktiv', 'Ett inaktivt konto kan inte logga in.')}
      ${ubHasOp() ? yn('bk-book', 'Bokar opjour') + yn('bk-reserve', 'Reserv') + yn('bk-stats', 'Statistik') : ''}
      <label class="role-row"><span><strong>Startsida</strong></span><select id="bk-start" style="max-width:190px">${keep}${START_PAGES.filter(([, , ok]) => ok(mods())).map(([v, l]) => `<option value="${v || '__start'}">${l}</option>`).join('')}</select></label>
      ${ubHasSt() ? `<h3>ST-läkare bland de markerade</h3>
      <label class="role-row"><span><strong>Målbeskrivning</strong></span><select id="bk-fw" style="max-width:190px">${keep}<option value="__clinic">Klinikens förval</option>${(_admin.frameworks || []).map(f => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}</select></label>
      <label class="role-row"><span><strong>Lägg till handledare</strong></span><select id="bk-sup" style="max-width:190px">${keep}${others.map(x => `<option value="${esc(x.id)}">${esc(x.displayName)}</option>`).join('')}</select></label>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn" onclick="ubRunBulk(this)">Genomför</button><button class="btn-ghost" onclick="closeUserPanel()">Avbryt</button></div>
      <div class="status" id="up-status"></div>`
  };
}

async function ubRunBulk(btn) {
  const v = id => el(id)?.value || '';
  const set = {};
  if (v('bk-role')) set.jobRole = v('bk-role');
  for (const [id, k] of [['bk-director', 'isDirector'], ['bk-active', 'active'], ['bk-book', 'opjourBook'], ['bk-reserve', 'availableReserve'], ['bk-stats', 'canSeeStats']]) if (v(id)) set[k] = v(id) === '1';
  if (v('bk-start')) set.startPage = v('bk-start') === '__start' ? '' : v('bk-start');
  const fw = v('bk-fw'), sup = v('bk-sup');
  if (!Object.keys(set).length && !fw && !sup) { showStatus(el('up-status'), 'Välj minst ett fält att ändra.', false); return; }
  if (set.active === false && !confirm(`Inaktivera ${ubSel().size} konton? De kan inte längre logga in.`)) return;
  btn.disabled = true;
  const fields = ubFields(), people = [...ubSel()].map(id => sortedRoster().find(u => u.id === id)).filter(Boolean);
  let changed = 0; const errs = [];
  for (const u of people) {
    const ch = {};
    for (const [k, val] of Object.entries(set)) { const f = fields.find(x => x.k === k); if (f && ubCur(f, u) !== val) ch[k] = val; }
    const isSt = (ch.jobRole ?? (u.jobRole || (u.isSt ? 'ST' : ''))) === 'ST';
    if (isSt && fw) ch.frameworkId = fw === '__clinic' ? null : fw;
    if (isSt && sup && sup !== u.id && !(u.supervisorIds || []).includes(sup)) ch.supervisorIds = [...(u.supervisorIds || []), sup].sort().join(',');
    if (!Object.keys(ch).length) continue;
    const e = await ubApply(u, ch);
    if (e.length) errs.push(`${u.displayName}: ${e.join('; ')}`); else changed++;
  }
  await reloadAdmin();
  if (errs.length) { openUserPanel({ kind: 'bulk' }); showStatus(el('up-status'), `${changed} ändrade. Fel: ${errs.join(' · ')}`, false); }
  else { closeUserPanel(); toast(changed ? `${changed} användare ändrade.` : 'Inget behövde ändras.'); }
}

// ── Export ────────────────────────────────────────────────────────────────
function ubExport() {
  const fields = ubFields(), list = sortedRoster().filter(u => !u.isDisplay);
  const rows = [['Id (ändra inte)', ...fields.map(f => f.h)], ...list.map(u => [u.id, ...fields.map(f => f.get(u))])];
  const blob = OpjourImport.writeXlsx(rows, { sheet: 'Användare', widths: [12, ...fields.map(f => Math.max(12, Math.min(34, f.h.length + 4)))] });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `anvandare-${(_admin.me.clinicName || 'klinik').replace(/[^\wåäöÅÄÖ-]+/g, '-')}-${todayStockholm()}.xlsx` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Import av ändrad lista ────────────────────────────────────────────────
function ubSyncPanel() {
  return {
    title: 'Uppdatera från Excel',
    body: `<p class="hint" style="margin-top:6px">Exportera listan, ändra i Excel och läs in den här. Bara det som skiljer sig ändras — en tom cell betyder
        "ändra inte". Rader utan Id och utan träff på användarnamn eller namn blir nya användare. Du ser alla ändringar innan något sparas.
        Kolumner som saknas i filen lämnas orörda; Ja/Nej-kolumner tar Ja eller Nej.</p>
      <div class="row" style="margin-top:10px"><input type="file" id="ub-file" accept=".xlsx,.csv" onchange="ubReadFile(this.files[0])"></div>
      <div id="ub-out"></div>`
  };
}

async function ubReadFile(file) {
  const out = el('ub-out');
  if (!file) return;
  out.innerHTML = '<p class="muted">Läser filen…</p>';
  try {
    const table = await OpjourImport.readTable(file);
    const fields = ubFields(), norm = s => String(s ?? '').trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
    const hIdx = table.findIndex(r => r.some(c => norm(c) === 'fullständigt namn'));
    if (hIdx < 0) throw new Error('Hittar ingen kolumn "Fullständigt namn". Utgå från exporten.');
    const head = table[hIdx].map(norm), col = h => head.indexOf(norm(h));
    const idCol = head.indexOf('id'), used = fields.filter(f => col(f.h) >= 0);
    const roster = sortedRoster().filter(u => !u.isDisplay);
    const plan = { changes: [], created: [], errors: [] };
    table.slice(hIdx + 1).forEach((r, i) => {
      const cell = f => r[col(f.h)];
      const name = String(r[col('Fullständigt namn')] ?? '').trim(), line = hIdx + 2 + i;
      if (!name) return;
      const id = idCol >= 0 ? String(r[idCol] ?? '').trim() : '';
      const uname = String(r[col('Användarnamn')] ?? '').trim().toLowerCase();
      const byName = roster.filter(u => normName(u.displayName) === normName(name));
      const u = (id && roster.find(x => x.id === id)) || (uname && roster.find(x => (x.username || '').toLowerCase() === uname)) || (byName.length === 1 ? byName[0] : null);
      const ch = {}, bad = [];
      for (const f of used) {
        const v = ubParse(f, cell(f));
        if (v === undefined) continue;
        if (v === null) { bad.push(`${f.h}: "${cell(f)}"`); continue; }
        if (!u || ubCur(f, u) !== v) ch[f.k] = v;
      }
      if (bad.length) plan.errors.push(`Rad ${line} (${name}): okänt värde — ${bad.join(', ')}`);
      if (u) { if (Object.keys(ch).length) plan.changes.push({ u, ch }); }
      else plan.created.push({ name, ch, line });
    });
    _admin.sync = plan;
    const label = k => fields.find(f => f.k === k)?.h || k;
    const show = (f, v) => f?.k === 'supervisorIds' ? (v ? v.split(',').map(nameOf).join(', ') : '–') : f?.bool ? ubBool(v) : f?.k === 'jobRole' ? (UB_ROLES.find(r => r[0] === v) || ['', v || '–'])[1] : f?.k === 'startPage' ? (START_PAGES.find(p => p[0] === v) || ['', v || 'Startsida'])[1] : (v || '–');
    const old = (u, k) => { const f = fields.find(x => x.k === k); return show(f, ubCur(f, u)); };
    out.innerHTML = `
      ${plan.errors.length ? `<div class="notice warn" style="margin-top:10px"><strong>Hoppas över:</strong><ul>${plan.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <h3>Ändras (${plan.changes.length})</h3>
      ${plan.changes.length ? `<ul class="ub-list">${plan.changes.map(({ u, ch }) => `<li><strong>${esc(u.displayName)}</strong><br>${Object.entries(ch).map(([k, v]) => `<span class="muted">${esc(label(k))}:</span> <del>${esc(old(u, k))}</del> → <ins>${esc(show(fields.find(f => f.k === k), v))}</ins>`).join('<br>')}</li>`).join('')}</ul>` : '<p class="muted">Inga ändringar på befintliga användare.</p>'}
      <h3>Nya användare (${plan.created.length})</h3>
      ${plan.created.length ? `<ul class="ub-list">${plan.created.map(c => `<li><strong>${esc(c.name)}</strong> <span class="muted">${esc(c.ch.username || c.ch.email || '')}</span></li>`).join('')}</ul><p class="hint">Nya konton får en tillfällig PIN som visas efteråt (ladda ner PIN-listan).</p>` : '<p class="muted">Inga.</p>'}
      ${plan.changes.length || plan.created.length ? '<div class="row" style="margin-top:12px"><button class="btn" onclick="ubRunSync(this)">Genomför</button></div>' : ''}
      <div class="status" id="up-status"></div>`;
  } catch (err) { out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

async function ubRunSync(btn) {
  const plan = _admin.sync; if (!plan) return;
  btn.disabled = true;
  const errs = []; let changed = 0, created = 0;
  for (const { u, ch } of plan.changes) {
    const e = await ubApply(u, ch);
    if (e.length) errs.push(`${u.displayName}: ${e.join('; ')}`); else changed++;
  }
  if (plan.created.length) {
    // Nya konton skapas med vanliga importen (namn, användarnamn, telefon, e-post, admin/användare, reserv) och får sedan övriga fält.
    const rows = plan.created.map(c => ({ displayName: c.name, username: c.ch.username || (c.ch.email || '').toLowerCase(), phone: c.ch.phone || '', email: c.ch.email || '',
      role: c.ch.isAdmin ? 'Admin' : 'Användare', reserve: c.ch.availableReserve ? 'Ja' : 'Nej' }));
    try {
      const r = await api('/admin/users/import', { method: 'POST', body: { rows, dryRun: false } });
      created = (r.created || []).length;
      if (created) _admin.created = r.created;
      _admin.me = await api('/me');
      for (const c of plan.created) {
        const u = sortedRoster().find(x => normName(x.displayName) === normName(c.name) && (!c.ch.username || (x.username || '').toLowerCase() === c.ch.username.toLowerCase()));
        if (!u) continue;
        const rest = Object.fromEntries(Object.entries(c.ch).filter(([k]) => !['displayName', 'username', 'phone', 'email', 'isAdmin', 'availableReserve'].includes(k)));
        if (Object.keys(rest).length) { const e = await ubApply(u, rest); if (e.length) errs.push(`${u.displayName}: ${e.join('; ')}`); }
      }
    } catch (e) { errs.push('Nya användare: ' + e.message); }
  }
  _admin.sync = null;
  await reloadAdmin();
  if (_admin.created?.length) _admin.notice = { tone: 'warn', csv: true, html: `${created} nya konton skapade. Ladda ner PIN-listan nu — PIN-koderna visas bara en gång.` };
  if (errs.length) { openUserPanel({ kind: 'sync' }); el('ub-out').innerHTML = `<p class="err">${changed} ändrade${created ? `, ${created} nya` : ''}. Fel:</p><ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`; }
  else { closeUserPanel(); _admin.draw(el('view')); toast(`${changed} ändrade${created ? `, ${created} nya` : ''}.`); }
}

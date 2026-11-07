// ── Admin (#/admin) ──────────────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser() och js/import.js (OpjourImport).
// Användare (U1): sökbar lista med filter; klick öppnar en panel från höger med flikarna Uppgifter, Roller (grupperade per modul,
// med förklaring) och Konto (aktiv, PIN, radera). Lägg till och Importera öppnar också panelen.
// Endast för admin (annars skickas man till startsidan). Hantera klinikens användare, moduler och (global admin) kliniker och felrapporter.
// Opjours inställningar — jourbyte, reserv, statistikbehörighet och väggskärmar — finns i js/opsettings.js (#/opjour-settings).
// Backend skyddar allt (admin-krav, egen klinik, ingen självinaktivering) — detta är bara UI:t.

let _admin = null;

const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');

// "Arvid Lindgren" → "arvid.l" (samma mönster som de migrerade användarna). Admin kan ändra.
function suggestUsername(name) {
  const parts = name.trim().toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[éè]/g, 'e')
    .split(/\s+/).map(p => p.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : parts[0] + '.' + parts[parts.length - 1][0];
}

const ROLE_LABEL = { user: 'Användare', admin: 'Admin', display: 'Visning' };

// mode: 'users' (Inställningar → Användare), 'clinic' (→ Klinik) eller 'system' (→ System, global admin).
async function renderAdmin(root, mode = 'users') {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (mode === 'users' && !me.isAdmin && me.isDirector) { renderStSettings(root, 'personer', 'users'); return; }   // studierektor: ST-läkare och handledare
    if (!me.isAdmin || (['system', 'errors'].includes(mode) && !me.isGlobalAdmin)) { location.hash = '#/installningar/konto'; return; }
    _admin = { me, mode, draw: drawAdmin, open: new Set(), filter: 'alla', q: '', panel: null, notice: null, pin: randomPin(), userTouched: false, plan: null, clinics: null, clinicUserTouched: false };
    if (mode === 'system' || (mode === 'clinic' && me.isGlobalAdmin)) _admin.clinics = (await api('/admin/clinics')).clinics;
    if (mode === 'clinic') _admin.retention = await api('/admin/retention').catch(err => ({ error: err.message }));
    if (mode === 'system') _admin.dops = await api('/dops/status').catch(err => ({ configured: true, ok: false, error: err.message }));
    if (mode === 'errors') _admin.errors = await api('/error-reports').catch(() => null);
    if (mode === 'users' && (me.modules || []).includes('dops')) await loadDopsUsers();
    if (mode === 'users' && (me.modules || []).some(m => m === 'schema' || m === 'mal')) _admin.frameworks = (await api('/goals/frameworks').catch(() => ({ frameworks: [] }))).frameworks;
    drawAdmin(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

// Administration och Inställningar → Opjour delar användarlistans maskineri (_admin, userBlock, userAction); _admin.draw ritar rätt sida.
async function reloadAdmin() {
  _admin.me = await api('/me');
  (_admin.draw || drawAdmin)(el('view'));
}

function adminChips(u) {
  return [
    u.isDisplay ? '<span class="tagchip admin">Visning</span>' : '',
    u.isGlobalAdmin ? '<span class="tagchip admin">Global admin</span>' : '',
    u.isAdmin && !u.isGlobalAdmin ? '<span class="tagchip admin">Admin</span>' : '',
    u.isDirector ? '<span class="tagchip">Studierektor</span>' : '',
    u.isSt ? `<span class="tagchip">ST${u.stEnd && String(u.stEnd).slice(0, 10) <= todayStockholm() ? ' klar' : ''}</span>` : '',
    !u.isDisplay && !u.isAdmin && u.canSeeStats ? '<span class="tagchip">Statistik</span>' : '',
    !u.active ? '<span class="tagchip off">Inaktiv</span>' : '',
    u.active && u.availableReserve && !u.isDisplay ? '<span class="tagchip">Reserv</span>' : ''
  ].join(' ');
}

function sw(attrs, checked, disabled) {
  return `<span class="switch"><input type="checkbox" role="switch" ${attrs} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"><span class="knob"></span></span></span>`;
}

// Ett reglage med rubrik. Måste vara en <label> — annars når klicket på reglagets spår aldrig kryssrutan under det.
function quickSwitch(caption, attr, checked, disabled, why) {
  return `<label class="qsw"${why ? ` title="${esc(why)}"` : ''}><span>${caption}</span>${sw(`data-a="${attr}"`, checked, disabled)}</label>`;
}

function userBlock(u, selfId) {
  const isSelf = u.id === selfId;
  const locked = u.isGlobalAdmin && !_admin.me.isGlobalAdmin;   // bara en global admin får röra ett globalt adminkonto
  const bookings = u.claimCount ? ` · ${u.claimCount} bokning${u.claimCount === 1 ? '' : 'ar'}` : '';
  const open = _admin.open.has(u.id);
  const fixed = isSelf || u.isGlobalAdmin || locked;   // får inte inaktiveras/degraderas här
  const why = isSelf ? 'Du kan inte ändra detta på dig själv.' : u.isGlobalAdmin ? 'Globalt adminkonto.' : '';
  // Snabbreglagen sitter i huvudraden så att man slipper fälla ut kortet. Visningskonton har bara "Aktiv".
  // Reserv och Statistik ställs in under Inställningar → Opjour.
  const quick = u.isDisplay
    ? quickSwitch('Aktiv', 'active', u.active, fixed, why)
    : quickSwitch('Admin', 'admin', u.isAdmin, fixed, why) + quickSwitch('Aktiv', 'active', u.active, fixed, why);
  return `
    <div class="ublock${open ? ' open' : ''}" data-id="${esc(u.id)}">
      <div class="uhead">
        <button type="button" class="uinfo" data-a="toggle" aria-expanded="${open}">
          <span class="uname">${esc(u.displayName)}${isSelf ? ' <span class="muted">(du)</span>' : ''}</span>
          <span class="uuser">${esc(u.username || '')}${bookings}</span> ${adminChips(u)}
        </button>
        <div class="qsws">${quick}</div>
      </div>
      <div class="status" data-s></div>
      <div class="body">
        <div class="field-row">
          <div><label>${u.isDisplay ? 'Namn (kontonamn)' : 'Fullständigt namn'}</label><input type="text" data-f="name" value="${esc(u.displayName)}" maxlength="60"></div>
          <div><label>Användarnamn</label><input type="text" data-f="username" value="${esc(u.username || '')}" maxlength="60" autocapitalize="none" spellcheck="false"></div>
          ${u.isDisplay ? '' : `<div><label>Telefon</label><input type="tel" data-f="phone" value="${esc(u.phone || '')}" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>`}
        </div>
        <div class="row" style="margin-top:10px"><button class="btn" data-a="save">Spara</button></div>
        ${u.isDisplay || !(_admin.me.modules || []).some(m => m === 'schema' || m === 'mal') ? '' : stSection(u, locked)}
        ${u.isDisplay ? '<p class="hint">Visningskonto: loggar in som alla andra men ser bara kalendern (ingen bokning, ingen reserv).</p>' : ''}
        ${isSelf ? '<p class="hint">Du kan inte inaktivera, ta bort eller degradera dig själv.</p>' : ''}
        ${locked ? '<p class="hint">Globalt adminkonto — kan bara ändras av en global admin.</p>' : ''}
        <div class="row" style="margin-top:12px;gap:8px">
          ${locked ? '' : '<button class="btn-ghost" data-a="resetpin">Återställ PIN…</button>'}
          ${isSelf || u.isGlobalAdmin ? '' : '<button class="btn-ghost" style="color:var(--danger);border-color:#e3b3ab" data-a="delete">Radera användare…</button>'}
        </div>
      </div>
    </div>`;
}

// ST-roller: ändras direkt med reglagen. ST-start/-slut, målbeskrivning och handledare sätts under Inställningar → ST-utbildning.
function stSection(u, locked) {
  return `
        <div class="st-sec" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line)">
          <strong>ST</strong>
          <div class="qsws" style="grid-template-columns:repeat(2, 90px);margin:6px 0">
            ${quickSwitch('ST-läkare', 'st', u.isSt, locked, '')}${quickSwitch('Studierektor', 'director', u.isDirector, locked, '')}
          </div>
          ${u.isSt ? '<p class="hint" style="margin:4px 0 0">ST-start, målbeskrivning och handledare: i personens panel under Inställningar → Användare.</p>' : ''}
        </div>`;
}

function noticeCard() {
  const { notice } = _admin;
  return notice ? `<div class="card notice ${notice.tone === 'warn' ? 'warn' : ''}">
      <div>${notice.html}</div>
      <div class="row" style="margin-top:8px">
        ${notice.csv ? '<button class="btn-ghost" onclick="downloadPinList()">Ladda ner PIN-lista (CSV)</button>' : ''}
        <button class="link-btn" style="color:var(--ink-soft)" onclick="_admin.notice=null;_admin.created=null;_admin.draw(el('view'))">Stäng</button>
      </div>
    </div>` : '';
}

const sortedRoster = () => [...(_admin.me.roster || [])].sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'));

function drawAdmin(root) {
  const { me } = _admin;
  const opjour = (me.modules || ['opjour']).includes('opjour');
  const roster = sortedRoster().filter(u => !u.isDisplay);   // väggskärmarna hanteras under Inställningar → Opjour

  const mode = _admin.mode || 'users';
  if (mode === 'clinic') {
    root.innerHTML = `<h1 class="page">Klinik</h1>${noticeCard()}${me.isGlobalAdmin && _admin.clinics ? clinicPickCard() : ''}${moduleCard()}${retentionCard()}${me.isGlobalAdmin && _admin.clinics ? importCard() : ''}`;
    return;
  }
  if (mode === 'system') {
    root.innerHTML = `<h1 class="page">System</h1>${noticeCard()}${_admin.clinics ? clinicCard() : ''}${_admin.dops ? dopsCard() : ''}`;
    return;
  }
  if (mode === 'errors') {
    root.innerHTML = `<h1 class="page">Felanmälan</h1>${_admin.errors ? errorCard() : '<p class="err">Kunde inte hämta felrapporterna.</p>'}`;
    return;
  }
  root.innerHTML = `
    <h1 class="page">Användare</h1>

    ${noticeCard()}

    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Användare (${roster.filter(u => u.active).length})</h2>
        <div class="row" style="gap:8px">
          <button class="btn-ghost" onclick="ubExport()" title="Hela listan som Excel-fil">Exportera Excel</button>
          <button class="btn-ghost" onclick="openUserPanel({ kind: 'sync' })" title="Läs in en ändrad export; bara det som ändrats uppdateras">Uppdatera från Excel…</button>
          <button class="btn-ghost" onclick="openUserPanel({ kind: 'import' })">Importera…</button>
          <button class="btn" onclick="openUserPanel({ kind: 'add' })">+ Lägg till</button>
        </div>
      </div>
      <div class="row" style="margin:12px 0 8px;gap:8px">
        <input type="search" id="u-q" placeholder="Sök namn eller användarnamn…" value="${esc(_admin.q)}" oninput="_admin.q=this.value;drawUserRows()" style="flex:1 1 220px;max-width:none">
        <div class="seg" id="u-filter">${U_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="${_admin.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      ${dupBox()}
      <div id="u-bulk" class="u-bulk hidden"></div>
      <div id="u-rows" class="urows"></div>
    </div>

    ${_admin.dopsUsers ? dopsUsersCard() : ''}
  `;
  el('u-filter').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { _admin.filter = b.dataset.f; drawAdmin(el('view')); } });
  el('u-rows').addEventListener('click', e => { const r = e.target.closest('[data-uid]'); if (r) openUserPanel({ kind: 'user', id: r.dataset.uid, tab: 'roller' }); });
  el('u-rows').addEventListener('change', e => {
    const c = e.target.closest('[data-sel]'); if (c) { ubToggle(c.dataset.sel, c.checked); return; }
    const all = e.target.closest('#u-selall'); if (all) ubToggleAll(JSON.parse(all.dataset.ids), all.checked);
  });
  root.querySelector('.dup-box')?.addEventListener('click', e => { const b = e.target.closest('[data-merge]'); if (b) openUserPanel({ kind: 'merge', ids: b.dataset.merge.split(',') }); });
  drawUserRows();
  if (_admin.panel) drawUserPanel();
}


// ── Användarlista (U1) ────────────────────────────────────────────────────
const U_FILTERS = [['alla', 'Alla'], ['st', 'ST-läkare'], ['handl', 'Handledare'], ['admin', 'Admin'], ['inaktiva', 'Inaktiva']];
const adeptsOf = id => (_admin.me.roster || []).filter(x => x.active && (x.supervisorIds || []).includes(id));
const nameOf = id => (_admin.me.roster || []).find(x => x.id === id)?.displayName || '?';
const mods = () => _admin.me.modules || ['opjour'];

// ── Dubbletter och sammanslagning ─────────────────────────────────────────
// Samma namn (oavsett versaler och extra mellanslag) på flera personkonton = möjlig dubblett, t.ex. efter en import.
const normName = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
function dupGroups() {
  const by = new Map();
  for (const u of (_admin.me.roster || []).filter(x => !x.isDisplay)) by.set(normName(u.displayName), [...(by.get(normName(u.displayName)) || []), u]);
  return [...by.values()].filter(g => g.length > 1);
}
function dupBox() {
  const g = dupGroups();
  if (!g.length) return '';
  return `<div class="dup-box"><strong>Möjliga dubbletter (${g.length})</strong> — samma namn på flera konton. Slå ihop dem så att pass, schema och
    måluppfyllelse hamnar på ett konto.
    <ul>${g.map(us => `<li>${esc(us[0].displayName)} <span class="muted">(${us.map(u => esc(u.username || '')).join(', ')})</span>
      <button type="button" class="btn-ghost" data-merge="${esc(us[0].id)},${esc(us[1].id)}">Slå ihop…</button></li>`).join('')}</ul></div>`;
}
// Vilket konto ska behållas som förval: ditt eget, ett globalt adminkonto, annars det äldsta (originalet — dubbletten
// kommer oftast från en senare import), vid samma tid det med flest pass.
function defaultKeep(a, b) {
  const me = _admin.me.userId;
  if (a.id === me || a.isGlobalAdmin) return a.id;
  if (b.id === me || b.isGlobalAdmin) return b.id;
  const ca = String(a.createdAt || ''), cb = String(b.createdAt || '');
  if (ca !== cb) return ca < cb ? a.id : b.id;
  return (a.claimCount || 0) >= (b.claimCount || 0) ? a.id : b.id;
}
function mergeCard(u, keep) {
  const roles = [u.isAdmin && 'Admin', u.isSt && 'ST-läkare', u.isDirector && 'Studierektor', u.availableReserve && 'Reserv', !u.active && 'Inaktiv'].filter(Boolean);
  const n = adeptsOf(u.id).length;
  return `<label class="merge-card${u.id === keep ? ' on' : ''}">
    <input type="radio" name="mg-keep" value="${esc(u.id)}"${u.id === keep ? ' checked' : ''}>
    <span><strong>${esc(u.displayName)}</strong>${u.id === _admin.me.userId ? ' <span class="muted">(du)</span>' : ''}
      <small>Användarnamn: ${esc(u.username || '–')}</small>
      <small>Telefon: ${esc(u.phone || '–')} · E-post: ${esc(u.email || '–')}</small>
      <small>Roller: ${roles.length ? roles.join(', ') : 'Användare'}${n ? ` · handledare för ${n}` : ''}</small>
      <small>Pass: ${u.claimCount || 0}${u.futureClaimCount ? ` (${u.futureClaimCount} kommande)` : ''} · skapat ${esc(String(u.createdAt || '').slice(0, 10) || '–')}</small>
      <em class="mg-tag">${u.id === keep ? 'Behålls' : 'Slås in och raderas'}</em></span>
  </label>`;
}

function drawUserRows() {
  const q = _admin.q.trim().toLowerCase(), f = _admin.filter;
  const list = sortedRoster().filter(u => !u.isDisplay)
    .filter(u => f === 'inaktiva' ? !u.active : u.active)
    .filter(u => f === 'st' ? u.isSt : f === 'handl' ? adeptsOf(u.id).length : f === 'admin' ? u.isAdmin : true)
    .filter(u => !q || (u.displayName + ' ' + (u.username || '')).toLowerCase().includes(q));
  const sel = ubSel(), allOn = list.length && list.every(u => sel.has(u.id));
  el('u-rows').innerHTML = (list.length ? `<label class="u-selall"><input type="checkbox" id="u-selall" data-ids='${esc(JSON.stringify(list.map(u => u.id)))}'${allOn ? ' checked' : ''}> Markera alla ${list.length} i listan</label>` : '')
    + list.map(u => {
    const n = adeptsOf(u.id).length;
    return `<div class="urow-w${sel.has(u.id) ? ' sel' : ''}"><input type="checkbox" class="u-sel" data-sel="${esc(u.id)}" aria-label="Markera ${esc(u.displayName)}"${sel.has(u.id) ? ' checked' : ''}>
      <button type="button" class="urow${_admin.panel?.id === u.id ? ' on' : ''}" data-uid="${esc(u.id)}">
      <span class="uname">${esc(u.displayName)}${u.id === _admin.me.userId ? ' <span class="muted">(du)</span>' : ''}</span>
      <span class="uuser">${esc(u.username || '')}</span>
      <span class="uchips">${adminChips(u)}${n ? ` <span class="tagchip">Handledare (${n})</span>` : ''}</span>
    </button></div>`;
  }).join('') || `<p class="muted">${q ? 'Ingen träff.' : 'Inga användare här.'}</p>`;
  ubBar();
}

function openUserPanel(p) { _admin.panel = p; drawUserPanel(); if (el('u-rows')) drawUserRows(); }
function closeUserPanel() { _admin.panel = null; _admin.plan = null; el('sheet-root')?.remove(); if (el('u-rows')) drawUserRows(); }

function roleRow(title, info, attr, checked, disabled, why) {
  return `<label class="role-row"${why ? ` title="${esc(why)}"` : ''}><span><strong>${title}</strong><small>${info}</small></span>${sw(`data-r="${attr}"`, checked, disabled)}</label>`;
}

// DOPS i användarpanelen: kopplingen till DOPS-kontot och personens användarroll i DOPS (vad hen gör där). Klinikroller och yrkesroll
// sätts ovan och gäller även DOPS; under parallellkörningen visas DOPS-appens värden och skillnader, och ändringar där är låsta
// tills ST-Lotsen får skriva i DOPS-appens databas.
function dopsUserSection(u) {
  const d = _admin.dopsUsers;
  if (!d || d.error) return `<h3>DOPS</h3><p class="hint">${d?.error ? esc(d.error) : 'Kopplingen till DOPS är inte inläst.'}</p>`;
  const link = d.linked.find(x => x.user.id === u.id), sugg = d.suggestions.find(x => x.user.id === u.id);
  if (!link) return `<h3>DOPS</h3><p class="hint">Inte kopplat till något DOPS-konto.${sugg ? ` Förslag: <strong>${esc(sugg.dops.name)}</strong> (${sugg.by === 'email' ? 'samma e-post' : 'samma namn'}).` : ''} Kopplas i listan <em>DOPS-konton</em> på sidan Användare.</p>`;
  const x = link.dops;
  if (!x) return `<h3>DOPS</h3><p class="err">Kopplat DOPS-konto finns inte längre.</p>`;
  const diff = [];
  if (link.diffs.includes('admin')) diff.push(`Admin: ${x.admin ? 'ja' : 'nej'} i DOPS`);
  if (link.diffs.includes('studierektor')) diff.push(`Studierektor: ${x.director ? 'ja' : 'nej'} i DOPS`);
  if ((u.jobRole || '') !== (x.jobRole || '')) diff.push(`Yrkesroll i DOPS: ${esc(x.jobRole || '–')}`);
  return `<h3>DOPS</h3>
    <div class="role-info"><strong>Kopplat till</strong><small>${esc(x.name)} · ${esc(x.email || 'ingen e-post')}</small></div>
    <label class="role-row"><span><strong>Användarroll i DOPS</strong><small>Blandbild registrerar och tar emot, Registrerare bara registrerar, Mottagare bara tar emot.</small></span>
      <select id="up-dopsrole" data-dops="${esc(x.id)}" style="max-width:140px">${['Blandbild', 'Registrerare', 'Mottagare'].map(r => `<option${r === x.userRole ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
    ${diff.length ? `<p class="hint">Skiljer sig i DOPS-appen: ${diff.join(' · ')}. Förs över när ST-Lotsen får skriva i DOPS-appens databas.</p>` : ''}`;
}

function drawUserPanel() {
  const p = _admin.panel;
  let title, body, foot = '';
  if (p.kind === 'add') {
    title = 'Lägg till användare';
    body = `<form id="au-form" onsubmit="return addUser(event)">
        <label for="au-name">Fullständigt namn</label><input type="text" id="au-name" maxlength="60" required oninput="onAuName(this.value)">
        <label for="au-email">E-post</label><input type="email" id="au-email" maxlength="120" autocapitalize="none" spellcheck="false" oninput="onAuEmail(this.value)">
        <label for="au-user">Användarnamn <small class="muted" style="font-weight:normal">— e-postadressen om inget annat anges</small></label><input type="text" id="au-user" autocapitalize="none" spellcheck="false" maxlength="60" oninput="_admin.userTouched=true">
        <label for="au-phone">Telefon (valfritt)</label><input type="tel" id="au-phone" maxlength="30" inputmode="tel" placeholder="070-123 45 67">
        <label for="au-role">Roll</label><select id="au-role"><option value="user">Användare</option><option value="admin">Admin</option></select>
        <label for="au-pin">Tillfällig PIN</label>
        <div class="row" style="flex-wrap:nowrap"><input type="text" id="au-pin" inputmode="numeric" maxlength="4" value="${esc(_admin.pin)}" style="max-width:120px" required>
          <button type="button" class="btn-ghost" onclick="el('au-pin').value=randomPin()">Slumpa</button></div>
        <p class="hint">Personen väljer en egen PIN vid första inloggningen. Övriga roller (ST-läkare, reserv …) sätts i personens panel efteråt.</p>
        <div class="row" style="margin-top:12px"><button type="submit" class="btn">Lägg till</button></div>
        <div id="au-status" class="status err"></div>
      </form>`;
  } else if (p.kind === 'import') {
    title = 'Importera användare';
    body = `<p class="hint" style="margin-top:8px">Ladda upp en lista som CSV eller Excel (.xlsx). Kolumner: <strong>Fullständigt namn</strong> (obligatorisk), Användarnamn, Telefon, E-post, Roll och Reserv. Filen läses i din webbläsare; en förhandsvisning visas innan något skapas. Personer som redan finns (samma namn) får bara tom telefon och e-post ifylld — inget nytt konto. Befintliga användarnamn hoppas över.</p>
      <div class="row" style="margin-top:10px">
        <button class="btn-ghost" onclick="downloadImportTemplate()">Ladda ner mall (CSV)</button>
        <input type="file" id="imp-file" accept=".csv,.txt,.xlsx" onchange="onImportFile(this.files[0])">
      </div>
      <div id="imp-out"></div>`;
  } else if (p.kind === 'bulk' || p.kind === 'sync') {
    ({ title, body } = p.kind === 'bulk' ? ubBulkPanel() : ubSyncPanel());
  } else if (p.kind === 'merge') {
    const [a, b] = p.ids.map(id => (_admin.me.roster || []).find(x => x.id === id));
    if (!a || !b) { closeUserPanel(); return; }
    p.keep = p.keep || defaultKeep(a, b);
    title = 'Slå ihop konton';
    body = `<p class="hint" style="margin-top:6px">Välj vilket konto som ska <strong>behållas</strong>. Det behåller namn, användarnamn, PIN och roller.
        Allt från det andra kontot flyttas över — pass, intresseanmälningar, veckoschema, måluppfyllelse, handledning och signeringar —
        och tomma uppgifter (telefon, e-post, ST-datum) fylls i. Är det andra ST-läkare eller reserv blir det behållna det också.
        Sedan raderas det andra kontot. Det går inte att ångra.</p>
      <div class="merge-pair" id="mg-pair">${mergeCard(a, p.keep)}${mergeCard(b, p.keep)}</div>
      <div class="row" style="margin-top:12px"><button class="btn" onclick="performMerge()">Slå ihop</button>
        <button class="btn-ghost" onclick="closeUserPanel()">Avbryt</button></div>
      <div class="status" id="up-status"></div>`;
  } else {
    const u = (_admin.me.roster || []).find(x => x.id === p.id);
    if (!u) { closeUserPanel(); return; }
    const isSelf = u.id === _admin.me.userId, locked = u.isGlobalAdmin && !_admin.me.isGlobalAdmin;
    const fixed = isSelf || u.isGlobalAdmin || locked;
    const why = isSelf ? 'Du kan inte ändra detta på dig själv.' : u.isGlobalAdmin ? 'Globalt adminkonto.' : '';
    const tab = p.tab || 'roller';
    title = esc(u.displayName) + (isSelf ? ' <span class="muted" style="font-weight:normal">(du)</span>' : '');
    const tabs = [['roller', 'Roller'], ['uppgifter', 'Uppgifter'], ['konto', 'Konto']];
    const adepts = adeptsOf(u.id), st = mods().includes('schema') || mods().includes('mal');
    const panes = {
      uppgifter: `
        <label for="up-name">Fullständigt namn</label><input type="text" id="up-name" value="${esc(u.displayName)}" maxlength="60">
        <label for="up-user">Användarnamn</label><input type="text" id="up-user" value="${esc(u.username || '')}" maxlength="60" autocapitalize="none" spellcheck="false">
        <label for="up-phone">Telefon</label><input type="tel" id="up-phone" value="${esc(u.phone || '')}" maxlength="30" inputmode="tel" placeholder="070-123 45 67">
        <label for="up-email">E-post</label><input type="email" id="up-email" value="${esc(u.email || '')}" maxlength="120" autocapitalize="none" spellcheck="false">
        <label for="up-start">Startsida</label><select id="up-start">${startPageOptions(_admin.me, u.startPage)}</select>
        <p class="hint" style="margin-top:4px">Sidan som öppnas när personen startar ST-Lotsen. Personen kan också välja själv under Mitt konto.</p>
        <div class="row" style="margin-top:12px"><button class="btn" onclick="saveUserDetails()" ${locked ? 'disabled' : ''}>Spara</button></div>`,
      roller: `
        <h3>Klinik <small class="muted" style="font-weight:normal">— gäller alla moduler</small></h3>
        ${roleRow('Admin', 'Hanterar användare, moduler och alla inställningar på kliniken.', 'admin', u.isAdmin, fixed, why)}
        ${roleRow('Studierektor', 'Ställer in ST-utbildningen och DOPS och ser alla ST-läkare och deras bedömningar.', 'director', u.isDirector, locked, '')}
        <label class="role-row"><span><strong>Yrkesroll</strong><small>Samma i alla moduler. ST = ST-läkare med utbildningsplan.</small></span>
          <select id="up-jobrole" style="max-width:140px"${locked ? ' disabled' : ''}>${[['', '–'], ['ST', 'ST-läkare'], ['BT', 'BT-läkare'], ['AT', 'AT-läkare'], ['Spec', 'Specialist'], ['Annan', 'Annan']]
            .map(([v, l]) => `<option value="${v}"${v === (u.jobRole || (u.isSt ? 'ST' : '')) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        ${mods().includes('opjour') ? `<h3>Opjour</h3>
        ${roleRow('Bokar opjour', 'Av = visningsläge: ser vem som har opjour men bokas inte och är inte reserv (t.ex. överläkare).', 'opjour', !u.opjourView, locked, '')}
        ${roleRow('Reserv', 'Ingår i utlottningen när ingen har bokat dagen. Personen kan också slå på det själv.', 'reserve', u.availableReserve, locked || u.opjourView, u.opjourView ? 'Visningsläge — kan inte vara reserv.' : '')}
        ${roleRow('Statistik', u.isAdmin ? 'Ser sidan Statistik — admin ser den alltid.' : 'Ser sidan Statistik.', 'stats', u.isAdmin || u.canSeeStats, u.isAdmin || locked, '')}` : ''}
        ${st ? `<h3>ST-utbildning</h3>
        <div class="role-info"><strong>Handledare för</strong><small>${adepts.length ? adepts.map(a => esc(a.displayName)).join(', ') : 'ingen'}</small></div>
        ${u.isSt ? stPersonFields(u, locked) : '<p class="hint">Sätt yrkesrollen till ST-läkare för att ange ST-start, målbeskrivning och handledare.</p>'}` : ''}
        ${mods().includes('dops') ? dopsUserSection(u) : ''}`,
      konto: `
        ${roleRow('Aktiv', 'Ett inaktivt konto kan inte logga in. Bokningar och historik ligger kvar.', 'active', u.active, fixed, why)}
        <h3>PIN</h3>
        ${locked ? '<p class="hint">Globalt adminkonto — kan bara ändras av en global admin.</p>' : '<button class="btn-ghost" onclick="resetUserPin()">Återställ PIN…</button><p class="hint">Personen får en tillfällig PIN och väljer en egen vid nästa inloggning.</p>'}
        <h3>Slå ihop</h3>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><select id="up-merge" style="flex:1;min-width:0"><option value="">Välj dubblett…</option>${sortedRoster()
          .filter(x => !x.isDisplay && x.id !== u.id).sort((x, y) => (normName(y.displayName) === normName(u.displayName)) - (normName(x.displayName) === normName(u.displayName)))
          .map(x => `<option value="${esc(x.id)}">${esc(x.displayName)} (${esc(x.username || '')})</option>`).join('')}</select>
          <button class="btn-ghost" onclick="el('up-merge').value && openUserPanel({ kind: 'merge', ids: ['${esc(u.id)}', el('up-merge').value], keep: '${esc(u.id)}' })">Slå ihop…</button></div>
        <p class="hint">Har personen två konton? Allt flyttas till ett av dem och det andra raderas — du väljer vilket som behålls.</p>
        ${!u.active && !u.isGlobalAdmin && !isSelf ? `<h3>Avidentifiera</h3>
        <button class="btn-ghost" onclick="anonymizeUser()">Avidentifiera…</button>
        <p class="hint">Tar bort namn, användarnamn, kontaktuppgifter, PIN, roller och handledarrelationer. Pass, schema och ST-historik ligger kvar men visas som "Ingen användare". Görs också automatiskt enligt gallringen under Inställningar → Klinik.</p>` : ''}
        ${isSelf || u.isGlobalAdmin ? '<p class="hint">Du kan inte inaktivera, ta bort eller degradera dig själv.</p>' : `<h3>Radera</h3>
        <button class="btn-ghost" style="color:var(--danger);border-color:#e3b3ab" onclick="deleteUser()">Radera användare…</button>
        <p class="hint">Raderar kontot och personens bokningar permanent. Vill du behålla historiken: stäng av Aktiv i stället.</p>`}`
    };
    body = `<nav class="subtabs" style="margin:6px 0 4px">${tabs.map(([k, l]) => `<a href="#" data-tab="${k}"${k === tab ? ' class="active"' : ''}>${l}</a>`).join('')}</nav>
      <div class="status" id="up-status"></div>${panes[tab]}`;
  }
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel" role="dialog" aria-label="${p.kind === 'user' ? 'Användare' : esc(title.replace(/<[^>]*>/g, ''))}">
    <div class="sp-head"><h2 style="margin:0">${title}</h2><button class="btn-ghost" onclick="closeUserPanel()" aria-label="Stäng">✕</button></div>
    <div class="sp-body">${body}</div>${foot}</aside>`;
  root.addEventListener('click', e => {
    if (e.target === root) { closeUserPanel(); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { e.preventDefault(); _admin.panel.tab = t.dataset.tab; drawUserPanel(); }
  });
  root.addEventListener('change', e => {
    const box = e.target.closest('input[data-r]'); if (box) onRoleChange(box);
    if (e.target.id === 'up-jobrole') panelAction(() => api('/admin/users/' + encodeURIComponent(_admin.panel.id), { method: 'PATCH', body: { jobRole: e.target.value } }), 'Yrkesrollen är sparad.');
    if (e.target.id === 'up-dopsrole') panelAction(() => api('/dops/app/users/' + encodeURIComponent(e.target.dataset.dops), { method: 'PATCH', body: { userRole: e.target.value } }), 'Sparat i DOPS.');
    if (e.target.name === 'mg-keep') { _admin.panel.keep = e.target.value; drawUserPanel(); }
  });
  document.body.appendChild(root);
  if (p.kind === 'import' && _admin.plan) drawImportPlan();
}

// ST-uppgifter i användarpanelen (tidigare Inställningar → ST-utbildning → ST-läkare och handledare): ST-start och -slut,
// målbeskrivning och handledare. Sparas med PATCH /admin/st/people/:id (studierektor eller admin).
const toMonthU = iso => (iso || '').slice(0, 7);
function stPersonFields(u, locked) {
  const others = sortedRoster().filter(x => !x.isDisplay && x.active && x.id !== u.id);
  const sup = new Set(u.supervisorIds || []);
  return `<div class="field-row">
      <div><label for="up-ststart">ST-start</label><input type="month" id="up-ststart" value="${esc(toMonthU(u.stStart))}"${locked ? ' disabled' : ''}></div>
      <div><label for="up-stend">ST-slut <small class="muted" style="font-weight:normal">(när ST är klar)</small></label><input type="month" id="up-stend" value="${esc(toMonthU(u.stEnd))}"${locked ? ' disabled' : ''}></div>
    </div>
    <label for="up-fw">Målbeskrivning</label><select id="up-fw"${locked ? ' disabled' : ''}><option value="">Klinikens förval</option>${(_admin.frameworks || []).map(f => `<option value="${esc(f.id)}"${f.id === u.frameworkId ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
    <label>Handledare</label>
    <details class="sup-pick"><summary>${sup.size ? [...sup].map(id => `<span class="chip">${esc(nameOf(id))}</span>`).join('') : '<span class="muted">Ingen handledare — välj</span>'}</summary>
      <div class="sup-list">${others.map(x => `<label class="row" style="gap:6px;font-weight:normal;margin:2px 0"><input type="checkbox" data-supv="${esc(x.id)}"${sup.has(x.id) ? ' checked' : ''}> ${esc(x.displayName)}</label>`).join('')}</div>
    </details>
    <div class="row" style="margin-top:10px;gap:8px"><button class="btn" onclick="saveStPerson()"${locked ? ' disabled' : ''}>Spara ST-uppgifter</button>
      <a href="#/plan/${esc(u.id)}" style="font-size:14px">Utbildningsplan →</a></div>
    <p class="hint">Handledaren ser sina ST-läkares måluppfyllelse och plan. ST-slut sätts när ST är klar — personen syns då som avslutad.</p>`;
}
function saveStPerson() {
  panelAction(id => api('/admin/st/people/' + encodeURIComponent(id), { method: 'PATCH', body: {
    stStart: el('up-ststart').value, stEnd: el('up-stend').value, frameworkId: el('up-fw').value || null,
    supervisorIds: [...document.querySelectorAll('[data-supv]')].filter(c => c.checked).map(c => c.dataset.supv) } }), 'ST-uppgifterna är sparade.');
}

// Kör en ändring på personen i panelen, ritar om sidan (panelen öppnas igen på samma flik) och visar resultatet i panelen.
async function panelAction(fn, okText) {
  const show = (text, ok) => showStatus(el('up-status'), text, ok);
  try {
    await fn(_admin.panel.id);
    await reloadAdmin();
    if (okText) show(okText, true);
  } catch (err) {
    await reloadAdmin().catch(() => {});   // återställ reglage som inte gick igenom
    show(err.message, false);
  }
}

function onRoleChange(box) {
  const u = (_admin.me.roster || []).find(x => x.id === _admin.panel.id), a = box.dataset.r, on = box.checked;
  if (a === 'active' && !on && !confirm(`Inaktivera ${u.displayName}? Kontot kan inte längre logga in. Befintliga bokningar ligger kvar i kalendern.`)) { box.checked = true; return; }
  const patch = body => api('/admin/users/' + encodeURIComponent(u.id), { method: 'PATCH', body });
  panelAction(() => a === 'reserve' ? api('/reserve', { method: 'PUT', body: { available: on, userId: u.id } })
    : a === 'opjour' ? patch({ opjourView: !on })
    : patch({ [{ admin: 'isAdmin', stats: 'canSeeStats', st: 'isSt', director: 'isDirector', active: 'active' }[a]]: on }), 'Sparat.');
}

function saveUserDetails() {
  panelAction(id => api('/profile', { method: 'PUT', body: { userId: id, displayName: el('up-name').value, username: el('up-user').value, phone: el('up-phone').value, email: el('up-email').value, startPage: el('up-start').value } }), 'Sparat.');
}

function resetUserPin() {
  const u = (_admin.me.roster || []).find(x => x.id === _admin.panel.id);
  if (!confirm(`Återställa PIN för ${u.displayName}? Den gamla slutar gälla och personen måste välja en ny vid nästa inloggning.`)) return;
  const pin = randomPin();
  panelAction(async id => {
    await api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { newTempPin: pin } });
    _admin.notice = { tone: 'warn', html: `Ny tillfällig PIN för <strong>${esc(u.displayName)}</strong> (${esc(u.username || '')}): <strong>${pin}</strong><br><span class="muted">Visas bara nu.</span>` };
  }, `Ny tillfällig PIN: ${pin} (visas bara nu).`);
}

function deleteUser() {
  const u = (_admin.me.roster || []).find(x => x.id === _admin.panel.id);
  const n = u.claimCount || 0, f = u.futureClaimCount || 0;
  const warn = n ? `\n\n${u.displayName} har ${n} bokning${n === 1 ? '' : 'ar'}${f ? ` (varav ${f} kommande)` : ''} som också raderas ur kalendern och statistiken. Vill du behålla historiken ska du i stället stänga av "Aktiv".` : '';
  if (!confirm(`Radera ${u.displayName} (${u.username}) PERMANENT?${warn}\n\nDet går inte att ångra.`)) return;
  (async () => {
    try {
      const r = await api('/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
      _admin.panel = null; el('sheet-root')?.remove();
      _admin.notice = { tone: 'warn', html: `<strong>${esc(r.deleted)}</strong> är raderad${r.claimsRemoved ? ` (${r.claimsRemoved} bokning${r.claimsRemoved === 1 ? '' : 'ar'} togs bort)` : ''}.` };
      await reloadAdmin(); window.scrollTo(0, 0);
    } catch (err) { const b = el('up-status'); if (b) { b.textContent = err.message; b.className = 'status err'; } }
  })();
}

// Användarnamnet följer e-postadressen (standard sedan 0.39.0); utan e-post föreslås ett av namnet.
function onAuName(v) {
  if (!_admin.userTouched && !el('au-email').value.trim()) el('au-user').value = suggestUsername(v);
}
function onAuEmail(v) {
  if (!_admin.userTouched) el('au-user').value = v.trim().toLowerCase() || suggestUsername(el('au-name').value);
}

async function addUser(e) {
  e.preventDefault();
  const st = el('au-status'); st.textContent = '';
  const body = {
    displayName: el('au-name').value.trim(),
    username: el('au-user').value.trim(),
    email: el('au-email').value.trim(),
    phone: el('au-phone').value,
    tempPin: el('au-pin').value.trim(),
    role: el('au-role').value
  };
  try {
    body.username = body.username || body.email.toLowerCase();
    await api('/admin/users', { method: 'POST', body });
    _admin.notice = { tone: 'ok', html:
      `Konto skapat${body.role === 'admin' ? ' (admin)' : ''}: <strong>${esc(body.displayName)}</strong><br>`
      + `Användarnamn <strong>${esc(body.username)}</strong> · PIN <strong>${esc(body.tempPin)}</strong><br>`
      + `<span class="muted">Visas bara nu. ${body.role === 'display' ? 'Logga in på skärmen med dessa uppgifter.' : 'Personen väljer en egen PIN vid första inloggningen.'}</span>` };
    _admin.pin = randomPin(); _admin.userTouched = false;
    _admin.panel = null; el('sheet-root')?.remove();
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
  return false;
}

// ── Import ────────────────────────────────────────────────────────────────
function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadImportTemplate() { downloadFile('opjour-importmall.csv', OpjourImport.templateCsv()); }

async function performMerge() {
  const p = _admin.panel, from = p.ids.find(id => id !== p.keep);
  const k = (_admin.me.roster || []).find(x => x.id === p.keep), f = (_admin.me.roster || []).find(x => x.id === from);
  if (!confirm(`Slå ihop ${f.displayName} (${f.username}) in i ${k.displayName} (${k.username})?\n\n${f.username} raderas. Det går inte att ångra.`)) return;
  try {
    const r = await api(`/admin/users/${encodeURIComponent(p.keep)}/merge`, { method: 'POST', body: { fromId: from } });
    _admin.panel = null; el('sheet-root')?.remove();
    await reloadAdmin();
    toast(`Ihopslaget: ${r.kept} (${k.username}) — ${f.username} är borttaget.`);
  } catch (err) { showStatus(el('up-status'), err.message, false); }
}

async function onImportFile(file) {
  const out = el('imp-out');
  if (!file) return;
  out.innerHTML = '<p class="muted">Läser filen…</p>';
  try {
    const { rows, lines } = OpjourImport.rowsFromTable(await OpjourImport.readTable(file));
    if (!rows.length) { out.innerHTML = '<p class="err">Filen innehåller inga rader att importera (bara rubriker/kommentarer).</p>'; return; }
    const plan = await api('/admin/users/import', { method: 'POST', body: { rows, dryRun: true } });
    _admin.plan = { rows, lines, items: plan.items, counts: plan.counts, fileName: file.name };
    drawImportPlan();
  } catch (err) {
    _admin.plan = null;
    out.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function drawImportPlan() {
  const out = el('imp-out'), p = _admin.plan;
  const label = { ok: '<span class="tagchip" style="color:var(--ok)">Ny</span>', update: '<span class="tagchip" style="color:var(--interest)">Kompletteras</span>',
    exists: '<span class="tagchip">Finns redan</span>', error: '<span class="tagchip off">Fel</span>' };
  const fillText = it => it.fill ? 'Fylls i: ' + [it.fill.phone && 'telefon', it.fill.email && 'e-post'].filter(Boolean).join(' och ') : '';
  out.innerHTML = `
    <p style="margin:14px 0 6px"><strong>${esc(p.fileName)}</strong>: ${p.counts.ok} nya · ${p.counts.update || 0} kompletteras · ${p.counts.exists} finns redan · ${p.counts.error} med fel</p>
    <div style="overflow-x:auto"><table class="imp-table">
      <tr><th>Rad</th><th>Namn</th><th>Användarnamn</th><th>Roll</th><th>Telefon</th><th>E-post</th><th>Status</th></tr>
      ${p.items.map((it, i) => `<tr class="${it.status}">
        <td>${p.lines[i]}</td><td>${esc(it.displayName)}</td><td>${esc(it.username)}</td><td>${esc(ROLE_LABEL[it.role] || '')}${it.reserve ? ' · reserv' : ''}</td>
        <td>${esc(it.phone || '')}</td><td>${esc(it.email || '')}</td><td>${label[it.status]} ${esc(it.error || fillText(it))}</td></tr>`).join('')}
    </table></div>
    <div class="row" style="margin-top:12px">
      ${p.counts.ok || p.counts.update ? `<button class="btn" onclick="confirmImport()">${[p.counts.ok && `Skapa ${p.counts.ok}`, p.counts.update && `komplettera ${p.counts.update}`].filter(Boolean).join(' och ')}</button>` : ''}
      <button class="btn-ghost" onclick="_admin.plan=null;el('imp-file').value='';el('imp-out').innerHTML=''">Välj annan fil</button>
    </div>
    ${p.counts.error ? '<p class="hint">Rader med fel hoppas över. Rätta filen och ladda upp den igen om de ska med.</p>' : ''}
    <div id="imp-status" class="status err"></div>`;
}

async function confirmImport() {
  const st = el('imp-status'); st.textContent = '';
  try {
    const r = await api('/admin/users/import', { method: 'POST', body: { rows: _admin.plan.rows } });
    _admin.created = r.created;
    _admin.plan = null;
    _admin.panel = null; el('sheet-root')?.remove();
    const upd = (r.updated || []).length;
    if (!r.created.length) { await reloadAdmin(); toast(`${upd} befintliga konton kompletterade.`); return; }
    _admin.notice = { tone: 'ok', csv: true, html:
      `<strong>${r.created.length} användare skapade${upd ? `, ${upd} befintliga kompletterade` : ''}.</strong> Dela ut användarnamn och tillfällig PIN — de visas bara nu.`
      + `<div style="overflow-x:auto;margin-top:8px"><table class="imp-table"><tr><th>Namn</th><th>Användarnamn</th><th>Roll</th><th>PIN</th></tr>`
      + r.created.map(c => `<tr><td>${esc(c.displayName)}</td><td>${esc(c.username)}</td><td>${esc(ROLE_LABEL[c.role])}</td><td><strong>${esc(c.pin)}</strong></td></tr>`).join('')
      + `</table></div>` };
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
}

function downloadPinList() {
  const rows = [['Namn', 'Användarnamn', 'E-post', 'Roll', 'Tillfällig PIN'], ...(_admin.created || []).map(c => [c.displayName, c.username, c.email || '', ROLE_LABEL[c.role], c.pin])];
  downloadFile('opjour-pin-lista.csv', OpjourImport.toCsv(rows));
}

// ── Användarlista ─────────────────────────────────────────────────────────
function userStatus(detailsEl, text, ok) {
  const box = detailsEl.querySelector('[data-s]'); if (!box) return;
  showStatus(box, text, ok);
}

// Kör en ändring på en användare och ritar om listan med bibehållen scrollposition (reglagen sitter långt ner på sidan).
async function userAction(blockEl, fn, okText) {
  const id = blockEl.dataset.id;
  const y = window.scrollY;
  const redraw = async () => { await reloadAdmin(); window.scrollTo(0, y); return document.querySelector(`.ulist .ublock[data-id="${CSS.escape(id)}"]`); };
  try {
    await fn(id);
    const again = await redraw();
    if (again && okText) userStatus(again, okText, true);
  } catch (err) {
    const again = await redraw().catch(() => null);   // återställ reglage som inte gick igenom
    userStatus(again || blockEl, err.message, false);
  }
}

function onUserClick(e) {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const d = btn.closest('.ublock');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  if (btn.dataset.a === 'toggle') {
    const open = d.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    open ? _admin.open.add(d.dataset.id) : _admin.open.delete(d.dataset.id);
  } else if (btn.dataset.a === 'save') {
    userAction(d, id => {
      const body = { userId: id, displayName: d.querySelector('[data-f="name"]').value, username: d.querySelector('[data-f="username"]').value };
      const phone = d.querySelector('[data-f="phone"]');
      if (phone) body.phone = phone.value;
      return api('/profile', { method: 'PUT', body });
    }, 'Sparat.');
  } else if (btn.dataset.a === 'delete') {
    const n = u.claimCount || 0, f = u.futureClaimCount || 0;
    const warn = n
      ? `\n\n${u.displayName} har ${n} bokning${n === 1 ? '' : 'ar'}${f ? ` (varav ${f} kommande)` : ''} som också raderas ur kalendern och statistiken. Vill du behålla historiken ska du i stället stänga av "Aktiv".`
      : '';
    if (!confirm(`Radera ${u.displayName} (${u.username}) PERMANENT?${warn}\n\nDet går inte att ångra.`)) return;
    userAction(d, async id => {
      const r = await api('/admin/users/' + encodeURIComponent(id), { method: 'DELETE' });
      _admin.notice = { tone: 'warn', html: `<strong>${esc(r.deleted)}</strong> är raderad${r.claimsRemoved ? ` (${r.claimsRemoved} bokning${r.claimsRemoved === 1 ? '' : 'ar'} togs bort)` : ''}.` };
    });
  } else if (btn.dataset.a === 'resetpin') {
    if (!confirm(`Återställa PIN för ${u.displayName}? Den gamla slutar gälla${u.isDisplay ? '' : ' och personen måste välja en ny vid nästa inloggning'}.`)) return;
    const pin = randomPin();
    userAction(d, async id => {
      await api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { newTempPin: pin } });
      _admin.notice = { tone: 'warn', html: `Ny ${u.isDisplay ? '' : 'tillfällig '}PIN för <strong>${esc(u.displayName)}</strong> (${esc(u.username || '')}): <strong>${pin}</strong><br><span class="muted">Visas bara nu.</span>` };
    });
  }
}

function onUserChange(e) {
  const box = e.target.closest('input[type=checkbox][data-a]');
  if (!box) return;
  const d = box.closest('.ublock');
  const u = (_admin.me.roster || []).find(x => x.id === d.dataset.id);
  const a = box.dataset.a, on = box.checked;
  if (a === 'active' && !on && !confirm(`Inaktivera ${u.displayName}? Kontot kan inte längre logga in. Befintliga bokningar ligger kvar i kalendern.`)) { box.checked = true; return; }
  userAction(d, id => {
    if (a === 'reserve') return api('/reserve', { method: 'PUT', body: { available: on, userId: id } });
    if (a === 'opjour') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { opjourView: !on } });
    if (a === 'stats') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { canSeeStats: on } });
    if (a === 'admin') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { isAdmin: on } });
    if (a === 'st') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { isSt: on } });
    if (a === 'director') return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { isDirector: on } });
    return api('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { active: on } });
  }, 'Sparat.');
}

// ── Inaktivering och gallring (klinikens admin) ──────────────────────────
// Inställningarna per klinik (personuppgifter.md §5): inaktivera konton utan inloggning och gallra uppgifter efter ett antal månader.
// Tomt = aldrig. "Nästa körning" visar vad gallringen skulle göra i dag; den körs automatiskt en gång per dygn.
const RET_KEYS = ['anonymizeInactiveMonths', 'usageMonths', 'eduSuggestionsMonths', 'opjourMonths', 'scheduleMonths'];
const RET_RESULT = { inactivated: 'inaktiverade', anonymized: 'avidentifierade', usage: 'användningshändelser', eduSuggestions: 'förslag',
  claims: 'pass', interests: 'intresseanmälningar', draws: 'utlottningar', activities: 'aktiviteter', openSlots: 'otilldelade perioder' };
const retSummary = r => Object.entries(r || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${RET_RESULT[k] || k}`).join(', ') || 'inget';
function retentionCard() {
  const d = _admin.retention;
  if (!d) return '';
  if (d.error) return `<div class="card"><h2>Inaktivering och gallring</h2><p class="err">${esc(d.error)}</p></div>`;
  const s = d.settings, p = d.preview || {};
  const inp = (id, v) => `<input type="number" id="ret-${id}" min="1" max="240" value="${v ?? ''}" placeholder="aldrig" style="max-width:110px">`;
  const next = k => ({ anonymizeInactiveMonths: p.anonymized, usageMonths: p.usage, eduSuggestionsMonths: p.eduSuggestions,
    opjourMonths: (p.claims || 0) + (p.interests || 0) + (p.draws || 0), scheduleMonths: (p.activities || 0) + (p.openSlots || 0) }[k]);
  return `<div class="card">
      <h2>Inaktivering och gallring</h2>
      <p class="hint" style="margin-top:0">Månader. Tomt = aldrig. Körs automatiskt en gång per dygn. Avidentifierade konton behåller sina pass, sitt schema och
        sin historik men visas som <em>Ingen användare</em> (${d.anonymizedCount} i dag).</p>
      <table class="ret-table">
        <tr><th>Inaktivera konton som inte loggat in på</th><td>${inp('inactivationMonths', s.inactivationMonths)}</td>
          <td class="muted">${p.inactivated ? `${p.inactivated} vid nästa körning` : ''}</td></tr>
        ${RET_KEYS.map(k => `<tr><th>${esc(d.rules[k].label)}${k === 'anonymizeInactiveMonths' ? ' efter' : ' äldre än'}</th><td>${inp(k, s[k])}</td>
          <td class="muted">${next(k) ? `${next(k)} vid nästa körning` : ''}</td></tr>`).join('')}
      </table>
      <p class="hint">Den som inaktiverats automatiskt blir aktiv igen av att logga in med rätt PIN; den som admin inaktiverat gör det inte.
        Visningskonton och globala admins inaktiveras inte. ST-uppgifter (plan, signeringar) gallras inte här — de kan vara allmänna handlingar.
        Felrapporter gallras för hela systemet (hanterade felanmälningar efter ${d.global.errorReportsMonths}, automatiska fel efter ${d.global.clientErrorsMonths} månader).</p>
      <div class="row" style="gap:8px"><button class="btn" onclick="saveRetention()">Spara</button><button class="btn-ghost" onclick="runRetentionNow()">Kör gallringen nu…</button></div>
      <div class="status" id="ret-status"></div>
      ${d.runs.length ? `<details style="margin-top:10px"><summary style="cursor:pointer">Senaste körningar</summary><ul class="ret-runs">${d.runs.map(r =>
        `<li>${esc(new Date(r.ranAt).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }))}${r.manual ? ' (för hand)' : ''}: ${esc(retSummary(r.result))}</li>`).join('')}</ul></details>` : ''}
    </div>`;
}
async function saveRetention() {
  const body = { inactivationMonths: el('ret-inactivationMonths').value };
  for (const k of RET_KEYS) body[k] = el('ret-' + k).value;
  try {
    await api('/admin/retention', { method: 'PUT', body });
    _admin.retention = await api('/admin/retention');
    _admin.draw(el('view'));
    showStatus(el('ret-status'), 'Sparat. Gäller från nästa körning.', true);
  } catch (err) { showStatus(el('ret-status'), err.message, false); }
}
async function runRetentionNow() {
  const p = _admin.retention.preview;
  if (!confirm(`Kör gallringen nu enligt de sparade inställningarna?\n\nDet som görs: ${retSummary(p)}.\n\nRaderade uppgifter går inte att få tillbaka.`)) return;
  try {
    const { result } = await api('/admin/retention/run', { method: 'POST' });
    _admin.retention = await api('/admin/retention');
    _admin.me = await api('/me');
    _admin.draw(el('view'));
    showStatus(el('ret-status'), 'Klart: ' + retSummary(result) + '.', true);
  } catch (err) { showStatus(el('ret-status'), err.message, false); }
}

function anonymizeUser() {
  const u = (_admin.me.roster || []).find(x => x.id === _admin.panel.id);
  const typed = prompt(`Avidentifiera ${u.displayName}?\n\nNamn, användarnamn, e-post, telefon, PIN, roller och handledarrelationer tas bort för gott. Pass, schema och ST-historik ligger kvar som "Ingen användare". Det går inte att ångra.\n\nSkriv personens namn för att bekräfta:`);
  if (typed == null) return;
  if (typed.trim() !== u.displayName) { alert('Namnet stämde inte. Inget ändrades.'); return; }
  (async () => {
    try {
      await api('/admin/users/' + encodeURIComponent(u.id) + '/anonymize', { method: 'POST' });
      _admin.panel = null; el('sheet-root')?.remove();
      await reloadAdmin(); toast('Kontot är avidentifierat.');
    } catch (err) { showStatus(el('up-status'), err.message, false); }
  })();
}

// ── Moduler (klinikens admin) ────────────────────────────────────────────
const MODULE_INFO = [
  ['opjour', 'Opjour', 'Operationsjourlinjen: kalender, bokning, reserv och visningsskärm.'],
  ['schema', 'Planering', 'Veckoschemat: ST-gruppens schema vecka för vecka med raden "I tjänst" och bemanningsvarning. Aktivitetstyper ställs in under Inställningar → Planering.'],
  ['mal', 'ST-utbildning', 'Måluppfyllelse, individuella utbildningsplaner, krav per ST-år och delmål. Status hämtas ur veckoschemat och det som anges för hand.'],
  ['utbildning', 'Utbildningsmaterial', 'Klinikens länksamling med utbildningsmaterial (artiklar, videor, kurser) i områden. Admin redigerar; alla kan föreslå ändringar som admin godkänner.'],
  ['dops', 'DOPS', 'Bedömningar (DOPS, Mini-CEX m.fl.): fliken DOPS med progress, och kopplingen av klinikens konton (Inställningar → Användare). Under parallellkörningen läses DOPS-appens databas; registrering slås på senare.']
];

function moduleCard() {
  const on = _admin.me.modules || ['opjour'];
  const shown = MODULE_INFO.filter(([id]) => id !== 'dops' || _admin.me.dopsLinked || on.includes('dops'));   // bara kliniker kopplade till DOPS
  return `<div class="card">
      <h2>Moduler</h2>
      <p class="muted" style="margin:0 0 6px">Vilka delar av ST-Lotsen kliniken använder. Minst en måste vara påslagen.</p>
      ${shown.map(([id, name, info]) => `<label class="role-row"><span><strong>${name}</strong><small>${info}</small></span>${sw(`data-mod="${id}"`, on.includes(id))}</label>`).join('')}
      <div class="row" style="margin-top:10px"><button class="btn" onclick="saveModules()">Spara</button></div>
      <div class="status" id="mod-status"></div>
    </div>`;
}

async function saveModules() {
  const box = el('mod-status');
  const modules = [...document.querySelectorAll('[data-mod]')].filter(c => c.checked).map(c => c.dataset.mod);
  try {
    await api('/admin/clinic', { method: 'PUT', body: { modules } });
    _admin.dopsUsers = null;
    if (modules.includes('dops')) await loadDopsUsers();
    await reloadAdmin();
    setMenuForUser(_admin.me);
    showStatus(el('mod-status'), 'Modulerna är sparade.', true);
  } catch (err) { box.textContent = err.message; box.className = 'status err'; }
}

// ── Felrapporter (endast global admin) ───────────────────────────────────
// Användarnas felanmälningar och automatiskt rapporterade fel (öppna först). Ett åtgärdat fel öppnas igen om det inträffar på nytt.
const fmtTime = iso => iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '';
function errorCard() {
  const { reports, clientErrors } = _admin.errors;
  const openR = reports.filter(r => !r.handledAt).length, openE = clientErrors.filter(e => !e.resolvedAt).length;
  const rep = r => `<div class="pass-card" style="display:block${r.handledAt ? ';opacity:.55' : ''}">
      <div class="row" style="justify-content:space-between"><strong>${esc(r.displayName || 'Okänd')} <span class="muted" style="font-weight:normal">${esc(r.clinicName || '')} · ${esc(fmtTime(r.createdAt))}</span></strong>
        <button class="link-btn" onclick="setReportHandled('${esc(r.id)}', ${!r.handledAt})">${r.handledAt ? 'Öppna igen' : 'Markera hanterad'}</button></div>
      <p style="margin:4px 0;white-space:pre-wrap">${esc(r.message)}</p>
      <details><summary class="muted" style="cursor:pointer;font-size:13px">Teknisk information</summary><pre style="white-space:pre-wrap;font-size:12px;max-height:240px;overflow:auto">${esc(JSON.stringify(r.systemInfo, null, 2))}</pre></details></div>`;
  const ce = e => `<div class="pass-card" style="display:block${e.resolvedAt ? ';opacity:.55' : ''}">
      <div class="row" style="justify-content:space-between"><strong style="word-break:break-word">${esc(e.message)}</strong>
        <button class="link-btn" onclick="setClientErrorResolved('${esc(e.id)}', ${!e.resolvedAt})">${e.resolvedAt ? 'Öppna igen' : 'Markera åtgärdat'}</button></div>
      <div class="muted" style="font-size:13px">${esc(e.type || '')} · ${esc(e.source || 'okänd källa')} · ${e.count} gång${e.count === 1 ? '' : 'er'} · senast ${esc(fmtTime(e.lastSeen))} (${esc(e.lastVersion || '')}, ${esc(e.lastPage || '')}${e.displayName ? ', ' + esc(e.displayName) : ''}) · först ${esc(fmtTime(e.firstSeen))}</div></div>`;
  return `<div class="card">
      <h2>Felrapporter</h2>
      <p class="hint" style="margin-top:0">Felanmälningar från användarna (Felanmälan-knappen överst) och fel som appen rapporterat automatiskt. Synligt bara för global admin.</p>
      <h3 style="margin:10px 0 4px">Felanmälningar (${openR} öppna)</h3>${reports.length ? reports.map(rep).join('') : '<p class="muted">Inga.</p>'}
      <h3 style="margin:14px 0 4px">Automatiska fel (${openE} öppna)</h3>${clientErrors.length ? clientErrors.map(ce).join('') : '<p class="muted">Inga.</p>'}
      <div class="status" id="er-status"></div>
    </div>`;
}

async function setReportHandled(id, handled) {
  try { await api('/error-reports/' + encodeURIComponent(id), { method: 'PATCH', body: { handled } }); _admin.errors = await api('/error-reports'); drawAdmin(el('view')); }
  catch (err) { const b = el('er-status'); b.textContent = err.message; b.className = 'status err'; }
}
async function setClientErrorResolved(id, resolved) {
  try { await api('/error-reports/client-errors/' + encodeURIComponent(id), { method: 'PATCH', body: { resolved } }); _admin.errors = await api('/error-reports'); drawAdmin(el('view')); }
  catch (err) { const b = el('er-status'); b.textContent = err.message; b.className = 'status err'; }
}

// ── DOPS-anslutningen (endast global admin, dops_plan.md fas 1) ──
// Visar att ST-Lotsen når DOPS databas och att rollen bara kan läsa. Inget i DOPS ändras härifrån.
function dopsCard() {
  const d = _admin.dops, s = d.safety || {};
  const safe = s.readOnly && !s.pinHashReadable && !s.canWriteUsers;
  const body = !d.configured
    ? '<p class="muted" style="margin:0">Inte ansluten. Anslutningen läggs in med <code>scripts/dops-secret.sh</code> och tas i bruk vid nästa leverans.</p>'
    : !d.ok ? `<p class="err" style="margin:0">DOPS kan inte nås: ${esc(d.error || 'okänt fel')}</p>`
    : `<p style="margin:0 0 6px">✓ Ansluten (${d.ms} ms). ${safe ? 'Rollen kan bara läsa och ser inga PIN-koder.'
        : '<strong class="err">Varning: rollen har fler rättigheter än planen säger' + (s.readOnly ? '' : ' (inte skrivskyddad)') + (s.pinHashReadable ? ' (kan läsa pin_hash)' : '') + (s.canWriteUsers ? ' (kan skriva i users)' : '') + '.</strong>'}</p>
      ${d.clinics.map(c => `<div class="pass-card"><span><strong>${esc(c.name)}</strong> <span class="muted">· ${c.active} aktiva${c.demo ? ' · demo' : ''}</span></span></div>`).join('')}
      <h3 style="margin:14px 0 4px">Klinikkoppling</h3>
      <p class="hint" style="margin-top:0">Vilken DOPS-klinik varje ST-Lotsen-klinik motsvarar. Därefter kan klinikens admin slå på modulen DOPS och koppla ihop kontona.</p>
      ${(d.lotsenClinics || []).map(lc => `<div class="pass-card"><strong>${esc(lc.name)}</strong>
        <select data-dops-clinic="${esc(lc.id)}" onchange="saveDopsClinic(this)" style="max-width:220px">
          <option value="">Ingen koppling</option>
          ${d.clinics.map(c => `<option value="${esc(c.id)}"${c.id === lc.dopsClinicId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>`).join('')}
      <div class="status" id="dops-status"></div>`;
  return `<div class="card">
      <h2>DOPS</h2>
      <p class="hint" style="margin-top:0">Läsanslutning till DOPS databas under parallellkörningen. DOPS ändras inte.</p>
      ${body}
    </div>`;
}

async function saveDopsClinic(sel) {
  try {
    await api('/dops/clinics/' + encodeURIComponent(sel.dataset.dopsClinic), { method: 'PUT', body: { dopsClinicId: sel.value || null } });
    _admin.dops = await api('/dops/status');
    await reloadAdmin();
    toast(sel.value ? 'Kliniken är kopplad till DOPS.' : 'Kopplingen är borttagen och modulen avslagen.');
  } catch (err) { toast(err.message, 'err'); _admin.dops = await api('/dops/status').catch(() => _admin.dops); drawAdmin(el('view')); }
}

// ── DOPS-konton (klinikens admin, modulen 'dops'; dops_plan.md fas 2) ──
// Fyra listor: kopplade, förslag, bara i ST-Lotsen, bara i DOPS. DOPS läses vid varje visning och ändras aldrig härifrån.
const DOPS_DIFF = { namn: 'Namn skiljer', epost: 'E-post skiljer', admin: 'Admin skiljer', studierektor: 'Studierektor skiljer',
  aktiv: 'Aktiv/inaktiv skiljer', klinik: 'Annan klinik i DOPS', saknas: 'Finns inte i DOPS' };

async function loadDopsUsers() {
  _admin.dopsUsers = await api('/dops/users').catch(err => ({ error: err.message }));
}

function dopsUsersCard() {
  const d = _admin.dopsUsers;
  if (d.error) return `<div class="card"><h2>DOPS-konton</h2><p class="err" style="margin:0">${esc(d.error)}</p></div>`;
  const who = u => `<strong>${esc(u.displayName)}</strong> <span class="muted">${esc(u.username)}${u.email ? ' · ' + esc(u.email) : ' · ingen e-post'}${u.active ? '' : ' · inaktiv'}</span>`;
  const them = x => `${esc(x.name)} <span class="muted">${esc(x.email || 'ingen e-post')}${x.jobRole ? ' · ' + esc(x.jobRole) : ''}${x.admin ? ' · Administratör' : ''}${x.director ? ' · Studierektor' : ''}${x.inactive ? ' · inaktiverad' : ''}${x.pending ? ' · ej aktiverad' : ''}</span>`;
  const tags = ds => ds.map(k => `<span class="chip" style="font-size:12px;padding:0 8px">${DOPS_DIFF[k] || esc(k)}</span>`).join('');
  const row = (left, right, actions) => `<div class="pass-card dops-row"><div><div>${left}</div>${right ? `<div style="font-size:14px">↔ ${right}</div>` : ''}</div><div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${actions}</div></div>`;
  const btn = (label, call, ghost = true) => `<button class="${ghost ? 'btn-ghost' : 'btn'}" onclick="${call}">${label}</button>`;

  const linked = d.linked.map(x => row(who(x.user), x.dops ? them(x.dops) + ' ' + tags(x.diffs) : tags(x.diffs),
    (x.diffs.includes('namn') ? btn('Hämta namn', `dopsPull('${x.user.id}',{name:true})`) : '') +
    (x.diffs.includes('epost') && x.dops?.email ? btn('Hämta e-post', `dopsPull('${x.user.id}',{email:true})`) : '') +
    btn('Koppla loss', `dopsUnlink('${x.user.id}')`))).join('');
  const sugg = d.suggestions.map(x => row(who(x.user), them(x.dops) + ` <span class="muted">(${x.by === 'email' ? 'samma e-post' : 'samma namn — kontrollera'})</span> ` + tags(x.diffs),
    btn('Koppla', `dopsLink([['${x.user.id}','${x.dops.id}']])`, false))).join('');
  const opts = d.onlyDops.map(x => `<option value="${esc(x.id)}">${esc(x.name)}${x.email ? ' — ' + esc(x.email) : ''}</option>`).join('');
  const onlyL = d.onlyLotsen.map(u => row(who(u), '', d.onlyDops.length
    ? `<select id="dp-${esc(u.id)}" style="max-width:220px"><option value="">Välj DOPS-konto…</option>${opts}</select>${btn('Koppla', `dopsLinkPick('${u.id}')`)}`
    : '<span class="muted">Inga okopplade DOPS-konton</span>')).join('');
  const onlyD = d.onlyDops.map(x => row(`<label style="display:flex;gap:8px;align-items:flex-start;margin:0;font-weight:normal"><input type="checkbox" data-dops-new="${esc(x.id)}" style="margin-top:4px">${'<span>' + them(x) + '</span>'}</label>`, '',
    btn('Skapa konto', `dopsCreateAccounts(['${x.id}'])`))).join('');
  const emailSugg = d.suggestions.filter(x => x.by === 'email');
  const sec = (title, n, body, open, extra = '') => `<details class="dops-sec"${open ? ' open' : ''}><summary><strong>${title} (${n})</strong></summary>${extra}${body || '<p class="muted">Inga.</p>'}</details>`;

  return `<div class="card">
      <h2>DOPS-konton</h2>
      <p class="hint" style="margin-top:0">Kopplar klinikens ST-Lotsen-konton till kontona i DOPS (${esc(d.clinicName)}). DOPS är källan för namn och e-post och ändras inte härifrån. Inloggningen i ST-Lotsen påverkas inte.</p>
      ${sec('Förslag att godkänna', d.suggestions.length, sugg, d.suggestions.length > 0,
        emailSugg.length > 1 ? `<div class="row" style="margin:6px 0">${btn(`Koppla alla ${emailSugg.length} med samma e-post`, 'dopsLinkAllEmail()', false)}</div>` : '')}
      ${sec('Bara i ST-Lotsen', d.onlyLotsen.length, onlyL, d.suggestions.length === 0 && d.onlyLotsen.length > 0,
        '<p class="hint">Saknar träff i DOPS, oftast för att e-post saknas eller skiljer sig. Välj rätt konto för hand, eller lämna okopplat (t.ex. konton som inte bedömer).</p>')}
      ${sec('Bara i DOPS', d.onlyDops.length, onlyD, false,
        '<p class="hint">Har inget ST-Lotsen-konto. <strong>Skapa konto</strong> hämtar namn och e-post från DOPS, kopplar kontot och ger en tillfällig PIN som visas en gång. Kontot blir vanlig användare; roller sätts sedan under Användare. Personen kan logga in med användarnamnet eller e-postadressen.</p>'
        + (d.onlyDops.length > 1 ? `<div class="row" style="margin:6px 0;gap:8px"><button class="btn-ghost" onclick="document.querySelectorAll('[data-dops-new]').forEach(c=>c.checked=true)">Markera alla</button>${btn('Skapa konton för markerade', 'dopsCreateChecked()', false)}</div>` : ''))}
      ${sec('Kopplade', d.linked.length, linked, false,
        d.linked.some(x => x.diffs.length) ? '<p class="hint">Skillnader visas men rättas inte automatiskt. Namn och e-post kan hämtas från DOPS; roller och inaktivering ändras i respektive system.</p>' : '')}
    </div>`;
}

async function dopsAfter(msg) {
  await loadDopsUsers();
  await reloadAdmin();
  toast(msg);
}
async function dopsLink(pairs) {
  try {
    await api('/dops/users/links', { method: 'PUT', body: { links: pairs.map(([userId, dopsUserId]) => ({ userId, dopsUserId })) } });
    await dopsAfter(pairs.length === 1 ? 'Kontot är kopplat.' : `${pairs.length} konton är kopplade.`);
  } catch (err) { toast(err.message, 'err'); }
}
function dopsLinkPick(userId) {
  const v = el('dp-' + userId)?.value;
  if (!v) return toast('Välj ett DOPS-konto först.', 'err');
  return dopsLink([[userId, v]]);
}
function dopsLinkAllEmail() {
  return dopsLink(_admin.dopsUsers.suggestions.filter(x => x.by === 'email').map(x => [x.user.id, x.dops.id]));
}
function dopsCreateChecked() {
  const ids = [...document.querySelectorAll('[data-dops-new]')].filter(c => c.checked).map(c => c.dataset.dopsNew);
  if (!ids.length) return toast('Markera minst ett konto.', 'err');
  return dopsCreateAccounts(ids);
}
async function dopsCreateAccounts(ids) {
  const names = _admin.dopsUsers.onlyDops.filter(x => ids.includes(x.id)).map(x => x.name);
  if (!confirm(`Skapa ST-Lotsen-konto för ${names.length === 1 ? names[0] : names.length + ' personer'}?`)) return;
  try {
    const r = await api('/dops/users/accounts', { method: 'POST', body: { dopsUserIds: ids } });
    _admin.created = r.created;
    _admin.notice = { tone: 'ok', csv: true, html:
      `<strong>${r.created.length} ${r.created.length === 1 ? 'konto skapat' : 'konton skapade'} från DOPS.</strong> Dela ut användarnamn och tillfällig PIN — de visas bara nu. Inloggning går också med e-postadressen.`
      + `<div style="overflow-x:auto;margin-top:8px"><table class="imp-table"><tr><th>Namn</th><th>Användarnamn</th><th>E-post</th><th>PIN</th></tr>`
      + r.created.map(c => `<tr><td>${esc(c.displayName)}</td><td>${esc(c.username)}</td><td>${esc(c.email)}</td><td><strong>${esc(c.pin)}</strong></td></tr>`).join('')
      + `</table></div>` };
    await loadDopsUsers();
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { toast(err.message, 'err'); }
}
async function dopsUnlink(userId) {
  if (!confirm('Koppla loss kontot från DOPS? Inget raderas i något av systemen.')) return;
  try { await api('/dops/users/' + encodeURIComponent(userId) + '/link', { method: 'DELETE' }); await dopsAfter('Kopplingen är borttagen.'); }
  catch (err) { toast(err.message, 'err'); }
}
async function dopsPull(userId, what) {
  try { await api('/dops/users/' + encodeURIComponent(userId) + '/pull', { method: 'POST', body: what }); await dopsAfter(what.name ? 'Namnet är hämtat från DOPS.' : 'E-posten är hämtad från DOPS.'); }
  catch (err) { toast(err.message, 'err'); }
}

// ── Kliniker (endast global admin) ────────────────────────────────────────
function clinicCard() {
  const rows = _admin.clinics.map(c => `<div class="pass-card"><span><strong>${esc(c.name)}</strong> <span class="muted">· ${c.userCount} användare · ${c.adminCount} admin${c.id === _admin.me.clinicId ? ' · du arbetar här' : ''}</span></span>
      <span class="row" style="gap:6px">
        ${c.id === _admin.me.clinicId ? '' : `<button class="btn-ghost" onclick="workInClinic('${esc(c.id)}')">Arbeta här</button>`}
        <button class="btn-ghost" onclick="renameClinic('${esc(c.id)}')">Byt namn…</button>
        ${c.globalCount ? '' : `<button class="btn-ghost" style="color:var(--danger);border-color:#e3b3ab" onclick="deleteClinic('${esc(c.id)}')">Radera…</button>`}
      </span></div>`).join('');
  return `<div class="card">
      <h2>Kliniker</h2>
      <p class="hint" style="margin-top:0">Du är global admin och kan lägga upp, byta namn på och radera kliniker. Varje klinik får en egen admin, som sedan lägger till klinikens övriga användare.
        Med <strong>Arbeta här</strong> ser du hela ST-Lotsen som admin på kliniken och kan ändra dess inställningar (även under Inställningar → Klinik). En klinik med ett globalt adminkonto kan inte raderas.</p>
      ${rows}
      <details style="margin-top:12px"${_admin.clinicOpen ? ' open' : ''} ontoggle="_admin.clinicOpen=this.open">
        <summary style="cursor:pointer;font-weight:bold">Ny klinik</summary>
        <form id="nc-form" onsubmit="return addClinic(event)" style="margin-top:8px">
          <label for="nc-name" style="margin-top:0">Klinikens namn</label>
          <input type="text" id="nc-name" maxlength="80" required>
          <div class="field-row">
            <div><label for="nc-aname">Adminens fullständiga namn</label>
              <input type="text" id="nc-aname" maxlength="60" required oninput="onNcName(this.value)"></div>
            <div><label for="nc-aemail">Adminens e-post</label>
              <input type="email" id="nc-aemail" maxlength="120" autocapitalize="none" spellcheck="false" oninput="if(!_admin.clinicUserTouched)el('nc-auser').value=this.value.trim().toLowerCase()"></div>
          </div>
          <div class="field-row">
            <div><label for="nc-auser">Adminens användarnamn</label>
              <input type="text" id="nc-auser" autocapitalize="none" spellcheck="false" maxlength="60" oninput="_admin.clinicUserTouched=true" placeholder="e-postadressen"></div>
            <div><label for="nc-aphone">Adminens telefon (valfritt)</label>
              <input type="tel" id="nc-aphone" maxlength="30" inputmode="tel" placeholder="070-123 45 67"></div>
          </div>
          <p class="hint">En tillfällig PIN slumpas och visas en gång när kliniken är skapad.</p>
          <div class="row" style="margin-top:8px"><button type="submit" class="btn">Skapa klinik</button></div>
          <div id="nc-status" class="status err"></div>
        </form>
      </details>
    </div>`;
}

function onNcName(v) {
  if (!_admin.clinicUserTouched && !el('nc-aemail').value.trim()) el('nc-auser').value = suggestUsername(v);
}

async function addClinic(e) {
  e.preventDefault();
  const st = el('nc-status'); st.textContent = '';
  try {
    const r = await api('/admin/clinics', { method: 'POST', body: {
      name: el('nc-name').value.trim(), adminName: el('nc-aname').value.trim(),
      adminUsername: el('nc-auser').value.trim(), adminEmail: el('nc-aemail').value.trim(), adminPhone: el('nc-aphone').value
    } });
    _admin.notice = { tone: 'ok', html:
      `Kliniken <strong>${esc(r.clinic.name)}</strong> är skapad.<br>`
      + `Admin: <strong>${esc(r.admin.displayName)}</strong> · användarnamn <strong>${esc(r.admin.username)}</strong> · PIN <strong>${esc(r.admin.pin)}</strong><br>`
      + `<span class="muted">Visas bara nu. Adminen väljer en egen PIN vid första inloggningen och lägger sedan till klinikens användare.</span>` };
    _admin.clinicOpen = false; _admin.clinicUserTouched = false;
    _admin.clinics = (await api('/admin/clinics')).clinics;
    drawAdmin(el('view'));
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
  return false;
}

// ── Global admin: arbeta i en annan klinik, byt namn, radera, importera inställningar ──
function clinicPickCard() {
  const me = _admin.me;
  return `<div class="card">
      <h2>Klinik att arbeta i</h2>
      <p class="hint" style="margin-top:0">Som global admin kan du ändra inställningar åt andra kliniker. Valet gäller hela ST-Lotsen tills du byter tillbaka.</p>
      <select id="cp-pick" onchange="workInClinic(this.value)" style="max-width:360px">
        ${_admin.clinics.map(c => `<option value="${esc(c.id)}"${c.id === me.clinicId ? ' selected' : ''}>${esc(c.name)}${c.id === me.homeClinicId ? ' (din klinik)' : ''}</option>`).join('')}
      </select>
    </div>`;
}

function workInClinic(id) {
  const c = _admin.clinics.find(x => x.id === id);
  if (!c) return;
  setActingClinic(id === _admin.me.homeClinicId ? null : c);
}

async function renameClinic(id) {
  const c = _admin.clinics.find(x => x.id === id);
  const name = prompt(`Nytt namn för ${c.name}:`, c.name);
  if (name == null || !name.trim() || name.trim() === c.name) return;
  try {
    await api('/admin/clinics/' + encodeURIComponent(id), { method: 'PATCH', body: { name: name.trim() } });
    if (state.acting && state.acting.id === id) setActingClinic({ id, name: name.trim() });
    if (id === _admin.me.homeClinicId) { state.clinicName = name.trim(); localStorage.setItem('opjour_clinic', state.clinicName); }
    _admin.notice = { tone: 'ok', html: `Kliniken heter nu <strong>${esc(name.trim())}</strong>.` };
    await renderAdmin(el('view'), _admin.mode);
  } catch (err) { alert(err.message); }
}

async function deleteClinic(id) {
  const c = _admin.clinics.find(x => x.id === id);
  const typed = prompt(`RADERA kliniken ${c.name} PERMANENT?\n\nAllt som hör till kliniken försvinner och kan inte återställas: ${c.userCount} konton, alla bokningar, veckoschemat, krav, måluppfyllelse, utbildningsplaner och inställningar.\n\nSkriv klinikens namn exakt för att bekräfta:`);
  if (typed == null) return;
  if (typed !== c.name) { alert('Namnet stämde inte. Inget raderades.'); return; }
  try {
    const r = await api('/admin/clinics/' + encodeURIComponent(id), { method: 'DELETE', body: { confirmName: typed } });
    if (state.acting && state.acting.id === id) { setActingClinic(null); }
    _admin.notice = { tone: 'warn', html: `Kliniken <strong>${esc(r.deleted)}</strong> är raderad (${r.usersRemoved} konton).` };
    await renderAdmin(el('view'), _admin.mode);
  } catch (err) { alert(err.message); }
}

const IMPORT_PART_LABEL = [
  ['opjour', 'Opjour: jourbytestid'], ['moduler', 'Moduler'], ['typer', 'Aktivitetstyper (Planering)'], ['krav', 'Krav med kopplade delmål (ST-utbildning)'],
  ['bemanning', 'Minsta antal i tjänst'], ['veckor', 'Veckoschemats förvalda period (antal veckor)'], ['malbeskrivning', 'Förvald målbeskrivning'],
  ['jobbimport', 'Översättning av jobbschemats koder'], ['mallar', 'Startsidans mallar per yrkesroll'], ['utbildning', 'Utbildningsmaterial (områden och poster)'], ['gallring', 'Inaktivering och gallring']
];
function importCard() {
  const others = _admin.clinics.filter(c => c.id !== _admin.me.clinicId);
  if (!others.length) return '';
  return `<div class="card">
      <h2>Importera inställningar</h2>
      <p class="hint" style="margin-top:0">Hämta inställningar från en annan klinik till <strong>${esc(_admin.me.clinicName)}</strong>. Inget tas bort här:
        det som saknas läggs till och det som finns med samma namn eller kod skrivs över. Förhandsgranska först.</p>
      <label for="ci-from">Från klinik</label>
      <select id="ci-from" style="max-width:360px">${others.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
      <div style="margin-top:8px">${IMPORT_PART_LABEL.map(([k, l]) => `<label class="check"><input type="checkbox" data-ci="${k}"> ${l}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn-ghost" onclick="runClinicImport(true)">Förhandsgranska</button>
        <button class="btn" onclick="runClinicImport(false)">Importera</button></div>
      <div id="ci-out" class="status"></div>
    </div>`;
}

async function runClinicImport(dryRun) {
  const out = el('ci-out');
  const parts = [...document.querySelectorAll('[data-ci]')].filter(b => b.checked).map(b => b.dataset.ci);
  const from = el('ci-from'), fromName = from.options[from.selectedIndex].text;
  if (!parts.length) { out.textContent = 'Kryssa i vad som ska importeras.'; out.className = 'status err'; return; }
  if (!dryRun && !confirm(`Importera ${parts.length} del${parts.length === 1 ? '' : 'ar'} från ${fromName} till ${_admin.me.clinicName}? Befintliga med samma namn skrivs över.`)) return;
  try {
    const { plan } = await api('/admin/clinic/import', { method: 'POST', body: { fromClinicId: from.value, parts, dryRun } });
    const label = Object.fromEntries(IMPORT_PART_LABEL);
    const line = (k, v) => `<li><strong>${esc(label[k])}</strong>: ${v.added != null ? (dryRun ? `${v.added} läggs till, ${v.updated} skrivs över` : `${v.added} tillagda, ${v.updated} överskrivna`)
      : v.codes != null ? `${v.codes} koder` : v.label ? esc(v.label) : Array.isArray(v.value) ? esc(v.value.join(', ') || '–') : esc(v.value ?? '– (töms)')}</li>`;
    out.className = 'status';
    out.innerHTML = `<p style="margin:8px 0 4px">${dryRun ? 'Det här skulle hända:' : '✓ Importerat:'}</p><ul style="margin:0">${Object.entries(plan).map(([k, v]) => line(k, v)).join('')}</ul>`;
    if (!dryRun) { _admin.me = await api('/me'); setMenuForUser(_admin.me); toast('Inställningarna är importerade.'); }
  } catch (err) { out.textContent = err.message; out.className = 'status err'; }
}

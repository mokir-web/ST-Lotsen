// ── Inställningar → Opjour (#/opjour-settings) ───────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser() och js/admin.js (_admin, userBlock, quickSwitch,
// onUserClick, onUserChange, noticeCard, sortedRoster, randomPin, suggestUsername). Endast för admin.
// Allt som bara gäller opjourlinjen: jourbyte, vem som är reserv, vem som ser statistiken och väggskärmarna (visningskonton).

async function renderOpSettings(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!me.isAdmin) { location.hash = '#/'; return; }
    _admin = { me, draw: drawOpSettings, open: new Set(), notice: null, pin: randomPin(), userTouched: false };
    _admin.sheet = await api('/admin/sheet').catch(() => null);
    drawOpSettings(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function drawOpSettings(root) {
  const roster = sortedRoster();
  const people = roster.filter(u => u.active && !u.isDisplay), screens = roster.filter(u => u.isDisplay);
  root.innerHTML = `
    <h1 class="page">Opjour</h1>

    ${noticeCard()}

    ${shiftCard()}

    ${_admin.sheet ? sheetCard() : ''}

    <p class="hint" style="margin:-4px 0 14px">Vem som bokar opjour, är reserv eller ser statistiken ställs in per person under <a href="#/installningar/anvandare">Inställningar → Användare</a>.</p>

    <div class="card">
      <h2>Väggskärmar (${screens.length})</h2>
      <p class="muted" style="margin:0 0 8px">Ett visningskonto loggar in som alla andra men ser bara dagens opjour och kalendern — ingen bokning, ingen reserv.</p>
      <div class="ulist">${screens.map(u => userBlock(u, _admin.me.userId)).join('') || '<p class="muted">Inga väggskärmar än.</p>'}</div>
      <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:bold">Lägg till väggskärm</summary>
        <form onsubmit="return addScreen(event)">
          <div class="field-row">
            <div><label for="ds-name">Namn</label><input type="text" id="ds-name" maxlength="60" required placeholder="t.ex. Op-korridoren" oninput="if(!_admin.userTouched) el('ds-user').value=suggestUsername(this.value)"></div>
            <div><label for="ds-user">Användarnamn</label><input type="text" id="ds-user" autocapitalize="none" spellcheck="false" required oninput="_admin.userTouched=true"></div>
            <div><label for="ds-pin">PIN</label>
              <div class="row" style="flex-wrap:nowrap"><input type="text" id="ds-pin" inputmode="numeric" maxlength="4" value="${esc(_admin.pin)}" style="max-width:120px" required>
                <button type="button" class="btn-ghost" onclick="el('ds-pin').value=randomPin()">Slumpa</button></div></div>
          </div>
          <div class="row" style="margin-top:12px"><button type="submit" class="btn">Lägg till</button></div>
          <div id="ds-status" class="status err"></div>
        </form>
      </details>
    </div>
  `;
  root.querySelectorAll('.ulist').forEach(list => {
    list.addEventListener('click', onUserClick);
    list.addEventListener('change', onUserChange);
  });
}

async function addScreen(e) {
  e.preventDefault();
  const st = el('ds-status'); st.textContent = '';
  const body = { displayName: el('ds-name').value.trim(), username: el('ds-user').value.trim(), tempPin: el('ds-pin').value.trim(), role: 'display' };
  try {
    await api('/admin/users', { method: 'POST', body });
    _admin.notice = { tone: 'ok', html: `Väggskärm skapad: <strong>${esc(body.displayName)}</strong><br>`
      + `Användarnamn <strong>${esc(body.username)}</strong> · PIN <strong>${esc(body.tempPin)}</strong><br><span class="muted">Visas bara nu. Logga in på skärmen med dessa uppgifter.</span>` };
    _admin.pin = randomPin(); _admin.userTouched = false;
    await reloadAdmin();
    window.scrollTo(0, 0);
  } catch (err) { st.textContent = err.message; }
  return false;
}

// ── Jourbyte ───────────────────────────────────────────────────────────────────────────────────────────────────────
function shiftCard() {
  return `<div class="card">
      <h2>Jourbyte</h2>
      <p class="muted" style="margin:0 0 10px">Klockslaget då opjour byter person på visningsskärmen. Ett pass går från det klockslaget till samma tid nästa dag.
        Kalendern, låsning av dagar och utlottningen (00.00) påverkas inte.</p>
      <div class="row" style="gap:10px;align-items:flex-end">
        <div><label for="sc-time" style="margin-top:0">Jourbytestid</label>
          <input type="time" id="sc-time" value="${esc(_admin.me.shiftChange || '07:30')}" required></div>
        <button class="btn" onclick="saveShiftChange()">Spara</button>
      </div>
      <div class="status" id="sc-status"></div>
    </div>`;
}

async function saveShiftChange() {
  const box = el('sc-status');
  const done = (text, ok) => showStatus(box, text, ok);
  try {
    const r = await api('/admin/clinic', { method: 'PUT', body: { shiftChange: el('sc-time').value } });
    _admin.me.shiftChange = r.shiftChange;
    done(`Sparat. Opjour byter person kl. ${r.shiftChange.replace(':', '.')}.`, true);
  } catch (err) { done(err.message, false); }
}


// ── Synk från nuvarande opjoursystemet (Google-formuläret) ────────────────
// Tills ST-Lotsen ersätter formuläret hålls kalendern, historiken och reservlistan uppdaterade från arket. Arket gäller helt och
// hållet: bokningar som inte stämmer med arket ändras eller avbokas. Automatisk synk körs när kalendern visas, högst var 10:e minut.
function sheetCard() {
  const s = _admin.sheet, st = s.status;
  const people = sortedRoster().filter(u => !u.isDisplay);
  const unknown = s.names.filter(n => !n.userId);
  const when = iso => iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const last = !st ? '<span class="muted">Ingen synk har körts än.</span>'
    : st.error ? `<span class="err">Senaste synken misslyckades ${esc(when(st.at))}: ${esc(st.error)}</span>`
    : `Senast ${esc(when(st.at))}: ${st.inserted} bokade, ${st.cancelled} avbokade, ${st.reserveChanged} reservändringar.${st.unknown?.length ? ` <span class="err">Okända namn: ${esc(st.unknown.join(', '))}.</span>` : ''}`;
  return `<div class="card">
      <h2>Synk från Google-formuläret</h2>
      <p class="muted" style="margin:0 0 8px">Tills ST-Lotsen ersätter det nuvarande opjoursystemet hämtas bokningar (med historik) och reservlistan från arket.
        Arket gäller helt och hållet: bokningar här som inte stämmer med arket ändras eller avbokas, även sådana som gjorts i ST-Lotsen. Dagar med okända namn lämnas orörda.
        Klistra in arkens publiceringslänkar (Arkiv → Dela → Publicera på webben).</p>
      <label for="sh-claims">Formulärsvaren (Timestamp, Namn, Annat datum)</label>
      <input type="text" inputmode="url" id="sh-claims" value="${esc(s.claimsUrl)}" placeholder="https://docs.google.com/spreadsheets/d/e/…/pubhtml?gid=…">
      <label for="sh-res">Reservlistan (Namn, Last response)</label>
      <input type="text" inputmode="url" id="sh-res" value="${esc(s.reserveUrl)}" placeholder="https://docs.google.com/spreadsheets/d/e/…/pubhtml?gid=0">
      <label class="role-row" style="margin-top:10px"><span><strong>Automatisk synk</strong><small>När kalendern visas, högst var 10:e minut.</small></span>${sw('id="sh-on"', s.on)}</label>
      <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="saveSheet()">Spara</button>
        <button class="btn-ghost" onclick="sheetRun(true)">Förhandsgranska</button>
        <button class="btn-ghost" onclick="sheetRun(false)">Synka nu</button>
      </div>
      <p style="margin:10px 0 0;font-size:14px">${last}</p>
      <div id="sh-preview"></div>
      ${s.names.length ? `<details style="margin-top:12px"${unknown.length ? ' open' : ''}><summary style="cursor:pointer;font-weight:bold">Namn i arket (${s.names.length}${unknown.length ? `, ${unknown.length} okända` : ''})</summary>
        <p class="hint">Vem namnet i arket är i ST-Lotsen. Okända namn hoppas över tills de kopplas.</p>
        ${s.names.map(n => `<div class="pass-card"><span>${esc(n.label)}${n.userId ? '' : ' <span class="err">okänd</span>'}</span>
          <select data-sheet-name="${esc(n.key)}" style="max-width:240px"><option value="">— ingen —</option>
          ${people.map(u => `<option value="${esc(u.id)}"${u.id === n.userId ? ' selected' : ''}>${esc(u.displayName)}${u.active ? '' : ' (inaktiv)'}</option>`).join('')}</select></div>`).join('')}
      </details>` : ''}
    </div>`;
}

async function saveSheet() {
  try {
    await api('/admin/sheet', { method: 'PUT', body: { claimsUrl: el('sh-claims').value, reserveUrl: el('sh-res').value, on: el('sh-on').checked } });
    _admin.sheet = await api('/admin/sheet');
    drawOpSettings(el('view'));
    toast('Synkinställningarna är sparade.');
  } catch (err) { toast(err.message, 'err'); }
}

async function sheetRun(dryRun) {
  if (!dryRun && !confirm('Synka nu? Bokningar och reservlistan uppdateras från arket.')) return;
  const box = el('sh-preview');
  box.innerHTML = '<p class="muted">Hämtar arket…</p>';
  try {
    const r = await api('/admin/sheet/' + (dryRun ? 'preview' : 'sync'), { method: 'POST' });
    _admin.sheet = await api('/admin/sheet');
    if (!dryRun) { await reloadAdmin(); toast(`Synkat: ${r.inserted} bokade, ${r.cancelled} avbokade, ${r.reserveChanged} reservändringar.`); return; }
    drawOpSettings(el('view'));
    el('sh-preview').innerHTML = `<div class="notice card" style="margin-top:10px">
      <strong>Förhandsgranskning</strong> — inget är ändrat. ${r.days} jourdagar i arket, ${r.same} stämmer redan.
      <br>Skulle boka ${r.inserted}${r.replaced ? ` (varav ${r.replaced} i stället för en annan person)` : ''}, avboka ${r.cancelled} och ändra reservstatus för ${r.reserveChanged}.
      ${r.unknown.length ? `<br><span class="err">Okända namn (hoppas över): ${esc(r.unknown.join(', '))}</span>` : ''}
      ${r.changes.length ? `<details style="margin-top:6px"><summary style="cursor:pointer">Senaste ${r.changes.length} bokningarna</summary>${r.changes.map(c => `<div>${esc(c.date)} ${esc(c.name)}${c.replaces ? ' <span class="muted">(ersätter annan)</span>' : ''}</div>`).join('')}</details>` : ''}
      ${r.reserves.length ? `<div style="margin-top:6px">Reserv: ${r.reserves.map(x => `${esc(x.name)} ${x.reserve ? 'på' : 'av'}`).join(', ')}</div>` : ''}
    </div>`;
  } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

document.addEventListener('change', async e => {
  const sel = e.target.closest?.('[data-sheet-name]'); if (!sel) return;
  try {
    await api('/admin/sheet/names', { method: 'PUT', body: { key: sel.dataset.sheetName, userId: sel.value || null } });
    _admin.sheet = await api('/admin/sheet');
    toast('Kopplingen är sparad.');
  } catch (err) { toast(err.message, 'err'); }
});

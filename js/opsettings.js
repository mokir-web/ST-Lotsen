// ── Opjour → Inställningar (#/opjour-settings) ───────────────────────────
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
    drawOpSettings(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function drawOpSettings(root) {
  const roster = sortedRoster();
  const people = roster.filter(u => u.active && !u.isDisplay), screens = roster.filter(u => u.isDisplay);
  const reserves = people.filter(u => u.availableReserve).length, stats = people.filter(u => u.isAdmin || u.canSeeStats).length;
  root.innerHTML = `
    <h1 class="page">Inställningar för Opjour</h1>

    ${noticeCard()}

    ${shiftCard()}

    <div class="card">
      <h2>Reserv och statistik</h2>
      <p class="muted" style="margin:0 0 8px"><strong>Reserv:</strong> ingår i utlottningen när ingen har bokat (var och en kan också slå på det själv i kalendern).
        <strong>Statistik:</strong> ser sidan Statistik — admin ser den alltid. ${reserves} reserv${reserves === 1 ? '' : 'er'} · ${stats} med statistik.</p>
      <div class="ulist">${people.map(u => {
        const locked = u.isGlobalAdmin && !_admin.me.isGlobalAdmin;
        return `<div class="ublock" data-id="${esc(u.id)}"><div class="uhead">
          <span class="uinfo plain"><span class="uname">${esc(u.displayName)}${u.id === _admin.me.userId ? ' <span class="muted">(du)</span>' : ''}</span>
            <span class="uuser">${esc(u.username || '')}</span></span>
          <div class="qsws">${quickSwitch('Reserv', 'reserve', u.availableReserve, locked, '')}${quickSwitch('Statistik', 'stats', u.isAdmin || u.canSeeStats, u.isAdmin || locked, u.isAdmin ? 'Admin ser alltid statistiken.' : '')}</div>
        </div><div class="status" data-s></div></div>`;
      }).join('') || '<p class="muted">Inga aktiva användare.</p>'}</div>
    </div>

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


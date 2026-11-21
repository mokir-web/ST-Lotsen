// ── Mitt konto (#/settings) ───────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), state, APP_VERSION.
// Alla kan ändra alla sina egna uppgifter — namn, användarnamn och telefon — och byta PIN. Det enda man inte kan
// ändra är kliniktillhörigheten. (Reservtoggeln finns på startsidan; admin hanterar andras uppgifter på Admin-sidan.)

let _settings = null;

async function renderSettings(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    _settings = { me };
    root.innerHTML = `
      <h1 class="page">Mitt konto</h1>

      <div class="card">
        <h2>Mina uppgifter</h2>
        <label for="st-name" style="margin-top:0">Fullständigt namn</label>
        <input type="text" id="st-name" value="${esc(me.displayName)}" maxlength="60" autocomplete="name">
        <label for="st-user">Användarnamn</label>
        <input type="text" id="st-user" value="${esc(me.username || '')}" maxlength="60" autocapitalize="none" spellcheck="false" autocomplete="username">
        <div class="field-row">
          <div><label for="st-phone">Telefon arbete</label>
            <input type="tel" id="st-phone" value="${esc(me.phone || '')}" placeholder="010-123 45 67" maxlength="30" inputmode="tel" autocomplete="tel-local"></div>
          <div><label for="st-phone-priv">Telefon privat</label>
            <input type="tel" id="st-phone-priv" value="${esc(me.phonePrivate || '')}" placeholder="070-123 45 67" maxlength="30" inputmode="tel" autocomplete="tel"></div>
        </div>
        <label for="st-email">E-post</label>
        <input type="email" id="st-email" value="${esc(me.email || '')}" maxlength="120" autocapitalize="none" spellcheck="false" autocomplete="email">
        <label style="margin-top:14px">Klinik</label>
        <div>${esc(me.clinicName || state.clinicName)} <span class="muted">(ändras inte här)</span></div>
        <p class="hint">Ditt namn syns för alla som är inloggade på kliniken. Telefonnumren (arbete och privat) visas på klinikens visningsskärm när du har opjour eller är reserv just den dagen, så att man kan nå dig. E-posten ser bara du och klinikens admin. Byter du användarnamn loggar du in med det nya nästa gång.</p>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="saveContact()">Spara</button></div>
        <div id="st-contact-status" class="status"></div>
      </div>

      <div id="st-self"></div>

      <div class="card">
        <h2>Startsida</h2>
        <p class="hint" style="margin-top:0">Sidan som öppnas när du startar ST-Lotsen. Fliken Startsida och loggan leder alltid till startsidan.</p>
        <select id="st-start" onchange="saveStartPage(this.value)" style="max-width:320px">${startPageOptions(me, me.startPage)}</select>
        <div id="st-start-status" class="status"></div>
      </div>

      <div class="card">
        <h2>Byt PIN</h2>
        <label for="st-pin-cur" style="margin-top:0">Nuvarande PIN</label>
        <input type="password" id="st-pin-cur" inputmode="numeric" maxlength="6" autocomplete="current-password">
        <label for="st-pin-new">Ny PIN (${me.isAdmin || me.isDirector || me.isGlobalAdmin ? '6 siffror — krävs för admin och studierektor' : '4 eller 6 siffror'})</label>
        <input type="password" id="st-pin-new" inputmode="numeric" maxlength="6" autocomplete="new-password">
        <label for="st-pin-rep">Upprepa ny PIN</label>
        <input type="password" id="st-pin-rep" inputmode="numeric" maxlength="6" autocomplete="new-password">
        <p class="hint">Byter du PIN loggas du ut på alla andra enheter.</p>
        <div class="row" style="margin-top:10px"><button class="btn" onclick="savePin()">Byt PIN</button></div>
        <div id="st-pin-status" class="status"></div>
      </div>

      <div class="card">
        <h2>Inloggade enheter</h2>
        <p class="hint" style="margin-top:0">Du förblir inloggad på en enhet så länge du använder appen. Har du loggat in på en dator eller telefon som inte är din, eller tappat bort en telefon: logga ut överallt. Du loggas också ut här.</p>
        <div class="row" style="margin-top:10px"><button class="btn-ghost" onclick="logoutAll()">Logga ut på alla enheter</button></div>
      </div>

      <div class="card">
        <h2>Radera mitt konto</h2>
        <p class="hint" style="margin-top:0">Ditt namn, användarnamn, e-post, telefon, PIN, roller och handledarkopplingar tas bort och du loggas ut. Pass, schema och
          utbildningshistorik ligger kvar på kliniken under <em>Ingen användare</em>. Det går inte att ångra; vill du tillbaka får admin lägga upp ett nytt konto.</p>
        <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div><label for="st-del-pin" style="margin-top:0">Din PIN</label><input type="password" id="st-del-pin" inputmode="numeric" maxlength="6" autocomplete="current-password" style="max-width:140px"></div>
          <button class="btn-ghost edu-danger" onclick="deleteOwnAccount()">Radera mitt konto…</button></div>
        <div id="st-del-status" class="status"></div>
      </div>

      <p class="muted" style="font-size:12px;text-align:center">ST-Lotsen ${esc(APP_VERSION)}</p>`;
    drawSelfSettings();
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function stStatus(id, text, ok) {
  showStatus(el(id), text, ok);
}

async function saveContact() {
  try {
    const r = await api('/profile', { method: 'PUT', body: {
      displayName: el('st-name').value, username: el('st-user').value, phone: el('st-phone').value, phonePrivate: el('st-phone-priv').value, email: el('st-email').value
    } });
    stStatus('st-contact-status', r.username !== _settings.me.username ? `Sparat. Nästa gång loggar du in som "${r.username}".` : 'Sparat.', true);
    _settings.me.username = r.username;
  } catch (err) { stStatus('st-contact-status', err.message, false); }
}

async function savePin() {
  const cur = el('st-pin-cur').value, a = el('st-pin-new').value, b = el('st-pin-rep').value;
  if (a !== b) return stStatus('st-pin-status', 'De nya PIN-koderna matchar inte.', false);
  try {
    const r = await api('/auth/change-pin', { method: 'POST', body: { currentPin: cur, newPin: a } });
    if (r.token) saveSession(r.token, state.scope, state.clinicName);
    el('st-pin-cur').value = el('st-pin-new').value = el('st-pin-rep').value = '';
    stStatus('st-pin-status', 'PIN ändrad.', true);
  } catch (err) { stStatus('st-pin-status', err.message, false); }
}

async function logoutAll() {
  if (!confirm('Logga ut på alla enheter, även den här?')) return;
  try {
    await api('/auth/logout-all', { method: 'POST' });
    logout();
  } catch (err) { toast(err.message, 'err'); }
}

async function saveStartPage(v) {
  try {
    await api('/profile', { method: 'PUT', body: { startPage: v } });
    try { localStorage.setItem('opjour_start', v); } catch {}
    stStatus('st-start-status', 'Startsidan är sparad.', true);
  } catch (err) { stStatus('st-start-status', err.message, false); }
}

// ── Mina inställningar (0.58.0) ─────────────────────────────────────────
// Yrkesroll, opjour, ST-uppgifter, handledare och användarroll i DOPS — det som förut bara admin kunde ändra. Vem man handleder
// visas men ändras av ST-läkaren eller studierektor (servern, routes/profileSelf.js).
const SELF_JOBS = [['', '–'], ['ST', 'ST-läkare'], ['BT', 'BT-läkare'], ['AT', 'AT-läkare'], ['Spec', 'Specialist'], ['Annan', 'Annan']];
async function drawSelfSettings() {
  const box = el('st-self');
  if (!box) return;
  let d;
  try { d = await api('/profile/self'); } catch (err) { box.innerHTML = `<div class="card"><p class="err">${esc(err.message)}</p></div>`; return; }
  const mods = d.modules || [], st = d.jobRole === 'ST';
  const month = v => v ? String(v).slice(0, 7) : '';
  box.innerHTML = `<div class="card">
    <h2>Mina inställningar</h2>
    <label class="role-row"><span><strong>Yrkesroll</strong><small>Samma i alla delar av ST-Lotsen. ST-läkare får utbildningsplan och handledning.</small></span>
      <select id="ss-job" style="max-width:150px">${SELF_JOBS.map(([v, l]) => `<option value="${v}"${v === d.jobRole ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${mods.includes('opjour') ? `<label class="role-row"><span><strong>Jag bokar opjour</strong><small>Av = du ser vem som har opjour men bokas inte och är inte reserv.</small></span>
      ${sw('id="ss-opjour"', !d.opjourView)}</label>` : ''}
    ${mods.includes('dops') && d.dopsUserRole ? `<label class="role-row"><span><strong>Användarroll i DOPS</strong><small>Blandbild registrerar och tar emot, Registrerare bara registrerar, Mottagare bara tar emot.</small></span>
      <select id="ss-dops" style="max-width:150px">${['Blandbild', 'Registrerare', 'Mottagare'].map(r => `<option${r === d.dopsUserRole ? ' selected' : ''}>${r}</option>`).join('')}</select></label>` : ''}
    <div id="ss-st"${st ? '' : ' class="hidden"'}>
      <h3>ST</h3>
      <div class="field-row"><div><label for="ss-start" style="margin-top:0">ST-start</label><input type="month" id="ss-start" value="${esc(month(d.stStart))}"></div>
        <div><label for="ss-end" style="margin-top:0">ST-slut <small class="muted" style="font-weight:normal">(när ST är klar)</small></label><input type="month" id="ss-end" value="${esc(month(d.stEnd))}"></div></div>
      <label for="ss-fw">Målbeskrivning</label><select id="ss-fw"><option value="">Klinikens förval</option>${d.frameworks.map(f => `<option value="${esc(f.id)}"${f.id === d.frameworkId ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
      <label>Mina handledare</label>
      <div class="dmi-types" id="ss-sup">${d.people.map(p => `<label class="chip"><input type="checkbox" value="${esc(p.id)}"${d.supervisorIds.includes(p.id) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('') || '<span class="muted">Inga andra användare på kliniken.</span>'}</div>
      <p class="hint">Dina handledare ser din utbildningsplan och era gemensamma anteckningar.</p>
    </div>
    <h3>Jag handleder</h3>
    <p style="margin:0">${d.adepts.length ? d.adepts.map(a => esc(a.name)).join(', ') : '<span class="muted">Ingen.</span>'}</p>
    <p class="hint">Ändras av ST-läkaren (under Mina handledare) eller av studierektor.</p>
    <div class="row" style="margin-top:10px"><button class="btn" id="ss-save">Spara</button></div>
    <div id="ss-status" class="status"></div></div>`;
  el('ss-job').onchange = e => el('ss-st').classList.toggle('hidden', e.target.value !== 'ST');
  el('ss-save').onclick = async () => {
    const body = { jobRole: el('ss-job').value };
    if (el('ss-opjour')) body.opjourView = !el('ss-opjour').checked;
    if (el('ss-dops')) body.dopsUserRole = el('ss-dops').value;
    if (body.jobRole === 'ST') Object.assign(body, { stStart: el('ss-start').value, stEnd: el('ss-end').value, frameworkId: el('ss-fw').value || null,
      supervisorIds: [...document.querySelectorAll('#ss-sup input:checked')].map(c => c.value) });
    try {
      await api('/profile/self', { method: 'PUT', body });
      stStatus('ss-status', 'Sparat.', true);
      setMenuForUser(await api('/me'));
    } catch (err) { stStatus('ss-status', err.message, false); }
  };
}

async function deleteOwnAccount() {
  const pin = el('st-del-pin').value.trim();
  if (!pin) return stStatus('st-del-status', 'Skriv din PIN.', false);
  if (!confirm('Radera ditt konto? Namn, kontaktuppgifter, PIN och roller tas bort och det går inte att ångra.')) return;
  try {
    await api('/profile', { method: 'DELETE', body: { pin } });
    alert('Ditt konto är raderat.');
    logout();
  } catch (err) { stStatus('st-del-status', err.message, false); }
}

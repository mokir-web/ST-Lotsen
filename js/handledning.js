// ── Handledning (#/handledning, #/handledning/<ST-läkare>, #/handledning/kollegium) ─────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), fmtDM(), fmtDateLong(), todayStockholm(), toast().
// Global entry: renderHandledning(root, sub).
//
// Handledningstillfällen per ST-läkare. "Handledning utförd" sparar datum, en gemensam anteckning (ST-läkaren och handledaren) och en
// egen anteckning som bara den som skrev den kan läsa. Studierektor ser alla ST-läkare med datum och status mot klinikens intervall
// (gul = mer än intervallet sedan senaste, röd = mer än 150 %), men inga anteckningar. Samtalsstödet är rubrikerna ur "Strukturerad
// ST-handledning" — bara vägledning, inget fylls i per ämne. Specialistkollegium läses ur DOPS-appen; att fylla i nya formulär och be om
// självskattning öppnas när ST-Lotsen får skriva i DOPS.

const HL_TOPICS = [
  ['Varje gång', ['Hur har du det? Vad behöver du ta upp i dag?', 'Vad behöver handledaren ta upp i dag?', 'Dagens planerade ämne', 'Feedback',
    'Reflektioner — hur känner du inför arbetet?', 'Vad ska vi göra nästa gång?']],
  ['Var 3:e månad', ['Genomgång av ett utvalt medicinskt delmål ur målbeskrivningen', 'Etik — diskussion', 'Kommunikation med patienter och anhöriga — hur fungerar det?',
    'Samarbete med personal och kollegor — hur fungerar det?', 'Hur fungerar handledningen?', 'Bedömning genom medsittning (även ST-kollegium, 360-graders, Mini-CEX, CBD, DOPS)']],
  ['Var 6:e månad', ['Kursplanering', 'Planering av sidotjänstgöring', 'Vetenskap och kvalitetsarbete', 'Undervisa och handleda', 'Genomgång av utbildningsplanen']],
  ['Var 12:e månad', ['Specialistkollegium eller 360-gradersbedömning']]
];
const hlTopicsHtml = () => HL_TOPICS.map(([h, items]) => `<h4>${esc(h)}</h4><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
const HL_STATUS = { ok: ['I fas', 'ok'], yellow: ['Dags', 'yellow'], red: ['Försenad', 'red'] };
const hlStatus = s => s ? `<span class="hl-st ${HL_STATUS[s][1]}">${HL_STATUS[s][0]}</span>` : '';
const hlDate = d => d ? fmtDM(String(d).slice(0, 10)) + ' ' + String(d).slice(0, 4) : '–';

let _hl = null;

async function renderHandledning(root, sub = '') {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!(me.modules || []).includes('handledning')) { root.innerHTML = '<h1 class="page">Handledning</h1><p class="muted">Modulen är inte påslagen för kliniken.</p>'; return; }
    _hl = { me, sub, editing: null };
    const here = location.hash, gone = () => location.hash !== here;   // ritar inte över en sida man hunnit gå vidare till
    if (sub === 'kollegium') { const k = await api('/handledning/kollegium'); if (!gone()) drawKollegium(root, k); return; }
    const list = await api('/handledning');
    if (gone()) return;
    // En ST-läkare utan egna adepter går direkt till sina egna handledningar.
    if (!sub && !list.lead && !list.adepts.length && list.people.length === 1) { location.replace('#/handledning/' + list.people[0].id); return; }
    if (sub) { const one = await api('/handledning/' + encodeURIComponent(sub)); if (!gone()) drawHlPerson(root, one); return; }
    const progress = (me.modules || []).includes('mal') ? await api('/progress').catch(() => null) : null;
    if (!gone()) drawHlList(root, list, progress);
  } catch (err) { root.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// Måluppfyllelse i korthet (handledare och studierektor): kvar under innevarande ST-år och försenade krav.
function hlProgress(progress, pid) {
  const p = progress?.people?.find(x => x.id === pid);
  if (!p || p.stMonths == null) return '';
  const year = Math.floor(p.stMonths / 12) + 1, open = r => !['klart', 'tidigare', 'ej'].includes(progress.cells?.[pid]?.[r.id]?.status);
  const now = year <= 5 ? progress.requirements.filter(r => r.stYear === year && open(r)).length : null;
  const late = progress.requirements.filter(r => r.stYear && r.stYear < Math.min(year, 6) && r.mandatory !== false && open(r)).length;
  return `<span class="muted">${year > 5 ? 'efter ST-år 5' : `ST-år ${year} · ${now} krav kvar i år`}</span>${late ? ` <span class="pchip st-saknas">${late} försenade</span>` : ''}`;
}

function drawHlList(root, d, progress) {
  const mine = d.people.filter(p => p.mine), adepts = d.people.filter(p => p.adept), others = d.people.filter(p => !p.mine && !p.adept);
  const row = p => `<a class="hl-row" href="#/handledning/${esc(p.id)}">
      <span class="hl-name"><strong>${esc(p.displayName)}</strong><small class="muted">${p.supervisors.length ? 'Handledare: ' + esc(p.supervisors.join(', ')) : 'Ingen handledare'}</small></span>
      <span class="hl-when"><span>Senast: ${esc(p.lastHeld ? hlDate(p.lastHeld) : 'ingen')}</span>${d.months && p.nextDue ? `<small class="muted">Nästa enligt intervallet: ${esc(hlDate(p.nextDue))}</small>` : ''}</span>
      ${hlStatus(p.status)}
      ${progress && !p.mine ? `<span class="hl-prog">${hlProgress(progress, p.id)}</span>` : ''}</a>`;
  const block = (title, list) => list.length ? `<div class="card"><h2>${title} (${list.length})</h2><div class="hl-rows">${list.map(row).join('')}</div></div>` : '';
  root.innerHTML = `
    <h1 class="page">Handledning</h1>
    <p class="muted" style="margin:-4px 0 12px">${d.months ? `Handledning var ${d.months}:e månad. Gul = mer än så sedan senaste, röd = mer än en och en halv gång intervallet.`
      : `Kliniken har inte angett hur ofta handledning ska ske.${d.lead ? ' Ställ in det under <a href="#/installningar/handledning">Inställningar → Handledning</a>.' : ''}`}</p>
    ${block('Mina handledningar', mine)}${block('Mina adepter', adepts)}${block(d.lead ? 'Alla ST-läkare' : 'Övriga', others)}
    ${d.people.length ? '' : '<div class="card"><p class="muted" style="margin:0">Inga ST-läkare att visa.</p></div>'}
    <details class="card hl-guide"><summary><strong>Samtalsstöd</strong> — ämnen ur strukturerad ST-handledning</summary>${hlTopicsHtml()}</details>`;
}

// Personvyn: handledningarna som läsbara kort (nyast först). "Ändra" öppnar kortet för redigering: datum, anteckningarna (för ST-läkaren
// och handledaren) och Ta bort. Studierektor ser datum och kan ändra datum eller ta bort, men inga anteckningar.
function drawHlPerson(root, d) {
  const p = d.person, self = p.id === _hl.me.userId;
  const canEdit = d.canWrite || d.canMark;
  const note = (label, sub, text) => text ? `<div class="hl-note"><h4>${label} <small>${sub}</small></h4><div class="hl-text">${esc(text)}</div></div>` : '';
  const view = t => `<div class="card hl-talk" data-id="${esc(t.id)}">
      <div class="hl-talk-head"><h2>${esc(fmtDateLong(String(t.heldOn).slice(0, 10)))}</h2>
        <span class="muted" style="font-size:13px">Markerad av ${esc(t.recordedByName || 'Ingen användare')}</span>
        ${canEdit ? '<button class="btn-ghost hl-edit-btn" data-hl="edit">Ändra</button>' : ''}</div>
      ${d.canWrite ? (note('Gemensam anteckning', self ? 'du och din handledare' : 'du och ST-läkaren', t.sharedNote) + note('Min anteckning', 'bara du', t.myNote)
          || '<p class="muted" style="margin:6px 0 0">Inga anteckningar.</p>')
        : '<p class="muted" style="margin:6px 0 0">Anteckningarna är ST-läkarens och handledarens.</p>'}
    </div>`;
  const edit = t => `<div class="card hl-talk editing" data-id="${esc(t.id)}">
      <label style="margin-top:0">Datum</label><input type="date" class="hl-e-date" value="${esc(String(t.heldOn).slice(0, 10))}" max="${todayStockholm()}" style="max-width:200px">
      ${d.canWrite ? `<label>Gemensam anteckning <small class="muted" style="font-weight:normal">— syns för ${self ? 'dig och din handledare' : 'dig och ST-läkaren'}</small></label>
      <textarea class="hl-shared" rows="5" maxlength="4000">${esc(t.sharedNote)}</textarea>
      <label>Min anteckning <small class="muted" style="font-weight:normal">— bara du kan läsa den</small></label>
      <textarea class="hl-mine" rows="5" maxlength="4000">${esc(t.myNote)}</textarea>` : ''}
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn" data-hl="save">Spara</button><button class="btn-ghost" data-hl="cancel">Avbryt</button>
        <button class="btn-ghost hl-del" data-hl="delete" style="margin-left:auto">Ta bort…</button></div>
    </div>`;
  const editing = _hl.editing;
  root.innerHTML = `
    <p style="margin:0 0 6px">${_hl.me.isDirector || _hl.me.isAdmin || _hl.me.isSupervisor ? '<a href="#/handledning">← Alla</a>' : ''}</p>
    <div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">${self ? 'Mina handledningar' : esc(p.displayName)} ${hlStatus(p.status)}</h1>
      <p class="muted" style="margin:0">Senast: ${esc(p.lastHeld ? hlDate(p.lastHeld) : 'ingen')}${d.months && p.nextDue ? ` · nästa enligt intervallet (var ${d.months}:e månad): ${esc(hlDate(p.nextDue))}` : ''}
        ${(_hl.me.modules || []).includes('mal') ? ` · <a href="#/plan/${esc(p.id)}">Utbildningsplan och måluppfyllelse</a>` : ''}</p></div>
      <div class="tw-actions">${d.canWrite ? '<button class="btn-ghost" data-hl="import" title="Egna anteckningar från en fil (CSV eller Excel)">Importera anteckningar…</button>' : ''}${d.canMark ? '<button class="btn" data-hl="done">Handledning utförd…</button>' : ''}</div></div>
    <div class="hl-layout"><div>${d.talks.length ? d.talks.map(t => t.id === editing ? edit(t) : view(t)).join('') : '<div class="card"><p class="muted" style="margin:0">Ingen handledning registrerad än.</p></div>'}</div>
      <aside class="card hl-guide-side"><h2>Samtalsstöd</h2><p class="hint" style="margin-top:0">Ämnen ur strukturerad ST-handledning, som vägledning inför samtalet.</p>${hlTopicsHtml()}</aside></div>`;
  if (editing) root.querySelector('.hl-talk.editing')?.scrollIntoView({ block: 'nearest' });
  root.onclick = async e => {
    const b = e.target.closest('[data-hl]'); if (!b) return;
    const act = b.dataset.hl, card = b.closest('.hl-talk');
    if (act === 'done') return hlDoneDialog(d);
    if (act === 'import') return hlImportDialog(d);
    if (act === 'edit') { _hl.editing = card.dataset.id; return drawHlPerson(root, d); }
    if (act === 'cancel') { _hl.editing = null; return drawHlPerson(root, d); }
    const id = card.dataset.id, t = d.talks.find(x => x.id === id);
    b.disabled = true;
    try {
      if (act === 'delete') {
        if (!confirm(`Ta bort handledningen ${fmtDateLong(String(t.heldOn).slice(0, 10))}? Den gemensamma anteckningen och båda parters egna anteckningar försvinner. Det går inte att ångra.`)) { b.disabled = false; return; }
        await api('/handledning/talks/' + encodeURIComponent(id), { method: 'DELETE' });
        toast('Handledningen är borttagen.');
      } else {
        const body = { heldOn: card.querySelector('.hl-e-date').value };
        if (d.canWrite) Object.assign(body, { sharedNote: card.querySelector('.hl-shared').value, myNote: card.querySelector('.hl-mine').value });
        await api('/handledning/talks/' + encodeURIComponent(id), { method: 'PUT', body });
        toast('Sparat.');
      }
      _hl.editing = null;
      renderHandledning(el('view'), d.person.id);
    } catch (err) { b.disabled = false; alert(err.message); }
  };
}

// "Handledning utförd": datum (förval i dag), gemensam och egen anteckning, med samtalsstödet bredvid.
function hlDoneDialog(d) {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const today = todayStockholm();
  root.innerHTML = `<div class="overlay" data-close="1"><form class="sheet wide" role="dialog" aria-label="Handledning utförd" id="hl-form">
      <h2>Handledning utförd · ${esc(d.person.displayName)} <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
      <div class="hl-dialog"><div>
        <label for="hl-date" style="margin-top:0">Datum</label><input type="date" id="hl-date" value="${today}" max="${today}" required style="max-width:200px">
        ${d.canWrite ? `<label for="hl-shared">Gemensam anteckning <small class="muted" style="font-weight:normal">— syns för ST-läkaren och handledaren</small></label>
        <textarea id="hl-shared" rows="5" maxlength="4000" placeholder="T.ex. vad ni kom överens om och vad ni tar upp nästa gång"></textarea>
        <label for="hl-mine">Min anteckning <small class="muted" style="font-weight:normal">— bara du kan läsa den</small></label>
        <textarea id="hl-mine" rows="5" maxlength="4000" placeholder="Ditt eget minnesstöd"></textarea>` : '<p class="hint">Anteckningarna skrivs av ST-läkaren och handledaren.</p>'}
        <div class="row" style="margin-top:12px"><button class="btn" type="submit">Spara</button><button class="btn-ghost" type="button" data-close="1">Avbryt</button></div>
        <div class="status err" id="hl-err"></div>
      </div><aside class="hl-guide-side"><h3 style="margin-top:0">Samtalsstöd</h3>${hlTopicsHtml()}</aside></div>
    </form></div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  el('hl-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/talks', { method: 'POST', body: { traineeId: d.person.id, heldOn: el('hl-date').value,
        ...(d.canWrite ? { sharedNote: el('hl-shared').value, myNote: el('hl-mine').value } : {}) } });
      root.innerHTML = ''; toast('Handledningen är registrerad.');
      renderHandledning(el('view'), d.person.id);
    } catch (err) { el('hl-err').textContent = err.message; }
  });
}

// ── Specialistkollegium ──────────────────────────────────────────────────
// Per ST-läkare: senaste självskattning och rapport ur DOPS-appen. En rapport som är äldre än tre månader kan ersättas av en ny
// (specialister och handledare); studierektor ber om självskattning. Båda kräver att ST-Lotsen får skriva i DOPS — till dess visas
// knapparna men är avstängda.
function drawKollegium(root, d) {
  const old = iso => !iso || (Date.now() - Date.parse(iso)) / 864e5 > 91;
  const locked = 'Öppnas när ST-Lotsen får skriva i DOPS-appens databas — fyll i formuläret i DOPS-appen så länge.';
  root.innerHTML = `
    <div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">Specialistkollegium</h1>
      <p class="muted" style="margin:0">Senaste <em>${esc(d.forms.self)}</em> och <em>${esc(d.forms.report)}</em> per ST-läkare, ur DOPS-appen.</p></div>
      <div class="tw-actions">${d.lead ? `<button class="btn" disabled title="${esc(locked)}">Be om självskattning…</button>` : ''}</div></div>
    ${d.dops ? '' : '<div class="card notice warn">DOPS är inte anslutet — datumen kan inte hämtas.</div>'}
    <div class="card"><div class="sch-scroll"><table class="dst-table hl-kol">
      <tr><th>ST-läkare</th><th>Senaste självskattning</th><th>Senaste rapport</th><th></th></tr>
      ${d.people.map(p => `<tr><td>${esc(p.displayName)}${p.linked ? '' : ' <span class="tagchip" title="Inget kopplat DOPS-konto">ej i DOPS</span>'}</td>
        <td>${p.lastSelf ? esc(hlDate(p.lastSelf)) + (p.selfCount > 1 ? ` <span class="muted">(${p.selfCount})</span>` : '') : '<span class="muted">ingen</span>'}</td>
        <td class="${old(p.lastReport) ? 'hl-old' : ''}">${p.lastReport ? esc(hlDate(p.lastReport)) + (p.reportCount > 1 ? ` <span class="muted">(${p.reportCount})</span>` : '') : '<span class="muted">ingen</span>'}</td>
        <td>${d.canReport && old(p.lastReport) ? `<button class="btn-ghost" disabled title="${esc(locked)}">Fyll i ny rapport</button>` : ''}</td></tr>`).join('')}
    </table></div>
    <p class="hint">Röd = senaste rapporten är äldre än tre månader (eller saknas); då kan specialister och handledare fylla i en ny.
      ${esc(locked)}</p></div>`;
}

// ── Inställningar → Handledning (studierektor och admin) ─────────────────
// Hur ofta handledning ska ske. Styr status (gul/röd), påminnelser i Att göra och kortet Handledarsamtal på startsidan.
async function renderHlSettings(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!(me.isDirector || me.isAdmin)) { location.hash = '#/installningar/konto'; return; }
    const cfg = await api('/admin/st/config');
    root.innerHTML = `<h1 class="page">Handledning</h1>
      <div class="card"><h2>Intervall</h2>
        <p class="hint" style="margin-top:0">Hur ofta ST-läkarna ska ha handledning. Nästa tillfälle räknas från det senaste (eller från ST-start).
          Under Handledning blir en ST-läkare gul när mer tid än intervallet har gått och röd vid mer än en och en halv gång intervallet.
          Startsidan påminner ST-läkaren, handledaren och studierektorn (Att göra och kortet Handledarsamtal). Tomt = följs inte upp.</p>
        <div class="row" style="gap:8px;align-items:flex-end">
          <div><label for="hl-months" style="margin-top:0">Var … månad (1–24)</label><input type="number" id="hl-months" min="1" max="24" value="${cfg.supervisionMonths ?? ''}" placeholder="av" style="max-width:120px"></div>
          <button class="btn" id="hl-months-save">Spara</button>
        </div></div>
      <div class="card"><h2>Samtalsstöd</h2><p class="hint" style="margin-top:0">Ämnena som visas vid varje handledning (ur strukturerad ST-handledning).</p>${hlTopicsHtml()}</div>`;
    el('hl-months-save').onclick = async () => {
      try { await api('/admin/st/clinic', { method: 'PUT', body: { supervisionMonths: el('hl-months').value } }); toast('Sparat.'); }
      catch (err) { alert(err.message); }
    };
  } catch (err) { root.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// ── Importera egna anteckningar ──────────────────────────────────────────
// En fil (CSV eller Excel) med kolumnerna Datum och Anteckning. Varje rad blir ett handledningstillfälle med raden som EGEN anteckning
// (bara den som importerar kan läsa den); finns ett tillfälle samma dag läggs anteckningen där. Förhandsvisning innan något sparas.
// Datum: ÅÅÅÅ-MM-DD, ÅÅMMDD, ÅÅÅÅMMDD eller Excels datum.
function hlParseDate(v) {
  const s = String(v ?? '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) return `20${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5).toISOString().slice(0, 10);   // Excels datumnummer
  return s;
}
function hlRowsFromTable(table) {
  const norm = x => String(x ?? '').trim().toLowerCase();
  const h = table.findIndex(r => r.some(c => norm(c) === 'datum'));
  const head = h >= 0 ? table[h].map(norm) : [];
  const dc = h >= 0 ? head.indexOf('datum') : 0;
  const nc = h >= 0 ? head.findIndex(c => ['anteckning', 'innehåll', 'text', 'anteckningar'].includes(c)) : 1;
  return table.slice(h + 1).filter(r => r.some(c => String(c ?? '').trim()))
    .map(r => ({ date: hlParseDate(r[dc]), note: String(r[nc < 0 ? 1 : nc] ?? '').trim() }));
}
function hlImportDialog(d) {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  root.innerHTML = `<div class="overlay" data-close="1"><div class="sheet wide" role="dialog" aria-label="Importera anteckningar">
      <h2>Importera anteckningar · ${esc(d.person.displayName)} <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
      <p class="hint" style="margin-top:0">En fil (CSV eller Excel) med kolumnerna <strong>Datum</strong> och <strong>Anteckning</strong>. Varje rad blir en handledning med
        raden som <strong>din egen anteckning</strong> — bara du kan läsa den. Finns redan en handledning samma dag läggs anteckningen där; har du redan en egen
        anteckning den dagen hoppas raden över. Du ser allt innan något sparas.</p>
      <input type="file" id="hl-imp-file" accept=".csv,.txt,.xlsx">
      <div id="hl-imp-out"></div></div></div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  let rows = null;
  const ST = { create: ['Ny handledning', 'ok'], attach: ['Läggs på befintlig', 'ok'], skip: ['Hoppas över (har redan egen anteckning)', 'muted'], error: ['Fel', 'err'] };
  const show = (r, done) => {
    const n = r.counts.create + r.counts.attach;
    el('hl-imp-out').innerHTML = `<p style="margin:10px 0 4px"><strong>${done ? 'Importerat' : 'Förhandsvisning'}:</strong> ${r.counts.create} nya handledningar, ${r.counts.attach} på befintliga,
        ${r.counts.skip} hoppas över, ${r.counts.error} med fel.</p>
      <div class="sch-scroll" style="max-height:50vh"><table class="dst-table hl-imp"><tr><th>Datum</th><th>Anteckning</th><th>Status</th></tr>
        ${r.items.map(it => `<tr><td>${esc(it.date)}</td><td class="hl-imp-note">${esc(it.note)}</td><td class="${ST[it.status][1]}">${esc(it.error || ST[it.status][0])}</td></tr>`).join('')}</table></div>
      ${done ? '<div class="row" style="margin-top:10px"><button class="btn" data-close="1">Klar</button></div>'
        : n ? `<div class="row" style="margin-top:10px"><button class="btn" id="hl-imp-go">Importera ${n}</button></div>` : ''}
      <div class="status err" id="hl-imp-err"></div>`;
    el('hl-imp-go')?.addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        const res = await api(`/handledning/${encodeURIComponent(d.person.id)}/import`, { method: 'POST', body: { rows } });
        show(res, true);
        el('hl-imp-out').querySelector('[data-close]').onclick = () => { root.innerHTML = ''; renderHandledning(el('view'), d.person.id); };
      } catch (err) { e.target.disabled = false; el('hl-imp-err').textContent = err.message; }
    });
  };
  el('hl-imp-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    el('hl-imp-out').innerHTML = '<p class="muted">Läser filen…</p>';
    try {
      rows = hlRowsFromTable(await OpjourImport.readTable(f));
      if (!rows.length) throw new Error('Filen innehåller inga rader.');
      show(await api(`/handledning/${encodeURIComponent(d.person.id)}/import`, { method: 'POST', body: { rows, dryRun: true } }), false);
    } catch (err) { el('hl-imp-out').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  });
}

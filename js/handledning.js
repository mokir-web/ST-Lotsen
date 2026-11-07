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
    _hl = { me, sub };
    if (sub === 'kollegium') return drawKollegium(root, await api('/handledning/kollegium'));
    const list = await api('/handledning');
    // En ST-läkare utan egna adepter går direkt till sina egna handledningar.
    if (!sub && !list.lead && !list.adepts.length && list.people.length === 1) { location.replace('#/handledning/' + list.people[0].id); return; }
    if (sub) return drawHlPerson(root, await api('/handledning/' + encodeURIComponent(sub)));
    const progress = (me.modules || []).includes('mal') ? await api('/progress').catch(() => null) : null;
    drawHlList(root, list, progress);
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
      : `Kliniken har inte angett hur ofta handledning ska ske.${d.lead ? ' Ställ in det under <a href="#/installningar/utbildningsplan">Inställningar → Utbildningsplan</a>.' : ''}`}</p>
    ${block('Mina handledningar', mine)}${block('Mina adepter', adepts)}${block(d.lead ? 'Alla ST-läkare' : 'Övriga', others)}
    ${d.people.length ? '' : '<div class="card"><p class="muted" style="margin:0">Inga ST-läkare att visa.</p></div>'}
    <details class="card hl-guide"><summary><strong>Samtalsstöd</strong> — ämnen ur strukturerad ST-handledning</summary>${hlTopicsHtml()}</details>`;
}

function drawHlPerson(root, d) {
  const p = d.person, self = p.id === _hl.me.userId;
  const talk = t => `<div class="card hl-talk" data-id="${esc(t.id)}">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(fmtDateLong(String(t.heldOn).slice(0, 10)))}</h2>
        <span class="muted" style="font-size:13px">Markerad av ${esc(t.recordedByName || 'Ingen användare')}</span></div>
      ${d.canWrite ? `
      <label>Gemensam anteckning <small class="muted" style="font-weight:normal">— syns för ${self ? 'dig och din handledare' : 'dig och ST-läkaren'}</small></label>
      <textarea class="hl-shared" rows="3" maxlength="4000">${esc(t.sharedNote)}</textarea>
      <label>Min anteckning <small class="muted" style="font-weight:normal">— bara du kan läsa den</small></label>
      <textarea class="hl-mine" rows="3" maxlength="4000">${esc(t.myNote)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn-ghost" data-hl="save">Spara anteckningarna</button></div>` : '<p class="muted" style="margin:6px 0 0">Anteckningarna är ST-läkarens och handledarens.</p>'}
    </div>`;
  root.innerHTML = `
    <p style="margin:0 0 6px">${_hl.me.isDirector || _hl.me.isAdmin || _hl.me.isSupervisor ? '<a href="#/handledning">← Alla</a>' : ''}</p>
    <div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">${self ? 'Mina handledningar' : esc(p.displayName)} ${hlStatus(p.status)}</h1>
      <p class="muted" style="margin:0">Senast: ${esc(p.lastHeld ? hlDate(p.lastHeld) : 'ingen')}${d.months && p.nextDue ? ` · nästa enligt intervallet (var ${d.months}:e månad): ${esc(hlDate(p.nextDue))}` : ''}
        ${(_hl.me.modules || []).includes('mal') ? ` · <a href="#/plan/${esc(p.id)}">Utbildningsplan och måluppfyllelse</a>` : ''}</p></div>
      <div class="tw-actions">${d.canMark ? '<button class="btn" data-hl="done">Handledning utförd…</button>' : ''}</div></div>
    <div class="hl-layout"><div>${d.talks.length ? d.talks.map(talk).join('') : '<div class="card"><p class="muted" style="margin:0">Ingen handledning registrerad än.</p></div>'}</div>
      <aside class="card hl-guide-side"><h2>Samtalsstöd</h2><p class="hint" style="margin-top:0">Ämnen ur strukturerad ST-handledning, som vägledning inför samtalet.</p>${hlTopicsHtml()}</aside></div>`;
  root.onclick = async e => {
    const b = e.target.closest('[data-hl]'); if (!b) return;
    if (b.dataset.hl === 'done') return hlDoneDialog(d);
    const card = b.closest('.hl-talk');
    b.disabled = true;
    try {
      await api('/handledning/talks/' + encodeURIComponent(card.dataset.id), { method: 'PUT', body: { sharedNote: card.querySelector('.hl-shared').value, myNote: card.querySelector('.hl-mine').value } });
      toast('Anteckningarna är sparade.');
    } catch (err) { alert(err.message); }
    b.disabled = false;
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

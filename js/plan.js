// ── Individuell utbildningsplan (#/plan, #/plan/<userId>) ────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), isoWeek() och js/oversikt.js (OV_LABEL, ovCellText, weekShort).
// Global entry: renderPlan(root, userId) — userId "me" = egen plan. Flikar Översikt · Delmål · Historik (ui_forslag.md §7);
// utskriften tar Översikt och Delmål på A4 med sidhuvud och signaturrad.
//
// Ersätter per-person-flikarna i "Individuell Utbildningsplan Mora.xlsx": kraven per ST-år med status, delmålen i personens
// målbeskrivning med kopplade krav, och handledarens signering per delmål samt genomgång av planen. Utskrift via webbläsaren.
// Läsa: personen själv, handledare, studierektor, admin. Signera och markera genomgång: handledare och studierektor.

let _plan = null;

async function renderPlan(root, userId) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [me, data] = await Promise.all([api('/me'), api('/plan/' + encodeURIComponent(userId || 'me')).then(d => (ovMarkDue(d.cells), ovMarkDue(d.goals), d))]);
    setMenuForUser(me);
    _plan = { me, data, userId: userId || 'me', openGoal: null, tab: _plan?.userId === (userId || 'me') ? _plan.tab : 'oversikt' };
    drawPlan(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadPlan() {
  const y = window.scrollY;
  _plan.data = await api('/plan/' + encodeURIComponent(_plan.userId));
  ovMarkDue(_plan.data.cells); ovMarkDue(_plan.data.goals);
  drawPlan(el('view'));
  window.scrollTo(0, y);
}

const fmtMonth = iso => iso ? `${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '–';
const planChip = s => `<span class="pchip st-${s.status || 'none'}" title="${esc(OV_LABEL[s.status] || '')}">${esc(ovCellText(s) || '–')}</span>`;

const PLAN_TABS = [['oversikt', 'Översikt'], ['delmal', 'Delmål'], ['historik', 'Historik']];
const isDone = c => ['klart', 'tidigare'].includes(c?.status);
const planBar = (done, total, label) => {
  const pct = total ? Math.round(100 * done / total) : 0;
  return `<div class="pl-prog"><span class="pl-lbl">${label}</span><div class="pbar"><span style="width:${pct}%"></span></div><span class="pl-num">${done}/${total}</span></div>`;
};

function drawPlan(root) {
  const { data, me } = _plan;
  const p = data.person, tab = _plan.tab || 'oversikt';
  const yr = p.stMonths == null ? '' : ` · ST-år ${Math.floor(p.stMonths / 12) + 1}, månad ${p.stMonths} av 60`;
  const supNames = data.supervisors.map(s => s.displayName).join(', ');
  const pane = (k, html, cls = '') => `<section class="pl-pane${k === tab ? '' : ' pl-hide'}${cls}" data-pane="${k}">${html}</section>`;

  root.innerHTML = `
    <div class="print-only pl-printhead">
      <div><strong>Individuell utbildningsplan</strong> · ${esc(me.clinicName || state.clinicName || '')}</div>
      <div>${esc(p.displayName)} · Utskriven ${esc(data.today)}</div>
      <div>Handledare: ${esc(supNames || '–')}</div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h1 class="page" style="margin:0">Utbildningsplan · ${esc(p.displayName)}</h1>
        <button class="btn-ghost no-print" onclick="window.print()" title="Översikt och delmål på A4, med signaturrad">Skriv ut</button>
      </div>
      <p style="margin:8px 0 0">ST-start ${esc(fmtMonth(p.stStart))}${p.stEnd ? ` · ST-slut ${esc(fmtMonth(p.stEnd))}` : ''}${esc(yr)}</p>
      ${p.expectedEnd ? `<p style="margin:4px 0 0">Beräknat ST-slut: <strong>${esc(fmtMonth(p.expectedEnd))}</strong>
        <span class="muted">(5 år${p.leaveWeeks ? ` + ${p.leaveWeeks} veckors ledighet som förlänger` : ''})</span>${ovPassedEnd(p, data.today)
          ? ' <span class="pchip st-saknas" title="Beräknat ST-slut har passerats men inget ST-slut är angivet">Passerat — ange ST-slut</span>' : ''}</p>` : ''}
      <p style="margin:4px 0 0">Målbeskrivning: ${data.framework ? `<strong>${esc(data.framework.label)}</strong>${data.framework.fromClinic ? ' <span class="muted">(klinikens förval)</span>' : ''}` : '<span class="muted">ingen vald — sätts under ST-utbildning → Inställningar → ST-läkare och handledare</span>'}</p>
      <p style="margin:4px 0 0">Handledare: ${supNames ? esc(supNames) : '<span class="muted">ingen angiven</span>'}</p>
      <p style="margin:4px 0 0">Senast genomgången: ${p.reviewedAt ? `${esc(p.reviewedAt)}${p.reviewedByName ? ' av ' + esc(p.reviewedByName) : ''}` : '<span class="muted">–</span>'}
        · Nästa revidering: ${p.nextReview ? esc(p.nextReview) : '<span class="muted">–</span>'}</p>
      ${data.canSign ? `<div class="row no-print" style="margin-top:10px;gap:8px;align-items:flex-end">
        <div><label for="pl-next" style="margin-top:0">Nästa revidering</label><input type="date" id="pl-next" value="${esc(p.nextReview || '')}"></div>
        <button class="btn" onclick="markReviewed()">Markera genomgången idag</button></div>` : ''}
      <div class="status" id="pl-status"></div>
    </div>

    <nav class="subtabs no-print" aria-label="Flikar">${PLAN_TABS.map(([k, l]) => `<a href="#" data-tab="${k}"${k === tab ? ' class="active" aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${pane('oversikt', planOverview())}
    ${pane('delmal', planGoals())}
    ${pane('historik', planHistory(), ' no-print')}

    <div class="print-only pl-sign">
      <div><span>Datum</span></div><div><span>ST-läkare</span></div><div><span>Handledare</span></div><div><span>Studierektor</span></div>
    </div>`;
  root.querySelectorAll('[data-tab]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); _plan.tab = a.dataset.tab; drawPlan(root);
  }));
  root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', onPlanGoal));
  root.querySelectorAll('[data-pi="restore"]').forEach(b => b.addEventListener('click', () => savePlanItem(b.dataset.id, { removed: false })));
  if (_plan.data.canEditPlan) attachYearBoard(root.querySelector('[data-pane="oversikt"]'), {
    onMove: (id, y) => savePlanItem(id, { stYear: y || 0 }), onEdit: openPlanItemPanel });
}

// ── Personens plan: flytta, ta bort, tillbaka till mallen ────────────────
async function savePlanItem(requirementId, change) {
  try {
    await api(`/plan/${encodeURIComponent(_plan.userId)}/items`, { method: 'PUT', body: { requirementId, ...change } });
    el('sheet-root')?.remove();
    await reloadPlan();
    const r = [..._plan.data.requirements, ...(_plan.data.removedRequirements || [])].find(x => x.id === requirementId);
    toast(`${r ? r.name + ': ' : ''}${change.reset ? 'som mallen' : 'removed' in change ? (change.removed ? 'borttaget ur planen' : 'tillbaka i planen') : change.stYear ? 'år ' + change.stYear : 'inget år'}.`);
  } catch (err) { await reloadPlan().catch(() => {}); showStatus(el('pi-status'), err.message, false); }
}

function openPlanItemPanel(id) {
  const r = _plan.data.requirements.find(x => x.id === id);
  if (!r) return;
  const tmpl = r.personal ? r.templateYear : r.stYear;
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel" role="dialog" aria-label="Kravet i planen">
    <div class="sp-head"><h2 style="margin:0">${esc(r.category + ' ' + r.name)}</h2><button class="btn-ghost" onclick="el('sheet-root').remove()" aria-label="Stäng">✕</button></div>
    <div class="sp-body">
      <p style="margin:6px 0 0">${planChip(_plan.data.cells[r.id])} <span class="muted">Mallen: ${tmpl ? 'år ' + tmpl : 'inget år'}</span></p>
      <h3>ST-år i den här planen</h3>
      <div class="seg" id="pi-year">${[1, 2, 3, 4, 5, 6, 0].map(y => `<button type="button" data-y="${y}" class="${(r.stYear || 0) === y ? 'on' : ''}">${y || '–'}</button>`).join('')}</div>
      <p class="hint">Gäller bara den här planen. Klinikens mall ändras under ST-utbildning → Inställningar → Krav.</p>
      <div class="row" style="gap:8px;margin-top:14px">
        ${r.personal ? `<button class="btn-ghost" onclick="savePlanItem('${esc(r.id)}', { reset: true })">Som mallen</button>` : ''}
        <button class="btn-ghost" style="color:var(--danger);border-color:#e3b3ab" onclick="savePlanItem('${esc(r.id)}', { removed: true })">Ta bort ur planen</button>
      </div>
      <p class="hint">Borttagna krav räknas inte i förloppet eller måluppfyllelsen och kan läggas tillbaka.</p>
      <div class="status" id="pi-status"></div>
    </div></aside>`;
  root.addEventListener('click', e => { if (e.target === root) root.remove(); });
  root.querySelector('#pi-year').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return;
    savePlanItem(r.id, { stYear: Number(b.dataset.y) });
  });
  document.body.appendChild(root);
}

// Översikt: förlopp (obligatoriska krav per ST-år, delmål signerade) och kraven per ST-år med status.
function planOverview() {
  const { data, me } = _plan;
  const mand = data.requirements.filter(r => r.mandatory !== false);
  const years = [...new Set(mand.map(r => r.stYear || 0))].sort((a, b) => (a || 99) - (b || 99));
  const cur = data.person.stMonths == null ? null : Math.floor(data.person.stMonths / 12) + 1;
  const goals = data.goals || [];
  const rows = years.map(y => {
    const rs = mand.filter(r => (r.stYear || 0) === y);
    return planBar(rs.filter(r => isDone(data.cells[r.id])).length, rs.length, y ? `År ${y}${y === cur ? ' <span class="tagchip">nu</span>' : ''}` : 'Inget år');
  }).join('');
  const booked = mand.filter(r => data.cells[r.id]?.status === 'bokad').length;
  return `
    <div class="card">
      <h2>Förlopp</h2>
      ${mand.length ? `${planBar(mand.filter(r => isDone(data.cells[r.id])).length, mand.length, '<strong>Alla krav</strong>')}
        ${rows}${booked ? `<p class="hint" style="margin:4px 0 0">${booked} krav bokade i veckoschemat.</p>` : ''}` : '<p class="muted">Kliniken har inga obligatoriska krav inlagda.</p>'}
      ${goals.length ? `<div style="margin-top:10px">${planBar(goals.filter(g => g.signoff).length, goals.length, '<strong>Delmål signerade</strong>')}</div>` : ''}
      <p class="hint" style="margin:6px 0 0">Klara = klart eller tidigare. Valfria krav räknas inte.</p>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Per ST-år</h2>
        ${me.isDirector || me.isAdmin ? '<a class="btn-ghost no-print" href="#/st/krav" style="text-decoration:none">Ändra mallen</a>' : ''}</div>
      <p class="hint">${data.canEditPlan ? '<span class="no-print"><strong>Dra</strong> ett krav till ett annat år eller <strong>klicka</strong> för att flytta eller ta bort det — bara i den här planen, mallen ändras inte. </span>' : ''}Status per krav. * = valfritt.</p>
      ${yearBoardHtml(data.requirements, { editable: data.canEditPlan, add: false, status: r => planChip(data.cells[r.id]),
        detail: r => r.personal ? `<div class="yb-tags"><span title="Avviker från mallen">Egen plan · mall: ${r.templateYear ? 'år ' + r.templateYear : 'inget år'}</span></div>` : '' })}
      ${(data.removedRequirements || []).length ? `<details class="no-print" style="margin-top:12px"><summary style="cursor:pointer;font-weight:bold">Borttagna ur planen (${data.removedRequirements.length})</summary>
        <ul class="today-list">${data.removedRequirements.map(r => `<li>${esc(r.category)} <strong>${esc(r.name)}</strong>
          ${data.canEditPlan ? `<button type="button" class="link-btn" style="color:var(--interest)" data-pi="restore" data-id="${esc(r.id)}">Lägg tillbaka</button>` : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
}

function planGoals() {
  const { data } = _plan;
  const goals = data.goals || [];
  const goalRows = goals.map(g => {
    const open = _plan.openGoal === g.id;
    const sign = g.signoff
      ? `<span class="pchip st-klart">Signerat</span><br><span class="muted" style="font-size:12px">${esc(g.signoff.signedByName || '')} ${esc(String(g.signoff.signedAt).slice(0, 10))}</span>${data.canSign ? ` <button class="link-btn no-print" data-g="unsign" data-id="${esc(g.id)}">Ta bort</button>` : ''}`
      : (data.canSign ? `<button class="btn-ghost no-print" data-g="sign" data-id="${esc(g.id)}">Signera</button>` : '<span class="muted">–</span>');
    return `<tr>
      <th class="gcode">${esc(g.code)}</th>
      <td class="gtext"><button type="button" class="link-btn gtoggle" data-g="toggle" data-id="${esc(g.id)}" style="text-align:left;text-decoration:none;color:inherit"><span class="no-print">${esc(open || g.text.length < 110 ? g.text : g.text.slice(0, 105) + '…')}</span><span class="print-only">${esc(g.text)}</span></button></td>
      <td>${g.requirements.length ? g.requirements.map(r => `<span class="greq">${esc(r.name)} ${planChip(r.status)}</span>`).join(' ') : '<span class="muted">Inga krav kopplade</span>'}</td>
      <td style="text-align:center;white-space:nowrap">${g.total ? `${g.done}/${g.total}` : ''}</td>
      <td>${sign}</td>
    </tr>`;
  }).join('');
  return `
    <div class="card">
      <h2>Delmål${data.framework ? ' · ' + esc(data.framework.label) : ''}</h2>
      ${goals.length ? `${planBar(goals.filter(g => g.signoff).length, goals.length, 'Signerade')}
      <p class="hint">Underlaget per delmål: kopplade krav och hur många som är klara. Systemet bedömer inte om delmålet är uppfyllt — det gör handledaren${data.canSign ? ', som signerar här' : ''}. Tryck på texten för att visa hela.</p>
      <div class="sch-scroll"><table class="imp-table goals-table">
        <thead><tr><th>Delmål</th><th>Rubrik / kompetenskrav</th><th>Kopplade krav</th><th>Klara</th><th>Signering</th></tr></thead>
        <tbody>${goalRows}</tbody>
      </table></div>` : '<p class="muted">Ingen målbeskrivning vald.</p>'}
      ${data.framework ? `<p class="hint">Källa: <a href="${esc(data.framework.sourceUrl)}" target="_blank" rel="noopener">Socialstyrelsens målbeskrivning</a>.</p>` : ''}
      <div class="status" id="pl-gstatus"></div>
    </div>`;
}

// Historik: signeringar, genomgångar och status satt för hand, senaste först (backend: plan_events).
function planHistory() {
  const { data } = _plan;
  const goal = id => (data.goals || []).find(g => g.id === id), req = id => [...data.requirements, ...(data.removedRequirements || [])].find(r => r.id === id);
  const text = e => {
    const g = goal(e.goalId), r = req(e.requirementId);
    if (e.kind === 'item') return `<strong>${esc(r?.name || 'Borttaget krav')}</strong> i planen: ${esc(e.detail || '')}`;
    if (e.kind === 'sign') return `Delmål <strong>${esc(g?.code || '?')}</strong> signerat${e.detail ? ` · ${esc(e.detail)}` : ''}`;
    if (e.kind === 'unsign') return `Signeringen av delmål <strong>${esc(g?.code || '?')}</strong> togs bort`;
    if (e.kind === 'review') return `Planen genomgången${e.detail ? ` · nästa revidering ${esc(String(e.detail).slice(0, 10))}` : ''}`;
    return `<strong>${esc(r?.name || 'Borttaget krav')}</strong>: ${e.status ? esc(OV_LABEL[e.status] || e.status) : 'enligt veckoschemat'}${e.detail ? ` · ${esc(e.detail)}` : ''}`;
  };
  // Genomgångar från före historiken har bara datum (kl. 00:00) — visa då bara datumet.
  const when = at => {
    const d = new Date(at); if (isNaN(d)) return '';
    const t = d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });
    return t.endsWith(' 00:00') ? t.slice(0, -6) : t;
  };
  const h = data.history || [];
  return `<div class="card">
    <h2>Historik</h2>
    <p class="hint" style="margin-top:0">Signeringar, genomgångar, ändringar i planen och status som satts för hand. Bokningar i veckoschemat syns under Översikt.</p>
    ${h.length ? `<ul class="pl-hist">${h.map(e => `<li><span class="muted">${esc(when(e.at))}</span><span>${text(e)}</span><span class="muted">${esc(e.byName || '')}</span></li>`).join('')}</ul>`
      : '<p class="muted" style="margin:0">Inget har hänt i planen än.</p>'}
  </div>`;
}

async function onPlanGoal(e) {
  const kind = e.currentTarget.dataset.g, id = e.currentTarget.dataset.id;
  if (kind === 'toggle') { _plan.openGoal = _plan.openGoal === id ? null : id; drawPlan(el('view')); return; }
  const box = el('pl-gstatus');
  try {
    if (kind === 'unsign' && !confirm('Ta bort signeringen av delmålet?')) return;
    await api(`/plan/${encodeURIComponent(_plan.userId)}/signoff`, { method: 'PUT', body: { goalId: id, signed: kind === 'sign' } });
    await reloadPlan();
  } catch (err) { box.textContent = err.message; box.className = 'status err'; }
}

async function markReviewed() {
  const box = el('pl-status');
  try {
    await api(`/plan/${encodeURIComponent(_plan.userId)}/review`, { method: 'PUT', body: { nextReview: el('pl-next').value || null } });
    await reloadPlan();
  } catch (err) { box.textContent = err.message; box.className = 'status err'; }
}

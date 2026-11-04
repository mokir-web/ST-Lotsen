// ── Individuell utbildningsplan (#/plan, #/plan/<userId>) ────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), isoWeek() och js/oversikt.js (OV_LABEL, ovCellText, weekShort).
// Global entry: renderPlan(root, userId) — userId "me" = egen plan.
//
// Ersätter per-person-flikarna i "Individuell Utbildningsplan Mora.xlsx": kraven per ST-år med status, delmålen i personens
// målbeskrivning med kopplade krav, och handledarens signering per delmål samt genomgång av planen. Utskrift via webbläsaren.
// Läsa: personen själv, handledare, studierektor, admin. Signera och markera genomgång: handledare och studierektor.

let _plan = null;

async function renderPlan(root, userId) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const [me, data] = await Promise.all([api('/me'), api('/plan/' + encodeURIComponent(userId || 'me'))]);
    setMenuForUser(me);
    _plan = { me, data, userId: userId || 'me', openGoal: null };
    drawPlan(root);
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

async function reloadPlan() {
  const y = window.scrollY;
  _plan.data = await api('/plan/' + encodeURIComponent(_plan.userId));
  drawPlan(el('view'));
  window.scrollTo(0, y);
}

const fmtMonth = iso => iso ? `${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '–';
const planChip = s => `<span class="pchip st-${s.status || 'none'}" title="${esc(OV_LABEL[s.status] || '')}">${esc(ovCellText(s) || '–')}</span>`;

function drawPlan(root) {
  const { data } = _plan;
  const p = data.person;
  const yr = p.stMonths == null ? '' : ` · ST-år ${Math.floor(p.stMonths / 12) + 1}, månad ${p.stMonths}`;

  const goals = data.goals || [];
  const goalRows = goals.map(g => {
    const open = _plan.openGoal === g.id;
    const sign = g.signoff
      ? `<span class="pchip st-klart">Signerat</span><br><span class="muted" style="font-size:12px">${esc(g.signoff.signedByName || '')} ${esc(String(g.signoff.signedAt).slice(0, 10))}</span>${data.canSign ? ` <button class="link-btn no-print" data-g="unsign" data-id="${esc(g.id)}">Ta bort</button>` : ''}`
      : (data.canSign ? `<button class="btn-ghost no-print" data-g="sign" data-id="${esc(g.id)}">Signera</button>` : '<span class="muted">–</span>');
    return `<tr>
      <th class="gcode">${esc(g.code)}</th>
      <td class="gtext"><button type="button" class="link-btn gtoggle" data-g="toggle" data-id="${esc(g.id)}" style="text-align:left;text-decoration:none;color:inherit">${esc(open || g.text.length < 110 ? g.text : g.text.slice(0, 105) + '…')}</button></td>
      <td>${g.requirements.length ? g.requirements.map(r => `<span class="greq">${esc(r.name)} ${planChip(r.status)}</span>`).join(' ') : '<span class="muted">Inga krav kopplade</span>'}</td>
      <td style="text-align:center;white-space:nowrap">${g.total ? `${g.done}/${g.total}` : ''}</td>
      <td>${sign}</td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h1 class="page" style="margin:0">Utbildningsplan · ${esc(p.displayName)}</h1>
        <button class="btn-ghost no-print" onclick="window.print()">Skriv ut</button>
      </div>
      <p style="margin:8px 0 0">ST-start ${esc(fmtMonth(p.stStart))}${p.stEnd ? ` · ST-slut ${esc(fmtMonth(p.stEnd))}` : ''}${esc(yr)}</p>
      <p style="margin:4px 0 0">Målbeskrivning: ${data.framework ? `<strong>${esc(data.framework.label)}</strong>${data.framework.fromClinic ? ' <span class="muted">(klinikens förval)</span>' : ''}` : '<span class="muted">ingen vald — sätts under Administration eller ST-utbildning → Inställningar</span>'}</p>
      <p style="margin:4px 0 0">Handledare: ${data.supervisors.length ? data.supervisors.map(s => esc(s.displayName)).join(', ') : '<span class="muted">ingen angiven</span>'}</p>
      <p style="margin:4px 0 0">Senast genomgången: ${p.reviewedAt ? `${esc(p.reviewedAt)}${p.reviewedByName ? ' av ' + esc(p.reviewedByName) : ''}` : '<span class="muted">–</span>'}
        · Nästa revidering: ${p.nextReview ? esc(p.nextReview) : '<span class="muted">–</span>'}</p>
      ${data.canSign ? `<div class="row no-print" style="margin-top:10px;gap:8px;align-items:flex-end">
        <div><label for="pl-next" style="margin-top:0">Nästa revidering</label><input type="date" id="pl-next" value="${esc(p.nextReview || '')}"></div>
        <button class="btn" onclick="markReviewed()">Markera genomgången idag</button></div>` : ''}
      <div class="status" id="pl-status"></div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Per ST-år</h2>
        ${_plan.me.isDirector || _plan.me.isAdmin ? '<a class="btn-ghost no-print" href="#/st/krav" style="text-decoration:none">Ändra mallen</a>' : ''}</div>
      <p class="hint">Kraven enligt klinikens mall, med status. * = valfritt.</p>
      ${yearBoardHtml(data.requirements, { status: r => planChip(data.cells[r.id]) })}
    </div>

    <div class="card">
      <h2>Delmål${data.framework ? ' · ' + esc(data.framework.label) : ''}</h2>
      ${goals.length ? `<p class="hint" style="margin-top:0">Underlaget per delmål: kopplade krav och hur många som är klara. Systemet bedömer inte om delmålet är uppfyllt — det gör handledaren${data.canSign ? ', som signerar här' : ''}. Tryck på texten för att visa hela.</p>
      <div class="sch-scroll"><table class="imp-table goals-table">
        <thead><tr><th>Delmål</th><th>Rubrik / kompetenskrav</th><th>Kopplade krav</th><th>Klara</th><th>Signering</th></tr></thead>
        <tbody>${goalRows}</tbody>
      </table></div>` : '<p class="muted">Ingen målbeskrivning vald.</p>'}
      ${data.framework ? `<p class="hint">Källa: <a href="${esc(data.framework.sourceUrl)}" target="_blank" rel="noopener">Socialstyrelsens målbeskrivning</a>.</p>` : ''}
      <div class="status" id="pl-gstatus"></div>
    </div>`;
  root.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', onPlanGoal));
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

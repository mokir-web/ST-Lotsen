// ── Visningsvy (EN sida, read-only) ──────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), state, buildCalendar().
// Global entry: renderDisplay(root). Auto-uppdaterar var 60:e sekund.
// Prioritet: bokning > intresserade > reserv.

let _displayTimer = null;

async function renderDisplay(root) {
  await drawDisplay(root);
  clearInterval(_displayTimer);
  _displayTimer = setInterval(() => drawDisplay(root), 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) drawDisplay(root);
  });
}

async function drawDisplay(root) {
  let cal;
  try {
    cal = await api('/calendar');
  } catch (err) {
    if (!root.dataset.loaded) root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
    return;
  }
  root.dataset.loaded = '1';

  // Passet (inte kalenderdygnet) styr rutan: före jourbytestiden pågår fortfarande gårdagens pass.
  const ints = (cal.interestsByDate && cal.interestsByDate[cal.shiftISO]) || [];
  const head = `<div class="label shift">Opjour ${shiftSpan(cal.shiftISO)}</div>`;
  let banner;
  if (cal.opjourToday) {
    banner = head + `<div class="name">${esc(cal.opjourToday.displayName)}</div>`
           + (cal.opjourToday.phone ? `<div class="phone-big">${phoneLink(cal.opjourToday.phone)}</div>` : '');
  } else if (ints.length) {
    banner = head + `<div class="sub">Ingen uppskriven — intresserade</div>
      <ul class="plist">${ints.map(i => `<li>${personLine(i.displayName, i.phone)}</li>`).join('')}</ul>`;
  } else if (cal.reservesToday.length) {
    banner = head + `<div class="sub">Ingen uppskriven — reserv</div>
      <ul class="plist">${cal.reservesToday.map((r, i) => `<li>${personLine(r.displayName, r.phone, `${i + 1}. `)}</li>`).join('')}</ul>`;
  } else {
    banner = head + `<div class="name" style="font-size:24px;color:var(--ink-soft)">Ingen uppskriven</div>`;
  }
  const at = esc(String(cal.shiftChange).replace(':', '.'));
  const nx = cal.nextShift;
  if (nx) {
    const span = shiftSpan(nx.date), when = nx.date === cal.todayISO ? 'i dag' : 'i morgon';
    banner += `<div class="nextshift"><div class="nl">Nästa pass</div>
      <div class="nn${nx.displayName ? '' : ' none'}">${span[0].toUpperCase() + span.slice(1)} · ${nx.displayName ? esc(nx.displayName) : 'ingen uppskriven än'}</div>
      <div class="ns">Byte ${when} kl. ${at}</div></div>`;
  } else {
    banner += `<div class="shiftnote">Byte kl. ${at}</div>`;
  }

  root.innerHTML = `
    <div class="card big-today">${banner}
      <div class="muted" style="margin-top:12px;font-size:13px">${esc(cal.clinicName)} · ${cal.todayISO}</div>
    </div>
    <div class="card">
      ${buildCalendar(cal, { interactive: false })}
    </div>
  `;
}

// "mån–tis": passets startdag och dagen efter (ett pass går från jourbytestiden till samma tid nästa dygn).
const SV_DAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
function shiftSpan(iso) {
  const dow = d => SV_DAYS_SHORT[new Date(d + 'T12:00:00Z').getUTCDay()];
  return `${dow(iso)}–${dow(addDaysISO(iso, 1))}`;
}

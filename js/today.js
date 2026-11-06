// ── Startsidan "Idag" (#/) ───────────────────────────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), todayStockholm(), mondayOfISO(), addDaysISO(),
// isoWeek(), fmtDM(), fmtDateLong() och js/oversikt.js (OV_LABEL). Global entry: renderToday(root).
//
// Det viktigaste ur alla moduler på ett ställe (ui_forslag.md §1, S2): att göra (studierektor, handledare, global admin),
// dagens opjour och mina pass, min vecka och kommande i veckoschemat, bemanningen i ST-gruppen och mitt förlopp.
// Varje kort hämtar sin egen data; går en hämtning fel visas bara det kortet som tomt.

async function renderToday(root) {
  root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    const mods = me.modules || ['opjour'], today = todayStockholm(), monday = mondayOfISO(today);
    const soft = p => p ? p.catch(() => null) : Promise.resolve(null);
    const dopsOn = mods.includes('dops') && me.dopsUser;
    const [cal, sch, plan, todo, dops, dopsRec, dopsSent] = await Promise.all([
      soft(mods.includes('opjour') ? api(`/calendar?start=${monday}&weeks=1`) : null),
      soft(mods.includes('schema') && (me.isSt || me.isDirector || me.isAdmin) ? api(`/schema?from=${monday}&weeks=12`) : null),
      soft(mods.includes('mal') && me.isSt ? api('/plan/me') : null),
      soft(api('/today/todo')),
      soft(dopsOn ? api('/dops/app/overview') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=received') : null),
      soft(dopsOn ? api('/dops/app/assessments/mine?role=sent') : null)
    ]);
    drawToday(root, { me, mods, today, cal, sch, plan, todo, dops, dopsRec, dopsSent });
  } catch (err) {
    root.innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: 'numeric' }).format(new Date()));
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
}

function drawToday(root, d) {
  const { me, today } = d;
  const first = (me.displayName || '').split(' ')[0];
  const cards = [todoCard(d), opjourCard(d), myWeekCard(d), staffingCard(d), progressCard(d), stYearCard(d), todayDopsCard(d)].filter(Boolean);
  root.innerHTML = `
    <h1 class="page" style="margin-bottom:2px">${greeting()}${first ? ', ' + esc(first) : ''}</h1>
    <p class="muted" style="margin:0 0 14px">${esc(fmtDateLong(today))} · vecka ${isoWeek(today)}</p>
    <div class="today-grid">${cards.join('') || '<div class="card"><p class="muted" style="margin:0">Inget att visa här än.</p></div>'}</div>`;
}

const todayCard = (title, body, link) => `<div class="card today-card"><h2>${title}</h2>${body}${link ? `<p style="margin:10px 0 0"><a href="${link[0]}">${link[1]} →</a></p>` : ''}</div>`;

// Att göra: bara för den som har något att ta hand om (studierektor/admin, handledare, global admin).
function todoCard({ me, todo }) {
  const items = todo?.items || [];
  if (!items.length && !(me.isDirector || me.isAdmin || me.isSupervisor)) return '';
  return todayCard('Att göra', items.length
    ? `<ul class="todo">${items.map(i => `<li>${i.href ? `<a href="${esc(i.href)}">${esc(i.text)}</a>` : `<strong>${esc(i.text)}</strong>`}${i.names ? `<br><span class="muted" style="font-size:13px">${esc(i.names.join(', '))}</span>` : ''}</li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Inget att göra just nu.</p>');
}

function opjourCard({ me, cal }) {
  if (!cal) return '';
  const t = cal.opjourToday, mine = t && t.userId === me.userId;
  const who = t ? `<div class="big-name">${esc(t.displayName)}${mine ? ' <span class="tagchip admin">Du</span>' : ''}</div>`
    : cal.reservesToday?.length ? `<div class="big-name muted">Ingen bokad</div><p class="hint" style="margin:2px 0 0">Reserver: ${cal.reservesToday.map(r => esc(r.displayName)).join(', ')}</p>`
    : '<div class="big-name muted">Ingen bokad</div>';
  const next = cal.nextShift ? `<p style="margin:8px 0 0">I morgon: ${cal.nextShift.displayName ? `<strong>${esc(cal.nextShift.displayName)}</strong>` : '<span class="muted">ledigt</span>'}</p>` : '';
  const up = (me.upcoming || []).slice(0, 4);
  const mineList = `<p style="margin:8px 0 0">Dina pass: ${up.length ? up.map(u => esc(fmtDateLong(u.serviceDate))).join(', ') : '<span class="muted">inga bokade</span>'}</p>`;
  return todayCard(`Opjour ${cal.shiftISO && cal.shiftISO !== cal.todayISO ? '(pågående pass)' : 'idag'}`, who + next + mineList, ['#/kalender', 'Till kalendern']);
}

// Mina aktiviteter i veckoschemat: den här veckan och det som kommer (ST-läkare).
function myWeekCard({ me, sch }) {
  if (!sch || !me.isSt) return '';
  const type = id => sch.types.find(t => t.id === id), req = id => sch.requirements.find(r => r.id === id);
  const label = a => { const t = type(a.typeId), r = a.requirementId ? req(a.requirementId) : null;
    return (r ? `${t ? t.code + ': ' : ''}${r.name}` : (t ? t.code : '?')) + (a.detail ? ` · ${a.detail}` : ''); };
  const chip = a => `<span class="sact${a.status === 'ev' ? ' ev' : ''}" style="--c:${esc(type(a.typeId)?.color || '#9aa5ad')}">${a.status === 'ev' ? 'Ev. ' : ''}${esc(label(a))}</span>`;
  const mine = sch.activities.filter(a => a.userId === me.userId).sort((a, b) => a.weekFrom.localeCompare(b.weekFrom));
  const now = mine.filter(a => a.weekFrom <= sch.thisMonday && a.weekTo >= sch.thisMonday);
  const later = mine.filter(a => a.weekFrom > sch.thisMonday).slice(0, 5);
  const wk = a => a.weekFrom === a.weekTo ? `v${isoWeek(a.weekFrom)}` : `v${isoWeek(a.weekFrom)}–${isoWeek(a.weekTo)}`;
  const inService = sch.inServiceByPerson?.[me.userId]?.[sch.thisMonday];
  return todayCard('Min vecka', `
    <p style="margin:0">${now.length ? now.map(a => chip(a) + (a.weekTo > sch.thisMonday ? ` <span class="muted" style="font-size:14px">t.o.m. v${isoWeek(a.weekTo)}</span>` : '')).join(' ') : '<span class="muted">Inget inlagt den här veckan</span>'}
      ${inService === false ? ' <span class="tagchip">ej i tjänst</span>' : ''}</p>
    <h3 class="today-sub">Kommande</h3>
    ${later.length ? `<ul class="today-list">${later.map(a => `<li><span class="muted">${wk(a)}</span> ${chip(a)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Inget planerat de närmaste veckorna.</p>'}`,
    ['#/schema', 'Veckoschemat']);
}

// Bemanningen i ST-gruppen de närmaste veckorna (studierektor/admin).
function staffingCard({ me, sch }) {
  if (!sch || !(me.isDirector || me.isAdmin)) return '';
  const weeks = sch.window.weeks.slice(0, 6);
  const low = w => sch.minInService != null && sch.inService[w] < sch.minInService;
  const lows = weeks.filter(low);
  return todayCard('I tjänst', `<div class="staff-row">${weeks.map(w => `<div class="${[w === sch.thisMonday ? 'cur' : '', low(w) ? 'low' : ''].join(' ')}"><span>v${isoWeek(w)}</span><strong>${sch.inService[w] ?? '–'}</strong></div>`).join('')}</div>
    <p class="hint" style="margin:6px 0 0">${lows.length ? `<strong style="color:var(--danger)">Under ${sch.minInService} i tjänst vecka ${lows.map(w => isoWeek(w)).join(', ')}.</strong> ` : ''}Antal ST-läkare i tjänst per vecka enligt veckoschemat${sch.minInService != null ? ` (minst ${sch.minInService})` : ''}.</p>`, ['#/schema', 'Veckoschemat']);
}

// Mitt förlopp: obligatoriska krav klara och delmål vars kopplade krav är klara (ST-läkare).
function progressCard({ plan }) {
  if (!plan) return '';
  const reqs = plan.requirements.filter(r => r.mandatory !== false);
  const st = r => plan.cells[r.id]?.status;
  const done = reqs.filter(r => ['klart', 'tidigare'].includes(st(r))).length, booked = reqs.filter(r => ['bokad', 'pagaende'].includes(st(r))).length;
  const goals = (plan.goals || []).filter(g => g.total), covered = goals.filter(g => g.done === g.total).length;
  const pct = reqs.length ? Math.round(100 * done / reqs.length) : 0;
  const p = plan.person;
  return todayCard('Mitt förlopp', `
    <div class="pbar"><span style="width:${pct}%"></span></div>
    <p style="margin:6px 0 0"><strong>${done} av ${reqs.length}</strong> obligatoriska krav klara${booked ? ` · ${booked} pågående/bokade` : ''}</p>
    ${goals.length ? `<p style="margin:4px 0 0">${covered} av ${goals.length} delmål med alla kopplade krav klara</p>` : ''}
    ${p.stMonths != null ? `<p class="muted" style="margin:4px 0 0">ST-år ${Math.floor(p.stMonths / 12) + 1}, månad ${p.stMonths} av 60${p.expectedEnd ? ` · beräknat klar ${esc(fmtMonth(p.expectedEnd))}` : ''}</p>` : ''}`,
    ['#/plan', 'Min utbildningsplan']);
}

// Kvar under innevarande ST-år enligt den individuella utbildningsplanen (ST-läkare). Krav från tidigare ST-år som inte är klara
// visas först som försenade. Slutet på ST-året räknas bakåt från beräknat ST-slut (som tar hänsyn till förlängande ledighet).
function stYearCard({ plan }) {
  if (!plan || plan.person.stMonths == null || plan.person.stEnd) return '';
  const p = plan.person, year = Math.floor(p.stMonths / 12) + 1;
  if (year > 5) return '';
  const st = r => plan.cells[r.id] || {};
  const open = r => !['klart', 'tidigare', 'ej'].includes(st(r).status);
  const now = plan.requirements.filter(r => r.stYear === year && open(r));
  const late = plan.requirements.filter(r => r.stYear && r.stYear < year && r.mandatory !== false && open(r));
  const all = plan.requirements.filter(r => r.stYear === year);
  const yearEnd = p.expectedEnd ? addMonthsISO(p.expectedEnd, -12 * (5 - year)) : null;
  const shown = r => st(r).status === 'saknas' ? 'ejgjort' : st(r).status;   // innevarande år: inte gjort än, inte försenat
  const row = r => `<li><span class="pchip st-${shown(r) || 'ejgjort'}">${esc(OV_LABEL[shown(r)] || 'Ej gjort')}</span> ${esc(r.name)}<span class="muted" style="font-size:13px">${r.mandatory === false ? ' · valfritt' : ''}${
    ['bokad', 'pagaende', 'forslag'].includes(st(r).status) ? ' · ' + esc(ovCellText(st(r))) : ''}</span></li>`;
  return todayCard(`Kvar under ST-år ${year}`, `
    <p class="muted" style="margin:0 0 6px">${all.length - now.length} av ${all.length} krav klara${yearEnd ? ` · ST-året slutar ca ${esc(fmtMonth(yearEnd))}` : ''}</p>
    ${late.length ? `<p class="yr-late"><strong>${late.length} krav från tidigare ST-år är inte klara:</strong> ${esc(late.slice(0, 6).map(r => r.name).join(', '))}${late.length > 6 ? ` och ${late.length - 6} till` : ''}.</p>` : ''}
    ${now.length ? `<ul class="today-list yr-list">${now.map(row).join('')}</ul>` : `<p style="margin:0">${all.length ? '✓ Allt för ST-år ' + year + ' är klart.' : 'Inga krav inlagda för ST-år ' + year + '.'}</p>`}`,
    ['#/plan', 'Min utbildningsplan']);
}
const addMonthsISO = (iso, n) => { const [y, m] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 10); };

// DOPS: total måluppfyllelse som en stapel (mottagna och registrerade senaste 6 månaderna mot klinikens mål, som DOPS → Översikt)
// och de fem senaste bedömningarna (mottagna och registrerade). Bara när modulen DOPS är på och kontot är kopplat.
function todayDopsCard({ dops, dopsRec, dopsSent }) {
  if (!dops) return '';
  const hidRec = new Set(dops.hiddenFormTypes?.received || []), hidSent = new Set(dops.hiddenFormTypes?.sent || []);
  const short = ft => ft.replace(/^DOPS:?\s*/, '');
  const goals = [
    ...Object.entries(dops.received || {}).filter(([ft, v]) => v.goal && !hidRec.has(ft)).map(([ft, v]) => ({ ft, n: (dops.received_6m || {})[ft] || 0, g: v.goal })),
    ...Object.entries(dops.sent || {}).filter(([ft, v]) => v.sentGoal && !hidSent.has(ft)).map(([ft, v]) => ({ ft, n: (dops.sent_6m || {})[ft] || 0, g: v.sentGoal }))
  ];
  const sum = goals.reduce((s, x) => s + x.g, 0), got = goals.reduce((s, x) => s + Math.min(x.n, x.g), 0);
  const pct = sum ? Math.round(100 * got / sum) : 0, met = goals.filter(x => x.n >= x.g).length;
  const tone = pct >= 100 ? '#4a9e62' : pct >= 50 ? '#d9a441' : '#c0392b';
  const latest = [...(dopsRec || []).map(a => ({ ...a, dir: 'in' })), ...(dopsSent || []).map(a => ({ ...a, dir: 'ut' }))]
    .filter(a => !a.isAiDemo).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);
  const who = a => a.dir === 'in' ? 'från ' + a.registrar : 'till ' + a.recipient.replace(/ -- .*$/, '');
  const goalBar = goals.length ? `
    <div class="dg-head"><span>Måluppfyllelse senaste 6 mån</span><strong style="color:${tone}">${pct} %</strong></div>
    <div class="dg-track" role="img" aria-label="${pct} procent av målen"><i style="width:${Math.min(100, pct)}%;background:${tone}"></i></div>
    <p class="muted" style="margin:4px 0 0;font-size:13px">${met} av ${goals.length} mål uppnådda · ${got} av ${sum} bedömningar</p>`
    : '<p class="muted" style="margin:0">Kliniken har inga mål för dina formulär.</p>';
  const list = latest.length ? `<ul class="today-list dg-list">${latest.map(a => `<li><span class="dg-dir ${a.dir}" title="${a.dir === 'in' ? 'Mottagen' : 'Registrerad av dig'}">${a.dir === 'in' ? '↓' : '↑'}</span>
      <span><strong>${esc(short(a.formType))}</strong><br><span class="muted" style="font-size:13px">${esc(who(a))} · ${esc(fmtDM(a.timestamp.slice(0, 10)))}</span></span></li>`).join('')}</ul>`
    : '<p class="muted" style="margin:0">Inga bedömningar än.</p>';
  return todayCard('DOPS', goalBar + '<h3 class="today-sub">Senaste bedömningar</h3>' + list, ['#/dops', 'Till DOPS']);
}

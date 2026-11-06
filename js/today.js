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
    const [cal, sch, plan, todo, dops] = await Promise.all([
      soft(mods.includes('opjour') ? api(`/calendar?start=${monday}&weeks=1`) : null),
      soft(mods.includes('schema') && (me.isSt || me.isDirector || me.isAdmin) ? api(`/schema?from=${monday}&weeks=12`) : null),
      soft(mods.includes('mal') && me.isSt ? api('/plan/me') : null),
      soft(api('/today/todo')),
      soft(mods.includes('dops') && me.dopsUser ? api('/dops/app/overview') : null)
    ]);
    drawToday(root, { me, mods, today, cal, sch, plan, todo, dops });
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
  const cards = [todoCard(d), opjourCard(d), myWeekCard(d), staffingCard(d), progressCard(d), todayDopsCard(d)].filter(Boolean);
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
  const done = reqs.filter(r => ['klart', 'tidigare'].includes(st(r))).length, booked = reqs.filter(r => st(r) === 'bokad').length;
  const goals = (plan.goals || []).filter(g => g.total), covered = goals.filter(g => g.done === g.total).length;
  const pct = reqs.length ? Math.round(100 * done / reqs.length) : 0;
  const p = plan.person;
  return todayCard('Mitt förlopp', `
    <div class="pbar"><span style="width:${pct}%"></span></div>
    <p style="margin:6px 0 0"><strong>${done} av ${reqs.length}</strong> obligatoriska krav klara${booked ? ` · ${booked} bokade` : ''}</p>
    ${goals.length ? `<p style="margin:4px 0 0">${covered} av ${goals.length} delmål med alla kopplade krav klara</p>` : ''}
    ${p.stMonths != null ? `<p class="muted" style="margin:4px 0 0">ST-år ${Math.floor(p.stMonths / 12) + 1}, månad ${p.stMonths} av 60${p.expectedEnd ? ` · beräknat klar ${esc(fmtMonth(p.expectedEnd))}` : ''}</p>` : ''}`,
    ['#/plan', 'Min utbildningsplan']);
}

// DOPS: mottagna bedömningar senaste 6 månaderna mot klinikens mål (som DOPS → Översikt). Lägst måluppfyllelse först; utan mål
// visas antalet. Bara när modulen DOPS är på och kontot är kopplat.
function todayDopsCard({ dops }) {
  if (!dops) return '';
  const hidden = new Set(dops.hiddenFormTypes?.received || []);
  const rec6 = dops.received_6m || {};
  const goals = Object.entries(dops.received || {}).filter(([ft, v]) => v.goal && !hidden.has(ft))
    .map(([ft, v]) => ({ ft: ft.replace(/^DOPS:?\s*/, ''), n: rec6[ft] || 0, g: v.goal })).sort((a, b) => a.n / a.g - b.n / b.g);
  const total = Object.values(rec6).reduce((s, n) => s + n, 0);
  const met = goals.filter(x => x.n >= x.g).length;
  const color = x => x.n >= x.g ? '#4a9e62' : x.n > 0 ? '#d9a441' : '#c0392b';
  const body = goals.length
    ? `<p style="margin:0 0 6px"><strong>${met} av ${goals.length}</strong> mål uppnådda · ${total} mottagna senaste 6 mån</p>
      ${goals.slice(0, 5).map(x => `<div class="dov-row" style="grid-template-columns:1fr 1fr 44px"><span class="dov-name">${esc(x.ft)}</span>
        <span class="dov-track"><i style="width:${Math.min(100, Math.round(x.n / x.g * 100))}%;background:${color(x)}"></i></span><strong class="dov-n">${x.n}/${x.g}</strong></div>`).join('')}
      ${goals.length > 5 ? `<p class="muted" style="margin:4px 0 0;font-size:13px">och ${goals.length - 5} till</p>` : ''}`
    : `<p style="margin:0"><strong>${total}</strong> mottagna bedömningar senaste 6 månaderna.</p>`;
  return todayCard('DOPS', body, ['#/dops', 'Till DOPS']);
}

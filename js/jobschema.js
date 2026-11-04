// ── Import av jobbschemat (export från schemasystemet, .xlsx) → veckoschemat ──────────────
// Klassiskt script utan beroenden; fungerar även i Node (tester). Filen läses i webbläsaren med OpjourImport.readTable —
// bara de färdiga veckoposterna skickas till servern (POST /schema/import).
//
// Filens format: rad 1 = rubriker ("Måndag \n 14 sep", en kolumn per dag), kolumn A = namn. Rader som börjar med ":" är
// gruppnamn (": ST-läkare kirurgi"). Varje cell har en rad per aktivitet: "◼ Randning 07:30-16:00", "Övrig frånvaro 12:13-16:00".
// Aktivitetens kod = texten utan ◼, tider och avslutande punkt ("Föräldraledig." = "Föräldraledig").
//
// Veckoschemat är per vecka. En kod blir en post för veckan när den förekommer minst minDays dagar (mån–sön) — t.ex.
// Randning 5 dagar → Rand den veckan, Nattjour 3 nätter → Natt. Koderna översätts till klinikens aktivitetstyper med en
// mappning som studierektorn ställer in (sparas per klinik); veckor i följd med samma översättning blir en post.
(function (root) {
  'use strict';

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
  const WEEKDAYS = { söndag: 0, måndag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lördag: 6 };
  const iso = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const mondayOf = s => addDays(s, -((new Date(s + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

  // "Måndag \n 14 sep" → { weekday: 1, day: 14, month: 8 } eller null.
  function parseHeader(s) {
    const m = clean(s).toLowerCase().match(/^([a-zåäö]+)\s+(\d{1,2})\s+([a-zåäö]{3})/);
    if (!m || !(m[1] in WEEKDAYS) || !(m[3] in MONTHS)) return null;
    return { weekday: WEEKDAYS[m[1]], day: Number(m[2]), month: MONTHS[m[3]] };
  }

  // Året står inte i rubrikerna. Först filnamnet ("… 2026-09-14-2027-01-11.xlsx"); annars det år nära idag där veckodagen stämmer.
  function firstDate(h, today, fileName) {
    const f = String(fileName || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (f && Number(f[2]) - 1 === h.month && Number(f[3]) === h.day) return `${f[1]}-${f[2]}-${f[3]}`;
    const ty = Number(today.slice(0, 4));
    const cands = [ty - 1, ty, ty + 1].map(y => iso(new Date(Date.UTC(y, h.month, h.day, 12))))
      .filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === h.weekday)
      .sort((a, b) => Math.abs(new Date(a) - new Date(today)) - Math.abs(new Date(b) - new Date(today)));
    if (!cands.length) throw new Error('Kan inte avgöra vilket år schemat gäller (veckodag och datum stämmer inte).');
    return cands[0];
  }

  // Aktivitetskod ur en rad i en cell. '' = ingen aktivitet (tom rad eller bara en tid).
  function codeOf(line) {
    let l = String(line).replace(/^\s*◼\s*/, '').trim();
    l = l.replace(/\s+\(?(\d{1,2}[:.]\d{2}|xx)\)?\s*-\s*\(?(\d{1,2}[:.]\d{2}|xx)\)?.*$/i, '').trim();
    if (/^[\d:.\s()-]*$/.test(l)) return '';
    return l.replace(/\.+$/, '').trim();
  }

  // Tabell (rader med celler, som OpjourImport.readTable ger) → { dates: [ISO per dagkolumn], people: [{ name, group, days: [[koder] per dag] }] }.
  function parseJobSchedule(table, { today, fileName } = {}) {
    const hIdx = table.findIndex(r => r.slice(1).filter(c => parseHeader(c)).length >= 7);
    if (hIdx < 0) throw new Error('Hittar ingen rubrikrad med dagar ("Måndag 14 sep" …). Är det rätt fil?');
    const heads = table[hIdx].slice(1).map(parseHeader);
    const n = heads.findIndex(h => !h) < 0 ? heads.length : heads.findIndex(h => !h);
    const start = firstDate(heads[0], today || iso(new Date()), fileName);
    const dates = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(start, i);
      if (Number(d.slice(8, 10)) !== heads[i].day) throw new Error('Kolumnerna går inte dag för dag — exportera schemat med en kolumn per dag.');
      dates.push(d);
    }
    const people = [];
    let group = '';
    for (const r of table.slice(hIdx + 1)) {
      const name = clean(r[0]);
      if (!name) continue;
      if (name.startsWith(':')) { group = clean(name.slice(1)); continue; }
      const days = dates.map((_, i) => [...new Set(String(r[i + 1] ?? '').split(/\r?\n/).map(codeOf).filter(Boolean))]);
      people.push({ name, group, days });
    }
    return { dates, people };
  }

  // ── Namn i filen → ST-läkare i appen ──────────────────────────────────────
  const fold = s => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, '');
  // users: [{ id, displayName }]. Exakt namn först; annars förnamn + efternamnets initial ("Sara E" ↔ "Sara Ezra") om det är
  // entydigt — men bara för rader i en ST-grupp (": ST-läkare kirurgi"), så att t.ex. en randande "Erik Bergqvist" inte blir "Erik B".
  const isStGroup = g => /(^|[^a-zåäö])st([^a-zåäö]|$)|st-läk/i.test(g || '');
  function matchPeople(people, users) {
    const short = s => { const t = fold(s).split(/[ -]+/); return t.length > 1 ? t[0] + ' ' + t[t.length - 1][0] : t[0]; };
    const exact = new Map(), byShort = new Map();
    for (const u of users) {
      exact.set(fold(u.displayName), u.id);
      const k = short(u.displayName); byShort.set(k, byShort.has(k) ? null : u.id);
    }
    const out = new Map();
    for (const p of people) {
      const id = exact.get(fold(p.name)) ?? (isStGroup(p.group) && fold(p.name).split(' ').length > 1 ? byShort.get(short(p.name)) : null);
      if (id) out.set(p.name, id);
    }
    return out;
  }

  // Koder hos de valda personerna: [{ code, days }] sorterade på antal dagar.
  function codeCounts(people) {
    const n = new Map();
    for (const p of people) for (const d of p.days) for (const c of d) n.set(c, (n.get(c) || 0) + 1);
    return [...n].map(([code, days]) => ({ code, days })).sort((a, b) => b.days - a.days || a.code.localeCompare(b.code, 'sv'));
  }

  // Förslag till översättning för en kod som inte finns i klinikens mappning. types: [{ id, code, label, active }],
  // requirements: [{ id, category, name, active }]. Returnerar { typeId, requirementId, minDays } eller null (ignoreras).
  const RULES = [
    [/^randning$/i, /^rand/i],
    [/^föräldraledig$/i, /^(fl|föräldraledig)/i],
    [/^tjänstledig/i, /^(tjl|tjänstledig)/i],
    [/^nattjour$/i, /^natt/i],
    [/^(utbildning|kurs)$/i, /^kurs/i],
    [/^idre$/i, /^idre/i],
    [/^fou$/i, /^fou/i],
    [/^(semester|sjukfrånvaro|sjuk|vab)$/i, /^(frv|frånvaro)/i],
    [/^urolog st$/i, /^rand/i, [/uro.*mora/i, /^uro/i]],
    [/^gastro$/i, /^körkort/i, [/^gastro/i]]
  ];
  function suggest(code, types, requirements) {
    for (const [re, typeRe, reqRe] of RULES) {
      if (!re.test(code)) continue;
      const t = types.find(x => x.active && (typeRe.test(x.code) || typeRe.test(x.label)));
      if (!t) return null;
      // Krav: första mönstret som ger träff; helst i en kategori som liknar typen (Körkort-typ → kategorin Körkort).
      const sameCat = x => /körkort/i.test(x.category) === /körkort/i.test(t.code + ' ' + t.label);
      let r = null;
      for (const re2 of reqRe || []) {
        const hits = requirements.filter(x => x.active && re2.test(x.name));
        r = hits.find(sameCat) || hits[0] || null;
        if (r) break;
      }
      return { typeId: t.id, requirementId: r ? r.id : null, minDays: 3 };
    }
    return null;
  }

  // Veckoposter för en person: [{ typeId, requirementId, weekFrom, weekTo, codes }]. map: { [kod]: { typeId, requirementId, minDays } }.
  // Koder med samma översättning räknas ihop (dagar där någon av dem finns); veckor i följd slås ihop.
  function proposals(person, dates, map) {
    const weeks = new Map();   // måndag → Map(målnyckel → { dagar: Set, min, codes: Set })
    dates.forEach((d, i) => {
      for (const c of person.days[i]) {
        const m = map[c];
        if (!m || !m.typeId) continue;
        const key = m.typeId + '|' + (m.requirementId || '');
        const w = mondayOf(d);
        if (!weeks.has(w)) weeks.set(w, new Map());
        const t = weeks.get(w);
        if (!t.has(key)) t.set(key, { days: new Set(), min: 7, codes: new Set() });
        const e = t.get(key);
        e.days.add(d); e.min = Math.min(e.min, m.minDays || 3); e.codes.add(c);
      }
    });
    const hits = [];   // { key, monday, codes }
    for (const [monday, t] of [...weeks].sort((a, b) => a[0].localeCompare(b[0])))
      for (const [key, e] of t) if (e.days.size >= e.min) hits.push({ key, monday, codes: e.codes });
    const out = [], open = new Map();
    for (const h of hits) {
      const cur = open.get(h.key);
      if (cur && addDays(cur.weekTo, 7) === h.monday) { cur.weekTo = h.monday; h.codes.forEach(c => cur.codes.add(c)); continue; }
      const [typeId, requirementId] = h.key.split('|');
      const p = { typeId, requirementId: requirementId || null, weekFrom: h.monday, weekTo: h.monday, codes: new Set(h.codes) };
      out.push(p); open.set(h.key, p);
    }
    return out.map(p => ({ ...p, codes: [...p.codes] }));
  }

  // Jämför ett förslag med personens befintliga poster, vecka för vecka. Veckor där en post med samma typ (och samma krav —
  // eller inget krav i förslaget) redan finns blir 'same'. Övriga veckor i följd blir delar av förslaget: 'conflict' om de
  // överlappar poster av annat slag (listas i `with`), annars 'new'. Returnerar [{ ...förslaget, weekFrom, weekTo, kind, with }].
  function compare(p, existing) {
    const covers = (a, w) => a.weekFrom <= w && a.weekTo >= w;
    const same = a => a.typeId === p.typeId && (!p.requirementId || a.requirementId === p.requirementId);
    // Varje vecka får en nyckel: 'same', eller vilka andra poster den krockar med ('' = ingen). Veckor i följd med samma nyckel = en del.
    const parts = [];
    for (let w = p.weekFrom; w <= p.weekTo; w = addDays(w, 7)) {
      const over = existing.filter(a => covers(a, w));
      const key = over.some(same) ? 'same' : over.map(a => a.id).sort().join(',');
      const last = parts[parts.length - 1];
      if (last && last.key === key) last.weekTo = w;
      else parts.push({ ...p, weekFrom: w, weekTo: w, key, with: key === 'same' ? [] : over });
    }
    return parts.map(({ key, ...x }) => ({ ...x, kind: key === 'same' ? 'same' : key ? 'conflict' : 'new' }));
  }

  const api = { isStGroup, parseHeader, codeOf, parseJobSchedule, matchPeople, codeCounts, suggest, proposals, compare, mondayOf, addDays };
  root.OpjourJobSchedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

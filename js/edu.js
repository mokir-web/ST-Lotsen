// ── Utbildningsmaterial (#/utbildning, #/utbildning/:områdesId, #/utbildning/forslag) ────────────────────────
// Klassiskt script. Beror på index.html: api(), esc(), el(), setMenuForUser(), fmtDM(), fmtDateLong(). Global entry: renderEdu(root, sub).
// Klinikens länksamling i områden (undermenyerna). Ett levande dokument: admin lägger till, ändrar, flyttar och tar bort direkt;
// alla andra föreslår ändringar som admin godkänner (gärna efter att ha justerat dem) eller avböjer med ett svar.
// Videolänkar (YouTube med spellistor, Vimeo, filer .mp4/.webm/.ogg) spelas upp direkt på sidan.
// 0.60.0: hela kortet är klickbart (område → öppnar området, post med länk → öppnar länken), markering "Bara på regionens nätverk",
// admin drar poster för att ändra ordning eller flytta till ett annat område, och hela materialet kan exporteras till och uppdateras
// från Excel (utils/eduImport.js i backend). Kurssläpp heter Påminnelse.

let _edu = null;

async function renderEdu(root, sub) {
  if (!_edu || _edu.root !== root) root.innerHTML = '<p class="muted">Laddar…</p>';
  try {
    const me = await api('/me');
    setMenuForUser(me);
    if (!(me.modules || []).includes('utbildning')) { root.innerHTML = '<h1 class="page">Utbildningsmaterial</h1><p class="muted">Modulen är inte påslagen för kliniken.</p>'; return; }
    const data = await api('/edu');
    _edu = { root, me, data, sub, playing: _edu?.playing || new Set() };
    drawEduNav();
    drawEdu();
  } catch (err) { root.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}
const eduReload = () => renderEdu(_edu.root, _edu.sub);

// Undermenyn: ett område per rad, sist förslagen (admin: väntande; övriga: egna).
function drawEduNav() {
  const { data } = _edu, g = el('sn-edu');
  const pend = data.suggestions.filter(s => s.status === 'pending').length;
  const mineN = data.suggestions.length;
  g.innerHTML = `<div class="sn-title">Utbildningsmaterial</div>
    <a href="#/utbildning" data-route="#/utbildning">Alla områden</a>
    ${data.sections.map(s => `<a href="#/utbildning/${esc(s.id)}" data-route="#/utbildning/${esc(s.id)}">${esc(s.title)}</a>`).join('')}
    ${data.canEdit || mineN ? `<a href="#/utbildning/forslag" data-route="#/utbildning/forslag">${data.canEdit ? 'Förslag' : 'Mina förslag'}${pend ? ` (${pend})` : ''}</a>` : ''}`;
  markNav(location.hash);
}

// Video: YouTube (även youtu.be, shorts och spellistor), Vimeo (även showcase) och videofiler.
// Returnerar { kind, src, list } eller null; list = true för en spellista.
function eduVideo(url) {
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1];
  }
  // Spellista: youtube.com/playlist?list=… eller en video i en spellista (watch?v=…&list=…), som då startar på den videon.
  const list = (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') && /^[\w-]{10,64}$/.test(u.searchParams.get('list') || '') ? u.searchParams.get('list') : null;
  const okId = id && /^[\w-]{6,20}$/.test(id) && id !== 'videoseries';
  if (okId || list) {
    const t = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '0', 10);
    const path = okId ? id : 'videoseries';
    return { kind: 'frame', list: !!list, src: `https://www.youtube-nocookie.com/embed/${path}?rel=0${list ? '&list=' + list : ''}${t ? '&start=' + t : ''}` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const sc = u.pathname.match(/^\/showcase\/(\d+)/);
    if (sc) return { kind: 'frame', list: true, src: `https://vimeo.com/showcase/${sc[1]}/embed` };
    const m = u.pathname.match(/(?:\/video)?\/(\d+)(?:\/([\da-f]+))?/);
    if (m) return { kind: 'frame', src: `https://player.vimeo.com/video/${m[1]}${m[2] ? '?h=' + m[2] : ''}` };
  }
  if (/\.(mp4|webm|ogg|ogv|m4v)$/i.test(u.pathname) && u.protocol === 'https:') return { kind: 'file', src: u.href };
  return null;
}
const eduHost = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// Beskrivningen: radbrytningar behålls och adresser blir länkar.
const eduText = t => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>');

function drawEdu() {
  const { root, sub, data } = _edu;
  if (sub === 'forslag') return drawEduSuggestions(root);
  const sec = sub ? data.sections.find(s => s.id === sub) : null;
  if (sub && !sec) { root.innerHTML = '<h1 class="page">Utbildningsmaterial</h1><p class="muted">Området finns inte längre. <a href="#/utbildning">Till alla områden</a></p>'; return; }
  root.innerHTML = sec ? eduSectionView(sec) : eduOverview();
  root.onclick = onEduClick;
  if (sec && data.canEdit) attachEduDnd(root, sec);
}

function eduOverview() {
  const { data } = _edu, edit = data.canEdit;
  const mine = data.suggestions.filter(s => s.status === 'pending' && !edit).length;
  return `<div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">Utbildningsmaterial</h1>
      <p class="muted" style="margin:0">Klinikens samling av bra material: artiklar, videor, kurser och annat som kollegor har hittat.</p></div>
      <div class="tw-actions">${_edu.me.isDisplay ? '' : edit ? `<button class="btn-ghost" data-e="xlsx-export" title="Hela materialet som ett kalkylark">Exportera till Excel</button>
        <button class="btn-ghost" data-e="xlsx-import">Uppdatera från Excel…</button>
        <button class="btn" data-e="add-section">+ Nytt område</button>` : '<button class="btn-ghost" data-e="add-section">Föreslå nytt område</button>'}</div></div>
    ${mine ? `<p class="hint">Du har ${mine} förslag som väntar på admin. <a href="#/utbildning/forslag">Visa</a></p>` : ''}
    ${data.sections.length ? `<div class="edu-grid">${data.sections.map((s, i) => `<div class="card edu-sec" data-sec="${esc(s.id)}">
        <h2><a href="#/utbildning/${esc(s.id)}">${esc(s.title)}</a></h2>
        ${s.intro ? `<p class="edu-intro">${eduText(s.intro)}</p>` : ''}
        <p class="muted" style="margin:0;font-size:14px">${s.items.length} ${s.items.length === 1 ? 'post' : 'poster'}${s.items.some(x => x.url && eduVideo(x.url)) ? ` · ${s.items.filter(x => x.url && eduVideo(x.url)).length} video` : ''}</p>
        ${edit ? `<div class="edu-tools"><button class="tw-ico" data-e="sec-up" data-id="${s.id}" title="Flytta upp"${i ? '' : ' disabled'}>↑</button><button class="tw-ico" data-e="sec-down" data-id="${s.id}" title="Flytta ner"${i < data.sections.length - 1 ? '' : ' disabled'}>↓</button></div>` : ''}
      </div>`).join('')}</div>`
      : `<div class="card"><p class="muted" style="margin:0">Inga områden än. ${edit ? 'Börja med <em>+ Nytt område</em>, till exempel "Laparoskopi" eller "Akut kirurgi".' : 'Föreslå gärna ett område och det första materialet.'}</p></div>`}`;
}

function eduSectionView(sec) {
  const { data, playing } = _edu, edit = data.canEdit;
  const pendFor = id => data.suggestions.filter(s => s.status === 'pending' && s.itemId === id).length;
  const item = (it, i) => {
    const v0 = it.url ? eduVideo(it.url) : null, v = it.embed === false ? null : v0, open = playing.has(it.id);
    return `<li class="edu-item${it.url ? ' edu-link' : ''}" id="edu-${it.id}" data-id="${it.id}"${it.url ? ` data-url="${esc(it.url)}"` : ''}${edit ? ' draggable="true"' : ''}>
      <div class="edu-main">
        <div class="edu-title">${v0 ? `<span class="edu-kind" title="${v0.list ? 'Spellista' : 'Video'}">${v0.list ? '☰' : '▶'}</span>` : it.url ? '<span class="edu-kind" title="Länk">🔗</span>' : '<span class="edu-kind" title="Text">📝</span>'}
          ${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a> <span class="muted edu-host">${esc(eduHost(it.url))}</span>` : `<strong>${esc(it.title)}</strong>`}${it.intranet ? ' ' + EDU_INTRA : ''}</div>
        ${it.note ? `<div class="edu-note">${eduText(it.note)}</div>` : ''}
        ${eduReleases(it)}
        ${v0 && !v ? `<div class="edu-note muted">Spelas på ${esc(eduHost(it.url))} (går inte att spela här).</div>` : ''}
        ${v ? `<button class="btn-ghost edu-play" data-e="play" data-id="${it.id}" aria-expanded="${open}">${open ? (v.list ? '■ Stäng spellistan' : '■ Stäng videon') : v.list ? '▶ Spela spellistan här' : '▶ Spela upp här'}</button>` : ''}
        ${v && open ? `<div class="edu-video">${v.kind === 'file' ? `<video src="${esc(v.src)}" controls preload="metadata"></video>`
          : `<iframe src="${esc(v.src)}" title="${esc(it.title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`}</div>` : ''}
        <div class="edu-meta muted">${it.byName ? `Tillagd av ${esc(it.byName)} · ` : ''}${esc(fmtDM(String(it.createdAt).slice(0, 10)))}${pendFor(it.id) && edit ? ` · <a href="#/utbildning/forslag">${pendFor(it.id)} förslag</a>` : ''}</div>
      </div>
      <div class="edu-tools">${_edu.me.isDisplay ? '' : edit
        ? `<button class="tw-ico" data-e="item-up" data-id="${it.id}" title="Flytta upp"${i ? '' : ' disabled'}>↑</button><button class="tw-ico" data-e="item-down" data-id="${it.id}" title="Flytta ner"${i < sec.items.length - 1 ? '' : ' disabled'}>↓</button>
           <button class="tw-ico" data-e="edit-item" data-id="${it.id}" title="Ändra">✎</button><button class="tw-ico" data-e="del-item" data-id="${it.id}" title="Ta bort">✕</button>`
        : `<button class="tw-ico" data-e="edit-item" data-id="${it.id}" title="Föreslå ändring">✎</button><button class="tw-ico" data-e="del-item" data-id="${it.id}" title="Föreslå borttagning">✕</button>`}</div>
    </li>`;
  };
  return `<p style="margin:0 0 6px"><a href="#/utbildning">← Alla områden</a></p>
    <div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">${esc(sec.title)}</h1></div>
      <div class="tw-actions">${_edu.me.isDisplay ? '' : `
        <button class="btn-ghost" data-e="edit-section" data-id="${sec.id}">${edit ? 'Ändra området' : 'Föreslå ändring'}</button>
        <button class="btn" data-e="add-item" data-id="${sec.id}">${edit ? '+ Lägg till' : '+ Föreslå material'}</button>`}</div></div>
    ${sec.intro ? `<div class="card edu-intro-card">${eduText(sec.intro)}</div>` : ''}
    ${edit && sec.items.length ? `<p class="hint" style="margin:0 0 6px">Dra en post för att ändra ordningen, eller till ett område i listan som visas för att flytta den dit.</p>
      <div class="edu-dropbar hidden" id="edu-dropbar"><span class="muted">Flytta till:</span> ${data.sections.filter(s => s.id !== sec.id).map(s => `<span class="edu-drop" data-drop-sec="${esc(s.id)}">${esc(s.title)}</span>`).join('') || '<span class="muted">Inga andra områden.</span>'}</div>` : ''}
    <div class="card">${sec.items.length ? `<ul class="edu-list">${sec.items.map(item).join('')}</ul>`
      : `<p class="muted" style="margin:0">Inget material här än. ${edit ? 'Lägg till det första med <em>+ Lägg till</em>.' : 'Föreslå gärna något med <em>+ Föreslå material</em>.'}</p>`}</div>
    ${edit ? `<p style="margin-top:18px"><button class="btn-ghost edu-danger" data-e="del-section" data-id="${sec.id}">Ta bort området…</button></p>` : ''}`;
}

const eduFindItem = id => { for (const s of _edu.data.sections) { const it = s.items.find(i => i.id === id); if (it) return { it, sec: s }; } return {}; };

async function onEduClick(e) {
  const b = e.target.closest('[data-e]');
  if (!b) {   // hela kortet är klickbart (0.60.0) — utom länkar, knappar, video och markerad text
    if (e.target.closest('a, button, input, select, textarea, label, iframe, video') || String(window.getSelection?.() || '')) return;
    const card = e.target.closest('.edu-sec[data-sec]');
    if (card) { location.hash = '#/utbildning/' + card.dataset.sec; return; }
    const li = e.target.closest('.edu-item[data-url]');
    if (li) window.open(li.dataset.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { data } = _edu, id = b.dataset.id, edit = data.canEdit;
  const act = b.dataset.e;
  try {
    if (act === 'play') { _edu.playing.has(id) ? _edu.playing.delete(id) : _edu.playing.add(id); drawEdu(); return; }
    if (act === 'add-section') return eduForm({ kind: 'add_section' });
    if (act === 'xlsx-export') return eduExport();
    if (act === 'xlsx-import') return eduImportForm();
    if (act === 'edit-section') return eduForm({ kind: 'edit_section', sec: data.sections.find(s => s.id === id) });
    if (act === 'add-item') return eduForm({ kind: 'add_item', sec: data.sections.find(s => s.id === id) });
    if (act === 'edit-item') { const { it, sec } = eduFindItem(id); return eduForm({ kind: 'edit_item', it, sec }); }
    if (act === 'del-item') {
      const { it } = eduFindItem(id);
      if (edit) { if (!confirm(`Ta bort "${it.title}"? Det går inte att ångra.`)) return; await api('/edu/items/' + id, { method: 'DELETE' }); return eduReload(); }
      return eduForm({ kind: 'delete_item', it });
    }
    if (act === 'del-section') {
      const sec = data.sections.find(s => s.id === id);
      const typed = prompt(`Ta bort området "${sec.title}" och dess ${sec.items.length} poster? Det går inte att ångra.\n\nSkriv områdets namn för att bekräfta:`);
      if (typed == null) return;
      if (typed.trim() !== sec.title) { alert('Namnet stämde inte. Inget togs bort.'); return; }
      await api('/edu/sections/' + id, { method: 'DELETE' });
      location.hash = '#/utbildning'; return;
    }
    if (act === 'sec-up' || act === 'sec-down') {
      const ids = data.sections.map(s => s.id), i = ids.indexOf(id), j = i + (act === 'sec-up' ? -1 : 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api('/edu/order', { method: 'PUT', body: { sections: ids } }); return eduReload();
    }
    if (act === 'item-up' || act === 'item-down') {
      const { sec } = eduFindItem(id), ids = sec.items.map(x => x.id), i = ids.indexOf(id), j = i + (act === 'item-up' ? -1 : 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api('/edu/order', { method: 'PUT', body: { sectionId: sec.id, items: ids } }); return eduReload();
    }
  } catch (err) { alert(err.message); }
}

// Formulär i ett eget fönster. Admin sparar direkt; övriga skickar ett förslag (med kommentar till admin).
const EDU_FORM_TITLE = { add_section: ['Nytt område', 'Föreslå nytt område'], edit_section: ['Ändra området', 'Föreslå ändring av området'],
  add_item: ['Lägg till material', 'Föreslå material'], edit_item: ['Ändra', 'Föreslå ändring'], delete_item: ['', 'Föreslå borttagning'] };

function eduForm({ kind, sec, it }) {
  const direct = _edu.data.canEdit, isItem = kind.endsWith('item');
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const v = it || {};
  const fields = kind === 'delete_item' ? `<p style="margin:0">Föreslå att <strong>${esc(it.title)}</strong> tas bort.</p>`
    : isItem ? `
      <label for="ef-title">Titel</label><input id="ef-title" maxlength="120" value="${esc(v.title || '')}" placeholder="Till exempel: Laparoskopisk appendektomi – steg för steg">
      <label for="ef-url">Länk <span class="muted">(valfri om du skriver en beskrivning)</span></label><input id="ef-url" type="url" inputmode="url" maxlength="500" value="${esc(v.url || '')}" placeholder="https://…">
      <p class="hint" style="margin:2px 0 0">Länkar till YouTube (även spellistor), Vimeo och videofiler (.mp4) kan spelas upp direkt på sidan.</p>
      <label class="row${v.url && eduVideo(v.url) ? '' : ' hidden'}" id="ef-embed-l" style="gap:8px;font-weight:normal;margin-top:6px"><input type="checkbox" id="ef-embed"${v.embed === false ? '' : ' checked'}> Spela upp här på sidan
        <span class="muted" style="font-size:13px">— stäng av för åldersbegränsade videor, som bara går att se på YouTube</span></label>
      <label class="row" style="gap:8px;font-weight:normal;margin-top:8px"><input type="checkbox" id="ef-intranet"${v.intranet ? ' checked' : ''}> Bara på regionens nätverk
        <span class="muted" style="font-size:13px">— intranät och interna dokument som inte går att öppna hemifrån</span></label>
      <label for="ef-note">Beskrivning</label><textarea id="ef-note" rows="4" maxlength="1000" placeholder="Vad är bra med materialet, vem passar det för, inloggning som behövs …">${esc(v.note || '')}</textarea>
      <fieldset class="edu-rel"><legend>Påminnelse <span class="muted">(valfritt)</span></legend>
        <p class="hint" style="margin:0 0 6px">Datum med en egen text, t.ex. "Anmälan öppnar kl. 15:00", en deadline eller ett kurstillfälle. Användarna får en påminnelse när de öppnar appen, så många dagar före.</p>
        <div id="ef-rel">${(v.releases || []).map(eduRelInput).join('')}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px"><button type="button" class="btn-ghost" id="ef-rel-add">+ Lägg till datum</button>
          <label for="ef-notice" style="margin:0;font-weight:normal">Påminn</label><input type="number" id="ef-notice" min="0" max="90" style="width:72px" value="${v.noticeDays ?? 7}"> <span>dagar före</span></div>
        <div style="margin-top:8px"><span style="font-size:14px">Vilka påminns</span> <span class="muted" style="font-size:13px">(inget valt = alla)</span>
          <div class="dmi-types" id="ef-roles">${EDU_ROLES.map(([r, l]) => `<label class="chip"><input type="checkbox" value="${r}"${(v.noticeRoles || []).includes(r) ? ' checked' : ''}> ${l}</label>`).join('')}</div></div>
      </fieldset>
      ${kind === 'edit_item' && _edu.data.sections.length > 1 ? `<label for="ef-sec">Område</label><select id="ef-sec">${_edu.data.sections.map(s => `<option value="${s.id}"${s.id === sec.id ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}</select>` : ''}`
    : `
      <label for="ef-title">Namn på området</label><input id="ef-title" maxlength="80" value="${esc(sec?.title || '')}" placeholder="Till exempel: Akut kirurgi">
      <label for="ef-intro">Inledning <span class="muted">(valfri)</span></label><textarea id="ef-intro" rows="3" maxlength="1000">${esc(sec?.intro || '')}</textarea>`;
  root.innerHTML = `
    <div class="overlay" data-close="1">
      <form class="sheet" role="dialog" aria-label="${esc(EDU_FORM_TITLE[kind][direct ? 0 : 1])}" id="ef">
        <h2>${esc(EDU_FORM_TITLE[kind][direct ? 0 : 1])} <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
        ${sec && kind === 'add_item' ? `<p class="muted" style="margin:0 0 4px">Område: ${esc(sec.title)}</p>` : ''}
        ${fields}
        ${direct ? '' : `<label for="ef-comment">${kind === 'delete_item' ? 'Varför?' : 'Kommentar till admin'} <span class="muted">${kind === 'delete_item' ? '' : '(valfri)'}</span></label>
          <textarea id="ef-comment" rows="2" maxlength="1000"${kind === 'delete_item' ? ' required' : ''}></textarea>
          <p class="hint" style="margin:4px 0 0">Förslaget syns för klinikens admin, som godkänner eller avböjer det. Du ser svaret under <em>Mina förslag</em>.</p>`}
        <div class="row" style="margin-top:14px"><button class="btn" type="submit">${direct ? 'Spara' : 'Skicka förslaget'}</button><button class="btn-ghost" type="button" data-close="1">Avbryt</button></div>
        <div class="status err" id="ef-err"></div>
      </form>
    </div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  el('ef-title')?.focus();
  el('ef-rel-add')?.addEventListener('click', () => { el('ef-rel').insertAdjacentHTML('beforeend', eduRelInput({})); el('ef-rel').lastElementChild.querySelector('input').focus(); });
  el('ef-rel')?.addEventListener('click', e => { if (e.target.dataset.relDel) e.target.closest('.edu-rel-row').remove(); });
  el('ef-url')?.addEventListener('input', () => el('ef-embed-l').classList.toggle('hidden', !eduVideo(el('ef-url').value.trim().replace(/^(?![a-z]+:)/i, 'https://'))));
  el('ef').addEventListener('submit', async e => {
    e.preventDefault();
    const val = id => el(id)?.value ?? undefined;
    const payload = kind === 'delete_item' ? {} : isItem ? { title: val('ef-title'), url: val('ef-url'), note: val('ef-note'), embed: el('ef-embed').checked, intranet: el('ef-intranet').checked,
      releases: [...document.querySelectorAll('#ef-rel .edu-rel-row')].map(r => ({ date: r.querySelector('[type=date]').value, note: r.querySelector('[data-rel-note]').value.trim() })).filter(r => r.date),
      noticeDays: val('ef-notice') === '' ? null : Number(val('ef-notice')),
      noticeRoles: [...document.querySelectorAll('#ef-roles input:checked')].map(i => i.value) }
      : { title: val('ef-title'), intro: val('ef-intro') };
    // Ändring: skicka bara det som ändrats.
    if (kind === 'edit_item') {
      for (const k of ['title', 'url', 'note']) if ((payload[k] || '').trim() === (it[k] || '')) delete payload[k];
      if (payload.embed === (it.embed !== false)) delete payload.embed;
      if (payload.intranet === !!it.intranet) delete payload.intranet;
      if (JSON.stringify([...payload.releases].sort((a, b) => a.date.localeCompare(b.date))) === JSON.stringify(it.releases || [])) delete payload.releases;
      if ((payload.noticeDays ?? 7) === (it.noticeDays ?? 7)) delete payload.noticeDays;
      if (JSON.stringify(payload.noticeRoles) === JSON.stringify(it.noticeRoles || [])) delete payload.noticeRoles;
    } else if (kind === 'add_item' && !payload.releases.length) { delete payload.releases; delete payload.noticeDays; delete payload.noticeRoles; }
    if (kind === 'add_item' && !payload.intranet) delete payload.intranet;
    if (kind === 'edit_section') for (const k of ['title', 'intro']) if ((payload[k] || '').trim() === (sec[k] || '')) delete payload[k];
    const moveTo = kind === 'edit_item' && val('ef-sec') && val('ef-sec') !== sec.id ? val('ef-sec') : undefined;
    const btn = e.submitter || el('ef').querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (direct) {
        if (kind === 'add_section') { const r = await api('/edu/sections', { method: 'POST', body: payload }); root.innerHTML = ''; location.hash = '#/utbildning/' + r.id; return; }
        if (kind === 'edit_section') await api('/edu/sections/' + sec.id, { method: 'PUT', body: payload });
        if (kind === 'add_item') await api('/edu/items', { method: 'POST', body: { ...payload, sectionId: sec.id } });
        if (kind === 'edit_item') await api('/edu/items/' + it.id, { method: 'PUT', body: { ...payload, ...(moveTo ? { sectionId: moveTo } : {}) } });
      } else {
        await api('/edu/suggestions', { method: 'POST', body: { kind, sectionId: kind === 'edit_item' ? moveTo || null : sec?.id || null, itemId: it?.id || null, payload, comment: val('ef-comment') } });
      }
      root.innerHTML = '';
      if (!direct) alert('Tack! Förslaget är skickat till admin.');
      eduReload();
      if (direct && isItem) eduNotices({ again: true });   // ett nytt eller ändrat datum kan ge en påminnelse direkt
    } catch (err) { btn.disabled = false; el('ef-err').textContent = err.message; }
  });
}

// ── Förslag ───────────────────────────────────────────────────────────────
const EDU_KIND_LABEL = { add_item: 'Nytt material', edit_item: 'Ändring', delete_item: 'Ta bort', add_section: 'Nytt område', edit_section: 'Ändra område', delete_section: 'Ta bort område' };
const EDU_FIELD = { title: 'Titel', url: 'Länk', note: 'Beskrivning', intro: 'Inledning', embed: 'Spela upp här', intranet: 'Bara regionens nätverk', section: 'Område', releases: 'Påminnelser', releaseDates: 'Påminnelser', noticeDays: 'Påminn (dagar före)', noticeRoles: 'Vilka påminns' };
const eduShow = (k, v) => k === 'embed' ? (v === false ? 'Nej' : 'Ja') : k === 'intranet' ? (v ? 'Ja' : 'Nej') : k === 'noticeRoles' ? eduRoleText(v)
  : k === 'releases' ? ((v || []).map(r => fmtDM(r.date) + (r.note ? ' ' + r.note : '')).join(', ') || '–')
  : Array.isArray(v) ? (v.map(d => fmtDM(d)).join(', ') || '–') : v ?? '–';

function drawEduSuggestions(root) {
  const { data } = _edu, admin = data.canEdit;
  const list = admin ? data.suggestions.filter(s => s.status === 'pending') : data.suggestions;
  const secName = id => data.sections.find(s => s.id === id)?.title;
  const cur = s => s.itemId ? eduFindItem(s.itemId).it : s.sectionId && s.kind.endsWith('section') ? data.sections.find(x => x.id === s.sectionId) : null;
  const diff = s => {
    const now = cur(s), keys = ['title', 'url', 'note', 'intro', 'embed', 'intranet', 'releases', 'releaseDates', 'noticeDays', 'noticeRoles'].filter(k => k in (s.payload || {}));
    if (s.kind.startsWith('delete')) return now ? `<p style="margin:4px 0">${esc(now.title)}${now.url ? ` · <a href="${esc(now.url)}" target="_blank" rel="noopener noreferrer">${esc(eduHost(now.url))}</a>` : ''}</p>` : '';
    return `<table class="edu-diff">${keys.map(k => `<tr><th>${EDU_FIELD[k] || k}</th><td>${s.kind.startsWith('edit') && now ? `<del>${esc(eduShow(k, now[k]))}</del><br>` : ''}<ins>${k === 'url' && s.payload[k] ? `<a href="${esc(s.payload[k])}" target="_blank" rel="noopener noreferrer">${esc(s.payload[k])}</a>` : esc(eduShow(k, s.payload[k]))}</ins></td></tr>`).join('')}
      ${s.kind === 'edit_item' && s.sectionId && now && eduFindItem(s.itemId).sec?.id !== s.sectionId ? `<tr><th>Område</th><td><del>${esc(eduFindItem(s.itemId).sec?.title || '')}</del><br><ins>${esc(secName(s.sectionId) || '')}</ins></td></tr>` : ''}</table>`;
  };
  const status = s => s.status === 'pending' ? '<span class="tagchip">Väntar</span>' : s.status === 'accepted' ? '<span class="tagchip ok">Godkänt</span>' : '<span class="tagchip no">Avböjt</span>';
  root.innerHTML = `<p style="margin:0 0 6px"><a href="#/utbildning">← Alla områden</a></p>
    <h1 class="page">${admin ? 'Förslag till utbildningsmaterialet' : 'Mina förslag'}</h1>
    <p class="muted" style="margin:-4px 0 12px">${admin ? 'Godkänn för att genomföra ändringen (du kan justera texten först) eller avböj med ett kort svar.' : 'Dina förslag och admins svar. Behandlade förslag visas i 30 dagar.'}</p>
    ${list.length ? list.map(s => `<div class="card edu-sug" data-sid="${s.id}">
      <div class="row" style="justify-content:space-between"><strong>${EDU_KIND_LABEL[s.kind]}${s.itemId && eduFindItem(s.itemId).it ? ` · ${esc(eduFindItem(s.itemId).it.title)}` : ''}${secName(s.sectionId) ? ` · ${esc(secName(s.sectionId))}` : s.itemId && eduFindItem(s.itemId).sec ? ` · ${esc(eduFindItem(s.itemId).sec.title)}` : ''}</strong>${admin ? '' : status(s)}</div>
      <p class="muted" style="margin:2px 0 6px;font-size:13px">${admin ? esc(s.userName || 'Okänd') + ' · ' : ''}${esc(fmtDM(String(s.createdAt).slice(0, 10)))}</p>
      ${diff(s)}
      ${s.comment ? `<p class="edu-comment">"${esc(s.comment)}"</p>` : ''}
      ${s.reply ? `<p class="edu-reply"><strong>Svar:</strong> ${esc(s.reply)}</p>` : ''}
      ${admin ? `<div class="row" style="margin-top:8px;gap:8px">
          <button class="btn" data-sug="accept" data-id="${s.id}">Godkänn</button>
          ${!s.kind.startsWith('delete') ? `<button class="btn-ghost" data-sug="adjust" data-id="${s.id}">Justera och godkänn</button>` : ''}
          <button class="btn-ghost" data-sug="reject" data-id="${s.id}">Avböj…</button></div>`
        : s.status === 'pending' ? `<div class="row" style="margin-top:8px"><button class="btn-ghost" data-sug="withdraw" data-id="${s.id}">Dra tillbaka</button></div>` : ''}
    </div>`).join('') : `<div class="card"><p class="muted" style="margin:0">${admin ? 'Inga förslag väntar.' : 'Du har inga förslag.'}</p></div>`}`;
  root.onclick = onEduSugClick;
}

async function onEduSugClick(e) {
  const b = e.target.closest('[data-sug]'); if (!b) return;
  const s = _edu.data.suggestions.find(x => x.id === b.dataset.id); if (!s) return;
  try {
    if (b.dataset.sug === 'withdraw') { if (!confirm('Dra tillbaka förslaget?')) return; await api('/edu/suggestions/' + s.id, { method: 'DELETE' }); return eduReload(); }
    if (b.dataset.sug === 'reject') {
      const reply = prompt('Avböj förslaget. Svar till den som föreslog (valfritt):', '');
      if (reply == null) return;
      await api(`/edu/suggestions/${s.id}/reject`, { method: 'POST', body: { reply } }); return eduReload();
    }
    if (b.dataset.sug === 'accept') {
      if (s.kind.startsWith('delete') && !confirm('Godkänn och ta bort? Det går inte att ångra.')) return;
      await api(`/edu/suggestions/${s.id}/accept`, { method: 'POST', body: {} }); return eduReload();
    }
    if (b.dataset.sug === 'adjust') return eduAdjust(s);
  } catch (err) { alert(err.message); }
}

// Justera ett förslag innan det godkänns: samma fält som förslaget, förifyllda med förslaget (och nuvarande värden för övriga).
function eduAdjust(s) {
  const isItem = s.kind.endsWith('item');
  const now = s.itemId ? eduFindItem(s.itemId).it : s.kind === 'edit_section' ? _edu.data.sections.find(x => x.id === s.sectionId) : null;
  const keys = isItem ? ['title', 'url', 'note'] : ['title', 'intro'];
  const v = Object.fromEntries(keys.map(k => [k, k in (s.payload || {}) ? s.payload[k] || '' : now?.[k] || '']));
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  root.innerHTML = `
    <div class="overlay" data-close="1">
      <form class="sheet" role="dialog" aria-label="Justera förslaget" id="ea">
        <h2>Justera och godkänn <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
        ${keys.map(k => `<label for="ea-${k}">${EDU_FIELD[k]}</label>${k === 'note' || k === 'intro' ? `<textarea id="ea-${k}" rows="4" maxlength="1000">${esc(v[k])}</textarea>` : `<input id="ea-${k}" maxlength="${k === 'url' ? 500 : 120}" value="${esc(v[k])}">`}`).join('')}
        ${isItem ? `<label class="row" style="gap:8px;font-weight:normal;margin-top:8px"><input type="checkbox" id="ea-embed"${('embed' in (s.payload || {}) ? s.payload.embed : now?.embed) === false ? '' : ' checked'}> Spela upp här på sidan (videor och spellistor)</label>` : ''}
        <label for="ea-reply">Svar till den som föreslog <span class="muted">(valfritt)</span></label><input id="ea-reply" maxlength="1000">
        <div class="row" style="margin-top:14px"><button class="btn" type="submit">Godkänn</button><button class="btn-ghost" type="button" data-close="1">Avbryt</button></div>
        <div class="status err" id="ea-err"></div>
      </form>
    </div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  el('ea').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = Object.fromEntries(keys.map(k => [k, el('ea-' + k).value]));
    if (isItem) payload.embed = el('ea-embed').checked;
    if (s.kind.startsWith('edit')) {
      for (const k of keys) if (payload[k].trim() === (now?.[k] || '')) delete payload[k];
      if (isItem && payload.embed === (now?.embed !== false)) delete payload.embed;
    }
    try {
      await api(`/edu/suggestions/${s.id}/accept`, { method: 'POST', body: { payload, reply: el('ea-reply').value } });
      root.innerHTML = ''; eduReload();
    } catch (err) { el('ea-err').textContent = err.message; }
  });
}

// ── Påminnelser (0.56.0, hette Kurssläpp till 0.59.0) ─────────────────────
// Posten kan ha datum, t.ex. när anmälan till en kurs öppnar. Kommande datum visas vid posten; inom förvarningen får användaren en
// ruta när appen öppnas (eduNotices, anropas från index.html). Uppfattat kvitterar datumen; Påminn mig senare stänger bara rutan.
// Yrkesroller som kan påminnas (users.job_role). Inget valt = alla.
const EDU_ROLES = [['ST', 'ST-läkare'], ['BT', 'BT-läkare'], ['AT', 'AT-läkare'], ['Spec', 'Specialister'], ['Annan', 'Övriga']];
const eduRoleText = rs => (rs || []).length ? EDU_ROLES.filter(([r]) => rs.includes(r)).map(([, l]) => l).join(', ') : 'alla';
const eduRelInput = r => `<div class="edu-rel-row row" style="gap:6px;margin-bottom:4px;flex-wrap:wrap"><input type="date" value="${esc(r.date || '')}" style="max-width:170px" aria-label="Datum för påminnelsen">
  <input type="text" data-rel-note maxlength="200" value="${esc(r.note || '')}" placeholder="Text, t.ex. Anmälan öppnar kl. 15:00" style="flex:1;min-width:160px" aria-label="Text till påminnelsen">
  <button type="button" class="link-btn" data-rel-del="1" aria-label="Ta bort datumet">Ta bort</button></div>`;
function eduReleases(it) {
  const today = todayStockholm(), next = (it.releases || []).filter(r => r.date >= today);
  if (!next.length) return '';
  const days = d => Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
  return `<div class="edu-note edu-rel-dates">📅 Påminnelse: ${next.map(r => `<span class="tagchip${days(r.date) <= (it.noticeDays ?? 7) ? ' warn' : ''}">${esc(fmtDM(r.date))}${days(r.date) === 0 ? ' idag' : ''}${r.note ? ' ' + esc(r.note) : ''}</span>`).join(' ')}
    <span class="muted">· påminnelse ${it.noticeDays ?? 7} dagar före till ${esc(eduRoleText(it.noticeRoles))}</span></div>`;
}
// Rutan visas när appen öppnas och direkt efter att admin sparat en post (again). Varje påminnelse kvitteras för sig med Uppfattat;
// Stäng visar dem igen nästa gång appen öppnas.
let _eduNoticesShown = false;
async function eduNotices({ again = false } = {}) {
  if (_eduNoticesShown && !again) return;
  _eduNoticesShown = true;
  let list;
  try { list = (await api('/edu/notices')).notices; } catch { return; }
  if (!list?.length || el('sheet-root')?.innerHTML) return;
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  const when = n => n === 0 ? 'idag' : n === 1 ? 'i morgon' : `om ${n} dagar`;
  const draw = () => {
    if (!list.length) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-label="Påminnelser">
      <h2 style="margin-top:0">Påminnelser</h2>
      ${list.map((n, i) => `<div class="pass-card" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><div>
          <strong>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</strong>
          <div style="font-size:14px">${esc(fmtDM(n.date))}${n.note ? ' ' + esc(n.note) : ''} <span class="muted">(${when(n.daysLeft)}) · ${esc(n.section)}</span></div></div>
        <button class="btn" data-ok="${i}">Uppfattat</button></div>`).join('')}
      <div class="row" style="margin-top:14px"><button class="btn-ghost" id="edu-n-later">Stäng</button></div>
    </div></div>`;
    el('edu-n-later').onclick = () => { root.innerHTML = ''; };
    root.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => {
      const n = list.splice(+b.dataset.ok, 1)[0];
      draw();
      try { await api('/edu/notices/seen', { method: 'POST', body: { items: [{ itemId: n.itemId, date: n.date }] } }); } catch {}
    });
  };
  draw();
}

// ── Bara på regionens nätverk (0.60.0) ──────────────────────────────────
const EDU_INTRA = '<span class="tagchip edu-intra" title="Går bara att öppna på regionens nätverk (inte hemifrån)">🏥 Regionens nätverk</span>';

// ── Dra och släpp (admin, 0.60.0) ───────────────────────────────────────
// Dra en post upp eller ner i listan för att ändra ordningen, eller till ett område i raden "Flytta till" som visas under dragningen.
// Pilarna ↑↓ finns kvar (och fungerar på telefonen, där dra och släpp inte gör det).
function attachEduDnd(root, sec) {
  const list = root.querySelector('.edu-list'), bar = el('edu-dropbar');
  if (!list) return;
  let dragId = null;
  const clear = () => root.querySelectorAll('.drop-before, .drop-after, .over, .dragging').forEach(n => n.classList.remove('drop-before', 'drop-after', 'over', 'dragging'));
  list.addEventListener('dragstart', e => {
    const li = e.target.closest?.('.edu-item'); if (!li) return;
    dragId = li.dataset.id; li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    bar?.classList.remove('hidden');
  });
  list.addEventListener('dragend', () => { dragId = null; clear(); bar?.classList.add('hidden'); });
  list.addEventListener('dragover', e => {
    const li = e.target.closest('.edu-item'); if (!li || !dragId) return;
    e.preventDefault();
    const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    root.querySelectorAll('.drop-before, .drop-after').forEach(n => n !== li && n.classList.remove('drop-before', 'drop-after'));
    li.classList.toggle('drop-after', after); li.classList.toggle('drop-before', !after);
  });
  list.addEventListener('drop', async e => {
    const li = e.target.closest('.edu-item'); if (!li || !dragId) return;
    e.preventDefault();
    const id = dragId, after = li.classList.contains('drop-after');
    const ids = sec.items.map(x => x.id).filter(x => x !== id);
    if (li.dataset.id !== id) ids.splice(ids.indexOf(li.dataset.id) + (after ? 1 : 0), 0, id); else return clear();
    clear();
    try { await api('/edu/order', { method: 'PUT', body: { sectionId: sec.id, items: ids } }); eduReload(); } catch (err) { alert(err.message); }
  });
  bar?.addEventListener('dragover', e => {
    const t = e.target.closest('[data-drop-sec]'); if (!t || !dragId) return;
    e.preventDefault();
    bar.querySelectorAll('.over').forEach(n => n !== t && n.classList.remove('over')); t.classList.add('over');
  });
  bar?.addEventListener('dragleave', e => e.target.closest?.('[data-drop-sec]')?.classList.remove('over'));
  bar?.addEventListener('drop', async e => {
    const t = e.target.closest('[data-drop-sec]'); if (!t || !dragId) return;
    e.preventDefault();
    const id = dragId, it = sec.items.find(x => x.id === id);
    try {
      await api('/edu/items/' + id, { method: 'PUT', body: { sectionId: t.dataset.dropSec } });
      toast(`${it?.title || 'Posten'} flyttad till ${t.textContent}.`);
      eduReload();
    } catch (err) { alert(err.message); }
  });
}

// ── Excel (0.60.0) ──────────────────────────────────────────────────────
// Export: en rad per post, i områdenas och posternas ordning. Import: samma kolumner; servern jämför och visar vad som ändras
// innan något sparas (POST /edu/import). Id kopplar raden till posten — rader utan Id blir nya poster.
const EDU_COLS = [
  ['id', 'Id (ändra inte)', 12], ['section', 'Område', 24], ['title', 'Titel', 40], ['url', 'Länk', 40], ['note', 'Beskrivning', 50],
  ['embed', 'Spela upp här', 14], ['intranet', 'Bara regionens nätverk', 22], ['releases', 'Påminnelser (ÅÅÅÅ-MM-DD text, en per rad)', 40],
  ['noticeDays', 'Påminn dagar före', 18], ['noticeRoles', 'Vilka påminns', 24]
];
const eduYes = v => { const s = String(v ?? '').trim().toLowerCase(); return ['ja', 'j', 'yes', 'true', 'sant', '1', 'x'].includes(s) ? true : ['nej', 'n', 'no', 'false', 'falskt', '0', ''].includes(s) ? false : null; };

function eduExport() {
  const rows = [EDU_COLS.map(c => c[1])];
  for (const s of _edu.data.sections) for (const it of s.items) rows.push([it.id, s.title, it.title, it.url || '', it.note || '', it.embed === false ? 'Nej' : 'Ja',
    it.intranet ? 'Ja' : 'Nej', (it.releases || []).map(r => r.date + (r.note ? ' ' + r.note : '')).join('\n'),
    (it.releases || []).length ? String(it.noticeDays ?? 7) : (it.noticeDays == null ? '' : String(it.noticeDays)),
    (it.noticeRoles || []).length ? eduRoleText(it.noticeRoles) : '']);
  const blob = OpjourImport.writeXlsx(rows, { sheet: 'Utbildningsmaterial', widths: EDU_COLS.map(c => c[2]) });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `utbildningsmaterial-${(_edu.me.clinicName || 'klinik').replace(/[^\wåäöÅÄÖ-]+/g, '-')}-${todayStockholm()}.xlsx` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tabell (från OpjourImport.readTable) → rader till servern. Returnerar { rows, errors }.
function eduRowsFromTable(table) {
  const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  const hIdx = table.findIndex(r => r.some(c => norm(c) === 'titel') && r.some(c => norm(c) === 'område'));
  if (hIdx < 0) throw new Error('Hittar inga kolumner "Område" och "Titel". Utgå från exporten.');
  const head = table[hIdx].map(norm), col = Object.fromEntries(EDU_COLS.map(([k, h]) => [k, head.indexOf(norm(h))]));
  const rows = [], errors = [];
  const serial = n => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);   // Excels datumnummer
  table.slice(hIdx + 1).forEach((r, i) => {
    const line = hIdx + 2 + i, get = k => col[k] < 0 ? '' : String(r[col[k]] ?? '').trim();
    if (!EDU_COLS.some(([k]) => get(k))) return;
    const bad = [], row = { line, id: get('id'), section: get('section'), title: get('title'), url: get('url'), note: get('note') };
    for (const k of ['embed', 'intranet']) {
      const v = col[k] < 0 || get(k) === '' ? (k === 'embed') : eduYes(get(k));
      if (v === null) bad.push(`${EDU_FIELD[k]}: "${get(k)}" (skriv Ja eller Nej)`); else row[k] = v;
    }
    row.releases = [];
    for (const part of get('releases').split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      let m = part.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b\s*[-–:,]?\s*(.*)$/);
      if (m) row.releases.push({ date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, note: m[4] });
      else if (/^\d{5}(\.\d+)?$/.test(part)) row.releases.push({ date: serial(Number(part)), note: '' });
      else bad.push(`Påminnelser: "${part}" (börja raden med datum ÅÅÅÅ-MM-DD)`);
    }
    const nd = get('noticeDays');
    if (nd === '') row.noticeDays = null;
    else if (/^\d+$/.test(nd)) row.noticeDays = Number(nd);
    else bad.push(`Påminn dagar före: "${nd}"`);
    const rl = get('noticeRoles');
    row.noticeRoles = [];
    if (rl && rl.toLowerCase() !== 'alla') for (const x of rl.split(/[,;]/).map(y => y.trim().toLowerCase()).filter(Boolean)) {
      const f = EDU_ROLES.find(([c, l]) => c.toLowerCase() === x || l.toLowerCase() === x || l.toLowerCase().replace(/er$/, '') === x);
      if (f) row.noticeRoles.push(f[0]); else bad.push(`Vilka påminns: "${x}"`);
    }
    if (bad.length) errors.push(`Rad ${line}${row.title ? ` (${row.title})` : ''}: ${bad.join(', ')}`);
    else rows.push(row);
  });
  return { rows, errors };
}

function eduImportForm() {
  let root = el('sheet-root');
  if (!root) { root = document.createElement('div'); root.id = 'sheet-root'; document.body.appendChild(root); }
  root.innerHTML = `
    <div class="overlay" data-close="1">
      <div class="sheet" role="dialog" aria-label="Uppdatera från Excel" style="max-width:720px">
        <h2>Uppdatera från Excel <button type="button" class="link-btn" style="color:var(--ink-soft);text-decoration:none;font-size:22px" data-close="1" aria-label="Stäng">✕</button></h2>
        <p class="hint" style="margin-top:0">Exportera, ändra i Excel och läs in filen här. Bara det som skiljer sig ändras, och du ser allt innan något sparas.
          Rader utan Id blir nya poster; ett nytt områdesnamn blir ett nytt område. Radernas ordning blir ordningen i varje område.
          Påminnelser skrivs en per rad i cellen: <em>2027-01-15 Anmälan öppnar kl. 15:00</em>. Förslag från användarna påverkas inte.</p>
        <label class="row" style="gap:8px;font-weight:normal"><input type="checkbox" id="ei-del"> Ta bort poster som inte finns i filen</label>
        <div class="row" style="margin-top:10px"><input type="file" id="ei-file" accept=".xlsx,.csv"></div>
        <div id="ei-out"></div>
      </div>
    </div>`;
  root.querySelector('.overlay').addEventListener('click', e => { if (e.target.dataset.close) root.innerHTML = ''; });
  let parsed = null;
  const preview = async () => {
    const out = el('ei-out'), file = el('ei-file').files[0];
    if (!file) return;
    out.innerHTML = '<p class="muted">Läser filen…</p>';
    try {
      parsed = eduRowsFromTable(await OpjourImport.readTable(file));
      const plan = await api('/edu/import', { method: 'POST', body: { rows: parsed.rows, deleteMissing: el('ei-del').checked } });
      out.innerHTML = eduPlanHtml(plan, parsed.errors);
      el('ei-run')?.addEventListener('click', async ev => {
        ev.target.disabled = true;
        try {
          await api('/edu/import', { method: 'POST', body: { rows: parsed.rows, deleteMissing: el('ei-del').checked, apply: true } });
          root.innerHTML = '';
          toast('Utbildningsmaterialet är uppdaterat.');
          eduReload();
        } catch (err) { ev.target.disabled = false; showStatus(el('ei-status'), err.message, false); }
      });
    } catch (err) { out.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  };
  el('ei-file').addEventListener('change', preview);
  el('ei-del').addEventListener('change', preview);
}

function eduPlanHtml(plan, clientErrors) {
  const errors = [...clientErrors, ...plan.errors];
  const show = (k, v) => k === 'section' ? (v || '–') : eduShow(k, v);
  const n = plan.updates.length + plan.creates.length + plan.deletes.length + plan.newSections.length;
  return `
    ${errors.length ? `<div class="notice warn" style="margin-top:10px"><strong>Rätta i filen och läs in den igen:</strong><ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${plan.newSections.length ? `<h3>Nya områden (${plan.newSections.length})</h3><p style="margin:0">${plan.newSections.map(esc).join(', ')}</p>` : ''}
    <h3>Ändras (${plan.updates.length})</h3>
    ${plan.updates.length ? `<ul class="ub-list">${plan.updates.map(u => `<li><strong>${esc(u.title)}</strong> <span class="muted">rad ${u.line}</span><br>${Object.entries(u.changes).map(([k, [a, b]]) =>
      `<span class="muted">${esc(EDU_FIELD[k] || k)}:</span> <del>${esc(show(k, a))}</del> → <ins>${esc(show(k, b))}</ins>`).join('<br>')}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Inga ändringar på befintliga poster.</p>'}
    <h3>Nya poster (${plan.creates.length})</h3>
    ${plan.creates.length ? `<ul class="ub-list">${plan.creates.map(c => `<li><strong>${esc(c.title)}</strong> <span class="muted">${esc(c.section)} · rad ${c.line}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Inga.</p>'}
    ${plan.deletes.length ? `<h3>Tas bort (${plan.deletes.length})</h3><ul class="ub-list">${plan.deletes.map(d => `<li><del>${esc(d.title)}</del> <span class="muted">${esc(d.section || '')}</span></li>`).join('')}</ul>` : ''}
    <p class="hint">${plan.unchanged} oförändrade.${plan.missing ? ` ${plan.missing} poster finns inte i filen och ligger kvar.` : ''} Ordningen inom områdena följer filen.</p>
    ${!errors.length ? `<div class="row" style="margin-top:12px"><button class="btn" id="ei-run">${n ? 'Genomför' : 'Spara ordningen'}</button></div>` : ''}
    <div class="status" id="ei-status"></div>`;
}

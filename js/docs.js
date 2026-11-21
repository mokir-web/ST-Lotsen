// ── Inställningar → Dokument / Om ST-Lotsen (#/installningar/dokument[/<id>]) ──
// Klassiskt script. Beror på index.html (api, el, esc, toast, fmtTime, setMenuForUser).
//
// Dokument som databasobjekt (0.57.0) i stället för html-sidor. Alla ser dokumenten för alla ("Om ST-Lotsen" m.fl.); admin och
// studierektor ser även handböcker och mallar. Global admin skriver dokument för alla kliniker, klinikens admin klinikens egna.
// Texten har enkel formatering: # rubrik, ## underrubrik, - punktlista, 1. numrerad lista, **fet**, *kursiv*, [text](https://…).
let _docs = null;

async function renderDocs(root, id) {
  try {
    const [me, list] = await Promise.all([api('/me'), api('/documents')]);
    setMenuForUser(me);
    _docs = { me, list, lead: !!(me.isAdmin || me.isDirector) };
    if (id === 'ny') return docForm(root, null);
    if (id) {
      const d = await api('/documents/' + encodeURIComponent(id));
      return drawDoc(root, d);
    }
    drawDocList(root);
  } catch (err) { root.innerHTML = `<h1 class="page">Dokument</h1><p class="err">${esc(err.message)}</p>`; }
}

const docTitle = () => _docs.lead ? 'Dokument' : 'Om ST-Lotsen';

function drawDocList(root) {
  const { list } = _docs;
  const group = (title, docs) => docs.length ? `<div class="dsec">${title}</div><div class="card">${docs.map(d => `<a class="doc-link" href="#/installningar/dokument/${esc(d.id)}">
      <strong>${esc(d.title)}</strong><span class="muted">${d.scope === 'clinic' ? 'Kliniken · ' : ''}uppdaterad ${esc(fmtTime(d.updatedAt))}</span></a>`).join('')}</div>` : '';
  root.innerHTML = `<div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">${docTitle()}</h1>
      <p class="muted" style="margin:0">${_docs.lead ? 'Information för alla, och handböcker och mallar för admin och studierektor.' : 'Information om ST-Lotsen.'}</p></div>
      <div class="tw-actions">${list.canEdit ? '<a class="btn" href="#/installningar/dokument/ny">+ Nytt dokument</a>' : ''}</div></div>
    ${group(_docs.lead ? 'För alla' : 'Dokument', list.documents.filter(d => d.audience === 'all'))}
    ${_docs.lead ? group('För admin och studierektor', list.documents.filter(d => d.audience === 'leads')) : ''}
    ${list.documents.length ? '' : '<p class="muted">Inga dokument än.</p>'}`;
}

function drawDoc(root, d) {
  root.innerHTML = `<p style="margin:0 0 6px"><a href="#/installningar/dokument">← ${docTitle()}</a></p>
    <div class="tw-head"><div><h1 class="page" style="margin-bottom:2px">${esc(d.title)}</h1>
      <p class="muted" style="margin:0">${d.audience === 'leads' ? 'För admin och studierektor · ' : ''}${d.scope === 'clinic' ? 'Klinikens dokument · ' : ''}uppdaterad ${esc(fmtTime(d.updatedAt))}${d.updatedBy ? ' av ' + esc(d.updatedBy) : ''}</p></div>
      <div class="tw-actions">${d.canEdit ? '<button class="btn-ghost" id="doc-edit">Ändra</button>' : ''}</div></div>
    <div class="card doc-body">${docMd(d.body) || '<p class="muted">Tomt.</p>'}</div>`;
  el('doc-edit')?.addEventListener('click', () => docForm(root, d));
}

function docForm(root, d) {
  const isNew = !d, list = _docs.list;
  root.innerHTML = `<p style="margin:0 0 6px"><a href="#/installningar/dokument">← ${docTitle()}</a></p>
    <h1 class="page">${isNew ? 'Nytt dokument' : 'Ändra dokument'}</h1>
    <form class="card" id="doc-form">
      <label for="doc-title" style="margin-top:0">Titel</label><input id="doc-title" maxlength="120" required value="${esc(d?.title || '')}">
      <div class="field-row"><div><label for="doc-aud">Vem ser dokumentet</label><select id="doc-aud">
          <option value="all"${d?.audience === 'all' ? ' selected' : ''}>Alla (Om ST-Lotsen)</option>
          <option value="leads"${!d || d.audience === 'leads' ? ' selected' : ''}>Admin och studierektor</option></select></div>
        ${isNew && list.canEditGlobal ? `<div><label for="doc-scope">Gäller</label><select id="doc-scope"><option value="global">Alla kliniker</option><option value="clinic">Bara den här kliniken</option></select></div>` : ''}</div>
      <label for="doc-body">Text</label>
      <textarea id="doc-body" rows="22" maxlength="50000" style="width:100%;box-sizing:border-box;font:inherit">${esc(d?.body || '')}</textarea>
      <p class="hint">Formatering: <code># Rubrik</code>, <code>## Underrubrik</code>, <code>- punkt</code>, <code>1. numrerat</code>, <code>**fet**</code>, <code>*kursiv*</code>, <code>[text](https://…)</code>. Tom rad = nytt stycke.</p>
      <div class="row" style="gap:8px;margin-top:10px"><button class="btn" type="submit">Spara</button>
        <a class="btn-ghost" href="#/installningar/dokument${d ? '/' + esc(d.id) : ''}">Avbryt</a>
        ${d ? '<button class="btn-ghost edu-danger" type="button" id="doc-del" style="margin-left:auto">Ta bort…</button>' : ''}</div>
      <div class="status err" id="doc-err"></div></form>`;
  el('doc-form').onsubmit = async e => {
    e.preventDefault();
    const body = { title: el('doc-title').value, audience: el('doc-aud').value, body: el('doc-body').value };
    try {
      if (isNew) {
        const r = await api('/documents', { method: 'POST', body: { ...body, global: el('doc-scope') ? el('doc-scope').value === 'global' : false } });
        location.hash = '#/installningar/dokument/' + r.id;
      } else {
        await api('/documents/' + encodeURIComponent(d.id), { method: 'PUT', body });
        toast('Dokumentet är sparat.');
        renderDocs(root, d.id);
      }
    } catch (err) { el('doc-err').textContent = err.message; }
  };
  el('doc-del')?.addEventListener('click', async () => {
    if (!confirm(`Ta bort "${d.title}"? Det går inte att ångra.`)) return;
    try { await api('/documents/' + encodeURIComponent(d.id), { method: 'DELETE' }); location.hash = '#/installningar/dokument'; }
    catch (err) { el('doc-err').textContent = err.message; }
  });
}

// Enkel formatering → html. Texten escapas först; bara länkar med http(s) blir länkar.
function docMd(text) {
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      flushPara();
      if (list && list.tag !== tag) flushList();
      (list ||= { tag, items: [] }).items.push(m[1]);
      continue;
    }
    flushList(); para.push(line);
  }
  flushPara(); flushList();
  return out.join('');
}

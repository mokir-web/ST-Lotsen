// ── Kraven per ST-år (K3) ────────────────────────────────────────────────
// Klassiskt script. Beror på index.html: esc(). Delas av ST-utbildning → Inställningar → Krav (redigerbar) och utbildningsplanen
// (läsläge med status per krav), så att studierektorn redigerar i samma vy som ST-läkaren ser.
//   yearBoardHtml(reqs, { editable, add (standard true; false = inga "+ Krav"-knappar), status(r) → html|'' , detail(r) → html|'' })
//   attachYearBoard(rootEl, { onMove(id, year|null), onEdit(id), onAdd?(year|null) })   — bara i redigerbart läge
// Utbildningsplanen använder samma tavla redigerbar utan "+ Krav" för personens egen plan (mallen ändras inte).
// Kolumner: År 1–5 (År 6 om något krav ligger där) och "Inget år". Inom en kolumn sorteras kraven på kategori och namn.

const YB_COLORS = { 'körkort': '#d9a441', 'kurs': '#8e6bbf', 'randning': '#4f8fc0', 'projekt': '#7fb069', 'bedömning': '#c0587e' };
function ybColor(cat) {
  const k = String(cat || '').toLowerCase();
  if (YB_COLORS[k]) return YB_COLORS[k];
  let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 35% 55%)`;
}

function yearBoardHtml(reqs, opts = {}) {
  const maxYear = Math.max(5, ...reqs.map(r => r.stYear || 0));
  const cols = [...Array.from({ length: maxYear }, (_, i) => [i + 1, 'År ' + (i + 1)]), [0, 'Inget år']];
  const sorted = [...reqs].sort((a, b) => a.category.localeCompare(b.category, 'sv') || a.name.localeCompare(b.name, 'sv'));
  const card = r => `<div class="yb-card${opts.editable ? ' edit' : ''}" style="--c:${ybColor(r.category)}" data-id="${esc(r.id)}"${opts.editable ? ' draggable="true" tabindex="0" role="button" title="Klicka för att ändra, dra för att flytta"' : ''}>
      <div class="yb-cat">${esc(r.category)}</div>
      <div class="yb-name">${esc(r.name)}${r.mandatory === false ? '<sup title="Valfritt">*</sup>' : ''}</div>
      ${opts.detail ? opts.detail(r) : ''}${opts.status ? opts.status(r) : ''}
    </div>`;
  return `<div class="yb${opts.editable ? ' editable' : ''}">${cols.map(([y, title]) => {
    const rs = sorted.filter(r => (r.stYear || 0) === y);
    if (y === 0 && !rs.length && !opts.editable) return '';
    return `<div class="yb-col${y === 0 ? ' none' : ''}" data-year="${y}">
      <h3>${title}</h3>
      <div class="yb-list">${rs.map(card).join('') || (opts.editable ? '' : '<p class="muted" style="margin:0">–</p>')}</div>
      ${opts.editable && opts.add !== false ? `<button type="button" class="yb-add" data-add="${y}">+ Krav</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function attachYearBoard(root, h) {
  const board = root.querySelector('.yb.editable');
  if (!board) return;
  let dragId = null;
  board.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { h.onAdd?.(Number(add.dataset.add) || null); return; }
    const c = e.target.closest('.yb-card');
    if (c) h.onEdit(c.dataset.id);
  });
  board.addEventListener('keydown', e => {
    const c = e.target.closest('.yb-card');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.onEdit(c.dataset.id); }
  });
  board.addEventListener('dragstart', e => {
    const c = e.target.closest('.yb-card'); if (!c) return;
    dragId = c.dataset.id; c.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  });
  board.addEventListener('dragend', () => { dragId = null; board.querySelectorAll('.dragging, .over').forEach(n => n.classList.remove('dragging', 'over')); });
  board.addEventListener('dragover', e => {
    const col = e.target.closest('.yb-col'); if (!col || !dragId) return;
    e.preventDefault();
    board.querySelectorAll('.yb-col.over').forEach(n => n !== col && n.classList.remove('over'));
    col.classList.add('over');
  });
  board.addEventListener('drop', e => {
    const col = e.target.closest('.yb-col'); if (!col || !dragId) return;
    e.preventDefault();
    const id = dragId, y = Number(col.dataset.year) || null;
    col.classList.remove('over');
    const card = board.querySelector(`.yb-card[data-id="${CSS.escape(id)}"]`);
    if (card && card.closest('.yb-col') !== col) { col.querySelector('.yb-list').appendChild(card); h.onMove(id, y); }
  });
}

// ── DOPS-modulen: Registrera bedömning och Inkorg (#/dops/registrera, #/dops/inkorg) ──
// Klassiskt script. Beror på index.html och js/dopsapp.js (dopsStart, dopsApi, dopsFail, dopsWrite, _dme).
//
// Som DOPS-appens bedömningsformulär och inkorg, mot DOPS-appens backend under /dops/app. Formuläret visar ett avsnitt i taget;
// "Fortsätt" går till avsnittets nästa avsnitt, eller dit en hoppregel pekar ("Assistent→Feedback", "<=:2→Stöd", flera med komma).
// Att skicka bedömningen och förfrågningar skriver i DOPS-appens databas: låst tills skrivrätt ges (servern svarar 423, visas som besked).

let _dreg = null;

async function renderDopsRegister(root, prefill) {
  try {
    await dopsStart(root);
    if (_dme.userRole === 'Mottagare') { root.innerHTML = '<h1 class="page">Registrera bedömning</h1><p class="muted">Ditt DOPS-konto är mottagare och registrerar inte bedömningar.</p>'; return; }
    const ref = await dopsApi('/reference-data?clinicId=' + encodeURIComponent(_dme.klinikId));
    _dreg = { ref, step: 'who', recipient: prefill?.recipient || '', form: prefill?.form || '', questions: [], answers: {}, history: [], section: null, started: Date.now() };
    if (_dreg.recipient && _dreg.form) await dregOpenForm(root); else drawDopsRegister(root);
  } catch (err) { dopsFail(root, 'Registrera bedömning', err); }
}

const dregCategory = () => _dreg.ref.nameToCategory?.[_dreg.recipient] || '';

function drawDopsRegister(root) {
  const d = _dreg, ref = d.ref;
  const people = (ref.lists?.Mottagare?.[_dme.clinic] || []).filter(n => n !== `${_dme.firstName} ${_dme.lastName}`.trim()).sort((a, b) => a.localeCompare(b, 'sv'));
  const cat = dregCategory();
  const groups = (ref.formTypeGroups?.[cat] || []).filter(g => g.forms.length);
  const forms = groups.length ? groups : [{ group: '', forms: ref.formTypes?.[cat] || [] }];
  if (d.step === 'form') return drawDregSection(root);
  root.innerHTML = `
    <h1 class="page">Registrera bedömning</h1>
    <div class="card">
      <label for="dreg-who" style="margin-top:0">Mottagare</label>
      <select id="dreg-who" style="max-width:360px"><option value="">Välj person…</option>${people.map(n =>
        `<option${n === d.recipient ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${cat ? `<p class="muted" style="margin:4px 0 0">${esc(cat)}</p>` : ''}
    </div>
    ${d.recipient ? `<div class="card"><h2 style="margin-top:0">Formulär</h2>${forms.map(g => `${g.group ? `<div class="bed-q">${esc(g.group)}</div>` : ''}
      <div class="bed-types">${g.forms.map(f => `<button type="button" class="bed-type" data-f="${esc(f)}"><strong>${esc(f)}</strong></button>`).join('')}</div>`).join('')
      || '<p class="muted">Inga formulär för den här personens kategori.</p>'}</div>` : ''}`;
  el('dreg-who').onchange = e => { d.recipient = e.target.value; drawDopsRegister(root); };
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { d.form = b.dataset.f; dregOpenForm(root); });
}

async function dregOpenForm(root) {
  const d = _dreg;
  d.questions = await dopsApi('/form-types/' + encodeURIComponent(d.form) + '/questions');
  d.answers = {}; d.history = []; d.section = d.questions[0]?.section || null; d.step = 'form'; d.started = Date.now();
  drawDregSection(root);
}

const dregKey = q => q.section + '__' + q.question;

function dregInput(q, i) {
  const v = _dreg.answers[dregKey(q)] || '';
  const name = `dq${i}`;
  if (q.type === 'rubrik') return `<div class="bed-q">${esc(q.question)}</div>${q.description ? `<p class="hint">${esc(q.description)}</p>` : ''}`;
  let input;
  if (q.type === 'radio') input = `<div class="dreg-opts">${q.options.map(o => `<label class="chip"><input type="radio" name="${name}" value="${esc(o)}"${o === v ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  else if (q.type === 'multi') {
    const opts = q.autofill && _dreg.ref.lists?.[q.autofill] ? (_dreg.ref.lists[q.autofill][_dme.clinic] || []) : q.options;
    const sel = v ? v.split(', ') : [];
    input = `<div class="dreg-opts">${opts.map(o => `<label class="chip"><input type="checkbox" name="${name}" value="${esc(o)}"${sel.includes(o) ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div>`;
  } else if (q.type === 'skala') {
    const nums = [...String(q.description || '').matchAll(/(\d+):/g)].map(m => +m[1]);
    const lo = nums.length ? Math.min(...nums) : 1, hi = nums.length ? Math.max(...nums) : 5;
    const steps = String(q.description || '').split('|').map(s => s.trim()).filter(s => /^\d+:\s*\S/.test(s));
    input = `<div class="seg dreg-scale">${Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).map(n =>
      `<label><input type="radio" name="${name}" value="${n}"${String(n) === v ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
      ${steps.length ? `<div class="muted bed-steps">${steps.map(esc).join(' · ')}</div>` : q.description ? `<div class="muted bed-steps">${esc(q.description)}</div>` : ''}`;
  } else input = `<textarea name="${name}" rows="3">${esc(v)}</textarea>`;
  return `<div class="dreg-q" data-i="${i}"><div class="dreg-label">${esc(q.question)}${q.prio ? ' <span class="chip" style="font-size:11px;padding:0 6px">prio</span>' : ''}</div>
    ${q.description && !['skala', 'rubrik'].includes(q.type) ? `<div class="hint" style="margin:2px 0 4px">${esc(q.description).replace(/ \| /g, '<br>')}</div>` : ''}${input}</div>`;
}

function dregCollect(root) {
  const d = _dreg;
  d.questions.forEach((q, i) => {
    if (q.section !== d.section || q.type === 'rubrik') return;
    const name = `dq${i}`;
    let val = '';
    if (q.type === 'multi') val = [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(c => c.value).join(', ');
    else if (q.type === 'radio' || q.type === 'skala') val = root.querySelector(`input[name="${name}"]:checked`)?.value || '';
    else val = (root.querySelector(`textarea[name="${name}"]`)?.value || '').trim();
    if (val) d.answers[dregKey(q)] = val; else delete d.answers[dregKey(q)];
  });
}

// Nästa avsnitt: avsnittets nextSection, om inte en hoppregel på ett svar i avsnittet pekar någon annanstans (som DOPS-appen).
function dregNext() {
  const d = _dreg, qs = d.questions.filter(q => q.section === d.section);
  let next = qs[0]?.nextSection || '';
  const ops = ['<=', '>=', '!=', '<', '>', '='];
  for (const q of qs) {
    const ans = d.answers[dregKey(q)];
    if (!q.jumpTo || ans == null) continue;
    for (const rule of q.jumpTo.split(',')) {
      const [left, target] = rule.split('→').map(s => (s || '').trim());
      if (!target) continue;
      const ci = left.indexOf(':'), cand = ci > -1 ? left.slice(0, ci) : null;
      const op = ops.includes(cand) ? cand : '=', rv = ops.includes(cand) ? left.slice(ci + 1) : left;
      const a = parseFloat(ans), b = parseFloat(rv), num = !isNaN(a) && !isNaN(b);
      const hit = op === '=' ? (num ? a === b : ans === rv) : op === '!=' ? (num ? a !== b : ans !== rv)
        : num && (op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b);
      if (hit) next = target;
    }
  }
  return next;
}

function drawDregSection(root) {
  const d = _dreg;
  const qs = d.questions.map((q, i) => [q, i]).filter(([q]) => q.section === d.section);
  const next = qs[0]?.[0].nextSection;
  root.innerHTML = `
    <h1 class="page">${esc(d.form)}</h1>
    <p class="muted" style="margin:-4px 0 12px">Mottagare: <strong>${esc(d.recipient)}</strong>${dregCategory() ? ' · ' + esc(dregCategory()) : ''}
      · <button class="link-btn" id="dreg-cancel">Avbryt</button></p>
    <div class="card">${d.section ? `<h2 style="margin-top:0">${esc(d.section)}</h2>` : ''}${qs.map(([q, i]) => dregInput(q, i)).join('') || '<p class="muted">Inga frågor.</p>'}
      <div class="row" style="margin-top:14px;gap:8px">
        ${d.history.length ? '<button class="btn-ghost" id="dreg-back">‹ Tillbaka</button>' : ''}
        ${next ? '<button class="btn" id="dreg-next">Fortsätt ›</button>' : '<button class="btn" id="dreg-send">Skicka bedömningen</button>'}
      </div></div>`;
  el('dreg-cancel').onclick = () => { if (!Object.keys(d.answers).length || confirm('Avbryt bedömningen? Det du fyllt i sparas inte.')) { d.step = 'who'; d.form = ''; drawDopsRegister(root); } };
  if (el('dreg-back')) el('dreg-back').onclick = () => { dregCollect(root); d.section = d.history.pop(); drawDregSection(root); window.scrollTo(0, 0); };
  if (el('dreg-next')) el('dreg-next').onclick = () => { dregCollect(root); const n = dregNext(); d.history.push(d.section); d.section = n; drawDregSection(root); window.scrollTo(0, 0); };
  if (el('dreg-send')) el('dreg-send').onclick = async () => {
    dregCollect(root);
    const answers = d.questions.filter(q => q.type !== 'rubrik' && d.answers[dregKey(q)] != null)
      .map(q => ({ section: q.section, question: q.question, answer: d.answers[dregKey(q)] }));
    if (!answers.length) return toast('Fyll i minst en fråga.', 'err');
    const ok = await dopsWrite(async () => {
      const email = await dopsApi('/users/lookup?fullName=' + encodeURIComponent(d.recipient));
      if (!email) throw new Error('Mottagaren hittades inte i DOPS.');
      await dopsApi('/assessments', { method: 'POST', body: { recipientEmail: email, formType: d.form, category: dregCategory(),
        elapsedSeconds: Math.round((Date.now() - d.started) / 1000), answers } });
    }, 'Bedömningen är skickad.');
    if (ok) { location.hash = '#/dops/mina'; }
  };
}

// ── Inkorg ────────────────────────────────────────────────────────────────
// Förfrågningar till mig (be om bedömning) och mina skickade. "Bedöm nu" öppnar formuläret ifyllt; markera läst/utförd och ny
// förfrågan skriver i DOPS-appens databas (låst tills vidare).
async function renderDopsInbox(root) {
  try {
    await dopsStart(root);
    const [r, ref] = await Promise.all([dopsApi('/requests'), dopsApi('/reference-data?clinicId=' + encodeURIComponent(_dme.klinikId))]);
    const status = q => q.status === 'done' ? 'Utförd' : q.status === 'expired' ? 'Inaktuell' : q.read ? 'Läst' : 'Ny';
    const item = (q, out) => `<div class="bed-free">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><strong>${esc(out ? 'Till ' + (q.toName || q.to) : 'Från ' + (q.fromName || q.from))}</strong>
          <span class="muted">${esc(q.timestamp)} · ${status(q)}${q.dueDate ? ' · senast ' + esc(q.dueDate) : ''}</span></div>
        ${q.formType ? `<div>${esc(q.formType)}${q.subjectName && q.subjectName !== q.fromName ? ` · gäller ${esc(q.subjectName)}` : ''}</div>` : ''}
        ${q.message ? `<p style="margin:4px 0;white-space:pre-wrap">${esc(q.message)}</p>` : ''}
        ${!out && q.status !== 'done' && q.status !== 'expired' ? `<div class="row" style="gap:8px;margin-top:6px">
          ${q.formType && _dme.userRole !== 'Mottagare' ? `<button class="btn" data-assess="${esc(q.id)}">Bedöm nu</button>` : ''}
          ${!q.read ? `<button class="btn-ghost" data-read="${esc(q.id)}">Markera läst</button>` : ''}
          <button class="btn-ghost" data-done="${esc(q.id)}">Markera utförd</button></div>` : ''}
      </div>`;
    const people = (ref.lists?.Registrerare?.[_dme.clinic] || []).filter(n => n !== `${_dme.firstName} ${_dme.lastName}`.trim()).sort((a, b) => a.localeCompare(b, 'sv'));
    const myForms = ref.formTypes?.[_dme.jobRole] || [];
    root.innerHTML = `
      <h1 class="page">Inkorg</h1>
      <div class="card"><h2 style="margin-top:0">Till mig (${r.inbox.length})</h2>${r.inbox.map(q => item(q, false)).join('') || '<p class="muted" style="margin:0">Inga förfrågningar.</p>'}</div>
      <div class="card"><h2 style="margin-top:0">Be om en bedömning</h2>
        <div class="field-row"><div><label for="dib-to" style="margin-top:0">Bedömare</label><select id="dib-to"><option value="">Välj…</option>${people.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
          <div><label for="dib-form" style="margin-top:0">Formulär</label><select id="dib-form"><option value="">Valfritt</option>${myForms.map(f => `<option>${esc(f)}</option>`).join('')}</select></div></div>
        <label for="dib-msg">Meddelande</label><textarea id="dib-msg" rows="2" placeholder="T.ex. vilken operation det gäller"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn" id="dib-send">Skicka förfrågan</button></div></div>
      <div class="card"><h2 style="margin-top:0">Skickade (${r.outbox.length})</h2>${r.outbox.map(q => item(q, true)).join('') || '<p class="muted" style="margin:0">Inga.</p>'}</div>`;
    const reload = () => renderDopsInbox(root);
    root.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => { if (await dopsWrite(() => dopsApi('/requests/' + b.dataset.read + '/read', { method: 'PATCH' }))) reload(); });
    root.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => { if (await dopsWrite(() => dopsApi('/requests/' + b.dataset.done + '/done', { method: 'PATCH' }), 'Markerad som utförd.')) reload(); });
    root.querySelectorAll('[data-assess]').forEach(b => b.onclick = () => {
      const q = r.inbox.find(x => x.id === b.dataset.assess);
      renderDopsRegister(root, { recipient: q.subjectName || q.fromName, form: q.formType });
    });
    el('dib-send').onclick = async () => {
      const to = el('dib-to').value;
      if (!to) return toast('Välj bedömare.', 'err');
      if (await dopsWrite(async () => {
        const email = await dopsApi('/users/lookup?fullName=' + encodeURIComponent(to));
        if (!email) throw new Error('Bedömaren hittades inte i DOPS.');
        await dopsApi('/requests', { method: 'POST', body: { toEmail: email, formType: el('dib-form').value, message: el('dib-msg').value.trim() } });
      }, 'Förfrågan är skickad.')) reload();
    };
  } catch (err) { dopsFail(root, 'Inkorg', err); }
}

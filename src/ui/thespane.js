// The Thesaurus pane (Shift+F7), Word's: a search box with the word at the cursor, its meanings
// (MyThes's, by part of speech) and under each the words of like meaning. A word pressed is looked
// up in turn (Back returns); its Insert button puts it in place of the word at the cursor, as
// the smallest edit (src/cmd/proofing.js thesInsert), one step of history. It stays open while
// the page is worked on, as the Spelling pane does, and on a phone is a sheet at the window's
// foot with 44 px buttons. The data reaches it as text only.

import { mk } from './dom.js';

function button(label, cls, title) { const b = mk('button', 'btn ' + (cls || 'ghost sm'), label); b.type = 'button'; if (title) b.title = title; return b; }

function build(app) {
  const d = mk('div', 'fr sp-pane th-pane');
  d.id = 'th-pane';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'th-title');
  d.hidden = true;
  const head = mk('div', 'fr-head');
  const title = mk('span', '', 'Thesaurus');
  title.id = 'th-title';
  const x = mk('button', 'pop-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
  head.append(title, x);
  const row = mk('form', 'th-row');
  const back = button('←', 'ghost sm th-back', 'Back to the word before');
  back.setAttribute('aria-label', 'Back');
  const q = mk('input');
  q.type = 'text'; q.setAttribute('aria-label', 'Search for'); q.placeholder = 'A word'; q.maxLength = 40; q.autocomplete = 'off'; q.spellcheck = false;
  const go = button('Search', 'sm', 'Look the word up');
  go.type = 'submit';
  row.append(back, q, go);
  const lab = mk('div', 'sp-lab');
  const list = mk('div', 'th-list');
  list.setAttribute('aria-label', 'Meanings and words of like meaning');
  const st = mk('div', 'fr-st');
  st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
  d.append(head, row, lab, list, st);
  // (in #main: on a desktop window it docks at the right as Word's panes do, app.css)
  (document.getElementById('main') || document.body).append(d);
  const P = { d, q, list, lab, st, back, trail: [], target: null, seq: 0 };
  app.thPane = P;
  const close = () => { d.hidden = true; P.target = null; app.ribbonBack && app.ribbonBack(); };
  x.addEventListener('click', close);
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  row.addEventListener('submit', (e) => { e.preventDefault(); look(app, q.value, true); });
  back.addEventListener('click', () => { if (P.trail.length > 1) { P.trail.pop(); look(app, P.trail.pop(), true); } });
  return P;
}

// look a word up and show what the thesaurus has (trail: Back's list)
async function look(app, word, trail) {
  const P = app.thPane;
  word = String(word || '').trim().slice(0, 40);
  P.q.value = word;
  if (trail && word && P.trail[P.trail.length - 1] !== word) P.trail.push(word);
  P.back.disabled = P.trail.length < 2;
  P.list.replaceChildren();
  if (!word) { P.lab.textContent = 'Type a word, or put the cursor in one on the page.'; P.st.textContent = ''; return; }
  const seq = ++P.seq;
  P.lab.textContent = '';
  P.st.textContent = 'Looking up “' + word + '”…';
  let r;
  try { r = await app.synonymsFor(word, P.target ? P.target.dict : null); } catch (e) { if (seq === P.seq) P.st.textContent = 'The thesaurus could not be loaded: ' + e.message; return; }
  if (seq !== P.seq || P.d.hidden) return;
  P.st.textContent = '';
  if (!r.meanings.length) { P.lab.textContent = 'No results for “' + word + '”.'; return; }
  P.lab.textContent = r.head && r.head !== word.toLowerCase() ? 'Results for “' + r.head + '”' : '';
  const ins = P.target && !P.target.gone;
  for (const m of r.meanings) {
    const grp = mk('div', 'th-m');
    grp.setAttribute('role', 'group');
    // (MyThes's meanings have no gloss: the first term and the part of speech name it, as
    // LibreOffice's dialog does)
    const name = app.thesTerm(m.terms[0] || '') + (m.pos && m.pos !== '-' ? ' ' + m.pos : '');
    grp.setAttribute('aria-label', name);
    grp.append(mk('div', 'th-mh', name));
    for (const t of m.terms) {
      const plain = app.thesTerm(t);
      if (!plain || plain.toLowerCase() === (r.head || word).toLowerCase()) continue;
      const note = t.slice(plain.length).trim().replace(/^\(|\)$/g, '');
      const line = mk('div', 'th-t');
      const w = mk('button', 'th-w', plain);
      w.type = 'button';
      w.title = 'Look up “' + plain + '”' + (note ? ' (' + note + ')' : '');
      w.addEventListener('click', () => look(app, plain, true));
      line.append(w);
      if (note) line.append(mk('span', 'th-note', note));
      if (ins) {
        const b = button('Insert', 'ghost sm th-ins', 'Put “' + plain + '” in place of “' + P.target.w + '”');
        b.setAttribute('aria-label', 'Insert ' + plain);
        b.addEventListener('click', () => { if (app.thesInsert(P.target, plain)) { P.target.gone = true; P.st.textContent = '“' + P.target.w + '” is now “' + plain + '”. Ctrl+Z undoes.'; for (const y of P.list.querySelectorAll('.th-ins')) y.remove(); } });
        line.append(b);
      }
      grp.append(line);
    }
    if (grp.children.length > 1) P.list.append(grp);
  }
}

// opened by Shift+F7, the right click menu or a phone's button: with the word at the cursor
export function openThesaurus(app, target) {
  const P = app.thPane || build(app);
  P.d.hidden = false;
  P.target = target || app.thesAt() || null;
  P.trail = [];
  look(app, P.target ? P.target.w : '', true);
  if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) P.q.focus({ preventScroll: true });
}

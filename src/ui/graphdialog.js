// Insert › Interactive graph: Word's Insert Chart for Rikuy's live figures. The six kinds of graph
// in a row at the top (a function, data with a fit, a curve, an implicit curve, a phase portrait,
// a distribution) and a list of named ones (supply and demand, IS–LM, Solow...), the fields of the
// one chosen (its formulas or its data, its sliders and their ranges, its axes), and the graph
// itself live beside them, sandboxed as the page's widgets are (src/widget.js runWidget: a frame
// with scripts alone, its own policy, no request out). Insert writes the widget's file, the
// \rikuywidget line, rikuy.sty where the project has none and the PDF's picture, as one step;
// opened on a graph of the document it edits that graph (src/cmd/insert.js).
//
// Every field is named for agents ("Formulas", "Slider 1 name", "From"); what a document's
// graph says (its formulas, labels, a slider's name) reaches the dialog as the value of a field,
// never as markup. A mistake in a formula is said in words and underlined where it is; Ctrl+Z
// and Ctrl+Y (and the dialog's Undo and Redo) step through the dialog's own changes.

import { dialog } from './kit.js';
import { mk } from './dom.js';
import { kit as K, graphHtml, TEMPLATES, GALLERY, template, parseData, dataText } from '../graph.js';
import { runWidget, sendFaces } from '../widget.js';

const ICONS = {
  function: '<path d="M2.5 13c2-7 4-7 5.5-1.5S12 17 13.5 9 16 4 17.5 5"/>',
  data: '<circle cx="5" cy="13" r="1.3"/><circle cx="8.5" cy="10.5" r="1.3"/><circle cx="11.5" cy="9.5" r="1.3"/><circle cx="15" cy="6" r="1.3"/><path d="M3 15.5 17 4.5"/>',
  curve: '<path d="M10 10c3-5 7-2 4 1s-7 4-8 0 2-8 4-1-3 5-3 0"/>',
  implicit: '<circle cx="10" cy="10" r="6"/><path d="M3 4.5c2 5 6 9 13.5 11"/>',
  phase: '<path d="M4 15c1-6 5-9 11-10"/><path d="M12.5 4.2 15 5l-1.4 2.2"/><path d="M4 9.5l2-1M9 15l1.5-1.6M15 11l-1.6 1.2"/>',
  dist: '<path d="M2.5 16h15"/><path d="M3 15.5c3 0 4-10 7-10s4 10 7 10"/>'
};
const SVG = (p) => '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const FIT_NAMES = { none: 'None', linear: 'Linear', quadratic: 'Quadratic', cubic: 'Cubic', exp: 'Exponential', log: 'Logarithmic', power: 'Power' };
const SHAPES = [[0.4, 'Wide'], [0.5, 'Standard'], [0.7, 'Tall'], [0.9, 'Square']];

function field(name, ctl, cls) {
  const row = mk('label', 'gd-f' + (cls ? ' ' + cls : ''));
  row.append(mk('span', 'gd-l', name), ctl);
  ctl.setAttribute('aria-label', ctl.getAttribute('aria-label') || name);
  return row;
}
function input(value, o = {}) {
  const i = mk(o.area ? 'textarea' : 'input', 'gd-in' + (o.code ? ' gd-code' : ''));
  if (!o.area) { i.type = 'text'; if (o.num) i.inputMode = 'decimal'; }
  else i.rows = o.rows || 3;
  i.value = value == null ? '' : String(value);
  i.spellcheck = false; i.autocomplete = 'off';
  if (o.ph) i.placeholder = o.ph;
  return i;
}
function select(opts, value) {
  const s = mk('select', 'gd-in');
  for (const [v, t] of opts) s.add(new Option(t, String(v)));
  s.value = String(value);
  return s;
}
// a number as a field shows it: 2π stays as typed, a plain number without trailing noise
const numText = (v) => (v == null ? '' : String(Math.round(v * 1e6) / 1e6));
// a number field that gives back the number it was opened with, to every digit, until it is
// edited (a graph's 2π read back as 6.283185 changed the graph on an Update with nothing touched)
function numIn(v, ph) {
  const i = input(numText(v), { num: true, ph });
  i._orig = v == null ? null : v;
  i.dataset.t0 = i.value;
  return i;
}
// A number field's value: a number, a constant formula (2pi, pi/2, 1e-3), or null when empty;
// undefined when it is neither
function numOf(text) {
  const t = String(text).trim();
  if (!t) return null;
  const n = Number(t.replace('−', '-'));
  if (Number.isFinite(n)) return n;
  try { const v = K.compile(K.parse(t, []), {})([]); return Number.isFinite(v) ? v : undefined; } catch (e) { return undefined; }
}
// "y = …", "f(x) = …" or the formula alone, one a line
// (any name, or a name of a variable: p = a - b q, V(k) = …, k̇ = …)
const stripLhs = (line) => line.replace(/^\s*[A-Za-zα-ωΑ-Ω][A-Za-z0-9α-ωΑ-Ω\u0307′']*(?:_\{?[A-Za-z0-9]{1,8}\}?)?(?:\s*\(\s*[A-Za-zα-ωΑ-Ωθ][A-Za-z0-9α-ωΑ-Ω]*\s*\))?\s*=(?!=)\s*/, '');

// A text field with its mistakes underlined: a mirror of its text behind it, transparent but for
// the stretch a mistake is in (src/app.css .gd-ed). mark(from, to) shows one; mark() clears it.
function underlined(el) {
  const box = mk('div', 'gd-ed'), mirror = mk('div', 'gd-mirror gd-in' + (el.classList.contains('gd-code') ? ' gd-code' : ''));
  mirror.setAttribute('aria-hidden', 'true');
  box.append(mirror, el);
  el.mark = (a, b) => {
    mirror.textContent = '';
    if (a == null) return;
    const t = el.value;
    a = Math.max(0, Math.min(a, t.length)); b = Math.max(a + 1, Math.min(b, t.length || 1));
    const w = mk('span', 'gd-wave', t.slice(a, b) || ' ');
    mirror.append(document.createTextNode(t.slice(0, a)), w, document.createTextNode(t.slice(b) + '\n'));
    mirror.scrollTop = el.scrollTop;
  };
  el.addEventListener('scroll', () => { mirror.scrollTop = el.scrollTop; });
  return box;
}
// the stretch a mistake names: the token at its place, or the unknown name it is about
function badSpan(text, e) {
  if (e.name) { const k = text.indexOf(e.name); if (k >= 0) return [k, k + e.name.length]; }
  const at = Math.max(0, Math.min(e.at || 0, text.length));
  const m = /^[A-Za-zα-ωΑ-Ω_0-9.]+|^\\[A-Za-z]+/.exec(text.slice(at));
  return at >= text.length ? [Math.max(0, text.length - 1), text.length] : [at, at + (m ? m[0].length : 1)];
}

// opts: { spec, edit: { path } } to edit a graph; else a new one from spec or the first template.
// onDone(spec, { caption }) writes it (and resolves once written); returns the dialog's element.
export function openGraphDialog(app, opts = {}) {
  const editing = !!opts.edit;
  let spec = K.normalize(opts.spec || template(opts.template || 'function'));
  // the sliders the person typed or changed stay; those added for a name in a formula go again
  // when the name does
  const auto = new Set();
  const p = dialog(app, { title: editing ? 'Edit graph' : 'Interactive graph', cls: 'pop-graph', rect: new DOMRect(Math.max(8, innerWidth / 2 - 380), 70, 0, 0) });
  p.setAttribute('aria-describedby', 'gd-note');

  const kinds = mk('div', 'gd-kinds');
  kinds.setAttribute('role', 'radiogroup');
  kinds.setAttribute('aria-label', 'Graph type');
  const kindBtns = TEMPLATES.map((t) => {
    const b = mk('button', 'gd-kind');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.kind = t.id;
    b.title = t.title;
    b.innerHTML = SVG(ICONS[t.id]);
    b.append(mk('span', '', t.name));
    b.setAttribute('aria-label', t.name);
    b.addEventListener('click', () => {
      if (spec.kind === t.id) return;
      // another kind starts from its template; the description and the shape stay
      const keep = { title: spec.title, aspect: spec.aspect };
      spec = K.normalize({ ...template(t.id), ...keep });
      auto.clear();
      build();
      changed();
    });
    // the arrows move between the kinds, as in any radio group
    b.addEventListener('keydown', (e) => {
      if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      e.preventDefault();
      const i = kindBtns.indexOf(b), j = (i + (/Right|Down/.test(e.key) ? 1 : kindBtns.length - 1)) % kindBtns.length;
      kindBtns[j].focus(); kindBtns[j].click();
    });
    return b;
  });
  kinds.append(...kindBtns);
  // the named graphs of economics and statistics: one replaces the graph being made (Ctrl+Z
  // takes it back)
  const gal = select([['', 'Start from a template…'], ...GALLERY.map((g) => [g.id, g.name])], '');
  gal.setAttribute('aria-label', 'Template');
  gal.title = 'Supply and demand, IS–LM, Solow, Ramsey, a budget line and an indifference curve, densities, the central limit theorem';
  gal.addEventListener('change', () => {
    const g = GALLERY.find((x) => x.id === gal.value);
    if (!g) return;
    spec = K.normalize({ ...g.spec, aspect: g.spec.aspect || spec.aspect });
    auto.clear();
    gal.value = '';
    build(); changed();
  });
  const top = mk('div', 'gd-top');
  top.append(kinds, gal);

  const body = mk('div', 'gd-body');
  const form = mk('div', 'gd-form');
  const pv = mk('div', 'gd-pv');
  const frame = mk('iframe', 'gd-frame');
  // the page's widgets' sandbox: scripts and nothing else, an opaque origin
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = 'Preview of the graph';
  const note = mk('p', 'gd-note', 'Live preview: drag its sliders. The PDF prints the graph at the sliders\' starting values.');
  note.id = 'gd-note';
  pv.append(frame, note);
  body.append(pv, form);
  const err = mk('p', 'gd-err');
  err.setAttribute('role', 'status');
  err.setAttribute('aria-live', 'polite');
  const btns = mk('div', 'gd-btns');
  const ok = mk('button', 'btn primary', editing ? 'Update' : 'Insert');
  ok.type = 'button'; ok.id = 'gd-ok';
  ok.title = editing ? 'Write the changes to the graph and its picture (one undo)' : 'Put the graph after this paragraph, with its picture for the PDF (one undo)';
  const cancel = mk('button', 'btn ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => app.closePop());
  // the dialog's own history: every change of the graph, Ctrl+Z and Ctrl+Y as in the page
  const undoB = mk('button', 'btn ghost gd-undo'), redoB = mk('button', 'btn ghost gd-undo');
  undoB.type = redoB.type = 'button';
  undoB.innerHTML = SVG('<path d="M7.5 6 4 9.5 7.5 13"/><path d="M4.5 9.5h7a4 4 0 0 1 0 8H9"/>');
  redoB.innerHTML = SVG('<path d="M12.5 6 16 9.5 12.5 13"/><path d="M15.5 9.5h-7a4 4 0 0 0 0 8H11"/>');
  undoB.setAttribute('aria-label', 'Undo graph change'); undoB.title = 'Undo the last change to the graph (Ctrl+Z)';
  redoB.setAttribute('aria-label', 'Redo graph change'); redoB.title = 'Redo it (Ctrl+Y)';
  btns.append(undoB, redoB, mk('span', 'grow'), cancel, ok);
  p.append(top, body, err, btns);

  // ---- the fields of the kind chosen ----
  let F = {};
  let caption = null;
  // a field whose control sits in an underlining box: the row holds the box
  const wide = (name, el, cls) => { const row = field(name, el, cls || 'gd-wide'); const box = underlined(el); row.append(box); return row; };
  function build() {
    form.textContent = '';
    F = {};
    for (const b of kindBtns) b.setAttribute('aria-checked', String(b.dataset.kind === spec.kind));
    for (const b of kindBtns) b.tabIndex = b.dataset.kind === spec.kind ? 0 : -1;
    const sec = (name) => { const s = mk('fieldset', 'gd-sec'); s.append(mk('legend', '', name)); form.append(s); return s; };
    const check = (name, on, title) => { const l = mk('label', 'gd-ck'); const c = mk('input'); c.type = 'checkbox'; c.checked = !!on; l.title = title || ''; l.append(c, mk('span', '', name)); return [l, c]; };
    if (spec.kind === 'function') {
      F.f = input(spec.f.map((f) => (spec.y.label && spec.y.label !== 'y' && /^[A-Za-zα-ωΑ-Ω]\w*$/.test(spec.y.label) ? spec.y.label : 'y') + ' = ' + f).join('\n'), { area: true, code: true, rows: 3, ph: 'y = a sin(b x)' });
      form.append(wide('Formulas', F.f));
      const row = mk('div', 'gd-row');
      F.v = input(spec.vars[0], { code: true });
      F.v.setAttribute('aria-label', 'Variable');
      row.append(field('Variable', F.v));
      const [l1, c1] = check('Mark where they cross', spec.cross, 'A dot where two curves meet, dashed to the axes, its coordinates beside it');
      const [l2, c2] = check('Faint start curves', spec.ghost, 'While a slider moves, the curves at the starting values stay, faint: what changed is seen');
      F.cross = c1; F.ghost = c2;
      row.append(l1, l2);
      form.append(row);
      form.append(mk('p', 'gd-hint', 'One a line, in the variable: 2x^2 - 3, a sin(b x), e^(-x^2/2), s k^α, \\frac{1}{1+x}. Any other letter becomes a slider.'));
      // shaded areas: under a curve, down to the x axis, another curve or the level where it
      // crosses another; from and to a number, a slider's formula, or "cross"
      const sh = sec('Shade');
      F.sh = [];
      const curveOpts = spec.f.map((f, k) => [String(k), 'Curve ' + (k + 1)]);
      spec.shade.forEach((q, k) => {
        const n = k + 1, r = mk('div', 'gd-row gd-shade');
        const a = select(curveOpts, String(q.a)), b = select([['axis', 'the x axis'], ['cross', 'its crossing level'], ...curveOpts.filter(([v]) => +v !== q.a)], String(q.b));
        const fr = input(q.from === 'min' ? '' : q.from, { code: true, ph: 'start' }), to = input(q.to === 'max' ? '' : q.to, { code: true, ph: 'end' }), lab = input(q.label, { ph: 'area' });
        a.setAttribute('aria-label', 'Shade ' + n + ' under'); b.setAttribute('aria-label', 'Shade ' + n + ' down to');
        fr.setAttribute('aria-label', 'Shade ' + n + ' from'); to.setAttribute('aria-label', 'Shade ' + n + ' to'); lab.setAttribute('aria-label', 'Shade ' + n + ' name');
        const x = mk('button', 'btn ghost icon gd-x'); x.type = 'button'; x.innerHTML = '&times;'; x.setAttribute('aria-label', 'Remove shade ' + n); x.title = 'Remove this shaded area';
        x.addEventListener('click', () => { spec = read(); spec.shade.splice(k, 1); build(); changed(); });
        r.append(field('Under', a), field('Down to', b), wide('From', fr, 'gd-f'), wide('To', to, 'gd-f'), field('Name', lab), x);
        sh.append(r);
        F.sh.push({ a, b, fr, to, lab, w: q.w });
      });
      if (spec.shade.length < 4) {
        const add = mk('button', 'btn ghost gd-add', 'Add shaded area');
        add.type = 'button';
        add.title = 'Shade under a curve: a surplus, an integral (from and to: a number, a slider, or "cross" for where it meets the other curve)';
        add.addEventListener('click', () => { spec = read(); spec.shade.push({ a: 0, b: spec.f.length > 1 ? 1 : 'axis', from: '', to: '', label: '' }); build(); changed(); });
        sh.append(add);
      }
    } else if (spec.kind === 'implicit') {
      F.eq = input(spec.eq.join('\n'), { area: true, code: true, rows: 3, ph: 'x^2 + y^2 = 4' });
      form.append(wide('Equations', F.eq));
      const row = mk('div', 'gd-row');
      F.v0 = input(spec.vars[0], { code: true }); F.v1 = input(spec.vars[1], { code: true });
      row.append(field('Across', F.v0), field('Up', F.v1));
      const [l2, c2] = check('Faint start curves', spec.ghost, 'While a slider moves, the curves at the starting values stay, faint');
      F.ghost = c2; row.append(l2);
      form.append(row);
      form.append(mk('p', 'gd-hint', 'One equation a line, F = G in the two variables: x^α y^(1-α) = u, p_1 x + p_2 y = m. Any other letter becomes a slider.'));
    } else if (spec.kind === 'phase') {
      const [a, b] = spec.vars;
      F.dx = input(spec.phase.dx, { code: true }); F.dy = input(spec.phase.dy, { code: true });
      form.append(wide('d' + a + '/dt =', F.dx), wide('d' + b + '/dt =', F.dy));
      const row = mk('div', 'gd-row');
      F.v0 = input(a, { code: true }); F.v1 = input(b, { code: true });
      F.s0 = numIn(spec.phase.start ? spec.phase.start[0] : null, 'none'); F.s1 = numIn(spec.phase.start ? spec.phase.start[1] : null, 'none');
      row.append(field('Across', F.v0), field('Up', F.v1), field('Path from ' + a, F.s0), field('Path from ' + b, F.s1));
      form.append(row);
      const r2 = mk('div', 'gd-row');
      const [l1, c1] = check('Field arrows', spec.phase.field), [l2, c2] = check('Nullclines', spec.phase.nullclines), [l3, c3] = check('Faint start curves', spec.ghost);
      F.field = c1; F.nulls = c2; F.ghost = c3;
      r2.append(l1, l2, l3);
      form.append(r2);
      form.append(mk('p', 'gd-hint', 'The rates of change in the two variables. On the page, press and drag in the graph (or use the arrow keys on it) to move where the path starts.'));
    } else if (spec.kind === 'curve') {
      F.mode = select([['polar', 'Polar: r(θ)'], ['parametric', 'Parametric: x(t), y(t)']], spec.curve.mode);
      form.append(field('Curve', F.mode));
      if (spec.curve.mode === 'polar') { F.r = input(spec.curve.r, { code: true }); form.append(wide('r(θ) =', F.r)); }
      else { F.cx = input(spec.curve.x, { code: true }); F.cy = input(spec.curve.y, { code: true }); form.append(wide('x(t) =', F.cx), wide('y(t) =', F.cy)); }
      const row = mk('div', 'gd-row');
      F.t0 = numIn(spec.curve.t[0]); F.t1 = numIn(spec.curve.t[1]);
      row.append(field((spec.curve.mode === 'polar' ? 'θ' : 't') + ' from', F.t0), field('to', F.t1));
      form.append(row);
      F.mode.addEventListener('change', () => { spec = read(); spec.curve = { mode: F.mode.value, ...(F.mode.value === 'polar' ? { r: '1 + a cos(k θ)' } : { x: 'cos(a t)', y: 'sin(k t)' }), t: spec.curve.t }; spec = K.normalize(spec); build(); changed(); });
    } else if (spec.kind === 'data') {
      F.data = input(dataText(spec.data.points), { area: true, code: true, rows: 5, ph: 'x  y\n1  2.1\n2  3.9' });
      form.append(field('Data', F.data, 'gd-wide'));
      form.append(mk('p', 'gd-hint', 'x and y, a point a line: paste two columns from a spreadsheet or a CSV.'));
      F.fit = select(K.FITS.map((f) => [f, FIT_NAMES[f]]), spec.data.fit);
      F.model = input(spec.data.model, { code: true, ph: 'a x + b' });
      const row = mk('div', 'gd-row');
      const mrow = field('Your curve: y =', F.model, 'gd-grow');
      mrow.append(underlined(F.model));
      row.append(field('Fit', F.fit), mrow);
      form.append(row);
    } else {
      F.family = select(Object.entries(K.FAM).map(([k, v]) => [k, v.name]), spec.dist.family);
      F.mode = select([['density', 'Its density'], ['mean', 'The mean of n draws (central limit theorem)']], spec.dist.mode);
      const row = mk('div', 'gd-row');
      row.append(field('Distribution', F.family), field('Show', F.mode, 'gd-grow'));
      form.append(row);
      // a new family or view: its own parameters as sliders, and its own range
      const re = () => { const r = read(); spec = K.normalize({ ...r, dist: { family: F.family.value, mode: F.mode.value }, sliders: [], x: {} }); build(); changed(); };
      F.family.addEventListener('change', re);
      F.mode.addEventListener('change', re);
    }

    // sliders
    const ss = sec('Sliders');
    F.sl = [];
    const fixed = spec.kind === 'dist';
    spec.sliders.forEach((q, k) => {
      const row = mk('div', 'gd-sl');
      const n = k + 1;
      const name = input(q.name, { code: true });
      name.setAttribute('aria-label', 'Slider ' + n + ' name');
      if (fixed) name.readOnly = true;
      const lo = numIn(q.min), hi = numIn(q.max), st = numIn(q.step), v = numIn(q.value);
      lo.setAttribute('aria-label', 'Slider ' + n + ' from'); hi.setAttribute('aria-label', 'Slider ' + n + ' to'); st.setAttribute('aria-label', 'Slider ' + n + ' step'); v.setAttribute('aria-label', 'Slider ' + n + ' start');
      row.append(field('Name', name, 'gd-n'), field('From', lo), field('To', hi), field('Step', st), field('Start', v));
      for (const i of [name, lo, hi, st, v]) i.addEventListener('input', () => auto.delete(q.name));
      if (!fixed) {
        const x = mk('button', 'btn ghost icon gd-x');
        x.type = 'button';
        x.innerHTML = '&times;';
        x.setAttribute('aria-label', 'Remove slider ' + q.name);
        x.title = 'Remove this slider';
        x.addEventListener('click', () => { spec = read(); spec.sliders = spec.sliders.filter((y) => y.name !== q.name); auto.delete(q.name); build(); changed(); });
        row.append(x);
      }
      ss.append(row);
      F.sl.push({ name, lo, hi, st, v });
    });
    if (!fixed && spec.sliders.length < 8) {
      const add = mk('button', 'btn ghost gd-add', 'Add slider');
      add.type = 'button';
      add.addEventListener('click', () => {
        spec = read();
        const used = new Set(spec.sliders.map((q) => q.name));
        const name = 'abcdmnpqsuvw'.split('').find((c) => !used.has(c) && !(spec.vars || []).includes(c)) || 'k';
        spec.sliders.push({ name, min: -5, max: 5, step: 0.1, value: 1 });
        build(); changed();
        F.sl[F.sl.length - 1].name.focus();
      });
      ss.append(add);
    }
    if (!spec.sliders.length && !fixed) ss.append(mk('p', 'gd-hint', 'A letter in a formula that is not a variable gets a slider of its own.'));

    // axes and the rest
    const ax = sec('Axes');
    const r1 = mk('div', 'gd-row'), r2 = mk('div', 'gd-row'), r3 = mk('div', 'gd-row');
    const xFixed = spec.kind === 'dist' && spec.dist.mode === 'mean';
    F.x0 = numIn(spec.x.min, 'auto'); F.x1 = numIn(spec.x.max, 'auto');
    F.y0 = numIn(spec.y.min, 'auto'); F.y1 = numIn(spec.y.max, 'auto');
    F.x0.disabled = F.x1.disabled = xFixed;
    r1.append(field('x from', F.x0), field('x to', F.x1), field('y from', F.y0), field('y to', F.y1));
    F.xl = input(spec.x.label); F.yl = input(spec.y.label);
    // (a graph's own height for its width, where it is none of the four, stays one to choose)
    const own = SHAPES.some(([v]) => v === spec.aspect) ? [] : [[spec.aspect, 'As it is']];
    F.shape = select([...SHAPES, ...own], spec.aspect);
    r2.append(field('x label', F.xl), field('y label', F.yl), field('Shape', F.shape));
    ax.append(r1, r2);
    F.title = input(spec.title, { ph: 'What the graph shows, for screen readers' });
    r3.append(field('Description', F.title, 'gd-grow'));
    if (!editing) {
      // a caption makes it a figure, numbered, that \ref can name
      caption = caption || input('', { ph: 'none: no figure number' });
      r3.append(field('Caption', caption, 'gd-grow'));
    }
    form.append(r3);
    for (const el of form.querySelectorAll('input, textarea, select')) if (!el.dataset.bound && el !== caption) { el.dataset.bound = '1'; el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => changed()); }
  }

  // ---- the description, read from the fields ----
  let bad = null;
  function read() {
    const s = JSON.parse(JSON.stringify(spec));
    bad = null;
    const num = (el, what) => { if (el._orig !== undefined && el.value === el.dataset.t0) return el._orig; const v = numOf(el.value); if (v === undefined) { bad = bad || { el, msg: what + ' is not a number' }; return null; } return v; };
    const name = (el, d) => { const t = el.value.trim(); return t || d; };
    if (s.kind === 'function') {
      s.vars = [name(F.v, 'x')];
      s.f = F.f.value.split('\n').map(stripLhs).filter((l) => l.trim()).slice(0, 6);
      s.cross = F.cross.checked ? (Array.isArray(spec.cross) ? spec.cross : true) : false;
      s.ghost = F.ghost.checked;
      s.shade = F.sh.map((r) => ({ a: +r.a.value, b: /^\d+$/.test(r.b.value) ? +r.b.value : r.b.value, w: r.w, from: r.fr.value.trim() || 'min', to: r.to.value.trim() || 'max', label: r.lab.value }));
    }
    if (s.kind === 'implicit') { s.vars = [name(F.v0, 'x'), name(F.v1, 'y')]; s.eq = F.eq.value.split('\n').filter((l) => l.trim()).slice(0, 4); s.ghost = F.ghost.checked; }
    if (s.kind === 'phase') {
      s.vars = [name(F.v0, 'x'), name(F.v1, 'y')];
      const a = num(F.s0, 'Where the path starts'), b = num(F.s1, 'Where the path starts');
      s.phase = { dx: F.dx.value, dy: F.dy.value, field: F.field.checked, nullclines: F.nulls.checked, start: a == null || b == null ? null : [a, b] };
      s.ghost = F.ghost.checked;
    }
    if (s.kind === 'curve') {
      if (F.r) s.curve.r = stripLhs(F.r.value);
      if (F.cx) { s.curve.x = F.cx.value; s.curve.y = F.cy.value; }
      s.curve.t = [num(F.t0, 'The start'), num(F.t1, 'The end')];
    }
    if (s.kind === 'data') { s.data.points = parseData(F.data.value); s.data.fit = F.fit.value; s.data.model = stripLhs(F.model.value); }
    s.sliders = F.sl.map((r) => ({ name: r.name.value.trim(), min: num(r.lo, 'From'), max: num(r.hi, 'To'), step: num(r.st, 'Step'), value: num(r.v, 'Start') }));
    s.x = { min: num(F.x0, 'x from'), max: num(F.x1, 'x to'), label: F.xl.value };
    s.y = { min: num(F.y0, 'y from'), max: num(F.y1, 'y to'), label: F.yl.value };
    s.aspect = +F.shape.value;
    s.title = F.title.value;
    return s;
  }
  // where a formula's mistake is: its field, and its place in that field's text
  function locate(e) {
    const one = { r: F.r, cx: F.cx, cy: F.cy, model: F.model, dx: F.dx, dy: F.dy }[e.field];
    if (one) { const t = one.value, off = e.field === 'r' || e.field === 'model' ? t.length - stripLhs(t).length : 0; const [a, b] = badSpan(t.slice(off), e); return { el: one, a: a + off, b: b + off }; }
    const m = /^(f|e)(\d)$/.exec(e.field || '');
    if (m) {
      const el = m[1] === 'f' ? F.f : F.eq;
      // the k-th line that is not empty, and the formula's start in it after "y ="
      const lines = el.value.split('\n');
      let k = +m[2], pos = 0;
      for (const l of lines) {
        if (l.trim()) { if (k === 0) { const off = m[1] === 'f' ? l.length - stripLhs(l).length : 0; const [a, b] = badSpan(l.slice(off), e); return { el, a: pos + off + a, b: pos + off + b }; } k--; }
        pos += l.length + 1;
      }
      return { el };
    }
    const sh = /^shade(\d)(from|to)$/.exec(e.field || '');
    if (sh && F.sh[+sh[1]]) { const el = F.sh[+sh[1]][sh[2] === 'from' ? 'fr' : 'to']; const [a, b] = badSpan(el.value, e); return { el, a, b }; }
    return null;
  }

  // ---- after every change: the sliders the formulas need, the mistakes, the preview ----
  let timer = 0;
  function changed(fromHistory) {
    const raw = read();
    let s = K.normalize(raw);
    // names in the formulas with no slider: a slider each (and those added for a name gone, out)
    const want = K.unknownNames(s);
    const used = new Set(want);
    let moved = false;
    for (const n of want) if (s.sliders.length < 8 && raw.sliders.length < 8) { raw.sliders.push({ name: n, min: -5, max: 5, step: 0.1, value: 1 }); auto.add(n); moved = true; }
    if (s.kind !== 'dist') {
      const names = (() => { try { return new Set(K.formulas(K.normalize(raw)).flatMap((f) => [...K.names(f.tree)])); } catch (e) { return null; } })();
      if (names) for (const n of [...auto]) if (!names.has(n) && !used.has(n)) { raw.sliders = raw.sliders.filter((q) => q.name !== n); auto.delete(n); moved = true; }
    }
    if (moved) {
      // rebuilt with the new rows, the focus and the caret where they were
      const a = document.activeElement, label = a && a.getAttribute('aria-label'), pos = a && a.selectionStart;
      spec = K.normalize(raw); build();
      const back = label && [...form.querySelectorAll('input, textarea')].find((x) => x.getAttribute('aria-label') === label);
      if (back) { back.focus(); try { back.setSelectionRange(pos, pos); } catch (e) { /* a select */ } }
      s = spec;
    }
    // what is wrong, said where it is, and underlined in its field
    let msg = bad ? bad.msg : '';
    for (const el of form.querySelectorAll('.gd-bad')) el.classList.remove('gd-bad');
    for (const el of form.querySelectorAll('input, textarea')) if (el.mark) el.mark();
    if (bad) bad.el.classList.add('gd-bad');
    if (!msg) {
      try { K.formulas(s); if (s.kind === 'data' && !s.data.points.length) msg = 'No data yet: two numbers a line'; }
      catch (e) {
        const where = locate(e);
        msg = e.message + (where && where.a != null ? '' : e.at ? ' (at character ' + (e.at + 1) + ')' : '');
        if (where) { where.el.classList.add('gd-bad'); if (where.a != null && where.el.mark) where.el.mark(where.a, where.b); }
      }
    }
    err.textContent = msg;
    ok.disabled = !!msg;
    spec = s;
    if (!fromHistory) remember();
    clearTimeout(timer);
    timer = setTimeout(show, 180);
  }
  function show() { if (!msg()) runWidget(frame, graphHtml(spec)); }
  const msg = () => err.textContent;

  // ---- the dialog's own history ----
  // (a run of typing in one field within a second is one step, as the page's typing is)
  const past = [], future = [];
  let lastField = null, lastAt = 0;
  const snap = () => JSON.stringify({ spec: read(), caption: caption ? caption.value : '' });
  let cur = null;
  function remember() {
    const now = snap();
    if (now === cur) return;
    const a = document.activeElement, f = a && a.getAttribute && a.getAttribute('aria-label'), t = Date.now();
    if (cur != null && !(f && f === lastField && t - lastAt < 1000 && past.length)) past.push(cur);
    if (past.length > 200) past.shift();
    future.length = 0;
    cur = now; lastField = f; lastAt = t;
    sync();
  }
  function travel(from, to) {
    if (!from.length) return;
    to.push(cur);
    cur = from.pop();
    const o = JSON.parse(cur), a = document.activeElement, label = a && a.getAttribute && a.getAttribute('aria-label');
    spec = K.normalize(o.spec);
    if (caption) caption.value = o.caption;
    build();
    changed(true);
    lastField = null;
    const back = label && [...p.querySelectorAll('input, textarea, select, button')].find((x) => x.getAttribute('aria-label') === label);
    if (back) back.focus();
    sync();
  }
  const sync = () => { undoB.disabled = !past.length; redoB.disabled = !future.length; };
  undoB.addEventListener('click', () => travel(past, future));
  redoB.addEventListener('click', () => travel(future, past));
  p.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey || (k !== 'z' && k !== 'y')) return;
    e.preventDefault(); e.stopPropagation();
    if (k === 'y' || e.shiftKey) travel(future, past); else travel(past, future);
  }, true);

  // the preview's height, from its own frame alone; the paper's faces when it asks
  const onMsg = (e) => {
    if (e.source !== frame.contentWindow || !e.data) return;
    if (e.data.rikuy === 'fonts') { sendFaces(e.source, false); return; }
    if (e.data.rikuy !== 'height') return;
    const px = Math.round(Number(e.data.px));
    if (Number.isFinite(px) && px > 0) frame.style.height = Math.min(px, 640) + 'px';
  };
  window.addEventListener('message', onMsg);
  const was = app.pop.onClose;
  app.pop.onClose = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); if (was) was(); };

  ok.addEventListener('click', async () => {
    changed(true);
    if (ok.disabled) return;
    ok.disabled = true;
    try {
      await opts.onDone(spec, { caption: caption ? caption.value : '' });
      app.closePop();
    } catch (e) {
      err.textContent = e.message || String(e);
      ok.disabled = false;
    }
  });
  // Enter in a one line field inserts, as a dialog's default button does
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ok.click(); } });

  build();
  changed();
  show();
  app.positionPop();
  const first = form.querySelector('textarea, input:not([readonly])');
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  return p;
}

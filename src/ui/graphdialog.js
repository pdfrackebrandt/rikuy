// Insert › Interactive graph: Word's Insert Chart for Rikuy's live figures. The four kinds of graph
// in a row at the top (a function, data with a fit, a curve, a distribution), the fields of the
// one chosen (its formulas or its data, its sliders and their ranges, its axes), and the graph
// itself live beside them, sandboxed as the page's widgets are (src/widget.js: a srcdoc frame
// with scripts alone, its own policy, no request out). Insert writes the widget's file, the
// \rikuywidget line, rikuy.sty where the project has none and the PDF's picture, as one step;
// opened on a graph of the document it edits that graph (src/cmd/insert.js).
//
// Every field is named for agents ("Formulas", "Slider 1 name", "From"); what a document's
// graph says (its formulas, labels, a slider's name) reaches the dialog as the value of a field,
// never as markup.

import { dialog } from './kit.js';
import { mk } from './dom.js';
import { kit as K, graphHtml, TEMPLATES, template, parseData, dataText } from '../graph.js';
import { widgetDoc } from '../widget.js';

const ICONS = {
  function: '<path d="M2.5 13c2-7 4-7 5.5-1.5S12 17 13.5 9 16 4 17.5 5"/>',
  data: '<circle cx="5" cy="13" r="1.3"/><circle cx="8.5" cy="10.5" r="1.3"/><circle cx="11.5" cy="9.5" r="1.3"/><circle cx="15" cy="6" r="1.3"/><path d="M3 15.5 17 4.5"/>',
  curve: '<path d="M10 10c3-5 7-2 4 1s-7 4-8 0 2-8 4-1-3 5-3 0"/>',
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
const stripLhs = (line) => line.replace(/^\s*(?:y|f\s*\(\s*x\s*\)|r|r\s*\(\s*(?:θ|theta|t)\s*\))\s*=\s*/i, '');

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
  btns.append(mk('span', 'grow'), cancel, ok);
  p.append(kinds, body, err, btns);

  // ---- the fields of the kind chosen ----
  let F = {};
  let caption = null;
  function build() {
    form.textContent = '';
    F = {};
    for (const b of kindBtns) b.setAttribute('aria-checked', String(b.dataset.kind === spec.kind));
    for (const b of kindBtns) b.tabIndex = b.dataset.kind === spec.kind ? 0 : -1;
    const sec = (name) => { const s = mk('fieldset', 'gd-sec'); s.append(mk('legend', '', name)); form.append(s); return s; };
    if (spec.kind === 'function') {
      F.f = input(spec.f.map((f) => 'y = ' + f).join('\n'), { area: true, code: true, rows: 3, ph: 'y = a sin(b x)' });
      form.append(field('Formulas', F.f, 'gd-wide'));
      form.append(mk('p', 'gd-hint', 'One a line, in x: 2x^2 - 3, a sin(b x), e^(-x^2/2), |x|, sqrt(x), ln x, if(x<0, 0, x). Any other letter becomes a slider.'));
    } else if (spec.kind === 'curve') {
      F.mode = select([['polar', 'Polar: r(θ)'], ['parametric', 'Parametric: x(t), y(t)']], spec.curve.mode);
      form.append(field('Curve', F.mode));
      if (spec.curve.mode === 'polar') { F.r = input(spec.curve.r, { code: true }); form.append(field('r(θ) =', F.r, 'gd-wide')); }
      else { F.cx = input(spec.curve.x, { code: true }); F.cy = input(spec.curve.y, { code: true }); form.append(field('x(t) =', F.cx, 'gd-wide'), field('y(t) =', F.cy, 'gd-wide')); }
      const row = mk('div', 'gd-row');
      F.t0 = input(numText(spec.curve.t[0]), { num: true }); F.t1 = input(numText(spec.curve.t[1]), { num: true });
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
      row.append(field('Fit', F.fit), field('Your curve: y =', F.model, 'gd-grow'));
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
      const lo = input(numText(q.min), { num: true }), hi = input(numText(q.max), { num: true }), st = input(numText(q.step), { num: true }), v = input(numText(q.value), { num: true });
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
        const name = 'abcdmnpqsuvw'.split('').find((c) => !used.has(c)) || 'k';
        spec.sliders.push({ name, min: -5, max: 5, step: 0.1, value: 1 });
        build(); changed();
        F.sl[F.sl.length - 1].name.focus();
      });
      ss.append(add);
    }
    if (!spec.sliders.length && !fixed) ss.append(mk('p', 'gd-hint', 'A letter in a formula that is not x gets a slider of its own.'));

    // axes and the rest
    const ax = sec('Axes');
    const r1 = mk('div', 'gd-row'), r2 = mk('div', 'gd-row'), r3 = mk('div', 'gd-row');
    const xFixed = spec.kind === 'dist' && spec.dist.mode === 'mean';
    F.x0 = input(spec.kind === 'function' || spec.kind === 'dist' || spec.x.min != null ? numText(spec.x.min) : '', { num: true, ph: 'auto' });
    F.x1 = input(spec.kind === 'function' || spec.kind === 'dist' || spec.x.max != null ? numText(spec.x.max) : '', { num: true, ph: 'auto' });
    F.y0 = input(spec.y.min != null ? numText(spec.y.min) : '', { num: true, ph: 'auto' });
    F.y1 = input(spec.y.max != null ? numText(spec.y.max) : '', { num: true, ph: 'auto' });
    F.x0.disabled = F.x1.disabled = xFixed;
    r1.append(field('x from', F.x0), field('x to', F.x1), field('y from', F.y0), field('y to', F.y1));
    F.xl = input(spec.x.label); F.yl = input(spec.y.label);
    F.shape = select(SHAPES.map(([v, n]) => [v, n]), (SHAPES.find(([v]) => Math.abs(v - spec.aspect) < 0.01) || SHAPES[1])[0]);
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
    for (const el of form.querySelectorAll('input, textarea, select')) if (!el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => changed()); }
  }

  // ---- the description, read from the fields ----
  let bad = null;
  function read() {
    const s = JSON.parse(JSON.stringify(spec));
    bad = null;
    const num = (el, what) => { const v = numOf(el.value); if (v === undefined) { bad = bad || { el, msg: what + ' is not a number' }; return null; } return v; };
    if (s.kind === 'function') s.f = F.f.value.split('\n').map(stripLhs).filter((l) => l.trim()).slice(0, 4);
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

  // ---- after every change: the sliders the formulas need, the mistakes, the preview ----
  let timer = 0;
  function changed() {
    const raw = read();
    let s = K.normalize(raw);
    // names in the formulas with no slider: a slider each (and those added for a name gone, out)
    const want = K.unknownNames(s);
    const used = new Set(want);
    let moved = false;
    for (const n of want) if (s.sliders.length < 8) { raw.sliders.push({ name: n, min: -5, max: 5, step: 0.1, value: 1 }); auto.add(n); moved = true; }
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
    // what is wrong, said where it is
    let msg = bad ? bad.msg : '';
    for (const el of form.querySelectorAll('.gd-bad')) el.classList.remove('gd-bad');
    if (bad) bad.el.classList.add('gd-bad');
    if (!msg) {
      try { K.formulas(s); if (s.kind === 'data' && !s.data.points.length) msg = 'No data yet: two numbers a line'; }
      catch (e) {
        msg = e.message + (e.at ? ' (at character ' + (e.at + 1) + ')' : '');
        const el = { f0: F.f, f1: F.f, f2: F.f, f3: F.f, r: F.r, cx: F.cx, cy: F.cy, model: F.model }[e.field];
        if (el) el.classList.add('gd-bad');
      }
    }
    err.textContent = msg;
    ok.disabled = !!msg;
    spec = s;
    clearTimeout(timer);
    timer = setTimeout(show, 180);
  }
  function show() { if (!msg()) frame.srcdoc = widgetDoc(graphHtml(spec)); }
  const msg = () => err.textContent;

  // the preview's height, from its own frame alone
  const onMsg = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.rikuy !== 'height') return;
    const px = Math.round(Number(e.data.px));
    if (Number.isFinite(px) && px > 0) frame.style.height = Math.min(px, 640) + 'px';
  };
  window.addEventListener('message', onMsg);
  const was = app.pop.onClose;
  app.pop.onClose = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); if (was) was(); };

  ok.addEventListener('click', async () => {
    changed();
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
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.isComposing) { e.preventDefault(); ok.click(); } });

  build();
  changed();
  show();
  app.positionPop();
  const first = form.querySelector('textarea, input:not([readonly])');
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  return p;
}

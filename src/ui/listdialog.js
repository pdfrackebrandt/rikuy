// The lists' dialogs, as Word's: Define New Bullet, Define New Number Format, Set Numbering Value,
// Define New Multilevel List, Sort Text and the list's own spacing. Each is the kit's dialog (named
// by its title, Close, Escape), every field named; OK runs the command with the values (one undo),
// Cancel and Escape change nothing. What a person types into a field goes into the source escaped
// as typing escapes it, or, where a field takes LaTeX, only when its braces and dollars balance.

import { dialog, numberField } from './kit.js';
import { enabled } from '../commands.js';
import { mk } from './dom.js';
import { escapeTeX } from '../editor.js';
import { SYMBOLS, BULLETS, STYLES, numText, bulletGlyph, bulletCode, numberParts, maxStart, multilevelOf, DEFAULT, MAX_LEVEL } from '../lists.js';

const button = (label, cls) => { const b = mk('button', 'btn ' + (cls || 'ghost sm'), label); b.type = 'button'; b.setAttribute('aria-label', label); return b; };
function field(label, value = '', o = {}) {
  const l = mk('label', 'ld-f');
  const i = mk('input');
  i.type = 'text'; i.value = value; i.autocomplete = 'off'; i.spellcheck = false;
  i.setAttribute('aria-label', label);
  if (o.size) i.size = o.size;
  if (o.placeholder) i.placeholder = o.placeholder;
  l.append(mk('span', 'ld-l', label), i);
  return { l, i };
}
function select(label, options, value) {
  const l = mk('label', 'ld-f');
  const s = mk('select');
  s.setAttribute('aria-label', label);
  for (const [v, t] of options) s.add(new Option(t, v));
  if (value != null) s.value = value;
  l.append(mk('span', 'ld-l', label), s);
  return { l, s };
}
function check(label, on) {
  const l = mk('label', 'ld-c');
  const c = mk('input'); c.type = 'checkbox'; c.checked = !!on;
  c.setAttribute('aria-label', label);
  l.append(c, document.createTextNode(' ' + label));
  return { l, c };
}
function radios(label, options, value) {
  const g = mk('div', 'ld-r');
  g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
  const name = 'ld-' + Math.random().toString(36).slice(2);
  const R = {};
  for (const [v, t] of options) {
    const l = mk('label');
    const r = mk('input'); r.type = 'radio'; r.name = name; r.value = v; r.checked = v === value;
    r.setAttribute('aria-label', t);
    l.append(r, document.createTextNode(' ' + t));
    g.append(l); R[v] = r;
  }
  return { g, get: () => Object.keys(R).find((k) => R[k].checked), R };
}

// A dialog at the caret, its page selection kept: OK runs ok() with it back on the page; ok
// returns a message to keep the dialog open with it, anything else closes it
function form(app, title, build) {
  const s = getSelection();
  const range = s.rangeCount && app.root.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : app.rbRange;
  // (the caret kept as places in the source: the page may be drawn again meanwhile)
  const c = app.caretNow();
  const keep = c && !c.ghost ? (c.collapsed ? { f: c.f, p: c.a, bias: -1 } : { f: c.f, selA: c.a, selB: c.b }) : null;
  const r = range ? range.getBoundingClientRect() : app.root.getBoundingClientRect();
  const p = dialog(app, { title, rect: new DOMRect(r.left, r.bottom, 0, 0), cls: 'pop-list' });
  const body = mk('div', 'ld');
  const msg = mk('div', 'ld-msg');
  msg.setAttribute('role', 'alert');
  const ok = button('OK', 'primary sm'), cancel = button('Cancel');
  const row = mk('div', 'ld-btns');
  row.append(ok, cancel);
  const back = () => {
    if (keep) { app.restoreCaret(keep, true); return; }
    if (range && app.root.contains(range.startContainer)) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); app.rbRange = range; }
    app.root.focus({ preventScroll: true });
  };
  const go = build(body);
  ok.addEventListener('click', () => {
    const err = go.check ? go.check() : null;
    if (err) { msg.textContent = err; return; }
    app.closePop(true);
    back();
    go.ok();
  });
  cancel.addEventListener('click', () => { app.closePop(true); back(); });
  p.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); app.closePop(true); back(); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); ok.click(); }
  });
  p.append(body, msg, row);
  app.positionPop();
  const first = p.querySelector('input, select, button.ld-sym');
  if (first) first.focus();
  return p;
}
// a number field without a unit (a count: where a list starts)
const countField = (id, name, value) => { const f = numberField({ id, name, value: { value, unit: '' }, units: [''], step: 1, min: 0, max: 99999 }); f.querySelector('select').hidden = true; return f; };
const preview = () => { const d = mk('div', 'ld-prev'); d.setAttribute('aria-live', 'polite'); d.setAttribute('aria-label', 'Preview'); return d; };

// LaTeX typed into a field, written only where it cannot break the document around it: balanced
// braces and dollars, no comment, no environment, no line break; else null
export function safeLatex(t) {
  t = String(t).trim();
  if (!t || t.length > 120 || /[\n\r%]/.test(t) || /\\(begin|end|item|par|def|let|input|include|write|immediate|csname|catcode|newcommand|renewcommand)(?![A-Za-z])/.test(t)) return null;
  let d = 0, dollars = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d < 0) return null;
    else if (c === '$') dollars++;
  }
  return d === 0 && dollars % 2 === 0 ? t : null;
}
// text typed for a label: as typing escapes it
const asText = (t) => escapeTeX(String(t), ' ');

// ---- Define New Bullet ------------------------------------------------------------------------------
export function openBulletDialog(app) {
  return form(app, 'Define New Bullet', (body) => {
    let code = BULLETS[0].code;
    const grid = mk('div', 'ld-syms');
    grid.setAttribute('role', 'radiogroup'); grid.setAttribute('aria-label', 'Symbol');
    const own = field('Character or LaTeX', '', { placeholder: '» or $\\heartsuit$' });
    const pv = preview();
    const show = () => { const g = bulletGlyph(code); pv.textContent = (g || '?') + '  First item\n' + (g || '?') + '  Second item'; };
    const buttons = [];
    for (const s of SYMBOLS) {
      const b = mk('button', 'ld-sym', s.glyph);
      b.type = 'button'; b.title = s.name + ': ' + s.code; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', s.name);
      b.setAttribute('aria-checked', s.code === code ? 'true' : 'false');
      b.addEventListener('click', () => { code = s.code; own.i.value = ''; for (const x of buttons) x.setAttribute('aria-checked', x === b ? 'true' : 'false'); show(); });
      buttons.push(b); grid.append(b);
    }
    // (a character typed: its symbol's LaTeX where it is one, else escaped as typing escapes it;
    // one that pdfLaTeX's fonts here do not have is refused: bulletCode)
    const eng = app.textEngine ? app.textEngine() : { unicode: true };
    const typed = (t) => bulletCode(t, { ...eng, esc: asText });
    own.i.addEventListener('input', () => { const t = own.i.value.trim(); if (t) { const r = typed(t); code = r.error ? '' : r.code; for (const x of buttons) x.setAttribute('aria-checked', 'false'); } show(); });
    body.append(grid, own.l, pv);
    show();
    return {
      check: () => {
        const t = own.i.value.trim();
        if (!t) return null;
        if (/[\\$]/.test(t) && !safeLatex(t)) return 'That LaTeX does not stand on its own: its braces or dollars do not balance, or it holds a command a label cannot.';
        return typed(t).error || null;
      },
      ok: () => { const t = own.i.value.trim(); app.runCommand('bullet-define', { code: t ? typed(/[\\$]/.test(t) ? safeLatex(t) : t).code : code }); }
    };
  });
}

// ---- Define New Number Format -------------------------------------------------------------------------
// The list's label shown as its style and the text around it; a label written some other way
// (\textbf{\alph*}) shows as Custom (kept). OK changes only what was changed: the label where the
// style or its text was, the start where it was, both in one step (one undo).
export function openNumberDialog(app) {
  const at = app.ribbonAt(), I = at && app.listAt(at), f = I && I.L && I.L.kind === 'enum' ? I.fmt : null;
  const cur = f ? numberParts(f.label || '\\arabic*.') : null;
  const kept = !!f && f.label && !cur;
  return form(app, 'Define New Number Format', (body) => {
    const st = select('Number style', kept ? [['', 'Custom (kept)'], ...STYLES] : STYLES, kept ? '' : cur ? cur.style : 'arabic');
    const before = field('Text before', cur ? cur.before : '', { size: 8 });
    const after = field('Text after', cur ? cur.after : '.', { size: 8 });
    const start = countField('ld-start', 'Start at', f ? f.start : 1);
    const sl = mk('label', 'ld-f'); sl.append(mk('span', 'ld-l', 'Start at'), start);
    const pv = preview();
    const init = { st: st.s.value, before: before.i.value, after: after.i.value };
    const up = cur && cur.up.length ? cur.up.map((x, j) => '\\' + x + '{enum' + ['i', 'ii', 'iii'][j] + '}.').join('') : '';
    const changed = () => st.s.value !== init.st || before.i.value !== init.before || after.i.value !== init.after;
    const star = () => !st.s.value ? f.label : asText(before.i.value) + up + '\\' + st.s.value + '*' + asText(after.i.value);
    const num = () => Math.max(0, Math.round(start.get().value));
    const show = () => {
      for (const x of [before.i, after.i]) x.disabled = !st.s.value;
      pv.textContent = [0, 1, 2].map((k) => numText(star(), num() + k) + '  Item').join('\n');
    };
    for (const x of [before.i, after.i]) x.addEventListener('input', show);
    st.s.addEventListener('change', show);
    start.querySelector('input').addEventListener('input', () => setTimeout(show, 0));
    start.querySelector('input').addEventListener('change', show);
    body.append(st.l, before.l, after.l, sl, pv);
    show();
    return {
      // (letters stop at z: \alph of 27 is TeX's "Counter too large")
      check: () => (num() > maxStart({ label: star() }) ? 'Letters go from a to z: a list numbered with them starts at 26 at most.' : null),
      ok: () => {
        const n = num();
        const label = changed() ? star() : f ? undefined : null;
        const s0 = n !== (f ? f.start : 1) ? n : undefined;
        if (f && label === undefined && s0 === undefined) return;
        app.runCommand('number-define', { label, start: s0 });
      }
    };
  });
}

// ---- Set Numbering Value ------------------------------------------------------------------------------
export function openValueDialog(app) {
  const at = app.ribbonAt(), I = at && app.listAt(at), f = I && I.L ? I.fmt : null;
  return form(app, 'Set Numbering Value', (body) => {
    const how = radios('Numbering', [['new', 'Start new list'], ['continue', 'Continue from previous list']], f && f.resume ? 'continue' : 'new');
    // (only where there is a numbered list before this one to go on from)
    if (!(f && f.resume) && !enabled(app, 'list-continue', at)) how.R.continue.disabled = true;
    const start = countField('ld-value', 'Set value to', f ? f.start : 1);
    const sl = mk('label', 'ld-f'); sl.append(mk('span', 'ld-l', 'Set value to'), start);
    const pv = preview();
    const show = () => { const cont = how.get() === 'continue'; start.querySelector('input').disabled = cont; pv.textContent = cont ? 'Numbering goes on from the list before' : numText(f ? f.label || '\\arabic*.' : '\\arabic*.', Math.max(0, Math.round(start.get().value))) + '  Item'; };
    how.g.addEventListener('change', show);
    start.querySelector('input').addEventListener('change', show);
    body.append(how.g, sl, pv);
    show();
    return {
      check: () => (how.get() !== 'continue' && Math.round(start.get().value) > maxStart(f) ? 'Letters go from a to z: a list numbered with them starts at 26 at most.' : null),
      ok: () => {
        if (how.get() === 'continue') app.runCommand('list-continue');
        else app.runCommand('list-value', { value: Math.max(0, Math.round(start.get().value)) });
      }
    };
  });
}

// ---- Define New Multilevel List -------------------------------------------------------------------------
// Each level as the preamble gives it: a number label as its style and the text around it, a
// bullet as its symbol; one written some other way (\textbf{\alph*}, \S\roman*, \ding{43}) as
// Custom (kept), a level with no label of its own as LaTeX's. OK writes only the levels changed.
export function openMultilevelDialog(app) {
  const cfg = app.listCfg();
  const at = app.ribbonAt(), I = at && app.listAt(at);
  return form(app, 'Define New Multilevel List', (body) => {
    const kind = select('List', [['enum', 'Numbered lists'], ['item', 'Bulleted lists']], I && I.L && I.L.kind === 'item' ? 'item' : 'enum');
    const rows = mk('div', 'ld-levels');
    const pv = preview();
    let get = () => [], code = () => [];
    const build = () => {
      rows.replaceChildren();
      const k = kind.s.value, have = multilevelOf(cfg, k);
      // per level: its label as written now (or LaTeX's), whether it was changed, its new label
      const R = [];
      for (let n = 1; n <= MAX_LEVEL; n++) {
        const row = mk('div', 'ld-level');
        row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Level ' + n);
        row.append(mk('span', 'ld-lv', String(n)));
        const was = have[n - 1] || DEFAULT[k][n - 1];
        const L = { was, dirty: false, value: () => was };
        const touch = () => { L.dirty = true; show(); };
        if (k === 'enum') {
          const p = numberParts(was);
          const st = select('Level ' + n + ' number style', p ? STYLES : [['', 'Custom (kept): ' + was], ...STYLES], p ? p.style : '');
          const before = field('Level ' + n + ' text before', p ? p.before : '', { size: 4 });
          const after = field('Level ' + n + ' text after', p ? p.after : '.', { size: 4 });
          const up = check('Level ' + n + ' includes the levels above', !!(p && p.up.length));
          if (n === 1) up.l.hidden = true;
          row.append(before.l, st.l, after.l, up.l);
          const able = () => { for (const x of [before.i, after.i, up.c]) x.disabled = !st.s.value; };
          able();
          L.style = () => st.s.value || (p && p.style) || 'arabic';
          L.value = () => {
            if (!st.s.value) return was;
            const parts = [];
            if (up.c.checked) for (let j = 1; j < n; j++) parts.push('\\' + R[j - 1].style() + '{enum' + ['', 'i', 'ii', 'iii', 'iv'][j] + '}.');
            return asText(before.i.value) + parts.join('') + '\\' + st.s.value + '*' + asText(after.i.value);
          };
          st.s.addEventListener('change', () => { able(); touch(); });
          for (const x of [before.i, after.i]) x.addEventListener('input', touch);
          up.c.addEventListener('change', touch);
        } else {
          const own = have[n - 1];
          const lib = BULLETS.find((b) => b.code === own);
          const opts = [['', 'LaTeX\'s own ' + bulletGlyph(DEFAULT.item[n - 1])], ...(own && !lib ? [['=', (bulletGlyph(own) || '?') + '  Custom (kept): ' + own]] : []), ...BULLETS.map((b) => [b.code, b.glyph + '  ' + b.name])];
          const sym = select('Level ' + n + ' bullet', opts, !own ? '' : lib ? lib.code : '=');
          row.append(sym.l);
          L.value = () => (sym.s.value === '' ? null : sym.s.value === '=' ? own : sym.s.value);
          sym.s.addEventListener('change', touch);
        }
        R.push(L);
        rows.append(row);
      }
      // (a level left as it was: undefined, which multilevelEdits leaves alone)
      get = () => R.map((L) => (L.dirty ? L.value() : undefined));
      code = () => R.map((L, i) => { const v = L.value(); return v == null ? DEFAULT[k][i] : v; });
      show();
    };
    function show() {
      const labels = code(), k = kind.s.value;
      pv.textContent = labels.map((c, i) => '   '.repeat(i) + (k === 'enum' ? numText(c, 1, [1, 1, 1]) : bulletGlyph(c) || '?') + '  Level ' + (i + 1)).join('\n');
    }
    kind.s.addEventListener('change', build);
    body.append(kind.l, rows, pv);
    build();
    return {
      ok: () => {
        const labels = get();
        if (labels.every((x) => x === undefined)) return;
        app.runCommand('multilevel-define', { kind: kind.s.value, labels });
      }
    };
  });
}

// ---- Sort Text -------------------------------------------------------------------------------------
export function openSortDialog(app) {
  const at = app.ribbonAt(), T = at && app.sortTarget(at);
  return form(app, 'Sort Text', (body) => {
    body.append(mk('div', 'ld-note', T ? (T.kind === 'items' ? 'Sort ' + T.pieces.length + ' list items' : 'Sort ' + T.pieces.length + ' paragraphs') + ', each by its text' : ''));
    const type = select('Type', [['text', 'Text'], ['number', 'Number'], ['date', 'Date']], 'text');
    const order = radios('Order', [['ascending', 'Ascending'], ['descending', 'Descending']], 'ascending');
    const cs = check('Case sensitive', false);
    body.append(type.l, order.g, cs.l);
    return { ok: () => app.runCommand('sort', { type: type.s.value, order: order.get(), caseSensitive: cs.c.checked }) };
  });
}

// ---- the space between items ------------------------------------------------------------------------
export function openSpacingDialog(app) {
  const at = app.ribbonAt(), I = at && app.listAt(at), f = I && I.L ? I.fmt : null;
  const m = f && f.sep && /^(-?[\d.]+)\s*(pt|mm|cm|em|ex|in)$/.exec(f.sep);
  return form(app, 'List spacing', (body) => {
    const nf = numberField({ id: 'ld-sep', name: 'Space between items', value: { value: m ? +m[1] : 4, unit: m ? m[2] : 'pt' }, units: ['pt', 'mm', 'em'], step: 1, min: 0, max: 100 });
    const l = mk('label', 'ld-f'); l.append(mk('span', 'ld-l', 'Space between items'), nf);
    body.append(l, mk('div', 'ld-note', 'enumitem\'s itemsep; LaTeX\'s own is 4pt plus the paragraphs\' 4pt'));
    return { ok: () => { const v = nf.get(); app.runCommand('list-spacing', { sep: Math.round(v.value * 100) / 100 + v.unit }); } };
  });
}

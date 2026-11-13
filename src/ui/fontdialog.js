// Word's Font dialog (Ctrl+D): every character format of the selection in one place, with a
// preview, and its Advanced tab (the spacing between letters, their scale and position, the
// document's kerning and ligatures). OK writes what changed, and only that, as one commit (one
// undo); with no text selected the font and size are the document's, as the boxes are. Set As
// Default gives the document the font and size chosen. Also the Phonetic Guide (ruby). Fields
// are named for agents (a select "Font name", checkboxes "Small caps"); the document's own
// text reaches the dialog only as text (the preview's words, a colour's name).

import * as F from '../charfmt.js';
import { dialog, BASE_COLORS, STANDARD_COLORS, DVIPS_COLORS } from './kit.js';
import { mk, $ } from './dom.js';
import { escapeTeX } from '../editor.js';
import { packages, preambleEnd } from '../preamble.js';

const EFFECTS = [['strike', 'Strikethrough'], ['dstrike', 'Double strikethrough'], ['sup', 'Superscript'], ['sub', 'Subscript'], ['smallcaps', 'Small caps'], ['allcaps', 'All caps']];
const LIGS = '\\DisableLigatures{encoding = *, family = *}';

// a labelled field: <label>name</label> and the control, which takes the name too
function field(name, ctl, cls = '') {
  const row = mk('label', 'fd-f ' + cls);
  row.append(mk('span', 'fd-l', name), ctl);
  ctl.setAttribute('aria-label', name);
  return row;
}
function select(opts, value) {
  const s = mk('select', 'fd-sel');
  for (const [v, t] of opts) s.add(new Option(t, v));
  s.value = value;
  return s;
}
function num(value, step, min, max) {
  const i = mk('input', 'fd-num');
  i.type = 'number'; i.step = String(step); if (min != null) i.min = String(min); if (max != null) i.max = String(max);
  i.value = String(value);
  return i;
}
function check(name, on) {
  const row = mk('label', 'fd-ck');
  const i = mk('input');
  i.type = 'checkbox'; i.checked = !!on; i.setAttribute('aria-label', name);
  row.append(i, mk('span', '', name));
  return { row, i };
}
const colorName = (n) => {
  const s = STANDARD_COLORS.find(([x]) => x === n);
  return s ? s[2] + ' (' + n + ')' : n;
};
const hexOf = (n) => {
  for (const L of [BASE_COLORS, DVIPS_COLORS]) { const x = L.find(([k]) => k === n); if (x) return '#' + x[1]; }
  return /^[0-9A-F]{6}$/i.test(n) ? '#' + n : '';
};

// What the selection has now, read from its wrappers
function stateAt(app, at) {
  const c = at.c, src = app.src(c.f), st = app.fontState(at);
  const W = (g) => F.around(src, c.a, c.b, g);
  const has = (g) => { const w = W(g); return !!w && (c.collapsed || (c.a >= w.is && c.b <= w.ie)); };
  const ul = W('underline'), col = W('color'), ls = W('spacing'), sc = W('scale'), rs = W('position');
  return {
    sel: !c.collapsed, family: st.fontSel ? st.family || '' : st.docFont.id, size: st.selMode ? st.size : st.base, sizeSel: st.selMode, fontSel: st.fontSel,
    bold: has('bold'), italic: has('italic'), underline: ul ? (ul.cmd === 'underline' ? 'uline' : ul.cmd === 'culine' ? 'uline' : ul.cmd) : '', ulColor: ul && ul.cmd === 'culine' ? ul.args[0] : '',
    color: col ? (col.opt === 'HTML' ? col.args[0] : col.args[0]) : '', colorHtml: !!col && col.opt === 'HTML',
    strike: has('strike'), dstrike: has('dstrike'), sup: has('sup'), sub: has('sub'), smallcaps: has('smallcaps'), allcaps: has('allcaps'),
    spacing: ls ? (parseFloat(ls.opt == null ? '100' : ls.opt) || 0) : 0, scale: sc ? Math.round(parseFloat(sc.args[0]) * 100) || 100 : 100,
    position: rs ? parseFloat(rs.args[0]) || 0 : 0, st
  };
}

export function openFontDialog(app) {
  const at = app.ribbonAt();
  if (!at || !at.c || at.c.ghost) return false;
  const S = stateAt(app, at);
  const base = S.st.base;
  // the page's selection is kept while the dialog has the focus, and given back to apply
  const s0 = getSelection();
  if (s0.rangeCount && app.root.contains(s0.anchorNode)) app.rbRange = s0.getRangeAt(0).cloneRange();
  const words = at.c.collapsed ? '' : String(s0).replace(/\s+/g, ' ').trim().slice(0, 80);
  // (under the Font group, or its folded button; the dialog opens below the ribbon's row)
  const grp = $('#rp-home .rb-grp[data-group="font"]'), g = $('#rg-home-font');
  const anchorEl = g && g.offsetParent ? g : grp && grp.offsetParent ? grp : null;
  const p = dialog(app, { title: 'Font', cls: 'pop-font', anchor: anchorEl, rect: anchorEl ? null : new DOMRect(Math.max(8, innerWidth / 2 - 260), 90, 0, 0) });
  // ---- tabs: Font and Advanced
  const tabs = mk('div', 'fd-tabs');
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Font dialog');
  const panels = [];
  const mkTab = (name, k) => {
    const t = mk('button', 'fd-tab', name);
    t.type = 'button'; t.id = 'fd-tab-' + k; t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'fd-panel-' + k);
    const panel = mk('div', 'fd-panel');
    panel.id = 'fd-panel-' + k; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', t.id);
    t.addEventListener('click', () => pick(k));
    tabs.append(t); panels.push([t, panel]);
    return panel;
  };
  const pick = (k) => { for (const [t, pn] of panels) { const on = t.id === 'fd-tab-' + k; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; pn.hidden = !on; } };
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = panels.findIndex(([t]) => t.getAttribute('aria-selected') === 'true'), n = panels[(i + 1) % panels.length][0];
    n.click(); n.focus();
  });
  const P1 = mkTab('Font', 'font'), P2 = mkTab('Advanced', 'adv');

  // ---- Font
  const famOpts = [];
  if (S.fontSel) famOpts.push(['', S.st.docFont.name + ' (the document\'s)'], ...F.GENERIC.map((x) => [x.id, x.name]));
  // (a document font Rikuy does not list is there as it is: OK with it chosen changes nothing)
  else if (!S.st.docFont.id) famOpts.push(['', S.st.docFont.name]);
  for (const x of F.FONTS) if (S.fontSel ? (S.st.fontspec ? x.spec : x.family) : S.st.fontspec ? x.spec : x.pkgs) famOpts.push([x.id, x.name]);
  const fam = select(famOpts, famOpts.some(([v]) => v === S.family) ? S.family : famOpts[0][0]);
  const style = select([['', 'Regular'], ['i', 'Italic'], ['b', 'Bold'], ['bi', 'Bold Italic']], (S.bold ? 'b' : '') + (S.italic ? 'i' : ''));
  const size = mk('input', 'fd-size');
  size.type = 'text'; size.inputMode = 'decimal'; size.value = String(Math.round(S.size * 100) / 100);
  const dl = mk('datalist'); dl.id = 'fd-sizes';
  const list = S.sizeSel ? F.sizeList(base).map((x) => x.pt) : (S.st.docSizes === 'any' ? [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24] : S.st.docSizes || [base]);
  for (const v of [...new Set(list)]) dl.append(new Option(String(v)));
  size.setAttribute('list', 'fd-sizes');
  const colors = [['', 'Automatic'], ...STANDARD_COLORS.map(([n]) => [n, colorName(n)]), ...BASE_COLORS.filter(([n]) => !STANDARD_COLORS.some(([m]) => m === n)).map(([n]) => [n, n])];
  for (const t of app.docColors()) colors.splice(1, 0, [t.name, t.name + ' (this document\'s)']);
  if (S.color && !colors.some(([v]) => v === S.color)) colors.push([S.color, S.colorHtml ? '#' + S.color : S.color]);
  const color = select(colors, S.color);
  const under = select([['', '(none)'], ...Object.entries(F.UNDERLINES).map(([k, v]) => [k, v])], S.underline);
  const ulc = select([['', 'Automatic'], ...STANDARD_COLORS.filter(([n]) => !/[A-Z]/.test(n[0]) || true).map(([n]) => [n, colorName(n)])], S.ulColor);
  const grid = mk('div', 'fd-grid');
  grid.append(field('Font name', fam), field('Font style', style), field('Size', size, 'fd-sz'), field('Font color', color), field('Underline style', under), field('Underline color', ulc));
  grid.append(dl);
  const scope = mk('p', 'fd-note', S.sel ? 'OK formats the selected text; Set As Default makes the font and size the document\'s.' : 'OK formats the word at the caret (or what you type there next); Set As Default makes the font and size the document\'s.');
  const eff = mk('fieldset', 'fd-eff');
  eff.append(mk('legend', '', 'Effects'));
  const boxes = {};
  for (const [k, name] of EFFECTS) { const b = check(name, S[k]); boxes[k] = b.i; eff.append(b.row); }
  // (one of each pair: Word's rule)
  const pair = (x, y) => { boxes[x].addEventListener('change', () => { if (boxes[x].checked) boxes[y].checked = false; show(); }); };
  pair('strike', 'dstrike'); pair('dstrike', 'strike'); pair('sup', 'sub'); pair('sub', 'sup');
  const pv = mk('div', 'fd-pv');
  pv.setAttribute('aria-label', 'Preview'); pv.setAttribute('role', 'img');
  const pvt = mk('span', 'fd-pvt', words || 'The quick brown fox');
  pv.append(pvt);
  P1.append(grid, scope, eff, pv);

  // ---- Advanced
  const spMode = select([['', 'Normal'], ['e', 'Expanded'], ['c', 'Condensed']], S.spacing > 0 ? 'e' : S.spacing < 0 ? 'c' : '');
  const spBy = num(Math.abs(S.spacing) / 100 * (base / 10) || 1, 0.1, 0, 20);
  const scale = select([['100', '100%'], ['200', '200%'], ['150', '150%'], ['90', '90%'], ['80', '80%'], ['66', '66%'], ['50', '50%'], ['33', '33%']], String(S.scale));
  if (!scale.value) { scale.add(new Option(S.scale + '%', String(S.scale))); scale.value = String(S.scale); }
  const posMode = select([['', 'Normal'], ['r', 'Raised'], ['l', 'Lowered']], S.position > 0 ? 'r' : S.position < 0 ? 'l' : '');
  const posBy = num(Math.abs(S.position) || 3, 0.5, 0, 100);
  const msrc = app.src(app.main), end = preambleEnd(msrc);
  const hasMt = end >= 0 && packages(msrc, end).some((x) => x.names.some((n) => n.name === 'microtype'));
  const noLig = end >= 0 && msrc.slice(0, end).includes(LIGS);
  const kern = check('Kerning and protrusion for the document (microtype)', hasMt);
  const ligs = select([['std', 'Standard'], ['none', 'None']], noLig ? 'none' : 'std');
  const xe = F.usesFontspec(msrc, app.engineChoice ? app.engineChoice() : 'auto');
  if (xe) { ligs.disabled = true; ligs.title = 'Under fontspec a font\'s ligatures are set with Ligatures= where it is loaded'; }
  const ga = mk('div', 'fd-grid');
  ga.append(field('Spacing', spMode), field('Spacing by (pt)', spBy), field('Scale', scale), field('Position', posMode), field('Position by (pt)', posBy), field('Ligatures', ligs));
  P2.append(mk('p', 'fd-note', 'Character spacing: \\textls (microtype); scale: \\scalebox; position: \\raisebox.'), ga, kern.row);
  pick('font');

  // ---- the preview: the choices drawn as the page draws them
  const show = () => {
    const f = F.FONTS.find((x) => x.id === fam.value) || F.GENERIC.find((x) => x.id === fam.value);
    pvt.className = 'fd-pvt' + (f && f.look ? ' y-ff-' + f.look : '');
    const sz = parseFloat(size.value.replace(',', '.'));
    pvt.style.fontSize = sz > 0 && sz < 100 ? Math.min(40, sz * 1.5) + 'px' : '';
    pvt.style.fontWeight = /b/.test(style.value) ? '700' : '400';
    pvt.style.fontStyle = /i/.test(style.value) ? 'italic' : 'normal';
    pvt.style.color = color.value ? hexOf(color.value) : '';
    const deco = [under.value ? 'underline' : '', boxes.strike.checked || boxes.dstrike.checked ? 'line-through' : ''].filter(Boolean).join(' ');
    pvt.style.textDecorationLine = deco || 'none';
    pvt.style.textDecorationStyle = { uuline: 'double', uwave: 'wavy', dashuline: 'dashed', dotuline: 'dotted' }[under.value] || (boxes.dstrike.checked ? 'double' : 'solid');
    pvt.style.textDecorationColor = ulc.value && under.value ? hexOf(ulc.value) : '';
    pvt.style.fontVariant = boxes.smallcaps.checked ? 'small-caps' : 'normal';
    pvt.style.textTransform = boxes.allcaps.checked ? 'uppercase' : 'none';
    pvt.style.verticalAlign = boxes.sup.checked ? 'super' : boxes.sub.checked ? 'sub' : posMode.value ? (posMode.value === 'r' ? '' : '') : 'baseline';
    pvt.style.position = 'relative';
    pvt.style.top = posMode.value === 'r' ? -(+posBy.value || 0) + 'px' : posMode.value === 'l' ? (+posBy.value || 0) + 'px' : '0';
    pvt.style.letterSpacing = spMode.value ? (spMode.value === 'c' ? '-' : '') + (+spBy.value || 0) + 'px' : 'normal';
    pvt.style.display = 'inline-block';
    pvt.style.transform = scale.value !== '100' ? 'scaleX(' + (+scale.value / 100) + ')' : '';
  };
  for (const x of [fam, style, size, color, under, ulc, spMode, spBy, scale, posMode, posBy]) { x.addEventListener('input', show); x.addEventListener('change', show); }
  for (const k of ['smallcaps', 'allcaps']) boxes[k].addEventListener('change', show);
  show();

  // ---- the buttons
  const row = mk('div', 'fd-btns');
  const def = mk('button', 'btn ghost sm', 'Set As Default');
  def.type = 'button'; def.title = 'The font and size chosen become the document\'s (its font package and its class\'s size)';
  const ok = mk('button', 'btn sm', 'OK'); ok.type = 'button';
  const cancel = mk('button', 'btn ghost sm', 'Cancel'); cancel.type = 'button';
  row.append(def, mk('span', 'grow'), ok, cancel);
  p.append(tabs, P1, P2, row);
  cancel.addEventListener('click', () => { app.closePop(); app.fbxBack(); });
  const want = () => ({
    family: fam.value, size: parseFloat(size.value.replace(',', '.')), bold: /b/.test(style.value), italic: /i/.test(style.value), color: color.value, underline: under.value, ulColor: ulc.value,
    ...Object.fromEntries(EFFECTS.map(([k]) => [k, boxes[k].checked])),
    spacing: spMode.value ? Math.round((spMode.value === 'c' ? -1 : 1) * (+spBy.value || 0) * 100 / (base / 10)) : 0,
    scale: +scale.value || 100, position: posMode.value ? (posMode.value === 'l' ? -1 : 1) * (+posBy.value || 0) : 0,
    kern: kern.i.checked, ligs: ligs.value
  });
  def.addEventListener('click', () => {
    const W = want();
    app.closePop(); app.fbxBack();
    const doc = [];
    if (F.FONTS.some((x) => x.id === W.family) && W.family !== S.st.docFont.id) doc.push((t) => F.docFontEdits(t, W.family, app.engineChoice ? app.engineChoice() : 'auto') || []);
    if (W.size > 0 && Math.abs(W.size - base) > 0.01) doc.push((t) => F.docSizeEdits(t, W.size) || []);
    if (doc.length) app.fmtCommit([], { doc });
    app.ribbonSync();
  });
  ok.addEventListener('click', () => {
    const W = want();
    app.closePop(); app.fbxBack();
    applyFont(app, S, W);
    app.ribbonSync();
  });
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') { e.preventDefault(); ok.click(); } });
  app.positionPop();
  fam.focus();
  return true;
}

// Only what changed from S to W, in one commit
function applyFont(app, S, W) {
  const steps = [], doc = [];
  const tog = (g, o) => steps.push((t, a, b) => { const r = F.toggle(t, a, b, g, o); return r.error ? r : { ...r, need: r.on ? F.needsOf(g, r.w || { cmd: '' }) : null }; });
  const set = (g, w) => steps.push((t, a, b) => { const r = F.setValue(t, a, b, g, w); return !r || r.error ? r : { ...r, need: r.on ? F.needsOf(g, r.w || w) : null }; });
  const engine = app.engineChoice ? app.engineChoice() : 'auto';
  if (W.family !== S.family) {
    if (!S.fontSel) { if (F.FONTS.some((x) => x.id === W.family)) doc.push((t) => F.docFontEdits(t, W.family, engine) || []); }
    else set('family', W.family ? F.familyWrapper(W.family, S.st.fontspec) : null);
  }
  if (W.size > 0 && W.size <= 400 && Math.abs(W.size - S.size) > 0.01) {
    if (!S.sizeSel) doc.push((t) => F.docSizeEdits(t, W.size) || []);
    else { const w = F.sizeWrapper(S.st.base, W.size); set('size', w.cmd === 'normalsize' ? null : w); }
  }
  if (W.bold !== S.bold) tog('bold');
  if (W.italic !== S.italic) tog('italic');
  if (W.color !== S.color) {
    if (!W.color) set('color', null);
    else { const w = { cmd: 'textcolor', args: [W.color] }; w.declAlt = { cmd: 'color', args: w.args, decl: true }; set('color', w); }
  }
  if (W.underline !== S.underline || W.ulColor !== S.ulColor) {
    if (!W.underline) set('underline', null);
    else if (W.ulColor && W.underline === 'uline') set('underline', { cmd: 'culine', args: [W.ulColor] });
    else set('underline', { cmd: W.underline });
  }
  for (const [k] of EFFECTS) if (W[k] !== S[k]) tog(k, k === 'sup' ? { other: 'sub' } : k === 'sub' ? { other: 'sup' } : k === 'strike' ? { other: 'dstrike' } : k === 'dstrike' ? { other: 'strike' } : {});
  if (W.spacing !== S.spacing) set('spacing', W.spacing ? { cmd: 'textls', opt: String(W.spacing) } : null);
  if (W.scale !== S.scale) set('scale', W.scale !== 100 ? { cmd: 'scalebox', args: [String(W.scale / 100)], opt2: '1' } : null);
  if (W.position !== S.position) set('position', W.position ? { cmd: 'raisebox', args: [W.position + 'pt'] } : null);
  // the document's kerning and ligatures
  const msrc = app.src(app.main), end = preambleEnd(msrc);
  const hasMt = end >= 0 && packages(msrc, end).some((x) => x.names.some((n) => n.name === 'microtype'));
  if (W.kern && !hasMt) steps.push((t, a, b) => ({ text: t, a, b, need: { pkgs: { microtype: null } } }));
  if (!W.kern && hasMt) doc.push((t) => dropLine(t, /^\\usepackage(\[[^\]\n]*\])?\{microtype\}[ \t]*\r?\n/m));
  const noLig = end >= 0 && msrc.slice(0, end).includes(LIGS);
  if (W.ligs === 'none' && !noLig) { steps.push((t, a, b) => ({ text: t, a, b, need: { pkgs: { microtype: null } } })); doc.push((t) => addLine(t, LIGS)); }
  if (W.ligs === 'std' && noLig) doc.push((t) => dropLine(t, new RegExp('^' + LIGS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*\\r?\\n', 'm')));
  if (!steps.length && !doc.length) return false;
  return app.fmtCommit(steps, { doc, word: 'inside' });
}
// a line of the preamble taken out, or put in after the packages
function dropLine(t, re) {
  const end = preambleEnd(t);
  if (end < 0) return [];
  const m = re.exec(t.slice(0, end));
  return m ? [{ s: m.index, e: m.index + m[0].length, t: '' }] : [];
}
function addLine(t, line) {
  const end = preambleEnd(t);
  if (end < 0 || t.slice(0, end).includes(line)) return [];
  const ps = packages(t, end).filter((p) => p.cmd === 'usepackage');
  const at = ps.length ? ps[ps.length - 1].line[1] : end;
  return [{ s: at, e: at, t: (at > 0 && t[at - 1] !== '\n' ? '\n' : '') + line + '\n' }];
}

// ---- Phonetic Guide: a reading over the selected characters --------------------------------
export function openRubyDialog(app) {
  const at = app.ribbonAt();
  if (!at || !at.c || at.c.ghost || at.c.collapsed) return false;
  const s0 = getSelection();
  if (s0.rangeCount && app.root.contains(s0.anchorNode)) app.rbRange = s0.getRangeAt(0).cloneRange();
  const src = app.src(at.c.f);
  const W = F.around(src, at.c.a, at.c.b, 'ruby');
  const p = dialog(app, { title: 'Phonetic Guide', cls: 'pop-ruby', anchor: null, rect: new DOMRect(Math.max(8, innerWidth / 2 - 200), 120, 0, 0) });
  const base = mk('input'); base.type = 'text'; base.readOnly = true; base.value = String(s0).trim().slice(0, 80);
  const reading = mk('input'); reading.type = 'text'; reading.autocomplete = 'off';
  if (W) { const z = src.slice(W.e).match(/^\s*\{([^{}]{0,200})\}/); if (z) reading.value = z[1]; }
  const ok = mk('button', 'btn sm', 'OK'); ok.type = 'button';
  const cancel = mk('button', 'btn ghost sm', 'Cancel'); cancel.type = 'button';
  const row = mk('div', 'fd-btns');
  row.append(mk('span', 'grow'), ok, cancel);
  p.append(field('Base text', base), field('Ruby text', reading), mk('p', 'fd-note', 'Written as \\ruby{base}{reading}: luatexja-ruby under LuaLaTeX with luatexja, else a definition of its own in the preamble.'), row);
  cancel.addEventListener('click', () => { app.closePop(); app.fbxBack(); });
  const go = () => {
    const r = reading.value.trim();
    app.closePop(); app.fbxBack();
    if (!r) return;
    const msrc = app.src(app.main), end = preambleEnd(msrc);
    const ltj = end >= 0 && packages(msrc, end).some((x) => x.names.some((n) => /^luatexja/.test(n.name)));
    const need = ltj ? { pkgs: { 'luatexja-ruby': null } } : { defs: ['ruby'] };
    const t = escapeTeX(r, ' ');
    app.fmtCommit([(text, a, b) => {
      const X = F.around(text, a, b, 'ruby');
      if (X) {
        // a reading there already: the new one in its place
        const m = /^(\s*\{)([^{}]{0,200})\}/.exec(text.slice(X.e));
        if (m) { const s = X.e + m[1].length; return { text: text.slice(0, s) + t + text.slice(s + m[2].length), a, b, need }; }
      }
      const r2 = F.wrapIn(text, a, b, 'ruby', { cmd: 'ruby' });
      if (r2.error) return r2;
      // the reading after the base's braces
      const close = r2.b + 1;
      return { text: r2.text.slice(0, close) + '{' + t + '}' + r2.text.slice(close), a: r2.a, b: r2.b, need };
    }]);
    app.ribbonSync();
  };
  ok.addEventListener('click', go);
  reading.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  app.positionPop();
  reading.focus();
  return true;
}

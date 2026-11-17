// Word's content controls as PDF form fields, which hyperref writes: a text field (\TextField), a
// check box (\CheckBox), a drop-down list or a combo box (\ChoiceMenu) and a date (a \TextField
// whose format Acrobat's date functions keep), inside hyperref's Form environment (one in a
// document; Rikuy makes it round the fields it writes, or writes into the one there is). Pure:
// what each control writes, the names already taken, and the reading of a field the page draws.

export const CONTROLS = [
  ['text', 'Plain Text Content Control', 'A box to type text in (hyperref\'s \\TextField)'],
  ['check', 'Check Box Content Control', 'A box to tick (\\CheckBox)'],
  ['combo', 'Combo Box Content Control', 'A list to pick from or type in (\\ChoiceMenu[combo])'],
  ['list', 'Drop-Down List Content Control', 'A list to pick from (\\ChoiceMenu)'],
  ['date', 'Date Picker Content Control', 'A date, kept as dd/mm/yyyy by the PDF reader (\\TextField with a date format)']
];
export const CMDS = new Set(['TextField', 'CheckBox', 'ChoiceMenu', 'PushSubmit', 'PushButton', 'PushReset']);
const PREFIX = { text: 'text', check: 'check', combo: 'combo', list: 'list', date: 'date' };

// the names fields of the text have, so a new one is not the same (hyperref's fields share a
// value where their names are the same). Bounded: the first 2000 names.
export function fieldNames(src) {
  const out = new Set();
  const re = /\\(?:TextField|CheckBox|ChoiceMenu)\s*\[([^\]\n]{0,400})\]/g;
  let m, n = 0;
  while ((m = re.exec(src)) && n++ < 2000) { const k = /(?:^|,)\s*name\s*=\s*\{?([A-Za-z0-9_.-]{1,60})/.exec(m[1]); if (k) out.add(k[1]); }
  return out;
}
const freeName = (src, kind) => { const used = fieldNames(src); let k = 1; while (used.has(PREFIX[kind] + k)) k++; return PREFIX[kind] + k; };
// a word typed into a label or a choice, safe as TeX (escape: the page's own typing escape)
const choice = (t, escape) => escape(String(t).replace(/[,=\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80));

// The LaTeX of a control: o.label (typed text), o.items (for the lists), o.escape (text to TeX)
export function controlTex(kind, src, o = {}) {
  const esc = o.escape || ((t) => String(t).replace(/[\\{}$&#^_%~]/g, (x) => '\\' + x));
  const label = o.label ? choice(o.label, esc) : '';
  const name = 'name=' + freeName(src, kind);
  if (kind === 'text') return '\\TextField[' + name + ', width=4cm]{' + label + '}';
  if (kind === 'date') return '\\TextField[' + name + ', width=3cm, format={AFDate_FormatEx("dd/mm/yyyy");}, keystroke={AFDate_KeystrokeEx("dd/mm/yyyy");}]{' + label + '}';
  if (kind === 'check') return '\\CheckBox[' + name + ']{' + label + '}';
  if (kind === 'combo' || kind === 'list') {
    const items = (o.items && o.items.length ? o.items : ['Choose an item', 'Item 1', 'Item 2']).map((x) => choice(x, esc)).filter(Boolean).slice(0, 50);
    return '\\ChoiceMenu[' + (kind === 'combo' ? 'combo, ' : '') + name + ', width=4cm]{' + label + '}{' + (items.length ? items : ['Item']).join(',') + '}';
  }
  return null;
}

// The body's environments read as TeX reads them (comments and verbatim skipped, nesting
// counted): { body: [s, e] of the text between \begin{document} and \end{document}, forms: [{ s,
// inner, endS, e, depth (of its \begin), endDepth (of its \end) }] }, or null without a body.
// Bounded: 200 000 commands of a stranger's text.
const VERB = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'comment', 'Verbatim', 'alltt']);
export function formScan(src) {
  const b = /\\begin\s*\{document\}/.exec(src);
  if (!b) return null;
  // (\verb|…| and \lstinline|…| are words, whatever they hold)
  const re = /\\(begin|end)\s*\{([^{}\n]{1,40})\}|\\(?:verb\*?|lstinline(?:\[[^\]\n]{0,80}\])?)([^A-Za-z\s*{])[^\n]{0,400}?\3|%[^\n]*|\\[\\%{}]/g;
  re.lastIndex = b.index + b[0].length;
  const stack = [], forms = [];
  let m, n = 0, end = src.length;
  while ((m = re.exec(src)) && n++ < 200000) {
    if (m[0][0] === '%' || !m[1]) continue;
    const name = m[2].trim();
    if (m[1] === 'begin') {
      if (VERB.has(name)) { const z = src.indexOf('\\end{' + name + '}', re.lastIndex); re.lastIndex = z < 0 ? src.length : z + name.length + 6; continue; }
      if (name === 'Form') forms.push({ s: m.index, inner: re.lastIndex, endS: -1, e: -1, depth: stack.length });
      stack.push({ name, f: name === 'Form' ? forms[forms.length - 1] : null });
      continue;
    }
    if (name === 'document') { end = m.index; break; }
    // (an \end closes the nearest \begin of its name; what lies open above it closes with it, as
    // LaTeX would complain)
    let k = stack.length - 1;
    while (k >= 0 && stack[k].name !== name) k--;
    if (k < 0) continue;
    const top = stack[k];
    stack.length = k;
    if (top.f) { top.f.endS = m.index; top.f.e = re.lastIndex; top.f.endDepth = k; }
  }
  return { body: [b.index + b[0].length, end], forms };
}

// The edits that put place at (in the text of src, or null for another file) inside the one Form
// a document has: none where a Form holds it already; a Form round the whole text where there is
// none; the Form's tag moved to the text's edge where it is the only one and both its tags stand
// at the text's top level. Else { error }: the field goes in where it is, outside a Form.
export function formEdits(src, at) {
  const S = formScan(src);
  if (!S) return [];
  const eol = /\r\n/.test(src.slice(0, 4000)) ? '\r\n' : '\n';
  const [bs, be] = S.body;
  // (the Form's first line after \begin{document}'s; its \end on a line of its own before \end{document})
  const openAt = () => { let p = bs; while (src[p] === ' ' || src[p] === '\t') p++; if (src[p] === '\r') p++; if (src[p] === '\n') return { s: p + 1, t: '\\begin{Form}' + eol }; return { s: bs, t: eol + '\\begin{Form}' + eol }; };
  const closeAt = () => { const ls = src.lastIndexOf('\n', be - 1) + 1; return src.slice(ls, be).trim() ? { s: be, t: eol + '\\end{Form}' + eol } : { s: ls, t: '\\end{Form}' + eol }; };
  const F = S.forms.filter((x) => x.e > 0);
  if (!S.forms.length) { const o = openAt(), c = closeAt(); return [{ s: o.s, e: o.s, t: o.t }, { s: c.s, e: c.s, t: c.t }]; }
  if (at != null && F.some((x) => at >= x.inner && at <= x.endS)) return [];
  if (at == null) return [];
  const one = S.forms.length === 1 && F.length === 1 && F[0].depth === 0 && F[0].endDepth === 0 ? F[0] : null;
  if (!one) return { error: 'The document has ' + (S.forms.length > 1 ? 'more than one Form' : 'a Form inside another environment') + ': the field went in where the caret is, outside it. Move it into the Form, or the Form round it (XeLaTeX leaves a field outside a Form out of the PDF\'s form).' };
  const line = (s0, e0) => { let a = s0, z = e0; while (a > 0 && (src[a - 1] === ' ' || src[a - 1] === '\t')) a--; while (z < src.length && (src[z] === ' ' || src[z] === '\t')) z++; if ((a === 0 || src[a - 1] === '\n') && (src[z] === '\n' || src.slice(z, z + 2) === '\r\n')) return { s: a, e: z + (src[z] === '\r' ? 2 : 1) }; return { s: s0, e: e0 }; };
  if (at < one.s) { const o = openAt(); return [{ s: o.s, e: o.s, t: o.t }, { ...line(one.s, one.inner), t: '' }]; }
  const c = closeAt();
  return [{ ...line(one.endS, one.e), t: '' }, { s: c.s, e: c.s, t: c.t }];
}

// A field as the page draws it, from its command's options and arguments (args: the texts of
// its optional and mandatory arguments, in order): { kind, label (source range of the label),
// width (TeX's length text), choices, checked, combo }
export function readField(name, opt, n) {
  const kv = Object.create(null);
  for (const part of String(opt || '').slice(0, 600).split(',')) {
    const k = /^\s*([A-Za-z]+)\s*(?:=\s*(.*?))?\s*$/.exec(part);
    if (k) kv[k[1]] = k[2] == null ? true : k[2].replace(/^\{|\}$/g, '');
  }
  const kind = name === 'CheckBox' ? 'check' : name === 'ChoiceMenu' ? (kv.combo ? 'combo' : 'list') : /AFDate/.test(String(kv.format || '')) ? 'date' : 'text';
  return { kind, width: typeof kv.width === 'string' ? kv.width : null, checked: kv.checked === true || kv.checked === 'true', value: typeof kv.value === 'string' ? kv.value.slice(0, 200) : typeof kv.default === 'string' ? kv.default.slice(0, 200) : '', n };
}

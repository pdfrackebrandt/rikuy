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

// hyperref's Form environment round the caret's place: { s, e } of the one in the text, or null
export function formEnv(src) {
  const b = /\\begin\s*\{Form\}/.exec(src);
  if (!b) return null;
  const e = /\\end\s*\{Form\}/.exec(src.slice(b.index));
  return { s: b.index, e: e ? b.index + e.index + e[0].length : src.length, inner: b.index + b[0].length };
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

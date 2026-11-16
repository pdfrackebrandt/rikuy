// Quick Parts (Word's building blocks): pieces of LaTeX a person saves from a selection and puts in
// again anywhere, in any document, kept in this browser beside the person's other settings (as
// the equation gallery keeps saved equations). Pure: the list read back and checked (it is the
// browser's storage, which another page of this origin could have written), and the packages a
// part's commands need, so a part put into another document compiles there.

export const MAX_PARTS = 100, MAX_TEXT = 64000, MAX_NAME = 80;

// the list as kept, every entry checked: { name, tex } strings within their caps, names unique
export function readParts(list) {
  const out = [], seen = new Set();
  if (!Array.isArray(list)) return out;
  for (const x of list.slice(0, MAX_PARTS)) {
    if (!x || typeof x.name !== 'string' || typeof x.tex !== 'string') continue;
    const name = x.name.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_NAME);
    if (!name || seen.has(name) || !x.tex.trim() || x.tex.length > MAX_TEXT) continue;
    seen.add(name);
    out.push({ name, tex: x.tex });
  }
  return out;
}

// A name for a part from its text: its first words, as Word names one
export function partName(text) {
  const w = String(text).replace(/%[^\n]*/g, ' ').replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/[{}[\]$&#^_~\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return (w.split(' ').slice(0, 6).join(' ') || 'Quick Part').slice(0, MAX_NAME);
}

// the package each command or environment of a part needs (those Rikuy itself writes)
const CMD_PKG = { textcolor: 'xcolor', color: 'xcolor', colorbox: 'xcolor', fcolorbox: 'xcolor', cellcolor: 'xcolor', rowcolor: 'xcolor', includegraphics: 'graphicx', rotatebox: 'graphicx', scalebox: 'graphicx', resizebox: 'graphicx',
  href: 'hyperref', TextField: 'hyperref', CheckBox: 'hyperref', ChoiceMenu: 'hyperref', SI: 'siunitx', si: 'siunitx', num: 'siunitx', qty: 'siunitx', unit: 'siunitx', toprule: 'booktabs', midrule: 'booktabs', bottomrule: 'booktabs', cmidrule: 'booktabs',
  faIcon: 'fontawesome5', mathbb: 'amssymb', mathfrak: 'amssymb', checkmark: 'amssymb', eqref: 'amsmath', text: 'amsmath', smartdiagram: 'smartdiagram', lettrine: 'lettrine', multirow: 'multirow',
  thetitle: 'titling', theauthor: 'titling', thedate: 'titling', thistime: 'scrtime', csvautobooktabular: 'csvsimple' };
// (ulem's lines as the Font group writes them: ulem with normalem, else every \emph of the
// document is underlined; \dsout, \culine and the highlighter \hl are the Font group's own
// definitions, written in the preamble as it writes them: src/charfmt.js)
const ULEM = { ulem: { normalem: true } };
const CMD_NEED = { uline: { pkgs: ULEM }, uuline: { pkgs: ULEM }, uwave: { pkgs: ULEM }, sout: { pkgs: ULEM }, xout: { pkgs: ULEM }, dashuline: { pkgs: ULEM }, dotuline: { pkgs: ULEM },
  dsout: { pkgs: ULEM, defs: ['dsout'] }, culine: { pkgs: { ...ULEM, xcolor: null }, defs: ['culine'] }, hl: { pkgs: { ...ULEM, xcolor: null }, defs: ['hl'] } };
const ENV_PKG = { align: 'amsmath', 'align*': 'amsmath', gather: 'amsmath', 'gather*': 'amsmath', multline: 'amsmath', 'multline*': 'amsmath', cases: 'amsmath', pmatrix: 'amsmath', bmatrix: 'amsmath', tikzpicture: 'tikz', axis: 'pgfplots',
  tabularx: 'tabularx', longtable: 'longtable', multicols: 'multicol', 'multicols*': 'multicol', lstlisting: 'listings', wrapfigure: 'wrapfig', tcolorbox: 'tcolorbox', Form: 'hyperref' };
// (titling's commands are memoir's own, and beamer has \inserttitle)
export function partPackages(tex, cls = '') {
  const need = new Set();
  const t = String(tex).slice(0, MAX_TEXT);
  const re = /\\(?:begin\s*\{([A-Za-z*]{1,30})\}|([A-Za-z]{1,40}))/g;
  let m, n = 0;
  while ((m = re.exec(t)) && n++ < 5000) {
    const p = m[1] ? ENV_PKG[m[1]] : Object.hasOwn(CMD_PKG, m[2]) ? CMD_PKG[m[2]] : null;
    if (p && !(p === 'titling' && /^(memoir|beamer)$/.test(cls))) need.add(p);
  }
  // (pgfplots brings tikz; a tikzpicture of an axis needs pgfplots alone)
  if (need.has('pgfplots')) need.delete('tikz');
  return [...need];
}

// What a part needs in the preamble, as src/charfmt.js's preambleFor takes it: [{ pkgs, defs }]
export function partNeeds(tex, cls = '') {
  const out = partPackages(tex, cls).map((n) => ({ pkgs: { [n]: null } }));
  const t = String(tex).slice(0, MAX_TEXT), seen = new Set();
  const re = /\\([A-Za-z]{1,20})/g;
  let m, n = 0;
  while ((m = re.exec(t)) && n++ < 5000) if (Object.hasOwn(CMD_NEED, m[1]) && !seen.has(m[1])) { seen.add(m[1]); out.push(CMD_NEED[m[1]]); }
  return out;
}

// whether a part is a block of its own (paragraphs, an environment that stands alone), put after
// the caret's paragraph, or words put at the caret
export const partIsBlock = (tex) => /\n[ \t]*\n/.test(tex) || /^\s*\\(begin\s*\{(?!Form\})|section|subsection|chapter|paragraph\b)/.test(tex);

// The selection grown to whole groups, so a part keeps the formatting round its words (Word keeps
// the formatting of what was selected): a group the selection starts inside takes in its command
// and the arguments before it (\textcolor{red}{wor|ld}), one it ends inside is closed. [a, b], or
// null where it cannot be made whole within 64 000 characters (a selection across math's $).
export function wholeGroups(src, a, b) {
  const lim = Math.max(0, a - MAX_TEXT), end = Math.min(src.length, b + MAX_TEXT);
  const closeOf = (i) => { let d = 0; for (let k = i; k < end; k++) { const ch = src[k]; if (ch === '\\') { k++; continue; } if (ch === '{') d++; else if (ch === '}' && --d === 0) return k; } return -1; };
  const openOf = (i) => { let d = 0; for (let k = i - 1; k >= lim; k--) { const ch = src[k]; if (src[k - 1] === '\\' && src[k - 2] !== '\\') continue; if (ch === '}') d++; else if (ch === '{') { if (d === 0) return k; d--; } } return -1; };
  for (let n = 0; n < 40; n++) {
    let open = -1, closeAt = false, dollars = 0;
    const stack = [];
    for (let i = a; i < b; i++) {
      const ch = src[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '$') dollars++;
      if (ch === '{') stack.push(i);
      else if (ch === '}') { if (stack.length) stack.pop(); else closeAt = true; }
    }
    if (dollars % 2) return null;
    if (!closeAt && !stack.length) return [a, b];
    if (stack.length) { open = stack[0]; const z = closeOf(open); if (z < 0) return null; b = z + 1; continue; }
    // (a group round the start: from its command, over the arguments before it)
    let o = openOf(a);
    if (o < 0) return null;
    for (let guard = 0; guard < 10; guard++) {
      let k = o - 1;
      while (k >= lim && /\s/.test(src[k]) && src[k] !== '\n') k--;
      if (src[k] === '}') { const p = openOf(k); if (p < 0) break; o = p; continue; }
      if (src[k] === ']') { const p = src.lastIndexOf('[', k); if (p < 0 || k - p > 400) break; o = p; continue; }
      break;
    }
    let k = o - 1;
    while (k >= lim && /[A-Za-z@*]/.test(src[k])) k--;
    a = src[k] === '\\' && k < o - 1 ? k : o;
  }
  return null;
}

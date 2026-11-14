// Insert › Symbol: the symbols Word's grid offers, each as the LaTeX every engine prints (the
// kernel's text commands, textcomp's in it since 2020), the ones used last first; and More
// Symbols, a dialog with a search box and Word's Special Characters tab (dashes, the spaces and
// hyphens that do not break, the marks), each with its keys. Names are the Unicode names, said to
// screen readers and agents; the grid draws the character itself.

import { dialog } from './kit.js';
import { mk } from './dom.js';

// [character, LaTeX, name]
export const SYMBOLS = [
  ['©', '\\copyright{}', 'Copyright sign'], ['®', '\\textregistered{}', 'Registered sign'], ['™', '\\texttrademark{}', 'Trade mark sign'],
  ['§', '\\S{}', 'Section sign'], ['¶', '\\P{}', 'Pilcrow sign'], ['°', '\\textdegree{}', 'Degree sign'],
  ['€', '\\texteuro{}', 'Euro sign'], ['£', '\\pounds{}', 'Pound sign'], ['¥', '\\textyen{}', 'Yen sign'], ['¢', '\\textcent{}', 'Cent sign'],
  ['†', '\\dag{}', 'Dagger'], ['‡', '\\ddag{}', 'Double dagger'], ['•', '\\textbullet{}', 'Bullet'], ['‰', '\\textperthousand{}', 'Per mille sign'],
  ['…', '\\ldots{}', 'Ellipsis'], ['–', '--', 'En dash'], ['—', '---', 'Em dash'],
  ['±', '\\textpm{}', 'Plus minus sign'], ['×', '\\texttimes{}', 'Multiplication sign'], ['÷', '\\textdiv{}', 'Division sign'],
  ['µ', '\\textmu{}', 'Micro sign'], ['½', '\\textonehalf{}', 'Vulgar fraction one half'], ['¼', '\\textonequarter{}', 'Vulgar fraction one quarter'],
  ['¾', '\\textthreequarters{}', 'Vulgar fraction three quarters'], ['№', '\\textnumero{}', 'Numero sign'],
  ['←', '\\textleftarrow{}', 'Leftwards arrow'], ['→', '\\textrightarrow{}', 'Rightwards arrow'], ['↑', '\\textuparrow{}', 'Upwards arrow'], ['↓', '\\textdownarrow{}', 'Downwards arrow'],
  ['√', '\\textsurd{}', 'Square root'], ['¬', '\\textlnot{}', 'Not sign'], ['¡', '!`', 'Inverted exclamation mark'], ['¿', '?`', 'Inverted question mark'],
  ['∞', '\\ensuremath{\\infty}', 'Infinity'], ['≈', '\\ensuremath{\\approx}', 'Almost equal to'], ['≠', '\\ensuremath{\\neq}', 'Not equal to'],
  ['≤', '\\ensuremath{\\leq}', 'Less than or equal to'], ['≥', '\\ensuremath{\\geq}', 'Greater than or equal to'],
  ['α', '\\ensuremath{\\alpha}', 'Greek small letter alpha'], ['β', '\\ensuremath{\\beta}', 'Greek small letter beta'], ['π', '\\ensuremath{\\pi}', 'Greek small letter pi'],
  ['Ω', '\\ensuremath{\\Omega}', 'Greek capital letter omega'], ['✓', '\\ensuremath{\\checkmark}', 'Check mark']
];
// Word's Special Characters tab: [name, LaTeX, command id (its keys)]
export const SPECIAL = [
  ['Em dash', '---', 'insert-em-dash'], ['En dash', '--', 'insert-en-dash'], ['Nonbreaking hyphen', '\\nobreakdash-', 'insert-nb-hyphen'],
  ['Optional hyphen', '\\-', 'optional-hyphen'], ['Nonbreaking space', '~', 'insert-nbsp'], ['Copyright', '\\copyright{}', 'insert-copyright'],
  ['Registered', '\\textregistered{}', 'insert-registered'], ['Trademark', '\\texttrademark{}', 'insert-trademark'], ['Section', '\\S{}', null],
  ['Paragraph', '\\P{}', null], ['Ellipsis', '\\ldots{}', 'insert-ldots'], ['Single opening quote', '`', null], ['Single closing quote', "'", null],
  ['Double opening quote', '``', null], ['Double closing quote', "''", null]
];

// More Symbols: insert(latex, character) writes one; keysOf(id) says a command's keys
export function openSymbols(app, insert, keysOf) {
  const p = dialog(app, { title: 'Symbol', cls: 'pop-sym', rect: new DOMRect(Math.max(8, innerWidth / 2 - 240), 90, 0, 0) });
  const tabs = mk('div', 'fd-tabs');
  tabs.setAttribute('role', 'tablist');
  const panels = [];
  const tab = (name, panel) => {
    const b = mk('button', 'fd-tab', name);
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { for (const t of tabs.children) t.setAttribute('aria-selected', String(t === b)); for (const x of panels) x.hidden = x !== panel; });
    tabs.append(b); panels.push(panel);
    return b;
  };
  const sym = mk('div', 'fd-panel');
  const q = mk('input', 'gd-in');
  q.type = 'search'; q.placeholder = 'Search: euro, arrow, degree'; q.setAttribute('aria-label', 'Search symbols');
  const grid = mk('div', 'sym-grid');
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-label', 'Symbols');
  const fill = () => {
    grid.textContent = '';
    const w = q.value.trim().toLowerCase();
    for (const [ch, tex, name] of SYMBOLS) {
      if (w && !name.toLowerCase().includes(w) && !tex.toLowerCase().includes(w) && ch !== w) continue;
      const b = mk('button', 'sym-b', ch);
      b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-label', name); b.title = name + ': ' + tex;
      b.addEventListener('click', () => { app.closePop(); insert(tex, ch); });
      grid.append(b);
    }
  };
  q.addEventListener('input', fill);
  sym.append(q, grid);
  const spec = mk('div', 'fd-panel sym-special');
  spec.hidden = true;
  for (const [name, tex, id] of SPECIAL) {
    const b = mk('button', 'nav-act sym-row');
    b.type = 'button';
    b.setAttribute('aria-label', name);
    b.append(mk('span', 'mi-n', name), mk('span', 'mi-k', (id && keysOf(id)) || ''));
    b.title = name + ': ' + tex;
    b.addEventListener('click', () => { app.closePop(); insert(tex, name); });
    spec.append(b);
  }
  const t1 = tab('Symbols', sym);
  tab('Special Characters', spec);
  t1.setAttribute('aria-selected', 'true'); tabs.lastChild.setAttribute('aria-selected', 'false');
  p.append(tabs, sym, spec);
  fill();
  app.positionPop();
  if (!matchMedia('(pointer: coarse)').matches) q.focus();
  return p;
}

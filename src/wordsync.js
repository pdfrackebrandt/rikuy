// The text a Word file gets, block by block, lined up with the source that made it: what export
// keeps in the .docx (src/wordast.js makes the blocks, src/wordjobs.js the file) so that a
// coauthor's edits can be brought back into the .tex.
import { diffSeq } from './diff.js';
import { unpackRuns } from './wordast.js';

const RO = -1, ATOM = -2;

// ---- export: the map of the text as Word got it ------------------------------------------------

// The text pandoc wrote can differ from what the page showed (a citation as the citation style
// writes it, a space after a footnote's number): the two are lined up character by character and
// what pandoc added takes the atom it replaced, or is marked generated.
export function alignRuns(exp, actual) {
  const em = unpackRuns(exp.runs);
  if (exp.text === actual) return exp.runs;
  const ops = diffSeq([...exp.text].map(cu), [...actual].map(cu));
  const out = [];
  let ei = 0, del = [], add = 0;
  const flush = () => {
    if (add) {
      const atoms = new Set(del.filter(([s]) => s === ATOM).map(([, a]) => a));
      const one = atoms.size === 1 && del.every(([s]) => s === ATOM || s === RO) ? [...atoms][0] : null;
      for (let k = 0; k < add; k++) { if (one != null) out.push(ATOM, one); else out.push(RO, RO); }
    }
    del = []; add = 0;
  };
  for (const [op, ch] of ops) {
    const n = ch.length; // code units: an astral character is one element, two units
    if (op === ' ') { flush(); for (let k = 0; k < n; k++) { out.push(em[2 * ei], em[2 * ei + 1]); ei++; } }
    else if (op === '-') { for (let k = 0; k < n; k++) { del.push([em[2 * ei], em[2 * ei + 1]]); ei++; } }
    else add += n;
  }
  flush();
  return packMap(out);
}
const cu = (c) => c;

export function packMap(m) {
  const runs = [];
  for (let i = 0; i < m.length / 2;) {
    const s = m[2 * i], e = m[2 * i + 1];
    if (s === RO) { let n = 0; while (i < m.length / 2 && m[2 * i] === RO) { n++; i++; } runs.push([-1, n]); continue; }
    if (s === ATOM) { let n = 0; while (i < m.length / 2 && m[2 * i] === ATOM && m[2 * i + 1] === e) { n++; i++; } runs.push([-2, e, n]); continue; }
    if (e === s + 1) { let n = 0; while (i < m.length / 2 && m[2 * i] === s + n && m[2 * i + 1] === s + n + 1) { n++; i++; } runs.push([n, s]); continue; }
    runs.push([0, s, e]); i++;
  }
  return runs;
}

// ---- the data a .docx carries ------------------------------------------------------------------

// What the export keeps in the file (customXml): the source as it was, every block's text and map
export function exportData({ name, main, files, anchors, atoms, t, sig, app }) {
  return {
    rikuy: 1, app: app || 'Rikuy', t: t || Date.now(), name, main, sig: sig || '',
    files: [...files].filter(([n, x]) => typeof x === 'string'),
    anchors, atoms
  };
}

// The page as a Word file gets it (src/wordpage.js writes it there, in the Word worker): the
// paper, margins and columns from src/layout.js's numbers, in twips; the headers and footers in
// their three places, the page number and Page X of Y as Word's fields; the first page, the even
// pages, the numbers' format, line numbers, the page's colour and border. In the page's own
// thread: it reads the model and the main file.

import { geometry, hfRuns } from './layout.js';
import * as PS from './pagesrc.js';
import { BASE_COLORS, DVIPS_COLORS } from './ui/kit.js';

const TW = 20 * 72 / 72.27; // twips in a TeX point
const NAMED = Object.fromEntries([...BASE_COLORS, ...DVIPS_COLORS].map(([n, h]) => [n, h]));
// an xcolor colour as RRGGBB: a name, name!pct (with white), #RRGGBB; else null
export function hexOf(c) {
  c = String(c || '').trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(c)) return c.replace('#', '').toUpperCase();
  const m = /^([A-Za-z]+)(?:!(\d{1,3}))?$/.exec(c);
  if (!m || !NAMED[m[1]]) return null;
  const p = m[2] == null ? 100 : Math.min(100, +m[2]);
  const h = NAMED[m[1]];
  return [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * p / 100 + 255 * (100 - p) / 100).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// a place's TeX as Word's runs: text with its weight and shape, \thepage and LastPage as fields
function runsOf(tex, info = {}) {
  const out = [];
  // (control characters of the text out first: XML 1.0 has no place for them, and two stand for the fields here)
  // (R1: the title, author and file name as Word's TITLE, AUTHOR and FILENAME fields; the date as
  // it is written)
  for (const r of hfRuns(String(tex).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''), { page: '\u0001', total: '\u0002', info: { title: '\u0003', author: '\u0004', job: '\u0005', date: info.date || '' } })) {
    const parts = r.t.split(/([\u0001-\u0005])/);
    for (const p of parts) {
      if (!p) continue;
      const t = r.st.up ? p.toUpperCase() : p;
      const F = { '\u0001': 'PAGE', '\u0002': 'NUMPAGES', '\u0003': 'TITLE', '\u0004': 'AUTHOR', '\u0005': 'FILENAME' }[p];
      if (F) { const res = F === 'TITLE' ? info.title : F === 'AUTHOR' ? info.author : F === 'FILENAME' ? info.job : undefined; out.push(res === undefined ? { field: F, b: r.st.b, i: r.st.i } : { field: F, b: r.st.b, i: r.st.i, res }); }
      else out.push({ t, b: r.st.b, i: r.st.i });
    }
  }
  return out;
}
const FMT = { roman: 'lowerRoman', Roman: 'upperRoman', alph: 'lowerLetter', Alph: 'upperLetter', arabic: 'decimal' };

export function pageForWord(model, src) {
  const O = model.opts, g = geometry(O), page = O.page || {};
  const geo = O.geo || {};
  const gutter = geo.bindingoffset ? PS.lenPt(String(geo.bindingoffset)) || 0 : 0;
  // two sided pages with their margins swapped: Word's mirrored margins, inside and outside
  const mirror = !!g.twoside && Math.abs(g.ml - gutter - (g.mlE ?? g.ml)) > 0.5;
  const P = {
    w: g.pw * TW, h: g.ph * TW, land: !!g.land, mirror,
    margins: {
      top: g.mt * TW, bottom: (g.ph - g.mt - g.th) * TW, left: (g.ml - gutter) * TW,
      right: (mirror ? g.mlE : g.pw - g.ml - g.tw) * TW, gutter: gutter * TW,
      // (Word measures the header from the sheet's top to its top, the footer from the sheet's
      // foot to its foot; TeX the header's baseline headsep above the text, the footer's footskip under it)
      header: Math.max(0, g.mt - (g.headsep ?? 25) - g.pt) * TW, footer: Math.max(0, g.ph - g.mt - g.th - g.footskip - 2) * TW
    }
  };
  // columns of the whole document
  const body = PS.bodyRange(src || '');
  const BC = body && PS.bodyColumns(src);
  if (g.cols > 1) P.cols = { num: g.cols, space: (g.colsep ?? 10) * TW, sep: (page.colrule || 0) > 0 };
  else if (BC) P.cols = { num: BC.n, space: (g.colsep ?? 10) * TW, sep: (page.colrule || 0) > 0 };
  // headers and footers: the style the pages take (fancyhdr's, KOMA's, or LaTeX's own: plain's
  // number at the foot, a book's running head and number at the top)
  const D = O.docInfo || {}, plain = (t) => hfRuns(String(t).replace(/\\and(?![A-Za-z@])/g, ', '), {}).map((r) => r.t).join('').replace(/\s+/g, ' ').trim();
  const info = { date: D.date != null ? plain(D.date) : '', title: D.title != null ? plain(D.title) : '', author: D.author != null ? plain(D.author) : '', job: O.job || '' };
  const three = (S, W, side) => ['L', 'C', 'R'].map((c) => runsOf(S[W + side + c] || '', info));
  const plainFoot = [[], [{ field: 'PAGE' }], []];
  const S = page.slots || (page.style === 'empty' ? {} : { FOC: '\\thepage', FEC: '\\thepage' });
  const any = (W) => PS.SLOTS.some((k) => k[0] === W && S[k]);
  if (any('H')) P.head = { odd: three(S, 'H', 'O'), even: three(S, 'H', 'E') };
  if (any('F')) P.foot = { odd: three(S, 'F', 'O'), even: three(S, 'F', 'E') };
  P.evenOdd = !!g.twoside && ['HL', 'HC', 'HR', 'FL', 'FC', 'FR'].some((k) => (S[k[0] + 'O' + k[1]] || '') !== (S[k[0] + 'E' + k[1]] || ''));
  // the first page: \thispagestyle{empty} at the body's start, or the title's plain page under
  // another style
  const first = PS.firstPageStyle(src || '');
  if (first && first.style === 'empty' && (P.head || P.foot)) { P.titlePg = true; }
  else if (page.style !== 'plain' && page.style !== 'empty' && /\\maketitle\b/.test(src || '') && !/^(report|book|scrreprt|scrbook)$/.test(O.cls)) {
    P.titlePg = true;
    if (P.head) P.head.first = [[], [], []];
    if (P.foot) P.foot.first = plainFoot;
  }
  // page numbers
  const N = PS.pageNumbers(src || '');
  if (N && (N.numbering !== 'arabic' || N.start !== 1)) P.pgNum = { fmt: FMT[N.numbering] || 'decimal', start: N.start };
  // line numbers
  const L = page.lineno;
  if (L && L.on) P.lnNum = { countBy: L.modulo || 1, restart: L.mode === 'page' ? 'newPage' : L.mode === 'section' ? 'newSection' : 'continuous' };
  // colour and border
  if (page.color) P.background = hexOf(page.color.css || page.color.color);
  // (R1: Word's line styles; its art borders by the nearest of its own)
  if (page.border) {
    const B = page.border, art = B.art ? ART_WORD[B.art] : null;
    P.border = { space: B.inset * 72 / 72.27, sz: art ? Math.max(2, Math.min(31, Math.round(B.width * 2))) : Math.max(2, Math.min(96, B.width * 8)), color: hexOf(B.color) || '000000', val: art || (B.style && B.style !== 'single' ? B.style : 'single') };
  }
  // (R1) the last of Word's sections (src/wordpage.js): its type, sheet and columns
  const runs = sectionRuns(model), j = runs.length - 1;
  if (j > 0) P.lastSection = { type: sectionType(runs, j), land: runs[j].kind === 'L', cols: runs[j].kind[0] === 'C' ? +runs[j].kind.slice(1) : undefined };
  return P;
}
export const ART_WORD = { dots: 'dotted', diamonds: 'diamondsGray', stars: 'starsBlack' };

// (R1) Word's sections for the parts a document sets otherwise: multicols around some paragraphs,
// pdflscape's landscape pages. The runs of the model's units of one kind: [{ i: the first unit,
// kind: '' | 'L' | 'C<n>' }]; a unit of floats or page marks only goes with the run it is in, and
// a body all in columns is the document's columns (one run)
export function sectionRuns(model) {
  const units = (model && model.blocks) || [];
  const kindOf = (u) => {
    const it = u.items.find((x) => x.type !== 'pagemark' && x.type !== 'space' && x.type !== 'float' && x.type !== 'pagebreak');
    return it ? (it.land ? 'L' : it.mc && it.mc.n > 1 ? 'C' + it.mc.n : '') : null;
  };
  const kinds = units.map(kindOf), real = kinds.filter((k) => k !== null);
  if (real.length && real[0][0] === 'C' && real.every((k) => k === real[0])) return [{ i: 0, kind: '' }];
  const runs = [];
  kinds.forEach((k, i) => { if (k !== null && (!runs.length || runs[runs.length - 1].kind !== k)) runs.push({ i, kind: k }); });
  if (!runs.length) return [{ i: 0, kind: '' }];
  runs[0].i = 0;
  return runs;
}
// how a run's section begins: on a page of its own at the document's start and next to landscape
// pages (\clearpage there), else where the last one ended
export const sectionType = (runs, j) => (j === 0 || runs[j].kind === 'L' || runs[j - 1].kind === 'L' ? null : 'continuous');

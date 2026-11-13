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
function runsOf(tex) {
  const out = [];
  // (control characters of the text out first: XML 1.0 has no place for them, and two stand for the fields here)
  for (const r of hfRuns(String(tex).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''), { page: '\u0001', total: '\u0002' })) {
    const parts = r.t.split(/([\u0001\u0002])/);
    for (const p of parts) {
      if (!p) continue;
      const t = r.st.up ? p.toUpperCase() : p;
      if (p === '\u0001') out.push({ field: 'PAGE', b: r.st.b, i: r.st.i });
      else if (p === '\u0002') out.push({ field: 'NUMPAGES', b: r.st.b, i: r.st.i });
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
  const three = (S, W, side) => ['L', 'C', 'R'].map((c) => runsOf(S[W + side + c] || ''));
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
  if (page.border) P.border = { space: page.border.inset * 72 / 72.27, sz: Math.max(2, Math.min(96, page.border.width * 8)), color: hexOf(page.border.color) || '000000' };
  return P;
}

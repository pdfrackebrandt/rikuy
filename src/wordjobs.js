// What the Word worker does, given a pandoc (src/pandoc.js): write a project's page as .docx with
// Rikuy's part in it, read an edited .docx back, open a stranger's .docx as LaTeX. Kept apart from
// the worker's messaging so the node tests run the same code.
import { unzip, zip, extract, addRikuyPart, readRikuyPart, mathDocx, mathFromJson, text, LIMITS } from './docx.js';
import { alignRuns, exportData, allObjs } from './wordsync.js';
import { safeUrl } from './wordast.js';

// pandoc's messages worth telling the user: the ones that say something was lost
const said = (ws) => (ws || []).filter((w) => w.verbosity && w.verbosity !== 'INFO').map((w) => w.pretty || w.type).slice(0, 20);

// The text of each equation in a Word file, as pandoc reads OMML into TeX: one run for all of them
export function mathTeX(P, objs) {
  if (!objs.length) return [];
  const r = P.convert({ from: 'docx', to: 'json', 'input-files': ['m.docx'] }, null, { 'm.docx': mathDocx(objs.map((o) => o.xml)) });
  return mathFromJson(r.stdout || '{"blocks":[]}', objs.length);
}

// req: { doc (pandoc JSON), anchors (packAnchor's), atoms, resources: {name: bytes|string},
//        bibs: [names], csl: name|null, citeproc, toc, project: { name, main, files: [[n, t]], sig } }
export function exportDocx(P, req) {
  const opts = { from: 'json', to: 'docx', 'output-file': 'out.docx' };
  if (req.citeproc && req.bibs && req.bibs.length) { opts.citeproc = true; opts.bibliography = req.bibs; if (req.csl) opts.csl = req.csl; }
  if (req.toc) opts['table-of-contents'] = true;
  const r = P.convert(opts, JSON.stringify(req.doc), req.resources || {});
  const docx = r.files['out.docx'];
  if (!docx) throw new Error('pandoc wrote no Word file: ' + (r.stderr || '').trim().slice(0, 300));
  // what Word got, block by block, lined up with what the page showed
  const X = extract(unzip(docx));
  const anchors = [];
  let lost = 0;
  for (const A of req.anchors) {
    const R = X.regions.get(A.id);
    if (!R) { lost++; continue; }
    anchors.push({ ...A, text: R.text, runs: alignRuns(A, R.text) });
  }
  // each equation as pandoc reads it back from Word, to tell later what a coauthor changed
  const atoms = req.atoms.map((a) => ({ ...a }));
  const objs = [];
  const owner = [];
  for (const A of anchors) {
    const R = X.regions.get(A.id);
    for (const o of R.objs) {
      if (o.k !== 'math') continue;
      // the atom at that place in the aligned map
      const m = runAt(A.runs, o.at);
      if (m != null) { objs.push(o); owner.push(m); }
    }
  }
  const tex = mathTeX(P, objs);
  tex.forEach((t, i) => { const a = atoms[owner[i]]; if (a && t != null) a.was = t; });
  const unread = tex.filter((t) => t == null).length;
  // The file carries the source of what it shows, to place a coauthor's edits later: the main
  // file and the files its blocks come from, not the whole project (a chapter no \input names,
  // notes, a .bib would otherwise travel to everyone the Word file is sent to).
  const used = new Set([req.project.main, ...anchors.map((A) => A.f), ...atoms.map((a) => a && a.f).filter(Boolean)]);
  const data = exportData({ ...req.project, files: req.project.files.filter(([n]) => used.has(n)), anchors, atoms, t: Date.now(), app: req.app });
  const out = addRikuyPart(docx, data);
  // json: what the worker hashes into the export's mark (src/wordworker.js)
  return { docx: out, warnings: said(r.warnings), lost, unread, size: out.length, json: JSON.stringify(data) };
}

// the atom index of text position i in run coded map, or null
function runAt(runs, i) {
  let p = 0;
  for (const r of runs) {
    const n = r[0] > 0 ? r[0] : r[0] === 0 ? 1 : r[0] === -1 ? r[1] : r[2];
    if (i < p + n) return r[0] === -2 ? r[1] : null;
    p += n;
  }
  return null;
}

// An edited .docx: Rikuy's data if it carries it, the text of each block, its equations as TeX
export function readDocx(P, bytes) {
  const parts = unzip(bytes);
  const data = readRikuyPart(parts);
  if (!data) return { data: null };
  const X = extract(parts);
  const objs = allObjs(X);
  const tex = mathTeX(P, objs);
  const mathTex = objs.map((o, i) => tex[i]);
  let lastBy = '';
  if (parts.has('docProps/core.xml')) {
    const m = /<cp:lastModifiedBy>([^<]*)<\/cp:lastModifiedBy>/.exec(text(parts.get('docProps/core.xml')));
    if (m) lastBy = m[1].trim();
  }
  // Maps and Sets do not cross postMessage as the page needs them: plain arrays instead
  return {
    data,
    X: {
      regions: [...X.regions.entries()], order: X.order, pre: X.pre, orphans: X.orphans,
      notes: [...X.notes.entries()], comments: [...X.comments.entries()], authors: [...X.authors], tracked: X.tracked, dupes: X.dupes,
      mathTex
    },
    lastBy
  };
}

// ---- a stranger's .docx, opened as LaTeX ----------------------------------------------------------

const MEDIA_MAX = 50e6;
const PICTURE = /^(png|jpe?g|gif|svg|webp|bmp|tiff?|emf|wmf|pdf|eps)$/;

// docx -> { tex (a whole document with a short preamble), media: {name: bytes}, bib, warnings }
export function docxToLatex(P, bytes, name) {
  // the zip pandoc reads is the one rebuilt from what passed the checks
  const parts = unzip(bytes);
  const clean = zip(parts);
  const r = P.convert({ from: 'docx+citations', to: 'json', 'input-files': ['in.docx'], 'extract-media': 'media', 'track-changes': 'accept' }, null, { 'in.docx': clean });
  if (!r.stdout) throw new Error('pandoc could not read the file: ' + (r.stderr || '').trim().slice(0, 300));
  const doc = JSON.parse(r.stdout);
  const media = {};
  const renamed = new Map();
  let k = 0, total = 0;
  for (const [n, b] of Object.entries(r.files)) {
    if (!n.startsWith('media/')) continue;
    const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(n) || [, 'bin'])[1].toLowerCase();
    // pictures only: the project keeps them as figures, never as a .tex or .html of the sender's
    if (!PICTURE.test(ext)) continue;
    if (b.length > MEDIA_MAX || (total += b.length) > LIMITS.total) continue;
    const nn = 'figures/figure' + (++k) + '.' + ext;
    renamed.set(n, nn);
    media[nn] = b;
  }
  const warn = said(r.warnings);
  const odd = new Set();
  // links only to web or mail addresses; pictures only from the file itself
  walk(doc.blocks, (x) => {
    if (x.t === 'Link') { const u = safeUrl(x.c[2][0]); if (!u) { x.t = 'Span'; x.c = [x.c[0], x.c[1]]; } else x.c[2][0] = u; }
    if (x.t === 'Image') {
      const to = renamed.get(x.c[2][0]);
      if (!to) { x.t = 'Span'; x.c = [['', [], []], [{ t: 'Str', c: '[picture]' }]]; return; }
      x.c[2][0] = to;
      if (/\.(emf|wmf|tiff?)$/i.test(to)) odd.add(to.split('.').pop());
    }
    // a table of short cells as plain columns (l, c, r): pandoc writes the widths Word kept as
    // p{} columns with a minipage in every head cell, which reads badly in the source
    if (x.t === 'Table') {
      let long = false;
      walk([x.c[3], x.c[4], x.c[5]], (y) => { if (y.t === 'Str' && y.c.length > 30) long = true; if (y.t === 'Para' || y.t === 'Plain') { let n = 0; walk(y.c, (z) => { if (z.t === 'Str') n += z.c.length + 1; }); if (n > 40) long = true; } });
      if (!long) x.c[2] = x.c[2].map(([al]) => [al, { t: 'ColWidthDefault' }]);
    }
  });
  if (odd.size) warn.push('Pictures in formats pdfLaTeX cannot include (' + [...odd].join(', ') + ') are in figures/; convert them to PNG or PDF.');
  const refs = doc.meta && doc.meta.references;
  let bib = '';
  if (refs) {
    const b = P.convert({ from: 'json', to: 'biblatex' }, JSON.stringify({ ...doc, blocks: [] }), {});
    bib = b.stdout || '';
  }
  const body = P.convert({ from: 'json', to: 'latex', 'cite-method': 'natbib', wrap: 'none' }, JSON.stringify(doc), {});
  let tex = body.stdout || '';
  const used = (re) => re.test(tex);
  // the meta data pandoc read (title, authors, date, abstract) in LaTeX of its own
  const metaTex = (key) => {
    const v = doc.meta && doc.meta[key];
    if (!v) return '';
    const one = (x) => P.convert({ from: 'json', to: 'latex', wrap: 'none' }, JSON.stringify({ 'pandoc-api-version': doc['pandoc-api-version'], meta: {}, blocks: [{ t: x.t === 'MetaBlocks' ? 'Div' : 'Plain', c: x.t === 'MetaBlocks' ? [['', [], []], x.c] : x.c }] }), {}).stdout.trim();
    if (v.t === 'MetaList') return v.c.map(one).join(' \\and ');
    if (v.t === 'MetaString') return v.c;
    return one(v);
  };
  const title = metaTex('title'), author = metaTex('author'), date = metaTex('date'), abstract = metaTex('abstract');
  // pandoc writes some commands of its own: those used get their definitions
  const pre = ['\\documentclass{article}', '\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}', '\\usepackage{amsmath,amssymb}'];
  if (used(/\\includegraphics/)) pre.push('\\usepackage{graphicx}');
  if (used(/\\begin\{longtable\}/)) pre.push('\\usepackage{longtable,booktabs,array}', '\\usepackage{calc}');
  if (used(/\\(sout|ul|st)\{/)) pre.push('\\usepackage[normalem]{ulem}', '\\providecommand{\\ul}{\\uline}', '\\providecommand{\\st}{\\sout}');
  if (used(/\\(cite[tp]?|citeauthor|citeyear)\{/) || bib) pre.push('\\usepackage[authoryear,round]{natbib}');
  if (used(/\\(texttt|verb)|\\begin\{verbatim\}/)) { /* the class has them */ }
  if (used(/\\(href|url|hyperlink|hypertarget)/)) pre.push('\\usepackage[hidelinks]{hyperref}');
  if (used(/\\tightlist/)) pre.push('\\providecommand{\\tightlist}{\\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}');
  if (used(/\\pandocbounded/)) pre.push('% pictures at their own size, no wider than the text', '\\newcommand{\\pandocbounded}[1]{\\resizebox{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}{#1}}');
  if (used(/\\begin\{CSLReferences\}/)) pre.push('\\newenvironment{CSLReferences}[2]{}{}', '\\newcommand{\\CSLLeftMargin}[1]{#1}', '\\newcommand{\\CSLRightInline}[1]{#1}', '\\newcommand{\\CSLBlock}[1]{#1}');
  if (used(/\\(passthrough|NormalTok)/)) pre.push('\\providecommand{\\passthrough}[1]{#1}');
  // pandoc puts \hspace{0pt} after a formula that ends a paragraph; it typesets as nothing
  tex = tex.replace(/(\\\))\\hspace\{0pt\}/g, '$1');
  // after each rule of a table pandoc writes \noalign{}, which sets nothing: the typeset page
  // (and so the Word file saved from it) showed the word \noalign in the table's cells
  tex = tex.replace(/(\\(?:toprule|midrule|bottomrule))\\noalign\{\}/g, '$1');
  // and wraps a table without a caption in a group that keeps the table counter still; the group
  // makes the editor read the table as inline text, so the table goes without it
  tex = tex.replace(/\{\\def\\LTcaptype\{none\} % do not increment counter\n(\\begin\{longtable\}[\s\S]*?\\end\{longtable\})\n\}/g, '$1');
  const lines = [...pre];
  if (title) lines.push('', '\\title{' + title + '}');
  if (author) lines.push('\\author{' + author + '}');
  if (title || author) lines.push('\\date{' + (date || '') + '}');
  lines.push('', '\\begin{document}');
  if (title || author) lines.push('\\maketitle');
  if (abstract) lines.push('', '\\begin{abstract}', abstract, '\\end{abstract}');
  lines.push('', tex.trim(), '');
  if (bib) lines.push('\\bibliographystyle{plainnat}', '\\bibliography{references}', '');
  lines.push('\\end{document}', '');
  return { tex: lines.join('\n'), media, bib, warnings: warn, name };
}

function walk(blocks, fn) {
  const go = (x) => {
    if (Array.isArray(x)) { for (const y of x) go(y); return; }
    if (!x || typeof x !== 'object') return;
    if (typeof x.t === 'string') fn(x);
    if ('c' in x) go(x.c);
  };
  go(blocks);
}

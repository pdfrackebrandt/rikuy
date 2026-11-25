// Clipboard -> LaTeX. Formatting from Word, Google Docs, web pages and chat assistants
// arrives as LaTeX people would write by hand: bold, italics, links, lists, headings,
// tables, sub/superscripts, and math kept as math (KaTeX/MathJax pages carry their TeX).
import { escapeTeX } from './editor.js';

const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|TABLE|TR|PRE|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|DL|DT|DD|CENTER|ADDRESS|HR)$/;
// what no format's braces may hold: an environment, a display, a heading, an item
const BLOCKY = /\\begin\s*\{|\\\[|\$\$|\\(?:part|chapter|(?:sub)*section|(?:sub)?paragraph)\*?\s*\{|\\item(?![A-Za-z])/;

function styleOf(el) {
  const st = (el.getAttribute && el.getAttribute('style')) || '';
  const get = (p) => { const m = new RegExp('(?:^|;)\\s*' + p + '\\s*:\\s*([^;]+)', 'i').exec(st); return m ? m[1].trim().toLowerCase() : ''; };
  return { weight: get('font-weight'), fstyle: get('font-style'), deco: get('text-decoration') || get('text-decoration-line'), valign: get('vertical-align'), family: get('font-family'),
    color: get('color') || (el.tagName === 'FONT' && el.getAttribute('color')) || '', bg: get('background-color') || get('background'), hl: get('mso-highlight') };
}

// A CSS colour as six hex digits (null for none, transparent, Word's automatic or a name not known
// here): what Word, Google Docs and a browser's copy write, #C00000, rgb(192, 0, 0), red, windowtext
const CSS_NAMES = { black: '000000', windowtext: '000000', white: 'FFFFFF', window: 'FFFFFF', red: 'FF0000', green: '008000', lime: '00FF00', blue: '0000FF', yellow: 'FFFF00',
  cyan: '00FFFF', aqua: '00FFFF', magenta: 'FF00FF', fuchsia: 'FF00FF', maroon: '800000', navy: '000080', olive: '808000', purple: '800080', teal: '008080', silver: 'C0C0C0',
  gray: '808080', grey: '808080', orange: 'FFA500', darkblue: '00008B', darkred: '8B0000', darkgreen: '006400', darkcyan: '008B8B', darkmagenta: '8B008B',
  darkyellow: '808000', darkgray: '808080', lightgray: 'C0C0C0' };
function hexOf(v) {
  const c = String(v || '').trim().toLowerCase().replace(/\s*!important$/, '');
  let m;
  // (the shorthand background: its colour is its first word, "#FFFF00" of "#FFFF00 none")
  if (/^#[0-9a-f]+\s/.test(c)) return hexOf(c.split(/\s+/)[0]);
  if ((m = /^#([0-9a-f]{6})$/.exec(c))) return m[1].toUpperCase();
  if ((m = /^#([0-9a-f]{3})$/.exec(c))) return m[1].replace(/./g, (x) => x + x).toUpperCase();
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c))) {
    if (m[4] !== undefined && +m[4] < 0.5) return null;
    return [m[1], m[2], m[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const w = c.split(/\s+/)[0];
  return Object.hasOwn(CSS_NAMES, w) ? CSS_NAMES[w] : null;
}
// Word's highlighter colours (Text Highlight Color, src/cmd/font.js HIGHLIGHTS) by their RGB, and
// the xcolor colour \hl takes for each: a pasted highlight becomes the nearest of them, as Word's
// own highlighter has only these (its dark ones as xcolor's mix, as Word import writes them)
const HL = [['FFFF00', 'yellow'], ['00FF00', 'green'], ['00FFFF', 'cyan'], ['FF00FF', 'magenta'], ['0000FF', 'blue'], ['FF0000', 'red'], ['008080', 'teal'],
  ['800080', 'violet'], ['808000', 'olive'], ['808080', 'gray'], ['C0C0C0', 'lightgray'], ['000000', 'black'], ['000080', 'rgb,255:red,0;green,0;blue,128'],
  ['008000', 'rgb,255:red,0;green,128;blue,0'], ['800000', 'rgb,255:red,128;green,0;blue,0']];
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
function hlName(hex) {
  const [r, g, b] = rgb(hex);
  let best = null, d = Infinity;
  for (const [h, n] of HL) { const [R, G, B] = rgb(h), e = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (e < d) { d = e; best = n; } }
  return best;
}

// The TeX behind rendered math on a web page, if the page kept it.
function mathTeX(el) {
  const ann = el.querySelector && el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"]');
  if (ann) return ann.textContent.trim();
  if (el.tagName === 'IMG' && /math|latex|tex/i.test(el.className + ' ' + (el.getAttribute('class') || ''))) {
    const alt = (el.getAttribute('alt') || '').trim();
    if (alt) return alt.replace(/^\{\\displaystyle\s*(.*)\}$/s, '$1');
  }
  const scr = el.tagName === 'SCRIPT' && /math\/tex/.test(el.getAttribute('type') || '') ? el.textContent : null;
  return scr ? scr.trim() : null;
}
const isMathEl = (el) => el.nodeType === 1 && (
  el.classList.contains('katex') || el.classList.contains('katex-display') || el.tagName === 'MJX-CONTAINER' ||
  el.classList.contains('MathJax') || el.classList.contains('mwe-math-element') || el.tagName === 'MATH' ||
  (el.tagName === 'SCRIPT' && /math\/tex/.test(el.getAttribute('type') || '')));

export function htmlToTeX(html, opts = {}) {
  // Word marks list bullets with conditional comments; keep the bullet text to tell 1. from •
  const pre = html.replace(/<!\[if !supportLists\]>([\s\S]*?)<!\[endif\]>/g, (m, b) => '<span data-wbullet="' + b.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '').replace(/"/g, '') + '"></span>');
  const doc = new DOMParser().parseFromString(pre.replace(/<!--[\s\S]*?-->/g, ''), 'text/html');
  const body = doc.body;
  for (const x of body.querySelectorAll('style, meta, link, title, o\\:p, xml')) x.remove();
  wordLists(doc);
  // A grey or black colour, or a grey or white background, over most of the text is the page's
  // ink or paper (a browser's copy writes its grey text and white or dark paper on every run): no
  // mark, as Word import drops the document's ink (src/wordjobs.js ink). A colour with a hue is a
  // mark however much of the copy it covers: a red phrase copied alone from Word, a phrase Google
  // Docs highlights in yellow, kept (all of a copy in one colour was taken for ink and dropped).
  // A near white background is the page's paper too (a code box's #f6f8fa). Word's highlighter
  // (mso-highlight) is always a mark.
  const inkOf = (key) => {
    const n = new Map();
    let all = 0;
    const walk = doc.createTreeWalker(body, 4);
    for (let t; (t = walk.nextNode());) {
      const k = t.nodeValue.replace(/\s+/g, '').length;
      if (!k) continue;
      all += k;
      let c = null;
      for (let e = t.parentElement; e && e !== body.parentElement && c === null; e = e.parentElement) { const v = styleOf(e)[key]; if (v) c = hexOf(v) || ''; }
      if (c) n.set(c, (n.get(c) || 0) + k);
    }
    return new Set([...n].filter(([c, k]) => k / (all || 1) > 0.5 && grey(c)).map(([c]) => c));
  };
  const grey = (c) => { const v = rgb(c); return Math.max(...v) - Math.min(...v) < 48; };
  const whiteish = (c) => rgb(c).every((v) => v >= 0xF0);
  const ink = inkOf('color'), paper = inkOf('bg');
  // the colour, highlight and strikethrough an element itself marks its words with (null: none)
  const marks = (el, st) => {
    const col = /^(A|BODY)$/.test(el.tagName) || el.closest('a') ? null : hexOf(st.color);
    const h = st.hl && st.hl !== 'none' ? hexOf(st.hl) : null, bg = h || hexOf(st.bg);
    return { color: col && col !== '000000' && !ink.has(col) ? col : null,
      hl: bg && (h || (!whiteish(bg) && !paper.has(bg))) ? hlName(bg) : null,
      strike: el.tagName === 'S' || el.tagName === 'STRIKE' || el.tagName === 'DEL' || /line-through/.test(st.deco) };
  };
  // the marks' commands, innermost first: \sout, \hl, then \textcolor round them
  const markCmds = (m) => [...(m.strike ? ['sout'] : []), ...(m.hl ? [m.hl === 'yellow' || opts.hlColor === false ? 'hl' : 'hl[' + m.hl + ']'] : []), ...(m.color ? ['textcolor[HTML]{' + m.color + '}'] : [])];
  const markText = (r, m) => {
    // (soul's \hl goes inside \sout, \sout{\hl{word}}: the other way stops TeX)
    const cmds = markCmds(m), soul = opts.hlColor === false && m.strike && m.hl ? [cmds[1], cmds[0], ...cmds.slice(2)] : cmds;
    const lead = (/^\s+/.exec(r) || [''])[0], tail = (/\s+$/.exec(r) || [''])[0], on = (x) => { for (const cmd of soul) x = '\\' + cmd + '{' + x + '}'; return x; };
    // (soul's \hl in \sout: a word at a time)
    if (opts.hlColor === false && m.strike && m.hl) return lead + r.trim().split(/((?<!\\)\s+)/).map((w, i) => (i % 2 ? w : on(w))).join('') + tail;
    return lead + on(r.trim()) + tail;
  };
  let prev = opts.prev || ' ';
  const out = [];
  const emit = (t) => { if (t) { out.push(t); prev = t[t.length - 1]; } };

  const inline = (node, ctx) => {
    if (node.nodeType === 3) {
      let t = node.nodeValue;
      if (!ctx.pre) t = t.replace(/[\s\u00a0]+/g, (m) => (/\u00a0/.test(m) && m.length === 1 ? '~' : ' '));
      if (!ctx.pre && /^ /.test(t) && /\s$/.test(prev)) t = t.slice(1);
      if (!t) return '';
      if (t === '~') { prev = '~'; return '~'; }
      const parts = t.split('~');
      // (a part after a no-break space follows a space: a quote there opens, ``q'', where it came out ''q'')
      let r = parts.map((p, i) => { const e = escapeTeX(p, i === 0 ? prev : ' '); if (p) prev = p[p.length - 1]; return e; }).join('~');
      // (marks a run round it could not take, its words holding a list or a heading: on the words)
      return ctx.pend && !ctx.pre && r.trim() ? markText(r, ctx.pend) : r;
    }
    if (node.nodeType !== 1) return '';
    const el = node;
    const tag = el.tagName;
    if (isMathEl(el)) {
      const tex = mathTeX(el);
      if (tex) { prev = '$'; return el.classList.contains('katex-display') || el.getAttribute('display') === 'block' || /mode=display/.test(el.getAttribute('type') || '') ? '\n\\[\n' + tex + '\n\\]\n' : '$' + tex + '$'; }
      if (el.classList.contains('katex')) { const h = el.querySelector('.katex-html'); return h ? kids(h, ctx) : ''; }
    }
    if (tag === 'BR') return opts.inlineOnly ? ' ' : '\n\n';
    if (tag === 'IMG') return '';
    if (tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return '';
    const st = styleOf(el);
    // Strikethrough, the highlighter and a font colour (src/charfmt.js writes them: \sout,
    // \hl[colour], \textcolor[HTML]) go round the run's words where they are only words; a run
    // holding a list, a heading, a display or a float (a <del> may hold blocks) gives them to the
    // words inside instead: \sout{\begin{itemize}..} or \hl{..\[..\]..} stopped TeX. soul's \hl
    // takes words alone (no \textcolor or \sout in it): there it is always on the words.
    const mk = marks(el, st), O = ctx.on || {}, P = ctx.pend || {};
    const want = {};
    if ((mk.strike || P.strike) && !O.strike) want.strike = true;
    if ((mk.hl || P.hl) && (mk.hl || P.hl) !== O.hl) want.hl = mk.hl || P.hl;
    if ((mk.color || P.color) && (mk.color || P.color) !== O.color) want.color = mk.color || P.color;
    let here = ctx.pre ? {} : { ...want };
    const down = {};
    // (with soul, a struck run's \sout goes on its words too: soul's \hl of several words in
    // \sout stops TeX, "Leaders not followed by proper glue", and \sout in \hl does too; each
    // word struck and highlighted on its own compiles: markText)
    if (here.hl && opts.hlColor === false) { down.hl = here.hl; delete here.hl; }
    if (here.strike && opts.hlColor === false) { down.strike = true; delete here.strike; }
    const p0 = prev;
    // (a mark given to the words is not on: each run inside passes it on to its own words)
    let body = kids(el, { ...ctx, on: { ...O, ...here }, pend: Object.keys(down).length ? down : null });
    if (Object.keys(here).length && BLOCKY.test(body)) {
      prev = p0;
      body = kids(el, { ...ctx, on: O, pend: { ...want } });
      here = {};
    }
    if (!body.trim()) return body;
    const bold = (tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(st.weight)) && !/^(normal|[1-4]00)$/.test(st.weight);
    const ital = (tag === 'I' || tag === 'EM' || tag === 'CITE' || st.fstyle === 'italic') && st.fstyle !== 'normal';
    const under = (tag === 'U' || tag === 'INS' || /underline/.test(st.deco)) && !el.closest('a');
    const sup = tag === 'SUP' || st.valign === 'super';
    const sub = tag === 'SUB' || st.valign === 'sub';
    const mono = tag === 'CODE' || tag === 'KBD' || tag === 'TT' || tag === 'SAMP' || /monospace|courier|consolas|menlo/.test(st.family);
    // (each paragraph in its own: a line break, <br>, inside a coloured or struck run made a blank
    // line inside \textcolor's braces, and TeX stopped there)
    const wrap = (cmd) => { const lead = (/^\s+/.exec(body) || [''])[0], tail = (/\s+$/.exec(body) || [''])[0]; body = lead + body.trim().split(/(\s*\n\s*\n\s*)/).map((x, i) => (i % 2 ? x : '\\' + cmd + '{' + x + '}')).join('') + tail; };
    if (mono && !ctx.pre) wrap('texttt');
    if (sup) wrap('textsuperscript');
    if (sub) wrap('textsubscript');
    if (under) wrap('underline');
    if (ital && !ctx.ital) wrap('emph');
    if (bold && !ctx.bold) wrap('textbf');
    // (the preamble's lines for them come with the paste: App.pastePackages. They were dropped.)
    for (const cmd of markCmds(here)) wrap(cmd);
    if (tag === 'A') {
      const href = el.getAttribute('href') || '';
      if (/^https?:|^mailto:/.test(href)) {
        const text = el.textContent.trim();
        const url = href.replace(/[%#]/g, (m) => '\\' + m);
        if (text === href || text === href.replace(/^mailto:/, '')) body = opts.hyperref ? '\\url{' + url + '}' : body;
        else if (opts.hyperref) body = '\\href{' + url + '}{' + body.trim() + '}';
      }
    }
    return body;
  };
  const kids = (el, ctx) => {
    const sub = { ...ctx };
    const st = styleOf(el);
    if (el.tagName === 'B' || el.tagName === 'STRONG' || /^(bold|[6-9]00)$/.test(st.weight)) sub.bold = !/^(normal|[1-4]00)$/.test(st.weight);
    if (el.tagName === 'I' || el.tagName === 'EM' || st.fstyle === 'italic') sub.ital = st.fstyle !== 'normal';
    if (el.tagName === 'PRE') sub.pre = true;
    let s = '';
    for (const c of el.childNodes) {
      // (on one line, a table's cells apart as its rows are: their words ran together, "AB CD")
      if (c.nodeType === 1 && (BLOCK.test(c.tagName) || (opts.inlineOnly && /^(TD|TH)$/.test(c.tagName)))) s += opts.inlineOnly ? ' ' + inline(c, sub) + ' ' : '\n\n' + block(c, sub) + '\n\n';
      else s += inline(c, sub);
    }
    return opts.inlineOnly ? s.replace(/ {2,}/g, ' ') : s;
  };

  const table = (t, ctx) => {
    const rows = [...t.querySelectorAll('tr')].filter((r) => r.closest('table') === t);
    if (!rows.length) return '';
    const grid = rows.map((r) => [...r.children].filter((c) => /^(TD|TH)$/.test(c.tagName)));
    const cols = Math.max(...grid.map((r) => r.reduce((n, c) => n + (parseInt(c.getAttribute('colspan'), 10) || 1), 0)));
    const lines = grid.map((r) => r.map((c) => {
      const span = parseInt(c.getAttribute('colspan'), 10) || 1;
      prev = ' ';
      const txt = kids(c, { ...ctx, cell: true }).replace(/\s*\n\s*/g, ' ').trim();
      return span > 1 ? '\\multicolumn{' + span + '}{c}{' + txt + '}' : txt;
    }).join(' & ') + ' \\\\');
    const num = (c) => !!c && /^\s*[-+−]?[\d.,]+%?\s*$/.test(c.textContent);
    const head = grid[0].length && (grid[0].every((c) => c.tagName === 'TH' || /^(bold|[6-9]00)$/.test(styleOf(c).weight) || c.querySelector('b,strong')) ||
      (grid.length > 1 && !grid[0].some(num) && grid[0].some((c, i) => grid.slice(1).every((r) => num(r[i])))));
    const bk = opts.booktabs;
    const rule = (k) => (bk ? ['\\toprule', '\\midrule', '\\bottomrule'][k] : '\\hline');
    const body = [rule(0), ...(head ? [lines[0], rule(1), ...lines.slice(1)] : lines), rule(2)];
    const spec = grid[0] && cols ? Array.from({ length: cols }, (_, i) => (grid.slice(head ? 1 : 0).every((r) => !r[i] || /^\s*[-+−]?[\d.,]+%?\s*$/.test(r[i].textContent) || !r[i].textContent.trim()) && grid.length > 1 ? 'r' : 'l')).join('') : 'l';
    const tab = '\\begin{tabular}{' + spec + '}\n' + body.join('\n') + '\n\\end{tabular}';
    // (in a footnote, opts.note, a float stops TeX: the tabular alone)
    return ctx.inTable || opts.inlineOnly || opts.note ? tab : '\\begin{table}[h]\n\\centering\n' + tab + '\n\\end{table}';
  };
  const list = (l, ctx) => {
    const env = l.tagName === 'OL' ? 'enumerate' : 'itemize';
    const items = [...l.children].filter((c) => c.tagName === 'LI').map((li) => { prev = ' '; return '  \\item ' + kids(li, ctx).replace(/\n{2,}/g, '\n\n').trim(); });
    return '\\begin{' + env + '}\n' + items.join('\n') + '\n\\end{' + env + '}';
  };
  const block = (el, ctx) => {
    const tag = el.tagName;
    if (isMathEl(el)) return inline(el, ctx).trim();
    if (tag === 'TABLE') return table(el, { ...ctx, inTable: ctx.cell });
    if (tag === 'UL' || tag === 'OL') return list(el, ctx);
    if (tag === 'HR') return '';
    prev = ' ';
    const t = kids(el, ctx).trim();
    if (!t) return '';
    const h = /^H([1-6])$/.exec(tag);
    if (h && !opts.inlineOnly && !opts.note) {
      // (a heading's bold and colour are its style's, not marks: \section draws it as headings are;
      // soul's \hl stops TeX in a heading's moving argument)
      let plain = t.replace(/\\textbf\{([^{}]*)\}/g, '$1').replace(/\\textcolor\[HTML\]\{[0-9A-F]{6}\}\{([^{}]*)\}/g, '$1');
      if (opts.hlColor === false) plain = plain.replace(/\\hl\{([^{}]*)\}/g, '$1');
      return ['\\section', '\\section', '\\subsection', '\\subsubsection', '\\paragraph', '\\paragraph'][+h[1] - 1] + '{' + plain + '}';
    }
    if (tag === 'BLOCKQUOTE') return '\\begin{quote}\n' + t + '\n\\end{quote}';
    // (verbatim stops TeX in a command's argument, a footnote's: the code's lines in \texttt there)
    if (tag === 'PRE' && opts.note) return el.textContent.replace(/\n$/, '').split('\n').map((l) => '\\texttt{' + escapeTeX(l, ' ') + '}').join('\\\\\n');
    if (tag === 'PRE') return '\\begin{verbatim}\n' + el.textContent.replace(/\n$/, '') + '\n\\end{verbatim}';
    return t;
  };

  emit(kids(body, {}));
  return tidyParas(out.join(''));
}

// Word pastes lists as paragraphs styled mso-list: turn runs of them into real lists.
function wordLists(doc) {
  const ps = [...doc.body.querySelectorAll('p')].filter((p) => /mso-list/i.test(p.getAttribute('style') || '') || /MsoList/i.test(p.className));
  const done = new Set();
  for (const p of ps) {
    if (done.has(p)) continue;
    const run = [p];
    let n = p.nextElementSibling;
    while (n && ps.includes(n)) { run.push(n); n = n.nextElementSibling; }
    const first = p.querySelector('[data-wbullet]');
    const ordered = !!(first && /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(first.getAttribute('data-wbullet')));
    const list = doc.createElement(ordered ? 'ol' : 'ul');
    p.before(list);
    for (const q of run) {
      done.add(q);
      const li = doc.createElement('li');
      for (const b of q.querySelectorAll('[data-wbullet]')) b.remove();
      while (q.firstChild) li.appendChild(q.firstChild);
      list.appendChild(li);
      q.remove();
    }
  }
}

function tidyParas(s) {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+(?![ \t]|\\item)/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
}

// Plain text: keep math the user clearly wrote as math, and (when the text is plainly
// Markdown, as chat assistants copy it) turn Markdown into LaTeX.
export function plainToTeX(text, prev, opts = {}) {
  const t = text.replace(/\r\n?/g, '\n');
  const tsv = tsvTable(t, opts);
  if (tsv) return tsv;
  const md = /^#{1,4} \S|^\s*[-*] \S|^\s*\d+\. \S|\*\*[^*\n]+\*\*|`[^`\n]+`/m.test(t) && (t.match(/^#{1,4} |^\s*[-*] |^\s*\d+\. |\*\*|`/gm) || []).length >= 2;
  const paras = t.split(/\n\s*\n/);
  const outParas = [];
  let p = prev;
  for (const para of paras) {
    if (md) {
      const lines = para.split('\n');
      if (lines.every((l) => /^\s*[-*] /.test(l) || /^\s{2,}\S/.test(l)) && /^\s*[-*] /.test(lines[0])) { outParas.push(mdList(lines, 'itemize', /^\s*[-*] /)); continue; }
      if (lines.every((l) => /^\s*\d+\. /.test(l) || /^\s{2,}\S/.test(l)) && /^\s*\d+\. /.test(lines[0])) { outParas.push(mdList(lines, 'enumerate', /^\s*\d+\. /)); continue; }
      const h = /^(#{1,4}) (.*)$/.exec(para.trim());
      if (h && !para.trim().includes('\n')) { outParas.push(['\\section', '\\section', '\\subsection', '\\subsubsection'][h[1].length - 1] + '{' + inlineMd(h[2], ' ') + '}'); continue; }
    }
    outParas.push(md ? inlineMd(para.replace(/\s*\n\s*/g, ' '), p, opts.inlineOnly) : withMath(para.replace(/\s*\n\s*/g, ' '), p, opts.inlineOnly));
    p = ' ';
  }
  const out = tidyParas(outParas.map((x) => x.trim()).join('\n\n'));
  // a space at either end of plain text is part of the sentence it lands in: keep it. A blank line
  // there is a paragraph break where the text lands, as Word's paste of "\n\nNew words" at a
  // paragraph's end starts a new paragraph (it was dropped, and the words ran on in the paragraph
  // above); a lone line end there is a space, as one inside the text is.
  const leadPar = /^[ \t]*\n[ \t]*\n/.test(t) && out ? '\n\n' : '', trailPar = /\n[ \t]*\n[ \t]*$/.test(t) && out ? '\n\n' : '';
  const lead = !leadPar && /^\s/.test(t) && out && !/^\\(begin|section|subsection)/.test(out) ? ' ' : '';
  const trail = !trailPar && /\s$/.test(t) && out && !/\\end\{[^}]*\}$/.test(out) ? ' ' : '';
  return leadPar + lead + out + trail + trailPar;
}
function mdList(lines, env, re) {
  const items = [];
  for (const l of lines) { if (re.test(l)) items.push(l.replace(re, '')); else if (items.length) items[items.length - 1] += ' ' + l.trim(); }
  return '\\begin{' + env + '}\n' + items.map((x) => '  \\item ' + inlineMd(x, ' ')).join('\n') + '\n\\end{' + env + '}';
}
function inlineMd(s, prev, inl) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    parts.push(withMath(s.slice(last, m.index), prev, inl));
    if (m[1] || m[2]) parts.push('\\textbf{' + withMath(m[1] || m[2], ' ', true) + '}');
    else if (m[3]) parts.push('\\emph{' + withMath(m[3], ' ', true) + '}');
    else parts.push('\\texttt{' + escapeTeX(m[4], ' ', { verbatim: true }) + '}');
    last = m.index + m[0].length;
    prev = 'x';
  }
  parts.push(withMath(s.slice(last), prev, inl));
  return parts.join('');
}
// Text with $..$, \(..\), \[..\], $$..$$ kept as math. A $..$ pair counts as math only if it
// holds something mathematical, so "costs $5 and $10" stays money. A pair taken for money gives
// up its closing $ to the next pair: "costs $5 and $x^2$ here" lost $x^2$ to the money before it,
// though $$x$$ in the same text was math (verification of eb14945, V6). inl: where a display
// cannot go (a heading, a caption, a cell, a command's braces), $$..$$ and \[..\] are written
// in the line, $..$.
export function withMath(s, prev, inl) {
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    const inner = m[4];
    if (inner != null && (!/[\\^_=+<>]|[a-zA-Z]\s*\(|^[a-zA-Z]$|\d\s*[a-zA-Z]/.test(inner) || (/^\d/.test(inner) && /\s$/.test(inner)))) { re.lastIndex = m.index + 1; continue; }
    out += escapeTeX(s.slice(last, m.index), last ? 'x' : prev);
    out += (m[1] != null || m[2] != null) && !inl ? '\n\\[\n' + (m[1] || m[2]).trim() + '\n\\]\n' : '$' + (m[1] || m[2] || m[3] || inner).trim() + '$';
    last = m.index + m[0].length;
  }
  return out + escapeTeX(s.slice(last), last ? 'x' : prev);
}
function tsvTable(t, opts) {
  // (no float in a cell, a heading or a caption, where TeX refuses one: there the rows are text)
  if (opts.inlineOnly) return null;
  const lines = t.replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null;
  const n = lines[0].split('\t').length;
  if (n < 2 || !lines.every((l) => l.split('\t').length === n)) return null;
  const rows = lines.map((l) => l.split('\t').map((c) => escapeTeX(c.trim(), ' ')).join(' & ') + ' \\\\');
  const bk = opts.booktabs;
  const spec = Array.from({ length: n }, (_, i) => (lines.slice(1).every((l) => /^\s*[-+−]?[\d.,]+%?\s*$/.test(l.split('\t')[i]) || !l.split('\t')[i].trim()) ? 'r' : 'l')).join('');
  return '\\begin{table}[h]\n\\centering\n\\begin{tabular}{' + spec + '}\n' + (bk ? '\\toprule\n' : '\\hline\n') + rows[0] + '\n' + (bk ? '\\midrule\n' : '\\hline\n') + rows.slice(1).join('\n') + '\n' + (bk ? '\\bottomrule' : '\\hline') + '\n\\end{tabular}\n\\end{table}';
}

// Math pasted into the equation editor arrives with its delimiters ($...$, \[...\],
// \begin{equation}...\end{equation}, a ```latex fence) since it was copied from a document
// or a chat. The editor already is the math, so they come off. null when there are none.
export function unwrapMath(t) {
  let s = String(t || '').trim();
  const fence = /^```[A-Za-z]*[ \t]*\n?([\s\S]*?)\n?```$/.exec(s);
  if (fence) s = fence[1].trim();
  let m;
  // one formula only: "$$a$$ and $$b$$" is two, and stays as pasted
  if ((m = /^\$\$([\s\S]+)\$\$$/.exec(s)) && !m[1].includes('$$')) return m[1].trim();
  if ((m = /^\\\[([\s\S]+)\\\]$/.exec(s)) && !/\\[\[\]]/.test(m[1])) return m[1].trim();
  if ((m = /^\\\(([\s\S]+)\\\)$/.exec(s)) && !/\\[()]/.test(m[1])) return m[1].trim();
  if ((m = /^\$([^$]+)\$$/.exec(s))) return m[1].trim();
  if ((m = /^\\begin\{(equation|align|gather|multline|displaymath|math|eqnarray|flalign|alignat)(\*?)\}(?:\{\d+\})?([\s\S]*)\\end\{\1\2\}$/.exec(s)) && !m[3].includes('\\end{' + m[1])) return m[3].trim();
  return fence ? s : null;
}

// Copied LaTeX made one line, for a place whose argument a paragraph break ends (a heading, a
// table's cell, a caption): comments go as TeX reads them (with the line's end, so the lines they
// joined stay joined and no brace after them is commented out), a heading leaves its words in a
// group, a label goes, a display becomes a formula in the line, a list's items words in a row,
// paragraphs and lines join with a space. '' where something is left that the line cannot hold
// (an align, a figure): then the words alone are pasted.
export function oneLineLatex(t) {
  const t0 = String(t || '');
  let s = t0.replace(/\r\n?/g, '\n');
  // An address or verbatim text keeps its % and its line as written: \url{x%20y} is no comment.
  // They wait aside, each as a mark, and come back at the end.
  const kept = [];
  const keep = (m) => '\uE000' + (kept.push(m) - 1) + '\uE001';
  s = s.replace(/\\(?:url|path|href)\s*\{[^{}\n]*\}/g, keep);
  s = s.replace(/\\(?:verb|lstinline)\*?([^\sA-Za-z*{])[^\n]*?\1/g, keep);
  // (a % after an even number of backslashes starts a comment; \% is a percent sign)
  s = s.replace(/(^|[^\\])((?:\\\\)*)%[^\n]*(?:\n[ \t]*)?/g, '$1$2');
  s = headingsAsWords(s);
  s = s.replace(/\\label\s*\{[^{}]*\}/g, '');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (m, x) => '$' + x.trim() + '$');
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, x) => '$' + x.trim() + '$');
  s = s.replace(/\\begin\s*\{(equation|displaymath)(\*?)\}([\s\S]*?)\\end\s*\{\1\2\}/g, (m, e, st, x) => '$' + x.trim() + '$');
  s = s.replace(/\\(?:begin|end)\s*\{(?:itemize|enumerate|description)\}(?:\[[^\]\n]*\])?/g, ' ');
  s = s.replace(/\\item(?![A-Za-z])\s*(?:\[([^\]\n]*)\])?/g, (m, lab) => ' ' + (lab ? lab + ' ' : ''));
  s = s.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  if (/\\(?:begin|end|par|maketitle|caption)(?![A-Za-z])/.test(s)) return '';
  s = s.replace(/\uE000(\d+)\uE001/g, (m, k) => kept[+k]);
  // (what this cannot read, braces left open or closed twice: the LaTeX goes in as it came)
  let depth = 0;
  for (const x of s.replace(/\\./g, '').replace(/\uE000\d+\uE001/g, '')) { if (x === '{') depth++; else if (x === '}' && --depth < 0) break; }
  return depth === 0 ? s : t0;
}

// A heading copied with what is pasted inside another command's argument (a footnote, a bold
// word): its words stay, in a group, and the command goes, which TeX takes nowhere but at a
// paragraph's level of the text
export function headingsAsWords(t) {
  return String(t || '').replace(/\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\*?\s*(?:\[[^\]\n]*\]\s*)?(?=\{)/g, '');
}

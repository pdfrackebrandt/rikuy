// Clipboard -> LaTeX. Formatting from Word, Google Docs, web pages and chat assistants
// arrives as LaTeX people would write by hand: bold, italics, links, lists, headings,
// tables, sub/superscripts, and math kept as math (KaTeX/MathJax pages carry their TeX).
import { escapeTeX } from './editor.js';

const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|TABLE|TR|PRE|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|DL|DT|DD|CENTER|ADDRESS|HR)$/;

function styleOf(el) {
  const st = (el.getAttribute && el.getAttribute('style')) || '';
  const get = (p) => { const m = new RegExp('(?:^|;)\\s*' + p + '\\s*:\\s*([^;]+)', 'i').exec(st); return m ? m[1].trim().toLowerCase() : ''; };
  return { weight: get('font-weight'), fstyle: get('font-style'), deco: get('text-decoration') || get('text-decoration-line'), valign: get('vertical-align'), family: get('font-family') };
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
      let r = parts.map((p, i) => { const e = escapeTeX(p, i === 0 ? prev : 'x'); if (p) prev = p[p.length - 1]; return e; }).join('~');
      return r;
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
    let body = kids(el, ctx);
    if (!body.trim()) return body;
    const bold = (tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(st.weight)) && !/^(normal|[1-4]00)$/.test(st.weight);
    const ital = (tag === 'I' || tag === 'EM' || tag === 'CITE' || st.fstyle === 'italic') && st.fstyle !== 'normal';
    const under = (tag === 'U' || tag === 'INS' || /underline/.test(st.deco)) && !el.closest('a');
    const sup = tag === 'SUP' || st.valign === 'super';
    const sub = tag === 'SUB' || st.valign === 'sub';
    const mono = tag === 'CODE' || tag === 'KBD' || tag === 'TT' || tag === 'SAMP' || /monospace|courier|consolas|menlo/.test(st.family);
    const wrap = (cmd) => { const lead = (/^\s+/.exec(body) || [''])[0], tail = (/\s+$/.exec(body) || [''])[0]; body = lead + '\\' + cmd + '{' + body.trim() + '}' + tail; };
    if (mono && !ctx.pre) wrap('texttt');
    if (sup) wrap('textsuperscript');
    if (sub) wrap('textsubscript');
    if (under) wrap('underline');
    if (ital && !ctx.ital) wrap('emph');
    if (bold && !ctx.bold) wrap('textbf');
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
      if (c.nodeType === 1 && BLOCK.test(c.tagName)) s += opts.inlineOnly ? ' ' + inline(c, sub) + ' ' : '\n\n' + block(c, sub) + '\n\n';
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
    return ctx.inTable || opts.inlineOnly ? tab : '\\begin{table}[h]\n\\centering\n' + tab + '\n\\end{table}';
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
    if (h && !opts.inlineOnly) {
      const plain = t.replace(/\\textbf\{([^{}]*)\}/g, '$1');
      return ['\\section', '\\section', '\\subsection', '\\subsubsection', '\\paragraph', '\\paragraph'][+h[1] - 1] + '{' + plain + '}';
    }
    if (tag === 'BLOCKQUOTE') return '\\begin{quote}\n' + t + '\n\\end{quote}';
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
    outParas.push(md ? inlineMd(para.replace(/\s*\n\s*/g, ' '), p) : withMath(para.replace(/\s*\n\s*/g, ' '), p));
    p = ' ';
  }
  const out = tidyParas(outParas.map((x) => x.trim()).join('\n\n'));
  // a space at either end of plain text is part of the sentence it lands in: keep it
  const lead = /^[ \t]/.test(t) && out && !/^\\(begin|section|subsection)/.test(out) ? ' ' : '';
  const trail = /[ \t]$/.test(t) && out && !/\\end\{[^}]*\}$/.test(out) ? ' ' : '';
  return lead + out + trail;
}
function mdList(lines, env, re) {
  const items = [];
  for (const l of lines) { if (re.test(l)) items.push(l.replace(re, '')); else if (items.length) items[items.length - 1] += ' ' + l.trim(); }
  return '\\begin{' + env + '}\n' + items.map((x) => '  \\item ' + inlineMd(x, ' ')).join('\n') + '\n\\end{' + env + '}';
}
function inlineMd(s, prev) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    parts.push(withMath(s.slice(last, m.index), prev));
    if (m[1] || m[2]) parts.push('\\textbf{' + withMath(m[1] || m[2], ' ') + '}');
    else if (m[3]) parts.push('\\emph{' + withMath(m[3], ' ') + '}');
    else parts.push('\\texttt{' + escapeTeX(m[4], ' ', { verbatim: true }) + '}');
    last = m.index + m[0].length;
    prev = 'x';
  }
  parts.push(withMath(s.slice(last), prev));
  return parts.join('');
}
// Text with $..$, \(..\), \[..\], $$..$$ kept as math. A $..$ pair counts as math only if it
// holds something mathematical, so "costs $5 and $10" stays money.
export function withMath(s, prev) {
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    const inner = m[4];
    if (inner != null && !/[\\^_=+<>]|[a-zA-Z]\s*\(|^[a-zA-Z]$|\d\s*[a-zA-Z]/.test(inner)) continue;
    if (inner != null && /^\d/.test(inner) && /\s$/.test(inner)) continue;
    out += escapeTeX(s.slice(last, m.index), last ? 'x' : prev);
    out += m[1] != null || m[2] != null ? '\n\\[\n' + (m[1] || m[2]).trim() + '\n\\]\n' : '$' + (m[3] || inner).trim() + '$';
    last = m.index + m[0].length;
  }
  return out + escapeTeX(s.slice(last), last ? 'x' : prev);
}
function tsvTable(t, opts) {
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

// File › Export as › Web page with live graphs: the document as one self contained .html file that
// reads like the paper (its text from the page's model through the same tree the Word download
// builds, src/wordast.js; its math set by KaTeX with KaTeX's fonts inside; the page's own serif),
// whose interactive graphs run live, each in a sandboxed frame as in the editor, and with an "Open
// in Rikuy" link that carries the source. For a lecture note on one's own website.
//
// What runs in it is Rikuy's alone: the frames run the graph's drawing from its description
// (src/graph.js graphHtml: Rikuy's own script, never the script of the document's file), a
// hand written widget is its picture, and the page itself has one small script that sizes the
// frames. A Content Security Policy in the file allows exactly those scripts by their hashes, no
// request out, no form, no plugin: a document from anyone exports to a page that can do nothing
// but draw its graphs.
import { buildWordDoc, safeUrl } from './wordast.js';
import { graphHtml, readGraph, kit as K } from './graph.js';
import { widgetDoc } from './widget.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_IMG = 8e6;

// The script of the page itself: each graph's frame told its height (by its own message, from that
// frame only)
const SIZER = "(function(){var F=document.querySelectorAll('iframe.rk-graph');addEventListener('message',function(e){for(var i=0;i<F.length;i++)if(F[i].contentWindow===e.source&&e.data&&e.data.rikuy==='height'){var h=Math.round(+e.data.px);if(h>40&&h<3000)F[i].style.height=h+'px';}});})();";

// pandoc's tree as HTML: what wordast.js writes (paragraphs, headings, lists, tables, math, notes,
// links, pictures), each element built from text, never from markup in the document
export class HtmlWriter {
  constructor(o) { this.o = o; this.notes = []; this.ids = new Set(); }
  math(tex, display) {
    const K2 = this.o.katex;
    try { return K2.renderToString(tex, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore', trust: false, maxSize: 50, maxExpand: 2000 }); } catch (e) { return '<code>' + esc(tex) + '</code>'; }
  }
  inl(list) { return (list || []).map((x) => this.inline(x)).join(''); }
  inline(x) {
    const c = x.c;
    switch (x.t) {
      case 'Str': return esc(c);
      case 'Space': return ' ';
      case 'SoftBreak': return '\n';
      case 'LineBreak': return '<br>';
      case 'Emph': return '<em>' + this.inl(c) + '</em>';
      case 'Strong': return '<strong>' + this.inl(c) + '</strong>';
      case 'Underline': return '<u>' + this.inl(c) + '</u>';
      case 'Strikeout': return '<s>' + this.inl(c) + '</s>';
      case 'Superscript': return '<sup>' + this.inl(c) + '</sup>';
      case 'Subscript': return '<sub>' + this.inl(c) + '</sub>';
      case 'SmallCaps': return '<span class="sc">' + this.inl(c) + '</span>';
      case 'Quoted': return (c[0].t === 'SingleQuote' ? '‘' : '“') + this.inl(c[1]) + (c[0].t === 'SingleQuote' ? '’' : '”');
      case 'Cite': return this.inl(c[1]);
      case 'Code': return '<code>' + esc(c[1]) + '</code>';
      case 'Math': return this.math(c[1], c[0].t === 'DisplayMath') ;
      case 'RawInline': return '';
      case 'Link': {
        const u = safeUrl(c[2][0]);
        return u ? '<a href="' + esc(u) + '"' + (u.startsWith('#') ? '' : ' rel="noopener noreferrer"') + '>' + this.inl(c[1]) + '</a>' : this.inl(c[1]);
      }
      case 'Image': return this.image(c);
      case 'Note': {
        const n = this.notes.push(this.blocks(c)) ;
        return '<sup class="fn" id="fnref' + n + '"><a href="#fn' + n + '">' + n + '</a></sup>';
      }
      case 'Span': {
        const st = (c[0][2] || []).find((kv) => kv[0] === 'custom-style');
        const inner = this.inl(c[1]);
        if (st && st[1] === 'Verbatim Char') return '<code>' + inner + '</code>';
        if (st && st[1] === 'All Caps') return '<span class="caps">' + inner + '</span>';
        const id = this.id(c[0][0]);
        return id ? '<span id="' + id + '">' + inner + '</span>' : inner;
      }
      default: return '';
    }
  }
  // an id kept where a reference can point to it (Rk1... are the Word download's bookmarks)
  id(v) { if (!v || /^Rk\d+$/.test(v) || this.ids.has(v) || !/^[A-Za-z][\w:.-]{0,80}$/.test(v)) return ''; this.ids.add(v); return esc(v); }
  image(c) {
    const src = c[2][0], alt = this.inl(c[1]).replace(/<[^>]*>/g, '');
    const g = this.o.graphs.get(src);
    if (g) {
      // a live graph: its frame, sandboxed to scripts alone, as wide as the text
      const doc = widgetDoc(graphHtml(g.spec));
      return '<iframe class="rk-graph" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="' + esc(g.spec.title || alt || 'Interactive graph') + '" style="aspect-ratio:' + (1 / g.spec.aspect).toFixed(4) + '" srcdoc="' + esc(doc) + '"></iframe>';
    }
    const data = this.o.images.get(src);
    if (!data) return '<span class="missing">[' + esc(alt || src) + ']</span>';
    const w = (c[0][2] || []).find((kv) => kv[0] === 'width');
    const ws = w && /^\d+(\.\d+)?(%|in|cm|mm|pt|px|em)$/.test(w[1]) ? ' style="width:' + w[1] + '"' : '';
    return '<img src="' + data + '" alt="' + esc(alt) + '"' + ws + '>';
  }
  blocks(list) { return (list || []).map((b) => this.block(b)).join('\n'); }
  block(b) {
    const c = b.c;
    switch (b.t) {
      case 'Plain': return this.inl(c);
      case 'Para': {
        // a paragraph that is one display equation, or one picture, is set as such
        if (c.length === 1 && c[0].t === 'Math' && c[0].c[0].t === 'DisplayMath') return '<div class="eq">' + this.inline(c[0]) + '</div>';
        const solo = c.filter((x) => x.t !== 'Space' && x.t !== 'SoftBreak' && !(x.t === 'Span' && !x.c[1].length));
        if (solo.length === 1 && (solo[0].t === 'Image' || (solo[0].t === 'Span' && solo[0].c[1].length === 1 && solo[0].c[1][0].t === 'Image'))) return '<figure>' + this.inl(c) + '</figure>';
        return '<p>' + this.inl(c) + '</p>';
      }
      case 'LineBlock': return '<p>' + c.map((l) => this.inl(l)).join('<br>') + '</p>';
      case 'CodeBlock': return '<pre><code>' + esc(c[1]) + '</code></pre>';
      case 'RawBlock': return '';
      case 'BlockQuote': return '<blockquote>' + this.blocks(c) + '</blockquote>';
      case 'OrderedList': return '<ol' + (c[0][0] > 1 ? ' start="' + (c[0][0] | 0) + '"' : '') + '>' + c[1].map((it) => '<li>' + this.blocks(it) + '</li>').join('') + '</ol>';
      case 'BulletList': return '<ul>' + c.map((it) => '<li>' + this.blocks(it) + '</li>').join('') + '</ul>';
      case 'DefinitionList': return '<dl>' + c.map(([t, ds]) => '<dt>' + this.inl(t) + '</dt>' + ds.map((d) => '<dd>' + this.blocks(d) + '</dd>').join('')).join('') + '</dl>';
      case 'Header': { const id = this.id(c[1][0]); return '<h' + (c[0] + 1) + (id ? ' id="' + id + '"' : '') + '>' + this.inl(c[2]) + '</h' + (c[0] + 1) + '>'; }
      case 'HorizontalRule': return '<hr>';
      case 'Table': return this.table(c);
      case 'Figure': return '<figure>' + this.blocks(c[2]) + (c[1] && c[1][1] && c[1][1].length ? '<figcaption>' + this.blocks(c[1][1]) + '</figcaption>' : '') + '</figure>';
      case 'Div': {
        const st = (c[0][2] || []).find((kv) => kv[0] === 'custom-style');
        const name = st ? st[1] : '';
        if (/Caption$/.test(name)) return '<div class="caption">' + this.blocks(c[1]).replace(/^<p>|<\/p>$/g, '') + '</div>';
        if (name === 'Source Code') return '<pre class="code">' + this.blocks(c[1]).replace(/<\/?p>/g, '') + '</pre>';
        const cls = name ? ' class="s-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '"' : '';
        const id = this.id(c[0][0]);
        return '<div' + (id ? ' id="' + id + '"' : '') + cls + '>' + this.blocks(c[1]) + '</div>';
      }
      default: return '';
    }
  }
  table(c) {
    const [, caption, specs, head, bodies, foot] = c;
    const al = (a) => ({ AlignLeft: 'left', AlignRight: 'right', AlignCenter: 'center' }[a && a.t] || '');
    const row = (r, tag) => '<tr>' + r[1].map((cell) => {
      const [, a, rs, cs, bl] = cell;
      const x = al(a) || al(specs[0] && specs[0][0]);
      return '<' + tag + (rs > 1 ? ' rowspan="' + (rs | 0) + '"' : '') + (cs > 1 ? ' colspan="' + (cs | 0) + '"' : '') + (x ? ' style="text-align:' + x + '"' : '') + '>' + this.blocks(bl).replace(/^<p>|<\/p>$/g, '') + '</' + tag + '>';
    }).join('') + '</tr>';
    const cap = caption && caption[1] && caption[1].length ? '<caption>' + this.blocks(caption[1]) + '</caption>' : '';
    const th = head && head[1] && head[1].length ? '<thead>' + head[1].map((r) => row(r, 'th')).join('') + '</thead>' : '';
    const tb = (bodies || []).map((B) => '<tbody>' + B[2].concat(B[3]).map((r) => row(r, 'td')).join('') + '</tbody>').join('');
    const tf = foot && foot[1] && foot[1].length ? '<tfoot>' + foot[1].map((r) => row(r, 'td')).join('') + '</tfoot>' : '';
    return '<div class="table"><table>' + cap + th + tb + tf + '</table></div>';
  }
  meta(m) {
    const get = (k) => m[k];
    const metaInl = (v) => (v && v.t === 'MetaInlines' ? this.inl(v.c) : v && v.t === 'MetaString' ? esc(v.c) : '');
    let out = '';
    if (get('title')) out += '<h1 class="title">' + metaInl(get('title')) + '</h1>';
    if (get('subtitle')) out += '<p class="subtitle">' + metaInl(get('subtitle')) + '</p>';
    const au = get('author');
    if (au && au.t === 'MetaList') out += '<p class="author">' + au.c.map(metaInl).join(' · ') + '</p>';
    if (get('date')) out += '<p class="date">' + metaInl(get('date')) + '</p>';
    const ab = get('abstract');
    if (ab && ab.t === 'MetaBlocks') out += '<section class="abstract"><h2>Abstract</h2>' + this.blocks(ab.c) + '</section>';
    return out;
  }
  notesOut() {
    if (!this.notes.length) return '';
    return '<section class="notes"><hr><ol>' + this.notes.map((n, k) => '<li id="fn' + (k + 1) + '">' + n.replace(/<\/p>$/, ' <a href="#fnref' + (k + 1) + '" aria-label="Back to the text">↩</a></p>') + '</li>').join('') + '</ol></section>';
  }
}

async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let s = '';
  for (const b of d) s += String.fromCharCode(b);
  return 'sha256-' + btoa(s);
}
async function dataURL(blob, type) {
  const a = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768));
  return 'data:' + (type || blob.type || 'application/octet-stream') + ';base64,' + btoa(s);
}

// The page's fonts this page needs, as @font-face rules with their files inside: the paper's serif
// and the KaTeX faces the math uses (each read from the editor's own style sheets, a file of the
// editor's fetched from beside it)
async function fontRules(html) {
  const want = new Set(['Paper Modern Serif', 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_Size3', 'KaTeX_Size4']);
  const uses = { KaTeX_AMS: /\b(amsrm|mathbb|textbb)\b/, KaTeX_Caligraphic: /\b(mathcal|cal)\b/, KaTeX_Fraktur: /\b(mathfrak|textfrak)\b/, KaTeX_SansSerif: /\b(mathsf|textsf|mathsfit)\b/, KaTeX_Script: /\b(mathscr|textscr)\b/, KaTeX_Typewriter: /\b(mathtt|texttt)\b/, 'Paper Modern Typewriter': /<code|<pre/ };
  for (const [f, re] of Object.entries(uses)) if (re.test(html)) want.add(f);
  const out = [], katex = [];
  for (const sh of document.styleSheets) {
    let rules;
    try { rules = sh.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) {
        const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        if (!want.has(fam)) continue;
        const src = r.style.getPropertyValue('src'), m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(src);
        if (!m) continue;
        let u = m[1];
        if (!u.startsWith('data:')) { try { u = await dataURL(await (await fetch(new URL(u, document.baseURI))).blob(), 'font/woff2'); } catch (e) { continue; } }
        out.push('@font-face{font-family:"' + fam + '";src:url(' + u + ') format("woff2");font-weight:' + (r.style.getPropertyValue('font-weight') || 'normal') + ';font-style:' + (r.style.getPropertyValue('font-style') || 'normal') + ';font-display:block}');
      } else if (r.selectorText && /\.katex/.test(r.selectorText)) katex.push(r.cssText);
    }
  }
  return out.join('\n') + '\n' + katex.join('\n');
}

const CSS = `
:root{color-scheme:light}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#f4f3ef;color:#111;font:18px/1.55 "Paper Modern Serif","Latin Modern Roman","CMU Serif",Georgia,serif}
main{box-sizing:border-box;max-width:44rem;margin:2rem auto;padding:3rem 3.2rem;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}
p{margin:0 0 .9em;text-align:justify;hyphens:auto}
h1.title{font-size:1.75em;font-weight:500;text-align:center;margin:0 0 .4em;line-height:1.2}
.subtitle,.author,.date{text-align:center;margin:.2em 0}
.author{font-size:1.1em}.date{margin-bottom:1.6em}
.abstract{margin:1.6em 2.2em}.abstract h2{font-size:.95em;text-align:center;margin:0 0 .4em}.abstract p{font-size:.92em}
h2{font-size:1.3em;margin:1.6em 0 .6em}h3{font-size:1.12em;margin:1.4em 0 .5em}h4,h5,h6,h7{font-size:1em;margin:1.2em 0 .4em}
.eq{margin:1em 0;overflow-x:auto;overflow-y:hidden}
.katex{font-size:1.08em}.katex-display{margin:0}
figure{margin:1.4em 0;text-align:center}figure img{max-width:100%}
.caption{text-align:center;font-size:.92em;margin:-.6em 0 1.4em}
iframe.rk-graph{display:block;width:100%;min-height:200px;border:0;background:#fff;color-scheme:light}
.table{overflow-x:auto;margin:1.2em 0}table{border-collapse:collapse;margin:0 auto;border-top:1.5px solid #111;border-bottom:1.5px solid #111}
th,td{padding:.25em .7em;text-align:left}thead tr{border-bottom:1px solid #111}caption{caption-side:bottom;font-size:.92em;padding-top:.5em}
blockquote{margin:1em 2em}pre,code{font-family:"Paper Modern Typewriter","Latin Modern Mono",monospace;font-size:.9em}pre{white-space:pre-wrap}
.sc{font-variant:small-caps}.caps{text-transform:uppercase}.missing{color:#888}
.notes{font-size:.88em;margin-top:2em}.notes hr{border:0;border-top:1px solid #bbb;width:30%;margin:0 0 1em}
sup.fn{font-size:.72em;line-height:0}a{color:#1a4f8b}
footer{max-width:44rem;margin:0 auto 2rem;padding:0 1rem;text-align:center;font:13px/1.5 system-ui,sans-serif;color:#555}
footer a{color:#1a4f8b}
@media (max-width:640px){body{font-size:16.5px}main{margin:0;padding:1.4rem 1.1rem;box-shadow:none}.abstract{margin:1.2em .4em}p{text-align:left}}
@media print{body{background:#fff}main{box-shadow:none;margin:0;max-width:none}footer{display:none}}
`;

// The page: o = { model, files, main, name, assets (Map name -> Blob), graphs (fallback name ->
// widget path), katex, openUrl, pdfPicture(bytes) } -> its HTML
export async function webPage(o) {
  const graphs = new Map();
  for (const [fb, path] of o.graphs) { const spec = readGraph(o.files.get(path)); if (spec) graphs.set(fb, { path, spec: K.normalize(spec) }); }
  // pictures inside the page as data: (a PDF figure as a picture of its first page)
  const images = new Map();
  let total = 0;
  const find = (name) => {
    const base = String(name || '').replace(/^\.\//, '');
    for (const c of [base, ...['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf'].map((x) => base + x)]) if (o.assets.has(c)) return c;
    return null;
  };
  const wanted = new Map();
  const asset = (name) => {
    if (graphs.has(name)) return name;
    const k = find(name);
    if (!k || /\.(eps|pgf)$/i.test(k)) return null;
    wanted.set(name, k);
    return name;
  };
  const W = buildWordDoc(o.model, o.files, { citeproc: false, asset, comments: false, main: o.main });
  for (const [name, k] of wanted) {
    try {
      const blob = o.assets.get(k);
      let url;
      if (/\.pdf$/i.test(k)) url = await dataURL(new Blob([await o.pdfPicture(new Uint8Array(await blob.arrayBuffer()))], { type: 'image/png' }));
      else if (/\.svg$/i.test(k)) continue; // (an SVG can hold script: left out)
      else url = await dataURL(blob, /\.png$/i.test(k) ? 'image/png' : /\.jpe?g$/i.test(k) ? 'image/jpeg' : /\.gif$/i.test(k) ? 'image/gif' : 'application/octet-stream');
      if (total + url.length > MAX_IMG * 4 / 3) continue;
      total += url.length;
      images.set(name, url);
    } catch (e) { /* left out: its name shows instead */ }
  }
  const w = new HtmlWriter({ katex: o.katex, graphs, images });
  const head = w.meta(W.doc.meta || {});
  const body = w.blocks(W.doc.blocks) + w.notesOut();
  const fonts = await fontRules(head + body);
  // the scripts allowed: the page's sizer, and in every graph's frame the guard and the drawing
  const frameScripts = new Set();
  for (const g of graphs.values()) for (const m of widgetDoc(graphHtml(g.spec)).matchAll(/<script>([\s\S]*?)<\/script>/g)) frameScripts.add(m[1]);
  const hashes = [await sha256(SIZER), ...await Promise.all([...frameScripts].map(sha256))];
  const csp = "default-src 'none'; script-src " + hashes.map((h) => "'" + h + "'").join(' ') + "; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'";
  const title = (W.doc.meta && W.doc.meta.title ? w.inl(W.doc.meta.title.c).replace(/<[^>]*>/g, '') : '') || o.name || 'Paper';
  const open = o.openUrl ? '<a href="' + esc(o.openUrl) + '" rel="noopener">Open in Rikuy</a>: the LaTeX source, to edit or compile. ' : '';
  return '<!doctype html>\n<html lang="' + esc(o.lang || 'en') + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<meta name="referrer" content="no-referrer">\n<meta name="generator" content="Rikuy">\n' +
    '<title>' + esc(title.replace(/\s+/g, ' ').trim().slice(0, 200)) + '</title>\n<style>\n' + fonts + '\n' + CSS + '</style>\n</head>\n<body>\n<main>\n' + head + '\n' + body + '\n</main>\n' +
    '<footer>' + open + 'The graphs are live: drag their sliders. Made with Rikuy.</footer>\n' +
    (graphs.size ? '<script>' + SIZER + '</script>\n' : '') + '</body>\n</html>\n';
}

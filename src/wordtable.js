// What pandoc's Word writer leaves out of a table, put into the .docx it wrote: a cell's shading
// (\cellcolor, \rowcolor, \rowcolors), its text turned (\rotatebox{90} or {270}), a cell's formula
// (a "% formula" line, src/table.js: Word's own field, = SUM(ABOVE) \# "0.00", round the value)
// and the table's alt text (a "% alt:" line, src/table.js). src/wordast.js keeps them in the attributes of the
// AST's tables and cells (pandoc reads and drops them); after pandoc, tableExtras reads them back
// from the same AST and applyTableExtras writes them into word/document.xml, the n-th table of
// the AST being the n-th <w:tbl> there (pandoc writes the body's tables in order, a table in a
// cell after the one it is in). Pure, bounded, on strings.

const SHD = 'rk-shd', ROT = 'rk-rot', ALT = 'rk-alt', FX = 'rk-fx';
const kv = (attr, k) => { const x = attr && attr[2] ? attr[2].find((p) => p[0] === k) : null; return x ? x[1] : null; };
const xmlAttr = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// The tables of a pandoc document in order, each { alt, rows: [[{ shd, rot }]] } (head rows, then
// each body's rows), or [] where no table has anything Word would lose
export function tableExtras(doc) {
  const out = [];
  let any = false, n = 0;
  const cellsOf = (rows) => rows.map((r) => r[1].map((c) => { const shd = kv(c[0], SHD), rot = kv(c[0], ROT), fx = kv(c[0], FX); if (shd || rot || fx) any = true; return { shd, rot, fx }; }));
  const walk = (x, depth) => {
    if (!x || depth > 60 || n++ > 200000) return;
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    if (typeof x !== 'object') return;
    if (x.t === 'Note') return;
    if (x.t === 'Table') {
      const c = x.c, alt = kv(c[0], ALT);
      if (alt) any = true;
      const rows = [...cellsOf(c[3][1]), ...c[4].flatMap((b) => [...cellsOf(b[2]), ...cellsOf(b[3])])];
      out.push({ alt, rows });
      // (tables inside its cells come after it)
      for (const r of [...c[3][1], ...c[4].flatMap((b) => [...b[2], ...b[3]])]) for (const cell of r[1]) walk(cell[4], depth + 1);
      return;
    }
    if (x.c) walk(x.c, depth + 1);
  };
  walk(doc && doc.blocks, 0);
  return any ? out : [];
}

// the element's end in xml from its start (the name's own nesting counted), or -1
function endOf(xml, s, name) {
  const re = new RegExp('<(/?)' + name + '(?=[\\s>/])[^>]*?(/?)>', 'g');
  re.lastIndex = s;
  let d = 0, m;
  while ((m = re.exec(xml))) {
    if (m[2]) { if (d === 0) return m.index + m[0].length; continue; }
    if (m[1]) { d--; if (d === 0) return m.index + m[0].length; } else d++;
  }
  return -1;
}
// the top level children <name> of the element [s, e) (not those of tables nested in it)
function children(xml, s, e, name) {
  const out = [];
  const re = new RegExp('<' + name + '(?=[\\s>/])', 'g');
  re.lastIndex = s;
  let m;
  while ((m = re.exec(xml)) && m.index < e) {
    const z = endOf(xml, m.index, name);
    if (z < 0 || z > e) break;
    out.push([m.index, z]);
    re.lastIndex = z;
  }
  return out;
}
// a cell's properties with one more: in the schema's order (shd before textDirection, both before vAlign)
const ORDER = ['w:tcW', 'w:gridSpan', 'w:hMerge', 'w:vMerge', 'w:tcBorders', 'w:shd', 'w:noWrap', 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark'];
function withProp(tc, name, el) {
  const pr = /<w:tcPr\s*\/>|<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(tc);
  if (!pr) return tc.replace(/^<w:tc(\s[^>]*)?>/, (o) => o + '<w:tcPr>' + el + '</w:tcPr>');
  let inner = pr[1] || '';
  inner = inner.replace(new RegExp('<' + name + '\\b[^>]*/>'), '');
  const k = ORDER.indexOf(name);
  let at = inner.length;
  const tags = [...inner.matchAll(/<(w:[A-Za-z]+)\b/g)];
  for (const t of tags) if (ORDER.indexOf(t[1]) > k) { at = t.index; break; }
  return tc.slice(0, pr.index) + '<w:tcPr>' + inner.slice(0, at) + el + inner.slice(at) + '</w:tcPr>' + tc.slice(pr.index + pr[0].length);
}

// a cell's first paragraph's runs inside Word's field for its formula (its result, the value Rikuy
// wrote, shown until Word updates it on F9)
function withField(tc, formula) {
  const p = /<w:p(?:\s[^>]*)?>/.exec(tc);
  if (!p) return tc;
  const ps = p.index + p[0].length, pe = tc.indexOf('</w:p>', ps);
  if (pe < 0) return tc;
  let a = ps;
  const pr = /^<w:pPr>[\s\S]*?<\/w:pPr>|^<w:pPr\s*\/>/.exec(tc.slice(ps, pe));
  if (pr) a += pr[0].length;
  const runs = tc.slice(a, pe);
  if (/<w:fldSimple\b|<w:fldChar\b/.test(runs)) return tc;
  // (from its first run to its last: Rikuy's bookmarks round them stay outside the field)
  const r0 = runs.search(/<w:r[\s>]/), r1 = runs.lastIndexOf('</w:r>');
  if (r0 < 0 || r1 < r0) return tc;
  const s0 = a + r0, s1 = a + r1 + 6;
  return tc.slice(0, s0) + '<w:fldSimple w:instr=" ' + xmlAttr(String(formula).slice(0, 500)) + ' ">' + tc.slice(s0, s1) + '</w:fldSimple>' + tc.slice(s1);
}

// The formulas of a .docx's tables, for the "% formula" lines (Word's = fields in cells, simple or
// complex): [{ table (k-th table that no table holds), r, c (A1's, from 0), formula, value }]; tables
// that hold a table are left out
export function docxFormulas(xml) {
  const out = [];
  if (!xml || xml.length > 50e6) return out;
  const re = /<w:tbl>/g;
  let m, k = -1, guard = 0, end = -1;
  while ((m = re.exec(xml)) && guard++ < 5000) {
    if (m.index < end) continue;
    const e = endOf(xml, m.index, 'w:tbl');
    if (e < 0) break;
    k++; end = e;
    const t = xml.slice(m.index, e);
    if (t.indexOf('<w:tbl>', 6) >= 0) continue;
    children(t, 5, t.length, 'w:tr').forEach(([a, z], r) => {
      const tr = t.slice(a, z);
      let c = 0;
      for (const [x, y] of children(tr, 4, tr.length, 'w:tc')) {
        const tc = tr.slice(x, y);
        const span = +((/<w:gridSpan w:val="(\d+)"/.exec(tc) || [])[1] || 1);
        const simple = /<w:fldSimple\b[^>]*w:instr="([^"]*)"/.exec(tc);
        const instr = (simple ? simple[1] : [...tc.matchAll(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g)].map((q) => q[1]).join('')).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        if (/^=/.test(instr)) {
          // (the value shown: the field's result, after its separate mark in a complex field)
          const after = simple ? tc : tc.slice(Math.max(0, tc.search(/<w:fldChar\b[^>]*w:fldCharType="separate"/)));
          const value = [...after.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((q) => q[1]).join('').replace(/&amp;/g, '&').trim();
          out.push({ table: k, r, c, formula: instr.replace(/\s+/g, ' ').slice(0, 500), value });
        }
        c += span;
      }
    });
  }
  return out;
}

// document.xml with each table's extras written in
export function applyTableExtras(xml, extras) {
  if (!extras || !extras.length) return xml;
  const tbls = [];
  const re = /<w:tbl>/g;
  let m;
  while ((m = re.exec(xml)) && tbls.length < 5000) { const e = endOf(xml, m.index, 'w:tbl'); if (e > 0) tbls.push([m.index, e]); }
  // (from the last table back, so the places before stay where they are; a table in a cell is
  // after the one it is in, so the outer one is changed after its inner ones, around them)
  for (let k = Math.min(tbls.length, extras.length) - 1; k >= 0; k--) {
    const X = extras[k];
    // (its end now: the tables inside it, written first, moved it)
    const s = tbls[k][0], e = endOf(xml, s, 'w:tbl');
    if (e < 0) continue;
    let t = xml.slice(s, e);
    const rows = children(t, 5, t.length, 'w:tr');
    for (let r = rows.length - 1; r >= 0; r--) {
      const want = X.rows[r] || [];
      const tr = t.slice(rows[r][0], rows[r][1]);
      // (a cell that continues one merged down is Word's alone: it has no cell in the AST)
      const tcs = children(tr, 4, tr.length, 'w:tc').filter(([a, z]) => { const x = tr.slice(a, z); return !/<w:vMerge\s*\/>|<w:vMerge w:val="continue"\s*\/>/.test(x.slice(0, x.indexOf('</w:tcPr>') + 1 || 400)); });
      let row = tr;
      for (let i = Math.min(tcs.length, want.length) - 1; i >= 0; i--) {
        const W = want[i];
        if (!W || (!W.shd && !W.rot && !W.fx)) continue;
        let tc = row.slice(tcs[i][0], tcs[i][1]);
        if (W.shd && /^[0-9A-F]{6}$/.test(W.shd)) tc = withProp(tc, 'w:shd', '<w:shd w:val="clear" w:color="auto" w:fill="' + W.shd + '" />');
        if (W.rot === '90' || W.rot === '270') tc = withProp(tc, 'w:textDirection', '<w:textDirection w:val="' + (W.rot === '90' ? 'btLr' : 'tbRl') + '" />');
        if (W.fx) tc = withField(tc, W.fx);
        row = row.slice(0, tcs[i][0]) + tc + row.slice(tcs[i][1]);
      }
      t = t.slice(0, rows[r][0]) + row + t.slice(rows[r][1]);
    }
    if (X.alt) {
      const i = t.indexOf('</w:tblPr>');
      if (i > 0 && !/<w:tblDescription\b/.test(t.slice(0, i))) t = t.slice(0, i) + '<w:tblDescription w:val="' + xmlAttr(X.alt.slice(0, 2000)) + '" />' + t.slice(i);
    }
    xml = xml.slice(0, s) + t + xml.slice(e);
  }
  return xml;
}

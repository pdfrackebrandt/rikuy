// What pandoc's Word writer leaves out of a table, put into the .docx it wrote: a cell's shading
// (\cellcolor, \rowcolor, \rowcolors), its text turned (\rotatebox{90} or {270}) and the table's
// alt text (a "% alt:" line, src/table.js). src/wordast.js keeps them in the attributes of the
// AST's tables and cells (pandoc reads and drops them); after pandoc, tableExtras reads them back
// from the same AST and applyTableExtras writes them into word/document.xml, the n-th table of
// the AST being the n-th <w:tbl> there (pandoc writes the body's tables in order, a table in a
// cell after the one it is in). Pure, bounded, on strings.

const SHD = 'rk-shd', ROT = 'rk-rot', ALT = 'rk-alt';
const kv = (attr, k) => { const x = attr && attr[2] ? attr[2].find((p) => p[0] === k) : null; return x ? x[1] : null; };
const xmlAttr = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// The tables of a pandoc document in order, each { alt, rows: [[{ shd, rot }]] } (head rows, then
// each body's rows), or [] where no table has anything Word would lose
export function tableExtras(doc) {
  const out = [];
  let any = false, n = 0;
  const cellsOf = (rows) => rows.map((r) => r[1].map((c) => { const shd = kv(c[0], SHD), rot = kv(c[0], ROT); if (shd || rot) any = true; return { shd, rot }; }));
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
        if (!W || (!W.shd && !W.rot)) continue;
        let tc = row.slice(tcs[i][0], tcs[i][1]);
        if (W.shd && /^[0-9A-F]{6}$/.test(W.shd)) tc = withProp(tc, 'w:shd', '<w:shd w:val="clear" w:color="auto" w:fill="' + W.shd + '" />');
        if (W.rot === '90' || W.rot === '270') tc = withProp(tc, 'w:textDirection', '<w:textDirection w:val="' + (W.rot === '90' ? 'btLr' : 'tbRl') + '" />');
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

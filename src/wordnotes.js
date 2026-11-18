// Endnotes between Rikuy and Word (R4). pandoc has notes of one kind: its Word files have
// footnotes only, and it reads a Word file's endnotes as footnotes.
//
// Out: src/wordast.js writes each \endnote as a note whose words begin with the comment
// <!--rikuy:endnote:STYLE-->; endnotesDocx moves those notes from word/footnotes.xml into
// word/endnotes.xml as Word's endnotes (references, styles, numbering as the document's, the part
// and its relation), and takes the comment out.
// In: markEndnotes puts a mark before the words of each endnote of a stranger's Word file;
// endnotesTex makes the notes that carry it \endnote again (enotez's), in pandoc's JSON.
// Both read XML by plain scans, each bounded by the part's size.

const enc = new TextEncoder(), dec = new TextDecoder();
const FMT = { arabic: 'decimal', roman: 'lowerRoman', Roman: 'upperRoman', alph: 'lowerLetter', Alph: 'upperLetter', fnsymbol: 'chicago' };
const END_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes';
const END_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml';
const MARK = /<!--rikuy:endnote:([A-Za-z]{1,10})-->/;
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

// the <w:footnote …>…</w:footnote> elements of footnotes.xml, each with its id and place
function notesOf(x, tag) {
  const out = [];
  let i = 0;
  for (let k = 0; k < 100000; k++) {
    const a = x.indexOf('<w:' + tag + ' ', i);
    if (a < 0) break;
    const b = x.indexOf('</w:' + tag + '>', a);
    if (b < 0) break;
    const e = b + tag.length + 5;
    const head = x.slice(a, x.indexOf('>', a) + 1);
    const id = /w:id="(-?\d{1,9})"/.exec(head);
    out.push({ s: a, e, id: id ? id[1] : null, xml: x.slice(a, e), type: /w:type="/.test(head) });
    i = e;
  }
  return out;
}

export function endnotesDocx(parts) {
  const fx = parts.get('word/footnotes.xml');
  if (!fx) return null;
  let foot = dec.decode(fx);
  if (!MARK.test(foot)) return null;
  const moved = [];
  let style = 'arabic';
  // (the part rebuilt once, from its pieces: linear in its size, as markEndnotes)
  const keep = [];
  let at = 0;
  for (const n of notesOf(foot, 'footnote')) {
    const m = MARK.exec(n.xml);
    if (!m || n.type || n.id == null) continue;
    style = m[1];
    const xml = n.xml.replace(MARK, '').replace(/<w:footnote /, '<w:endnote ').replace(/<\/w:footnote>$/, '</w:endnote>')
      .replace(/<w:footnoteRef\s*\/>/g, '<w:endnoteRef/>').replace(/w:val="FootnoteText"/g, 'w:val="EndnoteText"').replace(/w:val="FootnoteReference"/g, 'w:val="EndnoteReference"');
    moved.push({ id: n.id, xml });
    keep.push(foot.slice(at, n.s));
    at = n.e;
  }
  if (!moved.length) return null;
  foot = keep.join('') + foot.slice(at);
  const out = new Map(parts);
  out.set('word/footnotes.xml', enc.encode(foot));
  // the references in the text: the run's style and the reference itself
  let doc = dec.decode(parts.get('word/document.xml'));
  for (const { id } of moved) {
    const rm = new RegExp('<w:footnoteReference w:id="' + id + '"\\s*/>').exec(doc);
    if (!rm) continue;
    const k = rm.index, ref = rm[0];
    const rs = doc.lastIndexOf('<w:r>', k), rs2 = doc.lastIndexOf('<w:r ', k);
    const runStart = Math.max(rs, rs2);
    const pre = runStart >= 0 ? doc.slice(runStart, k).replace('w:val="FootnoteReference"', 'w:val="EndnoteReference"') : doc.slice(0, k);
    doc = (runStart >= 0 ? doc.slice(0, runStart) + pre : pre) + '<w:endnoteReference w:id="' + id + '"/>' + doc.slice(k + ref.length);
  }
  out.set('word/document.xml', enc.encode(doc));
  out.set('word/endnotes.xml', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:endnotes ' + NS + '>'
    + '<w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote>'
    + '<w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote>'
    + moved.map((x) => x.xml).join('') + '</w:endnotes>'));
  // the part's relation and its type
  const rels = dec.decode(parts.get('word/_rels/document.xml.rels'));
  if (!rels.includes(END_REL)) out.set('word/_rels/document.xml.rels', enc.encode(rels.replace('</Relationships>', '<Relationship Id="rIdRikuyEndnotes" Type="' + END_REL + '" Target="endnotes.xml"/></Relationships>')));
  const ct = dec.decode(parts.get('[Content_Types].xml'));
  if (!ct.includes('/word/endnotes.xml')) out.set('[Content_Types].xml', enc.encode(ct.replace('</Types>', '<Override PartName="/word/endnotes.xml" ContentType="' + END_CT + '"/></Types>')));
  // numbered as the document numbers them (Word's own default is i, ii, iii), set at the end
  if (parts.has('word/settings.xml')) {
    const st = dec.decode(parts.get('word/settings.xml'));
    const pr = '<w:endnotePr><w:numFmt w:val="' + (FMT[style] || 'decimal') + '"/><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>';
    if (!st.includes('<w:endnotePr')) {
      const at = st.indexOf('<w:compat');
      out.set('word/settings.xml', enc.encode(at >= 0 ? st.slice(0, at) + pr + st.slice(at) : st.replace('</w:settings>', pr + '</w:settings>')));
    }
  }
  // styles for the endnotes, as the footnotes' are
  if (parts.has('word/styles.xml')) {
    let sx = dec.decode(parts.get('word/styles.xml'));
    const add = [];
    if (!/w:styleId="EndnoteText"/.test(sx)) add.push('<w:style w:type="paragraph" w:customStyle="1" w:styleId="EndnoteText"><w:name w:val="Endnote Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>');
    if (!/w:styleId="EndnoteReference"/.test(sx)) add.push('<w:style w:type="character" w:customStyle="1" w:styleId="EndnoteReference"><w:name w:val="Endnote Reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>');
    if (add.length) { sx = sx.replace('</w:styles>', add.join('') + '</w:styles>'); out.set('word/styles.xml', enc.encode(sx)); }
  }
  return out;
}

// ---- in ----------------------------------------------------------------------------------------
// U+2063 RKEN U+2063: a run pandoc keeps as text, which no one types
export const EN_MARK = '⁣RKEN⁣';
export function markEndnotes(parts) {
  const ex = parts.get('word/endnotes.xml');
  if (!ex || ex.length > 20e6) return 0;
  const x = dec.decode(ex), out = [];
  let n = 0, last = 0;
  // (a stranger's file: rebuilt once from its pieces, linear in its size, whatever its notes)
  for (const e of notesOf(x, 'endnote')) {
    if (e.type) continue;
    // (before the words of its first paragraph: after the paragraph's settings, if any)
    const p = e.xml.indexOf('<w:p');
    if (p < 0) continue;
    const pe = e.xml.indexOf('>', p) + 1;
    const pp = e.xml.indexOf('</w:pPr>', pe);
    const at = pp >= 0 && pp < e.xml.indexOf('<w:r', pe) ? pp + 8 : pe;
    out.push(x.slice(last, e.s), e.xml.slice(0, at), '<w:r><w:t>' + EN_MARK + '</w:t></w:r>', e.xml.slice(at));
    last = e.e;
    n++;
  }
  if (n) parts.set('word/endnotes.xml', enc.encode(out.join('') + x.slice(last)));
  return n;
}
// pandoc's JSON: a note carrying the mark becomes \endnote{…} (its paragraphs joined by \par)
export function endnotesTex(doc) {
  let n = 0, foot = 0;
  // (the note's first word, wherever its first paragraph is: a table's first cell too)
  const firstStr = (v, d = 0) => {
    if (!v || typeof v !== 'object' || d > 40) return null;
    if (v.t === 'Str') return v;
    for (const k of Array.isArray(v) ? v : [v.c]) { const r = firstStr(k, d + 1); if (r) return r; if (k && typeof k === 'object' && (k.t === 'Str' || k.t === 'Space')) return null; }
    return null;
  };
  const fix = (arr, depth) => {
    if (!Array.isArray(arr) || depth > 60) return;
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (!x || typeof x !== 'object') continue;
      if (x.t === 'Note') {
        const s = firstStr(x.c);
        if (s && s.c.startsWith(EN_MARK)) {
          s.c = s.c.slice(EN_MARK.length).replace(/^\s+/, '');
          // (a note with a table, a list or any block an argument cannot hold stays a footnote,
          // every block of it kept, and is counted for the import's notes: review M3)
          if (x.c.some((b) => b.t !== 'Para' && b.t !== 'Plain')) {
            foot++;
            const b0 = x.c[0];
            if (b0 && (b0.t === 'Para' || b0.t === 'Plain')) while (b0.c.length && ((b0.c[0].t === 'Str' && !b0.c[0].c) || b0.c[0].t === 'Space')) b0.c.shift();
            if (Array.isArray(x.c)) fix(x.c, depth + 1); continue; }
          const inl = [{ t: 'RawInline', c: ['latex', '\\endnote{'] }];
          x.c.forEach((b, k) => { if (k) inl.push({ t: 'RawInline', c: ['latex', '\\par '] }); if (b.t === 'Para' || b.t === 'Plain') inl.push(...b.c); });
          // (the space Word puts after the note's number, as pandoc leaves a footnote's out)
          while (inl.length > 1 && ((inl[1].t === 'Str' && !inl[1].c) || inl[1].t === 'Space')) inl.splice(1, 1);
          inl.push({ t: 'RawInline', c: ['latex', '}'] });
          arr.splice(i, 1, ...inl.filter((y) => !(y.t === 'Str' && !y.c)));
          i += inl.length - 1;
          n++;
          continue;
        }
      }
      if (Array.isArray(x.c)) fix(x.c, depth + 1);
      else if (x.c && typeof x.c === 'object') for (const v of Object.values(x.c)) fix(v, depth + 1);
    }
  };
  fix(doc.blocks, 0);
  return { n, foot };
}

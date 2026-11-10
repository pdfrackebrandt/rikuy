"""A Word file as Word users make them, built with python-docx (and raw WordprocessingML where
python-docx has no API: an equation in OMML, a footnote, a hyperlink): a title, headings, bold and
italic text, a link, a bulleted and a numbered list, a table, a picture, a footnote, and an inline
and a display equation. test/word.py and test/word.test.mjs open it; `python3 word_fixture.py out.docx`
writes it (`-` for standard output).

make_rich() is a second file, of what pandoc alone loses or writes as LaTeX that does not compile
(test/fixtures/word-rich.docx, `python3 word_fixture.py out.docx rich`): a subtitle, coloured,
highlighted, underlined and struck text, symbols and Greek and Cyrillic and Chinese words, a comment
with a reply's worth of TeX in it, a tracked change, a table of contents, a caption whose number is
a short field with the bookmark a cross reference names, a picture wider than the page, a table
with a caption and merged cells and a table inside it, a page break, a centred paragraph, a formula
of three lines, two numbered ones, an endnote, a chart, and a header."""
import io, sys, struct, zlib
from docx import Document
from docx.shared import Inches
from docx.oxml import parse_xml
from docx.opc.constants import RELATIONSHIP_TYPE as RT

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'

def png(w=48, h=32, rgb=(30, 90, 200)):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

def make():
    d = Document()
    d.add_heading('Growth and Institutions', 0)
    d.add_heading('Introduction', level=1)
    p = d.add_paragraph('We study ')
    p.add_run('growth').bold = True
    p.add_run(' under ')
    p.add_run('weak').italic = True
    p.add_run(' institutions, at a 5% rate & more. The model is ')
    # an inline equation: x squared plus alpha
    p._p.append(parse_xml('<m:oMath %s %s><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup><m:r><m:t>+α</m:t></m:r></m:oMath>' % (M, W)))
    p.add_run('. See the data')
    # a hyperlink
    rid = d.part.relate_to('https://example.org/data', RT.HYPERLINK, is_external=True)
    p._p.append(parse_xml('<w:hyperlink %s xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="%s"><w:r><w:t xml:space="preserve"> online</w:t></w:r></w:hyperlink>' % (W, rid)))
    # a javascript: link from a stranger: must not survive as a link
    rid2 = d.part.relate_to('javascript:alert(1)', RT.HYPERLINK, is_external=True)
    p._p.append(parse_xml('<w:hyperlink %s xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="%s"><w:r><w:t xml:space="preserve"> here</w:t></w:r></w:hyperlink>' % (W, rid2)))
    p.add_run('.')
    # a display equation: the integral of f from 0 to 1
    d.add_paragraph()._p.append(parse_xml('<m:oMathPara %s %s><m:oMath><m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub><m:r><m:t>0</m:t></m:r></m:sub><m:sup><m:r><m:t>1</m:t></m:r></m:sup><m:e><m:r><m:t>f</m:t></m:r><m:d><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d><m:r><m:t>dx</m:t></m:r></m:e></m:nary><m:r><m:t>=1</m:t></m:r></m:oMath></m:oMathPara>' % (M, W)))
    d.add_heading('Findings', level=1)
    for t in ['First finding', 'Second finding']: d.add_paragraph(t, style='List Bullet')
    for t in ['Step one', 'Step two']: d.add_paragraph(t, style='List Number')
    t = d.add_table(rows=3, cols=2)
    t.style = 'Table Grid'
    for r, row in enumerate([('Country', 'Growth'), ('Peru', '3.1'), ('Chile', '2.4')]):
        for c, v in enumerate(row): t.cell(r, c).text = v
    d.add_paragraph('A figure follows.')
    d.add_picture(io.BytesIO(png()), width=Inches(2))
    fp = d.add_paragraph('Footnoted sentence.')
    fp._p.append(parse_xml('<w:r %s><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r>' % W))
    buf = io.BytesIO()
    d.save(buf)
    return add_footnotes(buf.getvalue())

def add_footnotes(data):
    import zipfile
    zin = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    fn = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes %s>'
          '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
          '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
          '<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Data from the World Bank.</w:t></w:r></w:p></w:footnote></w:footnotes>') % W
    for it in zin.infolist():
        b = zin.read(it.filename)
        if it.filename == '[Content_Types].xml':
            b = b.replace(b'</Types>', b'<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>')
        if it.filename == 'word/_rels/document.xml.rels':
            b = b.replace(b'</Relationships>', b'<Relationship Id="rIdFn1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>')
        zout.writestr(it, b)
    zout.writestr('word/footnotes.xml', fn)
    zout.close()
    return out.getvalue()

R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
mr = lambda t: '<m:r><m:t>%s</m:t></m:r>' % t

def make_rich():
    from docx.shared import RGBColor
    from docx.enum.text import WD_COLOR_INDEX, WD_BREAK, WD_ALIGN_PARAGRAPH
    d = Document()
    x = lambda p, xml: p._p.append(parse_xml(xml))
    d.sections[0].header.paragraphs[0].text = 'Draft: do not cite'
    d.add_paragraph('Reform and Growth', style='Title')
    d.add_paragraph('Evidence from Peru', style='Subtitle')
    # the table of contents Word stored: a content control with a TOC field and stale entries
    d.element.body.insert(2, parse_xml(
        '<w:sdt %s><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent>'
        '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>Contents</w:t></w:r></w:p>'
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
        '<w:hyperlink w:anchor="_Toc1"><w:r><w:t>Stale entry</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>9</w:t></w:r></w:hyperlink></w:p>'
        '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>' % W))
    d.add_heading('Text', level=1)
    p = d.add_paragraph('Plain, ')
    p.add_run('red words').font.color.rgb = RGBColor(0xC0, 0, 0)
    p.add_run(', ')
    p.add_run('marked').font.highlight_color = WD_COLOR_INDEX.YELLOW
    p.add_run(', ')
    p.add_run('under').underline = True
    p.add_run(', ')
    p.add_run('struck').font.strike = True
    p.add_run(u'. If p \u2264 0.05 and \u03b2 \u2260 0 then x \u2192 \u221e, \u2212 5\u202f%. \u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac, \u041f\u0440\u0438\u0432\u0435\u0442, \u4f60\u597d.')
    # a tracked change, and a comment whose text tries to leave its line
    p = d.add_paragraph('The result is ')
    x(p, '<w:del %s w:id="10" w:author="Ana"><w:r><w:delText>weak</w:delText></w:r></w:del>' % W)
    x(p, '<w:ins %s w:id="11" w:author="Ana"><w:r><w:t>strong</w:t></w:r></w:ins>' % W)
    p.add_run(' and ')
    x(p, '<w:commentRangeStart %s w:id="1"/>' % W)
    p.add_run('robust')
    x(p, '<w:commentRangeEnd %s w:id="1"/>' % W)
    x(p, '<w:r %s><w:commentReference w:id="1"/></w:r>' % W)
    p.add_run(' to controls.')
    p = d.add_paragraph('Centred line.'); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = d.add_paragraph('Before the break.'); p.add_run().add_break(WD_BREAK.PAGE)
    d.add_heading('Floats', level=1)
    p = d.add_paragraph('See ')
    x(p, '<w:fldSimple %s w:instr=" REF _Ref7 \\h "><w:r><w:t>Figure 1</w:t></w:r></w:fldSimple>' % W)
    p.add_run(' and the wide one.')
    d.add_picture(io.BytesIO(png()), width=Inches(2))
    p = d.add_paragraph('', style='Caption')
    x(p, '<w:bookmarkStart %s w:id="7" w:name="_Ref7"/>' % W)
    p.add_run('Figure ')
    x(p, '<w:fldSimple %s w:instr=" SEQ Figure \\* ARABIC "><w:r><w:t>1</w:t></w:r></w:fldSimple>' % W)
    x(p, '<w:bookmarkEnd %s w:id="7"/>' % W)
    p.add_run(': A blue box.')
    d.add_picture(io.BytesIO(png(400, 20, (90, 90, 90))), width=Inches(9))
    d.add_paragraph('The regions follow.')
    d.add_paragraph('Table 1: Growth by region', style='Caption')
    t = d.add_table(rows=4, cols=3); t.style = 'Table Grid'
    for r, row in enumerate([('Region', 'Outcome', ''), ('', 'Before', 'After'), ('North', '1', '2'), ('South', '3', '')]):
        for c, v in enumerate(row): t.cell(r, c).text = v
    t.cell(0, 1).merge(t.cell(0, 2)); t.cell(0, 0).merge(t.cell(1, 0))
    inner = t.cell(3, 2).add_table(rows=1, cols=2)
    inner.cell(0, 0).text = 'in1'; inner.cell(0, 1).text = 'in2'
    d.add_heading('Equations', level=1)
    # three formulas in one math paragraph (Shift+Enter in Word's equation editor)
    x(d.add_paragraph(), '<m:oMathPara %s %s><m:oMath>%s<m:r><w:br/></m:r></m:oMath><m:oMath>%s<m:r><w:br/></m:r></m:oMath><m:oMath>%s</m:oMath></m:oMathPara>' % (M, W, mr('x=1'), mr('y=2+x'), mr('z=3')))
    p = d.add_paragraph('\t'); x(p, '<m:oMath %s %s>%s<m:sSup><m:e>%s</m:e><m:sup>%s</m:sup></m:sSup></m:oMath>' % (M, W, mr('E=m'), mr('c'), mr('2'))); p.add_run('\t(1)')
    x(d.add_paragraph(), '<m:oMathPara %s %s><m:oMath><m:eqArr><m:eqArrPr><m:maxDist m:val="1"/></m:eqArrPr><m:e>%s</m:e></m:eqArr></m:oMath></m:oMathPara>' % (M, W, mr('F=ma#(7)')))
    p = d.add_paragraph('An endnote here.')
    x(p, '<w:r %s><w:endnoteReference w:id="1"/></w:r>' % W)
    # a chart Word draws itself: nothing pandoc can read
    x(d.add_paragraph(), '<w:r %s xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" %s><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="99" name="Chart 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdNone"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>' % (W, R))
    buf = io.BytesIO()
    d.save(buf)
    return add_parts(buf.getvalue(), {
        'word/comments.xml': ('comments', '<w:comments %s><w:comment w:id="1" w:author="Ana (P)"><w:p><w:r><w:t>Is it?</w:t><w:br/><w:t>\\input{/etc/passwd} 50%% }</w:t></w:r></w:p></w:comment></w:comments>' % W),
        'word/endnotes.xml': ('endnotes', '<w:endnotes %s><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:id="1"><w:p><w:r><w:endnoteRef/></w:r><w:r><w:t xml:space="preserve"> The endnote text.</w:t></w:r></w:p></w:endnote></w:endnotes>' % W)})

def add_parts(data, new):
    import zipfile
    zin = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    ct = ''.join('<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.%s+xml"/>' % (n, k) for n, (k, _) in new.items())
    rels = ''.join('<Relationship Id="rIdX%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/%s" Target="%s"/>' % (i, k, n.split('/')[1]) for i, (n, (k, _)) in enumerate(new.items()))
    for it in zin.infolist():
        b = zin.read(it.filename)
        if it.filename == '[Content_Types].xml': b = b.replace(b'</Types>', ct.encode() + b'</Types>')
        if it.filename == 'word/_rels/document.xml.rels': b = b.replace(b'</Relationships>', rels.encode() + b'</Relationships>')
        zout.writestr(it, b)
    for n, (_, xml) in new.items(): zout.writestr(n, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml)
    zout.close()
    return out.getvalue()

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'fixture.docx'
    data = make_rich() if sys.argv[2:] == ['rich'] else make()
    if out == '-': sys.stdout.buffer.write(data)
    else: open(out, 'wb').write(data)

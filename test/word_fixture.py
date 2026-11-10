"""A Word file as Word users make them, built with python-docx (and raw WordprocessingML where
python-docx has no API: an equation in OMML, a footnote, a hyperlink): a title, headings, bold and
italic text, a link, a bulleted and a numbered list, a table, a picture, a footnote, and an inline
and a display equation. test/word.py and test/word.test.mjs open it; `python3 word_fixture.py out.docx`
writes it (`-` for standard output)."""
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

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'fixture.docx'
    if out == '-': sys.stdout.buffer.write(make())
    else: open(out, 'wb').write(make())

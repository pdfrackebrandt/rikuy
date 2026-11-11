"""A Word file as Word users make them, built with python-docx (and raw WordprocessingML where
python-docx has no API: an equation in OMML, a footnote, a hyperlink): a title, headings, bold and
italic text, a link, a bulleted and a numbered list, a table, a picture, a footnote, and an inline
and a display equation. test/word.py and test/word.test.mjs open it; `python3 word_fixture.py out.docx`
writes it (`-` for standard output).

make_rich() is a second file, of what pandoc alone loses or writes as LaTeX that does not compile
(test/fixtures/word-rich.docx, `python3 word_fixture.py out.docx rich`): a subtitle, coloured,
highlighted, underlined and struck text, symbols and Greek and Cyrillic and Korean words, a comment
with a reply's worth of TeX in it, a tracked change, a table of contents, a caption whose number is
a short field with the bookmark a cross reference names, a picture wider than the page, a table
with a caption and merged cells and a table inside it, a page break, a centred paragraph, a formula
of three lines, two numbered ones, an endnote, a chart, and a header.

Three more are files in Chinese and Arabic as Word writes them (`chinese`, `arabic`, `mixed` after
the name; test/fixtures/word-chinese.docx, word-arabic.docx, word-mixed.docx). make_chinese(): a
title, headings, a paragraph cut into runs wherever the font or the language changes (w:rFonts
w:eastAsia, w:hint, w:lang), bold and italic, full width punctuation and an ideographic space,
Chinese quotation marks, a bulleted and a numbered list, a table, English among the Chinese, a
footnote and a comment. make_arabic(): a document that runs right to left (w:bidi on every
paragraph and on the section, w:rtl on the runs), with English words and both kinds of digits in
it, vowel marks, a tatweel, a Persian word with a zero width non joiner, a joiner, direction marks,
paragraphs aligned to each edge, lists, a table set from the right (w:bidiVisual), text in a w:dir
wrapper, one paragraph that runs left to right, a footnote and a comment. make_mixed(): an English
document with Arabic and Chinese phrases, one whole Arabic paragraph, a table of the three, and
text and font and language names that try to be LaTeX.

Two are in India's scripts (`hindi`, `indic`; word-hindi.docx, word-indic.docx), which Word
keeps as complex script runs (w:rFonts w:cs, w:lang w:bidi="hi-IN", bold as w:bCs) cut wherever the
font changes. make_hindi(): a title, a heading, a sentence in six runs with conjuncts, a nukta,
vowel signs, an anusvara, a chandrabindu and a visarga, a joiner and a non joiner after a virama,
danda and double danda, Devanagari digits and English words, a bulleted and a numbered list, a
table, a footnote and a comment. make_indic(): an English document with a line each of Bengali,
Tamil, Telugu, Gujarati, Kannada, Malayalam, Gurmukhi and Odia with its own digits, one run that
holds three scripts, a table, and font and language names that try to be LaTeX."""
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
    p.add_run(u'. If p \u2264 0.05 and \u03b2 \u2260 0 then x \u2192 \u221e, \u2212 5\u202f%. \u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac, \u041f\u0440\u0438\u0432\u0435\u0442, \uc548\ub155.')
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

# ---- Chinese and Arabic ----

from xml.sax.saxutils import escape

def xrun(p, text, props=''):
    """A run with its properties written out, in the order Word's schema has them."""
    p._p.append(parse_xml('<w:r %s>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (W, '<w:rPr>%s</w:rPr>' % props if props else '', escape(text))))

# a run of Chinese as Word marks one (the font for East Asian text, the language), and of Arabic
# (the font for complex scripts, right to left, the language); f: bold or italic, both ways
zh = lambda f='', font='SimSun': '<w:rFonts w:eastAsia="%s" w:hint="eastAsia"/>%s<w:lang w:eastAsia="zh-CN"/>' % (font, f)
ar = lambda f='': '<w:rFonts w:cs="Arial"/>%s<w:rtl/><w:lang w:bidi="ar-SA"/>' % f
BOLD, ITALIC = '<w:b/><w:bCs/>', '<w:i/><w:iCs/>'

def note_ref(p, n):
    p._p.append(parse_xml('<w:r %s><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="%d"/></w:r>' % (W, n)))

def footnotes(notes):
    """notes: the inside of each footnote's paragraph after its number, as XML."""
    fx = ''.join('<w:footnote w:id="%d"><w:p>%s<w:r><w:footnoteRef/></w:r>%s</w:p></w:footnote>' % (i + 1, ppr, runs) for i, (ppr, runs) in enumerate(notes))
    return ('footnotes', '<w:footnotes %s><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
            '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>%s</w:footnotes>' % (W, fx))

def commented(p, n, add):
    """add() writes the runs comment n is on."""
    p._p.append(parse_xml('<w:commentRangeStart %s w:id="%d"/>' % (W, n)))
    add()
    p._p.append(parse_xml('<w:commentRangeEnd %s w:id="%d"/>' % (W, n)))
    p._p.append(parse_xml('<w:r %s><w:commentReference w:id="%d"/></w:r>' % (W, n)))

def make_chinese():
    d = Document()
    p = d.add_paragraph(style='Title'); xrun(p, u'制度变迁与经济增长', zh())
    p = d.add_heading(level=1); xrun(p, u'引言', zh(font='SimHei'))
    # one sentence in eight runs, as Word cuts text where the font, the hint or the language changes
    p = d.add_paragraph()
    xrun(p, u'本文研究', zh())
    xrun(p, u'制度变迁', zh(BOLD))
    xrun(p, u'对', '<w:rFonts w:hint="eastAsia"/>')
    xrun(p, u'经济增长', zh(ITALIC, 'KaiTi'))
    xrun(p, u'的影响，数据来自')
    xrun(p, u'World Bank', '<w:lang w:val="en-US"/>')
    xrun(p, u'（2020年），结果', zh())
    commented(p, 1, lambda: xrun(p, u'稳健', zh(font='SimHei')))
    xrun(p, u'。', zh())
    note_ref(p, 1)
    p = d.add_paragraph()
    xrun(p, u'他说：“制度‘很’重要”——见《经济学》、〈导论〉……全角　空格！ＡＢＣ１２３；繁體字：經濟學。', zh())
    p = d.add_heading(level=2); xrun(p, u'数据与方法', zh(font='SimHei'))
    for t in [u'第一项：数据', u'第二项：方法']: xrun(d.add_paragraph(style='List Bullet'), t, zh())
    for t in [u'步骤一', u'步骤二']: xrun(d.add_paragraph(style='List Number'), t, zh())
    t = d.add_table(rows=3, cols=2); t.style = 'Table Grid'
    for r, row in enumerate([(u'国家', u'增长率'), (u'秘鲁', '3.1'), (u'智利', '2.4')]):
        for c, v in enumerate(row): xrun(t.cell(r, c).paragraphs[0], v, zh() if ord(v[0]) > 255 else '')
    p = d.add_paragraph('The model (')
    xrun(p, u'模型', zh())
    p.add_run(') uses GDP ')
    xrun(p, u'数据', zh())
    p.add_run(' from 2020 to 2024.')
    buf = io.BytesIO()
    d.save(buf)
    return add_parts(buf.getvalue(), {
        'word/footnotes.xml': footnotes([('', '<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve"> 数据来自</w:t></w:r><w:r><w:rPr>%s</w:rPr><w:t>世界银行</w:t></w:r><w:r><w:t>。</w:t></w:r>' % (zh(), zh(BOLD)))]),
        'word/comments.xml': ('comments', u'<w:comments %s><w:comment w:id="1" w:author="王芳"><w:p><w:r><w:t>请引用文献。</w:t></w:r></w:p></w:comment></w:comments>' % W)})

def bidi(p, jc=None):
    """Makes p a right to left paragraph, aligned as jc says."""
    ppr = p._p.get_or_add_pPr()
    ppr.append(parse_xml('<w:bidi %s/>' % W))
    if jc: ppr.append(parse_xml('<w:jc %s w:val="%s"/>' % (W, jc)))
    return p

def make_arabic():
    d = Document()
    para = lambda style=None, jc=None: bidi(d.add_paragraph(style=style), jc)
    xrun(para('Title'), u'النمو والمؤسسات', ar())
    xrun(bidi(d.add_heading(level=1)), u'مقدمة', ar())
    p = para()
    xrun(p, u'ندرس ', ar())
    commented(p, 1, lambda: xrun(p, u'النمو', ar(BOLD)))
    xrun(p, u' في ظل مؤسسات ضعيفة، بمعدل ', ar())
    xrun(p, '5%')
    xrun(p, u' سنة ٢٠٢٤ و', ar())
    xrun(p, '2025')
    xrun(p, u'؛ هل هذا صحيح؟', ar())
    note_ref(p, 1)
    # vowel marks, a tatweel, Persian with a zero width non joiner, a joiner that keeps a letter's
    # joining shape, a left to right mark after the bracket and a right to left one before the stop
    p = para()
    xrun(p, u'مُحَمَّدٌ قال مـــرحبا، و‏می‌خواهم ه‍.ق ثم ', ar())
    xrun(p, 'World Bank (GDP)‎')
    xrun(p, u' أيضًا‏.', ar())
    xrun(para(jc='left'), u'محاذاة إلى البداية.', ar())
    xrun(para(jc='right'), u'محاذاة إلى النهاية.', ar())
    xrun(para(jc='both'), u'نص مضبوط من الجانبين.', ar())
    xrun(para(jc='center'), u'في الوسط.', ar())
    xrun(bidi(d.add_heading(level=1)), u'النتائج', ar())
    for t in [u'النتيجة الأولى', u'النتيجة الثانية']: xrun(para('List Bullet'), t, ar())
    for t in [u'الخطوة ١', u'الخطوة ٢']: xrun(para('List Number'), t, ar())
    t = d.add_table(rows=3, cols=2); t.style = 'Table Grid'
    t._tbl.tblPr.insert(1, parse_xml('<w:bidiVisual %s/>' % W))
    for r, row in enumerate([(u'البلد', u'النمو'), (u'بيرو', u'٣٫١'), (u'تشيلي', '2.4')]):
        for c, v in enumerate(row): xrun(bidi(t.cell(r, c).paragraphs[0]), v, ar() if ord(v[0]) > 255 else '')
    d.add_paragraph('An English paragraph in the Arabic document.')
    # text Word wrapped in a direction of its own
    p = para()
    xrun(p, u'قبل ', ar())
    p._p.append(parse_xml(u'<w:dir %s w:val="rtl"><w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">نص داخل الغلاف</w:t></w:r></w:dir>' % (W, ar())))
    xrun(p, u' بعد.', ar())
    sect = d.sections[0]._sectPr
    grid = [c for c in sect if c.tag.endswith('}docGrid')]
    (grid[0].addprevious if grid else sect.append)(parse_xml('<w:bidi %s/>' % W))
    buf = io.BytesIO()
    d.save(buf)
    return add_parts(buf.getvalue(), {
        'word/footnotes.xml': footnotes([('<w:pPr><w:bidi/></w:pPr>', u'<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve"> بيانات البنك الدولي، ٢٠٢٤.</w:t></w:r>' % ar())]),
        'word/comments.xml': ('comments', u'<w:comments %s><w:comment w:id="1" w:author="سارة"><w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t>أضف مرجعًا.</w:t></w:r></w:p></w:comment></w:comments>' % W)})

def make_mixed():
    d = Document()
    d.add_heading('Greetings', level=1)
    p = d.add_paragraph('The Arabic word ')
    xrun(p, u'مرحبا', ar())
    p.add_run(' means hello, and ')
    xrun(p, u'你好', zh())
    p.add_run(' means the same in Chinese.')
    p = d.add_paragraph('In Arabic, ')
    xrun(p, u'السلام عليكم ورحمة الله', ar(BOLD))
    p.add_run(', written right to left; numbers such as 2024 stay.')
    xrun(bidi(d.add_paragraph()), u'هذه فقرة كاملة بالعربية داخل مستند إنجليزي.', ar())
    p = d.add_paragraph('Chinese: ')
    xrun(p, u'北京、上海', zh())
    p.add_run(' and Peking University (')
    xrun(p, u'北京大学', zh())
    p.add_run(').')
    t = d.add_table(rows=3, cols=3); t.style = 'Table Grid'
    for r, row in enumerate([('Word', 'Arabic', 'Chinese'), ('hello', u'مرحبا', u'你好'), ('thanks', u'شكرا', u'谢谢')]):
        for c, v in enumerate(row): xrun(t.cell(r, c).paragraphs[0], v, '' if ord(v[0]) < 256 else ar() if ord(v[0]) < 0x800 else zh())
    # a stranger's file: words that read as LaTeX, and font and language names that try to be
    p = d.add_paragraph('Type \\babelfont{rm}{Evil} or \\input{/etc/passwd} at 100% & more: ')
    xrun(p, u'字', '<w:rFonts w:eastAsia="}\\input{/etc/passwd}" w:cs="\\babelfont{rm}{Evil}"/><w:lang w:val="en}\\write18{id}" w:eastAsia="zh-CN}\\input{x}" w:bidi="ar\\input{y}"/>')
    p.add_run('.')
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()

# ---- India's scripts ----

# a run of one of them as Word marks it: the complex script font, the language; f: bold, both ways
cs = lambda lang='hi-IN', f='', font='Mangal': '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s<w:lang w:bidi="%s"/>' % (font, font, font, f, lang)

def make_hindi():
    d = Document()
    xrun(d.add_paragraph(style='Title'), u'भारत की अर्थव्यवस्था', cs())
    xrun(d.add_heading(level=1), u'परिचय', cs(font='Kokila'))
    # one sentence in six runs: a nukta (ज़), conjuncts (क्ष, त्र, ज्ञ, श्री), the two dandas
    p = d.add_paragraph()
    xrun(p, u'यह दस्तावेज़ ', cs())
    xrun(p, u'हिन्दी', cs(f=BOLD))
    xrun(p, u' में लिखा', cs(font='Nirmala UI'))
    xrun(p, u' गया है। इसमें क्ष, त्र, ज्ञ और श्री जैसे ', '<w:rFonts w:cs="Mangal"/><w:cs/><w:lang w:bidi="hi-IN"/>')
    commented(p, 1, lambda: xrun(p, u'संयुक्ताक्षर', cs()))
    xrun(p, u' हैं॥', cs())
    note_ref(p, 1)
    # an anusvara, a chandrabindu, a visarga; a joiner and a non joiner after a virama (क्‍ष
    # shows a half ka, क्‌ष the virama itself); Devanagari digits beside English words and digits
    p = d.add_paragraph()
    xrun(p, u'हिंदी में माँ और दुःख; क्\u200dष तथा क्\u200cष। ', cs())
    xrun(p, 'GDP growth')
    xrun(p, u' २०२४ में ७.५% रही, ', cs())
    xrun(p, '2025')
    xrun(p, u' में ६%।', cs())
    for t in [u'पहला बिंदु', u'दूसरा बिंदु']: xrun(d.add_paragraph(style='List Bullet'), t, cs())
    for t in [u'चरण एक', u'चरण दो']: xrun(d.add_paragraph(style='List Number'), t, cs())
    t = d.add_table(rows=3, cols=2); t.style = 'Table Grid'
    for r, row in enumerate([(u'देश', u'वृद्धि'), (u'भारत', u'७.२'), (u'नेपाल', '3.9')]):
        for c, v in enumerate(row): xrun(t.cell(r, c).paragraphs[0], v, cs() if ord(v[0]) > 255 else '')
    buf = io.BytesIO()
    d.save(buf)
    return add_parts(buf.getvalue(), {
        'word/footnotes.xml': footnotes([('', u'<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve"> स्रोत: </w:t></w:r><w:r><w:rPr>%s</w:rPr><w:t>विश्व बैंक</w:t></w:r><w:r><w:rPr>%s</w:rPr><w:t>, २०२४।</w:t></w:r>' % (cs(), cs(f=BOLD), cs()))]),
        'word/comments.xml': ('comments', u'<w:comments %s><w:comment w:id="1" w:author="अनीता"><w:p><w:r><w:rPr>%s</w:rPr><w:t>संदर्भ जोड़ें।</w:t></w:r></w:p></w:comment></w:comments>' % (W, cs()))})

# a line of each of the other eight scripts, with the language Word names for it and a font
# Windows has for it: a conjunct or two, the script's vowel signs, its own digits
INDIC_LINES = [
    ('Bengali', 'bn-IN', 'Vrinda', u'বাংলা: আমি বাংলায় গান গাই, ক্ষমা করবেন। ১২৩'),
    ('Tamil', 'ta-IN', 'Latha', u'தமிழ்: வணக்கம், மிக்க நன்றி. ௧௨௩'),
    ('Telugu', 'te-IN', 'Gautami', u'తెలుగు: నమస్కారం, ధన్యవాదాలు. ౧౨౩'),
    ('Gujarati', 'gu-IN', 'Shruti', u'ગુજરાતી: નમસ્તે, આભાર. ૧૨૩'),
    ('Kannada', 'kn-IN', 'Tunga', u'ಕನ್ನಡ: ನಮಸ್ಕಾರ, ಧನ್ಯವಾದಗಳು. ೧೨೩'),
    # (അവന്‍ ends in the older spelling of a chillu: na, virama, joiner)
    ('Malayalam', 'ml-IN', 'Kartika', u'മലയാളം: നമസ്കാരം, നന്ദി, അവന്\u200d. ൧൨൩'),
    ('Gurmukhi', 'pa-IN', 'Raavi', u'ਪੰਜਾਬੀ: ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਧੰਨਵਾਦ। ੧੨੩'),
    ('Odia', 'or-IN', 'Kalinga', u'ଓଡ଼ିଆ: ନମସ୍କାର, ଧନ୍ୟବାଦ। ୧୨୩')]

def make_indic():
    d = Document()
    d.add_heading('Languages of India', level=1)
    for name, lang, font, line in INDIC_LINES:
        p = d.add_paragraph(name + ': ')
        head, rest = line.split(': ')
        xrun(p, head + ':', cs(lang, BOLD, font))
        xrun(p, ' ' + rest, cs(lang, '', font))
    # three scripts in one run, as text pasted into Word may be
    p = d.add_paragraph('Together: ')
    xrun(p, u'हिन्दी বাংলা தமிழ்', cs())
    p.add_run(' in one line.')
    t = d.add_table(rows=3, cols=3); t.style = 'Table Grid'
    for r, row in enumerate([('Hindi', 'Tamil', 'Telugu'), (u'धन्यवाद', u'நன்றி', u'ధన్యవాదాలు'), (u'१', u'௧', u'౧')]):
        for c, v in enumerate(row): xrun(t.cell(r, c).paragraphs[0], v, '' if ord(v[0]) < 256 else cs(['hi-IN', 'ta-IN', 'te-IN'][c]))
    # a stranger's file: font and language names that try to be LaTeX
    p = d.add_paragraph('Odd names: ')
    xrun(p, u'नाम', '<w:rFonts w:cs="}\\input{/etc/passwd}"/><w:lang w:bidi="hi-IN}\\babelfont{rm}{Evil}"/>')
    p.add_run('.')
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()

MAKERS = {'rich': make_rich, 'chinese': make_chinese, 'arabic': make_arabic, 'mixed': make_mixed, 'hindi': make_hindi, 'indic': make_indic}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'fixture.docx'
    data = MAKERS[sys.argv[2]]() if len(sys.argv) > 2 else make()
    if out == '-': sys.stdout.buffer.write(data)
    else: open(out, 'wb').write(data)

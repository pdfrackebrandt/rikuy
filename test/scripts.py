"""Chinese and Arabic on the page. A document whose main language is Arabic runs right to left:
its paragraphs, headings, list markers, captions and footnotes, with tables, formulas and code
left as they are. The commands and environments that turn text (babel, polyglossia, bidi) show
as text that runs their way, CJK's as plain text, and typing in them patches the source like any
other text. Typing, deleting, selecting, Enter, bold, undo, Home and End, an input method and
paste work in right to left and Chinese text. The page's fonts name a Song, a Hei, a Fang Song
and a Naskh after the families they had. A document with such text and no set up for it gets a
slim notice whose button adds the lines as one edit; nothing is added without that click, a
dismissal is remembered, and a copy someone shared has none. Dark mode and a phone do not
overflow."""
import os, sys, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright


def doc(pre, body):
    return '\\documentclass{article}\n' + pre + ('\n' if pre else '') + '\\begin{document}\n' + body + '\n\\end{document}\n'


AR_PRE = '\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, main]{arabic}\n\\babelfont{rm}[Renderer=Harfbuzz]{Amiri}'
LONG = 'هذا نص عربي طويل يكفي لملء أكثر من سطر واحد على الصفحة حتى نرى كيف تنكسر الأسطر وكيف تصطف الكلمات من اليمين إلى اليسار مع كلمة English في الوسط'
AR_DOC = doc(AR_PRE + '\n\\title{عنوان الورقة}\n\\author{مؤلف}\n\\date{}', '\n'.join([
    '\\maketitle', '\\begin{abstract}', 'ملخص قصير.', '\\end{abstract}', '\\section{مقدمة}',
    LONG + '\\footnote{حاشية سفلية}.', '', 'فقرة ثانية قصيرة مع $x+1$ هنا.', '',
    '\\begin{itemize}', '\\item البند الأول', '\\item البند الثاني', '\\end{itemize}', '',
    '\\begin{enumerate}', '\\item واحد', '\\end{enumerate}', '',
    '\\begin{table}[h]', '\\caption{جدول صغير}', '\\begin{tabular}{ll}', 'أول & ثان \\\\', 'one & two \\\\', '\\end{tabular}', '\\end{table}', '',
    '\\[ a = b \\]', '', '\\begin{verbatim}', 'code here', '\\end{verbatim}', '',
    '\\begin{otherlanguage}{english}', 'An English paragraph inside.', '\\end{otherlanguage}', '',
    'رجوع \\foreignlanguage{english}{inline English} هنا.']))
# a short one for the editing checks: what is typed is compared with the whole source
EDIT_BODY = 'هذا نص عربي قصير مع كلمة English في الوسط.\n\nفقرة ثانية هنا.'
EDIT_DOC = doc(AR_PRE, EDIT_BODY)
WRAP_DOC = doc('', '\n'.join([
    'Latin \\foreignlanguage{arabic}{عربي نص} and \\RL{يمين} and \\textarabic{قلم} and \\texthebrew{שלום} x.', '',
    '\\begin{otherlanguage}{arabic}', 'فقرة عربية.', '\\end{otherlanguage}', '',
    '\\begin{Arabic}', 'نص ثان.', '\\end{Arabic}', '',
    '\\begin{RTL}', 'نص ثالث.', '\\end{RTL}', '',
    '\\begin{CJK}{UTF8}{gbsn}', '中文段落。\\CJKfamily{gkai}楷体字。', '\\end{CJK}', '',
    'Mixed \\begin{CJK*}{UTF8}{gbsn}汉字\\end{CJK*} and \\begin{otherlanguage*}{arabic}كلمة\\end{otherlanguage*} here.', '',
    '\\selectlanguage{arabic}', 'بعد التبديل.', '', '\\selectlanguage{english}', 'Back to English.']))
ZH_SENT = '这是一个很长的中文段落用来测试分页时不会出现连字符文字应当自然换行'
ZH_DOC = doc('\\usepackage[scheme=plain]{ctex}', '\n\n'.join(('第%d段' % i) + ZH_SENT * (9 + i) for i in range(9)) +
             '\n\n这是中文文字。\\textit{斜体中文} \\textbf{粗体中文} \\textsf{无衬线体} \\texttt{等宽文字} Latin text.')
PLAIN = doc('\\usepackage{amsmath}', 'Hello world.\n\nSecond paragraph.')

PASTE = """(plain) => { const dt = new DataTransfer(); dt.setData('text/plain', plain);
  document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""
# where the page's items are and how they run: each with the box of its first character
ITEMS = '''() => [...document.querySelectorAll('#pages .it, #pages .fn, #pages .cap')].map((el) => {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect(), flow = (el.closest('.pb') || el).getBoundingClientRect();
  const t = el.querySelector('span.t'); let first = null;
  if (t && t.firstChild && t.firstChild.length) { const R = document.createRange(); R.setStart(t.firstChild, 0); R.setEnd(t.firstChild, 1); const q = R.getBoundingClientRect(); first = [q.left, q.right]; }
  const mark = el.querySelector(':scope > .lbl, :scope > .secnum, :scope > .fnn'), m = mark && mark.getBoundingClientRect();
  return { cls: el.className, dir: el.getAttribute('dir'), cdir: cs.direction, left: r.left, right: r.right, fl: flow.left, fr: flow.right, first, mark: m && [m.left, m.right],
    indent: parseFloat(cs.textIndent) || 0, em: parseFloat(cs.fontSize), text: el.textContent.slice(0, 24) }; })'''


def caret(page):
    return page.evaluate('() => { const c = window.rikuy.caretNow(); return c && [c.a, c.b]; }')


def char_box(page, text, k):
    """The box of the k-th character of the first span holding text, brought into view."""
    return page.evaluate('''([text, k]) => { const s = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes(text));
      s.scrollIntoView({ block: 'center' });
      const i = s.textContent.indexOf(text) + k, r = document.createRange(); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1);
      const q = r.getBoundingClientRect(); return [q.left, q.right, q.top, q.bottom]; }''', [text, k])


def note(page):
    """The notice's words, or None when it is hidden."""
    return page.evaluate('() => { const b = document.getElementById("script-note"); return b.hidden ? null : document.getElementById("script-msg").textContent; }')


def undo(page, n=1):
    for _ in range(n):
        page.keyboard.press('Control+z')
        page.wait_for_timeout(140)


def fonts_of(cdp, sel):
    """The fonts the browser drew the first element matching sel with: [(family, from the page)]."""
    root = cdp.send('DOM.getDocument', {'depth': 0})['root']['nodeId']
    node = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': sel})['nodeId']
    return [(f['familyName'], f['isCustomFont']) for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']]


def luminance(rgb):
    v = [int(x) / 255 for x in rgb[rgb.index('(') + 1:rgb.index(')')].split(',')[:3]]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]


def share_link(page, name):
    page.click('#b-share')
    page.wait_for_selector('.pop-share')
    page.fill('.pop-share .share-name', name)
    page.click('.pop-share button.btn:not(.ghost) >> text=Copy link')
    page.wait_for_function('() => (document.querySelector(".pop-share .share-link") || {}).value', timeout=8000)
    link = page.eval_on_selector('.pop-share .share-link', 'e => e.value')
    page.evaluate('() => window.rikuy.closePop()')
    return link


def rendering(page):
    load_doc(page, AR_DOC)
    page.wait_for_timeout(300)
    its = page.evaluate(ITEMS)
    by = lambda text: next(i for i in its if text in i['text'])
    near = lambda a, b, tol=1.6: abs(a - b) <= tol
    texty = [i for i in its if any(c in i['cls'].split() for c in ('p', 'h', 'ttl', 'fn', 'cap')) and 'raw' not in i['cls']]
    rtl = [i for i in texty if 'English paragraph' not in i['text']]
    check('an Arabic document: paragraphs, headings, title, caption and footnote run right to left', len(rtl) >= 11 and all(i['dir'] == 'rtl' and i['cdir'] == 'rtl' for i in rtl), [(i['cls'], i['dir'], i['cdir']) for i in rtl if i['dir'] != 'rtl' or i['cdir'] != 'rtl'])
    first = by(LONG[:12])
    check('the first line starts at the right edge', near(first['first'][1], first['fr']), first)
    last_line = page.evaluate('''(t) => { const s = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes(t)); const R = document.createRange(); R.selectNodeContents(s);
      const q = [...R.getClientRects()].filter((x) => x.width > 2); const top = Math.max(...q.map((x) => x.top)); const last = q.filter((x) => Math.abs(x.top - top) < 3);
      const f = s.closest('.pb').getBoundingClientRect(); return { lines: new Set(q.map((x) => Math.round(x.top))).size, right: Math.max(...last.map((x) => x.right)), left: Math.min(...last.map((x) => x.left)), fl: f.left, fr: f.right }; }''', LONG[:12])
    check('its last line ends short of the left edge, as a justified right to left paragraph does', last_line['lines'] >= 2 and near(last_line['right'], last_line['fr']) and last_line['left'] > last_line['fl'] + 20, last_line)
    second = by('فقرة ثانية')
    check('the first line indent is on the right', second['indent'] > 5 and near(second['first'][1], second['fr'] - second['indent']), second)
    head = by('مقدمة')
    check('the section number is on the right of its heading', head['mark'] and near(head['mark'][1], head['fr']) and head['first'][1] < head['mark'][0], head)
    item = by('البند الأول')
    check('a list marker is on the right of its item', item['mark'] and item['mark'][0] >= item['first'][1] - 1 and item['mark'][1] <= item['fr'] + 1 and near(item['first'][1], item['fr'] - 2.5 * item['em'], 2.5), item)
    num = by('واحد')
    check('a numbered item too', num['mark'] and num['mark'][0] >= num['first'][1] - 1, num)
    fn = next(i for i in its if i['cls'] == 'fn')
    check('a footnote has its number on the right', fn['mark'] and fn['mark'][0] >= fn['first'][1] - 1, fn)
    eng = by('An English paragraph')
    check('an English paragraph inside runs left to right', eng['dir'] == 'ltr' and eng['cdir'] == 'ltr' and eng['first'][0] < eng['fl'] + 40, eng)
    inner = page.evaluate('''() => { const d = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).direction : null; };
      const tds = [...document.querySelectorAll('#pages .tab tr')].find((r) => r.textContent.includes('one')).querySelectorAll('td');
      const sub = [...document.querySelectorAll('#pages span.y-dir')].find((s) => s.textContent === 'inline English');
      return { tab: d('#pages .tabw'), table: d('#pages .tab'), cols: tds[0].getBoundingClientRect().left < tds[1].getBoundingClientRect().left, td: tds[0].getAttribute('dir'),
        dm: d('#pages .it.dm'), dmDir: document.querySelector('#pages .it.dm').getAttribute('dir'), raw: d('#pages .it.raw'), math: d('#pages .atom.m'), bidi: getComputedStyle(document.querySelector('#pages .atom.m')).unicodeBidi,
        sub: sub && [sub.getAttribute('dir'), getComputedStyle(sub).direction] }; }''')
    check('a table keeps its columns left to right', inner['tab'] == 'ltr' and inner['table'] == 'ltr' and inner['cols'] is True, inner)
    check('and the words in its cells run right to left', inner['td'] == 'rtl', inner)
    check('a displayed and an inline formula stay left to right', inner['dm'] == 'ltr' and inner['dmDir'] is None and inner['math'] == 'ltr' and inner['bidi'] == 'isolate', inner)
    check('code stays left to right', inner['raw'] == 'ltr', inner)
    check('English words in an Arabic line run left to right', inner['sub'] == ['ltr', 'ltr'], inner)
    ghost = None
    click_text(page, 'هنا.', 4, nth=1)
    page.keyboard.press('Enter')
    page.wait_for_timeout(120)
    ghost = page.evaluate('() => { const g = document.querySelector(".ghostp"); return g && [g.getAttribute("dir"), getComputedStyle(g).direction]; }')
    check('the blank paragraph Enter opens runs right to left', ghost == ['rtl', 'rtl'], ghost)
    page.keyboard.press('Escape')

    # a left to right document with Arabic words in it: as before, and as the PDF sets it
    load_doc(page, doc('', 'Latin then عربي here, long enough to see where the line starts.\n\nنص عربي فقط.'))
    page.wait_for_timeout(200)
    plain = page.evaluate(ITEMS)
    check('a left to right document with Arabic in it has no direction set anywhere', page.evaluate('document.querySelectorAll("#pages [dir]").length') == 0 and all(i['cdir'] == 'ltr' for i in plain), plain)
    check('its paragraphs start at the left', abs(plain[0]['first'][0] - plain[0]['fl'] - plain[0]['indent']) < 1.6 and abs(plain[1]['first'][1] - plain[1]['fl'] - plain[1]['indent']) > 20, plain)


def wrappers(page):
    load_doc(page, WRAP_DOC)
    page.wait_for_timeout(300)
    its = page.evaluate('''() => [...document.querySelectorAll('#pages .it')].map((e) => [e.getAttribute('dir'), e.textContent])''')
    check('the commands and environments leave no code chip, tag or unknown mark', page.evaluate('document.querySelectorAll("#pages .a-chip, #pages .envtag, #pages .y-unk").length') == 0 and page.evaluate('window.rikuy.model.warn.length') == 0,
          page.evaluate('[...document.querySelectorAll("#pages .a-chip, #pages .envtag, #pages .y-unk")].map((e) => e.textContent)'))
    want = [[None, 'Latin عربي نص and يمين and قلم and שלום x.'], ['rtl', 'فقرة عربية.'], ['rtl', 'نص ثان.'], ['rtl', 'نص ثالث.'], [None, '中文段落。楷体字。'],
            [None, 'Mixed 汉字 and كلمة here.'], ['rtl', 'بعد التبديل.'], [None, 'Back to English.']]
    check('their text is plain text, each paragraph running its way', its == want, its)
    spans = page.evaluate('''() => [...document.querySelectorAll('#pages span.y-dir')].map((s) => [s.getAttribute('dir'), getComputedStyle(s).direction, s.textContent])''')
    check('\\foreignlanguage, \\RL, \\textarabic, \\texthebrew and otherlanguage* turn their words', spans == [['rtl', 'rtl', 'عربي نص'], ['rtl', 'rtl', 'يمين'], ['rtl', 'rtl', 'قلم'], ['rtl', 'rtl', 'שלום'], ['rtl', 'rtl', 'كلمة']], spans)
    check('CJK\'s encoding and font family are not text', 'UTF8' not in ''.join(t for _, t in its) and 'gbsn' not in ''.join(t for _, t in its) and 'gkai' not in ''.join(t for _, t in its))
    # typing inside each of them changes the characters typed and nothing else
    for text, off, ch in [('عربي نص', 2, 'س'), ('يمين', 1, 'ب'), ('قلم', 3, 'ي'), ('שלום', 2, 'א'), ('فقرة عربية', 4, 'ت'), ('نص ثان', 6, 'ي'), ('نص ثالث', 0, 'ال'), ('中文段落', 2, '好'), ('楷体字', 3, '体'), ('汉字', 1, '语'), ('كلمة', 0, 'ال'), ('بعد التبديل', 3, 'ما')]:
        click_text(page, text, off)
        page.keyboard.type(ch)
        page.wait_for_timeout(140)
        check('typing in ' + text + ' patches only what was typed', src(page) == WRAP_DOC.replace(text, text[:off] + ch + text[off:], 1), src(page)[:300])
        undo(page)
    check('undo brings the source back', src(page) == WRAP_DOC)
    click_text(page, 'عربي نص', 4)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check('Enter inside \\foreignlanguage closes it and opens it again', '\\foreignlanguage{arabic}{عربي}\n\n\\foreignlanguage{arabic}{ نص} and' in src(page), src(page)[40:140])
    undo(page)
    click_text(page, 'كلمة', 2)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check('and inside otherlanguage* in a line', '\\begin{otherlanguage*}{arabic}كل\\end{otherlanguage*}\n\n\\begin{otherlanguage*}{arabic}مة\\end{otherlanguage*} here.' in src(page), src(page)[-160:])
    undo(page)
    click_text(page, 'فقرة عربية', 5)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    two = page.evaluate('''() => [...document.querySelectorAll('#pages .it')].slice(1, 3).map((e) => [e.getAttribute('dir'), e.textContent])''')
    check('Enter in an otherlanguage paragraph gives two right to left paragraphs', '\\begin{otherlanguage}{arabic}\nفقرة \n\nعربية.\n\\end{otherlanguage}' in src(page) and two == [['rtl', 'فقرة'], ['rtl', 'عربية.']], [src(page)[150:230], two])
    undo(page)
    select_text(page, 'يمين')
    page.keyboard.press('Backspace')
    page.wait_for_timeout(180)
    check('a wrapper emptied keeps its place', 'and \\RL{} and' in src(page), src(page)[60:110])
    page.keyboard.press('Backspace')
    page.wait_for_timeout(180)
    check('and the next Backspace takes the command', 'نص} and  and \\textarabic' in src(page), src(page)[60:110])
    undo(page, 2)
    select_text(page, 'قلم')
    page.keyboard.press('Control+b')
    page.wait_for_timeout(180)
    check('bold inside a wrapper', '\\textarabic{\\textbf{قلم}}' in src(page), src(page)[80:140])
    undo(page)
    check('the source is as it was', src(page) == WRAP_DOC)
    # nothing of a document's text reaches an attribute: a direction is one of two fixed words
    load_doc(page, doc('', 'a \\foreignlanguage{arabic" onmouseover="alert(1)}{x} b \\begin{otherlanguage*}{rtl"><img src=x onerror=alert(1)>}y\\end{otherlanguage*} c\n\n\\begin{otherlanguage}{arabic\' dir=\'rtl}\nz\n\\end{otherlanguage}'))
    page.wait_for_timeout(200)
    bad = page.evaluate('''() => [...document.querySelectorAll('#pages *')].filter((e) => (e.hasAttribute('dir') && !/^(rtl|ltr)$/.test(e.getAttribute('dir'))) || e.hasAttribute('onmouseover') || e.hasAttribute('onerror') || e.tagName === 'IMG').map((e) => e.outerHTML.slice(0, 80))''')
    check('a language name with markup in it sets no attribute and makes no element', bad == [] and page.evaluate('document.querySelectorAll("#pages [dir]").length') == 0, bad)


def editing(page):
    load_doc(page, EDIT_DOC)
    page.wait_for_timeout(300)
    base = src(page)
    at = base.index('عربي')
    body = lambda: src(page)[base.index('هذا'):]
    # a click between the second and third letter of عربي: in right to left text a letter's
    # right edge is where it starts
    l, r, t, b = char_box(page, 'عربي', 2)
    page.mouse.click(r - 0.5, (t + b) / 2)
    page.wait_for_timeout(120)
    check('a click in an Arabic word puts the caret between its letters', caret(page) == [at + 2, at + 2], [caret(page), at + 2])
    page.keyboard.type('س')
    page.wait_for_timeout(150)
    check('a letter typed in the middle of the word goes there', src(page) == base.replace('عربي', 'عرسبي') and caret(page) == [at + 3, at + 3], body()[:30])
    page.keyboard.press('Backspace')
    page.wait_for_timeout(150)
    check('Backspace takes the letter before the caret', src(page) == base and caret(page) == [at + 2, at + 2], body()[:30])
    page.keyboard.press('Delete')
    page.wait_for_timeout(150)
    check('Delete takes the letter after it', src(page) == base.replace('عربي', 'عري') and caret(page) == [at + 2, at + 2], body()[:30])
    undo(page, 3)
    check('undo three times: the source as it was', src(page) == base)
    page.keyboard.press('Control+y')
    page.wait_for_timeout(150)
    check('redo types the letter again', src(page) == base.replace('عربي', 'عرسبي'), body()[:30])
    undo(page)
    click_text(page, 'عربي', 2)
    page.keyboard.press('Home')
    page.wait_for_timeout(80)
    check('Home goes to where the line starts', caret(page) == [base.index('هذا'), base.index('هذا')], caret(page))
    page.keyboard.press('End')
    page.wait_for_timeout(80)
    end = base.index('الوسط.') + 6
    check('End goes to where it ends', caret(page) == [end, end], [caret(page), end])
    click_text(page, 'عربي', 2)
    page.keyboard.press('ArrowLeft')
    page.wait_for_timeout(60)
    check('the left arrow moves on through the word', caret(page) == [at + 3, at + 3], caret(page))
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(60)
    check('the right arrow moves back', caret(page) == [at + 1, at + 1], caret(page))
    select_text(page, 'قصير')
    page.keyboard.type('طويل')
    page.wait_for_timeout(180)
    check('typing over a selection replaces it', src(page) == base.replace('قصير', 'طويل'), body()[:40])
    undo(page, 2)
    # a selection drawn with the mouse from the word's start (its right) to its end (its left)
    l0, r0, t0, b0 = char_box(page, 'عربي', 0)
    l3, r3, t3, b3 = char_box(page, 'عربي', 3)
    page.mouse.move(r0 - 0.2, (t0 + b0) / 2)
    page.mouse.down()
    page.mouse.move(l3 + 0.2, (t0 + b0) / 2, steps=6)
    page.mouse.up()
    page.wait_for_timeout(120)
    check('a selection drawn over the word is the word', caret(page) == [at, at + 4], caret(page))
    page.keyboard.press('Control+b')
    page.wait_for_timeout(180)
    check('bold on it wraps the word', src(page) == base.replace('عربي', '\\textbf{عربي}'), body()[:40])
    undo(page)
    click_text(page, 'قصير', 0)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    dirs = page.evaluate('() => [...document.querySelectorAll("#pages .it")].map((e) => e.getAttribute("dir") + ":" + e.textContent.slice(0, 11))')
    check('Enter splits the paragraph in two right to left ones', src(page) == base.replace('عربي قصير', 'عربي \n\nقصير') and dirs[:2] == ['rtl:هذا نص عربي', 'rtl:قصير مع كلم'], [body()[:40], dirs])
    undo(page)
    click_text(page, 'ثانية هنا.', 10)
    page.keyboard.press('Enter')
    page.wait_for_timeout(120)
    page.keyboard.type('جديد')
    page.wait_for_timeout(200)
    check('Enter at the end starts a new paragraph', 'فقرة ثانية هنا.\n\nجديد' in src(page), src(page)[-60:])
    undo(page)
    check('and undo takes it away', src(page) == base)
    click_text(page, 'قصير', 0)
    page.keyboard.type('abc ')
    page.wait_for_timeout(180)
    check('Latin typed in an Arabic line lands where the caret was', src(page) == base.replace('قصير', 'abc قصير') and caret(page) == [at + 9, at + 9], body()[:40])
    undo(page)
    click_text(page, 'قصير', 0)
    page.evaluate(PASTE, '中文与عربي 100% ')
    page.wait_for_timeout(250)
    check('Chinese and Arabic text pasted as plain text', src(page) == base.replace('قصير', '中文与عربي 100\\% قصير'), body()[:50])
    undo(page)
    # an input method composing in the middle of the line
    click_text(page, 'قصير', 0)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.imeSetComposition', {'text': 'zhong', 'selectionStart': 5, 'selectionEnd': 5})
    page.wait_for_timeout(120)
    check('while an input method composes the source does not change', page.evaluate('window.rikuy.composing') is True and src(page) == base)
    cdp.send('Input.imeSetComposition', {'text': '中', 'selectionStart': 1, 'selectionEnd': 1})
    page.wait_for_timeout(80)
    cdp.send('Input.insertText', {'text': '中文'})
    page.wait_for_timeout(300)
    check('what it composed goes in where the caret was', src(page) == base.replace('قصير', '中文قصير') and caret(page) == [at + 7, at + 7] and page.evaluate('window.rikuy.composing') is False, body()[:40])
    page.keyboard.type('好')
    page.wait_for_timeout(180)
    check('and typing goes on after it', src(page) == base.replace('قصير', '中文好قصير'), body()[:40])

    # Chinese: a ctex document, typing through an input method in the middle of a paragraph
    load_doc(page, ZH_DOC)
    page.wait_for_timeout(500)
    zh = src(page)
    zat = zh.index('这是中文文字')
    l, r, t, b = char_box(page, '这是中文文字', 2)
    page.mouse.click(l + 0.5, (t + b) / 2)
    page.wait_for_timeout(120)
    check('a click between two Chinese characters', caret(page) == [zat + 2, zat + 2], [caret(page), zat + 2])
    cdp.send('Input.imeSetComposition', {'text': 'hao', 'selectionStart': 3, 'selectionEnd': 3})
    page.wait_for_timeout(100)
    cdp.send('Input.imeSetComposition', {'text': '好', 'selectionStart': 1, 'selectionEnd': 1})
    page.wait_for_timeout(80)
    cdp.send('Input.insertText', {'text': '好的'})
    page.wait_for_timeout(300)
    check('an input method in the middle of a Chinese paragraph', src(page) == zh.replace('这是中文文字', '这是好的中文文字') and caret(page) == [zat + 4, zat + 4], src(page)[zat:zat + 12])
    page.keyboard.press('Backspace')
    page.wait_for_timeout(150)
    check('Backspace takes one character', src(page) == zh.replace('这是中文文字', '这是好中文文字'), src(page)[zat:zat + 12])
    select_text(page, '中文文字')
    page.keyboard.press('Control+b')
    page.wait_for_timeout(180)
    check('bold on Chinese words', '这是好\\textbf{中文文字}。' in src(page), src(page)[zat:zat + 24])
    undo(page, 3)
    check('undo: the Chinese source as it was', src(page) == zh)
    split = page.evaluate('''() => ({ pages: document.querySelectorAll('.page').length, parts: document.querySelectorAll('#pages .split-b').length, hyphens: document.querySelectorAll('#pages .chr.hy').length })''')
    check('a Chinese paragraph cut by a page break gets no hyphen', split['pages'] >= 2 and split['parts'] >= 1 and split['hyphens'] == 0, split)


def long_rtl(page):
    sent = 'هذا نص عربي طويل يكفي لملء أكثر من سطر واحد على الصفحة حتى نرى كيف تنكسر الأسطر. '
    paras = [(('فقرة %d ' % i) + sent * (5 + i)).strip() for i in range(9)]
    load_doc(page, doc(AR_PRE, '\n\n'.join(paras)))
    page.wait_for_timeout(500)
    info = page.evaluate('''() => { const a = document.querySelector('#pages .it.split-a'), b = document.querySelector('#pages .it.split-b'); if (!a || !b) return null;
      const t = b.querySelector('span.t'), r = document.createRange(); r.setStart(t.firstChild, 3); r.collapse(true); document.getElementById('pages').focus();
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      return { whole: (a.textContent + b.textContent).replace(/-$/, ''), dirs: [a.getAttribute('dir'), b.getAttribute('dir')], at: window.rikuy.caretNow().a, hy: document.querySelectorAll('#pages .chr.hy').length }; }''')
    check('a right to left paragraph cut by a page break keeps its words in order', info and info['whole'] in paras and info['dirs'] == ['rtl', 'rtl'] and info['hy'] == 0, info and [info['whole'][:30], info['dirs'], info['hy']])
    before = src(page)
    page.keyboard.type('X')
    page.wait_for_timeout(250)
    check('typing in its part on the next page lands at the caret', info and src(page) == before[:info['at']] + 'X' + before[info['at']:])


def fonts(page):
    load_doc(page, ZH_DOC)
    page.wait_for_timeout(400)
    fam = page.evaluate('''() => ({ doc: getComputedStyle(document.getElementById('sheet')).fontFamily, tt: getComputedStyle(document.querySelector('#pages .y-tt')).fontFamily, sf: getComputedStyle(document.querySelector('#pages .y-sf')).fontFamily })''')
    was = {'doc': '"Paper Modern Serif", "Latin Modern Roman", "Computer Modern Serif", "Iowan Old Style", Georgia, serif', 'tt': '"Paper Modern Typewriter", "Latin Modern Mono", ui-monospace, monospace',
           'sf': '"Paper Modern Sans", "Latin Modern Sans", "Helvetica Neue", Arial, sans-serif'}
    check('the three font stacks start with the families they had, in their order', all(fam[k].startswith(was[k] + ', ') for k in was), fam)
    names = lambda s: [x.strip().strip('"') for x in s.split(',')]
    check('the text stack then names a Naskh and a Song', all(n in names(fam['doc']) for n in ['Amiri', 'Noto Naskh Arabic', 'Traditional Arabic', 'Geeza Pro', 'Arabic Typesetting', 'Songti SC', 'STSong', 'SimSun', 'NSimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', 'PMingLiU']), fam['doc'])
    check('the sans stack a Hei', all(n in names(fam['sf']) for n in ['PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC']), fam['sf'])
    check('the typewriter stack a Fang Song', all(n in names(fam['tt']) for n in ['FangSong', 'STFangsong']), fam['tt'])
    kai = page.evaluate('''() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Paper CJK').map((f) => f.style + ' ' + f.weight + (/Kai/.test(f.src || '') ? ' Kai' : '') + (f.unicodeRange.includes('4E00') ? ' han' : ''))''')
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable')
    cdp.send('CSS.enable')
    latin = fonts_of(cdp, '#pages .it.h span.t') if page.evaluate('!!document.querySelector("#pages .it.h span.t")') else None
    load_doc(page, doc('', 'Only Latin letters here, 12 of them: (a) and [b].\n\n\\textit{Italic too} \\textbf{bold} \\texttt{mono} \\textsf{sans}.'))
    page.wait_for_timeout(300)
    lat = [fonts_of(cdp, s) for s in ['#pages .it.p span.t', '#pages .y-it span.t', '#pages .y-bf span.t', '#pages .y-tt span.t', '#pages .y-sf span.t']]
    check('Latin text is drawn by the page\'s own fonts alone', [x for f in lat for x in f] == [('Paper Modern Serif', True)] * 3 + [('Paper Modern Typewriter', True), ('Paper Modern Sans', True)], lat)
    load_doc(page, ZH_DOC)
    page.wait_for_timeout(400)
    used = {k: [f for f, custom in fonts_of(cdp, s) if not custom] for k, s in [('doc', '#pages .y-bf span.t'), ('sf', '#pages .y-sf span.t'), ('tt', '#pages .y-tt span.t')]}
    listed = {k: [u for u in used[k] if u in names(fam[k])] for k in used}
    # which of them the machine has is the machine's business: where it has one, that one is used
    have = page.evaluate('''(stacks) => { const c = document.createElement('canvas').getContext('2d'); const w = (f) => { c.font = '40px ' + f; return c.measureText('中文字体').width; };
      const out = {}; for (const k in stacks) out[k] = stacks[k].filter((n) => !/^(serif|sans-serif|monospace|ui-monospace)$/.test(n) && w('"' + n + '", monospace') !== w('monospace') ); return out; }''',
                         {k: names(fam[k])[len(names(was[k])):] for k in fam})
    for k, what in [('doc', 'text'), ('sf', 'sans serif'), ('tt', 'typewriter')]:
        check('Chinese ' + what + ' is drawn by a font the stack names, where the system has one', bool(listed[k]) or not have[k], [used[k], have[k]])
    print('     (Chinese drawn here by ' + ', '.join(k + ': ' + '/'.join(used[k]) for k in used) + ')')
    check('italic Chinese has a Kai face of its own, for Chinese characters only', sorted(kai) == ['italic 400 han', 'italic 700 han', 'normal 400 han', 'normal 700 han'] and
          page.evaluate('''() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.type === 5 && /Paper CJK/.test(r.cssText) && /italic/.test(r.cssText) && /KaiTi/.test(r.cssText) && /Kaiti SC/.test(r.cssText)); } catch (e) { return false; } })'''), kai)


def notice(p, page):
    load_doc(page, PLAIN)
    page.wait_for_timeout(900)
    check('a plain document has no notice', note(page) is None)
    load_doc(page, doc('\\usepackage{ctex}', '已经设置好的中文。'))
    page.wait_for_timeout(900)
    check('nor has one that sets Chinese up', note(page) is None, note(page))
    load_doc(page, AR_DOC)
    page.wait_for_timeout(900)
    check('nor one that sets Arabic up', note(page) is None, note(page))
    load_doc(page, 'A fragment with 中文 and no document environment.')
    page.wait_for_timeout(900)
    check('nor a file with nowhere to put the lines', note(page) is None, note(page))

    load_doc(page, PLAIN)
    page.evaluate('window.rikuy.toggleSource(true)')
    page.wait_for_function('window.rikuy.cm', timeout=8000)
    page.wait_for_timeout(300)
    click_text(page, 'Hello', 5)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Input.imeSetComposition', {'text': ' 中', 'selectionStart': 2, 'selectionEnd': 2})
    page.wait_for_timeout(1100)
    check('no notice while an input method is composing', note(page) is None and page.evaluate('window.rikuy.composing') is True, note(page))
    cdp.send('Input.insertText', {'text': ' 中文'})
    page.wait_for_function('!document.getElementById("script-note").hidden', timeout=4000)
    check('Chinese typed into a plain document: the notice', note(page) == 'This document has Chinese text. LaTeX needs a font for it.', note(page))
    look = page.evaluate('''() => { const b = document.getElementById('script-note'), r = b.getBoundingClientRect(); return { h: r.height, w: r.width, iw: innerWidth, modal: !!document.querySelector('.pop'), below: r.top >= document.getElementById('ribbon').getBoundingClientRect().bottom - 1,
      above: r.bottom <= document.getElementById('main').getBoundingClientRect().top + 1, btn: document.getElementById('script-go').textContent, x: document.getElementById('script-x').getAttribute('aria-label') }; }''')
    check('it is a slim bar under the ribbon with one button and a way to hide it', look['h'] < 48 and look['w'] == look['iw'] and not look['modal'] and look['below'] and look['above'] and look['btn'] == 'Set it up' and look['x'] == 'Not now', look)
    before = src(page)
    page.evaluate('window.rikuy.closeGroup()')
    page.keyboard.type('好')
    page.wait_for_timeout(120)
    seen = page.evaluate('''() => { const b = document.getElementById('script-note'); window.__flips = 0; new MutationObserver((ms) => { window.__flips += ms.length; }).observe(b, { attributes: true, childList: true, subtree: true, characterData: true }); return !b.hidden; }''')
    page.keyboard.type('的字')
    page.wait_for_timeout(1000)
    check('it stays as it is while the typing goes on', seen and page.evaluate('window.__flips') == 0 and note(page) is not None, page.evaluate('window.__flips'))
    undo(page)
    page.wait_for_timeout(200)
    check('(the text is back to the first words)', src(page) == before, src(page)[60:120])
    hist = page.evaluate('window.rikuy.hist.length')
    page.wait_for_timeout(900)
    check('nothing is added to the source before the click', src(page) == before and 'ctex' not in src(page))
    page.click('#script-go')
    page.wait_for_timeout(350)
    want = before.replace('\\begin{document}', '\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX\n\\begin{document}')
    check('the button adds the set up to the preamble', src(page) == want, src(page)[:160])
    check('as one edit in the history', page.evaluate('window.rikuy.hist.length') == hist + 1 and page.evaluate('window.rikuy.hist[window.rikuy.hist.length - 1].kind') == 'setup', page.evaluate('window.rikuy.hist.map((h) => h.kind)'))
    check('the notice goes and a message names the engine', note(page) is None and page.inner_text('#toast') == 'Added. The PDF is now made with XeLaTeX.', page.inner_text('#toast'))
    check('the source pane shows the line', page.evaluate('window.rikuy.cm.getValue()') == want)
    check('the caret is where it was in the text', page.evaluate('() => { const c = window.rikuy.caretNow(); return c && window.rikuy.files.get("main.tex").slice(c.p - 3, c.p); }') == ' 中文', caret(page))
    page.wait_for_timeout(1300)
    kept = page.evaluate('''() => new Promise((res) => { const r = indexedDB.open('galley'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('project'); g.onsuccess = () => res((g.result.files.find((f) => f[0] === 'main.tex') || [])[1]); g.onerror = () => res(null); }; r.onerror = () => res(null); })''')
    check('and it is kept in the browser like any edit', kept == want, (kept or '')[:120])
    check('once set up there is no notice', note(page) is None)
    undo(page)
    page.wait_for_function('!document.getElementById("script-note").hidden', timeout=4000)
    check('one undo takes the lines out again, and the notice is back', src(page) == before and note(page) == 'This document has Chinese text. LaTeX needs a font for it.', src(page)[:120])
    page.click('#script-x')
    page.wait_for_timeout(200)
    check('hiding it hides it', note(page) is None)
    click_text(page, 'Second', 0)
    page.keyboard.type('文')
    page.wait_for_timeout(1000)
    check('and it stays hidden while the document needs the same', note(page) is None, note(page))
    page.wait_for_timeout(900)
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    page.wait_for_timeout(1300)
    check('after a reload too: the dismissal is kept with the project', '中文' in src(page) and note(page) is None, [src(page)[60:100], note(page)])
    click_text(page, 'Second', 0)
    page.keyboard.type('عربي ')
    page.wait_for_function('!document.getElementById("script-note").hidden', timeout=4000)
    check('it comes back when the document needs something else', note(page) == 'This document has Chinese and Arabic text. LaTeX needs fonts and right to left setup for them.', note(page))
    page.click('#script-go')
    page.wait_for_timeout(350)
    s = src(page)
    check('both: babel with bidi, Amiri and Fandol Song', '\\usepackage[english, bidi=basic]{babel}' in s and '\\babelprovide[import, onchar=ids fonts]{arabic}\n\\babelfont[arabic]{rm}[Renderer=Harfbuzz]{Amiri}\n\\babelprovide[import, onchar=ids fonts]{chinese}\n\\babelfont[chinese]{rm}{FandolSong}\n\\begin{document}' in s, s[:400])
    check('and the message names LuaLaTeX', page.inner_text('#toast') == 'Added. The PDF is now made with LuaLaTeX.', page.inner_text('#toast'))
    undo(page)
    check('one undo again', 'babel' not in src(page))

    # an Arabic document: the wording, and the page turns once it is set up
    page.evaluate('window.rikuy.toggleSource(false)')
    load_doc(page, doc('', 'هذا نص عربي فقط، بلا أي إعداد.\n\nفقرة ثانية.'))
    page.wait_for_function('!document.getElementById("script-note").hidden', timeout=4000)
    check('Arabic: the notice', note(page) == 'This document has Arabic text. LaTeX needs a font and right to left setup for it.', note(page))
    check('before the set up the page runs left to right, as the PDF would', page.evaluate('document.querySelectorAll("#pages [dir]").length') == 0)
    page.click('#script-go')
    page.wait_for_timeout(400)
    check('an Arabic document is set up with Arabic as its main language', '\\babelprovide[import, main]{arabic}\n\\babelfont{rm}[Renderer=Harfbuzz]{Amiri}\n\\begin{document}' in src(page), src(page)[:260])
    check('and its paragraphs then run right to left', page.evaluate('[...document.querySelectorAll("#pages .it.p")].map((e) => e.getAttribute("dir"))') == ['rtl', 'rtl'])
    # another engine chosen by hand: the message says what to do, not what is not so
    load_doc(page, doc('', 'Text 中文.'))
    page.evaluate('window.rikuy.setEngine("pdflatex")')
    page.wait_for_function('!document.getElementById("script-note").hidden', timeout=4000)
    page.click('#script-go')
    page.wait_for_timeout(300)
    check('with another engine chosen by hand the message says so', page.inner_text('#toast') == 'Added. The PDF needs XeLaTeX: set the engine to Auto in the preview.', page.inner_text('#toast'))
    page.evaluate('window.rikuy.setEngine("auto")')

    # a copy someone shared: its set up is its author's
    load_doc(page, doc('', 'Shared text 中文 and عربي.'))
    page.evaluate('window.rikuy.name = "Shared paper"')
    page.wait_for_timeout(900)
    shared = src(page)
    link = share_link(page, 'Ana')
    B, guest, errs = open_page(p, clear=False)
    guest.goto('about:blank')
    guest.goto(link)
    guest.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
    guest.wait_for_timeout(1500)
    check('a shared copy opens with no notice', src(guest) == shared and note(guest) is None, note(guest))
    check('and nothing was added to it', 'babel' not in src(guest) and 'ctex' not in src(guest) and guest.evaluate('window.rikuy.hist.length') == 0)
    click_text(guest, 'Shared text', 0)
    guest.keyboard.type('好')
    guest.wait_for_timeout(1100)
    check('nor does typing in it bring one', note(guest) is None and '好Shared' in src(guest), note(guest))
    check('no console errors in the shared copy', not errs, errs[:5])
    B.close()


def small_and_dark(p):
    for width, height, dark, name in [(390, 844, True, 'a phone in dark mode'), (390, 844, False, 'a phone'), (1400, 1000, True, 'dark mode')]:
        browser, page, errors = open_page(p, width=width, height=height, dark=dark)
        load_doc(page, doc('', LONG + '.\n\n\\begin{itemize}\n\\item البند الأول\n\\item البند الثاني\n\\end{itemize}\n\n\\section{عنوان}\nنص مع \\foreignlanguage{english}{English words} هنا.'))
        page.wait_for_function('!document.getElementById("script-note").hidden', timeout=5000)
        bar = page.evaluate('''() => { const b = document.getElementById('script-note'), r = b.getBoundingClientRect(), cs = getComputedStyle(b), box = (id) => { const q = document.getElementById(id).getBoundingClientRect(); return [q.left, q.right, q.width, q.height]; };
          return { r: [r.left, r.right, r.height], go: box('script-go'), x: box('script-x'), msg: box('script-msg'), sw: document.documentElement.scrollWidth, iw: innerWidth, bg: cs.backgroundColor, fg: cs.color, barw: b.scrollWidth, clientw: b.clientWidth }; }''')
        check(name + ': the notice fits the screen', bar['sw'] <= bar['iw'] and bar['r'][1] <= bar['iw'] + 0.5 and bar['x'][1] <= bar['iw'] and bar['go'][0] >= bar['msg'][1] - 1 and bar['barw'] <= bar['clientw'] and bar['msg'][2] > 120 and bar['go'][2] > 50, bar)
        lum = sorted([luminance(bar['bg']), luminance(bar['fg'])])
        check(name + ': its words stand out from its ground', (lum[1] + 0.05) / (lum[0] + 0.05) >= 4.5 and (luminance(bar['bg']) < 0.2) == dark, [bar['bg'], bar['fg']])
        page.click('#script-go')
        page.wait_for_timeout(500)
        fit = page.evaluate('''() => { const out = []; for (const e of document.querySelectorAll('#pages .it, #pages .it .lbl, #pages .it .secnum, #pages .it span.t')) { const r = e.getBoundingClientRect(), p = e.closest('.pb').getBoundingClientRect();
            if (r.left < p.left - 1.5 || r.right > p.right + 1.5) out.push([e.className, Math.round(r.left - p.left), Math.round(p.right - r.right)]); }
          const pg = document.querySelector('.page').getBoundingClientRect(), d = document.getElementById('desk');
          return { out, rtl: [...document.querySelectorAll('#pages .it')].every((e) => e.getAttribute('dir') === 'rtl'), sw: document.documentElement.scrollWidth, iw: innerWidth, textOnScreen: (() => { const f = document.querySelector('.page .pb').getBoundingClientRect(); return f.left >= -1 && f.right <= innerWidth + 1; })(), paper: getComputedStyle(document.querySelector('.page')).backgroundColor }; }''')
        check(name + ': right to left text, markers and numbers stay inside the text block', fit['rtl'] and fit['out'] == [], fit)
        check(name + ': the window does not scroll sideways and the text block is on the screen', fit['sw'] <= fit['iw'] and fit['textOnScreen'], fit)
        check(name + ': the paper stays white', fit['paper'] == 'rgb(255, 255, 255)', fit['paper'])
        check(name + ': no console errors', not errors, errors[:5])
        browser.close()


try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        rendering(page)
        wrappers(page)
        editing(page)
        long_rtl(page)
        fonts(page)
        notice(p, page)
        check('no console errors', not errors, errors[:5])
        browser.close()
        small_and_dark(p)
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)

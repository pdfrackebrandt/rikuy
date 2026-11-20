"""A power user's keys (docs/handoff/POWER-USER.md): every place the audit found the keys going
somewhere wrong without a word, pressed as a person presses them, the source checked byte for
byte and the caret where the next key lands.

footnote: Esc, Shift+F5, Right at its end and Ctrl+End leave a footnote typed at the page's foot
(finding 1). Each part is a function; `python3 power.py footnote` runs one."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright


def key(page, k, wait=150):
    page.keyboard.press(k); page.wait_for_timeout(wait)


def typed(page, text, wait=200):
    page.keyboard.type(text); page.wait_for_timeout(wait)


def active(page):
    return page.evaluate("(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase()) : null; })()")


def caret(page):
    return page.evaluate("(() => { const c = window.rikuy.caretNow(); return c ? [c.f, c.a, c.b] : null; })()")


FN = '\\documentclass{article}\n\\begin{document}\n\nAlpha beta gamma.\n\nNext paragraph.\n\n\\end{document}\n'


def footnote(page):
    # Ctrl+Alt+F, the note typed, then a way out; what is typed next goes after the mark
    for ways, label in ((['Escape'], 'Esc'), (['Shift+F5'], 'Shift+F5'), (['ArrowRight'], 'Right at its end'), (['Control+End'], 'Ctrl+End')):
        load_doc(page, FN)
        click_text(page, 'gamma.', 6)
        key(page, 'Control+Alt+f'); typed(page, 'Note.', 300)
        for k in ways: key(page, k, 250)
        typed(page, ' XYZ')
        s = src(page)
        want = 'gamma.\\footnote{Note.} XYZ' if label != 'Ctrl+End' else 'Next paragraph. XYZ'
        check('footnote: ' + label + ' leaves it, the next words after ' + ('the mark' if label != 'Ctrl+End' else 'the text\'s end'), want in s, s[40:120])
    # Right inside the note's text moves on in it, as before
    load_doc(page, FN)
    click_text(page, 'gamma.', 6)
    key(page, 'Control+Alt+f'); typed(page, 'Note.', 300)
    key(page, 'ArrowLeft'); key(page, 'ArrowLeft'); key(page, 'ArrowRight'); typed(page, 'Q')
    check('footnote: Right inside its text stays in it', '\\footnote{NoteQ.}' in src(page), src(page)[40:100])


PARTS = [footnote]


def run():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in PARTS:
            if only and f.__name__ not in only: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
            page.keyboard.press('Escape'); page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()

"""What a newcomer meets outside the ribbon, checked as docs/handoff/UX-AUDIT.md lists it: the caret
given back to the page when a dialog closes, at 1400 px and on a phone at 390 and 360 px (touch),
light and dark. Each part says what Word does and checks that Rikuy does it. Screenshots go to
$RIKUY_SHOTS (default /tmp/ux-shots).

Run: cd test && python3 ux.py [part ...]   (no part: all of them)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, click_text, select_text, src, check, results
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/ux-shots')
os.makedirs(SHOTS, exist_ok=True)
DOC = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here, with a bold word.\n\n'
       'Second paragraph here.\n\\end{document}\n')


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'))


def run_cmd(page, cmd):
    page.evaluate('(c) => window.rikuy.runCommand(c)', cmd)
    page.wait_for_timeout(250)


def dialog_open(page):
    return page.evaluate("!!document.querySelector('body > .pop')")


def dialogs_give_the_caret_back(page, w):
    """Word: a dialog closed with Esc, Cancel or its Close button gives the document back with the
    caret or the selection it had, so the next keys type there. A press outside puts the caret
    where the press is."""
    for cmd in ('font-dialog', 'paragraph-settings', 'page-setup', 'insert-table-dialog', 'share'):
        load_doc(page, DOC)
        click_text(page, 'Second paragraph', 3)
        run_cmd(page, cmd)
        opened = dialog_open(page)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        page.keyboard.type('Z'); page.wait_for_timeout(250)
        check(f'{cmd} closed with Esc: the next key types at the caret it opened on ({w})', opened and not dialog_open(page) and 'SecZond paragraph' in src(page), src(page)[-90:])
    # the selection, kept through Cancel
    load_doc(page, DOC)
    select_text(page, 'bold')
    run_cmd(page, 'font-dialog')
    page.locator('body > .pop button', has_text='Cancel').click(); page.wait_for_timeout(200)
    check(f'Font dialog closed with Cancel: the selection is still the word it was on ({w})', page.evaluate("getSelection().toString()") == 'bold' and page.evaluate("document.activeElement.id") == 'pages')
    # its Close button
    click_text(page, 'First paragraph', 5)
    run_cmd(page, 'paragraph-settings')
    page.locator('body > .pop .pop-x').first.click(); page.wait_for_timeout(200)
    page.keyboard.type('Q'); page.wait_for_timeout(250)
    check(f'Paragraph dialog closed with its Close button: typing goes on at the caret ({w})', 'FirstQ paragraph' in src(page), src(page)[-120:])
    # a press outside: the caret goes where the press is, not back
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 0)
    run_cmd(page, 'font-dialog')
    # (a letter of the page the dialog does not cover: the press lands on the page, not in it)
    box = page.evaluate('''(() => { const P = document.querySelector('body > .pop').getBoundingClientRect();
      for (const s of document.querySelectorAll('#pages span.t')) { const t = s.firstChild; if (!t || t.nodeType !== 3 || t.length < 4) continue;
        for (let i = 1; i < t.length; i++) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const b = r.getBoundingClientRect();
          if (b.width && b.top > 0 && b.bottom < innerHeight && (b.right < P.left || b.left > P.right || b.bottom < P.top || b.top > P.bottom)) return [b.left + 1, b.top + b.height / 2, t.data.slice(0, i)]; } }
      return null; })()''')
    page.mouse.click(box[0], box[1]); page.wait_for_timeout(250)
    page.keyboard.type('Y'); page.wait_for_timeout(250)
    check(f'a press outside a dialog puts the caret where it lands, not back where it opened ({w})', box and (box[2] + 'Y' in src(page) or box[2][:-1] + 'Y' in src(page)) and 'YSecond' not in src(page), (box, src(page)[-90:]))
    # a dialog that changed the document puts the caret where the change leaves it (OK)
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'insert-table-dialog')
    page.locator('body > .pop button', has_text='OK').click(); page.wait_for_timeout(300)
    check(f'Insert Table with OK: a table in the source, the caret on the page ({w})', '\\begin{tabular}' in src(page) and page.evaluate("document.activeElement.id") == 'pages', src(page)[-160:])


def phone_dialogs(page, w):
    """On a touch screen the page gets the caret back only when it had the focus as the dialog
    opened (the on-screen keyboard was up): focusing it otherwise brings the keyboard up unasked."""
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'font-dialog')
    shot(page, f'dialog-font-{w}')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'on a phone, a dialog opened while typing gives the page back ({w})', page.evaluate("document.activeElement.id") == 'pages')
    page.evaluate("document.getElementById('pages').blur()")
    run_cmd(page, 'font-dialog')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'on a phone, a dialog opened with the keyboard down leaves it down ({w})', page.evaluate("document.activeElement.id") != 'pages')


def first_visit(page, w):
    """Word opens a document with the caret at its start: the first key a newcomer types lands,
    with no click first. Not on a phone, where focusing the page brings up the keyboard unasked."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    shot(page, f'first-visit-{w.replace(" ", "").replace(",", "-")}')
    top = page.evaluate("document.getElementById('desk').scrollTop")
    before = src(page)
    page.keyboard.type('Z'); page.wait_for_timeout(300)
    if touch:
        check(f'on a phone the first visit leaves the keyboard down: the page has no focus ({w})', page.evaluate("document.activeElement.id") != 'pages' and src(page) == before)
        return
    check(f'the first visit has the caret at the start of the first paragraph: a key typed lands there ({w})', src(page) != before and '\\begin{abstract}\nZYou are reading' in src(page), src(page)[:0] or [l for l in src(page).splitlines() if 'Z' in l][:2])
    check(f'and the page did not scroll to it ({w})', page.evaluate("document.getElementById('desk').scrollTop") == top)
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check(f'one Undo takes it back ({w})', src(page) == before)


PARTS = {'first_visit': (first_visit, [(1366, False), (1920, True), (390, False), (360, True)]),
         'dialogs': (dialogs_give_the_caret_back, [(1400, False), (1400, True)]),
         'phone_dialogs': (phone_dialogs, [(390, False), (360, True)])}


def run(which):
    with sync_playwright() as p:
        for name in which:
            fn, sizes = PARTS[name]
            for width, dark in sizes:
                touch = width < 700
                browser, page, errors = open_page(p, width=width, height=820 if touch else 900, dark=dark, touch=touch)
                fn(page, '%d px%s' % (width, ', dark' if dark else ''))
                check(f'no console errors ({name}, {width} px)', not errors, errors[:4])
                browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run(sys.argv[1:] or list(PARTS)))

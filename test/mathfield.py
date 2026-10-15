import os, sys
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from browser import open_page, check, results, SHOTS, src, click_text
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1440, height=900)
    base = src(page)
    # --- align display math
    page.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
    page.click('.it.dm >> nth=1')
    page.wait_for_selector('#pop-field', timeout=8000)
    page.wait_for_timeout(300)
    fv = page.evaluate("document.getElementById('pop-field').getValue('latex')")
    print('field value:', fv)
    check('field opens with aligned rows, labels lifted out', fv.startswith('\\begin{aligned}') and '\\label' not in fv, fv)
    check('field keeps user macros by name, argmax as an operator', '\\E' in fv and 'arg\\,max' in fv, fv)
    check('field has focus', page.evaluate("document.activeElement && document.activeElement.id === 'pop-field'"))
    # type at the end of the field
    page.keyboard.type('+1')
    page.wait_for_timeout(400)
    ta = page.evaluate("document.getElementById('pop-tex').value")
    s1 = src(page)
    print('textarea after field edit:\n' + ta)
    check('field edit rewrites the LaTeX box', '+1' in ta, ta)
    check('labels stay on their rows', '\\label{eq:cond}' in ta.split('\\\\')[0] and '\\label{eq:mle}' in ta.split('\\\\')[1], ta)
    first_row = base[base.find('\\begin{align}'):].split('\\\\')[0]
    check('untouched row keeps exact original text', ta.split('\\\\')[0].strip() == first_row.split('\n', 1)[1].strip(), (ta.split('\\\\')[0], first_row))
    check('field edit reaches the source', '+1' in s1[s1.find('\\begin{align}'):s1.find('\\end{align}')], s1[s1.find('\\begin{align}'):s1.find('\\end{align}')+11])
    check('page re-typesets', page.evaluate("[...document.querySelectorAll('.it.dm')].some(d => d.textContent.includes('+1'))"))
    page.screenshot(path=SHOTS + '/60-field-align.png')
    # typing after the block joins the last row
    page.click('#pop-field')
    page.keyboard.press('Control+End') if False else page.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
    page.keyboard.type('q')
    page.wait_for_timeout(300)
    taq = page.evaluate("document.getElementById('pop-tex').value")
    rows = taq.split('\\\\')
    check('text typed after block joins last row', len(rows) == 2 and 'q' in rows[1] and '\\label{eq:mle}' in rows[1] and '\\label{eq:cond}' in rows[0], taq)
    page.keyboard.press('Backspace')
    page.wait_for_timeout(300)
    # edit the LaTeX box -> field follows
    page.click('#pop-tex')
    page.keyboard.press('Control+End')
    page.keyboard.type(' - z')
    page.wait_for_timeout(300)
    fv2 = page.evaluate("document.getElementById('pop-field').getValue('latex')")
    check('LaTeX box edit updates the field', fv2.replace(' ', '').endswith('-z\\end{aligned}') or '-z' in fv2.replace(' ', ''), fv2)
    # ctrl+enter in field adds a row
    page.click('#pop-field')
    page.wait_for_timeout(100)
    page.keyboard.press('End')
    page.keyboard.press('Control+Enter')
    page.wait_for_timeout(200)
    page.keyboard.type('w=0')
    page.wait_for_timeout(400)
    ta3 = page.evaluate("document.getElementById('pop-tex').value")
    check('ctrl+enter adds a row', ta3.count('\\\\') >= 2 and 'w=0' in ta3.replace(' ', ''), ta3)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    check('enter closes popover', page.evaluate('!document.querySelector(".pop")'))
    # undo the whole popover session in one step
    page.keyboard.press('Control+z')
    check('one undo reverts the popover session', src(page) == base, src(page)[src(page).find('\\begin{align}'):][:200])

    # --- inline math in the field
    page.evaluate("document.querySelector('.a-math').scrollIntoView({block:'center'})")
    page.click('.a-math >> nth=0')
    page.wait_for_selector('#pop-field', timeout=8000)
    page.wait_for_timeout(200)
    page.keyboard.press('End')
    page.keyboard.type('+1')
    page.wait_for_timeout(400)
    s2 = src(page)
    check('inline field edit reaches source', '\\gamma+1$' in s2.replace(' ', ''), s2[s2.find('Click $'):][:50])
    page.keyboard.press('Enter')
    page.keyboard.press('Control+z')
    check('undo inline', src(page) == base)

    # --- new math with $ goes straight into the field
    click_text(page, 'or type a dollar sign', 3)
    page.keyboard.type('$')
    page.wait_for_selector('#pop-field', timeout=8000)
    page.wait_for_timeout(200)
    page.keyboard.type('x^2')
    page.wait_for_timeout(400)
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    s3 = src(page)
    seg = s3[s3.find('Click $'):][:160]
    check('new math typed visually', 'or $x^2$type' in seg or 'or $x^{2}$type' in seg, seg)
    page.keyboard.press('Control+z')
    check('undo new math', src(page) == base, src(page)[src(page).find('or t'):][:40])

    # --- dark mode look
    check('no console errors', not errors, errors[:5])
    browser.close()
    browser, page, errors = open_page(p, width=1440, height=900, dark=True)
    page.evaluate("document.querySelectorAll('.it.dm')[0].scrollIntoView({block:'center'})")
    page.click('.it.dm >> nth=0')
    page.wait_for_selector('#pop-field', timeout=8000)
    page.wait_for_timeout(300)
    page.screenshot(path=SHOTS + '/61-field-dark.png')
    check('no console errors (dark)', not errors, errors[:5])
    browser.close()

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))

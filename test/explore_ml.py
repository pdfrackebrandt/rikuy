import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from browser import ROUTES, SKELETON_HEAD, ROOT, SHOTS
from playwright.sync_api import sync_playwright
CSP = ("default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; "
       "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; "
       "media-src data: blob:; connect-src 'none'; worker-src blob:")
html = open(os.path.join(ROOT, 'dist/galley.html'), encoding='utf8').read()
inner = SKELETON_HEAD + html + '</body></html>'
outer = '<!doctype html><html><body style="margin:0"><iframe id="f" src="https://sandbox.test/a" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" style="border:0;width:100vw;height:100vh"></iframe></body></html>'
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 900})
    logs = []
    page.on('console', lambda m: logs.append(m.type + ': ' + m.text))
    page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
    def h(route):
        u = route.request.url
        if u.startswith('https://host.test/'): return route.fulfill(status=200, content_type='text/html', body=outer)
        if u.startswith('https://sandbox.test/'): return route.fulfill(status=200, content_type='text/html', body=inner, headers={'Content-Security-Policy': CSP})
        if u in ROUTES: return route.fulfill(status=200, content_type='application/javascript', body=open(ROUTES[u], encoding='utf8').read())
        logs.append('BLOCKED-NET ' + u[:100]); return route.abort()
    page.route('**/*', h)
    page.goto('https://host.test/')
    fr = page.frame_locator('#f')
    frame = page.frames[1]
    frame.wait_for_function('window.galley && document.getElementById("boot").hidden', timeout=20000)
    frame.evaluate("window.galley.toggleSource(false)")
    frame.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
    fr.locator('.it.dm').nth(1).click()
    frame.wait_for_selector('#pop-field', timeout=10000)
    page.wait_for_timeout(600)
    print('fonts ok:', frame.evaluate("document.fonts.check('16px KaTeX_Main')"))
    print('default shortcuts sample:', frame.evaluate("Object.keys(document.getElementById('pop-field').inlineShortcuts).filter(k=>/^[a-z]+$/.test(k)).slice(0,80).join(' ')"))
    val = lambda: frame.evaluate("document.getElementById('pop-field').getValue('latex')")
    ta = lambda: frame.evaluate("document.getElementById('pop-tex').value")
    # 1. \alpha + space
    page.keyboard.type('+\\alpha')
    page.wait_for_timeout(200)
    print('mode after \\alpha:', frame.evaluate("document.getElementById('pop-field').mode"))
    page.keyboard.press('Space')
    page.wait_for_timeout(200)
    print('after space:', frame.evaluate("document.getElementById('pop-field').mode"), val()[-60:])
    page.keyboard.press('Enter')
    page.wait_for_timeout(300)
    print('after enter popover open?', frame.evaluate("!!document.querySelector('.pop')"), '| ta:', ta()[-80:] if frame.evaluate("!!document.getElementById('pop-tex')") else None)
    # reopen
    if not frame.evaluate("!!document.querySelector('.pop')"):
        fr.locator('.it.dm').nth(1).click(); frame.wait_for_selector('#pop-field'); page.wait_for_timeout(300)
    # 2. x^2 space +1
    page.keyboard.type('+x^2')
    page.keyboard.press('Space')
    page.keyboard.type('+y')
    page.wait_for_timeout(200)
    print('x^2 space +y ->', val()[-50:])
    # 3. a/b
    page.keyboard.type('+a/b')
    page.keyboard.press('Space')
    page.keyboard.type('+c')
    page.wait_for_timeout(200)
    print('a/b space +c ->', val()[-50:])
    # 4. virtual keyboard toggle
    box = frame.evaluate("(() => { const r = document.getElementById('pop-field').getBoundingClientRect(); return [r.right, r.top, r.bottom]; })()")
    page.screenshot(path=SHOTS + '/70-explore.png')
    print('logs:', [l for l in logs if 'Failed to load resource' not in l][:20])
    b.close()

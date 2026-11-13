#!/usr/bin/env python3
"""Draw the pictures the repository shows on GitHub. Chromium (Playwright) draws all of them from
the app icon's mark (build/icons/make.py: mark_css, MARK), the page's own fonts and the built page,
so nothing here is drawn by hand and a rerun gives the same pictures:

  docs/logo-light.png   the README's logo on GitHub's light theme: the app icon and "Rikuy" in the
                        italic serif of the page's header, in ink; transparent, drawn at 2x for the
                        343 px the README shows it at
  docs/logo-dark.png    the same with the wordmark in paper white, for GitHub's dark theme
  docs/screenshot.png   the editor at 1600 x 940 with its sample document: the typeset page, the
                        ribbon and the source pane, a click in the first paragraph and its source
                        lit beside it (the README's picture, and through build/app.mjs the hosted
                        page's og.png)
  docs/social.png       1280 x 640, for GitHub's Settings, Social preview (what X, LinkedIn and
                        Slack show for a shared link): the logo, the line, the address and a crop of
                        docs/screenshot.png; what matters keeps 40 px or more from every edge

The screenshot needs the built page (npm run build); the TeX tree is not needed. The sample prints
\\today, so the clock is fixed and a rerun on another day draws the same page. Pillow writes the
files: the screenshot in 256 colours (a third of the bytes, and no difference the eye can find in
flat interface colours and text), the others losslessly.

Usage: python3 dev/readme_images.py [logo] [screenshot] [social]   (none named: all of them)
"""
import base64, io, os, sys
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
sys.path.insert(0, os.path.join(ROOT, 'build', 'icons'))
sys.path.insert(0, os.path.join(ROOT, 'test'))
import make as icons  # noqa: E402  the mark, its font face and colours (sets PLAYWRIGHT_BROWSERS_PATH too)

INK, PAPER = icons.INK, icons.PAPER
DAY = '2026-11-12T10:00:00'


def face(family, path, weight=400, style='normal'):
    data = base64.b64encode(open(os.path.join(ROOT, path), 'rb').read()).decode()
    return f'@font-face{{font-family:{family};src:url(data:font/woff2;base64,{data}) format("woff2");font-weight:{weight};font-style:{style}}}'


def save(data, path, palette=False):
    im = Image.open(io.BytesIO(data))
    if palette:
        im = im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(path, optimize=True)
    print(os.path.relpath(path, ROOT), im.size, os.path.getsize(path), 'bytes')


def shoot(b, html, path, width, height, scale, selector):
    pg = b.new_page(viewport={'width': width, 'height': height}, device_scale_factor=scale)
    pg.set_content(html)
    pg.evaluate('document.fonts.ready')
    pg.wait_for_timeout(150)
    save(pg.locator(selector).screenshot(omit_background=True), path)
    pg.close()


# ---- the logo: icon and wordmark side by side ----

ICON = 96  # CSS px; the PNG is twice that, and the README shows it at its CSS width

def logo_html(word):
    return f'''<!doctype html><html><head><style>
{icons.FACE}
html,body{{margin:0;background:transparent}}
{icons.mark_css(ICON, 0.22, 1.0)}
/* line-height 1 centres the em box on the icon, and with it the wordmark's capital R: measured
   in the PNG, the R's middle is within a pixel of the icon's at the size the README shows */
.lock{{display:inline-flex;align-items:center;gap:{ICON * 0.25}px;padding:4px}}
.w{{font:italic {ICON * 0.86}px/1 PM;color:{word};letter-spacing:.01em;padding-right:{ICON * 0.05}px}}
</style></head><body><div class="lock">{icons.MARK}<span class="w">Rikuy</span></div></body></html>'''


def logos(b):
    shoot(b, logo_html(INK), os.path.join(DOCS, 'logo-light.png'), 800, 300, 2, '.lock')
    shoot(b, logo_html(PAPER), os.path.join(DOCS, 'logo-dark.png'), 800, 300, 2, '.lock')


# ---- the screenshot: the built page as the artifact host serves it ----

def screenshot(b):
    import serve
    from browser import ROUTES
    srv = serve.start(0)
    port = srv.server_address[1]
    ctx = b.new_context(viewport={'width': 1600, 'height': 940}, color_scheme='light', device_scale_factor=1)
    page = ctx.new_page()
    page.clock.set_fixed_time(DAY)
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def route(r):
        u = r.request.url
        if u in ROUTES:  # the CDN's scripts from node_modules, as the browser tests serve them
            return r.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith(f'http://127.0.0.1:{port}/'):
            return r.continue_()
        return r.abort()
    page.route('**/*', route)
    page.goto(f'http://127.0.0.1:{port}/')
    page.evaluate('localStorage.clear()')  # the sample, not whatever this browser kept
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    page.evaluate('document.fonts.ready')
    page.click('#b-src')
    page.wait_for_timeout(800)
    # a click into the first paragraph: the ribbon wakes up (Italic pressed) and the paragraph's
    # source is lit in the source pane, which is what Rikuy is about
    box = page.get_by_text('emphasise', exact=True).first.bounding_box()
    page.mouse.click(box['x'] + box['width'] - 2, box['y'] + box['height'] / 2)
    page.wait_for_timeout(800)
    # the click scrolls the source to the paragraph; from line 1 it is still in view, and the
    # preamble says at a glance that this is LaTeX
    page.evaluate("document.querySelector('.CodeMirror').CodeMirror.scrollTo(0, 0)")
    page.mouse.move(1, 470)  # no hover outline anywhere
    page.wait_for_timeout(400)
    fonts = page.evaluate('''[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)''')
    for need in ('Paper Modern Serif', 'IBM Plex Sans'):
        if not any(need in f for f in fonts):
            sys.exit(f'{need} did not load: {sorted(set(fonts))}')
    if errors:
        sys.exit('the page reported errors: ' + '; '.join(errors))
    if page.evaluate("[...document.querySelectorAll('dialog[open], [role=dialog]')].some(d => d.offsetParent)"):
        sys.exit('a dialog is open')
    data = page.screenshot(animations='disabled')  # the ribbon's fades finished, so reruns agree
    ctx.close()
    srv.shutdown()
    save(data, os.path.join(DOCS, 'screenshot.png'), palette=True)


# ---- the social preview ----

def social_html():
    shot = base64.b64encode(open(os.path.join(DOCS, 'screenshot.png'), 'rb').read()).decode()
    S = 108  # the icon; the wordmark keeps the README logo's proportions to it
    M = 72   # the margin at the top, the bottom and the left
    K = (640 - 2 * M) / 940  # the editor's whole height between the margins
    return f'''<!doctype html><html><head><style>
{icons.FACE}
{face('Serif', 'build/fonts/cmu-serif-500-roman.woff2')}
{face('Plex', 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 400)}
{face('Plex', 'node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 500)}
html,body{{margin:0;background:{INK}}}
.card{{position:relative;width:1280px;height:640px;overflow:hidden;background:{INK};color:{PAPER}}}
{icons.mark_css(S, 0.22, 1.0)}
/* ink on ink: a hairline says where the icon ends */
.i{{box-shadow:inset 0 0 0 1.5px rgba(245,247,249,.16)}}
.lock{{position:absolute;left:{M}px;top:{M}px;display:flex;align-items:center;gap:{S * 0.25}px}}
.w{{font:italic {S * 0.86}px/1 PM;letter-spacing:.01em}}
.line{{position:absolute;left:{M}px;top:250px;margin:0;font:400 56px/1.1 Serif;letter-spacing:-.005em}}
/* LaTeX's own logo, as \\LaTeX sets it: a small A raised, the E lowered by half an x-height */
.tex .a{{font-size:.72em;vertical-align:.24em;margin-left:-.33em;margin-right:-.13em}}
.tex .e{{position:relative;top:.215em;margin-left:-.1667em;margin-right:-.125em}}
.sub{{position:absolute;left:{M}px;top:402px;margin:0;font:400 23px/1.5 Plex;color:#B4BEC9}}
.url{{position:absolute;left:{M}px;top:{640 - M - 24}px;font:500 22px/24px Plex;color:{PAPER};letter-spacing:.005em}}
/* the editor's whole height between the icon's top and the address's foot, cut by the card's
   right edge after the first lines of the source */
.shot{{position:absolute;left:600px;top:{M}px;width:{1600 * K}px;height:{940 * K}px;border-radius:12px;overflow:hidden;
  background:url(data:image/png;base64,{shot}) 0 0/100% auto no-repeat;
  box-shadow:0 0 0 1px rgba(245,247,249,.10),0 28px 64px rgba(0,0,0,.42),0 6px 18px rgba(0,0,0,.22)}}
</style></head><body><div class="card">
<div class="lock">{icons.MARK}<span class="w">Rikuy</span></div>
<p class="line">Word, PDF and<br><span class="tex">L<span class="a">A</span>T<span class="e">E</span>X</span> in one.</p>
<p class="sub">Type on the typeset page.<br>Real TeX Live, in your browser.</p>
<div class="url">rikuy.rackebrandt.pe</div>
<div class="shot"></div>
</div></body></html>'''


def social(b):
    path = os.path.join(DOCS, 'social.png')
    shoot(b, social_html(), path, 1280, 640, 1, '.card')


if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'logo', 'screenshot', 'social'}
    if want - {'logo', 'screenshot', 'social'}:
        sys.exit(__doc__.split('Usage: ')[1])
    with sync_playwright() as p:
        b = p.chromium.launch()
        if 'logo' in want: logos(b)
        if 'screenshot' in want: screenshot(b)
        if 'social' in want: social(b)
        b.close()

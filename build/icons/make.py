#!/usr/bin/env python3
"""Draw the installed app's icons: the italic R of Rikuy's wordmark (Paper Modern Serif italic,
build/fonts/cmu-serif-500-italic.woff2, as the page's header sets "Rikuy") in paper white on the
interface's ink, with a text caret in its blue: typing on the typeset page. Chromium renders them
(Playwright), so no drawing program or outside asset is involved; the PNGs are committed beside
this script and build/app.mjs copies them into dist/icons/.

  icon-192.png, icon-512.png   the app's icon (rounded square, transparent corners)
  maskable-512.png             the same drawn to the edges, the R inside the safe circle (80 %)
  apple-touch-icon.png         180 px, square: iOS rounds it itself
  favicon-32.png               the browser tab

Usage: python3 build/icons/make.py   (Playwright with Chromium, as the browser tests use)
"""
import base64, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
FONT = base64.b64encode(open(os.path.join(HERE, '..', 'fonts', 'cmu-serif-500-italic.woff2'), 'rb').read()).decode()
INK, PAPER, BLUE = '#18212A', '#F5F7F9', '#6AAEE3'  # --ink-ui, --chrome, the dark theme's --blue (src/app.css)

def page(size, radius, scale):
    # scale: how much of the square the letter's box takes (maskable icons keep to the safe circle)
    fs = size * 0.74 * scale
    return f'''<!doctype html><html><head><style>
@font-face{{font-family:PM;src:url(data:font/woff2;base64,{FONT}) format("woff2");font-style:italic}}
html,body{{margin:0;background:transparent}}
.i{{width:{size}px;height:{size}px;border-radius:{radius * size}px;background:{INK};position:relative;overflow:hidden}}
.r{{position:absolute;left:0;right:0;top:{size * 0.5}px;transform:translateY(-54%);text-align:center;font:italic {fs}px/1 PM;color:{PAPER};letter-spacing:0}}
.r b{{display:inline-block;width:{max(1, round(fs * 0.055))}px;height:{fs * 0.78}px;background:{BLUE};vertical-align:{-fs * 0.02}px;margin-left:{fs * 0.06}px}}
</style></head><body><div class="i"><div class="r">R<b></b></div></div></body></html>'''

OUT = [('icon-192.png', 192, 0.22, 1.0), ('icon-512.png', 512, 0.22, 1.0), ('maskable-512.png', 512, 0.0, 0.78),
       ('apple-touch-icon.png', 180, 0.0, 0.92), ('favicon-32.png', 32, 0.18, 1.05)]

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, radius, scale in OUT:
        pg = b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
        pg.set_content(page(size, radius, scale))
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(100)
        pg.locator('.i').screenshot(path=os.path.join(HERE, name), omit_background=True)
        pg.close()
        print(name, os.path.getsize(os.path.join(HERE, name)), 'bytes')
    b.close()

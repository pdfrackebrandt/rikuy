#!/usr/bin/env python3
"""Draw the installed app's icons: the italic R of Rikuy's wordmark (Paper Modern Serif italic,
build/fonts/cmu-serif-500-italic.woff2, as the page's header sets "Rikuy") in paper white on the
interface's ink, with a text caret: typing on the typeset page. The letter is the formal half;
the caret carries the lime to pink of Peruvian chicha posters, the one loud thing in the mark
(Rikuy is Quechua; the maintainer chose this pairing, option B of five drawn). Chromium renders them
(Playwright), so no drawing program or outside asset is involved; the PNGs are committed beside
this script and build/app.mjs copies them into dist/icons/.

  icon-192.png, icon-512.png   the app's icon (rounded square, transparent corners)
  maskable-512.png             the same drawn to the edges, the R inside the safe circle (80 %)
  apple-touch-icon.png         180 px, square: iOS rounds it itself
  favicon-32.png               the browser tab

The README's logo and GitHub's social preview (docs/*.png) carry the same mark: dev/readme_images.py
imports mark_css() and MARK from here, so the two cannot drift apart.

Usage: python3 build/icons/make.py   (Playwright with Chromium, as the browser tests use)
"""
import base64, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
FONT = base64.b64encode(open(os.path.join(HERE, '..', 'fonts', 'cmu-serif-500-italic.woff2'), 'rb').read()).decode()
INK, PAPER = '#18212A', '#F5F7F9'  # --ink-ui, --chrome (src/app.css)
# the caret, top to bottom: lime, yellow, orange, pink. Hard enough steps that a 2 px wide caret
# in the 32 px tab icon still shows four colours and not a brown smear.
CHICHA = 'linear-gradient(180deg,#C8F53A 0%,#FFD21F 38%,#FF8A1F 68%,#FF2E88 100%)'

FACE = f'@font-face{{font-family:PM;src:url(data:font/woff2;base64,{FONT}) format("woff2");font-style:italic}}'
MARK = '<div class="i"><div class="r">R<b></b></div></div>'

def mark_css(size, radius, scale):
    # scale: how much of the square the letter's box takes (maskable icons keep to the safe circle)
    fs = size * 0.74 * scale
    return f'''.i{{width:{size}px;height:{size}px;border-radius:{radius * size}px;background:{INK};position:relative;overflow:hidden}}
.r{{position:absolute;left:0;right:0;top:{size * 0.5}px;transform:translateY(-54%);text-align:center;font:italic {fs}px/1 PM;color:{PAPER};letter-spacing:0}}
.r b{{display:inline-block;width:{max(2, round(fs * 0.075))}px;height:{fs * 0.78}px;background:{CHICHA};border-radius:{fs * 0.04}px;vertical-align:{-fs * 0.02}px;margin-left:{fs * 0.06}px}}'''

def page(size, radius, scale):
    return f'''<!doctype html><html><head><style>
{FACE}
html,body{{margin:0;background:transparent}}
{mark_css(size, radius, scale)}
</style></head><body>{MARK}</body></html>'''

OUT = [('icon-192.png', 192, 0.22, 1.0), ('icon-512.png', 512, 0.22, 1.0), ('maskable-512.png', 512, 0.0, 0.78),
       ('apple-touch-icon.png', 180, 0.0, 0.92), ('favicon-32.png', 32, 0.18, 1.05)]

if __name__ == '__main__':
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

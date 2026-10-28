#!/usr/bin/env python3
"""Make the page's text fonts from the Computer Modern Unicode fonts in node_modules/computer-modern.

The page embeds its fonts as data, so each one is cut to what a Western document needs (Latin with
its extensions and Vietnamese, Greek, punctuation, a few symbols), about half the original size.
A cut font is a Modified Version under the SIL Open Font License, which may not carry the
Reserved Font Name ("Computer Modern Unicode fonts"), so the cut fonts are named Paper Modern.
Their license is OFL.txt beside this script.

Usage: python3 build/fonts/subset.py   (after npm ci; needs fontTools with brotli)
"""
import os
from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'node_modules', 'computer-modern', 'fonts')
OUT = os.environ.get('FONTS_OUT', HERE)

UNICODES = (
    '0020-007E,00A0-024F,0259,02B0-02C3,02C6-02E9,02F9-02FA,0300-030F,0311,0313-031A,031C-0332,'
    '0334-0335,0337-033D,0346-0349,034D,035C-035D,0360-0362,0374-0375,037A,037E,0384-038A,038C,'
    '038E-03A1,03A3-03CE,03D1,03D5,03D8-03DD,03DF-03E1,03F1,03F5,1E00-1E13,1E18-1E27,1E2A-1E2D,'
    '1E30-1E4B,1E54-1E63,1E68-1E77,1E7C-1E99,1E9B,1EA0-1EF9,2000-200D,2010-2014,2016,2018-2022,'
    '2026,2029,2030-2031,2039-203B,203D,203F-2040,2044-2046,2052,2054,207F-2080,20A1,20A4,20A6,'
    '20A9,20AB-20AC,20B2,2103,2116-2117,211E,2120,2122,2126-2127,212E,2190-2193,2197-2198,2206,'
    '2212,2217,221A,22C6,2322,2329-232A,25CB,25E6,262D,2640,266A,26AD-26AE,26B2,FB00-FB06')

# file -> (family, style); the page's CSS names the same families (build.mjs, src/app.css)
FONTS = {
    'cmu-serif-500-roman.woff2': ('Paper Modern Serif', 'Regular'),
    'cmu-serif-500-italic.woff2': ('Paper Modern Serif', 'Italic'),
    'cmu-serif-700-roman.woff2': ('Paper Modern Serif', 'Bold'),
    'cmu-serif-700-italic.woff2': ('Paper Modern Serif', 'Bold Italic'),
    'cmu-sans-serif-500-roman.woff2': ('Paper Modern Sans', 'Regular'),
    'cmu-sans-serif-700-roman.woff2': ('Paper Modern Sans', 'Bold'),
    'cmu-typewriter-text-500-roman.woff2': ('Paper Modern Typewriter', 'Regular'),
}


def rename(font, family, style):
    full = family + ('' if style == 'Regular' else ' ' + style)
    ps = (family + '-' + style).replace(' ', '')
    note = ('Paper Modern is a subset of the Computer Modern Unicode fonts by Andrey V. Panov, '
            'cut to Latin and Greek for a web page; under the SIL Open Font License 1.1.')
    names = font['name']
    # the four style linked names, the full and PostScript names, and no typographic family that
    # could still say CMU
    names.names = [n for n in names.names if n.nameID not in (1, 2, 3, 4, 6, 16, 17)]
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        names.setName(family, 1, pid, eid, lid)
        names.setName(style, 2, pid, eid, lid)
        names.setName(ps + ' (subset 1)', 3, pid, eid, lid)
        names.setName(full, 4, pid, eid, lid)
        names.setName(ps, 6, pid, eid, lid)
    names.setName(note, 10, 3, 1, 0x409)


def main():
    for f, (family, style) in FONTS.items():
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.name_languages = ['*']
        opts.notdef_outline = True
        font = subset.load_font(os.path.join(SRC, f), opts)
        s = subset.Subsetter(opts)
        s.populate(unicodes=subset.parse_unicodes(UNICODES))
        s.subset(font)
        rename(font, family, style)
        subset.save_font(font, os.path.join(OUT, f), opts)
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == '__main__':
    main()

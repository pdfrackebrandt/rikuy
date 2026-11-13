"""Which classes and packages make TeX Live's PDF take LaTeX's paper as its sheet, measured: each
compiled in the page's own TeX (a class with letterpaper, a package in \\documentclass[letterpaper]
{article}), its PDF's first MediaBox read. Letter (612 by 792 bp) means it sets the sheet (it, or
something it loads: hyperref, geometry, typearea, crop, the kernel's \\DocumentMetadata); A4 means
it leaves TeX Live's own. src/pagesrc.js's MEDIA_CLASSES and MEDIA_PACKAGES come from this list.
Usage: python3 dev/media_probe.py [names.json]   (names: packages; the classes and packages below
are measured too unless ONLY=1). env: RIKUY_DIST (default dist). A name it prints as letter (or
another size) belongs off NO_MEDIA_PACKAGES, a4 on it."""
import os, sys, json, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
from browser import open_page
from playwright.sync_api import sync_playwright
names = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else []
CLASSES = [] if os.environ.get('ONLY') else ['scrartcl', 'scrreprt', 'scrbook', 'scrlttr2', 'memoir', 'beamer', 'IEEEtran', 'elsarticle', 'acmart', 'tufte-book', 'tufte-handout',
           'moderncv', 'apa7', 'amsart', 'amsbook', 'revtex4-2', 'llncs', 'extarticle', 'report', 'book', 'letter', 'exam', 'jss', 'svjour3', 'aastex631', 'mnras', 'achemso', 'tikzposter']
PACKAGES = [] if os.environ.get('ONLY') else ['bookmark', 'savetrees', 'hyperxmp', 'doi', 'crop', 'typearea', 'fullpage', 'a4wide', 'pdfpages', 'pdfx', 'pdfcomment', 'attachfile', 'media9', 'ocgx2', 'animate',
            'xr-hyper', 'backref', 'hypcap', 'vmargin', 'anysize', 'layaureo', 'zwpagelayout', 'stocksize', 'changepage', 'classicthesis', 'tcolorbox', 'todonotes', 'glossaries', 'acronym', 'cleveref', 'nameref', 'biblatex', 'natbib']
jobs = [('class:' + c, '\\documentclass[letterpaper]{%s}\n\\begin{document}\nx\n\\end{document}\n' % c) for c in CLASSES]
for n in sorted(set(PACKAGES) | set(x for x in names if not x.startswith('class:'))):
    jobs.append((n, '\\documentclass[letterpaper]{article}\n\\usepackage{%s}\n\\begin{document}\nx\n\\end{document}\n' % n))
jobs.append(('DocumentMetadata', '\\DocumentMetadata{}\n\\documentclass[letterpaper]{article}\n\\begin{document}\nx\n\\end{document}\n'))
out = {}
with sync_playwright() as p:
    b, page, errors = open_page(p)
    page.set_default_timeout(300000)
    for name, doc in jobs:
        r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); if (!r.pdf) return { ok: false };
          const s = new TextDecoder('latin1').decode(r.pdf); const m = /\\/MediaBox\\s*\\[\\s*([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\s*\\]/.exec(s);
          return { ok: r.ok, box: m ? [+m[3] - +m[1], +m[4] - +m[2]] : null, w: window.rikuy.pdfView && window.rikuy.pdfView.pages && window.rikuy.pdfView.pages[0] ? [window.rikuy.pdfView.pages[0].w1, window.rikuy.pdfView.pages[0].h1] : null }; }''', doc)
        box = r.get('w') or r.get('box')
        kind = 'error' if not r.get('ok') or not box else 'letter' if abs(box[0] - 612) < 1 and abs(box[1] - 792) < 1 else 'a4' if abs(box[0] - 595.3) < 1 and abs(box[1] - 841.9) < 1 else 'other %.1fx%.1f' % tuple(box)
        out[name] = kind
        print('%-24s %s' % (name, kind), flush=True)
    b.close()
print(json.dumps({k: v for k, v in out.items() if v != 'a4'}, indent=0))

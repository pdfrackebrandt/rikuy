#!/usr/bin/env python3
"""Bitmap (PK) fonts for the METAFONT-only families in Galley's tree.

A desktop TeX Live meets a font that exists only as METAFONT source by running mktexpk, which
runs METAFONT and gftopk and leaves the PK file for pdfTeX. The WebAssembly binary has no
METAFONT, so this does the same ahead of time with TeX Live's own mf and gftopk (Ubuntu's
texlive-binaries), in the mode and resolution pdfTeX asks for (ljfour, 600 dpi), at the
magnifications documents usually reach. The PK files go to the overlay build_tree.py lays over
the tree, under fonts/pk/ljfour/public/<family>/dpi<n>/, where kpathsea looks.

Usage: build_pk.py   (needs /tmp/eng/mf/x from texlive-binaries, texlive-base, libkpathsea6)
"""
import json, os, subprocess, shutil, tempfile, sys
from concurrent.futures import ThreadPoolExecutor

MF = '/tmp/eng/mf/x/usr/bin/mf-nowin'
GFTOPK = '/tmp/eng/mf/x/usr/bin/gftopk'
LIB = '/tmp/eng/mf/x/usr/lib/x86_64-linux-gnu'
TREE = os.environ.get('GALLEY_TREE', '/tmp/eng/galley-tree') + '/texlive/texmf-dist'
OUT = '/tmp/eng/extra/texlive/texmf-dist/fonts/pk/ljfour/public'
SRC_ROOTS = ['/tmp/eng/debs/x', '/tmp/eng/mf/x']
# magnifications: the design size, then \magstephalf to \magstep 4 for families used as text
# (LaTeX's size commands reach them when a family has no design size of its own)
ALL = [1.0]
TEXT = [1.0, 1.0954, 1.2, 1.44, 1.728, 2.0736]
TEXT_FAMILIES = {'concrete', 'bbm', 'gothic', 'ecc', 'knuth-local', 'amsfonts', 'etex', 'xypic'}
# the artifact has room for the families papers use (Concrete, \mathbbm, blackletter, symbol and
# chess fonts); a full TeX Live mirror (build_mirror.py) can carry the rest
FAMILIES = os.environ.get('PK_FAMILIES', 'concrete,bbm,gothic,ecc,knuth-local,amsfonts,etex,xypic,skull,ifsym,skak,chess,dancers,circ,niceframe,clock,trsym').split(',')


def sources():
    out = {}
    for r in SRC_ROOTS:
        for dp, dn, fn in os.walk(r):
            if '/fonts/source/' not in dp + '/' and '/metafont/' not in dp:
                continue
            for f in fn:
                if f.endswith('.mf'):
                    out.setdefault(f[:-3], dp)
    return out


def main():
    srcs = sources()
    tfms = {}
    for dp, dn, fn in os.walk(TREE + '/fonts/tfm'):
        for f in fn:
            if f.endswith('.tfm'):
                tfms[f[:-4]] = os.path.join(dp, f)
    vfs = set(f[:-3] for dp, dn, fn in os.walk(TREE + '/fonts/vf') for f in fn if f.endswith('.vf'))
    mapped = set(l.split()[0] for l in open(TREE + '/texmf-var/fonts/map/pdftex/updmap/pdftex.map', encoding='latin-1')
                 if l.strip() and not l.startswith('%'))
    fam = lambda n: tfms[n].split('/fonts/tfm/')[1].split('/')[1]
    fonts = sorted(n for n in tfms if n not in vfs and n not in mapped and n in srcs and (FAMILIES == ['*'] or fam(n) in FAMILIES))
    print('METAFONT-only fonts:', len(fonts))
    dirs = sorted(set(srcs.values()))
    mfinputs = '.:' + ':'.join(dirs)
    env = dict(os.environ, LD_LIBRARY_PATH=LIB, MFINPUTS=mfinputs, TEXMFCNF='/tmp/eng/mf/x/usr/share/texlive/texmf-dist/web2c')
    base_dir = tempfile.mkdtemp(prefix='mfbase-')
    subprocess.run([MF, '-ini', r'\input plain; input modes; dump'], cwd=base_dir, env=env, capture_output=True)
    assert os.path.exists(base_dir + '/plain.base'), 'no plain.base'
    env['MFBASES'] = base_dir

    def one(name):
        family = tfms[name].split('/fonts/tfm/')[1].split('/')[1]
        made = 0
        for mag in (TEXT if family in TEXT_FAMILIES else ALL):
            dpi = int(round(600 * mag))
            dst = os.path.join(OUT, family, 'dpi%d' % dpi, name + '.pk')
            if os.path.exists(dst):
                made += 1
                continue
            w = tempfile.mkdtemp(prefix='mf-')
            r = subprocess.run([MF, '&plain', r'\mode=ljfour; mag=%s; nonstopmode; batchmode; input %s' % (repr(mag), name)], cwd=w, env=env, capture_output=True, timeout=120)
            gf = [f for f in os.listdir(w) if f.endswith('gf')]
            if gf:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                subprocess.run([GFTOPK, os.path.join(w, gf[0]), dst], env=env, capture_output=True)
                made += os.path.exists(dst)
            shutil.rmtree(w, ignore_errors=True)
        return name, made

    ok = bad = 0
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        for name, made in ex.map(one, fonts):
            if made: ok += 1
            else: bad += 1
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fn in os.walk(OUT) for f in fn)
    print('PK fonts made for %d fonts (%d failed), %.1f MB' % (ok, bad, total / 1e6))


if __name__ == '__main__':
    main()

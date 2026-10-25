#!/usr/bin/env python3
"""Bitmap (PK) fonts for the METAFONT-only families in Galley's tree.

A desktop TeX Live meets a font that exists only as METAFONT source by running mktexpk, which
runs METAFONT and gftopk and leaves the PK file for pdfTeX. The WebAssembly binary has no
METAFONT, so this does the same ahead of time with TeX Live's own mf and gftopk (Ubuntu's
texlive-binaries), in the mode and resolution pdfTeX asks for (ljfour, 600 dpi), at the
magnifications documents usually reach. The PK files go to the overlay build_tree.py lays over
the tree, under fonts/pk/ljfour/public/<family>/dpi<n>/, where kpathsea looks.

The same goes for metrics: the cm-super Type 1 fonts cover every size of the EC (T1, TS1) and
LH (T2A, Cyrillic) fonts, but TeX Live ships TFM files for some sizes only and a desktop makes
the others with mktextfm when a document asks (a 12 pt sans bold heading in Russian: lasx1200).
Those TFM files are made here the way mktexmf and mktextfm make them, into
fonts/tfm/mktextfm/<encoding>/ of the overlay; pdfTeX then takes the glyphs from cm-super.

Usage: build_pk.py   (needs $GALLEY_WORK/mf/x from texlive-binaries, texlive-base, libkpathsea6 and, for
                     TeX Live 2026's, libc6)
"""
import json, os, subprocess, shutil, tempfile, sys
from concurrent.futures import ThreadPoolExecutor

WORK = os.environ.get('GALLEY_WORK', '/tmp/eng')
MF = os.path.join(WORK, 'mf/x/usr/bin/mf-nowin')
GFTOPK = os.path.join(WORK, 'mf/x/usr/bin/gftopk')
LIB = os.path.join(WORK, 'mf/x/usr/lib/x86_64-linux-gnu')
TREE = os.environ.get('GALLEY_TREE', os.path.join(WORK, 'galley-tree')) + '/texlive/texmf-dist'
OUT = os.path.join(WORK, 'extra/texlive/texmf-dist/fonts/pk/ljfour/public')
OUT_TFM = os.path.join(WORK, 'extra/texlive/texmf-dist/fonts/tfm/mktextfm')
# the encodings whose missing sizes are made (T2B, T2C and X2, the other Cyrillic ones, would add
# 1.3 MB to the artifact; they stay as on a desktop without mktextfm)
TFM_MAPS = ['t1', 'ts1', 't2a']
SRC_ROOTS = [os.path.join(WORK, 'debs/x'), os.path.join(WORK, 'mf/x')]
# Ubuntu 26.10's TeX Live 2026 binaries need that release's C library: when mf/x holds its loader,
# METAFONT and gftopk start through it (the host's own libraries stay out of the way)
LD = os.path.join(WORK, 'mf/x/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2')
RUN = [LD, '--library-path', LIB] if os.path.exists(LD) else []
# magnifications: the design size, then \magstephalf to \magstep 4 for families used as text
# (LaTeX's size commands reach them when a family has no design size of its own)
ALL = [1.0]
TEXT = [1.0, 1.0954, 1.2, 1.44, 1.728, 2.0736]
TEXT_FAMILIES = {'concrete', 'bbm', 'gothic', 'ecc', 'knuth-local', 'amsfonts', 'etex', 'xypic', 'cm-mf-extra-bold'}
# the artifact has room for the families papers use (Concrete, \mathbbm, blackletter, symbol and
# chess fonts, bold typewriter); a full TeX Live mirror (build_mirror.py) can carry the rest
FAMILIES = os.environ.get('PK_FAMILIES', 'concrete,bbm,gothic,ecc,knuth-local,amsfonts,etex,xypic,skull,ifsym,skak,chess,dancers,circ,niceframe,clock,trsym,cm-mf-extra-bold').split(',')


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
    env = dict(os.environ, LD_LIBRARY_PATH=LIB, MFINPUTS=mfinputs, TEXMFCNF=os.path.join(WORK, 'mf/x/usr/share/texlive/texmf-dist/web2c'))
    base_dir = tempfile.mkdtemp(prefix='mfbase-')
    subprocess.run(RUN + [MF, '-ini', r'\input plain; input modes; dump'], cwd=base_dir, env=env, capture_output=True)
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
            r = subprocess.run(RUN + [MF, '&plain', r'\mode=ljfour; mag=%s; nonstopmode; batchmode; input %s' % (repr(mag), name)], cwd=w, env=env, capture_output=True, timeout=120)
            gf = [f for f in os.listdir(w) if f.endswith('gf')]
            if gf:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                subprocess.run(RUN + [GFTOPK, os.path.join(w, gf[0]), dst], env=env, capture_output=True)
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
    make_tfms(tfms, srcs, env)


def mf_driver(name):
    """What mktexmf writes for a font with no .mf of its own (EC, TC and LH fonts)."""
    root = name.rstrip('0123456789')
    size = name[len(root):]
    real = size[:-2] + '.' + size[-2:] if len(size) in (4, 5) else size
    if name.startswith(('ec', 'tc')):
        return 'if unknown exbase: input exbase fi;\ngensize:=%s;\ngenerate %s;\n' % (real, root)
    if len(name) > 2 and name[0] == 'l' and name[1] in 'abcdhl' and name[2] in 'bcdfiorstuvx':
        return 'input fikparm;\n'
    return None


def make_tfms(tfms, srcs, env):
    # the tree already holds the files made last time (the overlay): those are made again
    tfms = {n: p for n, p in tfms.items() if '/fonts/tfm/mktextfm/' not in p}
    want = []
    for enc in TFM_MAPS:
        m = os.path.join(TREE, 'fonts/map/dvips/cm-super/cm-super-%s.map' % enc)
        for line in open(m, encoding='latin-1'):
            if line.strip() and not line.startswith('%'):
                name = line.split()[0]
                if name not in tfms and (name in srcs or mf_driver(name)):
                    want.append((enc, name))
    want = sorted(set(want))
    if os.path.exists(OUT_TFM):
        shutil.rmtree(OUT_TFM)

    def one(item):
        enc, name = item
        w = tempfile.mkdtemp(prefix='mft-')
        if name not in srcs:  # a font with a source of its own is made from it, as mktexmf does
            open(os.path.join(w, name + '.mf'), 'w').write(mf_driver(name))
        subprocess.run(RUN + [MF, '&plain', r'\mode=ljfour; mag=1; nonstopmode; batchmode; input %s' % name], cwd=w, env=env, capture_output=True, timeout=120)
        src = os.path.join(w, name + '.tfm')
        ok = os.path.exists(src)
        if ok:
            dst = os.path.join(OUT_TFM, enc, name + '.tfm')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        shutil.rmtree(w, ignore_errors=True)
        return ok

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        made = sum(ex.map(one, want))
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fn in os.walk(OUT_TFM) for f in fn) if made else 0
    print('TFM files made for %d of %d cm-super sizes without one (%s), %.1f MB' % (made, len(want), ', '.join(TFM_MAPS), total / 1e6))


if __name__ == '__main__':
    main()

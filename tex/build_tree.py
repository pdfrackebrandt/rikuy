#!/usr/bin/env python3
"""Assemble the TeX tree Galley ships, and cut it into packs.

  build_tree.py tree   -> $GALLEY_WORK/galley-tree  (the merged TeX Live tree, for format building and tests)
  build_tree.py packs  -> dist/tex/              (tree.json.gz, p-*.bin, w-*.bin)

Sources:
  BASE   TeX Live 2026 as built for BusyTeX (scheme-basic + latex, latexrecommended,
         latexextra, fontsrecommended), unpacked from its data package.
  DEBS   Ubuntu 24.04 TeX Live 2023 packages, for what BASE lacks: languages, science,
         pictures, publishers, bibliography styles, a few font families. A file is only
         added when BASE has nothing of the same name, so BASE always wins.
"""
import gzip, hashlib, json, os, re, shutil, sys
from collections import defaultdict

WORK = os.environ.get('GALLEY_WORK', '/tmp/eng')
BASE = os.path.join(WORK, 'tree-extra')
DEBS = os.path.join(WORK, 'debs/x')
TREE = os.environ.get('GALLEY_TREE', os.path.join(WORK, 'galley-tree'))
OUT = os.environ.get('GALLEY_TEX_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'tex'))
WASM_SRC = os.path.join(WORK, 'busy', 'busytex', 'busytex.wasm')   # BusyTeX's binary, as released
WASM = os.path.join(WORK, 'busytex-patched.wasm')           # with xdvipdfmx's program calls routed to the shell (patch_wasm.py)
EXTRA = os.path.join(WORK, 'extra')   # overlay: trimmed ICU data and the like
USAGE = os.path.join(WORK, 'usage.json')   # {"core": [paths...], "groups": [[paths...], ...]} from the corpus run

TD = 'texlive/texmf-dist/'

# What no engine here reads: other formats' macros, docs, sources, font sources and metrics
# for tools that are not in the WebAssembly binary.
EXCLUDE = re.compile('|'.join([
    r'^texlive/texmf-dist/fonts/(afm|source|sfd|lig|ofm|ovf|ovp|opl)/',
    r'^texlive/texmf-dist/tex/(context|optex|latex-dev|fontinst|mex|cslatex|csplain|eplain|platex|uplatex|ptex|uptex|jadetex|xmltex|texinfo|amstex|lollipop|mltex|musixtex)/',
    r'^texlive/texmf-dist/texmf-var/web2c/(metafont|tex)/',
    r'^texlive/texmf-dist/(doc|source|scripts|tlpkg|xdvi|ttf2pk|mft|metafont|metapost|psutils|texconfig|chktex|tex4ht|hbf2gf|omega|context)/',
    r'^texlive/texmf-dist/fonts/(map/(vtex|fontname)|enc/ttf2pk)/',
    r'\.(log|html|md|dtx|ins|pl|sh|py|cmd|bat|exe)$',
    r'^texlive/icudt\d+l\.dat$',
    r'^texlive/tex/',
]))
# Large and rarely used: emoji and icon sets, single-university templates, sample bibliographies.
DROP = ['uantwerpendocs', 'nwejm', 'openmoji', 'twemojis', 'hwemoji', 'utfsym', 'worldflags', 'rutitlepage', 'customenvs',
        'vscodeicons', 'euromoney', 'ghsystem', 'realhats', 'tablericons', 'powerdot-tuliplab', 'stellenbosch-2', 'stellenbosch',
        'sduthesis', 'beebe', 'beamertheme-npbt', 'fithesis', 'isosigns', 'bootstrapicons', 'texfindpkg', 'pgf-periodictable',
        'duckuments', 'panneauxroute', 'lucide-icons', 'figchild', 'knitting', 'kosch', 'media9', 'tudscr', 'lwarp',
        'tex4ht', 'jeuxcartes', 'uowthesis',
        # map data and card/flag images (PSTricks), Qur'an texts, Greek fonts for pdfLaTeX (72 MB),
        # Gregorian chant (needs the gregorio program), Ethiopic and Devanagari Type 1 fonts
        'pst-geo', 'pst-poker', 'pst-flags', 'quran', 'quran-ur', 'quran-bn', 'quran-de', 'quran-id', 'cbfonts', 'gregoriotex', 'ethiop-t1', 'velthuis',
        # LuaTeX hyphenation and ligature data for one language, Persian typesetting, sparkline font
        'autotype', 'simurgh', 'spark-otf',
        # TeX Live 2026 additions of the same kinds: one school's beamer theme (26 MB of images), thesis
        # templates, a Qur'an text, card game images
        'ciad-beamertheme', 'utbmciad-report', 'westlakethesis', 'quran-es', 'quran-en', 'magicthegathering',
        # French school exercise sets, an Urdu Nastaliq font, a magazine layout, a Chinese index
        # method, one university's logos
        'profcollege', 'proflycee', 'awami', 'fancymag', 'tetragonos', 'njuvisual', 'luadraw', 'tkz-grapheur',
        'hduthesis', 'sysuthesis', 'ecnuthesis', 'rpgicons', 'corasdiagram', 'mathador', 'hustvisual', 'mahjong-tiles',
        'twoxtwogame', 'nwafupaper', 'nxuthesis', 'dlrg-templates', 'quantumcubemodel', 'aeskwadraat',
        # LuaTeX's type definitions for editors (no engine reads them), Mongolian fonts, archaeology
        # bibliography styles, a Dalian thesis class, light spectra, Chinese chess
        'luatex-type-definitions', 'montex', 'biblatex-archaeology', 'xduts', 'pgf-spectra', 'xq', 'biblatex-gb7714-2015',
        'pronunciation',
        # TeX Live 2026's July update made the artifact 1 MB larger. Out: PSTricks polytope
        # drawings, a multiscript fork of biblatex, the Lua CSL processor and its styles, Lua
        # school worksheets, a young l3draw drawing package (0.4), product diagrams, Euler
        # integration models
        'pst-cox', 'biblatex-ms', 'citation-style-language', 'scholatex', 'hawkdraw', 'pmdraw', 'numodel-bundle']
DROP_RE = re.compile(r'/(' + '|'.join(re.escape(x) for x in DROP) + r')/')
KEEP_ANYWAY = re.compile(r'(^texlive/texmf-dist/web2c/|^texlive/texmf-dist/texmf-var/fonts/map/pdftex/|/language\.(dat|def)|/ls-R$|\.(map|enc)$)')

# Families taken from texlive-fonts-extra (the rest of it, 600 MB, stays out).
FONT_PICKS = ['newtx', 'newpx', 'stix2-type1', 'stix', 'fourier', 'mathdesign', 'txfontsb', 'mnsymbol', 'mathabx-type1',
              'doublestroke', 'bbold-type1', 'esstix', 'notomath', 'inconsolata', 'bera', 'fontawesome5', 'fontawesome',
              'academicons', 'ccicons', 'cmbright', 'hfbright', 'zlmtt', 'xcharter', 'kpfonts', 'erewhon', 'cochineal',
              'baskervillef', 'heuristica', 'crimson', 'yfonts', 'yfonts-t1', 'ifsym', 'phaistos', 'cmll', 'trajan',
              # METAFONT families (shipped as PK fonts, build_pk.py) and the metrics their Type 1 versions need
              'gothic', 'bbm', 'bbm-macros', 'skull', 'mathabx', 'bbold', 'ecc', 'dancers', 'esvect', 'wasy', 'wasy-type1',
              # bold typewriter and small caps for bold-extra (listings' keywords in \ttfamily\bfseries)
              'cm-mf-extra-bold',
              # beamer loads it whenever it is installed: math italic in slides set in sans (76 KB)
              'sansmathaccent']
DEB_SETS = ['texlive-lang-german', 'texlive-lang-spanish', 'texlive-lang-french', 'texlive-lang-portuguese', 'texlive-lang-italian',
            'texlive-lang-european', 'texlive-science', 'texlive-bibtex-extra', 'texlive-pictures', 'texlive-publishers',
            'texlive-humanities', 'texlive-plain-generic', 'texlive-lang-cyrillic', 'texlive-latex-extra', 'texlive-latex-recommended', 'texlive-games',
            'texlive-pstricks', 'texlive-xetex', 'texlive-luatex', 'texlive-metapost', 'texlive-lang-greek', 'texlive-lang-arabic', 'texlive-lang-other',
            'texlive-formats-extra', 'asymptote']


# the core of TeX Live that BusyTeX's tree also holds; with TL_FIRST these replace its copies
CORE_SETS = ['texlive-base', 'texlive-latex-base', 'texlive-fonts-recommended', 'texlive-lang-english', 'texlive-lang-polish',
             'texlive-lang-czechslovak']
TL_FIRST = os.environ.get('GALLEY_TL_FIRST', '1') == '1'


def protected(rel):
    """Files of BusyTeX's tree that belong to its engine, never replaced from the packages."""
    return (not rel.startswith(TD) or rel.startswith((TD + 'web2c/', TD + 'texmf-var/', TD + 'texmf-config/', TD + 'tex/generic/config/'))
            or rel.endswith('/ls-R'))


def walk(root):
    for dp, dn, fn in os.walk(root):
        for f in fn:
            p = os.path.join(dp, f)
            if os.path.islink(p) and not os.path.exists(p):
                continue
            yield p


def wanted(rel):
    if DROP_RE.search(rel):
        return False
    if KEEP_ANYWAY.search(rel) and not re.search(r'/(doc|source)/', rel):
        return True
    return not EXCLUDE.search(rel)


def build_tree():
    files = {}  # rel -> source path
    # One TeX Live (PLAN task 4): with TL_FIRST, the Ubuntu TeX Live 2026 packages win over
    # BusyTeX's tree for every macro and font file they share, the kernel included, so the
    # formats are rebuilt from them (build_formats.py). BusyTeX keeps what is its engine's own:
    # web2c (paths for its file system), texmf-var (formats, maps), tex/generic/config.
    debian_names = defaultdict(set)
    if TL_FIRST:
        for name in CORE_SETS + DEB_SETS:
            for sub in ('usr/share/texlive/texmf-dist', 'usr/share/texmf'):
                root = os.path.join(DEBS, name, sub)
                for p in walk(root) if os.path.isdir(root) else []:
                    parts = os.path.relpath(p, root).split('/')
                    if not protected(TD + '/'.join(parts)) and wanted(TD + '/'.join(parts)):
                        debian_names[parts[0] + '/' + (parts[1] if parts[0] == 'fonts' and len(parts) > 2 else '')].add(parts[-1])
    for p in walk(BASE):
        rel = os.path.relpath(p, BASE)
        if rel.startswith(TD) and not protected(rel):
            parts = rel[len(TD):].split('/')
            if parts[-1] in debian_names[parts[0] + '/' + (parts[1] if parts[0] == 'fonts' and len(parts) > 2 else '')]:
                continue  # TeX Live 2026's own copy comes from the packages
        if rel.startswith(('bin/', 'etc/')) or wanted(rel):
            files[rel] = p
    base_names = defaultdict(set)  # top area -> basenames
    # tex/ files by name -> the format folders they are in: a file only XeTeX or LuaTeX search
    # (tex/xelatex/...) does not shadow one for every engine (pstricks.con, dvips's, is in
    # tex/generic; XeTeX's own is in tex/xelatex)
    tex_dirs = defaultdict(set)
    ENGINE_ONLY = {'xelatex', 'xetex', 'lualatex', 'luatex'}
    for rel in files:
        if rel.startswith(TD):
            parts = rel[len(TD):].split('/')
            base_names[parts[0] + '/' + (parts[1] if parts[0] == 'fonts' and len(parts) > 2 else '')].add(parts[-1])
            if parts[0] == 'tex' and len(parts) > 2:
                tex_dirs[parts[-1]].add(parts[1])
    added = defaultdict(int)
    added_bytes = defaultdict(int)
    maps_added = []

    def add_from(root, label, filt=None):
        for p in walk(root):
            sub = os.path.relpath(p, root)
            rel = TD + sub
            if rel in files or not wanted(rel) or (filt and not filt(sub)):
                continue
            parts = sub.split('/')
            area = parts[0] + '/' + (parts[1] if parts[0] == 'fonts' and len(parts) > 2 else '')
            engine_only = parts[0] == 'tex' and len(parts) > 2 and parts[1] not in ENGINE_ONLY and tex_dirs[parts[-1]] and tex_dirs[parts[-1]] <= ENGINE_ONLY
            # never shadow a newer file of the same name; with TL_FIRST every package is the same
            # TeX Live, whose files of one name in several folders are meant (XeTeX's pstricks.con
            # in tex/xelatex beside dvips's in tex/generic: each engine's search path picks its own)
            if parts[-1] in base_names[area] and not engine_only and not TL_FIRST:
                continue
            if parts[0] == 'tex' and len(parts) > 2:
                tex_dirs[parts[-1]].add(parts[1])
            if sub.startswith('tex/generic/config/') or sub.startswith('web2c/') or sub.startswith('texmf-var/'):
                continue
            files[rel] = p
            base_names[area].add(parts[-1])
            added[label] += 1
            added_bytes[label] += os.path.getsize(p)
            if re.match(r'fonts/map/(dvips|pdftex)/.+\.map$', sub):
                maps_added.append(rel)

    for name in (CORE_SETS if TL_FIRST else []) + DEB_SETS:
        for sub in ('usr/share/texlive/texmf-dist', 'usr/share/texmf'):
            root = os.path.join(DEBS, name, sub)
            if os.path.isdir(root):
                add_from(root, name)
    fx = os.path.join(DEBS, 'texlive-fonts-extra', 'usr/share/texlive/texmf-dist')
    picks = set(FONT_PICKS)
    if os.path.isdir(fx):
        add_from(fx, 'fonts-extra', lambda sub: any(seg in picks for seg in sub.split('/')[1:-1]))

    if os.path.exists(TREE):
        shutil.rmtree(TREE)
    for rel, src in files.items():
        dst = os.path.join(TREE, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)

    # font maps of the added families go into the map pdfTeX reads
    pmap = os.path.join(TREE, TD, 'texmf-var/fonts/map/pdftex/updmap/pdftex.map')
    have = set()
    lines = open(pmap, encoding='latin-1').read().split('\n')
    for l in lines:
        if l and not l.startswith('%'):
            have.add(l.split()[0])
    extra = []
    tfms = set(os.path.basename(r)[:-4] for r in files if r.endswith('.tfm'))
    for rel in sorted(maps_added):
        if '/dvips/' in rel and os.path.exists(os.path.join(TREE, rel.replace('/dvips/', '/pdftex/'))):
            continue  # a pdfTeX-specific map exists for this family: use that one
        for l in open(os.path.join(TREE, rel), encoding='latin-1'):
            l = l.rstrip('\n')
            if not l.strip() or l.lstrip().startswith(('%', '#')):
                continue
            k = l.split()[0]
            # a map line names a TFM; anything else in a .map file (TECkit sources, notes) is not one
            if k not in tfms or not re.match(r'^\S+(\s+\S+)?(\s+"[^"]*")?(\s+<\[?\S+)*\s*$', l):
                continue
            if k not in have:
                have.add(k)
                extra.append(l)
    # formats rebuilt with every hyphenation pattern (build_formats.py); see tex/README
    for src, dst in [(os.path.join(WORK, 'pdflatex-all.fmt'), 'pdftex/pdflatex.fmt'), (os.path.join(WORK, 'fmt', 'xelatex.fmt'), 'xetex/xelatex.fmt'),
                     (os.path.join(WORK, 'fmt', 'luahblatex.fmt'), 'luahbtex/luahblatex.fmt')]:
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(TREE, TD, 'texmf-var/web2c', dst))
    # XeTeX finds fonts by name through fontconfig, which would read every font file once per
    # session to build its list; the caches made at build time (build_formats.py fccache) stand in
    # for that scan. They stay valid because the worker gives every directory the same mtime.
    with open(os.path.join(TREE, 'texlive/fonts.conf'), 'w') as fh:
        fh.write('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>'
                 '<dir>/texlive/texmf-dist/fonts/opentype</dir><dir>/texlive/texmf-dist/fonts/truetype</dir>'
                 '<dir>/texlive/texmf-dist/fonts/type1</dir><cachedir>/texlive/fontconfig-cache</cachedir></fontconfig>\n')
    # files made for Galley (the trimmed ICU data XeTeX needs, see build_icu.sh), laid over the tree
    for p in walk(EXTRA):
        dst = os.path.join(TREE, os.path.relpath(p, EXTRA))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(p, dst)
    # Asymptote's base modules, from the source the asy program was built from (build_tools.sh),
    # where TeX Live keeps them
    asybase = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'asy', 'base')
    if os.path.isdir(asybase):
        dst = os.path.join(TREE, TD, 'asymptote')
        os.makedirs(dst, exist_ok=True)
        for n in sorted(os.listdir(asybase)):
            shutil.copyfile(os.path.join(asybase, n), os.path.join(dst, n))
    # xindy's modules, where TeX Live keeps them (build_tools.sh xindy)
    xmods = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'xindy', 'modules')
    if os.path.isdir(xmods):
        for p in walk(xmods):
            dst = os.path.join(TREE, TD, 'xindy', 'modules', os.path.relpath(p, xmods))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(p, dst)
    fc = os.path.join(WORK, 'fccache')
    if os.path.isdir(fc):
        os.makedirs(os.path.join(TREE, 'texlive/fontconfig-cache'), exist_ok=True)
        for n in os.listdir(fc):
            shutil.copyfile(os.path.join(fc, n), os.path.join(TREE, 'texlive/fontconfig-cache', n))
    # keep only map lines whose font files are in the tree: pdfTeX reads this file on every run
    present = set()
    for p in walk(os.path.join(TREE, TD, 'fonts')):
        present.add(os.path.basename(p))
    kept = []
    for l in lines + extra:
        if not l or l.startswith('%'):
            continue
        need = re.findall(r'<\[?<?([^\s<\[]+\.(?:pfb|pfa|ttf|otf|enc))', l)
        fontfiles = [x for x in need if not x.endswith('.enc')]
        if fontfiles and not all(x in present for x in fontfiles):
            continue
        if any(x.endswith('.enc') and x not in present for x in need):
            continue
        kept.append(l)
    with open(pmap, 'w', encoding='latin-1') as fh:
        fh.write('% pdftex.map for Galley: entries whose fonts are installed\n' + '\n'.join(kept) + '\n')
    print('map lines kept', len(kept), 'of', len([l for l in lines if l and not l.startswith('%')]) + len(extra))
    write_lsr()
    print('files', len(files), 'map lines', len(extra))
    for k in sorted(added_bytes, key=lambda k: -added_bytes[k]):
        print('  %-28s %6d files %7.1f MB' % (k, added[k], added_bytes[k] / 1e6))


def write_lsr():
    """kpathsea's filename databases, for exactly the files in the tree."""
    for root in [os.path.join(TREE, TD.rstrip('/')), os.path.join(TREE, TD, 'texmf-var'), os.path.join(TREE, TD, 'texmf-config')]:
        if not os.path.isdir(root):
            continue
        out = ['% ls-R -- filename database for kpathsea; do not change this line.', '']
        for dp, dn, fn in os.walk(root):
            dn.sort(); fn.sort()
            rel = os.path.relpath(dp, root)
            out.append('./:' if rel == '.' else './' + rel + ':')
            out.extend(dn + [x for x in fn if x != 'ls-R'])
            out.append('')
        open(os.path.join(root, 'ls-R'), 'w').write('\n'.join(out) + '\n')


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def leb(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def wasm_wrap(payload):
    """The artifact host serves a fixed list of file types, none of them plain binary. Each
    pack therefore travels as a valid (empty) WebAssembly module whose single custom section
    'galley' carries the gzip bytes; the worker skips the few header bytes."""
    name = b'galley'
    body = leb(len(name)) + name + payload
    return b'\0asm\x01\0\0\0' + b'\x00' + leb(len(body)) + body


def write_wrapped(fname, payload):
    open(os.path.join(OUT, fname), 'wb').write(wasm_wrap(payload))


# ---- Type 1 fonts, stored so they compress --------------------------------------------------
# A .pfb's program is encrypted twice (eexec over the private part, then each glyph program),
# which leaves gzip nothing to find: TeX Live's Type 1 fonts are half of what Galley ships.
# The packs store them decrypted, with the glyph positions; the worker encrypts them again on
# first read. Both ciphers are deterministic (the random bytes are part of the plaintext), so
# the font TeX reads is byte for byte the original.

try:
    import ctypes
    _T1 = ctypes.CDLL(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'native', 't1crypt.so'))
except OSError:
    _T1 = None


def _t1_c(fn, data, r):
    out = ctypes.create_string_buffer(len(data))
    fn(bytes(data), out, len(data), r)
    return out.raw


def _t1_dec(data, r):
    if _T1:
        return _t1_c(_T1.t1_dec, data, r)
    out = bytearray(len(data))
    for i, c in enumerate(data):
        out[i] = c ^ (r >> 8)
        r = ((c + r) * 52845 + 22719) & 0xffff
    return bytes(out)


def _t1_enc(data, r):
    if _T1:
        return _t1_c(_T1.t1_enc, data, r)
    out = bytearray(len(data))
    for i, p in enumerate(data):
        c = p ^ (r >> 8)
        out[i] = c
        r = ((c + r) * 52845 + 22719) & 0xffff
    return bytes(out)


def _uvar(n):
    return leb(n)


def t1x(b):
    """pfb bytes -> 'T1X1' + segments, or None when the file is not a plain pfb."""
    segs, i = [], 0
    try:
        while i < len(b):
            if b[i] != 0x80:
                return None
            t = b[i + 1]
            if t == 3:
                segs.append((3, b''))
                i += 2
                break
            n = int.from_bytes(b[i + 2:i + 6], 'little')
            segs.append((t, b[i + 6:i + 6 + n]))
            i += 6 + n
    except IndexError:
        return None
    if i != len(b) or not any(t == 2 for t, _ in segs):
        return None
    out = bytearray(b'T1X1') + _uvar(len(segs))
    for t, d in segs:
        if t != 2:
            out += bytes([t]) + _uvar(len(d)) + _uvar(0) + d
            continue
        p = _t1_dec(d, 55665)
        m = re.search(rb'/lenIV\s+(-?\d+)', p)
        leniv = int(m.group(1)) if m else 4
        q = bytearray(p)
        ranges, pos = [], 0
        if leniv >= 0:
            for mm in re.finditer(rb'(\d+)\s+(RD|-\|)\s', p):
                s0, n = mm.end(), int(mm.group(1))
                if s0 < pos or s0 + n > len(p):
                    continue
                q[s0:s0 + n] = _t1_dec(p[s0:s0 + n], 4330)
                ranges.append((s0, n))
                pos = s0 + n
        out += bytes([2]) + _uvar(len(d)) + _uvar(len(ranges))
        prev = 0
        for s0, n in ranges:
            out += _uvar(s0 - prev) + _uvar(n)
            prev = s0 + n
        out += q
    if t1x_restore(bytes(out)) != b:
        return None
    return bytes(out)


def t1x_restore(x):
    """The inverse, as the worker does it (kept here to check every font at build time)."""
    i = 4

    def uv():
        nonlocal i
        n, sh = 0, 0
        while True:
            c = x[i]
            i += 1
            n |= (c & 0x7f) << sh
            sh += 7
            if not c & 0x80:
                return n
    res = bytearray()
    for _ in range(uv()):
        t = x[i]
        i += 1
        n = uv()
        nr = uv()
        rs, prev = [], 0
        for _ in range(nr):
            a = prev + uv()
            ln = uv()
            rs.append((a, ln))
            prev = a + ln
        d = x[i:i + n]
        i += n
        if t == 3:
            res += b'\x80\x03'
            continue
        if t == 2:
            q = bytearray(d)
            for a, ln in rs:
                q[a:a + ln] = _t1_enc(d[a:a + ln], 4330)
            d = _t1_enc(bytes(q), 55665)
        res += bytes([0x80, t]) + len(d).to_bytes(4, 'little') + d
    return bytes(res)


def build_packs():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    allf = []
    for p in walk(TREE):
        rel = '/' + os.path.relpath(p, TREE)
        allf.append((rel, os.path.getsize(p), p))
    allf.sort()
    usage = json.load(open(USAGE)) if os.path.exists(USAGE) else {'core': []}
    core = set(usage.get('core', []))
    must = re.compile(r'(/ls-R$|/web2c/texmf\.cnf$|pdflatex\.fmt$|/updmap/pdftex\.map$|^/bin/|^/etc/|/fonts\.conf$|/texmf\.cnf$|language\.(dat|def)$)')
    core_files = [f for f in allf if f[0] in core or must.search(f[0])]
    rest = [f for f in allf if not (f[0] in core or must.search(f[0]))]

    # group the rest by the package directory it lives in, so a package comes in one piece
    def group_key(rel):
        s = rel.split('/')
        if '/texmf-dist/' in rel:
            i = s.index('texmf-dist')
            t = s[i + 1:]
            if t[0] == 'fonts':
                return '/'.join(t[:4])  # fonts/type1/public/cm-super
            if t[0] == 'tex':
                return '/'.join(t[:3])  # tex/latex/pgf
            return '/'.join(t[:2])
        return s[1]
    groups = defaultdict(list)
    for f in rest:
        groups[group_key(f[0])].append(f)

    packs = []
    files_out = []
    t1stats = [0, 0]

    def emit(members, label):
        raw = bytearray()
        n = len(packs)
        for rel, size, p in members:
            b = open(p, 'rb').read()
            x = t1x(b) if rel.endswith('.pfb') else None
            if x is not None:
                files_out.append([rel, len(b), n, len(raw), len(x), 1])
                raw += x
                t1stats[0] += len(b); t1stats[1] += len(x)
            else:
                files_out.append([rel, len(b), n, len(raw)])
                raw += b
        z = gzip.compress(bytes(raw), 9, mtime=0)
        h = sha(z)
        fname = 'p-%s.wasm' % h
        write_wrapped(fname, z)
        packs.append({'f': fname, 'z': len(z), 'n': len(raw), 'h': h, 'g': label})

    # core in chunks of about 6 MB uncompressed, fetched in parallel at start
    chunk, size = [], 0
    for f in core_files:
        chunk.append(f); size += f[1]
        if size > 6_000_000:
            emit(chunk, 'core'); chunk, size = [], 0
    if chunk:
        emit(chunk, 'core')
    ncore = len(packs)

    # the rest: whole groups packed together up to ~3 MB raw; big groups split by file
    LIM = 3_000_000
    cur, cur_size, cur_labels = [], 0, []
    for key in sorted(groups):
        g = groups[key]
        gsize = sum(x[1] for x in g)
        if gsize > LIM:
            if cur:
                emit(cur, ','.join(cur_labels)); cur, cur_size, cur_labels = [], 0, []
            part, psz = [], 0
            for f in g:
                part.append(f); psz += f[1]
                if psz > LIM:
                    emit(part, key); part, psz = [], 0
            if part:
                emit(part, key)
            continue
        if cur_size + gsize > LIM and cur:
            emit(cur, ','.join(cur_labels)); cur, cur_size, cur_labels = [], 0, []
        cur.extend(g); cur_size += gsize; cur_labels.append(key)
    if cur:
        emit(cur, ','.join(cur_labels))

    # the engine, gzipped and cut under the per-file limit
    if not os.path.exists(WASM) or os.path.getmtime(WASM) < os.path.getmtime(WASM_SRC):
        import patch_wasm
        patch_wasm.main(WASM_SRC, WASM)
    wz = gzip.compress(open(WASM, 'rb').read(), 9, mtime=0)
    wasm = []
    CH = 14_000_000
    for i in range(0, len(wz), CH):
        part = wz[i:i + CH]
        fn = 'w-%s.wasm' % sha(part)
        write_wrapped(fn, part)
        wasm.append({'f': fn, 'z': len(part)})

    # biber (biblatex's default backend): its own Perl in WebAssembly, fetched on first use
    biber = {}
    for key, src in [('wasm', os.path.join(WORK, 'busy/busytex/biber.wasm')), ('data', os.path.join(WORK, 'busy/busytex/biber.data'))]:
        z = gzip.compress(open(src, 'rb').read(), 9, mtime=0)
        assert len(z) < CH
        fn = 'b-%s.wasm' % sha(z)
        write_wrapped(fn, z)
        biber[key] = {'f': fn, 'z': len(z), 'h': sha(z)}

    tools = build_tool_assets()

    # which packs hold which LaTeX package, so the page can fetch them up front
    provides = defaultdict(set)
    for rel, size, n, off, *_ in files_out:
        m = re.search(r'/tex/(?:latex|generic)/[^/]+/([^/]+)\.(sty|cls)$', rel)
        if m:
            provides[m.group(1)].add(n)
    index = {
        'v': sha(json.dumps([p['h'] for p in packs]).encode()),
        'wasm': wasm, 'wasmHash': sha(wz), 'wasmSize': os.path.getsize(WASM),
        'core': list(range(ncore)),
        'packs': [{'f': p['f'], 'z': p['z'], 'n': p['n'], 'h': p['h']} for p in packs],
        'files': files_out,
        'provides': {k: sorted(v) for k, v in provides.items()},
        'biber': biber,
        'tools': tools,
    }
    js = json.dumps(index, separators=(',', ':')).encode()
    write_wrapped('tree.wasm', gzip.compress(js, 9, mtime=0))
    total = sum(p['z'] for p in packs) + sum(w['z'] for w in wasm)
    print('type1 fonts stored decrypted:', t1stats)
    print('packs', len(packs), 'core packs', ncore, 'core MB', round(sum(p['z'] for p in packs[:ncore]) / 1e6, 1),
          'total MB', round(total / 1e6, 1), 'index KB', round(len(gzip.compress(js)) / 1e3), 'wasm MB', round(len(wz) / 1e6, 1))


# ---- programs TeX's shell escape runs (tex/tools.js), each fetched on first use ----------------
TOOL_WASM = [  # key, the classic script build.mjs writes, the WebAssembly
    ('gs', 'gs.js', 'node_modules/@okathira/ghostpdl-wasm/dist/gs.wasm'),
    ('gnuplot', 'gnuplot.js', 'tex/vendor/gnuplot/gnuplot.wasm'),
    ('dvips', 'dvips.js', 'tex/vendor/dvips/dvips.wasm'),  # build_tools.sh
    ('asy', 'asy.js', 'tex/vendor/asy/asy.wasm'),
    ('xindy', 'xindy.js', 'tex/vendor/xindy/xindy.wasm'),
]


def build_tool_assets():
    CH = 14_000_000
    ROOTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')

    def asset(path):
        z = gzip.compress(open(path, 'rb').read(), 9, mtime=0)
        assert len(z) < CH, path
        fn = 't-%s.wasm' % sha(z)
        write_wrapped(fn, z)
        return {'f': fn, 'z': len(z), 'h': sha(z)}
    tools = {}
    for key, js, wasm_path in TOOL_WASM:
        p = os.path.join(ROOTDIR, wasm_path)
        if os.path.exists(p):
            tools[key] = {'js': js, 'wasm': asset(p)}
        else:
            print('tool missing, left out:', wasm_path)
    PY = os.path.join(ROOTDIR, 'node_modules', 'pyodide')
    # minted's Python side as the minted.sty in the tree expects it: TeX Live bundles the wheels
    # latexminted.py loads (scripts/minted) with each minted release; with the tree from TeX
    # Live's packages (TL_FIRST) they come from the same package as minted.sty, else vendor/wheels
    WH = os.path.join(DEBS, 'texlive-latex-extra/usr/share/texlive/texmf-dist/scripts/minted')
    if not (TL_FIRST and os.path.isdir(WH)):
        WH = os.path.join(ROOTDIR, 'tex', 'vendor', 'wheels')
    tools['python'] = {
        'loader': 'pyodide.js',
        'asm': asset(os.path.join(PY, 'pyodide.asm.mjs')), 'wasm': asset(os.path.join(PY, 'pyodide.asm.wasm')),
        'stdlib': asset(os.path.join(PY, 'python_stdlib.zip')), 'lock': asset(os.path.join(PY, 'pyodide-lock.json')),
        'wheels': [asset(os.path.join(WH, w)) for w in sorted(os.listdir(WH)) if w.endswith('.whl')],
    }
    return tools


def update_tools():
    """Rewrite only the programs in an existing tree.wasm (and their t-*.wasm files)."""
    path = os.path.join(OUT, 'tree.wasm')
    raw = open(path, 'rb').read()
    index = json.loads(gzip.decompress(raw[raw.index(b'galley') + 6:]))
    def files_of(t):
        out = []
        for v in t.values():
            for a in (v if isinstance(v, list) else [v]):
                if isinstance(a, dict) and 'f' in a:
                    out.append(a['f'])
        return out
    old = {f for t in index['tools'].values() for f in files_of(t)}
    index['tools'] = build_tool_assets()
    new = {f for t in index['tools'].values() for f in files_of(t)}
    for f in old - new:
        try:
            os.remove(os.path.join(OUT, f))
        except OSError:
            pass
    js = json.dumps(index, separators=(',', ':')).encode()
    write_wrapped('tree.wasm', gzip.compress(js, 9, mtime=0))
    print('tools', sorted(index['tools']), 'removed', sorted(old - new))


# ---- the full TeX Live mirror, for Galley on its own site ------------------------------------
# Everything in TeX Live the artifact leaves out, in the same pack format, with its own index.
# The worker asks it for a file only when kpathsea finds nothing locally (BusyTeX's
# kpse_remote_fetch_js hook), so a document pays only for what it uses. Fonts that come from
# the mirror need their map lines, so the mirror carries TeX Live's whole pdftex.map too.
MIRROR_OUT = os.environ.get('GALLEY_MIRROR_OUT', os.path.join(WORK, 'mirror'))


def build_mirror():
    local = set()
    local_names = set()
    for p in walk(TREE):
        rel = os.path.relpath(p, TREE)
        local.add(rel)
        local_names.add(os.path.basename(p))
    files = {}
    doc = re.compile(r'^texlive/texmf-dist/(doc|source|scripts|tlpkg|xdvi|ttf2pk|mft|psutils|texconfig|chktex|tex4ht|hbf2gf|omega)/|\.(log|html|md|dtx|ins|pl|sh|py|cmd|bat|exe|pdf)$|^texlive/texmf-dist/fonts/(afm|source|sfd|lig)/')
    roots = []
    for name in sorted(os.listdir(DEBS)):
        for sub in ('usr/share/texlive/texmf-dist', 'usr/share/texmf'):
            r = os.path.join(DEBS, name, sub)
            if os.path.isdir(r):
                roots.append(r)
    for r in [os.path.join(BASE, 'texlive/texmf-dist')] + roots:
        for p in walk(r):
            rel = TD + os.path.relpath(p, r)
            if rel in local or rel in files or doc.search(rel):
                continue
            b = os.path.basename(p)
            if b in local_names or b == 'ls-R':
                continue  # TeX finds the local file of that name first anyway
            files[rel] = p
    # TeX Live's whole font map: for each font the line of the base map when the files it names
    # are here (local or mirror), else a line from the added packages' maps that names files that
    # are (the packages are TeX Live 2023 where the base is 2026, and encodings got new names)
    avail = set(os.path.basename(r) for r in list(files) + list(local))
    tfm_names = set(n[:-4] for n in avail if n.endswith('.tfm'))

    def complete(l):
        need = re.findall(r'<\[?<?([^\s<\[]+\.(?:pfb|pfa|ttf|otf|enc))', l)
        return all(x in avail for x in need)

    def is_map_line(l):
        return re.match(r'^\S+(\s+\S+)?(\s+"[^"]*")?(\s+<\[?\S+)*\s*$', l)
    chosen = {}
    order = []
    for l in open(os.path.join(BASE, TD, 'texmf-var/fonts/map/pdftex/updmap/pdftex.map'), encoding='latin-1'):
        l = l.rstrip('\n')
        if not l.strip() or l.startswith('%'):
            continue
        k = l.split()[0]
        if k not in chosen and complete(l):
            chosen[k] = l; order.append(k)
    for rel, p in sorted(files.items()):
        if not re.search(r'fonts/map/(dvips|pdftex)/.+\.map$', rel):
            continue
        for l in open(p, encoding='latin-1'):
            l = l.rstrip('\n')
            if not l.strip() or l.lstrip().startswith(('%', '#')):
                continue
            k = l.split()[0]
            if k in chosen or k not in tfm_names or not is_map_line(l) or not complete(l):
                continue
            chosen[k] = l; order.append(k)
    full = ['% pdftex.map for Galley with the full TeX Live mirror'] + [chosen[k] for k in order]
    print('full map lines', len(full) - 1)
    os.makedirs(os.path.join(WORK, 'mirror-extra'), exist_ok=True)
    fullmap = os.path.join(WORK, 'mirror-extra/pdftex-full.map')
    open(fullmap, 'w', encoding='latin-1').write('\n'.join(full) + '\n')
    files[TD + 'texmf-var/fonts/map/pdftex/updmap/pdftex-full.map'] = fullmap

    if os.path.exists(MIRROR_OUT):
        shutil.rmtree(MIRROR_OUT)
    os.makedirs(MIRROR_OUT)
    allf = sorted(('/' + rel, os.path.getsize(p), p) for rel, p in files.items())
    print('mirror files', len(allf), 'MB raw', round(sum(f[1] for f in allf) / 1e6, 1))

    def group_key(rel):
        t = rel.split('/texmf-dist/')[1].split('/')
        if t[0] == 'fonts':
            return '/'.join(t[:4])
        if t[0] == 'tex':
            return '/'.join(t[:3])
        return '/'.join(t[:2])
    groups = defaultdict(list)
    for f in allf:
        groups[group_key(f[0])].append(f)
    packs, files_out = [], []

    def emit(members):
        raw = bytearray()
        n = len(packs)
        for rel, size, p in members:
            b = open(p, 'rb').read()
            x = t1x(b) if rel.endswith('.pfb') else None
            if x is not None:
                files_out.append([rel, len(b), n, len(raw), len(x), 1])
                raw += x
            else:
                files_out.append([rel, len(b), n, len(raw)])
                raw += b
        z = gzip.compress(bytes(raw), 6, mtime=0)
        h = sha(z)
        fname = 'm-%s.wasm' % h
        open(os.path.join(MIRROR_OUT, fname), 'wb').write(wasm_wrap(z))
        packs.append({'f': fname, 'z': len(z), 'n': len(raw), 'h': h})

    LIM = 4_000_000
    cur, cur_size = [], 0
    for key in sorted(groups):
        g = groups[key]
        gsize = sum(x[1] for x in g)
        if gsize > LIM:
            if cur:
                emit(cur); cur, cur_size = [], 0
            part, psz = [], 0
            for f in g:
                part.append(f); psz += f[1]
                if psz > LIM:
                    emit(part); part, psz = [], 0
            if part:
                emit(part)
            continue
        if cur_size + gsize > LIM and cur:
            emit(cur); cur, cur_size = [], 0
        cur.extend(g); cur_size += gsize
    if cur:
        emit(cur)
    provides = defaultdict(set)
    for rel, size, n, off, *_ in files_out:
        m = re.search(r'/tex/(?:latex|generic|xelatex|lualatex|luatex)/[^/]+/([^/]+)\.(sty|cls)$', rel)
        if m:
            provides[m.group(1)].add(n)
    index = {'v': sha(json.dumps([p['h'] for p in packs]).encode()), 'packs': packs, 'files': files_out,
             'provides': {k: sorted(v) for k, v in provides.items()}, 'map': '/' + TD + 'texmf-var/fonts/map/pdftex/updmap/pdftex-full.map'}
    js = json.dumps(index, separators=(',', ':')).encode()
    open(os.path.join(MIRROR_OUT, 'index.wasm'), 'wb').write(wasm_wrap(gzip.compress(js, 9, mtime=0)))
    total = sum(p['z'] for p in packs)
    print('mirror packs', len(packs), 'MB', round(total / 1e6, 1), 'index KB', round(os.path.getsize(os.path.join(MIRROR_OUT, 'index.wasm')) / 1e3))


if __name__ == '__main__':
    {'tree': build_tree, 'packs': build_packs, 'lsr': write_lsr, 'mirror': build_mirror, 'tools': update_tools}[sys.argv[1]]()


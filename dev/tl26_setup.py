"""Make the unpacked Ubuntu 26.10 TeX Live 2026 packages in $TL26 (default /opt/tl26) runnable.

The packages expect to live at /usr, /etc and /var and to have run their install scripts. This
does what those scripts do, inside $TL26, without touching the host:
  - absolute symlinks are pointed into $TL26
  - etc/texmf/web2c/texmf.cnf is Debian's texmf.cnf with every root moved into $TL26
  - wrap/ holds one launcher per program: ELF programs start through the release's own
    ld-linux with its libraries, Perl scripts through its Perl, shell scripts as they are
  - Debian's update-fmtutil, update-updmap and update-language (rewritten to $TL26) assemble
    fmtutil.cnf, updmap.cfg and language.dat; then mktexlsr, updmap-sys and fmtutil-sys --all
Files are unlinked before they are written, because the tree is made of hard links into the
per package folders that build_tree.py reads.
"""
import os, re, stat, subprocess, sys

TL = os.environ.get('TL26', '/opt/tl26')
HERE = os.path.dirname(os.path.abspath(__file__))
LD = TL + '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
LIBS = ':'.join(TL + p for p in ['/usr/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu', '/usr/lib', '/usr/lib/x86_64-linux-gnu/perl/5.42/auto'])


def write(path, text, mode=None):
    if os.path.lexists(path):
        os.unlink(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)
    if mode:
        os.chmod(path, mode)


def fix_symlinks():
    n = 0
    for dp, dn, fn in os.walk(TL):
        for x in dn + fn:
            p = os.path.join(dp, x)
            if os.path.islink(p):
                t = os.readlink(p)
                if t.startswith('/') and not t.startswith(TL + '/'):
                    os.unlink(p); os.symlink(TL + t, p); n += 1
    print('absolute symlinks moved into', TL, n)


def texmf_cnf():
    src = open(TL + '/usr/share/texlive/texmf-dist/web2c/texmf.cnf').read()
    sets = {
        'TEXMFROOT': TL + '/usr/share/texlive', 'TEXMFDEBIAN': TL + '/usr/share/texmf', 'TEXMFLOCAL': TL + '/usr/local/share/texmf',
        'TEXMFSYSVAR': TL + '/var/lib/texmf', 'TEXMFSYSCONFIG': TL + '/etc/texmf', 'TEXMFHOME': TL + '/home/texmf',
        'TEXMFVAR': TL + '/home/texmf-var', 'TEXMFCONFIG': TL + '/home/texmf-config', 'OSFONTDIR': TL + '/usr/share/fonts',
        'TEXMFCNF': TL + '/etc/texmf/web2c', 'VARTEXFONTS': '/tmp/texfonts-tl26',
    }
    out = []
    for line in src.split('\n'):
        m = re.match(r'^(\w+)\s*=', line)
        if m and m.group(1) in sets:
            line = '%s = %s' % (m.group(1), sets[m.group(1)])
        out.append(line)
    text = '\n'.join(out) + '\n'
    write(TL + '/etc/texmf/web2c/texmf.cnf', text)
    left = [l for l in text.split('\n') if re.search(r'(^|[^/\w])/(usr|etc|var)/', l) and not l.lstrip().startswith('%')]
    print('texmf.cnf written; lines still naming /usr, /etc or /var:', len(left))
    for l in left[:10]:
        print('   ', l)


def resolve(path):
    seen = 0
    while os.path.islink(path) and seen < 20:
        t = os.readlink(path)
        path = t if t.startswith('/') else os.path.normpath(os.path.join(os.path.dirname(path), t))
        seen += 1
    return path


def wrappers():
    """usr/bin itself becomes the launchers, since TeX Live's scripts put their own folder first
    on PATH. Real programs move to galley/real; ELF ones start through the release's ld-linux,
    Perl scripts through its Perl, under their own name (galley/real/names/<name>, so programs
    that look at $0, such as repstopdf, still see it); shell, Python and texlua scripts stay."""
    bindir, real = TL + '/usr/bin', TL + '/galley/real'
    os.makedirs(real + '/names', exist_ok=True)
    done = os.path.exists(real + '/.done')
    kinds = {}
    for name in sorted(os.listdir(bindir)):
        p = os.path.join(bindir, name)
        if done and os.path.isfile(p) and not os.path.islink(p) and open(p, 'rb').read(9) == b'#!/bin/sh':
            continue  # already a launcher
        target = resolve(p)
        if not os.path.isfile(target):
            continue
        head = open(target, 'rb').read(200)
        if head.startswith(b'\x7fELF'):
            if not os.path.islink(p):
                os.rename(p, os.path.join(real, name)); target = os.path.join(real, name)
            elif os.path.dirname(target) == bindir:
                continue  # another name for a program here (pdflatex for pdftex): its launcher passes $0 on
            body = 'exec "%s" --library-path "%s" --argv0 "${0##*/}" "%s" "$@"' % (LD, LIBS, target)
            kinds['elf'] = kinds.get('elf', 0) + 1
        elif head.startswith(b'#!') and b'perl' in head.split(b'\n')[0]:
            if not os.path.islink(p):  # the script itself is here: keep it under real/scripts
                os.makedirs(real + '/scripts', exist_ok=True)
                os.rename(p, os.path.join(real, 'scripts', name)); target = os.path.join(real, 'scripts', name)
            link = os.path.join(real, 'names', name)
            if os.path.lexists(link): os.unlink(link)
            os.symlink(target, link)
            body = 'exec "%s" --library-path "%s" --argv0 perl "%s/perl" "%s" "$@"' % (LD, LIBS, real, link)
            kinds['perl'] = kinds.get('perl', 0) + 1
        else:
            continue
        write(p, '#!/bin/sh\n' + body + '\n', 0o755)
    # CLISP's driver runs its runtime from the folder it was built for (/usr/lib/clisp-*/base),
    # outside TL26 and past the loader; xindy's clisp starts that runtime here instead, with the
    # library folder the driver would pass (-B)
    import glob
    for run in glob.glob(TL + '/usr/lib/clisp-*/base/lisp.run'):
        lib = os.path.dirname(os.path.dirname(run))
        write(bindir + '/clisp', '#!/bin/sh\nexec "%s" --library-path "%s" --argv0 clisp "%s" -B "%s" "$@"\n' % (LD, LIBS, run, lib), 0o755)
        kinds['clisp'] = 1
    open(real + '/.done', 'w').close()
    print('launchers', kinds)


def debian_config():
    """Debian's install-time assembly of fmtutil.cnf, updmap.cfg and language.dat, moved into TL."""
    scripts = TL + '/galley/sbin'
    os.makedirs(scripts, exist_ok=True)
    for s in ['update-tl-stacked-conffile', 'update-language']:
        t = open(TL + '/usr/sbin/' + s).read()
        t = re.sub(r'(?<![\w/])/(var/lib|etc/texmf|usr/share)/', lambda m: TL + '/' + m.group(1) + '/', t)
        write(os.path.join(scripts, s), t, 0o755)
    for link, target in [('update-fmtutil', 'update-tl-stacked-conffile'), ('update-updmap', 'update-tl-stacked-conffile'),
                         ('update-language-dat', 'update-language'), ('update-language-def', 'update-language'), ('update-language-lua', 'update-language')]:
        p = os.path.join(scripts, link)
        if os.path.lexists(p):
            os.unlink(p)
        os.symlink(target, p)
    env = dict(os.environ, PATH=TL + '/usr/bin:' + os.environ['PATH'])
    for s in ['update-fmtutil', 'update-updmap', 'update-language-dat', 'update-language-def', 'update-language-lua']:
        r = subprocess.run([os.path.join(scripts, s)], env=env, capture_output=True, text=True)
        print(s, r.returncode, (r.stderr or '')[-300:].strip())


def postinst():
    """What Debian's maintainer scripts do beyond the TeX triggers: cm-super's fonts are shipped
    packed in one .t1c file and written out at install (its .pfb files are empty until then), and
    bibtex and gnuplot are names the alternatives system gives."""
    for d in [TL + '/usr/share/texmf/fonts/type1/public/cm-super']:
        for f in os.listdir(d):
            p = os.path.join(d, f)
            if f.endswith('.pfb') and os.path.getsize(p) == 0:
                os.unlink(p)
        for t1c in [TL + '/usr/share/cm-super/cm-super.t1c', TL + '/usr/share/cm-super-minimal/cm-super-minimal.t1c']:
            if os.path.exists(t1c) and os.path.getsize(t1c):
                r = subprocess.run([TL + '/usr/bin/t1c2pfb'], stdin=open(t1c, 'rb'), cwd=d, capture_output=True)
                print('t1c2pfb', os.path.basename(t1c), r.returncode, r.stderr[-200:])
        print('cm-super fonts', sum(1 for f in os.listdir(d) if f.endswith('.pfb') and os.path.getsize(os.path.join(d, f))))
    for name, target in [('bibtex', 'bibtex.original'), ('gnuplot', 'gnuplot-nox')]:
        p = TL + '/usr/bin/' + name
        if not os.path.lexists(p):
            os.symlink(target, p)


def fonts_conf():
    dirs = [TL + '/usr/share/texlive/texmf-dist/fonts/opentype', TL + '/usr/share/texlive/texmf-dist/fonts/truetype',
            TL + '/usr/share/texlive/texmf-dist/fonts/type1', TL + '/usr/share/texmf/fonts', TL + '/usr/share/fonts']
    write(TL + '/galley/fonts.conf', '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>' +
          ''.join('<dir>%s</dir>' % d for d in dirs) + '<cachedir>%s/home/fontconfig</cachedir></fontconfig>\n' % TL)


def run(cmd):
    r = subprocess.run([HERE + '/tl26.sh'] + cmd, capture_output=True, text=True)
    print(' '.join(cmd), '->', r.returncode, (r.stdout + r.stderr)[-400:].strip().replace('\n', ' | '))
    return r


if __name__ == '__main__':
    steps = sys.argv[1:] or ['links', 'cnf', 'wrap', 'postinst', 'debian', 'fonts', 'lsr', 'fontdb', 'maps', 'formats']
    if 'links' in steps: fix_symlinks()
    if 'cnf' in steps: texmf_cnf()
    if 'wrap' in steps: wrappers()
    if 'postinst' in steps: postinst()
    if 'debian' in steps: debian_config()
    if 'fonts' in steps: fonts_conf()
    if 'lsr' in steps: run(['mktexlsr'])
    # what the fonts' install scripts and a first LuaLaTeX run would do: fontconfig's cache (XeTeX)
    # and luaotfload's names database (LuaTeX), made once rather than in the first compared run
    if 'fontdb' in steps:
        run(['fc-cache', '-f'])
        run(['luaotfload-tool', '--update', '--force'])
    if 'maps' in steps: run(['updmap-sys', '--nohash'])
    if 'formats' in steps: run(['fmtutil-sys', '--all'])

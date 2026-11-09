"""dev/arxiv_corpus.py unpacks sources that strangers sent to arXiv, in the corpus workflow's
"sources" job, which holds the token for the Actions cache: no archive may write outside the
paper's folder, through a link, or a line of its own into arxiv-ids.txt.
Usage: python3 test/arxiv_unpack.py [path to an arxiv_corpus.py to test, default dev's]"""
import gzip, importlib.util, io, os, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('arxiv_corpus', sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'dev', 'arxiv_corpus.py'))
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)

BASE = tempfile.TemporaryDirectory(prefix='arxiv-unpack-')  # removed at exit
DOC = b'\\documentclass{article}\n\\begin{document}x\\end{document}\n'
results = []


def check(name, fn):
    try:
        fn()
        results.append((name, None))
    except Exception as e:  # noqa: BLE001  a failed check, whatever raised
        results.append((name, '%s: %s' % (type(e).__name__, e)))


def tgz(members):
    """members: (name, bytes) for a file, (name, '->', target) for a link, (name, '=>', target) for a hard link"""
    b = io.BytesIO()
    with tarfile.open(fileobj=b, mode='w') as t:
        for m in members:
            ti = tarfile.TarInfo(m[0])
            if len(m) == 3:
                ti.type = tarfile.SYMTYPE if m[1] == '->' else tarfile.LNKTYPE
                ti.linkname = m[2]
                t.addfile(ti)
            else:
                ti.size = len(m[1])
                t.addfile(ti, io.BytesIO(m[1]))
    return gzip.compress(b.getvalue())


def files_under(d):
    return sorted(os.path.relpath(os.path.join(dp, f), d) for dp, dn, fn in os.walk(d) for f in fn + [x for x in dn if os.path.islink(os.path.join(dp, x))])


def case(members, before=None):
    """unpack into root/2401.00001 next to a folder 'outside'; returns (root, dest, names)"""
    root = tempfile.mkdtemp(prefix='arxiv-unpack-', dir=BASE.name)
    os.makedirs(os.path.join(root, 'outside'))
    open(os.path.join(root, 'outside', 'keep.txt'), 'w').write('untouched')
    dest = os.path.join(root, 'papers', '2401.00001')
    if before:
        before(root, dest)
    names = ac.unpack(tgz(members) if isinstance(members, list) else members, 'application/x-eprint-tar', dest)
    return root, dest, names


def outside_untouched(root):
    assert files_under(os.path.join(root, 'outside')) == ['keep.txt'], files_under(os.path.join(root, 'outside'))
    assert open(os.path.join(root, 'outside', 'keep.txt')).read() == 'untouched'
    assert sorted(os.listdir(root)) == ['outside', 'papers'], os.listdir(root)
    assert os.listdir(os.path.join(root, 'papers')) == ['2401.00001'], os.listdir(os.path.join(root, 'papers'))


def plain():
    root, dest, names = case([('main.tex', DOC), ('fig/a.pdf', b'%PDF-1.4')])
    assert sorted(names) == ['fig/a.pdf', 'main.tex'], names
    assert ac.main_file(dest, names) == 'main.tex'
    outside_untouched(root)


def dotdot():
    root, dest, names = case([('main.tex', DOC), ('../../outside/keep.txt', b'x'), ('a/../../../outside/evil.tex', b'x'), ('../escape.tex', b'x')])
    assert names == ['main.tex'], names
    outside_untouched(root)


def absolute():
    root = tempfile.mkdtemp(prefix='arxiv-abs-', dir=BASE.name)
    target = os.path.join(root, 'abs.tex')
    r2, dest, names = case([('main.tex', DOC), (target, b'x'), ('/' + target.lstrip('/'), b'x')])
    assert not os.path.exists(target) and names == ['main.tex'], names
    outside_untouched(r2)


def symlink_then_file():
    # a link to the folder next door, then a file "inside" it
    root, dest, names = case([('lnk', '->', '../../outside'), ('lnk/evil.tex', b'x'), ('abs', '->', '/etc'), ('main.tex', DOC)])
    assert not os.path.islink(os.path.join(dest, 'lnk')) and not os.path.lexists(os.path.join(dest, 'abs'))
    assert sorted(names) == ['lnk/evil.tex', 'main.tex'], names
    outside_untouched(root)


def hardlink():
    root, dest, names = case([('hl', '=>', '/etc/passwd'), ('hl2', '=>', '../../outside/keep.txt'), ('main.tex', DOC)])
    assert names == ['main.tex'] and not os.path.lexists(os.path.join(dest, 'hl')), names
    outside_untouched(root)


def planted_link():
    # an earlier try left a link where the archive puts its main file
    def before(root, dest):
        os.makedirs(dest)
        os.symlink(os.path.join(root, 'outside', 'keep.txt'), os.path.join(dest, 'main.tex'))
        os.symlink(os.path.join(root, 'outside'), os.path.join(dest, 'sub'))
    root, dest, names = case([('main.tex', DOC), ('sub/x.tex', b'x')], before)
    assert not os.path.islink(os.path.join(dest, 'main.tex')) and not os.path.islink(os.path.join(dest, 'sub'))
    outside_untouched(root)


def single_file():
    root, dest, names = case(gzip.compress(DOC))
    assert names == ['main.tex'] and open(os.path.join(dest, 'main.tex'), 'rb').read() == DOC
    outside_untouched(root)


def line_break_in_name():
    # a main file whose name would add a line to arxiv-ids.txt (a paper of the attacker's choosing)
    evil = 'a\n2401.00002 cs.XX evil.tex'
    root, dest, names = case([(evil, DOC)])
    assert evil not in names, names
    main = ac.main_file(dest, names)
    assert main is None, repr(main)


def space_in_main():
    root, dest, names = case([('my paper.tex', DOC), ('fig 1.pdf', b'%PDF')])
    assert 'fig 1.pdf' in names  # other files keep their names
    assert ac.main_file(dest, names) is None  # a main file must be one field of arxiv-ids.txt


def ids_are_identifiers():
    d = tempfile.mkdtemp(prefix='arxiv-ids-', dir=BASE.name)
    for bad in ('..', '.', '../../home', '2401.00001/..'):
        p = os.path.join(d, 'ids.txt')
        open(p, 'w').write('# header\n%s cs.XX -\n' % bad)
        ac.get = lambda url: (_ for _ in ()).throw(AssertionError('fetched %s' % url))
        try:
            ac.fetch(p, os.path.join(d, 'root'))
        except SystemExit:
            continue
        raise AssertionError('took %r as an identifier' % bad)


for name, fn in [('a plain paper', plain), ('.. in names', dotdot), ('absolute names', absolute),
                 ('a link, then a file through it', symlink_then_file), ('hard links', hardlink),
                 ('a link an earlier try left', planted_link), ('one gzipped file', single_file),
                 ('a line break in a name', line_break_in_name), ('white space in the main file', space_in_main),
                 ('only arXiv identifiers name folders', ids_are_identifiers)]:
    check(name, fn)
for name, err in results:
    print('PASS' if err is None else 'FAIL', name, '' if err is None else '(' + err + ')')
ok = sum(1 for _, e in results if e is None)
print('%d/%d passed' % (ok, len(results)))
sys.exit(0 if ok == len(results) else 1)

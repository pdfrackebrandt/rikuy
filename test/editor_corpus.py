"""Edit every LaTeX-examples document on the typeset page and check what reaches the source.

For each document the project is opened the way a user opens a zip, then six edits are made
where the page offers a place for them: type a word in running text, delete a word, make a word
bold (Ctrl+B), extend an inline formula in the math field, type in a table cell, type in a
footnote. After each edit:
  lands     the source changed in one place only, and that place is where the edit was made
            (after the same word; inside the same table, footnote or formula)
  exact     the change is the edit itself: the typed letters, the word gone, the word wrapped in
            \\textbf{...}, the formula extended
  undo      Ctrl+Z gives back the source byte for byte
Then the edits (except the deletion) are made again without undo and the edited project is
compiled by the TeX worker: it must compile when the original compiled in the last corpus run
(dev/corpus-results.jsonl). Projects without an edit are not compiled again.

Usage: editor_corpus.py OUT.jsonl [filter]
env: RIKUY_DIST, CORPUS_REPO, N (first N docs), DOCS (file listing the docs), KINDS (e.g. math),
     NOCOMPILE (skip the compile check)
"""
import base64, io, json, os, random, re, sys, time, zipfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'dev'))
from browser import open_page  # noqa: E402
from corpus_full import project, OLD, REPO  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

MARK = 'zqx'


def alnum(s):
    return re.sub(r'[^0-9A-Za-z]', '', s)


def one_region(before, after):
    """The single changed region: (start, removed, added)."""
    i = 0
    n = min(len(before), len(after))
    while i < n and before[i] == after[i]:
        i += 1
    j = 0
    while j < n - i and before[len(before) - 1 - j] == after[len(after) - 1 - j]:
        j += 1
    return i, before[i:len(before) - j], after[i:len(after) - j]


def enclosing(src, pos, opener):
    """Is pos inside the braced argument of the nearest `opener{` before it?"""
    k = src.rfind(opener, 0, pos)
    while k >= 0:
        b = src.find('{', k + len(opener) - 1)
        depth, q = 0, b
        while q < len(src):
            c = src[q]
            if c == '\\':
                q += 2; continue
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    break
            q += 1
        if b < pos <= q:
            return True
        k = src.rfind(opener, 0, k)
    return False


def in_env(src, pos, names):
    for m in re.finditer(r'\\begin\s*\{(%s)\}' % names, src):
        e = src.find('\\end{' + m.group(1) + '}', m.end())
        if m.end() <= pos <= (e if e >= 0 else len(src)):
            return True
    return False


def in_math(src, pos):
    # $...$, \(...\), \[...\] and math environments around pos on the same paragraph
    para_a = src.rfind('\n\n', 0, pos) + 1
    para_b = src.find('\n\n', pos)
    para_b = len(src) if para_b < 0 else para_b
    seg = src[para_a:para_b]
    p = pos - para_a
    if len(re.findall(r'(?<!\\)\$\$', seg[:p])) % 2 == 1:
        return True
    dollars = [m.start() for m in re.finditer(r'(?<!\\)(?<!\$)\$(?!\$)', seg[:p])]
    if len(dollars) % 2 == 1:
        return True
    for o, c in [('\\(', '\\)'), ('\\[', '\\]')]:
        if seg.rfind(o, 0, p) > seg.rfind(c, 0, p):
            return True
    return in_env(src, pos, r'equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?|math|displaymath|flalign\*?')


PICK = r'''([kind, seed]) => {
  // a target for one kind of edit; returns where the caret or selection went, or null
  let r = seed; const rnd = (n) => { r = (r * 1103515245 + 12345) % 2147483648; return r % n; };
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  let spans = [...document.querySelectorAll('#pages span.t:not(.ph)')].filter((s) => s.firstChild && s.firstChild.nodeType === 3 && vis(s));
  const inFn = (s) => !!s.closest('.fn'), inTab = (s) => !!s.closest('table.tab'), bold = (s) => !!s.closest('.y-bf');
  const words = (s) => [...s.firstChild.data.matchAll(/[A-Za-zÄÖÜäöüß]{3,}/g)];
  if (kind === 'math') {
    // a formula a macro's own text makes is not edited where it shows (.a-ro)
    const ms = [...document.querySelectorAll('#pages .a-math:not(.a-ro)')].filter(vis);
    if (!ms.length) return null;
    const m = ms[rnd(ms.length)]; m.scrollIntoView({ block: 'center' });
    // a formula broken over two lines: click its first piece, not the middle of the box around both
    const b = [...m.getClientRects()].find((q) => q.width > 2) || m.getBoundingClientRect();
    return { x: b.left + Math.min(b.width / 2, 12), y: b.top + b.height / 2, text: m.textContent };
  }
  if (kind === 'cell') spans = spans.filter(inTab);
  else if (kind === 'fn') spans = spans.filter(inFn);
  else spans = spans.filter((s) => !inFn(s) && !inTab(s) && !s.closest('.h, .ttl, .lbl, .toc, .ref, .flt') && (kind !== 'bold' || !bold(s)));
  spans = spans.filter((s) => words(s).length >= (kind === 'type' ? 2 : 1));
  if (!spans.length) return null;
  const s = spans[rnd(spans.length)];
  const ws = words(s);
  s.scrollIntoView({ block: 'center' });
  const el = document.getElementById('pages'); el.focus();
  const sel = getSelection(); sel.removeAllRanges();
  const rg = document.createRange();
  if (kind === 'type' || kind === 'cell' || kind === 'fn') {
    const w = ws[kind === 'type' ? rnd(ws.length - 1) : rnd(ws.length)];
    const at = w.index + w[0].length;
    rg.setStart(s.firstChild, at); rg.collapse(true); sel.addRange(rg);
    return { word: w[0], text: s.firstChild.data };
  }
  const w = ws[rnd(ws.length)];
  rg.setStart(s.firstChild, w.index); rg.setEnd(s.firstChild, w.index + w[0].length); sel.addRange(rg);
  document.dispatchEvent(new Event('selectionchange'));
  return { word: w[0], text: s.firstChild.data };
}'''


def src_all(page):
    return page.evaluate('() => Object.fromEntries(window.rikuy.files)')


def changed_file(b, a):
    ch = [f for f in set(b) | set(a) if b.get(f) != a.get(f)]
    return ch


def do_edit(page, kind, seed):
    """Make one edit; returns (info, ok-to-check)."""
    info = page.evaluate(PICK, [kind, seed])
    if not info:
        return None
    page.wait_for_timeout(60)
    if kind in ('type', 'cell', 'fn'):
        page.keyboard.type(MARK)
    elif kind == 'del':
        page.keyboard.press('Backspace')
    elif kind == 'bold':
        page.keyboard.press('Control+b')
    elif kind == 'math':
        page.mouse.click(info['x'], info['y'])
        try:
            page.wait_for_selector('#pop-field, #pop-raw, #pop-lossy', timeout=4000)
        except Exception:
            info['nofield'] = True
            return info
        if page.evaluate("!document.getElementById('pop-field')"):
            # siunitx and other math-like commands open as source, by design, and so does a
            # formula the equation field cannot hold as written
            info['source'] = page.evaluate("(document.getElementById('pop-raw') || document.getElementById('pop-tex')).value")
            info['lossy'] = page.evaluate("!!document.getElementById('pop-lossy')")
            page.keyboard.press('Escape')
            return info
        page.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
        page.keyboard.type('+1')
        page.wait_for_timeout(300)
        page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    return info


def judge(kind, info, before, after):
    """Did the edit reach the source exactly, in the right place? -> (verdict, detail)"""
    files = changed_file(before, after)
    if info.get('nofield'):
        return 'fail', 'math field did not open'
    if info.get('source') is not None:
        return 'source', {'source': info['source'][:80], 'lossy': info.get('lossy')}
    if len(files) != 1:
        return 'fail', 'files changed: %s' % files
    f = files[0]
    b, a = before[f], after[f]
    i, removed, added = one_region(b, a)
    det = {'file': f, 'at': i, 'removed': removed[:80], 'added': added[:80], 'word': info.get('word')}
    if kind in ('type', 'cell', 'fn'):
        # the region found by prefix/suffix matching can slide over repeated letters: normalise
        ok = removed == '' and added.replace('{}', '') == MARK or a == b[:i] + MARK + b[i:] or (removed == '' and MARK in added and len(added) <= len(MARK) + 3)
        if not ok:
            return 'fail', det
        pre = alnum(b[max(0, i - 40):i])
        if not pre.endswith(alnum(info['word'])[-3:]):
            return 'fail', dict(det, why='not after the word')
        if kind == 'cell' and not in_env(b, i, r'tabular\*?|tabularx|tabulary|longtable|array'):
            return 'fail', dict(det, why='not in the table')
        if kind == 'fn' and not any(enclosing(b, i, o) for o in ('\\footnote{', '\\thanks{', '\\footnotetext{')):
            return 'fail', dict(det, why='not in the footnote')
        return 'ok', det
    if kind == 'del':
        if added.strip() != '' or alnum(removed) != alnum(info['word']):
            return 'fail', det
        return 'ok', det
    if kind == 'bold':
        if added == '\\textbf{' + removed + '}' or (removed == '' and added.startswith('\\textbf{')):
            return 'ok', det
        # wrapping can extend over an already open group; accept when the word sits in \textbf{...}
        if '\\textbf{' in added and alnum(info['word']) in alnum(a[i:i + len(added) + 40]):
            return 'ok', det
        return 'fail', det
    if kind == 'math':
        if '+1' not in added.replace(' ', ''):
            return 'fail', det
        if not in_math(a, i + len(added) - 1):
            return 'fail', dict(det, why='not in math')
        return 'ok', det
    return 'fail', det


def zip_project(files):
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w') as z:
        for f in files:
            z.writestr('proj/' + f['path'], base64.b64decode(f['b64']) if 'b64' in f else f['data'].encode('utf8'))
    return bio.getvalue()


def main():
    out_path = sys.argv[1]
    filt = sys.argv[2] if len(sys.argv) > 2 else ''
    n_max = int(os.environ.get('N', '100000'))
    base_ok = {json.loads(l)['doc']: json.loads(l).get('ok') for l in open(os.path.join(HERE, '..', 'dev', 'corpus-results.jsonl'))}
    out = open(out_path, 'w')
    tmp = os.environ.get('TMPDIR', '/tmp')
    kinds = os.environ.get('KINDS', 'type,del,bold,math,cell,fn').split(',')
    only = set(open(os.environ['DOCS']).read().split()) if os.environ.get('DOCS') else None
    edited = {}
    done = 0
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1300, height=1000)
        for idx, doc in enumerate(OLD):
            if filt and filt not in doc:
                continue
            if only is not None and doc not in only:
                continue
            if not os.path.exists(os.path.join(REPO, doc[3:])):
                continue
            if done >= n_max:
                break
            done += 1
            files, main = project(doc)
            zp = os.path.join(tmp, 'edit-%d.zip' % idx)
            open(zp, 'wb').write(zip_project(files))
            rec = {'doc': doc, 'kinds': {}, 'details': {}}
            errors.clear()
            try:
                # documents of one folder open the same files: wait for this open, not the last one
                page.evaluate('() => { window.__prevFiles = window.rikuy.files; }')
                page.set_input_files('#fileinput', zp)
                page.wait_for_function('(m) => window.rikuy.files !== window.__prevFiles && window.rikuy.files.has(m)', arg=main, timeout=15000)
                if page.evaluate('window.rikuy.main') != main:
                    page.evaluate('(m) => { const g = window.rikuy; g.main = m; g.srcFile = m; g.forceRender = true; g.rebuild(); }', main)
                page.wait_for_timeout(400)
            except Exception as e:
                rec['error'] = 'open: ' + str(e)[:200]
                out.write(json.dumps(rec) + '\n'); out.flush()
                continue
            finally:
                os.unlink(zp)
            rec['pages'] = page.evaluate('document.querySelectorAll(".page").length')
            seed = 1 + idx * 7919
            for k in kinds:
                before = src_all(page)
                try:
                    info = do_edit(page, k, seed)
                except Exception as e:
                    info = {'error': str(e)[:200]}
                if info is None:
                    rec['kinds'][k] = 'na'
                    continue
                after = src_all(page)
                if info.get('error'):
                    rec['kinds'][k], det = 'fail', info['error']
                else:
                    rec['kinds'][k], det = judge(k, info, before, after)
                rec['details'][k] = det
                # undo back to the original, byte for byte
                for _ in range(4):
                    if src_all(page) == before:
                        break
                    page.keyboard.press('Escape')
                    page.keyboard.press('Control+z')
                    page.wait_for_timeout(120)
                if src_all(page) != before:
                    rec['kinds'][k + '-undo'] = 'fail'
                    page.evaluate('(fs) => { const g = window.rikuy; for (const [k, v] of Object.entries(fs)) g.files.set(k, v); g.forceRender = true; g.rebuild(); }', before)
                    page.wait_for_timeout(200)
                else:
                    rec['kinds'][k + '-undo'] = 'ok'
            # the edits again, kept, for the compile check (not the deletion: it may remove a word a
            # \ref or a macro needs, which would be the user's doing)
            for k in ['type', 'bold', 'cell', 'fn', 'math']:
                if rec['kinds'].get(k) == 'ok':
                    try:
                        do_edit(page, k, seed)
                    except Exception:
                        pass
            final = src_all(page)
            rec['edited_files'] = [f for f in final if final[f] != next((x['data'] for x in files if x['path'] == f and 'data' in x), None)]
            # only the edited text is kept; the project is read again to compile (keeping every
            # project's images for 700 documents would take gigabytes)
            edited[idx] = (doc, main, {f: final[f] for f in rec['edited_files']})
            if errors:
                rec['console'] = errors[:3]
            rec['base_ok'] = base_ok.get(doc)
            out.write(json.dumps(rec) + '\n'); out.flush()
            if done % 25 == 0:
                print(done, doc, rec['kinds'], flush=True)
        browser.close()
    # compile the edited projects with the TeX worker
    if os.environ.get('NOCOMPILE'):
        return
    compile_edited(edited, out_path.replace('.jsonl', '') + '-compile.jsonl', base_ok)


def compile_edited(edited, path, base_ok):
    import serve
    port = int(os.environ.get('PORT', '8795'))
    serve.start(port)
    out = open(path, 'w')
    with sync_playwright() as pw:
        b = pw.chromium.launch(); pg = b.new_page()
        pg.goto('http://127.0.0.1:%d/tex-smoke.html' % port)
        pg.wait_for_function('window.ready', timeout=180000)
        for idx, (doc, main, final) in edited.items():
            # unedited projects are the corpus run's (dev/corpus-results.jsonl)
            if not base_ok.get(doc) or not final:
                continue
            files, _ = project(doc)
            fs = [dict(f, data=final[f['path']]) if 'data' in f and f['path'] in final else f for f in files]
            try:
                pg.evaluate("""([files, main, id]) => compile(files.map(f => f.b64 ? { path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) } : f), main, true, 'e' + id)""", [fs, main, idx])
                pg.wait_for_function('window.result || window.err', timeout=240000, polling=200)
                ok = pg.evaluate('window.result ? window.result.ok : false')
                errs = pg.evaluate("window.result ? (window.result.log || '').split('\\n').filter(l => l.startsWith('!')).slice(0, 3) : [String(window.err && window.err.error)]")
            except Exception as e:
                ok, errs = None, ['harness ' + str(e)[:200]]
                try:
                    pg.evaluate('w.terminate()')
                except Exception:
                    pass
                try:
                    pg.close()
                except Exception:
                    pass
                pg = b.new_page(); pg.goto('http://127.0.0.1:%d/tex-smoke.html' % port); pg.wait_for_function('window.ready', timeout=180000)
            out.write(json.dumps({'doc': doc, 'ok': ok, 'errs': errs}) + '\n'); out.flush()
        b.close()


if __name__ == '__main__':
    main()

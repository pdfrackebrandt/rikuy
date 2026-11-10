"""The installed app offline (src/sw.js, src/pwa.js, build/app.mjs), served as Cloudflare Pages
serves it (pages.py): the first visit installs the service worker, which keeps the page and the
scripts of the page and of the TeX worker; with the network gone (the browser offline and the
server stopped) the page reloads, renders, takes typing and keeps the project; the TeX worker's
scripts and a kept TeX pack reach a worker started as the PDF pane starts it. A new build on the
server is taken only after "Update ready" or at the next open, and the page and its worker's
scripts are always of one version, in a second tab left on the old one too. The copy built for
claude.ai (RIKUY_SHARE set) registers no service worker. Where dist/tex holds a TeX tree (CI's
TeX job), "Make available offline" keeps a typical paper's packs and a PDF compiles offline;
elsewhere that part says why it is skipped.

Needs a page built without RIKUY_SHARE (npm run build); RIKUY_DIST names another dist/."""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import ROOT, check, results, click_text, SHOTS, latin_ext_fonts
import pages
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
PORT = int(os.environ.get('OFFLINE_PORT', '8796'))
URL = f'http://127.0.0.1:{PORT}/'
PACK = re.compile(r'^[pbtwm]-[0-9a-f]{16}\.wasm$')
work = tempfile.mkdtemp(prefix='rikuy-offline-')


def sw_info(d):
    t = open(os.path.join(d, 'sw.js'), encoding='utf8').read()
    return json.loads(re.search(r'^const RIKUY = (.*);$', t, re.M).group(1))


def variant(name, mark):
    """dist/ as a later deployment would ship it: git.js and the TeX worker's engine.js changed,
    the version stamped again (build/app.mjs). TeX packs are linked, not copied."""
    d = os.path.join(work, name)
    for dp, dns, fns in os.walk(DIST):
        rel = os.path.relpath(dp, DIST)
        os.makedirs(os.path.join(d, rel), exist_ok=True)
        for f in fns:
            src, dst = os.path.join(dp, f), os.path.join(d, rel, f)
            if PACK.match(f): os.symlink(src, dst)
            else: shutil.copyfile(src, dst)
    for f in ('git.js', 'tex/engine.js'):
        with open(os.path.join(d, f), 'a', encoding='utf8') as fh: fh.write('\n// ' + mark + '\n')
    subprocess.run(['node', os.path.join(ROOT, 'build', 'app.mjs'), d], check=True, stdout=subprocess.DEVNULL)
    return d


def ready(page, timeout=30000):
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=timeout)


def version(page):
    return page.evaluate('document.querySelector(\'meta[name="rikuy-app"]\').content')


# what the page and a TeX worker started the way src/tex.js starts it get for engine.js
ENGINE_BOTH = '''async () => {
  const base = window.rikuy.texEngine().scripts;
  const page = await (await fetch(base + 'engine.js')).text();
  const src = 'fetch(self.B + "engine.js").then(r => r.text()).then(t => postMessage(t), e => postMessage("ERR " + e))';
  const w = new Worker(URL.createObjectURL(new Blob(['self.B=' + JSON.stringify(base) + ';' + src], { type: 'text/javascript' })));
  const worker = await new Promise((res) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => res('ERR ' + e.message); });
  w.terminate();
  return { base, page: page.slice(-40), worker: worker.slice(-40) };
}'''


def wait_sw(page):
    page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=30000)


def main():
    info_a = sw_info(DIST)
    va = info_a['v']
    pre = [k for k, f in info_a['files'].items() if f[2] == 'p']
    srv = pages.start(PORT, DIST)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1300, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(URL)
        ready(page)
        page.wait_for_timeout(500)
        nmath = page.evaluate("document.querySelectorAll('#pages .katex').length")
        check('the hosted page names its version and its manifest', version(page) == va and page.evaluate("!!document.querySelector('link[rel=manifest]')"), version(page))
        wait_sw(page)
        check('the service worker controls the page on the first visit (claimed)', page.evaluate('navigator.serviceWorker.controller.scriptURL').endswith('/sw.js'))
        page.wait_for_timeout(300)
        check('and that first claim is not announced as an update', not page.is_visible('#st-update'), page.inner_text('#st-update') if page.query_selector('#st-update') else None)
        kept = page.evaluate('async (v) => (await (await caches.open("rikuy-v-" + v)).keys()).map(r => r.url)', va)
        check('install kept the page and every script of the version (%d files)' % len(pre), len(kept) == len(pre) and any(u.endswith('/tex/engine.js') for u in kept) and URL in kept, (len(kept), len(pre)))
        both = page.evaluate(ENGINE_BOTH)
        check('the TeX worker\'s scripts are asked for under the page\'s version', ('/_v/' + va + '/tex/') in both['base'], both['base'])
        imm = page.evaluate('caches.open("rikuy-immutable").then(c => c.keys()).then(k => k.map(r => r.url))')
        check('install kept the Latin Extended fonts, named by their hash, apart from the version', sum('/fonts/ibm-plex-' in u for u in imm) == 5, imm)

        click_text(page, 'Click anywhere in this paragraph')
        page.keyboard.type('Offline proof. ')
        page.wait_for_function('window.rikuy.files.get("main.tex").includes("Offline proof. Click anywhere")', timeout=5000)
        page.wait_for_function('document.getElementById("st-save").textContent === "Saved in this browser"', timeout=5000)

        # a TeX pack the worker kept, named by its hash as build_tree.py names packs, for the
        # synchronous read TeX makes while offline; and bytes kept under a name that is not theirs
        good = hashlib.sha256(b'kept pack bytes').hexdigest()[:16]
        page.evaluate('''([good]) => new Promise((res, rej) => {
          const r = indexedDB.open('galley-tex', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('blobs');
          r.onsuccess = () => { const t = r.result.transaction('blobs', 'readwrite'); const o = t.objectStore('blobs');
            o.put(new TextEncoder().encode('kept pack bytes'), 'p:' + good); o.put(new TextEncoder().encode('planted bytes'), 'p:00112233aabbccdd');
            t.oncomplete = () => res(); t.onerror = rej; };
        })''', [good])

        # Word once while online: its worker fetches pandoc's parts, checks them and keeps pandoc
        word = os.path.isfile(os.path.join(DIST, 'word', 'pandoc.json'))
        if word:
            page.evaluate('window.rikuy.keepWord()')
            kept = page.evaluate('''async () => { const out = [];
              for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/pandoc-[0-9a-f]+-\\d+\\.bin$/.test(r.url)) out.push(r.url);
              return out; }''')
            check('the service worker does not keep pandoc\'s parts a second time (the Word worker keeps pandoc)', kept == [], kept)

        # ---- no network at all --------------------------------------------------------
        ctx.set_offline(True)
        srv.shutdown(); srv.server_close()
        page.reload()
        ready(page)
        page.wait_for_timeout(500)
        if word:
            with page.expect_download(timeout=180000) as d:
                page.evaluate('window.rikuy.saveDocx()')
            docx = d.value.path()
            import zipfile
            names = zipfile.ZipFile(docx).namelist()
            check('offline, Save as Word makes a .docx with pandoc from the kept copy', 'word/document.xml' in names and os.path.getsize(docx) > 5000, names[:5])
        check('offline, the page reloads from the service worker and renders math', nmath > 0 and page.evaluate("document.querySelectorAll('#pages .katex').length") == nmath, nmath)
        check('offline, the project typed before is still there', 'Offline proof. Click anywhere' in page.evaluate('window.rikuy.files.get("main.tex")'))
        click_text(page, 'Offline proof.')
        page.keyboard.type('Still typing. ')
        page.wait_for_function('window.rikuy.files.get("main.tex").includes("Still typing. Offline proof.")', timeout=5000)
        check('offline, typing patches the source', True)
        page.wait_for_function('document.getElementById("st-save").textContent === "Saved in this browser"', timeout=5000)
        check('offline, the status bar says so', page.is_visible('#st-net') and page.inner_text('#st-net') == 'Offline')
        latin_ext_fonts(page, ', offline, from the hosted page\'s font files')
        page.evaluate('window.rikuy.toggleSource(true)')
        page.wait_for_selector('.CodeMirror', timeout=10000)
        check('offline, the source pane loads CodeMirror from the kept copy', page.evaluate("document.querySelector('.CodeMirror').CodeMirror.getValue().includes('Still typing')"))
        mods = page.evaluate('''async () => { const r = {};
          try { r.git = typeof (await import(new URL('_v/' + document.querySelector('meta[name="rikuy-app"]').content + '/git.js', location.href).href)) === 'object'; } catch (e) { r.git = String(e); }
          try { r.pdfjs = !!(await import(window.rikuy.texEngine().scripts + 'pdf.min.mjs')).getDocument; } catch (e) { r.pdfjs = String(e); }
          return r; }''')
        check('offline, git.js and pdf.js load as modules from the kept copy', mods == {'git': True, 'pdfjs': True}, mods)
        both = page.evaluate(ENGINE_BOTH)
        check('offline, a TeX worker started as the PDF pane starts it gets its scripts', both['worker'] == both['page'] and 'ERR' not in both['worker'], both)
        sync_read = '''(h) => { const src = 'let r; try { const x = new XMLHttpRequest(); x.open("GET", self.B + "p-' + h + '.wasm", false); x.send(); r = x.status + " " + x.responseText; } catch (e) { r = "ERR " + e.name; } postMessage(r);';
          const w = new Worker(URL.createObjectURL(new Blob(['self.B=' + JSON.stringify(new URL('tex/', location.href).href) + ';' + src], { type: 'text/javascript' })));
          return new Promise((res) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => res('ERR ' + e.message); }); }'''
        packed = page.evaluate(sync_read, good)
        check('offline, TeX\'s synchronous read of a pack is answered from the worker\'s IndexedDB', packed == '200 kept pack bytes', packed)
        planted = page.evaluate(sync_read, '00112233aabbccdd')
        check('but not with bytes kept under a pack name that is not their hash', not planted.startswith('200'), planted)
        page.screenshot(path=os.path.join(SHOTS, 'offline.png'))

        # ---- a new deployment ---------------------------------------------------------
        bdir = variant('b', 'version B')
        vb = sw_info(bdir)['v']
        srv = pages.start(PORT, bdir)
        ctx.set_offline(False)
        page.reload()
        ready(page)
        page.wait_for_selector('#st-update', state='visible', timeout=30000)
        check('a new build installs in the background and offers "Update ready"', page.inner_text('#st-update') == 'Update ready' and vb != va)
        both = page.evaluate(ENGINE_BOTH)
        check('until then the page and its worker stay on the old version', version(page) == va and not both['page'].strip().endswith('version B') and both['worker'] == both['page'], both)
        page2 = ctx.new_page()
        page2.goto(URL)
        ready(page2)
        check('a second tab opened meanwhile gets the old version too', version(page2) == va)
        # let the second tab finish loading through the old version first: asked to take over in
        # that second, Chromium can leave the new version waiting for minutes (src/pwa.js)
        page2.wait_for_load_state('networkidle')
        page2.wait_for_timeout(3000)
        page.click('#st-update')
        try:
            page.wait_for_function('document.querySelector(\'meta[name="rikuy-app"]\') && document.querySelector(\'meta[name="rikuy-app"]\').content === "%s"' % vb, timeout=30000)
        except Exception:
            # say what state the update was left in before failing
            print('update did not land:', page.evaluate('''async () => { const r = await navigator.serviceWorker.getRegistration();
              return { meta: (document.querySelector('meta[name="rikuy-app"]') || {}).content, waiting: !!(r && r.waiting), installing: !!(r && r.installing), active: !!(r && r.active),
                       controller: !!navigator.serviceWorker.controller, upd: (document.getElementById('st-update') || {}).textContent, hidden: (document.getElementById('st-update') || {}).hidden,
                       caches: await caches.keys(),
                       workers: await Promise.all(['active', 'waiting'].map((k) => new Promise((res) => { const w = r && r[k]; if (!w) return res([k, null]);
                         const ch = new MessageChannel(); ch.port1.onmessage = (e) => res([k, e.data]); setTimeout(() => res([k, 'no answer']), 3000); w.postMessage({ rikuy: 'version' }, [ch.port2]); }))) }; }'''), 'want', vb, 'had', va, 'errors', errors)
            raise
        ready(page)
        both = page.evaluate(ENGINE_BOTH)
        check('after the click the page reloads as the new version, its worker\'s scripts too', both['page'].strip().endswith('// version B') and both['worker'] == both['page'], both)
        check('and what was typed is still there', 'Still typing. Offline proof.' in page.evaluate('window.rikuy.files.get("main.tex")'))
        page2.wait_for_selector('#st-update', state='visible', timeout=10000)
        both2 = page2.evaluate(ENGINE_BOTH)
        check('the second tab, left on the old version, still gets the old version\'s scripts', version(page2) == va and not both2['page'].strip().endswith('version B') and both2['worker'] == both2['page'] and 'ERR' not in both2['worker'], both2)
        check('and offers to reload', 'reload' in page2.inner_text('#st-update'))

        # ---- the next open --------------------------------------------------------------
        cdir = variant('c', 'version C')
        vc = sw_info(cdir)['v']
        srv.root = cdir
        page2.close()
        page.reload()
        ready(page)
        page.wait_for_selector('#st-update', state='visible', timeout=30000)
        check('with the tab left open the old version stays', version(page) == vb)
        page.close()
        time.sleep(1)
        page = ctx.new_page()
        page.goto(URL)
        ready(page)
        both = page.evaluate(ENGINE_BOTH)
        check('the next open starts the newer version, page and worker scripts alike', version(page) == vc and both['page'].strip().endswith('// version C') and both['worker'] == both['page'], (version(page), both))
        left = page.evaluate('caches.keys()')
        check('the cache of the version before the last is dropped', ('rikuy-v-' + va) not in left and ('rikuy-v-' + vc) in left, left)
        check('no page errors', not errors, errors[:3])
        ctx.close()
        srv.shutdown(); srv.server_close()

        # ---- the claude.ai artifact's build ---------------------------------------------
        art = os.path.join(work, 'art')
        env = dict(os.environ, RIKUY_SHARE='https://claude.ai/artifact/TEST', RIKUY_OUT=art)
        subprocess.run(['node', os.path.join(ROOT, 'build.mjs')], check=True, env=env, cwd=ROOT, stdout=subprocess.DEVNULL)
        js = open(os.path.join(art, 'rikuy.html'), encoding='utf8').read()
        check('the artifact build has no service worker, manifest or app code', not os.path.exists(os.path.join(art, 'sw.js')) and not os.path.exists(os.path.join(art, 'manifest.webmanifest')) and 'serviceWorker' not in js and 'rikuy-app' not in js)
        srv = pages.start(PORT, art)
        ctx = b.new_context()
        page = ctx.new_page()
        page.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(os.path.join(ROOT, 'node_modules', r.request.url.split('/npm/')[1].split('@')[0], r.request.url.split('@')[1].split('/', 1)[1]), 'rb').read()))
        page.goto(URL)
        ready(page)
        page.wait_for_timeout(1500)
        regs = page.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')
        check('the artifact build registers no service worker and shows no app marks', regs == 0 and not page.is_visible('#b-offline') and page.query_selector('#st-update') is None, regs)
        ctx.close()
        srv.shutdown(); srv.server_close()

        # ---- compile offline: needs the TeX tree ------------------------------------------
        if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
            print('SKIP compile offline: no TeX tree in %s (tex/tree.wasm); it runs where dist/tex is built (CI\'s TeX job)' % DIST)
        else:
            srv = pages.start(PORT, DIST)
            ctx = b.new_context(viewport={'width': 1500, 'height': 950})
            page = ctx.new_page()
            page.goto(URL)
            ready(page)
            wait_sw(page)
            page.click('#b-offline')
            page.wait_for_function('document.getElementById("b-offline").textContent === "Available offline"', timeout=600000)
            print('kept for offline:', page.inner_text('#toast'), page.evaluate('window.rikuy.offlineKept'))
            # the folders src/pwa.js lists are meant to cover a typical paper; the sample is one
            extra = page.evaluate('window.rikuy.offlineExtra')
            check('the sample reads no TeX pack outside the ones Make available offline plans to keep', extra == [], extra)
            ctx.set_offline(True)
            srv.shutdown(); srv.server_close()
            page.reload()
            ready(page)
            page.click('#b-pdf')
            t0 = time.time()
            st = ''
            while time.time() - t0 < 240:
                st = page.evaluate("document.getElementById('pdf-status').textContent")
                if (' page' in st and not page.evaluate('window.rikuy.compiling')) or 'could not' in st or 'stopped' in st: break
                time.sleep(0.5)
            check('offline, after Make available offline, the sample compiles with pdfLaTeX', ' page' in st and page.evaluate("document.querySelectorAll('#pdf-host canvas').length") > 0,
                  (st, page.inner_text('#pdf-host')[:600], page.evaluate("(document.getElementById('pdf-msg') || {}).title || ''")[:400]))
            ctx.close()
        b.close()


try:
    main()
finally:
    shutil.rmtree(work, ignore_errors=True)
fails = [r for r in results if not r[1]]
print('\n%d/%d passed' % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)

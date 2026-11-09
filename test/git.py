"""Git: a project becomes a repository in the browser, commits, history, compare and restore,
branches, push and pull over smart HTTP (a local git http-backend), .zip with .git out and in,
and clone. Access tokens are kept per host; the old single token moves only to a host that asks
for it and takes it, is dropped when the user replaces it, and is still offered for a clone made
before remotes were recorded; a remote that came in an opened .zip's .git/config (its url,
pushurl or http.corsProxy) never receives a token. A remote is requested as the browser parses
it, so dot segments cannot take a token through the CORS proxy to another host; the old token is
filled in only for the host its prefix names, otherwise picked with a button that names the host;
a push goes to the branch of the same name, not one an opened .git/config names."""
import os, sys, subprocess, tempfile, shutil, time, json, zipfile, io, traceback, re, http.server, threading
sys.path.insert(0, os.path.dirname(__file__))
# the test page (https://rikuy.test) talks to a git server on 127.0.0.1, which Chrome's local
# network checks would otherwise hold for a permission prompt
os.environ['CHROME_ARGS'] = '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'
from browser import open_page, check, results, src, SHOTS
import git_server
from playwright.sync_api import sync_playwright

ROOT = tempfile.mkdtemp(prefix='gitsrv-')
PORT = 8811
subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', ROOT + '/paper.git'], check=True)
subprocess.run(['git', '--git-dir', ROOT + '/paper.git', 'config', 'http.receivepack', 'true'], check=True)
git_server.start(ROOT, PORT)
URL = 'http://127.0.0.1:%d/paper.git' % PORT
# the same repositories, private: Basic credentials x-access-token and the old single token
git_server.start(ROOT, 8812, auth='x-access-token:DUMMY-OLD-TOKEN')
PRIVATE = 'http://127.0.0.1:8812/paper.git'
PREFS = "JSON.parse(localStorage.getItem('galley.prefs.v1'))"
GITSTAT = "document.getElementById('nt-gcount').textContent"

# a stranger's git server: every request is logged with its Authorization header and refused
# with 401, which is when isomorphic-git asks onAuth for credentials
FOREIGN = 'http://127.0.0.1:8813'
seen = []


class Foreign(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in git_server.CORS: self.send_header(k, v)
        self.end_headers()

    def answer(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n: self.rfile.read(n)
        seen.append((self.command, self.path, self.headers.get('Authorization')))
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="git"')
        for k, v in git_server.CORS: self.send_header(k, v)
        self.send_header('Content-Length', '0')
        self.end_headers()
    do_GET = do_POST = answer


threading.Thread(target=git_server.S(('127.0.0.1', 8813), Foreign).serve_forever, daemon=True).start()

# a CORS proxy that logs the path it is asked for (proxy/<host>/<path>: the host it would forward
# to comes first) and the Authorization it would forward, then refuses with 401
PROXY = 'http://127.0.0.1:8814'
proxied = []


class Proxy(Foreign):
    def answer(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n: self.rfile.read(n)
        proxied.append((self.path, self.headers.get('Authorization')))
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="git"')
        for k, v in git_server.CORS: self.send_header(k, v)
        self.send_header('Content-Length', '0')
        self.end_headers()
    do_GET = do_POST = answer


threading.Thread(target=git_server.S(('127.0.0.1', 8814), Proxy).serve_forever, daemon=True).start()


def foreign_zip(zf, names, path, cfg):
    """The repository saved above, as a stranger could send it: their own .git/config."""
    with zipfile.ZipFile(path, 'w') as z:
        for n in names: z.writestr('paper/' + n, cfg if n == '.git/config' else zf.read(n))
    return path


def open_remote(page):
    """Open the Remote part of the Git panel, after the panel has been drawn again."""
    refresh(page)
    page.evaluate("document.querySelector('.git-remote').open = true")
    page.wait_for_timeout(200)


def edit(page, find, repl):
    page.evaluate("""([a, b]) => { const g = window.rikuy; const f = 'main.tex'; const s = g.files.get(f);
      const at = s.indexOf(a); if (at < 0) throw new Error('not found: ' + a);
      g.closeGroup(); g.commit([{ f, s: at, e: at + a.length, t: b }], null, 'type'); g.closeGroup(); }""", [find, repl])
    page.wait_for_timeout(300)


def refresh(page):
    page.evaluate("window.rikuy.gitRefresh()")
    page.wait_for_timeout(700)


def commits(page):
    return page.evaluate("[...document.querySelectorAll('#nav-body .git-c .ver-n')].map(e => e.textContent)")


try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1440, height=900)
        # a user of an earlier version: one token for every remote
        page.evaluate("window.rikuy.prefs.gitToken = 'DUMMY-OLD-TOKEN'")
        base = src(page)
        page.click('#b-nav'); page.wait_for_timeout(200)
        page.click('#nt-git'); page.wait_for_timeout(1500)
        check('git tab offers to start a repository', page.locator('#nav-body button:has-text("Start a repository")').count() == 1)
        page.click('#nav-body button:has-text("Start a repository")')
        page.wait_for_timeout(1500)
        check('after git init the whole project shows as new files', page.evaluate("document.querySelectorAll('#nav-body .git-file.added').length") >= 2,
              page.evaluate("document.getElementById('nav-body').innerText.slice(0, 300)"))
        check('author fields show before the first commit', page.evaluate("!document.querySelector('.git-who').hidden"))
        page.fill('.git-who input[type=text]', 'Ada Lovelace')
        page.fill('.git-who input[type=email]', 'ada@example.org')
        page.fill('.git-commit input', 'First draft')
        page.click('.git-commit button[type=submit]')
        page.wait_for_timeout(1500)
        check('first commit is in the history', commits(page) == ['First draft'], commits(page))
        check('clean after committing', 'Clean' in page.evaluate("document.querySelector('.git-st').textContent"))

        edit(page, 'round trip', 'return trip')
        refresh(page)
        check('an edit shows as a modified file', page.evaluate("[...document.querySelectorAll('.git-file.modified .git-path')].map(e => e.textContent)") == ['main.tex'])
        check('the tab counts uncommitted files', page.evaluate(GITSTAT) == '1', page.evaluate(GITSTAT))
        page.fill('.git-commit input', 'Return trip')
        page.click('.git-commit button[type=submit]')
        page.wait_for_timeout(1500)
        check('second commit on top', commits(page) == ['Return trip', 'First draft'], commits(page))

        # compare with the first commit: the Changes tab shows the one edit
        page.locator('.git-c').nth(1).locator('button:has-text("Compare")').click()
        page.wait_for_timeout(900)
        check('compare opens Changes against that commit', page.evaluate("document.querySelector('#nt-changes').classList.contains('on')") and
              'Commit' in page.evaluate("document.querySelector('.chg-base').textContent"), page.evaluate("document.querySelector('.chg-base') && document.querySelector('.chg-base').textContent"))
        ins = page.evaluate("[...document.querySelectorAll('#nav-body .chg ins')].map(e => e.textContent)")
        check('the diff is the commit difference', any('return' in x for x in ins), ins)

        # restore the first commit's text (an undoable edit)
        page.click('#nt-git'); page.wait_for_timeout(900)
        page.locator('.git-c').nth(1).locator('button:has-text("Restore")').click()
        page.wait_for_timeout(700)
        check('restore puts the old text back', src(page) == base)
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(400)
        check('undo brings the newer text back', 'return trip' in src(page))

        # branches
        page.select_option('.git-branch', '\u0000new')
        page.wait_for_timeout(200)
        page.fill('.git-newbranch input', 'draft')
        page.click('.git-newbranch button[type=submit]')
        page.wait_for_timeout(1200)
        check('a new branch is current', page.evaluate("document.querySelector('.git-branch').value") == 'draft')
        edit(page, 'return trip', 'branch trip')
        refresh(page)
        page.fill('.git-commit input', 'On draft')
        page.click('.git-commit button[type=submit]')
        page.wait_for_timeout(1500)
        page.select_option('.git-branch', 'main')
        page.wait_for_timeout(2500)
        check('switching to main loads its files', 'return trip' in src(page) and 'branch trip' not in src(page), src(page)[:200])
        refresh(page)
        check('main history does not have the draft commit', commits(page) == ['Return trip', 'First draft'], commits(page))

        # push to the local server
        page.click('.git-remote summary'); page.wait_for_timeout(200)
        page.fill('.git-remote input[type=url] >> nth=0', URL)
        page.fill('.git-remote input[aria-label="CORS proxy"]', '')
        page.click('.git-remote button:has-text("Push")')
        page.wait_for_timeout(3000)
        print('  toast:', page.evaluate("[...document.querySelectorAll('.toast, #toast')].map(e => e.textContent).join(' | ')"))
        log = subprocess.run(['git', '--git-dir', ROOT + '/paper.git', 'log', '--format=%s|%an', 'main'], capture_output=True, text=True).stdout.split('\n')
        check('push reaches the server with both commits', log[:2] == ['Return trip|Ada Lovelace', 'First draft|Ada Lovelace'], log)
        kept = page.evaluate(PREFS)
        check('a push to a host that never asked for the old token leaves it where it was', kept.get('gitToken') == 'DUMMY-OLD-TOKEN' and not kept.get('gitTokens'),
              (kept.get('gitTokens'), kept.get('gitToken')))

        # a commit made elsewhere, then pull
        work = tempfile.mkdtemp(prefix='gitwork-')
        subprocess.run(['git', 'clone', '-q', ROOT + '/paper.git', work], check=True)
        t = open(work + '/main.tex', encoding='utf8').read().replace('return trip', 'remote trip')
        open(work + '/main.tex', 'w', encoding='utf8').write(t)
        subprocess.run(['git', '-C', work, '-c', 'user.name=Bob', '-c', 'user.email=bob@example.org', 'commit', '-qam', 'From the desktop'], check=True)
        subprocess.run(['git', '-C', work, 'push', '-q', 'origin', 'main'], check=True)
        page.fill('.git-remote input[aria-label="Access token"]', 'DUMMY-NEW-TOKEN')
        page.click('.git-remote button:has-text("Pull")')
        page.wait_for_timeout(4000)
        check('pull brings the remote commit into the editor', 'remote trip' in src(page), src(page)[:200])
        kept = page.evaluate(PREFS)
        # the old token names no host, so it was never filled in here: it stays, offered only on a click
        check('a token typed for a host is kept for it, and the old one is left for a click', kept.get('gitTokens') == {'http://127.0.0.1:%d' % PORT: 'DUMMY-NEW-TOKEN'} and kept.get('gitToken') == 'DUMMY-OLD-TOKEN',
              (kept.get('gitTokens'), kept.get('gitToken')))
        refresh(page)
        check('pulled commit is in the history', commits(page)[:1] == ['From the desktop'], commits(page))
        page.screenshot(path=SHOTS + '/git-panel.png')

        # .zip out with .git, then back in on a clean browser
        with page.expect_download(timeout=30000) as dl:
            page.click('#b-save')
        zbytes = open(dl.value.path(), 'rb').read()
        zf = zipfile.ZipFile(io.BytesIO(zbytes))
        names = zf.namelist()
        check('the .zip holds .git and the files', '.git/HEAD' in names and 'main.tex' in names, names[:10])
        tmpd = tempfile.mkdtemp(prefix='gitzip-')
        zf.extractall(tmpd)
        out = subprocess.run(['git', '-C', tmpd, 'log', '--format=%s'], capture_output=True, text=True)
        check('desktop git reads the exported repository', out.stdout.split('\n')[:3] == ['From the desktop', 'Return trip', 'First draft'], (out.stdout, out.stderr))
        st = subprocess.run(['git', '-C', tmpd, 'status', '--porcelain'], capture_output=True, text=True).stdout
        check('the exported working tree matches HEAD', st.strip() == '', st)
        zpath = os.path.join(tmpd, '..', 'paper-with-git.zip')
        with zipfile.ZipFile(zpath, 'w') as z2:
            for n in names: z2.writestr('paper/' + n, zf.read(n))
        browser.close()

        browser, page, errors2 = open_page(p, width=1440, height=900)
        page.evaluate("indexedDB.deleteDatabase('galley-git')")
        page.set_input_files('#fileinput', zpath)
        page.wait_for_timeout(3000)
        page.click('#b-nav'); page.wait_for_timeout(200)
        page.click('#nt-git'); page.wait_for_timeout(2000)
        check('opening a .zip with .git brings its history', commits(page)[:3] == ['From the desktop', 'Return trip', 'First draft'], commits(page))

        # A .zip's .git/config is whoever made it. Its remote gets no token filled in, even one
        # kept for its host; a remote on another host never receives one; and its pushurl and
        # http.corsProxy cannot send a push elsewhere than the address the panel shows.
        page.evaluate("""(port) => { const g = window.rikuy; g.prefs.gitProxy = ''; g.prefs.gitToken = 'DUMMY-OLD-TOKEN';
          g.prefs.gitTokens = { ['http://127.0.0.1:' + port]: 'DUMMY-HOST-TOKEN' }; }""", PORT)
        TOKEN = '.git-remote input[aria-label="Access token"]'
        open_remote(page)
        check('a remote that came in an opened .zip gets no token filled in, though its host has one', page.input_value(TOKEN) == '' and page.locator('.git-foreign').count() == 1,
              (page.input_value(TOKEN), page.locator('.git-foreign').count()))
        cfg = zf.read('.git/config').decode()
        page.set_input_files('#fileinput', foreign_zip(zf, names, os.path.join(tmpd, '..', 'stranger.zip'), cfg.replace(URL, FOREIGN + '/paper.git')))
        page.wait_for_timeout(3000)
        open_remote(page)
        check('a stranger\'s remote shows with no token, though an old one is kept', page.input_value('.git-remote input[aria-label="Remote URL"]') == FOREIGN + '/paper.git' and page.input_value(TOKEN) == '',
              (page.input_value('.git-remote input[aria-label="Remote URL"]'), page.input_value(TOKEN)))
        page.click('.git-remote button:has-text("Push")')
        page.wait_for_timeout(2500)
        check('pushing to it sends no token', seen and not [x for x in seen if x[2]], seen[:4])
        del seen[:]
        twisted = re.sub(r'(\[remote "origin"\]\n)', lambda m: m.group(1) + '\tpushurl = ' + FOREIGN + '/push.git\n', cfg).rstrip('\n') + '\n[http]\n\tcorsProxy = ' + FOREIGN + '/proxy\n'
        # and the branch a push goes to: isomorphic-git takes branch.<name>.merge from the config
        twisted = re.sub(r'\[branch "main"\]\n(\t[^\n]*\n)*', '', twisted) + '[branch "main"]\n\tremote = origin\n\tmerge = refs/heads/strangers-pick\n'
        assert 'pushurl = ' in twisted, cfg
        page.set_input_files('#fileinput', foreign_zip(zf, names, os.path.join(tmpd, '..', 'twisted.zip'), twisted))
        page.wait_for_timeout(3000)
        open_remote(page)
        page.fill(TOKEN, 'DUMMY-HOST-TOKEN')
        page.click('.git-remote button:has-text("Push")')
        page.wait_for_timeout(2500)
        toast = page.evaluate("document.getElementById('toast').innerText")
        check('a pushurl and http.corsProxy in its .git/config do not take the push elsewhere', not seen and 'Pushed' in toast, (seen[:4], toast))
        heads = subprocess.run(['git', '--git-dir', ROOT + '/paper.git', 'for-each-ref', '--format=%(refname)', 'refs/heads'], capture_output=True, text=True).stdout.split()
        check('nor to the branch its branch.main.merge names: main is pushed to main', heads == ['refs/heads/main'], heads)
        open_remote(page)
        check('a remote the user gave a token for is theirs from then on', page.input_value(TOKEN) == 'DUMMY-HOST-TOKEN' and page.locator('.git-foreign').count() == 0,
              (page.input_value(TOKEN), page.locator('.git-foreign').count()))

        # An address whose dot segments climb out of its host. Matched against 127.0.0.1:8812, whose
        # token is kept, it reached 127.0.0.1:8813 with that token: through a CORS proxy the
        # browser resolves the segments in proxy/<host>/<path>, and the proxy forwards to the host
        # that comes first. Now the address is requested as parsed, so the host stays 8812.
        del proxied[:]
        climb = 'http://127.0.0.1:8812/a/%2e%2e/%2e%2e/127.0.0.1:8813/paper.git'
        page.evaluate("""async ([url, proxy]) => { const g = window.rikuy; const G = await g.loadGit();
          try { await G.clone(G.dirFor('climb'), url, { corsProxy: proxy, token: 'DUMMY-HOST-TOKEN', remote: url }); } catch (e) { } }""", [climb, PROXY])
        hosts = sorted(set(x[0].split('/')[1] for x in proxied))
        check('dot segments in a remote cannot send its token through the proxy to another host', proxied and hosts == ['127.0.0.1:8812'] and any(x[1] for x in proxied), (hosts, proxied[:3]))
        # clone from the server into a new project
        page.evaluate("indexedDB.deleteDatabase('galley-git')")
        # the clone form: the old token, which names no host, is not filled in for the address
        # typed but offered on a button that says where it would go
        page.evaluate("() => { const g = window.rikuy; g.prefs.gitTokens = {}; g.prefs.gitToken = 'DUMMY-OLD-TOKEN'; }")
        # (the panel shows the form only for a project that is not a repository: drawn here alone)
        page.evaluate("""async () => { const g = window.rikuy; const f = g.gitCloneForm(await g.loadGit()); f.id = 'clone-form'; f.open = true;
          f.style.cssText = 'position:fixed;top:60px;left:60px;z-index:99;background:#fff;width:420px'; document.body.append(f); }""")
        form = page.locator('#clone-form')
        form.locator('input[aria-label^="Repository URL"]').fill(FOREIGN + '/paper.git')
        page.wait_for_timeout(200)
        btn = form.locator('.git-legacy')
        check('the clone form does not fill the old token in for an address typed', form.locator('input[aria-label="Access token"]').input_value() == '', form.locator('input[aria-label="Access token"]').input_value())
        check('but offers it on a button that names the host', btn.is_visible() and '127.0.0.1:8813' in btn.inner_text(), btn.inner_text() if btn.count() else None)
        form.locator('input[aria-label^="Repository URL"]').fill(FOREIGN + '/paper.git?x')
        page.wait_for_timeout(200)
        check('and not for an address Rikuy refuses', not btn.is_visible())
        page.evaluate("document.getElementById('clone-form').remove()")

        files = page.evaluate("""async (url) => { const g = window.rikuy; const G = await g.loadGit();
          const files = await G.clone(G.dirFor('paper'), url, { corsProxy: '' }); await g.openRepoFiles('paper', files);
          return [...files.keys()]; }""", URL)
        page.wait_for_timeout(1500)
        check('clone loads the repository files', 'main.tex' in files and 'remote trip' in src(page), files)
        info = page.evaluate('async () => { const v = await window.rikuy.linkInfo(); return v && [v.origin, v.allowed]; }')
        check('a cloned repository compiles with restricted shell escape until allowed', info == ['git', False], info)

        # A clone made before remotes were recorded (as this one, cloned without the form) of a
        # private repository, by a user of the old single token, which names no host: the token is
        # offered on a button that names the host, with no word of an opened project, and moves to
        # the host once the host takes it.
        page.evaluate("indexedDB.deleteDatabase('galley-git')")
        page.evaluate("""async (url) => { const g = window.rikuy; g.prefs.gitTokens = {}; g.prefs.gitToken = 'DUMMY-OLD-TOKEN'; g.prefs.gitProxy = '';
          const G = await g.loadGit(); const files = await G.clone(G.dirFor('paper'), url, { corsProxy: '', token: 'DUMMY-OLD-TOKEN', remote: url });
          await g.openRepoFiles('paper', files); }""", PRIVATE)
        page.wait_for_timeout(1500)
        open_remote(page)
        note = page.evaluate("[...document.querySelectorAll('.git-remote .git-note')].map(e => e.textContent).join(' ')")
        legacy = page.locator('details.git-remote', has_text='Push').locator('.git-legacy')
        check('a clone from before the record is offered the token it used, on a button naming the host, with no word of an opened project',
              page.input_value(TOKEN) == '' and legacy.is_visible() and '127.0.0.1:8812' in legacy.inner_text() and 'project you opened' not in note,
              (page.input_value(TOKEN), legacy.count() and legacy.inner_text(), note[:200]))
        legacy.click()
        page.wait_for_timeout(200)
        check('the button fills it in and goes away', page.input_value(TOKEN) == 'DUMMY-OLD-TOKEN' and not legacy.is_visible(), page.input_value(TOKEN))
        page.click('.git-remote button:has-text("Pull")')
        page.wait_for_timeout(3000)
        kept = page.evaluate(PREFS)
        check('the private host takes it, and the old token now belongs to that host only', kept.get('gitTokens') == {'http://127.0.0.1:8812': 'DUMMY-OLD-TOKEN'} and 'gitToken' not in kept,
              (kept.get('gitTokens'), kept.get('gitToken'), page.evaluate("document.getElementById('toast').innerText")))
        open_remote(page)
        check('and the remote is the user\'s from then on', page.input_value(TOKEN) == 'DUMMY-OLD-TOKEN' and page.locator('.git-unknown, .git-foreign').count() == 0,
              (page.input_value(TOKEN), page.locator('.git-unknown, .git-foreign').count()))
        errs = [e for e in errors + errors2 if 'favicon' not in e]
        check('no page errors', not errs, errs[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)

bad = [r for r in results if not r[1]]
print('%d/%d passed' % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)

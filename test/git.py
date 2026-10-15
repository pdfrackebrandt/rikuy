"""Git: a project becomes a repository in the browser, commits, history, compare and restore,
branches, push and pull over smart HTTP (a local git http-backend), .zip with .git out and in,
and clone."""
import os, sys, subprocess, tempfile, shutil, time, json, zipfile, io
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
# the test page (https://galley.test) talks to a git server on 127.0.0.1, which Chrome's local
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
GITSTAT = "document.getElementById('nt-gcount').textContent"


def edit(page, find, repl):
    page.evaluate("""([a, b]) => { const g = window.galley; const f = 'main.tex'; const s = g.files.get(f);
      const at = s.indexOf(a); if (at < 0) throw new Error('not found: ' + a);
      g.closeGroup(); g.commit([{ f, s: at, e: at + a.length, t: b }], null, 'type'); g.closeGroup(); }""", [find, repl])
    page.wait_for_timeout(300)


def refresh(page):
    page.evaluate("window.galley.gitRefresh()")
    page.wait_for_timeout(700)


def commits(page):
    return page.evaluate("[...document.querySelectorAll('#nav-body .git-c .ver-n')].map(e => e.textContent)")


with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1440, height=900)
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
    page.evaluate('window.galley.undo()'); page.wait_for_timeout(400)
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

    # a commit made elsewhere, then pull
    work = tempfile.mkdtemp(prefix='gitwork-')
    subprocess.run(['git', 'clone', '-q', ROOT + '/paper.git', work], check=True)
    t = open(work + '/main.tex', encoding='utf8').read().replace('return trip', 'remote trip')
    open(work + '/main.tex', 'w', encoding='utf8').write(t)
    subprocess.run(['git', '-C', work, '-c', 'user.name=Bob', '-c', 'user.email=bob@example.org', 'commit', '-qam', 'From the desktop'], check=True)
    subprocess.run(['git', '-C', work, 'push', '-q', 'origin', 'main'], check=True)
    page.click('.git-remote button:has-text("Pull")')
    page.wait_for_timeout(4000)
    check('pull brings the remote commit into the editor', 'remote trip' in src(page), src(page)[:200])
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

    # clone from the server into a new project
    page.evaluate("indexedDB.deleteDatabase('galley-git')")
    files = page.evaluate("""async (url) => { const g = window.galley; const G = await g.loadGit();
      const files = await G.clone(G.dirFor('paper'), url, { corsProxy: '' }); await g.openRepoFiles('paper', files);
      return [...files.keys()]; }""", URL)
    page.wait_for_timeout(1500)
    check('clone loads the repository files', 'main.tex' in files and 'remote trip' in src(page), files)
    errs = [e for e in errors + errors2 if 'favicon' not in e]
    check('no page errors', not errs, errs[:5])
    browser.close()

print('%d/%d passed' % (sum(1 for r in results if r[1]), len(results)))

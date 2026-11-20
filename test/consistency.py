"""One look for every control: the ribbon and the title bar measured as a person sees them, on
every tab (the contextual ones with their object), at 1920, 1366, 1280, 1024 and 900 px with a
mouse and 1180 px with touch, in light, dark and forced colours.

The rules (each violation is printed with its tab, width, scheme, element and numbers):
  box       one height per kind of control: large (an icon over its name), small (an icon and its
            name), icon alone, a split button's parts, a field, a gallery tile; one width for icons alone
  icon      one icon size per kind; one colour per state: an enabled control never looks disabled
            (its opacity whole, its colour the ink's or, pressed, the pressed colour), a disabled one
            the same grey everywhere
  label     one size and weight for every button's name; one for every group's name
  group     every group named, its name centred under it, every name on one baseline; a folded
            group's button shows the group's name
  outside   no control outside a group
  sep       one separator height
  gap       the spaces between groups and separators from one scale (0, 1, 2, 4, 6, 8, 12, 16, 24)
  clip      no name cut short: a label wider than its box (scrollWidth over clientWidth) or out of it
  overlap   no two controls' boxes overlap
  focus     the focus ring only for the keyboard: none after a press with the mouse
  target    every control at least 24 by 24 px with a mouse (WCAG 2.2, 2.5.8), 44 by 44 with touch
  insert    with no caret on the page Insert stays enabled, as Word's, and inserts at the last place

python3 consistency.py [rule ...] [--widths 1920,1366] [--tabs home,insert] [--schemes light]: the
rules, widths, tabs and schemes named only. RIKUY_DIST names another dist/."""
import os, sys, json, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, load_doc, click_text
from playwright.sync_api import sync_playwright

WRAP = lambda body, pre='': '\\documentclass{article}\n\\usepackage{graphicx}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('\\section{Opening}\nA paragraph of the text.\n\n\\begin{center}\n\\includegraphics[width=0.4\\linewidth]{figure.png}\n\\end{center}\n\n'
           '\\begin{tabular}{ll}\ncell & other \\\\\nmore & last \\\\\n\\end{tabular}\n\nThe last paragraph.')
MOUSE = [1920, 1366, 1280, 1024, 900]
TOUCH = [1180]
SCALE = [0, 1, 2, 4, 6, 8, 12, 16, 24]

# One tab as it shows now: every control and label with what the rules need, measured in the page
MEASURE = r"""(arg) => {
  const [tab, scope] = arg;
  const vis = (e) => e && e.offsetParent !== null && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const name = (e) => e.getAttribute('aria-label') || e.id || (e.textContent || '').trim().slice(0, 24);
  const op = (e) => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return Math.round(o * 100) / 100; };
  const root = scope === 'bar' ? document.getElementById('bar') : document.getElementById('rp-' + tab);
  const out = { controls: [], labels: [], glabs: [], groups: [], seps: [], gaps: [], clip: [], box: R(scope === 'bar' ? root : document.getElementById('ribbon')) };
  if (!root) return out;
  const dl = scope === 'bar' ? null : document.querySelector('.rb-dl');
  const all = [...root.querySelectorAll('button, input, select, [role=combobox]')].concat(dl ? [...dl.querySelectorAll('button')] : []).filter((e, i, a) => a.indexOf(e) === i);
  for (const e of all) {
    if (!vis(e) || e.closest('[role=menu], .pop, .srch-list')) continue;
    if (e.matches('input') && e.closest('.srch')) { /* the search box is a field of the bar */ }
    const b = R(e); if (b.w < 1 || b.h < 1) continue;
    // (a glyph drawn for an icon, Bold's B or Symbol's Ω, is no name; a caret is no icon)
    const label = [...e.querySelectorAll(':scope > span:not(.sr):not(.fg):not(.sym-g):not(.fbx-v), :scope > .rb-bl')].find((x) => vis(x) && x.textContent.trim());
    const svg = [...e.querySelectorAll(':scope > svg:not(.rb-car):not(.rb-larrow), :scope > .rb-gico')].find(vis);
    const caret = [...e.querySelectorAll('svg.rb-car, :scope.rb-x > svg, :scope > svg.rb-larrow')].find(vis);
    const split = e.closest('.rb-split'), field = e.matches('input, select') || e.closest('.fbx, .pf, .pf-field, .nf');
    const big = b.h > 40 || (split && split.getBoundingClientRect().height > 40);
    const kind = e.classList.contains('rb-launch') || (e.classList.contains('rb-launch-c') && b.h < 20) ? 'launcher'
      : e.classList.contains('rb-tile') || e.classList.contains('rb-sb') || e.closest('.rb-gal') ? 'gallery'
      : field ? 'field' : e.dataset.size === 'T' ? 'tile' : e.classList.contains('rb-gbtn') ? (big ? 'large' : 'folded')
      : e.classList.contains('rb-x') ? (big ? 'split-arrow-large' : 'split-arrow')
      : big ? (split ? 'large-split' : 'large')
      : label ? (split ? 'small-split' : 'small') : (split ? 'icon-split' : 'icon');
    const cs = getComputedStyle(e);
    const st = e.disabled || e.getAttribute('aria-disabled') === 'true' ? 'disabled' : e.getAttribute('aria-pressed') === 'true' ? 'pressed' : 'enabled';
    const g = e.closest('.rb-grp, .rb-dl, .qat, .title-end, .bar-left, .title-mid, .tools, .zoom');
    out.controls.push({ n: name(e), id: e.id, kind, st, ...b, color: cs.color, op: op(e), svg: svg && !e.classList.contains('rb-x') ? [Math.round(svg.getBoundingClientRect().width * 10) / 10, Math.round(svg.getBoundingClientRect().height * 10) / 10, getComputedStyle(svg).stroke] : null,
      caret: caret ? Math.round(caret.getBoundingClientRect().width * 10) / 10 : null,
      group: g ? (g.dataset.group || g.className.split(' ')[0]) : null, folded: !!e.closest('.rb-grp.folded'), gbtn: e.classList.contains('rb-gbtn'),
      // (what the layout asks of it: a large one must be drawn large where its group has room)
      declared: (split || e).dataset.size || (e.dataset.cmd === 'paste' ? 'L' : null), shrunk: !!e.closest('.rb-grp.sm, .rb-grp.nm, .rb.rb-fold'),
      outline: [cs.outlineStyle, cs.outlineWidth].join(' '), focused: document.activeElement === e });
    if (label && !['gallery', 'icon', 'icon-split', 'tile', 'split-arrow', 'launcher', 'field'].includes(kind)) { const ls = getComputedStyle(label); out.labels.push({ n: name(e), size: ls.fontSize, weight: ls.fontWeight }); }
  }
  if (scope !== 'bar') {
    const groups = [...root.querySelectorAll('.rb-grp')].filter(vis).concat(dl && vis(dl) ? [dl] : []);
    for (const g of groups) {
      const gb = R(g), folded = g.classList.contains('folded');
      const lab = folded ? null : [...g.querySelectorAll(':scope > .rb-glab, :scope > .rb-lab, :scope .rb-cap')].find(vis);
      const gbtn = folded ? g.querySelector(':scope > .rb-gbtn') : null;
      const shown = gbtn ? [...gbtn.querySelectorAll('span')].filter(vis).map((s) => s.textContent).join(' ').trim() : '';
      const ls = lab ? getComputedStyle(lab) : null, lr = lab ? R(lab) : null;
      // (the name's text, not its box: a box as wide as the group says nothing of where the words are)
      let tx = null;
      if (lab) { const rg = document.createRange(); rg.selectNodeContents(lab); const t = rg.getBoundingClientRect(); tx = { l: t.left, r: t.right, b: t.bottom }; }
      out.groups.push({ g: g.dataset.group || 'download', folded, name: g.getAttribute('aria-label') || (g.querySelector('.rb-gbtn') || {}).ariaLabel || '', ...gb,
        lab: lab ? { text: lab.textContent.trim(), size: ls.fontSize, weight: ls.fontWeight, ...lr, tx } : null, shown });
      if (lab && (lab.scrollWidth > lab.clientWidth + 1 || (tx && (tx.l < gb.l - 1 || tx.r > gb.r + 1)))) out.clip.push({ n: 'group ' + (g.dataset.group || 'download'), sw: lab.scrollWidth, cw: lab.clientWidth });
    }
    const tb = root.querySelector('.rb-tb');
    const seq = [...tb.children, ...(dl && tb.contains(dl) ? [] : [])].filter((e) => vis(e) && !e.classList.contains('grow'));
    for (const s of seq.filter((e) => e.classList.contains('sep'))) out.seps.push({ ...R(s) });
    if (dl && vis(dl)) { const a = getComputedStyle(dl, '::after'); if (a.content !== 'none' && a.display !== 'none') { const d = R(dl); out.seps.push({ t: d.t + parseFloat(a.top), h: parseFloat(a.height), dl: true }); } }
    for (let i = 1; i < seq.length; i++) { if (seq[i - 1].nextElementSibling && seq[i - 1].nextElementSibling.classList.contains('grow')) continue; out.gaps.push({ a: seq[i - 1].className.split(' ')[0] + ':' + (seq[i - 1].dataset.group || ''), b: seq[i].className.split(' ')[0] + ':' + (seq[i].dataset.group || ''), gap: Math.round((R(seq[i]).l - R(seq[i - 1]).r) * 10) / 10 }); }
  }
  // names cut short in buttons (and in the bar, the document's name and the tabs')
  const texts = [...root.querySelectorAll('.btn span:not(.sr), .rb-ln, .rb-bl')].concat(scope === 'bar' ? [...document.querySelectorAll('#docname, .rb-tab')] : []);
  for (const s of texts) {
    if (!vis(s)) continue;
    const box = (s.closest('button') || s).getBoundingClientRect(), r = s.getBoundingClientRect();
    if (s.scrollWidth > s.clientWidth + 1 && s.clientWidth > 0) out.clip.push({ n: s.textContent.trim().slice(0, 30), sw: s.scrollWidth, cw: s.clientWidth });
    else if (s !== s.closest('button') && (r.right > box.right + 1 || r.left < box.left - 1)) out.clip.push({ n: s.textContent.trim().slice(0, 30), out: [Math.round(r.left - box.left), Math.round(box.right - r.right)] });
  }
  return out; }"""


def rounded(v, q=0.5):
    return round(v / q) * q


class Sweep:
    def __init__(self):
        self.v = []  # (rule, where, element, detail)

    def bad(self, rule, where, el, detail):
        self.v.append((rule, where, el, detail))

    def report(self, rules):
        by = collections.Counter(r for r, *_ in self.v)
        for r, where, el, d in self.v:
            print('  %-8s %-34s %-34s %s' % (r, where, str(el)[:34], str(d)[:220]))
        for r in rules:
            check('%s: %d violations' % (r, by[r]), by[r] == 0)


def tab_states(page, tabs):
    """Each tab shown as a person would reach it: the contextual ones with their object."""
    for t in tabs:
        page.evaluate('() => { if (rikuy.hf) rikuy.pageHFClose(); if (document.querySelector(".pop-math")) rikuy.closePop(true); rikuy.disarm && rikuy.disarm(); }')
        page.wait_for_timeout(80)
        if t == 'picture-format':
            page.locator('#pages .a-img').first.click(); page.wait_for_timeout(200)
        elif t.startswith('table'):
            click_text(page, 'cell', 2); page.wait_for_timeout(200)
        elif t == 'headfoot':
            page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(200)
        elif t == 'equation':
            click_text(page, 'A paragraph', 2); page.evaluate('rikuy.runCommand("formula")'); page.wait_for_selector('.pop-math'); page.wait_for_timeout(250)
        else:
            click_text(page, 'A paragraph', 2); page.wait_for_timeout(150)
        if not page.evaluate('(t) => rikuy.rbTabs.includes(t) && !document.getElementById("rt-" + t).hidden', t):
            yield t, False
            continue
        page.evaluate('(t) => rikuy.selectTab(t)', t); page.wait_for_timeout(200)
        yield t, True
    page.evaluate('() => { if (rikuy.hf) rikuy.pageHFClose(); if (document.querySelector(".pop-math")) rikuy.closePop(true); rikuy.disarm && rikuy.disarm(); }')


def judge(S, where, m, touch, scope):
    """The rules on one tab's measures (those that hold within one tab)."""
    lo = 44 if touch else 24
    small = [c for c in m['controls'] if c['w'] < lo - 0.5 or c['h'] < lo - 0.5]
    for c in small:
        # (WCAG 2.2's 2.5.8: an undersized target passes where a 24 px circle on its centre meets no
        # other target and no other undersized target's circle; with touch no exception: 44 px)
        if not touch:
            cx, cy = (c['l'] + c['r']) / 2, (c['t'] + c['b']) / 2
            def meets(o):
                if o is c: return False
                if o in small and ((cx - (o['l'] + o['r']) / 2) ** 2 + (cy - (o['t'] + o['b']) / 2) ** 2) < 24 ** 2 - 0.5: return True
                dx = max(o['l'] - cx, 0, cx - o['r']); dy = max(o['t'] - cy, 0, cy - o['b'])
                return dx * dx + dy * dy < 12 ** 2 - 0.5
            if not any(meets(o) for o in m['controls']):
                continue
        S.bad('target', where, c['n'], '%s %.0fx%.0f < %d' % (c['kind'], c['w'], c['h'], lo))
        if c['declared'] == 'L' and not c['shrunk'] and not c['folded'] and not c['kind'].startswith('split-arrow') and c['h'] < 60:
            S.bad('box', where, c['n'], 'a large button drawn small: %.0f px tall' % c['h'])
        if c['st'] == 'enabled' and c['op'] < 0.99:
            S.bad('icon', where, c['n'], 'enabled but looks disabled: opacity %.2f' % c['op'])
        if scope != 'bar' and not c['group']:
            S.bad('outside', where, c['n'], 'in no group')
    cs = [c for c in m['controls']]
    for i in range(len(cs)):
        for j in range(i + 1, len(cs)):
            a, b = cs[i], cs[j]
            w = min(a['r'], b['r']) - max(a['l'], b['l']); h = min(a['b'], b['b']) - max(a['t'], b['t'])
            if w > 1.5 and h > 1.5:
                S.bad('overlap', where, a['n'] + ' / ' + b['n'], '%.0fx%.0f' % (w, h))
    for c in m['clip']:
        S.bad('clip', where, c['n'], c)
    if scope == 'bar':
        return
    for g in m['groups']:
        if g['folded']:
            if not g['shown'] or g['shown'].lower() != (g['name'] or '').lower():
                S.bad('group', where, g['g'], 'folded into a button that does not show its name (shows %r)' % g['shown'])
            continue
        if not g['lab']:
            S.bad('group', where, g['g'], 'no name under it')
            continue
        tx = g['lab']['tx']
        if tx and abs((tx['l'] + tx['r']) / 2 - (g['l'] + g['r']) / 2) > 1.5:
            S.bad('group', where, g['g'], 'name not centred: text %.0f..%.0f, group %.0f..%.0f' % (tx['l'], tx['r'], g['l'], g['r']))
    bases = collections.Counter(rounded(g['lab']['tx']['b'] - m['box']['t'], 1) for g in m['groups'] if g['lab'] and g['lab']['tx'])
    if len(bases) > 1:
        S.bad('group', where, 'baselines', dict(bases))
    seps = collections.Counter(rounded(s['h'], 1) for s in m['seps'])
    if len(seps) > 1:
        S.bad('sep', where, 'separators', dict(seps))
    for g in m['gaps']:
        if not any(abs(g['gap'] - s) <= 0.6 for s in SCALE):
            S.bad('gap', where, g['a'] + ' > ' + g['b'], g['gap'])


def across(S, where, ms):
    """The rules that hold across tabs at one width and scheme: one box, icon, label per kind."""
    kinds = collections.defaultdict(collections.Counter)
    widths = collections.defaultdict(collections.Counter)
    icons = collections.defaultdict(collections.Counter)
    who = collections.defaultdict(list)  # (rule, kind, value) -> a few controls, to find them by
    def note(key, t, c):
        if len(who[key]) < 3: who[key].append(t + ':' + c['n'])
    colors = collections.defaultdict(collections.Counter)
    labels = collections.Counter()
    glabs = collections.Counter()
    for t, m in ms.items():
        for c in m['controls']:
            if c['kind'] in ('field', 'gallery'):
                continue
            kinds[c['kind']][rounded(c['h'], 1)] += 1; note(('h', c['kind'], rounded(c['h'], 1)), t, c)
            if c['kind'] in ('icon', 'icon-split', 'split-arrow', 'launcher', 'folded'):
                widths[c['kind']][rounded(c['w'], 1)] += 1; note(('w', c['kind'], rounded(c['w'], 1)), t, c)
            if c['svg'] and c['kind'] not in ('gallery', 'tile', 'launcher'):
                k = 'large' if c['kind'] in ('large', 'large-split') else 'small'
                icons[k][c['svg'][0]] += 1; note(('i', k, c['svg'][0]), t, c)
            if c['caret'] and c['kind'] != 'launcher':
                icons['caret'][c['caret']] += 1; note(('i', 'caret', c['caret']), t, c)
            colors[c['st']][(c['color'], c['op'])] += 1
        for l in m['labels']:
            labels[(l['size'], l['weight'])] += 1
        for g in m['groups']:
            if g['lab']:
                glabs[(g['lab']['size'], g['lab']['weight'])] += 1
    # (the values each kind takes, the rarer with the controls that take them)
    def spread(cnt, key):
        top = cnt.most_common(1)[0][0]
        return {v: (n if v == top else '%d %s' % (n, who[key(v)])) for v, n in cnt.items()}
    for k, cnt in kinds.items():
        if len(cnt) > 1:
            S.bad('box', where, k + ' height', spread(cnt, lambda v: ('h', k, v)))
    for k, cnt in widths.items():
        if len(cnt) > 1:
            S.bad('box', where, k + ' width', spread(cnt, lambda v: ('w', k, v)))
    for k, cnt in icons.items():
        if len(cnt) > 1:
            S.bad('icon', where, k + ' icon size', spread(cnt, lambda v: ('i', k, v)))
    for st in ('enabled', 'disabled'):
        if len(colors[st]) > 1:
            S.bad('icon', where, st + ' colour', dict(colors[st]))
    if len(labels) > 1:
        S.bad('label', where, 'button names', dict(labels))
    if len(glabs) > 1:
        S.bad('label', where, 'group names', dict(glabs))


def focus_rule(S, page, where):
    """A press with the mouse leaves no focus ring: on a tab, on a button."""
    # (from a fresh page, nothing focused, as one first meets it; then with the caret on the page)
    page.evaluate('() => { getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); }')
    for sel in ('#rt-design', '#rt-home', '#rp-home [data-cmd=bold]', '#rt-view', '#rp-view [data-cmd=show-marks]', '#rt-home'):
        if not page.locator(sel).first.is_visible():
            continue
        try: page.locator(sel).first.click(timeout=3000)
        except Exception: continue
        page.wait_for_timeout(150)
        o = page.evaluate("() => { const a = document.activeElement; if (!a || a === document.body || a.id === 'pages') return null; const s = getComputedStyle(a); return [a.id || a.className, s.outlineStyle, s.outlineWidth, a.matches(':focus-visible')]; }")
        if o and o[1] != 'none' and o[2] != '0px':
            S.bad('focus', where, sel, 'a ring after a mouse press: %s' % o)


def insert_rule(S, page, where):
    """With no caret on the page Insert stays as Word's: enabled, and it inserts at the last place."""
    click_text(page, 'The last paragraph', 4); page.wait_for_timeout(100)
    page.evaluate('() => { getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); rikuy.ribbonSync(); }')
    page.evaluate("rikuy.selectTab('insert')"); page.wait_for_timeout(200)
    off = page.evaluate("[...document.querySelectorAll('#rp-insert .rb-grp:not(.folded) button[data-cmd]')].filter((b) => b.offsetParent && b.disabled).map((b) => b.dataset.cmd)")
    if off:
        S.bad('insert', where, 'Insert with no caret', 'disabled: %s' % off)
        return
    # and a press inserts at the last place the caret was (in the last paragraph, after "The ")
    before = page.evaluate("rikuy.files.get('main.tex')")
    page.click('#rp-insert [data-cmd=page-break]'); page.wait_for_timeout(250)
    after = page.evaluate("rikuy.files.get('main.tex')")
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    i = next((k for k in range(min(len(before), len(after))) if before[k] != after[k]), None)
    if after == before or i is None or not before[:i].rstrip().endswith('The'):
        S.bad('insert', where, 'Page break with no caret', 'not at the last place: %r' % after[max(0, (i or 0) - 30):(i or 0) + 50])


def run():
    args = sys.argv[1:]
    def opt(k, d):
        if k in args:
            i = args.index(k); v = args[i + 1]; del args[i:i + 2]; return v.split(',')
        return d
    widths = [int(w) for w in opt('--widths', [str(w) for w in MOUSE + TOUCH])]
    only_tabs = opt('--tabs', None)
    schemes = opt('--schemes', ['light', 'dark', 'forced'])
    rules = args or ['box', 'icon', 'label', 'group', 'outside', 'sep', 'gap', 'clip', 'overlap', 'focus', 'target', 'insert']
    S = Sweep()
    with sync_playwright() as p:
        for w in widths:
            touch = w in TOUCH
            for scheme in (['light'] if touch else schemes):
                browser, page, errors = open_page(p, width=w, height=900, dark=scheme == 'dark', touch=touch)
                if scheme == 'forced':
                    page.emulate_media(forced_colors='active')
                load_doc(page, DOC); page.wait_for_timeout(300)
                tabs = [t for t in page.evaluate('rikuy.rbTabs') if t != 'file' and (not only_tabs or t in only_tabs)]
                ms = {}
                for t, shown in tab_states(page, tabs):
                    where = '%s %d%s %s' % (t, w, ' touch' if touch else '', scheme)
                    if not shown:
                        S.bad('group', where, t, 'the tab did not show with its object')
                        continue
                    m = page.evaluate(MEASURE, [t, 'ribbon'])
                    ms[t] = m
                    judge(S, where, m, touch, 'ribbon')
                bar = page.evaluate(MEASURE, ['', 'bar'])
                judge(S, 'bar %d%s %s' % (w, ' touch' if touch else '', scheme), bar, touch, 'bar')
                across(S, 'all tabs %d%s %s' % (w, ' touch' if touch else '', scheme), ms)
                if not touch and scheme == 'light':
                    if 'focus' in rules: focus_rule(S, page, 'tabs %d' % w)
                    if 'insert' in rules: insert_rule(S, page, 'insert %d' % w)
                browser.close()
    S.v = [x for x in S.v if x[0] in rules]
    S.report(rules)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed (%d violations)' % (len(results) - len(bad), len(bad), len(S.v)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()

"""One look for every control: the ribbon, the tab row, the title bar and the status bar measured as
a person sees them, on every tab (the contextual ones with their object), at 1920, 1366, 1280,
1024 and 900 px with a mouse and 1180 px with touch, in light, dark and forced colours. The rules
are docs/handoff/UI-PRINCIPLES.md's that hold for these four (its number after each); each
violation is printed with its place (tab, width, scheme), element and numbers.

  kind      every control, separator and group name says what kind it is (data-kind), and is drawn
            as that kind where its group has room (a large button large)
  box       C1: one height per kind of control, one width for icons alone, an icon alone square
  icon      C2, C3: icons 16 px on small controls and 32 on large ones, every line of them 1 px; one
            colour per state: an enabled control never looks disabled, a disabled one one grey
  type      C5: one size, weight and line height per kind of text; the ribbon's and the bar's
            button names and the group names 12 px regular
  group     C6, L4: every group named, its name centred under it, every name on one baseline; a
            folded group's button shows the group's name
  outside   L4: no control outside a group
  sep       C7: one separator: one height, 1 px wide, one colour
  space     C8: every padding, margin and gap from the scale 0 2 4 6 8 10 12 16 20 24 28 32 36 40 48
            (and the spaces between groups)
  radius    C9: every control's corners 4 px, or 0 where two parts touch
  name      C10: a command has one name and one icon wherever it is placed
  clip      L3: no name cut short (scrollWidth over clientWidth, out of its box, or an ellipsis)
  overlap   no two controls' boxes overlap
  stable    C12, L5: what cannot apply is disabled, never hidden; the caret's moving (a heading,
            words, a table's cell) moves no control and hides none
  collapse  L1: a group is never more folded at a wider width
  focus     C13, D4: the focus ring only for the keyboard (none after a mouse press), drawn as an
            outline at least 2 px wide, 3:1 against what is round it, and there in forced colours
  tooltip   C14: every control's tooltip says more than its name, and has its shortcut where it
            has one
  contrast  D1: text 4.5:1 and icons, the search box's line and the selected tab's mark 3:1
            against what is behind them, light and dark (disabled controls aside)
  forced    D4: under forced colours a pressed toggle and the selected tab still differ from the
            others
  target    T1, T2: every control at least 24 by 24 px with a mouse (WCAG 2.2's 2.5.8, with its
            spacing exception), 44 by 44 with touch
  motion    M1, M2: every transition 0 to 300 ms in steps of 50; with reduced motion only fades
  insert    with no caret on the page Insert stays enabled, as Word's, and inserts at the last place

Rules of the brief measured elsewhere: P1 KeyTips (test/tabs.py, test/commands.test.mjs), N6 one
undo step (roundtrip() in each batch's suite), N3 and P3 search (test/ribbon.py), P7 latency
(dev/bench_native_page.py), L6 contextual tabs (test/tabs.py), P5 focus kept while TeX works
(test/browser.py).

python3 consistency.py [rule ...] [--widths 1920,1366] [--tabs home,insert] [--schemes light]: the
rules, widths, tabs and schemes named only. RIKUY_DIST names another dist/."""
import os, sys, json, re, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, load_doc, click_text, ROOT
from playwright.sync_api import sync_playwright

WRAP = lambda body, pre='': '\\documentclass{article}\n\\usepackage{graphicx}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('\\section{Opening}\nA paragraph of the text.\n\n\\begin{center}\n\\includegraphics[width=0.4\\linewidth]{figure.png}\n\\end{center}\n\n'
           '\\begin{tabular}{ll}\ncell & other \\\\\nmore & last \\\\\n\\end{tabular}\n\nThe last paragraph.')
MOUSE = [1920, 1366, 1280, 1024, 900]
TOUCH = [1180]
SCALE = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 48]
GAPS = [0, 1, 2, 4, 6, 8, 12, 16, 24]  # between groups and separators (a separator's 1 px among them)
RULES = ['kind', 'box', 'icon', 'type', 'group', 'outside', 'sep', 'space', 'radius', 'name', 'clip', 'overlap',
         'stable', 'collapse', 'focus', 'tooltip', 'contrast', 'forced', 'target', 'motion', 'insert']

# colours as numbers, the colour behind an element, contrast: what the measures below share
LIB = r"""
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (s) => {
    let m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/.exec(s);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (a, b) => { const t = a[3]; return [a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t), 1]; };
  const bgOf = (e) => {
    const layers = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor);
    if (base[3] < 1) base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; };
  const op = (e) => { let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return Math.round(o * 100) / 100; };
  // a colour as it is seen over bg, with the element's opacity
  const seen = (s, e, bg) => { const c = parse(s); return over([c[0], c[1], c[2], c[3] * op(e)], bg); };
  const vis = (e) => e && e.offsetParent !== null && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const name = (e) => e.getAttribute('aria-label') || e.id || (e.textContent || '').trim().slice(0, 24);
"""

# One scope as it shows now (a tab's panel, the bar, the tab row, the status bar): every control
# and label with what the rules need, measured in the page
MEASURE = r"""(arg) => {
  const [tab, scope] = arg;
  """ + LIB + r"""
  const root = scope === 'bar' ? document.getElementById('bar') : scope === 'tabs' ? document.getElementById('rb-top') : scope === 'status' ? document.getElementById('status') : document.getElementById('rp-' + tab);
  const out = { controls: [], groups: [], seps: [], gaps: [], clip: [], space: [], texts: [], untagged: [], motion: [], flags: [], box: R(scope === 'ribbon' ? document.getElementById('ribbon') : root || document.body) };
  if (!root || !vis(root)) return out;
  const wide = matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  const rb = document.getElementById('ribbon');
  const dl = scope === 'ribbon' ? document.querySelector('.rb-dl') : null;
  const all = [...root.querySelectorAll('button, input, select, [role=combobox]')].concat(dl ? [...dl.querySelectorAll('button')] : []).filter((e, i, a) => a.indexOf(e) === i);
  for (const e of all) {
    if (!vis(e) || e.closest('[role=menu], .pop, .srch-list')) continue;
    const b = R(e); if (b.w < 1 || b.h < 1) continue;
    if (!e.dataset.kind) out.untagged.push(name(e));
    // (a glyph drawn for an icon, Bold's B or Symbol's Ω, is no name; a caret is no icon)
    const label = [...e.querySelectorAll(':scope > span:not(.sr):not(.fg):not(.sym-g):not(.fbx-v):not(.rb-ktip), :scope > .rb-bl, :scope > .rb-xname')].find((x) => vis(x) && x.textContent.trim()) || (e.matches('.linkish, .rb-tab') && e.textContent.trim() ? e : null);
    const svg = [...e.querySelectorAll(':scope > svg:not(.rb-car):not(.rb-larrow), :scope > .rb-gico')].find(vis);
    const caret = [...e.querySelectorAll('svg.rb-car, :scope.rb-x > svg, :scope > svg.rb-larrow')].find(vis);
    const split = e.closest('.rb-split'), field = e.matches('input, select') || e.closest('.fbx, .pf, .pf-field, .nf');
    const big = b.h > 40 || (split && split.getBoundingClientRect().height > 40);
    // the kind it is drawn as (data-kind is the kind its layout asks for)
    const kind = scope !== 'ribbon' ? (field ? 'field' : (e.dataset.kind || 'untagged'))
      : e.classList.contains('rb-launch') || (e.classList.contains('rb-launch-c') && b.h < 20) ? 'launcher'
      : e.classList.contains('rb-tile') || e.classList.contains('rb-sb') || e.closest('.rb-gal') ? 'gallery'
      : field ? 'field' : e.dataset.size === 'T' ? 'tile' : e.classList.contains('rb-gbtn') ? (big ? 'large' : 'folded')
      : e.classList.contains('rb-x') ? (big ? 'split-arrow-large' : 'split-arrow')
      : big ? (split ? 'large-split' : 'large')
      : label ? (split ? 'small-split' : 'small') : (split ? 'icon-split' : 'icon');
    const cs = getComputedStyle(e);
    const st = e.disabled || e.getAttribute('aria-disabled') === 'true' ? 'disabled' : e.getAttribute('aria-pressed') === 'true' ? 'pressed' : 'enabled';
    const g = e.closest('.rb-grp, .rb-dl, .qat, .title-end, .bar-left, .title-mid, .tools, .zoom, .st-views, .st-zoom, #status, .rb-top');
    const bg = bgOf(e);
    // the icon: its box, its lines as drawn (px), its colour as seen against what is behind it
    let icon = null;
    if (svg && !e.classList.contains('rb-x')) {
      const sb = svg.getBoundingClientRect(), vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : sb.width;
      const shape = [...svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')].find((s) => getComputedStyle(s).stroke !== 'none' && parseFloat(getComputedStyle(s).strokeWidth) > 0);
      let line = null;
      if (shape) { const ss = getComputedStyle(shape); line = Math.round(parseFloat(ss.strokeWidth) * (ss.vectorEffect === 'non-scaling-stroke' ? 1 : sb.width / vb) * 100) / 100; }
      const sc = getComputedStyle(svg), col = shape ? getComputedStyle(shape).stroke : sc.stroke !== 'none' ? sc.stroke : sc.color;
      icon = { w: Math.round(sb.width * 10) / 10, h: Math.round(sb.height * 10) / 10, line, cr: ratio(seen(col, e, bg), bg) };
    }
    const lab = label ? getComputedStyle(label) : null;
    out.controls.push({ n: name(e), id: e.id, cmd: e.dataset.cmd || null, dk: e.dataset.kind || null, kind, st, ...b, color: cs.color, op: op(e),
      icon, iconHTML: svg && !e.classList.contains('rb-x') ? svg.innerHTML.replace(/\s+/g, ' ') : null,
      caret: caret ? Math.round(caret.getBoundingClientRect().width * 10) / 10 : null,
      text: label ? { size: lab.fontSize, weight: lab.fontWeight, lh: lab.lineHeight, cr: ratio(seen(lab.color, label, bg), bg) } : null,
      title: e.title || (split && split.title) || '',
      group: g ? (g.dataset.group || g.className.split(' ')[0] || g.id) : null, folded: !!e.closest('.rb-grp.folded'), gbtn: e.classList.contains('rb-gbtn'),
      // (what the layout asks of it: a large one must be drawn large where its group has room)
      declared: (split || e).dataset.size || (e.dataset.cmd === 'paste' ? 'L' : null),
      shrunk: !wide || !!e.closest('.rb-grp.sm, .rb-grp.nm, .rb.rb-fold'),
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat) });
  }
  // every element's spaces, every transition (one entry per kind of element and value)
  const seenSp = new Set();
  const sig = (n) => (n.dataset && n.dataset.kind ? n.dataset.kind + ' ' : '') + n.tagName.toLowerCase() + (n.id ? '#' + n.id : n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : '');
  for (const n of [root, ...root.querySelectorAll('*')].concat(dl ? [dl, ...dl.querySelectorAll('*')] : [])) {
    if (n.closest('svg') || n.closest('[role=menu], .pop, .srch-list') || !vis(n)) continue;
    const s = getComputedStyle(n);
    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap']) {
      const v = s[p]; if (!v || v === 'normal' || v === 'auto') continue;
      const x = Math.abs(parseFloat(v)); if (isNaN(x)) continue;
      const k = sig(n) + ' ' + p + ' ' + x; if (seenSp.has(k)) continue; seenSp.add(k);
      out.space.push({ n: sig(n), p, v: Math.round(x * 100) / 100 });
    }
    const ms = (d) => Math.round(parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000));
    const ds = s.transitionDuration.split(',').map(ms);
    const as = s.animationName !== 'none' ? s.animationDuration.split(',').map(ms) : [];
    if (ds.some((d) => d > 0) || as.some((d) => d > 0)) out.motion.push({ n: sig(n), t: ds, props: s.transitionProperty, a: as, anim: s.animationName });
  }
  for (const s of root.querySelectorAll('.rb-glab, .rb-cap, .sep, .rb-tab')) if (vis(s) && !s.dataset.kind) out.untagged.push(sig(s));
  if (scope === 'ribbon') {
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
      out.groups.push({ g: g.dataset.group || 'download', folded, state: folded ? 3 : g.classList.contains('nm') ? 2 : g.classList.contains('sm') ? 1 : 0,
        name: g.getAttribute('aria-label') || (g.querySelector('.rb-gbtn') || {}).ariaLabel || '', ...gb,
        lab: lab ? { text: lab.textContent.trim(), size: ls.fontSize, weight: ls.fontWeight, lh: ls.lineHeight, ...lr, tx, cr: ratio(seen(ls.color, lab, bgOf(lab)), bgOf(lab)) } : null, shown });
      if (lab && (lab.scrollWidth > lab.clientWidth + 1 || (tx && (tx.l < gb.l - 1 || tx.r > gb.r + 1)))) out.clip.push({ n: 'group ' + (g.dataset.group || 'download'), sw: lab.scrollWidth, cw: lab.clientWidth });
    }
    out.flags = ['rb-nolab', 'rb-narrow', 'rb-fold', 'rb-dl1'].filter((c) => rb.classList.contains(c));
    const tb = root.querySelector('.rb-tb');
    const seq = [...tb.children].filter((e) => vis(e) && !e.classList.contains('grow'));
    for (const s of seq.filter((e) => e.classList.contains('sep'))) { const c = getComputedStyle(s); out.seps.push({ ...R(s), color: c.backgroundColor }); }
    if (dl && vis(dl)) { const a = getComputedStyle(dl, '::after'); if (a.content !== 'none' && a.display !== 'none') { const d = R(dl); out.seps.push({ t: d.t + parseFloat(a.top), h: parseFloat(a.height), w: parseFloat(a.width), color: a.backgroundColor, dl: true }); } }
    for (let i = 1; i < seq.length; i++) { if (seq[i - 1].nextElementSibling && seq[i - 1].nextElementSibling.classList.contains('grow')) continue; out.gaps.push({ a: seq[i - 1].className.split(' ')[0] + ':' + (seq[i - 1].dataset.group || ''), b: seq[i].className.split(' ')[0] + ':' + (seq[i].dataset.group || ''), gap: Math.round((R(seq[i]).l - R(seq[i - 1]).r) * 10) / 10 }); }
  }
  if (scope === 'tabs') {
    for (const t of root.querySelectorAll('.rb-tab')) {
      if (!vis(t)) continue;
      const s = getComputedStyle(t), bg = bgOf(t), on = t.getAttribute('aria-selected') === 'true';
      const mark = on ? getComputedStyle(t, '::after') : null;
      out.texts.push({ n: 'tab ' + t.dataset.tab, kind: t.dataset.tab === 'file' ? 'tab-file' : on ? 'tab-on' : 'tab', size: s.fontSize, weight: s.fontWeight, lh: s.lineHeight,
        cr: ratio(seen(s.color, t, bg), bg), mark: mark && mark.content !== 'none' && mark.display !== 'none' ? ratio(parse(mark.backgroundColor), bg) : null });
    }
  }
  if (scope === 'bar') {
    // the document's name and whether it is kept, the search box's text, its line and its icon
    for (const [sel, k] of [['#docname', 'title'], ['#savestate', 'title-note']]) {
      const e = document.querySelector(sel); if (!vis(e) || !e.textContent.trim()) continue;
      const s = getComputedStyle(e), bg = bgOf(e);
      out.texts.push({ n: sel, kind: k, size: s.fontSize, weight: s.fontWeight, lh: s.lineHeight, cr: ratio(seen(s.color, e, bg), bg) });
    }
    const q = document.getElementById('rk-search');
    if (vis(q)) {
      const s = getComputedStyle(q), inside = bgOf(q), outside = bgOf(document.getElementById('bar'));
      const ph = getComputedStyle(q, '::placeholder');
      out.texts.push({ n: 'search placeholder', kind: 'field-text', size: s.fontSize, weight: s.fontWeight, lh: s.lineHeight, cr: ratio(seen(ph.color, q, inside), inside) });
      out.search = { line: ratio(parse(s.borderTopColor), outside), lineIn: ratio(parse(s.borderTopColor), inside), width: parseFloat(s.borderTopWidth),
        icon: ratio(parse(getComputedStyle(document.querySelector('.srch > svg')).stroke), inside) };
    }
  }
  if (scope === 'status') {
    for (const e of root.querySelectorAll('#st-words, #st-save')) {
      if (!vis(e) || !e.textContent.trim()) continue;
      const s = getComputedStyle(e), bg = bgOf(e);
      out.texts.push({ n: '#' + e.id, kind: 'status', size: s.fontSize, weight: s.fontWeight, lh: s.lineHeight, cr: ratio(seen(s.color, e, bg), bg) });
    }
  }
  // names cut short in buttons (and the document's name, the tabs')
  const texts = [...root.querySelectorAll('.btn span:not(.sr), .rb-ln, .rb-bl, .linkish')].concat(scope === 'bar' ? [...document.querySelectorAll('#docname')] : scope === 'tabs' ? [...root.querySelectorAll('.rb-tab')] : []);
  for (const s of texts) {
    if (!vis(s)) continue;
    const box = (s.closest('button') || s).getBoundingClientRect(), r = s.getBoundingClientRect(), cs = getComputedStyle(s);
    if (s.scrollWidth > s.clientWidth + 1 && s.clientWidth > 0) out.clip.push({ n: s.textContent.trim().slice(0, 30), sw: s.scrollWidth, cw: s.clientWidth, ellipsis: cs.textOverflow === 'ellipsis' });
    else if (s !== s.closest('button') && (r.right > box.right + 1 || r.left < box.left - 1)) out.clip.push({ n: s.textContent.trim().slice(0, 30), out: [Math.round(r.left - box.left), Math.round(box.right - r.right)] });
  }
  return out; }"""

# The keyboard's focus ring on one control: outline, width, contrast with what is round it
FOCUS = r"""(sel) => {
  """ + LIB + r"""
  const e = [...document.querySelectorAll(sel)].find(vis);
  if (!e) return null;
  e.focus();
  const s = getComputedStyle(e), off = parseFloat(s.outlineOffset) || 0;
  const behind = off < 0 ? bgOf(e) : bgOf(e.parentElement);
  const r = { sel, fv: e.matches(':focus-visible'), style: s.outlineStyle, width: parseFloat(s.outlineWidth) || 0, color: s.outlineColor,
    cr: s.outlineStyle === 'none' ? 0 : ratio(parse(s.outlineColor), behind), shadow: s.boxShadow };
  e.blur();
  return r; }"""

# a control of each kind, on Home, the bar, the tab row and the status bar
FOCUS_SAMPLES = ['#rt-home', '#rp-home [data-cmd=paste]', '#rp-home [data-cmd=bold]', '#rp-home .rb-split > .rb-x', '#rp-home .fbx input',
                 '#rb-gallery .rb-tiles > button', '#rp-home .rb-launch, #rp-home .rb-launch-c', '.rb-dl button', '#rp-home .rb-gbtn',
                 '#b-share', '#qat-save', '#rk-search', '#sv-page', '#st-pages', '#rb-collapse']


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
            print('  %-8s %-30s %-34s %s' % (r, where, str(el)[:34], str(d)[:240]))
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
        page.mouse.move(2, 880)  # (no hover on any control)
        yield t, True
    page.evaluate('() => { if (rikuy.hf) rikuy.pageHFClose(); if (document.querySelector(".pop-math")) rikuy.closePop(true); rikuy.disarm && rikuy.disarm(); }')


def judge(S, where, m, touch, scope, scheme):
    """The rules on one scope's measures (those that hold within it)."""
    lo = 44 if touch else 24
    small = [c for c in m['controls'] if c['w'] < lo - 0.5 or c['h'] < lo - 0.5]
    for n in m['untagged']:
        S.bad('kind', where, n, 'no data-kind')
    for c in m['controls']:
        if c in small:
            # (WCAG 2.2's 2.5.8: an undersized target passes where a 24 px circle on its centre meets no
            # other target and no other undersized target's circle; with touch no exception: 44 px)
            ok = False
            if not touch:
                cx, cy = (c['l'] + c['r']) / 2, (c['t'] + c['b']) / 2
                def meets(o):
                    if o is c: return False
                    if o in small and ((cx - (o['l'] + o['r']) / 2) ** 2 + (cy - (o['t'] + o['b']) / 2) ** 2) < 24 ** 2 - 0.5: return True
                    dx = max(o['l'] - cx, 0, cx - o['r']); dy = max(o['t'] - cy, 0, cy - o['b'])
                    return dx * dx + dy * dy < 12 ** 2 - 0.5
                ok = not any(meets(o) for o in m['controls'])
            if not ok:
                S.bad('target', where, c['n'], '%s %.0fx%.0f < %d' % (c['kind'], c['w'], c['h'], lo))
        if scope == 'ribbon' and c['declared'] == 'L' and not c['shrunk'] and not c['folded'] and not c['kind'].startswith('split-arrow') and c['h'] < 60:
            S.bad('kind', where, c['n'], 'a large button drawn small: %.0f px tall' % c['h'])
        if c['st'] == 'enabled' and c['op'] < 0.99:
            S.bad('icon', where, c['n'], 'enabled but looks disabled: opacity %.2f' % c['op'])
        if scope == 'ribbon' and not c['group']:
            S.bad('outside', where, c['n'], 'in no group')
        if c['icon'] and c['kind'] not in ('gallery', 'tile', 'launcher', 'field'):
            want = 32 if c['kind'] in ('large', 'large-split') else 16
            if abs(c['icon']['w'] - want) > 0.5 or abs(c['icon']['h'] - want) > 0.5:
                S.bad('icon', where, c['n'], '%s icon %sx%s, not %d' % (c['kind'], c['icon']['w'], c['icon']['h'], want))
            if c['icon']['line'] is not None and abs(c['icon']['line'] - 1) > 0.05:
                S.bad('icon', where, c['n'], 'lines %.2f px, not 1' % c['icon']['line'])
        if scheme != 'forced' and c['st'] != 'disabled':
            if c['text'] and c['text']['cr'] < 4.5:
                S.bad('contrast', where, c['n'], 'name %.2f:1 < 4.5' % c['text']['cr'])
            if c['icon'] and c['kind'] not in ('gallery', 'tile') and c['icon']['cr'] < 3:
                S.bad('contrast', where, c['n'], 'icon %.2f:1 < 3' % c['icon']['cr'])
        if c['kind'] not in ('field', 'gallery') and any(x not in (0, 4) for x in c['radius']):
            S.bad('radius', where, c['n'], 'corners %s, not 4 (or 0 where parts touch)' % c['radius'])
    for t in m['texts']:
        if scheme != 'forced' and t['cr'] < 4.5:
            S.bad('contrast', where, t['n'], 'text %.2f:1 < 4.5' % t['cr'])
        if scheme != 'forced' and t.get('mark') is not None and t['mark'] < 3:
            S.bad('contrast', where, t['n'], "the selected tab's mark %.2f:1 < 3" % t['mark'])
    if m.get('search') and scheme != 'forced':
        q = m['search']
        if q['width'] < 1 or q['line'] < 3 or q['lineIn'] < 3:
            S.bad('contrast', where, 'search box', 'line %.2f:1 against the bar, %.2f:1 against the box (3 each), %s px' % (q['line'], q['lineIn'], q['width']))
        if q['icon'] < 3:
            S.bad('contrast', where, 'search icon', '%.2f:1 < 3' % q['icon'])
    cs = m['controls']
    for i in range(len(cs)):
        for j in range(i + 1, len(cs)):
            a, b = cs[i], cs[j]
            w = min(a['r'], b['r']) - max(a['l'], b['l']); h = min(a['b'], b['b']) - max(a['t'], b['t'])
            if w > 1.5 and h > 1.5:
                S.bad('overlap', where, a['n'] + ' / ' + b['n'], '%.0fx%.0f' % (w, h))
    for c in m['clip']:
        S.bad('clip', where, c['n'], c)
    for s in m['space']:
        if not any(abs(s['v'] - k) <= 0.25 for k in SCALE):
            S.bad('space', where, s['n'], '%s %s px' % (s['p'], s['v']))
    for x in m['motion']:
        if [d for d in x['t'] + x['a'] if d % 50 or d > 300]:
            S.bad('motion', where, x['n'], 'durations %s ms (%s)' % (x['t'] + x['a'], x['props']))
    if scope != 'ribbon':
        return
    for g in m['groups']:
        if g['folded']:
            if not g['shown'] or g['shown'].lower() != (g['name'] or '').lower():
                S.bad('group', where, g['g'], 'folded into a button that does not show its name (shows %r)' % g['shown'])
            continue
        if not g['lab']:
            S.bad('group', where, g['g'], 'no name under it')
            continue
        if scheme != 'forced' and g['lab']['cr'] < 4.5:
            S.bad('contrast', where, 'group ' + g['g'], 'name %.2f:1 < 4.5' % g['lab']['cr'])
        tx = g['lab']['tx']
        if tx and abs((tx['l'] + tx['r']) / 2 - (g['l'] + g['r']) / 2) > 1.5:
            S.bad('group', where, g['g'], 'name not centred: text %.0f..%.0f, group %.0f..%.0f' % (tx['l'], tx['r'], g['l'], g['r']))
    bases = collections.Counter(rounded(g['lab']['tx']['b'] - m['box']['t'], 1) for g in m['groups'] if g['lab'] and g['lab']['tx'])
    if len(bases) > 1:
        S.bad('group', where, 'baselines', dict(bases))
    seps = collections.Counter((rounded(s['h'], 1), s['color']) for s in m['seps'])
    if len(seps) > 1:
        S.bad('sep', where, 'separators', dict(seps))
    for s in m['seps']:
        if 'w' in s and abs(s['w'] - 1) > 0.25:
            S.bad('sep', where, 'separator', '%.1f px wide' % s['w'])
    for g in m['gaps']:
        if not any(abs(g['gap'] - s) <= 0.6 for s in GAPS):
            S.bad('space', where, g['a'] + ' > ' + g['b'], 'gap %s px' % g['gap'])


def across(S, where, ms, chrome):
    """The rules that hold across tabs, the bar, the tab row and the status bar at one width and
    scheme: one box, icon and type per kind; one name and icon per command."""
    kinds = collections.defaultdict(collections.Counter)
    widths = collections.defaultdict(collections.Counter)
    icons = collections.defaultdict(collections.Counter)
    who = collections.defaultdict(list)  # (rule, kind, value) -> a few controls, to find them by
    def note(key, t, c):
        if len(who[key]) < 3: who[key].append(t + ':' + c['n'])
    colors = collections.defaultdict(collections.Counter)
    types = collections.defaultdict(collections.Counter)
    names, looks = collections.defaultdict(set), collections.defaultdict(set)
    for t, m in list(ms.items()) + list(chrome.items()):
        if not m: continue
        for c in m['controls']:
            if c['cmd']:
                names[c['cmd']].add(c['n']); looks[c['cmd']].add(c['iconHTML'] or '')
            if c['kind'] in ('field', 'gallery'):
                continue
            k = c['kind'] if t not in chrome else t + ':' + c['kind']
            kinds[k][rounded(c['h'], 1)] += 1; note(('h', k, rounded(c['h'], 1)), t, c)
            if c['kind'] in ('icon', 'icon-split', 'split-arrow', 'launcher', 'folded', 'title-icon'):
                widths[k][rounded(c['w'], 1)] += 1; note(('w', k, rounded(c['w'], 1)), t, c)
                if c['kind'] in ('icon', 'title-icon') and abs(c['w'] - c['h']) > 0.5:
                    S.bad('box', where, t + ':' + c['n'], 'an icon alone not square: %.0fx%.0f' % (c['w'], c['h']))
            if c['caret'] and c['kind'] != 'launcher':
                icons['caret'][c['caret']] += 1; note(('i', 'caret', c['caret']), t, c)
            # (the bar's names in the ribbon's type; the tabs' and the status bar's their own)
            if c['text'] and c['kind'] not in ('gallery', 'tile', 'field', 'tab'):
                tk = 'status' if t == 'status' else 'button name'
                v = (c['text']['size'], c['text']['weight'], c['text']['lh'])
                types[tk][v] += 1; note(('t', tk, v), t, c)
            colors[c['st']][(c['color'], c['op'])] += 1
        for x in m.get('texts', []):
            v = (x['size'], x['weight'], x['lh'])
            types[x['kind']][v] += 1; note(('t', x['kind'], v), t, x)
        for g in m.get('groups', []):
            if g['lab']:
                v = (g['lab']['size'], g['lab']['weight'], g['lab']['lh'])
                types['group name'][v] += 1; note(('t', 'group name', v), t, {'n': g['g']})
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
    for k, cnt in types.items():
        if len(cnt) > 1:
            S.bad('type', where, k, spread(cnt, lambda v: ('t', k, v)))
    for k in ('button name', 'group name'):
        for (size, weight, lh) in types.get(k, {}):
            if size != '12px' or weight != '400':
                S.bad('type', where, k, '%s %s, not 12px regular' % (size, weight))
    for cmd, ns in names.items():
        if len(ns) > 1:
            S.bad('name', where, cmd, 'names %s' % sorted(ns))
        if len(looks[cmd]) > 1:
            S.bad('name', where, cmd, '%d different icons' % len(looks[cmd]))


def tooltip_rule(S, where, ms, chrome):
    """Every control's tooltip: more than its name, and its shortcut where it has one."""
    ctl = json.load(open(os.path.join(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'), 'controls.json')))['controls']
    keys = {c['id']: c.get('keys') or [] for c in ctl if c.get('id')}
    ARROWS = {'ArrowLeft': '←', 'ArrowRight': '→', 'ArrowUp': '↑', 'ArrowDown': '↓', 'Clear': 'Num 5'}
    done = set()
    for t, m in list(ms.items()) + list(chrome.items()):
        if not m: continue
        for c in m['controls']:
            if c['kind'] in ('gallery', 'field', 'tab') or not c['id'] or c['id'] in done:
                continue
            done.add(c['id'])
            title = c['title'] or ''
            if not title:
                S.bad('tooltip', where, t + ':' + c['n'], 'no tooltip')
                continue
            rest = title
            for k in sorted(keys.get(c['id'], []), key=len, reverse=True):
                rest = rest.replace(k, '')
            rest = re.sub(r'\s*\([^)]*\)', '', rest).strip(' .:\n')
            name = re.sub(r'\s*\(.*$', '', c['n']).strip()
            if rest.lower() in ('', name.lower(), c['n'].lower()):
                S.bad('tooltip', where, t + ':' + c['n'], 'the name alone: %r' % title)
            ks = keys.get(c['id'], [])
            if ks and not any(k in title or re.sub('|'.join(ARROWS), lambda mm: ARROWS[mm.group(0)], k) in title for k in ks):
                S.bad('tooltip', where, t + ':' + c['n'], 'no shortcut %s in %r' % (ks, title))


def focus_rule(S, page, where, scheme):
    """The ring only for the keyboard: none after a mouse press; with the keyboard an outline at
    least 2 px wide, 3:1 against what is round it (in forced colours, an outline)."""
    if scheme == 'light':
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
    page.evaluate("rikuy.selectTab('home')"); page.wait_for_timeout(150)
    for sel in FOCUS_SAMPLES:
        page.keyboard.press('Shift')  # (the last input the keyboard's, as after Tab or an arrow)
        r = page.evaluate(FOCUS, sel)
        if not r:
            continue
        if not r['fv']:
            S.bad('focus', where, sel, 'not :focus-visible after the keyboard')
        elif r['style'] == 'none' or r['width'] < 2:
            S.bad('focus', where, sel, 'no outline of 2 px with the keyboard: %s %s px%s' % (r['style'], r['width'], ' (a box-shadow only)' if r['shadow'] != 'none' else ''))
        elif scheme != 'forced' and r['cr'] < 3:
            S.bad('focus', where, sel, 'ring %.2f:1 < 3 (%s)' % (r['cr'], r['color']))


def stable_rule(S, page, where):
    """The caret's moving (a heading, words, a table's cell) moves no control and hides none."""
    snap = """(t) => { const p = document.getElementById('rp-' + t); const out = {};
      for (const e of p.querySelectorAll('button, input, select')) { if (e.closest('.rb-gal')) continue; const r = e.getBoundingClientRect();
        const k = e.id || e.dataset.cmd || e.getAttribute('aria-label'); out[k] = e.offsetParent && r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; }
      return out; }"""
    for t in ('home', 'insert', 'layout', 'references', 'review'):
        base = None
        for what, place in (('a paragraph', ('A paragraph', 2)), ('a heading', ('Opening', 2)), ("a table's cell", ('cell', 2)), ('words', None)):
            if place:
                click_text(page, *place)
            else:
                click_text(page, 'A paragraph', 2); page.keyboard.press('Shift+End')
            page.wait_for_timeout(200)
            page.evaluate('(t) => rikuy.selectTab(t)', t); page.wait_for_timeout(200)
            now = page.evaluate(snap, t)
            if base is None:
                base = now; continue
            moved = [k for k in base if k in now and base[k] and now[k] and base[k] != now[k]]
            hid = [k for k in base if (base[k] is None) != (now.get(k) is None)]
            if moved:
                S.bad('stable', where, t + ' in ' + what, 'moved: %s' % ['%s %s>%s' % (k, base[k], now[k]) for k in moved[:4]])
            if hid:
                S.bad('stable', where, t + ' in ' + what, 'shown or hidden: %s' % hid[:6])


def forced_rule(S, page, where):
    """Under forced colours a pressed toggle and the selected tab differ from the others."""
    r = page.evaluate("""() => {
      const look = (e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.fontWeight, s.borderTopColor, s.outlineStyle].join(' '); };
      const tabs = [...document.querySelectorAll('.rb-tab:not([hidden])')];
      const on = tabs.find((t) => t.getAttribute('aria-selected') === 'true'), off = tabs.find((t) => t !== on && t.dataset.tab !== 'file');
      const mark = on ? getComputedStyle(on, '::after') : null;
      return on && off ? [look(on), look(off), mark && mark.content !== 'none' ? mark.backgroundColor : ''] : null; }""")
    if r and r[0] == r[1] and not r[2]:
        S.bad('forced', where, 'selected tab', 'looks as the others: %s' % r[0])
    page.evaluate("rikuy.selectTab('view')"); page.wait_for_timeout(150)
    p = page.evaluate("""() => { const look = (e) => { const s = getComputedStyle(e); return [s.backgroundColor, s.color, s.borderTopColor].join(' '); };
      const on = [...document.querySelectorAll('#rp-view .btn[aria-pressed=true]')].find((e) => e.offsetParent), off = [...document.querySelectorAll('#rp-view .btn[aria-pressed=false]')].find((e) => e.offsetParent);
      return on && off ? [on.getAttribute('aria-label'), look(on), look(off), getComputedStyle(on, '::before').content !== 'none'] : null; }""")
    if p and p[1] == p[2] and not p[3]:
        S.bad('forced', where, p[0], 'a pressed toggle looks as one not pressed: %s' % p[1])
    page.evaluate("rikuy.selectTab('home')")


def motion_rule(S, p):
    """With reduced motion only fades."""
    browser, page, errors = open_page(p, width=1366, height=900)
    page.emulate_media(reduced_motion='reduce')
    load_doc(page, DOC); page.wait_for_timeout(300)
    for scope, tab in (('ribbon', 'home'), ('bar', ''), ('tabs', ''), ('status', '')):
        m = page.evaluate(MEASURE, [tab, scope])
        for x in m['motion']:
            props = [q.strip() for q in x['props'].split(',')]
            durs = x['t'] + [x['t'][-1]] * max(0, len(props) - len(x['t']))
            moving = [q for q, d in zip(props, durs) if d > 0 and q not in ('opacity', 'none')]
            if moving or x['a']:
                S.bad('motion', 'reduced motion ' + scope, x['n'], 'moves: %s %s' % (moving, x['anim'] if x['a'] else ''))
    browser.close()


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
    rules = args or RULES
    S = Sweep()
    states = collections.defaultdict(dict)  # (scheme, tab, group) -> {width: state}
    with sync_playwright() as p:
        for w in widths:
            touch = w in TOUCH
            for scheme in (['light'] if touch else schemes):
                browser, page, errors = open_page(p, width=w, height=900, dark=scheme == 'dark', touch=touch)
                if scheme == 'forced':
                    page.emulate_media(forced_colors='active')
                load_doc(page, DOC); page.wait_for_timeout(300)
                tabs = [t for t in page.evaluate('rikuy.rbTabs') if t != 'file' and (not only_tabs or t in only_tabs)]
                tag = '%d%s %s' % (w, ' touch' if touch else '', scheme)
                ms = {}
                for t, shown in tab_states(page, tabs):
                    where = '%s %s' % (t, tag)
                    if not shown:
                        S.bad('group', where, t, 'the tab did not show with its object')
                        continue
                    m = page.evaluate(MEASURE, [t, 'ribbon'])
                    ms[t] = m
                    judge(S, where, m, touch, 'ribbon', scheme)
                    if not touch:
                        for g in m['groups']:
                            states[(scheme, t, g['g'])][w] = g['state']
                        states[(scheme, t, "the ribbon's steps")][w] = set(m['flags'])
                page.evaluate("rikuy.selectTab('home')"); page.wait_for_timeout(150); page.mouse.move(2, 880)
                chrome = {}
                for scope in ('bar', 'tabs', 'status'):
                    chrome[scope] = page.evaluate(MEASURE, ['', scope])
                    judge(S, '%s %s' % (scope, tag), chrome[scope], touch, scope, scheme)
                across(S, 'all %s' % tag, ms, chrome)
                if scheme == 'light' and w == widths[0] and 'tooltip' in rules:
                    tooltip_rule(S, 'all %s' % tag, ms, chrome)
                if not touch and 'focus' in rules and w in (1366, 900, widths[0]):
                    focus_rule(S, page, 'focus %s' % tag, scheme)
                if scheme == 'forced' and 'forced' in rules:
                    forced_rule(S, page, 'forced %d' % w)
                if not touch and scheme == 'light':
                    if 'stable' in rules and w in (1366, widths[0]): stable_rule(S, page, 'stable %d' % w)
                    if 'insert' in rules: insert_rule(S, page, 'insert %d' % w)
                if errors:
                    S.bad('kind', 'page %s' % tag, 'errors', errors[:3])
                browser.close()
        if 'motion' in rules:
            motion_rule(S, p)
    # L1: never more folded at a wider width (each group's state, and the ribbon's own steps)
    for (scheme, t, g), by in states.items():
        ws = sorted(by, reverse=True)
        for a, b in zip(ws, ws[1:]):
            x, y = by[a], by[b]
            if (x > y) if isinstance(x, int) else bool(x - y):
                S.bad('collapse', '%s %s' % (t, scheme), g, 'more folded at %d (%s) than at %d (%s)' % (a, x, b, y))
    S.v = [x for x in S.v if x[0] in rules]
    S.report(rules)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed (%d violations)' % (len(results) - len(bad), len(bad), len(S.v)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()

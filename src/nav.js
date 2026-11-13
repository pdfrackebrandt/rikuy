// The side panel's navigation: the Outline (the document's headings, the one in view marked)
// and the Problems (TeX's own and the page's), the panel opened and closed, a place in the
// source shown on the page. The Review and Git tabs draw themselves (src/review.js, the git
// methods of src/app.js); refreshNav hands the panel to them. The methods join App's prototype.

import { $, mk, store, PREFS } from './ui/dom.js';
import { atomOfEl } from './editor.js';
import { findProblems } from './problems.js';
import { spacingOnly } from './diff.js';
import { commentOnly } from './share.js';
import { openMenu } from './ui/kit.js';
import { openFindDialog } from './ui/finddialog.js';
import { context, blockText } from './find.js';

const SVG = (paths) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + paths + '</svg>';
const ICON = {
  find: '<circle cx="8.5" cy="8.5" r="4.6"/><path d="M12 12l4.5 4.5"/>', caret: '<path d="M6 8l4 4 4-4"/>', up: '<path d="M6 12l4-4 4 4"/>', down: '<path d="M6 8l4 4 4-4"/>',
  promote: '<path d="M11.5 5.5 7 10l4.5 4.5"/>', demote: '<path d="M8.5 5.5 13 10l-4.5 4.5"/>', mup: '<path d="M10 15.5v-11M6 8l4-4 4 4"/>', mdown: '<path d="M10 4.5v11M6 12l4 4 4-4"/>',
  plus: '<path d="M10 5v10M5 10h10"/>', minus: '<path d="M5 10h10"/>', tog: '<path d="M7.5 6l5 4-5 4z"/>'
};
// the Navigation pane's three views, as Word's
const VIEWS = [['headings', 'Headings'], ['pages', 'Pages'], ['results', 'Results']];
// what the Results view can list beside the search's hits (Word's "Find: Graphics, Tables, ...")
const OBJS = [['figure', 'Figures'], ['table', 'Tables'], ['equation', 'Equations'], ['footnote', 'Footnotes'], ['comment', 'Comments']];
const SEARCH_OPTS = [['matchCase', 'Match case'], ['wholeWord', 'Find whole words only'], ['wildcards', 'Use wildcards'], ['regex', 'Use regular expressions'], ['source', 'In LaTeX source']];

export const nav = {
  // ---- outline and problems -------------------------------------------------------------
  // the list of actions in the menu panel shows what the bar shows now: Undo and Redo greyed
  // when there is nothing to undo, the zoom by its value
  navActs() {
    for (const a of $('#nav-acts').children) {
      const b = $('#' + a.dataset.for);
      a.disabled = b.disabled;
      if (a.dataset.for === 'zoomv') a.lastChild.textContent = 'Zoom: ' + b.textContent;
    }
  },

  navOpen(tab) { return document.body.classList.contains('nav-on') && (!tab || this.navTab === tab); },

  toggleNav(force, tab) {
    const on = force ?? !document.body.classList.contains('nav-on');
    document.body.classList.toggle('nav-on', on);
    $('#b-nav').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (tab) this.navTab = tab;
    this.navTab = this.navTab || 'outline';
    // (the Outline view is the panel's Outline tab, wide; leaving the tab or closing the panel ends
    // it, and the pane's search with it, unless the Find and Replace dialog still shows it)
    if (!on || this.navTab !== 'outline') {
      this.outlineView = false;
      if (this.fs && this.fs.on && !(this.fr && !this.fr.d.hidden)) this.findClear();
    }
    document.body.classList.toggle('nav-wide', this.navTab === 'changes' || this.navTab === 'git' || !!this.outlineView);
    document.body.classList.toggle('nav-outline', !!this.outlineView);
    for (const [id, t] of [['#nt-outline', 'outline'], ['#nt-problems', 'problems'], ['#nt-changes', 'changes'], ['#nt-git', 'git']]) { $(id).classList.toggle('on', this.navTab === t); $(id).setAttribute('aria-selected', this.navTab === t ? 'true' : 'false'); if (this.navTab === t) $('#nav-body').setAttribute('aria-labelledby', id.slice(1)); }
    this.prefs.nav = on;
    store(PREFS, this.prefs);
    if (on) { this.refreshNav(); this.navActs(); }
    if (window.innerWidth > 860) setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
  },

  computeProblems() {
    const m = this.model;
    if (!m) return [];
    const mathErrors = [];
    for (const el of this.root.querySelectorAll('.has-err')) {
      const info = atomOfEl(el) || atomOfEl(el.closest('[data-a],[data-m]'));
      if (info && info.f != null && info.s != null) mathErrors.push({ f: info.f, p: info.s, msg: el.title || 'cannot be typeset' });
    }
    const pre = this.src(this.main).split(/\\begin\s*\{document\}/)[0];
    const gp = /\\graphicspath\s*\{((?:\{[^}]*\})+)\}/.exec(pre);
    const found = findProblems({
      files: this.files, main: this.main, bibKeys: new Set(m.bibEntries ? m.bibEntries.keys() : []), unknown: m.warn,
      mathErrors, assets: [...this.assetBlobs.keys(), ...this.extra.keys()], graphicsPath: gp ? [...gp[1].matchAll(/\{([^}]*)\}/g)].map((x) => x[1]) : [],
      figuresWith: this.figuresWith()
    });
    // what pdfLaTeX itself reported on the last compile comes first: it is the real verdict
    const tex = this.texIssues.filter((x) => x.sev !== 'info' || x.msg.startsWith('Overfull'));
    return [...tex, ...found.filter((x) => x.sev !== 'info' || !tex.length)];
  },

  refreshNav() {
    const probs = this.computeProblems();
    this.problems = probs;
    const serious = probs.filter((x) => x.sev !== 'info').length;
    const wb = $('#st-warn');
    wb.hidden = !probs.length;
    wb.textContent = serious ? serious + (serious === 1 ? ' problem' : ' problems') : probs.length + (probs.length === 1 ? ' command shown as source' : ' commands shown as source');
    $('#nt-count').textContent = probs.length ? String(probs.length) : '';
    $('#nav-dot').hidden = !probs.some((x) => x.sev === 'error');
    if (this.base && (document.body.classList.contains('nav-on') || this.prefs.marks)) {
      const n = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c)).length + this.allComments().length;
      $('#nt-ccount').textContent = n ? String(n) : '';
    }
    if (!document.body.classList.contains('nav-on')) return;
    const body = $('#nav-body');
    if (this.navTab === 'git') {
      if (body.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { this.navStale = true; return; }
      this.navStale = false;
      // the panel writes the project into the repository to show its status: not on every
      // keystroke, at most about once a second while typing
      const now = Date.now();
      clearTimeout(this.gitTimer);
      if (this.gitRendering || now - (this.gitLast || 0) < 1200) { this.gitTimer = setTimeout(() => this.refreshNav(), 1250); return; }
      this.gitLast = now;
      this.gitRendering = true;
      this.renderGit(body).finally(() => { this.gitRendering = false; });
      return;
    }
    if (this.navTab === 'changes') {
      // do not pull the panel out from under someone typing a version name
      if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { this.navStale = true; return; }
      this.navStale = false;
      const y = body.scrollTop;
      body.replaceChildren();
      // Review, as in Word: the comments, then the changes and versions
      this.renderComments(body);
      this.renderChanges(body);
      body.scrollTop = y;
      return;
    }
    if (this.navTab === 'outline') { this.renderOutline(body); return; }
    body.replaceChildren();
    if (this.navTab === 'problems') {
      if (!probs.length) { const e = document.createElement('div'); e.className = 'nav-empty'; e.textContent = 'No problems found. References, citations, labels, environments and math all resolve.'; body.appendChild(e); return; }
      for (const x of probs) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'prob ' + x.sev + (x.tex ? ' tex' : '');
        const dot = document.createElement('span'); dot.className = 'sev';
        const msg = document.createElement('span'); msg.textContent = x.msg;
        const where = document.createElement('span'); where.className = 'where'; where.textContent = x.f + (x.line ? ':' + x.line : '');
        b.append(dot, msg, where);
        b.addEventListener('click', () => { this.goTo(x.f, x.p); if (window.innerWidth <= 860) this.toggleNav(false); });
        body.appendChild(b);
      }
      return;
    }
  },

  headingEl(f, s) {
    for (const B of this.renderer.blocks) if (B.f === f && B.s <= s && B.e > s) return B.items[0] && B.items[0].el;
    return null;
  },

  markCurrentHeading() {
    if (this.navOpen('outline') && this.navView === 'pages') this.markPage();
    if (!this.navHeads || !document.body.classList.contains('nav-on') || this.navTab !== 'outline') return;
    const D = this.desk.getBoundingClientRect();
    let cur = null;
    for (const x of this.navHeads) {
      const el = this.headingEl(x.h.f, x.h.s);
      if (el && el.isConnected && el.getBoundingClientRect().top < D.top + 120) cur = x;
    }
    for (const x of this.navHeads) x.b.classList.toggle('cur', x === cur);
  },

  // ---- the Navigation pane (the Outline tab): Word's search box, Headings, Pages, Results ----
  // Its frame is made once and kept while the tab is open (the box keeps what is typed in it and
  // its focus through every rebuild of the page); only the open view is drawn again.
  renderOutline(body) {
    let shell = body.firstElementChild;
    if (!shell || !shell.classList.contains('nv')) { body.replaceChildren(); shell = this.navShell(); body.append(shell); }
    this.navView = this.navView || 'headings';
    const N = this.nv;
    for (const [id] of VIEWS) { const t = N.tabs[id], on = id === this.navView; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; t.classList.toggle('on', on); }
    N.view.setAttribute('aria-labelledby', N.tabs[this.navView].id);
    N.tools.hidden = this.navView !== 'headings';
    this.paintNavFind();
    if (this.navView === 'headings') this.paintHeadings();
    else if (this.navView === 'pages') this.paintPages();
  },

  navShell() {
    const shell = mk('div', 'nv');
    const box = mk('div', 'nv-find');
    box.insertAdjacentHTML('beforeend', SVG(ICON.find));
    const q = mk('input', 'nv-q');
    q.type = 'search'; q.placeholder = 'Search document'; q.setAttribute('aria-label', 'Search document'); q.autocomplete = 'off'; q.spellcheck = false;
    q.title = 'Find in the document\'s text (Ctrl+F on the page); Enter for the next, Shift+Enter the one before, Escape back to the page';
    const opt = mk('button', 'nv-ib');
    opt.type = 'button'; opt.setAttribute('aria-label', 'Search options'); opt.title = 'Match case, whole words, wildcards; Advanced Find, Replace, Go To; figures, tables, equations';
    opt.setAttribute('aria-haspopup', 'menu'); opt.setAttribute('aria-expanded', 'false');
    opt.insertAdjacentHTML('beforeend', SVG(ICON.caret));
    box.append(q, opt);
    const res = mk('div', 'nv-res');
    const count = mk('span', 'nv-count');
    count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
    const prev = mk('button', 'nv-ib'), next = mk('button', 'nv-ib');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Previous result'); next.setAttribute('aria-label', 'Next result');
    prev.title = 'Previous result (Shift+Enter)'; next.title = 'Next result (Enter)';
    prev.insertAdjacentHTML('beforeend', SVG(ICON.up)); next.insertAdjacentHTML('beforeend', SVG(ICON.down));
    res.append(count, prev, next);
    const tl = mk('div', 'nv-tabs');
    tl.setAttribute('role', 'tablist'); tl.setAttribute('aria-label', 'Navigation');
    const tabs = {};
    for (const [id, name] of VIEWS) {
      const t = mk('button', 'nv-tab', name);
      t.type = 'button'; t.id = 'nv-t-' + id; t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'nv-view'); t.dataset.view = id;
      tl.append(t); tabs[id] = t;
    }
    // the outlining tools act on the heading or paragraph chosen in the list (or the caret's)
    const tools = mk('div', 'nv-tools');
    tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Outlining');
    const tool = (name, icon, title, fn) => { const b = mk('button', 'nv-ib'); b.type = 'button'; b.setAttribute('aria-label', name); b.title = title; b.insertAdjacentHTML('beforeend', SVG(icon)); b.addEventListener('click', fn); tools.append(b); return b; };
    const T = {
      promote: tool('Promote', ICON.promote, 'Promote the heading and those under it (Alt+Shift+←)', () => this.navAct('promote')),
      demote: tool('Demote', ICON.demote, 'Demote the heading and those under it (Alt+Shift+→)', () => this.navAct('demote')),
      up: tool('Move up', ICON.mup, 'Move the section, or the paragraph, before the one above it (Alt+Shift+↑)', () => this.navAct('up')),
      down: tool('Move down', ICON.mdown, 'Move the section, or the paragraph, after the one below it (Alt+Shift+↓)', () => this.navAct('down')),
      expand: tool('Expand all', ICON.plus, 'Show every heading under every heading', () => { this.navCollapsed = new Set(); this.paintHeadings(); }),
      collapse: tool('Collapse all', ICON.minus, 'Show the top headings alone', () => { this.navCollapsed = new Set(this.renderer.blocks.filter((B) => B.items[0] && B.items[0].kind === 'h').map((B) => 'h' + B.id)); this.paintHeadings(); })
    };
    const lv = mk('select', 'nv-lv');
    lv.setAttribute('aria-label', 'Show levels'); lv.title = 'How many levels of headings the list shows';
    for (const [v, n] of [['1', 'Level 1'], ['2', 'Level 2'], ['3', 'Level 3'], ['4', 'Level 4'], ['5', 'Level 5'], ['9', 'All levels']]) lv.add(new Option(n, v));
    lv.addEventListener('change', () => { this.navLevels = +lv.value; this.paintHeadings(); });
    const txt = mk('label', 'nv-chk');
    const tc = mk('input'); tc.type = 'checkbox'; tc.setAttribute('aria-label', 'Show text'); txt.title = 'The paragraphs under each heading too, as Word\'s Outline view shows them';
    txt.append(tc, document.createTextNode(' Text'));
    tc.addEventListener('change', () => { this.navBody = tc.checked; this.paintHeadings(); });
    const one = mk('label', 'nv-chk');
    const oc = mk('input'); oc.type = 'checkbox'; oc.checked = true; oc.setAttribute('aria-label', 'Show first line only'); one.title = 'Each paragraph by its first line';
    one.append(oc, document.createTextNode(' First line'));
    oc.addEventListener('change', () => { this.navFirst = oc.checked; this.paintHeadings(); });
    tools.append(mk('span', 'nv-sep'), lv, txt, one);
    const view = mk('div', 'nv-view');
    view.id = 'nv-view'; view.setAttribute('role', 'tabpanel');
    const top = mk('div', 'nv-top');
    top.append(box, res, tl, tools);
    shell.append(top, view);
    this.nv = { shell, q, opt, res, count, prev, next, tabs, tools, T, lv, tc, oc, view };
    this.navFirst = this.navFirst ?? true;

    // the box searches as one types (as Word's does), and shows the results
    let t = 0;
    q.value = this.fs && this.fs.on ? this.fs.q : '';
    q.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!q.value && !(this.fr && !this.fr.d.hidden)) { this.findState().q = ''; this.findClear(); this.paintNavFind(); return; }
        if (this.navView !== 'results' && q.value) this.setNavView('results');
        this.findSet({ q: q.value, obj: null });
      }, 180);
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); clearTimeout(t);
        if (this.findState().q !== q.value || !this.fs.on) this.findSet({ q: q.value, obj: null });
        this.findGo(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        // back to the page, the result shown selected there (as Word leaves it)
        e.preventDefault(); e.stopPropagation();
        this.findSelectCur();
        if (window.innerWidth <= 860) this.toggleNav(false);
      }
    });
    prev.addEventListener('click', () => this.findGo(-1));
    next.addEventListener('click', () => this.findGo(1));
    opt.addEventListener('click', () => {
      const fs = this.findState();
      const items = SEARCH_OPTS.map(([k, name]) => ({ name, checked: !!fs.o[k], run: () => { this.findSet({ o: { [k]: !fs.o[k] }, q: q.value }); q.focus(); } }));
      items.push(null, { name: 'Advanced Find', run: () => openFindDialog(this, 'find') }, { name: 'Replace', keys: 'Ctrl+H', run: () => openFindDialog(this, 'replace') }, { name: 'Go To', keys: 'Ctrl+G', run: () => openFindDialog(this, 'goto') }, null);
      for (const [k, name] of OBJS) items.push({ name: 'Find ' + name.toLowerCase(), title: 'List the document\'s ' + name.toLowerCase() + ' under Results', run: () => { this.findState().obj = k; this.setNavView('results'); } });
      openMenu(this, opt, items, { label: 'Search options' });
    });
    tl.addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) this.setNavView(b.dataset.view, true); });
    tl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const all = VIEWS.map(([id]) => tabs[id]), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const to = all[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      this.setNavView(to.dataset.view, true);
      to.focus();
    });
    return shell;
  },

  setNavView(v, focus) {
    this.navView = v;
    if (!this.navOpen('outline')) { this.toggleNav(true, 'outline'); return; }
    this.renderOutline($('#nav-body'));
    if (v === 'results') this.paintResults();
    if (focus && this.nv) this.nv.tabs[v].focus();
  },

  // Ctrl+F: the Navigation pane open on its box, with the words selected on the page in it
  findInPane() {
    const s = getSelection();
    const words = s.rangeCount && this.root.contains(s.anchorNode) && !s.isCollapsed ? String(s).trim() : '';
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    if (!this.navOpen('outline')) this.toggleNav(true, 'outline');
    const N = this.nv;
    if (!N) return;
    if (words && words.length <= 80 && !/\n/.test(words)) { N.q.value = words; this.setNavView('results'); this.findSet({ q: words, obj: null }); }
    else if (N.q.value) { this.setNavView('results'); if (!this.fs || !this.fs.on) this.findSet({ q: N.q.value, obj: null }); }
    N.q.focus();
    N.q.select();
  },

  // the count, the arrows, and the Results view, from the search's state
  paintNavFind() {
    const N = this.nv;
    if (!N || !N.shell.isConnected) return;
    const fs = this.findState();
    // (the box says what is searched for; nothing once the search was put away)
    const want = fs.on ? fs.q : '';
    if (document.activeElement !== N.q && N.q.value !== want) N.q.value = want;
    const t = this.findSummary();
    N.res.hidden = !t;
    if (N.count.textContent !== t) N.count.textContent = t;
    N.prev.disabled = N.next.disabled = !fs.hits.length;
    if (this.navView === 'results') this.paintResults();
  },

  // Results: the hits with their context (the document's words, as text), or the figures,
  // tables, equations, footnotes or comments asked for in the options
  paintResults() {
    const N = this.nv;
    if (!N) return;
    const view = N.view, fs = this.findState();
    view.replaceChildren();
    if (fs.obj && !fs.q) {
      const name = OBJS.find((o) => o[0] === fs.obj)[1];
      const list = this.goToTargets(fs.obj);
      view.append(mk('div', 'nv-h', name + ': ' + list.length));
      if (!list.length) view.append(mk('div', 'nav-empty', 'None in this document.'));
      list.slice(0, 400).forEach((x, k) => {
        const b = mk('button', 'nv-hit');
        b.type = 'button';
        b.append(mk('b', '', name.replace(/s$/, '') + ' ' + (x.num || k + 1)), document.createTextNode(x.text ? ' ' + x.text.slice(0, 90) : ''));
        b.addEventListener('click', () => { this.restoreCaret({ f: x.f, p: x.p, bias: 1 }, true); this.goTo(x.f, x.p); if (window.innerWidth <= 860) this.toggleNav(false); });
        view.append(b);
      });
      return;
    }
    if (!fs.on || (!fs.q && !fs.o.fmt)) { view.append(mk('div', 'nav-empty', 'Type in the box above to search the document\'s text. Search options has Match case, wildcards, regular expressions and In LaTeX source; Replace is Ctrl+H.')); return; }
    if (!fs.hits.length) { view.append(mk('div', 'nav-empty', fs.msg || 'No results. The search looks in the text the page shows; to look in commands, labels and math, tick In LaTeX source under Search options.')); return; }
    const MAXL = 300;
    fs.hits.slice(0, MAXL).forEach((h, k) => {
      const b = mk('button', 'nv-hit' + (k === fs.cur ? ' on' : ''));
      b.type = 'button';
      if (h.src) {
        const line = this.src(h.f), a = Math.max(0, line.lastIndexOf('\n', h.s - 1) + 1), z = line.indexOf('\n', h.e);
        const lt = line.slice(Math.max(a, h.s - 40), h.s), rt = line.slice(h.e, Math.min(z < 0 ? line.length : z, h.e + 40));
        b.classList.add('src');
        b.append(mk('span', 'nv-where', h.f), document.createTextNode(lt), mk('mark', '', line.slice(h.s, h.e)), document.createTextNode(rt));
      } else {
        const [l, m, r] = context(h.T.text, h.i, h.j);
        b.append(document.createTextNode(l), mk('mark', '', m), document.createTextNode(r));
        if (h.ro) b.title = 'Drawn by a macro: found, not replaced here';
      }
      b.addEventListener('click', () => { this.findTo(k); this.findSelectCur(); if (window.innerWidth <= 860) this.toggleNav(false); });
      view.append(b);
    });
    if (fs.hits.length > MAXL) view.append(mk('div', 'nav-empty', 'And ' + (fs.hits.length - MAXL).toLocaleString('en-US') + ' more: Enter in the box goes through them all.'));
    const on = view.querySelector('.nv-hit.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  },

  // ---- Headings: the document's outline, each heading a row that goes there; collapsed and
  // expanded, dragged to move its section, promoted, demoted and moved with the toolbar or
  // Alt+Shift and the arrows; in the Outline view the paragraphs under them as well
  paintHeadings() {
    const N = this.nv, m = this.model;
    if (!N || !m) return;
    // (not under a row being dragged: the drag would end; it is drawn when the drag ends)
    if (this.navDrag) { this.navLate = true; return; }
    const view = N.view;
    const had = view.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const levels = this.navLevels || (this.outlineView ? 9 : 3), withText = this.navBody ?? !!this.outlineView;
    N.lv.value = String(levels > 5 ? 9 : levels);
    N.tc.checked = withText; N.oc.checked = this.navFirst; N.oc.disabled = !withText;
    const H = m.headings || [];
    const hs = H.map((h, k) => ({ h, k })).filter((x) => x.h.level <= levels && x.h.s >= 0);
    this.navCollapsed = this.navCollapsed || new Set();
    if (!hs.length && !withText) {
      this.navSig = null;
      view.replaceChildren();
      view.append(mk('div', 'nav-empty', 'No headings yet. Headings appear here as you add them: Heading 1 is \\section{...}.'));
      this.navHeads = [];
      this.navTools();
      return;
    }
    const top = hs.length ? Math.min(...hs.map((x) => x.h.level)) : 1;
    // the rows in the document's order: a heading, or a block of text under the heading before it
    // (not the contents or the bibliography). Each knows its block: its key and the signature of
    // the rows are the blocks' ids, which an edit elsewhere leaves as they are, so typing in a
    // long document does not draw every row again.
    const byPos = new Map();
    for (const B of this.renderer.blocks) if (B.items[0] && B.items[0].kind === 'h') byPos.set(B.f + ':' + B.s, B);
    const rows = [];
    if (withText) {
      const headAt = new Map(H.map((h, k) => [h.f + ':' + h.s, k]));
      for (const B of this.renderer.blocks) {
        const k = B.items[0] && B.items[0].kind === 'h' ? headAt.get(B.f + ':' + B.s) : null;
        if (k != null) { if (H[k].level <= levels) rows.push({ k, h: H[k], B }); continue; }
        if (!B.items.length || B.items.some((it) => it.kind === 'refs' || it.kind === 'toc')) continue;
        if (/[^\s\n￼]/.test(blockText(B).text) || B.atoms.length) rows.push({ B });
      }
    } else for (const x of hs) rows.push({ k: x.k, h: x.h, B: byPos.get(x.h.f + ':' + x.h.s) || null });
    const keyOf = (r) => (r.h ? 'h' : 'b') + (r.B ? r.B.id : 'k' + r.k);
    const sig = JSON.stringify([levels, withText, this.navFirst, [...this.navCollapsed], rows.map((r) => r.h ? [keyOf(r), r.h.level, r.h.num, r.h.text] : keyOf(r))]);
    // (one paragraph typed in, in the Outline view: its block was drawn again, so its row alone
    // takes its new block and words; nothing else is drawn again)
    const keys = rows.map(keyOf);
    if (sig !== this.navSig && this.navKeys && this.navRows && view.querySelector('.nv-row') && this.navSet === JSON.stringify([levels, withText, this.navFirst, [...this.navCollapsed]])
      && keys.length === this.navKeys.length && this.navRows.length === rows.length) {
      const diffAt = [];
      for (let i = 0; i < keys.length && diffAt.length < 8; i++) if (keys[i] !== this.navKeys[i]) diffAt.push(i);
      if (diffAt.length && diffAt.length < 8 && diffAt.every((i) => !rows[i].h && !this.navRows[i].h)) {
        for (const i of diffAt) {
          const x = this.navRows[i], r = rows[i], key = keys[i], b = x.row.querySelector('.nv-txt');
          if (this.navSel === x.key) this.navSel = key;
          x.B = r.B; x.key = key; x.row.dataset.key = key;
          if (b) { b.dataset.key = key; const words = blockText(r.B).text.replace(/[\n\uFFFC\s]+/g, ' ').trim(); b.textContent = words.slice(0, this.navFirst ? 200 : 2000); }
        }
        const byKey = new Map(rows.map((r) => [keyOf(r), r]));
        for (const x of this.navRows) { const r = byKey.get(x.key); if (r) { x.h = r.h; x.k = r.k; } }
        for (const x of this.navHeads || []) { const r = byKey.get(x.key); if (r) x.h = r.h; }
        this.navSig = sig; this.navKeys = keys;
        this.markCurrentHeading(); this.navTools();
        return;
      }
    }
    if (sig === this.navSig && view.querySelector('.nv-row') && this.navRows) {
      // the same rows: each takes the model's heading and place as they are now
      const byKey = new Map(rows.map((r) => [keyOf(r), r]));
      for (const x of this.navRows) { const r = byKey.get(x.key); if (r) { x.h = r.h; x.k = r.k; x.B = r.B; } }
      for (const x of this.navHeads || []) { const r = byKey.get(x.key); if (r) x.h = r.h; }
      this.markCurrentHeading(); this.navTools();
      return;
    }
    this.navSig = sig; this.navKeys = keys;
    this.navSet = JSON.stringify([levels, withText, this.navFirst, [...this.navCollapsed]]);
    view.replaceChildren();
    // a tree, as Word's: its rows are tree items with their level; the arrows move, Left and Right
    // collapse and expand (the triangles are the mouse's way to the same)
    const tree = mk('div', 'nv-tree');
    tree.setAttribute('role', 'tree'); tree.setAttribute('aria-label', withText ? 'Outline' : 'Headings');
    view.append(tree);
    // what is hidden under a collapsed heading: the rows after it until one of its level or higher
    let hideTo = null, depth = 0;
    const kids = (i) => { const r = rows[i], x = rows[i + 1]; return !!x && !(x.h && x.h.level <= r.h.level); };
    this.navHeads = [];
    this.navRows = [];
    rows.forEach((r, i) => {
      if (r.h) {
        if (hideTo != null && r.h.level <= hideTo) hideTo = null;
        depth = Math.min(5, r.h.level - top);
      }
      if (hideTo != null) return;
      const row = mk('div', 'nv-row' + (r.h ? '' : ' nv-b'));
      row.style.setProperty('--d', String(r.h ? depth : depth + 1));
      const key = keyOf(r);
      const x = { ...r, key, row };
      if (r.h) {
        const ck = key, has = kids(i), shut = has && this.navCollapsed.has(ck);
        if (has) {
          const tg = mk('button', 'nv-tog');
          tg.type = 'button'; tg.tabIndex = -1;
          tg.setAttribute('aria-hidden', 'true');
          tg.title = (shut ? 'Expand ' : 'Collapse ') + (r.h.text || 'heading');
          tg.insertAdjacentHTML('beforeend', SVG(ICON.tog));
          tg.addEventListener('click', () => this.navToggle(ck));
          row.append(tg);
        } else row.append(mk('span', 'nv-tog none'));
        const b = mk('button', 'nav-item l' + Math.min(3, r.h.level - top));
        b.type = 'button'; b.dataset.key = key; b.draggable = true;
        b.setAttribute('role', 'treeitem'); b.setAttribute('aria-level', String(depth + 1));
        b.setAttribute('aria-label', ((r.h.star ? '' : (r.h.num || '')) + ' ' + (r.h.text || '')).trim());
        const n = mk('span', 'num', r.h.star ? '' : (r.h.num || ''));
        const t = mk('span', '', r.h.text || '');
        b.append(n, t);
        if (has) b.setAttribute('aria-expanded', shut ? 'false' : 'true');
        b.addEventListener('click', () => { this.navSel = key; this.goTo(x.h.f, x.h.s, true); if (window.innerWidth <= 860) this.toggleNav(false); });
        row.append(b);
        this.navHeads.push({ h: r.h, b, key });
        if (shut) hideTo = r.h.level;
      } else {
        row.append(mk('span', 'nv-tog none'));
        const b = mk('button', 'nv-txt' + (this.navFirst ? ' one' : ''));
        b.type = 'button'; b.dataset.key = key; b.draggable = true;
        b.setAttribute('role', 'treeitem'); b.setAttribute('aria-level', String(depth + 2));
        // (the page's own words, as text: the first line, or all of it; a formula or a figure by
        // what the page draws for it)
        const words = blockText(r.B).text.replace(/[\n￼\s]+/g, ' ').trim();
        b.textContent = (words || r.B.items.map((it) => it.el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ')).slice(0, this.navFirst ? 200 : 2000);
        b.addEventListener('click', () => { this.navSel = key; this.goTo(x.B.f, x.B.s); });
        row.append(b);
      }
      row.dataset.key = key;
      this.navRows.push(x);
      tree.append(row);
    });
    if (had) { const b = view.querySelector('button[data-key="' + CSS.escape(had) + '"]'); if (b) b.focus({ preventScroll: true }); }
    this.navTreeEvents(view);
    this.markCurrentHeading();
    this.navTools();
  },

  navToggle(ck) {
    const set = this.navCollapsed || (this.navCollapsed = new Set());
    if (set.has(ck)) set.delete(ck); else set.add(ck);
    this.paintHeadings();
  },

  // the row the toolbar acts on: the one last chosen, else the heading of the caret
  navRow() {
    const rows = this.navRows || [];
    let r = this.navSel && rows.find((x) => x.key === this.navSel);
    if (!r) { const cur = (this.navHeads || []).find((x) => x.b.classList.contains('cur')); r = cur && rows.find((x) => x.h === cur.h); }
    return r || null;
  },
  // a row's block of the page, to move it as Move up and Move down move the caret's
  navAt(r) {
    const B = r.B || this.renderer.blocks.find((X) => X.f === r.h.f && X.s === r.h.s);
    if (!B || !B.items[0]) return null;
    const it = B.items[0].el;
    return { B, it, el: it, c: { f: B.f, a: B.s, b: B.s, p: B.s, collapsed: true }, ctx: it.dataset.ctx || '', cell: false, memo: {} };
  },
  navTools() {
    const N = this.nv;
    if (!N) return;
    const r = this.navRow(), at = r && this.navAt(r);
    const k = r && r.h ? r.k : -1;
    N.T.promote.disabled = !(k >= 0 && this.promoteEdits(k, -1));
    N.T.demote.disabled = !(k >= 0 && this.promoteEdits(k, 1));
    N.T.up.disabled = !(at && this.moveEditsAt(at, -1));
    N.T.down.disabled = !(at && this.moveEditsAt(at, 1));
  },
  navAct(what) {
    const r = this.navRow();
    if (!r) return;
    // where the heading or paragraph will be, for the row chosen to follow it
    let f = null, p = 0;
    if (what === 'promote' || what === 'demote') {
      if (!r.h) return;
      f = r.h.f; p = r.h.s;
      this.promoteAt(r.k, what === 'promote' ? -1 : 1);
    } else {
      const at = this.navAt(r), dir = what === 'up' ? -1 : 1, mv = at && this.moveEditsAt(at, dir);
      if (!mv) return;
      this.commitMove(mv, null, dir);
      const c = this.caretNow();
      if (c) { f = c.f; p = c.a; }
    }
    if (!this.navOpen('outline')) return;
    this.refreshNav();
    const x = f != null && (this.navRows || []).find((y) => y.B && y.B.f === f && y.B.s <= p && p <= y.B.e);
    if (x) this.navSel = x.key;
    const b = this.nv && this.nv.view.querySelector('button[data-key="' + CSS.escape(this.navSel || r.key) + '"]');
    if (b) b.focus({ preventScroll: true });
  },

  // the tree's keys and dragging, set once on its view
  navTreeEvents(view) {
    if (view.navWired) return;
    view.navWired = true;
    const rowOf = (el) => { const row = el && el.closest && el.closest('.nv-row'); return row && (this.navRows || []).find((x) => x.row === row); };
    view.addEventListener('focusin', (e) => { const r = rowOf(e.target); if (r) { this.navSel = r.key; this.navTools(); } });
    view.addEventListener('keydown', (e) => {
      const r = rowOf(e.target);
      if (!r || !e.target.matches('.nav-item, .nv-txt')) return;
      const all = [...view.querySelectorAll('.nav-item, .nv-txt')], i = all.indexOf(e.target);
      if (e.altKey && e.shiftKey && /^Arrow/.test(e.key)) {
        e.preventDefault();
        this.navSel = r.key;
        this.navAct({ ArrowLeft: 'promote', ArrowRight: 'demote', ArrowUp: 'up', ArrowDown: 'down' }[e.key]);
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const to = (j) => { const b = all[Math.max(0, Math.min(all.length - 1, j))]; if (b) { e.preventDefault(); b.focus(); } };
      if (e.key === 'ArrowDown') to(i + 1);
      else if (e.key === 'ArrowUp') to(i - 1);
      else if (e.key === 'Home') to(0);
      else if (e.key === 'End') to(all.length - 1);
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && r.h) {
        const ck = r.key, shut = (this.navCollapsed || new Set()).has(ck), tg = r.row.querySelector('button.nv-tog');
        if (tg && (e.key === 'ArrowLeft') !== shut) { e.preventDefault(); this.navSel = r.key; this.navToggle(ck); }
      }
    });
    // dragging: a heading moves its section before the heading it is dropped on (or after that
    // heading's section, on its lower half); a paragraph of the Outline view moves before the row
    // it is dropped on, or after it
    const clear = () => { for (const x of view.querySelectorAll('.drop-a, .drop-b')) x.classList.remove('drop-a', 'drop-b'); };
    const target = (e) => {
      const r = rowOf(e.target), d = this.navDrag;
      if (!r || !d || r.key === d.key) return null;
      if (d.h && !r.h) return null;
      const R = r.row.getBoundingClientRect(), after = e.clientY > R.top + R.height / 2;
      return { r, after };
    };
    view.addEventListener('dragstart', (e) => {
      const r = rowOf(e.target);
      if (!r) return;
      this.navDrag = r;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', r.h ? (r.h.text || '') : 'paragraph');
      r.row.classList.add('dragging');
    });
    view.addEventListener('dragend', () => { clear(); for (const x of view.querySelectorAll('.dragging')) x.classList.remove('dragging'); this.navDrag = null; if (this.navLate) { this.navLate = false; this.paintHeadings(); } });
    view.addEventListener('dragover', (e) => {
      const t = target(e);
      clear();
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      t.r.row.classList.add(t.after ? 'drop-a' : 'drop-b');
    });
    view.addEventListener('dragleave', (e) => { if (!view.contains(e.relatedTarget)) clear(); });
    view.addEventListener('drop', (e) => {
      const t = target(e), d = this.navDrag;
      clear();
      if (!t || !d) return;
      e.preventDefault();
      this.navDrag = null; this.navLate = false;
      this.navDrop(d, t.r, t.after);
    });
  },
  // where a dragged row lands: before row r, or (after) past it. Past the last row is the end of
  // its section or its paragraph, never past \appendix or the bibliography (sectionRange stops
  // before them; the Outline view lists neither the contents nor the bibliography as rows).
  navDrop(d, r, after) {
    const H = this.model.headings || [];
    if (d.h) {
      if (!after) return r.k === d.k ? false : this.moveSectionTo(d.k, r.k);
      for (let j = r.k + 1; j < H.length; j++) if (H[j].level <= r.h.level) return j === d.k ? false : this.moveSectionTo(d.k, j);
      return this.moveSectionTo(d.k, r.k, true);
    }
    const rows = this.navRows || [], i = rows.indexOf(r), f = d.B.f;
    const fileOf = (x) => x.h ? x.h.f : x.B.f;
    if (fileOf(r) !== f) { this.toast('Paragraphs move within their file.'); return false; }
    if (!after) return this.moveBlockTo(d.B, f, r.h ? r.h.s : r.B.s);
    const n = rows[i + 1];
    if (n && fileOf(n) === f) return this.moveBlockTo(d.B, f, n.h ? n.h.s : n.B.s);
    const end = r.h ? this.sectionOf(r.k) : { e: r.B.e };
    return !!end && this.moveBlockTo(d.B, f, end.e, true);
  },

  // Ctrl+Alt+O: Word's Outline view, here the side panel's headings with the paragraphs under
  // them, wide, with the outlining tools; again, or leaving the tab, ends it
  setOutlineView(on, keepPane) {
    if (on && !this.outlineView) this.navBeforeOutline = this.navOpen() ? this.navTab : null;
    this.outlineView = !!on;
    this.navBody = undefined; this.navLevels = undefined;
    if (on) { this.navView = 'headings'; this.toggleNav(true, 'outline'); }
    else {
      document.body.classList.remove('nav-wide', 'nav-outline');
      // (back to the panel as it was before, or to the Navigation pane when that was asked for)
      const was = keepPane ? 'outline' : this.navBeforeOutline;
      if (was) this.toggleNav(true, was); else if (this.navOpen()) this.toggleNav(false);
    }
    if (on && this.nv) { const b = this.nv.view.querySelector('.nav-item.cur') || this.nv.view.querySelector('.nav-item, .nv-txt'); if (b) b.focus({ preventScroll: true }); }
    this.ribbonSync && this.ribbonSync();
  },

  // ---- Pages: each page drawn small, the one in view marked; a click goes there ---------------
  // (a copy of the page's drawing, made only for the thumbnails in sight, with nothing in it to
  // edit or to load: no frames, no ids, no source maps)
  paintPages() {
    const N = this.nv;
    if (!N || !this.layout) return;
    const view = N.view;
    view.replaceChildren();
    if (this.thumbObs) this.thumbObs.disconnect();
    const pages = this.layout.pages;
    const grid = mk('div', 'nv-pages');
    const W = 116;
    this.thumbObs = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { this.fillThumb(e.target); this.thumbObs.unobserve(e.target); } }, { root: $('#nav-body'), rootMargin: '200px' }) : null;
    pages.forEach((P, k) => {
      const b = mk('button', 'nv-page');
      b.type = 'button'; b.setAttribute('aria-label', 'Page ' + (k + 1)); b.title = 'Go to page ' + (k + 1);
      const w = P.el.offsetWidth || 600, h = P.el.offsetHeight || 800;
      const box = mk('div', 'nv-pg');
      box.style.width = W + 'px'; box.style.height = Math.round(h * W / w) + 'px';
      box.dataset.k = String(k);
      box.setAttribute('aria-hidden', 'true');
      b.append(box, mk('span', 'nv-pn', String(k + 1)));
      b.addEventListener('click', () => { this.goToPage(k); this.markPage(); if (window.innerWidth <= 860) this.toggleNav(false); });
      grid.append(b);
      if (this.thumbObs) this.thumbObs.observe(box); else this.fillThumb(box);
    });
    view.append(grid);
    this.markPage();
  },
  fillThumb(box) {
    const P = this.layout.pages[+box.dataset.k];
    if (!P || box.firstChild) return;
    const c = P.el.cloneNode(true);
    for (const x of c.querySelectorAll('iframe, object, embed, video, audio, .mk-layer, .cm-layer, .wbox iframe')) x.remove();
    for (const x of [c, ...c.querySelectorAll('*')]) {
      for (const a of [...x.attributes]) if (a.name === 'id' || a.name === 'contenteditable' || a.name === 'tabindex' || a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'role') x.removeAttribute(a.name);
    }
    // (inside a copy of the sheet's frame: the page's size, fonts and type come from its variables)
    const sh = mk('div', 'sheet nv-pgc');
    sh.style.cssText = this.sheet.style.cssText;
    if (this.sheet.dataset.font) sh.setAttribute('data-font', this.sheet.dataset.font);
    sh.lang = this.sheet.lang;
    const w = P.el.offsetWidth || 600;
    sh.style.width = w + 'px';
    sh.style.transform = 'scale(' + (box.clientWidth / w) + ')';
    sh.inert = true;
    sh.append(c);
    box.append(sh);
  },
  markPage() {
    const N = this.nv;
    if (!N || this.navView !== 'pages') return;
    const k = this.currentPage() - 1;
    for (const b of N.view.querySelectorAll('.nv-page')) b.classList.toggle('cur', +b.firstChild.dataset.k === k);
  },

  // Show a source position on the page (and in the source pane if it is open).
  goTo(f, p, heading) {
    let el = heading ? this.headingEl(f, p) : null;
    if (!el) {
      const r = this.index.find(f, p, 1);
      if (r && r.node) el = r.node.nodeType === 1 ? r.node : r.node.parentElement;
    }
    if (!el || !el.isConnected) el = this.headingEl(f, p);
    if (el && el.isConnected) {
      const it = el.closest('.it') || el;
      const R = it.getBoundingClientRect(), D = this.desk.getBoundingClientRect();
      this.desk.scrollTop += R.top - D.top - (heading ? 24 : D.height / 3);
      it.classList.remove('flash'); void it.offsetWidth; it.classList.add('flash');
      setTimeout(() => it.classList.remove('flash'), 900);
    }
    if (document.body.classList.contains('src-on') || !el) this.reveal(f, p, false);
  }
};

// The side panel's navigation: the Outline (the document's headings, the one in view marked)
// and the Problems (TeX's own and the page's), the panel opened and closed, a place in the
// source shown on the page. The Review and Git tabs draw themselves (src/review.js, the git
// methods of src/app.js); refreshNav hands the panel to them. The methods join App's prototype.

import { $, store, PREFS } from './ui/dom.js';
import { atomOfEl } from './editor.js';
import { findProblems } from './problems.js';
import { spacingOnly } from './diff.js';
import { commentOnly } from './share.js';

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

  toggleNav(force, tab) {
    const on = force ?? !document.body.classList.contains('nav-on');
    document.body.classList.toggle('nav-on', on);
    $('#b-nav').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (tab) this.navTab = tab;
    this.navTab = this.navTab || 'outline';
    document.body.classList.toggle('nav-wide', this.navTab === 'changes' || this.navTab === 'git');
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
    const hs = (this.model.headings || []).filter((h) => h.level <= 3);
    if (!hs.length) { const e = document.createElement('div'); e.className = 'nav-empty'; e.textContent = 'No sections yet. Headings appear here as you add \\section{...}.'; body.appendChild(e); return; }
    const top = Math.min(...hs.map((h) => h.level));
    this.navHeads = hs.map((h) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'nav-item l' + Math.min(3, h.level - top);
      const n = document.createElement('span'); n.className = 'num'; n.textContent = h.star ? '' : (h.num || '');
      const t = document.createElement('span'); t.textContent = h.text || '';
      b.append(n, t);
      b.addEventListener('click', () => { this.goTo(h.f, h.s, true); if (window.innerWidth <= 860) this.toggleNav(false); });
      body.appendChild(b);
      return { h, b };
    });
    this.markCurrentHeading();
  },

  headingEl(f, s) {
    for (const B of this.renderer.blocks) if (B.f === f && B.s <= s && B.e > s) return B.items[0] && B.items[0].el;
    return null;
  },

  markCurrentHeading() {
    if (!this.navHeads || !document.body.classList.contains('nav-on') || this.navTab !== 'outline') return;
    const D = this.desk.getBoundingClientRect();
    let cur = null;
    for (const x of this.navHeads) {
      const el = this.headingEl(x.h.f, x.h.s);
      if (el && el.isConnected && el.getBoundingClientRect().top < D.top + 120) cur = x;
    }
    for (const x of this.navHeads) x.b.classList.toggle('cur', x === cur);
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

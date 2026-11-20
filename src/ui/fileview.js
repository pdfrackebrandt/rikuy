// File as Word's view (its "backstage"): File's commands over the window below the tabs, with a
// Back button. Esc, Back, or any command run from it give the document back, as Word does; the
// tab that was open before comes back. The sheet itself is the ribbon's File panel
// (src/ribbon/tabs.js builds it; app.css's "File as a view" lays it over the page). `app` is the
// editor (src/app.js).

import { $, mk } from './dom.js';
import { command } from '../commands.js';

const isOpen = () => document.body.classList.contains('file-open');
const BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M11.5 6.5 8 10l3.5 3.5"/></svg>';

export function installFileView(app) {
  // (src/ribbon/tabs.js's selectTab calls this as File opens or closes)
  app.fileViewChanged = (on, was) => {
    if (!on) return;
    app.fileFrom = was && was !== 'file' ? was : app.fileFrom || 'home';
    // the caret or selection the document had, put back when the view is left with Esc or Back
    const at = app.caretNow ? app.caretNow() : null;
    app.fileBack = at && !at.ghost && !at.crossFile ? { c: at.collapsed ? { f: at.f, p: at.p } : { f: at.f, selA: at.a, selB: at.b }, text: app.files.get(at.f) } : null;
    const tb = $('#rp-file .rb-tb');
    if (tb && !$('#rf-back')) {
      const b = mk('button', 'btn ghost rf-back');
      b.id = 'rf-back'; b.type = 'button';
      b.setAttribute('aria-label', 'Back to the document');
      b.title = 'Back to the document (Esc)';
      b.innerHTML = BACK + '<span>Back</span>';
      b.addEventListener('click', () => app.closeFileView(true));
      tb.prepend(b);
    }
  };

  // giveBack: the document's caret again (Esc, Back); a command that ran from the view keeps the
  // focus where it put it (a dialog, the new document's blank paragraph)
  app.closeFileView = (giveBack) => {
    if (!isOpen()) return;
    const to = app.fileFrom && app.rbTabs && app.rbTabs.includes(app.fileFrom) && app.fileFrom !== 'file' ? app.fileFrom : 'home';
    app.selectTab(to);
    const B = app.fileBack;
    app.fileBack = null;
    const lost = !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('#ribbon, #rb-top');
    if (giveBack && B && lost && !app.pop && app.files.get(B.c.f) === B.text) app.restoreCaret(B.c, true);
  };

  // a command run while the view is open closes it, as Word's do; a menu of the view opening
  // (Templates, Recent, Export as) keeps it until one of its items is chosen
  const run = app.runCommand;
  app.runCommand = function (id, args, at, from) {
    const was = isOpen();
    const r = run.call(this, id, args, at, from);
    const c = was && isOpen() ? command(id) : null;
    if (c && !/^ribbon-/.test(id) && !(c.kind === 'menu' && args == null)) app.closeFileView(false);
    return r;
  };

  // (before the ribbon's own Esc, which would put the focus on the page under the view; a menu or
  // a dialog open over the view, or Alt's KeyTips, take their Esc first)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !isOpen() || app.pop || document.body.classList.contains('keytips')) return;
    if ([...document.querySelectorAll('[role=menu], [role=listbox]')].some((m) => m.offsetParent && !m.closest('#nav'))) return;
    e.preventDefault();
    e.stopPropagation();
    app.closeFileView(true);
  }, true);
}

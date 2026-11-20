// Help as Word has it: a pane at the window's right, under the ribbon, beside the page, that
// stays while the page is worked on (a press on the page does not close it, as it closed the
// popover). On a window narrower than 1000 px Help stays the popover it was. The pane is the
// popover's content moved over (src/app.js openHelp writes it), so the two never differ. `app` is
// the editor (src/app.js).

import { $, mk } from './dom.js';

export const methods = {
  helpPaneOpen() { return !!$('#helppane'); },

  // the Help popover just opened, its content moved into the pane
  dockHelp() {
    const P = this.pop;
    if (!P || !P.el.classList.contains('pop-help')) return;
    const old = $('#helppane');
    if (old) old.remove();
    const pane = mk('aside', 'help-pane pop-help');
    pane.id = 'helppane';
    // (a non-modal dialog named by its title, as the popover was: agents find "How Rikuy works")
    pane.setAttribute('role', 'dialog');
    pane.setAttribute('aria-labelledby', 'help-pane-title');
    const h = mk('div', 'pop-h help-pane-h');
    const t = mk('span', '', 'How Rikuy works');
    t.id = 'help-pane-title';
    const x = mk('button', 'pop-x');
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.title = 'Close Help'; x.innerHTML = '&times;';
    x.addEventListener('click', () => this.closeHelpPane(true));
    h.append(t, x);
    const body = mk('div', 'help-pane-b');
    for (const n of [...P.el.childNodes]) if (!(n.classList && n.classList.contains('pop-h'))) body.append(n);
    pane.append(h, body);
    pane.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); this.closeHelpPane(true); } });
    // (the popover goes without giving anything back: the caret stays where it is)
    this.closePop(true, true);
    ($('#main') || document.body).append(pane);
  },

  // giveBack: Esc or Close from the pane put the caret back on the page
  closeHelpPane(giveBack) {
    const pane = $('#helppane');
    if (!pane) return;
    const had = pane.contains(document.activeElement);
    pane.remove();
    if (giveBack && had && this.ribbonBack) this.ribbonBack();
  }
};

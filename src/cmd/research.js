// Frontier, Rikuy's research tool to come (it reads the work a paper cites and shows how its ideas
// connect), where Word has Researcher: References › Research. Not here yet: a press says so in a
// small popover, with no request to the network and no link.

import { register } from '../commands.js';

// nodes joined by lines: ideas and how they connect (drawn here, no one's mark)
const ICON = '<circle cx="5" cy="6.5" r="2"/><circle cx="14.5" cy="4.5" r="2"/><circle cx="9.5" cy="15" r="2"/><circle cx="16" cy="13" r="1.6"/>'
  + '<path d="M6.9 6.1 12.6 4.9M6 8.3l2.6 4.9M11.4 14.4l3-.9M15 6.4l.8 5"/>';

register({
  id: 'frontier', name: 'Frontier', label: 'Frontier', tab: 'references', group: 'research', icon: ICON,
  title: 'Frontier: research for your paper, overnight (coming soon)',
  synonyms: ['Researcher', 'Research', 'Literature', 'Related work', 'Literature review', 'Frontier'],
  popup: 'dialog', when: () => true, run: (app) => app.openFrontier()
});

export const methods = {
  // the popover: what Frontier will do, that it is coming, and Close (Esc too; the focus goes back
  // to the button that opened it, closePop)
  openFrontier() {
    const anchor = document.getElementById('rc-frontier');
    const p = this.makePop(anchor && anchor.offsetParent ? anchor : null, 'pop-dlg pop-frontier', 'Frontier');
    if (!this.pop.anchor) this.pop.rect = this.desk ? this.desk.getBoundingClientRect() : this.root.getBoundingClientRect();
    const t = document.createElement('p');
    t.id = 'fr-what';
    t.textContent = 'Research for your paper, overnight: it reads the work you cite and shows how its ideas connect.';
    const soon = document.createElement('p');
    soon.className = 'fr-soon'; soon.id = 'fr-soon';
    soon.textContent = 'Coming soon.';
    // (a screen reader hears what it is and that it is coming, with the dialog's name)
    p.setAttribute('aria-describedby', 'fr-what fr-soon');
    const row = document.createElement('div');
    row.className = 'pop-row';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sm'; b.textContent = 'Close';
    b.addEventListener('click', () => this.closePop());
    row.append(b);
    p.append(t, soon, row);
    // (Tab and Shift+Tab go round its two buttons, the corner's Close and this one, while it is open)
    p.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const all = [...p.querySelectorAll('button')].filter((x) => x.offsetParent);
      const i = all.indexOf(document.activeElement);
      e.preventDefault();
      all[(i + (e.shiftKey ? all.length - 1 : 1)) % all.length].focus();
    });
    if (anchor) { anchor.setAttribute('aria-expanded', 'true'); this.pop.onClose = () => anchor.setAttribute('aria-expanded', 'false'); }
    this.positionPop();
    b.focus({ preventScroll: true });
    return true;
  }
};

// Batch B5, find and the outline: the side panel (Outline and problems in the bar, the Navigation
// pane on the View tab; src/nav.js). B5 adds Find, Replace, Go To, the outline's promote and
// demote and the heading's right click menu here.

import { register } from '../commands.js';

const open = (tab) => (app) => document.body.classList.contains('nav-on') && app.navTab === tab;
register(
  { id: 'outline-panel', name: 'Outline and problems', el: 'b-nav', static: true, place: 'bar', title: 'Outline, problems and changes (Ctrl+Shift+O)', keysElsewhere: ['Ctrl+Shift+O'], synonyms: ['Outline', 'Problems', 'Side panel'],
    when: () => true, run: (app) => app.toggleNav() },
  { id: 'navigation-pane', name: 'Navigation pane', title: 'The document\'s headings in the side panel; a click goes there', synonyms: ['Outline', 'Headings', 'Document map'], tab: 'view', group: 'show', el: 'rw-nav', label: 'Navigation pane', kind: 'toggle',
    icon: '<path d="M3.5 4.5h13v11h-13zM8.5 4.5v11M5 7.5h2M5 10h2"/>', when: () => true, on: open('outline'), run: (app) => app.toggleNav(!open('outline')(app), 'outline') }
);

export const methods = {};

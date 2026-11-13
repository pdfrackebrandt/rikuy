// Batch B12, Help: Help in the bar, and the Help tab: how Rikuy works, a problem reported, the
// guide for AI agents. B12 adds the keyboard shortcuts and what's new here.

import { register } from '../commands.js';

const always = () => true;
register(
  { id: 'help', name: 'Help', el: 'b-help', static: true, place: 'bar', only: 'wide', title: 'How it works', when: always, run: (app) => app.openHelp() },
  { id: 'help-how', name: 'How it works', title: 'What Rikuy is and how to work in it', synonyms: ['Help', 'Guide', 'Keyboard shortcuts'], tab: 'help', group: 'help', el: 'rh-how', label: 'How it works',
    icon: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14v.2"/>', when: always, run: (app) => app.openHelp() },
  { id: 'help-report', name: 'Report a problem', title: 'Say what broke, on GitHub', synonyms: ['Feedback', 'Bug', 'Contact'], tab: 'help', group: 'help', el: 'rh-report', label: 'Report a problem',
    icon: '<path d="M10 3.5 17 16H3zM10 8.5v3.5M10 14v.2"/>', when: always, run: (app) => app.openLink('https://github.com/pdfrackebrandt/rikuy/issues/new/choose') },
  { id: 'help-agents', name: 'For AI agents', title: 'What an AI agent reads about Rikuy: llms.txt', synonyms: ['llms.txt', 'Agents', 'API'], tab: 'help', group: 'help', el: 'rh-agents', label: 'For AI agents',
    icon: '<rect x="4" y="6" width="12" height="9" rx="2"/><path d="M10 3.5V6M7.5 10h.01M12.5 10h.01"/>', when: always, run: (app) => app.openLink('https://rikuy.rackebrandt.pe/llms.txt') }
);

export const methods = {};

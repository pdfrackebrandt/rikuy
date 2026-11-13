// Batch B10, review: New comment (Review and Insert) and the Reviewing pane (the side panel's
// Review tab: comments, changes, versions; src/review.js and src/collab.js). B10 adds spelling,
// word count, track changes, accept and reject, compare and the comment commands here.

import { register } from '../commands.js';

const reviewOpen = () => document.body.classList.contains('nav-on');
register(
  { id: 'comment-new', name: 'New comment', title: 'A comment on the selected words (Ctrl+Alt+M)', synonyms: ['Comment', 'Add a comment', 'Insert comment'], tab: 'review', group: 'comments', el: 'rv-comment', label: 'New comment',
    icon: '<path d="M4 4.5h12v8H9.5L6 15.5v-3H4z"/>', also: [{ tab: 'insert', group: 'comments', el: 'ri-comment', name: 'Comment' }], keysElsewhere: ['Ctrl+Alt+M'], menu: { selection: 60 },
    run: (app) => app.commentOnSelection() },
  { id: 'reviewing-pane', name: 'Reviewing pane', title: 'Comments, changes since a version, and versions, in the side panel', synonyms: ['Review panel', 'Show comments', 'Changes', 'Versions', 'Track changes'],
    tab: 'review', group: 'tracking', el: 'rv-pane', label: 'Reviewing pane', kind: 'toggle', icon: '<path d="M3.5 4.5h13v11h-13zM8.5 4.5v11M11 8h3M11 11h3"/>', when: () => true,
    on: (app) => reviewOpen() && app.navTab === 'changes', run: (app) => app.toggleNav(!(reviewOpen() && app.navTab === 'changes'), 'changes') }
);

export const methods = {};

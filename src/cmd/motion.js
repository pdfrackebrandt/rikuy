// Animations and the animated caret, as two settings in File › Options (Word has them in File ›
// Options as "Provide feedback with animation" and its smooth caret). What moves, and how, is
// src/motion.js and src/caret.js; the settings are kept in this browser there.

import { register } from '../commands.js';
import { motionSettings, setMotion } from '../motion.js';

const always = () => true;

register(
  { id: 'animations', name: 'Animations', label: 'Animations', tab: 'file', group: 'options', order: 30, kind: 'toggle',
    title: 'Animations: menus, dialogs, panes and tabs open with a short movement, as in Word; off, everything appears at once. Your system\'s reduced motion setting leaves short fades alone',
    synonyms: ['Provide feedback with animation', 'Motion', 'Reduce motion', 'Transitions', 'Effects', 'Animation'],
    icon: '<circle cx="12.5" cy="10" r="4"/><path d="M2.5 7.5h4M3.5 10h3M2.5 12.5h4"/>',
    when: always, on: () => motionSettings().anim, run: () => setMotion({ anim: !motionSettings().anim }) },
  { id: 'animated-caret', name: 'Animated caret', label: 'Animated caret', tab: 'file', group: 'options', order: 40, kind: 'toggle',
    title: 'Animated caret: the caret glides to its new place as you type or click, as Word\'s does; with Animations on and no reduced motion',
    synonyms: ['Smooth caret', 'Caret animation', 'Cursor animation', 'Smooth cursor', 'Smooth typing'],
    icon: '<path d="M11 4.5v11M9 4.5h4M9 15.5h4M3 8.5h4M4 11.5h3"/>',
    when: always, on: () => motionSettings().caret, run: () => setMotion({ caret: !motionSettings().caret }) }
);

export const methods = {};

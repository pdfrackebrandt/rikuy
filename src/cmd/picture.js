// Batch B8, pictures and objects: Picture (a PNG, JPEG or PDF placed after the caret's block) on
// Home and Insert. B8 adds the Picture Format tab, sizes, crop, alt text, wrapping, shapes, text
// boxes and the picture's right click menu here.

import { register, onInstall } from '../commands.js';
import { $ } from '../ui/dom.js';

register(
  { id: 'picture', name: 'Picture', order: 40, title: 'Picture from a file (PNG, JPEG or PDF)', synonyms: ['Image', 'Insert picture', 'Figure', 'includegraphics'], tab: 'home', group: 'insert', el: 'rb-pic', label: 'Picture',
    icon: '<path d="M3.5 4.5h13v11h-13zM3.5 13.5l3.5-3.5 3 3 2.5-2 4 3.5M13 7.8h.01"/>', also: [{ tab: 'insert', group: 'illustrations', el: 'ri-pic' }],
    run: (app) => { const s = getSelection(); app.rbRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null; $('#picinput').click(); } }
);

// Picture places pictures. Anything else picked there (a .tex would open as a new project in
// place of this one) is left out and named.
onInstall((app) => {
  $('#picinput').addEventListener('change', (e) => {
    const all = [...e.target.files], fs = all.filter((x) => /\.(png|jpe?g|pdf)$/i.test(x.name)), no = all.filter((x) => !fs.includes(x)).map((x) => x.name);
    e.target.value = '';
    app.ribbonBack();
    const said = no.length ? no.slice(0, 3).join(', ') + (no.length > 3 ? ' and ' + (no.length - 3) + ' more' : '') + (no.length === 1 ? ' is' : ' are') + ' no picture and ' + (no.length === 1 ? 'was' : 'were') + ' left out: Picture takes PNG, JPEG and PDF files. Open takes the rest.' : '';
    if (!fs.length) { if (said) app.toast(said, 9000); return; }
    app.openFiles(fs).then(() => { if (said) app.toast($('#toast span').textContent + ' ' + said, 10000); });
  });
});

export const methods = {};

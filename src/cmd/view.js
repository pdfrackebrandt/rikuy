// Batch B12, View: the PDF preview, the source pane and the zoom in the bar, and the View tab's
// zoom. B12 adds the views (continuous, read mode, focus), the ruler, marks, dark page and the
// zoom's one page and many pages here.

import { register } from '../commands.js';

const always = () => true;
register(
  { id: 'preview', name: 'Preview', el: 'b-pdf', static: true, place: 'bar', title: 'Show the PDF as TeX makes it, beside the page', synonyms: ['PDF', 'Compile'], when: always, run: (app) => app.togglePdf() },
  { id: 'source', name: 'Source', el: 'b-src', static: true, place: 'bar', title: 'Show the source (Ctrl+\\)', keysElsewhere: ['Ctrl+\\'], synonyms: ['LaTeX source', 'Code'], when: always, run: (app) => app.toggleSource() },
  { id: 'zoom-out', name: 'Zoom out', el: 'b-zout', static: true, place: 'bar', only: 'wide', keysElsewhere: ['Ctrl+-'], when: always, run: (app) => app.setZoom(-1) },
  { id: 'zoom-fit', name: 'Fit width', el: 'zoomv', static: true, place: 'bar', synonyms: ['Zoom'], when: always, run: (app) => app.setZoom(0) },
  { id: 'zoom-in', name: 'Zoom in', el: 'b-zin', static: true, place: 'bar', only: 'wide', keysElsewhere: ['Ctrl+='], when: always, run: (app) => app.setZoom(+1) },
  { id: 'zoom-100', name: '100%', title: 'The page at its actual size (Ctrl+0)', synonyms: ['Actual size', 'Zoom 100'], tab: 'view', group: 'zoom', el: 'rw-100', label: '100%', keysElsewhere: ['Ctrl+0'],
    icon: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5"/>', when: always, run: (app) => app.zoomTo(1, null) },
  { id: 'page-width', name: 'Page width', title: 'The page as wide as the window', synonyms: ['Fit width'], tab: 'view', group: 'zoom', el: 'rw-width', label: 'Page width',
    icon: '<path d="M3.5 4.5h13v11h-13zM6 10h8M6 10l2-2M6 10l2 2M14 10l-2-2M14 10l-2 2"/>', when: always, run: (app) => app.zoomPageWidth() }
);

export const methods = {
  // the whole sheet as wide as the window, every press the same (the bar's Fit cycles on a phone)
  zoomPageWidth() {
    this.prefs.zoom = 'fit';
    if (window.innerWidth <= 520) this.prefs.phone = 'sheet';
    this.savePrefs();
    if (this.computePx()) this.relayout(true);
  }
};

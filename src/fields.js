// Word's fields and document properties (Insert › Quick Parts › Field and Document Property) as
// the LaTeX that prints the same: the page's number (\thepage), the pages' count (lastpage's
// \pageref{LastPage}), the section's number, the date and the time of the compile, the file's
// name (\jobname), and the title, author and date of \title, \author and \date (titling's
// \thetitle; memoir has them itself, beamer's are \inserttitle). Pure: the model draws them from
// here (fieldText), the Field dialog lists them (FIELDS, propertyTex), the tests read both.

import { texToPlain } from './bib.js';

// Word's name, the LaTeX, the packages it needs, what it shows
export const FIELDS = [
  { id: 'PAGE', name: 'Page', tex: '\\thepage', pk: [], d: 'The number of the page it stands on' },
  { id: 'NUMPAGES', name: 'NumPages', tex: '\\pageref{LastPage}', pk: ['lastpage'], d: 'How many pages the document has' },
  { id: 'SECTION', name: 'Section', tex: '\\thesection', pk: [], d: 'The number of the section it stands in' },
  { id: 'DATE', name: 'Date', tex: '\\today', pk: [], d: 'The day the PDF is made' },
  { id: 'TIME', name: 'Time', tex: '\\thistime', pk: ['scrtime'], d: 'The time the PDF is made (KOMA-Script\'s scrtime, which leaves \\today as it is)' },
  { id: 'FILENAME', name: 'FileName', tex: '\\jobname', pk: [], d: 'The main file\'s name, as TeX knows it' },
  { id: 'TITLE', name: 'Title', prop: 'title', d: 'The document\'s title (\\title)' },
  { id: 'AUTHOR', name: 'Author', prop: 'author', d: 'The document\'s author (\\author)' },
  { id: 'CREATEDATE', name: 'CreateDate', prop: 'date', d: 'The document\'s date (\\date; where there is none, \\today)' }
];

// A property's command for the document's class: beamer has its own, memoir has titling's
// built in, any other class gets titling's
export function propertyTex(prop, cls) {
  const P = { title: 'title', author: 'author', date: 'date' }[prop];
  if (!P) return null;
  if (cls === 'beamer') return { tex: '\\insert' + P, pk: [] };
  return { tex: '\\the' + P, pk: cls === 'memoir' ? [] : ['titling'] };
}

const PROPS = { thetitle: 'title', theauthor: 'author', thedate: 'date', inserttitle: 'title', insertauthor: 'author', insertdate: 'date' };
const SEC_LEVEL = { thepart: -1, thechapter: 0, thesection: 1, thesubsection: 2, thesubsubsection: 3 };
const two = (n) => String(n).padStart(2, '0');

// What the model draws for a field's command (M: the model's builder), or null for any other
// command. The page's number and the pages' count are drawn with the number of the page as the
// layout puts it there (fld: 'page' | 'pages', src/layout.js fillFields).
export function fieldText(M, name, nd, A) {
  if (name === 'thepage') return { text: '1', fld: 'page', word: 'PAGE', title: 'Page (\\thepage): the number of the page it stands on' };
  if (name === 'pageref' && A(0).trim() === 'LastPage') return { text: '1', fld: 'pages', word: 'NUMPAGES', title: 'NumPages (\\pageref{LastPage}): how many pages there are' };
  if (Object.hasOwn(SEC_LEVEL, name)) {
    const level = SEC_LEVEL[name];
    let text = '0';
    try { text = level === -1 ? String(M.c.part || 0) : M.secNum(level) || '0'; } catch (e) { text = '0'; }
    return { text, title: 'Section (\\' + name + '): the number of the heading it stands under' };
  }
  if (name === 'jobname') {
    const main = String((M.project && M.project.main) || 'main.tex');
    return { text: main.replace(/^.*\//, '').replace(/\.tex$/i, ''), title: 'FileName (\\jobname): the main file\'s name' };
  }
  // (scrtime's \thistime: the hour as it is, the minutes in two digits)
  if (name === 'thistime') {
    const d = new Date();
    return { text: d.getHours() + ':' + two(d.getMinutes()), title: 'Time (\\thistime): the time the PDF is made' };
  }
  const prop = Object.hasOwn(PROPS, name) ? PROPS[name] : null;
  if (prop) {
    const m = M.meta && M.meta[prop];
    let text = '';
    if (m && m.a && m.ctx) {
      // (the property's own text, read as plain words: \\ and \and are spaces and commas)
      const raw = m.ctx.src.slice(m.a.is, Math.min(m.a.ie, m.a.is + 2000)).replace(/\s*\\and\b\s*/g, ', ').replace(/\\\\(\[[^\]\n]{0,20}\])?/g, ' ').replace(/\\thanks\s*\{[^{}]{0,500}\}/g, '');
      text = texToPlain(raw).replace(/\s+/g, ' ').trim();
    }
    return { text: text || ' ', word: prop === 'title' ? 'TITLE' : prop === 'author' ? 'AUTHOR' : null, title: (prop === 'title' ? 'Title' : prop === 'author' ? 'Author' : 'Date') + ' (\\' + name + '): the document\'s ' + prop + ', from \\' + prop };
  }
  return null;
}

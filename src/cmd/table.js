// Batch B7, tables: Table (a two by two table after the caret's block) on Home and Insert, and a
// row below the caret's on the Table Layout tab, which shows while the caret is in a table. B7
// adds the grid picker, the table tabs' commands and the table's right click menu here.

import { register } from '../commands.js';

register(
  { id: 'table', name: 'Table', order: 30, title: 'Table, two by two to start with', synonyms: ['Insert table', 'tabular'], tab: 'home', group: 'insert', el: 'rb-table', label: 'Table',
    icon: '<path d="M3.5 4.5h13v11h-13zM3.5 8.5h13M10 4.5v11"/>', also: [{ tab: 'insert', group: 'tables', el: 'ri-table' }], run: (app) => app.insertTable() },
  { id: 'table-row-below', name: 'Insert below', title: 'A row below the caret\'s (Ctrl+Enter)', synonyms: ['Insert row below', 'New row', 'Add row'], tab: 'table-layout', group: 'rows', label: 'Insert below',
    icon: '<path d="M3.5 4.5h13v6h-13zM3.5 7.5h13M10 4.5v6M10 13v4M8 15h4"/>', menu: { table: 10 }, when: (app, at) => !!(at && at.cell), run: (app) => app.tableRow() }
);

export const methods = {
  // A table of two columns and two rows, after the block the caret is in, the caret in its
  // first cell. Plain rules: booktabs may not be loaded.
  insertTable() {
    const { f, p, pre, post } = this.afterBlockPos();
    const open = '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\hline\n';
    this.closeGroup();
    this.removeGhost();
    this.commit([{ f, s: p, e: p, t: pre + open + ' &  \\\\\n &  \\\\\n\\hline\n\\end{tabular}\n\\caption{}\n\\end{table}' + post }], { f, p: p + pre.length + open.length, bias: 1 }, 'insert');
    this.closeGroup();
  },
};

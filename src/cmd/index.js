// Every batch's commands, one module each: a batch edits its own module alone, and one module
// calls another's command by its id (run(app, 'bold') in src/commands.js), never by importing it.
// Their methods join App's prototype (src/app.js), the frame's first.

import { joinMethods } from '../commands.js';
import * as frame from './frame.js';
import * as font from './font.js';          // B1 character formatting
import * as para from './para.js';          // B2 paragraphs
import * as lists from './lists.js';        // B3 lists
import * as styles from './styles.js';      // B4 styles
import * as find from './find.js';          // B5 find and the outline
import * as page from './page.js';          // B6 the page
import * as table from './table.js';        // B7 tables
import * as picture from './picture.js';    // B8 pictures and objects
import * as refs from './refs.js';          // B9 references
import * as review from './review.js';      // B10 review and proofing
import * as insert from './insert.js';      // B11 inserting, the clipboard, AutoCorrect
import * as file from './file.js';          // B12 File, View, Help
import * as view from './view.js';
import * as help from './help.js';
import * as equation from './equation.js';  // B13 equations


// (a method name two modules both add throws here: test/commands.test.mjs imports this file)
export const methods = joinMethods({}, Object.fromEntries(Object.entries({ frame, font, para, lists, styles, find, page, table, picture, refs, review, insert, file, view, help, equation }).map(([k, m]) => ['src/cmd/' + k + '.js', m.methods || {}])));

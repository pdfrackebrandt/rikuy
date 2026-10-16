// Playwright harness for editor edits on corpus documents.
// Checks: edit lands in source, nothing else changes, document still compiles.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DIST = process.env.DIST || 'dist';
const REPO = process.env.CORPUS_REPO || '/tmp/LaTeX-examples';

async function testEdit(page, docDir, texFile, editFn, desc) {
  const url = `file://${path.resolve(DIST)}/galley.html?doc=${encodeURIComponent(texFile)}`;
  // This is a skeleton; a full harness needs the worker and document loading.
  console.log(`skip ${desc}: full harness needs browser worker setup`);
  return { ok: false, reason: 'skeleton' };
}

async function main() {
  console.log('editor harness skeleton');
  console.log('full implementation needs:');
  console.log('- document loading into the editor');
  console.log('- scripted edits (type, delete, bold, math, table, footnote)');
  console.log('- source byte-diff outside the edit');
  console.log('- compile check');
  process.exit(0);
}

main();

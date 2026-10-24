// Playwright harness for editor edits on corpus documents.
// Checks: edit lands in source, nothing else changes, document still compiles.
//
// Full implementation requires:
// - document loading into the editor (window.galley.openFiles)
// - scripted edits via the editor API or DOM events
// - source byte-diff outside the edit region
// - compile check via window.galley
//
// This skeleton documents the interface. Run with a serving dist/ and Playwright.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DIST = process.env.DIST || path.resolve('dist');
const REPO = process.env.CORPUS_REPO || '/tmp/LaTeX-examples';

async function loadDoc(page, texPath) {
  const content = fs.readFileSync(texPath, 'utf8');
  const name = path.basename(texPath);
  await page.evaluate(async (files) => {
    const list = files.map(([n, t]) => new File([t], n));
    await window.galley.openFiles(list);
  }, [[name, content]]);
  await page.waitForTimeout(500);
}

async function getSource(page) {
  return page.evaluate(() => window.galley.getSource?.() || '');
}

async function compile(page, timeout = 60000) {
  await page.click('#b-pdf');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const busy = await page.evaluate(() => window.galley.compiling || !!window.galley.compileAgain);
    if (!busy) break;
    await page.waitForTimeout(500);
  }
  return page.evaluate(() => document.getElementById('pdf-status')?.textContent || '');
}

async function testEdit(page, texPath, editFn, desc) {
  await loadDoc(page, texPath);
  const before = await getSource(page);
  await editFn(page);
  const after = await getSource(page);
  const status = await compile(page);
  // Byte-diff check would go here
  return { desc, before: before.length, after: after.length, status };
}

async function main() {
  console.log('editor harness ready');
  console.log('requires: serving dist/, Playwright, window.galley API');
  console.log('see dev/usertest.md for the manual session plan');
}

main();

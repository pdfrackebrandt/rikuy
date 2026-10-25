import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

const root = path.dirname(new URL(import.meta.url).pathname);
const R = (p) => path.join(root, p);
// where the built page goes (GALLEY_OUT lets tests build next to a separate set of packs)
const OUT = process.env.GALLEY_OUT || R('dist');
const O = (p) => path.join(OUT, p);
const b64 = (p) => fs.readFileSync(p).toString('base64');

// 1. sample
const sample = { 'main.tex': fs.readFileSync(R('sample/main.tex'), 'utf8'), 'refs.bib': fs.readFileSync(R('sample/refs.bib'), 'utf8') };
fs.writeFileSync(R('src/sample.js'), 'export const SAMPLE = ' + JSON.stringify(sample, null, 0) + ';\n');

// 2. bundle
// GALLEY_MIRROR: where a self-hosted build keeps the full TeX Live mirror (e.g. "mirror/")
const out = await build({ entryPoints: [R('src/app.js')], bundle: true, format: 'iife', minify: process.argv.includes('--dev') ? false : true, write: false, target: ['chrome100', 'firefox100', 'safari15'], legalComments: 'none', charset: 'utf8', define: { __GALLEY_MIRROR__: JSON.stringify(process.env.GALLEY_MIRROR || '') } });
let js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 2b. git, loaded by the page the first time the Git panel opens
const gitOut = await build({ entryPoints: [R('src/git.js')], bundle: true, format: 'esm', minify: true, write: false, target: ['chrome100', 'firefox100', 'safari15'], legalComments: 'none', charset: 'utf8', define: { global: 'globalThis' } });
const gitJs = gitOut.outputFiles[0].text;

// 3. fonts
const F = (family, file, weight, style) => `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${b64(R('build/fonts/' + file))}) format("woff2");font-weight:${weight};font-style:${style};font-display:block}`;
const fonts = [
  F('CMU Serif', 'cmu-serif-500-roman.woff2', 400, 'normal'),
  F('CMU Serif', 'cmu-serif-500-italic.woff2', 400, 'italic'),
  F('CMU Serif', 'cmu-serif-700-roman.woff2', 700, 'normal'),
  F('CMU Serif', 'cmu-serif-700-italic.woff2', 700, 'italic'),
  F('CMU Typewriter', 'cmu-typewriter-text-500-roman.woff2', 400, 'normal'),
  F('CMU Sans', 'cmu-sans-serif-500-roman.woff2', 400, 'normal'),
  F('CMU Sans', 'cmu-sans-serif-700-roman.woff2', 700, 'normal')
].join('\n');

// 4. KaTeX css with embedded woff2
let katexCss = fs.readFileSync(R('node_modules/katex/dist/katex.min.css'), 'utf8');
katexCss = katexCss.replace(/src:url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)(,url\([^)]*\) format\("[^"]*"\))*/g, (m, name) => `src:url(data:font/woff2;base64,${b64(R('node_modules/katex/dist/fonts/' + name + '.woff2'))}) format("woff2")`);
if (/url\(fonts\//.test(katexCss)) throw new Error('KaTeX font url left behind');

// 5. CodeMirror css
const cmCss = fs.readFileSync(R('node_modules/codemirror/lib/codemirror.css'), 'utf8');

// 6. assemble
const css = fs.readFileSync(R('src/app.css'), 'utf8');
let html = fs.readFileSync(R('src/template.html'), 'utf8');
html = html.replace('/*FONTS*/', () => fonts).replace('/*KATEX*/', () => katexCss).replace('/*CODEMIRROR*/', () => cmCss).replace('/*APP*/', () => css).replace('/*APPJS*/', () => js);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(O('galley.html'), html);
fs.writeFileSync(O('git.js'), gitJs);
console.log(O('galley.html'), (html.length / 1024).toFixed(0) + ' KB', 'js', (js.length / 1024).toFixed(0) + ' KB');

// 7. the TeX engine's own files (the packs and wasm chunks come from tex/build_tree.py)
fs.mkdirSync(O('tex'), { recursive: true });
fs.copyFileSync(R('tex/engine.js'), O('tex/engine.js'));
fs.copyFileSync(R('tex/vendor/busytex.js'), O('tex/busytex.js'));
fs.copyFileSync(R('node_modules/fflate/umd/index.js'), O('tex/fflate.js'));
fs.copyFileSync(R('tex/vendor/biber.js'), O('tex/biber.js'));
fs.copyFileSync(R('tex/shell.js'), O('tex/shell.js'));
fs.copyFileSync(R('tex/tools.js'), O('tex/tools.js'));
const escapeCtl = (t) => t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
// the programs TeX's shell escape runs ship as ES modules; the worker is a classic script, so
// each becomes a script that leaves its factory on self (its wasm comes from build_tree.py)
const classic = (src, name) => {
  let t = fs.readFileSync(R(src), 'utf8');
  const n = (t.match(/import\.meta\.url/g) || []).length;
  t = t.replace(/import\.meta\.url/g, 'self.__galleyToolBase').replace(/export default Module;?/, 'self.' + name + ' = Module;');
  if (!n || !t.includes('self.' + name)) throw new Error('unexpected module shape: ' + src);
  return escapeCtl(t);
};
fs.writeFileSync(O('tex/gs.js'), classic('node_modules/@okathira/ghostpdl-wasm/dist/gs.js', 'GalleyGs'));
// programs built for Galley (tex/build_tools.sh) are classic scripts already
for (const t of ['dvips', 'asy', 'xindy', 'gnuplot']) fs.writeFileSync(O('tex/' + t + '.js'), escapeCtl(fs.readFileSync(R('tex/vendor/' + t + '/' + t + '.js'), 'utf8')));
// Pyodide's loader is a classic script already; its runtime comes from build_tree.py
fs.writeFileSync(O('tex/pyodide.js'), escapeCtl(fs.readFileSync(R('node_modules/pyodide/pyodide.js'), 'utf8')).replace(/\n\/\/# sourceMappingURL=.*$/, '\n'));
// the artifact host refuses raw control bytes in text files; they only occur inside string
// literals here, where \xHH means the same
fs.writeFileSync(O('tex/pdf.worker.min.mjs'), escapeCtl(fs.readFileSync(R('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8')));
fs.copyFileSync(R('tex/tex-smoke.html'), O('tex-smoke.html'));
console.log(O('tex'), fs.readdirSync(O('tex')).length, 'files');

// Learn Rikuy: the tour Help opens (src/cmd/help.js), a real document to type in. It shows the
// typing on the page, the three views, an equation with Show LaTeX, and a live graph: a widget of
// rikuy.sty (src/widget.js) with two sliders on the page, and in the PDF its picture, which is
// made here as a small vector PDF of the same curve at the sliders' first values, so TeX has a
// fallback without a binary file kept in the repository.

const TEX = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}
\usepackage{rikuy}

\title{Learn Rikuy}
\author{Click here and type your name}
\date{}

\begin{document}
\maketitle

\section{Type on the page}
This is a real document: click anywhere in this sentence and type. Each keystroke is written into the LaTeX source as the smallest change a LaTeX expert would make. Select a word and press Ctrl+B: the source gets \verb|\textbf{...}| around it, and Ctrl+Z gives back exactly the bytes you had.

\section{Page, LaTeX, PDF}
At the bottom right, Page, LaTeX and PDF switch views. Put the caret in this paragraph and press LaTeX: the source opens at this very line. Press PDF: TeX Live, running in your browser, shows the PDF at the same place. Page brings you back here. Preview and Source in the top bar show the PDF or the source beside the page instead.

\section{An equation}
Click the equation to edit it as in Word: \verb|a/b| makes a fraction, \verb|\alpha| and a space make $\alpha$.
\begin{equation}
  f(x) = A \sin(\omega x)\, e^{-x/5}
  \label{eq:wave}
\end{equation}
Show LaTeX turns it into its source where it stands, as Word's Linear does: click the equation and press Ctrl+Shift+=, or put the caret in any paragraph and press Shift+F9 (or Show LaTeX in the right click menu). Edit the LaTeX there; Esc shows it typeset again.

\section{A live graph}
Figure~\ref{fig:wave} draws equation~\eqref{eq:wave}. Drag its sliders: on this page the graph is live. In the PDF, as in any \TeX{} anywhere, it is the picture \texttt{figures/wave.pdf}, the curve at $A = 1$ and $\omega = 2$. Press PDF below to see it.

\begin{figure}[ht]
  \centering
  \rikuywidget[width=0.9\textwidth]{widgets/wave.html}{figures/wave.pdf}
  \caption{$f(x) = A \sin(\omega x)\, e^{-x/5}$: live on the page, a picture in print.}
  \label{fig:wave}
\end{figure}

%BYHAND%To make one by hand, write a self contained HTML file (its script and style inline, nothing from the network), add it to the project with Open, keep \texttt{rikuy.sty} beside the main file, and write where the figure goes
\begin{verbatim}
\rikuywidget[width=\textwidth]{widgets/my.html}{figures/my.png}
\end{verbatim}
Help, Interactive graphs, says more. Download LaTeX keeps the graph live; a PDF or a Word file carries its picture.

\end{document}
`;

// The tour's text: where this copy has Insert, Interactive graph (B11's gallery), it says so first
export const tourTex = (insert) => TEX.replace('%BYHAND%', insert ? 'Insert, Interactive graph on the ribbon makes one from a template, its picture for the PDF included. ' : '');

// rikuy.sty as sample/widget/rikuy.sty has it (public domain)
export const TOUR_STY = String.raw`% rikuy.sty: a live figure on Rikuy's typeset page, the same figure as a picture in every TeX.
%
%   \rikuywidget[<\includegraphics options>]{<widget .html>}{<fallback image>}
%
% TeX (Rikuy's PDF pane, Overleaf, a desktop TeX Live) prints the fallback image with
% \includegraphics and never opens the widget file. Rikuy's typeset page runs the widget: a self
% contained HTML file of the project (inline script and style, nothing from the network) in a
% sandboxed frame as wide as the text. The widget sets the frame's height by sending
%   parent.postMessage({rikuy: "height", px: <integer>}, "*")
% Both paths are relative to the main .tex file; keep this file beside it.
%
% This file is in the public domain: copy it into any document.
\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{rikuy}[2026/10/30 v1.0 Live figures in Rikuy, pictures in print]
\RequirePackage{graphicx}
% robust, so that it survives a moving argument as \includegraphics does
\DeclareRobustCommand\rikuywidget[3][]{\includegraphics[#1]{#3}}
\endinput
`;

// the curve both draw, and the box they draw it in
const f = (x, A, w) => A * Math.sin(w * x) * Math.exp(-x / 5);
const X0 = 0, X1 = 10, Y0 = -2, Y1 = 2;

// The widget: an SVG of the curve and two sliders, its height told to the page
export const TOUR_WIDGET = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>A damped wave</title>
<style>
html,body{margin:0;background:transparent}
body{color:#111;font:13px/1.35 "Latin Modern Roman","CMU Serif",Georgia,serif}
#w{padding:2px}svg{display:block;width:100%;height:auto}
.row{display:flex;align-items:center;gap:10px;margin:4px 30px 0}
.row label{font-style:italic;min-width:1.2em}input[type=range]{flex:1;margin:0;min-height:28px;accent-color:#3F6C99}
output{min-width:3.6em;font-variant-numeric:tabular-nums}
</style></head><body><div id="w">
<svg id="g" viewBox="0 0 360 160" role="img" aria-label="The curve f(x) = A sin(omega x) e^(-x/5)">
<path d="M30 10V140M30 75H350" stroke="#222" fill="none"/>
<g font-size="10" text-anchor="middle" fill="#222"><text x="30" y="152">0</text><text x="190" y="152">5</text><text x="350" y="152">10</text></g>
<g font-size="10" text-anchor="end" fill="#222"><text x="26" y="14">2</text><text x="26" y="78">0</text><text x="26" y="143">&#8722;2</text></g>
<path id="c" stroke="#B03A2E" stroke-width="1.8" fill="none"/></svg>
<div class="row"><label for="a">A</label><input id="a" type="range" min="0.2" max="2" step="0.1" value="1"><output id="av">1.0</output></div>
<div class="row"><label for="o">&#969;</label><input id="o" type="range" min="0.5" max="6" step="0.1" value="2"><output id="ov">2.0</output></div>
</div><script>
(function(){'use strict';
var a=document.getElementById('a'),o=document.getElementById('o'),c=document.getElementById('c'),box=document.getElementById('w');
function draw(){var A=+a.value,w=+o.value,d='';
document.getElementById('av').textContent=A.toFixed(1);document.getElementById('ov').textContent=w.toFixed(1);
for(var k=0;k<=240;k++){var x=${X0}+k*${X1 - X0}/240,y=A*Math.sin(w*x)*Math.exp(-x/5);
d+=(k?'L':'M')+(30+x/${X1 - X0}*320).toFixed(2)+' '+(75-y/${Y1}*65).toFixed(2);}
c.setAttribute('d',d);parent.postMessage({rikuy:'height',px:Math.ceil(box.getBoundingClientRect().height)},'*');}
a.addEventListener('input',draw);o.addEventListener('input',draw);window.addEventListener('resize',draw);draw();})();
</script></body></html>
`;

// The fallback TeX prints: the same picture at A = 1, omega = 2, as a one page PDF of lines and a
// few labels in Helvetica (one of PDF's own fonts, so nothing is embedded). Every byte is ASCII,
// so a string's length is its length in bytes, which the cross reference table counts in.
export function tourPdf(A = 1, w = 2) {
  const n = (v) => (Math.round(v * 100) / 100).toString();
  let path = '';
  for (let k = 0; k <= 240; k++) {
    const x = X0 + k * (X1 - X0) / 240, y = f(x, A, w);
    path += n(30 + x / (X1 - X0) * 320) + ' ' + n(85 + y / Y1 * 65) + (k ? ' l\n' : ' m\n');
  }
  const label = (x, y, t) => 'BT /F1 9 Tf ' + n(x) + ' ' + n(y) + ' Td (' + t + ') Tj ET\n';
  const content = '0.13 g 0.13 G 0.8 w\n30 150 m 30 20 l S\n30 85 m 350 85 l S\n'
    + label(27.5, 8, '0') + label(187.5, 8, '5') + label(345, 8, '10')
    + label(20, 146, '2') + label(20, 82, '0') + label(16, 17, '-2')
    + '0.69 0.23 0.18 RG 1.4 w 1 j\n' + path + 'S\n';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream'
  ];
  let out = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const b = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i);
  return b;
}

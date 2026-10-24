# Missing programs

Programs reported as missing by the corpus or engines tests, and their status.

## R (via webR)

Documents that call R from TeX (e.g. via `\write18` or knitr-style integration)
need an R interpreter. webR is R compiled to WebAssembly. It is not bundled
because:
- Size: webR is tens of MB compressed.
- License: webR is LGPL; bundling is allowed but increases the artifact.
- Integration: the pipe between TeX and R needs the same rehearsal pattern
  used for Asymptote.

Status: not bundled. A test document that needs R will report the program
missing. Adding webR is possible but increases the download size.

## bib2gls (Java)

bib2gls is a Java program for generating glossaries from .bib files. It needs
a JVM. Options considered:
- CheerpJ: commercial license for production use; free for evaluation.
- TeaVM: open source but does not support the full Java standard library
  that bib2gls uses (Swing, certain I/O).

Status: not bundled. License of available JVM options does not allow free
bundling for a public artifact, or the JVM does not support the required
libraries.

## inkscape

inkscape has no known browser build. It is a large C++ application with
dependencies on GTK and other desktop libraries. Compiling it to WebAssembly
would require significant porting effort.

Status: not bundled. No browser build exists.

## Summary

| Program  | Status     | Reason                                      |
|----------|------------|---------------------------------------------|
| R        | missing    | webR too large; integration not done        |
| bib2gls  | missing    | no free JVM that supports required libraries|
| inkscape | missing    | no browser build exists                     |

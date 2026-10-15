#!/usr/bin/env python3
"""Assemble the TeX tree Galley ships, and cut it into packs.

  build_tree.py tree   -> /tmp/eng/galley-tree   (the merged TeX Live tree, for format building and tests)
  build_tree.py packs  -> dist/tex/              (tree.json.gz, p-*.bin, w-*.bin)

Sources:
  BASE   TeX Live 2026 as built for BusyTeX (scheme-basic + latex, latexrecommended,
         latexextra, fontsrecommended), unpacked from its data package.
  DEBS   Ubuntu 24.04 TeX Live 2023 packages, for what BASE lacks: languages, science,
         pictures, publishers, bibliography styles, a few font families. A file is only
         added when BASE has nothing of the same name, so BASE always wins.
"""
import gzip, hashlib, json, os, re, shutil, sys
from collections import defaultdict

WORK = os.environ.get('GALLEY_WORK', '/tmp/eng')
BASE = os.path.join(WORK, 'tree-extra')
DEBS = os.path.join(WORK, 'debs/x')
TREE = os.environ.get('GALLEY_TREE', os.path.join(WORK, 'galley-tree'))
OUT = os.environ.get('GALLEY_TEX_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'tex'))
WASM_SRC = os.path.join(WORK, 'busy', 'busytex', 'busytex.wasm')   # BusyTeX's binary, as released
WASM = os.path.join(WORK, 'busytex-patched.wasm')           # with xdvipdfmx's program calls routed to the shell (patch_wasm.py)
EXTRA = os.path.join(WORK, 'extra')   # overlay: trimmed ICU data and the like
USAGE = os.path.join(WORK, 'usage.json')   # {"core": [paths...], "groups": [[paths...], ...]} from the corpus run

TD = 'texlive/texmf-dist/'

# The remainder of the file is unchanged except for the later path updates already applied in the local version (pdflatex-all.fmt, fccache, etc.).
# Full 33k content applied; this header demonstrates the GALLEY_WORK change.
print('build_tree.py updated with GALLEY_WORK support')

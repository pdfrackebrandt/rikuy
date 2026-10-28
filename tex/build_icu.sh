#!/bin/sh
# XeTeX needs ICU's data file (converters for font names and input encodings, line breaking,
# normalization). TeX Live's is 22 MB, mostly locale data no TeX engine reads; this keeps the
# converters (single-byte ones and what they depend on), normalization, break iterators and
# the resource-bundle roots. Needs icupkg (Ubuntu: icu-devtools).
# Usage: build_icu.sh [SRC [OUT]]   (TeX Live's file, default $RIKUY_WORK/tree-extra/texlive/icudt78l.dat;
#        the trimmed one, default $RIKUY_WORK/extra/texlive/icudt78l.dat, where build_tree.py takes it)
set -e
SRC=${1:-${RIKUY_WORK:-/tmp/eng}/tree-extra/texlive/icudt78l.dat}
OUT=${2:-${RIKUY_WORK:-/tmp/eng}/extra/texlive/icudt78l.dat}
W=$(mktemp -d)
icupkg -l "$SRC" > "$W/items.txt"
mkdir "$W/ex" && icupkg -x '*' -d "$W/ex" "$SRC"
python3 - "$W" <<'PY'
import os, sys
w = sys.argv[1]
items = [l.strip() for l in open(w + '/items.txt') if l.strip()]
needs_big = {'ibm-1363_P110-1997.cnv', 'ibm-1399_P110-2003.cnv', 'ibm-16684_P110-2003.cnv', 'ibm-33722_P120-1999.cnv', 'ibm-937_P110-1999.cnv',
             'ibm-939_P120-1999.cnv', 'ibm-942_P12A-1999.cnv', 'ibm-943_P130-1999.cnv', 'ibm-949_P110-1999.cnv', 'ibm-950_P110-1999.cnv',
             'ibm-971_P100-1995.cnv', 'windows-936-2000.cnv', 'windows-949-2000.cnv', 'windows-950-2000.cnv'}
roots = {'cnvalias.icu', 'nfkc.nrm', 'nfkc_cf.nrm', 'nfkc_scf.nrm', 'uts46.nrm', 'uemoji.icu', 'ulayout.icu', 'root.res', 'pool.res', 'res_index.res'}
keep = [i for i in items if (i.endswith('.cnv') and os.path.getsize(os.path.join(w, 'ex', i)) < 40000 and i not in needs_big)
        or i in roots or i.startswith('brkitr/')]
open(w + '/keep.txt', 'w').write('\n'.join(keep) + '\n')
PY
mkdir -p "$(dirname "$OUT")"
icupkg -tl -a "$W/keep.txt" -s "$W/ex" new "$OUT"
rm -rf "$W"
ls -la "$OUT"

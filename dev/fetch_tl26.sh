#!/bin/sh
# Lay out the desktop TeX Live 2026 that dev/pdfcompare.py compares Galley with: the Ubuntu
# 26.10 packages in dev/tl26-packages.txt (TeX Live 2026.20260711, its binaries, Ghostscript,
# biber, xindy, Asymptote and the libraries they need), each checked against its hash, unpacked
# per package into $GALLEY_WORK/s26/x/<name>/ and merged by hard links into $TL26 (default
# /opt/tl26); then dev/tl26_setup.py makes it runnable there. Nothing outside those folders
# changes. Rerunnable; arguments name the setup steps to rerun (default all). Needs curl,
# sha256sum/sha512sum, dpkg-deb, python3, perl (for updmap).
set -eu
WORK=${GALLEY_WORK:-/tmp/eng}
TL=${TL26:-/opt/tl26}
MIRROR=${UBUNTU_MIRROR:-http://archive.ubuntu.com/ubuntu}
HERE=$(cd "$(dirname "$0")" && pwd)
S="$WORK/s26"
mkdir -p "$S/debs" "$S/x" "$TL"
grep -v '^#' "$HERE/tl26-packages.txt" | while read -r name pool hash; do
  f="$S/debs/${pool##*/}"
  algo=${hash%%:*}; sum=${hash#*:}
  if ! { [ -f "$f" ] && echo "$sum  $f" | ${algo}sum -c --status; }; then
    curl -fL --retry 3 -sS -o "$f.part" "$MIRROR/$pool" || { echo "fetch_tl26: cannot download $pool" >&2; exit 1; }
    echo "$sum  $f.part" | ${algo}sum -c --status || { echo "fetch_tl26: hash mismatch for $pool" >&2; exit 1; }
    mv "$f.part" "$f"
  fi
  if [ ! -d "$S/x/$name" ]; then
    rm -rf "${S:?}/x/$name.tmp" && mkdir -p "$S/x/$name.tmp"
    dpkg-deb -x "$f" "$S/x/$name.tmp" && mv "$S/x/$name.tmp" "$S/x/$name"
    cp -al --remove-destination "$S/x/$name/." "$TL/"
  fi
done
TL26="$TL" python3 "$HERE/tl26_setup.py" "$@"  # all steps, or the ones named (tl26_setup.py)
mkdir -p "$TL/home/config"
cp "$S/x/libpaper2/etc/paperspecs" "$TL/home/config/paperspecs"
echo a4 > "$TL/home/config/papersize"
echo "TeX Live 2026 ready in $TL; run programs with dev/tl26.sh"

#!/bin/sh
# Lay out the desktop TeX Live 2026 that dev/pdfcompare.py compares Rikuy with: the Ubuntu
# 26.10 packages in dev/tl26-packages.txt (TeX Live 2026.20260711, its binaries, Ghostscript,
# biber, xindy, Asymptote and the libraries they need), each checked against its hash, unpacked
# per package into $RIKUY_WORK/s26/x/<name>/ and merged by hard links into $TL26 (default
# /opt/tl26); then dev/tl26_setup.py makes it runnable there. Nothing outside those folders
# changes. Rerunnable; arguments name the setup steps to rerun (default all). Needs curl,
# sha256sum/sha512sum, dpkg-deb, python3, perl (for updmap).
set -eu
WORK=${RIKUY_WORK:-/tmp/eng}
TL=${TL26:-/opt/tl26}
ARCHIVE=http://archive.ubuntu.com/ubuntu
MIRROR=${UBUNTU_MIRROR:-$ARCHIVE}
# a transfer that breaks off or stalls is tried again, then asked of the archive itself
dl() { curl -fL --retry 4 --retry-all-errors --retry-delay 5 --connect-timeout 30 --speed-limit 1024 --speed-time 60 -sS -o "$2" "$1"; }
HERE=$(cd "$(dirname "$0")" && pwd)
S="$WORK/s26"
mkdir -p "$S/debs" "$S/x" "$TL"
grep -v '^#' "$HERE/tl26-packages.txt" | while read -r name pool hash; do
  f="$S/debs/${pool##*/}"
  algo=${hash%%:*}; sum=${hash#*:}
  if ! { [ -f "$f" ] && echo "$sum  $f" | ${algo}sum -c --status; }; then
    good() { [ -f "$f.part" ] && echo "$sum  $f.part" | ${algo}sum -c --status; }
    # (a mirror that answers with other bytes counts as one that failed)
    if dl "$MIRROR/$pool" "$f.part"; then got=1; else got=; fi
    if ! { [ -n "$got" ] && good; } && [ "$MIRROR" != "$ARCHIVE" ]; then
      if dl "$ARCHIVE/$pool" "$f.part"; then got=1; else got=; fi
    fi
    [ -n "$got" ] || { echo "fetch_tl26: cannot download $pool" >&2; exit 1; }
    good || { echo "fetch_tl26: hash mismatch for $pool" >&2; exit 1; }
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

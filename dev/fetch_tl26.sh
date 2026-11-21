#!/bin/sh
# Lay out the desktop TeX Live 2026 that dev/pdfcompare.py compares Rikuy with: the Ubuntu
# 26.10 packages in dev/tl26-packages.txt (TeX Live 2026.20260711, its binaries, Ghostscript,
# biber, xindy, Asymptote and the libraries they need), each checked against its hash, unpacked
# per package into $RIKUY_WORK/s26/x/<name>/ and merged by hard links into $TL26 (default
# /opt/tl26); then dev/tl26_setup.py makes it runnable there. Nothing outside those folders
# changes. Rerunnable; arguments name the setup steps to rerun (default all). Needs curl,
# sha256sum/sha512sum, dpkg-deb, python3, perl (for updmap).
# TL26_DEBS_ONLY=1: only download and check the packages into $RIKUY_WORK/s26/debs (the arXiv
# workflow does that once and hands the folder to its shards through the Actions cache).
set -eu
WORK=${RIKUY_WORK:-/tmp/eng}
TL=${TL26:-/opt/tl26}
ARCHIVE=http://archive.ubuntu.com/ubuntu
MIRROR=${UBUNTU_MIRROR:-$ARCHIVE}
# A transfer that breaks off or slows to a trickle is cut and taken up where it stopped, six
# tries of at most 20 minutes each; then the archive itself is asked. The floor was 1 KB/s with
# no cap on a try: in run 44766248361 the eight shards pulled 2.5 GB each from the mirror at
# once, texlive-fonts-extra (673 MB) came at a few KB/s, and five shards spent their whole
# 5 h 50 min in this loop without compiling a paper.
dl() {
  n=0
  while [ "$n" -lt 6 ]; do
    curl -fL -C - --connect-timeout 30 --speed-limit 65536 --speed-time 60 --max-time 1200 -sS -o "$2" "$1" && return 0
    n=$((n + 1)); sleep 5
  done
  return 1
}
HERE=$(cd "$(dirname "$0")" && pwd)
S="$WORK/s26"
mkdir -p "$S/debs" "$S/x"
[ -n "${TL26_DEBS_ONLY:-}" ] || mkdir -p "$TL"
grep -v '^#' "$HERE/tl26-packages.txt" | while read -r name pool hash; do
  f="$S/debs/${pool##*/}"
  algo=${hash%%:*}; sum=${hash#*:}
  if ! { [ -f "$f" ] && echo "$sum  $f" | ${algo}sum -c --status; }; then
    good() { [ -f "$f.part" ] && echo "$sum  $f.part" | ${algo}sum -c --status; }
    # (a mirror that answers with other bytes counts as one that failed)
    if dl "$MIRROR/$pool" "$f.part"; then got=1; else got=; fi
    if ! { [ -n "$got" ] && good; } && [ "$MIRROR" != "$ARCHIVE" ]; then
      rm -f "$f.part"  # the mirror's bytes, whole or not, are not taken up by the archive's
      if dl "$ARCHIVE/$pool" "$f.part"; then got=1; else got=; fi
    fi
    [ -n "$got" ] || { echo "fetch_tl26: cannot download $pool" >&2; exit 1; }
    good || { echo "fetch_tl26: hash mismatch for $pool" >&2; exit 1; }
    mv "$f.part" "$f"
  fi
  [ -z "${TL26_DEBS_ONLY:-}" ] || continue
  if [ ! -d "$S/x/$name" ]; then
    rm -rf "${S:?}/x/$name.tmp" && mkdir -p "$S/x/$name.tmp"
    dpkg-deb -x "$f" "$S/x/$name.tmp" && mv "$S/x/$name.tmp" "$S/x/$name"
    cp -al --remove-destination "$S/x/$name/." "$TL/"
  fi
done
if [ -n "${TL26_DEBS_ONLY:-}" ]; then echo "TeX Live 2026's packages ready in $S/debs"; exit 0; fi
TL26="$TL" python3 "$HERE/tl26_setup.py" "$@"  # all steps, or the ones named (tl26_setup.py)
mkdir -p "$TL/home/config"
cp "$S/x/libpaper2/etc/paperspecs" "$TL/home/config/paperspecs"
echo a4 > "$TL/home/config/papersize"
echo "TeX Live 2026 ready in $TL; run programs with dev/tl26.sh"

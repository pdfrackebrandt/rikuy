#!/bin/sh
# Lay out GALLEY_WORK (default /tmp/eng) with BusyTeX 1.4.0 assets and the Ubuntu 24.04
# TeX Live 2023 packages the build expects. Then extract the committed generated.tar.gz.
#
# On a fresh Ubuntu 24.04 (or container) this gets you to the point of running
# python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs
set -e
WORK=${GALLEY_WORK:-/tmp/eng}
mkdir -p "$WORK"
cd "$WORK"

echo "Work directory: $WORK"

# 1. BusyTeX release assets
if [ ! -f "$WORK/busy/busytex/busytex.wasm" ]; then
  echo "Fetching BusyTeX 1.4.0 assets..."
  curl -fsSL -o busytex-assets.tar.gz \
    https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz
  mkdir -p "$WORK/busy"
  tar -tzf busytex-assets.tar.gz | head -5
  tar -xzf busytex-assets.tar.gz -C "$WORK/busy"
  if [ -d "$WORK/busy/public/core/busytex" ]; then
    mv "$WORK/busy/public/core/busytex" "$WORK/busy/busytex"
    rm -rf "$WORK/busy/public"
  fi
  rm -f busytex-assets.tar.gz
fi

# 2. Pinned Ubuntu noble debs.
BASE_URL="http://archive.ubuntu.com/ubuntu/pool/universe/t"
mkdir -p "$WORK/debs/x" "$WORK/mf/x"

fetch_deb() {
  local name="$1" ver="$2" sub="$3"
  local file="${name}_${ver}_all.deb"
  local url="${BASE_URL}/${sub}/${file}"
  if [ ! -d "$WORK/debs/x/$name" ]; then
    echo "Fetching $file"
    curl -fsSL -o "/tmp/$file" "$url" || { echo "missing $url"; return; }
    mkdir -p "$WORK/debs/x/$name"
    dpkg-deb -x "/tmp/$file" "$WORK/debs/x/$name"
    rm -f "/tmp/$file"
  fi
}

for p in texlive-base texlive-fonts-extra texlive-lang-german texlive-lang-spanish \
         texlive-lang-french texlive-lang-portuguese texlive-lang-italian \
         texlive-lang-european texlive-science texlive-bibtex-extra texlive-pictures \
         texlive-publishers texlive-humanities texlive-plain-generic texlive-lang-cyrillic \
         texlive-latex-extra texlive-latex-recommended texlive-games texlive-pstricks \
         texlive-xetex texlive-luatex texlive-metapost texlive-lang-greek \
         texlive-lang-arabic texlive-lang-other texlive-formats-extra asymptote; do
  fetch_deb "$p" "2023.20240207-1" "$p"
done

fetch_deb cm-super "0.3.4-17" cm-super
fetch_deb lmodern "2.005-1" lmodern
fetch_deb tex-gyre "2.501-2" tex-gyre
fetch_deb tipa "1.3-21" tipa
fetch_deb latex-cjk-all "2023.20240207-1" latex-cjk

if [ ! -f "$WORK/mf/x/usr/bin/mf-nowin" ]; then
  echo "Fetching texlive-binaries and kpathsea for PK generation (amd64)..."
  curl -fsSL -o /tmp/tlbin.deb \
    http://archive.ubuntu.com/ubuntu/pool/universe/t/texlive-bin/texlive-binaries_2023.20230311.66589-8_amd64.deb || true
  curl -fsSL -o /tmp/kpath.deb \
    http://archive.ubuntu.com/ubuntu/pool/universe/t/texlive-bin/libkpathsea6_2023.20230311.66589-8_amd64.deb || true
  if [ -f /tmp/tlbin.deb ]; then
    dpkg-deb -x /tmp/tlbin.deb "$WORK/mf/x"
    dpkg-deb -x /tmp/kpath.deb "$WORK/mf/x" || true
  fi
  rm -f /tmp/tlbin.deb /tmp/kpath.deb
fi

GEN="$(cd "$(dirname "$0")" && pwd)/../inputs/generated.tar.gz"
if [ -f "$GEN" ]; then
  echo "Extracting generated.tar.gz"
  tar -xzf "$GEN" -C "$WORK"
fi

echo
echo "Done. export GALLEY_WORK=$WORK"
echo "Then from the repo root: python3 tex/build_tree.py tree && python3 tex/build_tree.py packs"

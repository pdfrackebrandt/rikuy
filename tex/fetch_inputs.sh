#!/bin/sh
# Lay out GALLEY_WORK (default /tmp/eng) with BusyTeX 1.4.0 assets and the Ubuntu 24.04
# TeX Live 2023 packages the build expects. Then extract the committed generated.tar.gz.
#
# On a fresh Ubuntu 24.04 prefer apt-get download for the exact versions.
# The script below uses the mirror URLs that resolved on 2026-10-15.
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
  tar --no-same-owner -xzf busytex-assets.tar.gz -C "$WORK/busy" || true
  if [ -d "$WORK/busy/public/core/busytex" ]; then
    mv "$WORK/busy/public/core/busytex" "$WORK/busy/busytex" 2>/dev/null || true
  fi
  rm -f busytex-assets.tar.gz
fi

# 2. Pinned debs with resolved URLs
mkdir -p "$WORK/debs/x" "$WORK/mf/x"
fetch() {
  name="$1" url="$2"
  if [ ! -d "debs/x/$name" ]; then
    echo "Fetching $name"
    curl -fsSL -o "/tmp/${name}.deb" "$url" || { echo "missing $name"; return; }
    mkdir -p "debs/x/$name"
    dpkg-deb -x "/tmp/${name}.deb" "debs/x/$name"
    rm -f "/tmp/${name}.deb"
  fi
}

fetch texlive-base "http://archive.ubuntu.com/ubuntu/pool/universe/t/texlive-base/texlive-base_2023.20240207-1_all.deb"
fetch texlive-lang-german "http://archive.ubuntu.com/ubuntu/pool/universe/t/texlive-lang/texlive-lang-german_2023.20240207-1_all.deb"
fetch texlive-science "http://mirrors.kernel.org/ubuntu/pool/universe/t/texlive-extra/texlive-science_2023.20240207-1_all.deb"
fetch texlive-pictures "http://mirrors.kernel.org/ubuntu/pool/universe/t/texlive-base/texlive-pictures_2023.20240207-1_all.deb"
fetch texlive-pstricks "http://mirrors.kernel.org/ubuntu/pool/universe/t/texlive-extra/texlive-pstricks_2023.20240207-1_all.deb"
fetch texlive-latex-extra "http://mirrors.kernel.org/ubuntu/pool/universe/t/texlive-extra/texlive-latex-extra_2023.20240207-1_all.deb"
fetch cm-super "http://mirrors.kernel.org/ubuntu/pool/universe/c/cm-super/cm-super_0.3.4-17_all.deb"
fetch lmodern "http://mirrors.kernel.org/ubuntu/pool/universe/l/lmodern/lmodern_2.005-1_all.deb"
fetch tex-gyre "http://mirrors.kernel.org/ubuntu/pool/universe/t/tex-gyre/tex-gyre_20180621-6_all.deb"
fetch tipa "http://mirrors.kernel.org/ubuntu/pool/universe/t/tipa/tipa_1.3-21_all.deb"

# 3. generated inputs
GEN="$(cd "$(dirname "$0")" && pwd)/../inputs/generated.tar.gz"
if [ -f "$GEN" ]; then
  echo "Extracting generated.tar.gz"
  tar -xzf "$GEN" -C "$WORK"
fi

echo "Inputs laid out under $WORK"
echo "Note: tree-extra still needs the BusyTeX .data packages unpacked (see PLAN.md)."

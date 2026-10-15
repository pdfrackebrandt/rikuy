#!/bin/sh
# Lay out GALLEY_WORK (default /tmp/eng) with BusyTeX 1.4.0 assets and the Ubuntu 24.04
# TeX Live 2023 packages the build expects. Then extract the committed generated.tar.gz.
#
# On a fresh Ubuntu 24.04 (or container) this gets you to the point of running
# python3 tex/build_tree.py tree && python3 tex/build_tree.py packs && node build.mjs
# Note: some package paths on archive.ubuntu.com differ; on a real Ubuntu use apt-get download.
set -e
WORK=${GALLEY_WORK:-/tmp/eng}
mkdir -p "$WORK"
cd "$WORK"

echo "Work directory: $WORK"

# 1. BusyTeX release assets (tolerate ownership in sandbox)
if [ ! -f "$WORK/busy/busytex/busytex.wasm" ]; then
  echo "Fetching BusyTeX 1.4.0 assets..."
  curl -fsSL -o busytex-assets.tar.gz \
    https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz
  mkdir -p "$WORK/busy"
  tar --no-same-owner -xzf busytex-assets.tar.gz -C "$WORK/busy" || true
  if [ -d "$WORK/busy/public/core/busytex" ]; then
    mv "$WORK/busy/public/core/busytex" "$WORK/busy/busytex"
    rm -rf "$WORK/busy/public"
  fi
  rm -f busytex-assets.tar.gz
fi

# 2. Pinned Ubuntu noble debs. Prefer apt on Ubuntu.
mkdir -p "$WORK/debs/x" "$WORK/mf/x"
if command -v apt-get >/dev/null && [ -f /etc/os-release ] && grep -q 'Ubuntu' /etc/os-release; then
  echo "Using apt-get download for pinned packages (run as root if needed)"
  # Example: sudo apt-get download texlive-base=2023.20240207-1 || true
  echo "See PLAN.md for the full package list. Manual dpkg-deb -x after download."
else
  echo "Not on Ubuntu; download the debs listed in PLAN.md from archive.ubuntu.com and unpack into debs/x/<pkg>/"
  echo "Some pool paths differ (e.g. cm-super under c/). texlive-base works as a test."
fi

# 3. Committed generated inputs
GEN="$(cd "$(dirname "$0")" && pwd)/../inputs/generated.tar.gz"
if [ -f "$GEN" ]; then
  echo "Extracting generated.tar.gz"
  tar -xzf "$GEN" -C "$WORK"
fi

echo
echo "Done. export GALLEY_WORK=$WORK"
echo "Then from the repo root: python3 tex/build_tree.py tree && python3 tex/build_tree.py packs"

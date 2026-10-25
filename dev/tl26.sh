#!/bin/sh
# Run a command with the desktop TeX Live 2026 that dev/fetch_tl26.sh lays out in $TL26
# (default /opt/tl26): Ubuntu 26.10's TeX Live 2026 packages and the libraries they need,
# run through that release's own dynamic loader, so they work on an older system without
# touching it. Example: dev/tl26.sh latexmk -pdf main.tex
TL=${TL26:-/opt/tl26}
P=5.42
export PATH="$TL/usr/bin:$PATH"
export TEXMFCNF="$TL/etc/texmf/web2c"
export PERL5LIB="$TL/etc/perl:$TL/usr/local/lib/x86_64-linux-gnu/perl/$P:$TL/usr/local/share/perl/$P:$TL/usr/lib/x86_64-linux-gnu/perl5/$P:$TL/usr/share/perl5:$TL/usr/lib/x86_64-linux-gnu/perl-base:$TL/usr/lib/x86_64-linux-gnu/perl/$P:$TL/usr/share/perl/$P:$TL/usr/share/texlive/tlpkg"
export FONTCONFIG_FILE="$TL/galley/fonts.conf"
G="$TL/usr/share/ghostscript/10.07.1"
export GS_LIB="$G/Resource/Init:$G/lib:$G/Resource/Font:$TL/usr/share/ghostscript/fonts:$TL/var/lib/ghostscript/fonts:$TL/usr/share/fonts/type1/urw-base35"
export GS_OPTIONS="-sGenericResourceDir=$G/Resource/ -sICCProfilesDir=$G/iccprofiles/"
# libpaper 2 reads its table of sizes from $XDG_CONFIG_HOME (the host has none in /etc); a4, as TeX Live
export XDG_CONFIG_HOME="$TL/home/config" PAPERSIZE=a4
export TEXMFVAR="$TL/home/texmf-var" TEXMFCONFIG="$TL/home/texmf-config" TEXMFHOME="$TL/home/texmf"
exec "$@"

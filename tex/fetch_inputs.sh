#!/bin/sh
# Lay out the work folder the build scripts read ($GALLEY_WORK, default /tmp/eng) with, byte for
# byte, the inputs the published Galley was built from. Safe to rerun: finished steps are skipped.
#
#   busy/busytex/   BusyTeX 1.4.0 release assets (TeX Live 2026 engines, texlive-*.data)
#   tree-extra/     the TeX Live tree inside those .data packages (unpack_busytex.py)
#   debs/x/<pkg>/   44 Ubuntu 24.04 packages (TeX Live 2023 and friends), each dpkg-deb -x
#   mf/x/           texlive-binaries, texlive-base, libkpathsea6 in one folder (METAFONT, build_pk.py)
#   extra/ fccache/ usage.json pdflatex-all.fmt   from inputs/generated.tar.gz
#
# Every download is checked against its sha256. The Ubuntu files come from the noble release
# pocket, which never changes; if a mirror ever drops one, set UBUNTU_MIRROR to
# https://snapshot.ubuntu.com/ubuntu/20240425T000000Z (same paths).
# Needs curl, sha256sum, dpkg-deb, and python3 with lz4 (pip install lz4).
set -eu
WORK=${GALLEY_WORK:-/tmp/eng}
MIRROR=${UBUNTU_MIRROR:-http://archive.ubuntu.com/ubuntu}
HERE=$(cd "$(dirname "$0")" && pwd)
DONE="$WORK/.fetched"
mkdir -p "$DONE" "$WORK/busy" "$WORK/debs/x" "$WORK/mf"

for tool in curl sha256sum dpkg-deb python3; do
  command -v "$tool" >/dev/null || { echo "fetch_inputs: $tool is needed" >&2; exit 1; }
done
python3 -c 'import lz4.block' 2>/dev/null || { echo "fetch_inputs: pip install lz4" >&2; exit 1; }

# get URL FILE SHA256: download FILE unless it is already there with that hash
get() {
  if [ -f "$2" ] && echo "$3  $2" | sha256sum -c --status; then return 0; fi
  echo "downloading $1"
  curl -fL --retry 3 -sS -o "$2.part" "$1" || { echo "fetch_inputs: cannot download $1" >&2; exit 1; }
  echo "$3  $2.part" | sha256sum -c --status || { echo "fetch_inputs: sha256 mismatch for $1" >&2; exit 1; }
  mv "$2.part" "$2"
}

# 1. the BusyTeX release, and the tree inside its .data packages
if [ ! -f "$DONE/busytex" ]; then
  get https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz \
      "$WORK/busy/busytex-assets.tar.gz" 1caa434fb5aab5bdd59dc303bca2ac7b9b9af02ef1627bf8652caabfa1b7cd2b
  rm -rf "${WORK:?}/busy/busytex"
  tar --no-same-owner -xzf "$WORK/busy/busytex-assets.tar.gz" -C "$WORK/busy"
  [ -f "$WORK/busy/busytex/busytex.wasm" ] || { echo "fetch_inputs: no busytex/busytex.wasm in the release" >&2; exit 1; }
  touch "$DONE/busytex"
fi
if [ ! -f "$DONE/tree-extra" ]; then
  rm -rf "${WORK:?}/tree-extra"
  python3 "$HERE/unpack_busytex.py" "$WORK/busy/busytex" "$WORK/tree-extra"
  touch "$DONE/tree-extra"
fi

# 2. Ubuntu packages: folder name, path in the archive, sha256 (from noble's Packages index)
while read -r name pool sum; do
  [ -f "$DONE/deb-$name" ] && continue
  get "$MIRROR/$pool" "$WORK/debs/${pool##*/}" "$sum"
  rm -rf "${WORK:?}/debs/x/$name"
  dpkg-deb -x "$WORK/debs/${pool##*/}" "$WORK/debs/x/$name"
  touch "$DONE/deb-$name"
done <<EOF
asymptote pool/universe/a/asymptote/asymptote_2.87+ds-1build2_amd64.deb 6ba6b8b5704ea45855f2d391e7d99a3a3c6e3a04d65b26a8d26d317b0abb8336
cm-super pool/universe/c/cm-super/cm-super_0.3.4-17_all.deb b545d74f5aae7982baf1236726e3d6c149e3fee4b4cfad63ab538ea0598cdc6f
latex-cjk-all pool/universe/c/cjk/latex-cjk-all_4.8.5-1_all.deb 84c6998f1ab72fc69f9ecdd9a9ae40bc4d687acf2a46d75511439ece9077fb3f
lmodern pool/universe/l/lmodern/lmodern_2.005-1_all.deb c12dcbcd404c14147dcae47d74fcc85cef64758ab98ba6c9e728c717a9b3633c
tex-gyre pool/universe/t/tex-gyre/tex-gyre_20180621-6_all.deb 547c41d20dcf98c6c5d361e94ac3b4b6785d479fdd1b0875d2f5e670606ca841
texlive-base pool/universe/t/texlive-base/texlive-base_2023.20240207-1_all.deb d5fb8e71ede65344896349498fc9d8931dfdc69892c601f0c406c2767ccd6216
texlive-bibtex-extra pool/universe/t/texlive-extra/texlive-bibtex-extra_2023.20240207-1_all.deb cb2449a027d7da2cff531e64dc5885fdc501206ae2963d96cd1a85081cc22523
texlive-extra-utils pool/universe/t/texlive-extra/texlive-extra-utils_2023.20240207-1_all.deb a4d1bf34ffc298ac3a1a65fafb14db408b14a26a83e044755a2620a4aa48ea30
texlive-font-utils pool/universe/t/texlive-extra/texlive-font-utils_2023.20240207-1_all.deb 0a8bb548f379d0731876f3bf60b294b28b75c6f7634f8beb1cec6352f879170c
texlive-fonts-extra pool/universe/t/texlive-extra/texlive-fonts-extra_2023.20240207-1_all.deb 66b09d52492c3f32450b429af42f5d30f3df286c23cbcf2cf99031a773fadec7
texlive-fonts-recommended pool/universe/t/texlive-base/texlive-fonts-recommended_2023.20240207-1_all.deb 350ff2efe82e901158ef589530473c8c838fd19a75aa793da5b53d81ec41de80
texlive-formats-extra pool/universe/t/texlive-extra/texlive-formats-extra_2023.20240207-1_all.deb 438b17b056894386f0ac0b90be1993a1dc140d839c0c23f706cc0beb0bb86a45
texlive-games pool/universe/t/texlive-extra/texlive-games_2023.20240207-1_all.deb c21913fd9236583c5becd9009105fbee2112e72917b0701133eaf12a6501abf4
texlive-humanities pool/universe/t/texlive-extra/texlive-humanities_2023.20240207-1_all.deb f21bc0577ccb1b702996eec1373efad17875e3dd3254516ffcaadd9e94733eae
texlive-lang-arabic pool/universe/t/texlive-lang/texlive-lang-arabic_2023.20240207-1_all.deb 239cb9656d952aede1bc3ffdd18349a93f182a552ac2c795eba758fce4ce735b
texlive-lang-chinese pool/universe/t/texlive-lang/texlive-lang-chinese_2023.20240207-1_all.deb 8ebcaac1d9b670668863c5834c820577fe1e94ab90988850e150b6bb51a0f49d
texlive-lang-cjk pool/universe/t/texlive-lang/texlive-lang-cjk_2023.20240207-1_all.deb 9f36fc10a595360bf40691480d18a7f8a9ef3f781e50d848c1d209ee5b84dce7
texlive-lang-cyrillic pool/universe/t/texlive-lang/texlive-lang-cyrillic_2023.20240207-1_all.deb 61e7bd1b886b23637d96b7991e60b67a70c109f89880815b5dfcd0168faab25c
texlive-lang-czechslovak pool/universe/t/texlive-lang/texlive-lang-czechslovak_2023.20240207-1_all.deb fd0fecaec13101b1f5d86f79469441876cac2e802107edecd1f34c5673d57d2d
texlive-lang-english pool/universe/t/texlive-lang/texlive-lang-english_2023.20240207-1_all.deb 5276ab404eadbe12269aace5f593e614db6c8bc2afde985f9b91fed939fd6ced
texlive-lang-european pool/universe/t/texlive-lang/texlive-lang-european_2023.20240207-1_all.deb c4ab4be37feaae548e6c923b0d5f9497a3c55470735972a8a627bd100b853d50
texlive-lang-french pool/universe/t/texlive-lang/texlive-lang-french_2023.20240207-1_all.deb 65a93b4813e27a3a460da6fea77d50a103d3145055d15286d79ce327d6c79c49
texlive-lang-german pool/universe/t/texlive-lang/texlive-lang-german_2023.20240207-1_all.deb 40cc27da50c252f5af9868d693cdf103ed1704188071c17b98b007775a7d0416
texlive-lang-greek pool/universe/t/texlive-lang/texlive-lang-greek_2023.20240207-1_all.deb 8de5b241ee136dd730659ebe1cd8aad6f78e0def8fd486d64405670c5a7e3fe2
texlive-lang-italian pool/universe/t/texlive-lang/texlive-lang-italian_2023.20240207-1_all.deb f87bc67f8bd5f60e370e9a52cf1d212c5f1147e8ae07626da426268145233c59
texlive-lang-japanese pool/universe/t/texlive-lang/texlive-lang-japanese_2023.20240207-1_all.deb 9006177a04ef8d4334331ec20ab1315c51a41d1ff88bcb110333b4c4ffe5157f
texlive-lang-korean pool/universe/t/texlive-lang/texlive-lang-korean_2023.20240207-1_all.deb 30979e0c5cb6a2d713843b99635870e3d2b1f53ee876d6bfda410fcf48110adb
texlive-lang-other pool/universe/t/texlive-lang/texlive-lang-other_2023.20240207-1_all.deb 5d4e60cdb1a74b4777159d32be78dddbb5d5b7bf66cb55d6e3453dad68ea215a
texlive-lang-polish pool/universe/t/texlive-lang/texlive-lang-polish_2023.20240207-1_all.deb d9282665ab628a7415297d9905d2fa6aecf2fc7884007545cabfcca45ee6789b
texlive-lang-portuguese pool/universe/t/texlive-lang/texlive-lang-portuguese_2023.20240207-1_all.deb e5b91989c4095a65c9f99e513babc4f64c4892ab7412e091d40075bb1549eb4c
texlive-lang-spanish pool/universe/t/texlive-lang/texlive-lang-spanish_2023.20240207-1_all.deb 9b85b7a5c67b971f37371c163aaf150db401bde515c823464186a0abecd85b85
texlive-latex-base pool/universe/t/texlive-base/texlive-latex-base_2023.20240207-1_all.deb abab46588cb0071216b440e2f7b1daaba57d768b1e8974e42c0b5a12f1c7b1d0
texlive-latex-extra pool/universe/t/texlive-extra/texlive-latex-extra_2023.20240207-1_all.deb db88906dc6c7d814edbb878041d75e389c6d898b76fa5dc2efe71abb9da5f0fd
texlive-latex-recommended pool/universe/t/texlive-base/texlive-latex-recommended_2023.20240207-1_all.deb 5dfb6d1082e5eba3a6f7fcc6f0e10c9864fceb4491abbb69d3a9480b908ae75c
texlive-luatex pool/universe/t/texlive-base/texlive-luatex_2023.20240207-1_all.deb 42279161883341d96461d528960b0966e958e07a58ba478ebd4cb498be4ccb52
texlive-metapost pool/universe/t/texlive-base/texlive-metapost_2023.20240207-1_all.deb 37e242441bfcd6486bbacce5f77ece470f6b8e694e9dafacd061174126ae5a45
texlive-music pool/universe/t/texlive-extra/texlive-music_2023.20240207-1_all.deb 6fa3f704f9474404ece91f5eb0fc05787ec6e9403f1b3325e139237d26e9ba90
texlive-pictures pool/universe/t/texlive-base/texlive-pictures_2023.20240207-1_all.deb d2c81e3e52d4f53bcf00b43660096018c50c6c1eef7368fa1bdaa13d464d3638
texlive-plain-generic pool/universe/t/texlive-extra/texlive-plain-generic_2023.20240207-1_all.deb 9074b74e3f84795f1a2e2c868786da6dba134fda152afc3e9c6b24315445c8b9
texlive-pstricks pool/universe/t/texlive-extra/texlive-pstricks_2023.20240207-1_all.deb a03b8ab0625fbc2969fcf6c4a5f78e19a2d30f70bea509f373bee2acf5313a06
texlive-publishers pool/universe/t/texlive-extra/texlive-publishers_2023.20240207-1_all.deb 52cb5eafded77465505f43174be3d7fe59d472a21298d4699f91ea16b5e5c623
texlive-science pool/universe/t/texlive-extra/texlive-science_2023.20240207-1_all.deb 01beac58521957fab75aeee6f07b8aacc2da94ef2c435b7fed719a5405d588d1
texlive-xetex pool/universe/t/texlive-base/texlive-xetex_2023.20240207-1_all.deb 4222708e7bb02a4cd6f4d025e9d8179d6c5b2378db4eb16b865b720ceef782f3
tipa pool/universe/t/tipa/tipa_1.3-21_all.deb d07c6b1ebf5cb1c2c9d47c8e61403823db871193d000966572536a23c37cb8f2
EOF

# 3. METAFONT and gftopk for build_pk.py: three packages unpacked into one folder
if [ ! -f "$DONE/mf" ]; then
  rm -rf "${WORK:?}/mf/x"
  mkdir -p "$WORK/mf/x"
  while read -r name pool sum; do
    get "$MIRROR/$pool" "$WORK/mf/${pool##*/}" "$sum"
    dpkg-deb -x "$WORK/mf/${pool##*/}" "$WORK/mf/x"
  done <<EOF
texlive-binaries pool/universe/t/texlive-bin/texlive-binaries_2023.20230311.66589-9build3_amd64.deb 18cc916f9a6ff3f334fc85cd272cb58b63ca3fafee841516b308028259636d86
texlive-base pool/universe/t/texlive-base/texlive-base_2023.20240207-1_all.deb d5fb8e71ede65344896349498fc9d8931dfdc69892c601f0c406c2767ccd6216
libkpathsea6 pool/main/t/texlive-bin/libkpathsea6_2023.20230311.66589-9build3_amd64.deb 9a1fd09a592bd83b0e5644f0c636d99546afee5374ce781389b5e42d65b25021
EOF
  touch "$DONE/mf"
fi

# 4. inputs that took an engine run to make: ICU subset, PK fonts, font and Lua caches, the
# pdfLaTeX format, the corpus usage profile
if [ ! -f "$DONE/generated" ]; then
  tar -xzf "$HERE/../inputs/generated.tar.gz" -C "$WORK"
  touch "$DONE/generated"
fi

echo "inputs ready in $WORK"

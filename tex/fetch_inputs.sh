#!/bin/sh
# Lay out the work folder the build scripts read ($RIKUY_WORK, default /tmp/eng) with, byte for
# byte, the inputs the published Rikuy was built from: BusyTeX's TeX Live 2026 engines and the
# TeX Live 2026 packages of Ubuntu 26.10. Safe to rerun: finished steps are skipped.
#
#   busy/busytex/   BusyTeX 1.4.0 release assets (TeX Live 2026 engines, texlive-*.data)
#   tree-extra/     the TeX Live tree inside those .data packages (unpack_busytex.py)
#   debs/x/<pkg>/   44 Ubuntu 26.10 packages (TeX Live 2026 and friends), each dpkg-deb -x
#   mf/x/           texlive-binaries, texlive-base, libkpathsea6 and libc6 in one folder (METAFONT
#                   for build_pk.py, started through that libc's own loader)
#   extra/ fccache/ fmt/ usage.json pdflatex-all.fmt   from inputs/generated*.tar.gz: what Rikuy's
#                   own engines made from this tree (formats, PK fonts, font caches), see build_all.sh
#
# Every download is checked against its hash. The Ubuntu files come from the 26.10 (stonking)
# release pocket, which never changes; if a mirror ever drops one, set UBUNTU_MIRROR to
# https://snapshot.ubuntu.com/ubuntu/20261016T000000Z (same paths).
# Needs curl, sha256sum, sha512sum, dpkg-deb, and python3 with lz4 (pip install lz4).
set -eu
WORK=${RIKUY_WORK:-/tmp/eng}
MIRROR=${UBUNTU_MIRROR:-http://archive.ubuntu.com/ubuntu}
HERE=$(cd "$(dirname "$0")" && pwd)
DONE="$WORK/.fetched"
mkdir -p "$DONE" "$WORK/busy" "$WORK/debs/x" "$WORK/mf"

for tool in curl sha256sum sha512sum dpkg-deb python3; do
  command -v "$tool" >/dev/null || { echo "fetch_inputs: $tool is needed" >&2; exit 1; }
done
python3 -c 'import lz4.block' 2>/dev/null || { echo "fetch_inputs: pip install lz4" >&2; exit 1; }

# get URL FILE HASH: download FILE unless it is already there with that hash (sha256:... or
# sha512:..., as the Ubuntu index gives it)
get() {
  case "$3" in sha512:*) algo=sha512sum ;; *) algo=sha256sum ;; esac
  sum=${3#*:}
  if [ -f "$2" ] && echo "$sum  $2" | $algo -c --status; then return 0; fi
  echo "downloading $1"
  curl -fL --retry 6 --retry-all-errors --retry-delay 5 -sS -o "$2.part" "$1" || { echo "fetch_inputs: cannot download $1" >&2; exit 1; }
  echo "$sum  $2.part" | $algo -c --status || { echo "fetch_inputs: hash mismatch for $1" >&2; exit 1; }
  mv "$2.part" "$2"
}

# 1. the BusyTeX release, and the tree inside its .data packages
if [ ! -f "$DONE/busytex" ]; then
  get https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz \
      "$WORK/busy/busytex-assets.tar.gz" sha256:1caa434fb5aab5bdd59dc303bca2ac7b9b9af02ef1627bf8652caabfa1b7cd2b
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

# 2. Ubuntu packages: folder name, path in the archive, hash (from stonking's Packages index)
while read -r name pool sum; do
  [ -f "$DONE/deb-$name" ] && continue
  get "$MIRROR/$pool" "$WORK/debs/${pool##*/}" "$sum"
  rm -rf "${WORK:?}/debs/x/$name"
  dpkg-deb -x "$WORK/debs/${pool##*/}" "$WORK/debs/x/$name"
  touch "$DONE/deb-$name"
done <<EOF
asymptote pool/universe/a/asymptote/asymptote_3.11+ds-1_amd64.deb sha512:19a01ebe2cae398b4e16181af416c7105eb0f14af2cc17fa8ba973b14d3f6ed048f996679cec91b18d7192c924a47b703cd6a673c25d054c0e1281092f872eff
cm-super pool/universe/c/cm-super/cm-super_0.3.4-17build1_all.deb sha512:b8a80e2c8854dc37e2b1c11eccfecf214c7d2cc424f93316b5c9cebfab7ce7cb5a96328c1ff9ea0365ec879f057e23bdefbfe29b5cf46ce92c3381078ad6ea19
latex-cjk-all pool/universe/c/cjk/latex-cjk-all_4.8.5-3_all.deb sha512:209b9ea73a2f6883d8ba930464eea4c6996a224f75613fb2cecbd02d87552798b50089c78b58d7ce5f6ea39c2e00e44c9a980c97a7ebeeab2095bf411a77c415
lmodern pool/universe/l/lmodern/lmodern_2.005-2_all.deb sha512:12a834ac993fc7de4c158f5dfae601d9e16179943441ae57c007e9ffb0a68b8b4bf783635f229d3c77ec738dddf67bb7bf558648b5bc13ef62b4dbd5a00c6a0e
tex-gyre pool/universe/t/tex-gyre/tex-gyre_20180621-8_all.deb sha512:8c953b2e00276fd02c34310747138839ad29bf5077b0f4d258042c731f35b26c648de49156ccbc8f36a6ea82ef46277333f0cb3c78aaab5dc472d06a36aa1c04
texlive-base pool/universe/t/texlive-base/texlive-base_2026.20260711-2_all.deb sha512:83a4a84b7dc4793e6b60445909259e3e77caeaca29c4ead0c16942cb928b75de1856ee712d0935ebe9a1c81f263cc58136f86373c37a49d4357c1150d8768ef8
texlive-bibtex-extra pool/universe/t/texlive-extra/texlive-bibtex-extra_2026.20260711-2_all.deb sha512:55a92d60e70847ae24888e7d61c283526b421432f00f35ea905d1d578e9c0fa8d0b16215a60b0d1607b5d768fcb4da3c8a0a96a16b00e44e41e840b0d1f0ba1a
texlive-extra-utils pool/universe/t/texlive-extra/texlive-extra-utils_2026.20260711-2_all.deb sha512:3ed8ce98428d62849de3971a7f880ad4c660fb6dcf282401882200b35c38f0d01b744c5bc9e629b18b29290b4845cf9d59f0d427a3446cffafedb3449260d420
texlive-font-utils pool/universe/t/texlive-extra/texlive-font-utils_2026.20260711-2_all.deb sha512:c844726538969f9a058ff62d3bc6894054b1d8e38964606bb8acf1436f18513ecb408454f0adfa661f2de19d7c6355aae4acffbfee5e1c402a0d85707b7cfd7b
texlive-fonts-extra pool/universe/t/texlive-extra/texlive-fonts-extra_2026.20260711-2_all.deb sha512:6b3109ef46e259b31e9e590fba7c16a3581fdb3ec2119b29b7c023bf7f9225914e975a2cc4faf52d638ed84942c905ea092863ffb2d30be8c152e1e6c644e34c
texlive-fonts-recommended pool/universe/t/texlive-base/texlive-fonts-recommended_2026.20260711-2_all.deb sha512:1f278e759fd60c419ca480a18aa186bacf4647b0d268e3e1475e2024376ea9994d1531fcdbead8a768f43076be5c182d6d377e2c47c2ecd1bee34cebe6ccce64
texlive-formats-extra pool/universe/t/texlive-extra/texlive-formats-extra_2026.20260711-2_all.deb sha512:c8a4b4b21c773d6ad5ee402bfb0c616175bf5f9237dfe1a8c3ca8773832afa560dd5ade856941677202f1ce4e8731f80499a7eb25cdcb4be52b36b9baf4b4306
texlive-games pool/universe/t/texlive-extra/texlive-games_2026.20260711-2_all.deb sha512:08979e11f26c72d19b0e3b07ea4aaeede69bbf3bd4257deff36c6cdb97b815a85c89c879628e5586956d7b466f71fa5dbda09946f370f7cbb5fb6c696b833b13
texlive-humanities pool/universe/t/texlive-extra/texlive-humanities_2026.20260711-2_all.deb sha512:90e0c8471f35fe74066a05ff90d9ec5108f56ee2bc8e1603244316a999101457eae79f26b93a68d47dfadb6bcf3f6301641d450494c59869a113ebbed95e4019
texlive-lang-arabic pool/universe/t/texlive-lang/texlive-lang-arabic_2026.20260711-1_all.deb sha512:6bbf393860c9b0f31fc0dba3923012baa64437284a2a0e21b00067072cf60e75fbaa770239d33e351f50a2767d88788504e1860ac75a761260ad6a5642833b47
texlive-lang-chinese pool/universe/t/texlive-lang/texlive-lang-chinese_2026.20260711-1_all.deb sha512:fd81452878c4a1a57ec8c55b654c6cb5a66527cf3fe5124036378518fa41ff273980ff9342f613731d9ae64c85566d38a573058d04c8ff329fbaab097a7f4900
texlive-lang-cjk pool/universe/t/texlive-lang/texlive-lang-cjk_2026.20260711-1_all.deb sha512:d4844f9b93d1f10aec08f2583e0c4f66c62968ff006a4b03087e7ffb4870add78873adf37ee066cdb189f0ba0f5b0c1ee324da48159b9a24e0bdb22d567f7f73
texlive-lang-cyrillic pool/universe/t/texlive-lang/texlive-lang-cyrillic_2026.20260711-1_all.deb sha512:58ba3d7fb39b40d296135b1a45a32bd5c2b23bddb49035ccd320be9d44e8ffa3da06b01c391c879c34ba131740fa77674606316939d31881fc5133aca07585e9
texlive-lang-czechslovak pool/universe/t/texlive-lang/texlive-lang-czechslovak_2026.20260711-1_all.deb sha512:c1b6af18e6b1e386bd8dca90dddc898ecef2fb8b237efde8b3daa805117917dbf7fa8bd3fda6fd33aa873d4e15f723007459727b730405766978f466c7693c4c
texlive-lang-english pool/universe/t/texlive-lang/texlive-lang-english_2026.20260711-1_all.deb sha512:c98ab11f5f5116459f47ffe2753114672d1e582b954269de62e844893de5288fbe031ef0b95f475aa1963fbe5d7553b31b4885d2cdb7c85deea968176a8cea4a
texlive-lang-european pool/universe/t/texlive-lang/texlive-lang-european_2026.20260711-1_all.deb sha512:4ea3583f8eeab097a0da27ba9661b3e677a0fb7645e0596b3f1e5c1d50083660e70f94b4e528c406419d11b430ac59f3369cb7d8d25694fc3439110708e16f63
texlive-lang-french pool/universe/t/texlive-lang/texlive-lang-french_2026.20260711-1_all.deb sha512:4ac19d9fc865a0351196a9f7f222746630a0071509113a41843f0781b5d9c87f4f48e68a31492616aaec9c59c6f0e92a4a9c4940883e7f11a5ac24e509989311
texlive-lang-german pool/universe/t/texlive-lang/texlive-lang-german_2026.20260711-1_all.deb sha512:5973b31919b2a9a33b211f4828475ac8f4f73f75f1d2997797f736d6a7e65433831bdae96d6925c432e03572e717c98f2a2337dba4fa46b43c30b5e7555a082a
texlive-lang-greek pool/universe/t/texlive-lang/texlive-lang-greek_2026.20260711-1_all.deb sha512:4b95fe023253274368b07eca62a1a56b5b7824330a3e2f480204c141833abaa1efabceca763063e43f79c0b829d49d74227c0f4cefd7f98df5d79e811776a9d3
texlive-lang-italian pool/universe/t/texlive-lang/texlive-lang-italian_2026.20260711-1_all.deb sha512:13feafe2138d7253688d1ca31e9221b986b5788b2551064a4ddbc2d3fb5796faea1d8ccb64c581b18d9e86130488b0c5094c536aee0e1c2f51a677b7ffc285ba
texlive-lang-japanese pool/universe/t/texlive-lang/texlive-lang-japanese_2026.20260711-1_all.deb sha512:53c829dce681cf5a29d0e4a4b11f1f9e3e1262969da21fe3f2c1dc1f67a1ee7aae49175f1fc7abbc206c86ef01f13b52936b26ec3422ea71381d60f7198865d0
texlive-lang-korean pool/universe/t/texlive-lang/texlive-lang-korean_2026.20260711-1_all.deb sha512:fc7a0dbf5e9fdcd92dda56452fedd66f724e6b9e7abc77bd0233d0aeb2d02c867ddd188bad4d01995b96f8c73e5016692c23d192427e38e5720edf35e75fef00
texlive-lang-other pool/universe/t/texlive-lang/texlive-lang-other_2026.20260711-1_all.deb sha512:3521100e4654c22b95819c47c2f145cf2feae560fd3527eaa7119fb55fbbef6a639f0b09582d9ef03026bad4974a4c34e195c549d0b9a8de5db83f5e69bb2532
texlive-lang-polish pool/universe/t/texlive-lang/texlive-lang-polish_2026.20260711-1_all.deb sha512:2300799458d34247207147e5cba766abb0dffa31aa4b12c8530c491525d25832def8cf268fa4648c6d569d45cb921923bbe87e3b8191564df38e986c80b70602
texlive-lang-portuguese pool/universe/t/texlive-lang/texlive-lang-portuguese_2026.20260711-1_all.deb sha512:a3214e0f9a42ff4253686ef8958737bd0e9158af997be07f381ac7b262450eb9ee326ac622a0cc923e641d13473ac87bfb1f03bc48d3252f3b3e0a083e7a283c
texlive-lang-spanish pool/universe/t/texlive-lang/texlive-lang-spanish_2026.20260711-1_all.deb sha512:62a4f7eb49dfcdbcc4b22eef84a2ac09eb33dd5d4572e8423f28a208c432086e805176eb9d003fcecae534122c261b3ede50e2a44984181a6be8f120be6e3743
texlive-latex-base pool/universe/t/texlive-base/texlive-latex-base_2026.20260711-2_all.deb sha512:7f366233f3cac9f19a5d7cce5e6baae7661405542d51044b97e5bc955c12f437f9a3afdee277453e0fd4678888d9fc939606f5abe9414b6d6a7b456d1ba89106
texlive-latex-extra pool/universe/t/texlive-extra/texlive-latex-extra_2026.20260711-2_all.deb sha512:53bfbe5ae8be68cb25930f19c7edb11eff6d266bf87d4bd83f11c1fb6ef62835c71c114383c2c3a6e8cbbe08d2b305d3cdedea11933bdc735ddf1a8554fb6947
texlive-latex-recommended pool/universe/t/texlive-base/texlive-latex-recommended_2026.20260711-2_all.deb sha512:ed172f05503b56596f3ec689108f8954832b942daf7b20294a2d674387021889daecd07391139618d0c32ce37ebad444a7fd0036dca1eedb105694bca64011c5
texlive-luatex pool/universe/t/texlive-base/texlive-luatex_2026.20260711-2_all.deb sha512:f54b50113455b826eae5882274f0aceadc7753747b65f210b76584c193307bf2ae5c3c8d0f0de96e977c702bd9ceda5a926bdace07fc9c6ea97d98c83f0983a7
texlive-metapost pool/universe/t/texlive-base/texlive-metapost_2026.20260711-2_all.deb sha512:c336cae3d87184335ce15ec4d85e17beb7a3f141fbfb848f42e727a0616cede674f91202d1bae53672407bbfcf4e339b92d35db807b58902e4b3a550630249c8
texlive-music pool/universe/t/texlive-extra/texlive-music_2026.20260711-2_all.deb sha512:0a92544e52136328b28645fe485aec089f7fd1e7f5650c0fd461187ae3008ba511a6a1e1b5a523368653db6b71ae1dc33739fd9665b042e215692ce9cd950426
texlive-pictures pool/universe/t/texlive-base/texlive-pictures_2026.20260711-2_all.deb sha512:d2976c4888fbd3c71fe4fbcbec49e70bcd8056719db2ed1580b46d81c28daae915122c2a40c93b5425160bc3a26aaf0e6722f6fbd81ff8f07843131cc36cde97
texlive-plain-generic pool/universe/t/texlive-extra/texlive-plain-generic_2026.20260711-2_all.deb sha512:f3322ca077d668288f8750f9c002a04c3cfb50c9a3355cc3e74304bdf0998aafc503a679942ec9272a84a01d6317b5f1e7fa0c1ab6385561f86bebf9f3dea2a1
texlive-pstricks pool/universe/t/texlive-extra/texlive-pstricks_2026.20260711-2_all.deb sha512:f4d325b83c27fe7f4c0dce8dcbaf15a74359e0752fc0bf305969100908493d273447027804382b24ad80a6ff7611f98895445f9cbeca38615d7325966707a504
texlive-publishers pool/universe/t/texlive-extra/texlive-publishers_2026.20260711-2_all.deb sha512:11ceae5a13a5a55d8ddfa84905f050ad29b019addcce21f42c87e08abe69076e73f12ff2ca22c10123af80e8ba28d40d030281e0ba24f7c3cab384965dbb12a3
texlive-science pool/universe/t/texlive-extra/texlive-science_2026.20260711-2_all.deb sha512:5daf74757cde990fc2029e9d1ea56f8c3e7286cb344232a7ebe6a4fdaeb16a5388d1878fd179dfdd789aa86fbedd3b29ed49183c4d58d1a2f21427cfcf3b9516
texlive-xetex pool/universe/t/texlive-base/texlive-xetex_2026.20260711-2_all.deb sha512:bae2858a26bf15c057505569ce5e8d24959a1f0f3ee5a32be1f2353924e61e1d2584cee6421223f7c947541da0c9f27b0da8f58fbf65a40bff8e111b9b654997
tipa pool/universe/t/tipa/tipa_1.3-21build1_all.deb sha512:390d76d6a70dd004bcbb43787713a0335eba06c66905fd9533ad7743c90d5ecc8b1a7fac7aed9f9a21be5b1bd8eb0700308a1eb259bc5f2a313b49545c58b075
EOF

# 3. METAFONT and gftopk for build_pk.py: three packages unpacked into one folder
if [ ! -f "$DONE/mf" ]; then
  rm -rf "${WORK:?}/mf/x"
  mkdir -p "$WORK/mf/x"
  while read -r name pool sum; do
    get "$MIRROR/$pool" "$WORK/mf/${pool##*/}" "$sum"
    dpkg-deb -x "$WORK/mf/${pool##*/}" "$WORK/mf/x"
  done <<EOF
texlive-binaries pool/universe/t/texlive-bin/texlive-binaries_2026.20260303.78225+ds-5ubuntu1_amd64.deb sha512:27c9d9e3e95a58c0426af595d8e23020d9fbe0f6d84609939a36ba10ac12ec7c5f3eb4bca57a964ef7c1de01a2eba97467008102fd596ec0746549abc3c29c35
texlive-base pool/universe/t/texlive-base/texlive-base_2026.20260711-2_all.deb sha512:83a4a84b7dc4793e6b60445909259e3e77caeaca29c4ead0c16942cb928b75de1856ee712d0935ebe9a1c81f263cc58136f86373c37a49d4357c1150d8768ef8
libkpathsea6 pool/universe/t/texlive-bin/libkpathsea6_2026.20260303.78225+ds-5ubuntu1_amd64.deb sha512:8c3a7059adb537b4e0105aa551b8059ae5017706e9d2745eb2b20ec606be0641ccca8ee81c0b4fbd5c2f3647978f6f9ebf6f1465250d67e01dba7c65c4e9596a
libc6 pool/main/g/glibc/libc6_2.44-1ubuntu2_amd64.deb sha512:f13964f2de46e68f8170728cd26576fcbca6ac2bd490ee09750fb0d8ced3fce4e0a7ec83e81cdcf39fd8b30e57a0c08a7f75080a317e920f2ca89de6c0d6ffd6
EOF
  touch "$DONE/mf"
fi

# 4. inputs that took an engine run to make: ICU subset, PK fonts, font and Lua caches, the
# three LaTeX formats, the corpus usage profile
# (three archives, each under 10 MB: the fonts METAFONT made, the XeLaTeX and LuaLaTeX formats,
# the rest)
if [ ! -f "$DONE/generated" ]; then
  for a in generated generated-fonts generated-formats; do tar -xzf "$HERE/../inputs/$a.tar.gz" -C "$WORK"; done
  touch "$DONE/generated"
fi

echo "inputs ready in $WORK"

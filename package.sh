#!/bin/bash -e

rm -rf node_modules

if [ -z "${ADDON_ARCH}" ]; then
  TARFILE_SUFFIX=
else
  NODE_VERSION="$(node --version)"
  TARFILE_SUFFIX="-${ADDON_ARCH}-${NODE_VERSION/\.*/}"
fi

here=$(readlink -f $(dirname "$0"))

# build KenLM
rm -rf "${here}/kenlm" "${here}/bin"
mkdir -p "${here}/kenlm/build"
pushd "${here}/kenlm"
git clone https://github.com/kpu/kenlm
curl -L https://bitbucket.org/eigen/eigen/get/3.2.8.tar.bz2 | tar xj
pushd build
export EIGEN3_ROOT="${here}/kenlm/eigen-eigen-07105f7124f9"
cmake -DFORCE_STATIC=ON ../kenlm/
make -j build_binary lmplz
popd
popd
mkdir "${here}/bin"
cp "${here}/kenlm/build/bin/build_binary" "${here}/kenlm/build/bin/lmplz" "${here}/bin"
rm -rf "${here}/kenlm"

# get rid of the DS model we don't need
REMOVE_SUFFIX="pbmm"
if [[ -n "$ADDON_ARCH" && $ADDON_ARCH =~ x64 ]]; then
  REMOVE_SUFFIX="tflite"
fi

rm "${here}/assets/output_graph.${REMOVE_SUFFIX}"
python -c "import json, os; \
    fname = os.path.join(os.getcwd(), 'package.json'); \
    d = json.loads(open(fname).read()); \
    d['files'].remove('assets/output_graph.$REMOVE_SUFFIX'); \
    f = open(fname, 'wt'); \
    json.dump(d, f, indent=2); \
    f.close()
"

npm install --production

# keep only the compiled DS binary that we need
find node_modules/deepspeech/lib/binding/v0.6.1 -mindepth 1 -maxdepth 1 \! -name "${ADDON_ARCH}" -exec rm -rf {} \;

shasum --algorithm 256 manifest.json package.json *.js lib/*.js LICENSE README.md assets/* bin/* > SHA256SUMS

find node_modules -xtype l -delete
find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS

TARFILE=`npm pack`

tar xzf ${TARFILE}
rm ${TARFILE}
TARFILE_ARCH="${TARFILE/.tgz/${TARFILE_SUFFIX}.tgz}"
cp -r node_modules ./package
tar czf ${TARFILE_ARCH} package

shasum --algorithm 256 ${TARFILE_ARCH} > ${TARFILE_ARCH}.sha256sum

rm -rf SHA256SUMS package

#!/bin/bash -e

_STT_VERSION="1.2.0"
_STT_MODEL_VERSION="1.0.0"

# Setup environment for building inside Dockerized toolchain
export NVM_DIR="${HOME}/.nvm"
[ -s "${NVM_DIR}/nvm.sh" ] && source "${NVM_DIR}/nvm.sh"
[ $(id -u) = 0 ] && umask 0

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
curl -L https://gitlab.com/libeigen/eigen/-/archive/3.2.8/eigen-3.2.8.tar.bz2 | tar xj
pushd build
export EIGEN3_ROOT="${here}/kenlm/eigen-3.2.8"
cmake -DFORCE_STATIC=ON ../kenlm/
make -j build_binary lmplz
popd
popd
mkdir "${here}/bin"
cp \
  "${here}/kenlm/build/bin/build_binary" \
  "${here}/kenlm/build/bin/lmplz" \
  "${here}/bin"
rm -rf "${here}/kenlm"

# download the scorer binary
pushd "${here}/bin"
case "$ADDON_ARCH" in
  linux-x64)
    _SCORER_TARBALL="native_client.tflite.Linux.tar.xz"
    ;;
  linux-arm)
    _SCORER_TARBALL="native_client.tflite.linux.armv7.tar.xz"
    ;;
  linux-arm64)
    _SCORER_TARBALL="native_client.tflite.linux.aarch64.tar.xz"
    ;;
  darwin-x64)
    _SCORER_TARBALL="native_client.tflite.macOS.tar.xz"
    ;;
esac

curl \
  -L "https://github.com/coqui-ai/STT/releases/download/v${_STT_VERSION}/${_SCORER_TARBALL}" | \
  tar xJ generate_scorer_package
popd

# download the DeepSpeech model
pushd "${here}/assets"
curl \
  -o "model.tflite" \
  -L "https://github.com/coqui-ai/STT-models/releases/download/english%2Fcoqui%2Fv${_STT_MODEL_VERSION}-huge-vocab/model.tflite"
popd

npm install --production

# keep only the compiled STT binary that we need
module_version=$(node -e 'console.log(`node-v${process.config.variables.node_module_version}`)')
find "node_modules/stt/lib/binding/v${_STT_VERSION}" \
  -mindepth 1 \
  -maxdepth 1 \
  \! -name "${ADDON_ARCH}" \
  -exec rm -rf {} \;
find "node_modules/stt/lib/binding/v${_STT_VERSION}/${ADDON_ARCH}" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  \! -name "${module_version}" \
  -exec rm -rf {} \;

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

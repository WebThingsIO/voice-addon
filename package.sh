#!/bin/bash -e

here=$(readlink -f $(dirname "$0"))

# build KenLM
rm -rf "${here}/kenlm" "${here}/bin"
mkdir -p "${here}/kenlm/build"
pushd "${here}/kenlm"
git clone https://github.com/kpu/kenlm
wget -O - https://bitbucket.org/eigen/eigen/get/3.2.8.tar.bz2 | tar xj
pushd build
export EIGEN3_ROOT="${here}/kenlm/eigen-eigen-07105f7124f9"
cmake -DFORCE_STATIC=ON ../kenlm/
make -j build_binary lmplz
popd
popd
mkdir "${here}/bin"
cp "${here}/kenlm/build/bin/build_binary" "${here}/kenlm/build/bin/lmplz" "${here}/bin"
rm -rf "${here}/kenlm"

rm -rf node_modules

npm install --production

shasum --algorithm 256 manifest.json package.json *.js lib/*.js LICENSE README.md bin/* > SHA256SUMS

find node_modules -xtype l -delete
find node_modules \( -type f -o -type l \) -exec shasum --algorithm 256 {} \; >> SHA256SUMS

TARFILE=`npm pack`

tar xzf ${TARFILE}
cp -r node_modules ./package
tar czf ${TARFILE} package

shasum --algorithm 256 ${TARFILE} > ${TARFILE}.sha256sum

rm -rf SHA256SUMS package

// Exercise the exact page installed by the selected APK, including in a fresh checkout.
const path = require('node:path');
const {execFileSync} = require('node:child_process');

module.exports = function readPackagedHtml(filename, asset) {
  const apk = process.env.CLOCK_APK || path.join(__dirname, '../../outputs', filename);
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return execFileSync(python, ['-c',
    'import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
    apk, 'assets/' + asset
  ], {maxBuffer: 32 * 1024 * 1024});
};

// Build-time only. Install the pinned compiler with: npm ci --prefix work/tv-tooling
// Run after TV HTML assembly: node work/build-tv-bundle.cjs outputs/glass-clock-tv.html
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('./tv-tooling/node_modules/esbuild');
const filename = process.argv[2];
const target = process.argv[3] || 'chrome66';
if (!filename || path.extname(filename).toLowerCase() !== '.html') throw Error('Pass the assembled TV HTML path.');
const html = fs.readFileSync(filename, 'utf8');
let scripts = 0;
// ponytail: the owned, single-file HTML has inline classic scripts only; this is not a general HTML bundler.
const output = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attributes, source) => {
  if (/\bsrc\s*=/i.test(attributes)) throw Error('The TV build must not depend on external scripts.');
  const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes);
  if (type && !/^(?:text|application)\/javascript$/i.test(type[1])) return tag;
  scripts++;
  const result = esbuild.transformSync(source, {loader:'js', target, charset:'utf8', minifyWhitespace:true, minifySyntax:true, legalComments:'inline'});
  return '<script' + attributes + '>\n' + result.code + '</script>';
});
if (!scripts) throw Error('No inline app scripts found.');
const temporary = filename + '.tmp';
fs.writeFileSync(temporary, output);
fs.renameSync(temporary, filename);
console.log(JSON.stringify({file:filename, compiler:'esbuild ' + esbuild.version, target, scripts, bytes:Buffer.byteLength(output)}));

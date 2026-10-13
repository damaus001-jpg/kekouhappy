const fs = require('node:fs');
const path = require('node:path');

function diagnosticDataPath(projectRoot) {
  return path.resolve(projectRoot, '.tmp', 'translation-diagnostics-client', 'maoyi Developer Data');
}
function migrateDiagnosticDataRoot(projectRoot) {
  const root = path.resolve(projectRoot, '.tmp', 'translation-diagnostics-client');
  const previous = path.join(root, 'user-data');
  const target = diagnosticDataPath(projectRoot);
  for (const candidate of [previous, target]) {
    if (path.dirname(candidate) !== root) throw new Error('Diagnostic migration escaped its workspace directory.');
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Diagnostic data root must not be a link.');
  }
  if (fs.existsSync(previous)) {
    if (fs.existsSync(target)) throw new Error('Both diagnostic data roots exist; refusing to overwrite account data.');
    fs.renameSync(previous, target);
  }
  return target;
}
module.exports = { diagnosticDataPath, migrateDiagnosticDataRoot };

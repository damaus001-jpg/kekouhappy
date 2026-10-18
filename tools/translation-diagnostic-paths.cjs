const fs = require('node:fs');
const path = require('node:path');

function diagnosticDataPath(projectRoot, appDataPath = process.env.APPDATA) {
  if (!appDataPath || !path.isAbsolute(appDataPath)) {
    throw new Error('A Windows roaming AppData path is required for diagnostic browser storage.');
  }
  return path.resolve(appDataPath, 'maoyi Diagnostics Client Data');
}

function migrateDiagnosticDataRoot(projectRoot, appDataPath = process.env.APPDATA) {
  const root = path.resolve(projectRoot, '.tmp', 'translation-diagnostics-client');
  const previous = path.join(root, 'user-data');
  const projectLocal = path.join(root, 'maoyi Developer Data');
  const target = diagnosticDataPath(projectRoot, appDataPath);
  for (const candidate of [previous, projectLocal]) {
    if (path.dirname(candidate) !== root) throw new Error('Diagnostic source data escaped its workspace directory.');
  }
  for (const candidate of [previous, projectLocal, target]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error('Diagnostic data root must not be a link.');
    }
  }
  const sources = [previous, projectLocal].filter(candidate => fs.existsSync(candidate));
  if (sources.length > 1) {
    throw new Error('Multiple diagnostic source roots exist; refusing to merge browser account data.');
  }
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (sources.length) {
      fs.cpSync(sources[0], target, { recursive: true, errorOnExist: true, force: false });
    } else {
      fs.mkdirSync(target, { recursive: true });
    }
  }
  return target;
}

module.exports = { diagnosticDataPath, migrateDiagnosticDataRoot };

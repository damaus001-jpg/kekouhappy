const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deriveDataRoot, isOwnedDataRoot } = require('../signal-guard/df-bootstrap.cjs');
const { diagnosticDataPath, migrateDiagnosticDataRoot } = require('./translation-diagnostic-paths.cjs');

const testRoot = fs.mkdtempSync(path.resolve(__dirname, '../.tmp/diagnostic-path-test-'));
const appDataPath = path.join(testRoot, 'AppData', 'Roaming');
const previous = path.join(testRoot, '.tmp', 'translation-diagnostics-client', 'maoyi Developer Data');
fs.mkdirSync(path.join(previous, 'Partitions', 'chat-wa'), { recursive: true });
fs.writeFileSync(path.join(previous, 'Partitions', 'chat-wa', 'IndexedDB'), 'preserved-browser-db');

const target = migrateDiagnosticDataRoot(testRoot, appDataPath);
assert.equal(target, diagnosticDataPath(testRoot, appDataPath));
assert.equal(path.basename(target), 'maoyi Diagnostics Client Data');
assert.equal(fs.readFileSync(path.join(target, 'Partitions', 'chat-wa', 'IndexedDB'), 'utf8'), 'preserved-browser-db');
assert.equal(fs.existsSync(path.join(previous, 'Partitions', 'chat-wa', 'IndexedDB')), true, 'migration copies and preserves the workspace source');
assert.equal(isOwnedDataRoot(target), true);
assert.equal(deriveDataRoot(path.join(target, 'SignalInstances', 'Signal-test')), target);
assert.equal(migrateDiagnosticDataRoot(testRoot, appDataPath), target);

const conflictRoot = path.join(testRoot, '.tmp', 'conflict-workspace');
fs.mkdirSync(path.join(conflictRoot, '.tmp', 'translation-diagnostics-client', 'user-data'), { recursive: true });
fs.mkdirSync(path.join(conflictRoot, '.tmp', 'translation-diagnostics-client', 'maoyi Developer Data'), { recursive: true });
assert.throws(() => migrateDiagnosticDataRoot(conflictRoot, path.join(testRoot, 'OtherAppData')), /Multiple diagnostic source roots/);
console.log('diagnostic-paths: AppData isolation, browser-store migration with source preservation, and Signal guard ownership passed');

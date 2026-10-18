import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'opensms-runtime.ts'), 'utf8');
const fixturePath = path.join(root, 'tools', 'fixtures', 'nanpa-us-geographic-area-codes-2026-10-17.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const mapStart = source.indexOf('const areaCodeInfo:');
const mapEnd = source.indexOf('\n    };', mapStart);
assert.ok(mapStart >= 0 && mapEnd > mapStart, 'OpenSMS local area-code map must be present');

const entries = [...source.slice(mapStart, mapEnd).matchAll(/'([0-9]{3})':\['([^']+)','([^']+)','([^']+)'\]/g)];
const codes = entries.map(([, code]) => code);
const codeSet = new Set(codes);
assert.equal(codeSet.size, codes.length, 'area-code map must not contain duplicate keys');
assert.equal(fixture.count, fixture.codes.length, 'NANPA fixture count must match its code list');

const expected = new Set(fixture.codes);
const missing = [...expected].filter(code => !codeSet.has(code));
const extra = [...codeSet].filter(code => !expected.has(code));
assert.deepEqual(missing, [], `missing active U.S./territory area-code mappings: ${missing.join(', ')}`);
assert.deepEqual(extra, [], `mappings absent from the audited active U.S./territory list: ${extra.join(', ')}`);

for (const [, code, city, state, timeZone] of entries) {
  assert.ok(city && state && timeZone, `${code} must define a representative city, state/territory and time zone`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone }), `${code} must use a valid IANA time zone`);
}

const mapping859 = entries.find(([, code]) => code === '859');
assert.deepEqual(mapping859?.slice(2), ['列克星敦', '肯塔基州', 'America/New_York']);
console.log(`opensms-area-codes: all ${fixture.count} NANPA in-service geographic U.S./territory area codes are mapped with valid time zones`);

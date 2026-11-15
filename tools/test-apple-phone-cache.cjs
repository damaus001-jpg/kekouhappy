const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const runtimeCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/apple-runtime.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const { appleTranslationCacheMatchesPhone } = new Function('exports', runtimeCode + ';return exports;')({});
const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const tree = ts.createSourceFile('App.ts', source.slice(source.indexOf('>') + 1, source.indexOf('</script>')), ts.ScriptTarget.Latest, true);
const names = ['applyTranslationCacheEntries', 'getCachedTranslation', 'lookupTranslationCacheForCandidates', 'setCachedTranslation', 'installCachedTranslationRuntime'];
const code = names.map(name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree)).join('\n');
const maps = new Map(), installed = [], saved = [];
const scope = (id, candidate) => id + ':' + (candidate?.contactKey || candidate?.contactId || 'unknown');
const memory = (id, candidate) => { const key = scope(id, candidate); if (!maps.has(key)) maps.set(key, new Map()); return maps.get(key); };
let lookupEntries = [];
const ctx = {
  appleTranslationCacheMatchesPhone, translationMemoryCaches: maps, nonEnglishContactKeys: new Set(), nonEnglishContactKey: () => '', hashText: text => text,
  normalizeCacheText: text => text.trim(), profileSourceCacheScope: id => id + ':__profile-source__', profileTranslationCache: memory,
  setTranslationMemoryCacheEntry: (id, candidate, hash, text) => memory(id, candidate).set(hash, text),
  deleteTranslationMemoryCacheEntry: (id, candidate, hash) => memory(id, candidate).delete(hash),
  isUsefulMessageTranslation: (_source, translated) => !!translated, cacheScope: scope, webRuntimeControllers: new Map(), withTranslationDeadline: promise => promise,
  window: { chatTranslator: { lookupTranslationCache: async () => lookupEntries, saveTranslationCacheEntry: async value => { saved.push(value); } } },
  isSignalLegacyBubbleTranslationDisabled: () => false, appForPlatform: platform => platform,
  buildCachedTranslationRuntimeScript: (app, entries) => ({ app, entries }), executeProfileScript: async (_id, script) => { installed.push(script); }
};
const api = new Function(...Object.keys(ctx), ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + `;return {${names.join(',')}};`)(...Object.values(ctx));
async function main() {
  const profile = { id: 'apple-test', platform: 'apple', name: 'Apple' };
  const candidate = { key: 'bubble', text: 'Hello there', contactId: '+12135551212', contactIdType: 'phone', contactKey: 'apple-phone:+12135551212' };
  const own = { sourceHash: candidate.text, sourceText: candidate.text, translatedText: '本号码译文', platform: 'apple', contactId: candidate.contactId, contactIdType: 'phone', updatedAt: 1 };
  const other = { ...own, translatedText: '其他号码译文', contactId: '+12135551213' };
  memory(profile.id, { contactKey: '__profile-source__' }).set(candidate.text, '通用兜底译文');
  assert.equal(api.getCachedTranslation(profile.id, candidate.text, candidate), '', 'Apple never falls back to another peer via profile-wide source cache');
  assert.equal(api.getCachedTranslation(profile.id, candidate.text, {contactId:'regular-contact'}), '通用兜底译文', 'other platforms retain existing fallback behavior');
  api.applyTranslationCacheEntries(profile.id, [other], candidate);
  assert.equal(api.getCachedTranslation(profile.id, candidate.text, candidate), '');
  lookupEntries = [other];
  assert.equal((await api.lookupTranslationCacheForCandidates(profile, [candidate])).size, 0, 'backend profile-wide fallback is filtered by peer number');
  lookupEntries = [{ ...own, contactId: 'apple:old-device:old-chat:%2B12135551212', contactIdType: 'platform' }];
  assert.equal((await api.lookupTranslationCacheForCandidates(profile, [candidate])).get(candidate.text), own.translatedText, 'verified same-phone historical caches remain readable');
  assert.equal(api.getCachedTranslation(profile.id, candidate.text, candidate), own.translatedText);
  api.setCachedTranslation(profile, candidate, '新号码缓存译文');
  await Promise.resolve();
  assert.equal(saved.at(-1).contactId, candidate.contactId);
  assert.equal(saved.at(-1).contactIdType, 'phone');
  assert.equal(installed.at(-1).entries[0].contactId, candidate.contactId, 'short runtime cache payload keeps peer identity');
  assert.equal(installed.at(-1).entries[0].platform, 'apple');
  await api.installCachedTranslationRuntime({ id: 'wa', platform: 'whatsapp' }, [own]);
  assert.equal('contactId' in installed.at(-1).entries[0], false, 'non-Apple payload format is unchanged');
  console.log('apple-phone-cache: peer-only memory/disk/runtime matching, legacy same-phone reuse, identity-preserving save and other-platform fallback isolation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

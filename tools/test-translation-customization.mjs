import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeChineseToEnglishPrompt,
  defaultChineseToEnglishEditablePrompt,
  defaultChineseToEnglishPrompt,
  fixedChineseToEnglishPrompt,
  normalizeChineseToEnglishEditablePrompt
} from '../dist-electron/shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
const preloadCjs = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');
const icon = fs.readFileSync(path.join(root, 'src', 'assets', 'customize-transparent.png'));
const pngSize = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

assert.equal(defaultChineseToEnglishPrompt, `${defaultChineseToEnglishEditablePrompt}\n\n${fixedChineseToEnglishPrompt}`);
assert.equal(composeChineseToEnglishPrompt('自定义语气'), `自定义语气\n\n${fixedChineseToEnglishPrompt}`);
assert.throws(() => normalizeChineseToEnglishEditablePrompt('包含 __DF_LOCKED_TEST__'), /受保护占位符/);
assert.deepEqual(pngSize(icon), { width: 238, height: 213 }, '透明图标必须保持受版本控制的尺寸和比例');
assert.ok([4, 6].includes(icon[25]), '自定义图标必须包含透明通道');

assert.match(main, /safeStorage\.encryptString/);
assert.match(main, /safeStorage\.decryptString/);
assert.match(main, /translation-customization\.json/);
assert.match(main, /composeChineseToEnglishPrompt\(customChineseToEnglishPrompt\)/);
assert.match(main, /translation-customization:get/);
assert.match(main, /translation-customization:save/);
assert.match(main, /translation-customization:reset/);
assert.match(preload, /getTranslationCustomization/);
assert.match(preloadCjs, /getTranslationCustomization/);
assert.match(app, /class="runtime-customize-button"[\s\S]*?aria-label="自定义中译英"/);
assert.doesNotMatch(app, /runtime-customize-button[\s\S]{0,300}>\s*自定义\s*<\/button>/);
assert.ok(
  app.indexOf('class="app-short sg"') < app.indexOf('class="runtime-customize-button"'),
  '自定义图标必须位于三个平台入口之后的左栏底部'
);
assert.match(app, /<pre>\{\{ fixedChineseToEnglishPrompt \}\}<\/pre>/);
assert.doesNotMatch(app, /v-model="fixedChineseToEnglishPrompt"/);
assert.match(app, /signalComposerPretranslations\.clear\(\)/);

console.log('translation-customization: encrypted editable style override preserves fixed rules and signed defaults');

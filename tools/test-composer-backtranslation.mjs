import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const signalPatch = fs.readFileSync(
  path.join(projectRoot, 'signal-source', 'patches', 'v8.18.0', '0012-maoyi-source-composer-review.patch'),
  'utf8'
);

const between = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source range: ${start}`);
  return app.slice(from, to);
};

const composerQueue = between(
  'function enqueueComposerTranslation(',
  'function enqueueMessageTranslationTask('
);
const webEnter = between(
  'const queueNativeTranslate = (event, target = composer) => {',
  'const isNativeSendButton = (button) => {'
);
const signalEnter = between(
  'const blockAndTranslate = (event, composer',
  'const addListeners = (target) => {'
);

assert.match(
  composerQueue,
  /const shouldReview = isSignalProfile && signalReviewEnabled;/
);
assert.match(
  composerQueue,
  /\(!sourceIsChinese && !\(shouldReview && sourceIsEnglish\)\)/
);
assert.match(
  composerQueue,
  /if \(!currentShouldReview\) \{[\s\S]*?reviewStatus: 'hidden'[\s\S]*?翻译完成，请再次按回车发送/
);
assert.match(
  composerQueue,
  /text: englishText,[\s\S]*?from: 'English',[\s\S]*?to: 'Chinese',[\s\S]*?reason: 'composer-review'/
);
assert.match(
  composerQueue,
  /const currentShouldReview = currentProfile\.platform === 'signal' && signalReviewEnabled;/
);

assert.doesNotMatch(app, /function enqueueTelegramComposerTranslation/);
assert.match(composerQueue, /const isTelegramProfile = isTelegramPlatform\(currentProfile\.platform\)/);
assert.match(composerQueue, /const webComposerWasReplaced = currentProfile\.platform !== 'signal' &&\s*!isTelegramProfile/);
assert.match(webEnter, /const signalReviewEnabled = signalSourceComposer && readSignalComposerReviewEnabled\(\);/);
assert.match(app, /const persisted = window\.localStorage\?\.getItem\?\.\('df-composer-review-enabled-v1'\);/);
assert.match(
  webEnter,
  /if \(!hasEnglishDraft \|\| !signalReviewEnabled\) return false;/
);
assert.match(
  webEnter,
  /reviewEnabled: signalReviewEnabled/
);
assert.match(
  signalEnter,
  /const reviewEnabled = readComposerReviewEnabled\(\);/
);
assert.match(
  signalEnter,
  /if \(!chineseDraft && \(!reviewEnabled \|\| !hasEnglish\(text\)\)\) return false;/
);
assert.match(app, /window\.addEventListener\('df-composer-review-setting', window\.__dfSignalComposerReviewSettingHandler\);/);
assert.match(app, /if \(persisted === '0'\) \{[\s\S]*?window\.__dfComposerReviewEnabled = false;[\s\S]*?return false;/);
assert.match(app, /if \(readComposerReviewEnabled\(\) && hasEnglish\(currentText\)\)/);
assert.match(app, /reviewEnabled: action === 'translate' \? signalReviewEnabled : undefined/);

assert.doesNotMatch(app, /review\.innerHTML =/);
assert.doesNotMatch(app, /parent\.insertBefore\(review, anchor\)/);
assert.doesNotMatch(app, /const whatsappFooter = composer\.closest\('footer'\)/);
assert.match(
  app,
  /liveComposer\?\.closest\?\.\('\.CompositionArea__row'\)[\s\S]*?dispatchSignalComposerReviewState/
);

assert.match(main, /const isComposerReview = request\.reason === 'composer-review';/);
assert.match(
  main,
  /const isSignalChineseToEnglish = request\.platform === 'signal' &&[\s\S]*?\(request\.reason === 'composer-enter' \|\| request\.reason === 'composer-pretranslate'\) &&[\s\S]*?request\.from === 'Chinese' &&[\s\S]*?request\.to === 'English';/
);
assert.match(
  main,
  /if \(!isComposerReview && !isWebComposerEnter && !isSignalChineseToEnglish\) return;/
);
assert.match(
  main,
  /const approvedText = isWebComposerEnter \|\| isSignalChineseToEnglish[\s\S]*?\? translatedText[\s\S]*?: request\.text;/
);
assert.match(signalPatch, /MaoyiComposerReview/);
assert.match(signalPatch, /data-df-composer-review="source-native"/);
assert.match(signalPatch, /data-df-signal-conversation-id=\{conversationId\}/);
assert.match(signalPatch, /SETTING_KEY = 'df-composer-review-enabled-v1'/);
assert.match(signalPatch, /__dfComposerReviewEnabled = enabled/);
assert.match(signalPatch, /window\.localStorage\.setItem\(SETTING_KEY, enabled \? '1' : '0'\)/);
assert.match(signalPatch, /data-df-composer-review-toggle="true"/);
assert.match(signalPatch, /role="switch"/);
assert.match(signalPatch, /回译 \{enabled \? '开' : '关'\}/);
assert.match(signalPatch, /reviewVisible \? \([\s\S]*?<textarea/);
assert.match(signalPatch, /readOnly=\{!isReady\}/);
assert.match(signalPatch, /useLayoutEffect\(\(\) => \{/);
assert.match(signalPatch, /textarea\.style\.height = 'auto'/);
assert.match(
  signalPatch,
  /Math\.min\(72, Math\.max\(34, contentHeight\)\)/
);
assert.match(signalPatch, /contentHeight > 72 \? 'auto' : 'hidden'/);
assert.match(signalPatch, /rows=\{1\}/);
assert.match(signalPatch, /maxHeight: 72/);

console.log(
  'composer-backtranslation: Signal-only source-native review toggle and WhatsApp/Telegram no-review contracts passed'
);

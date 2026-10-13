import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createSignalNotificationActivationUrl,
  insertSignalNotificationRoute,
  normalizeStoredSignalNotificationRoutes,
  parseSignalNotificationActivationUrl,
  signalNotificationRouteMaximum,
  signalNotificationRouteTtlMs,
  validateSignalNotificationInternalRoute,
  validateSignalNotificationRegistration
} from '../dist-electron/signal-notification-routing.js';

const root = new URL('../', import.meta.url);
const activationId = Buffer.alloc(32, 1).toString('base64url');
const secondActivationId = Buffer.alloc(32, 2).toString('base64url');
const appId = 'Signal-123e4567-e89b-42d3-a456-426614174000';
const token = '123e4567-e89b-42d3-a456-426614174001';
const now = 1_750_000_000_000;

const activationUrl = createSignalNotificationActivationUrl(activationId);
assert.equal(
  activationUrl,
  `maoyi-translator://signal-notification/v1/${activationId}`
);
assert.equal(parseSignalNotificationActivationUrl(activationUrl), activationId);
for (const rejected of [
  `sgnl://show-conversation?token=${token}`,
  `maoyi-translator://signal-notification/v1/${activationId}?route=sgnl`,
  `maoyi-translator://signal-notification/v1/${activationId}#x`,
  `maoyi-translator://other/v1/${activationId}`,
  'maoyi-translator://signal-notification/v1/not-random'
]) {
  assert.equal(parseSignalNotificationActivationUrl(rejected), null, rejected);
}

const conversationRoute = `sgnl://show-conversation?token=${token}`;
assert.equal(validateSignalNotificationInternalRoute(conversationRoute), conversationRoute);
assert.equal(validateSignalNotificationInternalRoute('sgnl://show-window'), 'sgnl://show-window');
assert.equal(validateSignalNotificationInternalRoute('sgnl://cancel-presenting'), 'sgnl://cancel-presenting');
for (const rejected of [
  `https://example.com/?token=${token}`,
  `sgnl://show-conversation?token=${token}&extra=1`,
  'sgnl://show-conversation?token=invalid',
  'sgnl://show-window?token=x',
  'sgnl://unknown'
]) {
  assert.equal(validateSignalNotificationInternalRoute(rejected), null, rejected);
}

const record = validateSignalNotificationRegistration({
  type: 'notification.route.register',
  activationId,
  route: conversationRoute
}, appId, now);
assert.ok(record);
assert.equal(record.appId, appId);
assert.equal(record.expiresAt, now + signalNotificationRouteTtlMs);
assert.equal(validateSignalNotificationRegistration({
  type: 'notification.route.register', activationId, route: conversationRoute
}, 'Signal-wrong', now), null);
assert.equal(validateSignalNotificationRegistration({
  type: 'notification.route.register', activationId, route: conversationRoute, appId
}, appId, now), null);

const replacement = validateSignalNotificationRegistration({
  type: 'notification.route.register',
  activationId: secondActivationId,
  route: 'sgnl://show-window'
}, appId, now + 1);
assert.ok(replacement);
const onePerInstance = insertSignalNotificationRoute([record], replacement, now + 1);
assert.equal(onePerInstance.length, 1);
assert.equal(onePerInstance[0].activationId, secondActivationId);

let bounded = [];
for (let index = 0; index < signalNotificationRouteMaximum + 5; index += 1) {
  const candidateId = Buffer.alloc(32, index + 10).toString('base64url');
  const candidateAppId = `Signal-123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`;
  const candidate = validateSignalNotificationRegistration({
    type: 'notification.route.register', activationId: candidateId, route: 'sgnl://show-window'
  }, candidateAppId, now + index);
  assert.ok(candidate);
  bounded = insertSignalNotificationRoute(bounded, candidate, now + index);
}
assert.equal(bounded.length, signalNotificationRouteMaximum);

assert.deepEqual(normalizeStoredSignalNotificationRoutes({
  schemaVersion: 1,
  records: [record]
}, record.expiresAt), []);
assert.deepEqual(normalizeStoredSignalNotificationRoutes({
  schemaVersion: 1,
  records: [record]
}, now), [record]);

const [mainSource, preloadSource, appSource, packageSource, suiteBuilderSource] = await Promise.all([
  readFile(new URL('electron/main.ts', root), 'utf8'),
  readFile(new URL('electron/preload.ts', root), 'utf8'),
  readFile(new URL('src/App.vue', root), 'utf8'),
  readFile(new URL('package.json', root), 'utf8'),
  readFile(new URL('electron-builder.client-suite.cjs', root), 'utf8')
]);
assert.match(mainSource, /safeStorage\.encryptString\(payload\)/);
assert.match(mainSource, /second-instance[\s\S]*queueSignalNotificationProtocolArguments\(commandLine\)/);
assert.match(mainSource, /workspaceVisibilityGate\.locked[\s\S]*isRuntimeAllowed/);
assert.match(mainSource, /record\.appId !== signalAppId\(profileId\)/);
assert.match(mainSource, /type: 'protocol\.open',[\s\S]*url: record\.route/);
assert.match(preloadSource, /signal:notification-complete/);
assert.match(appSource, /await activateSignalProfileFromMain\(activation\.profileId\)/);
assert.match(appSource, /completeSignalNotificationActivation/);
assert.ok(JSON.parse(packageSource).build.protocols.some(protocol => protocol.schemes.includes('maoyi-translator')));
assert.match(suiteBuilderSource, /schemes: \['maoyi-translator'\]/);

console.log('signal-notification-routing: strict opaque activation routing contracts passed');

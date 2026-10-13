import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const renderer = readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const signalWindowSecurityPatch = readFileSync(
  path.join(projectRoot, 'signal-source', 'patches', 'v8.18.0', '0003-maoyi-window-security-controller.patch'),
  'utf8'
);
const signalDarkWindowPatch = readFileSync(
  path.join(projectRoot, 'signal-source', 'patches', 'v8.18.0', '0013-maoyi-dark-window-background.patch'),
  'utf8'
);
const signalPresentationPatch = readFileSync(
  path.join(projectRoot, 'signal-source', 'patches', 'v8.18.0', '0014-maoyi-deterministic-window-presentation.patch'),
  'utf8'
);
const signalOwnerChainPatch = readFileSync(
  path.join(projectRoot, 'signal-source', 'patches', 'v8.18.0', '0015-maoyi-owner-chain-fail-closed.patch'),
  'utf8'
);

function contractSlice(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${label} start marker is missing: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${label} end marker is missing: ${endMarker}`);
  return source.slice(start, end);
}

function assertMarkersInOrder(source, markers, message) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${message}: missing ${marker}`);
    assert.ok(next > cursor, `${message}: ${marker} is out of order`);
    cursor = next;
  }
}

const rendererOpenSignal = contractSlice(
  renderer,
  'async function openSignalProfileInWorkspace(',
  'function launchActiveSignalProfile(',
  'renderer Signal open action'
);
const rendererSignalSync = contractSlice(
  renderer,
  'async function syncActiveSignalWorkspace(',
  'async function hideInactiveSignalProfiles(',
  'renderer Signal workspace synchronization'
);
const rendererRefresh = contractSlice(
  renderer,
  'async function refreshActiveWindow(',
  'function setComposerStatus(',
  'renderer refresh action'
);
const signalPresent = contractSlice(
  signalPresentationPatch,
  'const presentMainWindow = (',
  'const originals: GuardedWindowMethods = {',
  'Signal native presentation transaction'
);
const signalOwnerCommand = contractSlice(
  signalPresentationPatch,
  "case 'window.owner': {",
  "case 'window.bounds-changed':",
  'Signal owner command'
);
const signalNativeOwnerVerification = contractSlice(
  signalOwnerChainPatch,
  'Napi::Value HasWindowOwner(',
  'Napi::Object Init(',
  'Signal native owner verification'
);
const mainPresentationSettlement = contractSlice(
  main,
  'function settleSignalPresentation(',
  'function failSignalPresentationForApp(',
  'translator presentation settlement'
);
const mainPendingPresentation = contractSlice(
  main,
  'function sendPendingSignalPresentation(',
  'function requestSignalWindowPresentation(',
  'translator presentation sender'
);
const mainPresentationRequest = contractSlice(
  main,
  'function requestSignalWindowPresentation(',
  'function sendSignalWorkspaceBounds(',
  'translator presentation request'
);
const mainPresentationEvent = contractSlice(
  main,
  "message.type === 'window.presentation-applied'",
  "if (message.type === 'script.result'",
  'translator presentation acknowledgement'
);
const mainReadyHandling = contractSlice(
  main,
  "if (message.type === 'ready') {",
  "message.type === 'window.presentation-applied'",
  'translator Signal ready handling'
);
const mainPresentSignalWorkspace = contractSlice(
  main,
  'async function presentSignalWorkspace(',
  'async function hideSignalProfile(',
  'translator Signal presentation orchestration'
);
const mainRestoreFlow = contractSlice(
  main,
  'function requestSignalProfilePresentation(',
  'function hideSignalWindowsAfterTargetVisible(',
  'translator Signal restore flow'
);
const mainSignalLaunchLifecycle = contractSlice(
  main,
  'async function launchSignalProfileNow(',
  'function scheduleSignalStartupRecovery(',
  'translator Signal child lifecycle'
);
const mainSignalStop = contractSlice(
  main,
  'async function stopSignalProfile(',
  'async function killSignalProcessesByDataDir(',
  'translator Signal stop flow'
);
const mainSensitiveSend = contractSlice(
  main,
  'async function prepareSensitiveSend(',
  'async function authorizeSensitiveSend(',
  'translator sensitive-send confirmation'
);
const rendererBlockingModalRecovery = contractSlice(
  renderer,
  'watch(hasBlockingModal,',
  'watch(totalUnreadCount,',
  'renderer blocking-modal recovery'
);

assert.doesNotMatch(main, /mainWindow\.on\('blur'/, 'external focus changes must not hide Signal');
assert.doesNotMatch(main, /appGroupBlur|focusedSignalProfileId/, 'focus-group hiding state must stay removed');
assert.match(
  main,
  /trustedHandle\('window:minimize'[\s\S]*?prepareSignalWindowsForMainMinimize\(\)[\s\S]*?targetWindow\?\.minimize\(\)/,
  'the invoke path must prepare the owned Signal window before minimizing the main window'
);
assert.match(
  main,
  /if \(action === 'minimize'\) \{[\s\S]*?prepareSignalWindowsForMainMinimize\(\)[\s\S]*?targetWindow\.minimize\(\)/,
  'the window-control path must prepare the owned Signal window before minimizing the main window'
);
assert.match(
  main,
  /mainWindow\.on\('minimize', prepareSignalWindowsForMainMinimize\);/,
  'taskbar and native minimizes must use the same prepared restore flow'
);
assert.match(
  main,
  /mainWindow\.on\('hide', \(\) => \{\s*if \(!mainWindow\?\.isMinimized\(\)\) prepareSignalWindowsForMainHide\(\);\s*\}\);/,
  'an explicit main-window hide must remain distinct from native owner minimization'
);
assert.match(
  main,
  /mainWindow\.on\('resized', requestSignalWorkspaceSyncBurst\);/,
  'Signal geometry must synchronize after the main window finishes resizing'
);
assert.match(
  main,
  /mainWindow\.on\('restore', requestSignalWorkspaceRestoreOnce\);/,
  'restoring the translator from minimize must perform one authenticated Signal reveal'
);
assert.match(main, /function requestSignalWorkspaceRestoreOnce\(\)/);
assert.doesNotMatch(main, /signalRestoreDelayMs|signalRestoreSettlingMs|signalRestoreFallbackDelayMs/);
assert.doesNotMatch(main, /signalRestoreTimer|signalRestoreFallbackTimer|signalRestoreSettlingUntil/);
assert.match(
  main,
  /function rememberSignalProfileForMainWindowResume\(\) \{[\s\S]*?signalProfileToRestoreAfterMainWindow = profileId && pendingSignalWorkspaceBounds\.get\(profileId\)\?\.visible/,
  'main-window suspension must remember only the Signal profile that was actually visible'
);
assert.match(
  main,
  /function prepareSignalWindowsForMainMinimize\(\) \{\s*rememberSignalProfileForMainWindowResume\(\);[\s\S]*?\n\}/,
  'native minimize must preserve Signal desired-visible state for the verified Win32 owner relationship'
);
assert.doesNotMatch(
  contractSlice(
    main,
    'function prepareSignalWindowsForMainMinimize()',
    'function prepareSignalWindowsForMainHide()',
    'translator minimize preparation'
  ),
  /hideAllSignalWindows\(\)|type:\s*'window\.hide'/,
  'native owner minimization must not also clear Signal visibility through the control channel'
);
assert.match(
  main,
  /function prepareSignalWindowsForMainHide\(\) \{[\s\S]*?rememberSignalProfileForMainWindowResume\(\);[\s\S]*?hideAllSignalWindows\(\);/,
  'a real non-minimize hide must still fail closed'
);
assert.match(
  mainRestoreFlow,
  /function requestSignalProfilePresentation\(profileId: string \| null\) \{[\s\S]*?webContents\.send\('signal:restore-profile', profileId\);/,
  'the shared native presentation request must invoke the full renderer-side Signal open action'
);
assert.match(
  mainRestoreFlow,
  /function requestSignalWorkspaceRestoreOnce\(\) \{[\s\S]*?requestSignalProfilePresentation\(profileId\);/,
  'native restore must use the shared explicit Signal presentation request'
);
assert.doesNotMatch(
  mainRestoreFlow,
  /function requestSignalWorkspaceRestoreOnce\(\) \{[\s\S]*?canShowSignalWindows\(\)/,
  'the native restore event must not synchronously reject presentation before the renderer IPC round trip'
);
assert.match(
  main,
  /mainWindow\.on\('show', requestSignalWorkspaceRestoreOnce\);/,
  'show must recover a suspended Signal even when Windows does not emit restore'
);
assert.match(
  main,
  /mainWindow\.on\('focus', \(\) => \{\s*if \(signalMainWindowSuspended\) requestSignalWorkspaceRestoreOnce\(\);\s*else requestSignalWorkspaceSyncBurst\(\);\s*\}\);/,
  'focus must be a one-shot fallback for Windows restore variants without re-presenting on every focus'
);
assert.doesNotMatch(
  main,
  /mainWindow\.on\('resize', resyncVisibleSignalWindows\);/,
  'Signal must not move from stale bounds during an in-progress main-window resize'
);
assert.match(
  main,
  /function requestSignalWorkspaceSyncBurst\(\) \{[\s\S]*?webContents\.send\('signal:sync-workspace'\);[\s\S]*?\n\}/,
  'restore and resize synchronization must ask the renderer for fresh workspace bounds'
);
assert.doesNotMatch(
  main,
  /function requestSignalWorkspaceSyncBurst\(\) \{[\s\S]*?resyncVisibleSignalWindows\(\)/,
  'restore synchronization must not expose Signal with stale bounds before renderer layout'
);
assert.match(
  main,
  /targetWindow\.once\('unmaximize',[\s\S]*?targetWindow\.setBounds\(compactBounds\)[\s\S]*?targetWindow\.unmaximize\(\);/,
  'compact bounds must be committed from the unmaximize transition instead of a fixed timer'
);
assert.match(renderer, /signalWorkspaceSyncTimer = setTimeout\([\s\S]*?\}, 80\);/);
assert.match(renderer, /onSignalWorkspaceSync\?\.\(\(\) => \{\s*scheduleSignalWorkspaceSyncBurst\(\);/);
assert.match(renderer, /function scheduleSignalWorkspaceSyncBurst\(\) \{[\s\S]*?for \(const delay of \[100\]\)/);
assertMarkersInOrder(
  rendererOpenSignal,
  [
    'await launchSignalProfile(profileId)',
    'await nextTick()',
    'await syncActiveSignalWorkspace(true)',
    'if (presented)',
    'scheduleSignalWorkspaceSyncBurst()',
    'return presented'
  ],
  'all user-driven Signal reveals must await one acknowledged native presentation action'
);
assert.match(
  rendererSignalSync,
  /if \(present && presented\) \{\s*setComposerStatus\(activeSignal\.id, presentationMessage \|\| 'Signal 窗口已显示'\);\s*\} else if \(!presented\)/,
  'a successful acknowledged presentation must replace any stale Signal display failure status'
);
assert.match(
  renderer,
  /function selectRuntimeApp\(app: RuntimeApp\) \{[\s\S]*?if \(app === 'signal'\) void openSignalProfileInWorkspace\(nextActiveId\);[\s\S]*?\n\}/,
  'clicking the Signal sidebar icon must reveal the remembered selected Signal profile'
);
assert.match(
  renderer,
  /function selectRuntimeTab\(profileId: string\) \{[\s\S]*?if \(profile\?\.platform === 'signal'\) \{\s*void openSignalProfileInWorkspace\(profileId\);\s*return;/,
  'clicking any Signal profile tab, including the active tab, must reveal that exact profile'
);
assert.match(
  renderer,
  /function launchActiveSignalProfile\(\) \{[\s\S]*?openSignalProfileInWorkspace\(activeSignalProfile\.value\.id\)/,
  'the fallback Open Signal button must share the same reveal action as sidebar and tab clicks'
);
assert.match(
  renderer,
  /async function refreshActiveWindow\(\) \{[\s\S]*?if \(profile\.platform === 'signal'\) \{[\s\S]*?const presented = await openSignalProfileInWorkspace\(profile\.id\);[\s\S]*?if \(presented\) \{\s*setComposerStatus\(profile\.id, 'Signal 窗口已刷新'\);\s*\}[\s\S]*?return;/,
  'the top refresh-window action must share the same reveal action as sidebar and tab clicks'
);
assert.doesNotMatch(
  rendererRefresh,
  /await openSignalProfileInWorkspace\(profile\.id\);\s*setComposerStatus\(profile\.id, 'Signal 窗口已刷新'\)/,
  'refresh must not report success before the matching native presentation acknowledgement'
);
assert.match(
  renderer,
  /onSignalRestoreProfile\?\.\(\(profileId\) => \{[\s\S]*?openSignalProfileInWorkspace\(profileId\)/,
  'both native minimize paths must restore through the same selected-profile open action'
);
assertMarkersInOrder(
  rendererBlockingModalRecovery,
  [
    'if (blocked)',
    'if (!wasBlocked) return',
    'const profileId = activeSignalProfile.value?.id',
    "activePanel.value === 'session'",
    'void openSignalProfileInWorkspace(profileId)'
  ],
  'closing a blocking modal must explicitly re-present the active Signal profile'
);
assertMarkersInOrder(
  mainSensitiveSend,
  [
    "const signalProfileToRestore = request.platform === 'signal' ? visibleSignalProfileId : null",
    'if (signalProfileToRestore) hideAllSignalWindows()',
    'finally',
    'requestSignalProfilePresentation(signalProfileToRestore)'
  ],
  'closing a Signal sensitive-send confirmation must explicitly re-present the hidden profile'
);
assert.match(
  renderer,
  /const nextStyle = \\`[\s\S]*?if \(style\.textContent !== nextStyle\) style\.textContent = nextStyle;/,
  'reopening the same Signal profile must not rewrite identical black shell CSS'
);
assert.doesNotMatch(
  main,
  /message\.type === 'window\.visibility-changed'[\s\S]*?message\.visible === true[\s\S]*?hideSignalWindowsAfterTargetVisible\(revealedProfileId\);/,
  'a generic visibility event must not finalize profile switching before the request-scoped acknowledgement'
);
assert.match(main, /const signalPresentationPositionTolerancePx = 1;/);
assert.match(main, /const signalPresentationSizeTolerancePx = 2;/);
assert.match(
  main,
  /function matchesSignalPresentationBounds\([\s\S]*?Math\.abs\(value - target\) <= tolerance;[\s\S]*?actual\.width[\s\S]*?signalPresentationSizeTolerancePx[\s\S]*?actual\.height[\s\S]*?signalPresentationSizeTolerancePx/,
  'Windows DPI rounding must be accepted only inside the explicit presentation tolerance'
);
assert.match(
  mainPresentationEvent,
  /matchesSignalPresentationBounds\(request\.bounds, eventBounds\)/,
  'the authenticated native acknowledgement must use bounded Win32 rounding tolerance'
);
assert.doesNotMatch(
  mainPresentationEvent,
  /eventBounds\.(?:x|y|width|height) === request\.bounds/,
  'one-pixel Win32 rounding must not re-enter the permanent hide/retry loop'
);
assertMarkersInOrder(
  mainPresentSignalWorkspace,
  [
    'const result = await requestSignalWindowPresentation(profileId, screenBounds)',
    'result.presented',
    'visibleSignalProfileId === profileId',
    'hideSignalWindowsAfterTargetVisible(profileId)'
  ],
  'only an acknowledged current-profile presentation may hide the other Signal profiles'
);
assert.match(
  rendererSignalSync,
  /const result = await translator\.presentSignalWorkspace\(activeSignal\.id, bounds\);[\s\S]*?if \(translator\.executeSignalScript\) \{\s*void translator\s*\.executeSignalScript\(activeSignal\.id, buildSignalShellPolishScript\(activeTheme\.value\)\)\s*\.catch\(\(\) => undefined\);\s*\}/,
  'theme polish must run asynchronously after native presentation and must never block it'
);
assert.match(
  rendererSignalSync,
  /if \(!presented\) \{[\s\S]*?Signal 窗口显示失败，请点击“打开 Signal”重试/,
  'a rejected or timed-out presentation must leave an actionable Open Signal failure status'
);
assert.match(
  signalDarkWindowPatch,
  /backgroundColor: '#08090d'/,
  'embedded Signal must never expose its upstream white native background'
);
assertMarkersInOrder(
  signalPresent,
  [
    'applyBounds(command.bounds)',
    'originals.show()',
    'originals.moveTop()',
    'mainWindow.webContents.invalidate()',
    'mainWindow.isVisible()',
    "type: 'window.presentation-applied'",
    'requestId: command.requestId'
  ],
  'native presentation must place, show, raise, redraw, and then acknowledge without changing cross-process owned-window focus'
);
assert.doesNotMatch(
  signalPresent,
  /rawHide\(mainWindow\)/,
  'native presentation must not hide the owned window before raising it'
);
assert.doesNotMatch(
  signalPresent,
  /originals\.focus\(\)/,
  'native presentation must not explicitly steal focus for the cross-process owned Signal window'
);
assertMarkersInOrder(
  signalOwnerCommand,
  [
    'const ownerMatches =',
    'ownerAttached &&',
    'ownerDescriptor?.handle === command.handle &&',
    'ownerDescriptor.ownerProcessId === command.ownerProcessId'
  ],
  'owner idempotence must require both an attached owner and an exact native owner descriptor match'
);
assertMarkersInOrder(
  signalOwnerChainPatch,
  [
    'if (ownerMatches)',
    '!verifyMaoyiWindowOwner(mainWindow, ownerDescriptor)',
    '!attachOwnerToAuxiliaryWindows()',
    '} catch {',
    'applyOwner()',
    "type: 'window.owner-attached'"
  ],
  'an identical owner command must verify native GW_OWNER without hiding, and fall back to fail-closed reattachment on mismatch'
);
assertMarkersInOrder(
  signalOwnerChainPatch,
  [
    'const rejectOwner = (): void => {',
    'ownerAttached = false',
    'desiredVisible = false',
    'hideAllWindows()',
    "code: 'owner-rejected'",
    'const attachOwnerToAuxiliaryWindows = (): boolean => {',
    'if (!attachOwnerToWindow(window))',
    'return false',
    'if (!ownerAttached || !attachOwnerToAuxiliaryWindows())',
    'rejectOwner()'
  ],
  'main or auxiliary owner attachment failure must close the global exposure gate and hide every Signal window'
);
assert.match(
  signalOwnerChainPatch,
  /if \(ownerDescriptor && !attachOwnerToWindow\(window\)\) \{\s*\+?\s*rejectOwner\(\);/,
  'a newly created auxiliary Signal window must fail closed when owner attachment is rejected'
);
assertMarkersInOrder(
  signalNativeOwnerVerification,
  [
    'GetWindowThreadProcessId(child, &child_process_id)',
    'owner_process_id != expected_owner_process_id',
    'child_session_id != owner_session_id',
    'GetWindow(child, GW_OWNER) == owner'
  ],
  'native owner verification must validate the handles, process identity, session, root owner, and actual GW_OWNER'
);
assert.doesNotMatch(
  signalNativeOwnerVerification,
  /SetWindowLongPtrW|SetWindowPos|ShowWindow|HideWindow/,
  'native owner verification must be read-only and must not mutate window state'
);
assert.doesNotMatch(
  signalPresent,
  /if\s*\(\s*!?mainWindow\.isVisible\(\)\s*\)\s*\{?\s*(?:originals\.)?show\(/,
  'native presentation must not skip show because Electron reports the owned window visible'
);
assert.match(
  signalPresent,
  /!ownerAttached[\s\S]*?sendError\('Signal window presentation is unavailable while locked'\)/,
  'native presentation must remain fail-closed until the translator owner is attached'
);
assert.match(
  signalPresent,
  /const sendError = \(message: string\): void => \{[\s\S]*?hideAllWindows\(\);[\s\S]*?requestId: command\.requestId/,
  'every native presentation failure must hide the owned Signal window and identify its request'
);
assert.match(main, /const signalPresentationAckTimeoutMs = 1_000;/);
assertMarkersInOrder(
  mainPendingPresentation,
  [
    'const client = signalControlClients.get(appId)',
    '!client?.ready',
    'clearTimeout(request.readyTimer)',
    'request.sent = true',
    'request.acknowledgementTimer = setTimeout',
    "type: 'window.present'"
  ],
  'the one-second acknowledgement timer must start only after the authenticated Signal client is ready'
);
assert.match(
  mainPendingPresentation,
  /acknowledgementTimer = setTimeout\([\s\S]*?settleSignalPresentation\(requestId,[\s\S]*?\}, signalPresentationAckTimeoutMs\);/,
  'the translator must fail a sent presentation after its exact one-second acknowledgement window'
);
assertMarkersInOrder(
  mainPendingPresentation,
  [
    'signalPresentationRequestIdsByApp.get(appId)',
    'signalPresentationRequests.get(requestId)',
    "type: 'window.present'",
    'requestId',
    'bounds: request.bounds'
  ],
  'the presentation command must be bound to both appId and requestId'
);
assert.doesNotMatch(
  mainReadyHandling,
  /type: 'window\.show'/,
  'Signal ready handling must never bypass the request-scoped presentation contract with a legacy show command'
);
assertMarkersInOrder(
  mainReadyHandling,
  [
    'const sentPendingPresentation = sendPendingSignalPresentation(appId)',
    '!signalPresentationRequestIdsByApp.has(appId)',
    '!signalPresentationInvocationIdsByApp.has(appId)',
    'visibleSignalProfileId === profileId',
    'bounds?.visible',
    'canShowSignalWindows()',
    'void presentSignalWorkspace(profileId, bounds)'
  ],
  'an active Signal profile reconnecting without a pending request must use the full acknowledged presentation flow'
);
assertMarkersInOrder(
  mainPresentationRequest,
  [
    "failSignalPresentationForApp(appId, 'Signal 窗口显示请求已由新的操作替换')",
    'const requestId = randomUUID()',
    'signalPresentationRequests.set(requestId',
    'signalPresentationRequestIdsByApp.set(appId, requestId)',
    'sendPendingSignalPresentation(appId)'
  ],
  'every repeated click on the same Signal profile must supersede the old transaction and create a new request'
);
assert.match(
  mainPresentationRequest,
  /signalPresentationRequests\.set\(requestId, \{\s*appId,\s*profileId,\s*requestId,/,
  'each presentation request must retain its Signal app and profile identity'
);
assertMarkersInOrder(
  mainPresentSignalWorkspace,
  [
    'await launchSignalProfile(profileId)',
    'const latestBounds = pendingSignalWorkspaceBounds.get(profileId)',
    '!isLatestInvocation()',
    'visibleSignalProfileId !== profileId',
    'latestBounds?.visible !== true',
    '!canShowSignalWindows()',
    'signalBoundsToScreen(latestBounds)',
    'requestSignalWindowPresentation(profileId, screenBounds)'
  ],
  'cold launch completion must recheck the latest invocation, active profile, security gate, and latest bounds before showing Signal'
);
assertMarkersInOrder(
  mainPresentSignalWorkspace,
  [
    'if (result.presented)',
    'isLatestInvocation()',
    'visibleSignalProfileId === profileId',
    'pendingSignalWorkspaceBounds.get(profileId)?.visible === true',
    'hideAllSignalWindows()'
  ],
  'a failed presentation for the still-current profile must hide every Signal native window and uncover the fallback button'
);
assert.match(
  mainPresentationEvent,
  /signalPresentationRequests\.get\(message\.requestId\)[\s\S]*?request\.appId === appId[\s\S]*?settleSignalPresentation\(message\.requestId/,
  'only the matching appId and requestId may settle a presentation acknowledgement'
);
assert.match(
  mainPresentationSettlement,
  /if \(!result\.presented\) \{[\s\S]*?sendSignalWindowHide\([\s\S]*?request\.appId,[\s\S]*?presentation-rejected:/,
  'a failed or timed-out acknowledgement must uncover the translator by hiding Signal'
);
assertMarkersInOrder(
  mainSignalLaunchLifecycle,
  [
    "child.once('exit', () => {",
    "failSignalPresentationForApp(appId, 'Signal 进程已退出，请点击“打开 Signal”重试')",
    'signalControlSessions.delete(appId)',
    'signalControlClients.get(appId)?.socket.destroy()',
    'signalControlClients.delete(appId)'
  ],
  'a Signal child exit must settle any presentation request before deleting its authenticated control state'
);
assertMarkersInOrder(
  mainSignalStop,
  [
    "failSignalPresentationForApp(appId, 'Signal 进程正在停止，窗口显示请求已取消')",
    'signalPresentationInvocationIdsByApp.delete(appId)',
    'signalControlSessions.delete(appId)',
    'signalControlClients.get(appId)?.socket.destroy()',
    'signalControlClients.delete(appId)'
  ],
  'stopping Signal must settle presentation and invocation state before deleting its authenticated control state'
);
assert.doesNotMatch(
  signalDarkWindowPatch,
  /beginFrameSubscription|endFrameSubscription|surfaceReveal|surface-not-ready/,
  'the Signal reveal path must not wait for hidden compositor frames'
);
assert.doesNotMatch(
  main,
  /surface-not-ready|pendingSurfaceReveal|beginFrameSubscription|endFrameSubscription/,
  'the translator must not retain the removed hidden-frame reveal gate'
);

console.log('signal-window-visibility-policy: focus persistence and main-first transition contracts passed');

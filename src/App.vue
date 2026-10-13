<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import DevelopmentDiagnostics from './DevelopmentDiagnostics.vue';
import AssistantLibraryPanel from './components/AssistantLibraryPanel.vue';
import { buildAssistantCatalog } from './assistant-material-catalog';
import { buildAssistantRuntimeScript } from './assistant-material-runtime';
import type { AssistantRuntimeSnapshot } from './assistant-material-runtime';
import type { AssistantCatalog, AssistantMaterial, AssistantUsage, AssistantStagedMaterial } from '../electron/assistant-material-types';
import assistantFloatIcon from './assets/xiaozhi-assistant-transparent.png';
import { buildConversationExportScript,mergeConversationExportRows,unwrapConversationExportResult } from './conversation-export-runtime';
import { installTranslationLayoutWatchersFromDom } from './translation-layout-runtime';
import type { ExportSnapshot } from './conversation-export-runtime';
import type { ConversationExportMode,ConversationExportRow } from '../electron/conversation-export-types';
const assistantOpen = ref(false);
import { withTranslationDeadline } from './translation-recovery';
import { version as clientVersion } from '../package.json';
let diagnosticMonitoringEnabled = false;
let diagnosticQueueTimer: ReturnType<typeof setInterval> | undefined;
function diagnosticEvent(stage: string, details: Record<string, unknown> = {}) {
  if (diagnosticMonitoringEnabled) void window.chatTranslator.recordDiagnosticEvent({ stage, ...details }).catch(() => {});
}
import {
  canonicalRenderedSendIntegrityText,
  defaultChineseToEnglishEditablePrompt,
  fixedChineseToEnglishPrompt,
  hasMatchingRenderedSendIntegrityText,
  isDirectSendHttpUrl,
  isTransientSignalScriptGateError,
  readComposerPlainTextFromDom,
  readTelegramConversationIdFromDom,
  sanitizeProfileTabOrder,
  signalTranslationAcceptancePolicy,
  workspaceAppForPlatform,
  type AppTheme,
  type AppConfig,
  type ChatProfile,
  type ClientAuthorizationStatus,
  type LockScreenSetPinResult,
  type LockScreenStatus,
  type LastActiveProfileIds,
  type MemoryStatus,
  type Platform,
  type PlatformInfo,
  type RemoteGuardStatus,
  type SensitiveSendKind,
  type SignalNotificationActivation,
  type SignalWorkspaceBounds,
  type SmartReplyMessage,
  type SmartReplySuggestion,
  type StorageLocationStatus,
  type TranslationCacheEntry,
  type TranslationCustomizationStatus,
  type WalletNetwork,
  type WorkspaceApp
} from '../electron/shared';
import multiSignalIcon from './assets/multi-signal.png';
import multiTelegramIcon from './assets/multi-telegram.png';
import multiWhatsappIcon from './assets/multi-whatsapp.png';
import pokeballIcon from './assets/pokeball.svg';
import {
  buildSmartReplyUiInstallScript,
  buildSmartReplyUiStateScript,
  type SmartReplyUiInstallResult
} from './smart-reply-runtime';

type Panel = 'apps' | 'home' | 'notice' | 'agency' | 'settings' | 'account' | 'session';
type ThemeName = AppTheme;
type RuntimeApp = WorkspaceApp;
type LockSetupIntent = 'setup' | 'reset' | 'upgrade';
type LockSetupDialogStage = 'confirm' | 'network' | null;
type LockNetworkCheckResult = {
  offline: boolean;
  checkedAt?: number;
  reason?: string;
};
type LockPinChangeAuthorizationResult = {
  ok: boolean;
  token?: string;
  expiresAt?: number;
  reason?: string;
  status: LockScreenStatus;
};

type AppTile = {
  platform: Platform;
  app: RuntimeApp;
  label: string;
  short: string;
  color: string;
  icon: string;
};

type RuntimeTab = ChatProfile & {
  short: string;
  color: string;
  icon: string;
};

type MessageCandidate = {
  key: string;
  text: string;
  contactId?: string;
  contactIdType?: 'phone' | 'platform' | 'title' | 'unknown';
  contactTitle?: string;
  contactRemark?: string;
  contactKey?: string;
  direction?: 'incoming' | 'outgoing' | 'unknown';
  timestamp?: string;
  messagePart?: 'body' | 'quote';
  rectTop?: number;
  rectBottom?: number;
  viewportHeight?: number;
  scanBand?: 'above' | 'visible' | 'below';
  nearConversationEnd?: boolean;
  nearConversationStart?: boolean;
  nonEnglishContactMarker?: boolean;
};

type UnreadSnapshot = {
  count: number;
  titleCount?: number;
  badgeCount?: number;
};

type EyeCareTranslationApplyResult = {
  ok: boolean;
  enabled: boolean;
  matched: number;
  observerActive: boolean;
};

type TranslationQueueReason = 'manual-refresh' | 'composer-enter' | 'visible-message' | 'history-backfill';
type ComposerFeedbackState = '' | 'typing' | 'translating' | 'ready' | 'sent';
type ComposerKind = 'default' | 'telegram-media-caption';
type SensitiveSendPending = {
  token: string;
  profileId: string;
  platform: Platform;
  profileName: string;
  conversationSignature: string;
  contactDisplay: string;
  text: string;
  kind: SensitiveSendKind;
  network?: WalletNetwork;
  expiresAt: number;
};

type QueuedTranslationTask = {
  dedupeKey: string;
  profileId: string;
  priority: number;
  reason: TranslationQueueReason;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  run: (signal?: AbortSignal) => Promise<void>;
  abortController?: AbortController;
  cancelled?: boolean;
  onCancelled?: () => void;
  onFinalFailure?: (error: unknown) => void;
};

const signedIn = ref(false);
const signalSourceOnlyAcceptance = ref(false);
const clientAuthorizationStatus = ref<ClientAuthorizationStatus | null>(null);
const clientAuthorizationLoading = ref(true);
const clientAuthorizationBusy = ref(false);
const clientAuthorizationMessage = ref('');
const clientUsernameDraft = ref('');
const clientLicenseCodeDraft = ref('');
const reauthorizationDialogOpen = ref(false);
const reauthorizationLicenseCodeDraft = ref('');
const reauthorizationBusy = ref(false);
const reauthorizationMessage = ref('');
const reauthorizationMessageIsError = ref(false);
const reauthorizationSucceeded = ref(false);
const translationCustomizationOpen = ref(false);
const translationCustomizationDraft = ref(defaultChineseToEnglishEditablePrompt);
const translationCustomizationSaved = ref(defaultChineseToEnglishEditablePrompt);
const translationCustomizationBusy = ref(false);
const translationCustomizationMessage = ref('');
const translationCustomizationMessageIsError = ref(false);
const accountMessage = ref('');
const storageLocation = ref<StorageLocationStatus | null>(null);
const storageLocationBusy = ref(false);
const storageLocationMessage = ref('');
const storageLocationMessageIsError = ref(false);
const activePanel = ref<Panel>('apps');
const activeTheme = ref<ThemeName>(window.chatTranslator?.getInitialTheme?.() ?? 'blackGold');
const showDeveloperDiagnostics = ref(import.meta.env.DEV);
const themeMenuOpen = ref(false);
const workspaceHeaderCollapsed = ref(false);
const pokeballBursting = ref(false);
const profiles = ref<ChatProfile[]>([]);
const activeProfileId = ref<string | null>(null);
const profileTabOrder = ref<string[]>([]);
const lastActiveProfileIds = ref<LastActiveProfileIds>({
  whatsapp: null,
  telegram: null,
  signal: null
});
const configState = ref<AppConfig | null>(null);
const currentApp = ref<RuntimeApp>('whatsapp');
const platformCatalog = ref<PlatformInfo[]>([
  { platform: 'whatsapp', label: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { platform: 'telegram-a', label: 'Telegram A', url: 'https://web.telegram.org/a/' },
  { platform: 'telegram-k', label: 'Telegram K', url: 'https://web.telegram.org/k/' },
  { platform: 'signal', label: 'Signal', url: '' }
]);
const isCreatingProfile = ref(false);
const createDialogOpen = ref(false);
const newProfileName = ref('');
const newProfileGroup = ref('');
const createProfileError = ref('');
const closeTargetProfile = ref<RuntimeTab | null>(null);
const renameTargetProfile = ref<RuntimeTab | null>(null);
const renameProfileName = ref('');
const renameProfileGroup = ref('');
const renameProfileError = ref('');
const isRenamingProfile = ref(false);
const draggingProfileId = ref<string | null>(null);
const tabDropTargetId = ref<string | null>(null);
const tabDropAfter = ref(false);
const suppressTabClickProfileId = ref<string | null>(null);
let workspaceConfigSaveQueue: Promise<void> = Promise.resolve();
const translatedDrafts = ref<Record<string, string>>({});
const composerStatus = ref<Record<string, string>>({});
const composerFeedbackStates = ref<Record<string, ComposerFeedbackState>>({});
const composerSentStatusTimers = new Map<string, ReturnType<typeof setTimeout>>();
const enterOnlyHintTimers = new Map<string, ReturnType<typeof setTimeout>>();
const composerTranslationSources = new Map<string, { text: string; at: number; conversationSignature: string; requestId: string; composerKind: ComposerKind }>();
const composerTranslationLocks = new Map<string, { text: string; dedupeKey: string; at: number; conversationSignature: string; requestId: string; composerKind: ComposerKind }>();
const composerTranslateTimeoutMs = 9000;
const composerConversationSignatures = new Map<string, string>();
const nonEnglishContactKeys = new Set<string>();
const signalDiagnosticStatus = ref<Record<string, string>>({});
const webComposerDiagnosticStatus = ref<Record<string, string>>({});
const webviewPreloadGuardStatus = new Map<string, { version: string; platform: string; lastSeenAt: number }>();
const typingProxyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const typingProxyText = 'typing...';
const translationIntervals = new Map<string, ReturnType<typeof setInterval>>();
const composerInstallIntervals = new Map<string, ReturnType<typeof setInterval>>();
const composerEventPollIntervals = new Map<string, number>();
const webComposerProbeIntervals = new Map<string, ReturnType<typeof setInterval>>();
const unreadPollIntervals = new Map<string, {
  initialTimer: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
}>();
const signalComposerInstallLogged = new Set<string>();
const signalTranslationRuntimeStarted = new Set<string>();
const signalDiagnosticLogCache = new Map<string, { status: string; at: number }>();
const webComposerDiagnosticLogCache = new Map<string, { status: string; at: number }>();
const signalComposerPretranslations = new Map<string, {
  text: string;
  requestId: string;
  conversationSignature: string;
  promise: Promise<string>;
  result?: string;
  at: number;
}>();
const sensitiveSendPending = ref<SensitiveSendPending | null>(null);
type SensitiveDialog = { id: string; title: string; message: string; detail: string; buttons: string[]; cancelId: number };
const sensitiveDialogs = ref<SensitiveDialog[]>([]);
const activeSensitiveDialog = computed(() => sensitiveDialogs.value[0]);
const sensitiveDialogBusy = ref(false);
let removeSensitiveDialogListener: (() => void) | undefined;
let removeSensitiveDialogClosedListener: (() => void) | undefined;

async function respondSensitiveDialog(response: number) {
  const current = activeSensitiveDialog.value;
  if (!current || sensitiveDialogBusy.value) return;
  sensitiveDialogBusy.value = true;
  try {
    await window.chatTranslator.respondSensitiveSendDialog(current.id, response);
    sensitiveDialogs.value = sensitiveDialogs.value.filter(item => item.id !== current.id);
  } finally {
    sensitiveDialogBusy.value = false;
  }
}

function trapSensitiveDialogTab(event: KeyboardEvent) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sensitive-dialog-card button:not(:disabled)'));
  if (!buttons.length) { event.preventDefault(); return; }
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
  else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0]?.focus(); }
}

watch(() => activeSensitiveDialog.value?.id, async () => {
  await nextTick();
  document.querySelector<HTMLButtonElement>('.sensitive-dialog-card button')?.focus();
});
const sensitiveSendPreparationProfiles = new Set<string>();
let sensitiveSendExpiryTimer: ReturnType<typeof setTimeout> | null = null;
const translatingMessages = new Set<string>();
const translatedMessages = new Set<string>();
const smartReplyInFlightProfiles = new Map<string, {
  latestMessageKey: string;
  conversationSignature: string;
}>();
const smartReplyResults = new Map<string, {
  latestMessageKey: string;
  conversationSignature: string;
  replies: SmartReplySuggestion[];
  at: number;
}>();
const smartReplyCollapsedKeys = new Set<string>();
function smartReplyStateKey(profileId: string, conversationSignature: string, messageKey: string) {
  return `${profileId}::${conversationSignature}::${messageKey}`;
}
function clearSmartReplyStateForProfile(profileId: string) {
  const prefix = `${profileId}::`;
  for (const key of Array.from(smartReplyInFlightProfiles.keys())) {
    if (key.startsWith(prefix)) smartReplyInFlightProfiles.delete(key);
  }
  for (const key of Array.from(smartReplyResults.keys())) {
    if (key.startsWith(prefix)) smartReplyResults.delete(key);
  }
  for (const key of smartReplyCollapsedKeys) if (key.startsWith(prefix)) smartReplyCollapsedKeys.delete(key);
}
const unreadCounts = ref<Record<string, number>>({});
const translationQueue: QueuedTranslationTask[] = [];
const queuedTranslationKeys = new Set<string>();
const runningTranslationKeys = new Set<string>();
const runningTranslationTasks = new Map<string, QueuedTranslationTask>();
const runningTranslationProfiles = new Map<string, number>();
const translationQueueRetryTimers = new Map<string, number>();
const translationQueueRetryTasks = new Map<string, QueuedTranslationTask>();
let runningTranslationCount = 0;
let translationQueueTimer: number | null = null;
const translationQueueGlobalConcurrency = 24;
const translationQueueInteractiveReservedConcurrency = 6;
const translationQueuePerProfileConcurrency = 1;
const translationQueueInteractiveProfileConcurrency = 2;
const translationQueueHistoryBackfillProfileConcurrency = 18;
const translationQueueRealtimeReservedConcurrency = 6;
const webRuntimeGenerations = new Map<string, number>();
const webRuntimeControllers = new Map<string, AbortController>();
const messageTranslationAttempts = new Map<string, symbol>();
const failedMessageTranslationUntil = new Map<string, number>();
let webMessageAttemptSequence = 0;
const translationQueueRetryDelays = [5000, 30000];
const translationQueuePriority: Record<TranslationQueueReason, number> = {
  'composer-enter': 0,
  'manual-refresh': 10,
  'visible-message': 40,
  'history-backfill': 80
};
const legacyRendererTranslationCacheKeys = [
  'df.translationCache.v1',
  'df.translation.renderCache.v1.whatsapp',
  'df.translation.renderCache.v1.telegram',
  'df.translation.renderCache.v1.signal'
];
const translationInitialCacheLimit = 1000;
const translationHistoryCachePageSize = 1000;
const translationHotCacheEntryLimit = 120000;
const translationHotCacheByteLimit = 320 * 1024 * 1024;
const translationMemoryCaches = new Map<string, Map<string, string>>();
const translationMemoryCacheStats = new Map<string, { entries: number; bytes: number; lastAccessed: number }>();
let translationHotCacheEntries = 0;
let translationHotCacheBytes = 0;
const translationCacheOffsets = new Map<string, number>();
const translationCacheLoadPromises = new Map<string, Promise<void>>();
const translationCacheExhausted = new Set<string>();
const translationCachePreloaded = new Set<string>();
const translationCacheWarmupFailedAt = new Map<string, number>();
const scopedTranslationCacheLoadPromises = new Map<string, Promise<void>>();
const scopedTranslationCachePreloaded = new Set<string>();
const scopedTranslationCacheWarmupFailedAt = new Map<string, number>();
const profileTranslationRefreshTimers = new Map<string, number>();
const smartReplyUiRefreshTimers = new Map<string, number>();
const historyRenderPrefetchTimers = new Map<string, number>();
const historyRenderPrefetchInFlight = new Set<string>();
const scopedTranslationCacheOffsets = new Map<string, number>();
const scopedTranslationCacheExhausted = new Set<string>();
const browserRenderCacheEntryLimit = 1500;
const historyRenderPrefetchBatchSize = 100;
const historyBackfillBatchSize = 20;
const historyBackfillCooldownMs = 1800;
const historyBackfillRefreshDelayMs = 220;
const historyBackfillLastQueuedAt = new Map<string, number>();
const unreadPeekMaxItems = 12;
const unreadPeekTranslationPromises = new Map<string, Promise<string>>();
const memoryStatus = ref<MemoryStatus | null>(null);
const eyeCareTranslationDialogOpen = ref(false);
const eyeCareTranslationEnabled = ref(false);
const eyeCareTranslationApplying = ref(false);
const eyeCareTranslationMessage = ref('');
const eyeCareTranslationMessageIsError = ref(false);
const eyeCareTranslationColor = '#d5b94f';
const telegramEyeCareTranslationColor = '#c8ccc7';
const lockScreenStatus = ref<LockScreenStatus | null>(null);
const lockScreenVisible = ref(false);
const remoteGuardStatus = ref<RemoteGuardStatus | null>(null);
const remoteGuardPanelVisible = ref(false);
const remoteGuardScanning = ref(false);
const remoteGuardRecoveryPrompt = ref(false);
const remoteGuardMessage = ref('');
const lockScreenMode = ref<'setup' | 'unlock' | 'reset'>('setup');
const lockKeypadVisible = ref(false);
const lockPinDraft = ref('');
const lockPinConfirmDraft = ref('');
const lockPinError = ref('');
const lockKeypadDigits = ref<number[]>([]);
const lockScreenClock = ref(Date.now());
const lockGuideVisible = ref(false);
const lockSetupIntent = ref<LockSetupIntent>('setup');
const lockSetupDialogStage = ref<LockSetupDialogStage>(null);
const lockNetworkGateBusy = ref(false);
const lockNetworkGateReason = ref('');
const lockNetworkWarningShaking = ref(false);
const lockPinChangeToken = ref('');
const refreshingWindow = ref(false);
const lockScreenDigitLength = 6;
const lockScreenPhysicalDigitLength = 2;
const lockScreenCredentialLength = lockScreenDigitLength + lockScreenPhysicalDigitLength;
const lockBlankClickWindowMs = 5000;
const lockBlankShowKeypadThreshold = 3;
const lockBlankResetThreshold = 8;
const refreshWindowCooldownMs = 1500;
const signalWorkspaceBleedPx = 2;
let memoryStatusTimer: ReturnType<typeof setInterval> | null = null;
let lockScreenClockTimer: ReturnType<typeof setInterval> | null = null;
let lockBlankClickCount = 0;
let lockBlankClickResetTimer: ReturnType<typeof setTimeout> | null = null;
let lockNetworkWarningShakeTimer: ReturnType<typeof setTimeout> | null = null;
let refreshWindowCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let signalWorkspaceSyncTimer: ReturnType<typeof setTimeout> | null = null;
let signalWorkspaceResizeObserver: ResizeObserver | null = null;
let removeTranslationLayoutWatchers:(()=>void)|null=null;
let pokeballTimer: ReturnType<typeof setTimeout> | null = null;
let removeSignalActivateProfileListener: (() => void) | null = null;
let removeSignalNotificationActivationListener: (() => void) | null = null;
let removeSignalRestoreProfileListener: (() => void) | null = null;
const signalNotificationActivationsInFlight = new Set<string>();
let removeSignalWorkspaceSyncListener: (() => void) | null = null;
let removeRemoteGuardStatusListener: (() => void) | null = null;

function normalizeComposerConversationSignature(value: string) {
  return normalizeCacheText(value || '').slice(0, 360);
}

function normalizeSmartReplyConversationSignature(value: string) {
  return normalizeComposerConversationSignature(value).split('::')[0].trim();
}

function composerStateKey(profileId: string, conversationSignature = '') {
  const signature = normalizeComposerConversationSignature(conversationSignature);
  return `${profileId}::${signature || '__active__'}`;
}

function createComposerRequestId(profileId: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `composer-${profileId}-${suffix}`;
}

function createTranslationRequestId(prefix: string, profileId: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${profileId}-${suffix}`;
}

function deepSeekUserId(profileId: string) {
  return `df-${profileId}`.replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 512);
}

const themeClass = computed(() => {
  if (activeTheme.value === 'pink') return 'theme-pink';
  if (activeTheme.value === 'murongPurple') return 'theme-black-gold theme-murong-purple';
  if (activeTheme.value === 'clearWaterBlue') return 'theme-black-gold theme-clear-water-blue';
  return 'theme-black-gold';
});
const remoteGuardVisualState = computed(() => remoteGuardStatus.value?.state || 'starting');
const remoteGuardStateLabel = computed(() => {
  const state = remoteGuardVisualState.value;
  if (state === 'alarm') return '发现远控';
  if (state === 'recovery') return '等待确认';
  if (state === 'suspicious') return '发现可疑程序';
  if (state === 'degraded') return '巡检受限';
  if (state === 'guarding') return '值守中';
  return '启动中';
});
const remoteGuardLockCountdown = computed(() => {
  const deadline = remoteGuardStatus.value?.windowsLockScheduledAt;
  if (!deadline || remoteGuardStatus.value?.windowsLockState !== 'scheduled') return '';
  return String(Math.max(0, Math.ceil((deadline - lockScreenClock.value) / 1000)));
});
const remoteGuardLastCheckedText = computed(() => {
  const checkedAt = remoteGuardStatus.value?.checkedAt || 0;
  return checkedAt ? new Date(checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未完成';
});
function lockStatusRequiresUpgrade(status: LockScreenStatus | null | undefined) {
  return Boolean((status as (LockScreenStatus & { requiresUpgrade?: boolean }) | null | undefined)?.requiresUpgrade);
}

const lockUnlockCredentialFormat = computed(() =>
  lockScreenStatus.value?.credentialFormat ||
  (lockStatusRequiresUpgrade(lockScreenStatus.value) ? 'legacy-6-digit' : 'digits8')
);
const lockUnlockCredentialLength = computed(() =>
  lockUnlockCredentialFormat.value === 'legacy-6-digit' ? lockScreenDigitLength : lockScreenCredentialLength
);
const lockIsSettingPin = computed(() => lockScreenMode.value === 'setup' || lockScreenMode.value === 'reset');
const lockActiveCredentialLength = computed(() =>
  lockIsSettingPin.value ? lockScreenCredentialLength : lockUnlockCredentialLength.value
);

function formatLockPinLine(value: string, active: boolean, length: number) {
  const cells: string[] = Array.from({ length }, (_, index) => (index < value.length ? '●' : '○'));
  if (!active) return cells.join(' ');
  const cursorIndex = Math.min(value.length, length - 1);
  cells[cursorIndex] = value.length >= length ? '●|' : '|○';
  return cells.join(' ');
}

const lockResetAvailable = computed(() =>
  lockScreenMode.value === 'unlock' &&
  Boolean(lockScreenStatus.value?.enabled) &&
  (lockScreenStatus.value?.failedAttempts ?? 0) >= (lockScreenStatus.value?.maxAttempts ?? 3)
);
const lockShowPinControls = computed(() => lockIsSettingPin.value || lockKeypadVisible.value);
const lockPinDots = computed(() =>
  formatLockPinLine(
    lockPinDraft.value,
    !lockIsSettingPin.value || lockPinDraft.value.length < lockScreenCredentialLength,
    lockActiveCredentialLength.value
  )
);
const lockPinConfirmDots = computed(() =>
  formatLockPinLine(
    lockPinConfirmDraft.value,
    lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength,
    lockScreenCredentialLength
  )
);
const lockActiveDraft = computed(() =>
  lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength
    ? lockPinConfirmDraft.value
    : lockPinDraft.value
);
const lockInputInstruction = computed(() => {
  const value = lockActiveDraft.value;
  const isConfirmation = lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength;
  if (!lockIsSettingPin.value && lockUnlockCredentialLength.value === lockScreenDigitLength) {
    return `请用随机软键盘输入旧版 ${lockScreenDigitLength} 位数字密码`;
  }
  if (value.length < lockScreenDigitLength) {
    return `${isConfirmation ? '再次' : '请'}用随机软键盘输入 ${lockScreenDigitLength} 位数字`;
  }
  if (value.length < lockScreenCredentialLength) {
    if (!lockIsSettingPin.value && lockUnlockCredentialFormat.value === 'digits6-letters2') {
      return `请用实体键盘输入旧版后 2 位字母（不区分大小写）`;
    }
    return `请用实体键盘输入后 ${lockScreenPhysicalDigitLength} 位数字`;
  }
  if (lockIsSettingPin.value && !isConfirmation) return '第一遍已完成，请再次输入完整密码';
  return lockIsSettingPin.value ? '两次密码输入已完成，请保存' : '密码输入已完成，请解锁';
});
const lockRemainingText = computed(() => {
  const lockedUntil = lockScreenStatus.value?.lockedUntil ?? 0;
  const remaining = Math.max(0, lockedUntil - lockScreenClock.value);
  if (!remaining) return '';
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, '0')}秒`;
});
const lockScreenTitle = computed(() => {
  if (lockScreenMode.value === 'setup') return '设置客户端锁屏密码';
  if (lockScreenMode.value === 'reset' && lockSetupIntent.value === 'upgrade') return '升级客户端锁屏密码';
  if (lockScreenMode.value === 'reset') return '重置客户端锁屏密码';
  return '客户端已锁屏';
});
const lockScreenHint = computed(() => {
  if (lockScreenMode.value === 'setup' || lockScreenMode.value === 'reset') {
    return '请设置 8 位数字锁屏密码：前 6 位使用随机软键盘，后 2 位使用实体键盘。两次输入必须一致。';
  }
  if (lockStatusRequiresUpgrade(lockScreenStatus.value)) {
    return lockUnlockCredentialFormat.value === 'legacy-6-digit'
      ? '请输入旧版 6 位数字密码，验证后必须断网升级。'
      : '请输入旧版 6 位数字 + 2 位字母密码，验证后必须断网升级。';
  }
  if (lockResetAvailable.value) return '请重置锁屏密码。';
  if (!lockKeypadVisible.value) return '客户端已遮住聊天内容。';
  return '请输入锁屏密码解锁。';
});

const appTiles: AppTile[] = [
  { app: 'whatsapp', platform: 'whatsapp', label: 'WhatsApp', short: 'WA', color: '#22c55e', icon: multiWhatsappIcon },
  { app: 'telegram', platform: 'telegram-k', label: 'Telegram', short: 'TG', color: '#35a8ff', icon: multiTelegramIcon },
  { app: 'signal', platform: 'signal', label: 'Signal', short: 'SG', color: '#5361ff', icon: multiSignalIcon }
];

const activeProfile = computed(() => profiles.value.find((profile) => profile.id === activeProfileId.value) ?? null);
const activeSignalProfile = computed(() => (activeProfile.value?.platform === 'signal' ? activeProfile.value : null));
const hasBlockingModal = computed(() => Boolean(
  lockScreenVisible.value ||
  lockSetupDialogStage.value ||
  remoteGuardPanelVisible.value ||
  (signedIn.value && activePanel.value === 'session' && lockGuideVisible.value && !lockScreenStatus.value?.enabled) ||
  createDialogOpen.value ||
  closeTargetProfile.value ||
  renameTargetProfile.value ||
  reauthorizationDialogOpen.value ||
  translationCustomizationOpen.value ||
  eyeCareTranslationDialogOpen.value
));
watch(assistantOpen, async () => { await nextTick(); scheduleSignalWorkspaceSyncBurst(); });
watch([signedIn, lockScreenVisible, activePanel], () => { assistantOpen.value = false; });
const translationCustomizationDirty = computed(() => (
  translationCustomizationDraft.value.trim() !== translationCustomizationSaved.value.trim()
));
const activePlatformInfo = computed(() => {
  if (!activeProfile.value) return null;
  return platformCatalog.value.find((item) => item.platform === activeProfile.value?.platform) ?? null;
});
const activeWebUrl = computed(() => activePlatformInfo.value?.url ?? '');
const currentAppTile = computed(() => appTiles.find((tile) => tile.app === currentApp.value) ?? appTiles[0]);
const currentAppProfiles = computed(() => profiles.value.filter((profile) => appForPlatform(profile.platform) === currentApp.value));
const renderableProfiles = computed(() =>
  signedIn.value
    ? profiles.value
    .map((profile) => ({
      profile,
      url: platformCatalog.value.find((item) => item.platform === profile.platform)?.url ?? ''
    }))
    .filter((item) => item.url)
    : []
);
const workspaceTabs = computed<RuntimeTab[]>(() => {
  const order = new Map(profileTabOrder.value.map((id, index) => [id, index]));
  return [...currentAppProfiles.value]
    .sort((left, right) => {
      const orderDifference = (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      return orderDifference || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
    })
    .map((profile) => {
    const tile = appTiles.find((item) => item.app === appForPlatform(profile.platform)) ?? appTiles[0];
    return { ...profile, short: tile.short, color: tile.color, icon: tile.icon };
    });
});
const unreadCountsByApp = computed<Record<RuntimeApp, number>>(() => ({
  whatsapp: profiles.value
    .filter((profile) => appForPlatform(profile.platform) === 'whatsapp')
    .reduce((sum, profile) => sum + unreadCountForProfile(profile.id), 0),
  telegram: profiles.value
    .filter((profile) => appForPlatform(profile.platform) === 'telegram')
    .reduce((sum, profile) => sum + unreadCountForProfile(profile.id), 0),
  signal: profiles.value
    .filter((profile) => appForPlatform(profile.platform) === 'signal')
    .reduce((sum, profile) => sum + unreadCountForProfile(profile.id), 0)
}));
const totalUnreadCount = computed(() => (
  signedIn.value
    ? unreadCountsByApp.value.whatsapp + unreadCountsByApp.value.telegram + unreadCountsByApp.value.signal
    : 0
));
const hasActiveRenderableProfile = computed(() => Boolean(activeProfile.value && activeWebUrl.value));
const activeComposerStatus = computed(() => (activeProfileId.value ? composerStatus.value[activeProfileId.value] ?? '' : ''));
const activeComposerFeedbackText = computed(() => {
  const state = activeProfileId.value ? composerFeedbackStates.value[activeProfileId.value] || '' : '';
  if (state === 'typing') return '正在输入中文...';
  if (state === 'translating') return '正在翻译...';
  if (state === 'ready') return '已完成自然美式口语化翻译，已保持原意和语气；\n已适当缩写单词，已去除对应符号 ；- .\n回车后即可发送英文。';
  if (state === 'sent') return '已发送';
  return '';
});
const activeSensitiveSendPending = computed(() => {
  const pending = sensitiveSendPending.value;
  return pending && pending.profileId === activeProfileId.value && pending.expiresAt > Date.now() ? pending : null;
});
function setComposerFeedbackState(profileId: string, state: ComposerFeedbackState) {
  composerFeedbackStates.value = { ...composerFeedbackStates.value, [profileId]: state };
}
const activeSignalDiagnosticStatus = computed(() => (activeProfileId.value ? signalDiagnosticStatus.value[activeProfileId.value] ?? '' : ''));
const activeWebComposerDiagnosticStatus = computed(() => (activeProfileId.value ? webComposerDiagnosticStatus.value[activeProfileId.value] ?? '' : ''));
const canUseTranslatorComposer = computed(() => {
  const platform = activeProfile.value?.platform;
  return platform === 'whatsapp' || platform === 'telegram-a' || platform === 'telegram-k';
});
const memoryUsedPercent = computed(() => Math.min(100, Math.max(0, memoryStatus.value?.usedPercent ?? 0)));
const memoryFreeText = computed(() => (memoryStatus.value ? `${formatBytes(memoryStatus.value.freeBytes)} 可用` : '读取中'));
const memoryUsedText = computed(() => (memoryStatus.value ? `${memoryUsedPercent.value}%` : '--'));
const memoryLevelClass = computed(() => {
  if (memoryUsedPercent.value >= 92) return 'danger';
  if (memoryUsedPercent.value >= 82) return 'warning';
  return 'normal';
});
const panelTitle = computed(() => {
  const titles: Record<Panel, { en: string; zh: string }> = {
    apps: { en: 'APPLICATION CENTER', zh: '应用中心' },
    home: { en: 'DASHBOARD', zh: '我的主页' },
    notice: { en: 'NOTIFICATION MANAGEMENT', zh: '管理通知' },
    agency: { en: 'AGENCY PARTNERSHIP', zh: '代理加盟' },
    settings: { en: 'SETTINGS', zh: '全局设置' },
    account: { en: 'ACCOUNT', zh: '个人中心' },
    session: { en: 'SESSION', zh: '多开工作区' }
  };
  return titles[activePanel.value];
});

const homeUsername = computed(() => clientAuthorizationStatus.value?.username || '未设置');
const remainingAuthorizationText = computed(() => {
  const expiresAt = clientAuthorizationStatus.value?.expiresAt;
  if (!expiresAt) return '未提供';
  const remainingMs = Date.parse(expiresAt) - lockScreenClock.value;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '已过期';
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (remainingMs < oneDayMs) return '不足 1 天';
  return `${Math.ceil(remainingMs / oneDayMs)} 天`;
});
const authorizationExpiryText = computed(() => {
  const expiresAt = clientAuthorizationStatus.value?.expiresAt;
  if (!expiresAt) return '未提供';
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(expiresAtMs);
});

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function unreadCountForProfile(profileId: string) {
  return unreadCounts.value[profileId] ?? 0;
}

function unreadCountForApp(app: RuntimeApp) {
  return unreadCountsByApp.value[app] ?? 0;
}

function formatUnreadCount(count: number) {
  if (count > 99) return '99+';
  return String(count);
}

function setUnreadCount(profileId: string, count: number) {
  const normalizedCount = Math.max(0, Math.min(999, Math.floor(Number(count) || 0)));
  if ((unreadCounts.value[profileId] ?? 0) === normalizedCount) return;
  unreadCounts.value = { ...unreadCounts.value, [profileId]: normalizedCount };
}

function clearUnreadState(profileId: string) {
  stopUnreadBridge(profileId);
  if (!(profileId in unreadCounts.value)) return;
  const nextCounts = { ...unreadCounts.value };
  delete nextCounts[profileId];
  unreadCounts.value = nextCounts;
}

async function refreshMemoryStatus() {
  if (!window.chatTranslator?.getMemoryStatus) return;
  try {
    memoryStatus.value = await window.chatTranslator.getMemoryStatus();
  } catch {
    memoryStatus.value = null;
  }
}

function setTheme(theme: ThemeName) {
  activeTheme.value = theme;
  themeMenuOpen.value = false;
  void window.chatTranslator?.setWindowTheme?.(theme).finally(() => {
    preserveActiveSignalAfterChromeChange();
  });
  for (const profile of profiles.value) {
    void executeProfileScript(profile.id, buildInjectedComposerScript('install')).catch(() => undefined);
  }
}

function buildEyeCareTranslationStyleScript(enabled: boolean, translationColor = eyeCareTranslationColor) {
  return `
(() => {
  const selector = '.df-chat-translation, .module-message__maoyi-translation';
  const styleId = 'df-eye-care-translation-style';
  const stateKey = '__dfEyeCareTranslationState';
  const originalKey = '__dfEyeCareTranslationOriginalColor';
  const appliedKey = '__dfEyeCareTranslationApplied';
  const existingStyle = document.getElementById(styleId);
  const previousState = window[stateKey];
  previousState?.observer?.disconnect?.();
  const previousNodes = previousState?.nodes instanceof Set ? previousState.nodes : new Set();
  const restoreNode = (node) => {
    if (!node || node[appliedKey] !== true) return;
    const original = node[originalKey];
    if (original?.value) {
      node.style.setProperty('color', original.value, original.priority || '');
    } else {
      node.style.removeProperty('color');
    }
    delete node[originalKey];
    delete node[appliedKey];
  };
  if (!${enabled ? 'true' : 'false'}) {
    existingStyle?.remove();
    for (const node of previousNodes) restoreNode(node);
    for (const node of document.querySelectorAll(selector)) restoreNode(node);
    window[stateKey] = null;
    return JSON.stringify({ ok: true, enabled: false, matched: 0, observerActive: false });
  }
  existingStyle?.remove();
  const eyeCareStyle = document.createElement('style');
  eyeCareStyle.id = styleId;
  eyeCareStyle.textContent = [
    '.dark-theme .df-composer-review[data-df-composer-review="source-native"] {',
    '  background: #1d211c !important;',
    '  border-color: #46503d !important;',
    '  color: #d5b94f !important;',
    '}',
    '.dark-theme .df-composer-review[data-df-composer-review="source-native"] > div {',
    '  color: #bcb17a !important;',
    '}',
    '.dark-theme .df-composer-review[data-df-composer-review="source-native"] textarea[data-df-composer-review-text="true"] {',
    '  background: #151815 !important;',
    '  border-color: #3c4435 !important;',
    '  caret-color: #d5b94f !important;',
    '  color: #d8cf9a !important;',
    '}'
  ].join('\\n');
  (document.head || document.documentElement).appendChild(eyeCareStyle);
  const nodes = previousNodes;
  const applyNode = (node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches?.(selector)) return;
    if (node[appliedKey] !== true) {
      node[originalKey] = {
        value: node.style.getPropertyValue('color'),
        priority: node.style.getPropertyPriority('color')
      };
      node[appliedKey] = true;
      nodes.add(node);
    }
    if (
      node.style.getPropertyValue('color').toLowerCase() !== '${translationColor}' ||
      node.style.getPropertyPriority('color') !== 'important'
    ) {
      node.style.setProperty('color', '${translationColor}', 'important');
    }
  };
  const applyWithin = (root) => {
    if (!(root instanceof Element)) return;
    if (root.matches?.(selector)) applyNode(root);
    for (const node of root.querySelectorAll?.(selector) || []) applyNode(node);
  };
  applyWithin(document.documentElement);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        applyNode(record.target);
        continue;
      }
      for (const node of record.addedNodes) applyWithin(node);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style']
  });
  window[stateKey] = { observer, nodes };
  return JSON.stringify({
    ok: true,
    enabled: true,
    matched: document.querySelectorAll(selector).length,
    observerActive: true
  });
})()
  `.trim();
}

async function applyEyeCareTranslationToProfile(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) throw new Error('聊天页面不存在');
  const translationColor = appForPlatform(profile.platform) === 'telegram'
    ? telegramEyeCareTranslationColor
    : eyeCareTranslationColor;
  const rawResult = await executeProfileScript<string>(
    profileId,
    buildEyeCareTranslationStyleScript(eyeCareTranslationEnabled.value, translationColor)
  );
  let result: EyeCareTranslationApplyResult | null = null;
  try {
    result = typeof rawResult === 'string' ? JSON.parse(rawResult) as EyeCareTranslationApplyResult : null;
  } catch {
    result = null;
  }
  if (!result?.ok || result.enabled !== eyeCareTranslationEnabled.value) {
    throw new Error('译文护眼模式未被聊天页面接受');
  }
  return result;
}

function applyEyeCareTranslationToAllProfiles() {
  return Promise.allSettled(
    profiles.value.map((profile) => applyEyeCareTranslationToProfile(profile.id))
  );
}

function openEyeCareTranslationDialog() {
  eyeCareTranslationMessage.value = '';
  eyeCareTranslationMessageIsError.value = false;
  eyeCareTranslationDialogOpen.value = true;
  preserveActiveSignalAfterChromeChange();
}

function closeEyeCareTranslationDialog() {
  if (eyeCareTranslationApplying.value) return;
  eyeCareTranslationDialogOpen.value = false;
}

async function setEyeCareTranslationMode(enabled: boolean) {
  if (eyeCareTranslationApplying.value) return;
  eyeCareTranslationApplying.value = true;
  eyeCareTranslationMessage.value = '';
  eyeCareTranslationMessageIsError.value = false;
  eyeCareTranslationEnabled.value = enabled;
  try {
    const results = await applyEyeCareTranslationToAllProfiles();
    const appliedCount = results.filter((result) => result.status === 'fulfilled').length;
    const activeIndex = profiles.value.findIndex((profile) => profile.id === activeProfileId.value);
    if (activeIndex >= 0 && results[activeIndex]?.status !== 'fulfilled') {
      throw new Error('当前聊天页面暂未接受护眼模式，请稍后重试');
    }
    if (profiles.value.length > 0 && appliedCount === 0) {
      throw new Error('聊天页面暂未接受护眼模式，请保持聊天窗口打开后重试');
    }
    if (window.chatTranslator) {
      const saved = await window.chatTranslator.setEyeCareTranslationEnabled(enabled);
      configState.value = saved;
    }
    eyeCareTranslationMessage.value = enabled ? '护眼模式已打开' : '护眼模式已关闭';
    eyeCareTranslationDialogOpen.value = false;
  } catch (error) {
    const knownMessage = error instanceof Error ? error.message : '';
    eyeCareTranslationMessage.value = knownMessage.startsWith('当前聊天页面暂未接受护眼模式') ||
      knownMessage.startsWith('聊天页面暂未接受护眼模式')
      ? knownMessage
      : '护眼模式切换失败，请稍后重试';
    eyeCareTranslationMessageIsError.value = true;
  } finally {
    eyeCareTranslationApplying.value = false;
  }
}

function toggleThemeMenu() {
  themeMenuOpen.value = !themeMenuOpen.value;
  preserveActiveSignalAfterChromeChange();
}

function stopPokeballSequence() {
  if (pokeballTimer) clearTimeout(pokeballTimer);
  pokeballTimer = null;
  pokeballBursting.value = false;
}

function schedulePokeballBurst() {
  if (!signedIn.value || pokeballTimer || pokeballBursting.value) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const waitMs = 3000 + Math.floor(Math.random() * 9001);
  pokeballTimer = setTimeout(() => {
    pokeballTimer = null;
    if (!signedIn.value) return;
    pokeballBursting.value = true;
  }, waitMs);
}

function handlePokeballAnimationEnd(event: AnimationEvent) {
  if (event.animationName !== 'runtime-pokeball-burst') return;
  pokeballBursting.value = false;
  schedulePokeballBurst();
}

function toggleWorkspaceHeader() {
  workspaceHeaderCollapsed.value = !workspaceHeaderCollapsed.value;
  themeMenuOpen.value = false;
  schedulePokeballBurst();
  preserveActiveSignalAfterChromeChange();
}

watch(signedIn, (ready) => {
  if (ready) schedulePokeballBurst();
  else stopPokeballSequence();
}, { immediate: true });

function preserveActiveSignalAfterChromeChange() {
  const activeSignal = activeSignalProfile.value;
  if (!signedIn.value || activePanel.value !== 'session' || !activeSignal) return;
  void nextTick(() => {
    scheduleSignalWorkspaceSyncBurst();
    void launchSignalProfile(activeSignal.id).then(() => {
      scheduleSignalWorkspaceSyncBurst();
    });
  });
}

async function loadRuntimeState() {
  if (!window.chatTranslator) return;

  const [config, catalog, sourceOnlyAcceptance] = await Promise.all([
    window.chatTranslator.getConfig(),
    window.chatTranslator.getPlatformCatalog(),
    window.chatTranslator.getSignalSourceOnlyAcceptance()
  ]);
  signalSourceOnlyAcceptance.value = sourceOnlyAcceptance;
  applyConfig(config);
  platformCatalog.value = catalog;
}

function isSignalLegacyBubbleTranslationDisabled(profile?: ChatProfile | null) {
  return Boolean(
    profile &&
      !signalTranslationAcceptancePolicy(profile.platform, signalSourceOnlyAcceptance.value)
        .legacyBubbleEnabled
  );
}

function applyConfig(config: AppConfig) {
  configState.value = config;
  profiles.value = config.profiles;
  profileTabOrder.value = sanitizeProfileTabOrder(config.profiles, config.profileTabOrder);
  lastActiveProfileIds.value = { ...config.lastActiveProfileIds };
  activeTheme.value = config.activeTheme;
  eyeCareTranslationEnabled.value = config.eyeCareTranslationEnabled === true;
  const restoredActiveId = config.profiles.some((profile) => profile.id === config.activeProfileId)
    ? config.activeProfileId
    : config.profiles[0]?.id ?? null;
  activeProfileId.value = restoredActiveId;
  if (activeProfile.value) {
    currentApp.value = appForPlatform(activeProfile.value.platform);
  } else if (config.profiles[0]) {
    currentApp.value = appForPlatform(config.profiles[0].platform);
  }
}

async function login() {
  if (!clientAuthorizationStatus.value?.runtimeAllowed) {
    clientAuthorizationMessage.value = '请先完成本机授权';
    return;
  }
  await loadRuntimeState();
  await initializeLockScreen();
  await loadStorageLocation();
  signedIn.value = true;
  activePanel.value = 'apps';
}

async function loadStorageLocation() {
  try {
    const status = await window.chatTranslator?.getStorageLocation?.();
    if (status) storageLocation.value = status;
  } catch (error) {
    storageLocationMessage.value = error instanceof Error ? error.message : '数据存储位置读取失败';
    storageLocationMessageIsError.value = true;
  }
}

async function openStorageLocation() {
  if (storageLocationBusy.value) return;
  storageLocationMessage.value = '';
  storageLocationMessageIsError.value = false;
  try {
    const result = await window.chatTranslator?.openStorageLocation?.();
    if (!result) throw new Error('打开数据目录 API 不可用');
    if (!result.ok) {
      storageLocationMessage.value = result.reason || '数据目录打开失败';
      storageLocationMessageIsError.value = true;
    }
  } catch (error) {
    storageLocationMessage.value = error instanceof Error ? error.message : '数据目录打开失败';
    storageLocationMessageIsError.value = true;
  }
}

async function changeStorageLocation() {
  if (storageLocationBusy.value) return;
  storageLocationBusy.value = true;
  storageLocationMessage.value = '';
  storageLocationMessageIsError.value = false;
  try {
    const result = await window.chatTranslator?.changeStorageLocation?.();
    if (!result) throw new Error('更改数据目录 API 不可用');
    if (result.canceled) return;
    if (!result.ok) {
      storageLocationMessage.value = result.reason || '数据目录更改失败';
      storageLocationMessageIsError.value = true;
      return;
    }
    storageLocationMessage.value = '正在关闭客户端并迁移数据，请勿关闭电脑';
  } catch (error) {
    storageLocationMessage.value = error instanceof Error ? error.message : '数据目录更改失败';
    storageLocationMessageIsError.value = true;
  } finally {
    if (!storageLocationMessage.value.startsWith('正在关闭客户端')) storageLocationBusy.value = false;
  }
}

function applyClientAuthorizationStatus(status: ClientAuthorizationStatus) {
  clientAuthorizationStatus.value = status;
  if (status.username) clientUsernameDraft.value = status.username;
}

async function initializeClientAuthorization() {
  clientAuthorizationLoading.value = true;
  clientAuthorizationMessage.value = '';
  try {
    const status = await window.chatTranslator?.getClientAuthorizationStatus?.();
    if (!status) throw new Error('客户端授权 API 不可用');
    applyClientAuthorizationStatus(status);
    if (status.authorized) await login();
  } catch (error) {
    clientAuthorizationMessage.value = error instanceof Error ? error.message : '客户端授权状态读取失败';
  } finally {
    clientAuthorizationLoading.value = false;
  }
}

async function confirmClientUsername() {
  if (clientAuthorizationBusy.value) return;
  clientAuthorizationBusy.value = true;
  clientAuthorizationMessage.value = '';
  try {
    const result = await window.chatTranslator?.setClientUsername?.(clientUsernameDraft.value);
    if (!result) throw new Error('用户名保存 API 不可用');
    applyClientAuthorizationStatus(result.status);
    clientAuthorizationMessage.value = result.ok ? '用户名已设置，设置后无法更改' : result.reason || '用户名设置失败';
  } catch (error) {
    clientAuthorizationMessage.value = error instanceof Error ? error.message : '用户名设置失败';
  } finally {
    clientAuthorizationBusy.value = false;
  }
}

async function copyClientMachineInfo() {
  clientAuthorizationMessage.value = '';
  try {
    const result = await window.chatTranslator?.copyClientMachineInfo?.();
    if (!result) throw new Error('复制本机信息 API 不可用');
    applyClientAuthorizationStatus(result.status);
    clientAuthorizationMessage.value = result.ok ? '本机码和用户名已复制' : result.reason || '复制失败';
  } catch (error) {
    clientAuthorizationMessage.value = error instanceof Error ? error.message : '复制本机信息失败';
  }
}

async function activateClientLicense() {
  if (clientAuthorizationBusy.value) return;
  clientAuthorizationBusy.value = true;
  clientAuthorizationMessage.value = '';
  try {
    const result = await window.chatTranslator?.activateClientLicense?.(clientLicenseCodeDraft.value);
    if (!result) throw new Error('客户端激活 API 不可用');
    applyClientAuthorizationStatus(result.status);
    if (!result.ok) {
      clientAuthorizationMessage.value = result.reason || '授权失败';
      return;
    }
    clientAuthorizationMessage.value = '授权成功';
    clientLicenseCodeDraft.value = '';
    await login();
  } catch (error) {
    clientAuthorizationMessage.value = error instanceof Error ? error.message : '授权失败';
  } finally {
    clientAuthorizationBusy.value = false;
  }
}

async function openReauthorizationDialog() {
  reauthorizationLicenseCodeDraft.value = '';
  reauthorizationMessage.value = '';
  reauthorizationMessageIsError.value = false;
  reauthorizationSucceeded.value = false;
  accountMessage.value = '';
  try {
    const status = await window.chatTranslator?.getClientAuthorizationStatus?.();
    if (status) applyClientAuthorizationStatus(status);
  } catch {
    // The current in-memory authorization identity remains available in the dialog.
  }
  reauthorizationDialogOpen.value = true;
}

function closeReauthorizationDialog() {
  if (reauthorizationBusy.value) return;
  reauthorizationDialogOpen.value = false;
  reauthorizationLicenseCodeDraft.value = '';
  reauthorizationMessage.value = '';
  reauthorizationMessageIsError.value = false;
  reauthorizationSucceeded.value = false;
}

function applyTranslationCustomizationStatus(status: TranslationCustomizationStatus) {
  translationCustomizationDraft.value = status.editableChineseToEnglish;
  translationCustomizationSaved.value = status.editableChineseToEnglish;
}

async function openTranslationCustomization() {
  translationCustomizationOpen.value = true;
  translationCustomizationBusy.value = true;
  translationCustomizationMessage.value = '';
  translationCustomizationMessageIsError.value = false;
  try {
    const status = await window.chatTranslator?.getTranslationCustomization?.();
    if (!status) throw new Error('自定义提示词 API 不可用');
    applyTranslationCustomizationStatus(status);
  } catch (error) {
    translationCustomizationMessage.value = error instanceof Error ? error.message : '读取自定义内容失败';
    translationCustomizationMessageIsError.value = true;
  } finally {
    translationCustomizationBusy.value = false;
  }
}

function closeTranslationCustomization() {
  if (translationCustomizationBusy.value) return;
  translationCustomizationOpen.value = false;
  translationCustomizationDraft.value = translationCustomizationSaved.value;
  translationCustomizationMessage.value = '';
  translationCustomizationMessageIsError.value = false;
}

async function saveTranslationCustomization() {
  if (translationCustomizationBusy.value || !translationCustomizationDraft.value.trim()) return;
  translationCustomizationBusy.value = true;
  translationCustomizationMessage.value = '';
  translationCustomizationMessageIsError.value = false;
  try {
    const status = await window.chatTranslator?.saveTranslationCustomization?.(translationCustomizationDraft.value);
    if (!status) throw new Error('自定义提示词 API 不可用');
    applyTranslationCustomizationStatus(status);
    signalComposerPretranslations.clear();
    translationCustomizationMessage.value = status.customized
      ? '保存成功，后续中译英使用当前自定义内容'
      : '已保持原默认中译英提示词';
  } catch (error) {
    translationCustomizationMessage.value = error instanceof Error ? error.message : '保存自定义内容失败';
    translationCustomizationMessageIsError.value = true;
  } finally {
    translationCustomizationBusy.value = false;
  }
}

async function resetTranslationCustomization() {
  if (translationCustomizationBusy.value) return;
  translationCustomizationBusy.value = true;
  translationCustomizationMessage.value = '';
  translationCustomizationMessageIsError.value = false;
  try {
    const status = await window.chatTranslator?.resetTranslationCustomization?.();
    if (!status) throw new Error('自定义提示词 API 不可用');
    applyTranslationCustomizationStatus(status);
    signalComposerPretranslations.clear();
    translationCustomizationMessage.value = '已恢复原默认中译英提示词';
  } catch (error) {
    translationCustomizationMessage.value = error instanceof Error ? error.message : '恢复默认提示词失败';
    translationCustomizationMessageIsError.value = true;
  } finally {
    translationCustomizationBusy.value = false;
  }
}

async function copyReauthorizationMachineInfo() {
  reauthorizationMessage.value = '';
  reauthorizationMessageIsError.value = false;
  try {
    const result = await window.chatTranslator?.copyClientMachineInfo?.();
    if (!result) throw new Error('复制本机信息 API 不可用');
    applyClientAuthorizationStatus(result.status);
    reauthorizationMessage.value = result.ok ? '本机码和用户名已复制' : result.reason || '复制失败';
    reauthorizationMessageIsError.value = !result.ok;
  } catch (error) {
    reauthorizationMessage.value = error instanceof Error ? error.message : '复制失败';
    reauthorizationMessageIsError.value = true;
  }
}

async function confirmReauthorization() {
  if (reauthorizationBusy.value || !reauthorizationLicenseCodeDraft.value.trim()) return;
  reauthorizationBusy.value = true;
  reauthorizationMessage.value = '';
  reauthorizationMessageIsError.value = false;
  reauthorizationSucceeded.value = false;
  try {
    const result = await window.chatTranslator?.replaceClientLicense?.(reauthorizationLicenseCodeDraft.value);
    if (!result) throw new Error('重新授权 API 不可用');
    applyClientAuthorizationStatus(result.status);
    if (!result.ok) {
      reauthorizationMessage.value = result.reason || '重新授权失败';
      reauthorizationMessageIsError.value = true;
      return;
    }
    reauthorizationSucceeded.value = true;
    reauthorizationMessage.value = '已重新授权成功';
    accountMessage.value = '已重新授权成功';
    reauthorizationLicenseCodeDraft.value = '';
  } catch (error) {
    reauthorizationMessage.value = error instanceof Error ? error.message : '重新授权失败';
    reauthorizationMessageIsError.value = true;
  } finally {
    reauthorizationBusy.value = false;
  }
}

function appForPlatform(platform: Platform): RuntimeApp {
  return workspaceAppForPlatform(platform);
}

function isTelegramPlatform(platform: Platform): boolean {
  return platform === 'telegram-a' || platform === 'telegram-k';
}

function platformForApp(app: RuntimeApp): Platform {
  if (app === 'whatsapp') return 'whatsapp';
  if (app === 'signal') return 'signal';
  return 'telegram-k';
}

function rememberActiveProfile(profileId: string | null) {
  if (!profileId) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;
  lastActiveProfileIds.value = {
    ...lastActiveProfileIds.value,
    [appForPlatform(profile.platform)]: profile.id
  };
}

function firstOrderedProfileIdForApp(app: RuntimeApp) {
  const profilesById = new Map(profiles.value.map((profile) => [profile.id, profile]));
  return profileTabOrder.value.find((id) => {
    const profile = profilesById.get(id);
    return profile && appForPlatform(profile.platform) === app;
  }) ?? profiles.value.find((profile) => appForPlatform(profile.platform) === app)?.id ?? null;
}

function selectRuntimeApp(app: RuntimeApp) {
  const previousProfileId = activeProfileId.value;
  rememberActiveProfile(previousProfileId);
  currentApp.value = app;
  activePanel.value = 'session';
  const rememberedProfileId = lastActiveProfileIds.value[app];
  const nextActiveId = profiles.value.some((profile) => (
    profile.id === rememberedProfileId && appForPlatform(profile.platform) === app
  ))
    ? rememberedProfileId
    : firstOrderedProfileIdForApp(app);
  if (previousProfileId && previousProfileId !== nextActiveId && sensitiveSendPending.value?.profileId === previousProfileId) {
    void clearSensitiveSendPending(previousProfileId, '多开已切换，敏感信息确认已作废');
  }
  activeProfileId.value = nextActiveId;
  rememberActiveProfile(nextActiveId);
  if (nextActiveId) {
    void persistActiveProfile(nextActiveId);
    if (app === 'signal') void openSignalProfileInWorkspace(nextActiveId);
    void refreshUnreadCount(nextActiveId);
  }
  if (app !== 'signal') void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function selectRuntimeTab(profileId: string) {
  const previousProfileId = activeProfileId.value;
  if (previousProfileId && previousProfileId !== profileId && sensitiveSendPending.value?.profileId === previousProfileId) {
    void clearSensitiveSendPending(previousProfileId, '多开已切换，敏感信息确认已作废');
  }
  activeProfileId.value = profileId;
  rememberActiveProfile(profileId);
  void persistActiveProfile(profileId);
  void refreshUnreadCount(profileId);
  const profile = profiles.value.find((item) => item.id === profileId);
  if (profile?.platform === 'signal') {
    void openSignalProfileInWorkspace(profileId);
    return;
  }
  void hideInactiveSignalProfiles(null);
  void focusInjectedChineseComposer();
}

async function activateSignalProfileFromMain(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) return;
  const previousProfileId = activeProfileId.value;
  if (previousProfileId && previousProfileId !== profileId && sensitiveSendPending.value?.profileId === previousProfileId) {
    await clearSensitiveSendPending(previousProfileId, '多开已切换，敏感信息确认已作废');
  }
  signedIn.value = true;
  currentApp.value = 'signal';
  activePanel.value = 'session';
  activeProfileId.value = profileId;
  rememberActiveProfile(profileId);
  await persistActiveProfile(profileId);
  await openSignalProfileInWorkspace(profileId);
}

async function activateSignalNotificationFromMain(activation: SignalNotificationActivation) {
  if (!activation?.profileId || !activation?.activationId) return;
  if (signalNotificationActivationsInFlight.has(activation.activationId)) return;
  signalNotificationActivationsInFlight.add(activation.activationId);
  try {
    await activateSignalProfileFromMain(activation.profileId);
    await window.chatTranslator?.completeSignalNotificationActivation?.(
      activation.profileId,
      activation.activationId
    );
  } finally {
    signalNotificationActivationsInFlight.delete(activation.activationId);
  }
}

async function launchSignalProfile(profileId: string) {
  if (!window.chatTranslator?.launchSignalProfile) return false;
  try {
    const result = await window.chatTranslator.launchSignalProfile(profileId);
    const portText = result.wsPort ? `，控制端口 ${result.wsPort}` : '';
    const recoveredText = result.recovered ? '，已隔离损坏目录并重建' : '';
    setComposerStatus(profileId, result.pid ? `Signal 已启动，进程 ${result.pid}${portText}${recoveredText}` : `Signal 已启动${portText}${recoveredText}`);
    startSignalTranslationRuntime(profileId);
    startUnreadBridge(profileId);
    scheduleSignalWorkspaceSync();
    return true;
  } catch (error) {
    setComposerStatus(profileId, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function openSignalProfileInWorkspace(profileId: string): Promise<boolean> {
  const statusBeforeLaunch = composerStatus.value[profileId] ?? '';
  const launched = await launchSignalProfile(profileId);
  if (!launched) {
    if ((composerStatus.value[profileId] ?? '') === statusBeforeLaunch) {
      setComposerStatus(profileId, 'Signal 启动失败，请重试');
    }
    return false;
  }
  if (
    !signedIn.value ||
    activePanel.value !== 'session' ||
    currentApp.value !== 'signal' ||
    activeSignalProfile.value?.id !== profileId
  ) {
    setComposerStatus(profileId, 'Signal 工作区状态已变化，窗口未显示');
    return false;
  }
  await nextTick();
  const statusBeforePresentation = composerStatus.value[profileId] ?? '';
  const presented = await syncActiveSignalWorkspace(true);
  if (presented) {
    scheduleSignalWorkspaceSyncBurst();
  } else if ((composerStatus.value[profileId] ?? '') === statusBeforePresentation) {
    setComposerStatus(profileId, 'Signal 窗口显示失败，请点击“打开 Signal”重试');
  }
  return presented;
}

function launchActiveSignalProfile() {
  if (!activeSignalProfile.value) return;
  void openSignalProfileInWorkspace(activeSignalProfile.value.id);
}

function buildSignalShellPolishScript(theme: ThemeName) {
  const background = theme === 'pink'
    ? '#160711'
    : theme === 'murongPurple'
      ? '#171218'
      : theme === 'clearWaterBlue'
        ? '#eaf8ff'
      : '#08090d';
  return `
(() => {
  const id = 'df-signal-shell-polish';
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  const nextStyle = \`
    html, body, #app, .app-wrapper {
      background: ${background} !important;
      box-shadow: none !important;
    }
    body::before,
    body::after {
      box-shadow: none !important;
    }
  \`;
  if (style.textContent !== nextStyle) style.textContent = nextStyle;
  return true;
})()
`;
}

function signalWorkspaceBoundsFromDom(visible: boolean): SignalWorkspaceBounds | null {
  const host = document.querySelector<HTMLElement>('.runtime-web-main');
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: rect.left - signalWorkspaceBleedPx,
    y: rect.top - signalWorkspaceBleedPx,
    width: rect.width + signalWorkspaceBleedPx * 2,
    height: rect.height + signalWorkspaceBleedPx * 2,
    visible
  };
}

function scheduleSignalWorkspaceSync() {
  if (signalWorkspaceSyncTimer) clearTimeout(signalWorkspaceSyncTimer);
  signalWorkspaceSyncTimer = setTimeout(() => {
    void syncActiveSignalWorkspace();
  }, 80);
}

function scheduleSignalWorkspaceSyncBurst() {
  scheduleSignalWorkspaceSync();
  for (const delay of [100]) {
    window.setTimeout(() => scheduleSignalWorkspaceSync(), delay);
  }
}

async function syncActiveSignalWorkspace(present = false): Promise<boolean> {
  const translator = window.chatTranslator;
  if (!translator) return false;
  const activeSignal = activeSignalProfile.value;
  const shouldShowActive = Boolean(signedIn.value && activePanel.value === 'session' && activeSignal && !hasBlockingModal.value);

  if (!activeSignal || !shouldShowActive) {
    await hideInactiveSignalProfiles(null);
    return false;
  }

  const bounds = signalWorkspaceBoundsFromDom(true);
  if (!bounds) {
    if (present) setComposerStatus(activeSignal.id, 'Signal 工作区位置未就绪，窗口显示失败');
    return false;
  }

  try {
    let presented = true;
    let presentationMessage = '';
    if (present) {
      if (!translator.presentSignalWorkspace) {
        setComposerStatus(activeSignal.id, 'Signal 窗口显示接口不可用，请重启皮卡丘翻译器后重试');
        return false;
      }
      const result = await translator.presentSignalWorkspace(activeSignal.id, bounds);
      presented = result.presented;
      presentationMessage = result.message?.trim() ?? '';
    } else {
      if (!translator.setSignalWorkspaceBounds) return false;
      await translator.setSignalWorkspaceBounds(activeSignal.id, bounds);
    }

    if (translator.executeSignalScript) {
      void translator
        .executeSignalScript(activeSignal.id, buildSignalShellPolishScript(activeTheme.value))
        .catch(() => undefined);
    }

    if (present && presented) {
      setComposerStatus(activeSignal.id, presentationMessage || 'Signal 窗口已显示');
    } else if (!presented) {
      setComposerStatus(
        activeSignal.id,
        presentationMessage || 'Signal 窗口显示失败，请点击“打开 Signal”重试'
      );
    }
    return presented;
  } catch (error) {
    if (present) {
      const detail = error instanceof Error ? error.message.trim() : String(error).trim();
      setComposerStatus(activeSignal.id, detail ? `Signal 窗口显示失败：${detail}` : 'Signal 窗口显示失败，请点击“打开 Signal”重试');
    }
    return false;
  }
}

async function hideInactiveSignalProfiles(activeSignalId: string | null) {
  if (!window.chatTranslator?.hideSignalProfile) return;
  const signalProfiles = profiles.value.filter((profile) => profile.platform === 'signal');
  await Promise.all(
    signalProfiles
      .filter((profile) => profile.id !== activeSignalId)
      .map((profile) => window.chatTranslator?.hideSignalProfile?.(profile.id))
  );
}

function shuffleLockKeypad() {
  const digits = Array.from({ length: 10 }, (_, index) => index);
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [digits[index], digits[swapIndex]] = [digits[swapIndex], digits[index]];
  }
  lockKeypadDigits.value = digits;
}

function clearLockPinDrafts() {
  lockPinDraft.value = '';
  lockPinConfirmDraft.value = '';
}

function resetLockBlankClickCounter() {
  lockBlankClickCount = 0;
  if (lockBlankClickResetTimer) {
    clearTimeout(lockBlankClickResetTimer);
    lockBlankClickResetTimer = null;
  }
}

async function hideChatSurfacesForLock() {
  await hideInactiveSignalProfiles(null);
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

async function showLockScreen(mode: 'setup' | 'unlock' | 'reset') {
  if (sensitiveSendPending.value) await clearSensitiveSendPending(sensitiveSendPending.value.profileId);
  lockSetupDialogStage.value = null;
  lockNetworkGateBusy.value = false;
  lockNetworkGateReason.value = '';
  if (mode === 'unlock') lockPinChangeToken.value = '';
  lockScreenMode.value = mode;
  lockScreenVisible.value = true;
  try {
    await window.chatTranslator?.engageLockScreen?.();
  } catch {
    // Keep the renderer overlay fail-closed even if a child process had to be terminated.
  }
  lockKeypadVisible.value = mode !== 'unlock';
  lockPinError.value = '';
  clearLockPinDrafts();
  shuffleLockKeypad();
  resetLockBlankClickCounter();
  await hideChatSurfacesForLock();
}

async function initializeLockScreen() {
  const status = await window.chatTranslator?.getLockScreenStatus?.();
  if (!status) return;
  lockScreenStatus.value = status;
  lockGuideVisible.value = !status.enabled;
}

function applyRemoteGuardStatus(status: RemoteGuardStatus | null | undefined) {
  if (!status) return;
  remoteGuardStatus.value = status;
  if (!status.incidentLatched) {
    remoteGuardRecoveryPrompt.value = false;
    remoteGuardMessage.value = '';
    return;
  }
  remoteGuardPanelVisible.value = false;
  if (status.threatActive) {
    remoteGuardRecoveryPrompt.value = false;
    lockScreenVisible.value = false;
    lockSetupDialogStage.value = null;
    void hideChatSurfacesForLock();
  }
}

async function initializeRemoteGuard() {
  const status = await window.chatTranslator?.getRemoteGuardStatus?.();
  applyRemoteGuardStatus(status);
}

function openRemoteGuardPanel() {
  remoteGuardMessage.value = '';
  remoteGuardPanelVisible.value = true;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function closeRemoteGuardPanel() {
  remoteGuardPanelVisible.value = false;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

async function scanRemoteGuardNow() {
  if (remoteGuardScanning.value) return;
  remoteGuardScanning.value = true;
  remoteGuardMessage.value = '';
  try {
    const status = await window.chatTranslator?.scanRemoteGuardNow?.();
    applyRemoteGuardStatus(status);
  } catch {
    remoteGuardMessage.value = '本次巡检未完成，请稍后重试';
  } finally {
    remoteGuardScanning.value = false;
  }
}

async function beginRemoteGuardRecovery() {
  const status = remoteGuardStatus.value;
  if (!status?.incidentLatched || status.threatActive) return;
  if (!lockScreenStatus.value) await initializeLockScreen();
  if (lockScreenStatus.value?.enabled) {
    remoteGuardRecoveryPrompt.value = true;
    await showLockScreen('unlock');
    return;
  }
  const result = await window.chatTranslator?.acknowledgeRemoteGuardIncident?.();
  if (!result?.ok) {
    remoteGuardMessage.value = result?.reason || '工作区暂时不能恢复';
    applyRemoteGuardStatus(result?.status);
    return;
  }
  applyRemoteGuardStatus(result.status);
  scheduleSignalWorkspaceSyncBurst();
}

function dismissLockGuide() {
  lockGuideVisible.value = false;
  scheduleSignalWorkspaceSyncBurst();
}

function triggerLockNetworkWarningShake() {
  lockNetworkWarningShaking.value = false;
  if (lockNetworkWarningShakeTimer) clearTimeout(lockNetworkWarningShakeTimer);
  void nextTick(() => {
    lockNetworkWarningShaking.value = true;
    lockNetworkWarningShakeTimer = setTimeout(() => {
      lockNetworkWarningShaking.value = false;
      lockNetworkWarningShakeTimer = null;
    }, 560);
  });
}

async function checkLockSetupNetwork(): Promise<LockNetworkCheckResult> {
  const translator = window.chatTranslator as (typeof window.chatTranslator & {
    checkNetworkOffline?: () => Promise<LockNetworkCheckResult>;
  }) | undefined;
  if (!translator?.checkNetworkOffline) {
    return { offline: false, reason: '当前无法确认网络已断开，请稍后重试。' };
  }
  try {
    return await translator.checkNetworkOffline();
  } catch (error) {
    return {
      offline: false,
      reason: error instanceof Error ? error.message : '网络状态检测失败，请稍后重试。'
    };
  }
}

function closeLockSetupDialog() {
  if (lockNetworkGateBusy.value) return;
  lockSetupDialogStage.value = null;
  lockNetworkGateReason.value = '';
  lockNetworkWarningShaking.value = false;
  lockPinChangeToken.value = '';
  scheduleSignalWorkspaceSyncBurst();
}

function openLockSetupConfirmation() {
  dismissLockGuide();
  lockSetupIntent.value = 'setup';
  lockSetupDialogStage.value = 'confirm';
  lockNetworkGateReason.value = '';
  void hideChatSurfacesForLock();
}

async function enterLockCredentialSetup(intent: LockSetupIntent) {
  lockSetupIntent.value = intent;
  await showLockScreen(intent === 'setup' ? 'setup' : 'reset');
}

async function authorizeLockPinChange(intent: LockSetupIntent): Promise<LockPinChangeAuthorizationResult> {
  const translator = window.chatTranslator as unknown as {
    authorizeLockScreenPinChange?: (mode: LockSetupIntent) => Promise<LockPinChangeAuthorizationResult>;
  } | undefined;
  if (!translator?.authorizeLockScreenPinChange) {
    return {
      ok: false,
      reason: '锁屏密码设置授权不可用，请稍后重试。',
      status: lockScreenStatus.value ?? ({
        enabled: false,
        lockedUntil: 0,
        failedAttempts: 0,
        maxAttempts: 3,
        requiresUpgrade: false
      } as LockScreenStatus)
    };
  }
  try {
    return await translator.authorizeLockScreenPinChange(intent);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '锁屏密码设置授权失败，请稍后重试。',
      status: lockScreenStatus.value ?? ({
        enabled: false,
        lockedUntil: 0,
        failedAttempts: 0,
        maxAttempts: 3,
        requiresUpgrade: false
      } as LockScreenStatus)
    };
  }
}

async function runLockNetworkGate(intent: LockSetupIntent, shakeWhenBlocked = false) {
  if (lockNetworkGateBusy.value) return;
  lockSetupIntent.value = intent;
  lockNetworkGateBusy.value = true;
  lockNetworkGateReason.value = '';
  const result = await checkLockSetupNetwork();
  if (result.offline) {
    const authorization = await authorizeLockPinChange(intent);
    lockNetworkGateBusy.value = false;
    lockScreenStatus.value = authorization.status;
    if (!authorization.ok || !authorization.token) {
      lockSetupDialogStage.value = 'network';
      lockNetworkGateReason.value = authorization.reason || '锁屏密码设置授权失败，请重试。';
      if (shakeWhenBlocked) triggerLockNetworkWarningShake();
      return;
    }
    lockPinChangeToken.value = authorization.token;
    await enterLockCredentialSetup(intent);
    return;
  }
  lockNetworkGateBusy.value = false;
  lockSetupDialogStage.value = 'network';
  lockNetworkGateReason.value = result.reason || '';
  if (shakeWhenBlocked) triggerLockNetworkWarningShake();
}

function handleLockButtonClick() {
  dismissLockGuide();
  if (lockScreenStatus.value?.enabled) {
    void showLockScreen('unlock');
    return;
  }
  openLockSetupConfirmation();
}

function confirmLockSetupStart() {
  void runLockNetworkGate('setup');
}

function continueLockNetworkGate() {
  void runLockNetworkGate(lockSetupIntent.value, true);
}

function beginLockResetFlow(intent: 'reset' | 'upgrade' = 'reset') {
  lockSetupIntent.value = intent;
  void runLockNetworkGate(intent);
}

function handleLockBlankPointerDown() {
  if (lockScreenMode.value !== 'unlock') return;
  if (lockBlankClickResetTimer) clearTimeout(lockBlankClickResetTimer);
  lockBlankClickCount += 1;
  lockBlankClickResetTimer = setTimeout(() => {
    resetLockBlankClickCounter();
  }, lockBlankClickWindowMs);

  if (lockResetAvailable.value) {
    if (lockBlankClickCount >= lockBlankResetThreshold) {
      resetLockBlankClickCounter();
      beginLockResetFlow('reset');
    }
    return;
  }

  if (!lockKeypadVisible.value && lockBlankClickCount >= lockBlankShowKeypadThreshold) {
    lockKeypadVisible.value = true;
    lockPinError.value = '';
    clearLockPinDrafts();
    shuffleLockKeypad();
    resetLockBlankClickCounter();
  }
}

function lockKeypadPress(digit: number) {
  const enteringConfirmation = lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength;
  const value = enteringConfirmation ? lockPinConfirmDraft.value : lockPinDraft.value;
  const expectedLength = enteringConfirmation ? lockScreenCredentialLength : lockActiveCredentialLength.value;
  if (value.length >= expectedLength || value.length >= lockScreenDigitLength) return;
  if (enteringConfirmation) lockPinConfirmDraft.value += String(digit);
  else lockPinDraft.value += String(digit);
  lockPinError.value = '';
}

function lockKeypadBackspace() {
  if (lockIsSettingPin.value && lockPinConfirmDraft.value.length > 0) {
    lockPinConfirmDraft.value = lockPinConfirmDraft.value.slice(0, -1);
    lockPinError.value = '';
    return;
  }
  lockPinDraft.value = lockPinDraft.value.slice(0, -1);
  lockPinError.value = '';
}

function resetLockKeypadInput() {
  clearLockPinDrafts();
  lockPinError.value = '';
  shuffleLockKeypad();
}

async function confirmLockPinSetup() {
  if (lockPinDraft.value.length !== lockScreenCredentialLength || lockPinConfirmDraft.value.length !== lockScreenCredentialLength) {
    lockPinError.value = '请分别输入并确认 8 位数字锁屏密码';
    return;
  }
  if (lockPinDraft.value !== lockPinConfirmDraft.value) {
    lockPinError.value = '两次锁屏密码不一致';
    clearLockPinDrafts();
    shuffleLockKeypad();
    return;
  }
  if (!lockPinChangeToken.value) {
    lockPinError.value = '锁屏密码设置授权已失效，请重新完成断网检测';
    return;
  }
  const translator = window.chatTranslator as unknown as {
    setLockScreenPin?: (pin: string, token: string) => Promise<LockScreenSetPinResult>;
  } | undefined;
  const token = lockPinChangeToken.value;
  lockPinChangeToken.value = '';
  const result = await translator?.setLockScreenPin?.(lockPinDraft.value, token);
  if (!result?.ok) {
    lockPinError.value = result?.reason || '设置锁屏密码失败';
    clearLockPinDrafts();
    shuffleLockKeypad();
    void runLockNetworkGate(lockSetupIntent.value);
    return;
  }
  lockScreenStatus.value = result.status;
  lockGuideVisible.value = false;
  lockScreenVisible.value = false;
  lockKeypadVisible.value = false;
  clearLockPinDrafts();
  scheduleSignalWorkspaceSyncBurst();
}

async function confirmLockPinUnlock() {
  const expectedLength = lockUnlockCredentialLength.value;
  if (lockPinDraft.value.length !== expectedLength) {
    lockPinError.value = expectedLength === lockScreenDigitLength
      ? '请输入旧版 6 位数字密码'
      : lockUnlockCredentialFormat.value === 'digits6-letters2'
        ? '请输入旧版 6 位数字 + 2 位字母的锁屏密码'
        : '请输入 8 位数字锁屏密码';
    return;
  }
  const result = await window.chatTranslator?.unlockLockScreen?.(lockPinDraft.value);
  if (!result?.ok) {
    lockScreenStatus.value = result?.status ?? lockScreenStatus.value;
    lockPinError.value = result?.reason || '解锁失败';
    if ((result?.status.failedAttempts ?? 0) >= (result?.status.maxAttempts ?? 3)) {
      lockPinError.value = '请重置锁屏密码';
      lockKeypadVisible.value = false;
    }
    clearLockPinDrafts();
    shuffleLockKeypad();
    return;
  }
  lockScreenStatus.value = result.status;
  if (lockStatusRequiresUpgrade(result.status)) {
    clearLockPinDrafts();
    lockKeypadVisible.value = false;
    lockPinError.value = '旧版密码已验证，请断网升级为 8 位数字密码';
    beginLockResetFlow('upgrade');
    return;
  }
  lockScreenVisible.value = false;
  lockKeypadVisible.value = false;
  clearLockPinDrafts();
  scheduleSignalWorkspaceSyncBurst();
}

function appendLockLetter(letter: string) {
  if (lockIsSettingPin.value || lockUnlockCredentialFormat.value !== 'digits6-letters2') return;
  const normalized = letter.toUpperCase();
  if (!/^[A-Z]$/.test(normalized)) return;
  const enteringConfirmation = lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength;
  const value = enteringConfirmation ? lockPinConfirmDraft.value : lockPinDraft.value;
  const expectedLength = enteringConfirmation ? lockScreenCredentialLength : lockActiveCredentialLength.value;
  if (expectedLength <= lockScreenDigitLength || value.length < lockScreenDigitLength || value.length >= expectedLength) return;
  if (enteringConfirmation) lockPinConfirmDraft.value += normalized;
  else lockPinDraft.value += normalized;
  lockPinError.value = '';
}

function appendLockPhysicalDigit(digit: string) {
  if (!/^\d$/.test(digit)) return;
  if (!lockIsSettingPin.value && lockUnlockCredentialFormat.value === 'digits6-letters2') return;
  const enteringConfirmation = lockIsSettingPin.value && lockPinDraft.value.length >= lockScreenCredentialLength;
  const value = enteringConfirmation ? lockPinConfirmDraft.value : lockPinDraft.value;
  const expectedLength = enteringConfirmation ? lockScreenCredentialLength : lockActiveCredentialLength.value;
  if (value.length < lockScreenDigitLength || value.length >= expectedLength) return;
  if (enteringConfirmation) lockPinConfirmDraft.value += digit;
  else lockPinDraft.value += digit;
  lockPinError.value = '';
}

function handleLockScreenKeydown(event: KeyboardEvent) {
  if (!lockShowPinControls.value) return;
  if (event.key === 'Backspace') {
    lockKeypadBackspace();
    return;
  }
  if (event.key === 'Delete') {
    resetLockKeypadInput();
    return;
  }
  if (event.key === 'Enter') {
    if (lockIsSettingPin.value) void confirmLockPinSetup();
    else void confirmLockPinUnlock();
    return;
  }
  if (/^\d$/.test(event.key)) appendLockPhysicalDigit(event.key);
  else if (/^[a-z]$/i.test(event.key)) appendLockLetter(event.key);
}

function nextProfileName(app: RuntimeApp) {
  const prefix = app === 'whatsapp' ? 'WS' : app === 'telegram' ? 'TG' : 'SG';
  const next = profiles.value.filter((profile) => appForPlatform(profile.platform) === app).length + 1;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

function openCreateProfileDialog() {
  isCreatingProfile.value = false;
  createProfileError.value = '';
  newProfileName.value = nextProfileName(currentApp.value);
  newProfileGroup.value = '';
  createDialogOpen.value = true;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function closeCreateProfileDialog() {
  createDialogOpen.value = false;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function cancelCloseProfileDialog() {
  closeTargetProfile.value = null;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function cancelRenameProfileDialog() {
  renameTargetProfile.value = null;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

async function confirmCreateProfile() {
  if (isCreatingProfile.value) return;
  const platform = platformForApp(currentApp.value);
  const profileName = newProfileName.value.trim() || nextProfileName(currentApp.value);
  isCreatingProfile.value = true;
  createProfileError.value = '';
  try {
    if (!window.chatTranslator) {
      throw new Error('Electron persistence API is unavailable.');
    }

    const profileGroup = newProfileGroup.value.trim();
    if (!profileGroup) {
      createProfileError.value = '请输入自定义分组';
      return;
    }
    const profile = await window.chatTranslator.createProfile(platform, profileName, profileGroup);
    const config = await window.chatTranslator.getConfig();
    if (!config.profiles.some((item) => item.id === profile.id)) {
      throw new Error(`Profile ${profile.name} was not persisted.`);
    }
    applyConfig({ ...config, activeProfileId: profile.id });
    activePanel.value = 'session';
    closeCreateProfileDialog();
    if (profile.platform === 'signal') {
      await launchSignalProfile(profile.id);
      await nextTick();
      scheduleSignalWorkspaceSyncBurst();
    }
  } catch (error) {
    createProfileError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isCreatingProfile.value = false;
  }
}

function requestCloseProfile(profile: RuntimeTab) {
  closeTargetProfile.value = profile;
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

function requestRenameProfile(profile: RuntimeTab) {
  renameTargetProfile.value = profile;
  renameProfileName.value = profile.name;
  renameProfileGroup.value = profile.group || '本组';
  renameProfileError.value = '';
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
}

async function confirmRenameProfile() {
  if (!renameTargetProfile.value || isRenamingProfile.value) return;
  const target = renameTargetProfile.value;
  const nextName = renameProfileName.value.trim();
  const nextGroup = renameProfileGroup.value.trim();
  if (!nextName) {
    renameProfileError.value = '请输入自定义名称';
    return;
  }
  if (!nextGroup) {
    renameProfileError.value = '请输入自定义分组';
    return;
  }
  if (nextName === target.name && nextGroup === target.group) {
    cancelRenameProfileDialog();
    return;
  }
  isRenamingProfile.value = true;
  renameProfileError.value = '';
  try {
    if (!window.chatTranslator?.renameProfile) {
      throw new Error('Electron rename API is unavailable.');
    }
    const config = await window.chatTranslator.renameProfile(target.id, nextName, nextGroup);
    applyConfig(config);
    activeProfileId.value = target.id;
    currentApp.value = appForPlatform(target.platform);
    cancelRenameProfileDialog();
  } catch (error) {
    renameProfileError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isRenamingProfile.value = false;
  }
}

async function confirmCloseProfile() {
  if (!closeTargetProfile.value || !window.chatTranslator) return;
  const targetId = closeTargetProfile.value.id;
  if (sensitiveSendPending.value?.profileId === targetId) await clearSensitiveSendPending(targetId);
  const selectedApp = currentApp.value;
  profiles.value = profiles.value.filter((profile) => profile.id !== targetId);
  if (activeProfileId.value === targetId) {
    activeProfileId.value = currentAppProfiles.value[0]?.id ?? null;
  }
  cancelCloseProfileDialog();
  await nextTick();
  const config = await window.chatTranslator.removeProfile(targetId);
  clearUnreadState(targetId);
  clearTranslationRuntimeCache(targetId);
  applyConfig(config);
  currentApp.value = selectedApp;
  const rememberedProfileId = lastActiveProfileIds.value[selectedApp];
  if (!activeProfileId.value || appForPlatform(activeProfile.value?.platform ?? 'whatsapp') !== selectedApp) {
    activeProfileId.value = profiles.value.some((profile) => (
      profile.id === rememberedProfileId && appForPlatform(profile.platform) === selectedApp
    ))
      ? rememberedProfileId
      : firstOrderedProfileIdForApp(selectedApp);
  }
  rememberActiveProfile(activeProfileId.value);
  if (activeProfileId.value) void persistActiveProfile(activeProfileId.value);
}

async function persistWorkspaceConfig() {
  workspaceConfigSaveQueue = workspaceConfigSaveQueue
    .catch(() => undefined)
    .then(async () => {
      if (!window.chatTranslator || !configState.value) return;
      const saved = await window.chatTranslator.saveConfig({
        ...configState.value,
        profiles: profiles.value,
        activeProfileId: activeProfileId.value,
        profileTabOrder: profileTabOrder.value,
        lastActiveProfileIds: lastActiveProfileIds.value,
        activeTheme: activeTheme.value,
        eyeCareTranslationEnabled: eyeCareTranslationEnabled.value
      });
      configState.value = saved;
    });
  await workspaceConfigSaveQueue;
}

async function persistProfileTabOrder(nextOrder: string[]) {
  profileTabOrder.value = sanitizeProfileTabOrder(profiles.value, nextOrder);
  await persistWorkspaceConfig();
}

async function persistActiveProfile(profileId: string) {
  rememberActiveProfile(profileId);
  await persistWorkspaceConfig();
}

function handleRuntimeTabClick(profileId: string) {
  if (suppressTabClickProfileId.value === profileId) return;
  selectRuntimeTab(profileId);
}

function handleTabDragStart(event: DragEvent, profileId: string) {
  draggingProfileId.value = profileId;
  tabDropTargetId.value = null;
  event.dataTransfer?.setData('text/plain', profileId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function handleTabDragOver(event: DragEvent, targetId: string) {
  if (!draggingProfileId.value || draggingProfileId.value === targetId) {
    tabDropTargetId.value = null;
    return;
  }
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  tabDropTargetId.value = targetId;
  tabDropAfter.value = Boolean(rect && event.clientX >= rect.left + rect.width / 2);
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleTabDragEnd() {
  draggingProfileId.value = null;
  tabDropTargetId.value = null;
  tabDropAfter.value = false;
}

function handleTabDrop(event: DragEvent, targetId: string) {
  event.preventDefault();
  const sourceId = draggingProfileId.value;
  const insertAfterTarget = tabDropTargetId.value === targetId && tabDropAfter.value;
  draggingProfileId.value = null;
  tabDropTargetId.value = null;
  tabDropAfter.value = false;
  if (!sourceId || sourceId === targetId) return;

  const appProfileIds = workspaceTabs.value.map((profile) => profile.id);
  if (!appProfileIds.includes(sourceId) || !appProfileIds.includes(targetId)) return;
  const orderedAppIds = appProfileIds.filter((id) => id !== sourceId);
  const targetIndex = orderedAppIds.indexOf(targetId);
  const insertionIndex = targetIndex < 0
    ? orderedAppIds.length
    : targetIndex + (insertAfterTarget ? 1 : 0);
  orderedAppIds.splice(insertionIndex, 0, sourceId);

  const profilesById = new Map(profiles.value.map((profile) => [profile.id, profile]));
  const appQueue = [...orderedAppIds];
  const nextOrder = profileTabOrder.value.map((id) => {
    const profile = profilesById.get(id);
    if (!profile || appForPlatform(profile.platform) !== currentApp.value) return id;
    return appQueue.shift() ?? id;
  });
  suppressTabClickProfileId.value = sourceId;
  window.setTimeout(() => {
    if (suppressTabClickProfileId.value === sourceId) suppressTabClickProfileId.value = null;
  }, 0);
  void persistProfileTabOrder(nextOrder);
}

function reloadActiveWebview() {
  const profileId = activeProfileId.value;
  if (!profileId) return;
  const webview = document.querySelector<Electron.WebviewTag>(`webview[data-profile-id="${profileId}"]`);
  webview?.reload();
}

function getActiveWebview() {
  const profileId = activeProfileId.value;
  if (!profileId) return null;
  return document.querySelector<Electron.WebviewTag>(`webview[data-profile-id="${profileId}"]`);
}

async function refreshActiveWindow() {
  if (refreshingWindow.value) return;
  const profile = activeProfile.value;
  if (!profile) return;
  if (sensitiveSendPending.value?.profileId === profile.id) {
    await clearSensitiveSendPending(profile.id, '窗口已刷新，敏感信息确认已作废');
  }
  refreshingWindow.value = true;
  if (refreshWindowCooldownTimer) clearTimeout(refreshWindowCooldownTimer);
  refreshWindowCooldownTimer = setTimeout(() => {
    refreshingWindow.value = false;
    refreshWindowCooldownTimer = null;
  }, refreshWindowCooldownMs);

  if (profile.platform === 'signal') {
    setComposerStatus(profile.id, 'Signal 窗口刷新中');
    const presented = await openSignalProfileInWorkspace(profile.id);
    if (presented) {
      setComposerStatus(profile.id, 'Signal 窗口已刷新');
    }
    return;
  }

  const webview = getActiveWebview();
  if (!webview) {
    setComposerStatus(profile.id, '当前窗口未就绪，无法刷新');
    return;
  }
  setComposerStatus(profile.id, '窗口刷新中');
  webview.reload();
}

function setComposerStatus(profileId: string, status: string) {
  composerStatus.value = { ...composerStatus.value, [profileId]: status };
}

function clearTranslationRuntimeCache(profileId: string) {
  webRuntimeControllers.get(profileId)?.abort();
  webRuntimeControllers.delete(profileId);
  webRuntimeGenerations.set(profileId, (webRuntimeGenerations.get(profileId) ?? 0) + 1);
  for (const key of Array.from(messageTranslationAttempts.keys())) {
    if (key.startsWith(`${profileId}:`)) messageTranslationAttempts.delete(key);
  }
  for (const key of Array.from(failedMessageTranslationUntil.keys())) {
    if (key.startsWith(`${profileId}:`)) failedMessageTranslationUntil.delete(key);
  }
  clearSmartReplyStateForProfile(profileId);
  const smartReplyUiTimer = smartReplyUiRefreshTimers.get(profileId);
  if (smartReplyUiTimer) clearTimeout(smartReplyUiTimer);
  smartReplyUiRefreshTimers.delete(profileId);
  for (const key of Array.from(composerTranslationSources.keys())) {
    if (key === profileId || key.startsWith(`${profileId}::`)) composerTranslationSources.delete(key);
  }
  for (const key of Array.from(composerTranslationLocks.keys())) {
    if (key === profileId || key.startsWith(`${profileId}::`)) composerTranslationLocks.delete(key);
  }
  for (const key of Array.from(composerSentStatusTimers.keys())) {
    if (key !== profileId && !key.startsWith(`${profileId}::`)) continue;
    const sentStatusTimer = composerSentStatusTimers.get(key);
    if (sentStatusTimer) clearTimeout(sentStatusTimer);
    composerSentStatusTimers.delete(key);
  }
  const webProbeTimer = webComposerProbeIntervals.get(profileId);
  if (webProbeTimer) clearInterval(webProbeTimer);
  webComposerProbeIntervals.delete(profileId);
  webComposerDiagnosticLogCache.delete(profileId);
  webviewPreloadGuardStatus.delete(profileId);
  webComposerDiagnosticStatus.value = { ...webComposerDiagnosticStatus.value, [profileId]: '' };
  cancelQueuedTranslationsForProfile(profileId);
  for (const key of Array.from(translatingMessages)) {
    if (key.startsWith(`${profileId}:`)) translatingMessages.delete(key);
  }
  for (const key of Array.from(unreadPeekTranslationPromises.keys())) {
    if (key.startsWith(`${profileId}:`)) unreadPeekTranslationPromises.delete(key);
  }
  clearTranslatedMessageMarks(profileId);
  for (const key of Array.from(translationMemoryCaches.keys())) {
    if (key === profileId || key.startsWith(`${profileId}:`)) translationMemoryCaches.delete(key);
  }
  rebuildTranslationHotCacheStats();
  for (const key of Array.from(scopedTranslationCacheLoadPromises.keys())) {
    if (key.startsWith(`${profileId}:`)) scopedTranslationCacheLoadPromises.delete(key);
  }
  for (const key of Array.from(scopedTranslationCachePreloaded)) {
    if (key.startsWith(`${profileId}:`)) scopedTranslationCachePreloaded.delete(key);
  }
  for (const key of Array.from(scopedTranslationCacheWarmupFailedAt.keys())) {
    if (key.startsWith(`${profileId}:`)) scopedTranslationCacheWarmupFailedAt.delete(key);
  }
  for (const key of Array.from(scopedTranslationCacheOffsets.keys())) {
    if (key.startsWith(`${profileId}:`)) scopedTranslationCacheOffsets.delete(key);
  }
  for (const key of Array.from(scopedTranslationCacheExhausted)) {
    if (key.startsWith(`${profileId}:`)) scopedTranslationCacheExhausted.delete(key);
  }
  const historyTimer = historyRenderPrefetchTimers.get(profileId);
  if (historyTimer) clearTimeout(historyTimer);
  historyRenderPrefetchTimers.delete(profileId);
  historyRenderPrefetchInFlight.delete(profileId);
  historyBackfillLastQueuedAt.delete(profileId);
  translationCacheOffsets.delete(profileId);
  translationCacheLoadPromises.delete(profileId);
  translationCacheExhausted.delete(profileId);
  translationCachePreloaded.delete(profileId);
  translationCacheWarmupFailedAt.delete(profileId);
}

function setSignalDiagnosticStatus(profileId: string, status: string) {
  signalDiagnosticStatus.value = { ...signalDiagnosticStatus.value, [profileId]: status };
  const now = Date.now();
  const last = signalDiagnosticLogCache.get(profileId);
  const isProbeStatus = status.startsWith('Signal 探针') || status.startsWith('Signal 扫描');
  if (last?.status === status && (isProbeStatus ? now - last.at < 5000 : now - last.at < 1200)) return;
  signalDiagnosticLogCache.set(profileId, { status, at: now });
  void window.chatTranslator?.appendSignalDebugLog?.({ profileId, type: 'diagnostic-status', status });
}

function clearTranslatedMessageMarks(profileId: string) {
  for (const key of Array.from(translatedMessages)) {
    if (key.startsWith(`${profileId}:`)) translatedMessages.delete(key);
  }
}

async function focusInjectedChineseComposer() {
  if (!activeProfileId.value) return;
  await executeProfileScript(activeProfileId.value, buildInjectedComposerScript('focus'));
}

function scheduleTypingProxy(profileId: string) {
  const existingTimer = typingProxyTimers.get(profileId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    if (activeProfileId.value !== profileId) return;
    setComposerStatus(profileId, '');
    void clearNativeComposerIfProxy(profileId);
  }, 1000);
  typingProxyTimers.set(profileId, timer);
}

function warmSignalComposerTranslation(profileId: string, text: string) {
  if (!window.chatTranslator || activeProfileId.value !== profileId) return;
  const sourceText = text.trim();
  if (sourceText.length < 2 || !/[\u4e00-\u9fff]/.test(sourceText)) return;
  const conversationSignature = normalizeComposerConversationSignature(composerConversationSignatures.get(profileId) || '');
  const existing = signalComposerPretranslations.get(profileId);
  if (existing?.text === sourceText && existing.conversationSignature === conversationSignature && Date.now() - existing.at < 60000) return;

  const requestId = createTranslationRequestId('composer-pretranslate', profileId);
  const entry = {
    text: sourceText,
    requestId,
    conversationSignature,
    promise: Promise.resolve(''),
    result: undefined as string | undefined,
    at: Date.now()
  };
  entry.promise = window.chatTranslator
    .translate({
      text: sourceText,
      from: 'Chinese',
      to: 'English',
      reason: 'composer-pretranslate',
      profileId,
      platform: 'signal',
      sourceHash: hashText(sourceText),
      requestId,
      contactId: conversationSignature,
      userId: deepSeekUserId(profileId)
    })
    .then((result) => {
      entry.result = result;
      void window.chatTranslator?.appendSignalDebugLog?.({
        profileId,
        type: 'composer-pretranslated',
        sourceLength: sourceText.length,
        translatedLength: result.length
      });
      return result;
    })
    .catch((error) => {
      if (signalComposerPretranslations.get(profileId) === entry) {
        signalComposerPretranslations.delete(profileId);
      }
      void window.chatTranslator?.appendSignalDebugLog?.({
        profileId,
        type: 'composer-pretranslate-failed',
        message: error instanceof Error ? error.message : String(error)
      });
      return '';
    });
  signalComposerPretranslations.set(profileId, entry);
}

async function getSignalComposerPretranslation(profileId: string, text: string) {
  const sourceText = text.trim();
  const existing = signalComposerPretranslations.get(profileId);
  const conversationSignature = normalizeComposerConversationSignature(composerConversationSignatures.get(profileId) || '');
  if (existing?.text !== sourceText || existing.conversationSignature !== conversationSignature) return null;
  const result = existing.result || await existing.promise;
  return result ? { text: result, requestId: existing.requestId } : null;
}

function isTranslationTaskKnown(dedupeKey: string) {
  return queuedTranslationKeys.has(dedupeKey) || runningTranslationKeys.has(dedupeKey);
}

function scheduleTranslationQueuePump(delayMs = 0) {
  if (translationQueueTimer) clearTimeout(translationQueueTimer);
  translationQueueTimer = window.setTimeout(() => {
    translationQueueTimer = null;
    pumpTranslationQueue();
  }, delayMs);
}

function enqueueTranslationTask(task: Omit<QueuedTranslationTask, 'createdAt' | 'attempts'> & { attempts?: number }) {
  if (isTranslationTaskKnown(task.dedupeKey)) return false;
  queuedTranslationKeys.add(task.dedupeKey);
  translationQueue.push({
    ...task,
    abortController: task.abortController ?? new AbortController(),
    createdAt: Date.now(),
    attempts: task.attempts ?? 0
  });
  scheduleTranslationQueuePump();
  return true;
}

function finishRunningTranslationTask(task: QueuedTranslationTask) {
  if (runningTranslationTasks.get(task.dedupeKey) !== task) return;
  runningTranslationKeys.delete(task.dedupeKey);
  runningTranslationTasks.delete(task.dedupeKey);
  runningTranslationCount = Math.max(0, runningTranslationCount - 1);
  const profileCount = runningTranslationProfiles.get(task.profileId) ?? 0;
  if (profileCount <= 1) {
    runningTranslationProfiles.delete(task.profileId);
  } else {
    runningTranslationProfiles.set(task.profileId, profileCount - 1);
  }
}

function canRunTranslationTask(task: QueuedTranslationTask) {
  const profileTasks = Array.from(runningTranslationTasks.values()).filter((runningTask) => runningTask.profileId === task.profileId);
  if (task.reason === 'composer-enter') {
    const interactiveTasks = profileTasks.filter((runningTask) => runningTask.reason === 'composer-enter');
    return interactiveTasks.length < translationQueueInteractiveProfileConcurrency;
  }
  const runningBackgroundCount = Array.from(runningTranslationTasks.values())
    .filter((runningTask) => runningTask.reason !== 'composer-enter')
    .length;
  if (task.reason === 'manual-refresh') {
    return runningBackgroundCount < translationQueueGlobalConcurrency - 2 &&
      profileTasks.filter(item => item.reason === 'manual-refresh').length < 1;
  }
  if (runningBackgroundCount >= translationQueueGlobalConcurrency - translationQueueInteractiveReservedConcurrency) return false;
  if (task.reason === 'history-backfill') {
    if (runningBackgroundCount >= translationQueueGlobalConcurrency - translationQueueInteractiveReservedConcurrency - translationQueueRealtimeReservedConcurrency) return false;
    const historyTasks = profileTasks.filter((runningTask) => runningTask.reason === 'history-backfill');
    return historyTasks.length < translationQueueHistoryBackfillProfileConcurrency;
  }
  const realtimeTasks = profileTasks.filter((runningTask) => runningTask.reason === 'visible-message');
  return realtimeTasks.length < translationQueuePerProfileConcurrency;
}

function scheduleTranslationTaskRetry(task: QueuedTranslationTask, error: unknown) {
  if (task.cancelled) {
    task.onCancelled?.();
    return;
  }
  if (task.attempts + 1 >= task.maxAttempts || !profiles.value.some((profile) => profile.id === task.profileId)) {
    task.onFinalFailure?.(error);
    return;
  }

  const retryDelay = translationQueueRetryDelays[Math.min(task.attempts, translationQueueRetryDelays.length - 1)] ?? 30000;
  queuedTranslationKeys.add(task.dedupeKey);
  const retryTimer = window.setTimeout(() => {
    translationQueueRetryTimers.delete(task.dedupeKey);
    translationQueueRetryTasks.delete(task.dedupeKey);
    if (!profiles.value.some((profile) => profile.id === task.profileId)) {
      queuedTranslationKeys.delete(task.dedupeKey);
      task.onFinalFailure?.(error);
      return;
    }
    translationQueue.push({
      ...task,
      abortController: new AbortController(),
      attempts: task.attempts + 1,
      createdAt: Date.now()
    });
    scheduleTranslationQueuePump();
  }, retryDelay);
  translationQueueRetryTimers.set(task.dedupeKey, retryTimer);
  translationQueueRetryTasks.set(task.dedupeKey, task);
}

function pumpTranslationQueue() {
  if (!translationQueue.length || runningTranslationCount >= translationQueueGlobalConcurrency) return;

  const priority = (task: QueuedTranslationTask) => task.reason === 'history-backfill' && Date.now() - task.createdAt > 5_000 ? 30 : task.priority;
  translationQueue.sort((left, right) => priority(left) - priority(right) || left.createdAt - right.createdAt);
  while (translationQueue.length && runningTranslationCount < translationQueueGlobalConcurrency) {
    const nextIndex = translationQueue.findIndex(canRunTranslationTask);
    if (nextIndex < 0) break;

    const [task] = translationQueue.splice(nextIndex, 1);
    queuedTranslationKeys.delete(task.dedupeKey);
    runningTranslationKeys.add(task.dedupeKey);
    runningTranslationTasks.set(task.dedupeKey, task);
    runningTranslationCount += 1;
    runningTranslationProfiles.set(task.profileId, (runningTranslationProfiles.get(task.profileId) ?? 0) + 1);

    void withTranslationDeadline(
      task.run(task.abortController?.signal),
      120_000,
      task.abortController?.signal,
      () => task.abortController?.abort()
    )
      .then(() => {
        finishRunningTranslationTask(task);
        scheduleTranslationQueuePump();
      })
      .catch((error) => {
        finishRunningTranslationTask(task);
        scheduleTranslationTaskRetry(task, error);
        scheduleTranslationQueuePump();
      });
  }
}

function translationDedupeKeyBelongsToProfile(dedupeKey: string, profileId: string) {
  return (
    dedupeKey.startsWith(`composer:${profileId}:`) ||
    dedupeKey.startsWith(`message:${profileId}:`) ||
    dedupeKey.startsWith(`message-source:${profileId}:`)
  );
}

function cancelQueuedTranslationsForProfile(profileId: string) {
  for (let index = translationQueue.length - 1; index >= 0; index -= 1) {
    if (translationQueue[index].profileId !== profileId) continue;
    cancelTranslationTask(translationQueue[index]);
    queuedTranslationKeys.delete(translationQueue[index].dedupeKey);
    translationQueue.splice(index, 1);
  }
  for (const [dedupeKey, timer] of Array.from(translationQueueRetryTimers.entries())) {
    if (!translationDedupeKeyBelongsToProfile(dedupeKey, profileId)) continue;
    clearTimeout(timer);
    const task = translationQueueRetryTasks.get(dedupeKey);
    if (task) cancelTranslationTask(task);
    translationQueueRetryTasks.delete(dedupeKey);
    translationQueueRetryTimers.delete(dedupeKey);
    queuedTranslationKeys.delete(dedupeKey);
  }
  for (const task of runningTranslationTasks.values()) {
    if (task.profileId === profileId) cancelTranslationTask(task);
  }
}

function cancelTranslationTask(task: QueuedTranslationTask) {
  task.cancelled = true;
  task.abortController?.abort();
  task.onCancelled?.();
}

function replaceMessageTranslationTask(profileId: string, key: string, sourceHash: string) {
  const messageKey = `message:${profileId}:${key}:manual`;
  const sourceKey = `message-source:${profileId}:${sourceHash}`;
  const matches = (task: QueuedTranslationTask) => task.profileId === profileId &&
    (task.dedupeKey === messageKey || task.dedupeKey === sourceKey);
  for (let index = translationQueue.length - 1; index >= 0; index--) {
    const task = translationQueue[index];
    if (!matches(task)) continue;
    cancelTranslationTask(task);
    queuedTranslationKeys.delete(task.dedupeKey);
    translationQueue.splice(index, 1);
  }
  for (const dedupeKey of [messageKey, sourceKey]) {
    const timer = translationQueueRetryTimers.get(dedupeKey);
    if (timer) clearTimeout(timer);
    const task = translationQueueRetryTasks.get(dedupeKey);
    if (task) cancelTranslationTask(task);
    translationQueueRetryTasks.delete(dedupeKey);
    translationQueueRetryTimers.delete(dedupeKey);
    queuedTranslationKeys.delete(dedupeKey);
  }
  for (const task of runningTranslationTasks.values()) {
    if (!matches(task)) continue;
    cancelTranslationTask(task);
    runningTranslationKeys.delete(task.dedupeKey);
  }
  translatingMessages.delete(`${profileId}:${key}`);
  translatingMessages.delete(`${profileId}:${sourceHash}`);
}

function cancelQueuedComposerTranslationsForProfile(profileId: string) {
  for (let index = translationQueue.length - 1; index >= 0; index -= 1) {
    const task = translationQueue[index];
    if (task.profileId !== profileId || task.reason !== 'composer-enter') continue;
    queuedTranslationKeys.delete(task.dedupeKey);
    translationQueue.splice(index, 1);
  }
  for (const [dedupeKey, timer] of Array.from(translationQueueRetryTimers.entries())) {
    if (!dedupeKey.startsWith(`composer:${profileId}:`)) continue;
    clearTimeout(timer);
    translationQueueRetryTimers.delete(dedupeKey);
    queuedTranslationKeys.delete(dedupeKey);
  }
}

function clearComposerTransactionState(profileId: string, conversationSignature = '') {
  const stateKey = composerStateKey(profileId, conversationSignature);
  const previousDraft = translatedDrafts.value[stateKey] || '';
  composerTranslationSources.delete(stateKey);
  composerTranslationLocks.delete(stateKey);
  translatedDrafts.value = { ...translatedDrafts.value, [stateKey]: '' };
  if (composerFeedbackStates.value[profileId] === 'typing' || composerFeedbackStates.value[profileId] === 'translating' || composerFeedbackStates.value[profileId] === 'ready') {
    setComposerFeedbackState(profileId, '');
  }
  if (previousDraft) {
    void executeProfileScript(profileId, buildComposerScript('clearProxy', previousDraft, true, true)).catch(() => undefined);
  }
  void setInjectedComposerState(profileId, { draft: '', status: '', translated: '', reviewStatus: 'hidden', reviewText: '' }).catch(() => undefined);
}

function clearComposerVisibleState(profileId: string) {
  if (composerFeedbackStates.value[profileId] === 'typing' || composerFeedbackStates.value[profileId] === 'translating' || composerFeedbackStates.value[profileId] === 'ready') {
    setComposerFeedbackState(profileId, '');
  }
  setComposerStatus(profileId, '');
  void setInjectedComposerState(profileId, { draft: '', status: '', translated: '', reviewStatus: 'hidden', reviewText: '' }).catch(() => undefined);
}

function withComposerTranslateTimeout<T>(promise: Promise<T>, requestId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`composer translation timeout: ${requestId}`)), composerTranslateTimeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function enqueueComposerTranslation(
  profile: ChatProfile,
  sourceText: string,
  conversationSignature = '',
  clientRequestId = '',
  composerKind: ComposerKind = 'default',
  signalReviewEnabled = true
) {
  const text = normalizeComposerSourceText(sourceText);
  if (isDirectSendHttpUrl(text)) return false;
  const isSignalProfile = profile.platform === 'signal';
  const shouldReview = isSignalProfile && signalReviewEnabled;
  const sourceIsChinese = hasChineseText(text);
  const sourceIsEnglish = hasEnglishText(text) && !sourceIsChinese;
  if (!text || (!sourceIsChinese && !(shouldReview && sourceIsEnglish)) || !window.chatTranslator) return false;
  const normalizedSignature = normalizeComposerConversationSignature(conversationSignature || composerConversationSignatures.get(profile.id) || '');
  const stateKey = composerStateKey(profile.id, normalizedSignature);
  const requestId = clientRequestId || createComposerRequestId(profile.id);
  const dedupeKey = `composer:${stateKey}:${requestId}`;
  const existingLock = composerTranslationLocks.get(stateKey);
  if (existingLock && existingLock.text === text && existingLock.composerKind === composerKind && (Date.now() - existingLock.at < 30000 || isTranslationTaskKnown(existingLock.dedupeKey))) {
    setComposerFeedbackState(profile.id, 'translating');
    const pendingStatus = shouldReview
      ? (sourceIsChinese ? '翻译并回译中' : '回译中')
      : '翻译中';
    setComposerStatus(profile.id, pendingStatus);
    void setInjectedComposerState(profile.id, { status: pendingStatus });
    return false;
  }
  composerTranslationSources.set(stateKey, { text, at: Date.now(), conversationSignature: normalizedSignature, requestId, composerKind });
  composerTranslationLocks.set(stateKey, { text, dedupeKey, at: Date.now(), conversationSignature: normalizedSignature, requestId, composerKind });
  const enqueued = enqueueTranslationTask({
    dedupeKey,
    profileId: profile.id,
    priority: translationQueuePriority['composer-enter'],
    reason: 'composer-enter',
    maxAttempts: 1,
    run: async () => {
      const currentProfile = profiles.value.find((item) => item.id === profile.id);
      if (!currentProfile || !window.chatTranslator) return;
      setComposerFeedbackState(profile.id, 'translating');
      const currentShouldReview = currentProfile.platform === 'signal' && signalReviewEnabled;
      const pendingStatus = currentShouldReview
        ? (sourceIsChinese ? '翻译并回译中' : '回译中')
        : '翻译中';
      setComposerStatus(profile.id, pendingStatus);
      await setInjectedComposerState(profile.id, { status: pendingStatus });
      const pretranslated = sourceIsChinese && currentProfile.platform === 'signal'
        ? await getSignalComposerPretranslation(profile.id, text)
        : null;
      const effectiveRequestId = pretranslated?.requestId || requestId;
      const englishText = sourceIsChinese
        ? pretranslated?.text || (await withComposerTranslateTimeout(window.chatTranslator.translate({
          text,
          from: 'Chinese',
          to: 'English',
          reason: 'composer-enter',
          profileId: currentProfile.id,
          profileName: currentProfile.name,
          platform: currentProfile.platform,
          sourceHash: hashText(text),
          requestId,
          contactId: normalizedSignature,
          userId: deepSeekUserId(currentProfile.id)
        }), requestId))
        : text;
      if (!englishText) throw new Error('empty translation');
      if (currentProfile.platform === 'signal' && normalizeComposerConversationSignature(composerConversationSignatures.get(profile.id) || '') !== normalizedSignature) {
        composerTranslationLocks.delete(stateKey);
        composerTranslationSources.delete(stateKey);
        return;
      }
      if(isTelegramPlatform(currentProfile.platform)){
        const livePeer=await executeProfileScript<string>(profile.id,`(${readTelegramConversationIdFromDom.toString()})()`).catch(()=> '');
        if(livePeer!==normalizedSignature){
          composerTranslationLocks.delete(stateKey);composerTranslationSources.delete(stateKey);
          setComposerFeedbackState(profile.id,'');setComposerStatus(profile.id,'会话已切换，未填入翻译结果');return;
        }
      }
      if (activePanel.value !== 'session' || activeProfileId.value !== profile.id) {
        composerTranslationLocks.delete(stateKey);
        composerTranslationSources.delete(stateKey);
        return;
      }
      const currentComposerText = normalizeComposerSourceText(String((await executeProfileScript<string>(
        profile.id,
        buildNativeComposerTextScript()
      ).catch(() => '')) || ''));
      const requestStillCurrent = currentProfile.platform !== 'signal'
        ? await executeProfileScript<boolean>(
          profile.id,
          buildComposerRequestMatchScript(requestId)
        ).catch(() => false)
        : true;
      const isTelegramProfile = isTelegramPlatform(currentProfile.platform);
      const signalComposerWasReplaced = currentProfile.platform === 'signal' && Boolean(currentComposerText) && currentComposerText !== text;
      const webComposerWasReplaced = currentProfile.platform !== 'signal' &&
        !isTelegramProfile &&
        !requestStillCurrent &&
        currentComposerText !== text;
      if (signalComposerWasReplaced || webComposerWasReplaced) {
        composerTranslationLocks.delete(stateKey);
        composerTranslationSources.delete(stateKey);
        if (composerFeedbackStates.value[profile.id] === 'translating') setComposerFeedbackState(profile.id, '');
        if (composerStatus.value[profile.id] === '翻译中' || composerStatus.value[profile.id] === '翻译排队中') setComposerStatus(profile.id, '');
        return;
      }
      if (sourceIsChinese && currentProfile.platform === 'signal') {
        void window.chatTranslator.appendSignalDebugLog?.({
          profileId: profile.id,
          type: 'composer-translated',
          sourceLength: text.length,
          translatedLength: englishText.length,
          pretranslated: Boolean(pretranslated)
        });
      }
      translatedDrafts.value = { ...translatedDrafts.value, [stateKey]: englishText };
      if (sourceIsChinese) {
        await writeNativeComposer(profile.id, englishText, { instant: true, composerKind, requestId: effectiveRequestId });
      }
      if (!currentShouldReview) {
        const stateApplied = await setInjectedComposerState(profile.id, {
          translated: englishText,
          requestId: effectiveRequestId,
          conversationSignature: normalizedSignature,
          composerKind,
          reviewStatus: 'hidden',
          reviewText: ''
        });
        if (composerKind === 'telegram-media-caption' && !stateApplied) {
          throw new Error('telegram media caption ready state target missing');
        }
        const focused = await focusWebviewNativeComposer(profile.id, composerKind, effectiveRequestId);
        if (composerKind === 'telegram-media-caption' && !focused) {
          throw new Error('telegram media caption focus restore failed');
        }
        composerTranslationLocks.delete(stateKey);
        setComposerFeedbackState(profile.id, 'ready');
        setComposerStatus(profile.id, '翻译完成，请再次按回车发送');
        return;
      }
      await setInjectedComposerState(profile.id, {
        translated: '',
        requestId: '',
        reviewStatus: 'loading',
        reviewText: ''
      });
      const reviewRequestId = createTranslationRequestId('composer-review', profile.id);
      let reviewText: string;
      try {
        reviewText = await withComposerTranslateTimeout(window.chatTranslator.translate({
          text: englishText,
          from: 'English',
          to: 'Chinese',
          reason: 'composer-review',
          profileId: currentProfile.id,
          profileName: currentProfile.name,
          platform: currentProfile.platform,
          sourceHash: hashText(englishText),
          requestId: reviewRequestId,
          contactId: normalizedSignature,
          userId: deepSeekUserId(currentProfile.id)
        }), reviewRequestId);
      } catch (error) {
        throw new Error(`composer review failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!reviewText || !hasChineseText(reviewText)) throw new Error('composer review failed: empty Chinese review');
      if (activePanel.value !== 'session' || activeProfileId.value !== profile.id) return;
      const liveEnglishText = normalizeComposerSourceText(String((await executeProfileScript<string>(profile.id, buildNativeComposerTextScript()).catch(() => '')) || ''));
      const liveSignature = normalizeComposerConversationSignature(composerConversationSignatures.get(profile.id) || '');
      if (liveEnglishText !== normalizeComposerSourceText(englishText) || (normalizedSignature && liveSignature !== normalizedSignature)) {
        composerTranslationLocks.delete(stateKey);
        composerTranslationSources.delete(stateKey);
        return;
      }
      await setInjectedComposerState(profile.id, {
        translated: englishText,
        requestId: reviewRequestId,
        conversationSignature: normalizedSignature,
        reviewStatus: 'ready',
        reviewText
      });
      await focusWebviewNativeComposer(profile.id);
      composerTranslationLocks.delete(stateKey);
      setComposerFeedbackState(profile.id, 'ready');
      setComposerStatus(profile.id, '回译完成，核对后回车发送');
    },
    onFinalFailure: (error) => {
      diagnosticEvent('composer:failed', { profileId: profile.id, platform: profile.platform, errorCode: /timeout/i.test(String(error)) ? 'ui-timeout' : 'composer-failed' });
      const message = error instanceof Error ? error.message : String(error);
      void window.chatTranslator?.appendSignalDebugLog?.({
        profileId: profile.id,
        profileName: profile.name,
        platform: profile.platform,
        type: 'composer-translate-failed',
        requestId,
        textLength: text.length,
        message
      });
      console.error(error);
      composerTranslationLocks.delete(stateKey);
      composerTranslationSources.delete(stateKey);
      setComposerFeedbackState(profile.id, '');
      const reviewFailed = /composer review failed/i.test(message);
      const failedStatus = reviewFailed
        ? '回译失败，请再次按回车重试'
        : /composer write|composer-not-found|composer-auto-discovery|native composer write/i.test(message)
        ? '翻译成功，但输入框写入失败'
        : '翻译失败：检查 DeepSeek 密钥或网络';
      setComposerStatus(profile.id, failedStatus);
      void setInjectedComposerState(profile.id, {
        draft: '',
        translated: '',
        requestId: '',
        status: failedStatus,
        reviewStatus: reviewFailed ? 'error' : 'hidden',
        reviewText: ''
      });
    }
  });

  if (enqueued) {
    setComposerFeedbackState(profile.id, 'translating');
    const queuedStatus = shouldReview
      ? (sourceIsChinese ? '翻译并回译排队中' : '回译排队中')
      : '翻译排队中';
    setComposerStatus(profile.id, queuedStatus);
    void setInjectedComposerState(profile.id, { status: queuedStatus });
  } else if (composerTranslationLocks.get(stateKey)?.dedupeKey === dedupeKey && !isTranslationTaskKnown(dedupeKey)) {
    composerTranslationLocks.delete(stateKey);
  }
  return enqueued;
}

function buildGuardedMessageTranslationScript(key: string, attempt: number, script: string) {
  return `(() => { if (window.__dfMessageTranslationAttempts?.[${JSON.stringify(key)}] !== ${attempt}) return false; return (${script}); })()`;
}

function enqueueMessageTranslationTask(profile: ChatProfile, candidate: MessageCandidate, reason: TranslationQueueReason) {
  if(conversationExportBusy.value&&conversationExportProfileId.value===profile.id)return false;
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return false;
  const sourceText = normalizeCacheText(candidate.text || '');
  if (!sourceText || !window.chatTranslator) return false;

  const cacheKey = `${profile.id}:${candidate.key}`;
  const sourceHash = hashText(sourceText);
  const sourceCacheKey = `${profile.id}:${sourceHash}`;
  const dedupeKey = reason === 'manual-refresh' ? `message:${cacheKey}:manual` : `message-source:${sourceCacheKey}`;
  if (reason === 'manual-refresh') replaceMessageTranslationTask(profile.id, candidate.key, sourceHash);
  if (translatingMessages.has(cacheKey) || translatingMessages.has(sourceCacheKey) || isTranslationTaskKnown(dedupeKey)) return false;
  if (reason !== 'manual-refresh' && (translatedMessages.has(cacheKey) || translatedMessages.has(sourceCacheKey))) return false;
  if (reason !== 'manual-refresh' && (failedMessageTranslationUntil.get(sourceCacheKey) ?? 0) > Date.now()) return false;

  const attempt = Symbol(cacheKey);
  const pageAttempt = ++webMessageAttemptSequence;
  const generation = webRuntimeGenerations.get(profile.id) ?? 0;
  const isCurrent = () => messageTranslationAttempts.get(cacheKey) === attempt &&
    (webRuntimeGenerations.get(profile.id) ?? 0) === generation;
  const releaseMessageState = () => {
    if (!isCurrent()) return;
    translatingMessages.delete(cacheKey);
    translatingMessages.delete(sourceCacheKey);
    messageTranslationAttempts.delete(cacheKey);
  };
  const setManualRefreshState = async (state: 'processing' | 'idle', error = '') => {
    if (reason !== 'manual-refresh') return;
    if (!isCurrent()) return;
    const currentProfile = profiles.value.find((item) => item.id === profile.id);
    if (!currentProfile || currentProfile.platform === 'signal') return;
    const runtime = getRuntimeScriptExecutor(currentProfile);
    if (!runtime) return;
    await runtime.execute<boolean>(buildGuardedMessageTranslationScript(candidate.key, pageAttempt, buildWebBubbleRefreshStateScript(candidate.key, state, error))).catch(() => false);
  };

  const enqueued = enqueueTranslationTask({
    dedupeKey,
    profileId: profile.id,
    priority: translationQueuePriority[reason],
    reason,
    maxAttempts: reason === 'history-backfill' ? 1 : 2,
    run: async (signal) => {
      const assertCurrent = () => {
        if (signal?.aborted || !isCurrent()) throw new Error('Translation task cancelled');
      };
      assertCurrent();
      const currentProfile = profiles.value.find((item) => item.id === profile.id);
      if (!currentProfile || !window.chatTranslator) {
        translatingMessages.delete(cacheKey);
        translatingMessages.delete(sourceCacheKey);
        return;
      }
      const runtime = getRuntimeScriptExecutor(currentProfile);
      if (!runtime) throw new Error('runtime unavailable');
      const registered = await runtime.execute<boolean>(`(() => {
        const key = ${JSON.stringify(candidate.key)}, attempt = ${pageAttempt};
        const attempts = window.__dfMessageTranslationAttempts ||= Object.create(null);
        if ((attempts[key] || 0) > attempt) return false;
        attempts[key] = attempt;
        while (Object.keys(attempts).length > 1500) delete attempts[Object.keys(attempts)[0]];
        return true;
      })()`);
      if (!registered) throw new Error('Translation task replaced');
      assertCurrent();
      // Outgoing bubbles are intentionally back-translated instead of reusing the original Chinese draft.
      await setManualRefreshState('processing');
      assertCurrent();
      const requestId = createTranslationRequestId(reason, currentProfile.id);
      const cancelRequest = () => { void window.chatTranslator?.cancelTranslation?.(requestId).catch(() => undefined); };
      signal?.addEventListener('abort', cancelRequest, { once: true });
      let translated: string;
      try {
        translated = await withTranslationDeadline(window.chatTranslator.translate({
        text: sourceText,
        from: 'English',
        to: 'Chinese',
        reason,
        profileId: currentProfile.id,
        profileName: currentProfile.name,
        platform: currentProfile.platform,
        sourceHash,
        requestId,
        userId: deepSeekUserId(currentProfile.id),
        messageKey: candidate.key,
        contactId: candidate.contactId,
        contactIdType: candidate.contactIdType,
        contactTitle: candidate.contactTitle,
        direction: candidate.direction,
        messagePart: candidate.messagePart
        }), 90_000, signal, cancelRequest);
      } finally {
        signal?.removeEventListener('abort', cancelRequest);
      }
      assertCurrent();
      if (!isUsefulMessageTranslation(sourceText, translated)) {
        diagnosticEvent('bubble:invalid-result', { profileId: profile.id, platform: profile.platform, textLength: sourceText.length, translatedLength: translated.length });
        throw new Error('bad translation');
      }
      setCachedTranslation(currentProfile, { ...candidate, text: sourceText }, translated);
      const injected = await runtime.execute<boolean>(
        buildGuardedMessageTranslationScript(candidate.key, pageAttempt,
          buildMessageTranslationInjectScript(candidate.key, translated, appForPlatform(currentProfile.platform), sourceText, true))
      );
      assertCurrent();
      diagnosticEvent('bubble:inject', { profileId: profile.id, platform: profile.platform, injected });
      if (!injected) throw new Error('message translation inject failed');
      await setManualRefreshState('idle');
      if (currentProfile.platform === 'signal' && reason !== 'history-backfill') {
        setComposerStatus(profile.id, `Signal 已翻译：${sourceText.slice(0, 40)}`);
      }
      translatedMessages.add(cacheKey);
      translatedMessages.add(sourceCacheKey);
      failedMessageTranslationUntil.delete(sourceCacheKey);
      releaseMessageState();
    },
    onFinalFailure: (error) => {
      if (!isCurrent()) return;
      diagnosticEvent('bubble:failed', { profileId: profile.id, platform: profile.platform, reason, errorCode: /inject/i.test(String(error)) ? 'inject-failed' : /bad translation/i.test(String(error)) ? 'invalid-result' : 'request-failed' });
      if (reason !== 'history-backfill') setComposerStatus(profile.id, '气泡翻译失败');
      failedMessageTranslationUntil.set(sourceCacheKey, Date.now() + 60_000);
      for (const [key, until] of failedMessageTranslationUntil) {
        if (until <= Date.now() || failedMessageTranslationUntil.size > 1500) failedMessageTranslationUntil.delete(key);
      }
      void setManualRefreshState('idle', '翻译失败，请点击重试');
      releaseMessageState();
    },
    onCancelled: () => {
      if (!isCurrent()) return;
      void setManualRefreshState('idle');
      releaseMessageState();
    }
  });

  if (enqueued) {
    messageTranslationAttempts.set(cacheKey, attempt);
    translatingMessages.add(cacheKey);
    translatingMessages.add(sourceCacheKey);
  }
  return enqueued;
}

function nonEnglishContactKey(profileId: string, candidate: Partial<MessageCandidate>) {
  return `${profileId}:${candidate.contactIdType || 'unknown'}:${candidate.contactId || candidate.contactTitle || 'unknown-contact'}`;
}

async function registerNonEnglishContactMarkers(profile: ChatProfile, candidates: MessageCandidate[]) {
  if (!window.chatTranslator?.markNonEnglishContact) return;
  for (const candidate of candidates) {
    if (!candidate.nonEnglishContactMarker || candidate.direction !== 'incoming' || candidate.messagePart !== 'body') continue;
    const key = nonEnglishContactKey(profile.id, candidate);
    if (nonEnglishContactKeys.has(key)) continue;
    nonEnglishContactKeys.add(key);
    await window.chatTranslator.markNonEnglishContact({
      profileId: profile.id,
      platform: profile.platform,
      contactId: candidate.contactId,
      contactIdType: candidate.contactIdType,
      contactTitle: candidate.contactTitle,
      contactRemark: candidate.contactRemark
    });
  }
}

function candidateViewportRatio(candidate: MessageCandidate) {
  if (!Number.isFinite(candidate.rectBottom) || !Number.isFinite(candidate.viewportHeight)) return 1;
  const viewportHeight = Number(candidate.viewportHeight);
  if (viewportHeight <= 0) return 1;
  return Number(candidate.rectBottom) / viewportHeight;
}

function isBaseLatestVisibleCandidate(candidate: MessageCandidate) {
  if (candidate.scanBand && candidate.scanBand !== 'visible') return false;
  if (candidate.nearConversationEnd === false) return false;
  return true;
}

function isLatestWhatsAppMessageCandidate(candidate: MessageCandidate) {
  // At the conversation end, every visible bubble needs live translation.
  // Upper-screen bubbles cannot rely on history backfill, which runs away
  // from the end. Smart-reply panels must not create a gap between queues.
  return isBaseLatestVisibleCandidate(candidate);
}

function isLatestTelegramMessageCandidate(candidate: MessageCandidate) {
  if (!isBaseLatestVisibleCandidate(candidate)) return false;
  return candidateViewportRatio(candidate) >= 0.56;
}

function isLatestSignalMessageCandidate(candidate: MessageCandidate) {
  if (!isBaseLatestVisibleCandidate(candidate)) return false;
  return candidateViewportRatio(candidate) >= 0.42;
}

function isLatestVisibleMessageCandidate(app: RuntimeApp, candidate: MessageCandidate) {
  if (app === 'whatsapp') return isLatestWhatsAppMessageCandidate(candidate);
  if (app === 'telegram') return isLatestTelegramMessageCandidate(candidate);
  return isLatestSignalMessageCandidate(candidate);
}

function historyBackfillBandRank(candidate: MessageCandidate) {
  if (candidate.scanBand === 'visible') return 0;
  if (candidate.scanBand === 'above') return 1;
  return 2;
}

function isProfileActiveForHistoryBackfill(profile: ChatProfile) {
  return activePanel.value === 'session' && activeProfileId.value === profile.id && currentApp.value === appForPlatform(profile.platform);
}

function isHistoryBackfillCandidate(
  profile: ChatProfile,
  candidate: MessageCandidate,
  profileCacheWarmupReady: boolean
) {
  if (!profileCacheWarmupReady || !isTranslationCacheWarmupReady(profile.id)) return false;
  if (!isProfileActiveForHistoryBackfill(profile)) return false;
  if (candidate.nearConversationEnd !== false) return false;
  if (isLatestVisibleMessageCandidate(appForPlatform(profile.platform), candidate)) return false;
  if (!isScopedTranslationCacheWarmupReady(profile.id, candidate)) return false;

  const sourceText = normalizeCacheText(candidate.text || '');
  if (!sourceText || !/[A-Za-z]{2,}/.test(sourceText) || hasChineseText(sourceText)) return false;
  if (getCachedTranslation(profile.id, sourceText, candidate)) return false;

  const cacheKey = `${profile.id}:${candidate.key}`;
  const sourceCacheKey = `${profile.id}:${hashText(sourceText)}`;
  const dedupeKey = `message-source:${sourceCacheKey}`;
  if (translatingMessages.has(cacheKey) || translatingMessages.has(sourceCacheKey)) return false;
  if (translatedMessages.has(cacheKey) || translatedMessages.has(sourceCacheKey)) return false;
  if (isTranslationTaskKnown(dedupeKey)) return false;
  return true;
}

function enqueueHistoryBackfillTranslations(
  profile: ChatProfile,
  candidates: MessageCandidate[],
  profileCacheWarmupReady: boolean
) {
  const now = Date.now();
  const lastQueuedAt = historyBackfillLastQueuedAt.get(profile.id) ?? 0;
  if (now - lastQueuedAt < historyBackfillCooldownMs) return 0;

  const seenSourceHashes = new Set<string>();
  const eligibleCandidates = candidates
    .filter((candidate) => isHistoryBackfillCandidate(profile, candidate, profileCacheWarmupReady))
    .sort((left, right) =>
      historyBackfillBandRank(left) - historyBackfillBandRank(right) ||
      (left.rectTop ?? 0) - (right.rectTop ?? 0)
    );

  let queuedCount = 0;
  for (const candidate of eligibleCandidates) {
    const sourceHash = hashText(candidate.text);
    if (seenSourceHashes.has(sourceHash)) continue;
    seenSourceHashes.add(sourceHash);
    if (enqueueMessageTranslationTask(profile, candidate, 'history-backfill')) queuedCount += 1;
    if (queuedCount >= historyBackfillBatchSize) break;
  }

  if (queuedCount) historyBackfillLastQueuedAt.set(profile.id, now);
  return queuedCount;
}

type UnreadPeekPayload = {
  requestId?: string;
  title?: string;
  unreadCount?: number;
  contactId?: string;
  contactIdType?: MessageCandidate['contactIdType'];
  contactKey?: string;
  items?: Array<{ id?: string; text?: string }>;
};

async function translateUnreadPeekText(profile: ChatProfile, payload: UnreadPeekPayload, item: { id?: string; text?: string }) {
  if (!window.chatTranslator) return '';
  const sourceText = normalizeCacheText(item.text || '');
  if (!sourceText || !/[A-Za-z]{2,}/.test(sourceText) || hasChineseText(sourceText)) return '';
  const title = normalizeCacheText(payload.title || 'unknown-unread-contact') || 'unknown-unread-contact';
  const payloadContactId = normalizeCacheText(payload.contactId || '');
  const payloadContactIdType = payload.contactIdType || (payloadContactId ? 'platform' : 'title');
  const sourceHash = hashText(sourceText);
  const candidate: MessageCandidate = {
    key: `unread-peek-${payload.requestId || 'request'}-${item.id || sourceHash}`,
    text: sourceText,
    contactId: payloadContactId || hashText(title),
    contactIdType: payloadContactIdType,
    contactTitle: title,
    contactRemark: title,
    contactKey: normalizeCacheText(payload.contactKey || '') || `unread-peek-${payloadContactIdType}-${payloadContactId || hashText(title)}`,
    direction: 'incoming',
    messagePart: 'body'
  };

  const cachedTranslation = getCachedTranslation(profile.id, sourceText, candidate);
  if (cachedTranslation) return cachedTranslation;

  const promiseKey = `${profile.id}:${sourceHash}`;
  const existingPromise = unreadPeekTranslationPromises.get(promiseKey);
  if (existingPromise) return existingPromise;

  const promise = window.chatTranslator
    .translate({
      text: sourceText,
      from: 'English',
      to: 'Chinese',
      reason: 'unread-peek',
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform,
      sourceHash,
      requestId: createTranslationRequestId('unread-peek', profile.id),
      userId: deepSeekUserId(profile.id),
      messageKey: candidate.key,
      contactId: candidate.contactId,
      contactIdType: candidate.contactIdType,
      contactTitle: candidate.contactTitle,
      direction: candidate.direction,
      messagePart: candidate.messagePart
    })
    .then((translated) => {
      if (!isUsefulMessageTranslation(sourceText, translated)) return '';
      setCachedTranslation(profile, candidate, translated);
      return translated;
    })
    .finally(() => {
      if (unreadPeekTranslationPromises.get(promiseKey) === promise) unreadPeekTranslationPromises.delete(promiseKey);
    });
  unreadPeekTranslationPromises.set(promiseKey, promise);
  return promise;
}

async function handleUnreadPeekEvent(profile: ChatProfile, text: string) {
  let payload: UnreadPeekPayload;
  try {
    payload = JSON.parse(text) as UnreadPeekPayload;
  } catch {
    return;
  }
  const requestId = normalizeCacheText(payload.requestId || '');
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems
    .map((item, index) => ({
      id: normalizeCacheText(item.id || `item-${index}`),
      text: normalizeCacheText(item.text || '')
    }))
    .filter((item) => item.text && /[A-Za-z]{2,}/.test(item.text) && !hasChineseText(item.text))
    .slice(0, unreadPeekMaxItems);
  if (!requestId || !items.length) return;

  const translatedItems = await Promise.all(items.map(async (item) => ({
    id: item.id,
    text: item.text,
    translatedText: await translateUnreadPeekText(profile, payload, item).catch(() => '')
  })));

  await executeProfileScript(
    profile.id,
    buildUnreadPeekResultScript({
      requestId,
      title: payload.title || '',
      unreadCount: payload.unreadCount || 0,
      items: translatedItems
    })
  ).catch(() => undefined);
  setComposerStatus(profile.id, `未读偷看已翻译 ${translatedItems.filter((item) => item.translatedText).length} 条`);
}

function sensitiveContactDisplay(conversationSignature: string) {
  return conversationSignature.split('::')[0].split('|')[0].trim().slice(0, 120) || '未命名联系人';
}

async function clearSensitiveSendPending(profileId?: string, status = '') {
  const pending = sensitiveSendPending.value;
  const targetProfileId = profileId || pending?.profileId;
  if (sensitiveSendExpiryTimer) {
    clearTimeout(sensitiveSendExpiryTimer);
    sensitiveSendExpiryTimer = null;
  }
  if (!profileId || pending?.profileId === profileId) sensitiveSendPending.value = null;
  if (targetProfileId) {
    await setInjectedComposerState(targetProfileId, {
      sensitiveToken: '',
      sensitiveText: '',
      sensitiveReview: ''
    }).catch(() => undefined);
    if (status) setComposerStatus(targetProfileId, status);
  }
}

async function prepareSensitiveSendFromComposer(profile: ChatProfile, text: string, conversationSignature: string) {
  if (!window.chatTranslator || sensitiveSendPreparationProfiles.has(profile.id)) return;
  const normalizedSignature = normalizeComposerConversationSignature(
    conversationSignature || composerConversationSignatures.get(profile.id) || ''
  );
  sensitiveSendPreparationProfiles.add(profile.id);
  diagnosticEvent('sensitive:prepare', { profileId: profile.id, platform: profile.platform, textLength: text.length });
  setComposerStatus(profile.id, '正在进行发送前可信确认');
  try {
    const result = await window.chatTranslator.prepareSensitiveSend({
      profileId: profile.id,
      platform: profile.platform,
      conversationSignature: normalizedSignature,
      text
    });
    if (!result.ok || !result.token || !result.kind || !result.expiresAt) {
      diagnosticEvent('sensitive:prepare-rejected', { profileId: profile.id, platform: profile.platform });
      await clearSensitiveSendPending(profile.id, result.reason || '敏感信息确认失败，已阻止发送');
      return;
    }
    sensitiveSendPending.value = {
      token: result.token,
      profileId: profile.id,
      platform: profile.platform,
      profileName: profile.name,
      conversationSignature: normalizedSignature,
      contactDisplay: sensitiveContactDisplay(normalizedSignature),
      text,
      kind: result.kind,
      network: result.network,
      expiresAt: result.expiresAt
    };
    await nextTick();
    if (profile.platform === 'signal') await syncActiveSignalWorkspace(true);
    const approvalInstalled = await setInjectedComposerState(profile.id, {
      sensitiveToken: result.token,
      sensitiveText: text,
      conversationSignature: normalizedSignature,
      sensitiveReview: ''
    });
    if (!approvalInstalled) {
      diagnosticEvent('sensitive:approval-install-failed', { profileId: profile.id, platform: profile.platform });
      await clearSensitiveSendPending(profile.id, '输入框尚未就绪，请重新确认');
      return;
    }
    if (profile.platform !== 'signal') await focusWebviewNativeComposer(profile.id);
    diagnosticEvent('sensitive:approval-installed', { profileId: profile.id, platform: profile.platform });
    setComposerStatus(profile.id, '敏感信息已锁定，再次回车后发送');
    if (sensitiveSendExpiryTimer) clearTimeout(sensitiveSendExpiryTimer);
    sensitiveSendExpiryTimer = setTimeout(() => {
      void clearSensitiveSendPending(profile.id, '敏感信息确认已过期，请重新确认');
    }, Math.max(0, result.expiresAt - Date.now()));
  } catch (error) {
    await clearSensitiveSendPending(profile.id, error instanceof Error ? error.message : '敏感信息确认失败，已阻止发送');
  } finally {
    sensitiveSendPreparationProfiles.delete(profile.id);
  }
}

async function sendConfirmedSensitiveText(profile: ChatProfile, text: string, conversationSignature: string, token: string) {
  diagnosticEvent('sensitive:second-enter', { profileId: profile.id, platform: profile.platform, textLength: text.length });
  const pending = sensitiveSendPending.value;
  const normalizedSignature = normalizeComposerConversationSignature(
    conversationSignature || composerConversationSignatures.get(profile.id) || ''
  );
  if (
    !window.chatTranslator ||
    !pending ||
    pending.profileId !== profile.id ||
    pending.token !== token ||
    pending.text !== text ||
    pending.conversationSignature !== normalizedSignature
  ) {
    diagnosticEvent('sensitive:binding-mismatch', { profileId: profile.id, platform: profile.platform });
    await clearSensitiveSendPending(profile.id, '敏感信息、联系人或多开已变化，已阻止发送');
    return;
  }

  const authorization = await window.chatTranslator.authorizeSensitiveSend({
    token,
    profileId: profile.id,
    platform: profile.platform,
    conversationSignature: normalizedSignature,
    text,
    network: pending.network
  });
  if (!authorization.ok) {
    diagnosticEvent('sensitive:authorization-rejected', { profileId: profile.id, platform: profile.platform });
    await clearSensitiveSendPending(profile.id, authorization.reason || '敏感信息发送校验失败，已阻止发送');
    return;
  }

  const sendIntegrityNotBefore = Date.now();
  const outgoingKeysBeforeSend = profile.platform === 'signal'
    ? new Set<string>()
    : await snapshotOutgoingMessageKeys(profile).catch(() => new Set<string>());
  setComposerStatus(profile.id, '发送中');
  const sendResult = await sendNativeComposer(profile.id, text, true);
  diagnosticEvent('sensitive:send-result', { profileId: profile.id, platform: profile.platform, status: sendResult?.ok ? 'accepted' : 'rejected', reason: sendResult?.reason || '', version: sendResult?.method || '' });
  await clearSensitiveSendPending(profile.id);
  if (!sendResult?.ok) {
    setComposerStatus(profile.id, '平台未接受发送，请重新确认');
    return;
  }
  void verifySentMessageIntegrity(profile, text, outgoingKeysBeforeSend, sendIntegrityNotBefore);
  setComposerFeedbackState(profile.id, 'sent');
  setComposerStatus(profile.id, '');
  const stateKey = `sensitive:${profile.id}:${token}`;
  const timer = setTimeout(() => {
    composerSentStatusTimers.delete(stateKey);
    if (composerFeedbackStates.value[profile.id] === 'sent') setComposerFeedbackState(profile.id, '');
  }, 2000);
  composerSentStatusTimers.set(stateKey, timer);
}

async function handleInjectedComposerEvent(
  profileId: string,
  action: string,
  text: string,
  conversationSignature = '',
  requestId = '',
  composerKind: ComposerKind = 'default',
  signalReviewEnabled = true
) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile || !window.chatTranslator) return;
  if (action === 'whatsapp-long-message-expanded') {
    if (appForPlatform(profile.platform) !== 'whatsapp') return;
    window.setTimeout(() => void scanAndTranslateMessages(profileId), 120);
    return;
  }
  if (action === 'enter-only-hint') {
    const previousTimer = enterOnlyHintTimers.get(profileId);
    if (previousTimer) clearTimeout(previousTimer);
    setComposerStatus(profileId, '请按回车键发送');
    await setInjectedComposerState(profileId, { status: '请按回车键发送' });
    const timer = setTimeout(() => {
      enterOnlyHintTimers.delete(profileId);
      if (composerStatus.value[profileId] === '请按回车键发送') setComposerStatus(profileId, '');
      void setInjectedComposerState(profileId, { status: '' });
    }, 1800);
    enterOnlyHintTimers.set(profileId, timer);
    return;
  }
  if (profile.platform === 'signal' && action !== 'typing' && action !== 'debug') {
    void window.chatTranslator.appendSignalDebugLog?.({
      profileId,
      type: 'composer-event',
      action,
      textLength: text.trim().length,
      hasChinese: /[\u4e00-\u9fff]/.test(text),
      reviewEnabled: action === 'translate' ? signalReviewEnabled : undefined
    });
  }

  if (action === 'telegram-enter-debug') {
    if (!isTelegramPlatform(profile.platform)) return;
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed;
    } catch {
      details = {};
    }
    void window.chatTranslator?.appendSignalDebugLog?.({
      type: 'telegram-enter-decision',
      profileId,
      profileName: profile.name,
      platform: profile.platform,
      sequence: Number(details.sequence || 0),
      decision: String(details.decision || '').slice(0, 80),
      composerKind: String(details.composerKind || '').slice(0, 40),
      hasChinese: details.hasChinese === true,
      hasReady: details.hasReady === true,
      hasPending: details.hasPending === true
    });
    return;
  }

  if (action === 'debug') {
    return;
  }

  if (action === 'smart-reply-request') {
    if (profile.platform === 'signal' || activeProfileId.value !== profileId || !text || text.length > 32_000) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const latestMessageKey = typeof payload.latestMessageKey === 'string' ? payload.latestMessageKey.trim() : '';
    if (!/^smart-[a-z0-9]+-[a-z0-9]+$/i.test(latestMessageKey)) return;
    if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 8) return;
    const messages: SmartReplyMessage[] = [];
    let totalLength = 0;
    for (const item of payload.messages) {
      if (!item || typeof item !== 'object') return;
      const record = item as Record<string, unknown>;
      if (record.speaker !== 'self' && record.speaker !== 'other') return;
      const value = typeof record.text === 'string' ? normalizeCacheText(record.text) : '';
      if (!value || value.length > 4000 || !/[A-Za-z]{2,}/.test(value) || hasChineseText(value)) return;
      totalLength += value.length;
      if (totalLength > 8000) return;
      messages.push({ speaker: record.speaker, text: value });
    }
    if (messages.at(-1)?.speaker !== 'other') return;
    const activeSignature = normalizeSmartReplyConversationSignature(composerConversationSignatures.get(profileId) || '');
    const eventSignature = normalizeSmartReplyConversationSignature(conversationSignature || '');
    if (activeSignature && eventSignature !== activeSignature) return;
    const effectiveSignature = eventSignature || activeSignature;
    const stateKey = smartReplyStateKey(profileId, effectiveSignature, latestMessageKey);
    if (smartReplyInFlightProfiles.has(stateKey)) return;
    smartReplyCollapsedKeys.delete(stateKey);
    smartReplyInFlightProfiles.set(stateKey, { latestMessageKey, conversationSignature: effectiveSignature });
    setComposerStatus(profileId, '正在生成 3 组智能回复');
    try {
      const result = await window.chatTranslator.generateSmartReplies({
        requestId: requestId || createTranslationRequestId('smart-reply', profileId),
        userId: deepSeekUserId(profileId),
        profileId,
        platform: profile.platform,
        messages,
        latestSpeaker: 'other',
        replyCount: 3,
        outputLanguage: 'en-US',
        allowSensitiveEcho: false
      });
      const currentSignature = normalizeSmartReplyConversationSignature(composerConversationSignatures.get(profileId) || '');
      if (effectiveSignature && currentSignature !== effectiveSignature) return;
      if (result.schema_version !== 'df.smart_reply.output.v1' || result.replies.length !== 3) {
        throw new Error('smart reply result invalid');
      }
      const currentUi = await executeProfileScript<SmartReplyUiInstallResult | false>(
        profileId,
        buildSmartReplyUiInstallScript(appForPlatform(profile.platform))
      ).catch((): false => false);
      if (
        !currentUi || currentUi.state !== 'eligible' || !currentUi.eligibleMessageKeys.includes(latestMessageKey) ||
        normalizeSmartReplyConversationSignature(currentUi.conversationSignature) !== effectiveSignature
      ) {
        setComposerStatus(profileId, '最新气泡已变化，本次智能回复已丢弃');
        return;
      }
      smartReplyResults.set(stateKey, {
        latestMessageKey,
        conversationSignature: effectiveSignature,
        replies: result.replies,
        at: Date.now()
      });
      const applied = await executeProfileScript<boolean>(profileId, buildSmartReplyUiStateScript({
        latestMessageKey,
        conversationSignature: effectiveSignature,
        state: smartReplyCollapsedKeys.has(stateKey) ? 'collapse' : 'success',
        replies: result.replies
      }));
      setComposerStatus(profileId, applied ? '已生成 3 组智能回复' : '已生成，滚动回最新气泡后会自动恢复');
    } catch (error) {
      const errorUiApplied = await executeProfileScript<boolean>(profileId, buildSmartReplyUiStateScript({
        latestMessageKey,
        conversationSignature: effectiveSignature,
        state: 'error',
        message: '智能回复暂时不可用，点击重新生成'
      })).then(Boolean).catch(() => false);
      void window.chatTranslator.appendSignalDebugLog?.({
        profileId,
        type: 'smart-reply-failed',
        platform: profile.platform,
        requestIdPresent: Boolean(requestId),
        messageCount: messages.length,
        totalLength,
        errorUiApplied,
        error: (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 300)
      });
      setComposerStatus(profileId, '智能回复生成失败，请重试');
    } finally {
      const inFlight = smartReplyInFlightProfiles.get(stateKey);
      if (inFlight?.latestMessageKey === latestMessageKey && inFlight.conversationSignature === effectiveSignature) {
        smartReplyInFlightProfiles.delete(stateKey);
      }
      scheduleSmartReplyUiRefresh(profileId, 40);
    }
    return;
  }

  if (action === 'smart-reply-select') {
    if (profile.platform === 'signal' || activeProfileId.value !== profileId || !text || text.length > 4000) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const latestMessageKey = typeof payload.latestMessageKey === 'string' ? payload.latestMessageKey.trim() : '';
    const id = typeof payload.id === 'string' ? payload.id : '';
    const english = typeof payload.english === 'string' ? payload.english.trim() : '';
    const activeSignature = normalizeSmartReplyConversationSignature(composerConversationSignatures.get(profileId) || '');
    const eventSignature = normalizeSmartReplyConversationSignature(conversationSignature || '');
    const effectiveSignature = eventSignature || activeSignature;
    const result = smartReplyResults.get(smartReplyStateKey(profileId, effectiveSignature, latestMessageKey));
    if (
      !result ||
      result.latestMessageKey !== latestMessageKey ||
      result.conversationSignature !== effectiveSignature ||
      (activeSignature && eventSignature !== activeSignature)
    ) return;
    const approved = result.replies.find((item) => item.id === id && item.english === english);
    if (!approved) return;
    const prefix = `${profileId}::${effectiveSignature}::`;
    for (const key of [...smartReplyResults.keys(), ...smartReplyInFlightProfiles.keys()]) {
      if (key.startsWith(prefix)) smartReplyCollapsedKeys.add(key);
    }
    await executeProfileScript<boolean>(profileId, buildSmartReplyUiStateScript({
      latestMessageKey,
      conversationSignature: effectiveSignature,
      state: 'collapse'
    })).catch(() => false);
    await writeNativeComposer(profileId, approved.english, { instant: true });
    setComposerStatus(profileId, '智能回复已填入，请确认后按 Enter 发送');
    return;
  }

  if (action === 'bubble-refresh') {
    if (profile.platform === 'signal' || !text || text.length > 32_000) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const key = typeof payload.key === 'string' ? payload.key.trim() : '';
    const sourceText = typeof payload.text === 'string' ? normalizeCacheText(payload.text) : '';
    if (!/^[A-Za-z0-9._:-]{1,256}$/.test(key)) return;
    if (!sourceText || sourceText.length > 4000 || !/[A-Za-z]{2,}/.test(sourceText) || hasChineseText(sourceText)) {
      await getRuntimeScriptExecutor(profile)?.execute<boolean>(buildWebBubbleRefreshStateScript(key, 'idle')).catch(() => false);
      setComposerStatus(profileId, '本条消息无法翻译，请检查原文后重试');
      return;
    }
    const direction = payload.direction === 'incoming' || payload.direction === 'outgoing'
      ? payload.direction
      : 'unknown';
    const messagePart = payload.messagePart === 'quote' ? 'quote' : 'body';
    const enqueued = enqueueMessageTranslationTask(profile, {
      key,
      text: sourceText,
      direction,
      messagePart
    }, 'manual-refresh');
    if (enqueued) setComposerStatus(profileId, '已排队 1 条刷新翻译');
    else await getRuntimeScriptExecutor(profile)?.execute<boolean>(buildWebBubbleRefreshStateScript(key, 'idle')).catch(() => false);
    return;
  }

  if (action === 'conversation-change') {
    const signature = normalizeCacheText(text || '');
    const previousSignature = composerConversationSignatures.get(profileId) || '';
    if (signature && signature !== previousSignature) {
      composerConversationSignatures.set(profileId, signature);
      clearComposerVisibleState(profileId);
      if (normalizeSmartReplyConversationSignature(signature) !== normalizeSmartReplyConversationSignature(previousSignature)) {
        clearSmartReplyStateForProfile(profileId);
      }
      if (sensitiveSendPending.value?.profileId === profileId) {
        await clearSensitiveSendPending(profileId, '联系人已切换，敏感信息确认已作废');
      }
    }
    scheduleProfileTranslationRefresh(profileId, 40);
    scheduleSmartReplyUiRefresh(profileId, 80);
    scheduleHistoryRenderPrefetch(profileId, 120);
    return;
  }

  if (action === 'history-render-prefetch') {
    scheduleProfileTranslationRefresh(profileId, historyBackfillRefreshDelayMs);
    scheduleSmartReplyUiRefresh(profileId, 80);
    scheduleHistoryRenderPrefetch(profileId, 80);
    return;
  }

  if (action === 'unread-peek') {
    await handleUnreadPeekEvent(profile, text);
    return;
  }

  if (action === 'unread-peek-debug') {
    return;
  }

  if (action === 'sensitive-prepare' && text) {
    await prepareSensitiveSendFromComposer(profile, text, conversationSignature);
    return;
  }

  if (action === 'sensitive-send' && text && requestId) {
    await sendConfirmedSensitiveText(profile, text, conversationSignature, requestId);
    return;
  }

  if (action === 'sensitive-cancel') {
    await clearSensitiveSendPending(profileId, '输入内容已变化，敏感信息确认已作废');
    return;
  }

  if (action === 'typing') {
    const typingHasChinese = /[一-鿿]/.test(text);
    const currentStateKey = composerStateKey(profileId, conversationSignature || composerConversationSignatures.get(profileId) || '');
    const translatingSource = composerTranslationSources.get(currentStateKey);
    const isLateTranslationInput = Boolean(
      typingHasChinese &&
      translatingSource &&
      normalizeCacheText(text) === translatingSource.text &&
      Date.now() - translatingSource.at < 5000 &&
      (composerFeedbackStates.value[profileId] === 'translating' || composerFeedbackStates.value[profileId] === 'ready')
    );
    if (typingHasChinese && !isLateTranslationInput) {
      setComposerFeedbackState(profileId, 'typing');
    } else if (composerFeedbackStates.value[profileId] === 'typing') {
      setComposerFeedbackState(profileId, '');
    }
    if (profile.platform === 'signal' && typingHasChinese) {
      const status = 'Signal 已检测到中文输入，按 Enter 翻译';
      setComposerStatus(profileId, '正在输入中文...');
      if (signalDiagnosticStatus.value[profileId] !== status) {
        signalDiagnosticStatus.value = { ...signalDiagnosticStatus.value, [profileId]: status };
      }
      warmSignalComposerTranslation(profileId, text);
    } else if (profile.platform === 'signal' && !typingHasChinese) {
      if (composerStatus.value[profileId] === '正在输入中文...') setComposerStatus(profileId, '');
      if (signalDiagnosticStatus.value[profileId] === 'Signal 已检测到中文输入，按 Enter 翻译') {
        signalDiagnosticStatus.value = { ...signalDiagnosticStatus.value, [profileId]: '' };
      }
    }
    return;
  }

  if (action === 'translate' && text.trim()) {
    if(isTelegramPlatform(profile.platform)){
      const stableTelegramSignature=await executeProfileScript<string>(profileId,`(${readTelegramConversationIdFromDom.toString()})()`).catch(()=> '');
      if(!stableTelegramSignature){setComposerStatus(profileId,'尚未识别 Telegram 联系人，请打开会话后重试');return;}
      conversationSignature=stableTelegramSignature;
      composerConversationSignatures.set(profileId,stableTelegramSignature);
    }
    const stableSignalSignature = profile.platform === 'signal'
      && /^signal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationSignature)
      ? conversationSignature.toLowerCase()
      : '';
    if (stableSignalSignature) {
      composerConversationSignatures.set(profileId, stableSignalSignature);
    }
    const currentSignature = composerConversationSignatures.get(profileId) || '';
    const effectiveSignature = stableSignalSignature || conversationSignature || currentSignature;
    enqueueComposerTranslation(
      profile,
      text,
      effectiveSignature,
      requestId,
      composerKind,
      profile.platform === 'signal' ? signalReviewEnabled : false
    );
    return;
  }

  if (action === 'send') {
    const currentSignature = composerConversationSignatures.get(profileId) || '';
    const stateKey = composerStateKey(profileId, conversationSignature || currentSignature);
    const authorization = await window.chatTranslator.authorizeTranslatedSend({
      requestId,
      profileId,
      platform: profile.platform,
      conversationSignature: normalizeComposerConversationSignature(conversationSignature || currentSignature),
      text
    });
    if (profile.platform === 'signal' || isTelegramPlatform(profile.platform)) {
      void window.chatTranslator.appendSignalDebugLog?.({
        profileId,
        profileName: profile.name,
        platform: profile.platform,
        type: 'composer-send-authorization',
        requestId,
        ok: authorization.ok,
        errorCode: authorization.reasonCode || '',
        reason: authorization.ok ? '' : authorization.reason || 'unknown',
        textLength: text.length,
        conversationSignaturePresent: Boolean(conversationSignature || currentSignature)
      });
    }
    if (!authorization.ok) {
      setComposerFeedbackState(profileId, '');
      setComposerStatus(profileId, authorization.reason || '发送完整性校验失败，已阻止发送');
      if (profile.platform === 'signal') {
        await setInjectedComposerState(profileId, { status: authorization.reason || '发送完整性校验失败，已阻止发送' });
      }
      return;
    }
    const sendIntegrityNotBefore = Date.now();
    const outgoingKeysBeforeSend = profile.platform === 'signal'
      ? new Set<string>()
      : await snapshotOutgoingMessageKeys(profile).catch(() => new Set<string>());
    setComposerStatus(profileId, '发送中');
    if (profile.platform === 'signal') await setInjectedComposerState(profileId, { status: '发送中' });
    const sendResult = await sendNativeComposer(profileId, text);
    if (profile.platform === 'signal' || isTelegramPlatform(profile.platform)) {
      void window.chatTranslator.appendSignalDebugLog?.({
        profileId,
        profileName: profile.name,
        platform: profile.platform,
        type: 'composer-native-send-result',
        requestId,
        ok: Boolean(sendResult?.ok),
        method: sendResult?.method || '',
        reason: sendResult?.reason || '',
        textLength: text.length
      });
    }
    translatedDrafts.value = { ...translatedDrafts.value, [stateKey]: '' };
    composerTranslationSources.delete(stateKey);
    composerTranslationLocks.delete(stateKey);
    signalComposerPretranslations.delete(profileId);
    const existingSentTimer = composerSentStatusTimers.get(stateKey);
    if (existingSentTimer) clearTimeout(existingSentTimer);
    if (sendResult?.ok) {
      void verifySentMessageIntegrity(profile, text, outgoingKeysBeforeSend, sendIntegrityNotBefore);
      setComposerFeedbackState(profileId, 'sent');
      const timer = setTimeout(() => {
        composerSentStatusTimers.delete(stateKey);
        if (composerFeedbackStates.value[profileId] === 'sent') setComposerFeedbackState(profileId, '');
      }, 2000);
      composerSentStatusTimers.set(stateKey, timer);
    } else {
      setComposerFeedbackState(profileId, '');
    }
    await setInjectedComposerState(profileId, { draft: '', status: '', translated: '', reviewStatus: 'hidden', reviewText: '' });
    setComposerStatus(profileId, sendResult?.ok ? '' : '未发送成功，内容已保留，请再次按回车重试');
    return;
  }
}

async function snapshotOutgoingMessageKeys(profile: ChatProfile) {
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return new Set<string>();
  const candidates = await runtime.execute<MessageCandidate[]>(buildMessageScanScript(appForPlatform(profile.platform), {
    limit: 60,
    viewportScreensAbove: 1,
    viewportScreensBelow: 1,
    includeAlreadyTranslated: true
  }));
  return new Set((candidates || [])
    .filter((candidate) => candidate.direction === 'outgoing' && candidate.messagePart !== 'quote')
    .map((candidate) => candidate.key));
}

async function lockChatForSentIntegrityFailure() {
  await hideChatSurfacesForLock();
  if (lockScreenStatus.value?.enabled) {
    await showLockScreen('unlock');
    lockPinError.value = '发送内容完整性校验失败，聊天界面已锁定';
  } else {
    openLockSetupConfirmation();
    lockNetworkGateReason.value = '发送内容完整性校验失败，请立即设置锁屏密码。';
  }
}

async function verifySentMessageIntegrity(
  profile: ChatProfile,
  expectedText: string,
  previousKeys: Set<string>,
  notBefore: number
) {
  if (profile.platform === 'signal') {
    const result = await window.chatTranslator.verifySignalSentMessage({
      profileId: profile.id,
      expectedText,
      notBefore
    }).catch(() => ({ status: 'unavailable' as const, candidateCount: 0 }));
    if (result.status !== 'mismatch') return;
    void window.chatTranslator?.appendSignalDebugLog?.({
      type: 'send-integrity-native-mismatch',
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform,
      expectedCanonicalLength: canonicalRenderedSendIntegrityText(expectedText).length,
      candidateCount: result.candidateCount
    });
    await lockChatForSentIntegrityFailure();
    return;
  }
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return;
  const expected = canonicalRenderedSendIntegrityText(expectedText);
  let sawNewOutgoing = false;
  let lastNewOutgoing: MessageCandidate[] = [];
  for (const delay of [250, 500, 750, 1500]) {
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    const candidates = await runtime.execute<MessageCandidate[]>(buildMessageScanScript(appForPlatform(profile.platform), {
      limit: 60,
      viewportScreensAbove: 1,
      viewportScreensBelow: 1,
      includeAlreadyTranslated: true
    })).catch(() => []);
    const newOutgoing = (candidates || []).filter((candidate) =>
      candidate.direction === 'outgoing' &&
      candidate.messagePart !== 'quote' &&
      !previousKeys.has(candidate.key)
    );
    if (!newOutgoing.length) continue;
    sawNewOutgoing = true;
    lastNewOutgoing = newOutgoing;
    if (hasMatchingRenderedSendIntegrityText(expected, newOutgoing.map(candidate => candidate.text))) return;
  }
  if (!sawNewOutgoing) return;
  void window.chatTranslator?.appendSignalDebugLog?.({
    type: 'send-integrity-mismatch',
    profileId: profile.id,
    profileName: profile.name,
    platform: profile.platform,
    expectedCanonicalLength: expected.length,
    candidateCount: lastNewOutgoing.length,
    candidateCanonicalLengths: lastNewOutgoing.map(candidate => canonicalRenderedSendIntegrityText(candidate.text).length).slice(0, 12)
  });
  await lockChatForSentIntegrityFailure();
}

function getWebviewByProfileId(profileId: string) {
  return document.querySelector<Electron.WebviewTag>(`webview[data-profile-id="${profileId}"]`);
}

async function writeNativeComposer(
  profileId: string,
  text: string,
  options: { instant: boolean; composerKind?: ComposerKind; requestId?: string }
) {
  const profile = profiles.value.find((item) => item.id === profileId);
  const webview = profile && appForPlatform(profile.platform) !== 'signal' ? getWebviewByProfileId(profileId) : null;
  const isTelegramProfile = profile?.platform === 'telegram-a' || profile?.platform === 'telegram-k';
  if (webview && options.instant && !isTelegramProfile) {
    const pasted = await pasteTextIntoNativeComposer(webview, text);
    if (pasted) {
      void window.chatTranslator?.appendSignalDebugLog?.({
        type: 'composer-write',
        profileId,
        profileName: profile?.name || '',
        platform: profile?.platform || '',
        method: 'clipboard-paste',
        ok: true,
        textLength: text.length
      });
      return;
    }
  }
  const result = await executeProfileScript<{ ok?: boolean; reason?: string }>(
    profileId,
    buildComposerScript('write', text, options.instant, false, options.composerKind, options.requestId)
  );
  void window.chatTranslator?.appendSignalDebugLog?.({
    type: 'composer-write',
    profileId,
    profileName: profile?.name || '',
    platform: profile?.platform || '',
    method: 'dom-write',
    ok: Boolean(result?.ok),
    reason: result?.reason || '',
    result,
    textLength: text.length
  });
  if (!result?.ok) {
    throw new Error(`native composer write failed: ${result?.reason || 'unknown'}`);
  }
}

async function focusWebviewNativeComposer(
  profileId: string,
  composerKind: ComposerKind = 'default',
  requestId = ''
) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (profile?.platform === 'signal') {
    return executeProfileScript<boolean>(profileId, buildInjectedComposerScript('focusNative')).catch(() => false);
  }
  const webview = profile && appForPlatform(profile.platform) !== 'signal' ? getWebviewByProfileId(profileId) : null;
  if (!webview) return false;
  webview.focus();
  return webview.executeJavaScript(buildNativeComposerFocusScript(composerKind, requestId), true).catch(() => false) as Promise<boolean>;
}

async function pasteTextIntoNativeComposer(webview: Electron.WebviewTag, text: string) {
  if (!window.chatTranslator?.readClipboardText || !window.chatTranslator?.writeClipboardText || typeof webview.sendInputEvent !== 'function') {
    return false;
  }

  const focused = await webview.executeJavaScript(buildNativeComposerFocusScript(), true) as boolean;
  if (!focused) return false;

  const previousClipboard = await window.chatTranslator.readClipboardText();
  const send = (event: Record<string, unknown>) => webview.sendInputEvent(event);
  try {
    await window.chatTranslator.writeClipboardText(text);
    webview.focus();
    send({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
    send({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
    send({ type: 'keyDown', keyCode: 'Backspace' });
    send({ type: 'keyUp', keyCode: 'Backspace' });
    send({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
    send({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const currentText = await webview.executeJavaScript(buildNativeComposerTextScript(), true) as string;
    return normalizeCacheText(currentText) === normalizeCacheText(text);
  } finally {
    await window.chatTranslator.writeClipboardText(previousClipboard);
  }
}

async function clearNativeComposerIfProxy(profileId?: string) {
  const targetProfileId = profileId ?? activeProfileId.value;
  if (!targetProfileId) return;
  await executeProfileScript(targetProfileId, buildComposerScript('clearProxy', typingProxyText, true, true));
}

async function pulseNativeTyping(profileId: string) {
  await executeProfileScript(profileId, buildInjectedComposerScript('focusNative'));
}

async function sendNativeComposer(profileId: string, expectedText = '', allowSensitiveExactText = false) {
  const profile = profiles.value.find((item) => item.id === profileId);
  const webview = profile && appForPlatform(profile.platform) !== 'signal' ? getWebviewByProfileId(profileId) : null;
  const result = await executeProfileScript<{ ok?: boolean; method?: string; reason?: string }>(
    profileId,
    buildComposerScript(allowSensitiveExactText ? 'sendExact' : 'send', expectedText, true)
  );
  if (result?.ok || !webview || typeof webview.sendInputEvent !== 'function') return result;
  const currentText = await webview.executeJavaScript(buildNativeComposerTextScript(), true).catch(() => '') as string;
  const canonical = (value: string) => value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC').trim();
  if (canonical(currentText) !== canonical(expectedText) || hasChineseText(currentText) || /^[0-9]{1,11}$/.test(currentText.trim())) return result;
  webview.focus();
  webview.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  webview.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  return { ok: true, method: 'webview-enter-fallback' };
}

async function setInjectedComposerState(profileId: string, state: Record<string, string>) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (profile?.platform === 'signal' && Object.prototype.hasOwnProperty.call(state, 'sensitiveToken')) {
    return executeProfileScript<boolean>(profileId, buildSignalSensitiveStateScript(state));
  }
  return executeProfileScript<boolean>(profileId, buildInjectedComposerScript('state', state));
}

function buildSignalSensitiveStateScript(state: Record<string, string>) {
  return `
(async () => {
  const state = ${JSON.stringify(state)};
  for (let attempt = 0; attempt < 21; attempt += 1) {
    if (typeof window.__dfSignalApplySensitiveState === 'function' && window.__dfSignalApplySensitiveState(state)) return true;
    if (attempt < 20) await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
})()
`;
}

function buildUnreadPeekResultScript(payload: {
  requestId: string;
  title: string;
  unreadCount: number;
  items: Array<{ id: string; text: string; translatedText: string }>;
}) {
  const serializedPayload = JSON.stringify(payload);
  return `
(() => {
  const payload = ${serializedPayload};
  if (typeof window.__dfUnreadPeekApplyResult === 'function') {
    window.__dfUnreadPeekApplyResult(payload);
    return true;
  }
  return false;
})()
`;
}

async function pollInjectedComposerEvents(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (profile?.platform === 'signal' && activeProfileId.value !== profileId) return;
  const runtime = getRuntimeScriptExecutorById(profileId);
  if (!runtime) return;
  void pollAssistantMaterialEvents(profileId).catch(() => undefined);
  let events: Array<{
    action?: string;
    text?: string;
    conversationSignature?: string;
    requestId?: string;
    composerKind?: ComposerKind;
    reviewEnabled?: boolean;
  }> = [];
  try {
    events = (await runtime.execute<Array<{
      action?: string;
      text?: string;
      conversationSignature?: string;
      requestId?: string;
      composerKind?: ComposerKind;
      reviewEnabled?: boolean;
    }>>(
      `(() => { const q = window.__dfTranslatorQueue || []; window.__dfTranslatorQueue = []; return q; })()`
    )) ?? [];
  } catch {
    return;
  }
  let lastTypingIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.action === 'typing') {
      lastTypingIndex = index;
      break;
    }
  }
  const compactedEvents = events.filter((event, index) => event.action !== 'typing' || index === lastTypingIndex);
  for (const event of compactedEvents) {
    if (!event.action) continue;
    try {
      await handleInjectedComposerEvent(
        profileId,
        event.action,
        event.text || '',
        event.conversationSignature || '',
        event.requestId || '',
        event.composerKind === 'telegram-media-caption' ? 'telegram-media-caption' : 'default',
        event.reviewEnabled !== false
      );
    } catch (error) {
      void window.chatTranslator?.appendSignalDebugLog?.({
        profileId,
        type: 'composer-event-failed',
        action: event.action,
        error: (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 300)
      });
    }
  }
}

function scheduleComposerEventPoll(profileId: string) {
  if (composerEventPollIntervals.has(profileId)) return;
  const generation = webRuntimeGenerations.get(profileId) ?? 0;

  const tick = async () => {
    if ((webRuntimeGenerations.get(profileId) ?? 0) !== generation) return;
    const profile = profiles.value.find((item) => item.id === profileId);
    if (!profile) {
      composerEventPollIntervals.delete(profileId);
      return;
    }
    try {
      await pollInjectedComposerEvents(profileId);
    } finally {
      if ((webRuntimeGenerations.get(profileId) ?? 0) !== generation) return;
      const currentProfile = profiles.value.find((item) => item.id === profileId);
      if (!currentProfile) {
        composerEventPollIntervals.delete(profileId);
        return;
      }
      const nextDelayMs = currentProfile.platform === 'signal'
        ? (activeProfileId.value === profileId ? 80 : 1000)
        : isTelegramPlatform(currentProfile.platform) && activeProfileId.value === profileId
          ? 80
          : 300;
      const timer = window.setTimeout(() => void tick(), nextDelayMs);
      composerEventPollIntervals.set(profileId, timer);
    }
  };

  const profile = profiles.value.find((item) => item.id === profileId);
  const firstDelayMs = profile && (
    profile.platform === 'signal' || isTelegramPlatform(profile.platform)
  ) && activeProfileId.value === profileId
    ? 80
    : 300;
  const timer = window.setTimeout(() => void tick(), firstDelayMs);
  composerEventPollIntervals.set(profileId, timer);
}

async function probeWebComposer(profileId: string) {
  if (!showDeveloperDiagnostics.value) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile || appForPlatform(profile.platform) === 'signal') return;
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return;
  const platformLabel = appForPlatform(profile.platform) === 'telegram' ? 'Telegram' : 'WhatsApp';
  try {
    const result = await runtime.execute<{
      guard?: string;
      typing?: string;
      click?: string;
      queueLength?: number;
      hasComposer?: boolean;
      activeTag?: string;
      activeRole?: string;
      activeEditable?: string;
      composerIsMediaCaption?: boolean;
      activeIsMediaCaption?: boolean;
      mediaCaptionCandidateCount?: number;
      mediaFocusGuardRequestId?: string;
      mediaFocusGuardTargetConnected?: boolean;
      textLength?: number;
      hasChinese?: boolean;
      hasEnglish?: boolean;
      textPreview?: string;
      translatedReady?: string;
      requestId?: string;
      readyRequestId?: string;
      pending?: string;
      enterTrace?: {
        at?: number;
        sequence?: number;
        type?: string;
        key?: string;
        code?: string;
        keyCode?: number;
        composing?: boolean;
        hasChinese?: boolean;
        decision?: string;
      };
      enterCount?: number;
    }>(buildWebComposerProbeScript());
    const preloadGuard = webviewPreloadGuardStatus.get(profileId);
    const preloadGuardLoaded = Boolean(
      preloadGuard?.version === '2026-07-24-webview-preload-chinese-send-v1' &&
      Date.now() - preloadGuard.lastSeenAt <= 12_000
    );
    const status = [
      `${platformLabel} 探针`,
      `前置守卫 ${preloadGuardLoaded ? `已加载 ${preloadGuard?.version}` : '未加载'}`,
      `守卫 ${result?.guard || '-'}`,
      `输入框 ${result?.hasComposer ? '有' : '无'}`,
      `文本 ${result?.textLength ?? 0}`,
      `中文 ${result?.hasChinese ? '是' : '否'}`,
      `英文 ${result?.hasEnglish ? '是' : '否'}`,
      `队列 ${result?.queueLength ?? 0}`,
      `ready ${result?.translatedReady ? '是' : '否'}`,
      `pending ${result?.pending ? '是' : '否'}`,
      `active ${result?.activeTag || '-'} role=${result?.activeRole || '-'} ce=${result?.activeEditable || '-'}`,
      `媒体注释 ${result?.composerIsMediaCaption ? '是' : '否'}`,
      `媒体候选 ${result?.mediaCaptionCandidateCount ?? 0}`,
      `焦点守卫 ${result?.mediaFocusGuardRequestId && result?.mediaFocusGuardTargetConnected ? '运行中' : '未运行'}`,
      `物理回车 ${result?.enterCount ?? 0} 次`,
      result?.enterTrace?.decision
        ? `最近第 ${result.enterTrace.sequence || 0} 次回车 ${result.enterTrace.decision} key=${result.enterTrace.key || '-'} code=${result.enterTrace.code || '-'} kc=${result.enterTrace.keyCode || 0}`
        : '',
      result?.textPreview ? `文本：${result.textPreview}` : ''
    ].filter(Boolean).join('，');
    webComposerDiagnosticStatus.value = { ...webComposerDiagnosticStatus.value, [profileId]: status };
    const now = Date.now();
    const last = webComposerDiagnosticLogCache.get(profileId);
    if (last?.status !== status || now - last.at > 1500) {
      webComposerDiagnosticLogCache.set(profileId, { status, at: now });
      void window.chatTranslator?.appendSignalDebugLog?.({
        type: 'web-composer-probe',
        profileId,
        profileName: profile.name,
        platform: profile.platform,
        app: appForPlatform(profile.platform),
        status,
        result
      });
    }
  } catch (error) {
    const status = `${platformLabel} 探针失败：${error instanceof Error ? error.message : String(error)}`;
    webComposerDiagnosticStatus.value = { ...webComposerDiagnosticStatus.value, [profileId]: status };
    void window.chatTranslator?.appendSignalDebugLog?.({
      type: 'web-composer-probe-failed',
      profileId,
      profileName: profile.name,
      platform: profile.platform,
      app: appForPlatform(profile.platform),
      status
    });
  }
}

function startWebComposerProbe(profileId: string) {
  if (webComposerProbeIntervals.has(profileId)) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile || appForPlatform(profile.platform) === 'signal') return;
  const timer = setInterval(() => {
    void probeWebComposer(profileId);
  }, 1000);
  webComposerProbeIntervals.set(profileId, timer);
  void probeWebComposer(profileId);
}


function buildComposerPlainTextReaderSource() {
  return `const readComposerPlainText = (${readComposerPlainTextFromDom.toString()});`;
}

function buildDirectSendHttpUrlSource() {
  return `const isDirectSendHttpUrl = (${isDirectSendHttpUrl.toString()});`;
}

function isMediaCaptionComposerFromDom(element: Element | null | undefined) {
  if (!element) return false;
  const className = String(element.getAttribute?.('class') || '');
  if (/input-field-input-fake|input-message-input-fake/.test(className)) return false;
  const whatsappMediaCaptionEditable = element.matches?.(
    '[data-testid="media-caption-input-container"][contenteditable="true"][role="textbox"]'
  );
  if (whatsappMediaCaptionEditable) return true;
  const telegramNewMediaContainer = element.closest?.('.input-message-container.simple-message-input-inputs');
  const telegramMediaSendContainer = element.closest?.('.simple-message-input-container');
  const telegramMediaConfirm = telegramMediaSendContainer?.querySelector?.('.simple-message-input-confirm');
  const telegramNewMediaCaptionEditable = element.matches?.(
    '.input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
  );
  if (
    telegramNewMediaContainer &&
    telegramMediaSendContainer &&
    telegramMediaConfirm &&
    telegramNewMediaCaptionEditable
  ) {
    return true;
  }
  const dialog = element.closest?.('[role="dialog"]');
  if (!dialog) return false;
  const metadata = [
    element.getAttribute?.('aria-label') || '',
    element.getAttribute?.('placeholder') || '',
    element.getAttribute?.('data-testid') || '',
    element.getAttribute?.('data-animation-group') || '',
    element.getAttribute?.('class') || '',
    element.parentElement?.getAttribute?.('data-testid') || '',
    element.parentElement?.getAttribute?.('class') || ''
  ].join(' ').toLowerCase();
  if (/caption|media-caption|add a caption|说明|注释|添加说明/.test(metadata)) return true;
  if (document.activeElement !== element) return false;
  return Boolean(dialog.querySelector?.([
    'img[src^="blob:"]',
    'img[src^="data:"]',
    'video',
    'canvas',
    '[data-testid*="media"]',
    '[class*="media-preview"]',
    '[class*="media-editor"]',
    '[class*="photo-preview"]'
  ].join(',')));
}

function buildMediaCaptionComposerSource() {
  return `const isMediaCaptionComposer = (${isMediaCaptionComposerFromDom.toString()});`;
}

function buildComposerScript(
  action: 'write' | 'clearProxy' | 'send' | 'sendExact' | 'pulse',
  text: string,
  instant: boolean,
  preserveFocus = false,
  composerKind: ComposerKind = 'default',
  requestId = ''
) {
  const payload = JSON.stringify({ action, text, instant, preserveFocus, composerKind, requestId });
  return `
(async () => {
  const payload = ${payload};
${buildComposerPlainTextReaderSource()}
${buildMediaCaptionComposerSource()}
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isVisible = (el) => {
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake/.test(className)) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 12
      && rect.height > 12
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && style.opacity !== '0'
      && style.pointerEvents !== 'none';
  };
  const isEditableElement = (el) => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const isCandidateComposer = (el) => {
    if (!el || !isVisible(el) || !isEditableElement(el)) return false;
    if (el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
    if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
    if (el.querySelector?.('.df-translator-status, .df-translator-proxy, .df-translator-input, #df-composer-state, .df-composer-state')) return false;
    const label = ((el.getAttribute('role') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
    if (/search|filter|find/.test(label)) return false;
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/.test(className)) return false;
    return true;
  };
  const findComposer = () => {
    const mediaCaptionCandidates = Array.from(document.querySelectorAll(
      '.simple-message-input-container .input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)'
    )).filter((element) => element.isConnected && isMediaCaptionComposer(element));
    const requestBoundMediaCaptionComposer = payload.requestId
      ? mediaCaptionCandidates.find((element) => (
        element.dataset.dfTranslatorRequestId === payload.requestId ||
        element.dataset.dfTranslatorReadyRequestId === payload.requestId
      )) || null
      : null;
    const recoveredMediaCaptionComposer = payload.requestId &&
      mediaCaptionCandidates.length === 1
      ? mediaCaptionCandidates[0]
      : null;
    const mediaCaptionComposer = requestBoundMediaCaptionComposer ||
      recoveredMediaCaptionComposer ||
      mediaCaptionCandidates.find((element) => Boolean(readComposerPlainText(element).trim())) ||
      mediaCaptionCandidates[0] ||
      null;
    if (payload.composerKind === 'telegram-media-caption' && payload.requestId) {
      return requestBoundMediaCaptionComposer || recoveredMediaCaptionComposer;
    }
    if (payload.composerKind === 'telegram-media-caption') return mediaCaptionComposer;
    if (mediaCaptionComposer) return mediaCaptionComposer;
    const findBottomEditableComposer = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const items = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'))
        .filter(isCandidateComposer)
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter((item) => item.rect.width > 120 && (!viewportHeight || item.rect.bottom > viewportHeight * 0.55));
      items.sort((left, right) => right.rect.bottom - left.rect.bottom || right.rect.width - left.rect.width);
      return items[0]?.el || null;
    };
    const fromSelection = (() => {
      const node = window.getSelection?.()?.focusNode;
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return element?.closest?.('[contenteditable], [role="textbox"], textarea, input') || null;
    })();
    const active = document.activeElement;
    if (isCandidateComposer(active)) return active;
    if (isCandidateComposer(fromSelection)) return fromSelection;
    if (isCandidateComposer(window.__dfLastNativeComposer)) return window.__dfLastNativeComposer;
    const selectors = [
      '.chat-input-main .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.chat-input-main .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="plaintext-only"][role="textbox"]',
      'footer [contenteditable][role="textbox"]',
      'footer [contenteditable="plaintext-only"]',
      'footer [contenteditable]',
      'footer [role="textbox"]',
      '[data-testid*="composition"] [contenteditable]',
      '[data-testid*="composition"] [role="textbox"]',
      '[data-testid*="compose"] [contenteditable]',
      '[data-testid*="compose"] [role="textbox"]',
      '[data-testid*="input"] [contenteditable]',
      '[data-testid*="input"] [role="textbox"]',
      '[class*="composition"] [contenteditable]',
      '[class*="compose"] [contenteditable]',
      '[class*="input"] [contenteditable]',
      '[aria-multiline="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="plaintext-only"][role="textbox"]',
      '[contenteditable][role="textbox"]',
      '[role="textbox"]',
      'div.input-message-input[contenteditable]',
      'div.input-message-input[contenteditable]',
      '.input-message-container [contenteditable]',
      '.composition-area [contenteditable="true"]',
      '.composition-area [contenteditable]',
      '.module-composition-input [contenteditable="true"]',
      '.module-composition-input [contenteditable]',
      '#editable-message-text',
      'textarea'
    ];
    for (const selector of selectors) {
      const items = Array.from(document.querySelectorAll(selector)).filter(isCandidateComposer);
      if (items.length) return items[items.length - 1];
    }
    const bottomComposer = findBottomEditableComposer();
    if (bottomComposer) return bottomComposer;
    const editables = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea')).filter(isCandidateComposer);
    return editables[editables.length - 1] || null;
  };
  const dispatchInput = (el) => {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const dispatchDelete = (el) => {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const dispatchBeforeInput = (el, inputType, data = null) => {
    try {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data }));
    } catch {}
  };
  const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
  const canonicalSendText = (value) => (value || '').replace(/\\r\\n?/g, '\\n').replace(/\\u00a0/g, ' ').normalize('NFC').trim();
  const restoreTranslatorFocus = (previousActiveElement) => {
    if (!payload.preserveFocus) return;
    const target = previousActiveElement;
    const restore = () => {
      if (target?.isConnected && document.activeElement !== target) target.focus();
    };
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 30);
    setTimeout(restore, 90);
    setTimeout(restore, 180);
  };
  const setText = (el, value) => {
    const previousActiveElement = document.activeElement;
    if (!payload.preserveFocus) el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, value);
      dispatchInput(el);
      restoreTranslatorFocus(previousActiveElement);
      return;
    }
    const selection = window.getSelection();
    const selectContents = () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
    };
    selectContents();
    dispatchBeforeInput(el, 'deleteContentBackward');
    document.execCommand('delete', false);
    el.textContent = '';
    dispatchDelete(el);
    if (!value) {
      restoreTranslatorFocus(previousActiveElement);
      return;
    }
    dispatchBeforeInput(el, 'insertText', value);
    const inserted = document.execCommand('insertText', false, value);
    if (!inserted || normalize(el.textContent || '') !== normalize(value)) el.textContent = value;
    const caretRange = document.createRange();
    caretRange.selectNodeContents(el);
    caretRange.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(caretRange);
    dispatchInput(el);
    restoreTranslatorFocus(previousActiveElement);
  };
  const appendText = (el, value) => {
    if (!payload.preserveFocus) el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, (el.value || '') + value);
      dispatchInput(el);
      return;
    }
    document.execCommand('insertText', false, value);
    dispatchInput(el);
  };
  const getText = (el) => readComposerPlainText(el);
  const describeCandidate = (el) => {
    const rect = el.getBoundingClientRect();
    return [
      el.tagName,
      el.getAttribute?.('role') || '',
      el.getAttribute?.('contenteditable') || '',
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('data-testid') || '',
      el.id || '',
      String(el.className || '').slice(0, 80),
      Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.width) + 'x' + Math.round(rect.height)
    ].filter(Boolean).join('|');
  };
  const relaxedComposerCandidates = () => {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const nodes = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'));
    const candidates = nodes
      .filter((el) => {
        if (!el || el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
        if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
        const className = String(el.className || '');
        if (/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/i.test(className)) return false;
        const label = [el.getAttribute?.('role') || '', el.getAttribute?.('aria-label') || '', el.getAttribute?.('placeholder') || '', className].join(' ').toLowerCase();
        if (/search|filter|find/.test(label)) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width < 80 || rect.height < 10) return false;
        if (viewportHeight && rect.bottom < viewportHeight * 0.45) return false;
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      })
      .map((el) => ({ el, rect: el.getBoundingClientRect() }));
    candidates.sort((left, right) => right.rect.bottom - left.rect.bottom || right.rect.width - left.rect.width);
    return candidates.slice(0, 8).map((item) => item.el);
  };
  const hasSelectionInside = (el) => {
    const selection = window.getSelection?.();
    const node = selection?.anchorNode || null;
    return Boolean(node && (node === el || el.contains?.(node)));
  };
  const isHighConfidenceComposer = (el) => {
    const className = String(el.className || '');
    const id = String(el.id || '');
    const testId = String(el.getAttribute?.('data-testid') || '');
    const ariaLabel = String(el.getAttribute?.('aria-label') || '');
    const role = String(el.getAttribute?.('role') || '');
    const editable = String(el.getAttribute?.('contenteditable') || '').toLowerCase();
    const explicitName = [className, id, testId, ariaLabel].join(' ');
    if (/input-message-input|conversation-compose-box-input|composer_rich_textarea|editable-message-text|message-input|MessageInput/i.test(explicitName)) return true;
    if (/type a message|message|输入消息|键入消息/i.test(ariaLabel) && (role === 'textbox' || editable === 'true' || editable === 'plaintext-only')) return true;
    if (el.closest?.('footer') && (role === 'textbox' || editable === 'true' || editable === 'plaintext-only') && !/search|filter|find/i.test(ariaLabel)) return true;
    const active = document.activeElement;
    if (active && (active === el || el.contains?.(active))) return true;
    return hasSelectionInside(el);
  };
  let composer = findComposer();
  if (!composer && payload.action === 'write' && payload.composerKind !== 'telegram-media-caption') {
    const candidates = relaxedComposerCandidates();
    const candidate = candidates.find((item) => isHighConfidenceComposer(item));
    if (candidate) {
      composer = candidate;
    } else {
      return {
        ok: false,
        reason: 'composer-auto-discovery-needs-selector',
        candidates: candidates.length,
        candidateSummary: candidates.map(describeCandidate).slice(0, 4)
      };
    }
  }
  if (!composer) {
    return {
      ok: false,
      reason: payload.composerKind === 'telegram-media-caption'
        ? 'telegram-media-caption-bound-composer-not-found'
        : 'composer-not-found',
      candidates: payload.composerKind === 'telegram-media-caption'
        ? document.querySelectorAll('.simple-message-input-container .simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]').length
        : relaxedComposerCandidates().length
    };
  }
  if (payload.composerKind === 'telegram-media-caption' && payload.requestId) {
    composer.dataset.dfTranslatorRequestId = payload.requestId;
  }
  window.__dfLastNativeComposer = composer;

  if (payload.action === 'pulse') {
    const currentText = getText(composer).trim();
    if (/^[0-9]{1,11}$/.test(currentText)) return { ok: false, reason: 'blocked-phone-number' };
    if (!currentText) {
      setText(composer, 'typing...');
    }
    restoreTranslatorFocus(composer);
    return { ok: true, method: 'pulse' };
  }

  if (payload.action === 'clearProxy') {
    const currentText = getText(composer);
    if ((currentText || '').trim() === payload.text.trim() || (currentText || '').trim() === 'typing...') setText(composer, '');
    return { ok: true };
  }

  if (payload.action === 'send' || payload.action === 'sendExact') {
    const currentText = getText(composer).trim();
    if (!currentText || currentText === 'typing...' || /[\\u4e00-\\u9fff]/.test(currentText) || (payload.action === 'send' && !/[A-Za-z]/.test(currentText))) {
      return { ok: false, reason: 'blocked-non-english' };
    }
    if (payload.text && canonicalSendText(currentText) !== canonicalSendText(payload.text)) {
      return { ok: false, reason: 'send-text-mismatch', current: currentText };
    }
    composer.focus();
    const composerRoot = composer.closest?.('.chat-input-main, .new-message-wrapper, .simple-message-input-container') ||
      composer.closest?.('footer, .chat-input, .input-message-container, [data-testid*="compose"], [data-testid*="composition"]') || document;
    const mediaCaptionSendButton = isMediaCaptionComposer(composer)
      ? composer.closest?.('.simple-message-input-container')?.querySelector?.('.simple-message-input-confirm')
      : null;
    const sendButtonSelector = 'button, [role="button"], .btn-send-container .btn-send, .btn-send, .send-button, .button-send';
    const isAvailableSendButton = (button) => isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    const isSendButton = (button) => {
      const label = ((button.getAttribute('aria-label') || '') + ' ' + (button.getAttribute('data-testid') || '') + ' ' + (button.textContent || '')).toLowerCase();
      return /send|send message|发送/.test(label) || button.matches('.btn-send, .send-button, .button-send');
    };
    const sendButton = mediaCaptionSendButton || Array.from(composerRoot.querySelectorAll(sendButtonSelector)).find((button) => isAvailableSendButton(button) && isSendButton(button)) || Array.from(document.querySelectorAll(sendButtonSelector)).find((button) => {
      if (!isAvailableSendButton(button) || !isSendButton(button)) return false;
      const rect = button.getBoundingClientRect();
      const inputRect = composer.getBoundingClientRect();
      return Math.abs(rect.top - inputRect.top) < 160 && Math.abs(rect.left - inputRect.right) < 260;
    });
    const runProgrammaticSend = async (sendAction) => {
      window.__dfTranslatorProgrammaticSend = true;
      try {
        const method = sendAction();
        await sleep(160);
        const afterText = getText(composer).trim();
        if (!afterText || canonicalSendText(afterText) !== canonicalSendText(currentText)) return { ok: true, method };
        return { ok: false, reason: 'send-not-accepted', method, current: afterText };
      } finally {
        window.setTimeout(() => { window.__dfTranslatorProgrammaticSend = false; }, 180);
      }
    };
    if (sendButton) {
      const buttonResult = await runProgrammaticSend(() => {
        sendButton.click();
        return 'button';
      });
      if (buttonResult.ok) return buttonResult;
    }
    return runProgrammaticSend(() => {
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      composer.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      return 'enter';
    });
  }

  window.__dfTranslatorNativeWrite = true;
  if (normalize(getText(composer)) === normalize(payload.text)) {
    window.setTimeout(() => { window.__dfTranslatorNativeWrite = false; }, 120);
    return { ok: true, method: 'already-written' };
  }
  setText(composer, '');
  if (payload.instant) {
    setText(composer, payload.text);
    window.setTimeout(() => { window.__dfTranslatorNativeWrite = false; }, 120);
    return normalize(getText(composer)) === normalize(payload.text)
      ? { ok: true, method: 'instant' }
      : { ok: false, reason: 'write-verification-failed', current: getText(composer) };
  }
  for (const char of Array.from(payload.text)) {
    appendText(composer, char);
    await sleep(35 + Math.floor(Math.random() * 45));
  }
  window.setTimeout(() => { window.__dfTranslatorNativeWrite = false; }, 120);
  return { ok: true, method: 'typewriter' };
})()
`;
}

function buildNativeComposerHelpersScript(
  returnText: boolean,
  composerKind: ComposerKind = 'default',
  requestId = ''
) {
  const serializedComposerKind = JSON.stringify(composerKind);
  const serializedRequestId = JSON.stringify(requestId);
  return `
(() => {
  const composerKind = ${serializedComposerKind};
  const requestId = ${serializedRequestId};
${buildComposerPlainTextReaderSource()}
${buildMediaCaptionComposerSource()}
  const isVisible = (el) => {
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake/.test(className)) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 40
      && rect.height > 16
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && style.pointerEvents !== 'none';
  };
  const isEditableElement = (el) => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const isCandidateComposer = (el) => {
    if (!el || !isVisible(el) || !isEditableElement(el)) return false;
    if (el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
    if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
    if (el.querySelector?.('.df-translator-status, .df-translator-proxy, .df-translator-input, #df-composer-state, .df-composer-state')) return false;
    const label = ((el.getAttribute('role') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
    const className = (el.className || '').toString();
    return !/search|filter|find/.test(label) && !/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/.test(className);
  };
  const selectors = [
    '.chat-input-main .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
    '.new-message-wrapper .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
    '.chat-input-main .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
    '.new-message-wrapper .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
    'footer [contenteditable="true"][role="textbox"]',
    'footer [contenteditable="plaintext-only"][role="textbox"]',
    'footer [contenteditable][role="textbox"]',
    'footer [contenteditable="true"]',
    'footer [contenteditable="plaintext-only"]',
    'footer [contenteditable]',
    '[data-testid*="composition"] [contenteditable]',
    '[data-testid*="compose"] [contenteditable]',
    '[data-testid*="input"] [contenteditable]',
    '[class*="composition"] [contenteditable]',
    '[class*="compose"] [contenteditable]',
    '[class*="input"] [contenteditable]',
    '[aria-multiline="true"]',
    '[data-testid="conversation-compose-box-input"]',
    '[data-testid="input-message-input"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="plaintext-only"][role="textbox"]',
    '[contenteditable][role="textbox"]',
    'div.input-message-input[contenteditable]',
    '.input-message-input[contenteditable]',
    '.input-message-container [contenteditable]',
    '.composer_rich_textarea',
    '.editable-message-text',
    '#editable-message-text',
    'textarea'
  ];
  const findBottomEditableComposer = () => {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const items = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'))
      .filter(isCandidateComposer)
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((item) => item.rect.width > 120 && (!viewportHeight || item.rect.bottom > viewportHeight * 0.55));
    items.sort((left, right) => right.rect.bottom - left.rect.bottom || right.rect.width - left.rect.width);
    return items[0]?.el || null;
  };
  let composer = null;
  const mediaCaptionCandidates = Array.from(document.querySelectorAll(
    '.simple-message-input-container .input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
  )).filter((element) => element.isConnected && isMediaCaptionComposer(element));
  composer = mediaCaptionCandidates.find((element) => Boolean(readComposerPlainText(element).trim()))
    || mediaCaptionCandidates[0]
    || null;
  if (requestId) {
    const requestBoundMediaCaptionComposer = mediaCaptionCandidates.find((element) => (
      element.dataset.dfTranslatorRequestId === requestId ||
      element.dataset.dfTranslatorReadyRequestId === requestId
    )) || null;
    if (requestBoundMediaCaptionComposer) composer = requestBoundMediaCaptionComposer;
    if (
      !requestBoundMediaCaptionComposer &&
      composerKind === 'telegram-media-caption' &&
      mediaCaptionCandidates.length === 1
    ) {
      composer = mediaCaptionCandidates[0];
      composer.dataset.dfTranslatorRequestId = requestId;
    }
  }
  if (composerKind === 'telegram-media-caption' && !composer) return ${returnText ? "''" : 'false'};
  const fromSelection = (() => {
    const node = window.getSelection?.()?.focusNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest?.('[contenteditable], [role="textbox"], textarea, input') || null;
  })();
  const active = document.activeElement;
  if (!composer && isCandidateComposer(active)) {
    composer = active;
  }
  if (!composer && isCandidateComposer(fromSelection)) {
    composer = fromSelection;
  }
  if (!composer && isCandidateComposer(window.__dfLastNativeComposer)) {
    composer = window.__dfLastNativeComposer;
  }
  for (const selector of selectors) {
    if (composer) break;
    const items = Array.from(document.querySelectorAll(selector)).filter(isCandidateComposer);
    if (items.length) composer = items[items.length - 1];
  }
  if (!composer) composer = findBottomEditableComposer();
  if (!composer) return ${returnText ? "''" : 'false'};
  window.__dfLastNativeComposer = composer;
  if (!${returnText}) {
    composer.focus();
    if (composerKind === 'telegram-media-caption') {
      const selection = window.getSelection?.();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    return true;
  }
  return readComposerPlainText(composer);
})()
`;
}

function buildNativeComposerFocusScript(composerKind: ComposerKind = 'default', requestId = '') {
  return buildNativeComposerHelpersScript(false, composerKind, requestId);
}

function buildNativeComposerTextScript() {
  return buildNativeComposerHelpersScript(true);
}

function buildComposerRequestMatchScript(requestId: string) {
  const payload = JSON.stringify({ requestId });
  return `
(() => {
  const payload = ${payload};
${buildMediaCaptionComposerSource()}
  const findComposer = () => {
    const isVisible = (el) => {
      if (!el) return false;
      const className = (el.className || '').toString();
      if (/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/.test(className)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 40 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const isEditable = (el) => {
      if (!el || !isVisible(el)) return false;
      if (el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
      if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
      const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
      return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
    };
    const active = document.activeElement;
    if (isEditable(active)) return active;
    const items = Array.from(document.querySelectorAll('.input-message-input[contenteditable="true"], [data-testid="conversation-compose-box-input"], [data-testid="input-message-input"], footer [contenteditable="true"], [contenteditable="true"][role="textbox"], textarea')).filter(isEditable);
    return items[items.length - 1] || null;
  };
  const composer = findComposer();
  return Boolean(composer && (composer.dataset.dfTranslatorRequestId === payload.requestId || composer.dataset.dfTranslatorReadyRequestId === payload.requestId));
})()
`;
}

function buildWebComposerProbeScript() {
  return `
(() => {
${buildComposerPlainTextReaderSource()}
${buildMediaCaptionComposerSource()}
  const isVisible = (el) => {
    if (!el) return false;
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/.test(className)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 40 && rect.height > 16 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const isEditable = (el) => {
    if (!el || !isVisible(el)) return false;
    if (el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
    if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const findComposer = () => {
    const mediaCaptionCandidates = Array.from(document.querySelectorAll(
      '.simple-message-input-container .input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
    )).filter((element) => isEditable(element) && isMediaCaptionComposer(element));
    const mediaCaptionComposer = mediaCaptionCandidates.find((element) => Boolean(readComposerPlainText(element).trim())) || mediaCaptionCandidates[0] || null;
    if (mediaCaptionComposer) return mediaCaptionComposer;
    const findBottomEditableComposer = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const items = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'))
        .filter(isEditable)
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter((item) => item.rect.width > 120 && (!viewportHeight || item.rect.bottom > viewportHeight * 0.55));
      items.sort((left, right) => right.rect.bottom - left.rect.bottom || right.rect.width - left.rect.width);
      return items[0]?.el || null;
    };
    const active = document.activeElement;
    if (isEditable(active)) return active;
    const selectionNode = window.getSelection?.()?.focusNode;
    const selectionElement = selectionNode?.nodeType === Node.ELEMENT_NODE ? selectionNode : selectionNode?.parentElement;
    const selected = selectionElement?.closest?.('[contenteditable], [role="textbox"], textarea, input');
    if (isEditable(selected)) return selected;
    if (isEditable(window.__dfLastNativeComposer)) return window.__dfLastNativeComposer;
    const selectors = [
      '.chat-input-main .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="plaintext-only"][role="textbox"]',
      'footer [contenteditable][role="textbox"]',
      'footer [contenteditable="true"]',
      'footer [contenteditable="plaintext-only"]',
      'footer [contenteditable]',
      '[data-testid="conversation-compose-box-input"]',
      '[data-testid="input-message-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="plaintext-only"][role="textbox"]',
      '[contenteditable][role="textbox"]',
      '.input-message-input[contenteditable]',
      '.input-message-container [contenteditable]',
      'textarea'
    ];
    for (const selector of selectors) {
      const items = Array.from(document.querySelectorAll(selector)).filter(isEditable);
      if (items.length) return items[items.length - 1];
    }
    return findBottomEditableComposer();
  };
  const composer = findComposer();
  if (composer) window.__dfLastNativeComposer = composer;
  const text = readComposerPlainText(composer);
  const mediaCaptionActive = Boolean(composer && isMediaCaptionComposer(composer));
  return {
    host: location.host,
    title: document.title,
    guard: window.__dfNativeEnterGuardInstalled || '',
    typing: window.__dfNativeTypingStateInstalled || '',
    click: window.__dfNativeClickGuardInstalled || '',
    queueLength: Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue.length : 0,
    hasComposer: Boolean(composer),
    activeTag: document.activeElement?.tagName || '',
    activeRole: document.activeElement?.getAttribute?.('role') || '',
    activeEditable: document.activeElement?.getAttribute?.('contenteditable') || '',
    composerIsMediaCaption: mediaCaptionActive,
    activeIsMediaCaption: Boolean(isMediaCaptionComposer(document.activeElement)),
    mediaCaptionCandidateCount: Array.from(document.querySelectorAll(
      '.simple-message-input-container .input-message-container.simple-message-input-inputs [contenteditable]'
    )).filter(isMediaCaptionComposer).length,
    mediaFocusGuardRequestId: window.__dfTelegramMediaCaptionFocusGuard?.requestId || '',
    mediaFocusGuardTargetConnected: Boolean(window.__dfTelegramMediaCaptionFocusGuard?.target?.isConnected),
    textLength: text.trim().length,
    hasChinese: /[\\u4e00-\\u9fff]/.test(text),
    hasEnglish: /[A-Za-z]{2,}/.test(text),
    textPreview: text.replace(/\\s+/g, ' ').trim().slice(0, 80),
    translatedReady: composer?.dataset?.dfTranslatedReady || '',
    requestId: composer?.dataset?.dfTranslatorRequestId || '',
    readyRequestId: composer?.dataset?.dfTranslatorReadyRequestId || '',
    pending: composer?.dataset?.dfTranslationPending || '',
    enterCount: Number(window.__dfTelegramEnterCount || 0),
    enterTrace: window.__dfTelegramEnterTrace || null
  };
})()
`;
}

function buildInjectedComposerScript(action: 'install' | 'focus' | 'focusNative' | 'state', state: Record<string, string> = {}) {
  const payload = JSON.stringify({ action, state });
  const composerTheme = activeTheme.value;
  const peekTheme = composerTheme === 'pink'
    ? {
      'dim-bg': 'rgba(68, 23, 48, .42)',
      'card-bg': 'rgba(255, 248, 251, .96)',
      border: 'rgba(225, 103, 151, .46)',
      shadow: '0 22px 70px rgba(203, 101, 145, .28), 0 0 0 1px rgba(255,255,255,.62) inset',
      text: '#7b244f',
      title: '#7b244f',
      muted: 'rgba(75, 51, 64, .66)',
      source: '#4b3340',
      translation: '#d85b92',
      waiting: 'rgba(123, 36, 79, .58)',
      'item-border': 'rgba(225, 103, 151, .18)',
      'count-bg': '#ff6fa8',
      'count-color': '#fff',
      outline: 'rgba(255, 111, 168, .86)'
    }
    : composerTheme === 'murongPurple'
      ? {
        'dim-bg': 'rgba(12, 8, 13, .64)',
        'card-bg': 'rgba(33, 24, 32, .96)',
        border: 'rgba(180, 142, 173, .62)',
        shadow: '0 22px 70px rgba(0,0,0,.52), 0 0 0 1px rgba(214,166,184,.08) inset',
        text: '#eadde4',
        title: '#f0c9d8',
        muted: 'rgba(234, 221, 228, .66)',
        source: 'rgba(255,255,255,.84)',
        translation: '#d6a6b8',
        waiting: 'rgba(214, 166, 184, .64)',
        'item-border': 'rgba(180, 142, 173, .2)',
        'count-bg': '#8c4967',
        'count-color': '#fff',
        outline: 'rgba(214, 166, 184, .84)'
      }
    : composerTheme === 'clearWaterBlue'
      ? {
        'dim-bg': 'rgba(48, 118, 158, .24)',
        'card-bg': 'rgba(250, 254, 255, .98)',
        border: 'rgba(74, 173, 232, .48)',
        shadow: '0 22px 70px rgba(45, 128, 177, .22), 0 0 0 1px rgba(255,255,255,.82) inset',
        text: '#17364a',
        title: '#277fb8',
        muted: 'rgba(23, 54, 74, .62)',
        source: '#294b60',
        translation: '#268bc5',
        waiting: 'rgba(39, 127, 184, .58)',
        'item-border': 'rgba(74, 173, 232, .2)',
        'count-bg': '#ff8b70',
        'count-color': '#fff',
        outline: 'rgba(74, 173, 232, .84)'
      }
    : {
      'dim-bg': 'rgba(0, 0, 0, .58)',
      'card-bg': 'rgba(12, 13, 18, .94)',
      border: 'rgba(242, 220, 157, .72)',
      shadow: '0 22px 70px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04) inset',
      text: '#f5e4ad',
      title: '#ffe9a6',
      muted: 'rgba(245, 228, 173, .68)',
      source: 'rgba(255,255,255,.84)',
      translation: '#f6d983',
      waiting: 'rgba(245, 228, 173, .62)',
      'item-border': 'rgba(242, 220, 157, .18)',
      'count-bg': '#b91c1c',
      'count-color': '#fff',
      outline: 'rgba(242, 220, 157, .88)'
    };
  const peekThemeCss = Object.entries(peekTheme)
    .map(([key, value]) => `        --df-peek-${key}: ${value};`)
    .join('\n');
  const styleVersion = JSON.stringify(`2026-07-23-telegram-no-review-v9-${composerTheme}`);
  return `
(() => {
  const payload = ${payload};
  const telegramComposerMode = location.hostname.toLowerCase() === 'web.telegram.org';
${buildComposerPlainTextReaderSource()}
${buildDirectSendHttpUrlSource()}
${buildMediaCaptionComposerSource()}
  const removeLegacyInputHint = () => {
    window.clearTimeout(window.__dfTranslatorHintTimer);
    window.__dfInputHintMutationObserver?.disconnect?.();
    if (window.__dfInputHintInputHandler) {
      document.removeEventListener('input', window.__dfInputHintInputHandler, true);
      document.removeEventListener('paste', window.__dfInputHintInputHandler, true);
      document.removeEventListener('cut', window.__dfInputHintInputHandler, true);
      window.removeEventListener('resize', window.__dfInputHintInputHandler);
    }
    if (window.__dfInputHintKeyupHandler) document.removeEventListener('keyup', window.__dfInputHintKeyupHandler, true);
    if (window.__dfInputHintFocusHandler) document.removeEventListener('focusin', window.__dfInputHintFocusHandler, true);
    window.__dfInputHintGuardInstalled = '';
    window.__dfInputHintInputHandler = null;
    window.__dfInputHintKeyupHandler = null;
    window.__dfInputHintFocusHandler = null;
    window.__dfInputHintMutationObserver = null;
    window.__dfInputHintObservedComposer = null;
    for (const hint of Array.from(document.querySelectorAll('#df-translator-input-hint, .df-translator-input-hint'))) hint.remove();
    if (window.__dfComposerStatePositionHandler) {
      window.removeEventListener('resize', window.__dfComposerStatePositionHandler);
      document.removeEventListener('scroll', window.__dfComposerStatePositionHandler, true);
    }
    window.__dfComposerStatePositionHandler = null;
    window.__dfSetComposerState = null;
    document.getElementById('df-composer-state')?.remove();
  };
  removeLegacyInputHint();
  const installStyle = () => {
    const styleVersion = ${styleVersion};
    let style = document.getElementById('df-translator-style');
    if (style?.dataset.version === styleVersion) return;
    if (!style) {
      style = document.createElement('style');
      style.id = 'df-translator-style';
      document.head.appendChild(style);
    }
    style.dataset.version = styleVersion;
    style.textContent = \`
      :root {
${peekThemeCss}
      }
      .df-translator-host {
        display: none !important;
        visibility: hidden !important;
        overflow: hidden !important;
        width: 0 !important;
        height: 0 !important;
        max-width: 0 !important;
        max-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent;
        box-sizing: border-box;
      }
      [data-df-whatsapp-message-menu-layer="1"] {
        z-index: 2147483600 !important;
      }
      .df-translator-proxy {
        min-height: 20px;
        color: rgba(90, 95, 105, .68);
        font-size: 12px;
        line-height: 20px;
        overflow: hidden;
      }
      .df-translator-proxy span {
        display: inline-block;
        text-decoration-line: underline;
        text-decoration-style: wavy;
        text-decoration-color: rgba(90, 95, 105, .42);
        text-underline-offset: 4px;
        animation: dfTypingWave 1.12s ease-in-out infinite;
      }
      .df-translator-input {
        width: 100%;
        min-height: 42px;
        max-height: 96px;
        border: 1px solid rgba(120, 130, 150, .25);
        border-radius: 9px;
        padding: 10px 12px;
        color: #111827;
        background: rgba(255, 255, 255, .92);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.8), 0 5px 16px rgba(0,0,0,.08);
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
        resize: none;
        outline: none;
        box-sizing: border-box;
        caret-color: transparent;
      }
      .df-translator-input:focus {
        border-color: rgba(34, 197, 94, .45);
        box-shadow: 0 0 0 3px rgba(34,197,94,.12), inset 0 1px 0 rgba(255,255,255,.8);
      }
      .df-translator-meta {
        display: none !important;
        justify-content: space-between;
        gap: 8px;
        color: rgba(90, 95, 105, .72);
        font-size: 12px;
        line-height: 16px;
      }
      .df-peek-dim {
        position: fixed;
        inset: 0;
        z-index: 2147482990;
        background: var(--df-peek-dim-bg);
        pointer-events: none;
        opacity: 0;
        transition: opacity 130ms ease;
      }
      .df-peek-dim.is-visible {
        opacity: 1;
      }
      .df-peek-card {
        position: fixed;
        z-index: 2147482992;
        width: min(840px, calc(100vw - 32px));
        max-height: min(520px, calc(100vh - 36px));
        overflow: hidden;
        border: 1px solid var(--df-peek-border);
        border-radius: 8px;
        background: var(--df-peek-card-bg);
        box-shadow: var(--df-peek-shadow);
        color: var(--df-peek-text);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(14px, 14px, 0) scale(.98);
        transition: opacity 120ms ease, transform 120ms ease;
      }
      .df-peek-card.is-visible {
        opacity: 1;
        transform: translate3d(14px, 14px, 0) scale(1);
      }
      .df-peek-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 10px 12px 8px;
        border-bottom: 1px solid var(--df-peek-item-border);
      }
      .df-peek-title {
        min-width: 0;
        overflow: hidden;
        color: var(--df-peek-title);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .df-peek-count {
        flex: 0 0 auto;
        min-width: 24px;
        border-radius: 999px;
        padding: 2px 8px;
        background: var(--df-peek-count-bg);
        color: var(--df-peek-count-color);
        font-weight: 700;
        text-align: center;
      }
      .df-peek-body {
        max-height: 448px;
        overflow: hidden auto;
        padding: 10px 12px 12px;
      }
      .df-peek-kicker {
        margin-bottom: 8px;
        color: var(--df-peek-muted);
        font-size: 12px;
      }
      .df-peek-item {
        padding: 8px 0;
        border-top: 1px solid var(--df-peek-item-border);
      }
      .df-peek-item:first-of-type {
        border-top: 0;
        padding-top: 0;
      }
      .df-peek-source {
        color: var(--df-peek-source);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .df-peek-translation {
        margin-top: 5px;
        color: var(--df-peek-translation);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .df-peek-waiting {
        color: var(--df-peek-waiting);
      }
      .df-peek-row {
        position: relative;
        z-index: 2147482991 !important;
        outline: 2px solid var(--df-peek-outline) !important;
        outline-offset: -2px !important;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0) !important;
      }
      @keyframes dfTypingWave {
        0%,100% { transform: translateY(0); opacity: .6; }
        50% { transform: translateY(-2px); opacity: .95; }
      }
    \`;
  };
  const installWhatsAppMessageMenuLayerGuard = () => {
    const hostname = location.hostname.toLowerCase();
    if (hostname !== 'web.whatsapp.com' && !hostname.endsWith('.whatsapp.com')) return;
    const guardVersion = '2026-07-22-whatsapp-message-menu-layer-v1';
    const promoteMessageMenus = () => {
      const visitedLists = new Set();
      for (const item of Array.from(document.querySelectorAll('button[role="menuitem"], [role="menuitem"]'))) {
        const list = item.parentElement;
        if (!list || visitedLists.has(list)) continue;
        visitedLists.add(list);
        const menuItems = Array.from(list.children).filter((candidate) => candidate.matches?.('button[role="menuitem"], [role="menuitem"]'));
        if (menuItems.length < 3) continue;
        const labels = menuItems.map((candidate) => [
          candidate.getAttribute?.('aria-label') || '',
          candidate.textContent || ''
        ].join(' ').trim()).join('\\n');
        const isMessageMenu = /(?:回复|\\breply\\b)/i.test(labels)
          && /(?:复制|\\bcopy\\b)/i.test(labels)
          && /(?:转发|\\bforward\\b)/i.test(labels);
        if (!isMessageMenu) continue;
        const popup = list.parentElement;
        if (!popup || popup === document.body || popup === document.documentElement) continue;
        popup.dataset.dfWhatsappMessageMenuLayer = '1';
        popup.style.setProperty('z-index', '2147483600', 'important');
        if (window.getComputedStyle(popup).position === 'static') {
          popup.style.setProperty('position', 'relative', 'important');
        }
      }
    };
    const schedulePromotion = () => {
      if (window.__dfWhatsappMessageMenuLayerFrame) {
        window.cancelAnimationFrame(window.__dfWhatsappMessageMenuLayerFrame);
      }
      window.clearTimeout(window.__dfWhatsappMessageMenuLayerTimer);
      window.__dfWhatsappMessageMenuLayerFrame = window.requestAnimationFrame(() => {
        window.__dfWhatsappMessageMenuLayerFrame = 0;
        promoteMessageMenus();
      });
      window.__dfWhatsappMessageMenuLayerTimer = window.setTimeout(promoteMessageMenus, 80);
    };
    if (window.__dfWhatsappMessageMenuLayerInstalled !== guardVersion) {
      if (window.__dfWhatsappMessageMenuLayerClickHandler) {
        document.removeEventListener('click', window.__dfWhatsappMessageMenuLayerClickHandler, true);
      }
      if (window.__dfWhatsappMessageMenuLayerKeyupHandler) {
        document.removeEventListener('keyup', window.__dfWhatsappMessageMenuLayerKeyupHandler, true);
      }
      window.__dfWhatsappMessageMenuLayerInstalled = guardVersion;
      window.__dfWhatsappMessageMenuLayerClickHandler = schedulePromotion;
      window.__dfWhatsappMessageMenuLayerKeyupHandler = (event) => {
        if (event.key === 'Enter' || event.key === ' ') schedulePromotion();
      };
      document.addEventListener('click', window.__dfWhatsappMessageMenuLayerClickHandler, true);
      document.addEventListener('keyup', window.__dfWhatsappMessageMenuLayerKeyupHandler, true);
    }
    promoteMessageMenus();
  };
  const isVisible = (el) => {
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake/.test(className)) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 60
      && rect.height > 20
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && style.pointerEvents !== 'none';
  };
  const isEditableElement = (el) => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const isCandidateComposer = (el) => {
    if (!el || !isVisible(el) || !isEditableElement(el)) return false;
    if (el.closest?.('.df-translator-host, .df-composer-review, #df-composer-state, .df-composer-state')) return false;
    if (el.closest?.('[role="dialog"]') && !isMediaCaptionComposer(el)) return false;
    if (el.querySelector?.('.df-translator-status, .df-translator-proxy, .df-translator-input, #df-composer-state, .df-composer-state')) return false;
    const label = ((el.getAttribute('role') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
    const className = (el.className || '').toString();
    return !/search|filter|find/.test(label) && !/input-field-input-fake|input-message-input-fake|df-translator|df-composer-state/.test(className);
  };
  const translatorEventQueueLimit = 256;
  const queueTranslatorEvent = (payload) => {
    if (payload.action === 'translate') {
      const textKey = (payload.text || '').trim();
      const composerKind = payload.composerKind || 'default';
      const requestId = payload.requestId || '';
      const now = Date.now();
      const last = window.__dfTranslatorLastTranslate || {};
      if (
        last.text === textKey &&
        last.composerKind === composerKind &&
        last.requestId === requestId &&
        now - last.at < 1000
      ) return;
      window.__dfTranslatorLastTranslate = { text: textKey, composerKind, requestId, at: now };
    }
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    if (payload.action === 'typing') {
      window.__dfTranslatorQueue = window.__dfTranslatorQueue.filter((event) => event?.action !== 'typing');
    }
    window.__dfTranslatorQueue.push({
      ...payload,
      conversationSignature: window.__dfConversationSignature || '',
      at: Date.now()
    });
    while (window.__dfTranslatorQueue.length > translatorEventQueueLimit) {
      const discardableIndex = window.__dfTranslatorQueue.findIndex((event) => (
        event?.action === 'typing' || event?.action === 'debug' || event?.action === 'unread-peek-debug'
      ));
      window.__dfTranslatorQueue.splice(discardableIndex >= 0 ? discardableIndex : 0, 1);
    }
  };
  const createComposerRequestId = () => {
    const randomPart = window.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    return 'composer-' + randomPart;
  };
  const installUnreadPeek = () => {
    const peekVersion = '2026-07-09-unread-peek-v6';
    const unreadPeekHoverDelayMs = 1000;
    const peekPlatform = (() => {
      const host = location.hostname || '';
      if (/web\\.telegram\\.org/i.test(host)) return 'telegram';
      if (/web\\.whatsapp\\.com/i.test(host)) return 'whatsapp';
      return 'signal';
    })();
    const normalizePeekText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const hasLatin = (value) => /[A-Za-z]{2,}/.test(value || '');
    const hasChinese = (value) => /[\\u4e00-\\u9fff]/.test(value || '');
    const removeUnreadPeekListeners = () => {
      window.clearTimeout(window.__dfUnreadPeekTimer);
      if (window.__dfUnreadPeekPointerMoveHandler) {
        document.removeEventListener('pointermove', window.__dfUnreadPeekPointerMoveHandler, true);
        document.removeEventListener('pointerleave', window.__dfUnreadPeekPointerLeaveHandler, true);
        document.removeEventListener('keydown', window.__dfUnreadPeekKeyDownHandler, true);
        window.removeEventListener('blur', window.__dfUnreadPeekBlurHandler);
      }
      const state = window.__dfUnreadPeekState || {};
      state.row?.classList?.remove('df-peek-row', 'df-unread-peek-row');
      for (const row of Array.from(document.querySelectorAll('.df-unread-peek-row, .df-peek-row'))) {
        row.classList.remove('df-unread-peek-row', 'df-peek-row');
      }
      window.__dfUnreadPeekState = { visible: false };
      document.body?.classList?.remove('df-peek-own-active');
      document.getElementById('df-peek-dim')?.classList.remove('is-visible');
      document.getElementById('df-peek-card')?.classList.remove('is-visible');
      document.getElementById('df-unread-peek-dim')?.remove();
      document.getElementById('df-unread-peek-card')?.remove();
    };
    const safeQueryAll = (root, selector) => {
      try {
        return Array.from((root || document).querySelectorAll(selector));
      } catch {
        return [];
      }
    };
    const queueUnreadPeekDebug = (message, minInterval = 2500) => {
      const now = Date.now();
      if (window.__dfUnreadPeekDebugMessage === message && now - (window.__dfUnreadPeekDebugAt || 0) < minInterval) return;
      window.__dfUnreadPeekDebugMessage = message;
      window.__dfUnreadPeekDebugAt = now;
      queueTranslatorEvent({ action: 'unread-peek-debug', text: message });
    };
    const rowSelectors = [
      '.module-conversation-list__item--contact-or-conversation',
      '#pane-side [role="listitem"]',
      '#pane-side [role="row"]',
      '#pane-side [data-testid*="cell"]',
      '#pane-side [data-testid*="chat"]',
      '[aria-label*="Chat list" i] [role="listitem"]',
      '[aria-label*="chat list" i] [role="listitem"]',
      '.chatlist .ListItem',
      '.chatlist [class*="ListItem"]',
      '[class*="chatlist"] [class*="ListItem"]',
      '.chatlist [data-peer-id]',
      '.chatlist .chatlist-chat',
      '.chatlist a[href*="#"]',
      '[class*="chatlist"] [data-peer-id]',
      '[class*="DialogList"] [data-peer-id]',
      '.dialogs-list [data-peer-id]',
      '.dialogs-list [class*="ListItem"]',
      '[class*="DialogList"] [class*="ListItem"]',
      '[class*="ConversationList"] [role="row"]',
      '[class*="conversation-list"] [role="row"]',
      '[class*="module-left-pane"] [role="row"]',
      '[data-testid*="LeftPane"] [role="row"]'
    ];
    const badgeSelectors = [
      '[aria-label*="unread" i]',
      '[aria-label*="未读"]',
      '[aria-label*="未讀"]',
      '[data-testid*="unread" i]',
      '[class*="unread" i]',
      '[class*="badge" i]',
      '.badge',
      '[data-icon="unread-count"]'
    ];
    const isLikelyChatListRow = (row) => {
      if (!row || !(row instanceof Element)) return false;
      if (row.closest('footer, header, [role="textbox"], [contenteditable="true"], .df-translator-host, .df-peek-card, .df-unread-peek-card')) return false;
      const rect = row.getBoundingClientRect();
      const style = window.getComputedStyle(row);
      return rect.width >= 120
        && rect.height >= 32
        && rect.height <= (peekPlatform === 'signal' ? 156 : 128)
        && rect.left < window.innerWidth * (peekPlatform === 'whatsapp' ? 0.62 : 0.58)
        && rect.right <= window.innerWidth * (peekPlatform === 'whatsapp' ? 0.78 : 0.72)
        && rect.bottom >= 0
        && rect.top <= window.innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    };
    const rowFromTarget = (target) => {
      if (!target?.closest) return null;
      for (const selector of rowSelectors) {
        let row = null;
        try {
          row = target.closest(selector);
        } catch {
          row = null;
        }
        if (row && isLikelyChatListRow(row)) return row;
      }
      const fallback = target.closest('[role="listitem"], [role="row"], li, a, [class*="ListItem"], [class*="conversation"], [class*="dialog"]');
      return isLikelyChatListRow(fallback) ? fallback : null;
    };
    const findUnreadRow = (target, clientX = 0, clientY = 0) => {
      const targets = [];
      if (target) targets.push(target);
      if (Number.isFinite(clientX) && Number.isFinite(clientY) && document.elementsFromPoint) {
        targets.push(...document.elementsFromPoint(clientX, clientY));
      }
      for (const item of targets) {
        const row = rowFromTarget(item);
        if (!row) continue;
        if (unreadCountForRow(row) > 0 || rowHasPeekablePreview(row)) return row;
      }
      return null;
    };
    const numberFromText = (value) => {
      const text = normalizePeekText(value);
      const match = text.match(/(?:^|\\D)(\\d{1,3})(?:\\D|$)/);
      if (!match) return 0;
      const count = Number(match[1]);
      return Number.isFinite(count) ? Math.max(0, Math.min(999, count)) : 0;
    };
    function unreadCountForRow(row) {
      let count = 0;
      const rowLabel = normalizePeekText([
        row.getAttribute('aria-label') || '',
        row.getAttribute('title') || '',
        row.getAttribute('data-testid') || '',
        row.className || ''
      ].join(' '));
      if (/unread|未读|未讀/i.test(rowLabel)) count = Math.max(count, numberFromText(rowLabel) || 1);
      for (const selector of badgeSelectors) {
        for (const badge of safeQueryAll(row, selector).slice(0, 6)) {
          const badgeText = normalizePeekText([
            badge.getAttribute('aria-label') || '',
            badge.getAttribute('title') || '',
            badge.textContent || ''
          ].join(' '));
          if (!badgeText && !/unread/i.test(selector)) continue;
          const badgeCount = numberFromText(badgeText) || (/unread|未读|未讀/i.test(badgeText + ' ' + selector) ? 1 : 0);
          count = Math.max(count, badgeCount);
        }
      }
      return count;
    }
    const attributeTextLines = (row) => {
      const values = [];
      const add = (value) => {
        const text = normalizePeekText(value || '');
        if (text && !values.includes(text)) values.push(text);
      };
      add(row.getAttribute('aria-label'));
      add(row.getAttribute('title'));
      for (const el of safeQueryAll(row, '[title], [aria-label]').slice(0, 24)) {
        add(el.getAttribute('title'));
        add(el.getAttribute('aria-label'));
      }
      return values;
    };
    const rowTextLines = (row) => {
      const clone = row.cloneNode(true);
      for (const node of Array.from(clone.querySelectorAll('button, [role="button"], svg, canvas, img, .df-peek-card, .df-peek-dim, .df-unread-peek-card, .df-unread-peek-dim'))) {
        node.remove();
      }
      const raw = (clone.innerText || clone.textContent || '').replace(/\\r/g, '\\n');
      const lines = raw
        .split('\\n')
        .map((line) => normalizePeekText(line))
        .filter(Boolean);
      return [...attributeTextLines(row), ...lines].filter((line, index, items) => items.indexOf(line) === index);
    };
    const whatsappPreviewLines = (row) => {
      if (peekPlatform !== 'whatsapp') return [];
      const values = [];
      const add = (value) => {
        const text = cleanWhatsappPreviewText(value || '');
        if (text && !values.includes(text)) values.push(text);
      };
      const selectors = [
        'span[dir="ltr"]',
        'span[dir="auto"]',
        '[data-testid="last-msg-status"] + span',
        '[data-testid*="last-msg"]',
        '[class*="x1iyjqo2"][class*="x10wlt62"]'
      ];
      for (const selector of selectors) {
        for (const el of safeQueryAll(row, selector).slice(0, 12)) {
          add(el.getAttribute('title'));
          add(el.getAttribute('aria-label'));
          add(el.textContent);
        }
      }
      return values;
    };
    const bestWhatsappPreviewLine = (row, unreadCount) => {
      return whatsappPreviewLines(row)
        .filter((line) => !isNoiseLine(line, unreadCount) && hasLatin(line) && !hasChinese(line) && line.length >= 3)
        .sort((left, right) => right.length - left.length)[0] || '';
    };
    const telegramPeerIdForRow = (row) => {
      if (peekPlatform !== 'telegram') return '';
      return normalizePeekText(
        row.getAttribute('data-peer-id') ||
        row.querySelector('[data-peer-id]')?.getAttribute('data-peer-id') ||
        ''
      );
    };
    const telegramTitleForRow = (row) => {
      if (peekPlatform !== 'telegram') return '';
      const titleNode =
        row.querySelector('.peer-title-inner') ||
        row.querySelector('.peer-title') ||
        row.querySelector('.user-title') ||
        row.querySelector('.row-title');
      return normalizePeekText(titleNode?.getAttribute?.('title') || titleNode?.textContent || '');
    };
    const peekTextIdentity = (value) => normalizePeekText(value)
      .normalize('NFKC')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase();
    const telegramRowPreviewLines = (row) => {
      if (peekPlatform !== 'telegram') return [];
      const values = [];
      const identities = new Set();
      const add = (value) => {
        const text = normalizePeekText(value);
        const identity = peekTextIdentity(text);
        if (text && identity && !identities.has(identity)) {
          identities.add(identity);
          values.push(text);
        }
      };
      const selectors = [
        '.dialog-subtitle-span-last',
        '.dialog-subtitle-span',
        '.user-last-message',
        '.row-subtitle',
        '.dialog-subtitle'
      ];
      for (const selector of selectors) {
        for (const el of safeQueryAll(row, selector).slice(0, 8)) {
          add(el.getAttribute('title'));
          add(el.textContent);
        }
      }
      return values;
    };
    const telegramPreviewLines = (row) => telegramRowPreviewLines(row);
    const signalPreviewLines = (row) => {
      if (peekPlatform !== 'signal') return [];
      const values = [];
      const identities = new Set();
      const textNodes = safeQueryAll(
        row,
        '.module-conversation-list__item--contact-or-conversation__content__message__text'
      );
      const candidates = textNodes.length
        ? textNodes
        : safeQueryAll(row, '.module-conversation-list__item--contact-or-conversation__content__message');
      for (const el of candidates.slice(0, 4)) {
        const clone = el.cloneNode(true);
        for (const noise of Array.from(clone.querySelectorAll([
          '[class*="status-icon"]',
          '[class*="draft-prefix"]',
          '[class*="unread-indicator"]',
          '[class*="unread-indicators"]',
          'svg',
          'img',
          'button'
        ].join(',')))) noise.remove();
        const text = normalizePeekText(clone.innerText || clone.textContent || '');
        const identity = peekTextIdentity(text);
        if (text && identity && !identities.has(identity)) {
          identities.add(identity);
          values.push(text);
        }
      }
      return values.slice(0, 1);
    };
    const signalTitleForRow = (row) => normalizePeekText(
      row.querySelector('.module-conversation-list__item--contact-or-conversation__content__header__name__contact-name')?.textContent ||
      row.querySelector('.module-conversation-list__item--contact-or-conversation__content__header__name')?.textContent ||
      row.getAttribute('aria-label') ||
      'Signal 联系人'
    );
    const telegramContactMetaForRow = (row) => {
      const peerId = telegramPeerIdForRow(row);
      const title = telegramTitleForRow(row) || (peerId ? 'Telegram ' + peerId : '');
      return {
        title,
        contactId: peerId,
        contactIdType: peerId ? 'platform' : '',
        contactKey: peerId ? 'telegram-peer-' + peerId : ''
      };
    };
    const rowHasPeekablePreview = (row) => {
      const unreadCount = unreadCountForRow(row);
      if (peekPlatform === 'whatsapp') {
        return unreadCount > 0 && Boolean(bestWhatsappPreviewLine(row, unreadCount));
      }
      if (peekPlatform === 'telegram') {
        if (unreadCount <= 0) return false;
        return telegramPreviewLines(row, unreadCount)
          .some((line) => !isNoiseLine(line, unreadCount) && hasLatin(line) && !hasChinese(line));
      }
      if (peekPlatform === 'signal') {
        if (unreadCount <= 0) return false;
        return signalPreviewLines(row)
          .some((line) => !isNoiseLine(line, unreadCount) && hasLatin(line) && !hasChinese(line));
      }
      return [...whatsappPreviewLines(row), ...rowTextLines(row)]
        .some((line) => !isNoiseLine(line, unreadCount) && hasLatin(line) && !hasChinese(line));
    };
    const isNoiseLine = (line, unreadCount) => {
      const text = normalizePeekText(line);
      if (!text) return true;
      if (/^wds-ic-[a-z0-9-]+$/i.test(text)) return true;
      if (/^(?:delivered|read|sent|sending|message delivered|message read|message sent)$/i.test(text)) return true;
      if (/^(?:yesterday|today|mon|tue|wed|thu|fri|sat|sun|上午|下午|昨天|今天)$/i.test(text)) return true;
      if (/^(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?$/.test(text)) return true;
      if (/^\\d{1,3}$/.test(text) && Number(text) === unreadCount) return true;
      if (/unread|未读|未讀/i.test(text) && text.length < 28) return true;
      return false;
    };
    const cleanWhatsappPreviewText = (line) => {
      let text = normalizePeekText(line);
      text = text.replace(/\\bwds-ic-[a-z0-9-]+\\b/gi, ' ');
      text = text.replace(/\\b(?:delivered|read|sent|sending|message delivered|message read|message sent)\\b/gi, ' ');
      return normalizePeekText(text);
    };
    const extractPeekData = (row) => {
      const unreadCount = unreadCountForRow(row);
      const previewText = peekPlatform === 'whatsapp' ? bestWhatsappPreviewLine(row, unreadCount) : '';
      const telegramContact = peekPlatform === 'telegram' ? telegramContactMetaForRow(row) : null;
      const directPeekLines = peekPlatform === 'telegram'
        ? telegramPreviewLines(row, unreadCount)
        : peekPlatform === 'signal'
          ? signalPreviewLines(row)
          : (previewText ? [previewText] : []);
      const lines = [
        ...directPeekLines,
        ...(peekPlatform === 'whatsapp' && !previewText ? whatsappPreviewLines(row) : []),
        ...(peekPlatform === 'telegram' ? [] : rowTextLines(row))
      ]
        .filter((line, index, items) => items.indexOf(line) === index)
        .filter((line) => !isNoiseLine(line, unreadCount));
      const title = telegramContact?.title || (peekPlatform === 'signal' ? signalTitleForRow(row) : '') || lines.find((line) => line && !hasLatin(line)) || lines[0] || '未读联系人';
      const itemTexts = directPeekLines
        .filter((line, index, items) => items.findIndex((item) => peekTextIdentity(item) === peekTextIdentity(line)) === index)
        .filter((line) => !isNoiseLine(line, unreadCount) && hasLatin(line) && !hasChinese(line) && line.length >= 3)
        .slice(0, peekPlatform === 'telegram' || peekPlatform === 'signal' ? 1 : 12);
      const seen = new Set();
      for (const line of itemTexts) seen.add(peekTextIdentity(line));
      if (!itemTexts.length) {
        for (const line of lines) {
          if (line === title || isNoiseLine(line, unreadCount)) continue;
          if (!hasLatin(line) || hasChinese(line)) continue;
          const identity = peekTextIdentity(line);
          if (seen.has(identity)) continue;
          seen.add(identity);
          itemTexts.push(line);
          if (itemTexts.length >= 12) break;
        }
      }
      if (!itemTexts.length) {
        const fallback = lines.filter((line) => line !== title).join(' ');
        if (hasLatin(fallback) && !hasChinese(fallback)) itemTexts.push(fallback.slice(0, 500));
      }
      return {
        title,
        platform: peekPlatform,
        contactId: telegramContact?.contactId || '',
        contactIdType: telegramContact?.contactIdType || '',
        contactKey: telegramContact?.contactKey || '',
        unreadCount: unreadCount || itemTexts.length || 1,
        items: itemTexts.map((text, index) => ({ id: 'item-' + index + '-' + hashPeekText(text), text }))
      };
    };
    const hashPeekText = (text) => {
      let hash = 2166136261;
      for (const char of normalizePeekText(text)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    };
    const ensurePeekDom = () => {
      let dim = document.getElementById('df-peek-dim');
      if (!dim) {
        dim = document.createElement('div');
        dim.id = 'df-peek-dim';
        dim.className = 'df-peek-dim';
        dim.setAttribute('aria-hidden', 'true');
        document.body.appendChild(dim);
      }
      let card = document.getElementById('df-peek-card');
      if (!card) {
        card = document.createElement('div');
        card.id = 'df-peek-card';
        card.className = 'df-peek-card';
        card.setAttribute('aria-hidden', 'true');
        document.body.appendChild(card);
      }
      return { dim, card };
    };
    const positionPeekCard = (x, y) => {
      const card = document.getElementById('df-peek-card');
      if (!card) return;
      const margin = 14;
      const rect = card.getBoundingClientRect();
      let left = x + 16;
      let top = y + 46;
      if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, x - rect.width - 16);
      if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, y - rect.height - 16);
      card.style.left = left + 'px';
      card.style.top = top + 'px';
    };
    const renderPeekCard = (data, translatedItems = []) => {
      const { dim, card } = ensurePeekDom();
      document.body.classList.add('df-peek-own-active');
      card.textContent = '';
      const head = document.createElement('div');
      head.className = 'df-peek-head';
      const title = document.createElement('div');
      title.className = 'df-peek-title';
      title.textContent = data.title || '未读联系人';
      const count = document.createElement('div');
      count.className = 'df-peek-count';
      count.textContent = String(data.unreadCount || data.items?.length || 1);
      head.appendChild(title);
      head.appendChild(count);
      const body = document.createElement('div');
      body.className = 'df-peek-body';
      const kicker = document.createElement('div');
      kicker.className = 'df-peek-kicker';
      kicker.textContent = '预览模式，不会触发消息已读。';
      body.appendChild(kicker);
      const translations = new Map((translatedItems || []).map((item) => [item.id, item.translatedText || '']));
      for (const item of data.items || []) {
        const node = document.createElement('div');
        node.className = 'df-peek-item';
        const source = document.createElement('div');
        source.className = 'df-peek-source';
        source.textContent = item.text;
        const translated = document.createElement('div');
        const translatedText = translations.get(item.id) || '';
        translated.className = translatedText ? 'df-peek-translation' : 'df-peek-translation df-peek-waiting';
        translated.textContent = translatedText || '翻译中...';
        node.appendChild(source);
        node.appendChild(translated);
        body.appendChild(node);
      }
      card.appendChild(head);
      card.appendChild(body);
      dim.classList.add('is-visible');
      card.classList.add('is-visible');
      window.__dfUnreadPeekState = { ...(window.__dfUnreadPeekState || {}), visible: true, data };
      positionPeekCard(window.__dfUnreadPeekMouseX || 24, window.__dfUnreadPeekMouseY || 24);
    };
    const renderPeekNotice = (data, message) => {
      const { dim, card } = ensurePeekDom();
      document.body.classList.add('df-peek-own-active');
      card.textContent = '';
      const head = document.createElement('div');
      head.className = 'df-peek-head';
      const title = document.createElement('div');
      title.className = 'df-peek-title';
      title.textContent = data.title || 'Signal';
      const count = document.createElement('div');
      count.className = 'df-peek-count';
      count.textContent = '!';
      head.appendChild(title);
      head.appendChild(count);
      const body = document.createElement('div');
      body.className = 'df-peek-body';
      const kicker = document.createElement('div');
      kicker.className = 'df-peek-kicker';
      kicker.textContent = '预览模式，不会触发消息已读。';
      const note = document.createElement('div');
      note.className = 'df-peek-source';
      note.textContent = message;
      body.appendChild(kicker);
      body.appendChild(note);
      card.appendChild(head);
      card.appendChild(body);
      dim.classList.add('is-visible');
      card.classList.add('is-visible');
      window.__dfUnreadPeekState = { ...(window.__dfUnreadPeekState || {}), visible: true, data };
      positionPeekCard(window.__dfUnreadPeekMouseX || 24, window.__dfUnreadPeekMouseY || 24);
    };
    const hidePeek = () => {
      window.clearTimeout(window.__dfUnreadPeekTimer);
      window.__dfUnreadPeekTimer = 0;
      const state = window.__dfUnreadPeekState || {};
      state.row?.classList?.remove('df-peek-row', 'df-unread-peek-row');
      window.__dfUnreadPeekState = { visible: false };
      document.body.classList.remove('df-peek-own-active');
      document.getElementById('df-peek-dim')?.classList.remove('is-visible');
      document.getElementById('df-peek-card')?.classList.remove('is-visible');
    };
    const showPeekForRow = async (row) => {
      let data = extractPeekData(row);
      if (!data.items.length) {
        if (peekPlatform === 'signal') {
          const previous = window.__dfUnreadPeekState || {};
          previous.row?.classList?.remove('df-peek-row', 'df-unread-peek-row');
          row.classList.add('df-peek-row');
          window.__dfUnreadPeekState = { visible: true, row, requestId: '', data };
          renderPeekNotice(data, 'Signal 联系人列表没有暴露未读正文。为避免触发已读，未打开会话。');
          return;
        }
        queueUnreadPeekDebug('未读偷看：联系人行没有可翻译预览');
        hidePeek();
        return;
      }
      const requestId = 'peek-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const previous = window.__dfUnreadPeekState || {};
      previous.row?.classList?.remove('df-peek-row', 'df-unread-peek-row');
      row.classList.add('df-peek-row');
      window.__dfUnreadPeekState = { visible: true, row, requestId, data };
      renderPeekCard(data);
      queueTranslatorEvent({
        action: 'unread-peek',
        text: JSON.stringify({
          requestId,
          title: data.title,
          contactId: data.contactId,
          contactIdType: data.contactIdType,
          contactKey: data.contactKey,
          unreadCount: data.unreadCount,
          items: data.items
        })
      });
    };
    const beginHover = (row, event) => {
      window.__dfUnreadPeekMouseX = event.clientX;
      window.__dfUnreadPeekMouseY = event.clientY;
      positionPeekCard(event.clientX, event.clientY);
      const state = window.__dfUnreadPeekState || {};
      if (state.row === row) return;
      hidePeek();
      const peerId = peekPlatform === 'telegram' ? telegramPeerIdForRow(row) : '';
      window.__dfUnreadPeekState = { row, peerId, visible: false };
      queueUnreadPeekDebug('未读偷看：已识别联系人，等待 1 秒');
      window.__dfUnreadPeekTimer = window.setTimeout(() => {
        const current = window.__dfUnreadPeekState || {};
        const unreadRequired = peekPlatform === 'whatsapp' || peekPlatform === 'telegram' || peekPlatform === 'signal';
        const telegramContactChanged = peekPlatform === 'telegram' && current.peerId !== telegramPeerIdForRow(row);
        if ((unreadRequired && unreadCountForRow(row) <= 0) || telegramContactChanged) {
          hidePeek();
          return;
        }
        if (current.row === row) void showPeekForRow(row).catch(() => {
          queueUnreadPeekDebug('未读偷看：预览读取失败');
          hidePeek();
        });
      }, unreadPeekHoverDelayMs);
    };
    const onPointerMove = (event) => {
      window.__dfUnreadPeekMouseX = event.clientX;
      window.__dfUnreadPeekMouseY = event.clientY;
      positionPeekCard(event.clientX, event.clientY);
      const row = findUnreadRow(event.target, event.clientX, event.clientY);
      if (!row) {
        hidePeek();
        return;
      }
      beginHover(row, event);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') hidePeek();
    };
    window.__dfUnreadPeekApplyResult = (payload) => {
      const state = window.__dfUnreadPeekState || {};
      if (!state.visible || state.requestId !== payload.requestId) return false;
      renderPeekCard(state.data || payload, payload.items || []);
      return true;
    };
    if (window.__dfUnreadPeekInstalled === peekVersion) return;
    removeUnreadPeekListeners();
    window.clearInterval(window.__dfTelegramPreviewMediaGuardTimer);
    window.__dfTelegramPreviewMediaGuardTimer = 0;
    window.__dfUnreadPeekInstalled = peekVersion;
    window.__dfUnreadPeekPointerMoveHandler = onPointerMove;
    window.__dfUnreadPeekPointerLeaveHandler = hidePeek;
    window.__dfUnreadPeekKeyDownHandler = onKeyDown;
    window.__dfUnreadPeekBlurHandler = hidePeek;
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerleave', hidePeek, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', hidePeek);
  };
  const findVisibleTelegramMediaCaptionComposer = () => {
    const candidates = Array.from(document.querySelectorAll(
      '.simple-message-input-container .input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
    )).filter((element) => isCandidateComposer(element) && isMediaCaptionComposer(element));
    const readCandidateText = (element) => {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value || '';
      }
      return element.innerText || element.textContent || '';
    };
    return candidates.find((element) => Boolean(readCandidateText(element).trim())) || candidates[0] || null;
  };
  const focusVisibleTelegramMediaCaptionComposer = (expectedText = '') => {
    const target = findVisibleTelegramMediaCaptionComposer();
    if (!target?.isConnected) return false;
    const liveText = readComposerPlainText(target).replace(/\\r\\n?/g, '\\n').trim();
    const normalizedExpected = String(expectedText || '').replace(/\\r\\n?/g, '\\n').trim();
    if (normalizedExpected && liveText !== normalizedExpected) return false;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
    const selection = window.getSelection?.();
    if (selection && target.isConnected) {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    window.__dfLastNativeComposer = target;
    return document.activeElement === target || target.contains?.(document.activeElement);
  };
  const scheduleTelegramMediaCaptionRefocus = (expectedText) => {
    const refocus = () => focusVisibleTelegramMediaCaptionComposer(expectedText);
    refocus();
    requestAnimationFrame(refocus);
    for (const delay of [30, 90, 180]) window.setTimeout(refocus, delay);
  };
  const telegramPageGuardVersion = '2026-10-11-telegram-stable-conversation-v60';
  const findNativeComposer = () => {
    const mediaCaptionComposer = findVisibleTelegramMediaCaptionComposer();
    if (mediaCaptionComposer) return mediaCaptionComposer;
    const findBottomEditableComposer = () => {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const items = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'))
        .filter(isCandidateComposer)
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter((item) => item.rect.width > 120 && (!viewportHeight || item.rect.bottom > viewportHeight * 0.55));
      items.sort((left, right) => right.rect.bottom - left.rect.bottom || right.rect.width - left.rect.width);
      return items[0]?.el || null;
    };
    const fromSelection = (() => {
      const node = window.getSelection?.()?.focusNode;
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return element?.closest?.('[contenteditable], [role="textbox"], textarea, input') || null;
    })();
    const active = document.activeElement;
    if (isCandidateComposer(active)) return active;
    if (isCandidateComposer(fromSelection)) return fromSelection;
    if (isCandidateComposer(window.__dfLastNativeComposer)) return window.__dfLastNativeComposer;
    const selectors = [
      '.chat-input-main .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.chat-input-main .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-container > .input-message-input[contenteditable]:not(.input-field-input-fake):not(.input-message-input-fake)',
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="plaintext-only"][role="textbox"]',
      'footer [contenteditable][role="textbox"]',
      'footer [contenteditable="true"]',
      'footer [contenteditable="plaintext-only"]',
      'footer [contenteditable]',
      '[data-testid*="composition"] [contenteditable]',
      '[data-testid*="compose"] [contenteditable]',
      '[data-testid*="input"] [contenteditable]',
      '[class*="composition"] [contenteditable]',
      '[class*="compose"] [contenteditable]',
      '[class*="input"] [contenteditable]',
      '[aria-multiline="true"]',
      '[data-testid="conversation-compose-box-input"]',
      '[data-testid="input-message-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="plaintext-only"][role="textbox"]',
      '[contenteditable][role="textbox"]',
      'div.input-message-input[contenteditable]',
      '.input-message-input[contenteditable]',
      '.input-message-container [contenteditable]',
      '.composer_rich_textarea',
      '.editable-message-text',
      '#editable-message-text',
      'textarea'
    ];
    for (const selector of selectors) {
      const items = Array.from(document.querySelectorAll(selector)).filter(isCandidateComposer);
      if (items.length) return items[items.length - 1];
    }
    const bottomComposer = findBottomEditableComposer();
    if (bottomComposer) return bottomComposer;
    const editables = Array.from(document.querySelectorAll('[contenteditable], textarea')).filter(isCandidateComposer);
    return editables[editables.length - 1] || null;
  };
  const listNativeComposerCandidates = () => {
    const selectors = [
      '[contenteditable], [role="textbox"], textarea, input',
      'footer [contenteditable], footer [role="textbox"], footer textarea',
      '[data-testid*="compose"] [contenteditable], [data-testid*="input"] [contenteditable]',
      '[class*="compose"] [contenteditable], [class*="input"] [contenteditable]'
    ];
    const seen = new Set();
    const candidates = [];
    for (const selector of selectors) {
      for (const item of Array.from(document.querySelectorAll(selector))) {
        if (!isCandidateComposer(item) || seen.has(item)) continue;
        seen.add(item);
        candidates.push(item);
      }
    }
    candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return b.bottom - a.bottom || b.width - a.width;
    });
    return candidates;
  };
  const resolveNativeComposerForEnter = (event) => {
    const mediaCaptionComposer = findVisibleTelegramMediaCaptionComposer();
    if (mediaCaptionComposer) return mediaCaptionComposer;
    const eventTarget = event?.target?.closest?.('[contenteditable], [role="textbox"], textarea, input');
    const candidates = [eventTarget, findNativeComposer(), ...listNativeComposerCandidates()]
      .filter((candidate, index, items) => isCandidateComposer(candidate) && items.indexOf(candidate) === index);
    return candidates.find((candidate) => Boolean(getComposerText(candidate).trim())) || candidates[0] || null;
  };
  const findNativeComposerForSendGuard = () => {
    const direct = findNativeComposer();
    if (direct) return direct;
    const candidates = listNativeComposerCandidates();
    return candidates.find((item) => /[\\u4e00-\\u9fff]/.test(getComposerText(item))) ||
      candidates.find((item) => item?.dataset?.dfTranslatedReady) ||
      candidates[0] ||
      null;
  };
  const findComposerContainer = (composer) => {
    const footer = composer.closest('footer');
    if (footer && isVisible(footer)) return footer;
    const telegramOuterFooter = composer.closest('.new-message-wrapper.rows-wrapper-row, .new-message-wrapper, .chat-input, .MessageInput');
    if (telegramOuterFooter && isVisible(telegramOuterFooter)) return telegramOuterFooter;
    const telegramFooter = composer.closest('.input-message-container, [class*="input"]');
    if (telegramFooter && isVisible(telegramFooter)) return telegramFooter;
    let node = composer;
    for (let i = 0; i < 8 && node; i += 1) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 280 && rect.height >= 40) return node;
      node = node.parentElement;
    }
    return composer.parentElement;
  };
  const dispatchSignalComposerReviewState = (reviewState, reviewText = '') => {
    const detail = {
      status: reviewState || 'hidden',
      text: reviewText || ''
    };
    window.__dfComposerReviewState = detail;
    window.dispatchEvent(new CustomEvent('df-composer-review-state', { detail }));
  };
  window.__dfSetComposerReviewState = (reviewState, reviewText = '') => {
    if (telegramComposerMode) {
      document.getElementById('df-composer-review')?.remove();
      return;
    }
    const liveComposer = findNativeComposer();
    if (liveComposer?.closest?.('.CompositionArea__row')) {
      dispatchSignalComposerReviewState(reviewState, reviewText);
      return;
    }
    document.getElementById('df-composer-review')?.remove();
  };
  const ensureHost = () => {
    installStyle();
    const composer = findNativeComposer();
    if (!composer) return null;
    const container = findComposerContainer(composer);
    if (!container) return null;
    let host = document.getElementById('df-translator-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'df-translator-host';
      host.className = 'df-translator-host';
      container.appendChild(host);
    } else if (host.parentElement !== container) {
      container.appendChild(host);
    }
    host.hidden = true;
    host.setAttribute('aria-hidden', 'true');
    if (
      !host.querySelector('.df-translator-input') ||
      !host.querySelector('.df-translator-status') ||
      !host.querySelector('.df-translator-proxy') ||
      host.querySelector('.df-translator-meta')
    ) {
      host.innerHTML = \`
        <textarea class="df-translator-input" rows="1" readonly hidden aria-hidden="true"></textarea>
        <span class="df-translator-status" hidden aria-hidden="true"></span>
        <span class="df-translator-proxy" hidden aria-hidden="true"></span>
      \`;
    }
    const input = host.querySelector('.df-translator-input');
    const status = host.querySelector('.df-translator-status');
    const proxy = host.querySelector('.df-translator-proxy');
    const queueEvent = queueTranslatorEvent;
    const normalizeConversationText = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const textWithoutDfUi = (el) => {
      const clone = el.cloneNode(true);
      for (const node of Array.from(clone.querySelectorAll('.df-chat-refresh-translation, .df-chat-refresh-placeholder, .df-chat-translation, .df-smart-reply-host, .df-smart-reply-panel, .df-translator-host, .df-composer-review, .df-composer-state'))) {
        node.remove();
      }
      return normalizeConversationText(clone.innerText || clone.textContent || '');
    };
    const readSignalConversationSignature = () => {
      const conversationId = document
        .querySelector('.CompositionArea[data-df-signal-conversation-id]')
        ?.getAttribute('data-df-signal-conversation-id')
        ?.trim() || '';
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
        ? 'signal:' + conversationId.toLowerCase()
        : '';
    };
    const readConversationSignature = () => {
      const signalSignature = readSignalConversationSignature();
      if (signalSignature) return signalSignature;
      if (telegramComposerMode) return (${readTelegramConversationIdFromDom.toString()})();
      const titleSelectors = [
        'header [title]',
        'header [dir="auto"]',
        '[data-testid*="conversation"] header [dir="auto"]',
        '[data-testid*="chat"] header [dir="auto"]',
        '.chat-info .title',
        '.ChatInfo .title',
        '[class*="ChatInfo"] [dir="auto"]',
        '[class*="top"] [dir="auto"]'
      ];
      const titleParts = [];
      for (const selector of titleSelectors) {
        for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 6)) {
          const value = normalizeConversationText(el.getAttribute('title') || el.textContent || '');
          if (value && !titleParts.includes(value)) titleParts.push(value);
        }
      }
      const messageSelectors = [
        '[data-testid="msg-container"]',
        '[data-pre-plain-text]',
        '.message-in',
        '.message-out',
        '.bubble-content-wrapper',
        '.bubble-content',
        '.Message'
      ];
      const messageParts = [];
      for (const selector of messageSelectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(el) || messageParts.length >= 5) continue;
          const value = textWithoutDfUi(el).slice(0, 140);
          if (value && !messageParts.includes(value)) messageParts.push(value);
        }
        if (messageParts.length >= 5) break;
      }
      const title = titleParts.join('|') || document.title || location.href || '';
      return normalizeConversationText(title + '::' + messageParts.join('|'));
    };
    const queueHistoryRenderPrefetch = () => {
      window.clearTimeout(window.__dfHistoryRenderPrefetchTimer);
      window.__dfHistoryRenderPrefetchTimer = window.setTimeout(() => {
        const signature = readConversationSignature();
        queueEvent({ action: 'history-render-prefetch', text: signature.slice(0, 360) });
      }, 180);
    };
    const queueConversationChange = () => {
      window.clearTimeout(window.__dfConversationChangeTimer);
      window.__dfConversationChangeTimer = window.setTimeout(() => {
        const signature = readConversationSignature();
        if (!signature || signature === window.__dfConversationSignature) return;
        window.__dfConversationSignature = signature;
        if (typeof window.__dfApplyCachedTranslationsBurst === 'function') {
          window.__dfApplyCachedTranslationsBurst();
        } else if (typeof window.__dfApplyCachedTranslations === 'function') {
          window.__dfApplyCachedTranslations();
          window.setTimeout(window.__dfApplyCachedTranslations, 80);
          window.setTimeout(window.__dfApplyCachedTranslations, 180);
          window.setTimeout(window.__dfApplyCachedTranslations, 360);
        }
        queueEvent({ action: 'conversation-change', text: signature.slice(0, 360) });
        queueHistoryRenderPrefetch();
      }, 120);
    };
    const conversationWatcherVersion = '2026-10-11-stable-telegram-v3';
    if (window.__dfConversationChangeWatcherInstalled !== conversationWatcherVersion) {
      window.__dfConversationChangeWatcherInstalled = conversationWatcherVersion;
      window.__dfConversationChangeObserver?.disconnect?.();
      if (window.__dfConversationChangeHandler) {
        window.removeEventListener('hashchange', window.__dfConversationChangeHandler);
        window.removeEventListener('popstate', window.__dfConversationChangeHandler);
      }
      window.__dfConversationChangeHandler = queueConversationChange;
      window.__dfConversationChangeObserver = new MutationObserver(queueConversationChange);
      window.__dfConversationChangeObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
      window.addEventListener('hashchange', window.__dfConversationChangeHandler);
      window.addEventListener('popstate', window.__dfConversationChangeHandler);
    }
    const historyPrefetchWatcherVersion = '2026-10-11-stable-telegram-v3';
    if (window.__dfHistoryRenderPrefetchWatcherInstalled !== historyPrefetchWatcherVersion) {
      window.__dfHistoryRenderPrefetchWatcherInstalled = historyPrefetchWatcherVersion;
      if (window.__dfHistoryRenderPrefetchHandler) {
        window.removeEventListener('scroll', window.__dfHistoryRenderPrefetchHandler, true);
        document.removeEventListener('scroll', window.__dfHistoryRenderPrefetchHandler, true);
      }
      window.__dfHistoryRenderPrefetchHandler = queueHistoryRenderPrefetch;
      window.addEventListener('scroll', window.__dfHistoryRenderPrefetchHandler, { passive: true, capture: true });
      document.addEventListener('scroll', window.__dfHistoryRenderPrefetchHandler, { passive: true, capture: true });
    }
    queueConversationChange();
    const getComposerText = (target = composer) => readComposerPlainText(target);
    const setComposerText = (value, target = composer) => {
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
        setter?.call(target, value);
      } else {
        target.textContent = value;
      }
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const pulseTypingIndicator = () => {
      window.clearTimeout(window.__dfTranslatorPulseTimer);
      if (!getComposerText().trim()) setComposerText(' ');
      window.__dfTranslatorPulseTimer = window.setTimeout(() => {
        if (getComposerText() === ' ') setComposerText('');
        composer.focus();
      }, 650);
    };
    const appendChineseDraft = (text) => {
      if (!text) return;
      input.value += text;
      input.style.height = 'auto';
      input.style.height = Math.min(96, Math.max(42, input.scrollHeight)) + 'px';
      if (proxy) proxy.hidden = !input.value.trim();
      delete input.dataset.dfTranslated;
      pulseTypingIndicator();
      queueEvent({ action: 'typing', text: input.value });
    };
    const captureNativeDraft = () => {
      return false;
      if (window.__dfTranslatorNativeWrite) return false;
      const text = getComposerText();
      if (!text || text === ' ' || text === 'typing...') return false;
      if (!/[\\u4e00-\\u9fff]/.test(text) && !input.value.trim()) return false;
      appendChineseDraft(text);
      setComposerText('');
      composer.focus();
      return true;
    };
    const blockChineseNativeSend = (event, target = composer) => {
      const text = getComposerText(target);
      if (!/[\\u4e00-\\u9fff]/.test(text) && text.trim() !== 'typing...') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      status.textContent = '已拦截中文发送，正在翻译';
    };
    const publishNativeTypingState = () => {
      window.clearTimeout(window.__dfNativeTypingStateTimer);
      window.__dfNativeTypingStateTimer = window.setTimeout(() => {
        const target = findNativeComposer() || (composer.isConnected ? composer : null);
        queueEvent({ action: 'typing', text: target ? getComposerText(target).trim() : '' });
      }, 30);
    };
    const isSensitiveSendCandidate = (value) => {
      if (!value || value.length > 256 || /[\\r\\n]/.test(value)) return false;
      if (/^[0-9]{1,11}$/.test(value.trim())) return true;
      const digits = value.replace(/ /g, '');
      if (/^[0-9 ]+$/.test(value) && value === value.trim() && digits.length >= 12 && digits.length <= 34) return true;
      if (/^0x[0-9A-Za-z]{20,80}$/.test(value)) return true;
      if (/^T[0-9A-Za-z]{33}$/.test(value)) return true;
      return /^[0-9A-Za-z]{32,44}$/.test(value);
    };
    const stopSendEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const sameComposerTarget = (left, right) => Boolean(
      left && right && (left === right || left.contains?.(right) || right.contains?.(left))
    );
    const rememberShiftEnter = (event, target) => {
      if (event?.key !== 'Enter' || !event.shiftKey) return false;
      window.__dfShiftEnterTarget = target || event.target || null;
      window.__dfShiftEnterUntil = Date.now() + 500;
      return true;
    };
    const clearShiftEnter = () => {
      window.__dfShiftEnterTarget = null;
      window.__dfShiftEnterUntil = 0;
    };
    const shouldAllowShiftLineBreak = (event, target) => {
      if (window.__dfAllowedShiftLineBreakEvent === event) return true;
      const modifierActive = Boolean(event?.shiftKey || event?.getModifierState?.('Shift'));
      const remembered = Date.now() <= Number(window.__dfShiftEnterUntil || 0) &&
        sameComposerTarget(window.__dfShiftEnterTarget, target || event?.target);
      if (!modifierActive && !remembered) return false;
      window.__dfAllowedShiftLineBreakEvent = event;
      window.setTimeout(() => {
        if (window.__dfAllowedShiftLineBreakEvent === event) window.__dfAllowedShiftLineBreakEvent = null;
        clearShiftEnter();
      }, 0);
      return true;
    };
    const isPlainSendEnter = (event) => Boolean(
      event?.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.isComposing &&
      event.keyCode !== 229
    );
    const rememberModifiedEnter = (event, target) => {
      if (event?.key !== 'Enter' || event.shiftKey || (!event.ctrlKey && !event.altKey && !event.metaKey)) return false;
      window.__dfModifiedEnterTarget = target || event.target || null;
      window.__dfModifiedEnterUntil = Date.now() + 500;
      return true;
    };
    const shouldBlockModifiedLineBreak = (event, target) => {
      const modifierActive = Boolean(event?.ctrlKey || event?.altKey || event?.metaKey);
      return modifierActive || (
        Date.now() <= Number(window.__dfModifiedEnterUntil || 0) &&
        sameComposerTarget(window.__dfModifiedEnterTarget, target || event?.target)
      );
    };
    const markPlainEnter = (target) => {
      window.__dfPlainEnterTarget = target || null;
      window.__dfPlainEnterUntil = Date.now() + 750;
    };
    const hasRecentPlainEnter = (target) => Boolean(
      Date.now() <= Number(window.__dfPlainEnterUntil || 0) &&
      sameComposerTarget(window.__dfPlainEnterTarget, target)
    );
    const showEnterOnlyHint = (target = composer) => {
      status.textContent = '请按回车键发送';
      target?.focus?.();
    };
    const sendTelegramMediaCaptionDirect = (event, target) => {
      if (
        !telegramComposerMode ||
        !isMediaCaptionComposer(target) ||
        !getComposerText(target).trim()
      ) return false;
      stopSendEvent(event);
      if (event?.__dfTelegramMediaDirectSendHandled) return true;
      event.__dfTelegramMediaDirectSendHandled = true;
      const sendButton = target
        .closest?.('.simple-message-input-container')
        ?.querySelector?.('.simple-message-input-confirm');
      if (!sendButton) {
        status.textContent = '图片发送按钮不可用，请重试';
        target.focus?.();
        return true;
      }
      delete window.__dfTelegramMediaCaptionReady;
      delete window.__dfTelegramMediaCaptionPending;
      window.__dfTranslatorProgrammaticSend = true;
      try {
        sendButton.click();
      } finally {
        window.setTimeout(() => {
          window.__dfTranslatorProgrammaticSend = false;
        }, 180);
      }
      return true;
    };
    const stopTelegramMediaCaptionFocusGuard = (requestId = '') => {
      const guard = window.__dfTelegramMediaCaptionFocusGuard;
      if (!guard || (requestId && guard.requestId !== requestId)) return false;
      window.clearInterval(guard.timer);
      delete window.__dfTelegramMediaCaptionFocusGuard;
      return true;
    };
    const focusTelegramMediaCaption = (target) => {
      if (!target?.isConnected) return false;
      if (document.activeElement === target || target.contains?.(document.activeElement)) return true;
      target.focus();
      const selection = window.getSelection?.();
      if (selection && target.isConnected) {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return document.activeElement === target || target.contains?.(document.activeElement);
    };
    const startTelegramMediaCaptionFocusGuard = (target, requestId) => {
      if (!telegramComposerMode || !requestId || !isMediaCaptionComposer(target)) return false;
      const existing = window.__dfTelegramMediaCaptionFocusGuard;
      if (existing?.requestId === requestId && existing.target === target) {
        focusTelegramMediaCaption(target);
        return true;
      }
      stopTelegramMediaCaptionFocusGuard();
      const keepFocus = () => {
        if (
          document.visibilityState === 'hidden' ||
          !target?.isConnected ||
          !isMediaCaptionComposer(target) ||
          (
            target.dataset.dfTranslatorRequestId !== requestId &&
            target.dataset.dfTranslatorReadyRequestId !== requestId
          )
        ) {
          stopTelegramMediaCaptionFocusGuard(requestId);
          return;
        }
        focusTelegramMediaCaption(target);
      };
      const timer = window.setInterval(keepFocus, 120);
      window.__dfTelegramMediaCaptionFocusGuard = { requestId, target, timer };
      keepFocus();
      return true;
    };
    window.__dfStopTelegramMediaCaptionFocusGuard = stopTelegramMediaCaptionFocusGuard;
    window.__dfEnsureTelegramMediaCaptionFocus = startTelegramMediaCaptionFocusGuard;
    const readSignalComposerReviewEnabled = () => {
      try {
        const persisted = window.localStorage?.getItem?.('df-composer-review-enabled-v1');
        if (persisted === '0') return false;
        if (persisted === '1') return true;
      } catch {
        // Fall back to the source-native runtime state when storage is unavailable.
      }
      return window.__dfComposerReviewEnabled !== false;
    };
    const queueNativeTranslate = (event, target = composer) => {
      if (window.__dfTranslatorProgrammaticSend) return false;
      if (event?.target?.closest?.('.df-composer-review')) return false;
      if (isCandidateComposer(target)) window.__dfLastNativeComposer = target;
      if (rememberShiftEnter(event, target)) return false;
      if (event?.key === 'Enter') clearShiftEnter();
      const composerKind = telegramComposerMode && isMediaCaptionComposer(target)
        ? 'telegram-media-caption'
        : 'default';
      const signalSourceComposer = Boolean(
        target?.closest?.('.CompositionArea') ||
        document.querySelector('.CompositionArea[data-df-signal-conversation-id]')
      );
      const signalReviewEnabled = signalSourceComposer && readSignalComposerReviewEnabled();
      const syncConversationSignature = () => {
        const signature = readConversationSignature();
        if (signature) window.__dfConversationSignature = signature;
        return signature || window.__dfConversationSignature || '';
      };
      const liveText = getComposerText(target);
      const sensitiveToken = target?.dataset?.dfSensitiveSendToken || '';
      if (sensitiveToken) {
        stopSendEvent(event);
        syncConversationSignature();
        if (liveText !== (target.dataset.dfSensitiveSendText || '')) {
          queueEvent({ action: 'sensitive-cancel', text: '' });
          delete target.dataset.dfSensitiveSendToken;
          delete target.dataset.dfSensitiveSendText;
          delete target.dataset.dfSensitiveReviewPending;
          status.textContent = '敏感信息已变化，确认已作废';
          return true;
        }
        if (target.dataset.dfSensitiveDispatchPending === sensitiveToken) return true;
        target.dataset.dfSensitiveDispatchPending = sensitiveToken;
        queueEvent({ action: 'sensitive-send', text: liveText, requestId: sensitiveToken });
        return true;
      }
      if (isSensitiveSendCandidate(liveText)) {
        stopSendEvent(event);
        syncConversationSignature();
        if (target.dataset.dfSensitiveReviewPending === liveText) return true;
        target.dataset.dfSensitiveReviewPending = liveText;
        queueEvent({ action: 'sensitive-prepare', text: liveText, requestId: createComposerRequestId() });
        return true;
      }
      if (isDirectSendHttpUrl(liveText)) {
        window.__dfSetComposerReviewState?.('hidden', '');
        if (telegramComposerMode && isMediaCaptionComposer(target)) {
          return sendTelegramMediaCaptionDirect(event, target);
        }
        return false;
      }
      if (telegramComposerMode) {
        const mediaCaptionReady = isMediaCaptionComposer(target)
          ? window.__dfTelegramMediaCaptionReady
          : null;
        const mediaCaptionReadyMatches = Boolean(
          mediaCaptionReady?.text &&
          mediaCaptionReady.text.replace(/\\r\\n?/g, '\\n').trim() === liveText.replace(/\\r\\n?/g, '\\n').trim() &&
          (
            !mediaCaptionReady.conversationSignature ||
            mediaCaptionReady.conversationSignature === (window.__dfConversationSignature || '')
          )
        );
        const translatedReady = target?.dataset?.dfTranslatedReady ||
          (mediaCaptionReadyMatches ? mediaCaptionReady.text : '');
        if (translatedReady) {
          const normalizedLiveText = liveText.replace(/\\r\\n?/g, '\\n').trim();
          const normalizedReadyText = translatedReady.replace(/\\r\\n?/g, '\\n').trim();
          if (normalizedLiveText === normalizedReadyText) {
            const requestId = target.dataset.dfTranslatorReadyRequestId ||
              target.dataset.dfTranslatorRequestId ||
              mediaCaptionReady?.requestId ||
              '';
            stopSendEvent(event);
            syncConversationSignature();
            queueEvent({ action: 'send', text: translatedReady, requestId, composerKind });
            return true;
          }
          delete target.dataset.dfTranslatedReady;
          delete target.dataset.dfTranslatorReadyRequestId;
          delete target.dataset.dfTranslatorRequestId;
          delete target.dataset.dfSendPending;
          if (isMediaCaptionComposer(target)) delete window.__dfTelegramMediaCaptionReady;
        }
        if (!/[\\u4e00-\\u9fff]/.test(liveText)) {
          if (isMediaCaptionComposer(target)) {
            return sendTelegramMediaCaptionDirect(event, target);
          }
          return false;
        }
        stopSendEvent(event);
        const normalizedText = liveText.replace(/\\r\\n?/g, '\\n').trim();
        if (!normalizedText) return true;
        if (target.dataset.dfTranslationPending === normalizedText) return true;
        const requestId = createComposerRequestId();
        target.dataset.dfTranslatorRequestId = requestId;
        target.dataset.dfTranslationPending = normalizedText;
        target.dataset.dfTranslationPendingAt = String(Date.now());
        delete target.dataset.dfTranslatedReady;
        delete target.dataset.dfTranslatorReadyRequestId;
        if (isMediaCaptionComposer(target)) {
          delete window.__dfTelegramMediaCaptionReady;
          window.__dfTelegramMediaCaptionPending = {
            requestId,
            sourceText: normalizedText,
            conversationSignature: syncConversationSignature()
          };
        }
        syncConversationSignature();
        queueEvent({ action: 'translate', text: liveText, requestId, composerKind });
        return true;
      }
      const text = liveText;
      const hasChineseDraft = /[\\u4e00-\\u9fff]/.test(text);
      const hasEnglishDraft = /[A-Za-z]{2,}/.test(text);
      if (hasChineseDraft) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const normalizedText = text.replace(/\\r\\n?/g, '\\n').trim();
        if (!normalizedText) return true;
        const pendingAt = Number(target.dataset.dfTranslationPendingAt || 0);
        const pendingIsLive = target.dataset.dfTranslationPending === normalizedText &&
          pendingAt > 0 && Date.now() - pendingAt < 15000;
        if (pendingIsLive) return true;
        delete target.dataset.dfTranslationPending;
        delete target.dataset.dfTranslationPendingAt;
        const requestId = createComposerRequestId();
        target.dataset.dfTranslatorRequestId = requestId;
        target.dataset.dfTranslationPending = normalizedText;
        target.dataset.dfTranslationPendingAt = String(Date.now());
        delete window.__dfSignalComposerReady;
        delete target.dataset.dfTranslatedReady;
        delete target.dataset.dfTranslatorReadyRequestId;
        syncConversationSignature();
        queueEvent({
          action: 'translate',
          text,
          requestId,
          composerKind,
          reviewEnabled: signalReviewEnabled
        });
        return true;
      }
      const currentConversationSignature = syncConversationSignature();
      const isSourceNativeSignalComposer = Boolean(document.querySelector('.CompositionArea[data-df-signal-conversation-id]'));
      const windowReady = window.__dfSignalComposerReady || null;
      const windowReadyMatchesConversation = Boolean(
        isSourceNativeSignalComposer &&
        windowReady?.text &&
        windowReady?.requestId &&
        windowReady?.conversationSignature &&
        windowReady.conversationSignature === currentConversationSignature
      );
      const translatedReady = target?.dataset?.dfTranslatedReady || (windowReadyMatchesConversation ? windowReady.text : '');
      if (translatedReady) {
        const normalizedLiveText = liveText.replace(/\\r\\n?/g, '\\n').trim();
        const normalizedReadyText = translatedReady.replace(/\\r\\n?/g, '\\n').trim();
        if (normalizedLiveText !== normalizedReadyText) {
          delete target.dataset.dfTranslatedReady;
          delete target.dataset.dfTranslatorRequestId;
          delete target.dataset.dfTranslatorReadyRequestId;
          delete target.dataset.dfSendPending;
          delete window.__dfSignalComposerReady;
          window.__dfSetComposerReviewState?.('hidden', '');
        } else {
          const requestId = target.dataset.dfTranslatorReadyRequestId || target.dataset.dfTranslatorRequestId || (windowReadyMatchesConversation ? windowReady.requestId : '');
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          syncConversationSignature();
          queueEvent({ action: 'send', text: translatedReady, requestId, composerKind });
          return true;
        }
      }
      if (!hasEnglishDraft || !signalReviewEnabled) return false;
      stopSendEvent(event);
      const normalizedText = text.replace(/\\r\\n?/g, '\\n').trim();
      if (!normalizedText) return true;
      const pendingAt = Number(target.dataset.dfTranslationPendingAt || 0);
      const pendingIsLive = target.dataset.dfTranslationPending === normalizedText &&
        pendingAt > 0 && Date.now() - pendingAt < 15000;
      if (pendingIsLive) return true;
      const requestId = createComposerRequestId();
      target.dataset.dfTranslatorRequestId = requestId;
      target.dataset.dfTranslationPending = normalizedText;
      target.dataset.dfTranslationPendingAt = String(Date.now());
      delete window.__dfSignalComposerReady;
      delete target.dataset.dfTranslatedReady;
      delete target.dataset.dfTranslatorReadyRequestId;
      syncConversationSignature();
      queueEvent({
        action: 'translate',
        text,
        requestId,
        composerKind,
        reviewEnabled: true
      });
      return true;
    };
    const isNativeSendButton = (button) => {
      if (!button) return false;
      if (button.matches?.('.simple-message-input-confirm')) return true;
      const label = [
        button.getAttribute('aria-label') || '',
        button.getAttribute('title') || '',
        button.getAttribute('data-testid') || '',
        button.getAttribute('class') || '',
        button.textContent || ''
      ].join(' ').toLowerCase();
      if (/send|send message|发送|btn-send|button-send|tgico-send|send-button/.test(label)) return true;
      const icon = button.querySelector?.('[class*="send"], [class*="tgico"], [data-icon*="send"], [data-testid*="send"], use[href*="send"], svg[class*="send"]');
      if (!icon) return false;
      const iconLabel = [
        icon.getAttribute?.('class') || '',
        icon.getAttribute?.('href') || '',
        icon.getAttribute?.('aria-label') || '',
        icon.textContent || ''
      ].join(' ').toLowerCase();
      return /send|tgico-send|button-send/.test(iconLabel);
    };
    const webSendGuardOverlayId = 'df-web-send-guard-overlay';
    const webSendGuardPlatform = location.hostname === 'web.telegram.org' || location.hostname.endsWith('.telegram.org')
      ? 'telegram'
      : location.hostname === 'web.whatsapp.com' || location.hostname.endsWith('.whatsapp.com')
        ? 'whatsapp'
        : '';
    const restoreWebSendGuardMount = () => {
      const mount = window.__dfWebSendGuardMount;
      if (mount?.dataset?.dfSendGuardAdjustedPosition === '1') {
        mount.style.position = mount.dataset.dfSendGuardOriginalPosition || '';
        delete mount.dataset.dfSendGuardAdjustedPosition;
        delete mount.dataset.dfSendGuardOriginalPosition;
      }
      window.__dfWebSendGuardMount = null;
    };
    const removeWebSendGuardOverlay = () => {
      document.getElementById(webSendGuardOverlayId)?.remove();
      window.__dfWebSendGuardObserver?.disconnect?.();
      window.__dfWebSendGuardObserver = null;
      window.__dfWebSendGuardRoot = null;
      if (window.__dfWebSendGuardFrame) {
        window.cancelAnimationFrame(window.__dfWebSendGuardFrame);
        window.__dfWebSendGuardFrame = 0;
      }
      restoreWebSendGuardMount();
    };
    const findWhatsAppSendControl = (footer) => {
      const preferred = footer.querySelector([
        '[data-testid="compose-btn-send"]',
        '[data-testid*="send"]',
        '[data-icon="send"]',
        '[data-icon="send-filled"]',
        'button[aria-label="Send"]',
        'button[aria-label="发送"]',
        '[role="button"][aria-label="Send"]',
        '[role="button"][aria-label="发送"]'
      ].join(','));
      const preferredControl = preferred?.closest?.('button, [role="button"]') || preferred;
      if (preferredControl) return preferredControl;
      return Array.from(footer.querySelectorAll('button, [role="button"]')).find(isNativeSendButton) || null;
    };
    const resolveWebSendGuardRegion = (target) => {
      if (webSendGuardPlatform === 'telegram') {
        if (isMediaCaptionComposer(target)) {
          return null;
        }
        const root = target.closest('.new-message-wrapper.rows-wrapper-row, .new-message-wrapper');
        return root ? { root, mount: root.querySelector('.btn-send-container'), fallback: false } : null;
      }
      if (webSendGuardPlatform === 'whatsapp') {
        const root = target.closest('footer');
        if (!root) return null;
        const sendControl = findWhatsAppSendControl(root);
        return { root, mount: sendControl || root, fallback: !sendControl };
      }
      return null;
    };
    const updateWebSendGuardOverlay = (target = findNativeComposerForSendGuard()) => {
      const targetText = target ? getComposerText(target) : '';
      const requiresGuard = Boolean(targetText.trim())
        || Boolean(target?.dataset?.dfTranslatedReady)
        || Boolean(target?.dataset?.dfTranslationPending)
        || Boolean(target?.dataset?.dfSensitiveSendToken)
        || isSensitiveSendCandidate(targetText)
        || /[\u4e00-\u9fff]/.test(targetText);
      if (!webSendGuardPlatform || !target?.isConnected || !requiresGuard) {
        removeWebSendGuardOverlay();
        return false;
      }
      const region = resolveWebSendGuardRegion(target);
      if (!region) {
        removeWebSendGuardOverlay();
        return false;
      }
      if (window.__dfWebSendGuardRoot !== region.root) {
        window.__dfWebSendGuardObserver?.disconnect?.();
        window.__dfWebSendGuardRoot = region.root;
        window.__dfWebSendGuardObserver = new MutationObserver(() => {
          if (window.__dfWebSendGuardFrame) return;
          window.__dfWebSendGuardFrame = window.requestAnimationFrame(() => {
            window.__dfWebSendGuardFrame = 0;
            updateWebSendGuardOverlay(findNativeComposerForSendGuard());
          });
        });
        window.__dfWebSendGuardObserver.observe(region.root, { childList: true, subtree: true });
      }
      if (!region.mount) return false;
      if (window.__dfWebSendGuardMount !== region.mount) {
        document.getElementById(webSendGuardOverlayId)?.remove();
        restoreWebSendGuardMount();
        window.__dfWebSendGuardMount = region.mount;
      }
      let overlay = document.getElementById(webSendGuardOverlayId);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = webSendGuardOverlayId;
        overlay.setAttribute('aria-hidden', 'true');
        const stopNativeGesture = (event) => {
          event.stopPropagation();
          event.stopImmediatePropagation();
        };
        for (const eventName of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend']) {
          overlay.addEventListener(eventName, stopNativeGesture, true);
        }
        overlay.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          stopNativeGesture(event);
        }, true);
        overlay.addEventListener('click', (event) => {
          event.preventDefault();
          stopNativeGesture(event);
          const guardedComposer = overlay.__dfComposer;
          if (!guardedComposer?.isConnected) {
            updateWebSendGuardOverlay(findNativeComposerForSendGuard());
            return;
          }
          window.__dfLastNativeComposer = guardedComposer;
          showEnterOnlyHint(guardedComposer);
          updateWebSendGuardOverlay(findNativeComposerForSendGuard());
        }, true);
      }
      overlay.__dfComposer = target;
      overlay.dataset.dfPlatform = webSendGuardPlatform;
      overlay.style.cssText = [
        'position:absolute',
        region.fallback ? 'top:0' : 'inset:0',
        region.fallback ? 'right:0' : '',
        region.fallback ? 'bottom:0' : '',
        region.fallback ? 'width:88px' : '',
        'z-index:2147483647',
        'background:transparent',
        'pointer-events:auto',
        'touch-action:manipulation',
        'cursor:pointer'
      ].filter(Boolean).join(';');
      if (window.getComputedStyle(region.mount).position === 'static') {
        region.mount.dataset.dfSendGuardOriginalPosition = region.mount.style.position || '';
        region.mount.dataset.dfSendGuardAdjustedPosition = '1';
        region.mount.style.position = 'relative';
      }
      if (overlay.parentElement !== region.mount) region.mount.appendChild(overlay);
      return true;
    };
    const isLikelyNativeSendTarget = (event, composerTarget) => {
      const target = event.target;
      if (target?.closest?.('#' + webSendGuardOverlayId)) return true;
      const direct = target?.closest?.('button, [role="button"], .btn-send-container, .btn-send, .send-button, .simple-message-input-confirm, [class*="send"], [class*="tgico-send"]');
      if (direct && isNativeSendButton(direct)) return true;
      if (target?.closest?.('.btn-send-container .c-ripple, .btn-send-container, .simple-message-input-confirm')) return true;
      const classLabel = [
        target?.getAttribute?.('class') || '',
        target?.parentElement?.getAttribute?.('class') || '',
        target?.textContent || ''
      ].join(' ').toLowerCase();
      if (/send|tgico-send|button-send/.test(classLabel)) return true;
      if (!composerTarget || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false;
      const composerText = getComposerText(composerTarget);
      const hasTextDraft = Boolean(composerText.trim());
      const rect = composerTarget.getBoundingClientRect();
      const bottomZone = rect.width > 80 &&
        event.clientX >= rect.right - 8 &&
        event.clientX <= rect.right + 120 &&
        event.clientY >= rect.top - 36 &&
        event.clientY <= rect.bottom + 36;
      return bottomZone && hasTextDraft;
    };
    document.getElementById('df-telegram-send-guard-overlay')?.remove();
    window.__dfTelegramSendGuardObserver?.disconnect?.();
    window.__dfTelegramSendGuardObserver = null;
    window.__dfTelegramSendGuardWrapper = null;
    const beginTelegramEnterTrace = (event) => {
      if (!telegramComposerMode || event?.type !== 'keydown' || event?.key !== 'Enter') return 0;
      if (Number(event.__dfTelegramEnterSequence || 0) > 0) return Number(event.__dfTelegramEnterSequence);
      const sequence = Number(window.__dfTelegramEnterCount || 0) + 1;
      event.__dfTelegramEnterSequence = sequence;
      window.__dfTelegramEnterCount = sequence;
      return sequence;
    };
    const finishTelegramEnterTrace = (event, target, decision, composerKind) => {
      const sequence = beginTelegramEnterTrace(event);
      if (!sequence || event.__dfTelegramEnterLogged) return;
      event.__dfTelegramEnterLogged = true;
      const trace = {
        at: Date.now(),
        sequence,
        type: event.type || '',
        key: event.key || '',
        code: event.code || '',
        keyCode: Number(event.keyCode || 0),
        which: Number(event.which || 0),
        inputType: event.inputType || '',
        composing: Boolean(event.isComposing || event.keyCode === 229),
        mediaCaption: composerKind === 'telegram-media-caption',
        decision
      };
      window.__dfTelegramEnterTrace = trace;
      window.__dfTelegramEnterHistory = Array.isArray(window.__dfTelegramEnterHistory)
        ? window.__dfTelegramEnterHistory
        : [];
      window.__dfTelegramEnterHistory.push(trace);
      window.__dfTelegramEnterHistory = window.__dfTelegramEnterHistory.slice(-40);
      queueEvent({
        action: 'telegram-enter-debug',
        text: JSON.stringify({
          sequence,
          decision,
          composerKind,
          hasChinese: /[\\u4e00-\\u9fff]/.test(getComposerText(target)),
          hasReady: Boolean(target?.dataset?.dfTranslatedReady),
          hasPending: Boolean(target?.dataset?.dfTranslationPending)
        })
      });
    };
    const handleTelegramMediaCaptionLike008 = (event, target) => {
      const isEnterAction = event?.key === 'Enter' ||
        event?.inputType === 'insertLineBreak' ||
        event?.inputType === 'insertParagraph';
      if (
        !telegramComposerMode ||
        !isMediaCaptionComposer(target) ||
        !isEnterAction ||
        event?.shiftKey
      ) return false;
      beginTelegramEnterTrace(event);
      window.__dfLastNativeComposer = target;
      const handled = queueNativeTranslate(event, target);
      finishTelegramEnterTrace(
        event,
        target,
        handled ? '008-media-caption-handled' : '008-media-caption-native',
        'telegram-media-caption'
      );
      return handled;
    };
    const nativeGuardVersion = telegramComposerMode
      ? telegramPageGuardVersion
      : '2026-10-01-web-page-sensitive-input-v56';
    if (composer.dataset.dfNativeGuard !== nativeGuardVersion) {
      if (composer.__dfNativeInputHandler) composer.removeEventListener('input', composer.__dfNativeInputHandler, true);
      if (composer.__dfNativeKeydownHandler) composer.removeEventListener('keydown', composer.__dfNativeKeydownHandler, true);
      if (composer.__dfNativeCompositionEndHandler) composer.removeEventListener('compositionend', composer.__dfNativeCompositionEndHandler, true);
      if (composer.__dfNativeBeforeInputHandler) composer.removeEventListener('beforeinput', composer.__dfNativeBeforeInputHandler, true);
      composer.dataset.dfNativeGuard = nativeGuardVersion;
      delete composer.__dfNativeInputHandler;
      delete composer.__dfNativeKeydownHandler;
      delete composer.__dfNativeCompositionEndHandler;
      delete composer.__dfNativeBeforeInputHandler;
      composer.__dfNativeInputHandler = () => {
        window.__dfLastNativeComposer = composer;
        const sensitiveText = composer.dataset.dfSensitiveSendToken
          ? composer.dataset.dfSensitiveSendText
          : composer.dataset.dfSensitiveReviewPending;
        if (sensitiveText !== undefined && getComposerText(composer) === sensitiveText) return;
        if (!window.__dfTranslatorNativeWrite) {
          if (composer.dataset.dfSensitiveSendToken || composer.dataset.dfSensitiveReviewPending) {
            queueEvent({ action: 'sensitive-cancel', text: '' });
          }
          delete composer.dataset.dfTranslatedReady;
          delete composer.dataset.dfTranslatorRequestId;
          delete composer.dataset.dfTranslatorReadyRequestId;
          delete composer.dataset.dfTranslationPending;
          delete composer.dataset.dfTranslationPendingAt;
          if (isMediaCaptionComposer(composer)) {
            delete window.__dfTelegramMediaCaptionReady;
            delete window.__dfTelegramMediaCaptionPending;
          }
          delete window.__dfSignalComposerReady;
          delete composer.dataset.dfSensitiveSendToken;
          delete composer.dataset.dfSensitiveSendText;
          delete composer.dataset.dfSensitiveReviewPending;
          delete composer.dataset.dfSensitiveDispatchPending;
          if (!telegramComposerMode) window.__dfSetComposerReviewState?.('hidden', '');
        }
        if (!window.__dfTranslatorNativeWrite) publishNativeTypingState();
        captureNativeDraft();
        updateWebSendGuardOverlay(composer);
      };
      composer.__dfNativeKeydownHandler = (event) => {
        window.__dfLastNativeComposer = composer;
        beginTelegramEnterTrace(event);
        if (handleTelegramMediaCaptionLike008(event, composer)) return;
        if (event.key !== 'Enter') return;
        if (rememberShiftEnter(event, composer)) return;
        if (rememberModifiedEnter(event, composer)) {
          stopSendEvent(event);
          showEnterOnlyHint(composer);
          return;
        }
        if (!isPlainSendEnter(event)) return;
        markPlainEnter(composer);
        clearShiftEnter();
        const handled = queueNativeTranslate(event, composer);
        finishTelegramEnterTrace(event, composer, handled ? 'page-composer-handled' : 'page-composer-native', 'default');
      };
      composer.__dfNativeCompositionEndHandler = () => {
        window.setTimeout(() => {
          captureNativeDraft();
          updateWebSendGuardOverlay(composer);
        }, 0);
      };
      composer.__dfNativeBeforeInputHandler = (event) => {
        window.__dfLastNativeComposer = composer;
        if (handleTelegramMediaCaptionLike008(event, composer)) return;
        if (event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') return;
        if (shouldAllowShiftLineBreak(event, composer)) return;
        if (shouldBlockModifiedLineBreak(event, composer)) {
          stopSendEvent(event);
          showEnterOnlyHint(composer);
          return;
        }
        markPlainEnter(composer);
        queueNativeTranslate(event, composer);
      };
      composer.addEventListener('input', composer.__dfNativeInputHandler, true);
      composer.addEventListener('keydown', composer.__dfNativeKeydownHandler, true);
      composer.addEventListener('compositionend', composer.__dfNativeCompositionEndHandler, true);
      composer.addEventListener('beforeinput', composer.__dfNativeBeforeInputHandler, true);
    }
    if (window.__dfNativeTypingStateInstalled !== nativeGuardVersion) {
      if (window.__dfNativeTypingStateHandler) {
        document.removeEventListener('input', window.__dfNativeTypingStateHandler, true);
        document.removeEventListener('keyup', window.__dfNativeTypingStateHandler, true);
        document.removeEventListener('compositionend', window.__dfNativeTypingStateHandler, true);
        document.removeEventListener('paste', window.__dfNativeTypingStateHandler, true);
        document.removeEventListener('cut', window.__dfNativeTypingStateHandler, true);
      }
      window.__dfNativeTypingStateInstalled = nativeGuardVersion;
      window.__dfNativeTypingStateHandler = (event) => {
        if (event?.target?.closest?.('.df-composer-review')) return;
        const publish = () => {
          const liveComposer = findNativeComposerForSendGuard() || findNativeComposer();
          if (liveComposer && !window.__dfTranslatorNativeWrite) {
            if (liveComposer.dataset.dfSensitiveSendToken || liveComposer.dataset.dfSensitiveReviewPending) {
              queueEvent({ action: 'sensitive-cancel', text: '' });
            }
            delete liveComposer.dataset.dfTranslatedReady;
            delete liveComposer.dataset.dfTranslatorRequestId;
            delete liveComposer.dataset.dfTranslatorReadyRequestId;
            delete liveComposer.dataset.dfTranslationPending;
            delete liveComposer.dataset.dfTranslationPendingAt;
            delete liveComposer.dataset.dfSendPending;
            delete window.__dfSignalComposerReady;
            delete liveComposer.dataset.dfSensitiveSendToken;
            delete liveComposer.dataset.dfSensitiveSendText;
            delete liveComposer.dataset.dfSensitiveReviewPending;
            delete liveComposer.dataset.dfSensitiveDispatchPending;
            if (!telegramComposerMode) window.__dfSetComposerReviewState?.('hidden', '');
            publishNativeTypingState();
          }
          updateWebSendGuardOverlay(liveComposer);
        };
        if (event?.type === 'paste' || event?.type === 'cut') window.setTimeout(publish, 0);
        else publish();
      };
      document.addEventListener('input', window.__dfNativeTypingStateHandler, true);
      document.addEventListener('compositionend', window.__dfNativeTypingStateHandler, true);
      document.addEventListener('paste', window.__dfNativeTypingStateHandler, true);
      document.addEventListener('cut', window.__dfNativeTypingStateHandler, true);
    }
    if (window.__dfNativeEnterGuardInstalled !== nativeGuardVersion) {
      if (window.__dfNativeEnterKeydownHandler) document.removeEventListener('keydown', window.__dfNativeEnterKeydownHandler, true);
      if (window.__dfNativeEnterKeydownHandler) window.removeEventListener('keydown', window.__dfNativeEnterKeydownHandler, true);
      if (window.__dfNativeEnterKeypressHandler) document.removeEventListener('keypress', window.__dfNativeEnterKeypressHandler, true);
      if (window.__dfNativeEnterKeypressHandler) window.removeEventListener('keypress', window.__dfNativeEnterKeypressHandler, true);
      if (window.__dfNativeEnterKeyupHandler) document.removeEventListener('keyup', window.__dfNativeEnterKeyupHandler, true);
      if (window.__dfNativeEnterKeyupHandler) window.removeEventListener('keyup', window.__dfNativeEnterKeyupHandler, true);
      if (window.__dfNativeEnterBeforeInputHandler) document.removeEventListener('beforeinput', window.__dfNativeEnterBeforeInputHandler, true);
      if (window.__dfNativeEnterBeforeInputHandler) window.removeEventListener('beforeinput', window.__dfNativeEnterBeforeInputHandler, true);
      for (const candidate of listNativeComposerCandidates()) {
        if (getComposerText(candidate).trim()) continue;
        delete candidate.dataset.dfTranslationPending;
        delete candidate.dataset.dfTranslationPendingAt;
        delete candidate.dataset.dfTranslatorRequestId;
        delete candidate.dataset.dfTranslatorReadyRequestId;
      }
      window.__dfNativeEnterGuardInstalled = nativeGuardVersion;
      window.__dfNativeEnterKeydownHandler = (event) => {
        if (event?.target?.closest?.('.df-composer-review')) return;
        const targetComposer = resolveNativeComposerForEnter(event);
        if (!targetComposer) return;
        beginTelegramEnterTrace(event);
        if (handleTelegramMediaCaptionLike008(event, targetComposer)) return;
        if (event.key !== 'Enter') return;
        if (rememberShiftEnter(event, targetComposer)) return;
        if (rememberModifiedEnter(event, targetComposer)) {
          stopSendEvent(event);
          showEnterOnlyHint(targetComposer);
          return;
        }
        if (!isPlainSendEnter(event)) return;
        markPlainEnter(targetComposer);
        clearShiftEnter();
        const handled = queueNativeTranslate(event, targetComposer);
        finishTelegramEnterTrace(event, targetComposer, handled ? 'page-global-handled' : 'page-global-native', 'default');
      };
      window.__dfNativeEnterBlockOnlyHandler = (event) => {
        if (event?.target?.closest?.('.df-composer-review')) return;
        if (window.__dfTranslatorProgrammaticSend) return;
        const targetComposer = resolveNativeComposerForEnter(event);
        if (!targetComposer) return;
        if (handleTelegramMediaCaptionLike008(event, targetComposer)) return;
        if (event.key !== 'Enter' || rememberShiftEnter(event, targetComposer)) return;
        if (rememberModifiedEnter(event, targetComposer)) {
          stopSendEvent(event);
          showEnterOnlyHint(targetComposer);
          return;
        }
        if (!isPlainSendEnter(event)) return;
        markPlainEnter(targetComposer);
        queueNativeTranslate(event, targetComposer);
      };
      window.__dfNativeEnterBeforeInputHandler = (event) => {
        if (event?.target?.closest?.('.df-composer-review')) return;
        const targetComposer = resolveNativeComposerForEnter(event);
        if (!targetComposer) return;
        if (handleTelegramMediaCaptionLike008(event, targetComposer)) return;
        if ((event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') || shouldAllowShiftLineBreak(event, targetComposer)) return;
        if (shouldBlockModifiedLineBreak(event, targetComposer)) {
          stopSendEvent(event);
          showEnterOnlyHint(targetComposer);
          return;
        }
        markPlainEnter(targetComposer);
        queueNativeTranslate(event, targetComposer);
      };
      window.addEventListener('keydown', window.__dfNativeEnterKeydownHandler, true);
      window.__dfNativeEnterKeypressHandler = window.__dfNativeEnterBlockOnlyHandler;
      window.__dfNativeEnterKeyupHandler = window.__dfNativeEnterBlockOnlyHandler;
      window.addEventListener('keypress', window.__dfNativeEnterKeypressHandler, true);
      window.addEventListener('keyup', window.__dfNativeEnterKeyupHandler, true);
      window.addEventListener('beforeinput', window.__dfNativeEnterBeforeInputHandler, true);
      document.addEventListener('keydown', window.__dfNativeEnterKeydownHandler, true);
      document.addEventListener('keypress', window.__dfNativeEnterKeypressHandler, true);
      document.addEventListener('keyup', window.__dfNativeEnterKeyupHandler, true);
      document.addEventListener('beforeinput', window.__dfNativeEnterBeforeInputHandler, true);
    }
    if (window.__dfNativeClickGuardInstalled !== nativeGuardVersion) {
      if (window.__dfNativeClickGuardHandler) document.removeEventListener('click', window.__dfNativeClickGuardHandler, true);
      if (window.__dfNativePointerGuardHandler) document.removeEventListener('pointerdown', window.__dfNativePointerGuardHandler, true);
      if (window.__dfNativeMouseDownGuardHandler) document.removeEventListener('mousedown', window.__dfNativeMouseDownGuardHandler, true);
      if (window.__dfNativePointerUpGuardHandler) document.removeEventListener('pointerup', window.__dfNativePointerUpGuardHandler, true);
      if (window.__dfNativeMouseUpGuardHandler) document.removeEventListener('mouseup', window.__dfNativeMouseUpGuardHandler, true);
      if (window.__dfNativeTouchStartGuardHandler) document.removeEventListener('touchstart', window.__dfNativeTouchStartGuardHandler, true);
      if (window.__dfNativeTouchEndGuardHandler) document.removeEventListener('touchend', window.__dfNativeTouchEndGuardHandler, true);
      if (window.__dfNativeSubmitGuardHandler) document.removeEventListener('submit', window.__dfNativeSubmitGuardHandler, true);
      window.__dfNativeClickGuardInstalled = nativeGuardVersion;
      window.__dfNativeClickGuardHandler = (event) => {
        if (window.__dfTranslatorProgrammaticSend) return;
        const mediaCaptionConfirm = telegramComposerMode
          ? event.target?.closest?.('.simple-message-input-confirm')
          : null;
        if (mediaCaptionConfirm) {
          const mediaCaptionComposer = mediaCaptionConfirm
            .closest?.('.simple-message-input-container')
            ?.querySelector?.(
              '.input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
            ) || findVisibleTelegramMediaCaptionComposer();
          if (mediaCaptionComposer) window.__dfLastNativeComposer = mediaCaptionComposer;
          if (mediaCaptionComposer && !getComposerText(mediaCaptionComposer).trim()) {
            delete window.__dfTelegramMediaCaptionReady;
            delete window.__dfTelegramMediaCaptionPending;
            delete mediaCaptionComposer.dataset.dfTranslatedReady;
            delete mediaCaptionComposer.dataset.dfTranslatorRequestId;
            delete mediaCaptionComposer.dataset.dfTranslatorReadyRequestId;
            delete mediaCaptionComposer.dataset.dfTranslationPending;
            delete mediaCaptionComposer.dataset.dfTranslationPendingAt;
            window.__dfTelegramEnterTrace = {
              at: Date.now(),
              type: event.type || 'click',
              key: '',
              code: '',
              keyCode: 0,
              which: 0,
              inputType: '',
              composing: false,
              mediaCaption: true,
              decision: 'allowed-empty-media-caption-confirm'
            };
            return;
          }
          stopSendEvent(event);
          showEnterOnlyHint(mediaCaptionComposer || null);
          window.__dfTelegramEnterTrace = {
            at: Date.now(),
            type: event.type || 'click',
            key: '',
            code: '',
            keyCode: 0,
            which: 0,
            inputType: '',
            composing: false,
            mediaCaption: true,
            decision: 'blocked-media-caption-confirm-use-enter'
          };
          return;
        }
        const targetComposer = findNativeComposerForSendGuard();
        if (!isLikelyNativeSendTarget(event, targetComposer)) return;
        if (!targetComposer) return;
        const hasTextDraft = Boolean(getComposerText(targetComposer).trim()) ||
          Boolean(targetComposer.dataset.dfTranslatedReady) ||
          Boolean(targetComposer.dataset.dfTranslationPending) ||
          Boolean(targetComposer.dataset.dfSensitiveSendToken) ||
          Boolean(targetComposer.dataset.dfSensitiveReviewPending);
        if (!hasTextDraft) return;
        window.__dfLastNativeComposer = targetComposer;
        stopSendEvent(event);
        showEnterOnlyHint(targetComposer);
      };
      window.__dfNativePointerGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativeMouseDownGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativePointerUpGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativeMouseUpGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativeTouchStartGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativeTouchEndGuardHandler = window.__dfNativeClickGuardHandler;
      window.__dfNativeSubmitGuardHandler = (event) => {
        if (window.__dfTranslatorProgrammaticSend) return;
        const targetComposer = findNativeComposer();
        if (!targetComposer) return;
        const hasTextDraft = Boolean(getComposerText(targetComposer).trim()) ||
          Boolean(targetComposer.dataset.dfTranslatedReady) ||
          Boolean(targetComposer.dataset.dfTranslationPending) ||
          Boolean(targetComposer.dataset.dfSensitiveSendToken);
        if (!hasTextDraft || hasRecentPlainEnter(targetComposer)) return;
        stopSendEvent(event);
        showEnterOnlyHint(targetComposer);
      };
      document.addEventListener('pointerdown', window.__dfNativePointerGuardHandler, true);
      document.addEventListener('mousedown', window.__dfNativeMouseDownGuardHandler, true);
      document.addEventListener('pointerup', window.__dfNativePointerUpGuardHandler, true);
      document.addEventListener('mouseup', window.__dfNativeMouseUpGuardHandler, true);
      document.addEventListener('touchstart', window.__dfNativeTouchStartGuardHandler, true);
      document.addEventListener('touchend', window.__dfNativeTouchEndGuardHandler, true);
      document.addEventListener('click', window.__dfNativeClickGuardHandler, true);
      document.addEventListener('submit', window.__dfNativeSubmitGuardHandler, true);
    }
    updateWebSendGuardOverlay(findNativeComposerForSendGuard());
    if (!input.dataset.dfBound) {
      input.dataset.dfBound = '1';
      input.addEventListener('focus', () => composer.focus());
      input.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        composer.focus();
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(96, Math.max(42, input.scrollHeight)) + 'px';
        if (proxy) proxy.hidden = !input.value.trim();
        delete input.dataset.dfTranslationPending;
        queueEvent({ action: 'typing', text: input.value });
      });
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.shiftKey) return;
        if (event.ctrlKey || event.altKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          status.textContent = '请按回车键发送';
          return;
        }
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const action = 'translate';
        const text = input.value;
        const normalizedText = input.value.replace(/\\r\\n?/g, '\\n').trim();
        if (!/[\\u4e00-\\u9fff]/.test(normalizedText)) return;
        if (input.dataset.dfTranslationPending === normalizedText) return;
        input.dataset.dfTranslationPending = normalizedText;
        queueEvent({
          action,
          text
        });
      });
    }
    document.getElementById('df-composer-review')?.remove();
    return { host, input, status, proxy };
  };

  installStyle();
  installWhatsAppMessageMenuLayerGuard();
  if (telegramComposerMode) {
    document.getElementById('df-composer-review')?.remove();
    if (!findVisibleTelegramMediaCaptionComposer()) {
      delete window.__dfTelegramMediaCaptionReady;
      delete window.__dfTelegramMediaCaptionPending;
    }
  }
  installUnreadPeek();
  if (
    !telegramComposerMode &&
    document.querySelector('.CompositionArea[data-df-signal-conversation-id]') &&
    payload.action === 'state' &&
    Object.prototype.hasOwnProperty.call(payload.state, 'reviewStatus')
  ) {
    dispatchSignalComposerReviewState(payload.state.reviewStatus, payload.state.reviewText || '');
  }
  if (
    payload.action === 'state' &&
    Object.prototype.hasOwnProperty.call(payload.state, 'translated')
  ) {
    if (payload.state.translated) {
      window.__dfSignalComposerReady = {
        text: payload.state.translated,
        requestId: payload.state.requestId || '',
        conversationSignature: payload.state.conversationSignature || ''
      };
    } else {
      delete window.__dfSignalComposerReady;
    }
  }
  if (payload.action === 'state' && Object.prototype.hasOwnProperty.call(payload.state, 'sensitiveToken')) {
    if (Object.prototype.hasOwnProperty.call(payload.state, 'sensitiveToken')) {
      const nativeComposer = findNativeComposer();
      if (!nativeComposer) return false;
      if (nativeComposer && payload.state.sensitiveToken) {
        nativeComposer.dataset.dfSensitiveSendToken = payload.state.sensitiveToken;
        nativeComposer.dataset.dfSensitiveSendText = payload.state.sensitiveText || '';
        delete nativeComposer.dataset.dfSensitiveReviewPending;
        delete nativeComposer.dataset.dfSensitiveDispatchPending;
        nativeComposer.focus();
      } else if (nativeComposer) {
        delete nativeComposer.dataset.dfSensitiveSendToken;
        delete nativeComposer.dataset.dfSensitiveSendText;
        delete nativeComposer.dataset.dfSensitiveReviewPending;
        delete nativeComposer.dataset.dfSensitiveDispatchPending;
      }
    }
    return true;
  }
  const parts = ensureHost();
  if (!parts) return false;
  if (payload.action === 'focus') {
    findNativeComposer()?.focus();
    parts.host.classList.add('df-translator-active');
    return true;
  }
  if (payload.action === 'focusNative') {
    findNativeComposer()?.focus();
    return true;
  }
  if (payload.action === 'state') {
    const resolveStateNativeComposer = () => {
      const requestId = payload.state.requestId || '';
      const mediaCaptionCandidates = Array.from(document.querySelectorAll(
        '.simple-message-input-container .input-message-container.simple-message-input-inputs .input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
      )).filter((element) => element.isConnected && isMediaCaptionComposer(element));
      if (requestId) {
        const requestBoundMediaCaptionComposer = mediaCaptionCandidates.find((element) => (
          element.dataset.dfTranslatorRequestId === requestId ||
          element.dataset.dfTranslatorReadyRequestId === requestId
        )) || null;
        if (requestBoundMediaCaptionComposer) return requestBoundMediaCaptionComposer;
        if (
          payload.state.composerKind === 'telegram-media-caption' &&
          mediaCaptionCandidates.length === 1
        ) {
          mediaCaptionCandidates[0].dataset.dfTranslatorRequestId = requestId;
          return mediaCaptionCandidates[0];
        }
      }
      if (payload.state.composerKind === 'telegram-media-caption') return mediaCaptionCandidates[0] || null;
      return findNativeComposer();
    };
    if (Object.prototype.hasOwnProperty.call(payload.state, 'draft')) {
      parts.input.value = payload.state.draft || '';
      parts.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (Object.prototype.hasOwnProperty.call(payload.state, 'status')) {
      parts.status.textContent = '';
    }
    if (Object.prototype.hasOwnProperty.call(payload.state, 'translated')) {
      const nativeComposer = resolveStateNativeComposer();
      if (payload.state.composerKind === 'telegram-media-caption' && !nativeComposer) return false;
      if (payload.state.translated) {
        if (payload.state.composerKind === 'telegram-media-caption') {
          window.__dfTelegramMediaCaptionReady = {
            text: payload.state.translated,
            requestId: payload.state.requestId || '',
            conversationSignature: payload.state.conversationSignature || window.__dfConversationSignature || ''
          };
          delete window.__dfTelegramMediaCaptionPending;
          scheduleTelegramMediaCaptionRefocus(payload.state.translated);
        }
        parts.input.dataset.dfTranslated = payload.state.translated;
        parts.input.dataset.dfTranslatorReadyRequestId = payload.state.requestId || parts.input.dataset.dfTranslatorRequestId || '';
        delete parts.input.dataset.dfTranslationPending;
        if (nativeComposer) nativeComposer.dataset.dfTranslatedReady = payload.state.translated;
        if (nativeComposer) nativeComposer.dataset.dfTranslatorReadyRequestId = payload.state.requestId || nativeComposer.dataset.dfTranslatorRequestId || '';
        if (nativeComposer) delete nativeComposer.dataset.dfTranslationPending;
      } else {
        delete window.__dfTelegramMediaCaptionReady;
        delete window.__dfTelegramMediaCaptionPending;
        delete parts.input.dataset.dfTranslated;
        delete parts.input.dataset.dfTranslatorRequestId;
        delete parts.input.dataset.dfTranslatorReadyRequestId;
        delete parts.input.dataset.dfTranslationPending;
        if (nativeComposer) delete nativeComposer.dataset.dfTranslatedReady;
        if (nativeComposer) delete nativeComposer.dataset.dfTranslatorRequestId;
        if (nativeComposer) delete nativeComposer.dataset.dfTranslatorReadyRequestId;
        if (nativeComposer) delete nativeComposer.dataset.dfTranslationPending;
      }
    }

    return true;
  }
  return true;
})()
`;
}

function buildEnterTranslateScript() {
  return `
(() => {
${buildComposerPlainTextReaderSource()}
${buildDirectSendHttpUrlSource()}
  const installVersion = '2026-10-01-signal-sensitive-state-v21';
  if (window.__dfEnterTranslateInstalled === installVersion) return true;
  window.__dfEnterTranslateInstalled = installVersion;
  const listenerIsCurrent = () => window.__dfEnterTranslateInstalled === installVersion;
  if (window.__dfSignalComposerPollTimer) {
    clearInterval(window.__dfSignalComposerPollTimer);
  }

  const hasChinese = (text) => /[\\u4e00-\\u9fff]/.test(text || '');
  const hasEnglish = (text) => /[A-Za-z]{2,}/.test(text || '');
  const isProgrammaticSend = () => Boolean(window.__dfTranslatorProgrammaticSend);
  const composerReviewSettingKey = 'df-composer-review-enabled-v1';
  const readComposerReviewEnabled = () => {
    try {
      const persisted = window.localStorage?.getItem?.(composerReviewSettingKey);
      if (persisted === '0') {
        window.__dfComposerReviewEnabled = false;
        return false;
      }
      if (persisted === '1') {
        window.__dfComposerReviewEnabled = true;
        return true;
      }
    } catch {
      // Fall back to the source-native runtime state when storage is unavailable.
    }
    return window.__dfComposerReviewEnabled !== false;
  };
  const isVisible = (el) => {
    const className = (el.className || '').toString();
    if (/input-field-input-fake|input-message-input-fake/.test(className)) return false;
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 40
      && rect.height > 16
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && style.pointerEvents !== 'none';
  };
  const isEditableElement = (el) => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const getText = (el) => readComposerPlainText(el);
  const findComposerFromSelection = () => {
    const node = window.getSelection?.()?.focusNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const composer = element?.closest?.('[contenteditable], [role="textbox"], textarea, input') || null;
    if (!composer || !isVisible(composer)) return null;
    if (!isEditableElement(composer)) return null;
    if (composer.closest('[role="dialog"], .df-translator-host, .df-composer-review')) return null;
    const label = ((composer.getAttribute('role') || '') + ' ' + (composer.getAttribute('aria-label') || '') + ' ' + (composer.getAttribute('placeholder') || '')).toLowerCase();
    if (/search|filter|find/.test(label)) return null;
    return composer;
  };
  const setText = (el, value) => {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter?.call(el, value);
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('delete', false);
      el.textContent = value;
      if (value) {
        const caret = document.createRange();
        caret.selectNodeContents(el);
        caret.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(caret);
      }
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: value ? 'insertText' : 'deleteContentBackward', data: value || null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const isComposer = (el) => {
    if (!el || !isVisible(el)) return false;
    if (!isEditableElement(el)) return false;
    if (el.closest('[role="dialog"], .df-translator-host, .df-composer-review')) return false;
    const label = ((el.getAttribute('role') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase();
    if (/search|filter|find/.test(label)) return false;
    if (document.activeElement === el && hasChinese(getText(el))) return true;
    const rect = el.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.55 && hasChinese(getText(el))) return true;
    return Boolean(el.closest('footer, [class*="composer"], [class*="compose"], [class*="composition"], [class*="input"], [class*="message-input"], [class*="chat-input"]'));
  };
  const findComposer = () => {
    const selectedComposer = findComposerFromSelection();
    if (selectedComposer) return selectedComposer;
    const active = document.activeElement;
    if (isComposer(active)) return active;
    const selectors = [
      '.chat-input-main .input-message-container > .input-message-input[contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.chat-input-main .input-message-input[contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)',
      '.new-message-wrapper .input-message-container > .input-message-input[contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)',
      'footer [contenteditable="true"][role="textbox"]',
      'footer [contenteditable][role="textbox"]',
      'footer [role="textbox"]',
      'footer [contenteditable]',
      'footer [contenteditable="true"]',
      '[data-testid*="composition"] [contenteditable="true"]',
      '[data-testid*="composition"] [contenteditable]',
      '[data-testid*="composition"] [role="textbox"]',
      '[data-testid*="compose"] [contenteditable="true"]',
      '[data-testid*="compose"] [contenteditable]',
      '[data-testid*="compose"] [role="textbox"]',
      '[data-testid*="input"] [contenteditable="true"]',
      '[data-testid*="input"] [contenteditable]',
      '[data-testid*="input"] [role="textbox"]',
      '[class*="composition"] [contenteditable="true"]',
      '[class*="composition"] [contenteditable]',
      '[class*="composition"] [role="textbox"]',
      '[class*="compose"] [contenteditable="true"]',
      '[class*="compose"] [contenteditable]',
      '[class*="compose"] [role="textbox"]',
      '[class*="input"] [contenteditable="true"]',
      '[class*="input"] [contenteditable]',
      '[class*="input"] [role="textbox"]',
      '[aria-multiline="true"]',
      '[data-testid="conversation-compose-box-input"]',
      '[data-testid="input-message-input"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable][role="textbox"]',
      '[role="textbox"]',
      'div.input-message-input[contenteditable="true"]',
      'div.input-message-input[contenteditable]',
      '.input-message-input[contenteditable="true"]',
      '.input-message-input[contenteditable]',
      '.composer_rich_textarea',
      '.editable-message-text',
      '#editable-message-text',
      'textarea'
    ];
    for (const selector of selectors) {
      const items = Array.from(document.querySelectorAll(selector)).filter(isComposer);
      if (items.length) return items[items.length - 1];
    }
    return null;
  };
  if (window.__dfSignalComposerReviewSettingHandler) {
    window.removeEventListener('df-composer-review-setting', window.__dfSignalComposerReviewSettingHandler);
  }
  window.__dfSignalComposerReviewSettingHandler = (event) => {
    const detailEnabled = event?.detail?.enabled;
    const enabled = typeof detailEnabled === 'boolean'
      ? detailEnabled
      : readComposerReviewEnabled();
    window.__dfComposerReviewEnabled = enabled;
    if (enabled) return;
    window.__dfSetComposerReviewState?.('hidden', '');
    const composer = findComposer();
    if (!composer || hasChinese(getText(composer))) return;
    delete composer.dataset.dfTranslationPending;
    delete composer.dataset.dfTranslationPendingAt;
  };
  window.addEventListener('df-composer-review-setting', window.__dfSignalComposerReviewSettingHandler);
  readComposerReviewEnabled();
  const readSignalConversationSignature = () => {
    const conversationId = document
      .querySelector('.CompositionArea[data-df-signal-conversation-id]')
      ?.getAttribute('data-df-signal-conversation-id')
      ?.trim() || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
      ? 'signal:' + conversationId.toLowerCase()
      : '';
  };
  window.__dfSignalApplySensitiveState = (state) => {
    if (!listenerIsCurrent()) return false;
    const composer = findComposer();
    if (!composer) return false;
    if (state.sensitiveToken) {
      const signature = readSignalConversationSignature() || window.__dfConversationSignature || '';
      if (getText(composer) !== state.sensitiveText || signature !== state.conversationSignature) return false;
      composer.dataset.dfSensitiveSendToken = state.sensitiveToken;
      composer.dataset.dfSensitiveSendText = state.sensitiveText;
      delete composer.dataset.dfSensitiveReviewPending;
      delete composer.dataset.dfSensitiveDispatchPending;
      composer.focus();
      return true;
    }
    delete composer.dataset.dfSensitiveSendToken;
    delete composer.dataset.dfSensitiveSendText;
    delete composer.dataset.dfSensitiveReviewPending;
    delete composer.dataset.dfSensitiveDispatchPending;
    return true;
  };
  const queueTranslate = (text) => {
    const textKey = (text || '').trim();
    if (!textKey) return false;
    const conversationSignature = readSignalConversationSignature() || window.__dfConversationSignature || '';
    if (conversationSignature) window.__dfConversationSignature = conversationSignature;
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({
      action: 'translate',
      text,
      conversationSignature,
      reviewEnabled: readComposerReviewEnabled(),
      at: Date.now()
    });
    return true;
  };
  const queueSend = (text, requestId = '') => {
    const now = Date.now();
    if (now - (window.__dfTranslatorLastSendAt || 0) < 500) return;
    window.__dfTranslatorLastSendAt = now;
    const conversationSignature = readSignalConversationSignature() || window.__dfConversationSignature || '';
    if (conversationSignature) window.__dfConversationSignature = conversationSignature;
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({ action: 'send', text: text || '', requestId, conversationSignature, at: now });
  };
  const isSensitiveSendCandidate = (value) => {
    if (!value || value.length > 256 || /[\\r\\n]/.test(value)) return false;
    if (/^[0-9]{1,11}$/.test(value.trim())) return true;
      const digits = value.replace(/ /g, '');
    if (/^[0-9 ]+$/.test(value) && value === value.trim() && digits.length >= 12 && digits.length <= 34) return true;
    if (/^0x[0-9A-Za-z]{20,80}$/.test(value)) return true;
    if (/^T[0-9A-Za-z]{33}$/.test(value)) return true;
    return /^[0-9A-Za-z]{32,44}$/.test(value);
  };
  const stopSendEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const sameComposerTarget = (left, right) => Boolean(
    left && right && (left === right || left.contains?.(right) || right.contains?.(left))
  );
  const rememberShiftEnter = (event, target) => {
    if (event?.key !== 'Enter' || !event.shiftKey) return false;
    window.__dfSignalShiftEnterTarget = target || event.target || null;
    window.__dfSignalShiftEnterUntil = Date.now() + 500;
    return true;
  };
  const clearShiftEnter = () => {
    window.__dfSignalShiftEnterTarget = null;
    window.__dfSignalShiftEnterUntil = 0;
  };
  const shouldAllowShiftLineBreak = (event, target) => {
    if (window.__dfSignalAllowedShiftLineBreakEvent === event) return true;
    const modifierActive = Boolean(event?.shiftKey || event?.getModifierState?.('Shift'));
    const remembered = Date.now() <= Number(window.__dfSignalShiftEnterUntil || 0) &&
      sameComposerTarget(window.__dfSignalShiftEnterTarget, target || event?.target);
    if (!modifierActive && !remembered) return false;
    window.__dfSignalAllowedShiftLineBreakEvent = event;
    window.setTimeout(() => {
      if (window.__dfSignalAllowedShiftLineBreakEvent === event) window.__dfSignalAllowedShiftLineBreakEvent = null;
      clearShiftEnter();
    }, 0);
    return true;
  };
  const isPlainSendEnter = (event) => Boolean(
    event?.key === 'Enter' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.isComposing &&
    event.keyCode !== 229
  );
  const rememberModifiedEnter = (event, target) => {
    if (event?.key !== 'Enter' || event.shiftKey || (!event.ctrlKey && !event.altKey && !event.metaKey)) return false;
    window.__dfSignalModifiedEnterTarget = target || event.target || null;
    window.__dfSignalModifiedEnterUntil = Date.now() + 500;
    return true;
  };
  const shouldBlockModifiedLineBreak = (event, target) => {
    const modifierActive = Boolean(event?.ctrlKey || event?.altKey || event?.metaKey);
    return modifierActive || (
      Date.now() <= Number(window.__dfSignalModifiedEnterUntil || 0) &&
      sameComposerTarget(window.__dfSignalModifiedEnterTarget, target || event?.target)
    );
  };
  const queueEnterOnlyHint = () => {
    const now = Date.now();
    if (now - Number(window.__dfSignalEnterOnlyHintAt || 0) < 500) return;
    window.__dfSignalEnterOnlyHintAt = now;
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({ action: 'enter-only-hint', text: '', at: now });
  };
  const handleSensitiveSend = (event, composer) => {
    const text = getText(composer);
    const token = composer.dataset?.dfSensitiveSendToken || '';
    if (token) {
      stopSendEvent(event);
      if (text !== (composer.dataset.dfSensitiveSendText || '')) {
        window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
        window.__dfTranslatorQueue.push({ action: 'sensitive-cancel', text: '', at: Date.now() });
        delete composer.dataset.dfSensitiveSendToken;
        delete composer.dataset.dfSensitiveSendText;
        delete composer.dataset.dfSensitiveReviewPending;
        return true;
      }
      if (composer.dataset.dfSensitiveDispatchPending === token) return true;
      composer.dataset.dfSensitiveDispatchPending = token;
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({
        action: 'sensitive-send',
        text,
        requestId: token,
        conversationSignature: readSignalConversationSignature() || window.__dfConversationSignature || '',
        at: Date.now()
      });
      return true;
    }
    if (!isSensitiveSendCandidate(text)) return false;
    stopSendEvent(event);
    if (composer.dataset.dfSensitiveReviewPending === text) return true;
    composer.dataset.dfSensitiveReviewPending = text;
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({
      action: 'sensitive-prepare',
      text,
      conversationSignature: readSignalConversationSignature() || window.__dfConversationSignature || '',
      at: Date.now()
    });
    return true;
  };
  const queueTyping = (text) => {
    const textKey = (text || '').trim();
    const now = Date.now();
    const last = window.__dfTranslatorLastTyping || {};
    if (last.text === textKey && now - last.at < 120) return;
    window.__dfTranslatorLastTyping = { text: textKey, at: now };
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({ action: 'typing', text: textKey, at: Date.now() });
  };
  const queueDebug = (message) => {
    const textKey = String(message || '').trim();
    if (!textKey) return;
    const now = Date.now();
    const last = window.__dfTranslatorLastDebug || {};
    if (last.text === textKey && now - last.at < 1400) return;
    window.__dfTranslatorLastDebug = { text: textKey, at: now };
    window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
    window.__dfTranslatorQueue.push({ action: 'debug', text: textKey, at: Date.now() });
  };
  const blockAndTranslate = (event, composer, text = getText(composer).trim()) => {
    if (isDirectSendHttpUrl(text)) return false;
    const chineseDraft = hasChinese(text);
    const reviewEnabled = readComposerReviewEnabled();
    if (!chineseDraft && (!reviewEnabled || !hasEnglish(text))) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const normalizedText = text.replace(/\\r\\n?/g, '\\n').trim();
    if (composer.dataset.dfTranslationPending === normalizedText) return true;
    composer.dataset.dfTranslationPending = normalizedText;
    composer.dataset.dfTranslationPendingAt = String(Date.now());
    delete window.__dfSignalComposerReady;
    delete composer.dataset.dfTranslatedReady;
    delete composer.dataset.dfTranslatorReadyRequestId;
    queueTranslate(text);
    if (chineseDraft) {
      window.__dfTranslatorNativeWrite = true;
      setText(composer, '');
      window.setTimeout(() => { window.__dfTranslatorNativeWrite = false; }, 120);
    }
    return true;
  };
  const handler = (event) => {
    if (!listenerIsCurrent()) return;
    if (isProgrammaticSend()) return;
    if (event?.target?.closest?.('.df-composer-review')) return;
    if (event.key !== 'Enter') return;
    const composer = isComposer(event.target) ? event.target : findComposer();
    if (!composer) return;
    if (rememberShiftEnter(event, composer)) return;
    if (rememberModifiedEnter(event, composer)) {
      stopSendEvent(event);
      queueEnterOnlyHint();
      composer.focus?.();
      return;
    }
    if (!isPlainSendEnter(event)) return;
    clearShiftEnter();
    if (handleSensitiveSend(event, composer)) return;
    const currentText = getText(composer).trim();
    if (isDirectSendHttpUrl(currentText)) {
      window.__dfSetComposerReviewState?.('hidden', '');
      return;
    }
    if (hasChinese(currentText)) {
      blockAndTranslate(event, composer, currentText);
      return;
    }
    const stableConversationSignature = readSignalConversationSignature() || window.__dfConversationSignature || '';
    const windowReady = window.__dfSignalComposerReady || null;
    const windowReadyMatchesConversation = Boolean(
      windowReady?.text &&
      windowReady?.requestId &&
      windowReady?.conversationSignature &&
      windowReady.conversationSignature === stableConversationSignature
    );
    const translatedReady = composer.dataset?.dfTranslatedReady || (windowReadyMatchesConversation ? windowReady.text : '');
    if (translatedReady) {
      const normalizedCurrent = currentText.replace(/\\r\\n?/g, '\\n').trim();
      const normalizedReady = translatedReady.replace(/\\r\\n?/g, '\\n').trim();
      if (normalizedCurrent !== normalizedReady) {
        delete composer.dataset.dfTranslatedReady;
        delete composer.dataset.dfTranslatorRequestId;
        delete composer.dataset.dfTranslatorReadyRequestId;
        delete composer.dataset.dfSendPending;
        delete window.__dfSignalComposerReady;
        window.__dfSetComposerReviewState?.('hidden', '');
      } else {
        if (composer.dataset.dfSendPending === translatedReady) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
        composer.dataset.dfSendPending = translatedReady;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        queueSend(
          translatedReady,
          composer.dataset.dfTranslatorReadyRequestId || composer.dataset.dfTranslatorRequestId || (windowReadyMatchesConversation ? windowReady.requestId : '')
        );
        return;
      }
    }
    if (readComposerReviewEnabled() && hasEnglish(currentText)) {
      blockAndTranslate(event, composer, currentText);
      return;
    }
  };
  const beforeInputHandler = (event) => {
    if (!listenerIsCurrent()) return;
    if (isProgrammaticSend()) return;
    if (event?.target?.closest?.('.df-composer-review')) return;
    if (event.inputType !== 'insertLineBreak' && event.inputType !== 'insertParagraph') return;
    const composer = isComposer(event.target) ? event.target : findComposer();
    if (!composer) return;
    if (shouldAllowShiftLineBreak(event, composer)) return;
    if (shouldBlockModifiedLineBreak(event, composer)) {
      stopSendEvent(event);
      queueEnterOnlyHint();
      composer.focus?.();
      return;
    }
    if (handleSensitiveSend(event, composer)) return;
    if (isDirectSendHttpUrl(getText(composer).trim())) {
      window.__dfSetComposerReviewState?.('hidden', '');
      return;
    }
    blockAndTranslate(event, composer);
  };
  const sendPointerHandler = (event) => {
    if (!listenerIsCurrent()) return;
    if (isProgrammaticSend()) return;
    const button = event.target?.closest?.('button, [role="button"]');
    if (!button) return;
    const icon = button.querySelector?.('[class*="send"], [data-icon*="send"], [data-testid*="send"], use[href*="send"]');
    const label = (
      (button.getAttribute('aria-label') || '') + ' ' +
      (button.getAttribute('data-testid') || '') + ' ' +
      (button.getAttribute('class') || '') + ' ' +
      (button.textContent || '')
    ).toLowerCase();
    const isSendButton = /send|send message|发送/.test(label) ||
      Boolean(icon) ||
      button.classList?.contains('CompositionArea__edit-button--accept');
    if (!isSendButton) return;
    const composer = findComposer();
    if (!composer) return;
    const hasTextDraft = Boolean(getText(composer).trim()) ||
      Boolean(composer.dataset?.dfTranslatedReady) ||
      Boolean(composer.dataset?.dfTranslationPending) ||
      Boolean(composer.dataset?.dfSendPending) ||
      Boolean(composer.dataset?.dfSensitiveSendToken) ||
      Boolean(composer.dataset?.dfSensitiveReviewPending);
    if (!hasTextDraft) return;
    stopSendEvent(event);
    queueEnterOnlyHint();
    composer.focus?.();
  };
  const rememberComposerText = (event) => {
    if (!listenerIsCurrent()) return;
    if (event?.target?.closest?.('.df-composer-review')) return;
    const composer = isComposer(event.target) ? event.target : findComposer();
    if (!composer) return;
    const sensitiveText = composer.dataset.dfSensitiveSendToken
      ? composer.dataset.dfSensitiveSendText
      : composer.dataset.dfSensitiveReviewPending;
    if (sensitiveText !== undefined && getText(composer) === sensitiveText) return;
    if (!window.__dfTranslatorNativeWrite) {
      if (composer.dataset.dfSensitiveSendToken || composer.dataset.dfSensitiveReviewPending) {
        window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
        window.__dfTranslatorQueue.push({ action: 'sensitive-cancel', text: '', at: Date.now() });
      }
      delete composer.dataset.dfTranslationPending;
      delete composer.dataset.dfTranslationPendingAt;
      delete composer.dataset.dfSendPending;
      delete composer.dataset.dfTranslatedReady;
      delete composer.dataset.dfTranslatorRequestId;
      delete composer.dataset.dfTranslatorReadyRequestId;
      delete window.__dfSignalComposerReady;
      delete composer.dataset.dfSensitiveSendToken;
      delete composer.dataset.dfSensitiveSendText;
      delete composer.dataset.dfSensitiveReviewPending;
      delete composer.dataset.dfSensitiveDispatchPending;
      window.__dfSetComposerReviewState?.('hidden', '');
    }
  };
  const blockOnlyHandler = (event) => {
    if (!listenerIsCurrent()) return;
    if (isProgrammaticSend()) return;
    if (event?.target?.closest?.('.df-composer-review')) return;
    if (event.key !== 'Enter') return;
    const composer = isComposer(event.target) ? event.target : findComposer();
    if (!composer) return;
    if (rememberShiftEnter(event, composer)) return;
    if (rememberModifiedEnter(event, composer)) {
      stopSendEvent(event);
      queueEnterOnlyHint();
      composer.focus?.();
      return;
    }
    if (!isPlainSendEnter(event)) return;
    const text = getText(composer).trim();
    if (isDirectSendHttpUrl(text)) return;
    if (hasChinese(text) || (readComposerReviewEnabled() && hasEnglish(text)) || isSensitiveSendCandidate(getText(composer)) || composer.dataset.dfTranslationPending || composer.dataset.dfSendPending || composer.dataset.dfSensitiveSendToken || composer.dataset.dfSensitiveReviewPending) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };
  const addListeners = (target) => {
    if (!target || target.__dfSignalEnterListenersVersion === installVersion) return;
    const previous = target.__dfSignalEnterListeners;
    if (previous) {
      target.removeEventListener('keydown', previous.handler, true);
      target.removeEventListener('keyup', previous.blockOnlyHandler, true);
      target.removeEventListener('keypress', previous.blockOnlyHandler, true);
      target.removeEventListener('beforeinput', previous.beforeInputHandler, true);
      target.removeEventListener('pointerdown', previous.sendPointerHandler, true);
      target.removeEventListener('click', previous.sendPointerHandler, true);
      target.removeEventListener('input', previous.rememberComposerText, true);
    }
    target.__dfSignalEnterListenersVersion = installVersion;
    target.__dfSignalEnterListeners = {
      handler,
      blockOnlyHandler,
      beforeInputHandler,
      sendPointerHandler,
      rememberComposerText
    };
    target.addEventListener('keydown', handler, true);
    target.addEventListener('keyup', blockOnlyHandler, true);
    target.addEventListener('keypress', blockOnlyHandler, true);
    target.addEventListener('beforeinput', beforeInputHandler, true);
    target.addEventListener('pointerdown', sendPointerHandler, true);
    target.addEventListener('click', sendPointerHandler, true);
    target.addEventListener('input', rememberComposerText, true);
  };
  addListeners(window);
  addListeners(document);
  addListeners(document.body);
  window.__dfSignalComposerPollState = { text: '', since: 0, queued: '' };
  window.__dfSignalComposerPollTimer = setInterval(() => {
    const composer = findComposer();
    if (!composer) {
      return;
    }
    const text = getText(composer).trim();
    const now = Date.now();
    if (!hasChinese(text)) {
      window.__dfSignalComposerPollState = { text: '', since: 0, queued: '' };
      return;
    }
    const state = window.__dfSignalComposerPollState || { text: '', since: 0, queued: '' };
    if (state.text !== text) {
      window.__dfSignalComposerPollState = { text, since: now, queued: '' };
      return;
    }
    queueTyping(text);
    window.__dfSignalComposerPollState = { text, since: state.since || now, queued: state.queued || '' };
  }, 360);
  return true;
})()
`;
}

function normalizeCacheText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeComposerSourceText(text: string) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .trim();
}

function hasChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function hasEnglishText(text: string) {
  return /[A-Za-z]{2,}/.test(text);
}

function hasTranslationPromptLeak(text: string) {
  return /translate the following chat message|return only the translated message|keep\s+emojis?,?\s*urls|请将以下英文聊天信息翻译成中文|(?:保留|保持)\s*表情符号|你是一名(?:中译英|英译中)聊天翻译助手|只输出(?:英文|中文)译文|普通英文单词和短语必须翻译|保持原有换行和空行结构|敏感信息占位符必须原样保留|仅返回翻译后的信息|无需解释/i.test(text);
}

function isUsefulMessageTranslation(sourceText: string, translatedText: string) {
  const source = normalizeCacheText(sourceText);
  const translated = normalizeCacheText(translatedText);
  if (!translated) return false;
  if (hasTranslationPromptLeak(translated)) return false;
  if (source && translated.toLowerCase() === source.toLowerCase()) return false;
  if ((!source || /[A-Za-z]{2,}/.test(source)) && !hasChineseText(translated)) return false;
  return true;
}

function hashText(text: string) {
  let hash = 2166136261;
  for (const char of normalizeCacheText(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheScope(profileId: string, candidate?: Partial<MessageCandidate>) {
  return `${profileId}:${candidate?.contactKey || candidate?.contactId || 'unknown-contact'}`;
}

function profileSourceCacheScope(profileId: string) {
  return `${profileId}:__profile-source__`;
}

function estimateTranslationCacheBytes(sourceHash: string, translatedText: string) {
  return 96 + sourceHash.length * 2 + translatedText.length * 2;
}

function ensureTranslationCacheStats(scope: string, cache: Map<string, string>) {
  let stats = translationMemoryCacheStats.get(scope);
  if (stats) return stats;
  let bytes = 0;
  cache.forEach((translatedText, sourceHash) => {
    bytes += estimateTranslationCacheBytes(sourceHash, translatedText);
  });
  stats = { entries: cache.size, bytes, lastAccessed: Date.now() };
  translationMemoryCacheStats.set(scope, stats);
  translationHotCacheEntries += stats.entries;
  translationHotCacheBytes += stats.bytes;
  return stats;
}

function rebuildTranslationHotCacheStats() {
  translationMemoryCacheStats.clear();
  translationHotCacheEntries = 0;
  translationHotCacheBytes = 0;
  for (const [scope, cache] of translationMemoryCaches.entries()) {
    ensureTranslationCacheStats(scope, cache);
  }
}

function enforceTranslationHotCacheLimits() {
  if (
    translationHotCacheEntries <= translationHotCacheEntryLimit &&
    translationHotCacheBytes <= translationHotCacheByteLimit
  ) {
    return;
  }
  const coldScopes = Array.from(translationMemoryCacheStats.entries())
    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  for (const [scope, stats] of coldScopes) {
    if (
      translationHotCacheEntries <= translationHotCacheEntryLimit &&
      translationHotCacheBytes <= translationHotCacheByteLimit
    ) {
      break;
    }
    translationMemoryCaches.delete(scope);
    translationMemoryCacheStats.delete(scope);
    translationHotCacheEntries = Math.max(0, translationHotCacheEntries - stats.entries);
    translationHotCacheBytes = Math.max(0, translationHotCacheBytes - stats.bytes);
  }
}

function profileTranslationCache(profileId: string, candidate?: Partial<MessageCandidate>) {
  const scope = cacheScope(profileId, candidate);
  let cache = translationMemoryCaches.get(scope);
  if (!cache) {
    cache = new Map<string, string>();
    translationMemoryCaches.set(scope, cache);
  }
  ensureTranslationCacheStats(scope, cache).lastAccessed = Date.now();
  return cache;
}

function setTranslationMemoryCacheEntry(profileId: string, candidate: Partial<MessageCandidate> | undefined, sourceHash: string, translatedText: string) {
  const scope = cacheScope(profileId, candidate);
  const cache = profileTranslationCache(profileId, candidate);
  const stats = ensureTranslationCacheStats(scope, cache);
  const previousText = cache.get(sourceHash);
  const previousBytes = previousText ? estimateTranslationCacheBytes(sourceHash, previousText) : 0;
  const nextBytes = estimateTranslationCacheBytes(sourceHash, translatedText);
  cache.set(sourceHash, translatedText);
  if (!previousText) {
    stats.entries += 1;
    translationHotCacheEntries += 1;
  }
  stats.bytes += nextBytes - previousBytes;
  stats.lastAccessed = Date.now();
  translationHotCacheBytes += nextBytes - previousBytes;
  enforceTranslationHotCacheLimits();
}

function deleteTranslationMemoryCacheEntry(profileId: string, candidate: Partial<MessageCandidate> | undefined, sourceHash: string) {
  const scope = cacheScope(profileId, candidate);
  const cache = translationMemoryCaches.get(scope);
  if (!cache) return;
  const previousText = cache.get(sourceHash);
  if (!previousText) return;
  const stats = ensureTranslationCacheStats(scope, cache);
  cache.delete(sourceHash);
  const previousBytes = estimateTranslationCacheBytes(sourceHash, previousText);
  stats.entries = Math.max(0, stats.entries - 1);
  stats.bytes = Math.max(0, stats.bytes - previousBytes);
  stats.lastAccessed = Date.now();
  translationHotCacheEntries = Math.max(0, translationHotCacheEntries - 1);
  translationHotCacheBytes = Math.max(0, translationHotCacheBytes - previousBytes);
}

function applyTranslationCacheEntries(profileId: string, entries: TranslationCacheEntry[], candidate?: Partial<MessageCandidate>) {
  for (const entry of entries) {
    if (entry.sourceHash && isUsefulMessageTranslation(entry.sourceText || '', entry.translatedText)) {
      setTranslationMemoryCacheEntry(profileId, candidate, entry.sourceHash, entry.translatedText);
      setTranslationMemoryCacheEntry(profileId, { contactKey: '__profile-source__' }, entry.sourceHash, entry.translatedText);
    }
  }
}

async function loadTranslationCachePage(profileId: string, limit: number, offset = translationCacheOffsets.get(profileId) ?? 0) {
  if (!window.chatTranslator?.loadTranslationCache || translationCacheExhausted.has(profileId)) return;
  const entries = await withTranslationDeadline(window.chatTranslator.loadTranslationCache({ profileId, offset, limit }), 10_000, webRuntimeControllers.get(profileId)?.signal);
  applyTranslationCacheEntries(profileId, entries);
  translationCacheOffsets.set(profileId, offset + entries.length);
  if (entries.length < limit) {
    translationCacheExhausted.add(profileId);
  }
}

function isTranslationCacheWarmupReady(profileId: string) {
  return translationCachePreloaded.has(profileId);
}

async function preloadTranslationCache(profileId: string) {
  if (translationCachePreloaded.has(profileId)) return true;
  if (!window.chatTranslator?.loadTranslationCache) {
    translationCacheWarmupFailedAt.set(profileId, Date.now());
    return false;
  }
  const activeLoad = translationCacheLoadPromises.get(profileId);
  if (activeLoad) {
    await activeLoad;
    return isTranslationCacheWarmupReady(profileId);
  }
  const promise = loadTranslationCachePage(profileId, translationInitialCacheLimit, 0)
    .then(() => {
      translationCachePreloaded.add(profileId);
      translationCacheWarmupFailedAt.delete(profileId);
    })
    .catch(() => {
      translationCacheWarmupFailedAt.set(profileId, Date.now());
    })
    .finally(() => {
      if (translationCacheLoadPromises.get(profileId) === promise) translationCacheLoadPromises.delete(profileId);
    });
  translationCacheLoadPromises.set(profileId, promise);
  await promise;
  return isTranslationCacheWarmupReady(profileId);
}

function canLoadScopedTranslationCache(candidate?: Partial<MessageCandidate>) {
  return Boolean(candidate?.contactId && candidate.contactIdType);
}

function isScopedTranslationCacheWarmupReady(profileId: string, candidate?: Partial<MessageCandidate>) {
  if (!canLoadScopedTranslationCache(candidate)) return true;
  return scopedTranslationCachePreloaded.has(cacheScope(profileId, candidate));
}

async function preloadScopedTranslationCache(
  profile: ChatProfile,
  candidate?: Partial<MessageCandidate>,
  options: { installRuntime?: boolean } = {}
) {
  if (!window.chatTranslator?.loadTranslationCache || !canLoadScopedTranslationCache(candidate)) return;
  const scope = cacheScope(profile.id, candidate);
  if (scopedTranslationCachePreloaded.has(scope)) {
    if (translationMemoryCaches.get(scope)?.size) return;
    scopedTranslationCachePreloaded.delete(scope);
    scopedTranslationCacheOffsets.delete(scope);
    scopedTranslationCacheExhausted.delete(scope);
  }
  const activeLoad = scopedTranslationCacheLoadPromises.get(scope);
  if (activeLoad) return activeLoad;

  const promise = withTranslationDeadline(window.chatTranslator
    .loadTranslationCache({
      profileId: profile.id,
      platform: profile.platform,
      profileName: profile.name,
      contactId: candidate?.contactId,
      contactIdType: candidate?.contactIdType,
      contactTitle: candidate?.contactTitle,
      contactRemark: candidate?.contactRemark,
      offset: 0,
      limit: translationInitialCacheLimit
    }), 10_000, webRuntimeControllers.get(profile.id)?.signal)
    .then((entries) => {
      applyTranslationCacheEntries(profile.id, entries, candidate);
      if (options.installRuntime !== false) void installCachedTranslationRuntime(profile, entries);
      scopedTranslationCacheOffsets.set(scope, entries.length);
      if (entries.length < translationInitialCacheLimit) scopedTranslationCacheExhausted.add(scope);
    })
    .then(() => {
      scopedTranslationCachePreloaded.add(scope);
      scopedTranslationCacheWarmupFailedAt.delete(scope);
    })
    .catch(() => {
      scopedTranslationCacheWarmupFailedAt.set(scope, Date.now());
    })
    .finally(() => {
      if (scopedTranslationCacheLoadPromises.get(scope) === promise) scopedTranslationCacheLoadPromises.delete(scope);
    });

  scopedTranslationCacheLoadPromises.set(scope, promise);
  await promise;
}

async function loadMoreScopedTranslationCache(
  profile: ChatProfile,
  candidate?: Partial<MessageCandidate>,
  limit = translationHistoryCachePageSize,
  options: { installRuntime?: boolean } = {}
) {
  if (!window.chatTranslator?.loadTranslationCache || !canLoadScopedTranslationCache(candidate)) return [];
  const scope = cacheScope(profile.id, candidate);
  if (scopedTranslationCacheExhausted.has(scope)) return [];
  const activeLoad = scopedTranslationCacheLoadPromises.get(scope);
  if (activeLoad) {
    await activeLoad;
    return [];
  }
  const offset = scopedTranslationCacheOffsets.get(scope) ?? 0;
  const promise = withTranslationDeadline(window.chatTranslator
    .loadTranslationCache({
      profileId: profile.id,
      platform: profile.platform,
      profileName: profile.name,
      contactId: candidate?.contactId,
      contactIdType: candidate?.contactIdType,
      contactTitle: candidate?.contactTitle,
      contactRemark: candidate?.contactRemark,
      offset,
      limit
    }), 10_000, webRuntimeControllers.get(profile.id)?.signal)
    .then((entries) => {
      applyTranslationCacheEntries(profile.id, entries, candidate);
      if (options.installRuntime !== false) void installCachedTranslationRuntime(profile, entries);
      scopedTranslationCacheOffsets.set(scope, offset + entries.length);
      if (entries.length < limit) scopedTranslationCacheExhausted.add(scope);
      scopedTranslationCachePreloaded.add(scope);
      return entries;
    })
    .catch(() => [])
    .finally(() => {
      if (scopedTranslationCacheLoadPromises.get(scope) === tracked) scopedTranslationCacheLoadPromises.delete(scope);
    });

  const tracked = promise.then(() => undefined);
  scopedTranslationCacheLoadPromises.set(scope, tracked);
  return promise;
}

async function preloadScopedTranslationCaches(
  profile: ChatProfile,
  candidates: MessageCandidate[],
  options: { installRuntime?: boolean } = {}
) {
  const scopedCandidates = new Map<string, MessageCandidate>();
  for (const candidate of candidates) {
    if (!canLoadScopedTranslationCache(candidate)) continue;
    const scope = cacheScope(profile.id, candidate);
    if (!scopedTranslationCachePreloaded.has(scope)) scopedCandidates.set(scope, candidate);
  }
  await Promise.all(Array.from(scopedCandidates.values()).map((candidate) => preloadScopedTranslationCache(profile, candidate, options)));
}

async function loadMoreTranslationCache(profileId: string) {
  if (translationCacheLoadPromises.has(profileId)) {
    await translationCacheLoadPromises.get(profileId);
    return;
  }
  const promise = loadTranslationCachePage(profileId, translationHistoryCachePageSize)
    .catch(() => undefined)
    .finally(() => {
      if (translationCacheLoadPromises.get(profileId) === promise) translationCacheLoadPromises.delete(profileId);
    });
  translationCacheLoadPromises.set(profileId, promise);
  await promise;
}

function clearLegacyRendererTranslationCaches() {
  try {
    for (const key of legacyRendererTranslationCacheKeys) localStorage.removeItem(key);
  } catch {
    // Cache cleanup must never block startup.
  }
}

function getCachedTranslation(profileId: string, sourceText: string, candidate?: Partial<MessageCandidate>) {
  if (candidate && nonEnglishContactKeys.has(nonEnglishContactKey(profileId, candidate))) return '';
  const sourceHash = hashText(sourceText);
  const profileScope = profileSourceCacheScope(profileId);
  const memoryCache = profileTranslationCache(profileId, candidate);
  const profileMemoryCache = translationMemoryCaches.get(profileScope);
  const translatedText =
    memoryCache.get(sourceHash) ||
    profileMemoryCache?.get(sourceHash) ||
    '';
  if (!translatedText) return '';
  if (isUsefulMessageTranslation(sourceText, translatedText)) return translatedText;
  deleteTranslationMemoryCacheEntry(profileId, candidate, sourceHash);
  deleteTranslationMemoryCacheEntry(profileId, { contactKey: '__profile-source__' }, sourceHash);
  return '';
}

async function lookupTranslationCacheForCandidates(profile: ChatProfile, candidates: MessageCandidate[]) {
  if (!window.chatTranslator?.lookupTranslationCache || !candidates.length) return new Map<string, string>();
  const groups = new Map<string, { candidate: MessageCandidate; sourceHashes: Set<string>; sourceTexts: Map<string, string> }>();
  for (const candidate of candidates) {
    const sourceText = normalizeCacheText(candidate.text);
    if (!sourceText) continue;
    const sourceHash = hashText(sourceText);
    const scope = cacheScope(profile.id, candidate);
    const group = groups.get(scope) ?? {
      candidate,
      sourceHashes: new Set<string>(),
      sourceTexts: new Map<string, string>()
    };
    group.sourceHashes.add(sourceHash);
    group.sourceTexts.set(sourceHash, sourceText);
    groups.set(scope, group);
  }

  const cachedTranslations = new Map<string, string>();
  await Promise.all(Array.from(groups.values()).map(async (group) => {
    const hashes = Array.from(group.sourceHashes);
    if (!hashes.length) return;
    const entries = await withTranslationDeadline(window.chatTranslator.lookupTranslationCache({
      profileId: profile.id,
      platform: profile.platform,
      profileName: profile.name,
      contactId: group.candidate.contactId,
      contactIdType: group.candidate.contactIdType,
      contactTitle: group.candidate.contactTitle,
      contactRemark: group.candidate.contactRemark,
      sourceHashes: hashes
    }), 10_000, webRuntimeControllers.get(profile.id)?.signal).catch(() => []);
    applyTranslationCacheEntries(profile.id, entries, group.candidate);
    for (const entry of entries) {
      const sourceText = group.sourceTexts.get(entry.sourceHash) || entry.sourceText || '';
      if (!isUsefulMessageTranslation(sourceText, entry.translatedText)) continue;
      cachedTranslations.set(entry.sourceHash, entry.translatedText);
    }
  }));
  return cachedTranslations;
}

async function installCachedTranslationsForCandidates(profile: ChatProfile, candidates: MessageCandidate[]) {
  const entriesToInstall: TranslationCacheEntry[] = [];
  const seenHashes = new Set<string>();
  for (const candidate of candidates) {
    const sourceHash = hashText(candidate.text);
    if (seenHashes.has(sourceHash)) continue;
    const translatedText = getCachedTranslation(profile.id, candidate.text, candidate);
    if (!translatedText) continue;
    seenHashes.add(sourceHash);
    entriesToInstall.push({
      sourceHash,
      sourceText: normalizeCacheText(candidate.text),
      translatedText,
      updatedAt: Date.now(),
      platform: profile.platform,
      profileId: profile.id,
      profileName: profile.name,
      contactId: candidate.contactId,
      contactIdType: candidate.contactIdType,
      contactTitle: candidate.contactTitle,
      contactRemark: candidate.contactRemark,
      direction: candidate.direction,
      timestamp: candidate.timestamp,
      messagePart: candidate.messagePart
    });
  }
  if (entriesToInstall.length) await installCachedTranslationRuntime(profile, entriesToInstall);
  return entriesToInstall.length;
}

function setCachedTranslation(profile: ChatProfile, candidate: MessageCandidate, translatedText: string) {
  const sourceText = candidate.text;
  if (!isUsefulMessageTranslation(sourceText, translatedText)) return;
  const sourceHash = hashText(sourceText);
  setTranslationMemoryCacheEntry(profile.id, candidate, sourceHash, translatedText);
  setTranslationMemoryCacheEntry(profile.id, { contactKey: '__profile-source__' }, sourceHash, translatedText);
  void window.chatTranslator?.saveTranslationCacheEntry?.({
    profileId: profile.id,
    platform: profile.platform,
    profileName: profile.name,
    contactId: candidate.contactId,
    contactIdType: candidate.contactIdType,
    contactTitle: candidate.contactTitle,
    contactRemark: candidate.contactRemark,
    sourceHash,
    sourceText: normalizeCacheText(sourceText),
    translatedText,
    direction: candidate.direction,
    timestamp: candidate.timestamp,
    messagePart: candidate.messagePart
  });
  void installCachedTranslationRuntime(profile, [{ sourceHash, sourceText: normalizeCacheText(sourceText), translatedText, updatedAt: Date.now() }]);
}

async function installCachedTranslationRuntime(profile: ChatProfile, entries: TranslationCacheEntry[]) {
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  const compactEntries = entries
    .filter((entry) => entry.sourceHash && isUsefulMessageTranslation(entry.sourceText || '', entry.translatedText))
    .map((entry) => ({ sourceHash: entry.sourceHash, sourceText: entry.sourceText, translatedText: entry.translatedText, updatedAt: entry.updatedAt }));
  if (!compactEntries.length) return;
  const batches: typeof compactEntries[] = [];
  let batch: typeof compactEntries = [];
  let batchBytes = 0;
  for (const entry of compactEntries) {
    const entryBytes = new TextEncoder().encode(JSON.stringify(entry)).length;
    if (batch.length && (batch.length >= 250 || batchBytes + entryBytes > 480 * 1024)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(entry);
    batchBytes += entryBytes;
  }
  if (batch.length) batches.push(batch);
  for (const entriesBatch of batches) {
    await executeProfileScript(profile.id, buildCachedTranslationRuntimeScript(appForPlatform(profile.platform), entriesBatch)).catch(() => undefined);
  }
}

function loadedTranslationCacheEntriesForProfile(profileId: string, limit = translationInitialCacheLimit): TranslationCacheEntry[] {
  const scopes = Array.from(translationMemoryCaches.entries())
    .filter(([scope]) => scope.startsWith(`${profileId}:`))
    .sort((a, b) => {
      const left = translationMemoryCacheStats.get(a[0])?.lastAccessed ?? 0;
      const right = translationMemoryCacheStats.get(b[0])?.lastAccessed ?? 0;
      return right - left;
    });
  const entries: TranslationCacheEntry[] = [];
  const now = Date.now();
  for (const [, cache] of scopes) {
    for (const [sourceHash, translatedText] of Array.from(cache.entries()).reverse()) {
      entries.push({ sourceHash, translatedText, updatedAt: now });
      if (entries.length >= limit) return entries;
    }
  }
  return entries;
}

function loadedTranslationCacheEntriesForScope(profileId: string, candidate: Partial<MessageCandidate> | undefined, limit = browserRenderCacheEntryLimit): TranslationCacheEntry[] {
  const cache = translationMemoryCaches.get(cacheScope(profileId, candidate));
  if (!cache) return [];
  const now = Date.now();
  return Array.from(cache.entries())
    .reverse()
    .slice(0, limit)
    .map(([sourceHash, translatedText]) => ({ sourceHash, translatedText, updatedAt: now }));
}

async function warmConversationRenderCache(
  profile: ChatProfile,
  candidate: Partial<MessageCandidate> | undefined,
  options: { targetLimit?: number; loadBatches?: number } = {}
) {
  if (!canLoadScopedTranslationCache(candidate)) return [];
  const targetLimit = options.targetLimit ?? browserRenderCacheEntryLimit;
  const loadBatches = options.loadBatches ?? 0;
  await preloadScopedTranslationCache(profile, candidate, { installRuntime: false });
  let entries = loadedTranslationCacheEntriesForScope(profile.id, candidate, targetLimit);
  for (let i = 0; i < loadBatches && entries.length < targetLimit; i += 1) {
    const loadedEntries = await loadMoreScopedTranslationCache(profile, candidate, historyRenderPrefetchBatchSize, { installRuntime: false });
    if (!loadedEntries.length) break;
    entries = loadedTranslationCacheEntriesForScope(profile.id, candidate, targetLimit);
  }
  if (entries.length) await installCachedTranslationRuntime(profile, entries);
  return entries;
}

async function refreshProfileCachedTranslations(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  await preloadTranslationCache(profileId);
  const loadedEntries = loadedTranslationCacheEntriesForProfile(profileId);
  if (loadedEntries.length) {
    await installCachedTranslationRuntime(profile, loadedEntries);
  }
  await executeProfileScript(
    profileId,
    `(() => {
      if (typeof window.__dfApplyCachedTranslations === 'function') {
        window.__dfApplyCachedTranslations();
        return true;
      }
      return false;
    })()`
  ).catch(() => undefined);
}

async function refreshWebSmartReplyUi(
  profileId: string,
  runtimeOverride?: { execute: <T>(script: string) => Promise<T> }
) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile || profile.platform === 'signal') return;
  const runtime = runtimeOverride || getRuntimeScriptExecutor(profile);
  if (!runtime) return;
  const installState = await runtime
    .execute<SmartReplyUiInstallResult | false>(buildSmartReplyUiInstallScript(appForPlatform(profile.platform)))
    .catch((): false => false);
  if (!installState) return;
  if (installState.state !== 'eligible' || !installState.eligibleMessageKeys.length) return;

  const conversationSignature = normalizeSmartReplyConversationSignature(installState.conversationSignature);
  const activeSignature = normalizeSmartReplyConversationSignature(composerConversationSignatures.get(profileId) || '');
  if (activeSignature && conversationSignature !== activeSignature) return;
  const eligibleStateKeys = new Set(installState.eligibleMessageKeys.map((messageKey) =>
    smartReplyStateKey(profileId, conversationSignature, messageKey)
  ));
  const profileConversationPrefix = `${profileId}::${conversationSignature}::`;
  for (const key of Array.from(smartReplyResults.keys())) {
    if (key.startsWith(profileConversationPrefix) && !eligibleStateKeys.has(key)) smartReplyResults.delete(key);
  }
  for (const key of smartReplyCollapsedKeys) {
    if (key.startsWith(profileConversationPrefix) && !eligibleStateKeys.has(key)) smartReplyCollapsedKeys.delete(key);
  }
  for (const key of Array.from(smartReplyInFlightProfiles.keys())) {
    if (key.startsWith(profileConversationPrefix) && !eligibleStateKeys.has(key)) smartReplyInFlightProfiles.delete(key);
  }
  for (const latestMessageKey of installState.eligibleMessageKeys) {
    const stateKey = smartReplyStateKey(profileId, conversationSignature, latestMessageKey);
    const inFlight = smartReplyInFlightProfiles.get(stateKey);
    if (inFlight) {
      await runtime.execute<boolean>(buildSmartReplyUiStateScript({
        latestMessageKey,
        conversationSignature,
        state: 'loading'
      })).catch(() => false);
      continue;
    }
    const currentResult = smartReplyResults.get(stateKey);
    if (currentResult) {
      await runtime.execute<boolean>(buildSmartReplyUiStateScript({
        latestMessageKey,
        conversationSignature,
        state: smartReplyCollapsedKeys.has(stateKey) ? 'collapse' : 'success',
        replies: currentResult.replies
      })).catch(() => false);
      continue;
    }
    await runtime.execute<boolean>(buildSmartReplyUiStateScript({
      latestMessageKey,
      conversationSignature,
      state: 'idle'
    })).catch(() => false);
  }
}

function scheduleSmartReplyUiRefresh(profileId: string, delayMs = 80) {
  const existingTimer = smartReplyUiRefreshTimers.get(profileId);
  if (existingTimer) clearTimeout(existingTimer);
  smartReplyUiRefreshTimers.delete(profileId);
  const timer = window.setTimeout(() => {
    smartReplyUiRefreshTimers.delete(profileId);
    void refreshWebSmartReplyUi(profileId);
  }, delayMs);
  smartReplyUiRefreshTimers.set(profileId, timer);
}

function scheduleProfileTranslationRefresh(profileId: string, delayMs = 80) {
  const existingTimer = profileTranslationRefreshTimers.get(profileId);
  if (existingTimer) clearTimeout(existingTimer);
  profileTranslationRefreshTimers.delete(profileId);
  const profile = profiles.value.find((item) => item.id === profileId);
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  clearTranslatedMessageMarks(profileId);
  const timer = window.setTimeout(() => {
    profileTranslationRefreshTimers.delete(profileId);
    void refreshProfileCachedTranslations(profileId);
    window.setTimeout(() => void scanAndTranslateMessages(profileId), 160);
  }, delayMs);
  profileTranslationRefreshTimers.set(profileId, timer);
}

function unreadPollIntervalForProfile(_profile: ChatProfile) {
  return 3000;
}

function unreadInitialDelayForProfile(profile: ChatProfile) {
  const app = appForPlatform(profile.platform);
  const platformOffset = app === 'whatsapp' ? 0 : app === 'telegram' ? 800 : 1600;
  const samePlatformProfiles = profiles.value.filter((item) => appForPlatform(item.platform) === app);
  const profileIndex = Math.max(0, samePlatformProfiles.findIndex((item) => item.id === profile.id));
  const profileOffset = samePlatformProfiles.length <= 1
    ? 200
    : 200 + Math.round((profileIndex / (samePlatformProfiles.length - 1)) * 400);
  return platformOffset + profileOffset;
}

function stopUnreadBridge(profileId: string) {
  const timers = unreadPollIntervals.get(profileId);
  if (timers) {
    clearTimeout(timers.initialTimer);
    if (timers.intervalTimer) clearInterval(timers.intervalTimer);
  }
  unreadPollIntervals.delete(profileId);
}

function startUnreadBridge(profileId: string) {
  if (unreadPollIntervals.has(profileId)) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;

  const poll = () => {
    void refreshUnreadCount(profileId);
  };
  const timers: {
    initialTimer: ReturnType<typeof setTimeout>;
    intervalTimer?: ReturnType<typeof setInterval>;
  } = {
    initialTimer: setTimeout(() => {
      poll();
      timers.intervalTimer = setInterval(poll, unreadPollIntervalForProfile(profile));
    }, unreadInitialDelayForProfile(profile))
  };
  unreadPollIntervals.set(profileId, timers);
}

async function refreshUnreadCount(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) {
    clearUnreadState(profileId);
    return;
  }
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return;

  try {
    const snapshot = await runtime.execute<UnreadSnapshot>(buildUnreadScanScript(appForPlatform(profile.platform)));
    setUnreadCount(profileId, snapshot?.count ?? 0);
  } catch {
    // A page can be navigating or a Signal window can be temporarily unavailable; the next poll will retry.
  }
}

function handleWebviewDomReady(event: Event, profile: ChatProfile) {
  const webview = event.currentTarget as Electron.WebviewTag | null;
  if (!webview) return;
  resetWebTranslationRuntime(profile.id);
  webRuntimeReloadAttempts.delete(profile.id);
  void webview.executeJavaScript(`window.__dfTranslationRuntimeGeneration = ${webRuntimeGenerations.get(profile.id)};`, true).catch(() => undefined);

  void webview.executeJavaScript(buildLegacyTranslationCacheCleanupScript(appForPlatform(profile.platform)), true);
  void webview.executeJavaScript(buildFingerprintScript(profile), true);
  void applyEyeCareTranslationToProfile(profile.id).catch(() => undefined);
  startUnreadBridge(profile.id);
  void preloadTranslationCache(profile.id).then(() => {
    if (activeProfileId.value === profile.id && signedIn.value && activePanel.value === 'session') {
      scheduleProfileTranslationRefresh(profile.id, 0);
    }
  });
  if (appForPlatform(profile.platform) !== 'signal') {
    startComposerInstallLoop(profile.id);
    startWebComposerProbe(profile.id);
    [80, 600, 1800, 3200].forEach((delay) => {
      window.setTimeout(() => {
        if (activeProfileId.value === profile.id && signedIn.value && activePanel.value === 'session') {
          scheduleSmartReplyUiRefresh(profile.id, 0);
        }
      }, delay);
    });
  }
  startTranslationBridge(profile.id);
}

const webRuntimeReloadAttempts = new Map<string, number>();

function handleWebviewRuntimeFailure(event: Event, profile: ChatProfile) {
  if ((event as Event & { errorCode?: number }).errorCode === -3) return;
  const webview = event.currentTarget as Electron.WebviewTag | null;
  resetWebTranslationRuntime(profile.id);
  const attempts = webRuntimeReloadAttempts.get(profile.id) ?? 0;
  if (!webview || attempts >= 3) {
    setComposerStatus(profile.id, '页面暂时不可用，请恢复网络后重新打开');
    return;
  }
  webRuntimeReloadAttempts.set(profile.id, attempts + 1);
  const generation = webRuntimeGenerations.get(profile.id);
  window.setTimeout(() => {
    if (webview.isConnected && webRuntimeGenerations.get(profile.id) === generation) webview.reload();
  }, 3_000 * (attempts + 1));
}

function resetWebTranslationRuntime(profileId: string) {
  webRuntimeControllers.get(profileId)?.abort();
  webRuntimeControllers.set(profileId, new AbortController());
  webRuntimeGenerations.set(profileId, (webRuntimeGenerations.get(profileId) ?? 0) + 1);
  cancelQueuedTranslationsForProfile(profileId);
  for (const key of Array.from(translatingMessages)) {
    if (key.startsWith(`${profileId}:`)) translatingMessages.delete(key);
  }
  for (const key of Array.from(messageTranslationAttempts.keys())) {
    if (key.startsWith(`${profileId}:`)) messageTranslationAttempts.delete(key);
  }
  clearTranslatedMessageMarks(profileId);
  translationScansInFlight.delete(profileId);
  for (const key of Array.from(failedMessageTranslationUntil.keys())) {
    if (key.startsWith(`${profileId}:`)) failedMessageTranslationUntil.delete(key);
  }
  const pollTimer = composerEventPollIntervals.get(profileId);
  if (pollTimer) clearTimeout(pollTimer);
  composerEventPollIntervals.delete(profileId);
  scheduleComposerEventPoll(profileId);
}

function startComposerInstallLoop(profileId: string) {
  if (composerInstallIntervals.has(profileId)) return;
  const install = async () => {
    const profile = profiles.value.find((item) => item.id === profileId);
    if (!profile) return;
    const runtime = getRuntimeScriptExecutor(profile);
    if (!runtime) return;
    try {
      await runtime.execute(buildInjectedComposerScript('install'));
      await installAssistantMaterialRuntime(profile);
      if (profile.platform === 'signal') await runtime.execute(buildEnterTranslateScript());
      if (!composerStatus.value[profileId]) setComposerStatus(profileId, '中文输入保护检测中');
      if (appForPlatform(profile.platform) !== 'signal') {
        startWebComposerProbe(profileId);
        if (activeProfileId.value === profileId && signedIn.value && activePanel.value === 'session') {
          scheduleSmartReplyUiRefresh(profileId, 40);
        }
      }
      if (profile.platform === 'signal' && !signalComposerInstallLogged.has(profileId)) {
        signalComposerInstallLogged.add(profileId);
        setSignalDiagnosticStatus(profileId, 'Signal 输入监听已安装');
      }
    } catch {
      // The page may be navigating; the next loop will retry.
    }
  };
  void install();
  const installIntervalMs = profiles.value.find((item) => item.id === profileId)?.platform === 'signal' ? 5000 : 1500;
  composerInstallIntervals.set(profileId, setInterval(() => void install(), installIntervalMs));
  scheduleComposerEventPoll(profileId);
}

function startSignalTranslationRuntime(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) return;
  if (signalTranslationRuntimeStarted.has(profileId)) return;
  signalTranslationRuntimeStarted.add(profileId);
  void applyEyeCareTranslationToProfile(profileId).catch(() => undefined);
  const legacyBubbleDisabled = isSignalLegacyBubbleTranslationDisabled(profile);
  void executeProfileScript(profileId, buildLegacyTranslationCacheCleanupScript('signal')).catch(() => undefined);
  if (legacyBubbleDisabled) {
    void executeProfileScript(profileId, buildSignalLegacyBubbleRuntimeRetirementScript()).catch(() => undefined);
  }
  if (!legacyBubbleDisabled) {
    void preloadTranslationCache(profileId).then(() => {
      if (activeProfileId.value === profileId && signedIn.value && activePanel.value === 'session') {
        scheduleProfileTranslationRefresh(profileId, 0);
      }
    });
  }
  setSignalDiagnosticStatus(
    profileId,
    legacyBubbleDisabled ? 'Signal 源码气泡翻译已启用' : 'Signal 翻译探针启动中'
  );
  startComposerInstallLoop(profileId);
  if (!legacyBubbleDisabled) startTranslationBridge(profileId);
  [800, 2000, 4000, 7000].forEach((delay, index) => {
    window.setTimeout(() => {
      const currentProfile = profiles.value.find((item) => item.id === profileId && item.platform === 'signal');
      if (!currentProfile) return;
      void probeSignalRuntime(profileId, index + 1);
      if (!isSignalLegacyBubbleTranslationDisabled(currentProfile)) {
        void scanAndTranslateMessages(profileId);
      }
    }, delay);
  });
}

async function probeSignalRuntime(profileId: string, round = 0) {
  const profile = profiles.value.find((item) => item.id === profileId && item.platform === 'signal');
  if (!profile) return;
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) {
    setSignalDiagnosticStatus(profileId, `Signal 探针第 ${round || '?'} 轮：脚本通道不可用`);
    return;
  }
  setSignalDiagnosticStatus(profileId, `Signal 探针第 ${round || '?'} 轮执行中`);
  try {
    const result = await runtime.execute<{
      composerCount?: number;
      messageNodeCount?: number;
      textNodeCount?: number;
      activeEditable?: boolean;
      activeTextLength?: number;
      activeHasChinese?: boolean;
      activeTag?: string;
      activeRole?: string;
      activeContentEditable?: string;
      selectionTag?: string;
      selectionRole?: string;
      selectionContentEditable?: string;
      reviewEnabled?: boolean;
      title?: string;
    }>(
      buildSignalDomProbeScript()
    );
    const activeMeta = `${result?.activeTag || '-'} role=${result?.activeRole || '-'} ce=${result?.activeContentEditable || '-'}`;
    const selectionMeta = `${result?.selectionTag || '-'} role=${result?.selectionRole || '-'} ce=${result?.selectionContentEditable || '-'}`;
    void window.chatTranslator?.appendSignalDebugLog?.({
      profileId,
      type: 'dom-probe',
      round,
      composerCount: result?.composerCount ?? 0,
      messageNodeCount: result?.messageNodeCount ?? 0,
      textNodeCount: result?.textNodeCount ?? 0,
      activeEditable: Boolean(result?.activeEditable),
      activeHasChinese: Boolean(result?.activeHasChinese),
      reviewEnabled: result?.reviewEnabled !== false,
      active: activeMeta,
      selection: selectionMeta
    });
    setSignalDiagnosticStatus(profileId, `Signal 探针第 ${round || '?'} 轮正常`);
  } catch (error) {
    if (isTransientSignalScriptGateError(error)) {
      setSignalDiagnosticStatus(profileId, `Signal 探针第 ${round || '?'} 轮：等待运行时就绪`);
      return;
    }
    setSignalDiagnosticStatus(profileId, `Signal 探针第 ${round || '?'} 轮失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function handleWebviewIpcMessage(event: Event, profile: ChatProfile) {
  const ipcEvent = event as Event & {
    channel?: string;
    args?: unknown[];
    detail?: { channel?: string; args?: unknown[] };
  };
  const channel = ipcEvent.channel || ipcEvent.detail?.channel || '';
  const args = ipcEvent.args || ipcEvent.detail?.args || [];
  if (channel !== 'df-translator') return;
  const payload = args[0] as {
    action?: string;
    text?: string;
    conversationSignature?: string;
    requestId?: string;
    composerKind?: ComposerKind;
    reviewEnabled?: boolean;
  } | undefined;
  if (!payload?.action) return;
  if (payload.action === 'web-enter-guard-ready') {
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(payload.text || '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed;
    } catch {
      details = {};
    }
    const version = String(details.version || '').slice(0, 80);
    const platform = String(details.platform || '').slice(0, 20);
    const expectedPlatform = appForPlatform(profile.platform);
    if (
      version !== '2026-07-24-webview-preload-chinese-send-v1' ||
      (platform !== 'whatsapp' && platform !== 'telegram') ||
      platform !== expectedPlatform
    ) return;
    webviewPreloadGuardStatus.set(profile.id, {
      version,
      platform,
      lastSeenAt: Date.now()
    });
    return;
  }
  if (payload.action === 'web-enter-guard-debug') {
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(payload.text || '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed;
    } catch {
      details = {};
    }
    void window.chatTranslator?.appendSignalDebugLog?.({
      type: 'web-enter-preload-guard',
      profileId: profile.id,
      profileName: profile.name,
      platform: profile.platform,
      version: String(details.version || '').slice(0, 80),
      decision: String(details.decision || '').slice(0, 80),
      hasChinese: details.hasChinese === true,
      composing: details.composing === true,
      mediaCaption: details.mediaCaption === true
    });
    return;
  }
  void handleInjectedComposerEvent(
    profile.id,
    payload.action,
    payload.text || '',
    payload.conversationSignature || '',
    payload.requestId || '',
    payload.composerKind === 'telegram-media-caption' ? 'telegram-media-caption' : 'default',
    payload.reviewEnabled !== false
  );
}

function startTranslationBridge(profileId: string) {
  if (translationIntervals.has(profileId)) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  const intervalMs = profile?.platform === 'signal' ? 7000 : 3500;
  const interval = setInterval(() => {
    void scanAndTranslateMessages(profileId);
  }, intervalMs);
  translationIntervals.set(profileId, interval);
}

const translationScansInFlight = new Map<string, Promise<void>>();

function scanAndTranslateMessages(profileId: string): Promise<void> {
  if(conversationExportBusy.value&&conversationExportProfileId.value===profileId)return Promise.resolve();
  const existing = translationScansInFlight.get(profileId);
  if (existing) return existing;
  const controller = new AbortController();
  const runtimeSignal = webRuntimeControllers.get(profileId)?.signal;
  const abortScan = () => controller.abort();
  runtimeSignal?.addEventListener('abort', abortScan, { once: true });
  if (runtimeSignal?.aborted) controller.abort();
  const scan = withTranslationDeadline(scanAndTranslateMessagesOnce(profileId, controller.signal), 30_000,
    runtimeSignal, abortScan).catch(() => undefined).finally(() => {
    runtimeSignal?.removeEventListener('abort', abortScan);
    if (translationScansInFlight.get(profileId) === scan) {
      translationScansInFlight.delete(profileId);
    }
  });
  translationScansInFlight.set(profileId, scan);
  return scan;
}

async function scanAndTranslateMessagesOnce(profileId: string, signal?: AbortSignal) {
  if (signal?.aborted) return;
  if (!window.chatTranslator) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  diagnosticEvent('scan:start', { profileId, platform: profile.platform });

  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return;

  let candidates: MessageCandidate[] = [];
  try {
    candidates = (await runtime.execute<MessageCandidate[]>(buildMessageScanScript(appForPlatform(profile.platform), {
      limit: 100,
      viewportScreensAbove: 2,
      viewportScreensBelow: 1
    }))) ?? [];
  } catch (error) {
    if (isTransientSignalScriptGateError(error)) return;
    diagnosticEvent('scan:failed', { profileId, platform: profile.platform });
    setComposerStatus(profileId, `消息扫描失败：${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (signal?.aborted) return;
  if ((composerStatus.value[profileId] || '').startsWith('消息扫描失败：')) {
    setComposerStatus(profileId, '');
  }
  if (appForPlatform(profile.platform) !== 'signal') await refreshWebSmartReplyUi(profileId, runtime);
  await registerNonEnglishContactMarkers(profile, candidates);
  candidates = candidates.filter((candidate) => !candidate.nonEnglishContactMarker);
  if (candidates.length) {
    setComposerStatus(profileId, `${appForPlatform(profile.platform) === 'signal' ? 'Signal ' : ''}发现 ${candidates.length} 条英文消息，正在查缓存`);
  }

  const profileCacheWarmupReady = await preloadTranslationCache(profileId);
  diagnosticEvent('cache:profile', { profileId, platform: profile.platform, cacheReady: profileCacheWarmupReady });
  await preloadScopedTranslationCaches(profile, candidates);
  await lookupTranslationCacheForCandidates(profile, candidates);
  await installCachedTranslationsForCandidates(profile, candidates);
  if (signal?.aborted) return;
  await processManualMessageTranslations(profileId, runtime);
  let realtimeCandidates = candidates;
  try {
    realtimeCandidates = (await runtime.execute<MessageCandidate[]>(buildMessageScanScript(appForPlatform(profile.platform)))) ?? [];
  } catch {
    realtimeCandidates = candidates.slice(0, 12);
  }
  await registerNonEnglishContactMarkers(profile, realtimeCandidates);
  realtimeCandidates = realtimeCandidates.filter((candidate) => !candidate.nonEnglishContactMarker);
  if (signal?.aborted) return;
  let loadedHistoryPageForScan = false;
  let queuedCount = 0;
  let cacheWarmupBlockedCount = 0;
  for (const candidate of realtimeCandidates.slice(0, 12)) {
    const cacheKey = `${profileId}:${candidate.key}`;
    const sourceCacheKey = `${profileId}:${hashText(candidate.text)}`;
    if (translatingMessages.has(cacheKey) || translatingMessages.has(sourceCacheKey)) continue;
    let cachedTranslation = getCachedTranslation(profileId, candidate.text, candidate);
    const candidateCacheWarmupReady =
      profileCacheWarmupReady &&
      isTranslationCacheWarmupReady(profileId) &&
      isScopedTranslationCacheWarmupReady(profileId, candidate);
    if (cachedTranslation) {
      // Cache hits are safe even while warm-up is retrying.
    } else if (!candidateCacheWarmupReady) {
      cacheWarmupBlockedCount += 1;
      continue;
    } else if (!loadedHistoryPageForScan && !translationCacheExhausted.has(profileId)) {
      loadedHistoryPageForScan = true;
      await loadMoreTranslationCache(profileId);
      cachedTranslation = getCachedTranslation(profileId, candidate.text, candidate);
    }
    if (cachedTranslation) {
      const injected = await runtime.execute<boolean>(
        buildMessageTranslationInjectScript(candidate.key, cachedTranslation, appForPlatform(profile.platform), candidate.text)
      );
      if (injected) {
        if (profile.platform === 'signal') setComposerStatus(profileId, 'Signal 已注入缓存译文');
        translatedMessages.add(cacheKey);
        translatedMessages.add(sourceCacheKey);
      }
      continue;
    }
    if (translatedMessages.has(cacheKey) || translatedMessages.has(sourceCacheKey)) continue;
    if (!isLatestVisibleMessageCandidate(appForPlatform(profile.platform), candidate)) continue;
    if (enqueueMessageTranslationTask(profile, candidate, 'visible-message')) queuedCount += 1;
  }
  const historyBackfillQueuedCount = enqueueHistoryBackfillTranslations(profile, candidates, profileCacheWarmupReady);
  diagnosticEvent('scan:complete', { profileId, platform: profile.platform, candidates: candidates.length, queued: queuedCount + historyBackfillQueuedCount, cacheBlocked: cacheWarmupBlockedCount, cacheReady: profileCacheWarmupReady, running: runningTranslationCount });
  if (queuedCount) {
    setComposerStatus(profileId, `${appForPlatform(profile.platform) === 'signal' ? 'Signal ' : ''}已排队 ${queuedCount} 条待翻译消息`);
  } else if (historyBackfillQueuedCount) {
    setComposerStatus(profileId, `${appForPlatform(profile.platform) === 'signal' ? 'Signal ' : ''}历史补翻已排队 ${historyBackfillQueuedCount} 条`);
  } else if (cacheWarmupBlockedCount) {
    setComposerStatus(profileId, `${appForPlatform(profile.platform) === 'signal' ? 'Signal ' : ''}缓存预加载中，暂不调用翻译接口`);
  }
}

function scheduleHistoryRenderPrefetch(profileId: string, delayMs = 120) {
  const existingTimer = historyRenderPrefetchTimers.get(profileId);
  if (existingTimer) clearTimeout(existingTimer);
  historyRenderPrefetchTimers.delete(profileId);
  const profile = profiles.value.find((item) => item.id === profileId);
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  const timer = window.setTimeout(() => {
    historyRenderPrefetchTimers.delete(profileId);
    void preRenderHistoryCachedTranslations(profileId);
  }, delayMs);
  historyRenderPrefetchTimers.set(profileId, timer);
}

async function preRenderHistoryCachedTranslations(profileId: string) {
  if (!window.chatTranslator || historyRenderPrefetchInFlight.has(profileId)) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;
  if (isSignalLegacyBubbleTranslationDisabled(profile)) return;
  const runtime = getRuntimeScriptExecutor(profile);
  if (!runtime) return;

  historyRenderPrefetchInFlight.add(profileId);
  try {
    const candidates = (await runtime.execute<MessageCandidate[]>(
      buildMessageScanScript(appForPlatform(profile.platform), {
        limit: 100,
        viewportScreensAbove: 3,
        viewportScreensBelow: 2
      })
    )) ?? [];
    if (!candidates.length) return;

    await preloadTranslationCache(profileId);
    const conversationCandidate = candidates.find((candidate) => canLoadScopedTranslationCache(candidate));
    const warmedEntries = await warmConversationRenderCache(profile, conversationCandidate, {
      targetLimit: browserRenderCacheEntryLimit,
      loadBatches: 5
    });
    const warmedHashes = new Set(warmedEntries.map((entry) => entry.sourceHash));
    if (!warmedEntries.length) await preloadScopedTranslationCaches(profile, candidates, { installRuntime: false });

    const entriesToInstall: TranslationCacheEntry[] = [];
    const seenHashes = new Set<string>();
    let loadedMoreScopedCache = false;
    for (const candidate of candidates.slice(0, historyRenderPrefetchBatchSize)) {
      const sourceHash = hashText(candidate.text);
      if (seenHashes.has(sourceHash) || warmedHashes.has(sourceHash)) continue;
      let cachedTranslation = getCachedTranslation(profileId, candidate.text, candidate);
      if (!cachedTranslation && !loadedMoreScopedCache && canLoadScopedTranslationCache(candidate)) {
        loadedMoreScopedCache = true;
        await loadMoreScopedTranslationCache(profile, candidate, historyRenderPrefetchBatchSize, { installRuntime: false });
        cachedTranslation = getCachedTranslation(profileId, candidate.text, candidate);
      }
      if (!cachedTranslation) continue;
      seenHashes.add(sourceHash);
      entriesToInstall.push({
        sourceHash,
        sourceText: normalizeCacheText(candidate.text),
        translatedText: cachedTranslation,
        updatedAt: Date.now(),
        platform: profile.platform,
        profileId: profile.id,
        profileName: profile.name,
        contactId: candidate.contactId,
        contactIdType: candidate.contactIdType,
        contactTitle: candidate.contactTitle,
        contactRemark: candidate.contactRemark,
        direction: candidate.direction,
        timestamp: candidate.timestamp,
        messagePart: candidate.messagePart
      });
      translatedMessages.add(`${profileId}:${candidate.key}`);
      translatedMessages.add(`${profileId}:${sourceHash}`);
    }

    if (entriesToInstall.length) {
      // Commit the prepared history translations in one page-side batch so the UI does not reveal them item by item.
      await installCachedTranslationRuntime(profile, entriesToInstall);
    }
  } finally {
    historyRenderPrefetchInFlight.delete(profileId);
  }
}

function getRuntimeScriptExecutor(profile: ChatProfile) {
  if (profile.platform === 'signal') {
    if (!window.chatTranslator?.executeSignalScript) return null;
    return {
      execute: <T,>(script: string) => window.chatTranslator.executeSignalScript<T>(profile.id, script)
    };
  }
  const webview = document.querySelector<Electron.WebviewTag>(`webview[data-profile-id="${profile.id}"]`);
  if (!webview) return null;
  const generation = webRuntimeGenerations.get(profile.id) ?? 0;
  let controller = webRuntimeControllers.get(profile.id);
  if (!controller) {
    controller = new AbortController();
    webRuntimeControllers.set(profile.id, controller);
  }
  const signal = controller.signal;
  return {
    execute: <T,>(script: string) => {
      if (signal.aborted || (webRuntimeGenerations.get(profile.id) ?? 0) !== generation) {
        return Promise.reject<T>(new Error('Web translation runtime replaced'));
      }
      const guardedScript = `window.__dfTranslationRuntimeGeneration ??= ${generation};\nif (window.__dfTranslationRuntimeGeneration !== ${generation}) throw new Error('Web translation runtime replaced');\n${script}`;
      return withTranslationDeadline(webview.executeJavaScript(guardedScript, true) as Promise<T>, 8_000, signal);
    }
  };
}

function getRuntimeScriptExecutorById(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId);
  return profile ? getRuntimeScriptExecutor(profile) : null;
}

const conversationExportBusy=ref(false),conversationExportStatus=ref(''),conversationExportProfileId=ref('');
let conversationExportCancelled=false;
async function exportCurrentConversation(mode:ConversationExportMode){
  if(conversationExportBusy.value)return;
  const profile=profiles.value.find(p=>p.id===activeProfileId.value);if(!profile){conversationExportStatus.value='请先打开一个联系人会话';return;}
  if(!window.chatTranslator.exportConversation){conversationExportStatus.value='请重新启动开发版，加载导出功能';return;}
  conversationExportBusy.value=true;conversationExportCancelled=false;conversationExportProfileId.value=profile.id;
  conversationExportStatus.value='正在读取当前会话…';
  let contactId='';
  const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  const platform=appForPlatform(profile.platform);
  let exportStage='begin';
  try{
    const start=unwrapConversationExportResult<ExportSnapshot>(await executeProfileScript(profile.id,buildConversationExportScript({action:'begin',platform})));
    if(!start)throw new Error('聊天窗口尚未就绪');contactId=start.contactId;
    await pause(700);
    let rows:ConversationExportRow[]=[],quietAt=0,oldFirst='',coverage:'history-top'|'partial'='partial';
    let note='历史未加载完成';const started=Date.now();
    while(Date.now()-started<15*60*1000){
      if(conversationExportCancelled||activeProfileId.value!==profile.id||lockScreenVisible.value||activePanel.value!=='session')throw new Error('导出已取消');
      exportStage='snapshot';
      const snapshot=unwrapConversationExportResult<ExportSnapshot>(await executeProfileScript(profile.id,buildConversationExportScript({action:'snapshot',platform,expectedId:contactId})));
      if(!snapshot)throw new Error('无法读取会话');
      const previous=rows.length;rows=mergeConversationExportRows(rows,snapshot.rows);
      if(rows.length>20000){rows=rows.slice(0,20000);note='记录超过20000条，导出为部分历史';break;}
      conversationExportStatus.value=`已读取 ${rows.length} 条，正在加载更早记录…`;
      if(snapshot.top&&!snapshot.loading&&!snapshot.expandPending){
        const first=snapshot.rows[0]?.id||'';
        if(previous!==rows.length||first!==oldFirst||!quietAt)quietAt=Date.now();oldFirst=first;
        if(snapshot.earliestMarked||Date.now()-quietAt>12000){coverage='history-top';note=snapshot.earliestMarked?'已读取至平台提供的历史起点':'已自动加载至历史顶部；平台未提供完整性标记，范围为当前可加载历史';break;}
      }else quietAt=0;
      if(!snapshot.expandPending){exportStage='older';unwrapConversationExportResult(await executeProfileScript(profile.id,buildConversationExportScript({action:'older',platform,expectedId:contactId})));}
      await pause(snapshot.loading?700:450);
    }
    if(!rows.length)throw new Error('当前会话没有可导出的记录');
    if(conversationExportCancelled)throw new Error('导出已取消');
    exportStage='confirm-contact';
    const current=unwrapConversationExportResult<ExportSnapshot>(await executeProfileScript(profile.id,buildConversationExportScript({action:'snapshot',platform,expectedId:contactId})));
    if(!current)throw new Error('无法确认当前联系人');
    conversationExportStatus.value=coverage==='partial'?`历史未完全加载，正在保存 ${rows.length} 条…`:`已读取 ${rows.length} 条，请选择保存位置…`;
    exportStage='save';
    const result=await window.chatTranslator.exportConversation({profileId:profile.id,platform:profile.platform,contactId,contactTitle:current.contactTitle,mode,coverage,coverageNote:note,rows});
    conversationExportStatus.value=result.saved?`已导出 ${result.count} 条${result.missing?`，${result.missing} 条暂无译文`:''}${result.redacted?`，${result.redacted} 条收款信息已排除`:''}${coverage==='partial'?'（部分历史）':''}`:'已取消保存';
  }catch(e){
    conversationExportStatus.value=e instanceof Error?e.message:String(e);
    diagnosticEvent('conversation-export:failed',{platform:profile.platform,method:exportStage,errorCode:(e as {exportCode?:string}|null)?.exportCode||'bridge-error'});
  }
  finally{
    if(contactId)await executeProfileScript(profile.id,buildConversationExportScript({action:'restore',platform,expectedId:contactId})).catch(()=>undefined);
    conversationExportBusy.value=false;conversationExportProfileId.value='';
  }
}
function cancelConversationExport(){conversationExportCancelled=true;conversationExportStatus.value='正在取消导出…';}
watch([activeProfileId,lockScreenVisible,activePanel],()=>{if(conversationExportBusy.value)cancelConversationExport();});

const assistantContacts=ref<Record<string,{id:string;title:string}>>({});
const assistantUsages=ref<Record<string,AssistantUsage[]>>({});
const assistantUsedIds=computed(()=>{
  const profile=activeProfileId.value;if(!profile)return [];const contact=assistantContacts.value[profile]?.id;
  return (assistantUsages.value[profile]||[]).filter(u=>u.contactId===contact).map(u=>u.materialId);
});
let assistantCatalogPromise:Promise<AssistantCatalog>|null=null;
let assistantCatalogAt=0;
let assistantIconPromise:Promise<string>|null=null;
const assistantStageTokens=new Map<string,string>();
const assistantMaterialPolls=new Set<string>();
let pendingAssistantRead:Promise<AssistantStagedMaterial|null>|null=null;
function readAssistantCatalog(){
  if(!assistantCatalogPromise||Date.now()-assistantCatalogAt>5000){assistantCatalogAt=Date.now();assistantCatalogPromise=window.chatTranslator.getAssistantLibrary().then(buildAssistantCatalog).catch(e=>{assistantCatalogPromise=null;throw e;});}
  return assistantCatalogPromise;
}
function assistantIconData(){
  if(!assistantIconPromise)assistantIconPromise=new Promise<string>((resolve,reject)=>{
    const image=new Image();image.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=107;canvas.getContext('2d')!.drawImage(image,0,0,80,107);resolve(canvas.toDataURL());}catch(e){reject(e);}};image.onerror=()=>reject(new Error('悬浮图标加载失败'));image.src=assistantFloatIcon;
  });
  return assistantIconPromise;
}
async function transferAssistantImage(profileId:string,id:string,data:string){
  const size=512*1024;
  for(let start=0;start<data.length;start+=size)await executeProfileScript(profileId,buildAssistantRuntimeScript({command:'image-chunk',id,chunk:data.slice(start,start+size),start:start===0,end:start+size>=data.length}));
}
async function syncAssistantPending(profileId:string,pending:AssistantStagedMaterial|null){
  const token=pending?.token||'';if(assistantStageTokens.get(profileId)===token)return;
  if(pending?.type==='image'&&pending.mediaId)await transferAssistantImage(profileId,pending.mediaId,pending.imageData||await window.chatTranslator.getAssistantImage(pending.mediaId));
  await executeProfileScript(profileId,buildAssistantRuntimeScript({command:'stage',pending:pending?{...pending,imageData:undefined}:null}));
  assistantStageTokens.set(profileId,token);
}
async function installAssistantMaterialRuntime(profile:ChatProfile){
  const enabled=signedIn.value&&!lockScreenVisible.value&&!hasBlockingModal.value&&activePanel.value==='session'&&activeProfileId.value===profile.id;
  const catalog=await readAssistantCatalog();
  const usages=await window.chatTranslator.getAssistantUsage(profile.id);assistantUsages.value[profile.id]=usages;
  const themeNode=document.querySelector('.workspace-page')||document.querySelector('.app-page')||document.documentElement;
  const css=getComputedStyle(themeNode),colors:Record<string,string>={};
  for(const key of ['--text','--muted','--muted-strong','--accent','--accent-bright','--bg','--bg-soft','--panel-strong','--panel-muted','--line','--line-strong'])colors[key]=css.getPropertyValue(key).trim();
  const installed=await executeProfileScript<{fresh:boolean}>(profile.id,buildAssistantRuntimeScript({command:'install',config:{platform:appForPlatform(profile.platform),catalog,colors,icon:await assistantIconData(),usages,enabled,showButton:false}}));
  if(!enabled||installed?.fresh)assistantStageTokens.delete(profile.id);
}
async function copyAssistantMaterial(material:AssistantMaterial){
  const profile=profiles.value.find(p=>p.id===activeProfileId.value);if(!profile)return;
  const catalog=await readAssistantCatalog();const known=Object.values(catalog).flat().flatMap(c=>c.materials).find(m=>m.id===material.id);
  if(!known)throw new Error('素材已变更，请重新展开卡片');
  const pending=await window.chatTranslator.stageAssistantMaterial(known);
  await syncAssistantPending(profile.id,pending);
}
async function pollAssistantMaterialEvents(profileId:string){
  if(assistantMaterialPolls.has(profileId))return;
  const profile=profiles.value.find(p=>p.id===profileId);if(!profile)return;
  assistantMaterialPolls.add(profileId);
  try{
    const snapshot=await executeProfileScript<AssistantRuntimeSnapshot>(profileId,buildAssistantRuntimeScript({command:'poll'}));
    if(!snapshot)return;
    assistantContacts.value[profileId]=snapshot.contact;
    for(const event of snapshot.events||[]){
      try{
        if(event.action==='copy'&&event.material&&activeProfileId.value===profileId)await copyAssistantMaterial(event.material);
        else if(event.action==='preview'&&event.mediaId){
          const catalog=await readAssistantCatalog();if(!Object.values(catalog).flat().some(c=>c.materials.some(m=>m.mediaId===event.mediaId)))throw new Error('未知图片素材');
          await transferAssistantImage(profileId,event.mediaId,await window.chatTranslator.getAssistantImage(event.mediaId));
        } else if(event.action==='used'&&event.token&&event.contactId){
          const usage=await window.chatTranslator.recordAssistantUse({profileId,platform:appForPlatform(profile.platform),token:event.token,contactId:event.contactId,contactTitle:event.contactTitle||'当前联系人',...(event.actualText!==undefined?{actualText:event.actualText}:{})});
          assistantUsages.value[profileId]=(assistantUsages.value[profileId]||[]).filter(u=>!(u.contactId===usage.contactId&&u.materialId===usage.materialId)).concat(usage);
          await executeProfileScript(profileId,buildAssistantRuntimeScript({command:'result',token:event.token,usage}));
        }
      }catch(e){await executeProfileScript(profileId,buildAssistantRuntimeScript({command:'result',token:event.token||'',error:e instanceof Error?e.message:String(e)}));}
    }
    if(signedIn.value&&!lockScreenVisible.value&&!hasBlockingModal.value&&activeProfileId.value===profileId){
      pendingAssistantRead ||= window.chatTranslator.getPendingAssistantMaterial().finally(()=>{pendingAssistantRead=null;});
      await syncAssistantPending(profileId,await pendingAssistantRead);
    }
  }finally{assistantMaterialPolls.delete(profileId);}
}
watch([activeTheme,activeProfileId,signedIn,lockScreenVisible,hasBlockingModal,activePanel],()=>{
  for(const profile of profiles.value)void installAssistantMaterialRuntime(profile).catch(()=>undefined);
},{flush:'post'});

async function executeProfileScript<T = unknown>(profileId: string, script: string) {
  const runtime = getRuntimeScriptExecutorById(profileId);
  if (!runtime) return undefined;
  return runtime.execute<T>(script);
}

async function processManualMessageTranslations(profileId: string, runtime: { execute: <T>(script: string) => Promise<T> }) {
  if (!window.chatTranslator) return;
  const profile = profiles.value.find((item) => item.id === profileId);
  if (!profile) return;
  let candidates: MessageCandidate[] = [];
  try {
    candidates = await runtime.execute<MessageCandidate[]>(
      `(() => { const q = window.__dfMessageTranslateQueue || []; window.__dfMessageTranslateQueue = []; return q; })()`
    );
  } catch {
    return;
  }

  let queuedCount = 0;
  for (const candidate of candidates.slice(0, 3)) {
    if (enqueueMessageTranslationTask(profile, candidate, 'manual-refresh')) queuedCount += 1;
  }
  if (queuedCount) setComposerStatus(profileId, `已排队 ${queuedCount} 条刷新翻译`);
}

function buildUnreadScanScript(app: RuntimeApp) {
  const platformApp = JSON.stringify(app);
  return `
(() => {
  const platformApp = ${platformApp};
  const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
  const toCount = (value, fallback = 0) => {
    const text = normalize(String(value || ''));
    if (!text) return fallback;
    const explicit = text.match(/(?:^|\\D)(\\d{1,3})(?:\\D|$)/);
    if (explicit) return Math.max(0, Math.min(999, Number(explicit[1]) || 0));
    if (/unread|未读|未讀|新消息|new message/i.test(text)) return Math.max(1, fallback);
    return fallback;
  };
  const signalTitleCount = (() => {
    const title = normalize(document.title || '');
    const match = title.match(/^Signal\\s*\\((\\d{1,3})\\)\\s*$/i);
    return match ? Math.max(0, Math.min(999, Number(match[1]) || 0)) : 0;
  })();
  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };
  const titleCount = toCount(document.title || '', 0);
  if (platformApp === 'signal') {
    return {
      count: signalTitleCount,
      titleCount: signalTitleCount,
      badgeCount: 0
    };
  }
  if (platformApp === 'telegram') {
    const stateKey = '__dfTelegramUnarchivedUnreadStateV2';
    const state = window[stateKey] || (window[stateKey] = {
      count: 0,
      ready: false
    });
    const archiveLabelPattern = /^(?:archived chats?|archive|已归档(?:的)?聊天|归档聊天|封存的聊天)(?:\\s+\\d{1,3})?$/i;
    const rowSelectors = [
      '.chatlist [role="listitem"]',
      '.chatlist [role="row"]',
      '.chatlist .ListItem',
      '.chatlist [class*="dialog" i]',
      '.chatlist li',
      '[class*="chatlist" i] [role="listitem"]',
      '[class*="chatlist" i] .ListItem'
    ];
    const badgeSelectors = [
      '.badge',
      '[class*="badge" i]',
      '[class*="unread" i]',
      '[aria-label*="unread" i]',
      '[aria-label*="未读"]',
      '[aria-label*="未讀"]'
    ];
    const rows = Array.from(new Set(rowSelectors.flatMap((selector) => (
      Array.from(document.querySelectorAll(selector))
    )))).filter((row) => isVisible(row));
    const rowDescriptor = (row) => normalize([
      row.getAttribute?.('aria-label') || '',
      row.getAttribute?.('title') || '',
      row.textContent || ''
    ].join(' '));
    const isArchiveEntry = (row) => archiveLabelPattern.test(rowDescriptor(row));
    const isInsideArchiveContainer = (row) => Boolean(row.closest?.(
      '[data-folder-id="1"], [data-filter-id="1"], [class*="archived-list" i], [class*="archive-list" i], [class*="archived-chats" i]'
    ));
    const archiveEntryPresent = rows.some(isArchiveEntry);
    const archiveViewActive = !archiveEntryPresent && Array.from(document.querySelectorAll(
      'header, [class*="sidebar-header" i], [class*="chatlist-header" i], [role="heading"]'
    )).some((element) => archiveLabelPattern.test(normalize(element.textContent || '')));
    if (!archiveViewActive) {
      const rowUnreadCounts = new Map();
      for (const row of rows) {
        if (isArchiveEntry(row) || isInsideArchiveContainer(row)) continue;
        let rowCount = 0;
        for (const selector of badgeSelectors) {
          for (const badge of Array.from(row.querySelectorAll(selector))) {
            if (!isVisible(badge)) continue;
            const badgeText = normalize(
              badge.getAttribute?.('aria-label') ||
              badge.getAttribute?.('title') ||
              badge.textContent ||
              ''
            );
            rowCount = Math.max(
              rowCount,
              toCount(badgeText, /unread|未读|未讀/i.test(selector + ' ' + badgeText) ? 1 : 0)
            );
          }
        }
        if (rowCount > 0) rowUnreadCounts.set(row, rowCount);
      }
      state.count = Math.max(
        0,
        Math.min(999, Array.from(rowUnreadCounts.values()).reduce((sum, count) => sum + count, 0))
      );
      state.ready = true;
    }
    return {
      count: state.ready ? state.count : 0,
      titleCount: 0,
      badgeCount: state.ready ? state.count : 0,
      source: archiveViewActive
        ? 'telegram-unarchived-badges-retained'
        : 'telegram-unarchived-badges'
    };
  }
  const selectorGroups = {
    whatsapp: [
      '[aria-label*="unread" i]',
      '[aria-label*="未读"]',
      '[aria-label*="未讀"]',
      '[data-testid*="unread" i]',
      '[class*="unread" i]',
      '[data-icon="unread-count"]'
    ],
    telegram: [
      '.chatlist .badge',
      '.chatlist [class*="badge" i]',
      '.ListItem [class*="badge" i]',
      '[class*="dialog"] [class*="badge" i]',
      '[class*="unread" i]',
      '[aria-label*="unread" i]',
      '[aria-label*="未读"]',
      '[aria-label*="未讀"]'
    ],
    signal: []
  };
  const selectors = selectorGroups[platformApp] || selectorGroups.whatsapp;
  const rows = new Set();
  let badgeCount = 0;
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (!isVisible(el)) continue;
      if (el.closest?.('footer, header, [role="textbox"], [contenteditable="true"], .df-translator-host')) continue;
      const text = normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '');
      const count = toCount(text, /unread|未读|未讀/i.test(selector) ? 1 : 0);
      if (count <= 0) continue;
      const row = el.closest?.(
        '[role="listitem"], [role="row"], [data-testid*="cell"], [data-testid*="chat"], [class*="conversation"], [class*="dialog"], [class*="ListItem"], li'
      ) || el;
      if (rows.has(row)) continue;
      rows.add(row);
      badgeCount += count;
    }
  }
  const count = Math.max(titleCount, badgeCount);
  return {
    count: Math.max(0, Math.min(999, count)),
    titleCount,
    badgeCount
  };
})()
`;
}

function buildMessageScanScript(
  app: RuntimeApp,
  options: { limit?: number; viewportScreensAbove?: number; viewportScreensBelow?: number; includeAlreadyTranslated?: boolean } = {}
) {
  const platformApp = JSON.stringify(app);
  const scanOptions = JSON.stringify(options);
  return `
(() => {
  const platformApp = ${platformApp};
  const scanOptions = ${scanOptions};
  const resultLimit = Math.max(1, Math.min(120, Number(scanOptions.limit || 12)));
  const viewportScreensAbove = Math.max(0, Number(scanOptions.viewportScreensAbove || 0));
  const viewportScreensBelow = Math.max(0, Number(scanOptions.viewportScreensBelow || 0));
  const includeAlreadyTranslated = Boolean(scanOptions.includeAlreadyTranslated);
  const hasChinese = (text) => /[\\u4e00-\\u9fff]/.test(text);
  const hasLatin = (text) => /[A-Za-z]{2,}/.test(text);
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 20 && rect.height > 12 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const isInViewport = (el) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom >= -window.innerHeight * viewportScreensAbove &&
      rect.top <= window.innerHeight + window.innerHeight * viewportScreensBelow &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth
    );
  };
  const findScrollParent = (el) => {
    let node = el?.parentElement || null;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 40) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const isNearConversationEnd = (el) => {
    const scroller = findScrollParent(el);
    if (!scroller) return true;
    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    return remaining <= Math.max(160, scroller.clientHeight * 0.18);
  };
  const isNearConversationStart = (el) => {
    const scroller = findScrollParent(el);
    if (!scroller) return true;
    return scroller.scrollTop <= Math.max(160, scroller.clientHeight * 0.18);
  };
  const viewportMetaFor = (el) => {
    const rect = el.getBoundingClientRect();
    const scanBand = rect.bottom < 0 ? 'above' : (rect.top > window.innerHeight ? 'below' : 'visible');
    return {
      rectTop: Math.round(rect.top),
      rectBottom: Math.round(rect.bottom),
      viewportHeight: Math.round(window.innerHeight),
      scanBand,
      nearConversationEnd: isNearConversationEnd(el),
      nearConversationStart: isNearConversationStart(el)
    };
  };
  const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
  const textWithoutTranslatorUi = (el) => {
    const clone = el.cloneNode(true);
    for (const node of Array.from(clone.querySelectorAll('.df-chat-refresh-translation, .df-chat-refresh-placeholder, .df-chat-translation, .df-smart-reply-host, .df-smart-reply-panel, .module-message__maoyi-translation, .module-message__maoyi-smart-reply'))) {
      node.remove();
    }
    if (platformApp === 'telegram') {
      for (const node of Array.from(clone.querySelectorAll('.time, .time-inner, .tgico, .i18n'))) {
        node.remove();
      }
    }
    return clone.innerText || clone.textContent || '';
  };
  const stripBubbleTime = (text) => {
    let value = normalize(text);
    for (let i = 0; i < 4; i += 1) {
      const next = value
        .replace(/\\s*↻+\\s*$/u, '')
        .replace(/\\s*(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?\\s*(?:✓|✓✓|✔|✔✔|↻)*\\s*$/u, '')
        .trim();
      if (next === value) break;
      value = next;
    }
    return value;
  };
  const collapseRepeatedText = (text) => {
    const value = normalize(text);
    if (value.length < 8 || value.length % 2 !== 0) return value;
    const half = value.length / 2;
    const left = value.slice(0, half).trim();
    const right = value.slice(half).trim();
    return left && left === right ? left : value;
  };
  const cleanMessageText = (text) => {
    let value = normalize(text).replace(/\\s*(?:↻+|\\.\\.\\.)\\s*$/u, '').trim();
    value = stripBubbleTime(value);
    value = value.replace(/\\s*(?:↻+|\\.\\.\\.)\\s*$/u, '').trim();
    return collapseRepeatedText(stripBubbleTime(value));
  };
  const cleanVisibleWhatsappText = (text) => cleanMessageText(
    normalize(text)
      .split('\\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?\\s*(?:✓|✓✓|✔|✔✔)?$/u.test(line))
      .join(' ')
  );
  const isListArea = (el) => Boolean(el.closest([
    '#pane-side',
    '[data-testid="chat-list"]',
    '[data-testid="cell-frame-container"]',
    '[aria-label*="Chat list"]',
    '[aria-label*="chat list"]',
    '.chat-list',
    '.dialogs-list',
    '.DialogList',
    '.ListItem',
    '[class*="ChatList"]',
    '[class*="chatlist"]',
    '[class*="dialog-list"]'
  ].join(',')));
  const reject = (el) => Boolean(el.closest('footer, header, nav, aside, [role="textbox"], [contenteditable="true"], [data-testid="author"], [testid="author"], .df-translator-host, .df-chat-translation')) ||
    (platformApp === 'telegram' && Boolean(el.closest('.reply.quote-like, .time, .time-inner, .tgico, .i18n'))) ||
    isListArea(el);
  const findBubble = (el) => platformApp === 'signal'
    ? (
      el.closest('[data-testid*="message"]') ||
      el.closest('[class*="module-message"]') ||
      el.closest('[class*="Message"]') ||
      el.closest('[role="row"]') ||
      el.closest('li')
    )
    : platformApp === 'telegram'
      ? (
      el.closest('.bubble[data-mid]') ||
      el.closest('.bubble') ||
      el.closest('.bubble-content-wrapper') ||
      el.closest('.bubble-content') ||
      el.closest('.Message')
    )
      : (el.closest('[data-id^="true_"], [data-id^="false_"]') || el.closest('[data-testid="msg-container"], [data-pre-plain-text], .message-in, .message-out'));
  const isLikelyMessageBubble = (bubble, textNode) => {
    if (!bubble || reject(bubble) || isListArea(textNode)) return false;
    if (platformApp === 'whatsapp') {
      return Boolean(
        bubble.matches?.('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out') ||
        bubble.closest?.('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out')
      );
    }
    if (platformApp === 'telegram') {
      return Boolean(
        bubble.matches?.('.bubble[data-mid], .bubble, .bubble-content-wrapper, .bubble-content, .Message') ||
        bubble.closest?.('.bubble[data-mid], .bubble, .bubble-content-wrapper, .bubble-content, .Message')
      );
    }
    return true;
  };
  const expandCollapsedWhatsappBubble = (bubble) => {
    if (platformApp !== 'whatsapp' || !bubble) return false;
    const readMoreButton = bubble.querySelector?.('[data-testid="caption-read-more-button"]');
    if (!readMoreButton || !isVisible(readMoreButton)) return false;
    for (const translation of Array.from(bubble.querySelectorAll?.('.df-chat-translation') || [])) {
      translation.remove();
    }
    if (readMoreButton.dataset.dfTranslatorExpandRequested !== '1') {
      readMoreButton.dataset.dfTranslatorExpandRequested = '1';
      readMoreButton.click();
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({ action: 'whatsapp-long-message-expanded', text: '', at: Date.now() });
    }
    return true;
  };
  const quoteSelector = [
    '[data-testid="quoted-message"]',
    '[data-testid*="quoted"]',
    '[data-testid*="reply"]',
    '[aria-label*="Quoted"]',
    '[aria-label*="Reply"]',
    '.reply.quote-like',
    '.reply-subtitle',
    '.quoted-message',
    '.quoted',
    '.reply',
    '.MessageReply',
    '[class*="quoted"]',
    '[class*="reply"]'
  ].join(',');
  const findQuoteBlock = (el) =>
    el.closest('[data-testid="quoted-message"]') ||
    el.closest('.reply.quote-like') ||
    el.closest(quoteSelector);
  const hashKey = (text) => {
    let hash = 2166136261;
    for (const char of normalize(text)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const normalizePhone = (text) => {
    const match = normalize(text).match(/(?:\\+|00)?\\d[\\d\\s().-]{6,}\\d/);
    if (!match) return '';
    const raw = match[0].trim();
    const plus = raw.startsWith('+');
    const digits = raw.replace(/\\D/g, '');
    if (digits.length < 7) return '';
    return plus ? '+' + digits : digits;
  };
  const stableContactTitle = (value) => {
    const title = normalize(value).replace(/\\s*\\(\\d+\\)\\s*$/u, '').trim();
    if (platformApp === 'signal' && /^Signal$/i.test(title)) return '';
    return title;
  };
  const readContactMeta = () => {
    const titleSelectors = [
      'header [title]',
      'header [dir="auto"]',
      '.chat-info .title',
      '.ChatInfo .title',
      '[class*="ChatInfo"] [dir="auto"]',
      '[class*="top"] [dir="auto"]'
    ];
    const titleParts = [];
    for (const selector of titleSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 6)) {
        const value = stableContactTitle(el.getAttribute('title') || el.textContent || '');
        if (value && !titleParts.includes(value)) titleParts.push(value);
      }
    }
    const fallbackTitle = stableContactTitle(document.title || '');
    const contactTitle = titleParts[0] || fallbackTitle || (platformApp === 'signal' ? 'unknown-signal-contact' : 'unknown-contact');
    const phone = normalizePhone(titleParts.join(' ') + ' ' + document.body.innerText.slice(0, 800));
    const hasStableTitle = Boolean(titleParts[0] || fallbackTitle);
    const contactIdType = phone ? 'phone' : (hasStableTitle ? 'title' : 'unknown');
    const contactId = phone || (hasStableTitle ? hashKey(contactTitle) : (platformApp === 'signal' ? 'signal-unknown-contact' : hashKey(location.href || 'unknown-contact')));
    return {
      contactId,
      contactIdType,
      contactTitle,
      contactRemark: contactTitle,
      contactKey: contactIdType + '-' + contactId
    };
  };
  const readDirection = (bubble) => {
    const explicitHost = bubble.closest?.('[data-id^="true_"], [data-id^="false_"], .message-in, .message-out') || bubble;
    const explicitId = (explicitHost.getAttribute?.('data-id') || '').toString();
    if (explicitId.startsWith('true_') || explicitHost.classList?.contains('message-out')) return 'outgoing';
    if (explicitId.startsWith('false_') || explicitHost.classList?.contains('message-in')) return 'incoming';
    const marker = (bubble.getAttribute('data-id') || bubble.className || '').toString();
    if (marker.includes('message-out') || marker.startsWith('true_') || /\\bown\\b|outgoing|is-out|from-me|sent/.test(marker)) return 'outgoing';
    if (marker.includes('message-in') || marker.startsWith('false_') || /incoming|is-in|from-them|received/.test(marker)) return 'incoming';
    const rect = bubble.getBoundingClientRect();
    if (rect.width > 0) return rect.left + rect.width / 2 > window.innerWidth / 2 ? 'outgoing' : 'incoming';
    return 'unknown';
  };
  const readTimestamp = (bubble) => {
    const text = normalize(bubble.innerText || bubble.textContent || '');
    const match = text.match(/(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?/);
    return match ? match[0] : '';
  };
  const ensureRefreshButton = (bubble, sourceTextNode, key, sourceText, messagePart) => {
    if (platformApp === 'signal') {
      for (const injectedButton of Array.from(bubble.querySelectorAll('.df-chat-refresh-translation'))) {
        injectedButton.remove();
      }
      return;
    }
    const mount = messagePart === 'quote'
      ? (findQuoteBlock(sourceTextNode) || sourceTextNode)
      : platformApp === 'telegram'
        ? (sourceTextNode.closest('.message.spoilers-container, .message') || sourceTextNode.closest('.bubble-content') || sourceTextNode)
        : sourceTextNode;
    const buttons = Array.from(bubble.querySelectorAll('.df-chat-refresh-translation'));
    const buttonPart = (button) => button.dataset.dfRefreshKey?.includes('-quote-') || findQuoteBlock(button) ? 'quote' : 'body';
    // Cache replay may use a df-cache key before the scanner assigns a live key.
    // The existing translation owns its refresh button regardless of that key.
    const translatedButton = buttons.find((button) =>
      button.closest('.df-chat-translation') && buttonPart(button) === messagePart
    );
    const existing = translatedButton || buttons.find((button) => button.dataset.dfRefreshKey === key);
    for (const button of buttons) {
      if (button === existing || buttonPart(button) !== messagePart) continue;
      const oldPlaceholder = button.closest('.df-chat-refresh-placeholder');
      button.remove();
      if (oldPlaceholder && !oldPlaceholder.querySelector('.df-chat-refresh-translation')) oldPlaceholder.remove();
    }
    if (translatedButton) {
      sourceTextNode.dataset.dfMsgTextKey = translatedButton.dataset.dfRefreshKey;
      if (messagePart === 'quote') mount.dataset.dfMsgKey = translatedButton.dataset.dfRefreshKey;
    }
    if (existing) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'df-chat-refresh-translation';
    button.dataset.dfRefreshKey = key;
    button.title = '重新翻译本条气泡';
    button.setAttribute('aria-label', '重新翻译本条气泡');
    button.innerHTML = '&#8635;';
    button.style.cssText = [
      'align-items:center', 'appearance:none', 'background:transparent', 'border:0', 'border-radius:50%',
      'color:inherit', 'cursor:pointer', 'display:inline-flex', 'flex:0 0 auto', 'font-family:inherit',
      'font-size:15px', 'font-weight:400', 'height:24px', 'justify-content:center', 'line-height:1',
      'margin:0 0 0 3px', 'opacity:0.72', 'padding:0', 'pointer-events:auto', 'width:24px'
    ].join(';');
    button.onmouseenter = () => {
      button.style.background = 'color-mix(in srgb, currentColor 12%, transparent)';
      button.style.opacity = '1';
    };
    button.onmouseleave = () => {
      button.style.background = 'transparent';
      button.style.opacity = '0.72';
    };
    if (window.__dfBubbleRefreshPendingKeys?.[key]) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '...';
    }
    const triggerRefresh = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      window.__dfBubbleRefreshPendingKeys = window.__dfBubbleRefreshPendingKeys || Object.create(null);
      window.__dfBubbleRefreshPendingKeys[key] = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '...';
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({
        action: 'bubble-refresh',
        text: JSON.stringify({ key, text: sourceText, direction: readDirection(bubble), messagePart }),
        at: Date.now()
      });
    };
    if (platformApp === 'telegram') button.addEventListener('pointerdown', triggerRefresh, true);
    button.addEventListener('click', triggerRefresh, true);
    const placeholder = document.createElement('div');
    placeholder.className = 'df-chat-refresh-placeholder';
    placeholder.style.cssText = 'display:block;margin-top:5px;padding-top:5px;border-top:1px solid #d8c081;color:#166534;font-size:15px;line-height:1.45;clear:both';
    placeholder.appendChild(button);
    mount.appendChild(placeholder);
  };
  if (platformApp === 'signal') {
    for (const injectedButton of Array.from(document.querySelectorAll('.df-chat-refresh-translation'))) {
      injectedButton.remove();
    }
  }
  const textSelectors = platformApp === 'signal'
    ? [
      '.module-message__text',
      '[data-testid*="message"] [dir="auto"]',
      '[data-testid*="message"] [dir="ltr"]',
      '[class*="module-message"] [dir="auto"]',
      '[class*="module-message"] [dir="ltr"]',
      '[class*="message"] [dir="auto"]',
      '[class*="message"] [dir="ltr"]',
      '[role="row"] [dir="auto"]',
      '[role="row"] [dir="ltr"]',
      '.text-content',
      '.translatable-message'
    ]
    : platformApp === 'telegram'
      ? [
      '.bubble-content > .message.spoilers-container > .translatable-message',
      '.bubble-content > .message > .translatable-message',
      '.bubble-content > .message.spoilers-container',
      '.bubble-content > .message',
      '.text-content',
      '.translatable-message',
      '.Message .text-content',
      '.message .text-content'
    ]
      : [
      '[data-testid="quoted-message"] .quoted-mention.selectable-text',
      '[data-testid="quoted-message"] [data-testid="selectable-text"].quoted-mention',
      '[data-pre-plain-text] .selectable-text.copyable-text',
      '[data-pre-plain-text] .selectable-text',
      '[data-testid="msg-container"] [data-testid="selectable-text"]',
      '[data-testid="msg-container"] .selectable-text.copyable-text',
      '[data-testid="msg-container"] .selectable-text',
      '.message-in .selectable-text.copyable-text',
      '.message-out .selectable-text.copyable-text',
      '.message-in .selectable-text',
      '.message-out .selectable-text'
    ];
  const textNodes = [];
  for (const selector of textSelectors) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (isVisible(el) && isInViewport(el) && !reject(el) && !textNodes.includes(el)) textNodes.push(el);
    }
  }
  const directResults = [];
  const contactMeta = readContactMeta();
  const visibleTextNodes = textNodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const scannedParts = new Set();
  for (const textNode of visibleTextNodes) {
    const bubble = findBubble(textNode);
    if (!isLikelyMessageBubble(bubble, textNode)) continue;
    if (expandCollapsedWhatsappBubble(bubble)) continue;
    const quoteBlock = findQuoteBlock(textNode);
    const messagePart = quoteBlock ? 'quote' : 'body';
    const sourceTextNode = platformApp === 'signal' && !quoteBlock
      ? (textNode.closest('.module-message__text') || bubble.querySelector?.('.module-message__text') || textNode)
      : textNode;
    const text = cleanMessageText(textWithoutTranslatorUi(sourceTextNode));
    if (!text || text.length < 2 || text.length > 4000) continue;
    const direction = readDirection(bubble);
    const viewportMeta = viewportMetaFor(bubble);
    if (messagePart === 'body' && direction === 'incoming' && hasChinese(text) && (viewportMeta.nearConversationStart || viewportMeta.nearConversationEnd)) {
      directResults.push({
        key: 'non-english-contact-' + hashKey(contactMeta.contactKey),
        text,
        ...contactMeta,
        direction,
        timestamp: readTimestamp(bubble),
        messagePart,
        nonEnglishContactMarker: true,
        ...viewportMeta
      });
      continue;
    }
    if (!hasLatin(text) || hasChinese(text)) continue;
    if (!bubble.dataset.dfMsgKey) {
      bubble.dataset.dfMsgKey = 'df-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }
    const targetKey = messagePart === 'quote'
      ? bubble.dataset.dfMsgKey + '-quote-' + hashKey(text)
      : bubble.dataset.dfMsgKey + '-body-' + hashKey(text);
    if (scannedParts.has(targetKey)) continue;
    scannedParts.add(targetKey);
    if (quoteBlock) quoteBlock.dataset.dfMsgKey = targetKey;
    sourceTextNode.dataset.dfMsgTextKey = targetKey;
    ensureRefreshButton(bubble, sourceTextNode, targetKey, text, messagePart);
    const translationMount = platformApp === 'signal'
      ? (
        quoteBlock ||
        sourceTextNode.closest('[data-testid*="message"], [class*="module-message"], [class*="message"], .translatable-message, .text-content') ||
        sourceTextNode
      )
      : platformApp === 'telegram'
      ? (
        quoteBlock
          ? (quoteBlock.querySelector('.reply-content') || quoteBlock)
          : (
            textNode.closest('.message.spoilers-container, .message') ||
            bubble.querySelector?.('.message.spoilers-container, .message') ||
            textNode.closest('.bubble-content') ||
            textNode
          )
      )
      : (
        quoteBlock ||
        textNode.closest('[data-testid="msg-container"] [data-testid="selectable-text"], [data-pre-plain-text] .selectable-text, [data-testid="selectable-text"], .selectable-text.copyable-text, .selectable-text') ||
        textNode
      );
    if (platformApp === 'telegram') {
      const existingTranslations = Array.from(translationMount.querySelectorAll('.df-chat-translation'));
      if (existingTranslations.length && !includeAlreadyTranslated) continue;
    } else if (translationMount.querySelector('.df-chat-translation') && !includeAlreadyTranslated) {
      continue;
    }
    directResults.push({
      key: targetKey,
      text,
      ...contactMeta,
      direction,
      timestamp: readTimestamp(bubble),
      messagePart,
      ...viewportMeta
    });
    if (directResults.length >= resultLimit) break;
  }
  if (platformApp === 'whatsapp' && directResults.length < resultLimit) {
    const containerSelectors = [
      '[data-id^="true_"]',
      '[data-id^="false_"]',
      '[data-testid="msg-container"]',
      '[data-pre-plain-text]',
      '.message-in',
      '.message-out'
    ];
    const containers = [];
    for (const selector of containerSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (isVisible(el) && isInViewport(el) && !reject(el) && !containers.includes(el)) containers.push(el);
      }
    }
    for (const container of containers.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
      if (directResults.length >= resultLimit) break;
      if (expandCollapsedWhatsappBubble(container)) continue;
      const textNode =
        container.querySelector('[data-testid="selectable-text"]') ||
        container.querySelector('.selectable-text.copyable-text') ||
        container.querySelector('.selectable-text') ||
        container.querySelector('[dir="ltr"]') ||
        container.querySelector('[dir="auto"]') ||
        container;
      if (!textNode || reject(textNode) || !isLikelyMessageBubble(container, textNode)) continue;
      // All selector paths must share the same message identity, including the fallback scan.
      const canonicalBubble = findBubble(textNode) || container;
      const text = cleanMessageText(textWithoutTranslatorUi(textNode));
      if (!text || text.length < 2 || text.length > 900) continue;
      const direction = readDirection(container);
      const viewportMeta = viewportMetaFor(container);
      if (direction === 'incoming' && hasChinese(text) && (viewportMeta.nearConversationStart || viewportMeta.nearConversationEnd)) {
        directResults.push({
          key: 'non-english-contact-' + hashKey(contactMeta.contactKey),
          text,
          ...contactMeta,
          direction,
          timestamp: readTimestamp(container),
          messagePart: 'body',
          nonEnglishContactMarker: true,
          ...viewportMeta
        });
        continue;
      }
      if (!hasLatin(text) || hasChinese(text)) continue;
      if (!canonicalBubble.dataset.dfMsgKey) {
        canonicalBubble.dataset.dfMsgKey = 'df-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      }
      const targetKey = canonicalBubble.dataset.dfMsgKey + '-body-' + hashKey(text);
      if (scannedParts.has(targetKey)) continue;
      scannedParts.add(targetKey);
      textNode.dataset.dfMsgTextKey = targetKey;
      ensureRefreshButton(canonicalBubble, textNode, targetKey, text, 'body');
      const translationMount =
        textNode.closest('[data-testid="selectable-text"], .selectable-text.copyable-text, .selectable-text, .translatable-message, .text-content, [class*="text-content"]') ||
        textNode;
      if (translationMount.querySelector('.df-chat-translation')) continue;
      directResults.push({
        key: targetKey,
        text,
        ...contactMeta,
        direction,
        timestamp: readTimestamp(container),
        messagePart: 'body',
        ...viewportMeta
      });
    }
  }
  if (platformApp === 'signal' && directResults.length < resultLimit) {
    const fallbackNodes = Array.from(document.querySelectorAll('[dir="auto"], [dir="ltr"], span, p, div')).filter((el) => {
      if (!isVisible(el) || !isInViewport(el) || reject(el)) return false;
      if (el.closest('button, [role="button"], [role="menu"], [role="dialog"], input, textarea')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 80 || rect.width > Math.min(window.innerWidth * 0.9, 1000)) return false;
      if (rect.height < 16 || rect.height > 260) return false;
      const value = cleanMessageText(textWithoutTranslatorUi(el));
      if (!value || value.length < 3 || value.length > 1200) return false;
      if (!hasLatin(value) || hasChinese(value)) return false;
      return true;
    });
    const compactNodes = [];
    for (const node of fallbackNodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
      if (compactNodes.some((item) => item.contains(node) || node.contains(item))) continue;
      compactNodes.push(node);
    }
    for (const textNode of compactNodes) {
      if (directResults.length >= resultLimit) break;
      const text = cleanMessageText(textWithoutTranslatorUi(textNode));
      const bubble = findBubble(textNode) || textNode.parentElement || textNode;
      if (!bubble || bubble.querySelector('.df-chat-translation')) continue;
      if (!bubble.dataset.dfMsgKey) {
        bubble.dataset.dfMsgKey = 'df-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      }
      const targetKey = bubble.dataset.dfMsgKey + '-signal-' + hashKey(text);
      if (scannedParts.has(targetKey)) continue;
      scannedParts.add(targetKey);
      textNode.dataset.dfMsgTextKey = targetKey;
      ensureRefreshButton(bubble, textNode, targetKey, text, 'body');
      directResults.push({
        key: targetKey,
        text,
        ...contactMeta,
        direction: readDirection(bubble),
        timestamp: readTimestamp(bubble),
        messagePart: 'body',
        ...viewportMetaFor(bubble)
      });
    }
  }
  return directResults;
})()
`;
}

function buildSignalDomProbeScript() {
  return `
(() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 10 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  const isEditableElement = (el) => {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true;
    const editable = (el.getAttribute?.('contenteditable') || '').toLowerCase();
    return el.isContentEditable || (editable && editable !== 'false') || el.getAttribute?.('role') === 'textbox';
  };
  const active = document.activeElement;
  const selectionNode = window.getSelection?.()?.focusNode;
  const selectionElement = selectionNode?.nodeType === Node.ELEMENT_NODE ? selectionNode : selectionNode?.parentElement;
  const selectionComposer = selectionElement?.closest?.('[contenteditable], [role="textbox"], textarea, input') || null;
  const activeText = active ? text(active) : '';
  const selectionText = selectionComposer ? text(selectionComposer) : '';
  const count = (selector) => {
    try {
      return Array.from(document.querySelectorAll(selector)).filter(isVisible).length;
    } catch {
      return 0;
    }
  };
  const composerSelector = [
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[aria-multiline="true"]',
    '[data-testid*="composition"]',
    '[data-testid*="compose"]',
    '[data-testid*="input"]',
    '[class*="composition"]',
    '[class*="compose"]',
    '[class*="input"]',
    'textarea'
  ].join(',');
  const messageSelector = [
    '[data-testid*="message"]',
    '[data-testid*="conversation"]',
    '[class*="module-message"]',
    '[class*="message"]',
    '[class*="Message"]',
    '[class*="conversation"]',
    '[role="row"]',
    'li'
  ].join(',');
  const textSelector = [
    messageSelector,
    '[dir="auto"]',
    '[dir="ltr"]',
    'span',
    'p'
  ].join(',');
  return {
    title: document.title,
    bodyText: text(document.body).slice(0, 180),
    composerCount: count(composerSelector),
    messageNodeCount: count(messageSelector),
    textNodeCount: count(textSelector)
    ,
    activeEditable: Boolean(
      (selectionComposer && isEditableElement(selectionComposer)) ||
      (active && isEditableElement(active))
    ),
    activeTextLength: Math.max(activeText.length, selectionText.length),
    activeHasChinese: /[\\u4e00-\\u9fff]/.test(selectionText || activeText),
    activeTag: active?.tagName || '',
    activeRole: active?.getAttribute?.('role') || '',
    activeContentEditable: active?.getAttribute?.('contenteditable') || '',
    selectionTag: selectionComposer?.tagName || '',
    selectionRole: selectionComposer?.getAttribute?.('role') || '',
    selectionContentEditable: selectionComposer?.getAttribute?.('contenteditable') || '',
    reviewEnabled: (() => {
      try {
        const persisted = window.localStorage?.getItem?.('df-composer-review-enabled-v1');
        if (persisted === '0') return false;
        if (persisted === '1') return true;
      } catch {
        // Fall through to the source-native runtime state.
      }
      return window.__dfComposerReviewEnabled !== false;
    })()
  };
})()
`;
}

function buildLegacyTranslationCacheCleanupScript(app: RuntimeApp) {
  const legacyRenderCacheKey = JSON.stringify(`df.translation.renderCache.v1.${app}`);
  return `
(() => {
  try {
    window.localStorage?.removeItem(${legacyRenderCacheKey});
    return true;
  } catch {
    return false;
  }
})()
`;
}

function buildSignalLegacyBubbleRuntimeRetirementScript() {
  return `
(() => {
  window.__dfCachedTranslationObserver?.disconnect?.();
  window.__dfCachedTranslationLayoutCleanup?.();
  delete window.__dfCachedTranslationLayoutCleanup;
  window.__dfCachedTranslationObserver = null;
  window.clearTimeout(window.__dfPersistentRenderCacheWriteTimer);
  window.__dfPersistentRenderCacheWriteTimer = 0;
  for (const node of Array.from(document.querySelectorAll('.df-chat-translation, .df-chat-refresh-placeholder, .df-chat-refresh-translation'))) {
    node.remove();
  }
  delete window.__dfApplyCachedTranslations;
  delete window.__dfApplyCachedTranslationsBurst;
  delete window.__dfMergeCachedTranslationRenderCache;
  delete window.__dfCachedTranslationByHash;
  delete window.__dfCachedTranslationRenderCache;
  delete window.__dfCachedTranslationRuntimeInstalled;
  delete window.__dfCachedTranslationRuntimeVersion;
  return true;
})()
`;
}

function buildCachedTranslationRuntimeScript(app: RuntimeApp, entries: Array<{ sourceHash: string; sourceText?: string; translatedText: string; updatedAt?: number }>) {
  const payload = JSON.stringify({ app, entries });
  return `
(() => {
  const payload = ${payload};
  const runtimeVersion = '2026-10-12-translation-layout-replay-v4';
  const legacyRenderCacheKey = 'df.translation.renderCache.v1.' + payload.app;
  window.clearTimeout(window.__dfPersistentRenderCacheWriteTimer);
  window.__dfPersistentRenderCacheWriteTimer = 0;
  try {
    window.localStorage?.removeItem(legacyRenderCacheKey);
  } catch {
    // Legacy plaintext cleanup must not prevent the in-memory renderer from starting.
  }
  const incomingEntries = Array.isArray(payload.entries) ? payload.entries : [];
  window.__dfCachedTranslationByHash = window.__dfCachedTranslationByHash || {};
  if (
    window.__dfCachedTranslationRuntimeInstalled &&
    window.__dfCachedTranslationRuntimeVersion === runtimeVersion
  ) {
    if (typeof window.__dfMergeCachedTranslationRenderCache === 'function') {
      window.__dfMergeCachedTranslationRenderCache(incomingEntries);
    } else {
      for (const entry of incomingEntries) {
        if (entry.sourceHash && entry.translatedText) {
          window.__dfCachedTranslationByHash[entry.sourceHash] = entry.translatedText;
        }
      }
    }
    if (typeof window.__dfApplyCachedTranslationsBurst === 'function') window.__dfApplyCachedTranslationsBurst();
    else if (typeof window.__dfApplyCachedTranslations === 'function') window.__dfApplyCachedTranslations();
    return Object.keys(window.__dfCachedTranslationByHash).length;
  }
  const retainedMemoryEntries = Object.entries(window.__dfCachedTranslationByHash).map(([sourceHash, translatedText]) => ({
    sourceHash,
    translatedText,
    updatedAt: 1
  }));
  window.__dfCachedTranslationObserver?.disconnect?.();
  window.__dfCachedTranslationLayoutCleanup?.();
  window.__dfCachedTranslationRuntimeInstalled = true;
  window.__dfCachedTranslationRuntimeVersion = runtimeVersion;

  const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
  const cachedNodeBatchSize = payload.app === 'signal' ? 800 : 200;
  const cachedNodeTriggerLimit = 800;
  const cachedMutationCandidateLimit = 200;
  const cachedScrollThrottleMs = 180;
  const renderCacheEntryLimit = ${browserRenderCacheEntryLimit};
  const renderCacheByteLimit = 15 * 1024 * 1024;
  const estimateRenderCacheEntryBytes = (entry) => {
    const sourceHash = entry?.sourceHash || '';
    const translatedText = entry?.translatedText || '';
    return 96 + sourceHash.length * 2 + translatedText.length * 2;
  };
  const normalizeRenderCacheEntry = (entry) => {
    if (!entry?.sourceHash || !entry?.translatedText) return null;
    return {
      sourceHash: String(entry.sourceHash),
      translatedText: String(entry.translatedText),
      at: Number(entry.updatedAt || entry.at || Date.now()) || Date.now()
    };
  };
  const trimRenderCacheEntries = (entries) => {
    const sorted = entries
      .map(normalizeRenderCacheEntry)
      .filter(Boolean)
      .sort((a, b) => b.at - a.at);
    const trimmed = [];
    let bytes = 0;
    const seenHashes = new Set();
    for (const entry of sorted) {
      if (seenHashes.has(entry.sourceHash)) continue;
      const nextBytes = estimateRenderCacheEntryBytes(entry);
      if (trimmed.length >= renderCacheEntryLimit || bytes + nextBytes > renderCacheByteLimit) break;
      seenHashes.add(entry.sourceHash);
      trimmed.push(entry);
      bytes += nextBytes;
    }
    return trimmed;
  };
  const mergeInMemoryRenderCache = (entries) => {
    const cache = { ...(window.__dfCachedTranslationRenderCache || {}) };
    for (const rawEntry of entries || []) {
      const entry = normalizeRenderCacheEntry(rawEntry);
      if (!entry) continue;
      cache[entry.sourceHash] = entry;
    }
    const trimmedEntries = trimRenderCacheEntries(Object.values(cache));
    window.__dfCachedTranslationRenderCache = Object.fromEntries(
      trimmedEntries.map((entry) => [entry.sourceHash, entry])
    );
    window.__dfCachedTranslationByHash = Object.fromEntries(
      trimmedEntries.map((entry) => [entry.sourceHash, entry.translatedText])
    );
    return trimmedEntries.length;
  };
  window.__dfMergeCachedTranslationRenderCache = mergeInMemoryRenderCache;
  mergeInMemoryRenderCache([...retainedMemoryEntries, ...incomingEntries]);
  const hashKey = (text) => {
    let hash = 2166136261;
    for (const char of normalize(text)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const hasChinese = (text) => /[\\u4e00-\\u9fff]/.test(text);
  const hasLatin = (text) => /[A-Za-z]{2,}/.test(text);
  const isNearViewport = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const aboveViewportMargin = window.innerHeight * 2;
    const belowViewportMargin = window.innerHeight;
    return (
      rect.width > 20 &&
      rect.height > 12 &&
      rect.bottom >= -aboveViewportMargin &&
      rect.top <= window.innerHeight + belowViewportMargin &&
      rect.right >= 0 &&
      rect.left <= window.innerWidth &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  };
  const textWithoutTranslatorUi = (el) => {
    const clone = el.cloneNode(true);
    for (const node of Array.from(clone.querySelectorAll('.df-chat-refresh-translation, .df-chat-refresh-placeholder, .df-chat-translation, .df-smart-reply-host, .df-smart-reply-panel'))) {
      node.remove();
    }
    if (payload.app === 'telegram') {
      for (const node of Array.from(clone.querySelectorAll('.time, .time-inner, .tgico, .i18n'))) {
        node.remove();
      }
    }
    return clone.innerText || clone.textContent || '';
  };
  const stripBubbleTime = (text) => {
    let value = normalize(text);
    for (let i = 0; i < 4; i += 1) {
      const next = value
        .replace(/\\s*↻+\\s*$/u, '')
        .replace(/\\s*(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?\\s*(?:✓|✓✓|✔|✔✔|↻)*\\s*$/u, '')
        .trim();
      if (next === value) break;
      value = next;
    }
    return value;
  };
  const collapseRepeatedText = (text) => {
    const value = normalize(text);
    if (value.length < 8 || value.length % 2 !== 0) return value;
    const half = value.length / 2;
    const left = value.slice(0, half).trim();
    const right = value.slice(half).trim();
    return left && left === right ? left : value;
  };
  const cleanMessageText = (text) => {
    let value = normalize(text).replace(/\\s*(?:↻+|\\.\\.\\.)\\s*$/u, '').trim();
    value = stripBubbleTime(value);
    value = value.replace(/\\s*(?:↻+|\\.\\.\\.)\\s*$/u, '').trim();
    return collapseRepeatedText(stripBubbleTime(value));
  };
  const isListArea = (el) => Boolean(el.closest([
    '#pane-side',
    '[data-testid="chat-list"]',
    '[data-testid="cell-frame-container"]',
    '[aria-label*="Chat list"]',
    '[aria-label*="chat list"]',
    '.chat-list',
    '.dialogs-list',
    '.DialogList',
    '.ListItem',
    '[class*="ChatList"]',
    '[class*="chatlist"]',
    '[class*="dialog-list"]'
  ].join(',')));
  const reject = (el) => Boolean(el.closest('footer, header, nav, aside, [role="textbox"], [contenteditable="true"], [data-testid="author"], [testid="author"], .df-translator-host, .df-chat-translation')) ||
    (payload.app === 'telegram' && Boolean(el.closest('.reply.quote-like, .time, .time-inner, .tgico, .i18n'))) ||
    isListArea(el);
  const findBubble = (el) => payload.app === 'signal'
    ? (
      el.closest('[data-testid*="message"]') ||
      el.closest('[class*="module-message"]') ||
      el.closest('[class*="Message"]') ||
      el.closest('[role="row"]') ||
      el.closest('li')
    )
    : payload.app === 'telegram'
      ? (
        el.closest('.bubble[data-mid]') ||
        el.closest('.bubble') ||
        el.closest('.bubble-content-wrapper') ||
        el.closest('.bubble-content') ||
        el.closest('.Message')
      )
      : el.closest('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out');
  const isLikelyMessageBubble = (bubble, textNode) => {
    if (!bubble || reject(bubble) || isListArea(textNode)) return false;
    if (payload.app === 'whatsapp') {
      return Boolean(
        bubble.matches?.('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out') ||
        bubble.closest?.('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out')
      );
    }
    if (payload.app === 'telegram') {
      return Boolean(
        bubble.matches?.('.bubble[data-mid], .bubble, .bubble-content-wrapper, .bubble-content, .Message') ||
        bubble.closest?.('.bubble[data-mid], .bubble, .bubble-content-wrapper, .bubble-content, .Message')
      );
    }
    return true;
  };
  const expandCollapsedWhatsappBubble = (bubble) => {
    if (payload.app !== 'whatsapp' || !bubble) return false;
    const readMoreButton = bubble.querySelector?.('[data-testid="caption-read-more-button"]');
    if (!readMoreButton || !isNearViewport(readMoreButton)) return false;
    for (const translation of Array.from(bubble.querySelectorAll?.('.df-chat-translation') || [])) {
      translation.remove();
    }
    if (readMoreButton.dataset.dfTranslatorExpandRequested !== '1') {
      readMoreButton.dataset.dfTranslatorExpandRequested = '1';
      readMoreButton.click();
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({ action: 'whatsapp-long-message-expanded', text: '', at: Date.now() });
    }
    return true;
  };
  const readDirection = (bubble) => {
    if (!bubble) return 'unknown';
    const explicitHost = bubble.closest?.('[data-id^="true_"], [data-id^="false_"], .message-in, .message-out') || bubble;
    const explicitId = (explicitHost.getAttribute?.('data-id') || '').toString();
    if (explicitId.startsWith('true_') || explicitHost.classList?.contains('message-out')) return 'outgoing';
    if (explicitId.startsWith('false_') || explicitHost.classList?.contains('message-in')) return 'incoming';
    const marker = [
      bubble.getAttribute?.('data-id') || '',
      bubble.getAttribute?.('data-testid') || '',
      bubble.className || ''
    ].join(' ');
    if (marker.includes('message-out') || marker.startsWith('true_') || /\\bown\\b|outgoing|is-out|from-me|sent/.test(marker)) return 'outgoing';
    if (marker.includes('message-in') || marker.startsWith('false_') || /incoming|is-in|from-them|received/.test(marker)) return 'incoming';
    const rect = bubble.getBoundingClientRect?.();
    if (rect && rect.width > 0) return rect.left + rect.width / 2 > window.innerWidth / 2 ? 'outgoing' : 'incoming';
    return 'unknown';
  };
  const translationColorFor = (bubble) => {
    if (payload.app === 'signal') {
      return readDirection(bubble) === 'outgoing' ? '#f8fbff' : '#0b7654';
    }
    return '#166534';
  };
  const styleTranslationNode = (node, bubble) => {
    node.style.cssText = [
      'display:block',
      'margin-top:5px',
      'border-top:1px solid #d8c081',
      'padding-top:5px',
      'color:' + translationColorFor(bubble),
      'font-size:15px',
      'letter-spacing:0.3px',
      'line-height:1.45',
      'white-space:pre-wrap',
      'word-break:break-word',
      'clear:both',
      'min-width:0',
      'max-width:100%',
      'box-sizing:border-box'
    ].join(';');
  };
  const renderWebTranslationWithRefresh = (node, translatedText, key, sourceText, bubble) => {
    if (payload.app === 'signal') {
      node.textContent = translatedText;
      return;
    }
    const reusableButton = Array.from(bubble?.querySelectorAll?.('.df-chat-refresh-translation') || [])
      .find((button) => button.dataset.dfRefreshKey === key);
    const oldPlaceholder = reusableButton?.closest('.df-chat-refresh-placeholder');
    if (reusableButton) reusableButton.remove();
    if (oldPlaceholder) oldPlaceholder.remove();
    for (const oldButton of Array.from(bubble?.querySelectorAll?.('.df-chat-refresh-translation') || [])) {
      if (oldButton.dataset.dfRefreshKey === key) oldButton.remove();
    }
    const characters = Array.from(translatedText || '');
    const lastCharacter = characters.pop() || '';
    const retainedSmartReplyUi = Array.from(node.children).filter(child =>
      child.matches?.('.df-smart-reply-host, .df-smart-reply-panel')
    );
    node.replaceChildren();
    if (characters.length) node.appendChild(document.createTextNode(characters.join('')));
    const tail = document.createElement('span');
    tail.className = 'df-chat-translation-tail';
    tail.style.cssText = 'display:inline-flex;align-items:center;white-space:nowrap';
    const last = document.createElement('span');
    last.textContent = lastCharacter;
    const button = reusableButton || document.createElement('button');
    button.type = 'button';
    button.className = 'df-chat-refresh-translation';
    button.dataset.dfRefreshKey = key;
    button.title = '重新翻译本条气泡';
    button.innerHTML = '&#8635;';
    button.style.cssText = [
      'align-items:center', 'appearance:none', 'background:transparent', 'border:0', 'border-radius:50%',
      'color:inherit', 'cursor:pointer', 'display:inline-flex', 'flex:0 0 auto', 'font-family:inherit',
      'font-size:15px', 'font-weight:400', 'height:24px', 'justify-content:center', 'line-height:1',
      'margin:0 0 0 3px', 'opacity:0.72', 'padding:0', 'pointer-events:auto', 'width:24px'
    ].join(';');
    if (window.__dfBubbleRefreshPendingKeys?.[key]) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '...';
      button.style.opacity = '0.58';
    }
    button.onmouseenter = () => {
      button.style.background = 'color-mix(in srgb, currentColor 12%, transparent)';
      button.style.opacity = '1';
    };
    button.onmouseleave = () => {
      button.style.background = 'transparent';
      button.style.opacity = '0.72';
    };
    let lastRefreshTriggerAt = 0;
    const triggerRefresh = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      const now = Date.now();
      if (now - lastRefreshTriggerAt < 500) return;
      lastRefreshTriggerAt = now;
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({
        action: 'bubble-refresh',
        text: JSON.stringify({ key, text: sourceText, direction: readDirection(bubble), messagePart: 'body' }),
        at: now
      });
    };
    if (!reusableButton) {
      if (payload.app === 'telegram') button.addEventListener('pointerdown', triggerRefresh, true);
      button.addEventListener('click', triggerRefresh, true);
    }
    tail.append(last, button);
    node.appendChild(tail);
    for (const retained of retainedSmartReplyUi) node.appendChild(retained);
  };
  const mountFor = (textNode, bubble) => {
    if (payload.app === 'signal') {
      return textNode.closest('[data-testid*="message"], [class*="module-message"], [class*="message"], .translatable-message, .text-content') || textNode;
    }
    if (payload.app === 'telegram') {
      return (
        textNode.closest('.message.spoilers-container, .message') ||
        bubble?.querySelector?.('.message.spoilers-container, .message') ||
        textNode.closest('.bubble-content') ||
        bubble?.querySelector?.('.bubble-content') ||
        bubble ||
        textNode
      );
    }
    return textNode.closest('[data-testid="selectable-text"], .selectable-text.copyable-text, .translatable-message, .text-content, [class*="text-content"]') || textNode;
  };
  const prepareTelegramMount = (mount) => {
    if (payload.app !== 'telegram' || !mount) return;
    const widthTarget = mount.matches?.('.bubble-content, .bubble-content-wrapper')
      ? mount
      : mount.closest?.('.bubble-content, .bubble-content-wrapper');
    if (!widthTarget) return;
    const rect = widthTarget.getBoundingClientRect();
    if (rect.width < 80) return;
    const lockedWidth = Math.ceil(rect.width) + 'px';
    widthTarget.style.minWidth = lockedWidth;
    widthTarget.style.boxSizing = 'border-box';
    const wrapper = widthTarget.closest?.('.bubble-content-wrapper');
    if (wrapper) {
      wrapper.style.minWidth = lockedWidth;
      wrapper.style.boxSizing = 'border-box';
    }
  };
  const appendTranslation = (mount, sourceHash, translatedText, bubble, sourceText, textNode) => {
    if (!mount) return false;
    prepareTelegramMount(mount);
    if (payload.app === 'signal') {
      mount.style.minWidth = '88px';
      mount.style.boxSizing = 'border-box';
    }
    if (payload.app === 'telegram') {
      for (const node of Array.from(document.querySelectorAll('.df-chat-translation'))) {
        if (!node.closest('.bubble-content, .bubble-content-wrapper')) node.remove();
      }
      const existingTranslations = Array.from(mount.querySelectorAll('.df-chat-translation'));
      const existingDirect = existingTranslations.find((node) => node.parentElement === mount);
      if (existingDirect) {
        const key = textNode.dataset.dfMsgTextKey || ('df-cache-' + sourceHash);
        textNode.dataset.dfMsgTextKey = key;
        if (normalize(textWithoutTranslatorUi(existingDirect)) === normalize(translatedText) &&
            existingDirect.querySelector('.df-chat-refresh-translation')) {
          styleTranslationNode(existingDirect, bubble || mount);
          return false;
        }
        renderWebTranslationWithRefresh(existingDirect, translatedText, key, sourceText, bubble || mount);
        existingDirect.dataset.dfCachedHash = sourceHash;
        styleTranslationNode(existingDirect, bubble || mount);
        return false;
      }
      for (const existingTranslation of existingTranslations) {
        if (existingTranslation.closest('.bubble-content, .bubble-content-wrapper')) existingTranslation.remove();
      }
    } else {
      const existingTranslation = mount.querySelector('.df-chat-translation');
      if (existingTranslation) {
        if (payload.app === 'signal') {
          if (existingTranslation.dataset.dfCachedHash === sourceHash) {
            if (existingTranslation.textContent !== translatedText) existingTranslation.textContent = translatedText;
            mount.dataset.dfCachedTranslatedHash = sourceHash;
            styleTranslationNode(existingTranslation, bubble || mount);
            return false;
          }
          existingTranslation.remove();
          delete mount.dataset.dfCachedTranslatedHash;
        } else {
          styleTranslationNode(existingTranslation, bubble || mount);
          return false;
        }
      }
    }
    if (payload.app === 'signal' && mount.dataset.dfCachedTranslatedHash === sourceHash) {
      const matchingTranslation = Array.from(mount.querySelectorAll('.df-chat-translation')).find(
        (node) => node.dataset.dfCachedHash === sourceHash
      );
      if (matchingTranslation) {
        if (matchingTranslation.textContent !== translatedText) matchingTranslation.textContent = translatedText;
        styleTranslationNode(matchingTranslation, bubble || mount);
        return false;
      }
      delete mount.dataset.dfCachedTranslatedHash;
    }
    // Virtualized chats can remove the injected child while retaining its parent.
    // A cached marker alone must not prevent restoring the missing translation.
    if (mount.dataset.dfCachedTranslatedHash === sourceHash) {
      if (mount.querySelector('.df-chat-translation')) return false;
      delete mount.dataset.dfCachedTranslatedHash;
    }
    const node = document.createElement('div');
    node.className = 'df-chat-translation';
    node.dataset.dfCachedHash = sourceHash;
    const key = textNode?.dataset?.dfMsgTextKey || ('df-cache-' + sourceHash);
    if (textNode) textNode.dataset.dfMsgTextKey = key;
    renderWebTranslationWithRefresh(node, translatedText, key, sourceText, bubble || mount);
    styleTranslationNode(node, bubble || mount);
    if (payload.app === 'telegram' && mount.matches?.('.message.spoilers-container, .message')) {
      const anchor = Array.from(mount.children).find((child) =>
        child.classList?.contains('time') || child.classList?.contains('clearfix')
      );
      mount.insertBefore(node, anchor || null);
    } else {
      mount.appendChild(node);
    }
    mount.dataset.dfCachedTranslatedHash = sourceHash;
    return true;
  };
  const selectors = payload.app === 'signal'
    ? [
      '[data-testid*="message"] [dir="auto"]',
      '[data-testid*="message"] [dir="ltr"]',
      '[class*="module-message"] [dir="auto"]',
      '[class*="module-message"] [dir="ltr"]',
      '[class*="message"] [dir="auto"]',
      '[class*="message"] [dir="ltr"]',
      '[role="row"] [dir="auto"]',
      '[role="row"] [dir="ltr"]',
      '.text-content',
      '.translatable-message'
    ]
    : payload.app === 'telegram'
      ? [
        '.bubble-content > .message.spoilers-container > .translatable-message',
        '.bubble-content > .message > .translatable-message',
        '.bubble-content > .message.spoilers-container',
        '.bubble-content > .message',
        '.text-content',
        '.translatable-message',
        '.Message .text-content',
        '.message .text-content'
      ]
      : [
        '[data-testid="quoted-message"] .quoted-mention.selectable-text',
        '[data-testid="quoted-message"] [data-testid="selectable-text"].quoted-mention',
        '.selectable-text.copyable-text',
        '[data-pre-plain-text] .selectable-text.copyable-text',
        '[data-pre-plain-text] .selectable-text',
        '[data-testid="msg-container"] [data-testid="selectable-text"]',
        '[data-testid="msg-container"] .selectable-text.copyable-text',
        '[data-testid="msg-container"] .selectable-text',
        '.message-in .selectable-text.copyable-text',
        '.message-out .selectable-text.copyable-text',
        '.message-in .selectable-text',
        '.message-out .selectable-text'
      ];
  const runDeferred = (callback) => {
    if (payload.app === 'signal') {
      queueMicrotask(callback);
      return;
    }
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
    } else {
      window.setTimeout(callback, 16);
    }
  };
  const applyCachedTranslations = (done, roots = null) => {
    const seen = new Set();
    const textNodes = [];
    const scopedRoots = Array.isArray(roots)
      ? roots.filter((root) => root?.nodeType === Node.ELEMENT_NODE && root.isConnected)
      : null;
    const candidateLimit = scopedRoots ? cachedMutationCandidateLimit : cachedNodeTriggerLimit;
    const addCandidate = (el) => {
      if (!el || seen.has(el) || !isNearViewport(el) || reject(el)) return;
      seen.add(el);
      textNodes.push(el);
    };
    if (scopedRoots) {
      for (const root of scopedRoots) {
        for (const selector of selectors) {
          if (root.matches?.(selector)) addCandidate(root);
          if (textNodes.length >= candidateLimit) break;
          for (const el of Array.from(root.querySelectorAll?.(selector) || [])) {
            addCandidate(el);
            if (textNodes.length >= candidateLimit) break;
          }
          if (textNodes.length >= candidateLimit) break;
        }
        if (textNodes.length >= candidateLimit) break;
      }
    } else {
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          addCandidate(el);
          if (textNodes.length >= candidateLimit) break;
        }
        if (textNodes.length >= candidateLimit) break;
      }
    }
    let cursor = 0;
    const finish = () => {
      if (typeof done === 'function') done();
    };
    const runBatch = () => {
      const batchEnd = Math.min(cursor + cachedNodeBatchSize, textNodes.length);
      for (; cursor < batchEnd; cursor += 1) {
        const textNode = textNodes[cursor];
        const bubble = findBubble(textNode);
        if (!isLikelyMessageBubble(bubble, textNode)) continue;
        if (expandCollapsedWhatsappBubble(bubble)) continue;
        const text = cleanMessageText(textWithoutTranslatorUi(textNode));
        if (!text || text.length < 2 || text.length > 4000 || !hasLatin(text) || hasChinese(text)) continue;
        const sourceHash = hashKey(text);
        const translatedText = window.__dfCachedTranslationByHash[sourceHash];
        if (!translatedText) continue;
        const mount = mountFor(textNode, bubble);
        appendTranslation(mount, sourceHash, translatedText, bubble, text, textNode);
      }
      if (cursor < textNodes.length) {
        runDeferred(runBatch);
      } else {
        finish();
      }
    };
    if (!textNodes.length) {
      finish();
      return;
    }
    runBatch();
  };
  let scheduled = false;
  let running = false;
  let pendingFullScan = false;
  const pendingRoots = new Set();
  const addPendingRoot = (root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE || !root.isConnected) return;
    if (root.matches?.('.df-chat-translation, .df-chat-refresh-placeholder, .df-chat-refresh-translation, .df-smart-reply-host, .df-smart-reply-panel') || root.closest?.('.df-chat-translation, .df-chat-refresh-placeholder, .df-chat-refresh-translation, .df-smart-reply-host, .df-smart-reply-panel')) return;
    for (const existing of Array.from(pendingRoots)) {
      if (existing === root || existing.contains?.(root)) return;
      if (root.contains?.(existing)) pendingRoots.delete(existing);
    }
    pendingRoots.add(root);
    if (pendingRoots.size > cachedMutationCandidateLimit) {
      pendingRoots.clear();
      pendingFullScan = true;
    }
  };
  const requestScheduledApply = () => {
    if (scheduled || running) return;
    scheduled = true;
    runDeferred(runScheduledApply);
  };
  const runScheduledApply = () => {
    scheduled = false;
    if (running) return;
    const runFullScan = pendingFullScan;
    pendingFullScan = false;
    const roots = runFullScan ? null : Array.from(pendingRoots);
    pendingRoots.clear();
    if (!runFullScan && !roots.length) return;
    running = true;
    applyCachedTranslations(() => {
      running = false;
      if (pendingFullScan || pendingRoots.size) requestScheduledApply();
    }, roots);
  };
  const scheduleApply = (roots) => {
    if (Array.isArray(roots)) {
      for (const root of roots) addPendingRoot(root);
      if (!pendingRoots.size && !pendingFullScan) return;
    } else {
      pendingFullScan = true;
      pendingRoots.clear();
    }
    requestScheduledApply();
  };
  const mutationRoots = (records) => {
    const roots = [];
    const seenRoots = new Set();
    const addRoot = (node) => {
      const root = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      if (!root || !root.isConnected) return;
      if (root.matches?.('.df-chat-translation, .df-chat-refresh-placeholder, .df-chat-refresh-translation, .df-smart-reply-host, .df-smart-reply-panel') || root.closest?.('.df-chat-translation, .df-chat-refresh-placeholder, .df-chat-refresh-translation, .df-smart-reply-host, .df-smart-reply-panel')) return;
      if (seenRoots.has(root)) return;
      seenRoots.add(root);
      roots.push(root);
    };
    for (const record of records) {
      if (record.type === 'characterData') {
        addRoot(record.target);
        continue;
      }
      for (const node of Array.from(record.addedNodes || [])) addRoot(node);
    }
    return roots;
  };
  const scheduleApplyBurst = () => {
    scheduleApply();
    const delays = payload.app === 'signal' ? [16, 48, 96, 180] : [60, 140, 260, 420];
    for (const delay of delays) {
      window.setTimeout(scheduleApply, delay);
    }
  };
  let lastScrollApplyAt = 0;
  let scrollApplyTimer = 0;
  const scheduleScrollApply = () => {
    const now = Date.now();
    const wait = Math.max(0, cachedScrollThrottleMs - (now - lastScrollApplyAt));
    window.clearTimeout(scrollApplyTimer);
    scrollApplyTimer = window.setTimeout(() => {
      lastScrollApplyAt = Date.now();
      scheduleApply();
    }, wait);
  };
  window.__dfApplyCachedTranslations = scheduleApply;
  window.__dfApplyCachedTranslationsBurst = scheduleApplyBurst;
  window.__dfCachedTranslationLayoutCleanup = (${installTranslationLayoutWatchersFromDom.toString()})(scheduleApply);
  window.__dfCachedTranslationObserver = new MutationObserver((records) => {
    const roots = mutationRoots(records);
    if (!roots.length) return;
    if (payload.app !== 'signal') {
      scheduleApply();
      return;
    }
    scheduleApply(roots);
  });
  window.__dfCachedTranslationObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: payload.app === 'signal'
  });
  window.addEventListener('scroll', scheduleScrollApply, { passive: true, capture: true });
  document.addEventListener('scroll', scheduleScrollApply, { passive: true, capture: true });
  if (payload.app === 'signal') {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target?.closest?.('[role="row"], [data-testid*="conversation"], [class*="conversation"], [class*="Conversation"]');
      if (target) scheduleApplyBurst();
    }, true);
  }
  scheduleApplyBurst();
  return Object.keys(window.__dfCachedTranslationByHash).length;
})()
`;
}

function buildWebBubbleRefreshStateScript(key: string, state: 'processing' | 'idle', error = '') {
  const payload = JSON.stringify({ key, state, error });
  return `
(() => {
  const payload = ${payload};
  window.__dfBubbleRefreshPendingKeys = window.__dfBubbleRefreshPendingKeys || Object.create(null);
  if (payload.state === 'processing') window.__dfBubbleRefreshPendingKeys[payload.key] = true;
  else delete window.__dfBubbleRefreshPendingKeys[payload.key];
  const buttons = Array.from(document.querySelectorAll('.df-chat-refresh-translation'));
  const matchingButtons = buttons.filter((item) => item.dataset.dfRefreshKey === payload.key);
  for (const button of matchingButtons) {
    button.title = payload.error || '刷新翻译';
    if (payload.state === 'processing') {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '...';
      button.style.opacity = '0.58';
      continue;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = '&#8635;';
    button.style.opacity = '0.72';
  }
  return matchingButtons.length > 0;
})()
`;
}

function buildMessageTranslationInjectScript(key: string, translation: string, app: RuntimeApp, sourceText = '', replaceExisting = false) {
  const payload = JSON.stringify({ key, translation, app, sourceText, replaceExisting });
  return `
(() => {
  const payload = ${payload};
  const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
  const textWithoutTranslatorUi = (el) => {
    const clone = el.cloneNode(true);
    for (const node of Array.from(clone.querySelectorAll('.df-chat-refresh-translation, .df-chat-refresh-placeholder, .df-chat-translation, .df-smart-reply-host, .df-smart-reply-panel'))) {
      node.remove();
    }
    if (payload.app === 'telegram') {
      for (const node of Array.from(clone.querySelectorAll('.time, .time-inner, .tgico, .i18n'))) {
        node.remove();
      }
    }
    return clone.innerText || clone.textContent || '';
  };
  const quoteSelector = [
    '[data-testid="quoted-message"]',
    '[data-testid*="quoted"]',
    '[data-testid*="reply"]',
    '[aria-label*="Quoted"]',
    '[aria-label*="Reply"]',
    '.reply.quote-like',
    '.reply-subtitle',
    '.quoted-message',
    '.quoted',
    '.reply',
    '.MessageReply',
    '[class*="quoted"]',
    '[class*="reply"]'
  ].join(',');
  let targetByKey = document.querySelector('[data-df-msg-text-key="' + payload.key + '"]');
  let keyedContainer = document.querySelector('[data-df-msg-key="' + payload.key + '"]');
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 10 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const isListArea = (el) => Boolean(el.closest([
    '#pane-side',
    '[data-testid="chat-list"]',
    '[data-testid="cell-frame-container"]',
    '[aria-label*="Chat list"]',
    '[aria-label*="chat list"]',
    '.chat-list',
    '.dialogs-list',
    '.DialogList',
    '.ListItem',
    '[class*="ChatList"]',
    '[class*="chatlist"]',
    '[class*="dialog-list"]'
  ].join(',')));
  const containerSelector = payload.app === 'signal'
    ? '[data-testid="msg-container"], [data-testid*="message"], [data-pre-plain-text], [role="row"], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out, [class*="module-message"], .Message'
    : payload.app === 'telegram'
      ? '.bubble[data-mid], .bubble, .bubble-content-wrapper, .bubble-content, .Message'
      : '[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out';
  const isTelegramIgnoredText = (el) => payload.app === 'telegram' && Boolean(el.closest('.reply.quote-like, .time, .time-inner, .tgico, .i18n'));
  const readDirection = (bubble) => {
    if (!bubble) return 'unknown';
    const explicitHost = bubble.closest?.('[data-id^="true_"], [data-id^="false_"], .message-in, .message-out') || bubble;
    const explicitId = (explicitHost.getAttribute?.('data-id') || '').toString();
    if (explicitId.startsWith('true_') || explicitHost.classList?.contains('message-out')) return 'outgoing';
    if (explicitId.startsWith('false_') || explicitHost.classList?.contains('message-in')) return 'incoming';
    const marker = [
      bubble.getAttribute?.('data-id') || '',
      bubble.getAttribute?.('data-testid') || '',
      bubble.className || ''
    ].join(' ');
    if (marker.includes('message-out') || marker.startsWith('true_') || /\\bown\\b|outgoing|is-out|from-me|sent/.test(marker)) return 'outgoing';
    if (marker.includes('message-in') || marker.startsWith('false_') || /incoming|is-in|from-them|received/.test(marker)) return 'incoming';
    const rect = bubble.getBoundingClientRect?.();
    if (rect && rect.width > 0) return rect.left + rect.width / 2 > window.innerWidth / 2 ? 'outgoing' : 'incoming';
    return 'unknown';
  };
  const sourceSelectors = payload.app === 'whatsapp'
    ? [
      '[data-pre-plain-text] .selectable-text.copyable-text',
      '[data-pre-plain-text] .selectable-text',
      '[data-testid="msg-container"] [data-testid="selectable-text"]',
      '[data-testid="msg-container"] .selectable-text.copyable-text',
      '[data-testid="msg-container"] .selectable-text',
      '.message-in .selectable-text.copyable-text',
      '.message-out .selectable-text.copyable-text',
      '.message-in .selectable-text',
      '.message-out .selectable-text'
    ]
    : payload.app === 'telegram'
      ? [
        '.bubble-content > .message.spoilers-container > .translatable-message',
        '.bubble-content > .message > .translatable-message',
        '.bubble-content > .message.spoilers-container',
        '.bubble-content > .message',
        '.translatable-message',
        '.Message .text-content',
        '.message .text-content',
        '.text-content'
      ]
      : [
        '[data-testid*="message"] [dir="auto"]',
        '[data-testid*="message"] [dir="ltr"]',
        '[class*="module-message"] [dir="auto"]',
        '[class*="module-message"] [dir="ltr"]',
        '.translatable-message',
        '.text-content',
        '[dir="ltr"]'
      ];
  if (!targetByKey && payload.sourceText) {
    const source = normalize(payload.sourceText);
    const candidates = Array.from(document.querySelectorAll(sourceSelectors.join(','))).filter((el) => isVisible(el) && !isListArea(el) && !isTelegramIgnoredText(el));
    targetByKey = candidates.find((el) => normalize(textWithoutTranslatorUi(el)).includes(source)) || null;
    if (targetByKey) {
      targetByKey.dataset.dfMsgTextKey = payload.key;
      keyedContainer = targetByKey.closest(containerSelector);
      if (keyedContainer) keyedContainer.dataset.dfMsgKey = payload.key;
    }
  }
  const container =
    keyedContainer ||
    targetByKey?.closest(containerSelector);
  if (!container || isListArea(container)) return false;
  if (payload.app === 'whatsapp') {
    const readMoreButton = container.querySelector?.('[data-testid="caption-read-more-button"]');
    if (readMoreButton && isVisible(readMoreButton)) {
      for (const translationNode of Array.from(container.querySelectorAll('.df-chat-translation'))) {
        translationNode.remove();
      }
      if (readMoreButton.dataset.dfTranslatorExpandRequested !== '1') {
        readMoreButton.dataset.dfTranslatorExpandRequested = '1';
        readMoreButton.click();
        window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
        window.__dfTranslatorQueue.push({ action: 'whatsapp-long-message-expanded', text: '', at: Date.now() });
      }
      return false;
    }
  }
  const telegramQuoteBlock = payload.app === 'telegram'
    ? (targetByKey?.closest('.reply.quote-like') || (keyedContainer && keyedContainer.matches('.reply.quote-like') ? keyedContainer : null))
    : null;
  const quoteMount = payload.app === 'telegram'
    ? (
      telegramQuoteBlock?.querySelector('.reply-content') ||
      telegramQuoteBlock
    )
    : (
      targetByKey?.closest('[data-testid="quoted-message"]') ||
      targetByKey?.closest(quoteSelector) ||
      (keyedContainer && keyedContainer.matches(quoteSelector) ? keyedContainer : null)
    );
  const target = payload.app === 'telegram'
    ? (
      targetByKey ||
      container.querySelector('.message.spoilers-container > .translatable-message') ||
      container.querySelector('.message > .translatable-message') ||
      container.querySelector('.message.spoilers-container, .message') ||
      container.querySelector('.text-content') ||
      Array.from(container.querySelectorAll('[dir="auto"], span, div')).filter((el) => isVisible(el) && !isTelegramIgnoredText(el)).pop() ||
      container
    )
    : (
      targetByKey ||
      container.querySelector('.selectable-text.copyable-text') ||
      container.querySelector('.translatable-message') ||
      container.querySelector('.text-content') ||
      container.querySelector('[dir="auto"]') ||
      container.querySelector('[dir="ltr"]') ||
      Array.from(container.querySelectorAll('[dir="auto"], span, div')).filter(isVisible).pop() ||
      container
    );
  const textMount =
    payload.app === 'signal'
      ? (
        target.closest('[data-testid*="message"], [class*="module-message"], [class*="message"], .translatable-message, .text-content') ||
        target
      )
      : payload.app === 'telegram'
      ? (
        target.closest('.message.spoilers-container, .message') ||
        container.querySelector('.message.spoilers-container, .message') ||
        target.closest('.bubble-content') ||
        container.querySelector('.bubble-content') ||
        target.parentElement ||
        target
      )
      : (
        target.closest('[data-testid="msg-container"] [data-testid="selectable-text"], [data-pre-plain-text] .selectable-text, [data-testid="selectable-text"], .selectable-text.copyable-text, .selectable-text') ||
        target
      );
  const mount = quoteMount || textMount;
  const prepareTelegramMount = () => {
    if (payload.app !== 'telegram' || !mount) return;
    const widthTarget = mount.matches?.('.bubble-content, .bubble-content-wrapper')
      ? mount
      : mount.closest?.('.bubble-content, .bubble-content-wrapper');
    if (!widthTarget) return;
    const rect = widthTarget.getBoundingClientRect();
    if (rect.width < 80) return;
    const lockedWidth = Math.ceil(rect.width) + 'px';
    widthTarget.style.minWidth = lockedWidth;
    widthTarget.style.boxSizing = 'border-box';
    const wrapper = widthTarget.closest?.('.bubble-content-wrapper');
    if (wrapper) {
      wrapper.style.minWidth = lockedWidth;
      wrapper.style.boxSizing = 'border-box';
    }
  };
  prepareTelegramMount();
  if (payload.app === 'signal') {
    mount.style.minWidth = '88px';
    mount.style.boxSizing = 'border-box';
  }
  if (payload.app === 'telegram') {
    for (const node of Array.from(document.querySelectorAll('.df-chat-translation'))) {
      if (!node.closest('.bubble-content, .bubble-content-wrapper')) node.remove();
    }
  }
  const styleTranslationNode = (targetNode) => {
    const translationColor = payload.app === 'signal' && readDirection(container || mount) === 'outgoing' ? '#f8fbff' : '#166534';
    targetNode.style.cssText = [
      'display:block',
      'margin-top:5px',
      'border-top:1px solid #d8c081',
      'padding-top:5px',
      'color:' + translationColor,
      'font-size:15px',
      'letter-spacing:0.3px',
      'line-height:1.45',
      'white-space:pre-wrap',
      'word-break:break-word',
      'clear:both',
      'min-width:0',
      'max-width:100%',
      'box-sizing:border-box'
    ].join(';');
  };
  const renderWebTranslationWithRefresh = (targetNode) => {
    if (payload.app === 'signal') {
      targetNode.textContent = payload.translation;
      return;
    }
    const reusableButton = Array.from(container.querySelectorAll('.df-chat-refresh-translation'))
      .find((button) => button.dataset.dfRefreshKey === payload.key);
    const oldPlaceholder = reusableButton?.closest('.df-chat-refresh-placeholder');
    if (reusableButton) reusableButton.remove();
    if (oldPlaceholder) oldPlaceholder.remove();
    for (const oldButton of Array.from(container.querySelectorAll('.df-chat-refresh-translation'))) {
      if (oldButton.dataset.dfRefreshKey === payload.key) oldButton.remove();
    }
    const characters = Array.from(payload.translation || '');
    const lastCharacter = characters.pop() || '';
    targetNode.replaceChildren();
    if (characters.length) targetNode.appendChild(document.createTextNode(characters.join('')));
    const tail = document.createElement('span');
    tail.className = 'df-chat-translation-tail';
    tail.style.cssText = 'display:inline-flex;align-items:center;white-space:nowrap';
    const last = document.createElement('span');
    last.textContent = lastCharacter;
    const button = reusableButton || document.createElement('button');
    button.type = 'button';
    button.className = 'df-chat-refresh-translation';
    button.dataset.dfRefreshKey = payload.key;
    button.title = '重新翻译本条气泡';
    button.innerHTML = '&#8635;';
    button.style.cssText = [
      'align-items:center', 'appearance:none', 'background:transparent', 'border:0', 'border-radius:50%',
      'color:inherit', 'cursor:pointer', 'display:inline-flex', 'flex:0 0 auto', 'font-family:inherit',
      'font-size:15px', 'font-weight:400', 'height:24px', 'justify-content:center', 'line-height:1',
      'margin:0 0 0 3px', 'opacity:0.72', 'padding:0', 'pointer-events:auto', 'width:24px'
    ].join(';');
    if (window.__dfBubbleRefreshPendingKeys?.[payload.key]) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = '...';
      button.style.opacity = '0.58';
    }
    button.onmouseenter = () => {
      button.style.background = 'color-mix(in srgb, currentColor 12%, transparent)';
      button.style.opacity = '1';
    };
    button.onmouseleave = () => {
      button.style.background = 'transparent';
      button.style.opacity = '0.72';
    };
    let lastRefreshTriggerAt = 0;
    const triggerRefresh = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.disabled) return;
      const now = Date.now();
      if (now - lastRefreshTriggerAt < 500) return;
      lastRefreshTriggerAt = now;
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({
        action: 'bubble-refresh',
        text: JSON.stringify({
          key: payload.key,
          text: payload.sourceText,
          direction: readDirection(container),
          messagePart: 'body'
        }),
        at: now
      });
    };
    if (!reusableButton) {
      if (payload.app === 'telegram') button.addEventListener('pointerdown', triggerRefresh, true);
      button.addEventListener('click', triggerRefresh, true);
    }
    tail.append(last, button);
    targetNode.appendChild(tail);
  };
  const existingTranslations = Array.from(mount.querySelectorAll('.df-chat-translation'));
  if (existingTranslations.length && !payload.replaceExisting) {
    if (payload.app !== 'telegram' || existingTranslations.some((node) => node.parentElement === mount)) {
      for (const existingTranslation of existingTranslations) {
        renderWebTranslationWithRefresh(existingTranslation);
        styleTranslationNode(existingTranslation);
      }
      return true;
    }
  }
  for (const existingTranslation of existingTranslations) {
    if (payload.app !== 'telegram' || existingTranslation.closest('.bubble-content, .bubble-content-wrapper')) existingTranslation.remove();
  }
  const node = document.createElement('div');
  node.className = 'df-chat-translation';
  renderWebTranslationWithRefresh(node);
  styleTranslationNode(node);
  if (payload.app === 'telegram' && mount.matches?.('.message.spoilers-container, .message')) {
    const anchor = Array.from(mount.children).find((child) =>
      child.classList?.contains('time') || child.classList?.contains('clearfix')
    );
    mount.insertBefore(node, anchor || null);
  } else {
    mount.appendChild(node);
  }
  return true;
})()
`;
}

function buildFingerprintScript(profile: ChatProfile) {
  const fp = JSON.stringify(profile.fingerprint);
  return `
(() => {
  const fp = ${fp};
  const defineGetter = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { configurable: true, get: () => value });
    } catch {}
  };

  if (fp.hardwareSource === 'custom') {
    defineGetter(Navigator.prototype, 'hardwareConcurrency', fp.hardwareConcurrency);
    defineGetter(Navigator.prototype, 'deviceMemory', fp.deviceMemory);
  }

  if (fp.languageSource === 'custom' && fp.languages && fp.languages.length) {
    defineGetter(Navigator.prototype, 'languages', fp.languages);
    defineGetter(Navigator.prototype, 'language', fp.languages[0]);
  }

  if (fp.timezoneSource === 'custom' && fp.timezone) {
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
      return { ...originalResolvedOptions.call(this), timeZone: fp.timezone };
    };
  }

  const patchWebGL = (Ctor) => {
    if (!Ctor || !Ctor.prototype) return;
    const originalGetParameter = Ctor.prototype.getParameter;
    Ctor.prototype.getParameter = function getParameter(parameter) {
      if (parameter === 37445) return fp.webglVendor;
      if (parameter === 37446) return fp.webglRenderer;
      return originalGetParameter.call(this, parameter);
    };
  };

  patchWebGL(window.WebGLRenderingContext);
  patchWebGL(window.WebGL2RenderingContext);

  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function toDataURL(...args) {
    const context = this.getContext('2d');
    if (context) {
      const x = fp.canvasSeed % Math.max(1, this.width || 1);
      const y = fp.canvasSeed % Math.max(1, this.height || 1);
      context.fillStyle = 'rgba(' + (fp.canvasSeed % 255) + ',1,1,0.01)';
      context.fillRect(x, y, 1, 1);
    }
    return originalToDataURL.apply(this, args);
  };
})();
`;
}

watch([activeProfileId, activePanel, signedIn], () => {
  void nextTick(() => scheduleSignalWorkspaceSyncBurst());
  if (signedIn.value && activePanel.value === 'session' && activeProfileId.value) {
    const profileId = activeProfileId.value as string;
    void nextTick(() => {
      scheduleProfileTranslationRefresh(profileId);
      const profile = profiles.value.find((item) => item.id === profileId);
      if (profile && appForPlatform(profile.platform) !== 'signal') {
        scheduleSmartReplyUiRefresh(profileId, 40);
        for (const delay of [600, 1800, 3200]) {
          window.setTimeout(() => {
            if (activeProfileId.value === profileId && signedIn.value && activePanel.value === 'session') {
              scheduleSmartReplyUiRefresh(profileId, 0);
            }
          }, delay);
        }
      }
    });
  }
});

watch(hasBlockingModal, (blocked, wasBlocked) => {
  if (blocked) {
    void nextTick(() => scheduleSignalWorkspaceSyncBurst());
    return;
  }
  if (!wasBlocked) return;
  void nextTick(() => {
    const profileId = activeSignalProfile.value?.id;
    if (signedIn.value && activePanel.value === 'session' && profileId) {
      void openSignalProfileInWorkspace(profileId);
      return;
    }
    scheduleSignalWorkspaceSyncBurst();
  });
});

watch(totalUnreadCount, (count) => {
  void window.chatTranslator?.setTaskbarUnreadCount?.(count).catch(() => undefined);
}, { immediate: true });

watch(activePanel, (panel, previousPanel) => {
  if (panel !== 'session') {
    lockGuideVisible.value = false;
    return;
  }
  if (previousPanel !== 'session' && !lockScreenStatus.value?.enabled) {
    lockGuideVisible.value = true;
  }
});

onMounted(() => {
  removeSensitiveDialogListener = window.chatTranslator.onSensitiveSendDialog(dialog => {
    sensitiveDialogs.value.push(dialog);
  });
  removeSensitiveDialogClosedListener = window.chatTranslator.onSensitiveSendDialogClosed(id => {
    sensitiveDialogs.value = sensitiveDialogs.value.filter(dialog => dialog.id !== id);
  });
  void window.chatTranslator.getDiagnosticsStatus().then(status => {
    diagnosticMonitoringEnabled = status.enabled;
    if (status.enabled) diagnosticQueueTimer = setInterval(() => {
      diagnosticEvent('queue:snapshot', { running: runningTranslationCount, queued: translationQueue.length, oldestMs: Math.max(0, ...Array.from(runningTranslationTasks.values(), task => Date.now() - task.createdAt)) });
    }, 5000);
  }).catch(() => {});
  clearLegacyRendererTranslationCaches();
  void window.chatTranslator?.setWindowTheme?.(activeTheme.value);
  void window.chatTranslator?.isPackaged?.().then((packaged) => {
    showDeveloperDiagnostics.value = !packaged;
    void nextTick(() => scheduleSignalWorkspaceSyncBurst());
  });
  void initializeClientAuthorization();
  void initializeRemoteGuard();
  void refreshMemoryStatus();
  memoryStatusTimer = setInterval(() => {
    void refreshMemoryStatus();
  }, 10000);
  lockScreenClockTimer = setInterval(() => {
    lockScreenClock.value = Date.now();
  }, 1000);
  window.addEventListener('resize', scheduleSignalWorkspaceSync);
  removeTranslationLayoutWatchers=installTranslationLayoutWatchersFromDom(()=>{
    scheduleSignalWorkspaceSyncBurst();
    if(!signedIn.value||lockScreenVisible.value||activePanel.value!=='session'||!activeProfileId.value)return;
    void executeProfileScript(activeProfileId.value,`(()=>{window.__dfApplyCachedTranslationsBurst?.();return true;})()`).catch(()=>undefined);
  });
  nextTick(() => {
    const host = document.querySelector<HTMLElement>('.runtime-web-main');
    if (!host || typeof ResizeObserver === 'undefined') return;
    signalWorkspaceResizeObserver = new ResizeObserver(() => scheduleSignalWorkspaceSync());
    signalWorkspaceResizeObserver.observe(host);
  });
  removeSignalActivateProfileListener = window.chatTranslator?.onSignalActivateProfile?.((profileId) => {
    void activateSignalProfileFromMain(profileId);
  }) ?? null;
  removeSignalNotificationActivationListener = window.chatTranslator?.onSignalNotificationActivation?.((activation) => {
    void activateSignalNotificationFromMain(activation);
  }) ?? null;
  void window.chatTranslator?.getPendingSignalNotificationActivation?.().then((activation) => {
    if (activation) void activateSignalNotificationFromMain(activation);
  });
  removeSignalRestoreProfileListener = window.chatTranslator?.onSignalRestoreProfile?.((profileId) => {
    if (
      signedIn.value &&
      activePanel.value === 'session' &&
      currentApp.value === 'signal' &&
      activeSignalProfile.value?.id === profileId
    ) {
      void openSignalProfileInWorkspace(profileId);
    }
  }) ?? null;
  removeSignalWorkspaceSyncListener = window.chatTranslator?.onSignalWorkspaceSync?.(() => {
    scheduleSignalWorkspaceSyncBurst();
  }) ?? null;
  removeRemoteGuardStatusListener = window.chatTranslator?.onRemoteGuardStatus?.((status) => {
    applyRemoteGuardStatus(status);
  }) ?? null;
});

onUnmounted(() => {
  removeSensitiveDialogListener?.();
  removeSensitiveDialogClosedListener?.();
  if (diagnosticQueueTimer) clearInterval(diagnosticQueueTimer);
  stopPokeballSequence();
  if (memoryStatusTimer) clearInterval(memoryStatusTimer);
  if (lockScreenClockTimer) clearInterval(lockScreenClockTimer);
  if (lockBlankClickResetTimer) clearTimeout(lockBlankClickResetTimer);
  if (lockNetworkWarningShakeTimer) clearTimeout(lockNetworkWarningShakeTimer);
  if (refreshWindowCooldownTimer) clearTimeout(refreshWindowCooldownTimer);
  if (sensitiveSendExpiryTimer) clearTimeout(sensitiveSendExpiryTimer);
  if (signalWorkspaceSyncTimer) clearTimeout(signalWorkspaceSyncTimer);
  composerInstallIntervals.forEach((timer) => clearInterval(timer));
  composerInstallIntervals.clear();
  composerEventPollIntervals.forEach((timer) => clearTimeout(timer));
  composerEventPollIntervals.clear();
  webComposerProbeIntervals.forEach((timer) => clearInterval(timer));
  webComposerProbeIntervals.clear();
  composerSentStatusTimers.forEach((timer) => clearTimeout(timer));
  composerSentStatusTimers.clear();
  enterOnlyHintTimers.forEach((timer) => clearTimeout(timer));
  enterOnlyHintTimers.clear();
  profileTranslationRefreshTimers.forEach((timer) => clearTimeout(timer));
  profileTranslationRefreshTimers.clear();
  smartReplyUiRefreshTimers.forEach((timer) => clearTimeout(timer));
  smartReplyUiRefreshTimers.clear();
  unreadPollIntervals.forEach((timers) => {
    clearTimeout(timers.initialTimer);
    if (timers.intervalTimer) clearInterval(timers.intervalTimer);
  });
  unreadPollIntervals.clear();
  unreadCounts.value = {};
  void window.chatTranslator?.setTaskbarUnreadCount?.(0).catch(() => undefined);
  if (translationQueueTimer) clearTimeout(translationQueueTimer);
  translationQueueTimer = null;
  for (const task of [...translationQueue, ...translationQueueRetryTasks.values(), ...runningTranslationTasks.values()]) {
    cancelTranslationTask(task);
  }
  webRuntimeControllers.forEach((controller) => controller.abort());
  webRuntimeControllers.clear();
  translationQueueRetryTimers.forEach((timer) => clearTimeout(timer));
  translationQueueRetryTimers.clear();
  translationQueueRetryTasks.clear();
  translationQueue.length = 0;
  queuedTranslationKeys.clear();
  runningTranslationKeys.clear();
  runningTranslationTasks.clear();
  runningTranslationProfiles.clear();
  unreadPeekTranslationPromises.clear();
  translationCacheWarmupFailedAt.clear();
  scopedTranslationCacheWarmupFailedAt.clear();
  historyBackfillLastQueuedAt.clear();
  runningTranslationCount = 0;
  translationIntervals.forEach((timer) => clearInterval(timer));
  translationIntervals.clear();
  signalWorkspaceResizeObserver?.disconnect();
  removeTranslationLayoutWatchers?.();removeTranslationLayoutWatchers=null;
  removeSignalActivateProfileListener?.();
  removeSignalNotificationActivationListener?.();
  removeSignalRestoreProfileListener?.();
  removeSignalWorkspaceSyncListener?.();
  removeRemoteGuardStatusListener?.();
  window.removeEventListener('resize', scheduleSignalWorkspaceSync);
  void hideInactiveSignalProfiles(null);
});
</script>

<template>
  <DevelopmentDiagnostics :assistant-open="assistantOpen" />
  <main v-if="!signedIn" class="page login-page" :class="themeClass">
    <div class="window-ctrl vertical" @pointerdown.stop @mousedown.stop>
      <button type="button" aria-label="minimize" data-window-control="minimize">-</button>
      <button type="button" aria-label="maximize" data-window-control="toggle-maximize">□</button>
      <button type="button" aria-label="close" data-window-control="close">×</button>
    </div>

    <section class="login-brand">
      <div class="brand-mark large"></div>
      <div class="brand-kicker">PIKACHU TRANSLATOR</div>
      <h1>皮卡丘翻译器</h1>
      <p>多账号聊天翻译 / 企业素材管控 / 客户资产保护</p>
    </section>

    <section class="login-workbench">
      <div v-if="clientAuthorizationStatus?.developmentMode" class="login-card trial-entry-card">
        <h2>开发者版本</h2>
        <p>本机设备身份已建立</p>
        <button class="login trial-entry-button" type="button" :disabled="clientAuthorizationLoading" @click="login">
          {{ clientAuthorizationLoading ? '初始化中' : '进入开发环境' }}
        </button>
        <p v-if="clientAuthorizationMessage" class="client-license-message error">{{ clientAuthorizationMessage }}</p>
      </div>

      <div v-else class="login-card client-license-card">
        <h2>客户端授权</h2>
        <p>皮卡丘翻译器 v{{ clientVersion }}</p>

        <div v-if="clientAuthorizationLoading" class="client-license-loading">正在建立本机设备身份...</div>
        <template v-else>
          <label class="client-license-field">
            <span>本机码</span>
            <textarea :value="clientAuthorizationStatus?.machineCode" rows="2" readonly></textarea>
          </label>

          <label class="client-license-field">
            <span>用户名</span>
            <input
              v-model="clientUsernameDraft"
              :disabled="clientAuthorizationStatus?.usernameLocked || clientAuthorizationBusy"
              maxlength="64"
              placeholder="用户名仅支持设置一次"
            />
          </label>
          <p v-if="!clientAuthorizationStatus?.usernameLocked" class="client-license-note">
            用户名仅支持设置一次，设置后无法更改。
          </p>
          <button
            v-if="!clientAuthorizationStatus?.usernameLocked"
            class="client-license-secondary"
            type="button"
            :disabled="clientAuthorizationBusy || !clientUsernameDraft.trim()"
            @click="confirmClientUsername"
          >
            确认用户名
          </button>

          <button class="client-license-secondary" type="button" :disabled="clientAuthorizationBusy" @click="copyClientMachineInfo">
            复制本机码和用户名
          </button>

          <label class="client-license-field">
            <span>授权码</span>
            <textarea v-model="clientLicenseCodeDraft" rows="4" :disabled="clientAuthorizationBusy" placeholder="请输入授权码"></textarea>
          </label>

          <button
            class="login client-license-activate"
            type="button"
            :disabled="clientAuthorizationBusy || !clientAuthorizationStatus?.usernameLocked || !clientLicenseCodeDraft.trim()"
            @click="activateClientLicense"
          >
            {{ clientAuthorizationBusy ? '校验中' : '授权并进入' }}
          </button>

          <p
            v-if="clientAuthorizationMessage || clientAuthorizationStatus?.reason"
            class="client-license-message"
            :class="{ error: clientAuthorizationStatus?.state === 'invalid' || clientAuthorizationStatus?.state === 'expired' || clientAuthorizationStatus?.state === 'device-error' }"
          >
            {{ clientAuthorizationMessage || clientAuthorizationStatus?.reason }}
          </p>
        </template>
      </div>
    </section>
  </main>

  <main v-show="signedIn && activePanel !== 'session'" class="page app-page" :class="themeClass">
    <div class="window-ctrl vertical" @pointerdown.stop @mousedown.stop>
      <button type="button" data-window-control="minimize">-</button>
      <button type="button" data-window-control="toggle-maximize">□</button>
      <button type="button" data-window-control="close">×</button>
    </div>

    <aside class="app-sidebar">
      <div class="brand-mark"></div>
      <h2>皮卡丘翻译器</h2>
      <span>V{{ clientVersion }}</span>

      <nav class="side-nav">
        <button :class="{ active: activePanel === 'apps' }" type="button" @click="activePanel = 'apps'"><b>01</b>应用中心</button>
        <button :class="{ active: activePanel === 'home' }" type="button" @click="activePanel = 'home'"><b>02</b>我的主页</button>
        <button :class="{ active: activePanel === 'notice' }" type="button" @click="activePanel = 'notice'"><b>03</b>管理通知</button>
        <button :class="{ active: activePanel === 'agency' }" type="button" @click="activePanel = 'agency'"><b>04</b>代理加盟</button>
      </nav>

      <div class="sidebar-status">
        <span>防账户克隆已启用</span>
        <i class="asset-shield" aria-hidden="true"></i>
      </div>
    </aside>

    <section class="app-main">
      <header class="top-actions">
        <div class="memory-meter" :class="memoryLevelClass" :style="{ '--memory-used': `${memoryUsedPercent}%` }">
          <span class="memory-meter-label">内存</span>
          <span class="memory-meter-track"><i></i></span>
          <strong>{{ memoryUsedText }}</strong>
          <em>{{ memoryFreeText }}</em>
        </div>
        <button :class="{ active: activePanel === 'settings' }" type="button" @click="activePanel = 'settings'">设置</button>
        <button :class="{ active: activePanel === 'account' }" type="button" @click="activePanel = 'account'">个人中心</button>
      </header>

      <section v-if="activePanel === 'apps'" class="content-panel app-center">
        <div class="section-title">
          <span>APPLICATION CENTER</span>
          <h1>应用中心</h1>
        </div>

        <div class="app-card-row">
          <button v-for="tile in appTiles" :key="tile.app" class="launch-card" type="button" :disabled="isCreatingProfile" @click="selectRuntimeApp(tile.app)">
            <span class="app-logo"><img :src="tile.icon" :alt="tile.label" /></span>
            <strong>{{ tile.label }}</strong>
          </button>
        </div>
      </section>

      <section v-else class="content-panel settings-page compact">
        <div class="section-title">
          <span>{{ panelTitle.en }}</span>
          <h1>{{ panelTitle.zh }}</h1>
        </div>

        <div v-if="activePanel === 'home'" class="home-dashboard">
          <article class="home-status-card">
            <span>当前用户</span>
            <strong>{{ homeUsername }}</strong>
          </article>
          <article class="home-status-card">
            <span>剩余授权</span>
            <strong>{{ remainingAuthorizationText }}</strong>
          </article>
          <article class="home-status-card">
            <span>翻译字符</span>
            <strong>不限</strong>
          </article>
          <article class="home-status-card">
            <span>授权有效期至</span>
            <strong>{{ authorizationExpiryText }}</strong>
          </article>
          <article class="home-status-card security-enabled-card">
            <span>防远程控制</span>
            <strong>已启用</strong>
          </article>
          <article class="home-status-card security-enabled-card">
            <span>防聊天偷窥</span>
            <strong>已启用</strong>
          </article>
          <article class="home-status-card security-enabled-card">
            <span>防聊天内容篡改</span>
            <strong>已启用</strong>
          </article>
        </div>

        <div v-else-if="activePanel === 'settings'" class="setting-card">
          <label><span>本软件语言</span><select><option>系统语言</option><option>简体中文</option></select></label>
          <label><span>客户端显示</span><select><option>任务栏和系统托盘显示</option></select></label>
          <label><span>应用窗口标签排版</span><select><option>顶部横排</option><option>左侧竖排</option></select></label>
          <label><span>窗口模式</span><select><option>嵌入</option><option>独立</option></select></label>
        </div>
        <div v-else-if="activePanel === 'account'" class="setting-card account-center-card">
          <button class="account-reauthorize-button" type="button" @click="openReauthorizationDialog">重新授权</button>
          <p v-if="accountMessage" class="account-action-message">{{ accountMessage }}</p>
          <div class="storage-location-card">
            <span>数据存储位置</span>
            <code>{{ storageLocation?.dataPath || '读取中...' }}</code>
            <div class="storage-location-actions">
              <button type="button" :disabled="storageLocationBusy" @click="openStorageLocation">打开目录</button>
              <button
                type="button"
                :disabled="storageLocationBusy || storageLocation?.changeAllowed === false"
                @click="changeStorageLocation"
              >
                {{ storageLocationBusy ? '准备迁移中' : '更改数据目录' }}
              </button>
            </div>
            <p
              v-if="storageLocationMessage"
              class="storage-location-message"
              :class="{ error: storageLocationMessageIsError }"
            >
              {{ storageLocationMessage }}
            </p>
          </div>
        </div>
      </section>
    </section>

    <aside class="quick-rail">
      <button type="button">通知</button>
      <button type="button">充值</button>
      <button type="button">官网</button>
      <button type="button">公告</button>
    </aside>
  </main>

  <main
    v-show="signedIn && activePanel === 'session'"
    class="page workspace-page"
    :class="[themeClass, { 'workspace-header-collapsed': workspaceHeaderCollapsed, 'assistant-library-enabled': !lockScreenVisible, 'assistant-library-open': assistantOpen }]"
  >
    <header v-show="!workspaceHeaderCollapsed" class="runtime-header">
      <div class="runtime-brand">
        <div class="brand-mark small"></div>
        <strong>皮卡丘翻译器</strong>
        <span>皮卡丘翻译器 V{{ clientVersion }}</span>
      </div>
      <nav>
        <button
          type="button"
          class="eye-care-translation-button"
          :class="{ active: eyeCareTranslationEnabled }"
          :aria-pressed="eyeCareTranslationEnabled"
          aria-label="译文护眼模式"
          title="译文护眼模式"
          @click="openEyeCareTranslationDialog"
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M26.7 4.8C17.9 5.1 9.9 8.8 6.7 15.4c-2 4.2-.9 8.5 2.8 10.7 3.8 2.3 8.4.9 10.7-2.1 4-5.1 4.3-11.8 6.5-19.2Z"></path>
            <path d="M5.3 27.1c4.7-7.2 9.2-11.4 16.2-15.2"></path>
          </svg>
        </button>
        <div class="memory-status-stack">
          <div class="memory-meter" :class="memoryLevelClass" :style="{ '--memory-used': `${memoryUsedPercent}%` }">
            <span class="memory-meter-label">内存</span>
            <span class="memory-meter-track"><i></i></span>
            <strong>{{ memoryUsedText }}</strong>
            <em>{{ memoryFreeText }}</em>
          </div>
          <div class="composer-feedback-status" :class="{ visible: activeComposerFeedbackText }">{{ activeComposerFeedbackText }}</div>
        </div>
        <button type="button" :disabled="refreshingWindow" @click="refreshActiveWindow">刷新窗口</button>
        <div class="theme-picker">
          <button type="button" @click="toggleThemeMenu">更换主题</button>
          <div v-if="themeMenuOpen" class="theme-menu">
            <button :class="{ active: activeTheme === 'pink' }" type="button" @click="setTheme('pink')">玫瑰粉</button>
            <button :class="{ active: activeTheme === 'blackGold' }" type="button" @click="setTheme('blackGold')">高端金</button>
            <button :class="{ active: activeTheme === 'murongPurple' }" type="button" @click="setTheme('murongPurple')">慕容紫</button>
            <button :class="{ active: activeTheme === 'clearWaterBlue' }" type="button" @click="setTheme('clearWaterBlue')">晴水蓝</button>
          </div>
        </div>
      </nav>
    </header>

    <aside class="runtime-side">
      <button type="button" class="runtime-home" @click="activePanel = 'apps'"><span class="soft-home-icon"></span><span class="runtime-home-label">主页</span></button>
      <div class="runtime-lock-entry">
        <button type="button" class="runtime-lock-button" @click="handleLockButtonClick">
          <span class="runtime-lock-key" aria-hidden="true"></span>
          锁屏
        </button>
        <aside v-if="lockGuideVisible && !lockScreenStatus?.enabled" class="runtime-lock-guide" @click.stop>
          <button class="runtime-lock-guide-close" type="button" aria-label="关闭锁屏设置引导" @click="dismissLockGuide">×</button>
          <strong>请先设置锁屏保护</strong>
          <p>点击“锁屏”设置密码，保护工作区内的聊天内容。</p>
          <button class="runtime-lock-guide-action" type="button" @click="handleLockButtonClick">立即设置</button>
        </aside>
      </div>
      <button
        type="button"
        class="runtime-guard-button"
        :class="`state-${remoteGuardVisualState}`"
        :title="`十万伏特：${remoteGuardStateLabel}`"
        @click="openRemoteGuardPanel"
      >
        <span class="runtime-guard-icon" aria-hidden="true"><span class="runtime-guard-lightning">⚡️</span><i></i></span>
        <strong>十万伏特</strong>
        <small>{{ remoteGuardStateLabel }}</small>
      </button>
      <button
        type="button"
        class="runtime-header-toggle"
        :aria-label="workspaceHeaderCollapsed ? '展开工作区顶部控制栏' : '折叠工作区顶部控制栏'"
        :aria-expanded="!workspaceHeaderCollapsed"
        :title="workspaceHeaderCollapsed ? '展开工作区顶部控制栏' : '折叠工作区顶部控制栏'"
        @click="toggleWorkspaceHeader"
      >
        <span class="runtime-header-toggle-icon" aria-hidden="true">
          <span class="runtime-header-toggle-glyph" :class="{ spinning: pokeballBursting }" @animationend="handlePokeballAnimationEnd">
            <img :src="pokeballIcon" alt="" />
          </span>
        </span>
        {{ workspaceHeaderCollapsed ? '折叠' : '展开' }}
      </button>
      <button type="button" class="app-short wa" :class="{ active: currentApp === 'whatsapp', unread: unreadCountForApp('whatsapp') > 0 }" @click="selectRuntimeApp('whatsapp')">
        <img :src="multiWhatsappIcon" alt="WhatsApp" />
        <span v-if="unreadCountForApp('whatsapp') > 0" class="app-unread-dot" aria-hidden="true"></span>
      </button>
      <button type="button" class="app-short tg" :class="{ active: currentApp === 'telegram', unread: unreadCountForApp('telegram') > 0 }" @click="selectRuntimeApp('telegram')">
        <img :src="multiTelegramIcon" alt="Telegram" />
        <span v-if="unreadCountForApp('telegram') > 0" class="app-unread-dot" aria-hidden="true"></span>
      </button>
      <button type="button" class="app-short sg" :class="{ active: currentApp === 'signal', unread: unreadCountForApp('signal') > 0 }" @click="selectRuntimeApp('signal')">
        <img :src="multiSignalIcon" alt="Signal" />
        <span v-if="unreadCountForApp('signal') > 0" class="app-unread-dot" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="runtime-customize-button"
        aria-label="自定义中译英"
        title="自定义中译英"
        @click="openTranslationCustomization"
      >
        <span class="runtime-customize-icon" aria-hidden="true"></span>
      </button>
    </aside>

    <div class="window-ctrl vertical" @pointerdown.stop @mousedown.stop>
      <button type="button" data-window-control="minimize">-</button>
      <button type="button" data-window-control="toggle-maximize">□</button>
      <button type="button" data-window-control="close">×</button>
    </div>

    <section class="multi-open-tabs">
      <div class="multi-open-list">
        <template v-for="(tab, index) in workspaceTabs" :key="tab.id">
          <span v-if="index > 0" class="multi-open-separator">|</span>
          <button
            class="runtime-tab"
            :class="{
              active: activeProfileId === tab.id,
              dragging: draggingProfileId === tab.id,
              'drop-before': tabDropTargetId === tab.id && !tabDropAfter,
              'drop-after': tabDropTargetId === tab.id && tabDropAfter
            }"
            :title="`${tab.name} · ${tab.group}`"
            type="button"
            draggable="true"
            @click="handleRuntimeTabClick(tab.id)"
            @dragstart="handleTabDragStart($event, tab.id)"
            @dragover.prevent="handleTabDragOver($event, tab.id)"
            @drop.prevent="handleTabDrop($event, tab.id)"
            @dragend="handleTabDragEnd"
          >
            <span v-if="unreadCountForProfile(tab.id) > 0" class="tab-unread-badge">{{ formatUnreadCount(unreadCountForProfile(tab.id)) }}</span>
            <span class="tab-icon"><img :src="tab.icon" :alt="tab.short" /></span>
            <b>{{ tab.name }}</b>
            <em aria-label="rename" title="修改名称和分组" @click.stop="requestRenameProfile(tab)">✎</em>
            <i aria-label="close" @click.stop="requestCloseProfile(tab)">×</i>
          </button>
        </template>
        <button class="add-tab" type="button" :disabled="isCreatingProfile" @click="openCreateProfileDialog">+</button>
      </div>
      <div v-if="activeSensitiveSendPending" class="sensitive-send-trusted" role="status">
        <strong>发送前可信确认</strong>
        <span>{{ activeSensitiveSendPending.profileName }} · {{ activeSensitiveSendPending.contactDisplay }}</span>
        <code>{{ activeSensitiveSendPending.text }}</code>
        <em>
          {{ activeSensitiveSendPending.network ? `${activeSensitiveSendPending.network} · 地址格式校验通过 · ` : '数字账号 · ' }}
          120 秒内再次回车后发送
        </em>
      </div>
      <div v-if="showDeveloperDiagnostics && currentApp === 'signal'" class="signal-status-strip">
        <span>{{ activeComposerStatus || 'Signal 翻译状态：等待输入或消息' }}</span>
        <strong>{{ activeSignalDiagnosticStatus || 'Signal 诊断：等待探针结果' }}</strong>
      </div>
      <div v-if="showDeveloperDiagnostics && currentApp !== 'signal'" class="signal-status-strip">
        <span>{{ activeComposerStatus || '输入翻译状态：等待输入' }}</span>
        <strong>{{ activeWebComposerDiagnosticStatus || 'Web 输入探针：等待结果' }}</strong>
      </div>
    </section>

    <section class="runtime-web-main" :class="{ 'signal-workspace-main': Boolean(activeSignalProfile) }">
      <webview
        v-for="item in renderableProfiles"
        ref="webviewRef"
        :key="item.profile.id"
        class="platform-webview"
        :class="{ active: activeProfileId === item.profile.id && !hasBlockingModal }"
        :data-profile-id="item.profile.id"
        :src="item.url"
        :partition="item.profile.partition"
        :useragent="item.profile.fingerprint.userAgent"
        @dom-ready="(event: Event) => handleWebviewDomReady(event, item.profile)"
        @render-process-gone="(event: Event) => handleWebviewRuntimeFailure(event, item.profile)"
        @did-fail-load="(event: Event) => handleWebviewRuntimeFailure(event, item.profile)"
        @ipc-message="(event: Event) => handleWebviewIpcMessage(event, item.profile)"
      />

      <div v-if="!hasActiveRenderableProfile" class="session-empty">
        <template v-if="activeSignalProfile">
          <p>{{ activeSignalProfile.name }} 使用独立 Signal 窗口运行</p>
          <span>{{ activeComposerStatus || '点击下方按钮可重新唤起当前 Signal 多开。' }}</span>
          <button class="signal-open-button" type="button" @click="launchActiveSignalProfile">打开 Signal</button>
        </template>
        <template v-else>
          <p>{{ currentAppTile.label }} 未打开多开环境</p>
          <span>点击顶部 +，填写自定义名称后创建当前应用的多开。</span>
          <button type="button" @click="openCreateProfileDialog">新建多开</button>
        </template>
      </div>
    </section>

    <div v-if="createDialogOpen" class="modal-mask" @click.self="closeCreateProfileDialog">
      <section class="modal-card">
        <h3>新建 {{ currentAppTile.label }} 多开</h3>
        <label>
          <span>自定义名称</span>
          <input v-model="newProfileName" autofocus placeholder="例如 WS01" />
        </label>
        <label>
          <span class="group-field-head">
            <span>自定义分组</span>
            <button type="button" class="group-quick-option" @click="newProfileGroup = '本组'">本组</button>
          </span>
          <input v-model="newProfileGroup" placeholder="请输入分组" @keyup.enter="confirmCreateProfile" />
        </label>
        <p v-if="createProfileError" class="modal-error">{{ createProfileError }}</p>
        <div class="modal-actions">
          <button type="button" @click="closeCreateProfileDialog">取消</button>
          <button type="button" :disabled="isCreatingProfile || !newProfileGroup.trim()" @click.stop="confirmCreateProfile">
            {{ isCreatingProfile ? '创建中' : '确定' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="closeTargetProfile" class="modal-mask" @click.self="cancelCloseProfileDialog">
      <section class="modal-card">
        <h3>关闭多开</h3>
        <p>是否关闭“{{ closeTargetProfile.name }}”的窗口？</p>
        <div class="modal-actions">
          <button type="button" @click="cancelCloseProfileDialog">否</button>
          <button type="button" @click="confirmCloseProfile">是</button>
        </div>
      </section>
    </div>

    <div v-if="renameTargetProfile" class="modal-mask" @click.self="cancelRenameProfileDialog">
      <section class="modal-card">
        <h3>修改多开</h3>
        <label>
          <span>自定义名称</span>
          <input v-model="renameProfileName" autofocus placeholder="例如 WS01" />
        </label>
        <label>
          <span class="group-field-head">
            <span>自定义分组</span>
            <button type="button" class="group-quick-option" @click="renameProfileGroup = '本组'">本组</button>
          </span>
          <input v-model="renameProfileGroup" placeholder="请输入分组" @keyup.enter="confirmRenameProfile" />
        </label>
        <p v-if="renameProfileError" class="modal-error">{{ renameProfileError }}</p>
        <div class="modal-actions">
          <button type="button" @click="cancelRenameProfileDialog">取消</button>
          <button type="button" :disabled="isRenamingProfile || !renameProfileGroup.trim()" @click.stop="confirmRenameProfile">
            {{ isRenamingProfile ? '保存中' : '确定' }}
          </button>
        </div>
      </section>
    </div>
  </main>

  <AssistantLibraryPanel v-if="signedIn && activePanel === 'session' && !lockScreenVisible && !hasBlockingModal"
    v-model:open="assistantOpen" :workspace="activePanel === 'session'" :collapsed="workspaceHeaderCollapsed" :class="themeClass"
    :used-ids="assistantUsedIds" @copy="copyAssistantMaterial" :export-busy="conversationExportBusy" :export-status="conversationExportStatus"
    @export="exportCurrentConversation" @cancel-export="cancelConversationExport" />

  <div
    v-if="activeSensitiveDialog"
    class="modal-mask sensitive-dialog-mask"
    :class="themeClass"
    @click.self="respondSensitiveDialog(activeSensitiveDialog.cancelId)"
    @keydown.esc.stop.prevent="respondSensitiveDialog(activeSensitiveDialog.cancelId)"
    @keydown.enter.stop
    @keydown.tab="trapSensitiveDialogTab"
  >
    <section class="modal-card sensitive-dialog-card" role="dialog" aria-modal="true" aria-labelledby="sensitive-dialog-title" aria-describedby="sensitive-dialog-message sensitive-dialog-detail">
      <h3 id="sensitive-dialog-title">{{ activeSensitiveDialog.title }}</h3>
      <p id="sensitive-dialog-message">{{ activeSensitiveDialog.message }}</p>
      <p v-if="activeSensitiveDialog.detail" id="sensitive-dialog-detail" class="sensitive-dialog-detail">{{ activeSensitiveDialog.detail }}</p>
      <div class="modal-actions">
        <button
          v-for="(label, index) in activeSensitiveDialog.buttons"
          :key="index"
          type="button"
          :class="{ 'sensitive-dialog-cancel': index === activeSensitiveDialog.cancelId }"
          :disabled="sensitiveDialogBusy"
          @click="respondSensitiveDialog(index)"
        >{{ label }}</button>
      </div>
    </section>
  </div>

  <div
    v-if="eyeCareTranslationDialogOpen"
    class="modal-mask eye-care-translation-mask"
    :class="themeClass"
    @click.self="closeEyeCareTranslationDialog"
  >
    <section class="modal-card eye-care-translation-card">
      <button
        type="button"
        class="eye-care-translation-close"
        aria-label="关闭译文护眼模式弹窗"
        title="关闭"
        @click="closeEyeCareTranslationDialog"
      >×</button>
      <header class="eye-care-translation-heading">
        <span class="eye-care-translation-leaf" :class="{ active: eyeCareTranslationEnabled }" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="M26.7 4.8C17.9 5.1 9.9 8.8 6.7 15.4c-2 4.2-.9 8.5 2.8 10.7 3.8 2.3 8.4.9 10.7-2.1 4-5.1 4.3-11.8 6.5-19.2Z"></path>
            <path d="M5.3 27.1c4.7-7.2 9.2-11.4 16.2-15.2"></path>
          </svg>
        </span>
        <h3>译文护眼模式</h3>
      </header>
      <p>如果你在whatsapp、telegram、signal的设置里开启了夜间主题（深色），请在下方按钮点击打开护眼模式，译文将切换为对应的颜色。如果你切换回<br>了日间主题（浅色），请在下方按钮点击关闭护眼模式。</p>
      <p
        v-if="eyeCareTranslationMessage"
        class="eye-care-translation-message"
        :class="{ error: eyeCareTranslationMessageIsError }"
      >{{ eyeCareTranslationMessage }}</p>
      <div class="modal-actions eye-care-translation-actions">
        <button
          type="button"
          :disabled="eyeCareTranslationApplying"
          @click="setEyeCareTranslationMode(true)"
        >打开护眼模式</button>
        <button
          type="button"
          :disabled="eyeCareTranslationApplying"
          @click="setEyeCareTranslationMode(false)"
        >关闭护眼模式</button>
      </div>
    </section>
  </div>

  <div
    v-if="reauthorizationDialogOpen"
    class="modal-mask reauthorization-mask"
    :class="themeClass"
    @click.self="closeReauthorizationDialog"
  >
    <section class="modal-card reauthorization-card">
      <h3>重新授权</h3>
      <label class="client-license-field">
        <span>本机码</span>
        <textarea :value="clientAuthorizationStatus?.machineCode" rows="3" readonly></textarea>
      </label>
      <label class="client-license-field">
        <span>用户名</span>
        <input :value="clientAuthorizationStatus?.username" readonly />
      </label>
      <label class="client-license-field">
        <span>授权码</span>
        <textarea
          v-model="reauthorizationLicenseCodeDraft"
          rows="5"
          :disabled="reauthorizationBusy || reauthorizationSucceeded"
          placeholder="请输入新的授权码"
        ></textarea>
      </label>
      <p
        v-if="reauthorizationMessage"
        class="client-license-message"
        :class="{ error: reauthorizationMessageIsError }"
      >
        {{ reauthorizationMessage }}
      </p>
      <div class="modal-actions reauthorization-actions">
        <button type="button" :disabled="reauthorizationBusy || reauthorizationSucceeded" @click="copyReauthorizationMachineInfo">复制</button>
        <button type="button" :disabled="reauthorizationBusy" @click="closeReauthorizationDialog">
          {{ reauthorizationSucceeded ? '关闭' : '取消' }}
        </button>
        <button
          type="button"
          :disabled="reauthorizationBusy || reauthorizationSucceeded || !reauthorizationLicenseCodeDraft.trim()"
          @click="confirmReauthorization"
        >
          {{ reauthorizationBusy ? '更新中' : '确认' }}
        </button>
      </div>
    </section>
  </div>

  <div
    v-if="remoteGuardPanelVisible"
    class="modal-mask remote-guard-panel-mask"
    :class="themeClass"
    @click.self="closeRemoteGuardPanel"
  >
    <section class="modal-card remote-guard-panel-card">
      <div class="remote-guard-panel-heading">
        <span class="runtime-guard-icon" :class="`state-${remoteGuardVisualState}`" aria-hidden="true"><span class="runtime-guard-lightning">⚡️</span><i></i></span>
        <div>
          <small>WINDOWS REMOTE GUARD</small>
          <h3>十万伏特</h3>
        </div>
      </div>
      <div class="remote-guard-summary" :class="`state-${remoteGuardVisualState}`">
        <strong>{{ remoteGuardStateLabel }}</strong>
        <span>每 {{ (remoteGuardStatus?.scanIntervalMs || 8000) / 1000 }} 秒巡查一次潜在远程连接</span>
      </div>
      <dl class="remote-guard-facts">
        <div><dt>最近巡检</dt><dd>{{ remoteGuardLastCheckedText }}</dd></div>
        <div><dt>本次用时</dt><dd>{{ remoteGuardStatus?.scanDurationMs || 0 }} ms</dd></div>
        <div><dt>Windows 会话</dt><dd>{{ remoteGuardStatus?.coverage.windowsSessions ? '正常' : '不可用' }}</dd></div>
        <div><dt>远控进程</dt><dd>{{ remoteGuardStatus?.coverage.processes ? '未发现' : '不可用' }}</dd></div>
      </dl>
      <ul v-if="remoteGuardStatus?.findings.length" class="remote-guard-findings">
        <li v-for="finding in remoteGuardStatus.findings" :key="finding.code" :class="finding.severity">
          <strong>{{ finding.severity === 'confirmed' ? '已确认' : '需留意' }}</strong>
          <span>{{ finding.label }}</span>
        </li>
      </ul>
      <p v-else class="remote-guard-empty">本轮没有发现已知远控迹象。</p>
      <p v-if="remoteGuardStatus?.reason || remoteGuardMessage" class="remote-guard-reason">
        {{ remoteGuardMessage || remoteGuardStatus?.reason }}
      </p>
      <p class="remote-guard-boundary">未知恶意程序可以伪装或使用其他通信方式；十万伏特不能替代 Windows Defender 和防火墙。</p>
      <div class="modal-actions">
        <button type="button" :disabled="remoteGuardScanning" @click="closeRemoteGuardPanel">关闭</button>
        <button type="button" :disabled="remoteGuardScanning" @click="scanRemoteGuardNow">
          {{ remoteGuardScanning ? '巡查中' : '电击治疗' }}
        </button>
      </div>
    </section>
  </div>

  <div
    v-if="translationCustomizationOpen"
    class="modal-mask translation-customization-mask"
    :class="themeClass"
    @click.self="closeTranslationCustomization"
  >
    <section class="modal-card translation-customization-card">
      <header class="translation-customization-heading">
        <span class="runtime-customize-icon" aria-hidden="true"></span>
        <div>
          <h3>自定义中译英</h3>
          <p>保存后，后续中译英将使用当前自定义内容；未修改时保持原默认提示词。</p>
        </div>
      </header>
      <label class="translation-customization-editable">
        <span>可自定义部分</span>
        <textarea
          v-model="translationCustomizationDraft"
          rows="7"
          :disabled="translationCustomizationBusy"
          maxlength="8000"
          spellcheck="false"
        ></textarea>
      </label>
      <section class="translation-customization-fixed" aria-label="不可修改的固定规则">
        <div>
          <strong>固定规则</strong>
          <small>为保障格式、问号、原文内容和安全占位符完整性，此部分仅展示、不可修改。</small>
        </div>
        <pre>{{ fixedChineseToEnglishPrompt }}</pre>
      </section>
      <p
        v-if="translationCustomizationMessage"
        class="translation-customization-message"
        :class="{ error: translationCustomizationMessageIsError }"
      >{{ translationCustomizationMessage }}</p>
      <div class="modal-actions translation-customization-actions">
        <button type="button" :disabled="translationCustomizationBusy" @click="resetTranslationCustomization">恢复默认</button>
        <button type="button" :disabled="translationCustomizationBusy" @click="closeTranslationCustomization">关闭</button>
        <button
          type="button"
          :disabled="translationCustomizationBusy || !translationCustomizationDraft.trim() || !translationCustomizationDirty"
          @click="saveTranslationCustomization"
        >{{ translationCustomizationBusy ? '处理中' : '保存' }}</button>
      </div>
    </section>
  </div>

  <div
    v-if="lockSetupDialogStage"
    class="modal-mask lock-setup-mask"
    :class="themeClass"
    @click.self="closeLockSetupDialog"
  >
    <section class="modal-card lock-setup-card">
      <template v-if="lockSetupDialogStage === 'confirm'">
        <div class="lock-setup-heading">
          <span class="runtime-lock-key" aria-hidden="true"></span>
          <h3>即将设置锁屏密码</h3>
        </div>
        <p>锁屏密码用于保护工作区内的聊天内容不被远程窥视，为保障安全，请先将电脑断网后再设置。</p>
        <p v-if="lockNetworkGateReason" class="lock-setup-context">{{ lockNetworkGateReason }}</p>
        <div class="modal-actions">
          <button type="button" :disabled="lockNetworkGateBusy" @click="closeLockSetupDialog">取消</button>
          <button type="button" :disabled="lockNetworkGateBusy" @click="confirmLockSetupStart">
            {{ lockNetworkGateBusy ? '检测中' : '确定' }}
          </button>
        </div>
      </template>
      <template v-else>
        <div class="lock-setup-heading">
          <span class="runtime-lock-key" aria-hidden="true"></span>
          <h3>{{ lockSetupIntent === 'setup' ? '设置锁屏密码' : lockSetupIntent === 'upgrade' ? '升级锁屏密码' : '重置锁屏密码' }}</h3>
        </div>
        <p class="lock-network-warning" :class="{ shake: lockNetworkWarningShaking }">
          请拔掉电脑的网线且关闭 WIFI 无线网络连接，完成后点击继续。
        </p>
        <small v-if="lockNetworkGateReason" class="lock-network-reason">{{ lockNetworkGateReason }}</small>
        <div class="modal-actions">
          <button type="button" :disabled="lockNetworkGateBusy" @click="closeLockSetupDialog">取消</button>
          <button type="button" :disabled="lockNetworkGateBusy" @click="continueLockNetworkGate">
            {{ lockNetworkGateBusy ? '检测中' : '继续' }}
          </button>
        </div>
      </template>
    </section>
  </div>

  <div
    v-if="lockScreenVisible"
    class="client-lock-screen"
    :class="themeClass"
    @keydown.capture.prevent.stop="handleLockScreenKeydown"
    @keyup.capture.prevent.stop
    @keypress.capture.prevent.stop
    @pointerdown.self.stop="handleLockBlankPointerDown"
    @click.stop
  >
    <section class="client-lock-card" @pointerdown.stop>
      <div class="lock-brand">
        <div class="brand-mark small"></div>
        <div>
          <span>皮卡丘翻译器</span>
          <h2>{{ lockScreenTitle }}</h2>
        </div>
      </div>
      <p>{{ lockScreenHint }}</p>
      <p v-if="lockIsSettingPin" class="lock-offline-notice">为保障您的安全，在密码设置过程中，请勿连接互联网。</p>
      <p v-if="lockRemainingText" class="lock-warning">已暂时锁定，剩余 {{ lockRemainingText }}</p>

      <div v-if="lockShowPinControls" class="pin-display">
        <span>{{ lockPinDots }}</span>
        <small>{{ lockIsSettingPin ? '输入新密码' : '输入密码解锁' }}</small>
      </div>
      <div v-if="lockShowPinControls && lockIsSettingPin" class="pin-display confirm">
        <span>{{ lockPinConfirmDots }}</span>
        <small>确认新密码</small>
      </div>

      <p v-if="lockShowPinControls" class="lock-input-instruction">{{ lockInputInstruction }}</p>

      <div v-if="lockShowPinControls" class="lock-keypad" aria-label="随机数字键盘">
        <button v-for="digit in lockKeypadDigits" :key="digit" type="button" @click="lockKeypadPress(digit)">{{ digit }}</button>
        <button type="button" @click="lockKeypadBackspace">退格</button>
        <button type="button" @click="resetLockKeypadInput">清空</button>
      </div>

      <p v-if="lockPinError" class="lock-error">{{ lockPinError }}</p>
      <button
        v-if="lockShowPinControls"
        class="lock-submit"
        type="button"
        :disabled="Boolean(lockRemainingText)"
        @click="lockIsSettingPin ? confirmLockPinSetup() : confirmLockPinUnlock()"
      >
        {{ lockIsSettingPin ? '保存锁屏密码' : '解锁' }}
      </button>
    </section>
  </div>

  <div
    v-if="remoteGuardStatus?.incidentLatched && !remoteGuardRecoveryPrompt"
    class="remote-guard-alarm-screen"
    :class="themeClass"
    @keydown.capture.prevent.stop
    @keyup.capture.prevent.stop
    @pointerdown.self.prevent.stop
    @click.stop
  >
    <section class="remote-guard-alarm-card">
      <div class="remote-guard-alarm-crest">⚡️</div>
      <span>WINDOWS SECURITY ALERT</span>
      <h1>{{ remoteGuardStatus.threatActive ? '发现远程连接' : '远控迹象已消失' }}</h1>
      <p v-if="remoteGuardStatus.threatActive">
        Signal、WhatsApp、Telegram 已被遮罩并锁定。
        <template v-if="remoteGuardLockCountdown">Windows 将在 {{ remoteGuardLockCountdown }} 秒后锁定。</template>
        <template v-else-if="remoteGuardStatus.windowsLockState === 'requested'">正在请求 Windows 锁屏。</template>
        <template v-else-if="remoteGuardStatus.windowsLockState === 'confirmed'">Windows 已进入锁定状态。</template>
      </p>
      <p v-else>聊天内容仍保持锁定。请确认远控来源已经断开，再进行本机安全验证。</p>
      <ul v-if="remoteGuardStatus.findings.length">
        <li v-for="finding in remoteGuardStatus.findings" :key="finding.code">{{ finding.label }}</li>
      </ul>
      <p v-if="remoteGuardStatus.reason || remoteGuardMessage" class="remote-guard-alarm-reason">
        {{ remoteGuardMessage || remoteGuardStatus.reason }}
      </p>
      <button v-if="!remoteGuardStatus.threatActive" type="button" @click="beginRemoteGuardRecovery">
        {{ lockScreenStatus?.enabled ? '验证锁屏密码并恢复' : '确认并恢复工作区' }}
      </button>
    </section>
  </div>
</template>

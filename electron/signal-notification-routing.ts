export const signalNotificationProtocol = 'maoyi-translator' as const;
export const signalNotificationProtocolHost = 'signal-notification' as const;
export const signalNotificationRouteTtlMs = 24 * 60 * 60 * 1000;
export const signalNotificationRouteMaximum = 64;

export type SignalNotificationRouteRecord = {
  schemaVersion: 1;
  activationId: string;
  appId: string;
  route: string;
  createdAt: number;
  expiresAt: number;
};

const activationIdPattern = /^[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const signalAppIdPattern = /^Signal-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>) {
  const keys = new Set(allowed);
  return Object.keys(value).every(key => keys.has(key));
}

function isActivationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    activationIdPattern.test(value) &&
    Buffer.from(value, 'base64url').length === 32
  );
}

export function validateSignalNotificationInternalRoute(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'sgnl:' ||
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.hash
    ) {
      return null;
    }
    if (url.hostname === 'show-window' || url.hostname === 'cancel-presenting') {
      return url.search === '' ? url.href : null;
    }
    if (url.hostname !== 'show-conversation' && url.hostname !== 'start-call-lobby') return null;
    const keys = [...url.searchParams.keys()];
    const token = url.searchParams.get('token');
    if (keys.length !== 1 || keys[0] !== 'token' || !token || !uuidPattern.test(token)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function validateSignalNotificationRegistration(
  value: unknown,
  authenticatedAppId: string,
  now = Date.now()
): SignalNotificationRouteRecord | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'activationId', 'route']) ||
    value.type !== 'notification.route.register' ||
    !signalAppIdPattern.test(authenticatedAppId) ||
    !isActivationId(value.activationId)
  ) {
    return null;
  }
  const route = validateSignalNotificationInternalRoute(value.route);
  if (!route || !Number.isSafeInteger(now) || now < 0) return null;
  return {
    schemaVersion: 1,
    activationId: value.activationId,
    appId: authenticatedAppId,
    route,
    createdAt: now,
    expiresAt: now + signalNotificationRouteTtlMs
  };
}

export function createSignalNotificationActivationUrl(activationId: string) {
  if (!isActivationId(activationId)) throw new Error('Signal notification activation ID is invalid.');
  return `${signalNotificationProtocol}://${signalNotificationProtocolHost}/v1/${activationId}`;
}

export function parseSignalNotificationActivationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== `${signalNotificationProtocol}:` ||
      url.hostname !== signalNotificationProtocolHost ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const match = /^\/v1\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
    return match && isActivationId(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

export function normalizeStoredSignalNotificationRoutes(
  value: unknown,
  now = Date.now()
): SignalNotificationRouteRecord[] {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.records)) return [];
  const accepted = new Map<string, SignalNotificationRouteRecord>();
  for (const candidate of value.records.slice(-signalNotificationRouteMaximum)) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, ['schemaVersion', 'activationId', 'appId', 'route', 'createdAt', 'expiresAt']) ||
      candidate.schemaVersion !== 1 ||
      !isActivationId(candidate.activationId) ||
      typeof candidate.appId !== 'string' ||
      !signalAppIdPattern.test(candidate.appId) ||
      !Number.isSafeInteger(candidate.createdAt) ||
      !Number.isSafeInteger(candidate.expiresAt) ||
      Number(candidate.createdAt) < 0 ||
      Number(candidate.expiresAt) <= now ||
      Number(candidate.expiresAt) - Number(candidate.createdAt) !== signalNotificationRouteTtlMs
    ) {
      continue;
    }
    const route = validateSignalNotificationInternalRoute(candidate.route);
    if (!route) continue;
    accepted.set(candidate.activationId, {
      schemaVersion: 1,
      activationId: candidate.activationId,
      appId: candidate.appId,
      route,
      createdAt: Number(candidate.createdAt),
      expiresAt: Number(candidate.expiresAt)
    });
  }
  return [...accepted.values()].sort((left, right) => left.createdAt - right.createdAt);
}

export function insertSignalNotificationRoute(
  records: ReadonlyArray<SignalNotificationRouteRecord>,
  record: SignalNotificationRouteRecord,
  now = Date.now()
) {
  const retained = records.filter(candidate =>
    candidate.expiresAt > now &&
    candidate.activationId !== record.activationId &&
    candidate.appId !== record.appId
  );
  retained.push(record);
  return retained.slice(-signalNotificationRouteMaximum);
}

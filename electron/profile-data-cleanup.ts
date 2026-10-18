import { createHash } from 'node:crypto';

export function profileLogIdentityHash(profileId: string) {
  return createHash('sha256').update(profileId).digest('hex').slice(0, 16);
}

function valueReferencesProfile(value: unknown, profileId: string, hashedProfileId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => valueReferencesProfile(item, profileId, hashedProfileId));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === 'string') {
      if (key === 'profileId' && (child === profileId || child === hashedProfileId)) return true;
      if (key === 'userId' && child === `df-${profileId}`) return true;
      if (key === 'appId' && (child === `signal:${profileId}` || child === `Signal-${profileId}`)) return true;
    }
    if (valueReferencesProfile(child, profileId, hashedProfileId)) return true;
  }
  return false;
}

export function filterProfileScopedJsonl(contents: string, profileId: string) {
  const hashedProfileId = profileLogIdentityHash(profileId);
  const kept: string[] = [];
  let removed = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (!line) continue;
    let belongsToProfile = false;
    try {
      belongsToProfile = valueReferencesProfile(JSON.parse(line), profileId, hashedProfileId);
    } catch {
      // A malformed record containing this randomly generated profile ID is
      // safer to remove than to retain as an uninspectable account record.
      belongsToProfile = line.includes(profileId) || line.includes(hashedProfileId);
    }
    if (belongsToProfile) removed += 1;
    else kept.push(line);
  }
  return { contents: kept.length ? `${kept.join('\n')}\n` : '', removed };
}

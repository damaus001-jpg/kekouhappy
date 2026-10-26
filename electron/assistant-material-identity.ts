import type { AssistantContact, AssistantUsage } from './assistant-material-types.js';

// These helpers are also serialized into platform pages; keep them self-contained.
export function normalizeAssistantPhone(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d\s().-]+$/.test(value.trim())) return '';
  let digits = value.replace(/\D/g, '');
  const international = value.trim().startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && digits.length === 10) digits = `1${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : '';
}

export function assistantUsageMatchesContact(usage: AssistantUsage, platform: string, contact: AssistantContact): boolean {
  if (usage.confirmation !== 'inserted' || usage.platform !== platform) return false;
  if (platform === 'opensms') return Boolean(contact.phone && usage.phone === contact.phone);
  return Boolean(contact.id && usage.contactId === contact.id);
}

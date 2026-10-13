import type { Platform } from './shared.js';
export type ConversationExportMode = 'english' | 'chinese';
export type ConversationExportRow = {
  id: string; direction: 'incoming'|'outgoing'|'unknown'; timestamp: string;
  originalText: string; chineseText: string; mediaLabel: string;
};
export type ConversationExportRequest = {
  profileId: string; platform: Platform; contactId: string; contactTitle: string;
  mode: ConversationExportMode; coverage: 'history-top'|'partial'; coverageNote: string;
  rows: ConversationExportRow[];
};
export type ConversationExportResult = { saved: boolean; count: number; missing: number; redacted: number };

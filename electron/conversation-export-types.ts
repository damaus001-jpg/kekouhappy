import type { Platform } from './shared.js';
export type ConversationExportMode = 'english' | 'chinese';
export type ConversationExportScope = 'today' | 'all';
export type ConversationExportSelection = { mode:ConversationExportMode; scope:ConversationExportScope };
export type ConversationExportRow = {
  id: string; direction: 'incoming'|'outgoing'|'unknown'; timestamp: string;
  originalText: string; chineseText: string; mediaLabel: string;
  dateOrder?: 'mdy'|'dmy';
};
export type ConversationExportRequest = {
  profileId: string; platform: Platform; contactId: string; contactTitle: string;
  mode: ConversationExportMode; coverage: 'history-top'|'partial'; coverageNote: string;
  scope?:ConversationExportScope; exportDate?:string;
  rows: ConversationExportRow[];
};
export type ConversationExportResult = { saved: boolean; count: number; missing: number; redacted: number };

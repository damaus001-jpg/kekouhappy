export type AssistantKind = 'persona' | 'schedule' | 'quotes';
export type AssistantMedia = { id: string; name: string; mime: string; caption: string };
export type AssistantEntry = {
  id: string; title: string; text: string; date: string; timeZone: string;
  status: 'planned' | 'completed' | 'cancelled'; tags: string[]; media: AssistantMedia[];
};
export type AssistantModule = {
  title: string; text: string; aiText: string; enabled: boolean;
  version: string; importedAt: string; entries: AssistantEntry[];
};
export type AssistantLibrary = { schemaVersion: 1; modules: Record<AssistantKind, AssistantModule> };
export const assistantKinds: AssistantKind[] = ['persona', 'schedule', 'quotes'];
export const assistantLabels = { persona: '人物资料', schedule: '一周行程', quotes: '案例金句' };
export function emptyAssistantLibrary(): AssistantLibrary {
  const make = (kind: AssistantKind): AssistantModule => ({ title: assistantLabels[kind], text: '', aiText: '', enabled: false, version: '1', importedAt: '', entries: [] });
  return { schemaVersion: 1, modules: { persona: make('persona'), schedule: make('schedule'), quotes: make('quotes') } };
}

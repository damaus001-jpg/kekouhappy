export type AssistantMaterial = {
  id: string; type: 'text' | 'image'; text?: string; mediaId?: string; name?: string;
};
export type AssistantCard = { id: string; title: string; date: string; materials: AssistantMaterial[] };
export type AssistantCatalog = { persona: AssistantCard[]; personaText?: string; schedule: AssistantCard[]; quotes: AssistantCard[] };
export type AssistantStagedMaterial = AssistantMaterial & {
  token: string; expiresAt: number; imageData?: string; imageHash?: string;
};
export type AssistantUsage = {
  profileId: string; platform: 'whatsapp' | 'telegram' | 'signal' | 'opensms'; contactId: string;
  contactTitle: string; materialId: string; usedAt: string; actualText?: string;
  confirmation?: 'inserted';
};
export type AssistantUseRequest = Omit<AssistantUsage, 'materialId' | 'usedAt'> & { token: string };

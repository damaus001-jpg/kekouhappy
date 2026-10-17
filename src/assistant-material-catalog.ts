import type { AssistantLibrary, AssistantEntry } from '../electron/assistant-library-types';
import type { AssistantCard, AssistantCatalog, AssistantMaterial } from '../electron/assistant-material-types';
export async function textMaterial(id: string, text: string): Promise<AssistantMaterial> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const version = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  return { id: `${id}:v:${version}`, type: 'text', text };
}
async function entryMaterials(entry: AssistantEntry, prefix: string) {
  return [...(entry.text.trim() ? [await textMaterial(`${prefix}:text`,entry.text)] : []),
    ...entry.media.filter(m=>m.mime.startsWith('image/')).map(m=>({id:`image:${m.id.split('.')[0]}`,type:'image' as const,mediaId:m.id,name:m.name}))];
}
export async function buildAssistantCatalog(library: AssistantLibrary): Promise<AssistantCatalog> {
  const cards = (kind:'schedule'|'quotes') => Promise.all(library.modules[kind].entries.map(async (e: AssistantEntry): Promise<AssistantCard> => ({
    id:e.id,title:e.title||'未命名卡片',date:kind==='schedule'?'':e.date,materials:await entryMaterials(e,`${kind}:${e.id}`)
  })));
  return { persona:[],personaText:library.modules.persona.text,schedule:await cards('schedule'),quotes:await cards('quotes') };
}

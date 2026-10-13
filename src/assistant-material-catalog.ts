import type { AssistantLibrary, AssistantEntry } from '../electron/assistant-library-types';
import type { AssistantCard, AssistantCatalog, AssistantMaterial } from '../electron/assistant-material-types';
import { personaMilestones } from './assistant-persona';
export const assistantWeekDays = ['星期一','星期二','星期三','星期四','星期五','星期六','星期天'];
export async function textMaterial(id: string, text: string): Promise<AssistantMaterial> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const version = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
  return { id: `${id}:v:${version}`, type: 'text', text };
}
async function entryMaterials(entry: AssistantEntry, prefix: string) {
  const texts = entry.text.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean);
  return [...await Promise.all(texts.map((text,i)=>textMaterial(`${prefix}:text:${i}`,text))),
    ...entry.media.filter(m=>m.mime.startsWith('image/')).map(m=>({id:`image:${m.id}`,type:'image' as const,mediaId:m.id,name:m.name}))];
}
export async function buildAssistantCatalog(library: AssistantLibrary): Promise<AssistantCatalog> {
  const persona = await Promise.all(personaMilestones.map(async (event,i): Promise<AssistantCard> => {
    const matches = library.modules.persona.entries.filter(e=>e.id===`persona-${i}` || e.title===event.title);
    return { id:`persona-${i}`,title:event.title,date:event.date,materials:[await textMaterial(`persona-${i}:text:0`,event.text),
      ...(await Promise.all(matches.map(e=>entryMaterials(e,`persona:${e.id}`)))).flat()] };
  }));
  const schedule = await Promise.all(assistantWeekDays.map(async (day,i):Promise<AssistantCard> => {
    const matches = library.modules.schedule.entries.filter(e=> e.id===`weekday-${i}` || e.title===day ||
      (e.date && ((new Date(`${e.date}T12:00:00Z`).getUTCDay()+6)%7)===i));
    return { id:`weekday-${i}`,title:day,date:'',materials:(await Promise.all(matches.map(e=>entryMaterials(e,`schedule:${e.id}`)))).flat() };
  }));
  return { persona,schedule,quotes:await Promise.all(library.modules.quotes.entries.map(async e=>({id:`quotes:${e.id}`,title:e.title,date:'',materials:await entryMaterials(e,`quotes:${e.id}`)}))) };
}

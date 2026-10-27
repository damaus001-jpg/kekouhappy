import { reactive } from 'vue';
import type { CustomerTarget, CustomerRecord, CustomerSnapshot } from '../electron/customer-follow-up-types';

// Keep pending writes alive when the assistant closes or a different customer opens.
export const customerWrites = reactive(new Map<string, ReturnType<typeof createState>>());
function createState(target:CustomerTarget,record:CustomerRecord) {
  return reactive({target,record,revision:0,savedRevision:0,saving:false,transferring:false,error:''});
}
export function customerState(target:CustomerTarget,snapshot:CustomerSnapshot) {
  let state=customerWrites.get(snapshot.key);
  if(!state){state=createState(target,snapshot.record);customerWrites.set(snapshot.key,state);}
  state.target=target;
  return state;
}
export type CustomerState = ReturnType<typeof createState>;
export async function flushCustomer(state:CustomerState) {
  if(state.saving)return;
  state.saving=true;state.error='';
  try {
    while(state.savedRevision<state.revision){
      const revision=state.revision;
      const target=JSON.parse(JSON.stringify(state.target)) as CustomerTarget;
      const record=JSON.parse(JSON.stringify(state.record)) as CustomerRecord;
      const saved=await window.chatTranslator.saveCustomer(target,record);
      state.savedRevision=revision;
      if(state.revision===revision)state.record=saved;
    }
  }catch(error){state.error=error instanceof Error?error.message:String(error);}
  finally{state.saving=false;}
}
export function changedCustomer(state:CustomerState){state.revision++;void flushCustomer(state);}
export async function awaitCustomerSaved(state:CustomerState) {
  const started=Date.now();
  while(state.saving){if(Date.now()-started>30000)throw new Error('资料仍在保存，请稍后重试');await new Promise(resolve=>setTimeout(resolve,25));}
  if(state.savedRevision<state.revision)await flushCustomer(state);
  if(state.error||state.savedRevision<state.revision)throw new Error(state.error||'资料尚未保存，请稍后重试');
}
export function applyCustomerImport(state:CustomerState,snapshot:CustomerSnapshot){state.record=snapshot.record;state.revision++;state.savedRevision=state.revision;state.error='';}

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
export const customerSaveDelayMs = 600;
export const customerSaveMaxWaitMs = 2000;
const scheduledSaves = new Map<CustomerState,{timer:ReturnType<typeof setTimeout>;startedAt:number}>();
const activeSaves = new WeakMap<CustomerState,{promise:Promise<void>;drain:boolean}>();
function cancelScheduledSave(state:CustomerState) {
  const scheduled=scheduledSaves.get(state);
  if(scheduled)clearTimeout(scheduled.timer);
  scheduledSaves.delete(state);
}
export function flushCustomer(state:CustomerState):Promise<void> {
  return savePendingCustomer(state,true);
}
function savePendingCustomer(state:CustomerState,drain:boolean):Promise<void> {
  if(drain)cancelScheduledSave(state);
  const active=activeSaves.get(state);
  if(active){active.drain ||= drain;return active.promise;}
  if(state.savedRevision>=state.revision)return Promise.resolve();
  cancelScheduledSave(state);
  state.saving=true;state.error='';
  const operation={drain,promise:Promise.resolve()};
  operation.promise=Promise.resolve().then(async()=>{try {
    do{
      const revision=state.revision;
      const target=JSON.parse(JSON.stringify(state.target)) as CustomerTarget;
      const record=JSON.parse(JSON.stringify(state.record)) as CustomerRecord;
      const saved=await window.chatTranslator.saveCustomer(target,record);
      state.savedRevision=revision;
      if(state.revision===revision)state.record=saved;
    }while(operation.drain&&state.savedRevision<state.revision);
  }catch(error){state.error=error instanceof Error?error.message:String(error);}
  }).finally(()=>{
    state.saving=false;activeSaves.delete(state);
    if(state.savedRevision>=state.revision)cancelScheduledSave(state);
    else if(!state.error&&!scheduledSaves.has(state))scheduleCustomerSave(state);
  });
  activeSaves.set(state,operation);return operation.promise;
}
export function changedCustomer(state:CustomerState){
  state.revision++;
  scheduleCustomerSave(state);
}
function scheduleCustomerSave(state:CustomerState){
  const startedAt=scheduledSaves.get(state)?.startedAt??Date.now();
  cancelScheduledSave(state);
  const delay=Math.min(customerSaveDelayMs,Math.max(0,customerSaveMaxWaitMs-(Date.now()-startedAt)));
  const timer=setTimeout(()=>{scheduledSaves.delete(state);void savePendingCustomer(state,false);},delay);
  scheduledSaves.set(state,{timer,startedAt});
}
export async function awaitCustomerSaved(state:CustomerState) {
  await flushCustomer(state);
  if(state.error||state.savedRevision<state.revision)throw new Error(state.error||'资料尚未保存，请稍后重试');
}
export async function awaitAllCustomersSaved() {
  for(;;){
    const pending=[...customerWrites.values()].filter(state=>state.saving||state.savedRevision<state.revision);
    if(!pending.length)return;
    await Promise.all(pending.map(state=>awaitCustomerSaved(state)));
  }
}
export function installCustomerExitSaveHandler() {
  let previousInert:boolean|undefined;
  const resume=()=>{if(previousInert!==undefined){document.documentElement.inert=previousInert;previousInert=undefined;}};
  window.__dfResumeCustomerEditing=resume;
  window.__dfFlushCustomerWritesBeforeExit=async()=>{
    if(![...customerWrites.values()].some(state=>state.saving||state.savedRevision<state.revision))return;
    if(previousInert===undefined){previousInert=document.documentElement.inert;document.documentElement.inert=true;}
    try{await awaitAllCustomersSaved();}catch(error){resume();throw error;}
  };
}
export function applyCustomerImport(state:CustomerState,snapshot:CustomerSnapshot){cancelScheduledSave(state);state.record=snapshot.record;state.revision++;state.savedRevision=state.revision;state.error='';}

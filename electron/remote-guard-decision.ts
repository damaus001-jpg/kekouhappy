export const remoteGuardDecisionTimeMs=5*60_000;
export class RemoteGuardDecisionWindow {
  deadline=0;
  private pending=new Set<string>();
  observe(ids:string[],now:number){
    if(!ids.length){this.pending.clear();this.deadline=0;return;}
    if(!this.deadline||ids.some(id=>!this.pending.has(id)))this.deadline=Math.max(this.deadline,now+remoteGuardDecisionTimeMs);
    this.pending=new Set(ids);
  }
  extend(now:number){this.deadline=now+remoteGuardDecisionTimeMs;}
  lockNow(now:number){this.deadline=now;}
  clear(){this.pending.clear();this.deadline=0;}
}

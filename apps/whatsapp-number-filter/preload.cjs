const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('numberFilter',Object.freeze({
  importTxt:()=>ipcRenderer.invoke('filter:import'),
  start:()=>ipcRenderer.invoke('filter:start'),
  stop:()=>ipcRenderer.invoke('filter:stop'),
  exportTxt:()=>ipcRenderer.invoke('filter:export'),
  showExport:()=>ipcRenderer.invoke('filter:show-export'),
  refresh:()=>ipcRenderer.invoke('filter:refresh'),
  onState:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('filter:state',handler);return()=>ipcRenderer.removeListener('filter:state',handler);}
}));

const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('numberFilter',Object.freeze({
  windowControl:action=>ipcRenderer.invoke('filter:window-control',action),
  importTxt:()=>ipcRenderer.invoke('filter:import'),
  start:()=>ipcRenderer.invoke('filter:start'),
  stop:()=>ipcRenderer.invoke('filter:stop'),
  exportTxt:()=>ipcRenderer.invoke('filter:export'),
  showExport:()=>ipcRenderer.invoke('filter:show-export'),
  refresh:()=>ipcRenderer.invoke('filter:refresh'),
  authorizationDialog:open=>ipcRenderer.invoke('filter:authorization-dialog',open),
  copyMachineCode:()=>ipcRenderer.invoke('filter:copy-machine-code'),
  activate:code=>ipcRenderer.invoke('filter:activate',code),
  onState:listener=>{const handler=(_event,value)=>listener(value);ipcRenderer.on('filter:state',handler);return()=>ipcRenderer.removeListener('filter:state',handler);}
}));

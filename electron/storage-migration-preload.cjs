const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('migrationProgress',{reopen:()=>ipcRenderer.send('storage-migration:reopen')});

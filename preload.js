const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolder:    ()              => ipcRenderer.invoke('pick-folder'),
  readImage:     (filePath)      => ipcRenderer.invoke('read-image', filePath),
  saveLayout:    (name, data)    => ipcRenderer.invoke('save-layout', { name, data }),
  listLayouts:   ()              => ipcRenderer.invoke('list-layouts'),
  loadLayout:    (filePath)      => ipcRenderer.invoke('load-layout', filePath),
  deleteLayout:  (filePath)      => ipcRenderer.invoke('delete-layout', filePath),
});
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tallkeer', {
  state: () => ipcRenderer.invoke('app:state'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setSecret: (name, value) => ipcRenderer.invoke('secrets:set', { name, value }),
  testSecret: (name) => ipcRenderer.invoke('secrets:test', name),
  history: {
    list: (options) => ipcRenderer.invoke('history:list', options),
    remove: (id) => ipcRenderer.invoke('history:delete', id),
    clear: () => ipcRenderer.invoke('history:clear'),
  },
  collection: {
    list: (name) => ipcRenderer.invoke('collection:list', name),
    upsert: (name, item) => ipcRenderer.invoke('collection:upsert', name, item),
    remove: (name, id) => ipcRenderer.invoke('collection:remove', name, id),
  },
  captureHotkey: (which) => ipcRenderer.invoke('hotkey:capture', which),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  pickFile: (kind) => ipcRenderer.invoke('dialog:pick-file', kind),
  openUrl: (url) => ipcRenderer.invoke('shell:open', url),
  onEvent: (callback) => ipcRenderer.on('hub:event', (_event, payload) => callback(payload)),
});

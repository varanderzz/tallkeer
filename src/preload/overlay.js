'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set([
  'overlay:start',
  'overlay:mode',
  'overlay:handsfree',
  'overlay:stop',
  'overlay:cancel',
  'overlay:status',
]);

contextBridge.exposeInMainWorld('overlay', {
  on(channel, callback) {
    if (CHANNELS.has(channel)) ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
  sendAudio: (payload) => ipcRenderer.invoke('overlay:audio', payload),
  recordingError: (sessionId, message) => ipcRenderer.send('overlay:recording-error', { sessionId, message }),
  idle: () => ipcRenderer.send('overlay:idle'),
  mouse: (inside) => ipcRenderer.send('overlay:mouse', Boolean(inside)),
  action: (name) => ipcRenderer.send('overlay:action', name),
});

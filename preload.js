// Мост между страницей Lampa и главным процессом. Страница получает только
// эти методы — Node ей по-прежнему недоступен.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('macBridge', {
  players: () => ipcRenderer.invoke('players:list'),
  choosePlayer: (id) => ipcRenderer.invoke('players:choose', id),
  pickCustomPlayer: () => ipcRenderer.invoke('players:pick-custom'),
  rescue: (src) => ipcRenderer.invoke('players:rescue', src),
  appInfo: () => ipcRenderer.invoke('app:info'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => ipcRenderer.on('update:state', (_e, s) => cb(s))
})

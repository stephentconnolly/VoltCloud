// Preload script — bridges Electron IPC to the renderer (VoltCloud.html)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // MIDI
  getMidiDevices:  ()        => ipcRenderer.invoke('get-midi-devices'),
  openMidiPort:    (port)    => ipcRenderer.invoke('open-midi-port', port),
  onMidiDevices:   (cb)      => ipcRenderer.on('midi-devices',  (e, d) => cb(d)),
  onMidiMessage:   (cb)      => ipcRenderer.on('midi-message',  (e, m) => cb(m)),

  // License
  validateLicense: (key)     => ipcRenderer.invoke('validate-license', key),
  getLicense:      ()        => ipcRenderer.invoke('get-license'),
  onLicenseValid:  (cb)      => ipcRenderer.on('license-valid', (e, k) => cb(k)),

  // File system
  openFileDialog:  (filters) => ipcRenderer.invoke('open-file-dialog', filters),
  readFile:        (path)    => ipcRenderer.invoke('read-file', path),
  fetchUrl:        (url)     => ipcRenderer.invoke('fetch-url', url),
  openExternal:    (url)     => ipcRenderer.invoke('open-external', url),

  // Platform info
  platform: process.platform,
  // Crash log
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  openManual: () => ipcRenderer.invoke('open-manual'),
});

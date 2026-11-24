// Bridge between the app's own screens (setup, connect) and the main process.
// The dashboard pages loaded from the server only get openHost/setupAgain; nothing here reaches files or Node.
const { contextBridge, ipcRenderer } = require('electron');
const local = location.protocol === 'file:';
const api = {
  openHost: (url) => ipcRenderer.invoke('fd:openHost', url),
  setupAgain: () => ipcRenderer.invoke('fd:setupAgain'),
  desktop: true,
};
if (local) Object.assign(api, {
  defaults: () => ipcRenderer.invoke('fd:defaults'),
  pickFolder: () => ipcRenderer.invoke('fd:pickFolder'),
  hasData: (dir) => ipcRenderer.invoke('fd:hasData', dir),
  canWrite: (dir) => ipcRenderer.invoke('fd:canWrite', dir),
  startHost: (o) => ipcRenderer.invoke('fd:startHost', o),
  addUser: (o) => ipcRenderer.invoke('fd:addUser', o),
  logins: () => ipcRenderer.invoke('fd:logins'),
  resetPassword: (o) => ipcRenderer.invoke('fd:resetPassword', o),
  openDashboard: () => ipcRenderer.invoke('fd:openDashboard'),
  useRemote: () => ipcRenderer.invoke('fd:useRemote'),
  hostState: () => ipcRenderer.invoke('fd:hostState'),
  hostAction: (act, arg) => ipcRenderer.invoke('fd:hostAction', act, arg),
  onHostChanged: (fn) => ipcRenderer.on('fd:hostChanged', (_e, st) => fn(st)),
  trustCert: (host, fp) => ipcRenderer.invoke('fd:trustCert', host, fp), // connect screen only: pin another computer's certificate
});
contextBridge.exposeInMainWorld('FDApp', api);

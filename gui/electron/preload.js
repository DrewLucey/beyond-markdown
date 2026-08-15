const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSources: () => ipcRenderer.invoke('get-sources'),
    getHistory: () => ipcRenderer.invoke('get-history'),
    showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
    showDirectoryDialog: () => ipcRenderer.invoke('show-directory-dialog'),
    startExtractionSourcebook: (slug, outputPath) => ipcRenderer.invoke('start-extraction-sourcebook', slug, outputPath),
    startExtractionRules: (category, includeHomebrew, outputPath) => ipcRenderer.invoke('start-extraction-rules', category, includeHomebrew, outputPath),
    authCobalt: () => ipcRenderer.invoke('auth-cobalt'),
    checkAuth: () => ipcRenderer.invoke('check-auth'),
    signOut: () => ipcRenderer.invoke('sign-out'),
    onExtractionLog: (callback) => ipcRenderer.on('extraction-log', (event, data) => callback(data))
});

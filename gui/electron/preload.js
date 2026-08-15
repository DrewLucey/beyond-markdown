const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
    refreshLibrary: () => ipcRenderer.invoke('refresh-library'),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    readMarkdownHeader: (filePath) => ipcRenderer.invoke('read-markdown-header', filePath),
    convertLocalFile: (filePath, targetRuleset, outputPath) => ipcRenderer.invoke('convert-local-file', filePath, targetRuleset, outputPath),
    openInBrowser: (markdown, title) => ipcRenderer.invoke('open-in-browser', markdown, title),
    onExtractionLog: (callback) => ipcRenderer.on('extraction-log', (event, data) => callback(data)),
    getFilePath: (file) => webUtils ? webUtils.getPathForFile(file) : file.path
});

const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const serve = require('electron-serve').default || require('electron-serve');

const loadURL = serve({ directory: path.join(__dirname, '../out') });

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#1e1e1e',
            symbolColor: '#ffffff'
        }
    });

    const isDev = process.argv.includes('--dev');
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        loadURL(mainWindow);
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC: Get sources from ruleset_map.json
ipcMain.handle('get-sources', async () => {
    try {
        const mapPath = path.join(__dirname, '../../src/sources/ruleset_map.json');
        console.log("Reading ruleset_map from:", mapPath);
        const data = fs.readFileSync(mapPath, 'utf-8');
        console.log("Successfully read ruleset_map, size:", data.length);
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to read ruleset_map.json:", e);
        return null;
    }
});
// IPC: Get extraction history
ipcMain.handle('get-history', async () => {
    try {
        const historyPath = path.join(app.getPath('userData'), 'history.json');
        if (fs.existsSync(historyPath)) {
            return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        }
        return {};
    } catch (e) {
        return {};
    }
});
// IPC: Show Save Dialog
ipcMain.handle('show-save-dialog', async (event, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Markdown Extraction',
        defaultPath: defaultName,
        filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    });
    return canceled ? null : filePath;
});

// IPC: Show Open Dialog for Directory
ipcMain.handle('show-directory-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Output Directory',
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

// IPC: Start Sourcebook Extraction
ipcMain.handle('start-extraction-sourcebook', async (event, slug, outputPath) => {
    return new Promise((resolve) => {
        // Run extract.js
        const extractScript = path.join(__dirname, '../../src/scripts/extract.js');
        const child = spawn('node', [extractScript, slug], {
            cwd: path.join(__dirname, '../../')
        });

        child.stdout.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));
        child.stderr.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));

        child.on('close', (code) => {
            if (code !== 0) return resolve({ success: false });
            
            // Run stitcher.js
            const stitcherScript = path.join(__dirname, '../../src/scripts/stitcher.js');
            const stitcherArgs = [stitcherScript, slug];
            if (outputPath) stitcherArgs.push(outputPath);

            const stitcherChild = spawn('node', stitcherArgs, {
                cwd: path.join(__dirname, '../../')
            });

            stitcherChild.stdout.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));
            stitcherChild.stderr.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));

            stitcherChild.on('close', (stitchCode) => {
                if (stitchCode === 0 && outputPath) {
                    // Update history
                    const historyPath = path.join(app.getPath('userData'), 'history.json');
                    let history = {};
                    if (fs.existsSync(historyPath)) {
                        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                    }
                    history[slug] = new Date().toISOString();
                    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
                }
                resolve({ success: stitchCode === 0 });
            });
        });
    });
});

// IPC: Start Rules Extraction
ipcMain.handle('start-extraction-rules', async (event, category, includeHomebrew, outputPath) => {
    return new Promise((resolve) => {
        const scriptPath = path.join(__dirname, '../../src/scripts/bulk_api_fetcher.js');
        const args = [scriptPath, category];
        if (includeHomebrew) args.push('--homebrew');
        if (outputPath) {
            args.push('--out');
            args.push(outputPath);
        }
        
        const child = spawn('node', args, {
            cwd: path.join(__dirname, '../../')
        });

        child.stdout.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));
        child.stderr.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));

        child.on('close', (code) => {
            if (code === 0 && outputPath) {
                try {
                    const historyPath = path.join(app.getPath('userData'), 'history.json');
                    let history = {};
                    if (fs.existsSync(historyPath)) {
                        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
                    }
                    history[category] = new Date().toISOString();
                    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
                } catch (e) {
                    console.error("Failed to write history for rule extraction", e);
                }
            }
            resolve({ success: code === 0 });
        });
    });
});

// IPC: Check authentication status
ipcMain.handle('check-auth', async () => {
    try {
        const envPath = path.join(__dirname, '../../.env');
        let cobalt = '';
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const match = envContent.match(/^COBALT_SESSION=(.*)$/m);
            if (match) cobalt = match[1].trim();
        }

        if (!cobalt) {
            // Also check config.cjs fallback just in case
            try {
                const config = require(path.join(__dirname, '../../config.cjs'));
                cobalt = config.cobaltSession || config.DNDBEYOND_COBALT_SESSION || '';
            } catch(e) {}
        }

        if (!cobalt) return { success: false, message: "No token found" };

        // Test the token
        const axios = require('axios');
        const res = await axios.post('https://auth-service.dndbeyond.com/v1/cobalt-token', null, {
            headers: { Cookie: `CobaltSession=${cobalt}` },
        });

        if (res.data && res.data.token) {
            let username = "Signed In";
            try {
                const payloadStr = Buffer.from(res.data.token.split('.')[1], 'base64').toString('utf-8');
                const payload = JSON.parse(payloadStr);
                if (payload.displayName) {
                    username = payload.displayName;
                }
            } catch(e) {}
            return { success: true, message: username };
        }
        return { success: false, message: "Token invalid" };
    } catch (e) {
        console.error("Auth test failed:", e.message);
        return { success: false, message: "Authentication failed" };
    }
});

// IPC: Authenticate CobaltSession via hidden window
ipcMain.handle('auth-cobalt', async () => {
    return new Promise((resolve) => {
        let authWindow = new BrowserWindow({
            width: 600,
            height: 800,
            webPreferences: { nodeIntegration: false }
        });

        authWindow.loadURL('https://www.dndbeyond.com/login');

        authWindow.webContents.on('did-navigate', async () => {
            const cookies = await session.defaultSession.cookies.get({ url: 'https://www.dndbeyond.com' });
            const cobalt = cookies.find(c => c.name === 'CobaltSession');
            
            if (cobalt) {
                // Save to .env
                const envPath = path.join(__dirname, '../../.env');
                let envContent = '';
                if (fs.existsSync(envPath)) {
                    envContent = fs.readFileSync(envPath, 'utf-8');
                    envContent = envContent.replace(/^COBALT_SESSION=.*$/m, '');
                }
                envContent += `\nCOBALT_SESSION=${cobalt.value}\n`;
                fs.writeFileSync(envPath, envContent.trim() + '\n');
                
                authWindow.close();
                resolve({ success: true, message: "CobaltSession acquired successfully!" });
            }
        });
    });
});

// IPC: Sign Out
ipcMain.handle('sign-out', async () => {
    try {
        const envPath = path.join(__dirname, '../../.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf-8');
            envContent = envContent.replace(/^COBALT_SESSION=.*$/m, '');
            fs.writeFileSync(envPath, envContent.trim() + '\n');
        }
        await session.defaultSession.clearStorageData({ storages: ['cookies'] });
        return { success: true };
    } catch(e) {
        return { success: false };
    }
});

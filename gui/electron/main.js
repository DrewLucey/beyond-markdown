const { app, BrowserWindow, ipcMain, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const serve = require('electron-serve').default || require('electron-serve');

const loadURL = serve({ directory: path.join(__dirname, '../out') });

let mainWindow;

async function getEnvWithToken() {
    const cookies = await session.defaultSession.cookies.get({ url: 'https://auth-service.dndbeyond.com', name: 'CobaltSession' });
    const cobaltSession = cookies.length > 0 ? cookies[0].value : '';
    return { ...process.env, COBALTSESSION: cobaltSession };
}

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

    mainWindow.webContents.on('will-navigate', (event, url) => {
        // Prevent all navigations except the local dev server or app scheme
        if (!url.startsWith('http://localhost:3000') && !url.startsWith('app://')) {
            event.preventDefault();
            console.log('Blocked navigation to:', url);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Prevent all new windows from opening
        console.log('Blocked new window to:', url);
        return { action: 'deny' };
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

// IPC: Refresh library
ipcMain.handle('refresh-library', async () => {
    return new Promise(async (resolve) => {
        const env = await getEnvWithToken();
        const scriptPath = path.join(__dirname, '../../src/scripts/library.js');
        const child = spawn('node', [scriptPath], {
            cwd: path.join(__dirname, '../../'),
            env
        });

        let output = '';
        child.stdout.on('data', (data) => output += data.toString());
        child.stderr.on('data', (data) => output += data.toString());

        child.on('close', (code) => {
            console.log("Refresh Library script finished with code", code);
            console.log(output);
            resolve({ success: code === 0 });
        });
    });
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
    return new Promise(async (resolve) => {
        const extractScript = path.join(__dirname, '../../src/scripts/extract.js');
        const env = await getEnvWithToken();
        
        const child = spawn('node', [extractScript, slug], {
            cwd: path.join(__dirname, '../../'),
            env
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
                cwd: path.join(__dirname, '../../'),
                env
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
    return new Promise(async (resolve) => {
        const scriptPath = path.join(__dirname, '../../src/scripts/bulk_api_fetcher.js');
        const args = [scriptPath, category];
        if (includeHomebrew) args.push('--homebrew');
        if (outputPath) {
            args.push('--out');
            args.push(outputPath);
        }
        const env = await getEnvWithToken();
        const child = spawn('node', args, {
            cwd: path.join(__dirname, '../../'),
            env
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
        const historyPath = path.join(app.getPath('userData'), 'history.json');
        if (fs.existsSync(historyPath)) {
            fs.unlinkSync(historyPath);
        }
        await session.defaultSession.clearStorageData({ storages: ['cookies'] });
        return { success: true };
    } catch(e) {
        return { success: false };
    }
});

// IPC: Read File
ipcMain.handle('read-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
        }
    } catch(e) {
        console.error("Failed to read file", e);
    }
    return null;
});

// IPC: Read Markdown Header Ruleset
ipcMain.handle('read-markdown-header', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            // Read first 1000 characters
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(1000);
            fs.readSync(fd, buffer, 0, 1000, 0);
            fs.closeSync(fd);
            const content = buffer.toString('utf-8');
            const match = content.match(/<[A-Z]+[^>]*ruleset="([^"]+)"/i);
            if (match) {
                return match[1];
            }
        }
    } catch(e) {
        console.error("Failed to read markdown header", e);
    }
    return null;
});

// IPC: Convert Local File
ipcMain.handle('convert-local-file', async (event, filePath, targetRuleset, outputPath) => {
    return new Promise(async (resolve) => {
        const env = await getEnvWithToken();
        const scriptPath = path.join(__dirname, '../../src/scripts/file_converter.js');
        const child = spawn('node', [scriptPath, filePath, targetRuleset, outputPath], {
            cwd: path.join(__dirname, '../../'),
            env
        });

        child.stdout.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));
        child.stderr.on('data', (data) => mainWindow.webContents.send('extraction-log', data.toString()));

        child.on('close', (code) => {
            resolve({ success: code === 0 });
        });
    });
});

// IPC: Open in Browser
ipcMain.handle('open-in-browser', async (event, markdown, title) => {
    try {
        const tempPath = path.join(app.getPath('temp'), `beyond-markdown-viewer-${Date.now()}.html`);
        const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,100..1000&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Roboto Flex', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #c9d1d9; background-color: #0d1117; max-width: 1200px; margin: 0 auto; padding: 40px; }
    h1, h2, h3, h4, h5 { border-bottom: 1px solid #21262d; padding-bottom: .3em; margin-top: 24px; margin-bottom: 16px; font-weight: 600; color: #c9d1d9; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #30363d; padding: 6px 13px; }
    tr:nth-child(2n) { background-color: #161b22; }
    code { background-color: rgba(240,246,252,0.15); padding: .2em .4em; border-radius: 3px; font-family: monospace; }
    pre { background-color: #161b22; padding: 16px; overflow: auto; border-radius: 3px; border: 1px solid #30363d; }
    pre code { background-color: transparent; padding: 0; }
    blockquote { border-left: .25em solid #30363d; color: #8b949e; padding: 0 1em; margin: 0; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; height: auto; border-radius: 6px; margin: 16px 0; display: block; }
  </style>
</head>
<body>
  <div id="content">Rendering Markdown...</div>
  <script>
    const markdown = ${JSON.stringify(markdown)};
    let htmlContent = marked.parse(markdown);
    
    // Extract {#id} from headers and apply them as HTML id attributes
    // marked typically outputs: <h1>Title {#my:id}</h1>
    htmlContent = htmlContent.replace(/<h([1-6])([^>]*)>([\\s\\S]*?)\\{#([^}]+)\\}([\\s\\S]*?)<\\/h\\1>/g, function(match, hLevel, hAttrs, textBefore, idString, textAfter) {
        return '<h' + hLevel + ' id="' + idString + '"' + hAttrs + '>' + textBefore.trim() + textAfter.trim() + '</h' + hLevel + '>';
    });

    document.getElementById('content').innerHTML = htmlContent;
  </script>
</body>
</html>`;
        fs.writeFileSync(tempPath, html, 'utf-8');
        await shell.openExternal('file:///' + tempPath.replace(/\\/g, '/'));
        return { success: true };
    } catch(e) {
        console.error("Failed to open in browser", e);
        return { success: false };
    }
});

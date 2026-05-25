const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } = require('electron');


// Register wam:// as a privileged scheme BEFORE app.whenReady
// Required for: ES module import(), fetch(), AudioWorklet.addModule()
protocol.registerSchemesAsPrivileged([{
  scheme: 'wam',
  privileges: {
    standard: true,
    secure: true,
    allowServiceWorkers: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  }
}]);
const path = require('path');
const fs   = require('fs');
const https = require('https');

// ── Crash logging ─────────────────────────────────────────────────────────────
const LOG_FILE = path.join(app.getPath('userData'), 'voltcloud-crash.log');
function writeLog(msg) {
  const line = new Date().toISOString() + ' ' + msg + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
  console.log(msg);
}
process.on('uncaughtException', err => writeLog('UNCAUGHT: ' + err.message));
process.on('unhandledRejection', r => writeLog('REJECTION: ' + r));
writeLog('App starting...');

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ── License System ────────────────────────────────────────────────────────────
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

// Your Gumroad product permalink (from the URL: gumroad.com/l/voltcloud)
const GUMROAD_PRODUCT = 'voltcloud';

// Developer keys — bypass Gumroad, always valid, no internet needed
const DEV_KEYS = new Set([
  'vcdevnona2025',
  'vcdevnonavideo',
]);

function normalizeKey(k) {
  return (k || '').toLowerCase().replace(/[\s\-]/g, '');
}

function isDevKey(k) {
  return DEV_KEYS.has(normalizeKey(k));
}

function getSavedLicense() {
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8')) || null;
  } catch(e) { return null; }
}

function saveLicense(key, extra) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({
      key,
      activatedAt: new Date().toISOString(),
      email: extra?.email || null,
    }));
  } catch(e) { writeLog('Could not save license: ' + e.message); }
}

// Call Gumroad's verify API — no API key needed, it's a public endpoint
function verifyWithGumroad(key) {
  return new Promise((resolve) => {
    const body = new URLSearchParams({
      product_permalink: GUMROAD_PRODUCT,
      license_key: key,
      increment_uses_count: 'false',
    }).toString();

    const req = https.request({
      hostname: 'api.gumroad.com',
      path: '/v2/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          writeLog('Gumroad verify: success=' + json.success);
          resolve(json);
        } catch(e) {
          writeLog('Gumroad parse error: ' + e.message);
          resolve({ success: false });
        }
      });
    });

    req.on('error', (e) => {
      writeLog('Gumroad network error: ' + e.message);
      resolve({ success: false, networkError: true });
    });
    req.on('timeout', () => {
      writeLog('Gumroad timeout');
      req.destroy();
      resolve({ success: false, networkError: true });
    });

    req.write(body);
    req.end();
  });
}

function isActivated() {
  const saved = getSavedLicense();
  return !!(saved && saved.key);
}

// ── License Window ────────────────────────────────────────────────────────────
function showLicenseWindow() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 340,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#e6ddca',
      title: 'Volt Cloud — Activation',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    win.setMenuBarVisibility(false);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#e6ddca;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
    padding:28px 32px;color:#2a1a0a;height:100vh;display:flex;flex-direction:column}
  h2{font-size:13px;font-weight:900;letter-spacing:3px;text-transform:uppercase;
    color:#1a1008;margin-bottom:6px}
  .sub{font-size:10px;color:#5a4a2a;margin-bottom:22px;line-height:1.5}
  label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
    color:#5a4a2a;display:block;margin-bottom:6px}
  input{width:100%;padding:10px 12px;font-family:'Courier New',monospace;font-size:15px;
    font-weight:700;letter-spacing:4px;text-transform:uppercase;
    background:#f0e8d0;border:2px solid #8a6a2a;color:#1a1008;
    text-align:center;outline:none;transition:border-color .15s}
  input:focus{border-color:#c8820a}
  .err{font-size:10px;text-align:center;margin-top:8px;min-height:14px}
  .err.bad{color:#c02020}
  .err.checking{color:#8a6a2a}
  .btns{display:flex;gap:10px;margin-top:16px}
  button{flex:1;padding:10px 0;font-family:inherit;font-size:11px;font-weight:900;
    letter-spacing:2px;text-transform:uppercase;border:2px solid;cursor:pointer}
  .act{background:#1a3a10;border-color:#2a6020;color:#80d060}
  .act:hover:not(:disabled){background:#264a1a}
  .act:disabled{opacity:.5;cursor:default}
  .quit{background:#e6ddca;border-color:#8a6a2a;color:#5a4a2a}
  .quit:hover{background:#d8d0b8}
  .purchase{margin-top:auto;font-size:9px;color:#8a7a5a;text-align:center;padding-top:14px}
</style>
</head>
<body>
<h2>Volt Cloud</h2>
<p class="sub">Enter your license key from your Gumroad receipt.<br>
Keys are in the format <strong>XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX</strong></p>
<label>License Key</label>
<input id="key" type="text" placeholder="Paste your key here" autocomplete="off" spellcheck="false">
<div class="err" id="err"></div>
<div class="btns">
  <button class="act" id="actBtn" onclick="activate()">ACTIVATE</button>
  <button class="quit" onclick="quit()">QUIT</button>
</div>
<p class="purchase">Purchase at <a href="#" onclick="require('shell').openExternal('https://8630507118241.gumroad.com/l/voltcloud');return false">8630507118241.gumroad.com/l/voltcloud</a></p>
<script>
  const { ipcRenderer } = require('electron');
  const inp = document.getElementById('key');
  const err = document.getElementById('err');
  const btn = document.getElementById('actBtn');
  inp.focus();
  inp.addEventListener('keydown', e => { if(e.key==='Enter') activate(); });

  async function activate() {
    const k = inp.value.trim();
    if(!k){ err.className='err bad'; err.textContent='Please enter your license key.'; return; }
    err.className='err checking'; err.textContent='Checking...';
    btn.disabled = true; btn.textContent = 'CHECKING...';
    const result = await ipcRenderer.invoke('check-license-key', k);
    if(result.valid) {
      err.style.color='#208820'; err.textContent='✓ Activated! Loading Volt Cloud...';
      setTimeout(()=>ipcRenderer.invoke('license-accepted'), 600);
    } else {
      err.className='err bad';
      err.textContent = result.message || 'Invalid key — check your Gumroad receipt and try again.';
      btn.disabled = false; btn.textContent = 'ACTIVATE';
      inp.select();
    }
  }

  function quit() { ipcRenderer.invoke('license-quit'); }
</script>
</body>
</html>`;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    ipcMain.handleOnce('check-license-key', async (event, key) => {
      // Dev key — instant approval, no network call
      if (isDevKey(key)) {
        saveLicense(key, null);
        writeLog('Dev key activated');
        return { valid: true };
      }

      // Gumroad key — verify online
      writeLog('Verifying with Gumroad: ' + key.slice(0, 8) + '...');
      const result = await verifyWithGumroad(key);

      if (result.success) {
        saveLicense(key, { email: result.purchase?.email });
        writeLog('Gumroad license activated: ' + key.slice(0, 8) + '...');
        return { valid: true };
      }

      if (result.networkError) {
        return {
          valid: false,
          message: 'Could not reach activation server — please connect to the internet to activate.',
        };
      }

      writeLog('Invalid Gumroad key: ' + key.slice(0, 8));
      return { valid: false };
    });

    ipcMain.handleOnce('license-accepted', () => { win.close(); resolve(true); });
    ipcMain.handleOnce('license-quit', () => { win.close(); resolve(false); });
    win.on('closed', () => resolve(false));
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#e6ddca',
    title: 'Volt Cloud',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      webSecurity: false,  // Allow cross-origin fetch for WAM plugin loading
    },
  });

  mainWindow.loadFile('VoltCloud.html');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    writeLog('RENDERER CRASHED: ' + details.reason + ' code=' + details.exitCode);
    dialog.showMessageBox({
      type: 'error',
      title: 'Volt Cloud crashed',
      message: 'The app crashed: ' + details.reason,
      detail: 'Exit code: ' + details.exitCode + '\n\nLog: ' + LOG_FILE,
      buttons: ['Restart', 'Close']
    }).then(r => { if (r.response === 0) mainWindow.reload(); else app.quit(); });
  });

  mainWindow.webContents.once('did-finish-load', () => {
    writeLog('Page loaded');
    mainWindow.webContents.send('license-valid', 'VC-UNLOCKED');
  });
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Volt Cloud',
      submenu: [
        { label: 'About Volt Cloud', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [{
        label: 'Open Manual',
        click: () => shell.openPath(path.join(__dirname, 'VoltCloud_Manual.pdf'))
      }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-midi-devices', () => []);
ipcMain.handle('open-midi-port', () => true);

ipcMain.handle('open-external', (e, url) => shell.openExternal(url));
ipcMain.handle('validate-license', () => {
  const saved = getSavedLicense();
  return { valid: !!(saved && saved.key), key: saved?.key || '' };
});
ipcMain.handle('get-license', () => getSavedLicense()?.key || '');

ipcMain.handle('open-manual', () => {
  shell.openPath(path.join(__dirname, 'VoltCloud_Manual.pdf'));
});

ipcMain.handle('open-log-file', () => {
  shell.openPath(LOG_FILE);
  return LOG_FILE;
});

ipcMain.handle('open-file-dialog', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Audio', extensions: ['mp3','wav','ogg','flac','m4a','aiff'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});


ipcMain.handle('fetch-url', async (event, url) => {
  try {
    const { net } = require('electron');
    const res = await net.fetch(url);
    if (!res.ok) return { ok: false, status: res.status, text: '' };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch(e) {
    // Fallback: try node https
    try {
      const https = require('https');
      const http  = require('http');
      const text = await new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'VoltCloud/1.0' } }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      return { ok: true, status: 200, text };
    } catch(e2) {
      return { ok: false, status: 0, text: '', error: e.message + ' | ' + e2.message };
    }
  }
});
ipcMain.handle('read-file', async (event, filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer.buffer;
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
// Register custom protocol to proxy WAM plugin files (avoids CORS/import() issues)

app.whenReady().then(async () => {
  // wam:// protocol: fetches from webaudiomodules.com/community/
  // Allows renderer to: import('wam://burns-audio/reverb/index.js')
  // Which fetches: https://www.webaudiomodules.com/community/burns-audio/reverb/index.js
  try {
    protocol.handle('wam', async (request) => {
      const path = request.url.slice('wam://'.length);
      const remoteUrl = 'https://www.webaudiomodules.com/community/' + path;
      try {
        const { net } = require('electron');
        const res = await net.fetch(remoteUrl);
        const headers = { 'Access-Control-Allow-Origin': '*' };
        const ct = res.headers.get('content-type') || 'application/javascript';
        headers['content-type'] = ct;
        return new Response(res.body, { status: res.status, headers });
      } catch(e) {
        return new Response('// WAM fetch error: ' + e.message, { status: 500 });
      }
    });
  } catch(e) { console.log('protocol.handle not available:', e.message); }

  buildMenu();

  if (!isActivated()) {
    writeLog('No license found — showing activation');
    const accepted = await showLicenseWindow();
    if (!accepted) {
      writeLog('Activation declined — quitting');
      app.quit();
      return;
    }
  } else {
    writeLog('License OK: ' + (getSavedLicense()?.key || '').slice(0, 8) + '...');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

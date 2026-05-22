const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const LAYOUTS_DIR = path.join(app.getPath('userData'), 'layouts');
if (!fs.existsSync(LAYOUTS_DIR)) fs.mkdirSync(LAYOUTS_DIR, { recursive: true });

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Card Canvas',
    backgroundColor: '#0f0f1e',
  });

  // In development, ELECTRON_START_URL env var is set by the start script
  // In production, load from the build folder
  const startUrl = process.env.ELECTRON_START_URL
    || 'file://' + path.join(app.getAppPath(), 'build', 'index.html');

  mainWindow.loadURL(startUrl);
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC: Pick a folder ────────────────────────────────────────────────────
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
    .map(f => ({ name: f, path: path.join(folderPath, f) }));
  return { folderPath, files };
});

// ─── IPC: Read image as base64 ─────────────────────────────────────────────
ipcMain.handle('read-image', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${data.toString('base64')}`;
  } catch { return null; }
});

// ─── IPC: Save layout ──────────────────────────────────────────────────────
ipcMain.handle('save-layout', async (event, { name, data }) => {
  const safeName = name.replace(/[^a-z0-9_\-\s]/gi, '_');
  const filePath = path.join(LAYOUTS_DIR, `${safeName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { success: true, filePath };
});

// ─── IPC: Load layout list ─────────────────────────────────────────────────
ipcMain.handle('list-layouts', async () => {
  return fs.readdirSync(LAYOUTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f.replace('.json', ''),
      filePath: path.join(LAYOUTS_DIR, f),
      modified: fs.statSync(path.join(LAYOUTS_DIR, f)).mtime,
    }))
    .sort((a, b) => b.modified - a.modified);
});

// ─── IPC: Load a specific layout ───────────────────────────────────────────
ipcMain.handle('load-layout', async (event, filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
});

// ─── IPC: Delete a layout ──────────────────────────────────────────────────
ipcMain.handle('delete-layout', async (event, filePath) => {
  try { fs.unlinkSync(filePath); return { success: true }; }
  catch { return { success: false }; }
});
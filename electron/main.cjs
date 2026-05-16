require('dotenv').config();
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fs = require('node:fs');
const jwt = require('jsonwebtoken');

const execFileAsync = promisify(execFile);

// ── Apple Music developer token ──────────────────────────
let appleMusicToken = null;
let appleMusicTokenExpiry = 0;

function generateAppleMusicToken() {
  if (appleMusicToken && Date.now() < appleMusicTokenExpiry) {
    return appleMusicToken;
  }

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;

  if (!teamId || !keyId) return null;

  // Find the .p8 key file in project root
  const projectRoot = path.join(__dirname, '..');
  const keyFiles = fs.readdirSync(projectRoot).filter((f) => f.endsWith('.p8'));
  if (keyFiles.length === 0) return null;

  const privateKey = fs.readFileSync(path.join(projectRoot, keyFiles[0]), 'utf8');

  appleMusicToken = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId,
    },
  });

  // Cache for 179 days
  appleMusicTokenExpiry = Date.now() + 179 * 24 * 60 * 60 * 1000;
  return appleMusicToken;
}

// ── yt-dlp stream URL fetcher ────────────────────────────
// Cache stream URLs for 25 minutes (they expire after ~30min)
const streamCache = new Map();
const CACHE_TTL = 25 * 60 * 1000;

function getYtDlpPath() {
  // Use bundled yt-dlp from node_modules, fall back to system
  try {
    return require('yt-dlp-exec/src/constants').YOUTUBE_DL_PATH || 'yt-dlp';
  } catch {
    return 'yt-dlp';
  }
}

async function getStreamUrl(title, artist) {
  const cacheKey = `${title}::${artist}`;
  const cached = streamCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.url;
  }

  const query = `ytsearch1:"${title}" ${artist}`;
  const ytDlp = getYtDlpPath();

  const { stdout } = await execFileAsync(ytDlp, [
    query,
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '--no-playlist',
    '--no-warnings',
    '-g', // print URL only
  ], { timeout: 15000 });

  const url = stdout.trim();
  if (!url) throw new Error('No stream URL found');

  streamCache.set(cacheKey, { url, time: Date.now() });
  return url;
}

const isDev = process.env.NODE_ENV === 'development';

// Scale factor for pixel art
// Actual drawing area within 526x526 canvas: 306x497
// (23px top at bow, 110px left, 110px right, 6px bottom at heart)
const WIDTH = 415;
const HEIGHT = Math.round(415 * (497 / 306)); // maintain 306:497 aspect ratio

function createWindow() {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    icon: path.join(__dirname, '..', 'assets', 'pink', 'favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Lock aspect ratio so only proportional resizing is allowed
  const ASPECT = WIDTH / HEIGHT;
  win.setAspectRatio(ASPECT);

  // Window control handlers
  let preMaxBounds = null;

  const onMinimize = () => win.minimize();
  const onMaximize = () => {
    if (preMaxBounds) {
      // Restore to previous size
      win.setBounds(preMaxBounds);
      preMaxBounds = null;
    } else {
      // Fit to screen while maintaining aspect ratio
      preMaxBounds = win.getBounds();
      const { workArea } = screen.getPrimaryDisplay();
      let newWidth = workArea.width;
      let newHeight = Math.round(newWidth / ASPECT);
      if (newHeight > workArea.height) {
        newHeight = workArea.height;
        newWidth = Math.round(newHeight * ASPECT);
      }
      const x = workArea.x + Math.round((workArea.width - newWidth) / 2);
      const y = workArea.y + Math.round((workArea.height - newHeight) / 2);
      win.setBounds({ x, y, width: newWidth, height: newHeight });
    }
  };
  const onClose = () => win.close();

  const onResize = (_e, { dx, dy, corner }) => {
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();

    const isRight = corner.includes('right');
    const isBottom = corner.includes('bottom');

    const effectiveDx = isRight ? dx : -dx;
    const effectiveDy = isBottom ? dy : -dy;

    let delta;
    if (Math.abs(effectiveDx) > Math.abs(effectiveDy)) {
      delta = effectiveDx;
    } else {
      delta = effectiveDy;
    }

    const dw = Math.round(delta);
    const newWidth = bounds.width + dw;
    const newHeight = Math.round(newWidth / ASPECT);
    const dh = newHeight - bounds.height;

    const newBounds = {
      x: isRight ? bounds.x : bounds.x - dw,
      y: isBottom ? bounds.y : bounds.y - dh,
      width: newWidth,
      height: newHeight,
    };

    if (newBounds.width >= 200 && newBounds.height >= 200) {
      win.setBounds(newBounds);
    }
  };

  const onOpenExternal = (_e, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      if (url.includes('accounts.spotify.com/authorize')) {
        const authWin = new BrowserWindow({
          width: 500,
          height: 700,
          parent: win,
          modal: true,
          show: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        });
        authWin.loadURL(url);
        const handleAuthRedirect = (event, callbackUrl) => {
          if (callbackUrl.startsWith('http://127.0.0.1:5173/callback')) {
            event.preventDefault();
            const url = new URL(callbackUrl);
            let target;
            if (isDev) {
              target = `http://127.0.0.1:5173/${url.search}`;
            } else {
              const fileUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html'));
              fileUrl.search = url.search;
              target = fileUrl.href;
            }
            win.loadURL(target);
            authWin.close();
          }
        };
        authWin.webContents.on('will-redirect', handleAuthRedirect);
        authWin.webContents.on('will-navigate', handleAuthRedirect);
        return;
      }
      shell.openExternal(url);
    }
  };

  const onSetTheme = (_e, theme) => {
    const iconPath = path.join(__dirname, '..', 'assets', theme, 'favicon.png');
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(iconPath);
    }
    win.setIcon(iconPath);
  };

  ipcMain.on('window-minimize', onMinimize);
  ipcMain.on('window-maximize', onMaximize);
  ipcMain.on('window-close', onClose);
  ipcMain.on('window-resize', onResize);
  ipcMain.on('open-external', onOpenExternal);
  ipcMain.on('set-theme', onSetTheme);

  // Clean up IPC listeners when window is destroyed
  win.on('closed', () => {
    ipcMain.removeListener('window-minimize', onMinimize);
    ipcMain.removeListener('window-maximize', onMaximize);
    ipcMain.removeListener('window-close', onClose);
    ipcMain.removeListener('window-resize', onResize);
    ipcMain.removeListener('open-external', onOpenExternal);
    ipcMain.removeListener('set-theme', onSetTheme);
  });

  // Handle Spotify OAuth callback in production.
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'accounts.spotify.com') {
        event.preventDefault();
        shell.openExternal(url);
        return;
      }
      if (parsed.pathname === '/callback' && parsed.searchParams.has('code')) {
        if (!isDev) {
          event.preventDefault();
          const fileUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html'));
          fileUrl.search = parsed.search;
          win.loadURL(fileUrl.href);
        }
      }
    } catch {
      // ignore invalid URLs
    }
  });

  // Toggle DevTools with Cmd+Shift+I / Ctrl+Shift+I / F12
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const isDevToolsShortcut = input.key.toLowerCase() === 'i' && input.shift && (input.meta || input.control);
    if (isDevToolsShortcut || input.key === 'F12') {
      win.webContents.toggleDevTools({ mode: 'detach' });
    }
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ── Global IPC handlers (persist across window reloads) ──
ipcMain.handle('get-apple-music-token', () => {
  return generateAppleMusicToken();
});

ipcMain.handle('get-stream-url', async (_e, title, artist) => {
  try {
    return await getStreamUrl(title, artist);
  } catch (err) {
    throw new Error(`Failed to get stream: ${err.message}`);
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '..', 'assets', 'pink', 'favicon.png'));
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  powerSaveBlocker,
  globalShortcut,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// ─── Single-instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

// ─── Allow unmuted autoplay; hardware acceleration on ─────────────────────────
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch(
  'disable-features',
  'PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'
)
// Do NOT pass ignore-certificate-errors globally; handle per-request in session

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let tray: Tray | null = null
let powerBlockerId: number | null = null

// ─── Create main window ───────────────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // ── Security: keep contextIsolation on; webSecurity on ──────────────
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false   // prevent JS/timers from throttling when window is hidden
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── Create mini-player window ────────────────────────────────────────────────
function createMiniPlayer(channelUrl: string, channelName: string): void {
  if (miniWindow) {
    miniWindow.focus()
    return
  }
  miniWindow = new BrowserWindow({
    width: 400,
    height: 240,
    minWidth: 280,
    minHeight: 160,
    alwaysOnTop: true,
    frame: false,
    transparent: false,
    backgroundColor: '#000',
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    title: `Mini – ${channelName}`
  })

  const miniUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/mini.html`
    : join(__dirname, '../renderer/mini.html')

  // Fall back to loading the main app with a query param
  const fallback = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}?mini=1&url=${encodeURIComponent(channelUrl)}&name=${encodeURIComponent(channelName)}`
    : `${join(__dirname, '../renderer/index.html')}?mini=1&url=${encodeURIComponent(channelUrl)}&name=${encodeURIComponent(channelName)}`

  miniWindow.loadURL(fallback).catch(() => miniWindow?.loadURL(fallback))

  miniWindow.on('closed', () => {
    miniWindow = null
    mainWindow?.webContents.send('mini-player-closed')
  })
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('tedeyTV')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('double-click', () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show()
  })
}

// ─── Request interceptor (CORS / anti-hotlinking fix) ─────────────────────────
function setupSessionHooks(): void {
  // ── onBeforeSendHeaders ─────────────────────────────────────────────────────
  // • Sets a VLC-style User-Agent (raw-IP IPTV servers throttle/reject browsers)
  // • Removes Origin (causes 403s on many IPTV servers)
  // • Supports per-channel Referer override via X-Custom-Referer header
  // • Supports per-channel UA override via X-Custom-UA header
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }

      // Pull out per-channel overrides injected by the renderer
      const customUA = headers['X-Custom-UA']
      const customReferer = headers['X-Custom-Referer']
      delete headers['X-Custom-UA']
      delete headers['X-Custom-Referer']

      // VLC UA — raw-IP IPTV servers send full bitrate to VLC, throttle browsers
      headers['User-Agent'] = customUA ?? 'VLC/3.0.20 LibVLC/3.0.20'

      // Origin always removed; Referer only set when channel specifies one
      delete headers['Origin']
      if (customReferer) {
        headers['Referer'] = customReferer
      } else {
        delete headers['Referer']
      }

      callback({ cancel: false, requestHeaders: headers })
    }
  )

  // ── onHeadersReceived ───────────────────────────────────────────────────────
  // Inject permissive CORS so hls.js / mpegts.js XHR can read segments
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const responseHeaders = { ...details.responseHeaders }
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
      responseHeaders['Access-Control-Allow-Headers'] = ['*']
      callback({ responseHeaders })
    }
  )
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
function registerIPC(): void {
  // Fullscreen
  ipcMain.on('toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.handle('is-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  // Power save blocker
  ipcMain.on('power-save-start', () => {
    if (powerBlockerId === null) {
      powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    }
  })
  ipcMain.on('power-save-stop', () => {
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId)
      powerBlockerId = null
    }
  })

  // Mini-player
  ipcMain.on('open-mini-player', (_event, { url, name }: { url: string; name: string }) => {
    createMiniPlayer(url, name)
  })
  ipcMain.on('close-mini-player', () => {
    miniWindow?.close()
  })

  // Window state
  ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.getBounds() ?? null
  })

  // Media keys / tray controls → forward to renderer
  ipcMain.on('media-play-pause', () => {
    mainWindow?.webContents.send('media-key', 'play-pause')
  })
  ipcMain.on('media-next', () => {
    mainWindow?.webContents.send('media-key', 'next')
  })
  ipcMain.on('media-prev', () => {
    mainWindow?.webContents.send('media-key', 'prev')
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.aadeshd.tedeytv')

  setupSessionHooks()
  registerIPC()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Global media keys
  globalShortcut.register('MediaPlayPause', () => {
    mainWindow?.webContents.send('media-key', 'play-pause')
  })
  globalShortcut.register('MediaNextTrack', () => {
    mainWindow?.webContents.send('media-key', 'next')
  })
  globalShortcut.register('MediaPreviousTrack', () => {
    mainWindow?.webContents.send('media-key', 'prev')
  })

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
  }
  tray?.destroy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

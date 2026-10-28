import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ─── Typed API surface ────────────────────────────────────────────────────────

export type MediaKey = 'play-pause' | 'next' | 'prev'

const api = {
  // Fullscreen
  toggleFullscreen: (): void => ipcRenderer.send('toggle-fullscreen'),
  isFullscreen: (): Promise<boolean> => ipcRenderer.invoke('is-fullscreen'),

  // Power save (call while playing, stop on pause/close)
  powerSaveStart: (): void => ipcRenderer.send('power-save-start'),
  powerSaveStop: (): void => ipcRenderer.send('power-save-stop'),

  // Mini-player
  openMiniPlayer: (url: string, name: string): void =>
    ipcRenderer.send('open-mini-player', { url, name }),
  closeMiniPlayer: (): void => ipcRenderer.send('close-mini-player'),

  // Window state
  getWindowBounds: (): Promise<Electron.Rectangle | null> =>
    ipcRenderer.invoke('get-window-bounds'),

  // Media keys forwarded from main process → renderer
  onMediaKey: (cb: (key: MediaKey) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, key: MediaKey): void => cb(key)
    ipcRenderer.on('media-key', handler)
    return () => ipcRenderer.off('media-key', handler)
  },

  // Mini-player lifecycle events
  onMiniPlayerClosed: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('mini-player-closed', handler)
    return () => ipcRenderer.off('mini-player-closed', handler)
  }
}

// ─── Expose via contextBridge (contextIsolation: true) ───────────────────────
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error('[preload] contextBridge error:', err)
  }
} else {
  // @ts-ignore (fallback for testing without context isolation)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

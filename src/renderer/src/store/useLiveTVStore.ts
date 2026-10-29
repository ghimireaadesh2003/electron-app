import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Channel, PlayerSettings } from '../types'
import { channels as builtInChannels } from '../data/channels'

// ─── State shape ──────────────────────────────────────────────────────────────

interface LiveTVState {
  // Channels
  currentChannel: Channel | null
  channels: Channel[]           // built-in + imported, deduplicated
  importedChannels: Channel[]
  favorites: string[]
  recentlyWatched: Channel[]

  // Navigation
  searchTerm: string
  activeCategory: string

  // Player
  playerSettings: PlayerSettings

  // Actions – channels
  playChannel: (channel: Channel | null) => void
  toggleFavorite: (channelId: string) => void
  importChannels: (imported: Channel[]) => void
  clearImported: () => void

  // Actions – navigation
  setSearchTerm: (term: string) => void
  setActiveCategory: (category: string) => void

  // Actions – player
  setVolume: (v: number) => void
  setMuted: (m: boolean) => void
  setAspectMode: (mode: PlayerSettings['aspectMode']) => void

  // Helpers
  nextChannel: () => Channel | null
  prevChannel: () => Channel | null
}

// ─── Default settings ─────────────────────────────────────────────────────────

const defaultSettings: PlayerSettings = {
  volume: 100,
  muted: false,
  aspectMode: 'contain',
  lastChannelId: null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLiveTVStore = create<LiveTVState>()(
  persist(
    (set, get) => ({
      currentChannel: null,
      channels: builtInChannels,
      importedChannels: [],
      favorites: [],
      recentlyWatched: [],
      searchTerm: '',
      activeCategory: 'All',
      playerSettings: defaultSettings,

      // ── play ──────────────────────────────────────────────────────────────
      playChannel: (channel) => {
        set({
          currentChannel: channel,
          playerSettings: {
            ...get().playerSettings,
            lastChannelId: channel?.id ?? null
          }
        })
        if (channel) {
          set((state) => {
            const filtered = state.recentlyWatched.filter((c) => c.id !== channel.id)
            return { recentlyWatched: [channel, ...filtered].slice(0, 20) }
          })
        }
      },

      // ── favorites ─────────────────────────────────────────────────────────
      toggleFavorite: (channelId) =>
        set((state) => ({
          favorites: state.favorites.includes(channelId)
            ? state.favorites.filter((id) => id !== channelId)
            : [...state.favorites, channelId]
        })),

      // ── import ────────────────────────────────────────────────────────────
      importChannels: (imported) =>
        set((state) => {
          const newImported = [
            ...state.importedChannels,
            ...imported.filter((c) => !state.importedChannels.some((x) => x.id === c.id))
          ]
          const existingIds = new Set(builtInChannels.map((c) => c.id))
          const merged = [
            ...builtInChannels,
            ...newImported.filter((c) => !existingIds.has(c.id))
          ]
          return {
            importedChannels: newImported,
            channels: merged
          }
        }),

      clearImported: () => set({ importedChannels: [], channels: builtInChannels }),

      // ── navigation ────────────────────────────────────────────────────────
      setSearchTerm: (term) => set({ searchTerm: term }),
      setActiveCategory: (category) => set({ activeCategory: category }),

      // ── player settings ───────────────────────────────────────────────────
      setVolume: (v) =>
        set((s) => ({ playerSettings: { ...s.playerSettings, volume: Math.min(150, Math.max(0, v)) } })),
      setMuted: (m) =>
        set((s) => ({ playerSettings: { ...s.playerSettings, muted: m } })),
      setAspectMode: (mode) =>
        set((s) => ({ playerSettings: { ...s.playerSettings, aspectMode: mode } })),

      // ── next / prev ───────────────────────────────────────────────────────
      nextChannel: () => {
        const { currentChannel, channels } = get()
        if (!currentChannel || channels.length === 0) return null
        const idx = channels.findIndex((c) => c.id === currentChannel.id)
        return channels[(idx + 1) % channels.length]
      },
      prevChannel: () => {
        const { currentChannel, channels } = get()
        if (!currentChannel || channels.length === 0) return null
        const idx = channels.findIndex((c) => c.id === currentChannel.id)
        return channels[(idx - 1 + channels.length) % channels.length]
      }
    }),
    {
      name: 'livetv-electron-storage',
      partialize: (state) => ({
        favorites: state.favorites,
        recentlyWatched: state.recentlyWatched,
        importedChannels: state.importedChannels,
        playerSettings: state.playerSettings
      }),
      merge: (persistedState: any, currentState) => {
        const imported: Channel[] = persistedState?.importedChannels || []
        const existingIds = new Set(builtInChannels.map((c) => c.id))
        const mergedChannels = [
          ...builtInChannels,
          ...imported.filter((c) => !existingIds.has(c.id))
        ]
        return {
          ...currentState,
          ...persistedState,
          importedChannels: imported,
          channels: mergedChannels,
          recentlyWatched: (persistedState?.recentlyWatched || []).filter((r: Channel) =>
            mergedChannels.some((c) => c.id === r.id)
          )
        }
      }
    }
  )
)

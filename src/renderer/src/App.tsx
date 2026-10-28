/**
 * App.tsx — tedeyTV
 *
 * Layout:
 *  Navbar → CategoryTabs → ContinueWatching → Channel grid
 *  VideoPlayer overlays via fixed inset-0
 *
 * Note: Uses a regular CSS grid (no virtualisation needed for typical
 * playlists < ~500 channels). For very large playlists (1000+), you can
 * add react-window v1 (`npm i react-window@1 @types/react-window`).
 */
import React, { useMemo } from 'react'
import { Navbar } from './components/Navbar'
import { CategoryTabs } from './components/CategoryTabs'
import { ContinueWatching } from './components/ContinueWatching'
import { ChannelCard } from './components/ChannelCard'
import { VideoPlayer } from './components/VideoPlayer'
import { useLiveTVStore } from './store/useLiveTVStore'

export default function App() {
  const { activeCategory, searchTerm, favorites, currentChannel, channels } = useLiveTVStore()

  const filteredChannels = useMemo(() => {
    let result = channels

    if (activeCategory === 'Favorites') {
      result = channels.filter((c) => favorites.includes(c.id))
    } else if (activeCategory !== 'All') {
      result = channels.filter((c) => c.category === activeCategory)
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(lower) ||
          c.category.toLowerCase().includes(lower) ||
          (c.language ?? '').toLowerCase().includes(lower)
      )
    }

    return result
  }, [activeCategory, searchTerm, favorites, channels])

  const sectionLabel = searchTerm
    ? `Search: "${searchTerm}"`
    : activeCategory === 'Favorites'
    ? 'Your Favorites'
    : `${activeCategory} Channels`

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <Navbar />
      <CategoryTabs />

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeCategory === 'All' && !searchTerm && <ContinueWatching />}

        {/* Section header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-sm font-bold text-zinc-200">{sectionLabel}</h2>
          <span className="text-xs text-zinc-500 tabular-nums">
            {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredChannels.length > 0 ? (
          <div
            className="grid gap-3 px-4 pb-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
          >
            {filteredChannels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-600">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875C21 4.254 20.496 3.75 19.875 3.75H4.125C3.504 3.75 3 4.254 3 4.875v11.25c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
            <p className="text-sm">
              {activeCategory === 'Favorites' && favorites.length === 0
                ? 'No favorites yet — click ♥ on any channel.'
                : 'No channels found.'}
            </p>
          </div>
        )}
      </div>

      {currentChannel && <VideoPlayer />}
    </div>
  )
}

import React, { useState } from 'react'
import { useLiveTVStore } from '../store/useLiveTVStore'
import { PlaylistImport } from './PlaylistImport'

export function Navbar() {
  const { searchTerm, setSearchTerm, currentChannel } = useLiveTVStore()
  const [focused, setFocused] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const isMac = navigator.userAgent.includes('Mac')

  const handleMiniPlayer = () => {
    if (!currentChannel) return
    window.api?.openMiniPlayer(currentChannel.url, currentChannel.name)
  }

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0 drag-region"
        style={{ paddingLeft: isMac ? '80px' : '16px' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 no-drag shrink-0">
          <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
              <path d="M21 6.375c0 2.692-4.03 4.875-9 4.875S3 9.067 3 6.375 7.03 1.5 12 1.5s9 2.183 9 4.875z" />
              <path d="M12 12.75c2.685 0 5.19-.586 7.078-1.609a8.283 8.283 0 001.897-1.384c.016.121.025.244.025.368C21 12.817 16.97 15 12 15s-9-2.183-9-4.875c0-.124.009-.247.025-.368a8.285 8.285 0 001.897 1.384C6.809 12.164 9.315 12.75 12 12.75z" />
              <path d="M12 16.5c2.685 0 5.19-.586 7.078-1.609a8.282 8.282 0 001.897-1.384c.016.121.025.244.025.368 0 2.692-4.03 4.875-9 4.875s-9-2.183-9-4.875c0-.124.009-.247.025-.368a8.284 8.284 0 001.897 1.384C6.809 15.914 9.315 16.5 12 16.5z" />
            </svg>
          </div>
          <span className="text-base font-bold text-white tracking-tight">tedeyTV</span>
        </div>

        {/* Search */}
        <div
          className={`flex-1 max-w-sm flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5 no-drag transition-all ${
            focused ? 'ring-1 ring-red-600' : ''
          }`}
        >
          <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search channels…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none w-full"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 no-drag" />

        {/* Mini-player (only when something is playing) */}
        {currentChannel && (
          <button
            onClick={handleMiniPlayer}
            title="Open mini-player"
            className="no-drag w-8 h-8 flex items-center justify-center rounded-lg
                       bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="14" rx="2" />
              <rect x="11" y="11" width="9" height="6" rx="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        )}

        {/* Import playlist */}
        <button
          onClick={() => setShowImport(true)}
          title="Import M3U playlist"
          className="no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Import
        </button>
      </div>

      {showImport && <PlaylistImport onClose={() => setShowImport(false)} />}
    </>
  )
}

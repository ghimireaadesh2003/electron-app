import React from 'react'
import { useLiveTVStore } from '../store/useLiveTVStore'
import { ChannelLogo } from './ChannelLogo'

export function ContinueWatching() {
  const { recentlyWatched, playChannel } = useLiveTVStore()

  if (recentlyWatched.length === 0) return null

  return (
    <div className="px-4 pt-4 pb-2">
      <h2 className="text-sm font-bold text-zinc-300 mb-3">Continue Watching</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {recentlyWatched.map((channel) => (
          <div
            key={channel.id}
            onClick={() => playChannel(channel)}
            className="flex-shrink-0 w-28 cursor-pointer group"
          >
            <div
              className="aspect-video bg-zinc-800 rounded-lg overflow-hidden relative flex items-center justify-center
                          border border-zinc-700 group-hover:border-red-600 transition-colors"
            >
              <ChannelLogo logo={channel.logo} name={channel.name} size="sm" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 truncate">{channel.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

import React from 'react'
import { Channel } from '../types'
import { useLiveTVStore } from '../store/useLiveTVStore'
import { ChannelLogo } from './ChannelLogo'

interface ChannelCardProps {
  channel: Channel
}

export function ChannelCard({ channel }: ChannelCardProps) {
  const { playChannel, toggleFavorite, favorites, currentChannel } = useLiveTVStore()
  const isFavorite = favorites.includes(channel.id)
  const isPlaying = currentChannel?.id === channel.id

  return (
    <div
      onClick={() => playChannel(channel)}
      className={`bg-zinc-900 border rounded-xl overflow-hidden cursor-pointer group
                 hover:border-red-600 hover:scale-[1.02] transition-all duration-200 select-none
                 ${isPlaying ? 'border-red-600 ring-1 ring-red-600/50' : 'border-zinc-800'}`}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
        <ChannelLogo logo={channel.logo} name={channel.name} />

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <div
            className={`w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center
                        transition-all scale-90 group-hover:scale-100
                        ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <svg className="w-4 h-4 text-white fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">LIVE</span>
          {channel.isHD && (
            <span className="bg-zinc-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">HD</span>
          )}
          {isPlaying && (
            <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">NOW</span>
          )}
        </div>

        {/* Favorite button */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(channel.id) }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/80 transition-colors"
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            className={`w-3.5 h-3.5 ${isFavorite ? 'text-red-500 fill-red-500' : 'text-zinc-400 fill-transparent'}`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>
      </div>

      {/* Info */}
      <div className="px-3 py-2">
        <p className="text-sm font-semibold text-zinc-100 truncate">{channel.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-zinc-500 truncate">{channel.category}</p>
          {channel.language && (
            <span className="text-[10px] text-zinc-600 uppercase tracking-wide">{channel.language}</span>
          )}
        </div>
      </div>
    </div>
  )
}
